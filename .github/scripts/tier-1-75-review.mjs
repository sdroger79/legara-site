#!/usr/bin/env node
/**
 * Tier 1.75 sensitive-class adversarial pre-merge reviewer (P618, S289).
 *
 * Runs inside `.github/workflows/tier-1-75-sensitive-review.yml` PRE-MERGE (PR
 * open/synchronize/reopen). Unlike advisory Tier 1.5, Tier 1.75:
 *   1. fires ONLY when the PR touches a sensitive-class path
 *      (sys/governance/tier-1-75-sensitive-paths.md);
 *   2. uses a DIFFERENT model family (gpt-5.5, full) for independence from both
 *      the author (Claude) and the Tier 1.5 advisory reviewer (gpt-5.4-mini);
 *   3. takes an explicit ADVERSARIAL pose ("find what's broken; assume something
 *      is"); and
 *   4. BLOCKS the merge on a High/Critical finding (the job's exit code is the
 *      required-check status).
 *
 * The job name in the workflow IS the required-check context, so this script
 * ALWAYS reports a status on every PR:
 *   - no sensitive paths touched   → exit 0 (green skip-report + advisory comment)
 *   - verdict SHIP-AS-IS / SHIP-WITH-AMENDMENTS → exit 0 (green)
 *   - verdict BLOCK (High/Critical) → exit 1 (red → blocks when the check is required)
 *   - reviewer-unavailable (OpenAI outage / inaccessible model pin / missing key)
 *                                  → exit 0 (FAIL-OPEN, green) + loud ⚠️ comment.
 *     Rationale: a blocking gate that fail-CLOSED on its own infra outage would
 *     force every sensitive PR through `--admin` (the cascade Roger rejects; the
 *     P616 lesson from the gpt-5.4 404 incident). The review did NOT run; the
 *     comment says so prominently and the ledger annotation records it.
 *   - genuine runner error (governance read / git diff failure) → exit 1 (red),
 *     because that is a real, visible infra break, not a model outage.
 *
 * Canonical spec: sys/prompts/P618-tier-1-75-sensitive-class-reviewer.md (lm-v2)
 * Reviewing prompt: sys/governance/tier-1-75-review-prompt.md (model pin lives there)
 * Sensitive paths:  sys/governance/tier-1-75-sensitive-paths.md (the fenced list)
 *
 * Environment:
 *   CROSS_MODEL_REVIEW_API_KEY  OpenAI API key (repo secret). ABSENT → fail-open
 *                               skip-green ("Tier 1.75 not configured on this repo")
 *                               so the workflow is safe to ship on a repo before
 *                               the secret is added (e.g. lm-v2 first-CI).
 *   GITHUB_TOKEN                default token with pull-requests write
 *   GITHUB_EVENT_PATH           path to the GitHub Actions event payload
 *   GITHUB_REPOSITORY           "owner/repo"
 *   GOVERNANCE_DIR              absolute path to the governance dir (sparse-checkout
 *                               of legara-marketing-v2:sys/governance/ for meridian;
 *                               the repo's own sys/governance/ for lm-v2)
 *   GOVERNANCE_SOURCE_REPO      "sdroger79/legara-marketing-v2" (default)
 *   GOVERNANCE_SOURCE_BRANCH    "main" (default)
 *   MAX_DIFF_LOC                200000 (default — skip review on a diff larger than this)
 *   TOKEN_BUDGET               170000 (default — gpt-5.5 has a large context window)
 *
 * Dispatch / backfill mode — set instead of GITHUB_EVENT_PATH:
 *   REVIEW_PR_NUMBER            run on this PR number (fetches the PR via API)
 *   REVIEW_BASE_SHA / REVIEW_HEAD_SHA  optional SHA overrides
 *   REVIEW_READONLY            "true" → compute + log; do not post a comment or fail the check
 */

