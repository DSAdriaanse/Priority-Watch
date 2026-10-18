import React, { useState, useEffect } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { entities, functions, auth } from "@/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeft, Phone, Send, CheckCircle2, BookOpen, Loader2, MessageSquare, UserCog, Stethoscope, Ban, Trash2, RadioTower } from "lucide-react";
import StatusBadge from "@/components/StatusBadge";
import OwnerBadge from "@/components/OwnerBadge";
import NotificationResults from "@/components/NotificationResults";
import RepeaterControls from "@/components/RepeaterControls";
import TriageRunner from "@/components/TriageRunner";
import { INCIDENT_CATEGORIES, formatCategory } from "@/lib/incidentTaxonomy";
import { useToast } from "@/components/ui/use-toast";
import { useAuth } from "@/lib/AuthContext";
import { cn } from "@/lib/utils";

// categories now sourced from @/lib/incidentTaxonomy
const agencyLabels = { "911": "911 / Emergency", police: "Police", fire: "Fire", emt: "EMT / EMS", power: "Power Company", gas: "Gas Company", other: "Other" };

// ONE INCIDENT (/incident/:id): the working screen during a live emergency.
// Three panels: the incident (owner, details, contacts, repeater controls), the log,
// and the guidance with triage. On wide screens (xl) they are three side-by-side
// columns that scroll independently; on phones and tablets they are tabs.
// Buttons here call the server routes: notify the team, resolve (AI summary +
// WordPress), close as false alarm. Once resolved, the server blocks further edits.
export default function IncidentDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { isAdmin } = useAuth();
  const [incident, setIncident] = useState(null);
  const [updates, setUpdates] = useState([]);
  const [repeaters, setRepeaters] = useState([]);
  const [contacts, setContacts] = useState([]);
  const [guidance, setGuidance] = useState([]);
  const [volunteers, setVolunteers] = useState([]);
  const [selectedGuidance, setSelectedGuidance] = useState(null);
  const [assignPick, setAssignPick] = useState("");
  const [newUpdate, setNewUpdate] = useState("");
  const [busy, setBusy] = useState(false);
  const [resolving, setResolving] = useState(false);
  const [falseAlarm, setFalseAlarm] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [aiSummary, setAiSummary] = useState(null);
  const [error, setError] = useState(null);
  const [notificationResults, setNotificationResults] = useState(null);
  const [tab, setTab] = useState("incident"); // which panel shows below the xl breakpoint

  // Load the incident plus everything around it in parallel: its log, its repeaters,
  // their emergency contacts, all guidance scripts and the active team.
  const load = async () => {
    setError(null);
    try {
      const inc = await entities.Incident.get(id);
      setIncident(inc);
      setAiSummary(inc.ai_summary || null);
      const repeaterIds = Array.isArray(inc.repeater_id) ? inc.repeater_id.filter(Boolean) : (inc.repeater_id ? [inc.repeater_id] : []);
      const [ups, reps, conts, guides, vols] = await Promise.all([
        entities.IncidentUpdate.filter({ incident_id: id }, "-created_date", 200),
        Promise.all(repeaterIds.map((rid) => entities.Repeater.get(rid).catch(() => null))).then((arr) => arr.filter(Boolean)),
        Promise.all(repeaterIds.map((rid) => entities.EmergencyContact.filter({ repeater_id: rid }))).then((arrs) => arrs.flat()),
        entities.GuidanceScript.list(),
        entities.Volunteer.filter({ active: true }),
      ]);
      setUpdates(ups);
      setRepeaters(reps);
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
    await entities.Incident.update(id, { [field]: value });
    setIncident({ ...incident, [field]: value });
  };

  const matchGuidance = (category, subtype) => {
    if (!category) return;
    const bySubtype = guidance.find((g) => g.incident_category === category && g.incident_subtype && subtype && g.incident_subtype.toLowerCase() === subtype.toLowerCase());
    const byCategory = guidance.find((g) => g.incident_category === category && !g.incident_subtype);
    const g = bySubtype || byCategory;
    if (g) setSelectedGuidance(g.id);
  };

  const addUpdate = async () => {
    if (!newUpdate.trim()) return;
    setBusy(true);
    try {
      const me = await auth.me().catch(() => null);
      await entities.IncidentUpdate.create({
        incident_id: id,
        operator_name: me?.full_name || "Operator",
        message: newUpdate.trim(),
        action_type: "note",
      });
      setNewUpdate("");
      setUpdates(await entities.IncidentUpdate.filter({ incident_id: id }, "-created_date", 200));
    } finally {
      setBusy(false);
    }
  };

  // Asks the server to alert Slack, SMS and email. The server replies with a result
  // per channel and per person, which NotificationResults displays.
  const notifyTeam = async () => {
    setBusy(true);
    setNotificationResults(null);
    try {
      const res = await functions.invoke("notifyVolunteers", {
        incident_id: id,
        repeater_name: Array.isArray(incident.repeater_name) ? incident.repeater_name.join(", ") : incident.repeater_name,
        alert_type: incident.alert_type,
        nature: incident.nature,
      });
      setNotificationResults(res.data.results || []);
      toast({ title: res.data.failed ? "Notification failures" : "Notifications accepted", description: `${res.data.notified || 0} accepted, ${res.data.failed || 0} failed. See notification results below.`, variant: res.data.failed ? "destructive" : "default" });
      load();
    } catch (e) {
      toast({ title: "Notification failed", description: e.message, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  // Hand the incident to a named operator and write the handoff into the log.
  const assignOwner = async (name) => {
    if (!name) return;
    setBusy(true);
    try {
      const me = await auth.me().catch(() => null);
      const prev = incident.assigned_operator;
      await entities.Incident.update(id, { assigned_operator: name });
      await entities.IncidentUpdate.create({
        incident_id: id,
        operator_name: me?.full_name || "Operator",
        message: prev ? `Response ownership handed off from ${prev} to ${name}.` : `Response ownership assigned to ${name}.`,
        action_type: "assignment",
      });
      setAssignPick("");
      toast({ title: prev ? "Ownership handed off" : "Owner assigned", description: `${name} now owns this response.` });
      load();
    } catch (e) {
      toast({ title: "Assignment failed", description: e.message, variant: "destructive" });
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
      const res = await functions.invoke("resolveIncident", { incident_id: id });
      setAiSummary(res.data?.ai_summary || "Summary generated.");
      toast({ title: "Incident resolved", description: res.data?.wordpress_post_url ? "Posted to WordPress." : "AI summary generated." });
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
      await functions.invoke("resolveIncident", { incident_id: id, false_alarm: true });
      toast({ title: "Closed as false alarm", description: "Logged. Not posted to WordPress." });
      load();
    } catch (e) {
      toast({ title: "Close failed", description: e.message, variant: "destructive" });
    } finally {
      setFalseAlarm(false);
    }
  };

  // Permanent delete. The server only allows admins.
  const deleteIncident = async () => {
    if (!confirm("Delete this report permanently? This cannot be undone.")) return;
    setDeleting(true);
    try {
      await entities.Incident.delete(id);
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

  const activeGuidance = guidance.find((g) => g.id === selectedGuidance);
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
      <div className="space-y-3 xl:shrink-0">
        <Link to="/" className="inline-flex items-center text-sm text-gray-400 hover:text-gray-200">
          <ArrowLeft className="w-4 h-4 mr-1" /> Back to Dashboard
        </Link>
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-xl font-semibold text-gray-100 break-words">{repeaterTitle}</h1>
              <StatusBadge status={incident.status} />
              <StatusBadge status={incident.priority_level} />
            </div>
            <p className="text-sm text-gray-400">{incident.alert_type} · {new Date(incident.created_date).toLocaleString()}</p>
          </div>
          {incident.status !== "resolved" ? (
            <div className="grid grid-cols-2 gap-2 md:flex md:shrink-0">
              <Button onClick={resolve} disabled={resolving} className="bg-emerald-700 hover:bg-emerald-800 text-white">
                {resolving ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Resolving…</> : <><CheckCircle2 className="w-4 h-4 mr-2" /> Resolve & Publish</>}
              </Button>
              <Button onClick={closeFalseAlarm} disabled={falseAlarm} variant="outline" className="bg-gray-900 border-gray-700 text-gray-300">
                {falseAlarm ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Closing…</> : <><Ban className="w-4 h-4 mr-2" /> Close — False Alarm</>}
              </Button>
            </div>
          ) : isAdmin ? (
            <Button onClick={deleteIncident} disabled={deleting} variant="destructive" className="md:shrink-0">
              <Trash2 className="w-4 h-4 mr-2" /> Delete Report
            </Button>
          ) : null}
        </div>
      </div>

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
          <Card className="bg-gray-800 border-gray-700">
            <CardContent className="p-4 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <UserCog className="w-4 h-4 text-sky-400" />
                  <span className="text-xs text-gray-500">Response owner</span>
                  <OwnerBadge name={incident.assigned_operator} />
                </div>
                {!readOnly && (
                  <Button size="sm" variant="outline" onClick={takeOwnership} disabled={busy} className="bg-gray-900 border-gray-700 text-gray-200">Take ownership</Button>
                )}
              </div>
              {!readOnly && (
                <div className="flex gap-2">
                  <Select value={assignPick} onValueChange={setAssignPick}>
                    <SelectTrigger className="flex-1 bg-gray-900 border-gray-700"><SelectValue placeholder="Hand off to…" /></SelectTrigger>
                    <SelectContent className="bg-gray-900 border-gray-700">
                      {volunteers.map((v) => <SelectItem key={v.id} value={v.name}>{v.name}{v.callsign ? ` · ${v.callsign}` : ""}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <Button size="sm" onClick={() => assignOwner(assignPick)} disabled={busy || !assignPick} className="bg-sky-700 hover:bg-sky-800 text-white">Hand off</Button>
                </div>
              )}

              <div className="space-y-3 border-t border-gray-700/60 pt-4">
                <div className="space-y-1.5">
                  <Label htmlFor="inc-caller" className="text-gray-400 text-xs">Caller info</Label>
                  <Input id="inc-caller" className="bg-gray-900 border-gray-700" defaultValue={incident.caller_info} readOnly={readOnly} onBlur={(e) => saveField("caller_info", e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="inc-location" className="text-gray-400 text-xs">Location</Label>
                  <Input id="inc-location" className="bg-gray-900 border-gray-700" defaultValue={incident.location_info} readOnly={readOnly} onBlur={(e) => saveField("location_info", e.target.value)} />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="inc-category" className="text-gray-400 text-xs">Category</Label>
                    <Select value={incident.incident_category || ""} disabled={readOnly} onValueChange={(v) => { saveField("incident_category", v); matchGuidance(v, incident.incident_subtype); }}>
                      <SelectTrigger id="inc-category" className="bg-gray-900 border-gray-700"><SelectValue placeholder="Classify" /></SelectTrigger>
                      <SelectContent className="bg-gray-900 border-gray-700">
                        {INCIDENT_CATEGORIES.map((c) => <SelectItem key={c} value={c}>{formatCategory(c)}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="inc-priority" className="text-gray-400 text-xs">Priority</Label>
                    <Select value={incident.priority_level} disabled={readOnly} onValueChange={(v) => saveField("priority_level", v)}>
                      <SelectTrigger id="inc-priority" className="bg-gray-900 border-gray-700"><SelectValue /></SelectTrigger>
                      <SelectContent className="bg-gray-900 border-gray-700">
                        {["critical", "high", "medium", "low"].map((p) => <SelectItem key={p} value={p} className="capitalize">{p}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="inc-subtype" className="text-gray-400 text-xs">Subtype</Label>
                  <Input id="inc-subtype" className="bg-gray-900 border-gray-700" defaultValue={incident.incident_subtype || ""} readOnly={readOnly} placeholder="e.g. chest pain, brush fire, lost hiker" onBlur={(e) => { saveField("incident_subtype", e.target.value); matchGuidance(incident.incident_category, e.target.value); }} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="inc-nature" className="text-gray-400 text-xs">Nature of emergency</Label>
                  <Textarea id="inc-nature" className="bg-gray-900 border-gray-700" rows={3} defaultValue={incident.nature} readOnly={readOnly} onBlur={(e) => saveField("nature", e.target.value)} />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Emergency contacts and team notification */}
          <Card className="bg-gray-800 border-gray-700">
            <CardHeader className="pb-3"><CardTitle className="text-sm text-gray-200 flex items-center gap-2"><Phone className="w-4 h-4 text-red-400" /> Emergency Contacts</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              {contacts.length === 0 ? (
                <div className="text-sm text-gray-500">No contacts configured for this repeater.</div>
              ) : contacts.map((c) => (
                <div key={c.id} className="flex items-center justify-between gap-3 py-2 border-b border-gray-700/50 last:border-0">
                  <div className="min-w-0">
                    <div className="text-sm text-gray-200">{agencyLabels[c.agency_type] || c.agency_type}: {c.agency_name}</div>
                    {c.notes && <div className="text-xs text-gray-500">{c.notes}</div>}
                  </div>
                  <a href={`tel:${c.phone}`} className="shrink-0 text-sm font-mono text-emerald-400 hover:text-emerald-300">{c.phone}</a>
                </div>
              ))}
              {!readOnly && (
                <div className="pt-3 space-y-3">
                  <Button onClick={notifyTeam} disabled={busy} variant="outline" className="bg-gray-900 border-gray-700 text-gray-200">
                    <Send className="w-4 h-4 mr-1" /> Notify Team
                  </Button>
                  <NotificationResults results={notificationResults} />
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="bg-gray-800 border-gray-700">
            <CardHeader className="pb-3"><CardTitle className="text-sm text-gray-200 flex items-center gap-2"><RadioTower className="w-4 h-4 text-sky-400" /> Repeater Controls</CardTitle></CardHeader>
            <CardContent>
              <RepeaterControls repeaters={repeaters} />
            </CardContent>
          </Card>
        </section>

        {/* ---- Column 2: what has happened (newest first) ---- */}
        <section role="tabpanel" className={panel("log")}>
          {aiSummary && (
            <Card className="bg-emerald-900/20 border-emerald-700/40">
              <CardHeader className="pb-3"><CardTitle className="text-sm text-emerald-300 flex items-center gap-2"><CheckCircle2 className="w-4 h-4" /> Resolution Summary</CardTitle></CardHeader>
              <CardContent>
                <pre className="text-sm text-gray-200 whitespace-pre-wrap font-sans">{aiSummary}</pre>
                {incident.wordpress_post_url && <a href={incident.wordpress_post_url} target="_blank" rel="noreferrer" className="text-xs text-emerald-400 hover:underline">View on WordPress →</a>}
              </CardContent>
            </Card>
          )}
          <Card className="bg-gray-800 border-gray-700">
            <CardHeader className="pb-3"><CardTitle className="text-sm text-gray-200 flex items-center gap-2"><MessageSquare className="w-4 h-4 text-gray-400" /> Incident Log</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              {/* New entries go in at the top, where the newest entry appears */}
              {!readOnly && (
                <div className="flex gap-2">
                  <Input className="bg-gray-900 border-gray-700" placeholder="Log an update…" value={newUpdate} onChange={(e) => setNewUpdate(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addUpdate()} />
                  <Button onClick={addUpdate} disabled={busy || !newUpdate.trim()} className="bg-gray-700 hover:bg-gray-600 text-white">Add</Button>
                </div>
              )}
              {updates.length === 0 && <div className="text-sm text-gray-500">Nothing logged yet.</div>}
              <div className="space-y-3">
                {updates.map((u) => (
                  <div key={u.id} className="text-sm border-l-2 border-gray-600 pl-3 py-0.5">
                    <div className="flex flex-wrap items-center gap-2 text-xs text-gray-500">
                      <span>{new Date(u.created_date).toLocaleTimeString()}</span>
                      <span className="text-gray-400">·</span>
                      <span className="text-gray-300">{u.operator_name}</span>
                      {u.action_type !== "note" && <span className="text-[10px] uppercase text-sky-400">{u.action_type.replace("_", " ")}</span>}
                    </div>
                    {/* pre-wrap keeps the line breaks in triage answers and notification results */}
                    <div className="text-gray-200 whitespace-pre-wrap break-words">{u.message}</div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </section>

        {/* ---- Column 3: what to do ---- */}
        <section role="tabpanel" className={panel("guidance")}>
          <Card className="bg-gray-800 border-gray-700">
            <CardHeader className="pb-3"><CardTitle className="text-sm text-gray-200 flex items-center gap-2"><BookOpen className="w-4 h-4 text-amber-400" /> Response Guidance</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <Select value={selectedGuidance || ""} onValueChange={setSelectedGuidance}>
                <SelectTrigger className="bg-gray-900 border-gray-700"><SelectValue placeholder="Select guidance script" /></SelectTrigger>
                <SelectContent className="bg-gray-900 border-gray-700">
                  {guidance.map((g) => <SelectItem key={g.id} value={g.id}>{g.title}</SelectItem>)}
                </SelectContent>
              </Select>
              {!activeGuidance && <div className="text-sm text-gray-500">Pick a guidance script, or set a category on the incident to match one.</div>}
              {activeGuidance && (
                <div className="space-y-3 pt-1">
                  <div className="text-xs text-amber-300 font-medium">Initial Actions</div>
                  <div className="text-sm text-gray-300 bg-amber-500/5 border border-amber-500/20 rounded-md p-3">{activeGuidance.initial_actions}</div>
                  <div className="text-xs text-gray-400 font-medium">Steps</div>
                  <ol className="space-y-1.5 list-decimal list-inside text-sm text-gray-300">
                    {activeGuidance.steps?.map((s, i) => <li key={i}>{s}</li>)}
                  </ol>
                  {activeGuidance.questions_to_ask?.length > 0 && (
                    <>
                      <div className="text-xs text-gray-400 font-medium pt-1">Key Questions</div>
                      <ul className="space-y-1 list-disc list-inside text-sm text-gray-400">
                        {activeGuidance.questions_to_ask.map((q, i) => <li key={i}>{q}</li>)}
                      </ul>
                    </>
                  )}
                </div>
              )}
              {activeGuidance?.triage_flow?.length > 0 && (
                <div className="pt-3 border-t border-gray-700/60 space-y-3">
                  <div className="text-xs text-amber-300 font-medium flex items-center gap-2"><Stethoscope className="w-3.5 h-3.5" /> Triage Flow</div>
                  <TriageRunner guidance={activeGuidance} incident={incident} onApplied={load} />
                </div>
              )}
            </CardContent>
          </Card>
        </section>
      </div>
    </div>
  );
}
