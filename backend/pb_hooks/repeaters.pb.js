/// <reference path="../pb_data/types.d.ts" />
//
// Link or delink a repeater through its configured outgoing webhook.
//   POST /api/pw/repeater-control   { repeater_id, action: "link"|"delink", incident_id? }
//
// Each repeater stores two webhook addresses (set on the Repeaters page): one
// that links it to the wider network and one that delinks it. This route calls
// the right one, updates the repeater's status, and (when an incident is given)
// records it in that incident's log.

routerAdd("POST", "/api/pw/repeater-control", (e) => {
  const u = require(`${__hooks}/lib/util.js`);

  const user = u.requireRole(e, ["admin", "operator"]);
  const body = e.requestInfo().body || {};
  const repeaterId = String(body.repeater_id || "");
  const action = String(body.action || "");
  if (!repeaterId || !action) throw new BadRequestError("repeater_id and action are required.");
  if (action !== "link" && action !== "delink") throw new BadRequestError("action must be 'link' or 'delink'.");

  let repeater;
  try { repeater = $app.findRecordById("repeaters", repeaterId); } catch (_) { throw new NotFoundError("Repeater not found."); }

  const url = action === "link" ? repeater.getString("link_webhook_url") : repeater.getString("delink_webhook_url");
  if (!url) throw new BadRequestError("No " + action + " webhook URL configured for this repeater.");

  let ok = false;
  let status = 0;
  try {
    const res = $http.send({
      url: url,
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        action: action,
        repeater: repeater.getString("name"),
        callsign: repeater.getString("callsign"),
        operator: u.displayName(user),
      }),
      timeout: 15,
    });
    status = res.statusCode;
    ok = status >= 200 && status < 300;
  } catch (_) { ok = false; }

  // Only change the recorded status when the webhook actually worked.
  if (ok) {
    repeater.set("status", action === "link" ? "linked" : "online");
    $app.save(repeater);
  }

  const incidentId = body.incident_id ? String(body.incident_id) : "";
  if (incidentId) {
    u.logUpdate(
      incidentId,
      u.displayName(user),
      (action === "link" ? "Linked" : "Delinked") + " repeater " + repeater.getString("name") + ". Webhook " + (ok ? "succeeded" : "failed") + ".",
      action === "link" ? "link_repeater" : "delink_repeater"
    );
  }

  return e.json(200, {
    status: "ok",
    repeater: repeater.getString("name"),
    action: action,
    webhook_ok: ok,
    webhook_status: status,
  });
});
