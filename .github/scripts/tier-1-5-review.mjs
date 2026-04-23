#!/usr/bin/env node
/**
 * Tier 1.5 per-PR cross-model review runner.
 *
 * Runs inside the `tier-1-5-review.yml` workflow on PR merge. Fetches the
 * reviewing-prompt + lessons-index + atlas-summary from legara-marketing-v2,
 * assembles PR context, calls the pinned OpenAI model, posts findings as a
 * PR comment, and opens a Code-runnable issue for each Critical finding.
 *
 * Canonical spec: sys/prompts/P019-tier1-5-per-pr-cross-model-review.md
 * Reviewing prompt: sys/governance/tier-1-5-review-prompt.md (model pin lives there)
 *
 * Environment:
 *   CROSS_MODEL_REVIEW_API_KEY  OpenAI API key (repo secret)
 *   GITHUB_TOKEN                default token with pull-requests+issues write
 *   GITHUB_EVENT_PATH           path to GitHub Actions event payload
 *   GITHUB_REPOSITORY           "owner/repo"
 *   GOVERNANCE_REPO             "sdroger79/legara-marketing-v2" (default)
 *   GOVERNANCE_BRANCH           "main" (default)
 *   MAX_DIFF_LOC                100000 (default — skip PRs larger than this)
 *   TOKEN_BUDGET                45000 (default — conservative under 50k cap)
 */

import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const {
  CROSS_MODEL_REVIEW_API_KEY,
  GITHUB_TOKEN,
  GITHUB_EVENT_PATH,
  GITHUB_REPOSITORY,
  GOVERNANCE_REPO = 'sdroger79/legara-marketing-v2',
  GOVERNANCE_BRANCH = 'main',
  MAX_DIFF_LOC = '100000',
  TOKEN_BUDGET = '45000',
} = process.env;

const MAX_LOC = Number(MAX_DIFF_LOC);
const BUDGET = Number(TOKEN_BUDGET);

function fatal(msg) {
  console.error(`[tier-1-5-review] FATAL: ${msg}`);
  process.exit(1);
}

if (!CROSS_MODEL_REVIEW_API_KEY) fatal('CROSS_MODEL_REVIEW_API_KEY not set');
if (!GITHUB_TOKEN) fatal('GITHUB_TOKEN not set');
if (!GITHUB_EVENT_PATH) fatal('GITHUB_EVENT_PATH not set');
if (!GITHUB_REPOSITORY) fatal('GITHUB_REPOSITORY not set');

const event = JSON.parse(readFileSync(GITHUB_EVENT_PATH, 'utf8'));
const pr = event.pull_request;
if (!pr) fatal('event payload missing pull_request');
if (!pr.merged) {
  console.log('[tier-1-5-review] PR was closed without merge; skipping.');
  process.exit(0);
}

const prNumber = pr.number;
const baseSha = pr.base?.sha;
const mergeSha = pr.merge_commit_sha;
const prTitle = pr.title || '';
const prBody = pr.body || '';
const prAuthor = pr.user?.login || 'unknown';
const [owner, repo] = GITHUB_REPOSITORY.split('/');

const selfScopeFiles = /^\.github\/workflows\/tier-1-5-.*\.ya?ml$|^\.github\/scripts\/tier-1-5-review\.mjs$/;

// --- tiny token estimator (4 chars ≈ 1 token) ---
const estimateTokens = (s) => Math.ceil((s || '').length / 4);

// --- GitHub + HTTP helpers ---
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

async function fetchRaw(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`raw fetch ${url} → ${res.status}`);
  return res.text();
}

