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

    return env.ASSETS.fetch(request);
  },
};

async function handleBrevoWebhook(request, env) {
  try {
    const { email, firstName, lastName, organization, title } =
      await request.json();

    if (!email) {
      return json({ error: "email is required" }, 400);
    }

    const brevoRes = await fetch("https://api.brevo.com/v3/contacts", {
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
        },
        listIds: [5],
        updateEnabled: true,
      }),
    });

    const body = await brevoRes.text();
    return new Response(body, {
      status: brevoRes.status,
      headers: { "Content-Type": "application/json", ...CORS_HEADERS },
    });
  } catch (err) {
    return json({ error: err.message }, 500);
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

    // Run Brevo and HubSpot updates in parallel
    await Promise.all([
      updateBrevo(email, firstName, lastName, organization, env),
      updateHubSpot(email, firstName, lastName, organization, booking, env),
    ]);

    return webhookJson({ ok: true }, 200);
  } catch (err) {
    console.error("meeting-booked error:", err);
    return webhookJson({ error: err.message }, 500);
  }
}

async function updateBrevo(email, firstName, lastName, organization, env) {
  try {
    const brevoRes = await fetch("https://api.brevo.com/v3/contacts", {
      method: "POST",
      headers: {
        "api-key": env.BREVO_API_KEY,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        email,
        attributes: {
          FIRSTNAME: firstName,
          LASTNAME: lastName,
          COMPANY: organization,
        },
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

async function updateHubSpot(email, firstName, lastName, organization, payload, env) {
  const HS_TOKEN = env.HUBSPOT_TOKEN;
  const hsHeaders = {
    Authorization: `Bearer ${HS_TOKEN}`,
    "Content-Type": "application/json",
  };

  try {
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
      // 4. Contact not found — create it
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
      const createData = await createRes.json();
      console.log("HubSpot create contact:", createRes.status, JSON.stringify(createData));
      contactId = createData.id;
    }

    // 2. Update lifecycle stage and lead status
    const updateRes = await fetch(
      `https://api.hubapi.com/crm/v3/objects/contacts/${contactId}`,
      {
        method: "PATCH",
        headers: hsHeaders,
        body: JSON.stringify({
          properties: {
            lifecyclestage: "salesqualifiedlead",
            hs_lead_status: "OPEN",
          },
        }),
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
  } catch (err) {
    console.error("HubSpot update failed:", err);
  }
}

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
