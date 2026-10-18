// Incidents, their log entries, and the server routes that act on them.
import { table, post } from "./records";
import type { Incident, IncidentLogEntry, NotifyResult, ResolveResult } from "./types";

const incidents = table<Incident>("incidents");
const log = table<IncidentLogEntry>("incident_updates");

// Dashboard list: the newest 50.
export const listRecentIncidents = () => incidents.list({ limit: 50 });
// Reports list: the most recently resolved 200.
export const listResolvedIncidents = () => incidents.list({ sort: "-resolved_date", limit: 200 });
export const getIncident = incidents.get;
export const createIncident = incidents.create;
export const updateIncident = incidents.update;
export const deleteIncident = incidents.remove;
export const watchIncidents = incidents.watch;

// The log of one incident, newest first.
export const listIncidentLog = (incidentId: string) => log.list({ where: { incident_id: incidentId }, limit: 200 });
export const addIncidentLogEntry = log.create;

// Server routes. Both return the server's JSON.
export const notifyVolunteers = (body: { incident_id: string; repeater_name?: string; alert_type?: string; nature?: string }) =>
  post<NotifyResult>("/api/pw/notify", body);
export const resolveIncident = (body: { incident_id: string; false_alarm?: boolean }) => post<ResolveResult>("/api/pw/resolve", body);
