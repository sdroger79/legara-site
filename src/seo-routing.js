/**
 * SEO routing helpers for the Legara marketing Worker.
 * Kept in a separate module so the 404 / host / extensionless rules can be
 * unit-tested without Cloudflare bindings.
 */

export const CANONICAL_HOST = "golegara.com";
export const WWW_HOST = "www.golegara.com";

export const NOT_FOUND_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta name="robots" content="noindex, nofollow">
<title>Page not found | Legara</title>
<style>
  :root { --green: #1a6b4a; --charcoal: #1c2b24; --slate: #4a5e54; --off-white: #fafcfb; }
  body { margin: 0; min-height: 100vh; display: flex; align-items: center; justify-content: center; font-family: "DM Sans", system-ui, sans-serif; background: var(--off-white); color: var(--charcoal); }
  main { text-align: center; padding: 48px 24px; max-width: 480px; }
  h1 { font-size: 28px; margin: 0 0 12px; }
  p { color: var(--slate); line-height: 1.6; margin: 0 0 24px; }
  a { color: var(--green); font-weight: 600; text-decoration: none; }
  a:hover { text-decoration: underline; }
</style>
</head>
<body>
<main>
  <h1>Page not found</h1>
  <p>That address is not a page on golegara.com. Check the URL or head back to the homepage.</p>
  <p><a href="/">Return to Legara</a></p>
</main>
</body>
</html>`;

const WIX_REDIRECTS = {
  "/new-page": "/how-it-works",
  "/new-page-3": "/for-health-centers",
  "/new-page-47": "/become-a-provider",
};

const ASSESSMENT_ALIASES = new Set([
  "/roi",
  "/calculator",
  "/roi-calculator",
  "/roi-calculator.html",
]);

export const CLUSTER_ALIASES = {
  "/psychiatry-wait-times": "/fqhc-psychiatry-wait-times",
  "/psychiatry-wait-times.html": "/fqhc-psychiatry-wait-times",
  "/vs-staffing-agency": "/vs-locums",
  "/vs-staffing-agency.html": "/vs-locums",
  "/fqhc-behavioral-health-pps": "/per-encounter-pps",
  "/fqhc-behavioral-health-pps.html": "/per-encounter-pps",
  "/cpom": "/california-cpom",
  "/cpom.html": "/california-cpom",
  "/corporate-practice-of-medicine-fqhc": "/california-cpom",
  "/corporate-practice-of-medicine-fqhc.html": "/california-cpom",
  "/fqhc-hiring-vs-per-encounter": "/vs-hiring",
  "/fqhc-hiring-vs-per-encounter.html": "/vs-hiring",
};

// Files that must keep their extension (none of the marketing HTML pages).
const KEEP_HTML_AS_FILE = new Set([]);

export function isLocalHost(hostname) {
  const host = String(hostname || "").toLowerCase();
  return host === "localhost" || host === "127.0.0.1";
}

export function isProdMarketingHost(hostname) {
  const host = String(hostname || "").toLowerCase();
  return host === CANONICAL_HOST || host === WWW_HOST;
}

export function shouldSetHsts(url) {
  if (!url || url.protocol !== "https:") return false;
  return isProdMarketingHost(url.hostname);
}

export function skipSeoPathRewrite(pathname) {
  return (
    pathname.startsWith("/api/") ||
    pathname.startsWith("/team/api/") ||
    pathname === "/.well-known/mta-sts.txt"
  );
}

export function toExtensionlessPath(pathname) {
  const path = pathname || "";
  const lower = path.toLowerCase();
  if (!lower.endsWith(".html")) return null;
  if (KEEP_HTML_AS_FILE.has(lower)) return null;
  if (lower === "/index.html") return "/";
  if (lower.endsWith("/index.html")) {
    const dir = path.slice(0, -"/index.html".length);
    return dir || "/";
  }
  return path.slice(0, -".html".length);
}

export function toNonTrailingSlashPath(pathname) {
  if (!pathname || pathname === "/") return null;
  if (!pathname.endsWith("/")) return null;
  if (pathname.startsWith("/api/") || pathname.startsWith("/team/api/")) return null;
  return pathname.replace(/\/+$/, "") || "/";
}

function buildLocation(protocol, hostname, pathname, search) {
  return `${protocol}//${hostname}${pathname}${search || ""}`;
}

