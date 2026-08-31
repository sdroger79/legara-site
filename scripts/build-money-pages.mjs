/**
 * One-shot generator for the signed-off FQHC money-page cluster.
 * Run: node scripts/build-money-pages.mjs
 */
import fs from "fs";

const ORG =
  "Legara is a behavioral health workforce platform built exclusively for FQHCs, combining independent licensed clinicians with dedicated operational infrastructure and per-encounter economics.";

const MATTSON =
  "Our working relationship with Legara is overwhelmingly positive. The values and professionalism of Legara's staff, providers, and leadership are aligned with our corporate culture and expectations. Legara allows us to increase access to care while improving outcomes for our patients.";

const BAYNARD =
  "When our psychiatry encounter volume dipped, we had zero salary burden for unused capacity. When we needed additional on-site support, Legara worked with us to find a solution that fit our operations. That is not a typical vendor response. That is a partner who does whatever it takes to make it work for our patients.";

function head({ title, meta, canonical, ogTitle, ogDesc }) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<script async src="https://www.googletagmanager.com/gtag/js?id=G-GC0KH378ZK"></script>
<script>
  window.dataLayer = window.dataLayer || [];
  function gtag(){dataLayer.push(arguments);}
  gtag('js', new Date());
</script>
<script src="/js/utm.js"></script>
<script>
var utm = typeof getUtmParams === 'function' ? getUtmParams() : {};
if (utm.utm_source) {
  gtag('set', {
    'campaign_source': utm.utm_source,
    'campaign_medium': utm.utm_medium || '',
    'campaign_name': utm.utm_campaign || '',
    'campaign_content': utm.utm_content || '',
    'campaign_term': utm.utm_term || ''
  });
}
gtag('config', 'G-GC0KH378ZK');
gtag('config', 'AW-1769529274');
</script>
<script type="text/javascript">
_linkedin_partner_id = "8941612";
window._linkedin_data_partner_ids = window._linkedin_data_partner_ids || [];
window._linkedin_data_partner_ids.push(_linkedin_partner_id);
</script>
<script type="text/javascript" src="https://snap.licdn.com/li.ltr-js/insight.min.js" async></script>
<noscript>
<img height="1" width="1" style="display:none;" alt="" src="https://px.ads.linkedin.com/collect/?pid=8941612&fmt=gif" />
</noscript>
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${title}</title>
<meta name="description" content="${meta}">
<link href="https://fonts.googleapis.com/css2?family=Nunito:wght@800;900&family=Playfair+Display:wght@400;700;900&family=DM+Sans:wght@300;400;500;600&display=swap" rel="stylesheet">
<link rel="stylesheet" href="/css/styles.css">
<link rel="canonical" href="${canonical}">
<meta property="og:title" content="${ogTitle || title}">
<meta property="og:description" content="${ogDesc || meta}">
<meta property="og:type" content="website">
<meta property="og:url" content="${canonical}">
<meta property="og:image" content="https://golegara.com/img/og-image.png">
<meta property="og:site_name" content="Legara">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${ogTitle || title}">
<meta name="twitter:description" content="${ogDesc || meta}">
<meta name="twitter:image" content="https://golegara.com/img/og-image.png">
<link rel="icon" type="image/png" sizes="32x32" href="/img/favicon-32.png?v=2">
<link rel="icon" type="image/png" sizes="16x16" href="/img/favicon-16.png?v=2">
<link rel="icon" href="/img/favicon.ico?v=2" sizes="any">
<link rel="apple-touch-icon" href="/img/apple-touch-icon.png?v=2">
<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "Organization",
  "@id": "https://golegara.com/#organization",
  "name": "Legara",
  "url": "https://golegara.com",
  "logo": { "@type": "ImageObject", "url": "https://golegara.com/img/logo.png" },
  "description": ${JSON.stringify(ORG)},
  "telephone": "+1-760-479-7860",
  "areaServed": { "@type": "State", "name": "California" },
  "sameAs": ["https://www.linkedin.com/company/legara"]
}
</script>
</head>
<body>
`;
}

function nav(active) {
  const item = (href, label, key) =>
    `<li><a href="${href}"${key === active ? ' class="active"' : ""}>${label}</a></li>`;
  return `<!-- NAV -->
