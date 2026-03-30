const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

const WEBHOOK_CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

const GA4_MEASUREMENT_ID = "G-GC0KH378ZK";
const DISCOVERY_MEETING_STAGE_ID = "3351448300"; // "Discovery Meeting" in Legara Sales Pipeline
const LEGARA_PIPELINE_ID = "2119437028";

const SEQUENCES = {
  A: {
    name: "Post-Calculator Nurture",
    templateIds: [1, 2, 3, 4],
    delays: [0, 3, 4, 3], // days after previous email: day 0, 3, 7, 10
    nextSequence: "C",
  },
  B: {
    name: "Meeting Confirmation",
    templateIds: [5, 6],
    delays: [0, null], // B1 immediate, B2 is 1 day before meeting (special)
    nextSequence: "DONE",
  },
  C: {
    name: "Long-Term Nurture",
    templateIds: [7, 8, 9, 10, 29, 11, 12, 13, 14],
    delays: [0, 14, 14, 14, 14, 14, 14, 14, 14],
    nextSequence: "DONE",
  },
};

const DEAL_RATE_CARD = {
  lcsw_lmft:    { monthly_gross: 9880, monthly_net: 6587 },   // 260 enc/mo × $38 gross, × $25.33 net
  psychologist:  { monthly_gross: 9880, monthly_net: 6587 },   // 260 enc/mo × $38 gross, × $25.33 net
  pmhnp:         { monthly_gross: 16454, monthly_net: 10969 }, // 433 enc/mo × $38 gross, × $25.33 net
  psychiatrist:  { monthly_gross: 16454, monthly_net: 10969 }, // 433 enc/mo × $38 gross, × $25.33 net
};

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // Redirect www to non-www (SEO: canonical domain)
    // Skip redirect for API routes — 301 converts POST to GET, dropping request bodies
    if (url.hostname === "www.golegara.com" && !url.pathname.startsWith("/api/")) {
      const newUrl = new URL(url);
      newUrl.hostname = "golegara.com";
      return Response.redirect(newUrl.toString(), 301);
    }

    // 301 redirects for old Wix site URLs still indexed by Google
    const wixRedirects = {
      "/new-page": "/how-it-works.html",
      "/new-page-3": "/for-health-centers.html",
      "/new-page-47": "/become-a-provider.html",
    };
    const wixTarget = wixRedirects[url.pathname.toLowerCase()];
    if (wixTarget) {
      return Response.redirect(`https://golegara.com${wixTarget}`, 301);
    }

    // MTA-STS policy file (served from mta-sts.golegara.com)
    if (url.hostname === "mta-sts.golegara.com" && url.pathname === "/.well-known/mta-sts.txt") {
      return new Response(
        `version: STSv1\nmode: testing\nmx: golegara-com.mail.protection.outlook.com\nmax_age: 86400\n`,
        { headers: { "Content-Type": "text/plain" } }
      );
    }

    if (url.pathname === "/api/brevo-webhook") {
      if (request.method === "OPTIONS") {
        return new Response(null, { status: 204, headers: CORS_HEADERS });
      }

      if (request.method === "POST") {
        return handleBrevoWebhook(request, env);
      }

      return new Response("Method Not Allowed", {
        status: 405,
        headers: CORS_HEADERS,
      });
    }

    if (url.pathname === "/api/meeting-booked") {
      if (request.method === "OPTIONS") {
        return new Response(null, { status: 204, headers: WEBHOOK_CORS_HEADERS });
      }

      if (request.method === "POST") {
        return handleMeetingBooked(request, env);
      }

      return new Response("Method Not Allowed", {
        status: 405,
        headers: WEBHOOK_CORS_HEADERS,
      });
    }

    if (url.pathname === "/api/beta-feedback") {
      if (request.method === "OPTIONS") {
        return new Response(null, { status: 204, headers: CORS_HEADERS });
      }
      if (request.method === "POST") {
        return handleBetaFeedback(request, env);
      }
      return new Response("Method Not Allowed", { status: 405, headers: CORS_HEADERS });
    }

    if (url.pathname === "/api/email-report") {
      if (request.method === "OPTIONS") {
        return new Response(null, { status: 204, headers: CORS_HEADERS });
      }
      if (request.method === "POST") {
        return handleEmailReport(request, env);
      }
      return new Response("Method Not Allowed", { status: 405, headers: CORS_HEADERS });
    }

    if (url.pathname === "/api/brevo-events") {
      if (request.method === "OPTIONS") {
        return new Response(null, { status: 204, headers: WEBHOOK_CORS_HEADERS });
      }
      if (request.method === "POST") {
        return handleBrevoEvents(request, env);
      }
      return new Response("Method Not Allowed", { status: 405, headers: WEBHOOK_CORS_HEADERS });
    }

    if (url.pathname === "/api/admin/enroll") {
      if (request.method === "OPTIONS") {
        return new Response(null, { status: 204, headers: CORS_HEADERS });
      }
      if (request.method === "POST") {
        return handleAdminEnroll(request, env);
      }
      return new Response("Method Not Allowed", { status: 405, headers: CORS_HEADERS });
    }

    if (url.pathname === "/api/assessment") {
      if (request.method === "OPTIONS") {
        return new Response(null, { status: 204, headers: CORS_HEADERS });
      }
      if (request.method === "POST") {
        return handleAssessment(request, env);
      }
      return new Response("Method Not Allowed", { status: 405, headers: CORS_HEADERS });
    }

    if (url.pathname === "/api/admin/contact-status") {
      if (request.method === "OPTIONS") {
        return new Response(null, { status: 204, headers: CORS_HEADERS });
      }
      if (request.method === "GET") {
        return handleAdminContactStatus(request, env);
      }
      return new Response("Method Not Allowed", { status: 405, headers: CORS_HEADERS });
    }

    // Short URL redirects for outreach emails
    if (url.pathname.toLowerCase() === "/next") {
      return Response.redirect(
        "https://golegara.com/how-it-works.html?utm_source=outreach&utm_medium=email&utm_campaign=abm_fqhc&utm_content=next_link",
        302
      );
    }

    // Assessment redirects (old calculator URLs → new assessment)
    const assessPath = url.pathname.toLowerCase();
    if (assessPath === "/roi" || assessPath === "/calculator" || assessPath === "/roi-calculator" || assessPath === "/roi-calculator.html") {
      return Response.redirect(
        "https://golegara.com/assessment.html?utm_source=outreach&utm_medium=email&utm_campaign=abm_fqhc&utm_content=assessment_link",
        301
      );
    }

    // ── Team Portal Auth + API ──
    if (url.pathname.startsWith("/team/")) {
      // Auth endpoint (no auth required)
      if (url.pathname === "/team/api/auth" && request.method === "POST") {
        return handleTeamAuth(request, env);
      }

      // All other /team/api/* routes require auth
      if (url.pathname.startsWith("/team/api/")) {
        const cookies = request.headers.get("Cookie") || "";
        const authMatch = cookies.match(/legara_team_auth=([^;]+)/);
        if (!authMatch || authMatch[1] !== env.TEAM_KEY) {
          return json({ error: "Unauthorized" }, 401);
        }

        if (url.pathname === "/team/api/announcements" && request.method === "GET") {
          return handleGetAnnouncements(env);
        }
        if (url.pathname === "/team/api/announcements" && request.method === "POST") {
          const adminKey = request.headers.get("X-Admin-Key");
          if (adminKey !== env.ADMIN_KEY) {
            return json({ error: "Admin access required" }, 403);
          }
          return handlePostAnnouncement(request, env);
        }
        if (url.pathname.match(/^\/team\/api\/announcements\/\d+\/dismiss$/) && request.method === "POST") {
          return handleDismissAnnouncement(request, url, env);
        }
      }

      // Static /team/* files fall through to ASSETS.fetch below
    }

    return env.ASSETS.fetch(request);
  },

  async scheduled(event, env, ctx) {
    ctx.waitUntil((async () => {
      await syncHubSpotSequenceChanges(env);
      await processScheduledEmails(env);
      await recalculateDealRevenue(env);
    })());
  },
};

// --- Transactional email helpers ---

async function sendTransactionalEmail(templateId, to, params, env) {
  const res = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: {
      "api-key": env.BREVO_API_KEY,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      to: [to],
      templateId,
      params,
    }),
  });
  const body = await res.text();
  console.log(`Transactional send template ${templateId} to ${to.email}: ${res.status} ${body}`);
  return res;
}

async function updateContactSequence(email, seq, step, nextSendDate, env) {
  return fetch(`https://api.brevo.com/v3/contacts/${encodeURIComponent(email)}`, {
    method: "PUT",
    headers: {
      "api-key": env.BREVO_API_KEY,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      attributes: {
        SEQ: seq,
        SEQ_STEP: step,
        NEXT_SEND: nextSendDate || "",
      },
    }),
  });
}

function calculateNextSend(delayDays) {
  if (!delayDays) return "";
  return new Date(Date.now() + delayDays * 86400000).toISOString();
}

// --- GA4 Measurement Protocol ---