function sh(cmd, args) {
  return execFileSync(cmd, args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
}

// --- diff extraction ---
function computeDiff(baseSha, mergeSha) {
  sh('git', ['fetch', '--no-tags', '--depth=0', 'origin', baseSha, mergeSha].filter(Boolean));
  const filesTxt = sh('git', ['diff', '--name-only', `${baseSha}..${mergeSha}`]).trim();
  const files = filesTxt ? filesTxt.split('\n') : [];
  const diff = sh('git', ['diff', '--unified=3', `${baseSha}..${mergeSha}`]);
  return { files, diff };
}

function readTouchedFile(path) {
  try {
    return sh('git', ['show', `${mergeSha}:${path}`]);
  } catch {
    return null;
  }
}

// --- governance fetch ---
async function fetchGovernance() {
  const rawBase = `https://raw.githubusercontent.com/${GOVERNANCE_REPO}/${GOVERNANCE_BRANCH}`;
  const [prompt, lessonsRaw, atlasRaw] = await Promise.all([
    fetchRaw(`${rawBase}/sys/governance/tier-1-5-review-prompt.md`),
    fetchRaw(`${rawBase}/sys/governance/lessons-index.json`),
    fetchRaw(`${rawBase}/sys/governance/atlas-summary.json`),
  ]);
  return { prompt, lessons: JSON.parse(lessonsRaw), atlas: JSON.parse(atlasRaw) };
}

// --- model pin from prompt ---
function extractModelPin(prompt) {
  const m = prompt.match(/Pinned model:\*\*\s*`([^`]+)`/);
  if (!m) throw new Error('could not extract pinned model from review prompt');
  return m[1];
}

// --- context assembly with budget-aware truncation ---
function assembleUserMessage({ prompt, lessons, atlas, files, diff, fileContents, truncationNotes }) {
  const header = [
    `# PR metadata`,
    `Repository: ${GITHUB_REPOSITORY}`,
    `PR #${prNumber}: ${prTitle}`,
    `Author: ${prAuthor}`,
    `Base SHA: ${baseSha}`,
    `Merge SHA: ${mergeSha}`,
    `Files touched: ${files.length}`,
    ``,
    `## PR description`,
    prBody || '(none)',
    ``,
    `## Diff (base..merge_commit)`,
    '```diff',
    diff,
    '```',
    ``,
    `## Touched files — full contents (at merge SHA)`,
  ].join('\n');

  const fileBlocks = fileContents
    .map(({ path, content, truncated }) =>
      [
        `### ${path}${truncated ? ' (truncated)' : ''}`,
        '```',
        content,
        '```',
      ].join('\n')
    )
    .join('\n\n');

  const context = [
    `## Governance context`,
    `### Lessons index (${lessons.lesson_count} lessons)`,
    '```json',
    JSON.stringify(lessons, null, 2),
    '```',
    '',
    `### Atlas domain summary (${atlas.domain_count} domains)`,
    '```json',
    JSON.stringify(atlas, null, 2),
    '```',
  ].join('\n');

  const notes = truncationNotes.length
    ? `\n\n## Runner notes\n${truncationNotes.map((n) => `- ${n}`).join('\n')}`
    : '';

  return `${header}\n\n${fileBlocks}\n\n${context}${notes}`;
}

function budgetedContext({ prompt, lessons, atlas, files, diff }) {
  const truncationNotes = [];
  const systemTokens = estimateTokens(prompt);
  const diffTokens = estimateTokens(diff);
  const lessonsTokens = estimateTokens(JSON.stringify(lessons));
  const atlasTokens = estimateTokens(JSON.stringify(atlas));

  let fileContents = files.map((path) => {
    const content = readTouchedFile(path) ?? '(deleted in this PR)';
    return { path, content, truncated: false };
  });

  let total = systemTokens + diffTokens + lessonsTokens + atlasTokens +
    fileContents.reduce((n, f) => n + estimateTokens(f.content), 0);

  if (total > BUDGET) {
    const overshoot = total - BUDGET;
    truncationNotes.push(`context_truncated: total ~${total} tokens > budget ${BUDGET}`);
    let shaved = 0;
    fileContents = fileContents
      .sort((a, b) => estimateTokens(b.content) - estimateTokens(a.content))
      .map((f) => {
        if (shaved >= overshoot) return f;
        const currentTokens = estimateTokens(f.content);
        if (currentTokens < 500) return f;
        const keepChars = Math.max(2000, f.content.length - (overshoot - shaved) * 4);
        if (keepChars < f.content.length) {
          shaved += estimateTokens(f.content.slice(keepChars));
          return {
            path: f.path,
            content: f.content.slice(0, keepChars) + '\n\n... [truncated for token budget] ...\n',
            truncated: true,
          };
        }
        return f;
      });
  }

  return { fileContents, truncationNotes };
}

// --- OpenAI call ---
async function callReviewer({ model, systemPrompt, userMessage }) {
  const body = {
    model,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userMessage },
    ],
    response_format: { type: 'json_object' },
    max_completion_tokens: 6000,
  };

  const doCall = async () => {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${CROSS_MODEL_REVIEW_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });
    const text = await res.text();
    if (!res.ok) throw new Error(`OpenAI ${res.status}: ${text.slice(0, 800)}`);
    const json = JSON.parse(text);
    const content = json.choices?.[0]?.message?.content;
    if (!content) throw new Error('OpenAI response missing message content');
    return { content, usage: json.usage };
  };

  try {
    const { content, usage } = await doCall();
    return { parsed: JSON.parse(content), raw: content, usage };
  } catch (e) {
    console.error(`[tier-1-5-review] first attempt failed: ${e.message}; retrying once.`);
    const { content, usage } = await doCall();
    return { parsed: JSON.parse(content), raw: content, usage };
  }
}

