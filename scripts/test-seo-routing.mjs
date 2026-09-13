import fs from "fs";
import {
  applySeoHeaders,
  htmlAssetCandidates,
  isProdMarketingHost,
  notFoundResponse,
  resolveSeoRedirect,
  seoRedirectResponse,
  serveFavicon,
  serveStaticOr404,
  shouldSetHsts,
  toExtensionlessPath,
  toNonTrailingSlashPath,
} from "../src/seo-routing.js";

/**
 * Cloudflare Workers static-assets _redirects matcher (first match wins).
 * Placeholders match a single path segment, including dots. 200 is a rewrite.
 */
function parseRedirects(text) {
  const rules = [];
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const parts = trimmed.split(/\s+/);
    if (parts.length < 2) continue;
    rules.push({
      source: parts[0],
      dest: parts[1],
      status: Number(parts[2] || 302),
    });
  }
  return rules;
}

function compilePattern(pattern) {
  const names = [];
  let regex = "^";
  for (let i = 0; i < pattern.length; i += 1) {
    const ch = pattern[i];
    if (ch === ":" && /[A-Za-z]/.test(pattern[i + 1] || "")) {
      let name = "";
      i += 1;
      while (i < pattern.length && /\w/.test(pattern[i])) {
        name += pattern[i];
        i += 1;
      }
      i -= 1;
      names.push(name);
      regex += "([^/]+)";
    } else if (ch === "*") {
      names.push("splat");
      regex += "(.*)";
    } else {
      regex += ch.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    }
  }
  regex += "$";
  return { regex: new RegExp(regex), names };
}

function applyRedirects(rules, pathname) {
  for (const rule of rules) {
    const compiled = compilePattern(rule.source);
    const match = pathname.match(compiled.regex);
    if (!match) continue;
    let dest = rule.dest;
    compiled.names.forEach((name, index) => {
      dest = dest.replaceAll(`:${name}`, match[index + 1]);
    });
    return { source: rule.source, dest, status: rule.status };
  }
  return null;
}

const REDIRECT_RULES = parseRedirects(fs.readFileSync(new URL("../_redirects", import.meta.url), "utf8"));

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
    return r && r.status === 301 && r.status !== 307 && r.location === "https://golegara.com/how-it-works?utm_source=test";
  })()
);