<nav>
  <a href="/" class="nav-logo"><img src="/img/logo.png" alt="Legara"></a>
  <button class="nav-toggle" onclick="document.querySelector('.nav-links').classList.toggle('open')">
    <span></span><span></span><span></span>
  </button>
  <ul class="nav-links">
    ${item("/how-it-works", "How It Works", "hiw")}
    ${item("/for-health-centers", "For Health Centers", "fhc")}
    <li class="nav-login">
      <a href="/fqhc-telepsychiatry" aria-haspopup="true" aria-expanded="false" onclick="this.closest('.nav-login').classList.toggle('open');return false;"${active === "cluster" ? ' class="active"' : ""}>For FQHCs <span class="nav-login-caret" aria-hidden="true">&#9660;</span></a>
      <ul class="nav-login-menu">
        <li><a href="/fqhc-telepsychiatry">Telepsychiatry</a></li>
        <li><a href="/fqhc-psychiatry-wait-times">Psychiatry wait times</a></li>
        <li><a href="/case-studies">Case results</a></li>
        <li><a href="/vs-hiring">Hiring comparison</a></li>
      </ul>
    </li>
    ${item("/partners", "Our Impact", "partners")}
    ${item("/about", "About", "about")}
    <li class="nav-login">
      <a href="#" aria-haspopup="true" aria-expanded="false" onclick="this.closest('.nav-login').classList.toggle('open');return false;">Log in <span class="nav-login-caret" aria-hidden="true">&#9660;</span></a>
      <ul class="nav-login-menu">
        <li><a href="https://client.golegara.com">Health Centers</a></li>
        <li><a href="https://provider.golegara.com">Subscribing Clinicians</a></li>
      </ul>
    </li>
    <li><a href="/assessment" class="nav-cta">Benchmark Your FQHC</a></li>
  </ul>
</nav>
`;
}

function footer() {
  return `<!-- FOOTER -->
<footer>
  <div class="footer-top">
    <div>
      <div class="footer-logo"><img src="/img/logo.png" alt="Legara"></div>
      <p class="footer-about">Expanding access to behavioral health care in the communities that need it most.</p>
    </div>
    <div class="footer-col">
      <h4>Platform</h4>
      <a href="/how-it-works">How It Works</a>
      <a href="/for-health-centers">For Health Centers</a>
      <a href="/become-a-provider">Become a Provider</a>
      <a href="/assessment">Capacity Assessment</a>
    </div>
    <div class="footer-col">
      <h4>For FQHCs</h4>
      <a href="/fqhc-telepsychiatry">Telepsychiatry</a>
      <a href="/fqhc-psychiatry-wait-times">Psychiatry wait times</a>
      <a href="/case-studies">Case results</a>
      <a href="/vs-hiring">Hiring</a>
      <a href="/vs-telepsychiatry">Telepsychiatry companies</a>
      <a href="/vs-locums">Locum tenens</a>
      <a href="/per-encounter-pps">Per-encounter PPS</a>
      <a href="/california-cpom">California CPOM</a>
    </div>
    <div class="footer-col">
      <h4>Company</h4>
      <a href="/about">About Legara</a>
      <a href="/partners">Our Partners</a>
      <a href="/press">Press</a>
      <a href="/contact">Contact</a>
      <a href="/sms-consent">SMS Consent</a>
    </div>
    <div class="footer-col">
      <h4>Connect</h4>
      <a href="https://golegara.com">GoLegara.com</a>
      <a href="mailto:contact@golegara.com">contact@golegara.com</a>
      <a href="tel:7604797860">760-479-7860</a>
    </div>
  </div>
  <div class="footer-bottom">
    <div>&copy; 2026 Legara, Inc. All rights reserved.</div>
    <div>Serving California's safety-net communities.</div>
  </div>
</footer>
<script src="/js/animations.js"></script>
<script src="/js/tracking.js"></script>
</body>
</html>
`;
}

function proof() {
  return `<section class="content-section">
  <div class="section-label reveal">California operations</div>
  <h2 class="section-headline reveal" style="font-size: clamp(26px, 3vw, 36px);">Nine California FQHCs. Same operating facts.</h2>
  <p class="section-body reveal">Nine active FQHC partners across California. 50,000+ encounters/year (about 950/week). 82% utilization. Under 3% provider turnover. Dedicated Patient Service Representatives at 4:1. Psychiatry wait baseline 15-20 weeks. 14% no-show rate.</p>
  <div class="testimonial-card reveal" style="max-width: 820px; margin: 28px auto 16px;">
    <div class="testimonial-text">${MATTSON}</div>
    <div class="testimonial-author">Kevin Mattson</div>
    <div class="testimonial-role">CEO, San Ysidro Health</div>
  </div>
  <div class="testimonial-card reveal" style="max-width: 820px; margin: 16px auto 0;">
    <div class="testimonial-text">${BAYNARD}</div>
    <div class="testimonial-author">Laura Baynard</div>
    <div class="testimonial-role">COO, Shasta Community Health Center</div>
  </div>
