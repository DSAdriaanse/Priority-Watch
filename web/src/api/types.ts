// The shape of every record the server returns, written to match
// backend/pb_migrations/1760000000_schema.js. If you add or rename a field there, change it here too:
// the compiler then points at every screen that needs to follow.

export type Id = string;

/** Fields PocketBase adds to every record. */
export interface BaseRecord {
  id: Id;
  collectionId: string;
  collectionName: string;
  created_date: string;
  updated_date: string;
}

export type Role = "admin" | "operator" | "priority_watch";
export type Priority = "critical" | "high" | "medium" | "low";
export type IncidentCategory = "medical" | "fire" | "law_enforcement" | "weather" | "transportation" | "utility" | "rescue" | "hazard" | "other";

/** A login account. The built-in users collection keeps `created` and `updated`. */
export interface User {
  id: Id;
  collectionId: string;
  collectionName: string;
  created: string;
  updated: string;
  email: string;
  name: string;
  callsign: string;
  role: Role;
  active: boolean;
}

/** The signed-in person as the app sees it (adds full_name, which is the name or the email). */
export interface Me extends User {
  full_name: string;
}

export interface Repeater extends BaseRecord {
  name: string;
  node_number: string;
  callsign: string;
  location: string;
  state: string;
  frequency: string;
  coverage_area: string;
  link_webhook_url: string;
  delink_webhook_url: string;
  dtmf_link_code: string;
  dtmf_delink_code: string;
  status: "online" | "offline" | "linked" | "maintenance" | "";
  notes: string;
}

export interface Incident extends BaseRecord {
  /** Ids of the repeaters involved (a relation that allows several). */
  repeater_id: Id[];
  /** The names of those repeaters; older records may hold a single string. */
  repeater_name: string | string[];
  alert_type: string;
  incident_category: IncidentCategory | "";
  incident_subtype: string;
  status: "active" | "standby" | "resolved";
  priority_level: Priority;
  source_dtmf: string;
  caller_info: string;
  location_info: string;
  nature: string;
  summary: string;
  ai_summary: string;
  wordpress_post_url: string;
  assigned_operator: string;
  resolved_date: string;
}

export type LogAction = "note" | "link_repeater" | "delink_repeater" | "contact_made" | "status_change" | "guidance_followed" | "alert" | "assignment" | "resolution";

export interface IncidentLogEntry extends BaseRecord {
  incident_id: Id;
  operator_name: string;
  message: string;
  action_type: LogAction;
}

export interface TriageAnswer {
  label: string;
  priority?: Priority;
  add_steps?: string[];
  skip_rest?: boolean;
}
export interface TriageQuestion {
  question: string;
  answers: TriageAnswer[];
}

export interface GuidanceScript extends BaseRecord {
  incident_category: IncidentCategory;
  incident_subtype: string;
  title: string;
  priority_level: Priority | "";
  initial_actions: string;
  steps: string[];
  questions_to_ask: string[];
  triage_flow: TriageQuestion[];
}

export type AgencyType = "911" | "police" | "fire" | "emt" | "power" | "gas" | "other";

export interface EmergencyContact extends BaseRecord {
  repeater_id: Id;
  agency_type: AgencyType;
  agency_name: string;
  phone: string;
  alternate_phone: string;
  notes: string;
}

export interface DtmfCommand extends BaseRecord {
  name: string;
  dtmf: string;
  confirm_required: boolean;
  enabled: boolean;
  order: number;
}

export interface DtmfLogEntry extends BaseRecord {
  user_email: string;
  user_name: string;
  repeater_name: string;
  node: string;
  command_name: string;
  dtmf: string;
  result: "success" | "error";
  output: string;
}

/** Non-secret configuration. Secrets live in the server environment. */
export interface Settings extends BaseRecord {
  notification_template: string;
  slack_channel: string;
  wordpress_url: string;
  wordpress_username: string;
  allmon3_base_url: string;
  allmon3_username: string;
  emergency_hub_node: string;
  incident_closeout_macro: string;
}

/** A volunteer: a login account joined with the admin-only contact row. */
export interface Volunteer {
  id: Id;
  name: string;
  callsign: string;
  role: Role;
  active: boolean;
  email: string;
  phone: string;
  notify_sms: boolean;
  notify_email: boolean;
  /** Id of the volunteer_contacts row, or null if the person has none yet. */
  contactId: Id | null;
  /** Only when saving: a password to set. */
  password?: string;
}

/** What the notify route answers. */
export interface NotifyResult {
  results?: unknown[];
  notified?: number;
  failed?: number;
}
/** What the resolve route answers. */
export interface ResolveResult {
  ai_summary?: string;
  wordpress_post_url?: string;
}
/** What the DTMF route answers. */
export interface DtmfRunResult {
  output?: string;
  [key: string]: unknown;
}

/** What a live-update callback receives. */
export interface ChangeEvent<T> {
  type: "create" | "update" | "delete";
  id: Id;
  data: T;
}
