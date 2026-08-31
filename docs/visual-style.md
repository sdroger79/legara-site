# golegara.com visual style (binding)

Copy/positioning is a separate operating brief. This file is the look. New pages match existing chrome. Do not invent a second design system.

## Tokens (`css/styles.css` `:root`)

- `--green` `#1a6b4a` — in-content links, labels, primary buttons
- `--green-mid` `#2d8a62` — link hover
- `--green-light` `#e8f5ee` / `--green-pale` `#f4faf7` — fills / card hover
- `--charcoal` `#1c2b24` — headings
- `--slate` `#4a5e54` — body
- `--mist` `#8fa89e` — small caps / table headers
- `--border` `#dce8e2` / `--accent` `#c8e6d4` / `--off-white` `#fafcfb` / `--white` `#ffffff`

Never ship browser-default blue. Never add a second brand green.

## Type

Headlines: Playfair Display, charcoal (`.section-headline`). Labels: `.section-label` (small uppercase green). Body: DM Sans, slate (`.section-body`). No new webfonts. No em dashes in public copy.

## Links

In-content (`.content-section a`, `.section-body a`, `.page-header a`, `.pillar h3 a`): color `var(--green)`; font-size inherit; font-weight 600; no UA underline; optional 1px `--accent` hairline; hover `--green-mid` or charcoal. `.pillar h3 a` keeps pillar h3 size (not 14px).

Do not restyle: nav, footer, `.btn-primary`, `.btn-outline-white`, `.nav-cta`, `.cta-band` button rows, login dropdown.

Never raw UA links, never `style="color:blue"`, never `<u>`.

## Components to reuse

Existing nav/footer/page-header/content-section/cta-band. Nav items: How It Works, For Health Centers, Our Impact, About, Log in, Benchmark Your FQHC. No extra product dropdown. SEO/intercept URLs are not a showcase nav. Cards: `.pillars` / `.pillar`. Tables: `.compare-table`. Quotes: `.testimonial-card`. CTAs: `.btn-primary` / `.btn-outline-white`. Copy: See / Schedule / Pick a time.

## Homepage truce

Do not rewrite homepage H1. Do not change homepage PSR 3-4 / 3-to-1. New cluster copy may use 4:1.

## Checklist

Uses tokens and existing classes; in-content links green; no new header items for SEO pages; buttons use existing CTA classes.
