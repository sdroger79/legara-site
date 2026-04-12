# Staging Environment Setup

The staging environment deploys a preview copy of the legara-site Worker to a separate URL. It uses its own KV namespace and D1 database so test data never touches production.

## URLs

| Environment | URL | Deploys on |
|---|---|---|
| **Production** | https://golegara.com | push to `main` |
| **Staging** | https://staging.golegara.com | pull request to `main` |
| **Staging (workers.dev fallback)** | https://legara-site-staging.\<account\>.workers.dev | same |

The `staging.golegara.com` URL requires a DNS record (see below). The workers.dev URL works immediately without DNS.

## One-Time Setup (Roger)

### 1. Create staging KV namespace

```bash
npx wrangler kv namespace create TEAM_DATA --env staging
```

Copy the `id` from the output and paste it into `wrangler.jsonc` under `env.staging.kv_namespaces[0].id`.

### 2. Create staging D1 database

```bash
npx wrangler d1 create legara-tracking-staging
```

Copy the `database_id` from the output and paste it into `wrangler.jsonc` under `env.staging.d1_databases[0].database_id`.

### 3. Apply the D1 schema

If the tracking database has a schema (check `src/` for any `.sql` migration files):

```bash
npx wrangler d1 execute legara-tracking-staging --file=<schema-file>.sql
```

### 4. Set up DNS (optional — workers.dev works without this)

In the Cloudflare dashboard for golegara.com:

1. Go to **DNS** > **Records**
2. Add a **CNAME** record:
   - **Name:** `staging`
   - **Target:** `legara-site-staging.<account>.workers.dev`
   - **Proxy status:** Proxied (orange cloud)
   - **TTL:** Auto

After DNS propagates (usually < 1 minute with Cloudflare proxy), `staging.golegara.com` will route to the staging Worker.

If you skip this step, use the workers.dev URL instead. The `route` config in `wrangler.jsonc` will produce a warning on deploy but still works via workers.dev.

### 5. Set secrets for staging

The staging Worker needs the same secrets as production. Set them for the staging environment:

```bash
npx wrangler secret put BREVO_API_KEY --env staging
npx wrangler secret put HUBSPOT_TOKEN --env staging
npx wrangler secret put GA4_MP_SECRET --env staging
npx wrangler secret put TURNSTILE_SECRET --env staging
npx wrangler secret put ADMIN_KEY --env staging
```

You can use the same values as production, or different test keys if you have them.

## Manual Deploy

To deploy to staging from your local machine:

```bash
npx wrangler deploy --env staging
```

To deploy to staging in dry-run mode (validates config without deploying):

```bash
npx wrangler deploy --env staging --dry-run
```

## How the PR Workflow Works

1. You open a PR against `main`
2. `.github/workflows/deploy-staging.yml` triggers
3. The Worker is deployed to the staging environment
4. A comment is posted on the PR with the staging URL
5. You review the site at the staging URL
6. When the PR is merged, `.github/workflows/deploy.yml` deploys to production

Each subsequent push to the PR branch updates the staging deploy and edits the existing PR comment (no comment spam).

## Cleanup

The staging Worker persists between PRs. It always shows the last PR's code. This is fine — it's a preview environment, not a long-lived service. If you want to tear it down:

```bash
npx wrangler delete --env staging
```