</section>
`;
}

function cta({ primaryHref, primaryLabel, secondaryHref, secondaryLabel, headline, body }) {
  return `<div class="cta-band">
  <div class="section-headline">${headline}</div>
  ${body ? `<p>${body}</p>` : ""}
  <div style="display: flex; gap: 16px; justify-content: center; flex-wrap: wrap;">
    <a href="${primaryHref}" class="btn-primary">${primaryLabel}</a>
    <a href="${secondaryHref}" class="btn-outline-white">${secondaryLabel}</a>
  </div>
</div>
`;
}

function page(file, opts, body) {
  const html =
    head(opts) +
    nav("cluster") +
    body +
    footer();
  fs.mkdirSync(file.includes("/") ? file.slice(0, file.lastIndexOf("/")) : ".", { recursive: true });
  fs.writeFileSync(file, html);
  console.log("wrote", file);
}

const assessCta = {
  primaryHref: "/assessment",
  primaryLabel: "See the assessment",
  secondaryHref: "/contact",
  secondaryLabel: "Schedule a conversation",
  headline: "See how this operating model maps to your health center.",
  body: "The assessment is a short operational benchmark. A conversation is available if you want peers and finance in the room.",
};

const contactCta = {
  primaryHref: "/contact",
  primaryLabel: "Schedule a conversation",
  secondaryHref: "/assessment",
  secondaryLabel: "See the assessment",
  headline: "Talk with the team, including a peer reference if you want one.",
  body: "Bring your general counsel or finance lead if that helps. No pressure language. Just the operating model.",
};

page("fqhc-telepsychiatry.html", {
  title: "FQHCs Evaluating Telepsychiatry Often Need More Than Staffing | Legara",
  meta: "FQHCs evaluating behavioral health telepsychiatry often find the staffing model does not address scheduling. Legara takes a different approach as a behavioral health workforce platform. Nine California health centers. See the assessment.",
  canonical: "https://golegara.com/fqhc-telepsychiatry",
}, `
<div class="page-header">
  <div class="section-label reveal">For FQHCs</div>
  <h1 class="section-headline reveal">FQHCs evaluating behavioral health telepsychiatry often find the staffing model does not address scheduling. Legara takes a different approach.</h1>
</div>
<section class="content-section">
  <div class="section-label reveal">What the search usually means</div>
  <h2 class="section-headline reveal" style="font-size: clamp(26px, 3vw, 36px);">What FQHC leaders mean when they search telepsychiatry</h2>
  <p class="section-body reveal">Leaders looking at behavioral health telepsychiatry are usually trying to add psychiatry, therapy, and PMHNP capacity for patients who cannot wait. The category often arrives as a screen and a clinician. The health center still owns the front desk, the unused hour, and the panel that never fills.</p>
</section>
<section class="content-section-alt">
  <div class="content-section" style="background: transparent;">
    <div class="section-label reveal">The gap</div>
    <h2 class="section-headline reveal" style="font-size: clamp(26px, 3vw, 36px);">The gap that category does not close</h2>
    <div class="pillars reveal-stagger">
      <div class="pillar reveal"><h3>Shared front desk</h3><p>Behavioral health is scheduled next to a full medical panel. No one is measured on whether the psychiatry or therapy slot actually happens.</p></div>
      <div class="pillar reveal"><h3>Unused time</h3><p>A salaried or hourly clinician can sit on the schedule while the panel stays thin. The health center still pays for the hour.</p></div>
      <div class="pillar reveal"><h3>No 4:1 PSR</h3><p>Without a dedicated Patient Service Representative supporting no more than four clinicians, outreach, reminders, and fill-in work compete with every other clinic task.</p></div>
      <div class="pillar reveal"><h3>CPOM as an afterthought</h3><p>California corporate practice of medicine rules are not a template you paste on after the contract. The operating structure has to start there.</p></div>
    </div>
  </div>
</section>
<section class="content-section">
  <div class="section-label reveal">The model</div>
  <h2 class="section-headline reveal" style="font-size: clamp(26px, 3vw, 36px);">What Legara is</h2>
  <p class="section-body reveal">Legara is a behavioral health workforce platform. Independent licensed clinicians (therapy, PMHNP, and psychiatry) work inside dedicated operational infrastructure. They are paid per completed encounter. Dedicated PSRs run at 4:1. The health center keeps clinical authority and billing. Delivery is on-site, hybrid, or remote, so this is not a screen-only arrangement.</p>