async function sendGA4Event(eventName, params, email, env, browserClientId) {
  try {
    if (!env.GA4_MP_SECRET) return;
    let clientId;
    if (browserClientId) {
      // Use real browser GA4 client_id for accurate attribution
      clientId = browserClientId;
    } else {
      // Fallback: deterministic client_id from email hash
      const encoder = new TextEncoder();
      const data = encoder.encode(email);
      const hashBuffer = await crypto.subtle.digest("SHA-256", data);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      clientId = hashArray.slice(0, 16).map(b => b.toString(16).padStart(2, "0")).join("");
    }

    await fetch(
      `https://www.google-analytics.com/mp/collect?measurement_id=${GA4_MEASUREMENT_ID}&api_secret=${env.GA4_MP_SECRET}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          client_id: clientId,
          events: [{ name: eventName, params: { ...params, engagement_time_msec: "1" } }],
        }),
      }
    );
    console.log(`GA4 event '${eventName}' sent for ${email}`);
  } catch (err) {
    console.error(`GA4 event failed:`, err);
  }
}

// --- Form validation ---

function validateFormData({ firstName, lastName, organization, title, roi_annual_salary }) {
  var onlyNumbers = /^\d+$/;

  if (!firstName || firstName.trim().length < 2) return { valid: false, reason: "firstName too short" };
  if (!lastName || lastName.trim().length < 2) return { valid: false, reason: "lastName too short" };
  if (!organization || organization.trim().length < 3) return { valid: false, reason: "organization too short" };
  if (!title || title.trim().length < 2) return { valid: false, reason: "title too short" };

  if (onlyNumbers.test(firstName.trim())) return { valid: false, reason: "firstName is only numbers" };
  if (onlyNumbers.test(lastName.trim())) return { valid: false, reason: "lastName is only numbers" };
  if (onlyNumbers.test(organization.trim())) return { valid: false, reason: "organization is only numbers" };
  if (onlyNumbers.test(title.trim())) return { valid: false, reason: "title is only numbers" };

  var salary = Number(roi_annual_salary);
  if (roi_annual_salary && !isNaN(salary)) {
    if (salary > 500000) return { valid: false, reason: "salary too high: " + salary };
    if (salary < 30000) return { valid: false, reason: "salary too low: " + salary };
  }

  return { valid: true, reason: "" };
}

// ── Team Portal Handlers ──

async function handleTeamAuth(request, env) {
  try {
    const { password } = await request.json();
    if (password === env.TEAM_KEY) {
      return new Response(JSON.stringify({ ok: true }), {
        headers: {
          "Content-Type": "application/json",
          "Set-Cookie": `legara_team_auth=${env.TEAM_KEY}; Path=/team/; HttpOnly; Secure; SameSite=Strict; Max-Age=${90 * 86400}`,
        },
      });
    }
    return json({ error: "Incorrect password" }, 401);
  } catch (err) {
    return json({ error: "Invalid request" }, 400);
  }
}

async function handleGetAnnouncements(env) {
  try {
    if (!env.TEAM_DATA) return json([], 200);
    const data = await env.TEAM_DATA.get("announcements", "json");
    return json(data || [], 200);
  } catch (err) {
    return json([], 200);
  }
}

async function handlePostAnnouncement(request, env) {
  try {
    if (!env.TEAM_DATA) return json({ error: "KV not configured" }, 500);
    const { title, body, type } = await request.json();
    if (!title || !body) return json({ error: "title and body required" }, 400);

    const existing = (await env.TEAM_DATA.get("announcements", "json")) || [];
    const announcement = {
      id: Date.now(),
      title,
      body,
      type: type || "info",
      date: new Date().toISOString().split("T")[0],
      read_by: [],
    };
    existing.unshift(announcement);
    const trimmed = existing.slice(0, 20);
    await env.TEAM_DATA.put("announcements", JSON.stringify(trimmed));
    return json({ ok: true, announcement }, 200);
  } catch (err) {
    return json({ error: err.message }, 500);
  }
}

async function handleDismissAnnouncement(request, url, env) {
  try {
    if (!env.TEAM_DATA) return json({ error: "KV not configured" }, 500);
    const idMatch = url.pathname.match(/\/announcements\/(\d+)\/dismiss/);
    if (!idMatch) return json({ error: "Invalid ID" }, 400);
    const id = parseInt(idMatch[1]);

    const { name } = await request.json().catch(() => ({}));
    const existing = (await env.TEAM_DATA.get("announcements", "json")) || [];
    const item = existing.find((a) => a.id === id);
    if (item && name && !item.read_by.includes(name)) {
      item.read_by.push(name);
      await env.TEAM_DATA.put("announcements", JSON.stringify(existing));
    }
    return json({ ok: true }, 200);
  } catch (err) {
    return json({ error: err.message }, 500);
  }
}

// --- Webhook handlers ---

async function handleBrevoWebhook(request, env) {
  try {
    const data = await request.json();

    // Honeypot check: bots fill hidden fields, humans don't
    if (data.website) {
      console.log("Honeypot triggered, silently dropping submission");
      return json({ ok: true }, 200);
    }

    // Turnstile verification
    const cfToken = data["cf-turnstile-response"];
    if (cfToken && env.TURNSTILE_SECRET) {
      const verifyRes = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          secret: env.TURNSTILE_SECRET,
          response: cfToken,
        }),
      });
      const verifyData = await verifyRes.json();
      if (!verifyData.success) {
        console.log("Turnstile verification failed:", JSON.stringify(verifyData));
        return json({ error: "Human verification failed" }, 403);
      }
    }

    const {
      email, firstName, lastName, organization, title, phone,
      utm_source, utm_medium, utm_campaign, utm_content, utm_term,
      roi_provider_type, roi_number_of_providers, roi_annual_salary,
      roi_year_1_savings, roi_3year_savings, roi_internal_cpe_y1,
      roi_legara_rate, roi_mission_advantage, roi_mission_cash_legara,
      roi_calculator_version, ga_client_id
    } = data;

    if (!email) {
      return json({ error: "email is required" }, 400);
    }

    // Server-side form validation (silent rejection for junk submissions)
    const validation = validateFormData({ firstName, lastName, organization, title, roi_annual_salary });
    if (!validation.valid) {
      console.log("Form validation rejected:", email, validation.reason);
      return json({ success: true }, 200);
    }

    // Run Brevo contact creation and HubSpot CRM upsert in parallel
    const [brevoRes, hsResult] = await Promise.all([
      // 1. Create/update contact in Brevo on List 5
      fetch("https://api.brevo.com/v3/contacts", {
        method: "POST",
        headers: {
          "api-key": env.BREVO_API_KEY,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({
          email,
          attributes: {
            FIRSTNAME: firstName || "",
            LASTNAME: lastName || "",
            COMPANY: organization || "",
            JOBTITLE: title || "",
            UTM_SOURCE: utm_source || "",
            UTM_MEDIUM: utm_medium || "",
            UTM_CAMPAIGN: utm_campaign || "",
          },
          listIds: [5],
          updateEnabled: true,
        }),
      }),

      // 2. Create/update HubSpot contact via CRM API (reliable server-side path)
      upsertHubSpotContact(email, {
        firstname: firstName || "",
        lastname: lastName || "",
        company: organization || "",
        jobtitle: title || "",
        phone: phone || "",
        roi_provider_type: roi_provider_type || "",
        roi_organization_name: organization || "",
        roi_number_of_providers: roi_number_of_providers || "1",
        roi_annual_salary: roi_annual_salary || "0",
        roi_year_1_savings: roi_year_1_savings || "0",
        roi_3year_savings: roi_3year_savings || "0",
        roi_internal_cpe_y1: roi_internal_cpe_y1 || "0",
        roi_legara_rate: roi_legara_rate || "155",
        roi_mission_advantage: roi_mission_advantage || "0",
        roi_mission_cash_legara: roi_mission_cash_legara || "0",
        roi_calculator_version: roi_calculator_version || "public",
        ga_client_id: ga_client_id || "",
        utm_campaign: utm_campaign || "",
        utm_medium: utm_medium || "",
        utm_content: utm_content || "",
        utm_term: utm_term || "",
        hs_lead_status: "NEW",
        email_sequence: "calculator_followup",
      }, env),
    ]);

    const body = await brevoRes.text();

    // Send Seq-A1 immediately via transactional API
    const sendParams = {
      FIRSTNAME: firstName || "",
      LASTNAME: lastName || "",
      COMPANY: organization || "",
    };
    await sendTransactionalEmail(
      SEQUENCES.A.templateIds[0],
      { email, name: ((firstName || "") + " " + (lastName || "")).trim() },
      sendParams,
      env
    );

    // Notify Roger of new lead (include ROI data + HubSpot status)
    const savings3yr = roi_3year_savings ? "$" + Number(roi_3year_savings).toLocaleString() : "—";
    const missionAdv = roi_mission_advantage ? "$" + Number(roi_mission_advantage).toLocaleString() : "—";
    let hsStatus;
    if (hsResult && hsResult.success) {
      hsStatus = "✓ " + (hsResult.action || "synced") + " (ID: " + hsResult.contactId + ")";
      if (hsResult.strippedFields) {
        hsStatus += " | Data lost: " + hsResult.strippedFields.join(", ");
      }
    } else {
      hsStatus = "✗ FAILED — " + (hsResult && hsResult.error ? hsResult.error.substring(0, 120) : "unknown error");
    }
    await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: {
        "api-key": env.BREVO_API_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        to: [{ email: "roger@golegara.com", name: "Roger Stellers" }],
        sender: { email: "roger@em.golegara.com", name: "Legara Lead Alert" },
        subject: "New ROI Calculator Lead: " + (firstName || "") + " " + (lastName || "") + " — " + (organization || "Unknown org"),
        htmlContent: "<h2 style='color:#1a6b4a;font-family:sans-serif;'>New Calculator Lead</h2>" +
          "<table style='width:100%;border-collapse:collapse;font-family:sans-serif;font-size:14px;'>" +
          "<tr><td style='padding:10px 12px;border-bottom:1px solid #eee;font-weight:600;width:140px;'>Name</td><td style='padding:10px 12px;border-bottom:1px solid #eee;'>" + (firstName || "") + " " + (lastName || "") + "</td></tr>" +
          "<tr><td style='padding:10px 12px;border-bottom:1px solid #eee;font-weight:600;'>Email</td><td style='padding:10px 12px;border-bottom:1px solid #eee;'>" + email + "</td></tr>" +
          "<tr><td style='padding:10px 12px;border-bottom:1px solid #eee;font-weight:600;'>Organization</td><td style='padding:10px 12px;border-bottom:1px solid #eee;'>" + (organization || "—") + "</td></tr>" +
          "<tr><td style='padding:10px 12px;border-bottom:1px solid #eee;font-weight:600;'>Title</td><td style='padding:10px 12px;border-bottom:1px solid #eee;'>" + (title || "—") + "</td></tr>" +
          "<tr><td style='padding:10px 12px;border-bottom:1px solid #eee;font-weight:600;'>Provider Type</td><td style='padding:10px 12px;border-bottom:1px solid #eee;'>" + (roi_provider_type || "—") + "</td></tr>" +
          "<tr><td style='padding:10px 12px;border-bottom:1px solid #eee;font-weight:600;'>Mission Advantage</td><td style='padding:10px 12px;border-bottom:1px solid #eee;'>" + missionAdv + "</td></tr>" +
          "<tr><td style='padding:10px 12px;border-bottom:1px solid #eee;font-weight:600;'>3-Year Impact</td><td style='padding:10px 12px;border-bottom:1px solid #eee;'>" + savings3yr + "</td></tr>" +
          "<tr><td style='padding:10px 12px;border-bottom:1px solid #eee;font-weight:600;'>Source</td><td style='padding:10px 12px;border-bottom:1px solid #eee;'>" + (utm_source || "direct") + " / " + (utm_medium || "—") + " / " + (utm_campaign || "—") + "</td></tr>" +
          "<tr><td style='padding:10px 12px;border-bottom:1px solid #eee;font-weight:600;'>HubSpot</td><td style='padding:10px 12px;border-bottom:1px solid #eee;'>" + hsStatus + "</td></tr>" +
          "</table>" +
          "<p style='font-family:sans-serif;font-size:13px;color:#666;margin-top:16px;'>This lead just downloaded their ROI report and entered Sequence A. Check <a href=\"https://app.hubspot.com\">HubSpot</a> for full details.</p>",
      }),
    });

    // Set drip state: next email is A2 in 3 days
    await updateContactSequence(
      email,
      "A",
      1,
      calculateNextSend(SEQUENCES.A.delays[1]),
      env
    );

    return new Response(body, {
      status: brevoRes.status,
      headers: { "Content-Type": "application/json", ...CORS_HEADERS },
    });
  } catch (err) {
    return json({ error: err.message }, 500);
  }
}

// --- Assessment (BH Capacity Quiz) handler ---

const ASSESSMENT_BREVO_LIST_ID = 8; // Brevo list for quiz leads (create in Brevo if not exists)

const ABM_TARGET_DOMAINS = [
  "trucare.org", "truecare.org", "clinicasierravista.org", "omnifamilyhealth.org",
  "communicarehealthcenters.org", "olehealth.org", "ravenswood.org", "opendoor.com",
  "santacruzhealth.org", "schealthcenters.org", "mchcinc.org", "snahc.org",
  "goldcoasthealthcenter.org", "eisner.org", "apla.org", "aplahealth.org",
  "hopics.org", "thechildrensclinic.org", "stmaryscenter.org",
  "pomona.org", "pomonacommunityhealthcenter.org", "wfrhn.org", "axishealth.org",
  "cnhp.org", "livhc.org", "petalumahealthcenter.org",
  "marinhealth.org", "west-county-health.org", "rfrhn.org",
  "coastal.org", "cchealth.org", "rivcommhealth.org"
];

const DIMENSION_INSIGHTS = {
  quiz_wait_time: {
    name: "Wait Time", title: "Access Bottleneck",
    body: "You reported wait times of {answer}. Every week beyond two is a week patients either escalate to crisis, disengage entirely, or land in the ED.",
    benchmark: "Benchmark: <2 weeks for new BH appointments. Programs with dedicated capacity infrastructure average 8 days."
  },
  quiz_noshow_rate: {
    name: "No-Show Rate", title: "No-Show Recovery Gap",
    body: "You reported that {answer}. Without active backfill protocols and dedicated scheduling, cancelled slots become unrecoverable dead time.",
    benchmark: "Benchmark: 14% no-show rate with active backfill. Dedicated BH scheduling recovers 40-60% of cancellations same-day."
  },
  quiz_service_scope: {
    name: "Service Scope", title: "Service Line Gap",
    body: "You offer {answer}. Patients who need both therapy and medication management but can only access one create referral leakage.",
    benchmark: "Benchmark: Full-spectrum programs retain 78% of patients vs. 34% for single-service."
  },
  quiz_productivity: {
    name: "Provider Productivity", title: "Utilization Drag",
    body: "You reported that {answer}. The typical salaried FQHC behavioral health provider completes about 1.0-1.5 encounters per hour. That is not a provider problem. It is an infrastructure problem.",
    benchmark: "Benchmark: Purpose-built programs achieve 2.5 enc/hr (PMHNP) and 1.5 enc/hr (therapy) through dedicated operational support."
  },
  quiz_time_to_productive: {
    name: "Time to Productive", title: "Ramp Cost Exposure",
    body: "Getting a new provider productive in {answer} means months of full salary with partial or zero encounter revenue.",
    benchmark: "Benchmark: Purpose-built programs can have providers seeing patients in as few as 6 weeks from signed contract."
  },
  quiz_turnover: {
    name: "Provider Turnover", title: "Replacement Cycle",
    body: "You have lost {answer} in 12 months. Each departure restarts a months-long cycle of recruiting, credentialing, and panel building.",
    benchmark: "Benchmark: Programs with dedicated operational infrastructure maintain <3% annual turnover vs. the ~30% FQHC average."
  },
  quiz_scheduling: {
    name: "Scheduling Model", title: "Scheduling Infrastructure Gap",
    body: "Your behavioral health scheduling is handled by {answer}. BH scheduling has fundamentally different requirements than primary care.",
    benchmark: "Benchmark: Dedicated BH scheduling at a 1:3-4 scheduler-to-provider ratio drives 25-35% higher utilization."
  }
};

const TIER_NEXT_STEPS = {
  Critical: {
    context: "Organizations scoring in the Critical range typically have structural constraints that hiring alone cannot resolve. The gaps are systemic, not situational.",
    items: [
      "Map where your current providers spend non-clinical time. The gap between scheduled hours and completed encounters reveals the structural overhead.",
      "Quantify your true cost per completed encounter, not per provider. Factor in no-shows, ramp time, benefits, and support staff.",
      "Talk to someone who has seen the pattern across multiple health centers. A 30-minute walkthrough of your scores can clarify which gaps are fixable internally and which need a different operating structure."
    ]
  },
  Strained: {
    context: "Organizations scoring in the Strained range are typically doing the right things but hitting structural limits. The demand is there. The intent is there. The operating model is the bottleneck.",
    items: [
      "Identify which of your lowest-scoring dimensions are within your control to fix internally, and which are structural constraints of the employment model.",
      "Calculate what your behavioral health program would look like with 30 more points of effective utilization.",
      "Explore what a purpose-built operating layer looks like running alongside your existing team. Not instead of. Alongside."
    ]
  },
  Moderate: {
    context: "Organizations scoring in the Moderate range have a functional program but are likely leaving capacity on the table. The question is not whether you can serve more patients. It is whether your current infrastructure lets you.",
    items: [
      "Look at your two lowest-scoring dimensions. Those are where incremental investment yields the highest return in patient access.",
      "Benchmark your provider utilization against the 82% standard that purpose-built behavioral health infrastructure achieves.",
      "Consider whether your next capacity expansion should follow the same model as your current one, or whether a different structure could get you there faster with less risk."
    ]
  },
  Strong: {
    context: "Organizations scoring in the Strong range are outperforming most FQHCs on behavioral health capacity. Your infrastructure is working. The question now is scale and sustainability.",
    items: [
      "Pressure-test your weakest 1-2 dimensions. Even strong programs have structural vulnerabilities that show up under growth or turnover.",
      "Model what happens to your capacity metrics if you lose one provider. Strong programs with thin margins become strained programs fast.",
      "Explore whether a blended model (internal staff plus purpose-built external capacity) could protect your metrics while expanding access further."
    ]
  }
};

function scoreDimension(field, value) {
  if (!value) return 50;
  var v = value.toLowerCase();
  var maps = {
    quiz_wait_time: [["under 2", 100], ["2-4", 75], ["1-2 month", 50], ["2-3 month", 25], ["3+", 0]],
    quiz_noshow_rate: [["under 10", 100], ["10-20", 75], ["20-30", 50], ["30-40", 25], ["over 40", 0], ["don't track", 25]],
    quiz_service_scope: [["full spectrum", 100], ["therapy and basic", 75], ["therapy only", 50], ["medication management only", 25], ["limited", 0], ["referral", 0]],
    quiz_productivity: [["consistently", 100], ["generally", 75], ["below target", 50], ["significantly", 25], ["don't track", 25]],
    quiz_time_to_productive: [["under 3", 100], ["3-6", 75], ["6-9", 50], ["9-12", 25], ["over 12", 0]],
    quiz_turnover: [["none", 100], ["1 provider", 75], ["2-3", 50], ["4+", 0], ["trouble", 25]],
    quiz_scheduling: [["dedicated", 100], ["shared scheduling", 75], ["front desk", 50], ["providers manage", 25], ["no formal", 0]]
  };
  var fieldMap = maps[field];
  if (!fieldMap) return 50;
  for (var i = 0; i < fieldMap.length; i++) {
    if (v.includes(fieldMap[i][0])) return fieldMap[i][1];
  }
  return 50;
}

async function handleAssessment(request, env) {
  try {
    const data = await request.json();
    console.log("Assessment handler entered, data keys:", Object.keys(data).join(", "));

    // Honeypot check
    if (data.website) {
      console.log("Assessment honeypot triggered, silently dropping");
      return json({ ok: true }, 200);
    }
    console.log("Assessment: honeypot clear, checking turnstile");

    // Turnstile verification
    const cfToken = data["cf-turnstile-response"];
    if (cfToken && env.TURNSTILE_SECRET) {
      const verifyRes = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          secret: env.TURNSTILE_SECRET,
          response: cfToken,
        }),
      });
      const verifyData = await verifyRes.json();
      if (!verifyData.success) {
        console.log("Assessment Turnstile failed:", JSON.stringify(verifyData));
        return json({ error: "Human verification failed" }, 403);
      }
    }
    console.log("Assessment: turnstile OK, extracting fields");

    const {
      email, firstName, lastName, organization, title, sites,
      utm_source, utm_medium, utm_campaign, utm_content, utm_term,
      quiz_wait_time, quiz_noshow_rate, quiz_service_scope,
      quiz_productivity, quiz_time_to_productive, quiz_turnover,
      quiz_scheduling, quiz_capacity_score, quiz_capacity_tier,
      quiz_version, ga_client_id
    } = data;

    if (!email) {
      return json({ error: "email is required" }, 400);
    }

    // Basic validation (assessment-specific: no salary field)
    const onlyNumbers = /^\d+$/;
    if (!firstName || firstName.trim().length < 2) {
      console.log("Assessment REJECTED: firstName invalid:", JSON.stringify(firstName));
      return json({ ok: true }, 200);
    }
    if (!lastName || lastName.trim().length < 2) {
      console.log("Assessment REJECTED: lastName invalid:", JSON.stringify(lastName));
      return json({ ok: true }, 200);
    }
    if (!organization || organization.trim().length < 3) {
      console.log("Assessment REJECTED: organization invalid:", JSON.stringify(organization));
      return json({ ok: true }, 200);
    }
    if (onlyNumbers.test(firstName.trim()) || onlyNumbers.test(lastName.trim())) {
      console.log("Assessment REJECTED: numeric name:", firstName, lastName);
      return json({ ok: true }, 200);
    }
    console.log("Assessment validation PASSED for:", email, firstName, lastName, organization);

    const emailDomain = email.split("@")[1]?.toLowerCase() || "";
    const isABMTarget = ABM_TARGET_DOMAINS.some(d => emailDomain === d || emailDomain.endsWith("." + d));

    // Run Brevo + HubSpot in parallel
    const [brevoRes, hsResult] = await Promise.all([
      // Brevo: add to assessment-specific list (NOT list 5)
      fetch("https://api.brevo.com/v3/contacts", {
        method: "POST",
        headers: {
          "api-key": env.BREVO_API_KEY,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({
          email,
          attributes: {
            FIRSTNAME: firstName || "",
            LASTNAME: lastName || "",
            COMPANY: organization || "",
            JOBTITLE: title || "",
            UTM_SOURCE: utm_source || "",
            UTM_MEDIUM: utm_medium || "",
            UTM_CAMPAIGN: utm_campaign || "",
            QUIZ_SCORE: quiz_capacity_score || "",
            QUIZ_TIER: quiz_capacity_tier || "",
          },
          listIds: [ASSESSMENT_BREVO_LIST_ID],
          updateEnabled: true,
        }),
      }),

      // HubSpot: upsert with quiz properties
      upsertHubSpotContact(email, {
        firstname: firstName || "",
        lastname: lastName || "",
        company: organization || "",
        jobtitle: title || "",
        quiz_wait_time: quiz_wait_time || "",
        quiz_noshow_rate: quiz_noshow_rate || "",
        quiz_service_scope: quiz_service_scope || "",
        quiz_productivity: quiz_productivity || "",
        quiz_time_to_productive: quiz_time_to_productive || "",
        quiz_turnover: quiz_turnover || "",
        quiz_scheduling: quiz_scheduling || "",
        quiz_capacity_score: quiz_capacity_score || "",
        quiz_capacity_tier: quiz_capacity_tier || "",
        quiz_version: quiz_version || "v1",
        number_of_sites: sites || "",
        ga_client_id: ga_client_id || "",
        utm_campaign: utm_campaign || "",
        utm_medium: utm_medium || "",
        utm_content: utm_content || "",
        utm_term: utm_term || "",
        hs_lead_status: "NEW",
        email_sequence: "assessment_followup",
      }, env),
    ]);

    const brevoBody = await brevoRes.text();
    console.log(`Assessment Brevo: ${brevoRes.status} ${brevoBody}`);

    // GA4 server-side event
    await sendGA4Event("assessment_complete", {
      quiz_score: quiz_capacity_score || "0",
      quiz_tier: quiz_capacity_tier || "",
      organization: organization || "",
    }, email, env, ga_client_id);

    // Admin notification to Roger
    let hsStatus;
    if (hsResult && hsResult.success) {
      hsStatus = "\u2713 " + (hsResult.action || "synced") + " (ID: " + hsResult.contactId + ")";
      if (hsResult.strippedFields) {
        hsStatus += " | Data lost: " + hsResult.strippedFields.join(", ");
      }
    } else {
      hsStatus = "\u2717 FAILED \u2014 " + (hsResult && hsResult.error ? hsResult.error.substring(0, 120) : "unknown error");
    }

    // Create HubSpot note for ABM target accounts
    if (isABMTarget && hsResult && hsResult.contactId) {
      try {
        const noteBody = "ABM TARGET completed BH Capacity Assessment.\n\nScore: " + (quiz_capacity_score || "?") + "/100 (" + (quiz_capacity_tier || "?") + ")\n\nKey responses:\n- Wait time: " + (quiz_wait_time || "?") + "\n- No-show rate: " + (quiz_noshow_rate || "?") + "\n- Turnover: " + (quiz_turnover || "?") + "\n- Scheduling: " + (quiz_scheduling || "?") + "\n\nThis data can be used for personalized follow-up. Check quiz_ properties on the contact record for all 7 dimensions.";
        await fetch("https://api.hubapi.com/crm/v3/objects/notes", {
          method: "POST",
          headers: {
            Authorization: "Bearer " + env.HUBSPOT_TOKEN,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            properties: {
              hs_note_body: noteBody,
              hs_timestamp: new Date().toISOString()
            },
            associations: [{
              to: { id: hsResult.contactId },
              types: [{ associationCategory: "HUBSPOT_DEFINED", associationTypeId: 202 }]
            }]
          })
        });
      } catch (noteErr) {
        console.error("Failed to create ABM assessment note:", noteErr);
      }
    }

    const tierColor = {
      Critical: "#dc2626",
      Strained: "#f59e0b",
      Moderate: "#3b82f6",
      Strong: "#16a34a",
    }[quiz_capacity_tier] || "#666";

    try {
      const alertRes = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: {
        "api-key": env.BREVO_API_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        to: [{ email: "roger@golegara.com", name: "Roger Stellers" }],
        sender: { email: "roger@em.golegara.com", name: "Legara Assessment Alert" },
        subject: (isABMTarget ? "\uD83C\uDFAF ABM TARGET: " : "") + "New Assessment Lead: " + (firstName || "") + " " + (lastName || "") + " \u2014 " + (organization || "Unknown org") + " [" + (quiz_capacity_tier || "?") + " " + (quiz_capacity_score || "?") + "/100]",
        htmlContent: "<h2 style='color:#1a6b4a;font-family:sans-serif;'>New BH Capacity Assessment</h2>" +
          "<div style='font-family:sans-serif;font-size:18px;margin:12px 0 20px;'>" +
          "<span style='font-weight:700;font-size:28px;color:" + tierColor + ";'>" + (quiz_capacity_score || "?") + "/100</span>" +
          " <span style='background:" + tierColor + ";color:#fff;padding:3px 10px;border-radius:4px;font-size:13px;font-weight:600;'>" + (quiz_capacity_tier || "?") + "</span></div>" +
          "<table style='width:100%;border-collapse:collapse;font-family:sans-serif;font-size:14px;'>" +
          "<tr><td style='padding:10px 12px;border-bottom:1px solid #eee;font-weight:600;width:180px;'>Name</td><td style='padding:10px 12px;border-bottom:1px solid #eee;'>" + (firstName || "") + " " + (lastName || "") + "</td></tr>" +
          "<tr><td style='padding:10px 12px;border-bottom:1px solid #eee;font-weight:600;'>Email</td><td style='padding:10px 12px;border-bottom:1px solid #eee;'>" + email + "</td></tr>" +
          "<tr><td style='padding:10px 12px;border-bottom:1px solid #eee;font-weight:600;'>Organization</td><td style='padding:10px 12px;border-bottom:1px solid #eee;'>" + (organization || "\u2014") + "</td></tr>" +
          "<tr><td style='padding:10px 12px;border-bottom:1px solid #eee;font-weight:600;'>Title</td><td style='padding:10px 12px;border-bottom:1px solid #eee;'>" + (title || "\u2014") + "</td></tr>" +
          "<tr><td style='padding:10px 12px;border-bottom:1px solid #eee;font-weight:600;'>Sites</td><td style='padding:10px 12px;border-bottom:1px solid #eee;'>" + (sites || "\u2014") + "</td></tr>" +
          "<tr><td style='padding:10px 12px;border-bottom:1px solid #eee;font-weight:600;'>Source</td><td style='padding:10px 12px;border-bottom:1px solid #eee;'>" + (utm_source || "direct") + " / " + (utm_medium || "\u2014") + " / " + (utm_campaign || "\u2014") + "</td></tr>" +
          "<tr><td style='padding:10px 12px;border-bottom:1px solid #eee;font-weight:600;'>ABM Match</td><td style='padding:10px 12px;border-bottom:1px solid #eee;'>" + (isABMTarget ? "<span style='background:#16a34a;color:#fff;padding:2px 10px;border-radius:4px;font-size:13px;font-weight:600;'>YES \u2014 " + emailDomain + "</span>" : "No match") + "</td></tr>" +
          "</table>" +
          "<h3 style='color:#1a6b4a;font-family:sans-serif;margin-top:24px;'>Quiz Responses</h3>" +
          "<table style='width:100%;border-collapse:collapse;font-family:sans-serif;font-size:14px;'>" +
          "<tr><td style='padding:8px 12px;border-bottom:1px solid #eee;font-weight:600;width:180px;'>Wait Time</td><td style='padding:8px 12px;border-bottom:1px solid #eee;'>" + (quiz_wait_time || "\u2014") + "</td></tr>" +
          "<tr><td style='padding:8px 12px;border-bottom:1px solid #eee;font-weight:600;'>No-Show Rate</td><td style='padding:8px 12px;border-bottom:1px solid #eee;'>" + (quiz_noshow_rate || "\u2014") + "</td></tr>" +
          "<tr><td style='padding:8px 12px;border-bottom:1px solid #eee;font-weight:600;'>Service Scope</td><td style='padding:8px 12px;border-bottom:1px solid #eee;'>" + (quiz_service_scope || "\u2014") + "</td></tr>" +
          "<tr><td style='padding:8px 12px;border-bottom:1px solid #eee;font-weight:600;'>Productivity</td><td style='padding:8px 12px;border-bottom:1px solid #eee;'>" + (quiz_productivity || "\u2014") + "</td></tr>" +
          "<tr><td style='padding:8px 12px;border-bottom:1px solid #eee;font-weight:600;'>Time to Productive</td><td style='padding:8px 12px;border-bottom:1px solid #eee;'>" + (quiz_time_to_productive || "\u2014") + "</td></tr>" +
          "<tr><td style='padding:8px 12px;border-bottom:1px solid #eee;font-weight:600;'>Turnover</td><td style='padding:8px 12px;border-bottom:1px solid #eee;'>" + (quiz_turnover || "\u2014") + "</td></tr>" +
          "<tr><td style='padding:8px 12px;border-bottom:1px solid #eee;font-weight:600;'>Scheduling</td><td style='padding:8px 12px;border-bottom:1px solid #eee;'>" + (quiz_scheduling || "\u2014") + "</td></tr>" +
          "</table>" +
          "<p style='font-family:sans-serif;font-size:13px;color:#666;margin-top:16px;'>HubSpot: " + hsStatus + "</p>" +
          "<p style='font-family:sans-serif;font-size:13px;color:#666;'>This lead completed the BH Capacity Assessment. Check <a href=\"https://app.hubspot.com\">HubSpot</a> for full details.</p>",
      }),
    });
      const alertBody = await alertRes.text();
      console.log("Roger alert email: " + alertRes.status + " " + alertBody);
    } catch (alertErr) {
      console.error("Roger alert email error:", alertErr);
    }

    // Send results summary email to the user
    try {
      const userTierColor = {
        Critical: "#dc2626",
        Strained: "#f59e0b",
        Moderate: "#3b82f6",
        Strong: "#16a34a"
      }[quiz_capacity_tier] || "#666";

      const dimLabels = ["Wait Time", "No-Show Rate", "Service Scope", "Provider Productivity", "Time to Productive", "Provider Turnover", "Scheduling Model"];
      const dimValues = [quiz_wait_time, quiz_noshow_rate, quiz_service_scope, quiz_productivity, quiz_time_to_productive, quiz_turnover, quiz_scheduling];

      const dimRows = dimLabels.map(function(label, i) {
        return "<tr><td style='padding:10px 16px;border-bottom:1px solid #edf2ef;font-weight:500;color:#4a5e54;'>" + label + "</td><td style='padding:10px 16px;border-bottom:1px solid #edf2ef;color:#1c2b24;'>" + (dimValues[i] || "\u2014") + "</td></tr>";
      }).join("");

      // Calculate dimension scores for gap analysis
      const dimFields = ["quiz_wait_time", "quiz_noshow_rate", "quiz_service_scope", "quiz_productivity", "quiz_time_to_productive", "quiz_turnover", "quiz_scheduling"];
      const dimFieldValues = { quiz_wait_time, quiz_noshow_rate, quiz_service_scope, quiz_productivity, quiz_time_to_productive, quiz_turnover, quiz_scheduling };
      const dimScored = dimFields.map(function(f) { return { field: f, score: scoreDimension(f, dimFieldValues[f]), value: dimFieldValues[f] || "" }; });
      const top3Gaps = dimScored.slice().sort(function(a, b) { return a.score - b.score; }).slice(0, 3);

      const gapRows = top3Gaps.map(function(gap, i) {
        var insight = DIMENSION_INSIGHTS[gap.field];
        if (!insight) return "";
        var bodyText = insight.body.replace("{answer}", gap.value);
        var scoreColor = gap.score >= 75 ? "#16a34a" : gap.score >= 50 ? "#3b82f6" : gap.score >= 25 ? "#f59e0b" : "#dc2626";
        return "<div style='margin-bottom:20px;padding:20px;background:#f9fafb;border-radius:8px;border-left:4px solid " + scoreColor + ";'>" +
          "<div style='font-weight:600;color:#1c2b24;font-size:15px;margin-bottom:6px;'>" + (i + 1) + ". " + insight.title + "</div>" +
          "<div style='color:#4a5e54;font-size:14px;line-height:1.6;margin-bottom:8px;'>" + bodyText + "</div>" +
          "<div style='color:#8fa89e;font-size:13px;font-style:italic;'>" + insight.benchmark + "</div>" +
          "</div>";
      }).join("");

      var tierSteps = TIER_NEXT_STEPS[quiz_capacity_tier] || TIER_NEXT_STEPS["Moderate"];
      var nextStepsHtml = "<div style='color:#4a5e54;font-size:14px;line-height:1.7;margin-bottom:16px;'>" + tierSteps.context + "</div>" +
        tierSteps.items.map(function(item, i) {
          return "<table cellpadding='0' cellspacing='0' border='0' style='margin-bottom:14px;'><tr>" +
            "<td style='vertical-align:top;width:28px;padding-right:12px;'><div style='width:28px;height:28px;background:#1a6b4a;color:#fff;border-radius:50%;text-align:center;line-height:28px;font-size:13px;font-weight:600;'>" + (i + 1) + "</div></td>" +
            "<td style='color:#1c2b24;font-size:14px;line-height:1.6;'>" + item + "</td>" +
            "</tr></table>";
        }).join("");

      const userEmailRes = await fetch("https://api.brevo.com/v3/smtp/email", {
        method: "POST",
        headers: {
          "api-key": env.BREVO_API_KEY,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          to: [{ email: email, name: ((firstName || "") + " " + (lastName || "")).trim() }],
          sender: { email: "roger@em.golegara.com", name: "Roger Stellers" },
          replyTo: { email: "roger@golegara.com", name: "Roger Stellers" },
          subject: "Your BH Capacity Assessment Results \u2014 " + (quiz_capacity_score || "?") + "/100",
          htmlContent:
            "<div style='max-width:600px;margin:0 auto;font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif;'>" +
            "<div style='padding:32px 0 24px;border-bottom:2px solid #1a6b4a;margin-bottom:24px;'>" +
            "<img src='https://golegara.com/img/logo.png' alt='Legara' style='height:24px;' />" +
            "</div>" +
            "<p style='font-size:16px;color:#1c2b24;line-height:1.6;margin-bottom:20px;'>" + (firstName || "Hi") + ",</p>" +
            "<p style='font-size:16px;color:#4a5e54;line-height:1.7;margin-bottom:24px;'>Here are your BH Capacity Assessment results. You can share this with your leadership team or reference it in planning conversations.</p>" +
            "<div style='text-align:center;padding:28px;background:#f4faf7;border-radius:12px;margin-bottom:24px;'>" +
            "<div style='font-family:Georgia,serif;font-size:48px;font-weight:700;color:" + userTierColor + ";'>" + (quiz_capacity_score || "?") + "</div>" +
            "<div style='font-size:13px;color:#8fa89e;margin-top:4px;'>out of 100</div>" +
            "<div style='display:inline-block;background:" + userTierColor + ";color:#fff;padding:4px 14px;border-radius:4px;font-size:13px;font-weight:600;margin-top:8px;'>" + (quiz_capacity_tier || "") + "</div>" +
            "</div>" +
            "<h3 style='font-family:Georgia,serif;font-size:18px;color:#1c2b24;margin-bottom:12px;'>Your Dimension Scores</h3>" +
            "<table style='width:100%;border-collapse:collapse;margin-bottom:32px;'>" +
            dimRows +
            "</table>" +
            "<h3 style='font-family:Georgia,serif;font-size:18px;color:#1c2b24;margin:32px 0 16px;'>Where the Gaps Are</h3>" +
            gapRows +
            "<h3 style='font-family:Georgia,serif;font-size:18px;color:#1c2b24;margin:32px 0 16px;'>What Organizations at Your Level Typically Do Next</h3>" +
            nextStepsHtml +
            "<div style='background:#f4faf7;border-radius:12px;padding:24px;margin-bottom:32px;'>" +
            "<h3 style='font-family:Georgia,serif;font-size:16px;color:#1c2b24;margin-bottom:8px;'>Want to walk through these results?</h3>" +
            "<p style='font-size:14px;color:#4a5e54;line-height:1.6;margin-bottom:16px;'>30 minutes with me to map your scores to what other FQHCs with similar profiles have done. No pitch, no proposal.</p>" +
            "<a href='https://cal.com/roger-golegara.com/legara-roi-review' style='display:inline-block;background:#1a6b4a;color:#fff;padding:10px 24px;border-radius:8px;text-decoration:none;font-size:14px;font-weight:600;'>Book a Results Walkthrough</a>" +
            "</div>" +
            "<p style='font-size:13px;color:#8fa89e;line-height:1.6;'>Roger Stellers<br>CEO, Legara<br>760-479-7860<br>GoLegara.com</p>" +
            "</div>",
        }),
      });
      const userEmailBody = await userEmailRes.text();
      console.log("User results email: " + userEmailRes.status + " " + userEmailBody);
    } catch (emailErr) {
      console.error("User results email failed:", emailErr);
    }

    return json({ ok: true }, 200);
  } catch (err) {
    console.error("Assessment handler error:", err);
    return json({ error: err.message }, 500);
  }
}

// --- HubSpot CRM contact upsert (server-side, reliable) ---

let _cachedOwnerId = null;

async function getDefaultOwnerId(hsHeaders) {
  if (_cachedOwnerId) return _cachedOwnerId;
  try {
    const res = await fetch("https://api.hubapi.com/crm/v3/owners?limit=1", {
      headers: hsHeaders,
    });
    const data = await res.json();
    if (data.results && data.results.length > 0) {
      _cachedOwnerId = data.results[0].id;
      console.log(`Cached HubSpot owner ID: ${_cachedOwnerId}`);
    }
  } catch (err) {
    console.error("Failed to fetch HubSpot owner:", err);
  }
  return _cachedOwnerId;
}

async function upsertHubSpotContact(email, properties, env) {
  async function attempt() {
    const HS_TOKEN = env.HUBSPOT_TOKEN;
    const hsHeaders = {
      Authorization: `Bearer ${HS_TOKEN}`,
      "Content-Type": "application/json",
    };

    // Get owner ID for auto-assignment
    const ownerId = await getDefaultOwnerId(hsHeaders);
    if (ownerId) {
      properties.hubspot_owner_id = ownerId;
    }

    // Search for existing contact
    const searchRes = await fetch(
      "https://api.hubapi.com/crm/v3/objects/contacts/search",
      {
        method: "POST",
        headers: hsHeaders,
        body: JSON.stringify({
          filterGroups: [{
            filters: [{ propertyName: "email", operator: "EQ", value: email }],
          }],
        }),
      }
    );
    const searchData = await searchRes.json();

    let contactId;
    let action;

    if (searchData.total > 0) {
      contactId = searchData.results[0].id;
      action = "updated";
      const updateRes = await fetch(
        `https://api.hubapi.com/crm/v3/objects/contacts/${contactId}`,
        {
          method: "PATCH",
          headers: hsHeaders,
          body: JSON.stringify({ properties }),
        }
      );
      if (!updateRes.ok) {
        const errBody = await updateRes.text();
        throw new Error(`Update failed (${updateRes.status}): ${errBody}`);
      }
      console.log(`HubSpot upsert (update) ${email}: ${updateRes.status}`);
    } else {
      action = "created";
      const createRes = await fetch(
        "https://api.hubapi.com/crm/v3/objects/contacts",
        {
          method: "POST",
          headers: hsHeaders,
          body: JSON.stringify({
            properties: { email, ...properties },
          }),
        }
      );
      if (!createRes.ok) {
        const errBody = await createRes.text();
        throw new Error(`Create failed (${createRes.status}): ${errBody}`);
      }
      const createData = await createRes.json();
      contactId = createData.id;
      console.log(`HubSpot upsert (create) ${email}: ${createRes.status}`);
    }

    return { success: true, contactId, action };
  }

  // Safe fields that never cause validation errors
  const SAFE_FIELDS = ["firstname", "lastname", "company", "jobtitle", "phone", "hubspot_owner_id", "hs_lead_status"];

  try {
    return await attempt();
  } catch (firstErr) {
    console.error(`HubSpot upsert attempt 1 failed for ${email}:`, firstErr.message);

    // If it's a 400 validation error, retry with only safe fields
    if (firstErr.message.includes("400")) {
      console.log(`HubSpot: validation error detected, retrying with safe fields only for ${email}`);
      const strippedFields = Object.keys(properties).filter(k => !SAFE_FIELDS.includes(k));
      console.log(`HubSpot: stripping fields: ${strippedFields.join(", ")}`);
      const safeProps = {};
      for (const key of SAFE_FIELDS) {
        if (properties[key] !== undefined) safeProps[key] = properties[key];
      }
      properties = safeProps;
      try {
        const result = await attempt();
        result.strippedFields = strippedFields;
        result.action = (result.action || "synced") + " (safe fields only)";
        return result;
      } catch (safeErr) {
        console.error(`HubSpot safe-field retry also failed for ${email}:`, safeErr.message);
        return { success: false, contactId: null, action: null, error: safeErr.message, strippedFields };
      }
    }

    // Non-validation error: simple retry after 2 seconds
    await new Promise(r => setTimeout(r, 2000));
    try {
      console.log(`HubSpot upsert retry for ${email}...`);
      return await attempt();
    } catch (retryErr) {
      console.error(`HubSpot upsert retry failed for ${email}:`, retryErr.message);
      return { success: false, contactId: null, action: null, error: retryErr.message };
    }
  }
}

