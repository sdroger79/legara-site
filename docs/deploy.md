# legara-site CI: Deploy Workflow and Gap Inventory

This site has minimal CI by design as of 2026-04-11. There is exactly one GitHub Actions workflow (the Cloudflare Workers deploy) and one local pre-deploy script (`sweep.sh`). There are no repo-side lint, test, smoke, link-check, contract validation, or security scan workflows. This doc documents what runs, what does not, and where the explicit gaps are for future remediation.

## What runs

### `.github/workflows/deploy.yml`: Deploy to Cloudflare Workers

**Purpose.** Build and deploy `src/worker.js` + static assets to Cloudflare Workers under the `golegara.com` domain. Single workflow, single job, single trigger.

**Triggers.**

```yaml
on:
  push:
    branches:
      - main
```

Push to `main` only. No `workflow_dispatch`, no PR trigger, no scheduled run. Every merge to main deploys.

**Job topology.** Single job, `deploy`, on `ubuntu-latest`. Two steps total:

| # | Step | What it does | Failure means |
|---|---|---|---|
| 1 | `actions/checkout@v4` | Clone the repo. | Token / permissions. Rare. |
| 2 | `cloudflare/wrangler-action@v3` with `wranglerVersion: "3.99.0"` and `apiToken: ${{ secrets.CLOUDFLARE_API_TOKEN }}` | Installs wrangler 3.99.0 internally, runs `wrangler deploy` against the repo's `wrangler.jsonc`. Publishes `src/worker.js` and the static asset directory (repo root) to the Cloudflare Workers environment for `golegara.com`. | Auth token expired, Workers quota hit, invalid `wrangler.jsonc`, build failure inside wrangler. See **Failure modes** below. |

There is no Setup Node step, no `npm ci`, no build step, no post-deploy health check. `wrangler-action@v3` handles the full publish internally. The entire `deploy.yml` is 17 lines.

**Secrets consumed.**

| Secret | Purpose |
|---|---|
| `CLOUDFLARE_API_TOKEN` | Authenticates `wrangler deploy` against the Cloudflare API |

Only one secret. Notably, `CLOUDFLARE_ACCOUNT_ID` is NOT read from GitHub secrets: wrangler infers it from `wrangler.jsonc` or the token's scope. If a rotation forces an account ID change, update `wrangler.jsonc`, not the secret set.

**Failure modes.**

- **Wrangler authentication failure.** `CLOUDFLARE_API_TOKEN` is expired, rotated, or missing. Run `gh secret list --repo sdroger79/legara-site` to verify presence. If present but failing, rotate the token in the Cloudflare dashboard and re-set via `gh secret set`.
- **`wrangler.jsonc` config error.** A syntax error or a field wrangler doesn't recognize. Read the wrangler step output; the error message is usually precise. Common case: someone added a `routes` or `custom_domains` block with a typo. Fix the config, commit, push.
- **Workers quota or rate limit.** Cloudflare Free / Paid plans have per-account request caps on the deploy API. On exhaustion, wrangler fails with a 429. Wait and retry via `gh workflow run deploy.yml` or push an empty commit.
- **Asset path missing.** `wrangler.jsonc` declares `assets.directory: "."` meaning the whole repo root is treated as static assets. If a file the site links to is not committed, the deploy still succeeds but the live URL 404s that file. No CI catches this today.
- **Content regression.** The workflow cannot detect broken HTML, broken links, visual regressions, stale content, or typos. These ship straight to prod. See the `sweep.sh` section below for the one mitigation that exists.

**Rollback.** Cloudflare Workers keeps prior versions. Two paths:

1. **`wrangler rollback`** from a local checkout: `npx wrangler rollback --message "reverting <bad sha>"`. Picks the previous version and makes it active immediately.
2. **Cloudflare dashboard**: navigate to the Worker, open the Versions tab, click "Activate" on the previous version. Same effect, point-and-click.

There is no git-revert-and-redeploy gate. Reverting in git causes the next push to main to ship the reverted content automatically, but in the meantime the bad version is live. Use `wrangler rollback` first, then open a revert PR to keep git and Cloudflare in sync.

## What also runs (local, not CI)