</section>
${proof()}
<section class="content-section">
  <div class="section-label reveal">Differentiation</div>
  <h2 class="section-headline reveal" style="font-size: clamp(26px, 3vw, 36px);">How this is not a staffing agency and not a telehealth company</h2>
  <p class="section-body reveal">A staffing overlay places a person and leaves the schedule to your front desk. A telehealth hour can be paid whether or not the visit completes. This platform is built around completed encounters, a 4:1 PSR, and a California CPOM structure. Legara never exercises clinical control. Your medical staff, privileging, EHR, and quality program stay yours.</p>
  <h2 class="section-headline reveal" style="font-size: clamp(24px, 2.5vw, 32px); margin-top: 40px;">Who this is for</h2>
  <p class="section-body reveal">Health centers that want to add capacity alongside employed staff. The platform is designed to augment the team you already have, not to argue that your model should be discarded.</p>
  <h2 class="section-headline reveal" style="font-size: clamp(24px, 2.5vw, 32px); margin-top: 40px;">First stretch</h2>
  <p class="section-body reveal">As fast as 6 weeks from signed contract. The FQHC pays $0 during ramp. Credentialing still runs on the health-center clock, because privileging and payer enrollment are yours to own.</p>
</section>
<section class="content-section-alt">
  <div class="content-section" style="background: transparent;">
    <div class="section-label reveal">Compare</div>
    <h2 class="section-headline reveal" style="font-size: clamp(26px, 3vw, 36px);">Four comparisons FQHC leaders ask for</h2>
    <div class="pillars">
      <div class="pillar"><h3><a href="/vs-hiring">Hiring</a></h3><p>6-9 months from hire to a full caseload, without dedicated scheduling.</p></div>
      <div class="pillar"><h3><a href="/vs-telepsychiatry">Telepsychiatry companies</a></h3><p>Paid hour versus completed visit, and whether a 4:1 PSR exists.</p></div>
      <div class="pillar"><h3><a href="/vs-locums">Locum tenens</a></h3><p>A shift covered, or a panel that keeps moving after the week ends.</p></div>
      <div class="pillar"><h3><a href="/per-encounter-pps">Per-encounter PPS</a></h3><p>The FQHC already bills the visit. The operating model around that visit is the gap.</p></div>
    </div>
  </div>
</section>
<section class="content-section">
  <div class="section-label reveal">Questions</div>
  <h2 class="section-headline reveal" style="font-size: clamp(26px, 3vw, 36px);">FAQ</h2>
  <p class="section-body"><strong>Does this change how you bill PPS?</strong> The health center bills under its own NPI. See <a href="/per-encounter-pps">per-encounter PPS</a> for visit codes, then stop. We do not publish a platform fee here.</p>
  <p class="section-body"><strong>Who is the employer of record for the clinician?</strong> Clinicians are independent practitioners. The health center keeps clinical authority. Details belong in a conversation with your counsel.</p>
  <p class="section-body"><strong>Can clinicians work on-site?</strong> Yes. On-site, hybrid, and remote are all in use across the California network.</p>
  <p class="section-body"><strong>How does California CPOM show up in the contract?</strong> Read <a href="/california-cpom">California CPOM</a>. That page is an operations explanation, not a legal opinion.</p>
</section>
${cta(assessCta)}`);

page("fqhc-psychiatry-wait-times.html", {
  title: "FQHC Psychiatry Wait Times and the Operating Model Behind Them | Legara",
  meta: "FQHC psychiatry wait times are an operating-model output. Partner baseline is 15-20 weeks. Nine California health centers run a behavioral health workforce platform with dedicated PSRs at 4:1. See the assessment.",
  canonical: "https://golegara.com/fqhc-psychiatry-wait-times",
}, `
<div class="page-header">
  <div class="section-label reveal">For FQHCs</div>
  <h1 class="section-headline reveal">FQHC psychiatry wait times are an operating-model output, not a recruiting slogan.</h1>
