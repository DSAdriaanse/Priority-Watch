/// <reference path="../pb_data/types.d.ts" />
//
// Priority Watch schema and access rules.
//
// Roles (users.role): admin | operator | priority_watch
//   admin          everything
//   operator       work incidents, notify team, control repeaters
//   priority_watch read-only view of incidents, repeaters and guidance
//
// Every rule below is enforced by the server. The UI hides things for
// convenience only.
//
// HOW TO READ THIS FILE
//   A migration runs once, the first time PocketBase starts on a new database
//   (the second function at the bottom undoes it). Each block creates one table,
//   called a "collection". For each collection:
//     listRule / viewRule      who may read it
//     createRule / updateRule / deleteRule   who may change it
//   A rule is a filter expression. null means "nobody through the API" (only
//   server code in pb_hooks can do it); "" would mean "anyone, even signed out".
//   To change the schema later, add a NEW migration file with a later timestamp
//   in its name. Do not edit this one on a database that already ran it.

migrate((app) => {
  // Rule building blocks, reused below. AUTHED = any active signed-in user,
  // OPS = active admin or operator, ADMIN = active admin only.
  const AUTHED = `@request.auth.id != "" && @request.auth.active = true`;
  const OPS = `${AUTHED} && (@request.auth.role = "admin" || @request.auth.role = "operator")`;
  const ADMIN = `${AUTHED} && @request.auth.role = "admin"`;

  const CATEGORIES = ["medical", "fire", "law_enforcement", "weather", "transportation", "utility", "rescue", "hazard", "other"];
  const PRIORITIES = ["critical", "high", "medium", "low"];
  const DTMF_PATTERN = "^[0-9A-D*#]{1,24}$";

  // Created and updated timestamps, named created_date and updated_date (the users collection keeps PocketBase's own created and updated).
  const stamps = () => [
    { type: "autodate", name: "created_date", onCreate: true, onUpdate: false },
    { type: "autodate", name: "updated_date", onCreate: true, onUpdate: true },
  ];

  // ---------------------------------------------------------------- users
  const users = app.findCollectionByNameOrId("users");
  users.fields.add(new TextField({ name: "callsign", max: 20 }));
  users.fields.add(new SelectField({ name: "role", required: true, maxSelect: 1, values: ["admin", "operator", "priority_watch"] }));
  users.fields.add(new BoolField({ name: "active" }));

  // Only active accounts can sign in.
  users.authRule = "active = true";
  // Only admins create accounts. No self-registration.
  users.createRule = ADMIN;
  users.listRule = AUTHED;
  users.viewRule = AUTHED;
  users.updateRule = `(${ADMIN}) || (id = @request.auth.id && @request.body.role:isset = false && @request.body.active:isset = false)`;
  users.deleteRule = ADMIN;
  // Lets admins set another user's email and password.
  users.manageRule = ADMIN;

  users.passwordAuth.enabled = true;
  users.otp.enabled = false;
  users.mfa.enabled = false;

  users.resetPasswordTemplate.subject = "Reset your GMRS Priority Watch password";
  users.resetPasswordTemplate.body =
    '<p>Hello,</p>' +
    '<p>Click the link below to set or reset your GMRS Priority Watch password.</p>' +
    '<p><a class="btn" href="{APP_URL}/reset-password?token={TOKEN}" target="_blank" rel="noopener">Set password</a></p>' +
    '<p>If you did not ask for this, you can ignore this email.</p>';
  app.save(users);

  // ------------------------------------------------------------ repeaters
  const repeaters = new Collection({
    type: "base",
    name: "repeaters",
    listRule: AUTHED,
    viewRule: AUTHED,
    createRule: ADMIN,
    updateRule: ADMIN,
    deleteRule: ADMIN,
    fields: [
      { type: "text", name: "name", required: true, max: 200 },
      { type: "text", name: "node_number", max: 20 },
      { type: "text", name: "callsign", max: 20 },
      { type: "text", name: "location", max: 500 },
      { type: "text", name: "state", max: 20 },
      { type: "text", name: "frequency", max: 50 },
      { type: "text", name: "coverage_area", max: 1000 },
      { type: "url", name: "link_webhook_url" },
      { type: "url", name: "delink_webhook_url" },
      { type: "text", name: "dtmf_link_code", max: 24 },
      { type: "text", name: "dtmf_delink_code", max: 24 },
      { type: "select", name: "status", maxSelect: 1, values: ["online", "offline", "linked", "maintenance"] },
      { type: "text", name: "notes", max: 5000 },
      ...stamps(),
    ],
    indexes: [
      "CREATE INDEX idx_repeaters_name ON repeaters (name)",
      "CREATE INDEX idx_repeaters_node ON repeaters (node_number)",
    ],
  });
  app.save(repeaters);

  // ------------------------------------------------------------ incidents
  const incidents = new Collection({
    type: "base",
    name: "incidents",
    listRule: AUTHED,
    viewRule: AUTHED,
    createRule: OPS,
    // Resolved incidents are closed: no further edits through the API.
    updateRule: `${OPS} && status != "resolved"`,
    // Deleting a report is an admin action.
    deleteRule: ADMIN,
    fields: [
      { type: "relation", name: "repeater_id", collectionId: repeaters.id, maxSelect: 99, cascadeDelete: false },
      { type: "json", name: "repeater_name", maxSize: 20000 },
      { type: "text", name: "alert_type", max: 200 },
      { type: "select", name: "incident_category", maxSelect: 1, values: CATEGORIES },
      { type: "text", name: "incident_subtype", max: 200 },
      { type: "select", name: "status", maxSelect: 1, values: ["active", "standby", "resolved"] },
      { type: "select", name: "priority_level", maxSelect: 1, values: PRIORITIES },
      { type: "text", name: "source_dtmf", max: 50 },
      { type: "text", name: "caller_info", max: 1000 },
      { type: "text", name: "location_info", max: 1000 },
      { type: "text", name: "nature", max: 5000 },
      { type: "text", name: "summary", max: 20000 },
      { type: "text", name: "ai_summary", max: 100000 },
      { type: "url", name: "wordpress_post_url" },
      { type: "text", name: "assigned_operator", max: 200 },
      { type: "date", name: "resolved_date" },
      ...stamps(),
    ],
    indexes: [
      "CREATE INDEX idx_incidents_status ON incidents (status)",
      "CREATE INDEX idx_incidents_created ON incidents (created_date)",
    ],
  });
  app.save(incidents);

  // ----------------------------------------------------- incident_updates
  const updates = new Collection({
    type: "base",
    name: "incident_updates",
    listRule: AUTHED,
    viewRule: AUTHED,
    // The log is append-only, and closed incidents take no new entries.
    createRule: `${OPS} && incident_id.status != "resolved"`,
    updateRule: null,
    deleteRule: null,
    fields: [
      { type: "relation", name: "incident_id", required: true, collectionId: incidents.id, maxSelect: 1, cascadeDelete: true },
      { type: "text", name: "operator_name", max: 200 },
      { type: "text", name: "message", required: true, max: 50000 },
      { type: "select", name: "action_type", maxSelect: 1, values: ["note", "link_repeater", "delink_repeater", "contact_made", "status_change", "guidance_followed", "alert", "assignment", "resolution"] },
      ...stamps(),
    ],
    indexes: ["CREATE INDEX idx_updates_incident ON incident_updates (incident_id)"],
  });
  app.save(updates);

  // ------------------------------------------------------ guidance_scripts
  const guidance = new Collection({
    type: "base",
    name: "guidance_scripts",
    listRule: AUTHED,
    viewRule: AUTHED,
    createRule: ADMIN,
    updateRule: ADMIN,
    deleteRule: ADMIN,
    fields: [
      { type: "select", name: "incident_category", required: true, maxSelect: 1, values: CATEGORIES },
      { type: "text", name: "incident_subtype", max: 200 },
      { type: "text", name: "title", required: true, max: 300 },
      { type: "select", name: "priority_level", maxSelect: 1, values: PRIORITIES },
      { type: "text", name: "initial_actions", max: 20000 },
      { type: "json", name: "steps", maxSize: 200000 },
      { type: "json", name: "questions_to_ask", maxSize: 200000 },
      { type: "json", name: "triage_flow", maxSize: 500000 },
      ...stamps(),
    ],
  });
  app.save(guidance);

  // ---------------------------------------------------- emergency_contacts
  const contacts = new Collection({
    type: "base",
    name: "emergency_contacts",
    listRule: AUTHED,
    viewRule: AUTHED,
    createRule: ADMIN,
    updateRule: ADMIN,
    deleteRule: ADMIN,
    fields: [
      { type: "relation", name: "repeater_id", required: true, collectionId: repeaters.id, maxSelect: 1, cascadeDelete: true },
      { type: "select", name: "agency_type", required: true, maxSelect: 1, values: ["911", "police", "fire", "emt", "power", "gas", "other"] },
      { type: "text", name: "agency_name", max: 300 },
      { type: "text", name: "phone", required: true, max: 50 },
      { type: "text", name: "alternate_phone", max: 50 },
      { type: "text", name: "notes", max: 2000 },
      ...stamps(),
    ],
    indexes: ["CREATE INDEX idx_contacts_repeater ON emergency_contacts (repeater_id)"],
  });
  app.save(contacts);

  // -------------------------------------------------------- dtmf_commands
  const commands = new Collection({
    type: "base",
    name: "dtmf_commands",
    listRule: OPS,
    viewRule: OPS,
    createRule: ADMIN,
    updateRule: ADMIN,
    deleteRule: ADMIN,
    fields: [
      { type: "text", name: "name", required: true, max: 200 },
      { type: "text", name: "dtmf", required: true, max: 24, pattern: DTMF_PATTERN },
      { type: "bool", name: "confirm_required" },
      { type: "bool", name: "enabled" },
      { type: "number", name: "order" },
      ...stamps(),
    ],
  });
  app.save(commands);

  // ------------------------------------------------------------ dtmf_logs
  // Written by the server only (runDtmf route). Nobody creates or edits them.
  const dtmfLogs = new Collection({
    type: "base",
    name: "dtmf_logs",
    listRule: OPS,
    viewRule: OPS,
    createRule: null,
    updateRule: null,
    deleteRule: null,
    fields: [
      { type: "text", name: "user_email", max: 300 },
      { type: "text", name: "user_name", max: 200 },
      { type: "text", name: "repeater_name", max: 200 },
      { type: "text", name: "node", max: 20 },
      { type: "text", name: "command_name", max: 200 },
      { type: "text", name: "dtmf", max: 24 },
      { type: "select", name: "result", maxSelect: 1, values: ["success", "error"] },
      { type: "text", name: "output", max: 20000 },
      ...stamps(),
    ],
  });
  app.save(dtmfLogs);

  // ------------------------------------------------------------- settings
  // Non-secret configuration only. Secrets (Textbelt, WordPress password,
  // webhook secret, Slack token, Allmon3 password, API keys) live in the
  // server environment and are never stored here.
  const settings = new Collection({
    type: "base",
    name: "settings",
    listRule: ADMIN,
    viewRule: ADMIN,
    createRule: ADMIN,
    updateRule: ADMIN,
    deleteRule: null,
    fields: [
      { type: "text", name: "notification_template", max: 2000 },
      { type: "text", name: "slack_channel", max: 100 },
      { type: "url", name: "wordpress_url" },
      { type: "text", name: "wordpress_username", max: 200 },
      { type: "url", name: "allmon3_base_url" },
      { type: "text", name: "allmon3_username", max: 200 },
      { type: "text", name: "emergency_hub_node", max: 20 },
      { type: "text", name: "incident_closeout_macro", max: 24, pattern: DTMF_PATTERN },
      ...stamps(),
    ],
  });
  app.save(settings);

  const defaults = new Record(settings);
  defaults.set(
    "notification_template",
    "GMRS PRIORITY WATCH ALERT\nRepeater: {repeater}\nType: {alert_type}\nDetails: {nature}\nCheck the Priority Watch dashboard immediately."
  );
  app.save(defaults);

  // ---------------------------------------------------- volunteer_contacts
  // Phone numbers and notification choices. Admin-only, so operators and
  // watch-only users can see who is on the team but not their phone numbers.
  const vcontacts = new Collection({
    type: "base",
    name: "volunteer_contacts",
    listRule: ADMIN,
    viewRule: ADMIN,
    createRule: ADMIN,
    updateRule: ADMIN,
    deleteRule: ADMIN,
    fields: [
      { type: "relation", name: "user", required: true, collectionId: users.id, maxSelect: 1, cascadeDelete: true },
      { type: "text", name: "phone", max: 50 },
      { type: "bool", name: "notify_sms" },
      { type: "bool", name: "notify_email" },
      ...stamps(),
    ],
    indexes: ["CREATE UNIQUE INDEX idx_vcontacts_user ON volunteer_contacts (user)"],
  });
  app.save(vcontacts);
}, (app) => {
  for (const name of ["volunteer_contacts", "settings", "dtmf_logs", "dtmf_commands", "emergency_contacts", "guidance_scripts", "incident_updates", "incidents", "repeaters"]) {
    try { app.delete(app.findCollectionByNameOrId(name)); } catch (_) {}
  }
  const users = app.findCollectionByNameOrId("users");
  for (const f of ["callsign", "role", "active"]) users.fields.removeByName(f);
  users.authRule = "";
  users.createRule = "";
  users.manageRule = null;
  app.save(users);
});
