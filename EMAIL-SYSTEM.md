# Legara Email System

## Overview
All emails are sent directly by the Cloudflare Worker via Brevo's transactional API. There are NO Brevo automation workflows — the Worker controls all sending logic and timing.

Emails are organized into three sequences:
- **Sequence A** (Post-Calculator Nurture): 4 emails over 10 days, triggered by ROI calculator form submission
- **Sequence B** (Meeting Confirmation): 2 emails, triggered by Cal.com booking
- **Sequence C** (Long-Term Nurture): 8 emails over ~4 months, auto-starts after Sequence A completes

## How It Works

### Trigger: Form Submit → /api/brevo-webhook
1. Contact created/updated in Brevo (List 5)
2. Contact created in HubSpot (form submission)
3. **Seq-A1 sent immediately** via transactional API
4. Contact drip state set: SEQ=A, STEP=1, NEXT_SEND=now+3days

### Trigger: Meeting Booked → /api/meeting-booked
1. Contact moved to List 6, removed from Lists 5 & 7
2. HubSpot updated (lifecycle stage, note)
3. **Seq-B1 sent immediately** via transactional API
4. Contact drip state set: SEQ=B, STEP=1, NEXT_SEND=meeting-1day

### Trigger: Cron (every hour)
1. Queries all contacts on Lists 5, 6, 7
2. For each contact where NEXT_SEND <= now, sends the next email in their sequence
3. Advances the step counter and calculates the next send date
4. When a sequence completes, transitions to the next (A→C) or marks DONE

## Key Files

| File | Purpose |
|------|---------|
| `src/worker.js` | All email logic — sequence config, send handlers, cron processor |
| `wrangler.jsonc` | Cron trigger config (currently every hour) |
| `brevo-setup/build_brevo_automations.py` | Template creation/rebuild script |
| `EMAIL-SYSTEM.md` | This file |

## How to Change Email Copy

Edit the template content via Brevo API. Changes take effect on the **next send** — no restart needed.

### Get current template:
```bash
curl -s -H "api-key: BREVO_API_KEY" \
  "https://api.brevo.com/v3/smtp/templates/{TEMPLATE_ID}" | jq -r '.htmlContent'
```

### Update template:
```bash
curl -X PUT -H "api-key: BREVO_API_KEY" \
  -H "Content-Type: application/json" \
  "https://api.brevo.com/v3/smtp/templates/{TEMPLATE_ID}" \
  -d '{"htmlContent": "<new HTML>", "subject": "New subject line"}'
```

### Rebuild all templates from scratch:
```bash
python3 brevo-setup/build_brevo_automations.py
```
Note: this creates NEW templates with new IDs. Update the SEQUENCES config in worker.js if IDs change.

## How to Change Email Timing

Edit the `SEQUENCES` config in `src/worker.js`. The `delays` array controls days between emails.
```js
A: {
  templateIds: [1, 2, 3, 4],
  delays: [0, 3, 4, 3],  // A1: immediate, A2: +3d, A3: +4d (day 7), A4: +3d (day 10)
}
```

Commit and push to main — auto-deploys via GitHub Actions.

## How to Add a New Email to a Sequence

1. **Create the template:**
```bash
curl -X POST -H "api-key: BREVO_API_KEY" \
  -H "Content-Type: application/json" \
  "https://api.brevo.com/v3/smtp/templates" \
  -d '{
    "templateName": "Seq-A5: New email name",
    "subject": "New subject line",
    "htmlContent": "<full HTML>",
    "sender": {"name": "Roger Stellers", "email": "roger@golegara.com"},
    "replyTo": "roger@golegara.com",
    "isActive": true
  }'
```
2. Note the returned template ID
3. Add the ID to the `templateIds` array in the SEQUENCES config
4. Add the delay to the `delays` array
5. Commit and push

## How to Remove an Email from a Sequence

1. Remove the template ID from `templateIds` and the corresponding delay from `delays` in SEQUENCES
2. Commit and push
3. Optionally delete or deactivate the template via API

## How to Create a New Sequence