</div>
<section class="content-section">
  <p class="section-body reveal">A long psychiatry queue is what you see when scheduling, fill-in work, and unused clinician time sit inside a primary care front desk. Recruiting another person into that same structure does not by itself change the wait. Dedicated PSRs at 4:1, panels that fill, and pay tied to completed encounters are the operating pieces behind the number.</p>
  <p class="section-body reveal">Partner baseline psychiatry wait is 15-20 weeks. That is the locked operating figure for this page. It is not a promise that a new partner will land under two weeks.</p>
  <p class="section-body reveal">For national context, Merritt Hawkins reported a 25-day average wait for a new psychiatry patient in 2022. That figure is not FQHC-specific and is not a California safety-net baseline.</p>
  <p class="section-body reveal">Separately, NACHC reported in 2024 that health centers meet 27% of mental health need. That is a system-access figure, not a Legara wait-time claim.</p>
  <p class="section-body reveal">The March 18, 2026 PR Newswire release described psychiatry wait moving from 18 weeks to under 2 weeks at partner sites in that announcement. That PR figure is labeled and is not blended here with the 15-20 week baseline. This is not a patient booking page and it does not guarantee an under-two-week wait for a new partner.</p>
  <p class="section-body reveal">HRSA reported in 2024 that about 1 in 3 Americans live in a mental health professional shortage area. The National Council has reported facility-level behavioral health turnover above 35%. Those are industry references, not platform proof.</p>
</section>
${proof()}
${cta(assessCta)}`);

page("case-studies.html", {
  title: "FQHC Behavioral Health Case Results from California | Legara",
  meta: "Prospective case results from California FQHCs, from the March 18, 2026 PR and live-site operations: wait times, 82% utilization, under 3% turnover, plus peer quotes. See the numbers.",
  canonical: "https://golegara.com/case-studies",
}, `
<div class="page-header">
  <div class="section-label reveal">Case results</div>
  <h1 class="section-headline reveal">Nine California FQHCs. Same behavioral health workforce platform. These are the numbers.</h1>
  <p class="section-body reveal">Two sources are labeled below. Live-site operations are what nine California health centers run today. PR figures come from the March 18, 2026 PR Newswire release, Encinitas, California, attributed to Roger Stellers, CEO. PR wait and volume numbers are aggregates. They are not assigned to San Ysidro Health or to Shasta Community Health Center.</p>
</div>
<section class="content-section">
  <div class="section-label reveal">Live-site operations</div>
  <h2 class="section-headline reveal" style="font-size: clamp(26px, 3vw, 36px);">What the California network runs today</h2>
  <p class="section-body reveal">Nine active FQHC partners. 50,000+ encounters/year (about 950/week). 82% utilization. Under 3% provider turnover versus roughly 30% industry. Dedicated PSRs at 4:1. 14% no-show. Psychiatry wait baseline 15-20 weeks.</p>
</section>
<section class="content-section-alt">
  <div class="content-section" style="background: transparent;">
    <div class="section-label reveal">March 18, 2026 PR (labeled aggregate)</div>
    <h2 class="section-headline reveal" style="font-size: clamp(26px, 3vw, 36px);">What the PR Newswire release reported</h2>
    <p class="section-body reveal">Psychiatry wait in that release: 18 weeks to under 2 weeks. Psychotherapy wait: 9 weeks to 2 weeks. Those wait figures are labeled as the PR aggregate. They are not a guarantee for a new partner.</p>
    <p class="section-body reveal">Weekly encounters in that release: +230 combined, not a single center.</p>
    <p class="section-body reveal">No-shows in that release declined more than 30%.</p>
    <p class="section-body reveal">Pilot clients in that release generated about $700K additional net cash flow. That figure is labeled, applies to plural pilot clients, and is cash generated to serve the mission. It is not pinned to San Ysidro Health or to Shasta.</p>
    <p class="section-body"><a href="https://www.prnewswire.com/news-releases/legara-inc-transforms-fqhc-mental-health-care-302718136.html">Read the March 18, 2026 PR Newswire release</a>.</p>
  </div>
</section>
<section class="content-section">
  <div class="section-label reveal">Peer voices</div>
  <h2 class="section-headline reveal" style="font-size: clamp(26px, 3vw, 36px);">Quotes from two California FQHC leaders</h2>
  <div class="testimonial-card" style="max-width: 820px; margin: 0 auto 20px;">
    <div class="testimonial-text">${MATTSON}</div>
    <div class="testimonial-author">Kevin Mattson</div>
    <div class="testimonial-role">CEO, San Ysidro Health</div>
  </div>
  <a href="/case-studies/shasta-community-health-center" class="testimonial-card" style="max-width: 820px; margin: 0 auto; display: block; text-decoration: none; color: inherit;">
    <div class="testimonial-text">${BAYNARD}</div>
    <div class="testimonial-author">Laura Baynard</div>
    <div class="testimonial-role">COO, Shasta Community Health Center</div>
    <p style="margin-top: 12px; color: var(--green); font-weight: 600;">Read the Shasta page</p>
  </a>
  <p class="section-body" style="margin-top: 32px;">Madera Community Health Center appears on our blog as a mission conversation with Cheryl Orozco, Chief Operating Officer. That is not a results case and it is not used as a numbered outcome here.</p>
