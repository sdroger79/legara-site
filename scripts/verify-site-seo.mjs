import fs from "fs";

const publicPages = [
  ["index.html", "https://golegara.com/"],
  ["how-it-works.html", "https://golegara.com/how-it-works"],
  ["for-health-centers.html", "https://golegara.com/for-health-centers"],
  ["about.html", "https://golegara.com/about"],
  ["become-a-provider.html", "https://golegara.com/become-a-provider"],
  ["partners.html", "https://golegara.com/partners"],
  ["contact.html", "https://golegara.com/contact"],
  ["press.html", "https://golegara.com/press"],
  ["press-legara-launch.html", "https://golegara.com/press-legara-launch"],
  ["blog.html", "https://golegara.com/blog"],
  ["blog-229k-therapist.html", "https://golegara.com/blog-229k-therapist"],
  ["blog-federal-funding-roulette.html", "https://golegara.com/blog-federal-funding-roulette"],
  ["blog-9-health-centers-one-question.html", "https://golegara.com/blog-9-health-centers-one-question"],
  ["blog-11-month-blind-spot.html", "https://golegara.com/blog-11-month-blind-spot"],
  ["blog-doc-in-the-box.html", "https://golegara.com/blog-doc-in-the-box"],
  ["assessment.html", "https://golegara.com/assessment"],
  ["sms-consent.html", "https://golegara.com/sms-consent"],
  ["fqhc-telepsychiatry.html", "https://golegara.com/fqhc-telepsychiatry"],
  ["fqhc-psychiatry-wait-times.html", "https://golegara.com/fqhc-psychiatry-wait-times"],
  ["case-studies.html", "https://golegara.com/case-studies"],
  ["case-studies/shasta-community-health-center.html", "https://golegara.com/case-studies/shasta-community-health-center"],
  ["vs-hiring.html", "https://golegara.com/vs-hiring"],
  ["vs-telepsychiatry.html", "https://golegara.com/vs-telepsychiatry"],
  ["vs-locums.html", "https://golegara.com/vs-locums"],
  ["per-encounter-pps.html", "https://golegara.com/per-encounter-pps"],
  ["california-cpom.html", "https://golegara.com/california-cpom"],
];

const moneyPages = [
  "fqhc-telepsychiatry.html",
  "fqhc-psychiatry-wait-times.html",
  "case-studies.html",
  "case-studies/shasta-community-health-center.html",
  "vs-hiring.html",
  "vs-telepsychiatry.html",
  "vs-locums.html",
  "per-encounter-pps.html",
  "california-cpom.html",
];