### `sweep.sh`: pre-deploy content lint (manual)

Not a CI workflow. `sweep.sh` is a 127-line bash script at the repo root that the developer is expected to run manually before every push per `CLAUDE.md`:

> Run `./sweep.sh` from the `legara-site/` directory before every push.

**What it checks:**

| Check | Severity | What it catches |
|---|---|---|
| Em dashes in Roger-attributed content | Error | Em dashes in `src/worker.js` email strings, `pdf-generator.js`. Violates the brand rule that Roger-attributed content has zero em dashes. |
| Standalone "BH" abbreviation | Error | "BH" used instead of "behavioral health" in prospect-facing files. Brand rule: the term is always spelled out. |
| Wrong Brevo variables | Error | `{{contact.*}}` instead of `{{params.*}}` in email templates. Brevo transactional API uses `params`; `contact` is automation-only and silently fails in the transactional path. |
| "Co-Founder" title | Error | Roger's title is "CEO" only. "Co-Founder" anywhere is a brand violation. |
| AI filler phrases | Warning | "I hope this email finds you," "I'd be happy to," etc. Marks content that reads as AI-generated. |
| "Savings" or "mission cash" in headlines | Warning | Brand rule: cash-to-serve-mission framing, not savings framing. |
| TODO/FIXME/HACK comments | Warning | Stale dev comments in prospect-facing files. |

**How it enforces:** exit 1 on any error (count > 0 for Error-severity checks), exit 0 with warnings on Warning-severity findings. Manually invoked. no git hook forces it to run.

**Why it is not a CI gate.** `sweep.sh` lives in the repo but is not wired to any GitHub Actions workflow. Pushing without running it locally is possible and does not fail the deploy. The discipline relies on `CLAUDE.md` telling the operator to run it.

**Converting it to a gate.** The cheapest way to move sweep.sh from "local discipline" to "enforced gate" is a new `.github/workflows/content-sweep.yml` that runs `bash sweep.sh` on PRs and push-to-main. This is the #1 priority item in the gap list below.

## What does NOT run

The explicit gap list. Each item is intentional-for-now or pending a follow-up prompt.

### No repo-side content linting in CI

- **`sweep.sh` runs only locally.** See above. The rules exist but are not CI-enforced. A careless push can violate any of the 7 checks and still deploy.
- **No alternate content linter** (Vale, markdownlint, custom regex scanner) runs in CI either.

### No link checker

- **Broken internal links** (a `<a href="/page-that-doesnt-exist">`) are not detected before deploy. A typo in a href ships straight to prod.
- **Broken external links** (a cited partner URL that 404s) are not detected either. Common as partner sites restructure.
- **No `lychee-action` or equivalent** is wired.

### No test suite

- **No unit tests** for `src/worker.js` logic (webhook handlers, email sequence math, HubSpot/Brevo API wrappers).
- **No integration tests** hitting a local wrangler dev server.
- **No package.json** exists at the repo root. The worker's `.js` files are plain JavaScript with no transpile step. Adding tests would require introducing a package manager (npm or pnpm), a test runner (vitest or node test), and a test harness for wrangler's fetch API.

### No smoke test post-deploy

- **No gate visits `https://golegara.com`** after a deploy to verify the home page renders.
- **No `/api/brevo-webhook` or `/api/meeting-booked` endpoint smoke check** to confirm the webhook routes still respond.
- **No HubSpot or Brevo integration smoke** to catch credential drift or API rate-limit issues that only surface at runtime.

### No security scan

- **No CodeQL workflow.** Vulnerable patterns in the Worker code are not flagged.
- **No Dependabot automation workflow.** Wrangler itself may publish dependency updates, but no GitHub Actions workflow surfaces them on PRs.
- **No secret leak scanner.** A stray `CLOUDFLARE_API_TOKEN` literal in source would not be caught by CI (only by the pre-push `sweep.sh` if the regex happened to match, which it does not today).

### No accessibility or performance gate

- **No Lighthouse CI / Pa11y / axe** run against any route. A landing page with missing alt tags, unlabeled form controls, or contrast failures ships unchanged.
- **No Core Web Vitals budget.** A 10 MB hero image shipped in place of a 100 KB one would not be caught.
- **No bundle-size gate** on `src/worker.js` itself.

