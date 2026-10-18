import React, { useState, useEffect } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { addIncidentLogEntry, auth, deleteIncident, getIncident, getRepeater, listContactsFor, listGuidance, listIncidentLog, notifyVolunteers, resolveIncident, team, updateIncident, type EmergencyContact, type GuidanceScript, type Incident, type IncidentLogEntry, type Repeater, type User } from "@/api";
import { ArrowLeft } from "lucide-react";
import IncidentHeader from "@/features/incidents/detail/IncidentHeader";
import IncidentPanel from "@/features/incidents/detail/IncidentPanel";
import IncidentLog from "@/features/incidents/detail/IncidentLog";
import GuidancePanel from "@/features/incidents/detail/GuidancePanel";
import { useToast } from "@/components/ui/use-toast";
import { useAuth } from "@/features/auth/AuthContext";
import { cn } from "@/lib/utils";


// ONE INCIDENT (/incident/:id): the working screen during a live emergency.
// Three panels: the incident (owner, details, contacts, repeater controls), the log,
// and the guidance with triage. On wide screens (xl) they are three side-by-side
// columns that scroll independently; on phones and tablets they are tabs.
// Buttons here call the server routes: notify the team, resolve (AI summary +
// WordPress), close as false alarm. Once resolved, the server blocks further edits.
export default function IncidentDetail() {
  const id = useParams().id as string;
  const navigate = useNavigate();
  const { toast } = useToast();
  const { isAdmin } = useAuth();
  const [incident, setIncident] = useState<Incident | null>(null);
  const [updates, setUpdates] = useState<IncidentLogEntry[]>([]);
  const [repeaters, setRepeaters] = useState<Repeater[]>([]);
  const [contacts, setContacts] = useState<EmergencyContact[]>([]);
  const [guidance, setGuidance] = useState<GuidanceScript[]>([]);
  const [volunteers, setVolunteers] = useState<User[]>([]);
  const [selectedGuidance, setSelectedGuidance] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [resolving, setResolving] = useState(false);
  const [falseAlarm, setFalseAlarm] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [aiSummary, setAiSummary] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notificationResults, setNotificationResults] = useState<unknown[] | null>(null);
  const [tab, setTab] = useState("incident"); // which panel shows below the xl breakpoint

  // Load the incident plus everything around it in parallel: its log, its repeaters,
  // their emergency contacts, all guidance scripts and the active team.
  const load = async () => {
    setError(null);
    try {
      const inc = await getIncident(id);
      setIncident(inc);
      setAiSummary(inc.ai_summary || null);
      const repeaterIds = Array.isArray(inc.repeater_id) ? inc.repeater_id.filter(Boolean) : (inc.repeater_id ? [inc.repeater_id] : []);
      const [ups, reps, conts, guides, vols] = await Promise.all([
        listIncidentLog(id),
        Promise.all(repeaterIds.map((rid) => getRepeater(rid).catch(() => null))).then((arr) => arr.filter(Boolean)),
        Promise.all(repeaterIds.map((rid) => listContactsFor(rid))).then((arrs) => arrs.flat()),
        listGuidance(),
        team.listActiveVolunteers(),
      ]);
      setUpdates(ups);
      setRepeaters(reps.filter((r): r is Repeater => r !== null));
      setContacts(conts);
      setGuidance(guides);
      setVolunteers(vols);
      // Preselect the best-matching guidance script: same category AND subtype wins,
      // otherwise the script for the category with no subtype.
      if (inc.incident_category) {
        const bySubtype = guides.find((x) => x.incident_category === inc.incident_category && x.incident_subtype && inc.incident_subtype && x.incident_subtype.toLowerCase() === inc.incident_subtype.toLowerCase());
        const byCategory = guides.find((x) => x.incident_category === inc.incident_category && !x.incident_subtype);
        const g = bySubtype || byCategory;
        if (g) setSelectedGuidance(g.id);
      }
    } catch (e) {
      console.error("Failed to load incident", e);
      setError(e.message || "Failed to load incident");
    }
  };

  useEffect(() => { load(); }, [id]);

  // Save one edited field straight away, then update the screen without a reload.
  const saveField = async (field, value) => {
    await updateIncident(id, { [field]: value });
    setIncident({ ...(incident as Incident), [field]: value });
  };

  const matchGuidance = (category, subtype) => {
    if (!category) return;
    const bySubtype = guidance.find((g) => g.incident_category === category && g.incident_subtype && subtype && g.incident_subtype.toLowerCase() === subtype.toLowerCase());
    const byCategory = guidance.find((g) => g.incident_category === category && !g.incident_subtype);
    const g = bySubtype || byCategory;
    if (g) setSelectedGuidance(g.id);
  };

  const addUpdate = async (text) => {
    setBusy(true);
    try {
      const me = await auth.me().catch(() => null);
      await addIncidentLogEntry({
        incident_id: id,
        operator_name: me?.full_name || "Operator",
        message: text,
        action_type: "note",
      });
      setUpdates(await listIncidentLog(id));
    } finally {
      setBusy(false);
    }
  };

  // Asks the server to alert Slack, SMS and email. The server replies with a result
  // per channel and per person, which NotificationResults displays.
  const notifyTeam = async () => {
    setBusy(true);
    setNotificationResults(null);
    if (!incident) return;
    try {
      const res = await notifyVolunteers({
        incident_id: id,
        repeater_name: Array.isArray(incident.repeater_name) ? incident.repeater_name.join(", ") : incident.repeater_name,
        alert_type: incident.alert_type,
        nature: incident.nature,
      });
      setNotificationResults(res.results || []);
      toast({ title: res.failed ? "Notification failures" : "Notifications accepted", description: `${res.notified || 0} accepted, ${res.failed || 0} failed. See notification results below.`, variant: res.failed ? "destructive" : "default" });
      load();
    } catch (e) {
      toast({ title: "Notification failed", description: e.message, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  // Hand the incident to a named operator and write the handoff into the log.
  const assignOwner = async (name) => {
    if (!name) return false;
    setBusy(true);
    try {
      const me = await auth.me().catch(() => null);
      const prev = incident?.assigned_operator;
      await updateIncident(id, { assigned_operator: name });
      await addIncidentLogEntry({
        incident_id: id,
        operator_name: me?.full_name || "Operator",
        message: prev ? `Response ownership handed off from ${prev} to ${name}.` : `Response ownership assigned to ${name}.`,
        action_type: "assignment",
      });
      toast({ title: prev ? "Ownership handed off" : "Owner assigned", description: `${name} now owns this response.` });
      load();
      return true;
    } catch (e) {
      toast({ title: "Assignment failed", description: e.message, variant: "destructive" });
      return false;
    } finally {
      setBusy(false);
    }
  };

  const takeOwnership = async () => {
    const me = await auth.me().catch(() => null);
    const name = me?.full_name || "Operator";
    await assignOwner(name);
  };

  // Close with an AI-written summary (and WordPress post if configured). The work
  // happens on the server in backend/pb_hooks/incidents.pb.js.
  const resolve = async () => {
    if (!confirm("Are you sure? This will close out the incident and prevent further changes.")) return;
    setResolving(true);
    try {
      const res = await resolveIncident({ incident_id: id });
      setAiSummary(res?.ai_summary || "Summary generated.");
      toast({ title: "Incident resolved", description: res?.wordpress_post_url ? "Posted to WordPress." : "AI summary generated." });
      load();
    } catch (e) {
      toast({ title: "Resolution failed", description: e.message, variant: "destructive" });
    } finally {
      setResolving(false);
    }
  };

  // Close without a summary and without publishing anything.
  const closeFalseAlarm = async () => {
    if (!confirm("Are you sure? This will close out the incident and prevent further changes.")) return;
    setFalseAlarm(true);
    try {
      await resolveIncident({ incident_id: id, false_alarm: true });
      toast({ title: "Closed as false alarm", description: "Logged. Not posted to WordPress." });
      load();
    } catch (e) {
      toast({ title: "Close failed", description: e.message, variant: "destructive" });
    } finally {
      setFalseAlarm(false);
    }
  };

  // Permanent delete. The server only allows admins.
  const removeIncident = async () => {
    if (!confirm("Delete this report permanently? This cannot be undone.")) return;
    setDeleting(true);
    try {
      await deleteIncident(id);
      toast({ title: "Report deleted" });
      navigate("/");
    } catch (e) {
      toast({ title: "Delete failed", description: e.message, variant: "destructive" });
    } finally {
      setDeleting(false);
    }
  };

  if (!incident) {
    if (error) {
      return (
        <div className="space-y-4">
          <Link to="/" className="inline-flex items-center text-sm text-gray-400 hover:text-gray-200">
            <ArrowLeft className="w-4 h-4 mr-1" /> Back to Dashboard
          </Link>
          <div className="text-red-400 text-sm">Could not load this incident: {error}</div>
        </div>
      );
    }
    return <div className="text-gray-400">Loading incident…</div>;
  }

  const readOnly = incident.status === "resolved";
  const repeaterTitle = Array.isArray(incident.repeater_name) ? incident.repeater_name.join(", ") : incident.repeater_name;

  // Each panel is one column on wide screens (xl) and one tab on narrower ones.
  // All three stay mounted and are only hidden with CSS, so typing in a field or
  // working through triage is not lost when you switch tabs.
  const panel = (name) =>
    cn(tab === name ? "block" : "hidden", "xl:block xl:min-h-0 xl:overflow-y-auto xl:pr-1 space-y-4");

  const tabs = [
    { id: "incident", label: "Incident" },
    { id: "log", label: `Log (${updates.length})` },
    { id: "guidance", label: "Guidance" },
  ];

  return (
    <div className="space-y-4 xl:flex xl:h-[calc(100vh-4rem)] xl:flex-col xl:space-y-0 xl:gap-4">
      {/* Header: who and what, plus the actions that end the incident */}
      <IncidentHeader incident={incident} repeaterTitle={repeaterTitle} isAdmin={isAdmin} resolving={resolving} falseAlarm={falseAlarm} deleting={deleting} onResolve={resolve} onFalseAlarm={closeFalseAlarm} onDelete={removeIncident} />

      {/* Tab bar: phones and tablets only. Sticks under the mobile top bar. */}
      <div role="tablist" className="sticky top-[3.25rem] z-20 -mx-4 grid grid-cols-3 border-b border-gray-700 bg-gray-900 px-4 md:top-0 md:-mx-8 md:px-8 xl:hidden">
        {tabs.map((t) => (
          <button
            key={t.id}
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => setTab(t.id)}
            className={cn(
              "border-b-2 py-3 text-sm font-medium transition-colors",
              tab === t.id ? "border-sky-500 text-gray-100" : "border-transparent text-gray-400 hover:text-gray-200"
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="xl:grid xl:min-h-0 xl:flex-1 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.1fr)] xl:gap-4">
        {/* ---- Column 1: the incident itself ---- */}
        <section role="tabpanel" className={panel("incident")}>
          <IncidentPanel incident={incident} readOnly={readOnly} busy={busy} volunteers={volunteers} contacts={contacts} repeaters={repeaters} notificationResults={notificationResults} onSaveField={saveField} onMatchGuidance={matchGuidance} onTakeOwnership={takeOwnership} onAssign={assignOwner} onNotify={notifyTeam} />
        </section>

        {/* ---- Column 2: what has happened (newest first) ---- */}
        <section role="tabpanel" className={panel("log")}>
          <IncidentLog incident={incident} readOnly={readOnly} busy={busy} updates={updates} aiSummary={aiSummary} onAdd={addUpdate} />
        </section>

        {/* ---- Column 3: what to do ---- */}
        <section role="tabpanel" className={panel("guidance")}>
          <GuidancePanel incident={incident} guidance={guidance} selectedGuidance={selectedGuidance} onSelect={setSelectedGuidance} onApplied={load} />
        </section>
      </div>
    </div>
  );
}
