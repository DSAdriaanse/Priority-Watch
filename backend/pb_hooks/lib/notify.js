// Notification helpers: SMS (Textbelt), email (PocketBase SMTP), team lookup.
const util = require(`${__hooks}/lib/util.js`);

const DEFAULT_TEMPLATE =
  "GMRS PRIORITY WATCH ALERT\nRepeater: {repeater}\nType: {alert_type}\nDetails: {nature}\nCheck the Priority Watch dashboard immediately.";

function buildAlertMessage(template, repeaterName, alertType, nature) {
  const tmpl = template && template.trim() ? template : DEFAULT_TEMPLATE;
  return tmpl
    .split("{repeater}").join(repeaterName || "Unknown")
    .split("{alert_type}").join(alertType || "Priority Traffic")
    .split("{nature}").join(nature || "Not specified");
}

// Sends one SMS through Textbelt. Key comes from TEXTBELT_KEY.
function sendSms(toNumber, body) {
  const key = util.env("TEXTBELT_KEY").trim();
  if (!key) {
    return { ok: false, status: 0, error: "Textbelt API key is missing. Set TEXTBELT_KEY on the server." };
  }
  try {
    const res = $http.send({
      url: util.env("TEXTBELT_URL", "https://textbelt.com/text"),
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ phone: toNumber, message: body, key: key }),
      timeout: 15,
    });
    const data = res.json || {};
    const ok = data.success === true;
    return { ok: ok, status: res.statusCode, error: ok ? undefined : (data.error || "Textbelt rejected the request (HTTP " + res.statusCode + ").") };
  } catch (err) {
    return { ok: false, status: 0, error: "Could not reach Textbelt. Try again." };
  }
}

// Sends one email through the SMTP server configured for PocketBase.
function sendEmail(to, subject, text) {
  try {
    const meta = $app.settings().meta;
    const client = $app.newMailClient();
    client.send(new MailerMessage({
      from: { address: meta.senderAddress, name: meta.senderName },
      to: [{ address: to }],
      subject: subject,
      text: text,
    }));
    return { ok: true };
  } catch (err) {
    return { ok: false, error: "Email was not accepted for sending." };
  }
}

// Active team members and how to reach them.
// Phone and channel choices live in volunteer_contacts (admin-only collection).
function activeVolunteers() {
  const users = $app.findRecordsByFilter("users", "active = true", "name", 0, 0);
  const out = [];
  for (let i = 0; i < users.length; i++) {
    const u = users[i];
    let phone = "";
    let notifySms = false;
    let notifyEmail = true;
    try {
      const c = $app.findFirstRecordByData("volunteer_contacts", "user", u.id);
      phone = c.getString("phone");
      notifySms = c.getBool("notify_sms");
      notifyEmail = c.getBool("notify_email");
    } catch (_) { /* no contact record: email only */ }
    out.push({
      id: u.id,
      name: u.getString("name") || u.email(),
      email: u.email(),
      phone: phone,
      notify_sms: notifySms,
      notify_email: notifyEmail,
    });
  }
  return out;
}

module.exports = { buildAlertMessage, sendSms, sendEmail, activeVolunteers };