</section>
${cta({ ...contactCta, body: "Ask for a conversation that can include a peer reference call. The assessment is available if you want the operational benchmark first." })}`);

page("case-studies/shasta-community-health-center.html", {
  title: "Shasta Community Health Center and a Behavioral Health Workforce Platform | Legara",
  meta: "Laura Baynard, COO of Shasta Community Health Center, on unused capacity and no salary burden. Shasta is one of nine California FQHCs on the platform. See the quote and the model.",
  canonical: "https://golegara.com/case-studies/shasta-community-health-center",
}, `
<div class="page-header">
  <div class="section-label reveal">Shasta Community Health Center</div>
  <h1 class="section-headline reveal">Shasta Community Health Center added a purpose-built operating structure alongside its employed team.</h1>
  <p class="section-body reveal">Shasta is a rural Northern California FQHC and one of nine California health centers on the platform. This page stays with public context and a named quote. It does not assign network or PR aggregates to Shasta. No street address.</p>
</div>
<section class="content-section">
  <div class="testimonial-card" style="max-width: 820px; margin: 0 auto;">
    <div class="testimonial-text">${BAYNARD}</div>
    <div class="testimonial-author">Laura Baynard</div>
    <div class="testimonial-role">COO, Shasta Community Health Center</div>
  </div>
  <p class="section-body" style="margin-top: 32px;">The quote is about unused capacity carrying no salary burden, and about on-site support that fit Shasta operations. That is the public story we can tell. We do not write that Shasta went from 18 weeks to 2.</p>
</section>
<section class="content-section-alt">
  <div class="content-section" style="background: transparent;">
    <div class="section-label reveal">Network facts (labeled)</div>
    <h2 class="section-headline reveal" style="font-size: clamp(26px, 3vw, 36px);">What the California network runs, not a Shasta scorecard</h2>
    <p class="section-body reveal">Nine active FQHC partners across California. 50,000+ encounters/year (about 950/week). 82% utilization. Under 3% provider turnover. Dedicated PSRs at 4:1. Psychiatry wait baseline 15-20 weeks. 14% no-show. These are network figures.</p>
    <p class="section-body reveal">PR aggregates from March 18, 2026 live on the <a href="/case-studies">case results hub</a>. They are not applied to Shasta on this page.</p>
  </div>
</section>
<section class="content-section">
  <div class="testimonial-card" style="max-width: 820px; margin: 0 auto;">
    <div class="testimonial-text">${MATTSON}</div>
    <div class="testimonial-author">Kevin Mattson</div>
    <div class="testimonial-role">CEO, San Ysidro Health</div>
  </div>
</section>
${cta(contactCta)}`);

page("vs-hiring.html", {
  title: "What FQHCs Face When They Hire a Psychiatrist | Legara",
  meta: "FQHCs hiring a psychiatrist typically wait 6-9 months to a full caseload, with roughly 30% turnover and no dedicated scheduling. Nine California health centers add a behavioral health workforce platform alongside employed staff. See the comparison.",
  canonical: "https://golegara.com/vs-hiring",
}, `
<div class="page-header">
  <div class="section-label reveal">Compared with hiring</div>
  <h1 class="section-headline reveal">Hiring a psychiatrist at an FQHC is a 6-9 month ramp to a full caseload, without dedicated scheduling infrastructure.</h1>
</div>
<section class="content-section">
  <p class="section-body reveal">This page is not an argument against hiring. Nine California health centers add a behavioral health workforce platform alongside employed staff. Hiring remains a tool. The comparison is about ramp time, unused salary, turnover, and whether a 4:1 PSR exists.</p>
  <div style="overflow-x: auto; margin: 32px 0;">
    <table class="compare-table">
      <thead><tr><th></th><th>Typical FQHC hire</th><th>This platform</th></tr></thead>
      <tbody>
        <tr><td>Time to a full caseload</td><td class="val-old">6-9 months from hire</td><td class="val-new">As fast as 6 weeks from signed contract</td></tr>
        <tr><td>Cost during ramp</td><td class="val-old">Full salary</td><td class="val-new">$0 until encounters</td></tr>
        <tr><td>Provider turnover</td><td class="val-old">Roughly 30%</td><td class="val-new">Under 3%</td></tr>
        <tr><td>FTE on the health-center books</td><td class="val-old">Yes</td><td class="val-new">No</td></tr>
        <tr><td>Dedicated scheduling</td><td class="val-old">Usually shared front desk</td><td class="val-new">PSRs at 4:1</td></tr>
      </tbody>
    </table>
  </div>
  <p class="section-body reveal">After the operating difference is clear, the cost model for a therapist hire is worth stating as a model, not as audited actuals. An LCSW sticker is about $135K. True annual cost lands near $229K once you load 1.4x benefits and tax, about 0.25 FTE of support (about $11K), an amortized recruiter (about $8K), about 30% turnover, and a 6-9 month ramp. $229K is a therapist / LCSW-LMFT model. It is not a psychiatrist figure. The walkthrough lives on <a href="/blog-229k-therapist">the $229K therapist essay</a>.</p>
