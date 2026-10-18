import React, { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { entities, functions, auth } from "@/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Siren, Activity, Server, Users, Plus, ArrowRight, Clock } from "lucide-react";
import StatusBadge from "@/components/StatusBadge";
import OwnerBadge from "@/components/OwnerBadge";
import { INCIDENT_CATEGORIES, formatCategory } from "@/lib/incidentTaxonomy";

const priorityLevels = ["critical", "high", "medium", "low"];

// HOME SCREEN (/): active incidents, headline numbers, recent resolved incidents,
// and the "Log Incident" form for reporting one by hand.
// Everyone signed in can see it. It updates itself: entities.*.subscribe() pushes
// changes (including incidents created by the inbound webhook) without a reload.
export default function Dashboard() {
  const [incidents, setIncidents] = useState([]);
  const [repeaters, setRepeaters] = useState([]);
  const [volunteers, setVolunteers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showLog, setShowLog] = useState(false);
  const [form, setForm] = useState({ repeater_ids: [], alert_type: "Manual Report", incident_category: "", incident_subtype: "", caller_info: "", location_info: "", nature: "", priority_level: "high" });
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const [incs, reps, vols] = await Promise.all([
      entities.Incident.list("-created_date", 50),
      entities.Repeater.list(),
      entities.Volunteer.filter({ active: true })]
      );
      setIncidents(incs);
      setRepeaters(reps);
      setVolunteers(vols);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {load();}, []);

  // Real-time: refresh when any operator (or the webhook) changes data.
  // Each subscribe() returns a function that stops listening; React calls it on leaving the page.
  useEffect(() => {
    const unsubIncidents = entities.Incident.subscribe(() => {
      entities.Incident.list("-created_date", 50).then(setIncidents);
    });
    const unsubRepeaters = entities.Repeater.subscribe(() => {
      entities.Repeater.list().then(setRepeaters);
    });
    const unsubVolunteers = entities.Volunteer.subscribe(() => {
      entities.Volunteer.filter({ active: true }).then(setVolunteers);
    });
    return () => {unsubIncidents();unsubRepeaters();unsubVolunteers();};
  }, []);

  const active = incidents.filter((i) => i.status === "active");
  const resolved = incidents.filter((i) => i.status === "resolved");
  const onlineRepeaters = repeaters.filter((r) => r.status === "online" || r.status === "linked");

  // Create an incident from the form. A repeater's id and its name are both saved:
  // the id links to the repeater record, the name keeps reports readable if it is later deleted.
  const handleLog = async () => {
    setSaving(true);
    try {
      const selected = repeaters.filter((r) => form.repeater_ids.includes(r.id));
      const { repeater_ids, ...rest } = form;
      await entities.Incident.create({
        ...rest,
        repeater_id: selected.map((r) => r.id),
        repeater_name: selected.map((r) => r.name),
        status: "active"
      });
      setForm({ repeater_ids: [], alert_type: "Manual Report", incident_category: "", incident_subtype: "", caller_info: "", location_info: "", nature: "", priority_level: "high" });
      setShowLog(false);
      load();
    } finally {
      setSaving(false);
    }
  };

  // The four headline tiles at the top of the page.
  const stats = [
  { label: "Active Incidents", value: active.length, icon: Siren, color: "text-red-400", bg: "bg-red-500/10 border-red-500/30" },
  { label: "Repeaters Online", value: `${onlineRepeaters.length}/${repeaters.length}`, icon: Server, color: "text-emerald-400", bg: "bg-emerald-500/10 border-emerald-500/30" },
  { label: "Volunteers On Duty", value: volunteers.length, icon: Users, color: "text-sky-400", bg: "bg-sky-500/10 border-sky-500/30" },
  { label: "Resolved (recent)", value: resolved.length, icon: Activity, color: "text-amber-400", bg: "bg-amber-500/10 border-amber-500/30" }];


  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-100">Incident Dashboard</h1>
          <p className="text-sm text-gray-400 mt-1">Live coordination of priority and emergency traffic</p>
        </div>
        <Button onClick={() => setShowLog(true)} className="bg-red-600 hover:bg-red-700 text-white">
          <Plus className="w-4 h-4 mr-2" /> Log Incident
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map((s) => {
          const Icon = s.icon;
          return (
            <Card key={s.label} className={`bg-gray-800 border ${s.bg}`}>
              <CardContent className="p-4 flex items-center gap-3">
                <Icon className={`w-6 h-6 ${s.color}`} />
                <div>
                  <div className="text-2xl font-semibold text-gray-100">{s.value}</div>
                  <div className="text-xs text-gray-400">{s.label}</div>
                </div>
              </CardContent>
            </Card>);

        })}
      </div>

      {/* Active incidents */}
      <div>
        <h2 className="text-sm font-semibold text-gray-300 uppercase tracking-wider mb-3">Active Incidents</h2>
        {loading ?
        <div className="text-gray-500 text-sm">Loading…</div> :
        active.length === 0 ?
        <Card className="bg-gray-800 border-gray-700">
            <CardContent className="p-8 text-center text-gray-500 text-sm">
              No active incidents. The net is quiet.
            </CardContent>
          </Card> :

        <div className="grid gap-3">
            {active.map((inc) =>
          <Link key={inc.id} to={`/incident/${inc.id}`}>
                <Card className="bg-gray-800 border-gray-700 hover:border-red-500/50 transition-colors cursor-pointer">
                  <CardContent className="p-4 flex items-center justify-between">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <Siren className="w-4 h-4 text-red-400" />
                        <span className="font-medium text-gray-100">{(Array.isArray(inc.repeater_name) ? inc.repeater_name.join(", ") : inc.repeater_name) || "Unassigned"}</span>
                        <StatusBadge status={inc.priority_level} />
                        {inc.incident_category && <span className="text-[10px] px-2 py-0.5 rounded-full bg-gray-700 text-gray-300">{formatCategory(inc.incident_category)}</span>}
                      </div>
                      <div className="text-sm text-gray-400">{inc.nature || inc.alert_type || "No details yet"}</div>
                      {inc.location_info && <div className="text-xs text-gray-500">📍 {inc.location_info}</div>}
                      <div className="flex items-center gap-2 pt-1">
                        <span className="text-[10px] uppercase tracking-wider text-gray-500">Owner</span>
                        <OwnerBadge name={inc.assigned_operator} />
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="text-xs text-gray-500 flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {new Date(inc.created_date).toLocaleTimeString()}
                      </div>
                      <ArrowRight className="w-4 h-4 text-gray-500" />
                    </div>
                  </CardContent>
                </Card>
              </Link>
          )}
          </div>
        }
      </div>

      {/* Recently resolved */}
      {resolved.length > 0 &&
      <div>
          <h2 className="text-sm font-semibold text-gray-300 uppercase tracking-wider mb-3">Recently Resolved</h2>
          <div className="grid gap-2">
            {resolved.slice(0, 5).map((inc) =>
          <Link key={inc.id} to={`/incident/${inc.id}`}>
                <Card className="bg-gray-800/60 border-gray-700/60 hover:border-gray-600 transition-colors">
                  <CardContent className="p-3 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <StatusBadge status="resolved" />
                      <span className="text-sm text-gray-300">{(Array.isArray(inc.repeater_name) ? inc.repeater_name.join(", ") : inc.repeater_name) || "Unknown repeater"}</span>
                    </div>
                    <span className="text-xs text-gray-500">{new Date(inc.resolved_date || inc.created_date).toLocaleString()}</span>
                  </CardContent>
                </Card>
              </Link>
          )}
          </div>
        </div>
      }

      {/* Log incident dialog */}
      <Dialog open={showLog} onOpenChange={setShowLog}>
        <DialogContent className="bg-gray-800 border-gray-700 text-gray-100">
          <DialogHeader>
            <DialogTitle>Log Priority Incident</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label className="text-gray-300">Repeaters</Label>
              <div className="max-h-40 overflow-y-auto rounded-md border border-gray-700 bg-gray-900 p-2 space-y-0.5">
                {repeaters.length === 0 ?
                <div className="text-xs text-gray-500 px-1 py-1">No repeaters configured.</div> :
                repeaters.map((r) => {
                  const checked = form.repeater_ids.includes(r.id);
                  return (
                    <label key={r.id} className="flex items-center gap-2 cursor-pointer px-1 py-1 rounded hover:bg-gray-800">
                      <Checkbox checked={checked} onCheckedChange={(val) => setForm((f) => ({ ...f, repeater_ids: val ? [...f.repeater_ids, r.id] : f.repeater_ids.filter((x) => x !== r.id) }))} />
                      <span className="text-sm text-gray-200">{r.name} ({r.state})</span>
                    </label>);

                })}
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label className="text-gray-300">Alert Type</Label>
                <Input className="bg-gray-900 border-gray-700" value={form.alert_type} onChange={(e) => setForm({ ...form, alert_type: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label className="text-gray-300">Priority</Label>
                <Select value={form.priority_level} onValueChange={(v) => setForm({ ...form, priority_level: v })}>
                  <SelectTrigger className="bg-gray-900 border-gray-700"><SelectValue /></SelectTrigger>
                  <SelectContent className="bg-gray-900 border-gray-700">
                    {priorityLevels.map((p) => <SelectItem key={p} value={p} className="capitalize">{p}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label className="text-gray-300">Category</Label>
                <Select value={form.incident_category} onValueChange={(v) => setForm({ ...form, incident_category: v })}>
                  <SelectTrigger className="bg-gray-900 border-gray-700"><SelectValue placeholder="Select category" /></SelectTrigger>
                  <SelectContent className="bg-gray-900 border-gray-700">
                    {INCIDENT_CATEGORIES.map((c) => <SelectItem key={c} value={c}>{formatCategory(c)}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label className="text-gray-300">Subtype</Label>
                <Input className="bg-gray-900 border-gray-700" value={form.incident_subtype} onChange={(e) => setForm({ ...form, incident_subtype: e.target.value })} placeholder="e.g. chest pain, lost hiker" />
              </div>
            </div>
            <div className="space-y-2">
              <Label className="text-gray-300">Caller Info (name / callsign / contact)</Label>
              <Input className="bg-gray-900 border-gray-700" value={form.caller_info} onChange={(e) => setForm({ ...form, caller_info: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label className="text-gray-300">Location</Label>
              <Input className="bg-gray-900 border-gray-700" value={form.location_info} onChange={(e) => setForm({ ...form, location_info: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label className="text-gray-300">Nature of Emergency</Label>
              <Textarea className="bg-gray-900 border-gray-700" rows={3} value={form.nature} onChange={(e) => setForm({ ...form, nature: e.target.value })} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowLog(false)} className="bg-gray-900 border-gray-700 text-gray-200">Cancel</Button>
            <Button onClick={handleLog} disabled={saving} className="bg-red-600 hover:bg-red-700 text-white">
              {saving ? "Saving…" : "Create Incident"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>);

}