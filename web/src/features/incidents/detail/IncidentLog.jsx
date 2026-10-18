import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useState } from "react";
import { CheckCircle2, MessageSquare } from "lucide-react";

// Column 2: the resolution summary (once resolved) and the incident log, newest first.
// onAdd saves a new note; the box clears only if saving worked.
export default function IncidentLog({ incident, readOnly, busy, updates, aiSummary, onAdd }) {
  const [newUpdate, setNewUpdate] = useState("");
  const addUpdate = async () => {
    if (!newUpdate.trim()) return;
    await onAdd(newUpdate.trim());
    setNewUpdate("");
  };
  return (
    <>
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
    </>
  );
}
