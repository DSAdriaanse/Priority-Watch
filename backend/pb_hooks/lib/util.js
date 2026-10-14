// Shared helpers for hook handlers. Load inside handlers with:
//   const u = require(`${__hooks}/lib/util.js`)

function env(name, fallback) {
  const v = $os.getenv(name);
  return v ? v : (fallback === undefined ? "" : fallback);
}

function trunc(v, max) {
  const s = v === undefined || v === null ? "" : String(v);
  return s.length > max ? s.slice(0, max) : s;
}

// The single settings record (non-secret configuration), or null.
function settings() {
  const all = $app.findAllRecords("settings");
  return all.length ? all[0] : null;
}

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

function repeaterNames(incident) {
  const raw = incident.get("repeater_name");
  let arr = [];
  try {
    arr = typeof raw === "string" ? JSON.parse(raw) : (raw || []);
  } catch (_) { arr = []; }
  return Array.isArray(arr) ? arr : [String(arr)];
}

module.exports = { env, trunc, settings, setting, requireRole, displayName, logUpdate, repeaterNames };
