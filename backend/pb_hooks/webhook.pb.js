/// <reference path="../pb_data/types.d.ts" />
//
// Inbound alert from the repeater system.
//   POST /api/pw/webhook/inbound
//   POST /api/functions/handleInboundWebhook   (old Base44 path, so the repeater
//                                               system only needs its host changed)
//
// Authentication: shared secret in the X-Webhook-Secret header, or in the JSON
// body field "secret". The secret is never accepted in the URL. If
// INBOUND_WEBHOOK_SECRET is not set the endpoint refuses everything.

function inboundWebhook(e) {
  const u = require(`${__hooks}/lib/util.js`);
  const notify = require(`${__hooks}/lib/notify.js`);
  const slack = require(`${__hooks}/lib/slack.js`);

  const expected = u.env("INBOUND_WEBHOOK_SECRET").trim();
  if (!expected) {
    throw new ApiError(503, "Inbound webhook is not configured on this server.", {});
  }

  const body = e.requestInfo().body || {};
  const given = String(e.request.header.get("X-Webhook-Secret") || body.secret || "");
  if (!$security.equal(given, expected)) {
    throw new UnauthorizedError("Invalid webhook secret.");
  }

  const alertType = u.trunc(body.alert_type, 200) || "Priority Traffic";
  const nature = u.trunc(body.nature, 5000);
  const nodeNumber = u.trunc(body.node_number, 20);

  // Find the repeater: by id, then name, then node number.
  let repeater = null;
  if (body.repeater_id) {
    try { repeater = $app.findRecordById("repeaters", String(body.repeater_id)); } catch (_) {}
  }
  if (!repeater && body.repeater_name) {
    try { repeater = $app.findFirstRecordByData("repeaters", "name", String(body.repeater_name)); } catch (_) {}
  }
  if (!repeater && nodeNumber) {
    try { repeater = $app.findFirstRecordByData("repeaters", "node_number", nodeNumber); } catch (_) {}
  }
  const repeaterName = repeater ? repeater.getString("name") : (u.trunc(body.repeater_name, 200) || "Unknown Repeater");

  const incident = new Record($app.findCollectionByNameOrId("incidents"));
  incident.set("repeater_id", repeater ? [repeater.id] : []);
  incident.set("repeater_name", [repeaterName]);
  incident.set("alert_type", alertType);
  incident.set("status", "active");
  incident.set("priority_level", "high");
  incident.set("source_dtmf", u.trunc(body.source_dtmf, 50));
  incident.set("caller_info", u.trunc(body.caller_info, 1000));
  incident.set("location_info", u.trunc(body.location_info, 1000));
  incident.set("nature", nature);
  $app.save(incident);

  const sourceDtmf = u.trunc(body.source_dtmf, 50);
  u.logUpdate(
    incident.id,
    "System",
    "Inbound alert received from " + repeaterName +
      (nodeNumber ? " (Node " + nodeNumber + ")" : "") +
      (sourceDtmf ? " (DTMF: " + sourceDtmf + ")" : "") + ".",
    "alert"
  );

  const cfg = u.settings();
  const text = notify.buildAlertMessage(u.setting(cfg, "notification_template"), repeaterName, alertType, nature);

  slack.postMessage(u.setting(cfg, "slack_channel"), text);

  const smsResults = [];
  const team = notify.activeVolunteers();
  for (let i = 0; i < team.length; i++) {
    const v = team[i];
    if (v.notify_sms && v.phone) {
      const r = notify.sendSms(v.phone, text);
      smsResults.push({ volunteer: v.name, ok: r.ok, status: r.status });
    }
    if (v.notify_email && v.email) {
      notify.sendEmail(v.email, "GMRS Priority Watch Alert - " + repeaterName, text);
    }
  }

  return e.json(200, {
    status: "ok",
    incident_id: incident.id,
    repeater: repeaterName,
    notified: smsResults.length,
    sms_results: smsResults,
  });
}

routerAdd("POST", "/api/pw/webhook/inbound", inboundWebhook);
routerAdd("POST", "/api/functions/handleInboundWebhook", inboundWebhook);
