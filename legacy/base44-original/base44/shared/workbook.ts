// Column specs and row (de)serialization for the GMRS data workbook.
// Arrays (steps, questions_to_ask, triage_flow) are stored as JSON strings so
// they round-trip cleanly through Excel cells.

export const REPEATER_COLUMNS = [
  "name", "callsign", "node_number", "location", "state", "frequency",
  "coverage_area", "status", "link_webhook_url", "delink_webhook_url",
  "dtmf_link_code", "dtmf_delink_code", "notes"
];

export const GUIDANCE_COLUMNS = [
  "title", "incident_category", "incident_subtype", "priority_level",
  "initial_actions", "steps", "questions_to_ask", "triage_flow"
];

export function serializeRepeater(r: any): Record<string, any> {
  return {
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
  };
}

export function serializeGuidance(g: any): Record<string, any> {
  return {
    title: g.title || "",
    incident_category: g.incident_category || "",
    incident_subtype: g.incident_subtype || "",
    priority_level: g.priority_level || "high",
    initial_actions: g.initial_actions || "",
    steps: JSON.stringify(g.steps || []),
    questions_to_ask: JSON.stringify(g.questions_to_ask || []),
    triage_flow: JSON.stringify(g.triage_flow || []),
  };
}

export function parseRepeaterRow(row: any): any {
  return {
    name: String(row.name ?? "").trim(),
    callsign: row.callsign || "",
    node_number: row.node_number || "",
    location: row.location || "",
    state: row.state || "",
    frequency: row.frequency || "",
    coverage_area: row.coverage_area || "",
    status: row.status || "online",
    link_webhook_url: row.link_webhook_url || "",
    delink_webhook_url: row.delink_webhook_url || "",
    dtmf_link_code: row.dtmf_link_code || "",
    dtmf_delink_code: row.dtmf_delink_code || "",
    notes: row.notes || "",
  };
}

function parseJsonArray(val: any): any[] {
  if (!val) return [];
  if (Array.isArray(val)) return val;
  const s = String(val).trim();
  if (!s) return [];
  try { return JSON.parse(s); } catch { return []; }
}

export function parseGuidanceRow(row: any): any {
  return {
    title: String(row.title ?? "").trim(),
    incident_category: row.incident_category || "",
    incident_subtype: row.incident_subtype || "",
    priority_level: row.priority_level || "high",
    initial_actions: row.initial_actions || "",
    steps: parseJsonArray(row.steps),
    questions_to_ask: parseJsonArray(row.questions_to_ask),
    triage_flow: parseJsonArray(row.triage_flow),
  };
}