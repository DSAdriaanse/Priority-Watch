import React, { useState } from "react";
import { addIncidentLogEntry, auth, updateIncident, type GuidanceScript, type Incident } from "@/api";
import { Button } from "@/components/ui/button";
import { Loader2, CheckCircle2, RotateCcw } from "lucide-react";
import StatusBadge from "@/features/incidents/StatusBadge";
import { useToast } from "@/components/ui/use-toast";

const RANK = { critical: 4, high: 3, medium: 2, low: 1 };
const higher = (a, b) => ((RANK[a] || 0) >= (RANK[b] || 0) ? a : b);

// Walks an operator through a script's triage questions one at a time.
// The result priority is the highest of the script's starting priority and every
// chosen answer's priority; chosen answers also add steps. An answer marked "skip
// rest" ends the questions early. When given an `incident`, "Apply to Incident" saves
// the priority and logs the answers. Without one (the editor preview) it is read-only.
interface TriageRunnerProps {
  guidance: Partial<GuidanceScript> | undefined;
  /** Given: "Apply to Incident" saves. Missing (the editor preview): read-only. */
  incident?: Incident;
  onApplied?: () => void;
}

export default function TriageRunner({ guidance, incident, onApplied }: TriageRunnerProps) {
  const { toast } = useToast();
  const flow = Array.isArray(guidance?.triage_flow)
    ? guidance.triage_flow.filter((q) => q.question && q.answers?.length)
    : [];
  const [idx, setIdx] = useState(0);
  const [record, setRecord] = useState<Array<{ question: string; answer: string; priority?: string; add_steps: string[] }>>([]);
  const [done, setDone] = useState(false);
  const [applying, setApplying] = useState(false);

  if (flow.length === 0) {
    return <div className="text-sm text-gray-500">{incident ? "This guidance script has no triage flow configured." : "Add a question with at least one answer to try it out here."}</div>;
  }

  const pick = (answer) => {
    const q = flow[idx];
    const entry = { question: q.question, answer: answer.label, priority: answer.priority, add_steps: answer.add_steps || [] };
    const next = [...record, entry];
    setRecord(next);
    if (answer.skip_rest || idx + 1 >= flow.length) setDone(true);
    else setIdx(idx + 1);
  };

  const reset = () => { setIdx(0); setRecord([]); setDone(false); };

  const derivedPriority = record.reduce(
    (acc, r) => (r.priority ? higher(acc, r.priority) : acc),
    guidance?.priority_level || "low"
  );
  const extraSteps = record.flatMap((r) => r.add_steps);

  const apply = async () => {
    if (!incident) return;
    setApplying(true);
    try {
      const me = await auth.me().catch(() => null);
      const summary = record
        .map((r) => `Q: ${r.question}\nA: ${r.answer}${r.priority ? ` (${r.priority})` : ""}`)
        .join("\n\n");
      await updateIncident(incident.id, { priority_level: derivedPriority });
      await addIncidentLogEntry({
        incident_id: incident.id,
        operator_name: me?.full_name || "Operator",
        message: `Triage completed → priority ${derivedPriority}.\n${summary}`,
        action_type: "guidance_followed",
      });
      toast({ title: "Triage applied", description: `Priority set to ${derivedPriority}.` });
      onApplied?.();
    } catch (e) {
      toast({ title: "Triage failed", description: e.message, variant: "destructive" });
    } finally {
      setApplying(false);
    }
  };

  if (!done) {
    const q = flow[idx];
    return (
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-xs text-gray-500 uppercase tracking-wider">Triage · Question {idx + 1} of {flow.length}</span>
          {idx > 0 && <button onClick={reset} className="text-xs text-gray-500 hover:text-gray-300">Restart</button>}
        </div>
        <div className="text-sm font-medium text-gray-100">{q.question}</div>
        <div className="grid gap-2">
          {q.answers.map((a, i) => (
            <button
              key={i}
              onClick={() => pick(a)}
              className="text-left text-sm rounded-lg border border-gray-700 bg-gray-900 hover:border-sky-600 hover:bg-gray-800 px-3 py-2.5 text-gray-200 transition-colors"
            >
              <div className="flex items-center justify-between gap-2">
                <span>{a.label}</span>
                {a.priority && <StatusBadge status={a.priority} />}
              </div>
              {a.skip_rest && <div className="text-[10px] text-amber-400 mt-1">Skips remaining questions</div>}
            </button>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 text-emerald-400 text-sm font-medium">
        <CheckCircle2 className="w-4 h-4" /> Triage complete
      </div>
      <div className="rounded-lg bg-gray-900/60 border border-gray-700 p-3 space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-xs text-gray-500 uppercase tracking-wider">Derived Priority</span>
          <StatusBadge status={derivedPriority} />
        </div>
        {extraSteps.length > 0 && (
          <div>
            <div className="text-xs text-gray-400 font-medium mb-1">Triggered Additional Steps</div>
            <ul className="space-y-1 list-disc list-inside text-sm text-gray-300">
              {extraSteps.map((s, i) => <li key={i}>{s}</li>)}
            </ul>
          </div>
        )}
      </div>
      <div className="space-y-1">
        <div className="text-xs text-gray-500 uppercase tracking-wider">Answers</div>
        {record.map((r, i) => (
          <div key={i} className="text-xs text-gray-400 border-l-2 border-gray-600 pl-2">
            <span className="text-gray-300">{r.question}:</span> {r.answer}{r.priority ? ` · ${r.priority}` : ""}
          </div>
        ))}
      </div>
      <div className="flex flex-wrap gap-2">
        {incident && (
          <Button onClick={apply} disabled={applying} className="bg-emerald-700 hover:bg-emerald-800 text-white">
            {applying ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Applying…</> : <><CheckCircle2 className="w-4 h-4 mr-2" /> Apply to Incident</>}
          </Button>
        )}
        <Button variant="outline" onClick={reset} className="bg-gray-900 border-gray-700 text-gray-200">
          <RotateCcw className="w-3.5 h-3.5 mr-1" /> Redo
        </Button>
      </div>
    </div>
  );
}