import { readFileSync, appendFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

const {
  CROSS_MODEL_REVIEW_API_KEY,
  GITHUB_TOKEN,
  GITHUB_EVENT_PATH,
  GITHUB_REPOSITORY,
  GOVERNANCE_DIR: GOVERNANCE_DIR_ENV,
  GOVERNANCE_SOURCE_REPO = 'sdroger79/legara-marketing-v2',
  GOVERNANCE_SOURCE_BRANCH = 'main',
  MAX_DIFF_LOC = '200000',
  TOKEN_BUDGET = '170000',
  REVIEW_PR_NUMBER,
  REVIEW_BASE_SHA,
  REVIEW_HEAD_SHA,
  REVIEW_READONLY,
} = process.env;

const GOVERNANCE_DIR = GOVERNANCE_DIR_ENV
  ? resolve(GOVERNANCE_DIR_ENV)
  : resolve(__dirname, '..', '..', 'legara-marketing-v2', 'sys', 'governance');

const MAX_LOC = Number(MAX_DIFF_LOC);
const BUDGET = Number(TOKEN_BUDGET);
const DISPATCH_MODE = Boolean(REVIEW_PR_NUMBER);
const READONLY = String(REVIEW_READONLY || '').toLowerCase() === 'true';

const MAX_COMPLETION_TOKENS = 8000;
const MAX_ATTEMPTS = 5;

const [owner, repo] = (GITHUB_REPOSITORY || '/').split('/');

let prNumber;
let baseSha;
let headSha;
let baseRef = 'main';
let prTitle = '';
let prBody = '';
let prAuthor = 'unknown';

const estimateTokens = (s) => Math.ceil((s || '').length / 4);

function fatal(msg) {
  console.error(`[tier-1-75-review] FATAL: ${msg}`);
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Sensitive-path parsing + matching
// ---------------------------------------------------------------------------

// Fallback if the governance file is absent/unreadable. Kept in sync with
// sys/governance/tier-1-75-sensitive-paths.md (the canonical source).
export const DEFAULT_SENSITIVE_PATTERNS = [
  'CLAUDE.md',
  'sys/governance/**',
  'sys/protocols/**',
  'sys/atlas-blueprint.md',
  'sys/atlas-blueprint-derived.md',
  'sys/lessons.md',
  'src/db/schema-pg.sql',
  'src/migrations/**',
  'src/migrations-demo/**',
  'scripts/prod-migrate.config.json',
  '.github/workflows/**',
  'scripts/cowork-ledger/**',
  'scripts/git-hooks/**',
];

// Parse the FIRST ```paths fenced block from the sensitive-paths governance md.
// One pattern per line; blank lines and `#` comments ignored. Exported pure.
export function parseSensitivePaths(md) {
  if (!md) return [];
  const m = md.match(/```paths\n([\s\S]*?)```/);
  if (!m) return [];
  return m[1]
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('#'));
}

function loadSensitivePatterns() {
  try {
    const md = readFileSync(join(GOVERNANCE_DIR, 'tier-1-75-sensitive-paths.md'), 'utf8');
    const parsed = parseSensitivePaths(md);
    if (parsed.length) return parsed;
    console.log('[tier-1-75-review] sensitive-paths md present but no ```paths block; using built-in default.');
    return DEFAULT_SENSITIVE_PATTERNS;
  } catch {
    console.log('[tier-1-75-review] sensitive-paths governance file absent/unreadable; using built-in default.');
    return DEFAULT_SENSITIVE_PATTERNS;
  }
}

// Minimal glob → RegExp. `**` matches any run incl. slashes (and collapses a
// trailing `**/` so it can match zero dirs); `*` matches a run of non-slash
// chars; everything else is literal. Anchored full match. (Same semantics as
// the Tier 1.5 runner's globToRegExp.)
export function globToRegExp(glob) {
  let re = '';
  let i = 0;
  while (i < glob.length) {
    if (glob[i] === '*' && glob[i + 1] === '*') {
      re += '.*';
      i += 2;
      if (glob[i] === '/') i += 1;
    } else if (glob[i] === '*') {
      re += '[^/]*';
      i += 1;
    } else {
      re += glob[i].replace(/[.+?^${}()|[\]\\]/g, '\\$&');
      i += 1;
    }
  }
  return new RegExp('^' + re + '$');
}

export function matchesSensitive(path, patterns) {
  for (const pat of patterns) {
    if (pat === path) return true;
    if (pat.includes('*') && globToRegExp(pat).test(path)) return true;
  }
  return false;
}

// Given the touched files + the patterns, return the subset that matched.
export function sensitiveHits(files, patterns) {
  return (files || []).filter((f) => matchesSensitive(f, patterns));
}

// ---------------------------------------------------------------------------
// Generated/baseline files — diff-only treatment (P670, S293)
// ---------------------------------------------------------------------------

// Files whose bulk is GENERATED/BASELINE content rather than hand-authored source.
// These are reviewed via their DIFF ONLY — their full content is NOT included in
// the review request. Rationale: the diff already carries every reviewable line
// (an added migration's unified diff IS its full body; a `schema-pg.sql` dump is a
// generated baseline whose ~130k-token bulk is the same on every schema PR and adds
// no signal beyond its diff). Including the full baseline content blew the assembled
// request past the model context budget and false-blocked legitimate schema
// migrations (P667 #641: ~176066 tokens > 170000 — the bulk was schema-pg.sql's
// 130k-token full content, NOT the 1.7k-token diff). Real source files keep the
// existing full-content-with-trim treatment, so adversarial review of actual code
// is UNCHANGED. Kept deliberately narrow: only declared-generated/baseline artifacts.
export const GENERATED_PATTERNS = [
  'src/db/schema-pg.sql',
  '**/schema-pg.sql',
  'src/migrations/**',
  'src/migrations-demo/**',
  '**/migrations/**',
  '**/migrations-demo/**',
  'package-lock.json',
  '**/package-lock.json',
  'pnpm-lock.yaml',
  '**/pnpm-lock.yaml',
  'yarn.lock',
  '**/yarn.lock',
  'npm-shrinkwrap.json',
  '**/npm-shrinkwrap.json',
];

// The stub that stands in for a generated file's full content. Tiny (~30 tokens),
// so it never counts against the budget and is never itself trimmed. It tells the
// reviewer the file exists and was reviewed via its diff by design (not silently
// dropped). Exported pure.
export const GENERATED_STUB =
  '(generated/baseline file — reviewed via its diff above; full content omitted by ' +
  'design so generated bulk does not consume the review budget. P670.)';

// Is this touched path a generated/baseline artifact (→ diff-only)? Reuses the
// glob matcher so the semantics match the sensitive-path matcher exactly. Exported pure.
export function isGeneratedFile(path) {
  return matchesSensitive(path, GENERATED_PATTERNS);
}

// ---------------------------------------------------------------------------
// Verdict derivation
// ---------------------------------------------------------------------------

const BLOCKING_SEVERITIES = new Set(['Critical', 'High']);
const CANON_SEVERITY = { critical: 'Critical', high: 'High', medium: 'Medium', low: 'Low' };

// Normalize a model-supplied severity to the canonical casing, CASE-INSENSITIVELY.
// A blocking gate must treat `"high"` exactly like `"High"` — otherwise a model
// that lowercases its severities would let a blocking finding through as
// non-blocking (Tier 1.75 adversarial self-review finding, PR #628, High).
// Returns null for an unrecognized severity (the caller treats that as a schema
// violation → malformed reviewer output, NOT a silent clean verdict). Exported pure.
export function normalizeSeverity(s) {
  if (typeof s !== 'string') return null;
  return CANON_SEVERITY[s.trim().toLowerCase()] || null;
}

// Strict-contract parse of the reviewer's defect list. Throws a tagged
// `reviewerMalformed` error for a schema-invalid response (non-array `defects`,
// or a defect whose severity doesn't normalize) so main() routes it to the
// loud fail-open path rather than silently coercing garbage to a clean SHIP
// (Tier 1.75 adversarial self-review finding, PR #628, High — "schema-invalid
// JSON is silently coerced to no defects"). Exported pure.
export function parseDefects(parsed) {
  const raw = parsed && (parsed.defects !== undefined ? parsed.defects : parsed.findings);
  if (raw === undefined || raw === null) return [];
  if (!Array.isArray(raw)) {
    const e = new Error(`reviewer returned a non-array \`defects\` field (${typeof raw}) — schema violation`);
    e.reviewerMalformed = true;
    throw e;
  }
  for (const d of raw) {
    // EVERY defect must be an object with a RECOGNIZED severity. A MISSING or
    // unrecognized severity is a schema violation — not a silently-non-blocking
    // amendment. Otherwise `{summary: "real blocking issue"}` (no severity) would
    // derive SHIP-WITH-AMENDMENTS and pass the gate green (Tier 1.75 self-review
    // finding, PR #628, High — "missing severity downgraded to non-blocking").
    if (!d || typeof d !== 'object' || Array.isArray(d)) {
      const e = new Error(`reviewer returned a non-object defect ${JSON.stringify(d)} — schema violation`);
      e.reviewerMalformed = true;
      throw e;
    }
    if (normalizeSeverity(d.severity) === null) {
      const e = new Error(`reviewer returned a defect with a missing/unrecognized severity ${JSON.stringify(d.severity)} — schema violation`);
      e.reviewerMalformed = true;
      throw e;
    }
  }
  return raw;
}

// The verdict is mechanical: any High/Critical defect → BLOCK; any defect at all
// (Medium/Low only) → SHIP-WITH-AMENDMENTS; none → SHIP-AS-IS. We RECOMPUTE this
// from the defect list (with CASE-INSENSITIVE severity) as a safety net so a
// model that mis-states `verdict` or lowercases a severity cannot let a blocking
// finding merge. Exported pure.
export function deriveVerdict(defects) {
  const list = Array.isArray(defects) ? defects : [];
  if (list.some((d) => BLOCKING_SEVERITIES.has(normalizeSeverity(d?.severity)))) return 'BLOCK';
  if (list.length) return 'SHIP-WITH-AMENDMENTS';
  return 'SHIP-AS-IS';
}

// Normalize the model's STATED verdict string to a canonical value (or null).
// Used only to RECONCILE against the derived verdict — a stated BLOCK with no
// blocking defects is self-contradictory and must not silently ship. Exported pure.
export function normalizeStatedVerdict(v) {
  if (typeof v !== 'string') return null;
  const s = v.trim().toUpperCase().replace(/[\s_]+/g, '-');
  if (s === 'BLOCK') return 'BLOCK';
  if (s === 'SHIP-WITH-AMENDMENTS') return 'SHIP-WITH-AMENDMENTS';
  if (s === 'SHIP-AS-IS') return 'SHIP-AS-IS';
  return null;
}

// ---------------------------------------------------------------------------
// GitHub + git helpers
// ---------------------------------------------------------------------------

async function gh(path, init = {}) {
  const res = await fetch(`https://api.github.com${path}`, {
    ...init,
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${GITHUB_TOKEN}`,
      'X-GitHub-Api-Version': '2022-11-28',
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      ...(init.headers || {}),
    },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`GitHub API ${init.method || 'GET'} ${path} → ${res.status}: ${text.slice(0, 500)}`);
  }
  return res.json();
}

function sh(cmd, args) {
  return execFileSync(cmd, args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
}

async function resolvePrContext() {
  if (DISPATCH_MODE) {
    const num = Number(REVIEW_PR_NUMBER);
    if (!Number.isInteger(num) || num <= 0) fatal(`REVIEW_PR_NUMBER is not a valid PR number: ${REVIEW_PR_NUMBER}`);
    const data = await gh(`/repos/${owner}/${repo}/pulls/${num}`);
    prNumber = data.number;
    prTitle = data.title || '';
    prBody = data.body || '';
    prAuthor = data.user?.login || 'unknown';
    baseSha = REVIEW_BASE_SHA || data.base?.sha;
    headSha = REVIEW_HEAD_SHA || (data.merged ? data.merge_commit_sha : data.head?.sha);
    baseRef = data.base?.ref || 'main';
    if (!baseSha || !headSha) fatal(`could not resolve base/head SHA for PR #${num} (base=${baseSha}, head=${headSha}).`);
    console.log(`[tier-1-75-review] dispatch mode: PR #${prNumber} ${baseSha.slice(0, 9)}..${headSha.slice(0, 9)}${READONLY ? ' [READ-ONLY]' : ''}`);
    return;
  }
  const event = JSON.parse(readFileSync(GITHUB_EVENT_PATH, 'utf8'));
  const pr = event.pull_request;
  if (!pr) fatal('event payload missing pull_request');
  if (event.action === 'closed' && !pr.merged) {
    console.log('[tier-1-75-review] PR closed without merge; nothing to review. Skipping.');
    process.exit(0);
  }
  prNumber = pr.number;
  baseSha = pr.base?.sha;
  headSha = pr.merged ? pr.merge_commit_sha : pr.head?.sha;
  baseRef = pr.base?.ref || 'main';
  prTitle = pr.title || '';
  prBody = pr.body || '';
  prAuthor = pr.user?.login || 'unknown';
  if (!baseSha || !headSha) fatal(`could not resolve base/head SHA from event payload (base=${baseSha}, head=${headSha}).`);
}

// Resolve the changed-file list + patches via the PR-FILES endpoint
// (`GET /pulls/{n}/files`), NOT local `git` and NOT the `compare` endpoint.
//   - Local `git merge-base` proved flaky in CI (shallow base fetch + moved base
//     → wrong two-dot diff → false-positive "deleted gate" Criticals, PR #628
//     rounds 3-4).
//   - The `compare` endpoint computes the merge-base server-side but does NOT
//     reliably paginate its `files` array — it caps the list, so a large PR could
//     HIDE a changed sensitive file from the gate (PR #628 round 6, Critical).
// `pulls/{n}/files` IS a standard paginated list endpoint (100/page, up to 3000
// files) that returns exactly the PR's diff (GitHub already did the merge-base),
// with per-file `patch`. We paginate fully and fail CLOSED if the 3000-file cap
// is hit (the list may then be incomplete — a sensitive path could be beyond it).
async function computeDiff() {
  const files = [];
  const patchParts = [];
  let truncated = false;
  const MAX_PAGES = 30; // 30 * 100 = 3000 files (the PR-files ceiling)
  for (let page = 1; page <= MAX_PAGES; page++) {
    const pageFiles = await gh(`/repos/${owner}/${repo}/pulls/${prNumber}/files?per_page=100&page=${page}`);
    if (!Array.isArray(pageFiles) || pageFiles.length === 0) break;
    for (const f of pageFiles) {
      files.push(f.filename);
      // `patch` is omitted for binary / very-large files — note the change without it.
      if (f.patch) {
        patchParts.push(`diff --git a/${f.previous_filename || f.filename} b/${f.filename}\n` + `--- ${f.status === 'added' ? '/dev/null' : 'a/' + (f.previous_filename || f.filename)}\n+++ ${f.status === 'removed' ? '/dev/null' : 'b/' + f.filename}\n` + f.patch);
      } else {
        patchParts.push(`diff --git a/${f.filename} b/${f.filename}\n// [no inline patch — ${f.status}, +${f.additions ?? '?'}/-${f.deletions ?? '?'} (binary or too large)]`);
      }
    }
    if (pageFiles.length < 100) break;
    if (page === MAX_PAGES) truncated = true; // full last page at the ceiling → incomplete
  }
  console.log(`[tier-1-75-review] PR-files API: ${files.length} file(s) changed in PR #${prNumber}${truncated ? ' (TRUNCATED — 3000-file ceiling hit)' : ''}.`);
  // `truncated` means the changed-file list may be INCOMPLETE — a sensitive file
  // could be beyond the enumerable set. The caller fails CLOSED on that, never
  // skip-green (Tier 1.75 self-review findings, PR #628).
  return { files, diff: patchParts.join('\n'), truncated };
}

function readTouchedFile(path) {
  try {
    return sh('git', ['show', `${headSha}:${path}`]);
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Governance load
// ---------------------------------------------------------------------------

function readGovernanceFile(name, { required = true } = {}) {
  const p = join(GOVERNANCE_DIR, name);
  try {
    return readFileSync(p, 'utf8');
  } catch (e) {
    if (!required) return null;
    throw new Error(
      `governance file missing at ${p}: ${e.message}. The workflow checks out ` +
        `${GOVERNANCE_SOURCE_REPO}:${GOVERNANCE_SOURCE_BRANCH}/sys/governance/ into GOVERNANCE_DIR; ` +
        `confirm the checkout step ran and LEGARA_GOVERNANCE_READ_TOKEN is set.`
    );
  }
}

function loadGovernance() {
  const prompt = readGovernanceFile('tier-1-75-review-prompt.md');
  // lessons + atlas enrich the review but are not required — soft-fail to {}.
  let lessons = {};
  let atlas = {};
  try {
    lessons = JSON.parse(readGovernanceFile('lessons-index.json', { required: false }) || '{}');
  } catch {
    /* keep {} */
  }
  try {
    atlas = JSON.parse(readGovernanceFile('atlas-summary.json', { required: false }) || '{}');
  } catch {
    /* keep {} */
  }
  return { prompt, lessons, atlas };
}

export function extractModelPin(prompt) {
  const m = prompt.match(/Pinned model:\*\*\s*`([^`]+)`/);
  if (!m) throw new Error('could not extract pinned model from review prompt (expected "**Pinned model:** `<name>`")');
  return m[1];
}

// ---------------------------------------------------------------------------
// Context assembly (budget-aware)
// ---------------------------------------------------------------------------

function assembleUserMessage({ lessons, atlas, files, hits, diff, fileContents, notes }) {
  const header = [
    `# PR metadata`,
    `Repository: ${GITHUB_REPOSITORY}`,
    `PR #${prNumber}: ${prTitle}`,
    `Author: ${prAuthor}`,
    `Base SHA: ${baseSha}`,
    `Head SHA: ${headSha}`,
    `Files touched: ${files.length}`,
    `Sensitive-class paths matched (this is why Tier 1.75 fired): ${hits.join(', ')}`,
    ``,
    `## PR description`,
    prBody || '(none)',
    ``,
    `## Diff (base..head)`,
    '```diff',
    diff,
    '```',
    ``,
    `## Touched files — full contents (at head SHA)`,
  ].join('\n');

  const fileBlocks = fileContents
    .map(({ path, content, truncated }) =>
      [`### ${path}${truncated ? ' (truncated)' : ''}`, '```', content, '```'].join('\n')
    )
    .join('\n\n');

  const context = [
    `## Governance context`,
    `### Lessons index`,
    '```json',
    JSON.stringify(lessons, null, 2),
    '```',
    ``,
    `### Atlas domain summary`,
    '```json',
    JSON.stringify(atlas, null, 2),
    '```',
  ].join('\n');

  const noteBlock = notes && notes.length ? `\n\n## Runner notes\n${notes.map((n) => `- ${n}`).join('\n')}` : '';
  return `${header}\n\n${fileBlocks}\n\n${context}${noteBlock}`;
}

// `readFile` is injectable (defaults to the git-backed reader) so this is unit-
// testable without git/network. Generated/baseline files (schema dumps, migrations,
// lockfiles) are represented by a tiny diff-only STUB rather than their full content
// — the diff (assembled separately and never trimmed) is their reviewable surface
// (P670). Real source files keep the full-content-with-largest-first-trim treatment.
export function budgetedFileContents(files, diff, prompt, lessons, atlas, readFile = readTouchedFile) {
  const notes = [];
  let fileContents = files.map((path) =>
    isGeneratedFile(path)
      ? { path, content: GENERATED_STUB, truncated: false, generated: true }
      : { path, content: readFile(path) ?? '(deleted in this PR)', truncated: false }
  );
  const generated = files.filter(isGeneratedFile);
  if (generated.length) {
    notes.push(
      `generated_diff_only: ${generated.length} generated/baseline file(s) reviewed via diff only ` +
        `(full content omitted so generated bulk does not consume the budget): ${generated.join(', ')}`
    );
  }
  const overhead =
    estimateTokens(prompt) + estimateTokens(diff) + estimateTokens(JSON.stringify(lessons)) + estimateTokens(JSON.stringify(atlas));
  let total = overhead + fileContents.reduce((n, f) => n + estimateTokens(f.content), 0);
  if (total > BUDGET) {
    const overshoot = total - BUDGET;
    notes.push(`context_truncated: total ~${total} tokens > budget ${BUDGET}; largest touched-file contents trimmed (diff never trimmed).`);
    let shaved = 0;
    fileContents = fileContents
      .sort((a, b) => estimateTokens(b.content) - estimateTokens(a.content))
      .map((f) => {
        if (shaved >= overshoot) return f;
        const cur = estimateTokens(f.content);
        if (cur < 500) return f;
        const keepChars = Math.max(2000, f.content.length - (overshoot - shaved) * 4);
        if (keepChars < f.content.length) {
          shaved += estimateTokens(f.content.slice(keepChars));
          return { path: f.path, content: f.content.slice(0, keepChars) + '\n\n... [truncated for token budget] ...\n', truncated: true };
        }
        return f;
      });
  }
  return { fileContents, notes };
}

// ---------------------------------------------------------------------------
// OpenAI call + failure classification
// ---------------------------------------------------------------------------

// A context-length 400 (the model rejected the request as too large) is
// AUTHOR-controlled size, NOT an uncontrollable provider outage — so it must
// fail CLOSED, not fail-open like other config 400s. Our estimateTokens() is a
// 4-char/token heuristic that can UNDERestimate token-dense content, so the
// preflight size guards can pass yet OpenAI still 400s on context length
// (Tier 1.75 self-review finding, PR #628, High). Detect it from the error text.
// Exported pure.
export function isContextLengthError(err) {
  if (!err || err.status !== 400) return false;
  const msg = String(err.message || '').toLowerCase();
  return (
    msg.includes('context_length_exceeded') ||
    msg.includes('maximum context length') ||
    msg.includes('reduce the length') ||
    msg.includes('too many tokens') ||
    (msg.includes('context') && msg.includes('length') && msg.includes('exceed'))
  );
}

export function classifyReviewerFailure(err) {
  const status = err && err.status;
  if (status === 429) return { kind: 'rate_limit', transient: true, note: `OpenAI 429 rate-limit after ${MAX_ATTEMPTS} retries` };
  if (status >= 500 && status < 600) return { kind: 'server_error', transient: true, note: `OpenAI ${status} after ${MAX_ATTEMPTS} retries` };
  if (status === 400 || status === 401 || status === 403 || status === 404) {
    return {
      kind: 'config',
      transient: false,
      note: `OpenAI ${status} (likely misconfiguration — model pin / API key / account access). Verify gpt-5.5 access; check the pin in tier-1-75-review-prompt.md.`,
    };
  }
  return { kind: 'unknown', transient: false, note: `reviewer call failed: ${String((err && err.message) || err).slice(0, 200)}` };
}

// Pure retry decision (exported for tests). Transient provider errors (429 / 5xx)
// retry up to MAX_ATTEMPTS. A malformed-JSON parse error retries at most ONCE —
// a persistently-malformed model output is a format bug, not a transient hiccup,
// so we fail fast (fail-open) instead of burning the whole retry budget masking
// it. Everything else (4xx config, unknown) is non-retryable. (Tier 1.5 advisory
// review finding, PR #628: don't retry a SyntaxError 5×.)
export function isRetryable(err, parseFailures) {
  const transient = err && (err.status === 429 || (err.status >= 500 && err.status < 600));
  if (transient) return true;
  if (err instanceof SyntaxError) return parseFailures <= 1;
  return false;
}

async function callReviewer({ model, systemPrompt, userMessage }) {
  const body = {
    model,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userMessage },
    ],
    response_format: { type: 'json_object' },
    max_completion_tokens: MAX_COMPLETION_TOKENS,
  };
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const doCall = async () => {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${CROSS_MODEL_REVIEW_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const text = await res.text();
    if (!res.ok) {
      const err = new Error(`OpenAI ${res.status}: ${text.slice(0, 800)}`);
      err.status = res.status;
      err.retryAfter = Number(res.headers.get('retry-after')) || 0;
      throw err;
    }
    const json = JSON.parse(text);
    const content = json.choices?.[0]?.message?.content;
    if (!content) throw new Error('OpenAI response missing message content');
    return { content, usage: json.usage };
  };
  let lastErr;
  let parseFailures = 0;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const { content, usage } = await doCall();
      return { parsed: JSON.parse(content), raw: content, usage };
    } catch (e) {
      lastErr = e;
      if (e instanceof SyntaxError) parseFailures += 1;
      if (attempt >= MAX_ATTEMPTS || !isRetryable(e, parseFailures)) break;
      const backoffMs = e.retryAfter ? e.retryAfter * 1000 : Math.min(30000, 1000 * 2 ** (attempt - 1)) + Math.floor(Math.random() * 500);
      console.error(`[tier-1-75-review] attempt ${attempt} failed (${String(e.message).slice(0, 120)}); retrying in ${backoffMs}ms.`);
      await sleep(backoffMs);
    }
  }
  if (lastErr) lastErr.reviewerUnavailable = true;
  throw lastErr;
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