async function handleMeetingBooked(request, env) {
  try {
    const payload = await request.json();
    console.log("Cal.com meeting-booked payload:", JSON.stringify(payload));

    // Cal.com wraps booking data inside a "payload" property
    const booking = payload.payload || payload;

    // Extract email
    const email =
      booking.email ||
      booking.responses?.email?.value ||
      booking.attendees?.[0]?.email;

    if (!email) {
      return webhookJson({ error: "could not extract email from payload" }, 400);
    }

    // Extract name
    const fullName =
      booking.responses?.name?.value ||
      booking.attendees?.[0]?.name ||
      "";
    const nameParts = fullName.trim().split(/\s+/);
    const firstName = nameParts[0] || "";
    const lastName = nameParts.slice(1).join(" ") || "";

    // Extract organization
    const organization = booking.responses?.organization?.value || "";

    // Format meeting date/time for Brevo template variables
    const startTime = booking.startTime || "";
    let meetingDate = "";
    let meetingTime = "";
    if (startTime) {
      const dt = new Date(startTime);
      meetingDate = dt.toLocaleString("en-US", {
        weekday: "long",
        month: "long",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
        timeZone: "America/Los_Angeles",
      }) + " PT";
      meetingTime = dt.toLocaleString("en-US", {
        hour: "numeric",
        minute: "2-digit",
        timeZone: "America/Los_Angeles",
      }) + " PT";
    }

    // Run Brevo, HubSpot, and GA4 updates in parallel
    const [, meetingHsResult] = await Promise.all([
      updateBrevo(email, firstName, lastName, organization, meetingDate, meetingTime, env),
      updateHubSpot(email, firstName, lastName, organization, booking, env),
      sendGA4Event("meeting_booked", {
        source: "cal_webhook",
        email_domain: email.split("@")[1] || "unknown",
      }, email, env),
    ]);
    if (meetingHsResult && !meetingHsResult.success) {
      console.error(`HubSpot failed for meeting-booked ${email}: ${meetingHsResult.error}`);
    } else {
      console.log(`HubSpot meeting-booked OK for ${email}: contact ${meetingHsResult?.contactId}`);
    }

    // Send Seq-B1 immediately via transactional API
    const sendParams = {
      FIRSTNAME: firstName || "",
      LASTNAME: lastName || "",
      COMPANY: organization || "",
      MEETING_DATE: meetingDate || "",
      MEETING_TIME: meetingTime || "",
    };
    await sendTransactionalEmail(
      SEQUENCES.B.templateIds[0],
      { email, name: ((firstName || "") + " " + (lastName || "")).trim() },
      sendParams,
      env
    );

    // Set drip state: B2 reminder 1 day before meeting, or +1 day if no date
    let nextSend = calculateNextSend(1);
    if (startTime) {
      nextSend = new Date(new Date(startTime).getTime() - 86400000).toISOString();
    }
    await updateContactSequence(email, "B", 1, nextSend, env);

    return webhookJson({ ok: true }, 200);
  } catch (err) {
    console.error("meeting-booked error:", err);
    return webhookJson({ error: err.message }, 500);
  }
}