</section>
${proof()}
${cta(assessCta)}`);

page("vs-telepsychiatry.html", {
  title: "FQHC Telepsychiatry Companies and a Different Operating Model | Legara",
  meta: "FQHCs evaluating telepsychiatry companies often find they paid for the hour, not the completed visit. Legara takes a different approach: a behavioral health workforce platform with dedicated PSRs at 4:1. See the difference.",
  canonical: "https://golegara.com/vs-telepsychiatry",
}, `
<div class="page-header">
  <div class="section-label reveal">Compared with telepsychiatry companies</div>
  <h1 class="section-headline reveal">FQHCs evaluating telepsychiatry companies often find the staffing model does not address scheduling. Legara takes a different approach.</h1>
</div>
<section class="content-section">
  <p class="section-body reveal">FQHCs evaluating this category often find they paid for the hour, not the completed visit. We do not name other brands here, invent their utilization, or claim Joint Commission status for anyone.</p>
  <p class="section-body reveal">Three shapes show up in the market. Employed-clinician hourly: you buy time. Staffing overlay: a person arrives and your front desk still owns the panel. PPS-education firms: useful for coding conversations; CFOs who want the visit-unit discussion should read <a href="/per-encounter-pps">per-encounter PPS</a> rather than a code tutorial on this page.</p>
  <div style="overflow-x: auto; margin: 32px 0;">
    <table class="compare-table">
      <thead><tr><th></th><th>Common category pattern</th><th>This platform</th></tr></thead>
      <tbody>
        <tr><td>Unit of work</td><td class="val-old">Scheduled hour</td><td class="val-new">Completed encounter</td></tr>
        <tr><td>Scheduling support</td><td class="val-old">Unspecified</td><td class="val-new">Dedicated PSR at 4:1</td></tr>
        <tr><td>Where care happens</td><td class="val-old">Screen as the default</td><td class="val-new">On-site, hybrid, or remote</td></tr>
        <tr><td>Who holds authority</td><td class="val-old">Employed or subcontracted clinician patterns vary</td><td class="val-new">Independent clinicians; health center keeps authority and billing</td></tr>
        <tr><td>California CPOM</td><td class="val-old">National template applied later</td><td class="val-new">Designed around CA CPOM from day one</td></tr>
        <tr><td>Utilization</td><td class="val-old">Not claimed for others</td><td class="val-new">82% on this California network only</td></tr>
      </tbody>
    </table>
  </div>
  <p class="section-body reveal">We do not say other companies violate CPOM. We say the platform was designed around California rules, and the health center keeps clinical authority.</p>
</section>
${proof()}
${cta(assessCta)}`);

page("vs-locums.html", {
  title: "FQHC Locum Tenens Psychiatry Compared With Durable Capacity | Legara",
  meta: "Locum tenens psychiatry covers a shift. It does not bring a 4:1 PSR, per-encounter economics, or a CA CPOM structure. Nine California FQHCs run a behavioral health workforce platform alongside employed staff. See the comparison.",
  canonical: "https://golegara.com/vs-locums",
}, `
<div class="page-header">
  <div class="section-label reveal">Compared with locum tenens</div>
  <h1 class="section-headline reveal">Locum tenens psychiatry covers the shift. Patients still wait for the panel.</h1>
</div>
<section class="content-section">
  <p class="section-body reveal">Locum tenens psychiatry is a legitimate way to cover a gap week. This page does not invent locums dollar rates, and it does not claim a faster path to a single shift. The comparison is durability: a 4:1 PSR, per-encounter economics, and a California CPOM structure after the week ends.</p>
  <p class="section-body reveal">Legara is not a staffing agency that places a clinician and walks away. Independent clinicians stay inside the platform. When a panel needs continuity, the California network already uses PMHNP capacity with MD supervision, as described on <a href="/partners">Our Impact</a>.</p>
  <div style="overflow-x: auto; margin: 32px 0;">
    <table class="compare-table">
      <thead><tr><th></th><th>Locum tenens pattern</th><th>This platform</th></tr></thead>
      <tbody>
        <tr><td>Unit</td><td class="val-old">Shift or hour</td><td class="val-new">Completed encounter</td></tr>
        <tr><td>After the week</td><td class="val-old">Temporary; walk-away is normal</td><td class="val-new">Ongoing panel</td></tr>
        <tr><td>Scheduling</td><td class="val-old">Your front desk</td><td class="val-new">Dedicated PSR</td></tr>
        <tr><td>Cost before work starts</td><td class="val-old">Varies by contract</td><td class="val-new">$0 until encounters</td></tr>
      </tbody>
    </table>
  </div>
