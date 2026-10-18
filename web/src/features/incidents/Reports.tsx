import React, { useState, useEffect, useMemo } from "react";
import { Link } from "react-router-dom";
import { deleteIncident, listRepeaters, listResolvedIncidents, type Incident, type Repeater } from "@/api";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FileText, Search, ArrowRight, Clock, MapPin, ExternalLink, Calendar, Trash2, Loader2 } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";
import { useAuth } from "@/features/auth/AuthContext";
import StatusBadge from "@/features/incidents/StatusBadge";
import OwnerBadge from "@/features/incidents/OwnerBadge";
import { INCIDENT_CATEGORIES, formatCategory } from "@/features/incidents/incidentTaxonomy";

const priorityLevels = ["critical", "high", "medium", "low"];

// REPORTS (/reports): search and filter the archive of resolved incidents, open any
// one to read its summary and log. Admins can delete a report.
// Filtering happens in the browser, on the 200 most recent incident records.
export default function Reports() {
  const { isAdmin } = useAuth();
  const { toast } = useToast();
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [repeaters, setRepeaters] = useState<Repeater[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [repeaterFilter, setRepeaterFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [priorityFilter, setPriorityFilter] = useState("all");
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const deleteReport = async (e, incId) => {
    e.preventDefault();
    e.stopPropagation();
    if (!confirm("Delete this report permanently? This cannot be undone.")) return;
    setDeletingId(incId);
    try {
      await deleteIncident(incId);
      setIncidents((prev) => prev.filter((i) => i.id !== incId));
      toast({ title: "Report deleted" });
    } catch (err) {
      toast({ title: "Delete failed", description: err.message, variant: "destructive" });
    } finally {
      setDeletingId(null);
    }
  };

  const load = async () => {
    setLoading(true);
    try {
      const [incs, reps] = await Promise.all([
        listResolvedIncidents(),
        listRepeaters(),
      ]);
      setIncidents(incs);
      setRepeaters(reps);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); }, []);

  const closed = useMemo(
    () => incidents.filter((i) => i.status === "resolved"),
    [incidents]
  );

  const filtered = useMemo(() => {
    return closed.filter((i) => {
      if (repeaterFilter !== "all" && !(Array.isArray(i.repeater_id) ? i.repeater_id : [i.repeater_id]).includes(repeaterFilter)) return false;
      if (typeFilter !== "all" && i.incident_category !== typeFilter) return false;
      if (priorityFilter !== "all" && i.priority_level !== priorityFilter) return false;
      if (q.trim()) {
        const hay = `${i.nature || ""} ${i.alert_type || ""} ${i.caller_info || ""} ${i.location_info || ""} ${i.summary || ""} ${i.ai_summary || ""} ${Array.isArray(i.repeater_name) ? i.repeater_name.join(", ") : i.repeater_name || ""}`.toLowerCase();
        if (!hay.includes(q.trim().toLowerCase())) return false;
      }
      return true;
    });
  }, [closed, repeaterFilter, typeFilter, priorityFilter, q]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-gray-100 flex items-center gap-2">
          <FileText className="w-6 h-6 text-amber-400" />
          Incident Reports
        </h1>
        <p className="text-sm text-gray-400 mt-1">Historical record of closed and resolved incidents</p>
      </div>

      {/* Filters */}
      <Card className="bg-gray-800 border-gray-700">
        <CardContent className="p-4 grid gap-3 md:grid-cols-4">
          <div className="relative md:col-span-2">
            <Search className="w-4 h-4 text-gray-500 absolute left-3 top-1/2 -translate-y-1/2" />
            <Input
              className="bg-gray-900 border-gray-700 pl-9"
              placeholder="Search nature, caller, location, summary…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </div>
          <Select value={repeaterFilter} onValueChange={setRepeaterFilter}>
            <SelectTrigger className="bg-gray-900 border-gray-700"><SelectValue placeholder="All repeaters" /></SelectTrigger>
            <SelectContent className="bg-gray-900 border-gray-700">
              <SelectItem value="all">All repeaters</SelectItem>
              {repeaters.map((r) => <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={typeFilter} onValueChange={setTypeFilter}>
            <SelectTrigger className="bg-gray-900 border-gray-700"><SelectValue placeholder="All categories" /></SelectTrigger>
            <SelectContent className="bg-gray-900 border-gray-700">
              <SelectItem value="all">All categories</SelectItem>
              {INCIDENT_CATEGORIES.map((c) => <SelectItem key={c} value={c}>{formatCategory(c)}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={priorityFilter} onValueChange={setPriorityFilter}>
            <SelectTrigger className="bg-gray-900 border-gray-700"><SelectValue placeholder="All priorities" /></SelectTrigger>
            <SelectContent className="bg-gray-900 border-gray-700">
              <SelectItem value="all">All priorities</SelectItem>
              {priorityLevels.map((p) => <SelectItem key={p} value={p} className="capitalize">{p}</SelectItem>)}
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      {/* Summary */}
      <div className="flex items-center justify-between text-sm text-gray-400">
        <span>{loading ? "Loading…" : `${filtered.length} closed ${filtered.length === 1 ? "report" : "reports"}`}</span>
      </div>

      {/* List */}
      {loading ? (
        <div className="text-gray-500 text-sm">Loading reports…</div>
      ) : filtered.length === 0 ? (
        <Card className="bg-gray-800 border-gray-700">
          <CardContent className="p-8 text-center text-gray-500 text-sm">
            No closed incidents match the current filters.
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3">
          {filtered.map((inc) => (
            <Link key={inc.id} to={`/incident/${inc.id}`}>
              <Card className="bg-gray-800 border-gray-700 hover:border-amber-500/50 transition-colors">
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="space-y-1.5 min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <StatusBadge status="resolved" />
                        <StatusBadge status={inc.priority_level} />
                        {inc.incident_category && (
                          <span className="text-[11px] px-2 py-0.5 rounded-full bg-gray-700 text-gray-300">
                            {formatCategory(inc.incident_category)}
                          </span>
                        )}
                        {inc.incident_subtype && (
                          <span className="text-[11px] px-2 py-0.5 rounded-full bg-gray-700/60 text-gray-400">
                            {inc.incident_subtype}
                          </span>
                        )}
                        <span className="font-medium text-gray-100">{(Array.isArray(inc.repeater_name) ? inc.repeater_name.join(", ") : inc.repeater_name) || "Unknown repeater"}</span>
                      </div>
                      <p className="text-sm text-gray-300 line-clamp-2">{inc.nature || inc.alert_type || "No details recorded"}</p>
                      {(inc.summary || inc.ai_summary) && (
                        <p className="text-xs text-gray-400 line-clamp-2 italic">
                          {inc.ai_summary || inc.summary}
                        </p>
                      )}
                      <div className="flex items-center gap-4 pt-1 text-xs text-gray-500 flex-wrap">
                        {inc.location_info && <span className="flex items-center gap-1"><MapPin className="w-3 h-3" />{inc.location_info}</span>}
                        <span className="flex items-center gap-1"><Calendar className="w-3 h-3" />{new Date(inc.resolved_date || inc.created_date).toLocaleDateString()}</span>
                        <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{new Date(inc.resolved_date || inc.created_date).toLocaleTimeString()}</span>
                        <OwnerBadge name={inc.assigned_operator} />
                        {inc.wordpress_post_url && (
                          <span className="flex items-center gap-1 text-sky-400">
                            <ExternalLink className="w-3 h-3" /> Published
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0 mt-1">
                      {isAdmin && (
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={(e) => deleteReport(e, inc.id)}
                          disabled={deletingId === inc.id}
                          className="h-8 w-8 text-gray-500 hover:text-red-400 hover:bg-red-500/10"
                        >
                          {deletingId === inc.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                        </Button>
                      )}
                      <ArrowRight className="w-4 h-4 text-gray-500" />
                    </div>
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}