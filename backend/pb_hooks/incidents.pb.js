/// <reference path="../pb_data/types.d.ts" />
//
// Operator actions on incidents.
//   POST /api/pw/notify    notify the team (SMS, email, Slack)
//   POST /api/pw/resolve   close an incident (AI summary + optional WordPress post)
// Both require an active admin or operator.
//
// Anything that talks to the outside world (SMS, Slack, Anthropic, WordPress)
// lives here on the server so API keys never reach the browser. The browser
// calls these routes through web/src/api/functions.js.

// ---- Notify the team --------------------------------------------------------
// Sends one message to Slack plus every active volunteer by SMS and/or email, and
// returns what happened for each so the screen can show it.
routerAdd("POST", "/api/pw/notify", (e) => {
  const u = require(`${__hooks}/lib/util.js`);
  const notify = require(`${__hooks}/lib/notify.js`);
  const slack = require(`${__hooks}/lib/slack.js`);

  const user = u.requireRole(e, ["admin", "operator"]);
  const body = e.requestInfo().body || {};
  // The caller may send a ready-made message, or just the details to fill the template with.
  const message = u.trunc(body.message, 1000);
  const nature = u.trunc(body.nature, 5000);
  if (!message && !nature) {
    throw new BadRequestError("message or nature is required.");
  }

  const incidentId = body.incident_id ? String(body.incident_id) : "";
  if (incidentId) {
    try { $app.findRecordById("incidents", incidentId); } catch (_) { throw new NotFoundError("Incident not found."); }
  }

  const cfg = u.settings(); // non-secret settings (template, Slack channel)
  const text = message || notify.buildAlertMessage(
    u.setting(cfg, "notification_template"),
    u.trunc(body.repeater_name, 200),
    u.trunc(body.alert_type, 200) || "Operator Notice",
    nature
  );

  // Keep each delivery outcome so one failure does not hide the others.
  // Volunteers are contacted one after another, so a very large team is slow.
  const results = [];
  const sl = slack.postMessage(u.setting(cfg, "slack_channel"), text);
  results.push({ channel: "slack", ok: sl.ok, error: sl.error });

  const team = notify.activeVolunteers();
  for (let i = 0; i < team.length; i++) {
    const v = team[i];
    if (v.notify_sms && v.phone) {
      const r = notify.sendSms(v.phone, text);
      results.push({ volunteer: v.name, channel: "sms", ok: r.ok, status: r.status, error: r.error });
    }
    if (v.notify_email && v.email) {
      const r = notify.sendEmail(v.email, "GMRS Priority Watch - " + (u.trunc(body.repeater_name, 200) || "Notice"), text);
      results.push({ volunteer: v.name, channel: "email", ok: r.ok, error: r.error });
    }
  }
  if (!results.some((r) => r.channel === "sms")) {
    results.push({ channel: "sms", ok: false, error: "No active volunteers have SMS enabled and a phone number." });
  }

  const notified = results.filter((r) => r.ok).length;
  const failed = results.filter((r) => !r.ok).length;

  // If this came from an incident screen, write what happened into its log.
  if (incidentId) {
    const problems = results
      .filter((r) => !r.ok)
      .map((r) => r.channel + (r.volunteer ? " (" + r.volunteer + ")" : "") + ": " + (r.error || "Failed"))
      .join("; ");
    u.logUpdate(
      incidentId,
      u.displayName(user),
      "Team notification attempted: " + notified + " accepted, " + failed + " failed. " + problems + "\n" + text,
      "note"
    );
  }

  return e.json(200, {
    status: failed ? (notified ? "partial" : "failed") : "ok",
    notified: notified,
    failed: failed,
    results: results,
  });
});