async function updateBrevo(email, firstName, lastName, organization, meetingDate, meetingTime, env) {
  try {
    // Only set name/org attributes if we have values — avoid overwriting
    // existing data from the calculator form with empty strings
    const attributes = {
      MEETING_DATE: meetingDate,
      MEETING_TIME: meetingTime,
    };
    if (firstName) attributes.FIRSTNAME = firstName;
    if (lastName) attributes.LASTNAME = lastName;
    if (organization) attributes.COMPANY = organization;

    const brevoRes = await fetch("https://api.brevo.com/v3/contacts", {
      method: "POST",
      headers: {
        "api-key": env.BREVO_API_KEY,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        email,
        attributes,
        listIds: [6],
        unlinkListIds: [5, 7],
        updateEnabled: true,
      }),
    });
    const body = await brevoRes.text();
    console.log("Brevo response:", brevoRes.status, body);
  } catch (err) {
    console.error("Brevo update failed:", err);
  }
}

// Cache pipeline/stage IDs to avoid repeated lookups
let _cachedPipelineId = null;
let _cachedStageId = null;

async function getLegaraPipelineStage(hsHeaders) {
  if (_cachedPipelineId && _cachedStageId) {
    return { pipelineId: _cachedPipelineId, stageId: _cachedStageId };
  }
  try {
    const res = await fetch("https://api.hubapi.com/crm/v3/pipelines/deals", {
      headers: hsHeaders,
    });
    const data = await res.json();
    const pipeline = (data.results || []).find(p => p.label.includes("Legara"));
    if (pipeline) {
      _cachedPipelineId = pipeline.id;
      const stage = pipeline.stages.find(s => s.label.includes("Discovery Meeting"));
      _cachedStageId = stage ? stage.id : pipeline.stages[0]?.id;
      console.log(`Cached pipeline: ${_cachedPipelineId}, stage: ${_cachedStageId}`);
    }
  } catch (err) {
    console.error("Failed to fetch pipeline:", err);
  }
  return { pipelineId: _cachedPipelineId, stageId: _cachedStageId };
}

