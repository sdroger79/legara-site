# legara-site CI (v1)

Landed by 9f-ci-greenfield on 2026-04-15. Two gates. Inventory-driven
(see `docs/deploy.md` for the gap analysis that preceded this PR).

## Gates

### 1. Content Sweep — `content-sweep.yml` (ENFORCE)

- **What it runs:** `bash sweep.sh`
- **What it catches:** em dashes in Roger-attributed content, standalone
  "BH" abbreviation, wrong Brevo template variables (`{{contact.*}}` vs
  `{{params.*}}`), "Co-Founder" title (should be "CEO"), AI-filler
  phrases, savings-framed headlines, TODO/FIXME/HACK comments.
- **Mode:** **ENFORCE from day 1.** `sweep.sh` already exits 1 on any
  error-severity finding — this gate is visibility work, not
  calibration work. The rules are already enforced locally per
  `CLAUDE.md`; CI is the safety net when the local run is skipped.
- **Runtime:** ~0.3s.
- **Failure UX:** the gate prints a color-tagged line per check + a
  final list of offending files. Fix locally, `git add`, amend or new
  commit.

### 2. Link Check — `link-check.yml` (REPORT → ENFORCE on 2026-04-22)

- **What it runs:** `lycheeverse/lychee-action@v2` against every
  top-level `*.html` + `lp/**/*.html`.
- **What it catches:** dead internal links (`<a href="/deleted-page">`),
  dead external links (partner URLs that 404), broken `<img src="...">`.
- **Mode:** **REPORT** until the observation window closes on
  **2026-04-22**. `continue-on-error: true` at the step level +
  `fail: false` on the lychee action. Findings land in the
  `link-check-report` artifact, not as a red CI check.
- **Rationale for the window:** marketing sites have legitimate
  external-link flakiness (partner site restructures, CDN blips). We
  need one week of real-world noise before flipping; a false-positive-
  heavy gate that fails merges will get disabled and not revisited.
- **Enforce flip plan:** on 2026-04-22, follow-up **9f-enforce-flip**
  removes `continue-on-error` + flips `fail: true`. If the report
  artifact shows patterns that need suppressing (e.g., a pattern of
  429s from one partner's rate-limit), the flip adds an
  `--exclude-path` or retry config before enforcing.

## Gates deliberately NOT in v1

Each was in `docs/deploy.md`'s priority list; each is deferred to its
own follow-up prompt:

- **Content style v2** (inventory #3): extend sweep.sh with more rules.
- **Preview / staging env** (inventory #4): wrangler versions
  + preview URL in PR comment.
- **Lighthouse CI / a11y** (inventory #5): axe-core or Pa11y against
  a curated landing-page set.
- **Dependabot + CodeQL** (inventory #6): security baseline.
- **Image optimization** (inventory #7): block >threshold image
  commits.
- **Worker unit tests** (inventory #8): requires introducing
  `package.json`, vitest or node:test, and a wrangler test harness.
  Deferred until Worker complexity justifies the lift.

## No Node pin (yet)

legara-site has no `package.json` at repo root today. Neither v1 gate
needs repo-side Node (`lychee-action` is self-contained; `sweep.sh`
is bash). Adding `.nvmrc` + `engines.node` without a package manager
would be ceremony without enforcement. Revisit via
**9g-legara-site-hygiene** when the repo needs Node for some other
reason (first unit test, first build step, etc.).

## How to read a failure

- **content-sweep RED:** sweep.sh found a brand-rule violation. The
  filename + line is printed in the gate output. Fix locally and
  re-push. Bypass: none from CI (the local `./sweep.sh` is the canary
  you should have run before pushing).
- **link-check RED (post-2026-04-22):** one or more links failed. The
  artifact `link-check-report.md` lists each with source file + target
  URL + HTTP status. For persistent external 404s, add an
  `--exclude` to the workflow. For internal 404s, fix the `href` or
  restore the linked page.

## Observation window calendar

| Gate | REPORT since | ENFORCE flip | Follow-up |
|---|---|---|---|
| content-sweep | — | (already ENFORCE) | — |
| link-check | 2026-04-15 | 2026-04-22 | 9f-enforce-flip |

## Cross-repo context

legara-site has no gate dependencies on meridian or legara-portals.
Its Worker does not consume `@legara/api-contracts` and does not
share code with the other repos. See `docs/deploy.md` for the deploy
boundary.
