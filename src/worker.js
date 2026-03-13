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

    // Extract email: payload.email or payload.responses.email.value
    const email =
      payload.email ||
      payload.responses?.email?.value;

    if (!email) {
      return webhookJson({ error: "could not extract email from payload" }, 400);
    }

    // Extract name: payload.responses.name.value or payload.attendees[0].name
    const fullName =
      payload.responses?.name?.value ||
      payload.attendees?.[0]?.name ||
      "";
    const nameParts = fullName.trim().split(/\s+/);
    const firstName = nameParts[0] || "";
    const lastName = nameParts.slice(1).join(" ") || "";

    // Extract organization
    const organization = payload.responses?.organization?.value || "";

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

    return webhookJson({ ok: true }, 200);
  } catch (err) {
    console.error("meeting-booked error:", err);
    return webhookJson({ error: err.message }, 500);
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