async function updateHubSpot(email, firstName, lastName, organization, payload, env) {
  async function attempt() {
    const HS_TOKEN = env.HUBSPOT_TOKEN;
    const hsHeaders = {
      Authorization: `Bearer ${HS_TOKEN}`,
      "Content-Type": "application/json",
    };

    // 1. Search for contact by email
    const searchRes = await fetch(
      "https://api.hubapi.com/crm/v3/objects/contacts/search",
      {
        method: "POST",
        headers: hsHeaders,
        body: JSON.stringify({
          filterGroups: [
            {
              filters: [
                { propertyName: "email", operator: "EQ", value: email },
              ],
            },
          ],
        }),
      }
    );
    const searchData = await searchRes.json();
    console.log("HubSpot search:", searchRes.status, JSON.stringify(searchData));

    let contactId;

    if (searchData.total > 0) {
      contactId = searchData.results[0].id;
    } else {
      // Contact not found — create it
      const createRes = await fetch(
        "https://api.hubapi.com/crm/v3/objects/contacts",
        {
          method: "POST",
          headers: hsHeaders,
          body: JSON.stringify({
            properties: {
              email,
              firstname: firstName,
              lastname: lastName,
              company: organization,
            },
          }),
        }
      );
      if (!createRes.ok) {
        const errBody = await createRes.text();
        throw new Error(`Create contact failed (${createRes.status}): ${errBody}`);
      }
      const createData = await createRes.json();
      console.log("HubSpot create contact:", createRes.status, JSON.stringify(createData));
      contactId = createData.id;
    }

    // 2. Update lifecycle stage and lead status
    const ownerId = await getDefaultOwnerId(hsHeaders);
    const updateProps = {
      lifecyclestage: "salesqualifiedlead",
      hs_lead_status: "OPEN",
    };
    if (ownerId) updateProps.hubspot_owner_id = ownerId;

    const updateRes = await fetch(
      `https://api.hubapi.com/crm/v3/objects/contacts/${contactId}`,
      {
        method: "PATCH",
        headers: hsHeaders,
        body: JSON.stringify({ properties: updateProps }),
      }
    );
    console.log("HubSpot update contact:", updateRes.status);

    // 3. Create a note with meeting details
    const startTime = payload.startTime || new Date().toISOString();
    const meetingDate = new Date(startTime).toLocaleString("en-US", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
      timeZoneName: "short",
    });

    const noteRes = await fetch(
      "https://api.hubapi.com/crm/v3/objects/notes",
      {
        method: "POST",
        headers: hsHeaders,
        body: JSON.stringify({
          properties: {
            hs_timestamp: startTime,
            hs_note_body: `Meeting booked: Legara ROI Review (30 min, Zoom) via Cal.com on ${meetingDate}. Contact booked through the automated marketing pipeline.`,
          },
          associations: [
            {
              to: { id: contactId },
              types: [
                {
                  associationCategory: "HUBSPOT_DEFINED",
                  associationTypeId: 202,
                },
              ],
            },
          ],
        }),
      }
    );
    console.log("HubSpot create note:", noteRes.status);

    // 4. Auto-create Deal in Legara Sales Pipeline (stage: Discovery Meeting)
    const { pipelineId, stageId } = await getLegaraPipelineStage(hsHeaders);
    if (pipelineId && contactId) {
      const dealName = `${organization || ((firstName || "") + " " + (lastName || "")).trim()} — ROI Review`;
      const dealProps = {
        dealname: dealName,
        pipeline: pipelineId,
        dealstage: stageId,
        hs_priority: "medium",
      };
      if (ownerId) dealProps.hubspot_owner_id = ownerId;

      const dealRes = await fetch(
        "https://api.hubapi.com/crm/v3/objects/deals",
        {
          method: "POST",
          headers: hsHeaders,
          body: JSON.stringify({
            properties: dealProps,
            associations: [
              {
                to: { id: contactId },
                types: [
                  {
                    associationCategory: "HUBSPOT_DEFINED",
                    associationTypeId: 3, // deal-to-contact
                  },
                ],
              },
            ],
          }),
        }
      );
      console.log("HubSpot create deal:", dealRes.status);
    }

    return { success: true, contactId };
  }

  try {
    return await attempt();
  } catch (firstErr) {
    console.error(`HubSpot meeting-booked attempt 1 failed for ${email}:`, firstErr.message);
    await new Promise(r => setTimeout(r, 2000));
    try {
      console.log(`HubSpot meeting-booked retry for ${email}...`);
      return await attempt();
    } catch (retryErr) {
      console.error(`HubSpot meeting-booked retry failed for ${email}:`, retryErr.message);
      return { success: false, error: retryErr.message };
    }
  }
}

