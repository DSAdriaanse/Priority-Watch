import React, { useState, useEffect } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { base44 } from "@/api/base44Client";
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

// categories now sourced from @/lib/incidentTaxonomy
const agencyLabels = { "911": "911 / Emergency", police: "Police", fire: "Fire", emt: "EMT / EMS", power: "Power Company", gas: "Gas Company", other: "Other" };

export default function IncidentDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();
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

  const load = async () => {
    setError(null);
    try {
      const inc = await base44.entities.Incident.get(id);
      setIncident(inc);
      setAiSummary(inc.ai_summary || null);
      const repeaterIds = Array.isArray(inc.repeater_id) ? inc.repeater_id.filter(Boolean) : (inc.repeater_id ? [inc.repeater_id] : []);
      const [ups, reps, conts, guides, vols] = await Promise.all([
        base44.entities.IncidentUpdate.filter({ incident_id: id }, "-created_date", 200),
        Promise.all(repeaterIds.map((rid) => base44.entities.Repeater.get(rid).catch(() => null))).then((arr) => arr.filter(Boolean)),
        Promise.all(repeaterIds.map((rid) => base44.entities.EmergencyContact.filter({ repeater_id: rid }))).then((arrs) => arrs.flat()),
        base44.entities.GuidanceScript.list(),
        base44.entities.Volunteer.filter({ active: true }),
      ]);
      setUpdates(ups);
      setRepeaters(reps);
      setContacts(conts);
      setGuidance(guides);
      setVolunteers(vols);
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

  const saveField = async (field, value) => {
    await base44.entities.Incident.update(id, { [field]: value });
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
      const me = await base44.auth.me().catch(() => null);
      await base44.entities.IncidentUpdate.create({
        incident_id: id,
        operator_name: me?.full_name || "Operator",
        message: newUpdate.trim(),
        action_type: "note",
      });
      setNewUpdate("");
      setUpdates(await base44.entities.IncidentUpdate.filter({ incident_id: id }, "-created_date", 200));
    } finally {
      setBusy(false);
    }
  };

  const notifyTeam = async () => {
    setBusy(true);
    setNotificationResults(null);
    try {
      const res = await base44.functions.invoke("notifyVolunteers", {
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

  const assignOwner = async (name) => {
    if (!name) return;
    setBusy(true);
    try {
      const me = await base44.auth.me().catch(() => null);
      const prev = incident.assigned_operator;
      await base44.entities.Incident.update(id, { assigned_operator: name });
      await base44.entities.IncidentUpdate.create({
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
    const me = await base44.auth.me().catch(() => null);
    const name = me?.full_name || "Operator";
    await assignOwner(name);
  };

  const resolve = async () => {
    if (!confirm("Are you sure? This will close out the incident and prevent further changes.")) return;
    setResolving(true);
    try {
      const res = await base44.functions.invoke("resolveIncident", { incident_id: id });
      setAiSummary(res.data?.ai_summary || "Summary generated.");
      toast({ title: "Incident resolved", description: res.data?.wordpress_post_url ? "Posted to WordPress." : "AI summary generated." });
      load();
    } catch (e) {
      toast({ title: "Resolution failed", description: e.message, variant: "destructive" });
    } finally {
      setResolving(false);
    }
  };

  const closeFalseAlarm = async () => {
    if (!confirm("Are you sure? This will close out the incident and prevent further changes.")) return;
    setFalseAlarm(true);
    try {
      await base44.functions.invoke("resolveIncident", { incident_id: id, false_alarm: true });
      toast({ title: "Closed as false alarm", description: "Logged. Not posted to WordPress." });
      load();
    } catch (e) {
      toast({ title: "Close failed", description: e.message, variant: "destructive" });
    } finally {
      setFalseAlarm(false);
    }
  };

  const deleteIncident = async () => {
    if (!confirm("Delete this report permanently? This cannot be undone.")) return;
    setDeleting(true);
    try {
      await base44.entities.Incident.delete(id);
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

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <Link to="/" className="inline-flex items-center text-sm text-gray-400 hover:text-gray-200">
          <ArrowLeft className="w-4 h-4 mr-1" /> Back to Dashboard
        </Link>
        <div className="flex items-center gap-2">
          <StatusBadge status={incident.status} />
          <StatusBadge status={incident.priority_level} />
        </div>
      </div>

      {/* Incident header */}
      <Card className="bg-gray-800 border-gray-700">
        <CardContent className="p-5 space-y-4">
          <div className="flex items-start justify-between">
            <div>
              <h1 className="text-xl font-semibold text-gray-100">{Array.isArray(incident.repeater_name) ? incident.repeater_name.join(", ") : incident.repeater_name}</h1>
              <p className="text-sm text-gray-400">{incident.alert_type} · {new Date(incident.created_date).toLocaleString()}</p>
            </div>
            {incident.status !== "resolved" ? (
              <div className="flex gap-2">
                <Button onClick={resolve} disabled={resolving} className="bg-emerald-700 hover:bg-emerald-800 text-white">
                  {resolving ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Resolving…</> : <><CheckCircle2 className="w-4 h-4 mr-2" /> Resolve & Publish</>}
                </Button>
                <Button onClick={closeFalseAlarm} disabled={falseAlarm} variant="outline" className="bg-gray-900 border-gray-700 text-gray-300">
                  {falseAlarm ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Closing…</> : <><Ban className="w-4 h-4 mr-2" /> Close — False Alarm</>}
                </Button>
              </div>
            ) : (
              <Button onClick={deleteIncident} disabled={deleting} variant="destructive">
                <Trash2 className="w-4 h-4 mr-2" /> Delete Report
              </Button>
            )}
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-lg bg-gray-900/60 border border-gray-700/60 px-4 py-3">
            <div className="flex items-center gap-2">
              <UserCog className="w-4 h-4 text-sky-400" />
              <span className="text-xs uppercase tracking-wider text-gray-500">Response Owner</span>
              <OwnerBadge name={incident.assigned_operator} />
            </div>
            {!readOnly && (
              <div className="flex flex-col sm:flex-row sm:items-center gap-2 w-full sm:w-auto">
                <Select value={assignPick} onValueChange={setAssignPick}>
                  <SelectTrigger className="w-full sm:w-48 bg-gray-900 border-gray-700"><SelectValue placeholder="Hand off to…" /></SelectTrigger>
                  <SelectContent className="bg-gray-900 border-gray-700">
                    {volunteers.map((v) => <SelectItem key={v.id} value={v.name}>{v.name}{v.callsign ? ` · ${v.callsign}` : ""}</SelectItem>)}
                  </SelectContent>
                </Select>
                <div className="flex gap-2">
                  <Button size="sm" onClick={() => assignOwner(assignPick)} disabled={busy || !assignPick} className="bg-sky-700 hover:bg-sky-800 text-white flex-1 sm:flex-none">Hand Off</Button>
                  <Button size="sm" variant="outline" onClick={takeOwnership} disabled={busy} className="bg-gray-900 border-gray-700 text-gray-200 flex-1 sm:flex-none">Take Ownership</Button>
                </div>
              </div>
            )}
          </div>

          <div className="grid md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label className="text-gray-400 text-xs uppercase tracking-wider">Caller Info</Label>
              <Input className="bg-gray-900 border-gray-700" defaultValue={incident.caller_info} readOnly={readOnly} onBlur={(e) => saveField("caller_info", e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label className="text-gray-400 text-xs uppercase tracking-wider">Location</Label>
              <Input className="bg-gray-900 border-gray-700" defaultValue={incident.location_info} readOnly={readOnly} onBlur={(e) => saveField("location_info", e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label className="text-gray-400 text-xs uppercase tracking-wider">Category</Label>
              <Select value={incident.incident_category || ""} disabled={readOnly} onValueChange={(v) => { saveField("incident_category", v); matchGuidance(v, incident.incident_subtype); }}>
                <SelectTrigger className="bg-gray-900 border-gray-700"><SelectValue placeholder="Classify category" /></SelectTrigger>
                <SelectContent className="bg-gray-900 border-gray-700">
                  {INCIDENT_CATEGORIES.map((c) => <SelectItem key={c} value={c}>{formatCategory(c)}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label className="text-gray-400 text-xs uppercase tracking-wider">Subtype</Label>
              <Input className="bg-gray-900 border-gray-700" defaultValue={incident.incident_subtype || ""} readOnly={readOnly} placeholder="e.g. chest pain, brush fire, lost hiker" onBlur={(e) => { saveField("incident_subtype", e.target.value); matchGuidance(incident.incident_category, e.target.value); }} />
            </div>
            <div className="space-y-2">
              <Label className="text-gray-400 text-xs uppercase tracking-wider">Priority</Label>
              <Select value={incident.priority_level} disabled={readOnly} onValueChange={(v) => saveField("priority_level", v)}>
                <SelectTrigger className="bg-gray-900 border-gray-700"><SelectValue /></SelectTrigger>
                <SelectContent className="bg-gray-900 border-gray-700">
                  {["critical", "high", "medium", "low"].map((p) => <SelectItem key={p} value={p} className="capitalize">{p}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-2">
            <Label className="text-gray-400 text-xs uppercase tracking-wider">Nature of Emergency</Label>
            <Textarea className="bg-gray-900 border-gray-700" rows={2} defaultValue={incident.nature} readOnly={readOnly} onBlur={(e) => saveField("nature", e.target.value)} />
          </div>
        </CardContent>
      </Card>

      <div className="grid lg:grid-cols-2 gap-6">
        {/* Left column: contacts + team notifications */}
        <div className="space-y-6">
          {/* Emergency contacts */}
          <Card className="bg-gray-800 border-gray-700">
            <CardHeader className="pb-3"><CardTitle className="text-sm text-gray-200 flex items-center gap-2"><Phone className="w-4 h-4 text-red-400" /> Emergency Contacts</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              {contacts.length === 0 ? (
                <div className="text-sm text-gray-500">No contacts configured for this repeater.</div>
              ) : contacts.map((c) => (
                <div key={c.id} className="flex items-center justify-between py-2 border-b border-gray-700/50 last:border-0">
                  <div>
                    <div className="text-sm text-gray-200">{agencyLabels[c.agency_type] || c.agency_type}: {c.agency_name}</div>
                    {c.notes && <div className="text-xs text-gray-500">{c.notes}</div>}
                  </div>
                  <a href={`tel:${c.phone}`} className="text-sm font-mono text-emerald-400 hover:text-emerald-300">{c.phone}</a>
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

          {/* Repeater controls */}
          <Card className="bg-gray-800 border-gray-700">
            <CardHeader className="pb-3"><CardTitle className="text-sm text-gray-200 flex items-center gap-2"><RadioTower className="w-4 h-4 text-sky-400" /> Repeater Controls</CardTitle></CardHeader>
            <CardContent>
              <RepeaterControls repeaters={repeaters} />
            </CardContent>
          </Card>
        </div>

        {/* Right column: guidance + updates */}
        <div className="space-y-6">
          {/* Guidance */}
          <Card className="bg-gray-800 border-gray-700">
            <CardHeader className="pb-3"><CardTitle className="text-sm text-gray-200 flex items-center gap-2"><BookOpen className="w-4 h-4 text-amber-400" /> Response Guidance</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <Select value={selectedGuidance || ""} onValueChange={setSelectedGuidance}>
                <SelectTrigger className="bg-gray-900 border-gray-700"><SelectValue placeholder="Select guidance script" /></SelectTrigger>
                <SelectContent className="bg-gray-900 border-gray-700">
                  {guidance.map((g) => <SelectItem key={g.id} value={g.id}>{g.title}</SelectItem>)}
                </SelectContent>
              </Select>
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

          {/* AI summary */}
          {aiSummary && (
            <Card className="bg-emerald-900/20 border-emerald-700/40">
              <CardHeader className="pb-3"><CardTitle className="text-sm text-emerald-300 flex items-center gap-2"><CheckCircle2 className="w-4 h-4" /> Resolution Summary</CardTitle></CardHeader>
              <CardContent>
                <pre className="text-sm text-gray-200 whitespace-pre-wrap font-sans">{aiSummary}</pre>
                {incident.wordpress_post_url && <a href={incident.wordpress_post_url} target="_blank" rel="noreferrer" className="text-xs text-emerald-400 hover:underline">View on WordPress →</a>}
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      {/* Update log */}
      <Card className="bg-gray-800 border-gray-700">
        <CardHeader className="pb-3"><CardTitle className="text-sm text-gray-200 flex items-center gap-2"><MessageSquare className="w-4 h-4 text-gray-400" /> Incident Log</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
            {updates.map((u) => (
              <div key={u.id} className="text-sm border-l-2 border-gray-600 pl-3 py-1">
                <div className="flex items-center gap-2 text-xs text-gray-500">
                  <span>{new Date(u.created_date).toLocaleTimeString()}</span>
                  <span className="text-gray-400">·</span>
                  <span className="text-gray-300">{u.operator_name}</span>
                  {u.action_type !== "note" && <span className="text-[10px] uppercase text-sky-400">{u.action_type.replace("_", " ")}</span>}
                </div>
                <div className="text-gray-200">{u.message}</div>
              </div>
            ))}
          </div>
          {!readOnly && (
            <div className="flex gap-2 pt-2">
              <Input className="bg-gray-900 border-gray-700" placeholder="Log an update…" value={newUpdate} onChange={(e) => setNewUpdate(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addUpdate()} />
              <Button onClick={addUpdate} disabled={busy || !newUpdate.trim()} className="bg-gray-700 hover:bg-gray-600 text-white">Add</Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}