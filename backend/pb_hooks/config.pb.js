/// <reference path="../pb_data/types.d.ts" />
//
// Tells an admin which server-side secrets are configured, without revealing them.
//   GET /api/pw/config-status
//
// The Settings page calls this to show green or red "configured" badges next to
// each integration. Secrets live in the server environment, never in the
// database, so the browser can only ever learn "set" or "not set".

routerAdd("GET", "/api/pw/config-status", (e) => {
  const u = require(`${__hooks}/lib/util.js`);
  u.requireRole(e, ["admin"]); // throws 401 or 403 unless an active admin is signed in
  const set = (name) => u.env(name).trim() !== "";
  return e.json(200, {
    webhook_secret: set("INBOUND_WEBHOOK_SECRET"),
    textbelt: set("TEXTBELT_KEY"),
    slack: set("SLACK_BOT_TOKEN"),
    allmon3_password: set("ALLMON_PASS"),
    wordpress_password: set("WORDPRESS_APP_PASSWORD"),
    anthropic: set("ANTHROPIC_API_KEY"),
    smtp: set("SMTP_HOST"),
  });
});