// --- Cron: process scheduled emails ---

// --- HubSpot ↔ Brevo sequence sync (runs in cron before email processing) ---

async function updateHubSpotEmailSequence(email, hsValue, env) {
  try {
    const hsHeaders = { Authorization: `Bearer ${env.HUBSPOT_TOKEN}`, "Content-Type": "application/json" };
    const res = await fetch("https://api.hubapi.com/crm/v3/objects/contacts/search", {
      method: "POST", headers: hsHeaders,
      body: JSON.stringify({ filterGroups: [{ filters: [{ propertyName: "email", operator: "EQ", value: email }] }] }),
    });
    const data = await res.json();
    if (data.total > 0) {
      await fetch(`https://api.hubapi.com/crm/v3/objects/contacts/${data.results[0].id}`, {
        method: "PATCH", headers: hsHeaders,
        body: JSON.stringify({ properties: { email_sequence: hsValue } }),
      });
    }
  } catch (err) {
    console.error(`Failed to update HubSpot email_sequence for ${email}:`, err.message);
  }
}

const HS_TO_BREVO_SEQ = { calculator_followup: "A", long_term_nurture: "C" };
const BREVO_TO_HS_SEQ = { A: "calculator_followup", B: "none", C: "long_term_nurture", DONE: "none" };

async function syncHubSpotSequenceChanges(env) {
  console.log("Sync: checking HubSpot ↔ Brevo sequence alignment...");
  const hsHeaders = { Authorization: `Bearer ${env.HUBSPOT_TOKEN}`, "Content-Type": "application/json" };
  let synced = 0;

  try {
    // Step 1-3: HubSpot → Brevo (contacts with active sequences in HubSpot)
    for (const [hsValue, brevoSeq] of Object.entries(HS_TO_BREVO_SEQ)) {
      const searchRes = await fetch("https://api.hubapi.com/crm/v3/objects/contacts/search", {
        method: "POST", headers: hsHeaders,
        body: JSON.stringify({
          filterGroups: [{ filters: [{ propertyName: "email_sequence", operator: "EQ", value: hsValue }] }],
          properties: ["email", "email_sequence", "firstname", "lastname"],
          limit: 100,
        }),
      });
      const searchData = await searchRes.json();

      for (const contact of (searchData.results || [])) {
        const email = contact.properties.email;
        if (!email) continue;

        try {
          // Check Brevo state
          const brevoRes = await fetch(`https://api.brevo.com/v3/contacts/${encodeURIComponent(email)}`, {
            headers: { "api-key": env.BREVO_API_KEY },
          });

          if (brevoRes.ok) {
            const brevoData = await brevoRes.json();
            const currentSeq = (brevoData.attributes || {}).SEQ;
            if (currentSeq === brevoSeq) continue; // Already in sync
          } else if (brevoRes.status === 404) {
            // Create contact in Brevo
            await fetch("https://api.brevo.com/v3/contacts", {
              method: "POST",
              headers: { "api-key": env.BREVO_API_KEY, "Content-Type": "application/json" },
              body: JSON.stringify({
                email,
                attributes: { FIRSTNAME: contact.properties.firstname || "", LASTNAME: contact.properties.lastname || "" },
                updateEnabled: true,
              }),
            });
          }

          // Update Brevo: set sequence, add to list, remove from others
          await updateContactSequence(email, brevoSeq, 0, new Date().toISOString(), env);
          const targetList = SEQ_TO_LIST[brevoSeq];
          if (targetList) {
            await fetch(`https://api.brevo.com/v3/contacts/lists/${targetList}/contacts/add`, {
              method: "POST",
              headers: { "api-key": env.BREVO_API_KEY, "Content-Type": "application/json" },
              body: JSON.stringify({ emails: [email] }),
            });
            for (const lid of Object.values(SEQ_TO_LIST)) {
              if (lid !== targetList) {
                await fetch(`https://api.brevo.com/v3/contacts/lists/${lid}/contacts/remove`, {
                  method: "POST",
                  headers: { "api-key": env.BREVO_API_KEY, "Content-Type": "application/json" },
                  body: JSON.stringify({ emails: [email] }),
                });
              }
            }
          }
          console.log(`Sync: enrolled ${email} in Seq ${brevoSeq} (from HubSpot ${hsValue})`);
          synced++;
        } catch (err) {
          console.error(`Sync: failed for ${email}:`, err.message);
        }
      }
    }

    // Step 4: Handle HubSpot "none" → stop active Brevo sequences
    // Check Brevo lists for contacts whose HubSpot says "none"
    for (const listId of [5, 6, 7]) {
      let offset = 0;
      let hasMore = true;
      while (hasMore) {
        const res = await fetch(
          `https://api.brevo.com/v3/contacts/lists/${listId}/contacts?limit=50&offset=${offset}`,
          { headers: { "api-key": env.BREVO_API_KEY, "Content-Type": "application/json" } }
        );
        const data = await res.json();
        const contacts = data.contacts || [];

        for (const contact of contacts) {
          const attrs = contact.attributes || {};
          if (!attrs.SEQ || attrs.SEQ === "DONE") continue;

          // Check HubSpot
          try {
            const hsRes = await fetch("https://api.hubapi.com/crm/v3/objects/contacts/search", {
              method: "POST", headers: hsHeaders,
              body: JSON.stringify({
                filterGroups: [{ filters: [{ propertyName: "email", operator: "EQ", value: contact.email }] }],
                properties: ["email_sequence"],
              }),
            });
            const hsData = await hsRes.json();
            if (hsData.total > 0) {
              const hsSeq = hsData.results[0].properties.email_sequence || "none";
              if (hsSeq === "none") {
                // HubSpot says none, Brevo still active: stop it
                await updateContactSequence(contact.email, "DONE", 0, "", env);
                for (const lid of [5, 6, 7]) {
                  await fetch(`https://api.brevo.com/v3/contacts/lists/${lid}/contacts/remove`, {
                    method: "POST",
                    headers: { "api-key": env.BREVO_API_KEY, "Content-Type": "application/json" },
                    body: JSON.stringify({ emails: [contact.email] }),
                  });
                }
                console.log(`Sync: stopped ${contact.email} (HubSpot set to none)`);
                synced++;
              }
            }
          } catch (err) {
            console.error(`Sync: HubSpot check failed for ${contact.email}:`, err.message);
          }
        }

        hasMore = contacts.length === 50;
        offset += 50;
      }
    }

    // Step 5: Reverse sync — Brevo → HubSpot (auto-enrolled contacts)
    for (const listId of [5, 6, 7]) {
      let offset = 0;
      let hasMore = true;
      while (hasMore) {
        const res = await fetch(
          `https://api.brevo.com/v3/contacts/lists/${listId}/contacts?limit=50&offset=${offset}`,
          { headers: { "api-key": env.BREVO_API_KEY, "Content-Type": "application/json" } }
        );
        const data = await res.json();
        const contacts = data.contacts || [];

        for (const contact of contacts) {
          const seq = (contact.attributes || {}).SEQ;
          if (!seq) continue;
          const expectedHs = BREVO_TO_HS_SEQ[seq] || "none";

          try {
            const hsRes = await fetch("https://api.hubapi.com/crm/v3/objects/contacts/search", {
              method: "POST", headers: hsHeaders,
              body: JSON.stringify({
                filterGroups: [{ filters: [{ propertyName: "email", operator: "EQ", value: contact.email }] }],
                properties: ["email_sequence"],
              }),
            });
            const hsData = await hsRes.json();
            if (hsData.total > 0) {
              const currentHs = hsData.results[0].properties.email_sequence || "none";
              if (currentHs !== expectedHs) {
                await fetch(`https://api.hubapi.com/crm/v3/objects/contacts/${hsData.results[0].id}`, {
                  method: "PATCH", headers: hsHeaders,
                  body: JSON.stringify({ properties: { email_sequence: expectedHs } }),
                });
                console.log(`Sync: updated HubSpot for ${contact.email}: email_sequence → ${expectedHs}`);
                synced++;
              }
            }
          } catch (err) {
            console.error(`Sync: reverse sync failed for ${contact.email}:`, err.message);
          }
        }

        hasMore = contacts.length === 50;
        offset += 50;
      }
    }

    console.log(`Sync: complete. ${synced} change(s) synced.`);
  } catch (err) {
    console.error("Sync: fatal error:", err.message);
  }
}