const SEVERITY_ORDER = { Critical: 0, High: 1, Medium: 2, Low: 3 };
const SEVERITY_BADGE = { Critical: '🔴 Critical', High: '🟠 High', Medium: '🟡 Medium', Low: '⚪ Low' };
const VERDICT_BADGE = {
  BLOCK: '🛑 **BLOCK** — merge is blocked until the High/Critical defect(s) below are addressed (or Roger:ratify-overridden).',
  'SHIP-WITH-AMENDMENTS': '🟡 **SHIP-WITH-AMENDMENTS** — no blocking defects; fold the amendments below in (advisory, non-blocking).',
  'SHIP-AS-IS': '✅ **SHIP-AS-IS** — adversarial review found no defects on the sensitive-class paths touched.',
};

const promptLink = `[adversarial prompt](https://github.com/${GOVERNANCE_SOURCE_REPO}/blob/${GOVERNANCE_SOURCE_BRANCH}/sys/governance/tier-1-75-review-prompt.md)`;

export function renderComment({ verdict, defects, reviewNotes, model, usage, hits, notes }) {
  const sorted = [...defects].sort(
    (a, b) => (SEVERITY_ORDER[a.severity] ?? 9) - (SEVERITY_ORDER[b.severity] ?? 9) || (a.file || '').localeCompare(b.file || '')
  );
  const counts = ['Critical', 'High', 'Medium', 'Low'].map((s) => `${defects.filter((d) => d.severity === s).length} ${s}`).join(', ');
  const header = [
    `## 🛡️ Tier 1.75 Sensitive-Class Adversarial Review`,
    ``,
    VERDICT_BADGE[verdict] || `**${verdict}**`,
    ``,
    `Reviewer: \`${model}\` (adversarial, full model — independence triangle) — ${promptLink}`,
    `Sensitive paths matched: ${hits.map((h) => `\`${h}\``).join(', ')}`,
    `Defects: **${defects.length}**${defects.length ? ` (${counts})` : ''}`,
    usage ? `Tokens: ${usage.prompt_tokens} in / ${usage.completion_tokens} out / ${usage.total_tokens} total` : '',
    notes && notes.length ? `Runner notes: ${notes.join('; ')}` : '',
  ]
    .filter(Boolean)
    .join('\n');

  if (!defects.length) {
    return [header, ``, `> Tier 1.75 fires only on sensitive-class paths and asks "what's missing / what fails when…". A clean result here is rarer than on ordinary PRs — but the adversarial pass found nothing blocking.`, reviewNotes ? `\n> ${reviewNotes}` : ''].join('\n');
  }
  const rows = sorted
    .map(
      (d, i) =>
        `### ${i + 1}. ${SEVERITY_BADGE[d.severity] || d.severity} — ${d.category || 'uncategorized'}\n\n` +
        `**File:** \`${d.file || '(unknown)'}\`${d.line ? `:${d.line}` : ''}\n\n` +
        `**What is broken:** ${d.summary || '(no summary)'}\n\n` +
        (d.what_fails_when ? `**What fails when:** ${d.what_fails_when}\n\n` : '') +
        `**Recommended amendment:** ${d.recommended_amendment || d.recommended_fix || '(none provided)'}\n` +
        (d.governance_reference ? `\n**Governance:** ${d.governance_reference}\n` : '')
    )
    .join('\n\n---\n\n');
  return [header, ``, rows, reviewNotes ? `\n---\n\n> ${reviewNotes}` : ''].join('\n');
}

