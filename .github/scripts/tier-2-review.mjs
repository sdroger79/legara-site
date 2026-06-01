#!/usr/bin/env node
/**
 * Tier 2 sprint-level cross-model review runner (P468).
 *
 * Runs inside `tier-2-review.yml` — triggered by `workflow_run` on a successful
 * "Deploy Meridian API (Prod)" completion (NOT a cron; a cron silently goes
 * stale — cf. the dormant atlas-health-eval monthly). Computes the diff window
 * since the LAST recorded Tier-2 review's HEAD commit, and only PRODUCES a
 * review when the accumulated change crosses a threshold (self-pacing: this is
 * the mechanical implementation of the protocol's "sprint-closure" cadence,
 * since there is no automated sprint-close event to hook). Below threshold →
 * clean no-op. Above → call the 3rd-model reviewer (Google Gemini, a DIFFERENT
 * family from Tier 1.5's OpenAI — the independence triangle), write structured
 * findings + a narrative to legara-marketing-v2:sys/reviews/tier2-<date>.md, and
 * emit a trend digest for cowork-status "Needs you".
 *
 * Canonical spec: sys/cross-model-review-protocol.md (Tier 2) + sys/prompts/P468-*.md
 *
 * INDEPENDENCE TRIANGLE (load-bearing): Tier 1 static (CodeQL/Semgrep) →
 * Tier 1.5 OpenAI per-PR (`CROSS_MODEL_REVIEW_API_KEY`) → Tier 2 Google Gemini
 * sprint-level (`CROSS_MODEL_REVIEW_TIER2_API_KEY`). Tier 2 MUST NOT reuse the
 * Tier-1.5 OpenAI key — same-vendor reviewers share blind spots. The Tier-2 key
 * is a SEPARATE Gemini key (P031 named intent: CROSS_MODEL_REVIEW_TIER2_API_KEY).
 *
 * Environment (set by the workflow):
 *   CROSS_MODEL_REVIEW_TIER2_API_KEY  Google Gemini API key (repo secret).
 *                                     If absent → clean no-op (defense-in-depth;
 *                                     the workflow logs the skip and exits 0).
 *   GITHUB_TOKEN                      default token (repo read; no writes needed —
 *                                     Tier 2 output is a governance commit, made
 *                                     by the caller, not by this runner).
 *   GITHUB_REPOSITORY                "owner/repo".
 *   GOVERNANCE_DIR                   absolute path to the sparse-checkout of
 *                                    legara-marketing-v2:sys/ (reviews/ + governance/).
 *   REVIEWS_DIR                      absolute path to sys/reviews/ within the
 *                                    governance checkout (defaults under GOVERNANCE_DIR).
 *   TIER2_MODEL                      Gemini model id (default from the governance
 *                                    prompt's pin; env override for backfill).
 *   TIER2_THRESHOLD_FILES            min changed production files since last Tier-2
 *                                    to fire a review (default 30).
 *   TIER2_THRESHOLD_COMMITS          min merge commits since last Tier-2 to fire
 *                                    (default 12). EITHER threshold trips the gate.
 *   TIER2_WINDOW_START               explicit base SHA override (backfill mode —
 *                                    the retroactive run sets this to the recent
 *                                    high-risk window start instead of deriving it).
 *   TIER2_WINDOW_END                 explicit head SHA override (default: HEAD).
 *   TIER2_FORCE                      "true" → bypass the threshold gate (backfill /
 *                                    manual dispatch).
 *   TIER2_OUTPUT_PATH                explicit output file path override (backfill
 *                                    writes the artifact directly).
 *   TIER2_DRY_RUN                    "true" → compute scope + would-fire decision,
 *                                    print it, but do NOT call the model or write.
 *   TOKEN_BUDGET                     soft cap on assembled context tokens (default
 *                                    900000 — Gemini 2.5 Pro has a ~2M context; we
 *                                    stay well under and axis-split if exceeded).
 */