// --- Deal revenue auto-calculator (runs in cron) ---
// Amount field logic: deals owned by commissioned reps (Andy, Aaron) show net revenue.
// Deals owned by non-commissioned team (Roger, Jonathon) show gross revenue.
// monthly_gross_revenue and monthly_net_revenue are always set regardless of owner.

// Commissioned reps: these owners get net revenue in the Amount field.
// Everyone else (Roger, Jonathon, unassigned) gets gross.
// Emails are lowercase for matching against HubSpot owner userId/email.
const COMMISSIONED_REP_EMAILS = [
  'andy@legarainc.com',
  'andy@golegara.com',
  'ajedynak@gmail.com',
  'aaron@galvanizedstrategies.com',
];

async function recalculateDealRevenue(env) {
  const hubspot = (method, path, body) => fetch(`https://api.hubapi.com${path}`, {
    method,
    headers: { 'Authorization': `Bearer ${env.HUBSPOT_TOKEN}`, 'Content-Type': 'application/json' },
    ...(body ? { body: JSON.stringify(body) } : {})
  }).then(r => r.json());

  // Fetch all owners once to build a commissioned rep lookup by owner ID
  const commissionedOwnerIds = new Set();
  try {
    const owners = await hubspot('GET', '/crm/v3/owners?limit=100');
    if (owners?.results) {
      for (const owner of owners.results) {
        const ownerEmail = (owner.email || '').toLowerCase();
        if (COMMISSIONED_REP_EMAILS.includes(ownerEmail)) {
          commissionedOwnerIds.add(owner.id);
        }
      }
    }
  } catch (e) {
    console.log('Deal calc: could not fetch owners, defaulting all deals to gross');
  }

  let allDeals = [];
  let after = undefined;

  while (true) {
    const url = `/crm/v3/objects/deals?limit=100&properties=dealname,provider_type,fte_count,amount,monthly_gross_revenue,monthly_net_revenue,hubspot_owner_id,pipeline${after ? '&after=' + after : ''}`;
    const page = await hubspot('GET', url);
    if (!page.results) break;
    allDeals = allDeals.concat(page.results);
    if (page.paging?.next?.after) {
      after = page.paging.next.after;
    } else {
      break;
    }
  }

  let updated = 0;
  for (const deal of allDeals) {
    const props = deal.properties || {};
    const providerType = props.provider_type;
    const fteCount = parseFloat(props.fte_count) || 1;
    const ownerId = props.hubspot_owner_id || '';
    const currentAmount = parseFloat(props.amount) || 0;
    const currentGross = parseFloat(props.monthly_gross_revenue) || 0;
    const currentNet = parseFloat(props.monthly_net_revenue) || 0;

    if (!providerType || !DEAL_RATE_CARD[providerType]) continue;

    const rate = DEAL_RATE_CARD[providerType];
    const expectedGross = Math.round(rate.monthly_gross * fteCount);
    const expectedNet = Math.round(rate.monthly_net * fteCount);

    // Commissioned reps see net in Amount, everyone else sees gross
    const isCommissioned = commissionedOwnerIds.has(ownerId);
    const expectedAmount = isCommissioned ? expectedNet : expectedGross;

    // Skip if nothing changed
    if (currentAmount === expectedAmount && currentGross === expectedGross && currentNet === expectedNet) continue;

    await hubspot('PATCH', `/crm/v3/objects/deals/${deal.id}`, {
      properties: {
        amount: String(expectedAmount),
        monthly_gross_revenue: String(expectedGross),
        monthly_net_revenue: String(expectedNet),
      }
    });
    const revenueType = isCommissioned ? 'net' : 'gross';
    console.log(`Deal calc: updated "${props.dealname}" — ${providerType} × ${fteCount} FTE = $${expectedAmount}/mo (${revenueType})`);
    updated++;
  }

  if (updated > 0) {
    console.log(`Deal calc: ${updated} deals updated`);
  }
}

async function processScheduledEmails(env) {
  console.log("Cron: checking for scheduled emails...");
  const now = new Date().toISOString();

  // Get contacts from all three lists (5, 6, 7)
  for (const listId of [5, 6, 7]) {
    let offset = 0;
    let hasMore = true;

    while (hasMore) {
      const res = await fetch(
        `https://api.brevo.com/v3/contacts/lists/${listId}/contacts?limit=50&offset=${offset}`,
        {
          headers: {
            "api-key": env.BREVO_API_KEY,
            "Content-Type": "application/json",
          },
        }
      );
      const data = await res.json();
      const contacts = data.contacts || [];

      for (const contact of contacts) {
        const attrs = contact.attributes || {};
        const seq = attrs.SEQ;
        const step = typeof attrs.SEQ_STEP === "number" ? attrs.SEQ_STEP : parseInt(attrs.SEQ_STEP);
        const nextSend = attrs.NEXT_SEND;

        // Skip if no sequence, done, or not due yet
        if (!seq || seq === "DONE" || !nextSend) continue;
        if (new Date(nextSend) > new Date(now)) continue;
        if (!SEQUENCES[seq]) continue;

        const seqConfig = SEQUENCES[seq];

        // Skip if step is beyond the sequence length
        if (step >= seqConfig.templateIds.length) {
          // Transition to next sequence
          if (seqConfig.nextSequence && seqConfig.nextSequence !== "DONE") {
            const nextSeq = SEQUENCES[seqConfig.nextSequence];
            const firstDelay = nextSeq.delays[0] || 0;
            await updateContactSequence(
              contact.email, seqConfig.nextSequence, 0,
              firstDelay === 0 ? now : calculateNextSend(firstDelay), env
            );
            console.log(`Cron: transitioned ${contact.email} from Seq ${seq} to ${seqConfig.nextSequence}`);
            await updateHubSpotEmailSequence(contact.email, BREVO_TO_HS_SEQ[seqConfig.nextSequence] || "none", env);
          } else {
            await updateContactSequence(contact.email, "DONE", 0, "", env);
            console.log(`Cron: completed ${contact.email} — marked DONE`);
            await updateHubSpotEmailSequence(contact.email, "none", env);
          }
          continue;
        }

        const templateId = seqConfig.templateIds[step];
        const params = {
          FIRSTNAME: attrs.FIRSTNAME || "",
          LASTNAME: attrs.LASTNAME || "",
          COMPANY: attrs.COMPANY || "",
          MEETING_DATE: attrs.MEETING_DATE || "",
          MEETING_TIME: attrs.MEETING_TIME || "",
        };

        console.log(`Cron: sending template ${templateId} (Seq ${seq}, step ${step}) to ${contact.email}`);

        try {
          await sendTransactionalEmail(
            templateId,
            { email: contact.email, name: ((attrs.FIRSTNAME || "") + " " + (attrs.LASTNAME || "")).trim() },
            params,
            env
          );

          // Calculate next step
          const nextStep = step + 1;
          if (nextStep >= seqConfig.templateIds.length) {
            // Sequence complete — transition
            if (seqConfig.nextSequence && seqConfig.nextSequence !== "DONE") {
              const nextSeqConfig = SEQUENCES[seqConfig.nextSequence];
              const delay = nextSeqConfig.delays[0] || 14;
              await updateContactSequence(
                contact.email, seqConfig.nextSequence, 0,
                calculateNextSend(delay), env
              );
              console.log(`Cron: ${contact.email} finished Seq ${seq}, transitioning to ${seqConfig.nextSequence}`);
              await updateHubSpotEmailSequence(contact.email, BREVO_TO_HS_SEQ[seqConfig.nextSequence] || "none", env);
            } else {
              await updateContactSequence(contact.email, "DONE", 0, "", env);
              console.log(`Cron: ${contact.email} finished Seq ${seq}, marked DONE`);
              await updateHubSpotEmailSequence(contact.email, "none", env);
            }
          } else {
            const nextDelay = seqConfig.delays[nextStep];
            await updateContactSequence(
              contact.email, seq, nextStep,
              calculateNextSend(nextDelay), env
            );
          }
        } catch (err) {
          console.error(`Cron: failed to send to ${contact.email}:`, err);
        }
      }

      hasMore = contacts.length === 50;
      offset += 50;
    }
  }

  console.log("Cron: scheduled email processing complete");
}

// --- Brevo event webhook → HubSpot notes ---

async function handleBrevoEvents(request, env) {
  try {
    const events = await request.json();
    // Brevo sends an array of events or a single event
    const eventList = Array.isArray(events) ? events : [events];

    for (const event of eventList) {
      const email = event.email;
      const eventType = event.event; // "opened", "click", "hard_bounce", "spam", "delivered"
      const subject = event.subject || "";
      const date = event.date || new Date().toISOString();
      const link = event.link || ""; // for click events

      if (!email || !eventType) continue;

      // Only log meaningful events to HubSpot
      if (!["opened", "click", "hard_bounce", "spam"].includes(eventType)) continue;

      console.log(`Brevo event: ${eventType} from ${email} — "${subject}"`);

      // Look up contact in HubSpot and add a note
      try {
        const HS_TOKEN = env.HUBSPOT_TOKEN;
        const hsHeaders = {
          Authorization: `Bearer ${HS_TOKEN}`,
          "Content-Type": "application/json",
        };

        const searchRes = await fetch(
          "https://api.hubapi.com/crm/v3/objects/contacts/search",
          {
            method: "POST",
            headers: hsHeaders,
            body: JSON.stringify({
              filterGroups: [{
                filters: [{ propertyName: "email", operator: "EQ", value: email }],
              }],
            }),
          }
        );
        const searchData = await searchRes.json();

        if (searchData.total > 0) {
          const contactId = searchData.results[0].id;

          // Build note body based on event type
          let noteBody = "";
          if (eventType === "opened") {
            noteBody = `Email opened: "${subject}" (${new Date(date).toLocaleString("en-US")})`;
          } else if (eventType === "click") {
            noteBody = `Email link clicked: "${subject}" — ${link} (${new Date(date).toLocaleString("en-US")})`;
          } else if (eventType === "hard_bounce") {
            noteBody = `Email hard bounced: "${subject}" (${new Date(date).toLocaleString("en-US")})`;
          } else if (eventType === "spam") {
            noteBody = `Email marked as spam: "${subject}" (${new Date(date).toLocaleString("en-US")})`;
          }

          await fetch("https://api.hubapi.com/crm/v3/objects/notes", {
            method: "POST",
            headers: hsHeaders,
            body: JSON.stringify({
              properties: {
                hs_timestamp: date,
                hs_note_body: noteBody,
              },
              associations: [{
                to: { id: contactId },
                types: [{
                  associationCategory: "HUBSPOT_DEFINED",
                  associationTypeId: 202,
                }],
              }],
            }),
          });

          console.log(`HubSpot note created for ${email}: ${eventType}`);
        } else {
          console.log(`No HubSpot contact found for ${email}, skipping`);
        }
      } catch (hsErr) {
        console.error(`HubSpot update failed for ${email}:`, hsErr);
      }
    }

    return webhookJson({ ok: true }, 200);
  } catch (err) {
    console.error("brevo-events error:", err);
    return webhookJson({ error: err.message }, 500);
  }
}