1. Create templates via API (as above)
2. Add a new entry to the SEQUENCES config in worker.js
3. Add trigger logic in the appropriate handler (new webhook endpoint or modify existing)
4. Commit and push

## How to Change the Cron Frequency

Edit `triggers.crons` in `wrangler.jsonc`:
- `"0 * * * *"` = every hour (current)
- `"*/30 * * * *"` = every 30 minutes
- `"0 */6 * * *"` = every 6 hours

Commit and push.

## Template Variable Reference

All templates use `{{params.VARNAME}}` syntax (populated at send time by the Worker):

| Variable | Source | Used In |
|----------|--------|---------|
| `{{params.FIRSTNAME}}` | Form first name field | All sequences |
| `{{params.LASTNAME}}` | Form last name field | All sequences |
| `{{params.COMPANY}}` | Form organization field | All sequences |
| `{{params.MEETING_DATE}}` | Cal.com booking date | Sequence B only |
| `{{params.MEETING_TIME}}` | Cal.com booking time | Sequence B only |

## Brevo Contact Attributes (Drip State)

| Attribute | Type | Purpose |
|-----------|------|---------|
| SEQ | text | Current sequence: "A", "B", "C", or "DONE" |
| SEQ_STEP | number | Current step index (0-based) |
| NEXT_SEND | text | ISO 8601 datetime of next scheduled email |
| FIRSTNAME | text | Contact's first name |
| LASTNAME | text | Contact's last name |
| COMPANY | text | Organization name |
| MEETING_DATE | text | Formatted meeting date |
| MEETING_TIME | text | Formatted meeting time |

## Sequence Reference

### Sequence A — Post-Calculator Nurture
| Step | Template ID | Subject | Delay |
|------|-------------|---------|-------|
| A1 | 1 | The numbers you just ran — and the one variable we didn't show you | Immediate |
| A2 | 2 | 82% utilization — and why your team can't (and shouldn't) match it | +3 days |
| A3 | 3 | 9 FQHCs. 50,000 encounters a year. Here's what we've learned. | +4 days (day 7) |
| A4 | 4 | No rush — just wanted you to know | +3 days (day 10) |

### Sequence B — Meeting Confirmation
| Step | Template ID | Subject | Delay |
|------|-------------|---------|-------|
| B1 | 5 | Confirmed — looking forward to our conversation | Immediate |
| B2 | 6 | Tomorrow — quick reminder re: our conversation | Meeting - 1 day |

### Sequence C — Long-Term Nurture
| Step | Template ID | Subject | Delay |
|------|-------------|---------|-------|
| C1 | 7 | The hiring treadmill (and why it never stops) | Immediate on transition from A |
| C2 | 8 | What your CFO needs to hear about behavioral health costs | +14 days |
| C3 | 9 | What patients experience during the gap | +14 days |
| C4 | 10 | Two half-time providers beat one full-time (here's why) | +14 days |
| C5 | 11 | The compliance question nobody asks (until it's too late) | +14 days |
| C6 | 12 | What I'm hearing from FQHC leaders right now | +14 days |
| C7 | 13 | Do you know your cost per completed BH encounter? | +14 days |
| C8 | 14 | Still here when the timing is right | +14 days |

## Email Sender Config
- **From name:** Roger Stellers
- **From email:** roger@golegara.com
- **Reply-to:** roger@golegara.com
- **All calendar CTAs link to:** https://cal.com/roger-golegara.com/legara-roi-review

## Troubleshooting

### Email not sending on form submit?
Check Worker logs: `wrangler tail` — look for "Transactional send template" log lines

### Drip emails not advancing?
Check that the cron trigger is running: `wrangler tail` — look for "Cron: checking for scheduled emails"
Verify contact attributes in Brevo: `curl -s -H "api-key: ..." "https://api.brevo.com/v3/contacts/{email}" | jq '.attributes'`

### Template changes not taking effect?
They should take effect immediately on the next send (no restart needed). Verify the template was actually updated: `curl -s -H "api-key: ..." "https://api.brevo.com/v3/smtp/templates/{ID}" | jq '.htmlContent'`
