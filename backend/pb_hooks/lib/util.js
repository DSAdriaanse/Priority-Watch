// Shared helpers for hook handlers. Load inside handlers with:
//   const u = require(`${__hooks}/lib/util.js`)
//
// Why require() inside each handler instead of once at the top of a file:
// PocketBase runs every route handler in its own isolated JavaScript context,
// so top-level variables and imports from the file are NOT visible inside a
// handler. Loading the helper inside the handler is what makes it available.

// Read a server environment variable (set in /etc/priority-watch/env). Returns
// the fallback, or an empty string, when it is missing or blank.
function env(name, fallback) {
  const v = $os.getenv(name);
  return v ? v : (fallback === undefined ? "" : fallback);
}

// Clamp any value to a string of at most max characters. Used on every piece of
// text that arrives from outside, so nothing oversized reaches the database.
function trunc(v, max) {
  const s = v === undefined || v === null ? "" : String(v);
  return s.length > max ? s.slice(0, max) : s;
}

// The single settings record (non-secret configuration), or null.
function settings() {
  const all = $app.findAllRecords("settings");
  return all.length ? all[0] : null;
}

// One text field from the settings record, or "" if there is none.
function setting(rec, name) {
  return rec ? (rec.getString(name) || "") : "";
}

// Server-side role check used by every custom route.
// roles: array of "admin" | "operator" | "priority_watch"
function requireRole(e, roles) {
  const a = e.auth;
  if (!a || a.collection().name !== "users") {
    throw new UnauthorizedError("Sign in required.");
  }
  if (!a.getBool("active")) {
    throw new ForbiddenError("This account is inactive.");
  }
  if (roles.indexOf(a.getString("role")) < 0) {
    throw new ForbiddenError("You do not have permission to do this.");
  }
  return a;
}

// Friendly name for logs: the user's name, else their email, else "Operator".
function displayName(user) {
  return user.getString("name") || user.email() || "Operator";
}

// Append an entry to an incident's log (server side, bypasses collection rules).
function logUpdate(incidentId, operatorName, message, actionType) {
  const col = $app.findCollectionByNameOrId("incident_updates");
  const rec = new Record(col);
  rec.set("incident_id", incidentId);
  rec.set("operator_name", operatorName);
  rec.set("message", trunc(message, 50000));
  rec.set("action_type", actionType || "note");
  $app.save(rec);
  return rec;
}

// Names of the repeaters on an incident (stored as a JSON array in a JSON field).
// PocketBase's JS runtime returns a JSON field as raw bytes (an array of numbers), not as parsed data,
// so decode those to text before parsing.
function repeaterNames(incident) {
  let raw = incident.get("repeater_name");
  if (Array.isArray(raw) && raw.length > 0 && raw.every((n) => typeof n === "number")) {
    raw = Buffer.from(raw).toString("utf8");
  }
  let arr = [];
  try {
    arr = typeof raw === "string" ? JSON.parse(raw) : (raw || []);
  } catch (_) { arr = []; }
  if (!Array.isArray(arr)) arr = arr ? [String(arr)] : [];
  return arr.map((x) => String(x));
}

module.exports = { env, trunc, settings, setting, requireRole, displayName, logUpdate, repeaterNames };
