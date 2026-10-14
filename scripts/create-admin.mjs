#!/usr/bin/env node
// Create the first app admin (role "admin") when you are not importing Base44 data.
//   PB_URL=... PB_SUPERUSER_EMAIL=... PB_SUPERUSER_PASSWORD=... \
//   node scripts/create-admin.mjs you@example.org "Your Name" CALLSIGN
// A password-setup email is sent if SMTP is configured; otherwise a one-time password is printed.
import crypto from "node:crypto";
const [email, name = "", callsign = ""] = process.argv.slice(2);
if (!email) { console.error("usage: create-admin.mjs <email> [name] [callsign]"); process.exit(2); }
const PB = (process.env.PB_URL || "http://127.0.0.1:8090").replace(/\/$/, "");
const call = async (m, p, b, t) => {
  const r = await fetch(PB + p, { method: m, headers: { "content-type": "application/json", ...(t ? { authorization: t } : {}) }, body: b ? JSON.stringify(b) : undefined });
  const x = await r.text();
  if (!r.ok) throw new Error(`${m} ${p} -> ${r.status} ${x.slice(0, 200)}`);
  return x ? JSON.parse(x) : null;
};
const { token } = await call("POST", "/api/collections/_superusers/auth-with-password", { identity: process.env.PB_SUPERUSER_EMAIL, password: process.env.PB_SUPERUSER_PASSWORD });
const pw = crypto.randomBytes(12).toString("base64url");
await call("POST", "/api/collections/users/records", { email, password: pw, passwordConfirm: pw, verified: true, name, callsign, role: "admin", active: true }, token);
try { await call("POST", "/api/collections/users/request-password-reset", { email }); console.log(`Created admin ${email}. Password-setup email requested (check SMTP settings if it does not arrive).`); }
catch { console.log(`Created admin ${email}. Email not sent (SMTP?). Temporary password: ${pw}  (change it after signing in)`); }
