/// <reference path="../pb_data/types.d.ts" />
//
// Tells an admin which server-side secrets are configured, without revealing them.
//   GET /api/pw/config-status

routerAdd("GET", "/api/pw/config-status", (e) => {
  const u = require(`${__hooks}/lib/util.js`);
  u.requireRole(e, ["admin"]);
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
