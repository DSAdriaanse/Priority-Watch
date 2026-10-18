// End-to-end checks against a running PocketBase with the hooks and migrations loaded.
//
//   PB_URL=http://127.0.0.1:8090 PB_SU_EMAIL=... PB_SU_PASS=... MOCK_URL=http://127.0.0.1:9100 \
//   INBOUND_WEBHOOK_SECRET=s3cret node --test backend/test/api.test.mjs
//
// The server under test must be started with the mock service URLs (see README in this folder).
import { test, before } from "node:test";
import assert from "node:assert/strict";

const PB = process.env.PB_URL || "http://127.0.0.1:8090";
const MOCK = process.env.MOCK_URL || "http://127.0.0.1:9100";
const SECRET = process.env.INBOUND_WEBHOOK_SECRET || "s3cret";
const run = Date.now().toString(36);

async function api(path, { method = "GET", token, body, headers = {} } = {}) {
  const res = await fetch(PB + path, {
    method,
    headers: { "content-type": "application/json", ...(token ? { authorization: token } : {}), ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  let json = null;
  try { json = await res.json(); } catch {}
  return { status: res.status, json };
}
const mockCalls = async () => (await fetch(MOCK + "/_calls")).json();
const mockReset = () => fetch(MOCK + "/_reset");

const S = {}; // shared state

async function createUser(su, name, role, { active = true, phone = "", sms = false } = {}) {
  const email = `${role}.${name.toLowerCase().replace(/[^a-z]/g, "")}.${run}@test.local`;
  const r = await api("/api/collections/users/records", {
    method: "POST", token: su,
    body: { email, password: "password-1234", passwordConfirm: "password-1234", name, role, active, verified: true, emailVisibility: false },
  });
  assert.equal(r.status, 200, JSON.stringify(r.json));
  const login = await api("/api/collections/users/auth-with-password", { method: "POST", body: { identity: email, password: "password-1234" } });
  if (active) assert.equal(login.status, 200, JSON.stringify(login.json));
  if (phone || sms) {
    const c = await api("/api/collections/volunteer_contacts/records", { method: "POST", token: su, body: { user: r.json.id, phone, notify_sms: sms, notify_email: false } });
    assert.equal(c.status, 200, JSON.stringify(c.json));
  }
  return { id: r.json.id, email, token: login.json?.token, name };
}

before(async () => {
  const su = await api("/api/collections/_superusers/auth-with-password", {
    method: "POST", body: { identity: process.env.PB_SU_EMAIL || "admin@test.local", password: process.env.PB_SU_PASS || "testpass1234" },
  });
  assert.equal(su.status, 200, "superuser login failed");
  S.su = su.json.token;

  S.admin = await createUser(S.su, "Ada Admin", "admin", { phone: "5205550001", sms: true });
  S.op = await createUser(S.su, "Olly Operator", "operator", { phone: "5205550002", sms: true });
  S.watch = await createUser(S.su, "Wendy Watch", "priority_watch");
  S.inactive = await createUser(S.su, "Ivan Inactive", "operator", { active: false });

  // Settings used by the routes.
  const list = await api("/api/collections/settings/records", { token: S.su });
  const cfg = {
    slack_channel: "#pw-test",
    wordpress_url: MOCK + "/wp",
    wordpress_username: "wpuser",
    allmon3_base_url: MOCK + "/allmon",
    allmon3_username: "allmonuser",
  };
  const upd = await api(`/api/collections/settings/records/${list.json.items[0].id}`, { method: "PATCH", token: S.su, body: cfg });
  assert.equal(upd.status, 200, JSON.stringify(upd.json));

  // Test repeater, command and incident.
  const rep = await api("/api/collections/repeaters/records", {
    method: "POST", token: S.admin.token,
    body: { name: `Test Repeater ${run}`, node_number: String(900000 + Math.floor(Math.random() * 99999)), callsign: "WTEST", status: "online" },
  });
  assert.equal(rep.status, 200, JSON.stringify(rep.json));
  S.repeater = rep.json;
  const cmd = await api("/api/collections/dtmf_commands/records", {
    method: "POST", token: S.admin.token, body: { name: "Link to Hub", dtmf: "*5900", enabled: true, confirm_required: true, order: 0 },
  });
  assert.equal(cmd.status, 200, JSON.stringify(cmd.json));
  S.command = cmd.json;
});

// ------------------------------------------------------------ access rules
test("signed-out visitors see nothing", async () => {
  for (const c of ["incidents", "repeaters", "incident_updates", "guidance_scripts", "emergency_contacts", "users"]) {
    const r = await api(`/api/collections/${c}/records`);
    assert.equal(r.json.items?.length ?? 0, 0, `${c} leaked to signed-out visitor`);
  }
});

test("inactive accounts cannot sign in", async () => {
  const r = await api("/api/collections/users/auth-with-password", { method: "POST", body: { identity: S.inactive.email, password: "password-1234" } });
  assert.notEqual(r.status, 200);
});

test("self-registration is closed", async () => {
  const r = await api("/api/collections/users/records", {
    method: "POST", body: { email: `rando.${run}@test.local`, password: "password-1234", passwordConfirm: "password-1234", name: "Rando", role: "admin", active: true },
  });
  assert.notEqual(r.status, 200);
});

test("only admins change repeaters", async () => {
  const bad = await api("/api/collections/repeaters/records", { method: "POST", token: S.op.token, body: { name: "Nope" } });
  assert.notEqual(bad.status, 200);
  const ok = await api(`/api/collections/repeaters/records/${S.repeater.id}`, { method: "PATCH", token: S.admin.token, body: { location: "Test Peak" } });
  assert.equal(ok.status, 200);
});

test("operators can read repeaters, watchers cannot touch incidents", async () => {
  const r = await api(`/api/collections/repeaters/records/${S.repeater.id}`, { token: S.watch.token });
  assert.equal(r.status, 200);
  const bad = await api("/api/collections/incidents/records", { method: "POST", token: S.watch.token, body: { alert_type: "Manual", status: "active", priority_level: "high" } });
  assert.notEqual(bad.status, 200);
});

test("team directory hides phone numbers and emails from operators", async () => {
  const list = await api("/api/collections/users/records?perPage=100", { token: S.op.token });
  assert.equal(list.status, 200);
  const me = list.json.items.find((u) => u.id === S.admin.id);
  assert.ok(me, "operator should see team members");
  assert.equal(me.name, "Ada Admin");
  assert.equal(me.email, undefined, "email should be hidden");
  assert.equal(me.phone, undefined);
  const contacts = await api("/api/collections/volunteer_contacts/records", { token: S.op.token });
  assert.equal(contacts.json.items.length, 0, "operators must not read volunteer contacts");
  const adminContacts = await api("/api/collections/volunteer_contacts/records", { token: S.admin.token });
  assert.ok(adminContacts.json.items.length >= 2, "admin reads contacts");
});

test("admins can read team emails; users cannot promote themselves", async () => {
  const list = await api("/api/collections/users/records?perPage=100", { token: S.admin.token });
  const op = list.json.items.find((u) => u.id === S.op.id);
  assert.equal(op.email, S.op.email, "admin should see emails via manageRule");
  const esc = await api(`/api/collections/users/records/${S.op.id}`, { method: "PATCH", token: S.op.token, body: { role: "admin" } });
  assert.notEqual(esc.status, 200);
  const name = await api(`/api/collections/users/records/${S.op.id}`, { method: "PATCH", token: S.op.token, body: { name: "Olly Operator" } });
  assert.equal(name.status, 200);
});

test("settings, dtmf commands and logs are restricted", async () => {
  assert.equal((await api("/api/collections/settings/records", { token: S.op.token })).json.items.length, 0);
  assert.equal((await api("/api/collections/settings/records", { token: S.admin.token })).json.items.length, 1);
  assert.equal((await api("/api/collections/dtmf_commands/records", { token: S.watch.token })).json.items.length, 0);
  assert.ok((await api("/api/collections/dtmf_commands/records", { token: S.op.token })).json.items.length >= 1);
  const forge = await api("/api/collections/dtmf_logs/records", { method: "POST", token: S.admin.token, body: { command_name: "x", result: "success" } });
  assert.notEqual(forge.status, 200, "logs are written by the server only");
});

// ------------------------------------------------------------ webhook
test("webhook rejects missing, wrong, and query-string secrets", async () => {
  const body = { repeater_name: S.repeater.name, alert_type: "Priority Traffic", nature: "t" };
  assert.equal((await api("/api/pw/webhook/inbound", { method: "POST", body })).status, 401);
  assert.equal((await api("/api/pw/webhook/inbound", { method: "POST", body, headers: { "x-webhook-secret": "wrong" } })).status, 401);
  assert.equal((await api(`/api/pw/webhook/inbound?secret=${SECRET}`, { method: "POST", body })).status, 401);
  // A GET must never create an incident (when the SPA is served it may fall back to index.html with 200).
  const get = await api(`/api/pw/webhook/inbound?secret=${SECRET}`);
  assert.equal(get.json?.incident_id, undefined, "GET must not create incidents");
});

test("webhook creates an incident, logs it, and notifies the team", async () => {
  await mockReset();
  const r = await api("/api/pw/webhook/inbound", {
    method: "POST", headers: { "x-webhook-secret": SECRET },
    body: { node_number: S.repeater.node_number, alert_type: "Priority Traffic", nature: "Van stuck", caller_info: "WTEST", location_info: "Mile 12", source_dtmf: "*1" },
  });
  assert.equal(r.status, 200, JSON.stringify(r.json));
  assert.equal(r.json.repeater, S.repeater.name, "matched by node number");
  S.incident = (await api(`/api/collections/incidents/records/${r.json.incident_id}`, { token: S.op.token })).json;
  assert.equal(S.incident.status, "active");
  assert.deepEqual(S.incident.repeater_id, [S.repeater.id]);
  assert.deepEqual(S.incident.repeater_name, [S.repeater.name]);
  const ups = await api(`/api/collections/incident_updates/records?filter=incident_id="${S.incident.id}"`, { token: S.op.token });
  assert.equal(ups.json.items.length, 1);
  assert.match(ups.json.items[0].message, /Inbound alert received/);
  const calls = await mockCalls();
  assert.ok(calls.filter((c) => c.path === "/textbelt").length >= 2, "SMS to volunteers with SMS on");
  assert.ok(calls.some((c) => c.path === "/slack" && c.body.channel === "#pw-test"), "Slack alert");
});

test("webhook accepts the secret in the body and the old Base44 path", async () => {
  const r = await api("/api/functions/handleInboundWebhook", { method: "POST", body: { secret: SECRET, repeater_name: "Not A Real Repeater", alert_type: "Auto Reported" } });
  assert.equal(r.status, 200, JSON.stringify(r.json));
  assert.equal(r.json.repeater, "Not A Real Repeater");
});

// ------------------------------------------------------------ operator routes
test("notify requires an operator and logs to the incident", async () => {
  await mockReset();
  const noAuth = await api("/api/pw/notify", { method: "POST", body: { nature: "x" } });
  assert.equal(noAuth.status, 401);
  const watch = await api("/api/pw/notify", { method: "POST", token: S.watch.token, body: { nature: "x" } });
  assert.equal(watch.status, 403);
  const r = await api("/api/pw/notify", {
    method: "POST", token: S.op.token,
    body: { incident_id: S.incident.id, repeater_name: S.repeater.name, alert_type: "Priority Traffic", nature: "Van stuck" },
  });
  assert.equal(r.status, 200, JSON.stringify(r.json));
  assert.ok(r.json.notified >= 3, "slack + 2 SMS accepted");
  const log = await api(`/api/collections/incident_updates/records?filter=incident_id="${S.incident.id}"&sort=-created_date`, { token: S.op.token });
  assert.match(log.json.items[0].message, /Team notification attempted/);
  assert.equal(log.json.items[0].operator_name, "Olly Operator");
});

test("resolve closes the incident, summarizes, publishes, and locks it", async () => {
  await mockReset();
  const watch = await api("/api/pw/resolve", { method: "POST", token: S.watch.token, body: { incident_id: S.incident.id } });
  assert.equal(watch.status, 403);
  const r = await api("/api/pw/resolve", { method: "POST", token: S.op.token, body: { incident_id: S.incident.id } });
  assert.equal(r.status, 200, JSON.stringify(r.json));
  assert.equal(r.json.wordpress_post_url, "https://wp.test/post-1");
  assert.match(r.json.ai_summary, /Delivery van recovered/);
  const calls = await mockCalls();
  // The summarizer must be told the real repeater name (not raw JSON bytes).
  const ai = calls.find((c) => c.path === "/anthropic");
  assert.ok(ai, "Anthropic was called");
  assert.ok(ai.body.messages[0].content.includes(`- Repeater: ${S.repeater.name}\n`), "prompt names the repeater");
  const wp = calls.find((c) => c.path === "/wp/wp-json/wp/v2/posts");
  assert.ok(wp, "WordPress was called");
  assert.match(wp.headers.authorization, /^Basic /);
  assert.equal(wp.body.title, "Delivery van recovered");
  const inc = (await api(`/api/collections/incidents/records/${S.incident.id}`, { token: S.op.token })).json;
  assert.equal(inc.status, "resolved");
  assert.ok(inc.resolved_date);
  // Closed incidents take no further edits or log entries.
  const edit = await api(`/api/collections/incidents/records/${S.incident.id}`, { method: "PATCH", token: S.op.token, body: { nature: "changed" } });
  assert.notEqual(edit.status, 200);
  const note = await api("/api/collections/incident_updates/records", { method: "POST", token: S.op.token, body: { incident_id: S.incident.id, message: "late", action_type: "note" } });
  assert.notEqual(note.status, 200);
  const again = await api("/api/pw/resolve", { method: "POST", token: S.op.token, body: { incident_id: S.incident.id } });
  assert.equal(again.status, 400);
  // Only admins delete reports.
  assert.notEqual((await api(`/api/collections/incidents/records/${S.incident.id}`, { method: "DELETE", token: S.op.token })).status, 204);
});

test("false alarm closes without publishing", async () => {
  await mockReset();
  const hook = await api("/api/pw/webhook/inbound", { method: "POST", headers: { "x-webhook-secret": SECRET }, body: { repeater_name: S.repeater.name } });
  const r = await api("/api/pw/resolve", { method: "POST", token: S.op.token, body: { incident_id: hook.json.incident_id, false_alarm: true } });
  assert.equal(r.status, 200);
  assert.ok(!(await mockCalls()).some((c) => c.path.startsWith("/wp")), "nothing published");
  const inc = (await api(`/api/collections/incidents/records/${hook.json.incident_id}`, { token: S.op.token })).json;
  assert.equal(inc.status, "resolved");
  assert.match(inc.ai_summary, /false alarm/i);
});

test("update log is append-only", async () => {
  const hook = await api("/api/pw/webhook/inbound", { method: "POST", headers: { "x-webhook-secret": SECRET }, body: { repeater_name: S.repeater.name } });
  const mk = await api("/api/collections/incident_updates/records", { method: "POST", token: S.op.token, body: { incident_id: hook.json.incident_id, operator_name: "Olly Operator", message: "note", action_type: "note" } });
  assert.equal(mk.status, 200, JSON.stringify(mk.json));
  assert.notEqual((await api(`/api/collections/incident_updates/records/${mk.json.id}`, { method: "PATCH", token: S.admin.token, body: { message: "edited" } })).status, 200);
  assert.notEqual((await api(`/api/collections/incident_updates/records/${mk.json.id}`, { method: "DELETE", token: S.admin.token })).status, 204);
});

test("DTMF control: allowed for operators, logged, validated", async () => {
  await mockReset();
  assert.equal((await api("/api/pw/dtmf/run", { method: "POST", token: S.watch.token, body: { repeaterId: S.repeater.id, commandId: S.command.id } })).status, 403);
  const r = await api("/api/pw/dtmf/run", { method: "POST", token: S.op.token, body: { repeaterId: S.repeater.id, commandId: S.command.id } });
  assert.equal(r.status, 200, JSON.stringify(r.json));
  assert.equal(r.json.output, "Command output OK");
  const cmdCall = (await mockCalls()).find((c) => c.path === "/allmon/master/cmd");
  assert.equal(cmdCall.body, `node=${S.repeater.node_number}&cmd=rpt%20fun%20${S.repeater.node_number}%20*5900`);
  const logs = await api("/api/collections/dtmf_logs/records?sort=-created_date", { token: S.op.token });
  assert.equal(logs.json.items[0].result, "success");
  assert.equal(logs.json.items[0].user_name, "Olly Operator");
  // Disabled command refused.
  await api(`/api/collections/dtmf_commands/records/${S.command.id}`, { method: "PATCH", token: S.admin.token, body: { enabled: false } });
  assert.equal((await api("/api/pw/dtmf/run", { method: "POST", token: S.op.token, body: { repeaterId: S.repeater.id, commandId: S.command.id } })).status, 400);
  await api(`/api/collections/dtmf_commands/records/${S.command.id}`, { method: "PATCH", token: S.admin.token, body: { enabled: true } });
});

test("config status is admin-only and never reveals secrets", async () => {
  assert.equal((await api("/api/pw/config-status", { token: S.op.token })).status, 403);
  const r = await api("/api/pw/config-status", { token: S.admin.token });
  assert.equal(r.status, 200);
  assert.equal(r.json.webhook_secret, true);
  assert.ok(!JSON.stringify(r.json).includes(SECRET));
});

test("repeater control updates status only when the webhook succeeds", async () => {
  await api(`/api/collections/repeaters/records/${S.repeater.id}`, { method: "PATCH", token: S.admin.token, body: { link_webhook_url: MOCK + "/linkhook", delink_webhook_url: MOCK + "/nohook" } });
  const link = await api("/api/pw/repeater-control", { method: "POST", token: S.op.token, body: { repeater_id: S.repeater.id, action: "link" } });
  assert.equal(link.json.webhook_ok, true);
  assert.equal((await api(`/api/collections/repeaters/records/${S.repeater.id}`, { token: S.op.token })).json.status, "linked");
  const delink = await api("/api/pw/repeater-control", { method: "POST", token: S.op.token, body: { repeater_id: S.repeater.id, action: "delink" } });
  assert.equal(delink.json.webhook_ok, false);
  assert.equal((await api(`/api/collections/repeaters/records/${S.repeater.id}`, { token: S.op.token })).json.status, "linked", "status unchanged on failure");
});

// ------------------------------------------------------------ rate limit (keep last)
test("webhook is rate limited", async () => {
  let limited = 0;
  for (let i = 0; i < 45; i++) {
    const r = await api("/api/pw/webhook/inbound", { method: "POST", body: { nature: "flood" } });
    if (r.status === 429) limited++;
  }
  assert.ok(limited > 0, "expected some 429 responses");
});