// ---- Resolve an incident ----------------------------------------------------
// Order of work: (1) false alarm shortcut, (2) build a prompt from the incident
// and its log, (3) ask Anthropic for a write-up, (4) post that to WordPress,
// (5) mark the incident resolved. Steps 3 and 4 are optional and a failure in
// either still closes the incident.
routerAdd("POST", "/api/pw/resolve", (e) => {
  const u = require(`${__hooks}/lib/util.js`);

  const user = u.requireRole(e, ["admin", "operator"]);
  const body = e.requestInfo().body || {};
  const incidentId = String(body.incident_id || "");
  if (!incidentId) throw new BadRequestError("incident_id is required.");

  let incident;
  try { incident = $app.findRecordById("incidents", incidentId); } catch (_) { throw new NotFoundError("Incident not found."); }
  if (incident.getString("status") === "resolved") {
    throw new BadRequestError("This incident is already resolved.");
  }
  const operator = u.displayName(user);
  const nowIso = new Date().toISOString();

  // False alarm: close and log, no summary and no WordPress post.
  if (body.false_alarm) {
    incident.set("status", "resolved");
    incident.set("ai_summary", "Closed as false alarm - no action required.");
    incident.set("wordpress_post_url", "");
    incident.set("resolved_date", nowIso);
    $app.save(incident);
    u.logUpdate(incidentId, operator, "Incident closed as false alarm. Not posted to WordPress.", "resolution");
    return e.json(200, { status: "ok", incident_id: incidentId, false_alarm: true });
  }

  // Timeline for the summary (newest first, as before).
  const updates = $app.findRecordsByFilter("incident_updates", "incident_id = {:id}", "-created_date", 200, 0, { id: incidentId });
  const timeline = updates
    .map((r) => "[" + r.getString("action_type") + "] " + r.getString("operator_name") + ": " + r.getString("message"))
    .join("\n");
  const repeaters = u.repeaterNames(incident).join(", ");

  // The text sent to the AI. Edit this to change the tone or layout of reports.
  const prompt =
    "You are the summarizer for a GMRS Priority Watch emergency coordination system.\n" +
    "Generate a clear, professional incident report suitable for public posting on a ham-radio community site.\n\n" +
    "Incident details:\n" +
    "- Repeater: " + (repeaters || "unknown") + "\n" +
    "- Alert type: " + incident.getString("alert_type") + "\n" +
    "- Category: " + (incident.getString("incident_category") || "unspecified") + "\n" +
    "- Subtype: " + (incident.getString("incident_subtype") || "unspecified") + "\n" +
    "- Caller info: " + (incident.getString("caller_info") || "unknown") + "\n" +
    "- Location: " + (incident.getString("location_info") || "unknown") + "\n" +
    "- Nature: " + (incident.getString("nature") || "unspecified") + "\n" +
    "- Operator summary: " + (incident.getString("summary") || "none") + "\n\n" +
    "Logged event timeline (newest first):\n" + (timeline || "No events logged.") + "\n\n" +
    "Write the report in two parts:\n" +
    "1. A short title (one line).\n" +
    "2. A concise narrative summary (3-6 paragraphs) covering what happened, actions taken, and resolution.\n" +
    "Do not include personal phone numbers. Use plain text.";

  // AI summary (Anthropic API). Without a key or on failure we keep an internal
  // plain summary and do NOT publish it, since raw log text may hold private details.
  let aiSummary = "";
  let aiOk = false;
  const key = u.env("ANTHROPIC_API_KEY").trim();
  if (key) {
    try {
      const res = $http.send({
        url: u.env("ANTHROPIC_API_URL", "https://api.anthropic.com/v1/messages"),
        method: "POST",
        headers: { "content-type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
        body: JSON.stringify({
          model: u.env("ANTHROPIC_MODEL", "claude-sonnet-5-5"),
          max_tokens: 1500,
          messages: [{ role: "user", content: prompt }],
        }),
        timeout: 90,
      });
      if (res.statusCode >= 200 && res.statusCode < 300 && res.json && res.json.content) {
        aiSummary = res.json.content.filter((b) => b.type === "text").map((b) => b.text).join("\n").trim();
        aiOk = aiSummary !== "";
      }
    } catch (_) {}
  }
  if (!aiOk) {
    aiSummary =
      "Incident report - " + (repeaters || "unknown repeater") + "\n" +
      "Type: " + incident.getString("alert_type") + "\n" +
      "Nature: " + (incident.getString("nature") || "unspecified") + "\n\nLog (newest first):\n" +
      (timeline || "No events logged.");
  }

  // Split title from body (first line is the title).
  const lines = aiSummary.split("\n").filter((l) => l.trim() !== "");
  const title = (lines[0] || "").replace(/^#+\s*/, "").slice(0, 120) || ("Incident Report - " + repeaters);
  const content = lines.slice(1).join("\n\n") || aiSummary;

  // Publish to WordPress (only an AI-written summary is published). The site
  // address and user come from Settings; the application password is a server secret.
  const cfg = u.settings();
  const wpUrl = u.setting(cfg, "wordpress_url");
  const wpUser = u.setting(cfg, "wordpress_username");
  const wpPass = u.env("WORDPRESS_APP_PASSWORD");
  let wordpressPostUrl = "";
  if (aiOk && wpUrl && wpUser && wpPass) {
    try {
      const res = $http.send({
        url: wpUrl.replace(/\/$/, "") + "/wp-json/wp/v2/posts",
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: "Basic " + Buffer.from(wpUser + ":" + wpPass).toString("base64"),
        },
        body: JSON.stringify({ title: title, content: content, status: u.env("WORDPRESS_POST_STATUS", "publish") }),
        timeout: 30,
      });
      if (res.statusCode >= 200 && res.statusCode < 300 && res.json) {
        wordpressPostUrl = res.json.link || "";
      }
    } catch (_) { /* still resolve the incident */ }
  }

  // Close the incident. After this the collection rules block further edits.
  incident.set("status", "resolved");
  incident.set("ai_summary", aiSummary);
  incident.set("wordpress_post_url", wordpressPostUrl);
  incident.set("resolved_date", nowIso);
  $app.save(incident);

  let note = "Incident marked resolved. " + (aiOk ? "AI summary generated." : "AI summary unavailable, plain log summary saved.");
  note += wordpressPostUrl ? " Posted to WordPress: " + wordpressPostUrl : " WordPress not posted (check settings).";
  u.logUpdate(incidentId, operator, note, "resolution");

  return e.json(200, {
    status: "ok",
    incident_id: incidentId,
    ai_summary: aiSummary,
    wordpress_post_url: wordpressPostUrl,
  });
});
