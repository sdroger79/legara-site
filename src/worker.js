const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "https://golegara.com",
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

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

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

    if (url.pathname === "/api/admin/contact-status") {
      if (request.method === "OPTIONS") {
        return new Response(null, { status: 204, headers: CORS_HEADERS });
      }
      if (request.method === "GET") {
        return handleAdminContactStatus(request, env);
      }
      return new Response("Method Not Allowed", { status: 405, headers: CORS_HEADERS });
    }

    return env.ASSETS.fetch(request);
  },

  async scheduled(event, env, ctx) {
    ctx.waitUntil((async () => {
      await syncHubSpotSequenceChanges(env);
      await processScheduledEmails(env);
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

async function sendGA4Event(eventName, params, email, env) {
  try {
    if (!env.GA4_MP_SECRET) return;
    // Deterministic client_id from email hash
    const encoder = new TextEncoder();
    const data = encoder.encode(email);
    const hashBuffer = await crypto.subtle.digest("SHA-256", data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const clientId = hashArray.slice(0, 16).map(b => b.toString(16).padStart(2, "0")).join("");

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
      roi_calculator_version
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
        sender: { email: "roger@golegara.com", name: "Legara Lead Alert" },
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
        sender: { name: "Roger Stellers | Legara", email: "roger@golegara.com" },
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
        sender: { email: "roger@golegara.com", name: "Legara Beta Test" },
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
