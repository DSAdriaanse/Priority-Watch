import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AutoTextarea } from "@/features/guidance/ListEditor";
import { Plus, Trash2, ChevronUp, ChevronDown, ChevronRight, Copy, AlertTriangle, SkipForward } from "lucide-react";

const PRIORITIES = ["critical", "high", "medium", "low"];
const PRIORITY_DOT = { critical: "bg-red-500", high: "bg-orange-500", medium: "bg-yellow-500", low: "bg-emerald-500" };
const NONE = "__none__";

const isIncomplete = (q) => !q.question?.trim() || !(q.answers || []).some((a) => a.label?.trim());

// The editor for a script's triage questions (used on the Triage flow tab).
// `value` is the list of questions and `onChange` receives the new list on every edit.
// cleanTriageFlow() at the bottom removes blank rows before saving.
export default function TriageFlowBuilder({ value, onChange }) {
  const flow = Array.isArray(value) ? value : [];
  const [open, setOpen] = useState(() => new Set(flow.length <= 3 ? flow.map((_, i) => i) : []));

  const toggle = (i) => setOpen((s) => { const n = new Set(s); n.has(i) ? n.delete(i) : n.add(i); return n; });
  const update = (next) => onChange(next);
  const setQ = (i, patch) => update(flow.map((q, idx) => (idx === i ? { ...q, ...patch } : q)));

  const addQuestion = () => {
    setOpen((s) => new Set(s).add(flow.length));
    update([...flow, { question: "", answers: [{ label: "" }, { label: "" }] }]);
  };
  const duplicate = (i) => {
    const copy = JSON.parse(JSON.stringify(flow[i]));
    update([...flow.slice(0, i + 1), copy, ...flow.slice(i + 1)]);
    setOpen(new Set([i + 1]));
  };
  const remove = (i) => {
    update(flow.filter((_, idx) => idx !== i));
    setOpen(new Set());
  };
  const move = (i, d) => {
    const j = i + d;
    if (j < 0 || j >= flow.length) return;
    const next = [...flow];
    [next[i], next[j]] = [next[j], next[i]];
    setOpen(new Set([j]));
    update(next);
  };
  const setAnswer = (qi, ai, patch) =>
    setQ(qi, { answers: flow[qi].answers.map((a, j) => (j === ai ? { ...a, ...patch } : a)) });
  const addAnswer = (qi) => setQ(qi, { answers: [...(flow[qi].answers || []), { label: "" }] });
  const removeAnswer = (qi, ai) => setQ(qi, { answers: flow[qi].answers.filter((_, j) => j !== ai) });

  return (
    <div className="space-y-3">
      {flow.length === 0 && (
        <div className="rounded-lg border border-dashed border-gray-700 p-6 text-center text-sm text-gray-500">
          No triage questions yet. Add one to let operators answer a few quick questions and get a priority and extra steps automatically.
        </div>
      )}

      {flow.map((q, qi) => {
        const isOpen = open.has(qi);
        const answers = q.answers || [];
        return (
          <div key={qi} className={`rounded-lg border bg-gray-900/50 ${isIncomplete(q) ? "border-amber-600/60" : "border-gray-700"}`}>
            <div className="flex items-center gap-2 p-3">
              <button type="button" onClick={() => toggle(qi)} className="flex shrink-0 items-center gap-1 text-gray-400 hover:text-gray-200" aria-label={isOpen ? "Collapse" : "Expand"}>
                <ChevronRight className={`h-4 w-4 transition-transform ${isOpen ? "rotate-90" : ""}`} />
                <span className="font-mono text-xs">Q{qi + 1}</span>
              </button>
              {isOpen ? (
                <Input className="flex-1 border-gray-700 bg-gray-900" placeholder="Triage question, e.g. Is the person conscious and breathing?" value={q.question} onChange={(e) => setQ(qi, { question: e.target.value })} />
              ) : (
                <button type="button" onClick={() => toggle(qi)} className="min-w-0 flex-1 truncate text-left text-sm text-gray-200">
                  {q.question || <span className="italic text-gray-500">Untitled question</span>}
                </button>
              )}
              {!isOpen && (
                <div className="hidden shrink-0 items-center gap-1.5 sm:flex">
                  {answers.map((a, ai) => (
                    <span key={ai} className={`h-2.5 w-2.5 rounded-full ${PRIORITY_DOT[a.priority] || "bg-gray-600"}`} title={`${a.label || "(blank)"}${a.priority ? " · " + a.priority : ""}`} />
                  ))}
                  <span className="ml-1 text-xs text-gray-500">{answers.length} answers</span>
                </div>
              )}
              {isIncomplete(q) && <AlertTriangle className="h-4 w-4 shrink-0 text-amber-500" title="Needs a question and at least one answer, or it will be left out" />}
              <div className="flex shrink-0 gap-0.5">
                <Button type="button" size="icon" variant="ghost" className="h-7 w-7 text-gray-400" disabled={qi === 0} onClick={() => move(qi, -1)} aria-label="Move up"><ChevronUp className="h-3.5 w-3.5" /></Button>
                <Button type="button" size="icon" variant="ghost" className="h-7 w-7 text-gray-400" disabled={qi === flow.length - 1} onClick={() => move(qi, 1)} aria-label="Move down"><ChevronDown className="h-3.5 w-3.5" /></Button>
                <Button type="button" size="icon" variant="ghost" className="h-7 w-7 text-gray-400" onClick={() => duplicate(qi)} aria-label="Duplicate"><Copy className="h-3.5 w-3.5" /></Button>
                <Button type="button" size="icon" variant="ghost" className="h-7 w-7 text-red-400" onClick={() => remove(qi)} aria-label="Delete question"><Trash2 className="h-3.5 w-3.5" /></Button>
              </div>
            </div>

            {isOpen && (
              <div className="space-y-2 border-t border-gray-700/60 p-3 pt-3">
                {answers.map((a, ai) => (
                  <div key={ai} className="space-y-2 rounded-md border border-gray-700/60 bg-gray-900/60 p-3">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                      <Input className="flex-1 border-gray-700 bg-gray-900" placeholder="Answer option…" value={a.label} onChange={(e) => setAnswer(qi, ai, { label: e.target.value })} />
                      <Select value={a.priority || NONE} onValueChange={(v) => setAnswer(qi, ai, { priority: v === NONE ? undefined : v })}>
                        <SelectTrigger className="w-full border-gray-700 bg-gray-900 sm:w-40"><SelectValue /></SelectTrigger>
                        <SelectContent className="border-gray-700 bg-gray-900">
                          <SelectItem value={NONE}>No priority change</SelectItem>
                          {PRIORITIES.map((p) => <SelectItem key={p} value={p} className="capitalize">Set {p}</SelectItem>)}
                        </SelectContent>
                      </Select>
                      <Button type="button" size="icon" variant="ghost" className="h-8 w-8 shrink-0 text-red-400" onClick={() => removeAnswer(qi, ai)} aria-label="Remove answer"><Trash2 className="h-3.5 w-3.5" /></Button>
                    </div>
                    <AutoTextarea
                      minRows={2}
                      placeholder="Extra steps added if this answer is chosen (one per line)"
                      value={(a.add_steps || []).join("\n")}
                      onChange={(e) => setAnswer(qi, ai, { add_steps: e.target.value.split("\n") })}
                    />
                    <label className="flex cursor-pointer items-center gap-2 text-xs text-gray-400">
                      <input type="checkbox" checked={!!a.skip_rest} onChange={(e) => setAnswer(qi, ai, { skip_rest: e.target.checked })} />
                      <SkipForward className="h-3.5 w-3.5" /> Stop here, skip the remaining questions
                    </label>
                  </div>
                ))}
                <Button type="button" size="sm" variant="outline" onClick={() => addAnswer(qi)} className="border-gray-700 bg-gray-900 text-gray-300">
                  <Plus className="mr-1 h-3.5 w-3.5" /> Add answer
                </Button>
              </div>
            )}
          </div>
        );
      })}

      <Button type="button" variant="outline" onClick={addQuestion} className="border-gray-700 bg-gray-900 text-gray-200">
        <Plus className="mr-1 h-4 w-4" /> Add triage question
      </Button>
    </div>
  );
}

// Strip empty rows so saved data stays clean (the runner ignores incomplete questions anyway).
export function cleanTriageFlow(flow) {
  return (Array.isArray(flow) ? flow : [])
    .map((q) => ({
      ...q,
      question: (q.question || "").trim(),
      answers: (q.answers || [])
        .filter((a) => a.label?.trim())
        .map((a) => {
          const out = { ...a, label: a.label.trim() };
          const steps = (a.add_steps || []).map((s) => s.trim()).filter(Boolean);
          if (steps.length) out.add_steps = steps; else delete out.add_steps;
          if (!a.priority) delete out.priority;
          if (!a.skip_rest) delete out.skip_rest;
          return out;
        }),
    }))
    .filter((q) => q.question || q.answers.length);
}
