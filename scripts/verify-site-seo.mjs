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
];
for (const loc of required) {
  assert(`sitemap ${loc}`, sitemap.includes(`<loc>${loc}</loc>`));
}
assert("sitemap has no .html locs", !/<loc>https:\/\/golegara\.com\/[^<]+\.html<\/loc>/.test(sitemap));
assert("sitemap omits meridian", !sitemap.includes("/meridian"));
assert("sitemap omits team", !sitemap.includes("/team"));
assert("sitemap omits /next", !sitemap.includes("/next"));

console.log("\nForbidden leftovers");
const htmlFiles = fs.readdirSync(".").filter((f) => f.endsWith(".html"));
for (const file of htmlFiles) {
  const html = fs.readFileSync(file, "utf8");
  assert(`${file} no 619-251-3131`, !html.includes("619-251-3131"));
}

if (failed) {
  console.error(`\n${failed} checks failed`);
  process.exit(1);
}
console.log("\nAll site SEO checks passed");