// --- Email PDF report to lead ---

async function handleEmailReport(request, env) {
  try {
    const { email, firstName, lastName, organization, pdfBase64, filename } = await request.json();

    if (!email || !pdfBase64) {
      return json({ error: "email and pdfBase64 are required" }, 400);
    }

    const res = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: {
        "api-key": env.BREVO_API_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        sender: { name: "Roger Stellers | Legara", email: "roger@em.golegara.com" },
        replyTo: { email: "roger@golegara.com", name: "Roger Stellers" },
        to: [{ email, name: ((firstName || "") + " " + (lastName || "")).trim() }],
        subject: "Your Legara ROI Analysis for " + (organization || "Your Health Center"),
        htmlContent: "<html><body style='font-family: sans-serif; color: #1c2b24; max-width: 600px; margin: 0 auto;'><p style='margin-bottom: 16px;'>Hi " + (firstName || "there") + ",</p><p style='margin-bottom: 16px;'>Your personalized ROI analysis is attached. These results use industry benchmarks. Your organization's real numbers tell a more specific story.</p><p style='margin-bottom: 16px;'>If you'd like to see what the analysis looks like with your actual data, I'd welcome a quick conversation.</p><p style='margin-bottom: 24px;'><a href='https://cal.com/roger-golegara.com/legara-roi-review?utm_source=brevo&utm_medium=email&utm_campaign=roi-pdf-report' style='background: #1a6b4a; color: white; padding: 12px 24px; border-radius: 6px; text-decoration: none; font-weight: 600;'>Schedule a 30-Minute Conversation</a></p><p style='margin-bottom: 4px;'>Roger Stellers</p><p style='color: #4a5e54; font-size: 14px;'>CEO, Legara Inc.</p><p style='color: #8fa89e; font-size: 13px;'>roger@golegara.com | 760-479-7860</p></body></html>",
        params: { FIRSTNAME: firstName || "", ORGNAME: organization || "" },
        attachment: [{ content: pdfBase64, name: filename || "Legara ROI Analysis.pdf" }],
      }),
    });

    const body = await res.text();
    console.log(`Email report to ${email}: ${res.status} ${body}`);

    return json({ ok: true }, 200);
  } catch (err) {
    console.error("email-report error:", err);
    return json({ error: err.message }, 500);
  }
}

// --- Beta feedback handler ---

async function handleBetaFeedback(request, env) {
  try {
    const data = await request.json();
    console.log("Beta feedback received:", JSON.stringify(data));

    // Format as a readable email
    const lines = [
      `<h2 style="color:#1a6b4a;font-family:sans-serif;">Beta Test Feedback</h2>`,
      `<p style="font-family:sans-serif;color:#666;font-size:13px;">Submitted ${new Date(data.submitted_at || Date.now()).toLocaleString("en-US", { timeZone: "America/Los_Angeles" })} PT</p>`,
      `<table style="width:100%;border-collapse:collapse;font-family:sans-serif;font-size:14px;">`,
      row("Tester", data.name),
      row("Device", data.device),
      row("Overall Rating", data.rating_overall ? data.rating_overall + " / 5" : "—"),
      row("Calculator Feedback", data.calculator_feedback),
      row("PDF Worked?", data.pdf_worked),
      row("PDF Feedback", data.pdf_feedback),
      row("Email Received?", data.email_received),
      row("Email Feedback", data.email_feedback),
      row("Booking Worked?", data.booking_worked),
      row("Would Book a Call?", data.would_book),
      row("Biggest Pain Point", data.pain_points),
      row("Best Part", data.best_part),
      row("Anything Else", data.anything_else),
      `</table>`,
      `<p style="font-family:sans-serif;color:#999;font-size:11px;margin-top:16px;">User agent: ${data.user_agent || "unknown"}</p>`,
    ].join("");

    // Send formatted email to Roger via Brevo transactional
    await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: {
        "api-key": env.BREVO_API_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        to: [{ email: "roger@golegara.com", name: "Roger Stellers" }],
        sender: { email: "roger@em.golegara.com", name: "Legara Beta Test" },
        subject: `Beta Feedback: ${data.name || "Anonymous"} — ${data.rating_overall || "?"}/5`,
        htmlContent: lines,
      }),
    });

    return json({ ok: true }, 200);
  } catch (err) {
    console.error("Beta feedback error:", err);
    return json({ error: err.message }, 500);
  }
}

function row(label, value) {
  return `<tr><td style="padding:10px 12px;border-bottom:1px solid #eee;font-weight:600;color:#1c2b24;vertical-align:top;width:180px;">${label}</td><td style="padding:10px 12px;border-bottom:1px solid #eee;color:#4a5e54;">${value || "—"}</td></tr>`;
}

// --- Admin: sequence enrollment ---

const SEQ_TO_LIST = { A: 5, B: 6, C: 7 };
const SEQ_TO_HS = { A: "sequence_a", B: "sequence_b", C: "sequence_c", NONE: "none" };

async function handleAdminEnroll(request, env) {
  try {
    const data = await request.json();
    const { email, sequence, adminKey } = data;

    if (!adminKey || adminKey !== env.ADMIN_KEY) {
      return json({ error: "Unauthorized" }, 401);
    }
    if (!email || !sequence || !["A", "B", "C", "NONE"].includes(sequence)) {
      return json({ error: "email and sequence (A/B/C/NONE) required" }, 400);
    }

    const results = { email, sequence, brevo: null, hubspot: null };

    // Brevo: ensure contact exists, update attributes + lists
    try {
      // Check if contact exists
      const checkRes = await fetch(`https://api.brevo.com/v3/contacts/${encodeURIComponent(email)}`, {
        headers: { "api-key": env.BREVO_API_KEY },
      });
      if (checkRes.status === 404) {
        // Create contact
        await fetch("https://api.brevo.com/v3/contacts", {
          method: "POST",
          headers: { "api-key": env.BREVO_API_KEY, "Content-Type": "application/json" },
          body: JSON.stringify({ email, updateEnabled: true }),
        });
      }

      if (sequence === "NONE") {
        // Clear sequence, remove from all lists
        await fetch(`https://api.brevo.com/v3/contacts/${encodeURIComponent(email)}`, {
          method: "PUT",
          headers: { "api-key": env.BREVO_API_KEY, "Content-Type": "application/json" },
          body: JSON.stringify({ attributes: { SEQ: "DONE", SEQ_STEP: 0, NEXT_SEND: "" } }),
        });
        for (const lid of [5, 6, 7]) {
          await fetch(`https://api.brevo.com/v3/contacts/lists/${lid}/contacts/remove`, {
            method: "POST",
            headers: { "api-key": env.BREVO_API_KEY, "Content-Type": "application/json" },
            body: JSON.stringify({ emails: [email] }),
          });
        }
        results.brevo = "cleared";
      } else {
        const targetList = SEQ_TO_LIST[sequence];
        const otherLists = Object.values(SEQ_TO_LIST).filter(l => l !== targetList);

        await fetch(`https://api.brevo.com/v3/contacts/${encodeURIComponent(email)}`, {
          method: "PUT",
          headers: { "api-key": env.BREVO_API_KEY, "Content-Type": "application/json" },
          body: JSON.stringify({
            attributes: { SEQ: sequence, SEQ_STEP: 0, NEXT_SEND: new Date().toISOString() },
          }),
        });

        await fetch(`https://api.brevo.com/v3/contacts/lists/${targetList}/contacts/add`, {
          method: "POST",
          headers: { "api-key": env.BREVO_API_KEY, "Content-Type": "application/json" },
          body: JSON.stringify({ emails: [email] }),
        });

        for (const lid of otherLists) {
          await fetch(`https://api.brevo.com/v3/contacts/lists/${lid}/contacts/remove`, {
            method: "POST",
            headers: { "api-key": env.BREVO_API_KEY, "Content-Type": "application/json" },
            body: JSON.stringify({ emails: [email] }),
          });
        }
        results.brevo = `enrolled in Seq ${sequence} (List ${targetList})`;
      }
    } catch (err) {
      results.brevo = `error: ${err.message}`;
    }

    // HubSpot: update email_sequence property
    try {
      const hsHeaders = { Authorization: `Bearer ${env.HUBSPOT_TOKEN}`, "Content-Type": "application/json" };
      const searchRes = await fetch("https://api.hubapi.com/crm/v3/objects/contacts/search", {
        method: "POST", headers: hsHeaders,
        body: JSON.stringify({ filterGroups: [{ filters: [{ propertyName: "email", operator: "EQ", value: email }] }] }),
      });
      const searchData = await searchRes.json();
      if (searchData.total > 0) {
        const contactId = searchData.results[0].id;
        await fetch(`https://api.hubapi.com/crm/v3/objects/contacts/${contactId}`, {
          method: "PATCH", headers: hsHeaders,
          body: JSON.stringify({ properties: { email_sequence: SEQ_TO_HS[sequence] } }),
        });
        results.hubspot = `updated (ID: ${contactId})`;
      } else {
        results.hubspot = "contact not found in HubSpot";
      }
    } catch (err) {
      results.hubspot = `error: ${err.message}`;
    }

    console.log(`Admin enroll: ${email} → Seq ${sequence}`, JSON.stringify(results));
    return json(results, 200);
  } catch (err) {
    return json({ error: err.message }, 500);
  }
}

async function handleAdminContactStatus(request, env) {
  try {
    const url = new URL(request.url);
    const email = url.searchParams.get("email");
    const adminKey = url.searchParams.get("adminKey");

    if (!adminKey || adminKey !== env.ADMIN_KEY) {
      return json({ error: "Unauthorized" }, 401);
    }
    if (!email) {
      return json({ error: "email parameter required" }, 400);
    }

    const result = { email, brevo: { exists: false }, hubspot: { exists: false } };

    // Brevo lookup
    try {
      const res = await fetch(`https://api.brevo.com/v3/contacts/${encodeURIComponent(email)}`, {
        headers: { "api-key": env.BREVO_API_KEY },
      });
      if (res.ok) {
        const data = await res.json();
        const attrs = data.attributes || {};
        result.brevo = {
          exists: true,
          seq: attrs.SEQ || null,
          seqStep: attrs.SEQ_STEP != null ? attrs.SEQ_STEP : null,
          nextSend: attrs.NEXT_SEND || null,
          lists: data.listIds || [],
          firstName: attrs.FIRSTNAME || "",
          lastName: attrs.LASTNAME || "",
          company: attrs.COMPANY || "",
        };
      }
    } catch (err) {
      result.brevo = { exists: false, error: err.message };
    }

    // HubSpot lookup
    try {
      const hsHeaders = { Authorization: `Bearer ${env.HUBSPOT_TOKEN}`, "Content-Type": "application/json" };
      const searchRes = await fetch("https://api.hubapi.com/crm/v3/objects/contacts/search", {
        method: "POST", headers: hsHeaders,
        body: JSON.stringify({
          filterGroups: [{ filters: [{ propertyName: "email", operator: "EQ", value: email }] }],
          properties: ["email_sequence", "lifecyclestage", "firstname", "lastname", "company"],
        }),
      });
      const searchData = await searchRes.json();
      if (searchData.total > 0) {
        const c = searchData.results[0];
        result.hubspot = {
          exists: true,
          contactId: c.id,
          emailSequence: c.properties.email_sequence || "none",
          lifecycleStage: c.properties.lifecyclestage || "",
          firstName: c.properties.firstname || "",
          company: c.properties.company || "",
        };
      }
    } catch (err) {
      result.hubspot = { exists: false, error: err.message };
    }

    return json(result, 200);
  } catch (err) {
    return json({ error: err.message }, 500);
  }
}

// --- Response helpers ---

function json(data, status) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...CORS_HEADERS },
  });
}

function webhookJson(data, status) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...WEBHOOK_CORS_HEADERS },
  });
}
