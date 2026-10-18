import type { Incident } from "@/api";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { ArrowLeft, CheckCircle2, Loader2, Ban, Trash2 } from "lucide-react";
import StatusBadge from "@/features/incidents/StatusBadge";

// Top of the incident screen: who and what, plus the buttons that end the incident
// (resolve, close as false alarm, or delete once resolved). The parent owns the actions.
interface IncidentHeaderProps {
  incident: Incident;
  repeaterTitle: string;
  isAdmin: boolean;
  resolving: boolean;
  falseAlarm: boolean;
  deleting: boolean;
  onResolve: () => void;
  onFalseAlarm: () => void;
  onDelete: () => void;
}

export default function IncidentHeader({ incident, repeaterTitle, isAdmin, resolving, falseAlarm, deleting, onResolve, onFalseAlarm, onDelete }: IncidentHeaderProps) {
  return (
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
          <Button onClick={onResolve} disabled={resolving} className="bg-emerald-700 hover:bg-emerald-800 text-white">
            {resolving ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Resolving…</> : <><CheckCircle2 className="w-4 h-4 mr-2" /> Resolve & Publish</>}
          </Button>
          <Button onClick={onFalseAlarm} disabled={falseAlarm} variant="outline" className="bg-gray-900 border-gray-700 text-gray-300">
            {falseAlarm ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Closing…</> : <><Ban className="w-4 h-4 mr-2" /> Close — False Alarm</>}
          </Button>
        </div>
      ) : isAdmin ? (
        <Button onClick={onDelete} disabled={deleting} variant="destructive" className="md:shrink-0">
          <Trash2 className="w-4 h-4 mr-2" /> Delete Report
        </Button>
      ) : null}
    </div>
  </div>
  );
}