import { readFileSync, writeFileSync, readdirSync, existsSync, mkdirSync, appendFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { resolve, dirname, join, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

const {
  CROSS_MODEL_REVIEW_TIER2_API_KEY,
  GITHUB_REPOSITORY = 'sdroger79/meridian',
  GOVERNANCE_DIR: GOVERNANCE_DIR_ENV,
  REVIEWS_DIR: REVIEWS_DIR_ENV,
  TIER2_MODEL: TIER2_MODEL_ENV,
  TIER2_THRESHOLD_FILES = '30',
  TIER2_THRESHOLD_COMMITS = '12',
  TIER2_WINDOW_START,
  TIER2_WINDOW_END,
  TIER2_FORCE,
  TIER2_OUTPUT_PATH,
  TIER2_DRY_RUN,
  TOKEN_BUDGET = '900000',
} = process.env;

const GOVERNANCE_DIR = GOVERNANCE_DIR_ENV
  ? resolve(GOVERNANCE_DIR_ENV)
  : resolve(__dirname, '..', '..', 'legara-marketing-v2', 'sys');
const REVIEWS_DIR = REVIEWS_DIR_ENV ? resolve(REVIEWS_DIR_ENV) : join(GOVERNANCE_DIR, 'reviews');
const THRESHOLD_FILES = Number(TIER2_THRESHOLD_FILES);
const THRESHOLD_COMMITS = Number(TIER2_THRESHOLD_COMMITS);
const FORCE = String(TIER2_FORCE || '').toLowerCase() === 'true';
const DRY_RUN = String(TIER2_DRY_RUN || '').toLowerCase() === 'true';
const BUDGET = Number(TOKEN_BUDGET);

const estimateTokens = (s) => Math.ceil((s || '').length / 4);

function log(msg) {
  console.log(`[tier-2-review] ${msg}`);
}
function fatal(msg) {
  console.error(`[tier-2-review] FATAL: ${msg}`);
  process.exit(1);
}

function sh(cmd, args, opts = {}) {
  return execFileSync(cmd, args, {
    encoding: 'utf8',
    maxBuffer: 256 * 1024 * 1024,
    ...opts,
  });
}

// Files that are out-of-scope per the protocol: pure governance docs (none in
// meridian), tiny test fixtures, dependency lockfiles, and the Tier-2 mechanism
// itself (self-scope exclusion, mirroring the Tier-1.5 self-scope rule).
const OUT_OF_SCOPE = [
  /^package-lock\.json$/,
  /^\.github\/workflows\/tier-2-review\.ya?ml$/,
  /^\.github\/scripts\/tier-2-review(\.test)?\.mjs$/,
  /^\.github\/scripts\/tier-1-5-review/,
  /\.snap$/,
];

function isProductionFile(path) {
  if (OUT_OF_SCOPE.some((re) => re.test(path))) return false;
  // Production source + migrations + non-trivial tests count toward the threshold.
  return /^(src\/|scripts\/|migrations\/|tests\/)/.test(path) || /\.(js|mjs|ts|ejs|sql)$/.test(path);
}

// --- window-start derivation -------------------------------------------------
// Preferred (per Phase 0 decision): the LAST sys/reviews/tier2-*.md's recorded
// HEAD/commit is the window start — self-describing, no separate counter to
// drift. We parse the "Scope commit range: <start>..<end>" line of the most
// recent Tier-2 artifact and take its END as the new window's START. If no
// prior artifact exists (or the END can't be parsed), fall back to the explicit
// TIER2_WINDOW_START override, else fail loudly (never silently review "all of
// history").
function listTier2Artifacts() {
  if (!existsSync(REVIEWS_DIR)) return [];
  return readdirSync(REVIEWS_DIR)
    .filter((f) => /^tier2-.*\.md$/.test(f))
    .sort(); // ISO-dated names sort chronologically; latest is last
}

function parseScopeEnd(artifactPath) {
  try {
    const txt = readFileSync(artifactPath, 'utf8');
    // matches: `**Scope commit range:** `<start>..<end>`` (back-ticked SHAs)
    const m = txt.match(/Scope commit range:\*\*\s*`?[0-9a-f]{6,40}\.\.([0-9a-f]{6,40})`?/i);
    return m ? m[1] : null;
  } catch {
    return null;
  }
}

function resolveWindow() {
  const end = TIER2_WINDOW_END || sh('git', ['rev-parse', 'HEAD']).trim();
  if (TIER2_WINDOW_START) {
    return { start: TIER2_WINDOW_START, end, source: 'explicit-override' };
  }
  const artifacts = listTier2Artifacts();
  if (artifacts.length) {
    const latest = join(REVIEWS_DIR, artifacts[artifacts.length - 1]);
    const priorEnd = parseScopeEnd(latest);
    if (priorEnd) {
      return { start: priorEnd, end, source: `last-tier2-artifact(${artifacts[artifacts.length - 1]})` };
    }
    log(`WARN: could not parse scope end from ${latest}; need TIER2_WINDOW_START override.`);
  }
  fatal(
    'no window start: no parseable prior Tier-2 artifact in ' +
      `${REVIEWS_DIR} and no TIER2_WINDOW_START override. Pass TIER2_WINDOW_START to bootstrap.`
  );
}

// --- scope computation -------------------------------------------------------
function computeScope(start, end) {
  // Ensure both endpoints are local (the workflow checks out fetch-depth:0; a
  // backfill SHA on a stale base may need a targeted fetch — tolerate failure).
  for (const sha of [start, end]) {
    try {
      sh('git', ['fetch', '--no-tags', 'origin', sha]);
    } catch {
      /* already-local or genuinely missing — git diff surfaces its own error */
    }
  }
  const filesTxt = sh('git', ['diff', '--name-only', `${start}..${end}`]).trim();
  const allFiles = filesTxt ? filesTxt.split('\n') : [];
  const prodFiles = allFiles.filter(isProductionFile);
  const commitsTxt = sh('git', ['log', '--oneline', '--merges', `${start}..${end}`]).trim();
  const mergeCommits = commitsTxt ? commitsTxt.split('\n') : [];
  // Non-merge commit count too (some flows squash without a merge commit).
  const allCommitsTxt = sh('git', ['log', '--oneline', `${start}..${end}`]).trim();
  const allCommits = allCommitsTxt ? allCommitsTxt.split('\n') : [];
  const effectiveCommits = Math.max(mergeCommits.length, allCommits.length);
  return { allFiles, prodFiles, mergeCommits, allCommits, effectiveCommits };
}

function thresholdCrossed(scope) {
  return scope.prodFiles.length >= THRESHOLD_FILES || scope.effectiveCommits >= THRESHOLD_COMMITS;
}

function readFileAt(sha, path) {
  try {
    return sh('git', ['show', `${sha}:${path}`]);
  } catch {
    return null; // deleted in window, or binary
  }
}

// Does <path> exist at <sha>? Uses `git cat-file -e` (the cheap existence probe)
// with stdio:'ignore' so the "fatal: path '<p>' does not exist in '<sha>'" line
// NEVER leaks to the workflow log (the P640 noise class). A file present in the
// window diff but ABSENT at the window END was deleted in the window — there is
// no content to review, so we warn-and-skip it rather than feeding Gemini a
// "(deleted in this window)" placeholder block (junk input → a Gemini 400).
function fileExistsAt(sha, path) {
  try {
    execFileSync('git', ['cat-file', '-e', `${sha}:${path}`], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

// PURE (existence fn injected) — partition a file list into those present at the
// ref vs deleted-in-window. Exported for hermetic testing. (P640)
export function partitionExistingFiles(files, existsFn) {
  const present = [];
  const deleted = [];
  for (const f of files || []) {
    if (existsFn(f)) present.push(f);
    else deleted.push(f);
  }
  return { present, deleted };
}

// --- governance load ---------------------------------------------------------
function loadGovernancePrompt() {
  const p = join(GOVERNANCE_DIR, 'governance', 'tier-2-review-prompt.md');
  try {
    return readFileSync(p, 'utf8');
  } catch (e) {
    throw new Error(
      `Tier-2 governance prompt missing at ${p}: ${e.message}. ` +
        `The workflow sparse-checkouts legara-marketing-v2:sys/ into the governance dir; ` +
        `confirm the checkout step ran and LEGARA_GOVERNANCE_READ_TOKEN is set.`
    );
  }
}

function extractModelPin(prompt) {
  const m = prompt.match(/Pinned model:\*\*\s*`([^`]+)`/);
  if (!m) throw new Error('could not extract pinned model from Tier-2 review prompt');
  return m[1];
}

// --- context assembly (budget-aware; axis-split if exceeded) -----------------
function assembleUserMessage({ start, end, scope, fileContents, splitNote }) {
  const header = [
    `# Tier 2 sprint-level review request`,
    `Repository: ${GITHUB_REPOSITORY}`,
    `Window: ${start.slice(0, 9)}..${end.slice(0, 9)}`,
    `Production files in window: ${scope.prodFiles.length}`,
    `Commits in window: ${scope.effectiveCommits}`,
    splitNote ? `Axis-split note: ${splitNote}` : '',
    ``,
    `## Window diff (production scope only)`,
    `(File contents at window END follow; diff stat below.)`,
    ``,
    `## Files in scope`,
    scope.prodFiles.map((f) => `- ${f}`).join('\n'),
    ``,
    `## Touched files — full contents (at window END)`,
  ]
    .filter((l) => l !== '')
    .join('\n');

  const fileBlocks = fileContents
    .map(({ path, content, truncated }) =>
      [`### ${path}${truncated ? ' (truncated for budget)' : ''}`, '```', content, '```'].join('\n')
    )
    .join('\n\n');

  return `${header}\n\n${fileBlocks}\n`;
}

function budgetedFileContents(end, prodFiles) {
  let contents = prodFiles.map((path) => {
    const content = readFileAt(end, path) ?? '(deleted in this window)';
    return { path, content, truncated: false };
  });
  let total = contents.reduce((n, f) => n + estimateTokens(f.content), 0);
  if (total <= BUDGET) return { contents, note: null };
  // Trim largest files first, keeping at least 2k chars each. Tier 2's value is
  // breadth, so we degrade gracefully rather than dropping whole files.
  const overshoot = total - BUDGET;
  let shaved = 0;
  contents = contents
    .sort((a, b) => estimateTokens(b.content) - estimateTokens(a.content))
    .map((f) => {
      if (shaved >= overshoot) return f;
      const keepChars = Math.max(2000, f.content.length - (overshoot - shaved) * 4);
      if (keepChars < f.content.length) {
        shaved += estimateTokens(f.content.slice(keepChars));
        return { path: f.path, content: f.content.slice(0, keepChars) + '\n... [truncated] ...\n', truncated: true };
      }
      return f;
    });
  return { contents, note: `context ~${total} tokens > budget ${BUDGET}; largest files trimmed.` };
}

// --- Gemini call -------------------------------------------------------------
// Google Generative Language API (generateContent). JSON-only response via
// responseMimeType.
//
// RETRY POLICY (P559, S288 — Gemini-specific tuning). Gemini's free-tier
// rate-limit (RPM + TPM) is more aggressive than OpenAI's; the prior Tier-1.5
// mirror schedule (5 attempts, 1s/2s/4s/8s/16s/30s exp backoff) recovers from
// short bursts but loses to sustained-rate-limit windows that the per-deploy
// burst pattern was creating (4-of-5 failures S288 2026-05-27 16:19-18:16 UTC).
// The dedicated schedule below — 3 attempts at 30s / 90s / 300s — gives Gemini
// the much longer recovery windows its free-tier quota actually needs. The
// Retry-After header (when Gemini returns one) still wins over the schedule
// (defense-in-depth: honor the server's explicit ask).
//
// EXTRACTED HELPER (P559 testability): the retry loop is split out as
// `retryGemini` so the hermetic unit test can exercise the delay schedule +
// the transient/non-transient classification without touching the network.
const GEMINI_BACKOFF_SCHEDULE_MS = Object.freeze([30000, 90000, 300000]);

function isTransientGeminiError(err) {
  if (!err || typeof err !== 'object') return false;
  return err.status === 429 || (err.status >= 500 && err.status < 600);
}

// Pure retry coordinator. Calls `doCall()` up to `schedule.length + 1` attempts;
// sleeps between attempts using `schedule[attempt - 1]` ms OR err.retryAfter
// (seconds) if Gemini returned a Retry-After header. Honors:
//   - transient classification (429 / 5xx → retry; other 4xx → bubble);
//   - SyntaxError (one immediate retry for occasional off-shape JSON; matches
//     the Tier-1.5 sister-shape at tier-1-5-review.mjs:454-481).
// `sleep` + `log` are injected so the unit test can stub them.
async function retryGemini({ doCall, schedule = GEMINI_BACKOFF_SCHEDULE_MS, sleep, log: logFn }) {
  const MAX = schedule.length + 1;
  let lastErr;
  for (let attempt = 1; attempt <= MAX; attempt++) {
    try {
      return await doCall();
    } catch (e) {
      lastErr = e;
      const transient = isTransientGeminiError(e);
      const syntaxRetry = e instanceof SyntaxError;
      if (attempt >= MAX || (!transient && !syntaxRetry)) break;
      const slot = schedule[attempt - 1] ?? schedule[schedule.length - 1];
      const backoff = e.retryAfter ? e.retryAfter * 1000 : slot;
      logFn(`attempt ${attempt} failed (${String(e.message).slice(0, 120)}); retrying in ${backoff}ms.`);
      await sleep(backoff);
    }
  }
  throw lastErr;
}

async function callGemini({ model, systemPrompt, userMessage }) {
  const endpoint =
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent` +
    `?key=${encodeURIComponent(CROSS_MODEL_REVIEW_TIER2_API_KEY)}`;
  const body = {
    systemInstruction: { parts: [{ text: systemPrompt }] },
    contents: [{ role: 'user', parts: [{ text: userMessage }] }],
    generationConfig: { temperature: 0.2, responseMimeType: 'application/json', maxOutputTokens: 8192 },
  };
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  const doCall = async () => {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const text = await res.text();
    if (!res.ok) {
      const err = new Error(`Gemini ${res.status}: ${text.slice(0, 800)}`);
      err.status = res.status;
      err.retryAfter = Number(res.headers.get('retry-after')) || 0;
      throw err;
    }
    const json = JSON.parse(text);
    const content = json.candidates?.[0]?.content?.parts?.map((p) => p.text).join('') || '';
    if (!content) throw new Error('Gemini response missing candidate content');
    const usage = json.usageMetadata || null;
    return { parsed: JSON.parse(content), raw: content, usage };
  };

  return retryGemini({ doCall, sleep, log });
}

// PURE Gemini-failure classifier (P640). After the retry loop bubbles a
// non-transient error, decide whether the workflow should SKIP cleanly (exit 0)
// or FAIL LOUD (exit 1). The fail-open discipline (sister to P616): a
// genuinely-empty / garbage input (no reviewable file content) is the ONLY case
// that exits 0 — "nothing to review" is not a failure. A 400 on REAL input is
// never swallowed: it fails loud, labeled `context-overflow` when the assembled
// context exceeded the token budget (the likely cause — Gemini 400s on
// over-limit payloads) so the operator knows to narrow the window, else
// `gemini-400` (a real request-shape bug to inspect). Any other status on real
// input also fails loud (preserves the pre-P640 fail-hard behavior).
//
// @returns { action: 'skip'|'fail', label, message }
export function classifyGeminiFailure({ status, bodyText, estimatedTokens, realFileCount, budget }) {
  const body = String(bodyText == null ? '' : bodyText).slice(0, 400);
  if (!realFileCount) {
    return {
      action: 'skip',
      label: 'empty-input',
      message:
        'skipped — no reviewable diff content to send (all in-scope changes were deletions / empty input). ' +
        'Not a model failure; no review produced this run.',
    };
  }
  if (status === 400) {
    const overflow = Number(estimatedTokens) > Number(budget);
    return {
      action: 'fail',
      label: overflow ? 'context-overflow' : 'gemini-400',
      message: overflow
        ? `Gemini 400 — likely CONTEXT OVERFLOW: assembled ~${estimatedTokens} tokens across ${realFileCount} ` +
          `files exceeds the ${budget}-token budget. Narrow the window (set TIER2_WINDOW_START) or lower the ` +
          `threshold so sprints close more often. Response body: ${body}`
        : `Gemini 400 on REAL input (~${estimatedTokens} tokens, ${realFileCount} files) — NOT a context-size ` +
          `issue; inspect the request shape. Response body: ${body}`,
    };
  }
  return {
    action: 'fail',
    label: `gemini-${status || 'error'}`,
    message: `Gemini call failed (status ${status || 'unknown'}) on real input ` +
      `(~${estimatedTokens} tokens, ${realFileCount} files). Response/error: ${body}`,
  };
}

// --- artifact rendering ------------------------------------------------------
const SEVERITY_ORDER = { Critical: 0, High: 1, Medium: 2, Low: 3 };

function isoDate() {
  return new Date().toISOString().slice(0, 10);
}

function renderArtifact({ start, end, scope, model, findings, narrative, usage, splitNote }) {
  const bySev = (sev) => findings.filter((f) => f.severity === sev);
  const c = bySev('Critical');
  const h = bySev('High');
  const m = bySev('Medium');
  const l = bySev('Low');
  const renderList = (arr) =>
    arr.length
      ? arr
          .map(
            (f, i) =>
              `**${f.severity[0]}${i + 1} — ${f.title || '(untitled)'}**\n` +
              `- **Area:** ${f.area || 'other'}\n` +
              `- **File:** \`${f.file || '(unknown)'}\`${f.line ? `:${f.line}` : ''}\n` +
              `- **Confidence:** ${f.confidence || 'unknown'}\n` +
              `- **Description:** ${f.description || '(none)'}\n` +
              (f.proposed_fix ? `- **Proposed fix:** ${f.proposed_fix}\n` : '')
          )
          .join('\n')
      : 'None.';

  return [
    `# Tier 2 Sprint-Level Cross-Model Review — ${isoDate()}`,
    ``,
    `**Date:** ${new Date().toISOString()}`,
    `**Reviewer model:** \`${model}\` (Google flagship; independence-triangle: Tier 1 static → Tier 1.5 OpenAI → Tier 2 Google)`,
    `**Scope commit range:** \`${start}..${end}\``,
    `**Files reviewed:** ${scope.prodFiles.length} (of ${scope.allFiles.length} touched)`,
    `**Commits in window:** ${scope.effectiveCommits}`,
    usage ? `**Tokens:** ${usage.promptTokenCount || '?'} in / ${usage.candidatesTokenCount || '?'} out / ${usage.totalTokenCount || '?'} total` : '',
    splitNote ? `**Runner note:** ${splitNote}` : '',
    ``,
    `## Summary`,
    ``,
    `> ${(narrative || '(no narrative returned)').replace(/\n/g, '\n> ')}`,
    `>`,
    `> *— ${model}, verbatim*`,
    ``,
    `## Findings`,
    ``,
    `### Critical (${c.length})`,
    renderList(c),
    ``,
    `### High (${h.length})`,
    renderList(h),
    ``,
    `### Medium (${m.length})`,
    renderList(m),
    ``,
    `### Low (${l.length})`,
    renderList(l),
    ``,
    `## Triage decisions`,
    `Per \`sys/cross-model-review-protocol.md\` severity table:`,
    `- Critical → block next sprint until remediated + open follow-up P-prompt(s).`,
    `- High → open follow-up P-prompt(s), queue for current sprint's first week.`,
    `- Medium → log to backlog (\`sys/tech-debt.md\`); batch-address in a hygiene sprint.`,
    `- Low → case-by-case (fix-if-trivial or defer with rationale).`,
    ``,
    `**Escalation check:** ${
      c.some((f) => f.confidence === 'high' && (f.area === 'phi' || f.area === 'rbac'))
        ? '⚠️ FIRES — a Critical/high-confidence PHI-or-RBAC finding exists; the window is NOT-actually-closed until remediated (Roger notified).'
        : 'does not fire — no Critical+high-confidence PHI/RBAC finding.'
    }`,
    ``,
    `## Trend digest (for cowork-status "Needs you")`,
    `Critical: ${c.length} | High: ${h.length} | Medium: ${m.length} | Low: ${l.length}`,
    `Areas: ${[...new Set(findings.map((f) => f.area || 'other'))].join(', ') || '(none)'}`,
    ``,
    `---`,
    `*Executed per \`sys/cross-model-review-protocol.md\` (Tier 2) via the automated \`tier-2-review.yml\` workflow (P468) — deploy-anchored + threshold-gated, no cron.*`,
    ``,
  ]
    .filter((l) => l !== undefined)
    .join('\n');
}

function writeArtifact(text) {
  const outPath = TIER2_OUTPUT_PATH || join(REVIEWS_DIR, `tier2-${isoDate()}.md`);
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, text, 'utf8');
  return outPath;
}

// --- P544 — review_fired event payload emitter -------------------------------
// Builds the payload that the workflow's downstream "Append review_fired event
// to lm-v2 ledger" step feeds to scripts/cowork-ledger/append-event.mjs (the
// sanctioned event appender shipped P543). Pure helper exported for hermetic
// testing; the wrapper handles env routing.
//
// Payload shape (P544, anchored against P543's `review_fired` event type):
//   {
//     tier: "2",
//     source: { repo, commit_range: "<start>..<end>" },
//     model, date,
//     artifact_path: "sys/reviews/tier2-<date>.md" (lm-v2-relative),
//     findings_count_by_severity: { critical, high, medium, low }
//   }
export function buildReviewFiredPayload({ repo, start, end, model, findings, outPath }) {
  const counts = { critical: 0, high: 0, medium: 0, low: 0 };
  for (const f of findings || []) {
    const sev = String(f?.severity || '').toLowerCase();
    if (counts[sev] !== undefined) counts[sev]++;
  }
  // Tier 2 writes the artifact to <REVIEWS_DIR>/tier2-<date>.md inside the
  // sparse-checkout. Normalize to the lm-v2-relative path the appender (and
  // P542 consumer) expects: `sys/reviews/<basename>`. Falls back to the raw
  // outPath if basename can't be computed.
  const artifactPath = outPath ? `sys/reviews/${basename(outPath)}` : null;
  return {
    tier: '2',
    source: { repo, commit_range: `${start}..${end}` },
    model,
    date: new Date().toISOString(),
    artifact_path: artifactPath,
    findings_count_by_severity: counts,
  };
}

function emitReviewFiredPayload({ model, findings, start, end, outPath }) {
  if (!process.env.GITHUB_OUTPUT) {
    log('no $GITHUB_OUTPUT; skipping review_event_payload emission (P544 — local dev run).');
    return null;
  }
  const payload = buildReviewFiredPayload({
    repo: GITHUB_REPOSITORY,
    start,
    end,
    model,
    findings,
    outPath,
  });
  const json = JSON.stringify(payload);
  appendFileSync(process.env.GITHUB_OUTPUT, `review_event_payload=${json}\n`);
  log(`emitted review_event_payload (${json.length} chars) — P544 ledger trigger.`);
  return payload;
}

// Trend digest line for the workflow log + cowork-status "Needs you" pickup.
function emitTrendDigest({ findings, outPath, model }) {
  const count = (sev) => findings.filter((f) => f.severity === sev).length;
  const areas = [...new Set(findings.map((f) => f.area || 'other'))].join(', ');
  const digest =
    `TIER2_TREND_DIGEST :: ${model} :: ` +
    `${count('Critical')}C/${count('High')}H/${count('Medium')}M/${count('Low')}L :: ` +
    `areas=[${areas}] :: artifact=${outPath}`;
  console.log(`::notice title=Tier 2 review::${digest}`);
  log(digest);
  return digest;
}

// --- main --------------------------------------------------------------------
async function main() {
  // Defense-in-depth clean-skip: if the Gemini key isn't visible in CI, no-op
  // cleanly (exit 0) rather than crash. This is hygiene, NOT the expected path —
  // the expected path is "key resolves → review runs". (See Phase 0: the Tier-2
  // Gemini key is a SEPARATE secret from Tier-1.5's OpenAI key; do not reuse the
  // OpenAI key or the independence triangle collapses.)
  if (!CROSS_MODEL_REVIEW_TIER2_API_KEY && !DRY_RUN) {
    log(
      'CROSS_MODEL_REVIEW_TIER2_API_KEY not visible in CI — clean no-op (defense-in-depth). ' +
        'Provision the Gemini key as a repo secret to activate Tier 2. Exiting 0.'
    );
    console.log('::notice title=Tier 2 review::skipped — CROSS_MODEL_REVIEW_TIER2_API_KEY absent (clean no-op).');
    return;
  }

  const { start, end, source } = resolveWindow();
  log(`window ${start.slice(0, 9)}..${end.slice(0, 9)} (start source: ${source})`);

  const scope = computeScope(start, end);
  log(`scope: ${scope.prodFiles.length} production files, ${scope.effectiveCommits} commits in window.`);

  const crossed = thresholdCrossed(scope);
  if (!crossed && !FORCE) {
    log(
      `below threshold (files ${scope.prodFiles.length}<${THRESHOLD_FILES} AND ` +
        `commits ${scope.effectiveCommits}<${THRESHOLD_COMMITS}) → clean no-op. ` +
        `Tier 2 fires when enough accumulates (self-pacing sprint-closure cadence).`
    );
    console.log(
      `::notice title=Tier 2 review::below threshold (${scope.prodFiles.length} files / ` +
        `${scope.effectiveCommits} commits) — no review this deploy.`
    );
    return;
  }
  log(crossed ? 'threshold crossed → producing review.' : 'TIER2_FORCE set → producing review (threshold bypassed).');

  if (DRY_RUN) {
    log(
      `DRY RUN — would review ${scope.prodFiles.length} files across ${scope.effectiveCommits} commits; ` +
        `fire=${crossed || FORCE}. No model call, no write.`
    );
    console.log(JSON.stringify({ start, end, files: scope.prodFiles.length, commits: scope.effectiveCommits, fire: crossed || FORCE }, null, 2));
    return;
  }

  const prompt = loadGovernancePrompt();
  const model = TIER2_MODEL_ENV || extractModelPin(prompt);
  log(`reviewer model: ${model}`);

  // P640 — missing-path tolerance. Files in the window diff that were DELETED by
  // the window END have no content to review. Skip them (warn, don't abort) so
  // we never feed Gemini "(deleted in this window)" placeholder junk (a 400
  // trigger) nor leak `git show` "fatal: path ... does not exist" lines to the
  // log. Threshold/scope counts above still use the full prodFiles set (the
  // deletions are real churn); only the CONTENT we send is filtered.
  const { present, deleted } = partitionExistingFiles(scope.prodFiles, (p) => fileExistsAt(end, p));
  if (deleted.length) {
    log(
      `skipping ${deleted.length} file(s) deleted at window end (no content to review): ` +
        `${deleted.slice(0, 8).join(', ')}${deleted.length > 8 ? ` …(+${deleted.length - 8})` : ''}`
    );
  }

  const { contents, note } = budgetedFileContents(end, present);
  const realContents = contents.filter((c) => c.content && c.content.trim().length);
  // P640 — empty-input clean-skip (fail-open ONLY when there is genuinely
  // nothing to review). Past the threshold but every in-scope change was a
  // deletion / empty file → no model call, exit 0 with a clear notice.
  if (!realContents.length) {
    log('no reviewable file content at window end (all in-scope changes were deletions / empty) → clean no-op.');
    console.log(
      '::notice title=Tier 2 review::skipped — no reviewable diff content (all in-scope changes were deletions / empty input).'
    );
    return;
  }

  const scopeForMessage = { ...scope, prodFiles: present };
  const userMessage = assembleUserMessage({ start, end, scope: scopeForMessage, fileContents: contents, splitNote: note });
  const assembledTokens = estimateTokens(userMessage);
  log(`assembled context ~${assembledTokens} tokens (${realContents.length} files with content); calling Gemini.`);

  let parsed, usage;
  try {
    ({ parsed, usage } = await callGemini({ model, systemPrompt: prompt, userMessage }));
  } catch (e) {
    // P640 — classify the bubbled (non-transient) Gemini failure: clean-skip a
    // genuinely-empty input; fail LOUD on a real-but-broken 400 (context
    // overflow or request-shape bug). Never silently fail-open on real input.
    const decision = classifyGeminiFailure({
      status: e.status,
      bodyText: e.message,
      estimatedTokens: assembledTokens,
      realFileCount: realContents.length,
      budget: BUDGET,
    });
    if (decision.action === 'skip') {
      log(decision.message);
      console.log(`::notice title=Tier 2 review::${decision.message}`);
      return;
    }
    console.error(`::error title=Tier 2 review (${decision.label})::${decision.message}`);
    fatal(`${decision.label}: ${decision.message}`);
  }
  const findings = Array.isArray(parsed.findings) ? parsed.findings : [];
  const narrative = parsed.narrative || parsed.summary || parsed.review_notes || null;
  log(`${findings.length} findings returned; usage=${JSON.stringify(usage)}`);

  const artifact = renderArtifact({ start, end, scope, model, findings, narrative, usage, splitNote: note });
  const outPath = writeArtifact(artifact);
  log(`wrote artifact: ${outPath}`);

  emitTrendDigest({ findings, outPath, model });

  // P544 — close the TRIGGER phase of the review-consumption blockchain.
  // Emits a `review_fired` event payload for the workflow's downstream
  // "Append review_fired event to lm-v2 ledger" step. Only fires on the
  // real-review path (above-threshold OR FORCE; not DRY_RUN, not below-
  // threshold no-op, not missing-key clean-skip). P542's triage agent
  // consumes the event stream.
  emitReviewFiredPayload({ model, findings, start, end, outPath });

  log('done.');
}

const invokedDirectly = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) {
  main().catch((e) => {
    console.error(`[tier-2-review] ERROR: ${e.stack || e.message}`);
    process.exit(1);
  });
}

// Test-only exports (pure helpers).
export const __test = {
  estimateTokens,
  isProductionFile,
  parseScopeEnd,
  thresholdCrossed,
  OUT_OF_SCOPE,
  // P559 — retry helpers exposed for hermetic unit testing.
  GEMINI_BACKOFF_SCHEDULE_MS,
  isTransientGeminiError,
  retryGemini,
  // P544 — review_fired payload builder (pure; hermetic-test exercised).
  buildReviewFiredPayload,
  // P640 — missing-path tolerance + Gemini-failure classification (pure).
  partitionExistingFiles,
  classifyGeminiFailure,
};