let failed = 0;
function assert(name, cond, detail) {
  if (cond) console.log(`  ok  ${name}`);
  else {
    failed += 1;
    console.error(`  FAIL ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

console.log("Public page canonicals / OG");
for (const [file, canonical] of publicPages) {
  const html = fs.readFileSync(file, "utf8");
  assert(`${file} canonical`, html.includes(`rel="canonical" href="${canonical}"`));
  assert(`${file} og:url`, html.includes(`property="og:url" content="${canonical}"`));
  assert(`${file} no .html canonical`, !html.includes(`rel="canonical" href="${canonical}.html"`));
}

const indexableBlog = ["blog.html", "blog-11-month-blind-spot.html", "blog-doc-in-the-box.html"];
console.log("\nBlog indexable");
for (const file of indexableBlog) {
  const html = fs.readFileSync(file, "utf8");
  assert(`${file} has no robots noindex`, !/name="robots"[^>]*noindex/i.test(html));
}

console.log("\nInternal lock");
assert("meridian noindex", /name="robots"[^>]*noindex/i.test(fs.readFileSync("meridian.html", "utf8")));
assert("team noindex", /name="robots"[^>]*noindex/i.test(fs.readFileSync("team/index.html", "utf8")));
const robots = fs.readFileSync("robots.txt", "utf8");
for (const path of ["/meridian", "/meridian.html", "/team", "/team/", "/roi-calculator-internal.html", "/next"]) {
  assert(`robots Disallow ${path}`, robots.includes(`Disallow: ${path}`));
}

console.log("\nHomepage proof stats");
const home = fs.readFileSync("index.html", "utf8");
assert("50,000+ visible", home.includes(">50,000+</div>"));
assert("40+ visible", home.includes(">40+</div>"));
assert("82% visible", home.includes(">82%</div>"));
assert("4.76 visible", home.includes(">4.76</div>"));
assert("14% visible", home.includes(">14%</div>"));
assert("no leftover count-up 0", !/class="[^"]*count-up[^"]*"[^>]*>0</.test(home));
assert("H1 unchanged", home.includes("<h1>Your behavioral health demand outgrew the operating model it runs inside.</h1>"));
assert("homepage PSR 3-to-1 unchanged", home.includes("3-to-1 provider ratios"));
assert("homepage PSR 3-4 unchanged", home.includes("no more than 3-4 providers"));
assert("Organization employee not founder", home.includes('"employee": { "@id": "https://golegara.com/#roger-stellers" }'));
assert("no founder in homepage schema", !/"founder"/i.test(home));
assert("Roger jobTitle CEO", home.includes('"jobTitle": "CEO"'));
assert("no Encinitas", !/encinitas/i.test(home));
assert("no LocalBusiness", !home.includes("LocalBusiness"));
assert("no MedicalOrganization", !home.includes("MedicalOrganization"));
assert("no CARECON", !/carecon/i.test(home));
assert("no Fidare", !/fidare/i.test(home));
assert("sameAs LinkedIn company", /"sameAs"\s*:\s*\[[\s\S]*?linkedin\.com\/company\/legara/.test(home));
assert("telephone", home.includes("+1-760-479-7860"));
assert("Person Roger", home.includes("Roger Stellers") && home.includes("/in/roger-stellers"));

console.log("\nPress date");
const press = fs.readFileSync("press.html", "utf8");
const release = fs.readFileSync("press-legara-launch.html", "utf8");
assert("press listing date", press.includes("March 18, 2026"));
assert("press listing not January 2026", !press.includes("January 2026"));
assert("release date", release.includes("March 18, 2026"));
assert("PR Newswire link", release.includes("prnewswire.com/news-releases/legara-inc-transforms-fqhc-mental-health-care-302718136.html"));

console.log("\nSitemap");
const sitemap = fs.readFileSync("sitemap.xml", "utf8");
const required = [
  "https://golegara.com/",
  "https://golegara.com/how-it-works",
  "https://golegara.com/assessment",
  "https://golegara.com/sms-consent",
  "https://golegara.com/blog",
  "https://golegara.com/blog-11-month-blind-spot",
  "https://golegara.com/blog-doc-in-the-box",
  "https://golegara.com/blog-229k-therapist",
  "https://golegara.com/blog-federal-funding-roulette",
  "https://golegara.com/blog-9-health-centers-one-question",
  "https://golegara.com/fqhc-telepsychiatry",
  "https://golegara.com/fqhc-psychiatry-wait-times",
  "https://golegara.com/case-studies",
  "https://golegara.com/case-studies/shasta-community-health-center",
  "https://golegara.com/vs-hiring",
  "https://golegara.com/vs-telepsychiatry",
  "https://golegara.com/vs-locums",
  "https://golegara.com/per-encounter-pps",
  "https://golegara.com/california-cpom",
];
for (const loc of required) {
  assert(`sitemap ${loc}`, sitemap.includes(`<loc>${loc}</loc>`));
}
assert("sitemap has no .html locs", !/<loc>https:\/\/golegara\.com\/[^<]+\.html<\/loc>/.test(sitemap));
assert("sitemap omits meridian", !sitemap.includes("/meridian"));
assert("sitemap omits team", !sitemap.includes("/team"));
assert("sitemap omits /next", !sitemap.includes("/next"));

console.log("\nMoney-page titles and H1s");
const moneyCopy = [
  ["fqhc-telepsychiatry.html", "FQHCs Evaluating Telepsychiatry Often Need More Than Staffing | Legara", "FQHCs evaluating behavioral health telepsychiatry often find the staffing model does not address scheduling. Legara takes a different approach."],
  ["fqhc-psychiatry-wait-times.html", "FQHC Psychiatry Wait Times and the Operating Model Behind Them | Legara", "FQHC psychiatry wait times are an operating-model output, not a recruiting slogan."],
  ["case-studies.html", "FQHC Behavioral Health Case Results from California | Legara", "Nine California FQHCs. Same behavioral health workforce platform. These are the numbers."],
  ["case-studies/shasta-community-health-center.html", "Shasta Community Health Center and a Behavioral Health Workforce Platform | Legara", "Shasta Community Health Center added a purpose-built operating structure alongside its employed team."],
  ["vs-hiring.html", "What FQHCs Face When They Hire a Psychiatrist | Legara", "Hiring a psychiatrist at an FQHC is a 6-9 month ramp to a full caseload, without dedicated scheduling infrastructure."],
  ["vs-telepsychiatry.html", "FQHC Telepsychiatry Companies and a Different Operating Model | Legara", "FQHCs evaluating telepsychiatry companies often find the staffing model does not address scheduling. Legara takes a different approach."],
  ["vs-locums.html", "FQHC Locum Tenens Psychiatry Compared With Durable Capacity | Legara", "Locum tenens psychiatry covers the shift. Patients still wait for the panel."],
  ["per-encounter-pps.html", "FQHC Behavioral Health PPS and a Per-Encounter Operating Model | Legara", "The FQHC already bills behavioral health by the visit. The operating model around that visit is the gap."],
  ["california-cpom.html", "California CPOM and FQHC Behavioral Health Contracting | Legara", "California CPOM is why we did not build a staffing company."],
];
for (const [file, title, h1] of moneyCopy) {
  const html = fs.readFileSync(file, "utf8");
  assert(`${file} title`, html.includes(`<title>${title}</title>`));
  assert(`${file} H1`, html.includes(`>${h1}</h1>`));
}

console.log("\nMoney-page cluster");
for (const file of moneyPages) {
  const html = fs.readFileSync(file, "utf8");
  assert(`${file} has no robots noindex`, !/name="robots"[^>]*noindex/i.test(html));
  assert(`${file} Organization JSON-LD`, html.includes('"@type": "Organization"'));
  assert(`${file} locked org description`, html.includes("Legara is a behavioral health workforce platform built exclusively for FQHCs, combining independent licensed clinicians with dedicated operational infrastructure and per-encounter economics."));
  assert(`${file} no Medical schema`, !/Medical(Organization|Business|Clinic|WebPage)/.test(html));
  assert(`${file} no LocalBusiness`, !html.includes("LocalBusiness"));
  assert(`${file} no EmploymentAgency`, !html.includes("EmploymentAgency"));
  assert(`${file} no street address`, !/"streetAddress"/.test(html) && !/619-251/.test(html));
  assert(`${file} no em dash`, !html.includes("\u2014"));
  assert(`${file} no ROI`, !/\bROI\b/.test(html));
  assert(`${file} no savings`, !/savings/i.test(html));
  assert(`${file} no revenue gap`, !/revenue gap/i.test(html));
  assert(`${file} no BH abbreviation`, !/\bBH\b/.test(html));
  assert(`${file} no we staff`, !/we staff/i.test(html));
  assert(`${file} no staffing partner`, !/staffing partner/i.test(html));
  assert(`${file} no locums firm`, !/locums firm/i.test(html));
  assert(`${file} no Fidare`, !/fidare/i.test(html));
  assert(`${file} no CARECON`, !/carecon/i.test(html));
  assert(`${file} no Founder`, !/Founder/.test(html));
  assert(`${file} no Jonathan Wheaton`, !/Jonathan Wheaton/.test(html));
  assert(`${file} no 11 month`, !/11[- ]month/i.test(html));
  assert(`${file} no SYH case-study URL`, !/case-studies\/san-ysidro/i.test(html) && !/case-studies\/syh/i.test(html));
  const headClose = html.toLowerCase().indexOf("</head>");
  const afterHead = headClose === -1 ? html : html.slice(headClose + 7);
  const categoryHits = (afterHead.match(/behavioral health workforce platform/gi) || []).length;
  assert(`${file} category phrase in document`, /behavioral health workforce platform/i.test(html));
  assert(`${file} category phrase not stuffed in body`, categoryHits <= 1, `found ${categoryHits}`);
  if (file !== "case-studies.html") {
    assert(`${file} no $700K`, !html.includes("$700K") && !html.includes("$700,000"));
  }
  if (file === "fqhc-telepsychiatry.html" || file === "per-encounter-pps.html") {
    assert(`${file} no PR 18-to-under-2`, !/18 weeks to under 2/i.test(html));
    assert(`${file} no +230`, !html.includes("+230"));
  }
}

const hub = fs.readFileSync("case-studies.html", "utf8");
assert("case-studies has $700K labeled", hub.includes("$700K"));
assert("case-studies Baynard links to Shasta", hub.includes('href="/case-studies/shasta-community-health-center"'));
assert("case-studies Mattson has no SYH URL", !/href="[^"]*san-ysidro/i.test(hub));

const shasta = fs.readFileSync("case-studies/shasta-community-health-center.html", "utf8");
assert("Shasta does not claim 18-to-2", !/Shasta went from 18 weeks to 2/.test(shasta) || shasta.includes("We do not write that Shasta went from 18 weeks to 2"));

console.log("\nCluster is indexed, not chrome");
const htmlFiles = [
  ...fs.readdirSync(".").filter((f) => f.endsWith(".html")),
  ...fs.readdirSync("case-studies").filter((f) => f.endsWith(".html")).map((f) => `case-studies/${f}`),
];
for (const file of htmlFiles) {
  const html = fs.readFileSync(file, "utf8");
  assert(`${file} no For FQHCs nav dropdown`, !/>For FQHCs <span class="nav-login-caret"/.test(html));
  assert(`${file} no For FQHCs footer heading`, !html.includes("<h4>For FQHCs</h4>"));
  assert(`${file} no For FQHCs footer link`, !html.includes(">For FQHCs</a>"));
}

console.log("\nForbidden leftovers");
for (const file of htmlFiles) {
  const html = fs.readFileSync(file, "utf8");
  assert(`${file} no 619-251-3131`, !html.includes("619-251-3131"));
}

if (failed) {
  console.error(`\n${failed} checks failed`);
  process.exit(1);
}
console.log("\nAll site SEO checks passed");
