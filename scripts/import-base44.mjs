#!/usr/bin/env node
// Import a Base44 CSV export into a fresh PocketBase.
//
//   PB_URL=http://127.0.0.1:8090 PB_SUPERUSER_EMAIL=... PB_SUPERUSER_PASSWORD=... \
//   node scripts/import-base44.mjs <folder-with-*_export.csv> [--dry-run] [--send-resets] [--allow-nonempty]
//
// What it does
//   * Base44 ids (24 hex chars) are replaced by PocketBase ids; Incident.repeater_id,
//     IncidentUpdate.incident_id and EmergencyContact.repeater_id are remapped.
//   * created_date / updated_date are kept so history stays in order.
//   * Volunteers become users (random password) plus a volunteer_contacts row.
//     With --send-resets each one gets a "set your password" email.
//   * Rows flagged is_sample are skipped. Settings secrets are NOT imported
//     (they live in the server environment); the script lists which ones to set.
// Nothing is deleted or overwritten. Safe to run with --dry-run first.
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const args = process.argv.slice(2);
const dir = args.find((a) => !a.startsWith("--"));
const flag = (n) => args.includes(`--${n}`);
if (!dir) { console.error("usage: import-base44.mjs <folder> [--dry-run] [--send-resets] [--allow-nonempty]"); process.exit(2); }
const PB = (process.env.PB_URL || "http://127.0.0.1:8090").replace(/\/$/, "");
const DRY = flag("dry-run");

// ---- tiny RFC 4180 CSV parser (quoted fields, doubled quotes, embedded newlines)
function parseCsv(text) {
  text = text.replace(/^﻿/, "");
  const rows = []; let row = [], f = "", q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"') { if (text[i + 1] === '"') { f += '"'; i++; } else q = false; } else f += c;
    } else if (c === '"') q = true;
    else if (c === ",") { row.push(f); f = ""; }
    else if (c === "\n" || c === "\r") { if (c === "\r" && text[i + 1] === "\n") i++; row.push(f); f = ""; if (row.length > 1 || row[0] !== "") rows.push(row); row = []; }
    else f += c;
  }
  if (f !== "" || row.length) { row.push(f); rows.push(row); }
  const [head, ...body] = rows;
  return body.map((r) => Object.fromEntries(head.map((h, i) => [h, r[i] ?? ""])));
}
const load = (entity) => {
  const f = fs.readdirSync(dir).find((n) => n.endsWith(`${entity}_export.csv`));
  return f ? parseCsv(fs.readFileSync(path.join(dir, f), "utf8")).filter((r) => r.is_sample !== "true") : [];
};

const bool = (v) => String(v).toLowerCase() === "true";
const json = (v, fallback) => { if (v === "" || v == null) return fallback; try { return JSON.parse(v); } catch { return fallback; } };
const date = (v) => {
  if (!v) return undefined;
  const d = new Date(/[zZ]|[+-]\d\d:?\d\d$/.test(v) ? v : v + "Z");
  return isNaN(d) ? undefined : d.toISOString().replace("T", " ");
};
const stamps = (r) => ({ created_date: date(r.created_date), updated_date: date(r.updated_date) });

