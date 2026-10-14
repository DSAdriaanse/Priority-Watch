// Column specs and row (de)serialization for the Excel data backup.
// Arrays (steps, questions_to_ask, triage_flow) are stored as JSON text so they round-trip through cells.

export const REPEATER_COLUMNS = [
  "name", "callsign", "node_number", "location", "state", "frequency",
  "coverage_area", "status", "link_webhook_url", "delink_webhook_url",
  "dtmf_link_code", "dtmf_delink_code", "notes",
];

export const GUIDANCE_COLUMNS = [
  "title", "incident_category", "incident_subtype", "priority_level",
  "initial_actions", "steps", "questions_to_ask", "triage_flow",
];

export const serializeRepeater = (r) => ({
  name: r.name || "",
  callsign: r.callsign || "",
  node_number: r.node_number || "",
  location: r.location || "",
  state: r.state || "",
  frequency: r.frequency || "",
  coverage_area: r.coverage_area || "",
  status: r.status || "online",
  link_webhook_url: r.link_webhook_url || "",
  delink_webhook_url: r.delink_webhook_url || "",
  dtmf_link_code: r.dtmf_link_code || "",
  dtmf_delink_code: r.dtmf_delink_code || "",
  notes: r.notes || "",
});

export const serializeGuidance = (g) => ({
  title: g.title || "",
  incident_category: g.incident_category || "",
  incident_subtype: g.incident_subtype || "",
  priority_level: g.priority_level || "high",
  initial_actions: g.initial_actions || "",
  steps: JSON.stringify(g.steps || []),
  questions_to_ask: JSON.stringify(g.questions_to_ask || []),
  triage_flow: JSON.stringify(g.triage_flow || []),
});

const str = (v) => (v === undefined || v === null ? "" : String(v));

export const parseRepeaterRow = (row) => ({
  name: str(row.name).trim(),
  callsign: str(row.callsign),
  node_number: str(row.node_number),
  location: str(row.location),
  state: str(row.state),
  frequency: str(row.frequency),
  coverage_area: str(row.coverage_area),
  status: str(row.status) || "online",
  link_webhook_url: str(row.link_webhook_url),
  delink_webhook_url: str(row.delink_webhook_url),
  dtmf_link_code: str(row.dtmf_link_code),
  dtmf_delink_code: str(row.dtmf_delink_code),
  notes: str(row.notes),
});

const parseJsonArray = (val) => {
  if (!val) return [];
  if (Array.isArray(val)) return val;
  const s = String(val).trim();
  if (!s) return [];
  try { const parsed = JSON.parse(s); return Array.isArray(parsed) ? parsed : []; } catch { return []; }
};

export const parseGuidanceRow = (row) => ({
  title: str(row.title).trim(),
  incident_category: str(row.incident_category),
  incident_subtype: str(row.incident_subtype),
  priority_level: str(row.priority_level) || "high",
  initial_actions: str(row.initial_actions),
  steps: parseJsonArray(row.steps),
  questions_to_ask: parseJsonArray(row.questions_to_ask),
  triage_flow: parseJsonArray(row.triage_flow),
});