export function renderSkipComment({ files }) {
  return [
    `## 🛡️ Tier 1.75 Sensitive-Class Adversarial Review`,
    ``,
    `✅ **Not required for this PR** — none of the ${files.length} touched path(s) match the sensitive-class list (\`sys/governance/tier-1-75-sensitive-paths.md\`). No adversarial review run; no extra cost. Tier 1.5 still reviews this PR advisorily.`,
  ].join('\n');
}

export function renderUnavailableComment({ model, cls }) {
  const transient = cls.transient;
  const malformed = cls.kind === 'malformed';
  const headline = malformed
    ? 'returned malformed output'
    : transient
      ? 'transient provider error'
      : 'likely misconfiguration';
  return [
    `## 🛡️ Tier 1.75 Sensitive-Class Adversarial Review`,
    ``,
    `> ⚠️ **Reviewer ${malformed ? 'output unusable' : 'unavailable'} — ${headline}. The sensitive-class adversarial review did NOT produce a trustworthy verdict.**`,
    ``,
    `Reviewer: \`${model}\` — ${promptLink}`,
    `Failure: ${cls.note}`,
    ``,
    malformed
      ? `The reviewer returned a response that violates the strict output contract (non-array \`defects\` or an unrecognized severity), so it was NOT coerced into a (possibly hidden-finding) clean verdict.`
      : transient
        ? `The reviewer hit a transient provider error (rate-limit / 5xx) and did not complete after ${MAX_ATTEMPTS} retries.`
        : `The reviewer could not be invoked — almost always an inaccessible pinned model, a missing/rotated API key, or an account that lacks access to \`${model}\`. **Verify the account can call \`gpt-5.5-2026-04-23\` (see the playbook's API probe), then re-run.**`,
    ``,
    `**This check is GREEN (fail-open)** so the reviewer's own outage can't force every sensitive PR through \`--admin\`. But the sensitive-class code was **NOT adversarially reviewed** — **manual review is required**, or hold the merge until the reviewer is restored. Roger:ratify the merge only with that understanding.`,
    ``,
    `<sub>Fail-open on reviewer-unavailable per P618 (mirrors the P616 Tier 1.5 precedent). Recorded as a \`reviewer_unavailable\` annotation in the cowork ledger.</sub>`,
  ].join('\n');
}