// ---- PocketBase REST
let token = "";
async function api(method, p, body) {
  const r = await fetch(PB + p, { method, headers: { "content-type": "application/json", ...(token ? { authorization: token } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const t = await r.text(); let j = null; try { j = JSON.parse(t); } catch {}
  if (!r.ok) throw new Error(`${method} ${p} -> ${r.status} ${t.slice(0, 300)}`);
  return j;
}
// PocketBase always stamps created_date/updated_date itself, so original dates are
// collected here and written to a SQL file to apply once (see the end of the run).
const dateFixes = [];
const create = async (col, data) => {
  if (DRY) return { id: "dry" + crypto.randomBytes(6).toString("hex") };
  const { created_date, updated_date, ...rest } = data;
  const rec = await api("POST", `/api/collections/${col}/records`, rest);
  if (created_date && col !== "users" && col !== "volunteer_contacts") dateFixes.push({ col, id: rec.id, c: created_date, u: updated_date || created_date });
  return rec;
};

const counts = {}; const warn = [];
const bump = (k) => (counts[k] = (counts[k] || 0) + 1);

async function main() {
  if (!DRY) {
    const email = process.env.PB_SUPERUSER_EMAIL, password = process.env.PB_SUPERUSER_PASSWORD;
    if (!email || !password) throw new Error("set PB_SUPERUSER_EMAIL and PB_SUPERUSER_PASSWORD");
    token = (await api("POST", "/api/collections/_superusers/auth-with-password", { identity: email, password })).token;
    if (!flag("allow-nonempty")) {
      for (const c of ["repeaters", "incidents", "guidance_scripts"]) {
        if ((await api("GET", `/api/collections/${c}/records?perPage=1&skipTotal=1`)).items.length)
          throw new Error(`${c} already has records. Import into a fresh install, or pass --allow-nonempty.`);
      }
    }
  }

  // Repeaters
  const repMap = new Map();
  for (const r of load("Repeater")) {
    const rec = await create("repeaters", {
      name: r.name, node_number: r.node_number, callsign: r.callsign, location: r.location, state: r.state,
      frequency: r.frequency, coverage_area: r.coverage_area, link_webhook_url: r.link_webhook_url, delink_webhook_url: r.delink_webhook_url,
      dtmf_link_code: r.dtmf_link_code, dtmf_delink_code: r.dtmf_delink_code, status: r.status || "online", notes: r.notes, ...stamps(r),
    });
    repMap.set(r.id, rec.id); bump("repeaters");
  }

  // Emergency contacts
  for (const r of load("EmergencyContact")) {
    const rid = repMap.get(r.repeater_id);
    if (!rid) { warn.push(`contact "${r.agency_name}" skipped: unknown repeater ${r.repeater_id}`); continue; }
    await create("emergency_contacts", { repeater_id: rid, agency_type: r.agency_type || "other", agency_name: r.agency_name, phone: r.phone, alternate_phone: r.alternate_phone, notes: r.notes, ...stamps(r) });
    bump("emergency_contacts");
  }

  // Guidance scripts
  for (const r of load("GuidanceScript")) {
    await create("guidance_scripts", {
      incident_category: r.incident_category || "other", incident_subtype: r.incident_subtype, title: r.title, priority_level: r.priority_level || undefined,
      initial_actions: r.initial_actions, steps: json(r.steps, []), questions_to_ask: json(r.questions_to_ask, []), triage_flow: json(r.triage_flow, null), ...stamps(r),
    });
    bump("guidance_scripts");
  }

  // DTMF commands
  for (const r of load("DtmfCommand")) {
    await create("dtmf_commands", { name: r.name, dtmf: r.dtmf, confirm_required: bool(r.confirm_required), enabled: r.enabled === "" ? true : bool(r.enabled), order: Number(r.order) || 0, ...stamps(r) });
    bump("dtmf_commands");
  }

  // Incidents
  const incMap = new Map();
  for (const r of load("Incident")) {
    const ids = json(r.repeater_id, []).map((x) => repMap.get(x)).filter(Boolean);
    const rec = await create("incidents", {
      repeater_id: ids, repeater_name: json(r.repeater_name, []), alert_type: r.alert_type, incident_category: r.incident_category || undefined,
      incident_subtype: r.incident_subtype, status: r.status || "active", priority_level: r.priority_level || undefined, source_dtmf: r.source_dtmf,
      caller_info: r.caller_info, location_info: r.location_info, nature: r.nature, summary: r.summary, ai_summary: r.ai_summary,
      wordpress_post_url: r.wordpress_post_url, assigned_operator: r.assigned_operator, resolved_date: date(r.resolved_date) || "", ...stamps(r),
    });
    incMap.set(r.id, rec.id); bump("incidents");
  }

  // Incident log (oldest first so ids sort naturally)
  let orphans = 0;
  const ups = load("IncidentUpdate").sort((a, b) => a.created_date.localeCompare(b.created_date));
  for (const r of ups) {
    const iid = incMap.get(r.incident_id);
    if (!iid) { orphans++; continue; }
    // Resolved incidents are append-only for non-superusers, but superuser writes bypass rules.
    await create("incident_updates", { incident_id: iid, operator_name: r.operator_name, message: r.message, action_type: r.action_type || undefined, ...stamps(r) });
    bump("incident_updates");
  }

  if (orphans) warn.push(`${orphans} log entries skipped: they belong to incidents that are not in the export (deleted in Base44).`);

  // Settings (non-secret fields only)
  const s = load("Settings")[0];
  if (s) {
    const existing = DRY ? { items: [] } : await api("GET", "/api/collections/settings/records?perPage=1");
    const data = {};
    for (const k of ["notification_template", "slack_channel", "wordpress_url", "wordpress_username", "allmon3_base_url", "allmon3_username", "emergency_hub_node", "incident_closeout_macro"]) if (s[k]) data[k] = s[k];
    if (!DRY) existing.items[0] ? await api("PATCH", `/api/collections/settings/records/${existing.items[0].id}`, data) : await api("POST", "/api/collections/settings/records", data);
    bump("settings");
    const secrets = ["inbound_webhook_secret", "textbelt_key", "wordpress_app_password"].filter((k) => s[k]);
    if (secrets.length) warn.push(`Settings held secrets (${secrets.join(", ")}). They were NOT imported: put them in the server .env and rotate them, they now sit in an export file.`);
    if (s.allmon3_username) warn.push("Allmon3 password was not part of the export; set ALLMON_PASS in .env.");
  }

  // Volunteers -> users + volunteer_contacts
  const resets = [];
  for (const r of load("Volunteer")) {
    if (!r.email) { warn.push(`volunteer "${r.name}" skipped: no email`); continue; }
    const pw = crypto.randomBytes(18).toString("base64url");
    const u = await create("users", { email: r.email, password: pw, passwordConfirm: pw, verified: true, emailVisibility: false, name: r.name, callsign: r.callsign, role: ["admin", "operator", "priority_watch"].includes(r.role) ? r.role : "priority_watch", active: r.active === "" ? true : bool(r.active) });
    await create("volunteer_contacts", { user: u.id, phone: r.phone, notify_sms: bool(r.notify_sms), notify_email: bool(r.notify_email) });
    resets.push(r.email); bump("volunteers");
  }
  if (flag("send-resets") && !DRY) {
    for (const email of resets) { try { await api("POST", "/api/collections/users/request-password-reset", { email }); bump("reset emails"); } catch (e) { warn.push(`reset email to ${email} failed: ${e.message}`); } }
  } else if (resets.length) warn.push(`${resets.length} volunteer account(s) have random passwords. Run again with --send-resets (needs SMTP) or use "Send reset link" on the Volunteers page.`);

  if (dateFixes.length) {
    const out = path.resolve(process.env.DATES_SQL || "restore-dates.sql");
    fs.writeFileSync(out, "BEGIN;\n" + dateFixes.map((d) => `UPDATE ${d.col} SET created_date='${d.c}', updated_date='${d.u}' WHERE id='${d.id}';`).join("\n") + "\nCOMMIT;\n");
    warn.push(`Original timestamps: stop PocketBase, run  sqlite3 /path/to/pb_data/data.db < ${out}  then start it again. (Optional; only affects ordering/history.)`);
  }
  console.log(DRY ? "DRY RUN (nothing written)" : "Imported:");
  for (const [k, v] of Object.entries(counts)) console.log(`  ${String(v).padStart(4)}  ${k}`);
  if (warn.length) { console.log("\nNotes:"); warn.forEach((w) => console.log("  - " + w)); }
}
main().catch((e) => { console.error("FAILED:", e.message); process.exit(1); });
