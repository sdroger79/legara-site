# legara-site — Technical Project Instructions

> This file covers the Cloudflare Worker, website, and email system. For business context, voice, and session rhythm, see the parent project CLAUDE.md.

---

## Architecture

- **Runtime:** Cloudflare Workers (single Worker: `src/worker.js`)
- **Static assets:** Served from root directory alongside Worker
- **Config:** `wrangler.jsonc` — main: src/worker.js, assets.directory: .
- **Cron:** `0 * * * *` (hourly) triggers: syncHubSpotSequenceChanges → processScheduledEmails → recalculateDealRevenue
- **Domain:** golegara.com
- **GA4:** G-GC0KH378ZK

## Deployment

- **Push to `main` auto-deploys to prod** via GitHub Actions + wrangler (`deploy.yml`)
- **PRs against `main` auto-deploy to staging** via `deploy-staging.yml` → staging URL posted as PR comment
- Staging URL: `staging.golegara.com` (or workers.dev fallback if DNS CNAME not set)
- Always commit and push to deploy — do NOT run `npx wrangler deploy` directly
- GitHub repo: sdroger79/legara-site

### When to use staging vs direct-to-main

| Route to staging (feature branch → PR) | Push to main directly |
|-----------------------------------------|-----------------------|
| New Worker routes or cron triggers | Copy/content text edits |
| wrangler.jsonc config changes | CSS/styling tweaks |
| New or modified API endpoints | Static asset updates |
| Dependency updates | Emergency hotfixes (`hotfix:` prefix) |
| Email template logic changes | |
| New KV/D1 bindings | |

## Pre-Deploy Checklist

**Run `./sweep.sh` from the `legara-site/` directory before every push.**

The sweep checks for:
| Check | Severity | What it catches |
|-------|----------|-----------------|
| Em dashes in Roger-attributed content | Error | Em dashes in worker.js emails, pdf-generator.js |
| Standalone "BH" abbreviation | Error | "BH" instead of "behavioral health" in prospect-facing files |
| Wrong Brevo variables | Error | `{{contact.*}}` instead of `{{params.*}}` |
| "Co-Founder" title | Error | Roger's title should be "CEO" only |
| AI filler phrases | Warning | "I hope this email finds you," "I'd be happy to," etc. |
| "Savings" or "mission cash" in headlines | Warning | Should be "cash generated to serve your mission" |
| TODO/FIXME/HACK comments | Warning | Stale dev comments in prospect-facing files |

## Secrets (already set in Cloudflare)

`BREVO_API_KEY`, `HUBSPOT_TOKEN`, `GA4_MP_SECRET`, `TURNSTILE_SECRET`, `ADMIN_KEY`

Do NOT hardcode secrets in code. Access via `env.SECRET_NAME` in the Worker.

## Email System

All emails are sent by the Worker via Brevo's transactional API. There are NO Brevo automation workflows. See `EMAIL-SYSTEM.md` for full documentation.

**Three sequences:**
- **A** (Post-Calculator Nurture): 4 emails over 10 days, triggered by ROI calculator form
- **B** (Meeting Confirmation): 2 emails, triggered by Cal.com booking
- **C** (Long-Term Nurture): 8 emails over ~4 months, auto-starts after A completes

**Key rule:** Sequence timing and transitions are in `SEQUENCES` config in worker.js. Template content is in Brevo (editable via API without restarting).

## Webhook Endpoints

| Endpoint | Trigger | Does |
|----------|---------|------|
| `/api/brevo-webhook` | Calculator form submit | Brevo contact (List 5) + HubSpot + Seq-A1 + lead alert |
| `/api/meeting-booked` | Cal.com booking | Move to List 6 + HubSpot deal + Seq-B1 + GA4 event |
| `/api/brevo-events` | Brevo engagement | Logs opens/clicks/bounces as HubSpot notes |
| `/api/email-report` | PDF download | Emails personalized ROI PDF |
| `/api/admin/enroll` | Admin tool | Enrolls/removes contacts from sequences |
| `/api/admin/contact-status` | Admin tool | Returns contact's sequence state |

## Brand Rules in Code

- **Em dashes:** Zero in worker.js email strings and pdf-generator.js. These are Roger-attributed content.
- **Brevo variables:** Always `{{params.VARNAME}}`, never `{{contact.VARNAME}}`
- **Roger's title:** "CEO" only. Never "Co-Founder."
- **"Behavioral health"** spelled out. Never "BH" in any prospect-facing string.
- **No rate-specific language** ($155/$165) in email templates — rates can change.

## Spam Protection

All public forms MUST include Turnstile widget + honeypot field.
- Turnstile Site Key: `0x4AAAAAAACrW0wLzmWlGZuLt`
- Honeypot: `name="website"`, positioned offscreen, `tabindex="-1"`, `autocomplete="off"`. Do NOT use `display:none`.

## HubSpot API Requirements

When creating contacts/companies/deals via API:
- Always set `hubspot_owner_id` (unowned records are invisible in "My" views)
- Always set `hs_lead_status` on contacts
- Always specify `pipeline` + `dealstage` on deals
- Always associate deals with both contact AND company

**Roger's owner ID:** 82444599 | **Jonathon's owner ID:** 163258736
**Legara Pipeline ID:** 2119437028