// ---------------------------------------------------------------------------
// Comment posting + ledger emit
// ---------------------------------------------------------------------------

async function postComment(body) {
  if (READONLY) {
    console.log(`[tier-1-75-review] READ-ONLY: would post PR comment (${body.length} chars).`);
    console.log('----- BEGIN READ-ONLY REVIEW BODY -----');
    console.log(body);
    console.log('----- END READ-ONLY REVIEW BODY -----');
    return null;
  }
  return await gh(`/repos/${owner}/${repo}/issues/${prNumber}/comments`, { method: 'POST', body: JSON.stringify({ body }) });
}

// Mirror of the Tier 1.5 P544 review_fired emitter — tier "1.75". The workflow's
// downstream step appends this to the lm-v2 ledger via append-event.mjs.
export function buildReviewFiredPayload({ repo, prNumber, baseSha, headSha, model, verdict, defects, commentUrl, notes, unavailable, hits }) {
  const counts = { critical: 0, high: 0, medium: 0, low: 0 };
  for (const d of defects || []) {
    const sev = String(d?.severity || '').toLowerCase();
    if (counts[sev] !== undefined) counts[sev]++;
  }
  return {
    tier: '1.75',
    source: { repo, pr: prNumber, head_sha: headSha, merge_base: baseSha },
    model,
    date: new Date().toISOString(),
    artifact_path: commentUrl || `https://github.com/${repo}/pull/${prNumber}`,
    verdict: unavailable ? 'reviewer_unavailable' : verdict,
    sensitive_paths_matched: hits || [],
    findings_count_by_severity: counts,
    outcome: unavailable ? 'reviewer_unavailable' : 'reviewed',
    ...(unavailable ? { reviewer_unavailable: { kind: unavailable.kind, transient: !!unavailable.transient, note: unavailable.note } } : {}),
    truncation_notes: Array.isArray(notes) && notes.length ? notes : null,
  };
}

