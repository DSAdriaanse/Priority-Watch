import React from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Trash2, ChevronUp, ChevronDown } from "lucide-react";

const PRIORITIES = ["critical", "high", "medium", "low"];

export default function TriageFlowBuilder({ value, onChange }) {
  const flow = Array.isArray(value) ? value : [];

  const addQuestion = () => onChange([...flow, { question: "", answers: [{ label: "" }] }]);
  const setQuestion = (i, q) => onChange(flow.map((item, idx) => (idx === i ? { ...item, question: q } : item)));
  const removeQuestion = (i) => onChange(flow.filter((_, idx) => idx !== i));
  const moveQuestion = (i, dir) => {
    const j = i + dir;
    if (j < 0 || j >= flow.length) return;
    const next = [...flow];
    [next[i], next[j]] = [next[j], next[i]];
    onChange(next);
  };
  const addAnswer = (qi) =>
    onChange(flow.map((item, idx) => (idx === qi ? { ...item, answers: [...(item.answers || []), { label: "" }] } : item)));
  const setAnswer = (qi, ai, patch) =>
    onChange(
      flow.map((item, idx) =>
        idx === qi ? { ...item, answers: item.answers.map((a, j) => (j === ai ? { ...a, ...patch } : a)) } : item
      )
    );
  const removeAnswer = (qi, ai) =>
    onChange(flow.map((item, idx) => (idx === qi ? { ...item, answers: item.answers.filter((_, j) => j !== ai) } : item)));

  return (
    <div className="space-y-3">
      {flow.length === 0 && (
        <p className="text-xs text-gray-500">No triage questions yet. Add one to enable answer-driven priority and skip-logic.</p>
      )}
      {flow.map((q, qi) => (
        <div key={qi} className="rounded-lg border border-gray-700 bg-gray-900/50 p-3 space-y-2">
          <div className="flex items-center gap-2">
            <span className="text-xs font-mono text-gray-500 shrink-0">Q{qi + 1}</span>
            <Input
              className="bg-gray-900 border-gray-700 flex-1"
              placeholder="Triage question…"
              value={q.question}
              onChange={(e) => setQuestion(qi, e.target.value)}
            />
            <div className="flex gap-1 shrink-0">
              <Button size="icon" variant="outline" onClick={() => moveQuestion(qi, -1)} disabled={qi === 0} className="bg-gray-900 border-gray-700 text-gray-300 h-8 w-8">
                <ChevronUp className="w-3.5 h-3.5" />
              </Button>
              <Button size="icon" variant="outline" onClick={() => moveQuestion(qi, 1)} disabled={qi === flow.length - 1} className="bg-gray-900 border-gray-700 text-gray-300 h-8 w-8">
                <ChevronDown className="w-3.5 h-3.5" />
              </Button>
              <Button size="icon" variant="outline" onClick={() => removeQuestion(qi)} className="bg-gray-900 border-gray-700 text-red-400 h-8 w-8">
                <Trash2 className="w-3.5 h-3.5" />
              </Button>
            </div>
          </div>
          <div className="space-y-2 pl-3 border-l border-gray-700/60">
            {(q.answers || []).map((a, ai) => (
              <div key={ai} className="space-y-2 rounded-md bg-gray-900/40 p-2">
                <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                  <Input
                    className="bg-gray-900 border-gray-700 flex-1"
                    placeholder="Answer option…"
                    value={a.label}
                    onChange={(e) => setAnswer(qi, ai, { label: e.target.value })}
                  />
                  <div className="flex items-center gap-2">
                    <Select value={a.priority || ""} onValueChange={(v) => setAnswer(qi, ai, { priority: v })}>
                      <SelectTrigger className="w-full sm:w-28 bg-gray-900 border-gray-700">
                        <SelectValue placeholder="Priority" />
                      </SelectTrigger>
                      <SelectContent className="bg-gray-900 border-gray-700">
                        {PRIORITIES.map((p) => (
                          <SelectItem key={p} value={p} className="capitalize">{p}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button size="icon" variant="outline" onClick={() => removeAnswer(qi, ai)} className="bg-gray-900 border-gray-700 text-red-400 h-8 w-8 shrink-0">
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </div>
                <Textarea
                  className="bg-gray-900 border-gray-700 text-xs"
                  rows={2}
                  placeholder="Extra steps if chosen (one per line)"
                  value={(a.add_steps || []).join("\n")}
                  onChange={(e) => setAnswer(qi, ai, { add_steps: e.target.value.split("\n").map((s) => s.trim()).filter(Boolean) })}
                />
                <label className="flex items-center gap-2 text-xs text-gray-400">
                  <input type="checkbox" checked={!!a.skip_rest} onChange={(e) => setAnswer(qi, ai, { skip_rest: e.target.checked })} />
                  Skip remaining questions after this answer
                </label>
              </div>
            ))}
            <Button size="sm" variant="outline" onClick={() => addAnswer(qi)} className="bg-gray-900 border-gray-700 text-gray-300">
              <Plus className="w-3.5 h-3.5 mr-1" /> Add Answer
            </Button>
          </div>
        </div>
      ))}
      <Button size="sm" variant="outline" onClick={addQuestion} className="bg-gray-900 border-gray-700 text-gray-200">
        <Plus className="w-3.5 h-3.5 mr-1" /> Add Triage Question
      </Button>
    </div>
  );
}