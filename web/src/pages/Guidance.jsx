import React, { useState, useEffect } from "react";
import { entities, functions, auth } from "@/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Plus, Trash2, Pencil, BookOpen } from "lucide-react";
import TriageFlowBuilder from "@/components/TriageFlowBuilder";
import { INCIDENT_CATEGORIES, formatCategory } from "@/lib/incidentTaxonomy";

const emptyGuide = { incident_category: "medical", incident_subtype: "", title: "", priority_level: "high", initial_actions: "", steps: [], questions_to_ask: [], triage_flow: [] };

export default function Guidance() {
  const [guides, setGuides] = useState([]);
  const [editing, setEditing] = useState(null);
  const [stepsText, setStepsText] = useState("");
  const [questionsText, setQuestionsText] = useState("");

  const load = async () => setGuides(await entities.GuidanceScript.list());
  useEffect(() => { load(); }, []);

  const openEdit = (g) => {
    setEditing(g ? { ...g } : { ...emptyGuide });
    setStepsText((g?.steps || []).join("\n"));
    setQuestionsText((g?.questions_to_ask || []).join("\n"));
  };

  const save = async () => {
    if (!editing.title) return;
    const payload = {
      ...editing,
      steps: stepsText.split("\n").map((s) => s.trim()).filter(Boolean),
      questions_to_ask: questionsText.split("\n").map((s) => s.trim()).filter(Boolean),
    };
    if (editing.id) await entities.GuidanceScript.update(editing.id, payload);
    else await entities.GuidanceScript.create(payload);
    setEditing(null);
    load();
  };

  const remove = async (g) => {
    if (!confirm(`Delete guidance "${g.title}"?`)) return;
    await entities.GuidanceScript.delete(g.id);
    load();
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-100">Response Guidance</h1>
          <p className="text-sm text-gray-400 mt-1">Step-by-step protocols operators follow by emergency type</p>
        </div>
        <Button onClick={() => openEdit(null)} className="bg-amber-600 hover:bg-amber-700 text-white"><Plus className="w-4 h-4 mr-2" /> Add Guidance</Button>
      </div>

      <div className="grid gap-4">
        {guides.map((g) => (
          <Card key={g.id} className="bg-gray-800 border-gray-700">
            <CardContent className="p-5">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <BookOpen className="w-4 h-4 text-amber-400" />
                    <h3 className="text-lg font-medium text-gray-100">{g.title}</h3>
                    <span className="text-[11px] px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-300 border border-amber-500/40 capitalize">{g.priority_level}</span>
                    <span className="text-[11px] px-2 py-0.5 rounded-full bg-gray-700 text-gray-300">{formatCategory(g.incident_category)}</span>
                    {g.incident_subtype && <span className="text-[11px] px-2 py-0.5 rounded-full bg-gray-700/60 text-gray-400">{g.incident_subtype}</span>}
                  </div>
                  <p className="text-sm text-gray-400 mt-1">{g.initial_actions}</p>
                  <div className="text-xs text-gray-500 mt-2">{g.steps?.length || 0} steps · {g.questions_to_ask?.length || 0} key questions · {g.triage_flow?.length || 0} triage questions</div>
                </div>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" onClick={() => openEdit(g)} className="bg-gray-900 border-gray-700 text-gray-200"><Pencil className="w-3.5 h-3.5" /></Button>
                  <Button size="sm" variant="outline" onClick={() => remove(g)} className="bg-gray-900 border-gray-700 text-red-400"><Trash2 className="w-3.5 h-3.5" /></Button>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="bg-gray-800 border-gray-700 text-gray-100 max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editing?.id ? "Edit Guidance" : "Add Guidance"}</DialogTitle></DialogHeader>
          {editing && (
            <div className="space-y-3 py-2">
              <div className="space-y-1"><Label className="text-gray-300">Title</Label><Input className="bg-gray-900 border-gray-700" value={editing.title} onChange={(e) => setEditing({ ...editing, title: e.target.value })} /></div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1"><Label className="text-gray-300">Category</Label>
                  <Select value={editing.incident_category} onValueChange={(v) => setEditing({ ...editing, incident_category: v })}>
                    <SelectTrigger className="bg-gray-900 border-gray-700"><SelectValue /></SelectTrigger>
                    <SelectContent className="bg-gray-900 border-gray-700">{INCIDENT_CATEGORIES.map((c) => <SelectItem key={c} value={c}>{formatCategory(c)}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="space-y-1"><Label className="text-gray-300">Priority</Label>
                  <Select value={editing.priority_level} onValueChange={(v) => setEditing({ ...editing, priority_level: v })}>
                    <SelectTrigger className="bg-gray-900 border-gray-700"><SelectValue /></SelectTrigger>
                    <SelectContent className="bg-gray-900 border-gray-700">{["critical", "high", "medium", "low"].map((p) => <SelectItem key={p} value={p} className="capitalize">{p}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-1"><Label className="text-gray-300">Subtype (optional — leave blank for category default)</Label><Input className="bg-gray-900 border-gray-700" value={editing.incident_subtype || ""} onChange={(e) => setEditing({ ...editing, incident_subtype: e.target.value })} placeholder="e.g. chest pain, lost hiker, disabled motorist" /></div>
              <div className="space-y-1"><Label className="text-gray-300">Initial Actions</Label><Textarea className="bg-gray-900 border-gray-700" rows={2} value={editing.initial_actions} onChange={(e) => setEditing({ ...editing, initial_actions: e.target.value })} /></div>
              <div className="space-y-1"><Label className="text-gray-300">Steps (one per line)</Label><Textarea className="bg-gray-900 border-gray-700" rows={5} value={stepsText} onChange={(e) => setStepsText(e.target.value)} /></div>
              <div className="space-y-1"><Label className="text-gray-300">Key Questions (one per line)</Label><Textarea className="bg-gray-900 border-gray-700" rows={3} value={questionsText} onChange={(e) => setQuestionsText(e.target.value)} /></div>
              <div className="space-y-2 pt-2 border-t border-gray-700/60">
                <Label className="text-gray-300">Triage Flow (optional)</Label>
                <p className="text-xs text-gray-500">Answer-driven questions that auto-derive priority and add conditional steps. Skip-logic stops remaining questions.</p>
                <TriageFlowBuilder value={editing.triage_flow} onChange={(v) => setEditing({ ...editing, triage_flow: v })} />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)} className="bg-gray-900 border-gray-700 text-gray-200">Cancel</Button>
            <Button onClick={save} className="bg-amber-600 hover:bg-amber-700 text-white">Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}