function emitReviewFiredPayload(args) {
  if (READONLY) {
    console.log('[tier-1-75-review] READ-ONLY; skipping review_fired emission.');
    return null;
  }
  if (!process.env.GITHUB_OUTPUT) {
    console.log('[tier-1-75-review] no $GITHUB_OUTPUT; skipping review_fired emission (local run).');
    return null;
  }
  const payload = buildReviewFiredPayload({ repo: GITHUB_REPOSITORY, prNumber, baseSha, headSha, ...args });
  const json = JSON.stringify(payload);
  appendFileSync(process.env.GITHUB_OUTPUT, `review_event_payload=${json}\n`);
  console.log(`[tier-1-75-review] emitted review_event_payload (${json.length} chars).`);
  return payload;
}

// ---------------------------------------------------------------------------
// main
// ---------------------------------------------------------------------------

async function main() {
  // Missing API key → fail-open skip-green. This makes the workflow safe to ship
  // on a repo BEFORE the CROSS_MODEL_REVIEW_API_KEY secret is added (lm-v2 first
  // CI). It self-activates the moment the secret lands.
  if (!CROSS_MODEL_REVIEW_API_KEY) {
    console.log('[tier-1-75-review] CROSS_MODEL_REVIEW_API_KEY not set — Tier 1.75 not configured on this repo; skip-reporting green.');
    if (GITHUB_TOKEN && (GITHUB_EVENT_PATH || DISPATCH_MODE) && GITHUB_REPOSITORY) {
      try {
        await resolvePrContext();
        await postComment(
          [
            `## 🛡️ Tier 1.75 Sensitive-Class Adversarial Review`,
            ``,
            `> ⚠️ **Not configured on this repo.** \`CROSS_MODEL_REVIEW_API_KEY\` is not set in this repository's secrets, so the adversarial review did not run. The check is GREEN (fail-open) so it can't block merges. Add the secret to enable Tier 1.75 here.`,
          ].join('\n')
        );
      } catch (e) {
        console.log(`[tier-1-75-review] could not post not-configured comment (non-fatal): ${String(e.message).slice(0, 160)}`);
      }
    }
    process.exit(0);
  }
  if (!GITHUB_TOKEN) fatal('GITHUB_TOKEN not set');
  if (!DISPATCH_MODE && !GITHUB_EVENT_PATH) fatal('GITHUB_EVENT_PATH not set (and no REVIEW_PR_NUMBER for dispatch mode)');
  if (!GITHUB_REPOSITORY) fatal('GITHUB_REPOSITORY not set');

  await resolvePrContext();
  console.log(`[tier-1-75-review] PR #${prNumber} ${baseSha}..${headSha}${READONLY ? ' [READ-ONLY]' : ''}`);

  const { files, diff, truncated } = await computeDiff();
  console.log(`[tier-1-75-review] ${files.length} files touched; diff ${diff.length} chars${truncated ? ' (file list TRUNCATED)' : ''}`);

  // If the changed-file list was TRUNCATED, we cannot prove no sensitive path was
  // touched → fail CLOSED (a PR too large to enumerate must be split/overridden,
  // not skip-greened past the gate). Author-controlled size, so this is a block,
  // not the provider-outage fail-open (Tier 1.75 self-review finding, PR #628).
  if (truncated) {
    console.error('[tier-1-75-review] compare file list truncated; cannot rule out a sensitive path. Failing closed (exit 1).');
    if (!READONLY) {
      await postComment(
        `## 🛡️ Tier 1.75 Sensitive-Class Adversarial Review\n\n🛑 **BLOCK — PR changes too many files to enumerate (compare-API file list truncated).** This gate cannot prove no sensitive-class path was touched, so it fails **closed** rather than skip-green. **Split the PR**, or **Roger:ratify-override** if the size is unavoidable.`
      );
    }
    emitReviewFiredPayload({ model: '(skipped — truncated file list)', verdict: 'BLOCK', defects: [{ severity: 'High' }], commentUrl: null, notes: ['compare_file_list_truncated'], hits: [] });
    process.exit(1);
  }

  if (!files.length) {
    console.log('[tier-1-75-review] empty diff; skipping.');
    return;
  }

  // NO self-scope exclusion. A blocking gate must NOT silently exempt changes to
  // its own runner/workflow — that would let a PR weaken or break the reviewer and
  // merge green without the very adversarial review that protects CI automation
  // (Tier 1.75 adversarial self-review finding, PR #628, Critical). So changes to
  // the Tier 1.75 machinery are reviewed like any other sensitive change: if the
  // PR-head runner is broken, the workflow errors → red → blocks (correct); if it
  // works, it adversarially reviews the change to itself. A legitimate reviewer
  // refactor that the gate flags can be merged via an explicit Roger:ratify
  // override — never via a silent self-skip.

  const patterns = loadSensitivePatterns();
  const hits = sensitiveHits(files, patterns);
  if (!hits.length) {
    console.log('[tier-1-75-review] no sensitive-class paths touched; skip-reporting green.');
    await postComment(renderSkipComment({ files }));
    return; // exit 0 — non-sensitive PR pays no review cost
  }
  console.log(`[tier-1-75-review] sensitive paths matched (${hits.length}): ${hits.join(', ')}`);

  // FAIL CLOSED on an oversized SENSITIVE diff — by LOC *or* by estimated tokens.
  // Diff SIZE is AUTHOR-controlled, so skip-reporting green here is a bypass
  // vector: an author could inflate a sensitive change past the budget to dodge
  // the blocking review (Tier 1.75 adversarial self-review findings, PR #628).
  // The token check matters because a diff can be under MAX_DIFF_LOC yet exceed
  // the model context window — which would otherwise 400 → fail-OPEN (the path
  // the self-review flagged). Fail-open is reserved for PROVIDER outages
  // (uncontrollable infra), NOT author-controlled size: a sensitive PR too large
  // to review must be split or Roger:ratify-overridden, not merged unreviewed.
  const diffLoc = diff.split('\n').length;
  const diffTokens = estimateTokens(diff);
  if (diffLoc > MAX_LOC || diffTokens > BUDGET) {
    const why = diffLoc > MAX_LOC ? `${diffLoc} LOC > ${MAX_LOC}` : `~${diffTokens} diff tokens > budget ${BUDGET}`;
    console.error(`[tier-1-75-review] sensitive diff too large (${why}); failing closed (exit 1).`);
    if (!READONLY) {
      await postComment(
        `## 🛡️ Tier 1.75 Sensitive-Class Adversarial Review\n\n🛑 **BLOCK — sensitive diff too large to review (${why}).** Diff size is author-controlled, so this gate fails **closed** here (not open) to prevent size-based bypass of the adversarial review. **Split the PR** into reviewable pieces, or **Roger:ratify-override** if the size is unavoidable (e.g. a generated baseline). This is distinct from the provider-outage fail-OPEN path — only uncontrollable infra failures pass green.`
      );
    }
    emitReviewFiredPayload({ model: '(skipped — oversize)', verdict: 'BLOCK', defects: [{ severity: 'High' }], commentUrl: null, notes: [`oversize_sensitive_diff: ${why}`], hits });
    process.exit(1);
  }

  const governance = loadGovernance();
  const model = extractModelPin(governance.prompt);
  console.log(`[tier-1-75-review] pinned model: ${model}`);

  let verdict;
  let defects;
  let reviewNotes;
  let usage;
  let notes = [];

  // Assemble the ACTUAL request (system prompt + user message) and check its FULL
  // token total before any network call. The diff-token precheck above bounds the
  // diff alone, but the assembled context also carries the prompt + lessons +
  // atlas + PR body + (trimmed) file contents — which can still push a sensitive
  // request past the model's context window and 400. A 400 would otherwise route
  // through classifyReviewerFailure as "config" → fail-OPEN, letting an
  // author-controlled-size sensitive PR pass unreviewed (Tier 1.75 self-review
  // finding, PR #628, High). So if the assembled request still exceeds budget
  // after file-content trimming, fail CLOSED here (the size is author-controlled),
  // exactly like the oversized-diff path — never call OpenAI and risk the
  // 400→fail-open route.
  const { fileContents, notes: budgetNotes } = budgetedFileContents(files, diff, governance.prompt, governance.lessons, governance.atlas);
  notes = budgetNotes;
  const userMessage = assembleUserMessage({ lessons: governance.lessons, atlas: governance.atlas, files, hits, diff, fileContents, notes });
  const assembledTokens = estimateTokens(governance.prompt) + estimateTokens(userMessage);
  if (assembledTokens > BUDGET) {
    const why = `assembled request ~${assembledTokens} tokens > budget ${BUDGET} (diff + context exceeds the model window even after trimming)`;
    console.error(`[tier-1-75-review] ${why}; failing closed (exit 1).`);
    if (!READONLY) {
      await postComment(
        `## 🛡️ Tier 1.75 Sensitive-Class Adversarial Review\n\n🛑 **BLOCK — sensitive change too large to review (${why}).** The full review request exceeds the model context window even after trimming touched-file contents. Request size is author-controlled, so this gate fails **closed** (not open) to prevent a context-overflow 400 from routing through the provider-error fail-OPEN path. **Split the PR**, or **Roger:ratify-override** if unavoidable.`
      );
    }
    emitReviewFiredPayload({ model, verdict: 'BLOCK', defects: [{ severity: 'High' }], commentUrl: null, notes: [`oversize_assembled_context: ${assembledTokens} > ${BUDGET}`], hits });
    process.exit(1);
  }

  try {
    const res = await callReviewer({ model, systemPrompt: governance.prompt, userMessage });
    // STRICT-contract parse — throws `reviewerMalformed` on a schema-invalid
    // response (non-array defects, unrecognized severity) so garbage can't be
    // silently coerced to a clean SHIP.
    defects = parseDefects(res.parsed);
    reviewNotes = res.parsed.review_notes || null;
    usage = res.usage;
    // RECOMPUTE the verdict from the defect list (case-insensitive severity) —
    // never trust the model's stated verdict to gate a merge (a mis-stated
    // SHIP-AS-IS with a High defect, or a lowercased "high", must still BLOCK).
    verdict = deriveVerdict(defects);
    // RECONCILE the model's STATED verdict with the derived one. If the model
    // explicitly said BLOCK but listed no blocking defects (e.g. `{"verdict":
    // "BLOCK","defects":null}` or it described a problem in prose without
    // substantiating it), the response is self-contradictory — do NOT silently
    // ship it. Treat it as malformed → fail-open-LOUD (manual review), neither a
    // silent SHIP nor a defect-less hard block (Tier 1.75 self-review finding,
    // PR #628, High).
    const stated = normalizeStatedVerdict(res.parsed.verdict);
    if (stated === 'BLOCK' && verdict !== 'BLOCK') {
      const e = new Error(`reviewer stated verdict BLOCK but listed no blocking defect (derived ${verdict}) — self-contradictory output`);
      e.reviewerMalformed = true;
      throw e;
    }
    console.log(`[tier-1-75-review] verdict=${verdict} (model stated ${stated || 'n/a'}); ${defects.length} defect(s); usage=${JSON.stringify(usage)}`);
  } catch (e) {
    // FAIL-OPEN-LOUD on reviewer-unavailable (provider outage / config) OR
    // reviewer-malformed (schema-invalid output). Both mean the review did NOT
    // produce a trustworthy verdict — surface loudly + require manual review,
    // never silently pass a hidden finding. Any OTHER error is a genuine runner
    // bug → re-throw → exit 1 (red).
    if (!e || (!e.reviewerUnavailable && !e.reviewerMalformed)) throw e;
    // A context-length 400 is author-controlled size, not an uncontrollable
    // outage → FAIL CLOSED (block, split/override), never the fail-open route.
    if (isContextLengthError(e)) {
      const why = `OpenAI 400 context_length_exceeded — request too large for the model window even after trimming (estimateTokens underestimated)`;
      console.error(`[tier-1-75-review] ${why}; failing closed (exit 1).`);
      if (!READONLY) {
        await postComment(
          `## 🛡️ Tier 1.75 Sensitive-Class Adversarial Review\n\n🛑 **BLOCK — sensitive request too large to review (${why}).** Request size is author-controlled, so this gate fails **closed** (not the provider-outage fail-OPEN path). **Split the PR**, or **Roger:ratify-override** if unavoidable.`
        );
      }
      emitReviewFiredPayload({ model, verdict: 'BLOCK', defects: [{ severity: 'High' }], commentUrl: null, notes: [...notes, 'oversize_context_length_400'], hits });
      process.exit(1);
    }
    const cls = e.reviewerMalformed
      ? { kind: 'malformed', transient: false, note: `reviewer returned schema-invalid output: ${String(e.message).slice(0, 160)}` }
      : classifyReviewerFailure(e);
    console.error(`[tier-1-75-review] FAIL-OPEN: reviewer ${cls.kind} — ${cls.note}.`);
    await postComment(renderUnavailableComment({ model, cls }));
    emitReviewFiredPayload({ model, verdict: 'reviewer_unavailable', defects: [], commentUrl: null, notes: [...notes, `reviewer_${cls.kind}: ${cls.note}`], unavailable: cls, hits });
    process.exit(0); // fail-open green (loud)
  }

  const commentBody = renderComment({ verdict, defects, reviewNotes, model, usage, hits, notes });
  const commentResponse = await postComment(commentBody);
  const commentUrl = commentResponse?.html_url || null;
  emitReviewFiredPayload({ model, verdict, defects, commentUrl, notes, hits });

  // BLOCK exits non-zero EVEN IN READONLY. Readonly suppresses the comment POST,
  // but it must NOT be able to turn a real BLOCK into a green check on the same
  // head SHA — a readonly workflow_dispatch shares this job's required-check
  // context, so a green readonly run would mask a genuine BLOCK (Tier 1.75
  // self-review finding, PR #628, High). The check status always reflects the
  // real verdict; only the comment is suppressed in readonly.
  if (verdict === 'BLOCK') {
    const blocking = defects.filter((d) => BLOCKING_SEVERITIES.has(normalizeSeverity(d.severity)));
    console.error(`[tier-1-75-review] BLOCK — ${blocking.length} High/Critical defect(s) on sensitive-class paths. Failing the required check (exit 1).`);
    process.exit(1); // red → blocks merge once the check is required
  }
  console.log('[tier-1-75-review] done (green).');
}

const invokedDirectly = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) {
  main().catch((e) => {
    console.error(`[tier-1-75-review] ERROR: ${e.stack || e.message}`);
    process.exit(1);
  });
}

// Test-only exports (pure helpers).
export const __test = {
  estimateTokens,
  parseSensitivePaths,
  globToRegExp,
  matchesSensitive,
  sensitiveHits,
  isGeneratedFile,
  GENERATED_PATTERNS,
  GENERATED_STUB,
  budgetedFileContents,
  deriveVerdict,
  normalizeSeverity,
  normalizeStatedVerdict,
  parseDefects,
  extractModelPin,
  buildReviewFiredPayload,
  renderComment,
  renderSkipComment,
  classifyReviewerFailure,
  isRetryable,
  isContextLengthError,
  DEFAULT_SENSITIVE_PATTERNS,
};