### No SEO / metadata gate

- **Title length, `og:` tags, structured data, canonical URLs** are not validated per-route.
- **Sitemap and `robots.txt`** are committed files; no CI verifies they are in sync with the actual set of pages.

### No pre-commit hooks

- **No `.husky/`, no `.pre-commit-config.yaml`, no `lefthook.yml`.** Local commits go straight to GitHub with no client-side enforcement.
- The only pre-push discipline is the manual `./sweep.sh` invocation per `CLAUDE.md`.

### No staging environment

- **No `staging.golegara.com` or equivalent** intermediate deploy. Push to main goes straight to production.
- **No Preview deploys per PR.** Wrangler supports preview environments via `wrangler versions upload` + `wrangler versions deploy`, but this repo does not use them.
- **Content typos, broken links, visual regressions** are caught only after they are live. Rollback via `wrangler rollback` or dashboard is the only mitigation.

## Why the gaps exist

The site is currently small enough (~30 static HTML files + one Worker) and changes infrequently enough that the deploy-and-watch workflow is acceptable. The cost of a broken deploy today is visible within minutes and recoverable via `wrangler rollback` in under a minute. As the site grows or the cost of regressions rises, the gaps below should be closed in priority order.

## Priority list for closing gaps

When time and scope allow, the gaps should be closed roughly in this order:

1. **Wire `sweep.sh` as a CI gate.** 1-file workflow addition (`.github/workflows/content-sweep.yml`). Runs `bash sweep.sh` on PR and push-to-main. Moves the existing discipline from "manual" to "enforced." Cheapest gate to add because the rules and script already exist. High value, zero false positive rate.
2. **Link checker.** Add `lychee-action` or similar against built HTML. Catches dead links before they ship. Also cheap, also high value.
3. **Content style / brand voice scan.** Port additional rules from the marketing OS `output-scan` skill (exclusion list, AI tells, headline rules) into the existing `sweep.sh` or a sibling script. Keeps everything in one place.
4. **Preview / staging environment.** Use `wrangler versions upload` for PR-scoped preview URLs, post the URL in the PR comment for visual review before merging to main.
5. **Lighthouse CI / a11y.** Gate per-route a11y and Core Web Vitals on a curated set of landing pages.
6. **Dependabot automation workflow + CodeQL.** Security baseline. Low-effort, moderate value.
7. **Image optimization gate.** Fail builds if images over a threshold size are committed without compression.
8. **Worker unit tests.** Introduce a test runner + harness for `src/worker.js` logic. Biggest refactor in the list because it requires a package manager. Defer unless the Worker grows complex enough to need it.

Each item above maps to a follow-up prompt in the Cowork workspace at `sys/prompts/gate-followup-prompts-index.md`. None are blocking today.

## Cross-repo context

This site has no gate dependencies on `sdroger79/meridian` or `sdroger79/legara-portals`. It is a fully independent deployment surface: its Worker does not call the Meridian API, does not consume `@legara/api-contracts`, and does not share code with either of the other repos. Changes in the other two repos cannot break this site's CI, and vice versa.

The other two repos' gate documentation lives at:

- `sdroger79/meridian/docs/gates/`: 4 workflows + 1 embedded contract gate, full remediation reference
- `sdroger79/legara-portals/docs/gates/`: 5 workflows, 1 effectively-ENFORCE test workflow, 3 REPORT gates

If a gap in this site ever forces a cross-repo dependency (e.g., this site needs to consume a schema from `@legara/api-contracts`), the contract gate docs in portals and meridian become load-bearing for site CI too.

## When this doc needs updating

Update this doc whenever:

- A new workflow is added to `.github/workflows/`
- A pre-commit hook is added (`.husky/`, `lefthook.yml`, etc.)
- A staging or preview environment is set up
- Any item from the priority list above ships
- The deploy target changes (off Cloudflare Workers, different wrangler version, different account)
- `sweep.sh` grows a new check or changes its exit behavior
- A package manager is introduced to the repo root (no `package.json` today)