/**
 * Decide whether this request should 301/302 before assets or API handlers.
 * Returns { status, location } or null.
 */
export function resolveSeoRedirect(url) {
  if (!url || !url.pathname) return null;

  const pathname = url.pathname;
  const pathnameLower = pathname.toLowerCase();
  const search = url.search || "";
  const hostnameLower = String(url.hostname || "").toLowerCase();

  if (skipSeoPathRewrite(pathname)) return null;

  let protocol = url.protocol;
  let hostname = url.hostname;
  let hostChanged = false;

  if (protocol === "http:" && !isLocalHost(hostnameLower)) {
    protocol = "https:";
    hostChanged = true;
  }

  if (hostnameLower === WWW_HOST) {
    hostname = CANONICAL_HOST;
    protocol = "https:";
    hostChanged = true;
  }

  const pathNorm = pathnameLower.replace(/\/+$/, "") || "/";
  if (pathNorm === "/next") {
    return {
      status: 301,
      location: buildLocation(protocol, hostname, "/how-it-works", search),
    };
  }

  const wixTarget = WIX_REDIRECTS[pathnameLower];
  if (wixTarget) {
    return {
      status: 301,
      location: buildLocation(protocol, hostname, wixTarget, search),
    };
  }

  if (ASSESSMENT_ALIASES.has(pathnameLower) || ASSESSMENT_ALIASES.has(pathNorm)) {
    return {
      status: 301,
      location: buildLocation(protocol, hostname, "/assessment", search),
    };
  }

  const clusterTarget = CLUSTER_ALIASES[pathnameLower] || CLUSTER_ALIASES[pathNorm];
  if (clusterTarget) {
    return {
      status: 301,
      location: buildLocation(protocol, hostname, clusterTarget, search),
    };
  }

  const extensionless = toExtensionlessPath(pathname);
  if (extensionless && extensionless !== pathname) {
    return {
      status: 301,
      location: buildLocation(protocol, hostname, extensionless, search),
    };
  }

  const noSlash = toNonTrailingSlashPath(pathname);
  if (noSlash && noSlash !== pathname) {
    return {
      status: 301,
      location: buildLocation(protocol, hostname, noSlash, search),
    };
  }

  if (hostChanged) {
    return {
      status: 301,
      location: buildLocation(protocol, hostname, pathname, search),
    };
  }

  return null;
}

export function notFoundResponse() {
  return new Response(NOT_FOUND_HTML, {
    status: 404,
    headers: { "Content-Type": "text/html;charset=UTF-8" },
  });
}

export function applySeoHeaders(response, url) {
  if (!response) return notFoundResponse();
  const headers = new Headers(response.headers);
  if (shouldSetHsts(url)) {
    headers.set("Strict-Transport-Security", "max-age=31536000");
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

export async function serveStaticOr404(request, env) {
  try {
    if (!env || !env.ASSETS || typeof env.ASSETS.fetch !== "function") {
      return notFoundResponse();
    }
    const res = await env.ASSETS.fetch(request);
    if (res && res.status === 404) {
      try {
        const page = await env.ASSETS.fetch(new Request(new URL("/404.html", request.url)));
        if (page && page.ok) {
          return new Response(page.body, {
            status: 404,
            headers: { "Content-Type": "text/html;charset=UTF-8" },
          });
        }
      } catch {
        // Fall through to the inline 404.
      }
      return notFoundResponse();
    }
    return res || notFoundResponse();
  } catch {
    return notFoundResponse();
  }
}

export async function serveFavicon(request, env) {
  try {
    if (env && env.ASSETS && typeof env.ASSETS.fetch === "function") {
      const fav = await env.ASSETS.fetch(new URL("/img/favicon.ico", request.url));
      if (fav && fav.ok) {
        const headers = new Headers(fav.headers);
        headers.set("Content-Type", "image/x-icon");
        return new Response(fav.body, { status: 200, headers });
      }
    }
  } catch {
    // Fall through to redirect.
  }
  const dest = new URL(request.url);
  dest.pathname = "/img/favicon.ico";
  dest.search = "";
  if (dest.hostname.toLowerCase() === WWW_HOST) dest.hostname = CANONICAL_HOST;
  if (dest.protocol === "http:" && !isLocalHost(dest.hostname)) dest.protocol = "https:";
  return Response.redirect(dest.toString(), 301);
}
