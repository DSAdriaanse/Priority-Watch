/// <reference path="../pb_data/types.d.ts" />
//
// Applies environment-driven configuration on every start, so server config
// lives in /etc/priority-watch/env and is never edited by hand in the dashboard.
//
// HOW THIS FILE WORKS
//   PocketBase runs every *.pb.js file in this folder at startup. onBootstrap
//   fires once, after the database is open and before the server takes requests.
//   We read environment variables (see .env.example for the full list) and copy
//   them into PocketBase's own settings (mail, proxy header, rate limits), then
//   save. Because this runs on every start, changing the env file and restarting
//   the service is all it takes to change the config.
//
// NOTE: other hook files cannot share top-level variables with this one. Each
// handler loads shared helpers itself with require() (see lib/util.js).

onBootstrap((e) => {
  e.next(); // let PocketBase finish its own startup first, then adjust settings

  const u = require(`${__hooks}/lib/util.js`);
  const s = $app.settings();

  // Branding and the public address (used in password-reset email links).
  s.meta.appName = "GMRS Priority Watch";
  if (u.env("APP_URL")) s.meta.appURL = u.env("APP_URL").replace(/\/+$/, "");
  if (u.env("MAIL_FROM_ADDRESS")) s.meta.senderAddress = u.env("MAIL_FROM_ADDRESS");
  s.meta.senderName = u.env("MAIL_FROM_NAME", "GMRS Priority Watch");

  // SMTP (password reset and team email alerts).
  if (u.env("SMTP_HOST")) {
    s.smtp.enabled = true;
    s.smtp.host = u.env("SMTP_HOST");
    s.smtp.port = parseInt(u.env("SMTP_PORT", "587"), 10);
    s.smtp.username = u.env("SMTP_USER");
    s.smtp.password = u.env("SMTP_PASS");
    s.smtp.tls = u.env("SMTP_TLS", "false") === "true";
  }

  // Behind Nginx every request appears to come from 127.0.0.1. Nginx puts the
  // real visitor address in X-Real-IP, and this tells PocketBase to believe that
  // header. This matters for rate limiting, which is per client address.
  if (u.env("TRUST_PROXY_HEADER", "X-Real-IP")) {
    s.trustedProxy.headers = [u.env("TRUST_PROXY_HEADER", "X-Real-IP")];
    s.trustedProxy.useLeftmostIP = false;
  }

  // Rate limits. The public webhook is the main target. WEBHOOK_RATE_LIMIT is
  // the number of requests allowed per client address per 60 seconds.
  const limit = parseInt(u.env("WEBHOOK_RATE_LIMIT", "30"), 10);
  // PocketBase's own default limits (sign-in attempts, record creation) stay on
  // unless RATE_LIMIT_DEFAULTS=off, which exists only so automated tests can run fast.
  // Rebuild the rule list: keep PocketBase's defaults, drop any old copy of our
  // own two rules, then add them fresh. This keeps restarts from stacking duplicates.
  const keep = [];
  const existing = u.env("RATE_LIMIT_DEFAULTS", "on") === "off" ? [] : (s.rateLimits.rules || []);
  for (let i = 0; i < existing.length; i++) {
    const label = existing[i].label;
    if (label.indexOf("/api/pw/webhook") !== 0 && label.indexOf("/api/functions/") !== 0) keep.push(existing[i]);
  }
  keep.push({ label: "/api/pw/webhook/", maxRequests: limit, duration: 60 });
  keep.push({ label: "/api/functions/", maxRequests: limit, duration: 60 });
  s.rateLimits.rules = keep;
  s.rateLimits.enabled = true;

  $app.save(s);
});