// --- markdown rendering ---
const SEVERITY_ORDER = { Critical: 0, High: 1, Medium: 2, Low: 3 };
const SEVERITY_BADGE = {
  Critical: '🔴 Critical',
  High: '🟠 High',
  Medium: '🟡 Medium',
  Low: '⚪ Low',
};

function renderComment({ findings, reviewNotes, model, usage, truncationNotes }) {
  const sorted = [...findings].sort(
    (a, b) =>
      (SEVERITY_ORDER[a.severity] ?? 9) - (SEVERITY_ORDER[b.severity] ?? 9) ||
      (a.file || '').localeCompare(b.file || '')
  );

  const header = [
    `## 🤖 Tier 1.5 Cross-Model Review`,
    ``,
    `Reviewer: \`${model}\` — [canonical prompt](https://github.com/${GOVERNANCE_REPO}/blob/${GOVERNANCE_BRANCH}/sys/governance/tier-1-5-review-prompt.md)`,
    `Findings: **${findings.length}**${findings.length ? ` (${sorted.filter((f) => f.severity === 'Critical').length} Critical, ${sorted.filter((f) => f.severity === 'High').length} High, ${sorted.filter((f) => f.severity === 'Medium').length} Medium, ${sorted.filter((f) => f.severity === 'Low').length} Low)` : ''}`,
    usage
      ? `Tokens: ${usage.prompt_tokens} in / ${usage.completion_tokens} out / ${usage.total_tokens} total`
      : '',
    truncationNotes.length ? `Runner notes: ${truncationNotes.join('; ')}` : '',
  ]
    .filter(Boolean)
    .join('\n');

  if (!findings.length) {
    const body = [
      header,
      ``,
      `✅ No findings. Tier 2 (sprint closure) will re-examine at the next sprint boundary.`,
      reviewNotes ? `\n> ${reviewNotes}` : '',
    ].join('\n');
    return body;
  }

  const rows = sorted
    .map(
      (f, i) =>
        `### ${i + 1}. ${SEVERITY_BADGE[f.severity] || f.severity} — ${f.category || 'uncategorized'}\n\n` +
        `**File:** \`${f.file || '(unknown)'}\`${f.line ? `:${f.line}` : ''}\n\n` +
        `**Summary:** ${f.summary || '(no summary)'}\n\n` +
        `**Recommended fix:** ${f.recommended_fix || '(none provided)'}\n` +
        (f.governance_reference ? `\n**Governance:** ${f.governance_reference}\n` : '')
    )
    .join('\n\n---\n\n');

  return [
    header,
    ``,
    `> **Advisory only.** Tier 1.5 never blocks merges. Critical findings auto-open follow-up issues. High / Medium / Low roll up to Tier 2.`,
    ``,
    rows,
    reviewNotes ? `\n---\n\n> ${reviewNotes}` : '',
  ].join('\n');
}

// --- issue body per §7.1 ---
function renderCriticalIssueBody({ finding, model }) {
  return [
    `## Tier 1.5 Critical Finding: ${finding.summary?.slice(0, 100) || 'Unnamed'}`,
    ``,
    `### Context`,
    `Source PR: #${prNumber} (merge SHA: ${mergeSha})`,
    `Reviewer model: ${model}`,
    `Finding category: ${finding.category || 'uncategorized'}`,
    ``,
    `### Finding`,
    `File: \`${finding.file || '(unknown)'}\`${finding.line ? `:${finding.line}` : ''}`,
    `Severity rationale: ${finding.summary || '(none)'}`,
    `Governance reference (if applicable): ${finding.governance_reference || 'n/a'}`,
    ``,
    finding.summary || '',
    ``,
    `### Phase 0 — Verification (run first, no commits)`,
    `1. Confirm finding still applies against current main (may have been fixed in a subsequent PR).`,
    `2. Confirm the affected code hasn't been modified since the reviewing PR.`,
    `3. Classify: real issue | stale (code changed) | false positive (reviewer wrong).`,
    `4. If stale or false positive: close this issue with a comment explaining; do not proceed to Phase 1.`,
    `5. If real: proceed to Phase 1.`,
    ``,
    `### Phase 1 — Fix`,
    `Recommended fix (from reviewer):`,
    finding.recommended_fix || '(none provided — Phase 0 must produce a concrete plan before proceeding)',
    ``,
    `Implement per Atlas Dev Protocol. Branch: \`fix/tier-1-5-<issue-number>\` off main.`,
    ``,
    `### Phase 2 — Verify`,
    `- Run affected unit + integration tests.`,
    `- Confirm Tier 1 pattern scanners (CodeQL + Semgrep) pass locally.`,
    `- Commit + open PR with "Closes #<this-issue-number>" in description.`,
    `- Tier 1.5 re-review fires automatically on PR merge and will confirm the fix.`,
    ``,
    `### Acceptance`,
    `- [ ] Phase 0 classification inline in PR description.`,
    `- [ ] Fix implemented, tests green.`,
    `- [ ] PR closes this issue via "Closes #<N>" link.`,
    `- [ ] No equivalent Tier 1.5 finding recurs on the fix PR's merge.`,
    ``,
    `---`,
    ``,
    `**Dispatch to Code** with this trigger phrase:`,
    ``,
    '```',
    `Execute the fix for tier-1.5-critical issue #<this-issue-number> in repo ${GITHUB_REPOSITORY}.`,
    ``,
    `Start a clean session. Read the issue body — it contains Phase 0/1/2 instructions runnable as-is. You own every git action through PR merge + closes-issue link. Merge order: single PR, no cross-repo coordination.`,
    '```',
  ].join('\n');
}

