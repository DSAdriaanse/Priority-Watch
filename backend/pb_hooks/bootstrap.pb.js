/// <reference path="../pb_data/types.d.ts" />
//
// Applies environment-driven configuration on every start, so server config
// lives in .env and is never edited by hand in the dashboard.

onBootstrap((e) => {
  e.next();

  const u = require(`${__hooks}/lib/util.js`);
  const s = $app.settings();

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

  // Behind Nginx the real client address arrives in X-Real-IP.
  if (u.env("TRUST_PROXY_HEADER", "X-Real-IP")) {
    s.trustedProxy.headers = [u.env("TRUST_PROXY_HEADER", "X-Real-IP")];
    s.trustedProxy.useLeftmostIP = false;
  }

  // Rate limits. The public webhook is the main target.
  const limit = parseInt(u.env("WEBHOOK_RATE_LIMIT", "30"), 10);
  // PocketBase's own default limits (sign-in attempts, record creation) stay on
  // unless RATE_LIMIT_DEFAULTS=off, which exists only so automated tests can run fast.
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