assert(
  "www homepage 301s to https://golegara.com/",
  (() => {
    const r = resolveSeoRedirect(url("https://www.golegara.com/"));
    return r && r.status === 301 && r.location === "https://golegara.com/";
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
  "/roi-calculator.html 301s to /assessment in one hop",
  (() => {
    const r = resolveSeoRedirect(url("https://golegara.com/roi-calculator.html?foo=1"));
    return r && r.status === 301 && r.status !== 307 && r.location === "https://golegara.com/assessment?foo=1";
  })()
);

assert(
  "/roi-calculator 301s to /assessment in one hop",
  (() => {
    const r = resolveSeoRedirect(url("https://golegara.com/roi-calculator?utm=1"));
    return r && r.status === 301 && r.location === "https://golegara.com/assessment?utm=1";
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

console.log("\nCanonical 301s (not 307, absolute Location)");
for (const [href, dest] of [
  ["https://golegara.com/press-legara-launch.html", "https://golegara.com/press-legara-launch"],
  ["https://golegara.com/press.html", "https://golegara.com/press"],
  ["https://golegara.com/contact.html", "https://golegara.com/contact"],
  ["https://golegara.com/partners.html", "https://golegara.com/partners"],
  ["https://golegara.com/about.html", "https://golegara.com/about"],
]) {
  const r = resolveSeoRedirect(url(href));
  assert(
    `${href} → 301 ${dest}`,
    r && r.status === 301 && r.status !== 307 && r.location === dest
  );
}

assert(
  "www + .html is one hop to apex pretty URL",
  (() => {
    const r = resolveSeoRedirect(url("https://www.golegara.com/contact.html?ref=1"));
    return r && r.status === 301 && r.location === "https://golegara.com/contact?ref=1";
  })()
);

assert(
  "www + /roi-calculator.html is one hop to apex /assessment",
  (() => {
    const r = resolveSeoRedirect(url("https://www.golegara.com/roi-calculator.html"));
    return r && r.status === 301 && r.location === "https://golegara.com/assessment";
  })()
);

assert(
  "staging .html stays on staging host",
  (() => {
    const r = resolveSeoRedirect(url("https://staging.golegara.com/press.html"));
    return r && r.status === 301 && r.location === "https://staging.golegara.com/press";
  })()
);

assert(
  "staging www-like host is not rewritten to prod",
  resolveSeoRedirect(url("https://staging.golegara.com/")) === null
);

const built = seoRedirectResponse({
  status: 301,
  location: "https://golegara.com/press",
});
assert("seoRedirectResponse is HTTP 301", built.status === 301);
assert("seoRedirectResponse is not 307", built.status !== 307);
assert(
  "seoRedirectResponse Location is absolute",
  built.headers.get("Location") === "https://golegara.com/press"
);

assert(
  "htmlAssetCandidates maps pretty /about to about.html",
  htmlAssetCandidates("/about").includes("/about.html")
);
assert(
  "htmlAssetCandidates leaves .css alone",
  htmlAssetCandidates("/css/styles.css").join(",") === "/css/styles.css"
);
assert(
  "htmlAssetCandidates(/) is /index.html only",
  htmlAssetCandidates("/").join(",") === "/index.html"
);
assert(
  "htmlAssetCandidates leaves /robots.txt alone (no .html rewrite)",
  htmlAssetCandidates("/robots.txt").join(",") === "/robots.txt"
);
assert(
  "htmlAssetCandidates leaves /sitemap.xml alone (no .html rewrite)",
  htmlAssetCandidates("/sitemap.xml").join(",") === "/sitemap.xml"
);

console.log("\n_redirects must not rewrite robots.txt / sitemap.xml to .html");

const robotsRule = applyRedirects(REDIRECT_RULES, "/robots.txt");
assert(
  "/robots.txt is not rewritten to /robots.txt.html",
  !robotsRule || robotsRule.dest !== "/robots.txt.html",
  robotsRule ? `${robotsRule.source} → ${robotsRule.dest} ${robotsRule.status}` : "no rule"
);
assert(
  "/robots.txt identity 200 keeps the .txt asset",
  robotsRule && robotsRule.status === 200 && robotsRule.dest === "/robots.txt"
);

const sitemapRule = applyRedirects(REDIRECT_RULES, "/sitemap.xml");
assert(
  "/sitemap.xml is not rewritten to /sitemap.xml.html",
  !sitemapRule || sitemapRule.dest !== "/sitemap.xml.html",
  sitemapRule ? `${sitemapRule.source} → ${sitemapRule.dest} ${sitemapRule.status}` : "no rule"
);
assert(
  "/sitemap.xml identity 200 keeps the .xml asset",
  sitemapRule && sitemapRule.status === 200 && sitemapRule.dest === "/sitemap.xml"
);

assert(
  "pretty /about still rewrites to /about.html 200",
  (() => {
    const r = applyRedirects(REDIRECT_RULES, "/about");
    return r && r.status === 200 && r.dest === "/about.html";
  })()
);
assert(
  "/about.html still 301s to /about",
  (() => {
    const r = applyRedirects(REDIRECT_RULES, "/about.html");
    return r && r.status === 301 && r.dest === "/about";
  })()
);
assert(
  "/roi-calculator still 301s to /assessment",
  (() => {
    const r = applyRedirects(REDIRECT_RULES, "/roi-calculator");
    return r && r.status === 301 && r.dest === "/assessment";
  })()
);
assert(
  "/:page without identity would rewrite dotted files (guard against dropping the carve-out)",
  (() => {
    const splatOnly = [{ source: "/:page", dest: "/:page.html", status: 200 }];
    const robots = applyRedirects(splatOnly, "/robots.txt");
    const sitemap = applyRedirects(splatOnly, "/sitemap.xml");
    const css = applyRedirects(splatOnly, "/css/styles.css");
    return (
      robots && robots.dest === "/robots.txt.html" &&
      sitemap && sitemap.dest === "/sitemap.xml.html" &&
      css === null
    );
  })()
);

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

const prettyAbout = await serveStaticOr404(new Request("https://golegara.com/about"), {
  ASSETS: {
    fetch: async (req) => {
      const path = new URL(req instanceof URL ? req.href : typeof req === "string" ? req : req.url).pathname;
      if (path === "/about.html") return new Response("about-ok", { status: 200, headers: { "Content-Type": "text/html" } });
      return new Response("missing", { status: 404 });
    },
  },
});
assert(
  "pretty /about serves about.html when html_handling is none",
  prettyAbout.status === 200 && (await prettyAbout.text()) === "about-ok"
);

function assetsApplyingRedirects(files) {
  return {
    ASSETS: {
      fetch: async (req) => {
        let path = new URL(req instanceof URL ? req.href : typeof req === "string" ? req : req.url).pathname;
        const rule = applyRedirects(REDIRECT_RULES, path);
        if (rule) {
          if (rule.status === 200) path = rule.dest;
          else if (rule.status >= 300 && rule.status < 400) {
            return new Response(null, { status: rule.status, headers: { Location: rule.dest } });
          }
        }
        const hit = files[path];
        if (hit) {
          return new Response(hit.body, { status: 200, headers: { "Content-Type": hit.type } });
        }
        return new Response(files["/404.html"]?.body || "<h1>Page not found</h1>", {
          status: 404,
          headers: { "Content-Type": "text/html" },
        });
      },
    },
  };
}

const ROBOTS_BODY = "User-agent: *\nAllow: /\nSitemap: https://golegara.com/sitemap.xml\n";
const SITEMAP_BODY = '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"></urlset>\n';

const seoAssetFiles = {
  "/robots.txt": { body: ROBOTS_BODY, type: "text/plain; charset=utf-8" },
  "/sitemap.xml": { body: SITEMAP_BODY, type: "application/xml" },
  "/about.html": { body: "about-ok", type: "text/html" },
  "/404.html": { body: "<h1>Page not found</h1><p>That address is not a page on golegara.com.</p>", type: "text/html" },
};

const robotsRes = await serveStaticOr404(new Request("https://golegara.com/robots.txt"), assetsApplyingRedirects(seoAssetFiles));
const robotsBody = await robotsRes.text();
assert(
  "/robots.txt must not 404 through ASSETS _redirects",
  robotsRes.status === 200,
  `status ${robotsRes.status}`
);
assert(
  "/robots.txt is not rewritten to a missing .html page",
  robotsBody === ROBOTS_BODY && !/page not found/i.test(robotsBody)
);
assert(
  "/robots.txt keeps a text content-type",
  (robotsRes.headers.get("Content-Type") || "").includes("text/plain")
);

const sitemapRes = await serveStaticOr404(new Request("https://golegara.com/sitemap.xml"), assetsApplyingRedirects(seoAssetFiles));
const sitemapBody = await sitemapRes.text();
assert(
  "/sitemap.xml must not 404 through ASSETS _redirects",
  sitemapRes.status === 200,
  `status ${sitemapRes.status}`
);
assert(
  "/sitemap.xml is not rewritten to a missing .html page",
  sitemapBody === SITEMAP_BODY && sitemapBody.includes("<urlset") && !/page not found/i.test(sitemapBody)
);
assert(
  "/sitemap.xml keeps an XML content-type",
  /xml/i.test(sitemapRes.headers.get("Content-Type") || "")
);

const prettyViaRedirects = await serveStaticOr404(
  new Request("https://golegara.com/about"),
  assetsApplyingRedirects(seoAssetFiles)
);
assert(
  "pretty /about still works when _redirects identity rules are present",
  prettyViaRedirects.status === 200 && (await prettyViaRedirects.text()) === "about-ok"
);

const HOMEPAGE_H1 = "Your behavioral health demand outgrew the operating model it runs inside.";

function homepageAssets() {
  return {
    ASSETS: {
      fetch: async (req) => {
        const path = new URL(req instanceof URL ? req.href : typeof req === "string" ? req : req.url).pathname;
        if (path === "/" || path === "") {
          return new Response(null, { status: 301, headers: { Location: "/" } });
        }
        // Live splat: /:page.html → /:page turns /index.html into 301 /index.
        if (path === "/index.html") {
          return new Response(null, { status: 301, headers: { Location: "/index" } });
        }
        if (path === "/index") {
          return new Response(`<h1>${HOMEPAGE_H1}</h1>`, { status: 200, headers: { "Content-Type": "text/html" } });
        }
        if (String(path).includes("/404.html")) {
          return new Response("<h1>Page not found</h1><p>That address is not a page on golegara.com.</p>", {
            status: 200,
            headers: { "Content-Type": "text/html" },
          });
        }
        return new Response("missing", { status: 404 });
      },
    },
  };
}

for (const href of [
  "https://golegara.com/",
  "https://golegara.com",
  "https://staging.golegara.com/",
  "https://staging.golegara.com",
]) {
  const parsed = url(href);
  assert(
    `${href} is not a Worker 301 to /`,
    resolveSeoRedirect(parsed) === null
  );
  const page = await serveStaticOr404(new Request(parsed.href), homepageAssets());
  const loc = page.headers.get("Location");
  const body = await page.text();
  assert(
    `${href} homepage is 200, never 301 Location: /`,
    page.status === 200 && page.status !== 301 && loc !== "/"
  );
  assert(
    `${href} homepage body is the homepage, not the 404 page`,
    body.includes(HOMEPAGE_H1) && !/page not found/i.test(body) && !/that address is not a page/i.test(body)
  );
}

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