// --- main ---
async function main() {
  console.log(`[tier-1-5-review] PR #${prNumber} merged ${baseSha}..${mergeSha}`);

  const { files, diff } = computeDiff(baseSha, mergeSha);
  console.log(`[tier-1-5-review] ${files.length} files touched; diff ${diff.length} chars`);

  if (!files.length) {
    console.log('[tier-1-5-review] empty diff; skipping review.');
    return;
  }

  if (files.every((f) => selfScopeFiles.test(f))) {
    console.log('[tier-1-5-review] self-scope-only PR; posting skip comment.');
    await gh(`/repos/${owner}/${repo}/issues/${prNumber}/comments`, {
      method: 'POST',
      body: JSON.stringify({
        body: `## 🤖 Tier 1.5 Cross-Model Review\n\nSkipped: PR only modifies the Tier 1.5 workflow itself (self-scope exclusion per canonical decision §10).`,
      }),
    });
    return;
  }

  const diffLoc = diff.split('\n').length;
  if (diffLoc > MAX_LOC) {
    console.log(`[tier-1-5-review] diff ${diffLoc} LOC > MAX_DIFF_LOC ${MAX_LOC}; posting skip comment.`);
    await gh(`/repos/${owner}/${repo}/issues/${prNumber}/comments`, {
      method: 'POST',
      body: JSON.stringify({
        body: `## 🤖 Tier 1.5 Cross-Model Review\n\nSkipped: diff ${diffLoc} LOC exceeds per-PR budget (${MAX_LOC}). Will be covered at sprint closure (Tier 2). — canonical decision §11.`,
      }),
    });
    return;
  }

  const governance = await fetchGovernance();
  const model = extractModelPin(governance.prompt);
  console.log(`[tier-1-5-review] pinned model: ${model}`);

  const { fileContents, truncationNotes } = budgetedContext({
    prompt: governance.prompt,
    lessons: governance.lessons,
    atlas: governance.atlas,
    files,
    diff,
  });

  const userMessage = assembleUserMessage({
    prompt: governance.prompt,
    lessons: governance.lessons,
    atlas: governance.atlas,
    files,
    diff,
    fileContents,
    truncationNotes,
  });

  const { parsed, usage } = await callReviewer({
    model,
    systemPrompt: governance.prompt,
    userMessage,
  });

  const findings = Array.isArray(parsed.findings) ? parsed.findings : [];
  const reviewNotes = parsed.review_notes || null;
  console.log(`[tier-1-5-review] ${findings.length} findings returned; usage=${JSON.stringify(usage)}`);

  const commentBody = renderComment({ findings, reviewNotes, model, usage, truncationNotes });
  await gh(`/repos/${owner}/${repo}/issues/${prNumber}/comments`, {
    method: 'POST',
    body: JSON.stringify({ body: commentBody }),
  });

  const criticals = findings.filter((f) => f.severity === 'Critical');
  for (const finding of criticals) {
    const title = `[Tier 1.5] Critical: ${finding.summary?.slice(0, 100) || 'Unnamed'} (PR #${prNumber})`;
    try {
      const issue = await gh(`/repos/${owner}/${repo}/issues`, {
        method: 'POST',
        body: JSON.stringify({
          title,
          body: renderCriticalIssueBody({ finding, model }),
          labels: ['tier-1.5-critical'],
        }),
      });
      console.log(`[tier-1-5-review] opened critical issue #${issue.number}: ${title}`);
    } catch (e) {
      console.error(`[tier-1-5-review] failed to open issue "${title}": ${e.message}`);
    }
  }

  console.log('[tier-1-5-review] done.');
}

main().catch((e) => {
  console.error(`[tier-1-5-review] ERROR: ${e.stack || e.message}`);
  process.exit(1);
});
