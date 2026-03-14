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
    templateIds: [7, 8, 9, 10, 11, 12, 13, 14],
    delays: [0, 14, 14, 14, 14, 14, 14, 14],
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

    if (url.pathname === "/api/brevo-events") {
      if (request.method === "OPTIONS") {
        return new Response(null, { status: 204, headers: WEBHOOK_CORS_HEADERS });
      }
      if (request.method === "POST") {
        return handleBrevoEvents(request, env);
      }
      return new Response("Method Not Allowed", { status: 405, headers: WEBHOOK_CORS_HEADERS });
    }

    return env.ASSETS.fetch(request);
  },

  async scheduled(event, env, ctx) {
    ctx.waitUntil(processScheduledEmails(env));
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

// --- Webhook handlers ---

async function handleBrevoWebhook(request, env) {
  try {
    const { email, firstName, lastName, organization, title, utm_source, utm_medium, utm_campaign } =
      await request.json();

    if (!email) {
      return json({ error: "email is required" }, 400);
    }

    // Create/update contact in Brevo on List 5
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
          UTM_SOURCE: utm_source || "",
          UTM_MEDIUM: utm_medium || "",
          UTM_CAMPAIGN: utm_campaign || "",
        },
        listIds: [5],
        updateEnabled: true,
      }),
    });

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

    // Run Brevo and HubSpot updates in parallel
    await Promise.all([
      updateBrevo(email, firstName, lastName, organization, meetingDate, meetingTime, env),
      updateHubSpot(email, firstName, lastName, organization, booking, env),
    ]);

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

// --- Cron: process scheduled emails ---

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
          } else {
            await updateContactSequence(contact.email, "DONE", 0, "", env);
            console.log(`Cron: completed ${contact.email} — marked DONE`);
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
            } else {
              await updateContactSequence(contact.email, "DONE", 0, "", env);
              console.log(`Cron: ${contact.email} finished Seq ${seq}, marked DONE`);
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
