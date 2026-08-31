import {
  applySeoHeaders,
  isProdMarketingHost,
  notFoundResponse,
  resolveSeoRedirect,
  serveFavicon,
  serveStaticOr404,
  shouldSetHsts,
  toExtensionlessPath,
  toNonTrailingSlashPath,
} from "../src/seo-routing.js";

let passed = 0;
let failed = 0;

function assert(name, condition, detail) {
  if (condition) {
    passed += 1;
    console.log(`  ok  ${name}`);
  } else {
    failed += 1;
    console.error(`  FAIL ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

function url(href) {
  return new URL(href);
}

console.log("SEO routing");

assert(
  "unknown host+path does not throw from resolveSeoRedirect",
  resolveSeoRedirect(url("https://golegara.com/privacy")) === null
);

assert(
  "www → apex 301 preserves path and query",
  (() => {
    const r = resolveSeoRedirect(url("https://www.golegara.com/how-it-works?utm_source=test"));
    return r && r.status === 301 && r.location === "https://golegara.com/how-it-works?utm_source=test";
  })()
);

assert(
  "http → https 301 on apex",
  (() => {
    const r = resolveSeoRedirect(url("http://golegara.com/about"));
    return r && r.status === 301 && r.location === "https://golegara.com/about";
  })()
);

assert(
  "http www combines into one https apex redirect",
  (() => {
    const r = resolveSeoRedirect(url("http://www.golegara.com/contact?ref=1"));
    return r && r.location === "https://golegara.com/contact?ref=1";
  })()
);

assert(
  "localhost http is not forced to https",
  resolveSeoRedirect(url("http://localhost:8787/about")) === null
);

assert(
  "staging host is preserved",
  (() => {
    const r = resolveSeoRedirect(url("https://staging.golegara.com/how-it-works.html"));
    return r && r.location === "https://staging.golegara.com/how-it-works";
  })()
);

assert(
  ".html → extensionless preserves query",
  (() => {
    const r = resolveSeoRedirect(url("https://golegara.com/blog.html?page=2"));
    return r && r.status === 301 && r.location === "https://golegara.com/blog?page=2";
  })()
);

assert(
  "index.html → /",
  (() => {
    const r = resolveSeoRedirect(url("https://golegara.com/index.html"));
    return r && r.location === "https://golegara.com/";
  })()
);

assert(
  "team/index.html → /team",
  (() => {
    const r = resolveSeoRedirect(url("https://golegara.com/team/index.html"));
    return r && r.location === "https://golegara.com/team";
  })()
);

assert(
  "trailing slash drops except root",
  (() => {
    const r = resolveSeoRedirect(url("https://golegara.com/about/"));
    return r && r.location === "https://golegara.com/about";
  })()
);

assert(
  "/next 301s to /how-it-works and keeps query",
  (() => {
    const r = resolveSeoRedirect(url("https://golegara.com/next?utm_source=outreach&utm_medium=email"));
    return r && r.status === 301 && r.location === "https://golegara.com/how-it-works?utm_source=outreach&utm_medium=email";
  })()
);

assert(
  "/next without query does not invent UTMs",
  (() => {
    const r = resolveSeoRedirect(url("https://golegara.com/next"));
    return r && r.location === "https://golegara.com/how-it-works";
  })()
);

assert(
  "/next/ with trailing slash still goes to /how-it-works",
  (() => {
    const r = resolveSeoRedirect(url("https://golegara.com/next/?utm_source=test"));
    return r && r.status === 301 && r.location === "https://golegara.com/how-it-works?utm_source=test";
  })()
);

assert(
  "calculator aliases go to /assessment and keep query",
  (() => {
    const r = resolveSeoRedirect(url("https://golegara.com/roi-calculator.html?foo=1"));
    return r && r.location === "https://golegara.com/assessment?foo=1";
  })()
);

assert(
  "Wix /new-page → /how-it-works",
  (() => {
    const r = resolveSeoRedirect(url("https://golegara.com/new-page"));
    return r && r.location === "https://golegara.com/how-it-works";
  })()
);

assert(
  "/fqhc-telepsychiatry.html → extensionless",
  (() => {
    const r = resolveSeoRedirect(url("https://golegara.com/fqhc-telepsychiatry.html"));
    return r && r.location === "https://golegara.com/fqhc-telepsychiatry";
  })()
);

assert(
  "/psychiatry-wait-times → /fqhc-psychiatry-wait-times",
  (() => {
    const r = resolveSeoRedirect(url("https://golegara.com/psychiatry-wait-times?ref=1"));
    return r && r.location === "https://golegara.com/fqhc-psychiatry-wait-times?ref=1";
  })()
);

assert(
  "/psychiatry-wait-times.html → /fqhc-psychiatry-wait-times (not stripped first)",
  resolveSeoRedirect(url("https://golegara.com/psychiatry-wait-times.html")).location ===
    "https://golegara.com/fqhc-psychiatry-wait-times"
);

assert(
  "/vs-staffing-agency → /vs-locums",
  resolveSeoRedirect(url("https://golegara.com/vs-staffing-agency")).location === "https://golegara.com/vs-locums"
);

assert(
  "/fqhc-behavioral-health-pps → /per-encounter-pps",
  resolveSeoRedirect(url("https://golegara.com/fqhc-behavioral-health-pps")).location === "https://golegara.com/per-encounter-pps"
);

assert(
  "/california-cpom → /fqhc-telepsychiatry",
  resolveSeoRedirect(url("https://golegara.com/california-cpom")).location === "https://golegara.com/fqhc-telepsychiatry"
);

assert(
  "/california-cpom.html → /fqhc-telepsychiatry (not stripped first)",
  resolveSeoRedirect(url("https://golegara.com/california-cpom.html")).location === "https://golegara.com/fqhc-telepsychiatry"
);

assert(
  "/cpom → /fqhc-telepsychiatry",
  resolveSeoRedirect(url("https://golegara.com/cpom")).location === "https://golegara.com/fqhc-telepsychiatry"
);

assert(
  "/cpom.html → /fqhc-telepsychiatry",
  resolveSeoRedirect(url("https://golegara.com/cpom.html")).location === "https://golegara.com/fqhc-telepsychiatry"
);

assert(
  "/corporate-practice-of-medicine-fqhc → /fqhc-telepsychiatry",
  resolveSeoRedirect(url("https://golegara.com/corporate-practice-of-medicine-fqhc")).location === "https://golegara.com/fqhc-telepsychiatry"
);

assert(
  "/corporate-practice-of-medicine-fqhc.html → /fqhc-telepsychiatry",
  resolveSeoRedirect(url("https://golegara.com/corporate-practice-of-medicine-fqhc.html")).location ===
    "https://golegara.com/fqhc-telepsychiatry"
);

assert(
  "/fqhc-hiring-vs-per-encounter → /vs-hiring",
  resolveSeoRedirect(url("https://golegara.com/fqhc-hiring-vs-per-encounter")).location === "https://golegara.com/vs-hiring"
);

assert(
  "/case-studies/shasta-community-health-center.html → extensionless",
  (() => {
    const r = resolveSeoRedirect(url("https://golegara.com/case-studies/shasta-community-health-center.html"));
    return r && r.location === "https://golegara.com/case-studies/shasta-community-health-center";
  })()
);

assert(
  "API POST paths are not redirected (www or html)",
  resolveSeoRedirect(url("https://www.golegara.com/api/brevo-webhook")) === null
);

assert(
  "mta-sts host is not rewritten to apex",
  resolveSeoRedirect(url("https://mta-sts.golegara.com/.well-known/mta-sts.txt")) === null
);

assert("toExtensionlessPath(how-it-works.html)", toExtensionlessPath("/how-it-works.html") === "/how-it-works");
assert("toNonTrailingSlashPath(/)", toNonTrailingSlashPath("/") === null);
assert("isProdMarketingHost www", isProdMarketingHost("www.golegara.com") === true);
assert("HSTS only on https apex/www", shouldSetHsts(url("https://golegara.com/")) === true);
assert("no HSTS on staging", shouldSetHsts(url("https://staging.golegara.com/")) === false);
assert("no HSTS on http", shouldSetHsts(url("http://golegara.com/")) === false);

console.log("\n404 / assets fallthrough");

const missing = notFoundResponse();
assert("inline 404 is HTTP 404", missing.status === 404);
assert(
  "inline 404 is HTML",
  missing.headers.get("Content-Type").includes("text/html")
);

const thrown = await serveStaticOr404(new Request("https://golegara.com/privacy"), {
  ASSETS: {
    fetch: async () => {
      throw new Error("unbound or missing asset");
    },
  },
});
assert("ASSETS.fetch throw → 404 not exception", thrown.status === 404);

const unbound = await serveStaticOr404(new Request("https://golegara.com/terms"), {});
assert("missing ASSETS binding → 404", unbound.status === 404);

const asset404 = await serveStaticOr404(new Request("https://golegara.com/faq"), {
  ASSETS: {
    fetch: async (req) => {
      const path = req instanceof URL ? req.href : typeof req === "string" ? req : req.url;
      if (String(path).includes("/404.html")) {
        return new Response("<h1>static 404</h1>", { status: 200, headers: { "Content-Type": "text/html" } });
      }
      return new Response("missing", { status: 404 });
    },
  },
});
assert("ASSETS 404 uses 404.html body", asset404.status === 404 && (await asset404.text()).includes("static 404"));

const headers = applySeoHeaders(new Response("ok"), url("https://golegara.com/"));
assert(
  "HSTS set on apex HTTPS response",
  headers.headers.get("Strict-Transport-Security") === "max-age=31536000"
);

const stagingHeaders = applySeoHeaders(new Response("ok"), url("https://staging.golegara.com/"));
assert(
  "HSTS not set on staging",
  stagingHeaders.headers.get("Strict-Transport-Security") === null
);

const fav = await serveFavicon(new Request("https://golegara.com/favicon.ico"), {
  ASSETS: {
    fetch: async () => new Response("icon", { status: 200, headers: { "Content-Type": "image/x-icon" } }),
  },
});
assert("favicon served from /img/favicon.ico", fav.status === 200 && (await fav.text()) === "icon");

const favRedirect = await serveFavicon(new Request("https://golegara.com/favicon.ico"), {});
assert(
  "favicon falls back to 301 /img/favicon.ico",
  favRedirect.status === 301 && favRedirect.headers.get("Location").endsWith("/img/favicon.ico")
);

console.log(`\n${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