</section>
${proof()}
${cta(assessCta)}`);

page("per-encounter-pps.html", {
  title: "FQHC Behavioral Health PPS and a Per-Encounter Operating Model | Legara",
  meta: "FQHCs already bill behavioral health as a visit (G0469/G0470). A behavioral health workforce platform can charge on that same unit: completed visits, with dedicated PSRs at 4:1. Nine California health centers. See the comparison.",
  canonical: "https://golegara.com/per-encounter-pps",
}, `
<div class="page-header">
  <div class="section-label reveal">Per-encounter and PPS</div>
  <h1 class="section-headline reveal">The FQHC already bills behavioral health by the visit. The operating model around that visit is the gap.</h1>
</div>
<section class="content-section">
  <p class="section-body reveal">This is not a CoCM tutorial. FQHCs already bill behavioral health as a visit. CMS lists G0469 for a new FQHC behavioral health visit and G0470 for an established visit. For the published lists, see the <a href="https://www.nachc.org/wp-content/uploads/2025/05/FQHC-Payment-Guide.pdf">NACHC Payment Guide</a> and the <a href="https://www.cms.gov/medicare/payment/prospective-payment-systems/federally-qualified-health-center-fqhc-pps">CMS FQHC PPS page</a>. We stop there. No locality PPS dollar rates. No platform fee on this page.</p>
  <p class="section-body reveal">The health center bills under its own NPI. Clinical authority, privileging, and the claim stay with you. The platform is built so the operating unit (a completed visit, with dedicated PSRs at 4:1) can match the unit you already bill.</p>
  <p class="section-body reveal">Nine California health centers run that structure today. After the differentiation is clear, two labeled models sit last: the therapist hire model near $229K true annual cost (LCSW/LMFT, not a psychiatrist figure, not audited actuals), and average total encounter revenue to the FQHC of about $230 (PPS plus copays plus secondaries). That $230 is not a Legara rate. Both figures are about cash generated to serve the mission, not a subtractive story.</p>
</section>
${proof()}
${cta({
  primaryHref: "/roi-calculator",
  primaryLabel: "See the comparison",
  secondaryHref: "/contact",
  secondaryLabel: "Schedule a conversation",
  headline: "See the comparison, then bring finance into the room.",
  body: "The comparison is an operational walkthrough. Schedule a conversation when you want finance at the table.",
})}`);

page("california-cpom.html", {
  title: "California CPOM and FQHC Behavioral Health Contracting | Legara",
  meta: "Legara is a behavioral health workforce platform whose three-entity structure was designed around California corporate practice of medicine rules. Your health center keeps clinical authority and billing. See how operations are separated from care.",
  canonical: "https://golegara.com/california-cpom",
}, `
<div class="page-header">
  <div class="section-label reveal">California CPOM</div>
  <h1 class="section-headline reveal">California CPOM is why we did not build a staffing company.</h1>
  <p class="section-body reveal">This page explains an operating choice. It is not a legal opinion, not a guarantee of compliance, and not a do-it-yourself incorporation guide. Your general counsel should read the contract.</p>
</div>
<section class="content-section">
  <p class="section-body reveal">Legara is a behavioral health workforce platform whose three-entity structure was designed around California corporate practice of medicine rules. We name the idea only. There is no org chart of straw corporations on this page, no MSO legal name, and no predecessor entity.</p>
  <p class="section-body reveal">The health center keeps clinical authority, billing, privileging, the EHR, and quality review. Independent licensed clinicians practice. Operational infrastructure (scheduling, panel fill, the 4:1 PSR) sits on the operations side. Legara never exercises clinical control.</p>
  <p class="section-body reveal">We do not quote Business and Professions Code sections here. We do not say CPOM does not apply to FQHCs. We do not tell a health center how to incorporate. If you want counsel on the call, say so when you <a href="/contact">schedule a conversation</a>.</p>
</section>
${proof()}
${cta({ ...contactCta, body: "Offer to include your general counsel. The assessment is secondary on this page." })}`);

console.log("done");
