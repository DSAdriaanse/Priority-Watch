import React, { useEffect, useMemo, useState, useCallback } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { entities } from "@/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/components/ui/use-toast";
import { ArrowLeft, Save, Trash2, Loader2, Play } from "lucide-react";
import ListEditor, { AutoTextarea } from "@/components/ListEditor";
import TriageFlowBuilder, { cleanTriageFlow } from "@/components/TriageFlowBuilder";
import TriageRunner from "@/components/TriageRunner";
import { INCIDENT_CATEGORIES, formatCategory } from "@/lib/incidentTaxonomy";

const EMPTY = { title: "", incident_category: "medical", incident_subtype: "", priority_level: "high", initial_actions: "", steps: [], questions_to_ask: [], triage_flow: [] };

const normalize = (g) => ({
  title: g.title || "",
  incident_category: g.incident_category || "other",
  incident_subtype: g.incident_subtype || "",
  priority_level: g.priority_level || "high",
  initial_actions: g.initial_actions || "",
  steps: Array.isArray(g.steps) ? g.steps : [],
  questions_to_ask: Array.isArray(g.questions_to_ask) ? g.questions_to_ask : [],
  triage_flow: Array.isArray(g.triage_flow) ? g.triage_flow : [],
});

// What gets stored: no blank rows.
const toPayload = (d) => ({
  ...d,
  title: d.title.trim(),
  incident_subtype: d.incident_subtype.trim(),
  initial_actions: d.initial_actions.trim(),
  steps: d.steps.map((s) => s.trim()).filter(Boolean),
  questions_to_ask: d.questions_to_ask.map((s) => s.trim()).filter(Boolean),
  triage_flow: cleanTriageFlow(d.triage_flow),
});

// GUIDANCE EDITOR (/guidance/new and /guidance/:id, admin only).
// Two tabs: Write-up (initial actions, steps, key questions) and Triage flow
// (questions that set priority and add steps), with a live preview of the triage.
// How it works: edits go into `draft`; `baseline` is the last saved version as text.
// "Unsaved changes" simply means JSON(draft) differs from baseline. toPayload()
// strips blank rows before anything is saved.
export default function GuidanceEditor() {
  const { id } = useParams();
  const isNew = !id;
  const navigate = useNavigate();
  const { toast } = useToast();

  const [draft, setDraft] = useState(EMPTY);
  const [baseline, setBaseline] = useState(JSON.stringify(toPayload(EMPTY)));
  const [loading, setLoading] = useState(!isNew);
  const [loadError, setLoadError] = useState(null);
  const [saving, setSaving] = useState(false);
  const [tab, setTab] = useState("writeup");

  useEffect(() => {
    if (isNew) return;
    let cancelled = false;
    (async () => {
      try {
        const g = await entities.GuidanceScript.get(id);
        if (cancelled) return;
        const d = normalize(g);
        setDraft(d);
        setBaseline(JSON.stringify(toPayload(d)));
      } catch (e) {
        if (!cancelled) setLoadError(e.message || "Could not load this guidance");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [id, isNew]);

  const set = (patch) => setDraft((d) => ({ ...d, ...patch }));
  const payload = useMemo(() => toPayload(draft), [draft]);
  const dirty = JSON.stringify(payload) !== baseline;
  const canSave = dirty && payload.title !== "" && !saving;

  const save = useCallback(async () => {
    if (!canSave) return;
    setSaving(true);
    try {
      if (isNew) {
        const created = await entities.GuidanceScript.create(payload);
        setBaseline(JSON.stringify(payload));
        toast({ title: "Guidance created" });
        navigate(`/guidance/${created.id}`, { replace: true });
      } else {
        const updated = await entities.GuidanceScript.update(id, payload);
        const d = normalize(updated);
        setDraft(d);
        setBaseline(JSON.stringify(toPayload(d)));
        toast({ title: "Saved" });
      }
    } catch (e) {
      toast({ title: "Save failed", description: e.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }, [canSave, isNew, id, payload, navigate, toast]);

  // Ctrl/Cmd+S saves; warn before closing the tab with unsaved edits.
  useEffect(() => {
    const onKey = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") { e.preventDefault(); save(); }
    };
    const onUnload = (e) => { if (dirty) { e.preventDefault(); e.returnValue = ""; } };
    window.addEventListener("keydown", onKey);
    window.addEventListener("beforeunload", onUnload);
    return () => { window.removeEventListener("keydown", onKey); window.removeEventListener("beforeunload", onUnload); };
  }, [save, dirty]);

  const leave = (e) => {
    if (dirty && !confirm("You have unsaved changes. Leave without saving?")) e.preventDefault();
  };

  const discard = () => {
    if (!confirm("Discard all unsaved changes?")) return;
    setDraft(isNew ? EMPTY : normalize(JSON.parse(baseline)));
  };

  const remove = async () => {
    if (!confirm(`Delete guidance "${draft.title || "Untitled"}"? This cannot be undone.`)) return;
    try {
      await entities.GuidanceScript.delete(id);
      setBaseline(JSON.stringify(payload)); // nothing left to lose
      navigate("/guidance", { replace: true });
    } catch (e) {
      toast({ title: "Delete failed", description: e.message, variant: "destructive" });
    }
  };

  if (loading) return <div className="flex items-center gap-2 text-gray-400"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</div>;
  if (loadError) {
    return (
      <div className="space-y-4">
        <Link to="/guidance" className="inline-flex items-center text-sm text-gray-400 hover:text-gray-200"><ArrowLeft className="mr-1 h-4 w-4" /> Back to Guidance</Link>
        <div className="text-sm text-red-400">{loadError}</div>
      </div>
    );
  }

  const triageCount = payload.triage_flow.filter((q) => q.question && q.answers.length).length;

  return (
    <div className="space-y-6">
      {/* Action bar */}
      <div className="sticky top-0 z-10 -mx-4 flex items-center justify-between gap-3 border-b border-gray-800 bg-gray-900/95 px-4 py-3 backdrop-blur md:-mx-8 md:px-8">
        <Link to="/guidance" onClick={leave} className="inline-flex items-center text-sm text-gray-400 hover:text-gray-200">
          <ArrowLeft className="mr-1 h-4 w-4" /> Guidance
        </Link>
        <div className="flex items-center gap-2">
          {dirty && <span className="hidden text-xs text-amber-400 sm:inline">Unsaved changes</span>}
          {!isNew && <Button type="button" variant="ghost" size="sm" onClick={remove} className="text-red-400 hover:text-red-300"><Trash2 className="mr-1 h-4 w-4" /> Delete</Button>}
          {dirty && <Button type="button" variant="outline" size="sm" onClick={discard} className="border-gray-700 bg-gray-900 text-gray-200">Discard</Button>}
          <Button type="button" size="sm" onClick={save} disabled={!canSave} className="bg-amber-600 text-white hover:bg-amber-700 disabled:opacity-50">
            {saving ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Save className="mr-1 h-4 w-4" />} {isNew ? "Create" : "Save"}
          </Button>
        </div>
      </div>

      {/* Title and details */}
      <div className="space-y-4">
        <Input
          aria-label="Title"
          value={draft.title}
          onChange={(e) => set({ title: e.target.value })}
          placeholder="Untitled guidance"
          className="h-auto border-0 border-b border-gray-700 bg-transparent px-0 py-2 text-2xl md:text-2xl font-semibold text-gray-100 placeholder:text-gray-600 focus-visible:ring-0 rounded-none"
        />
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="space-y-1">
            <Label className="text-gray-400">Category</Label>
            <Select value={draft.incident_category} onValueChange={(v) => set({ incident_category: v })}>
              <SelectTrigger className="border-gray-700 bg-gray-900"><SelectValue /></SelectTrigger>
              <SelectContent className="border-gray-700 bg-gray-900">{INCIDENT_CATEGORIES.map((c) => <SelectItem key={c} value={c}>{formatCategory(c)}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-gray-400">Subtype <span className="text-gray-600">(blank = category default)</span></Label>
            <Input className="border-gray-700 bg-gray-900" value={draft.incident_subtype} onChange={(e) => set({ incident_subtype: e.target.value })} placeholder="e.g. chest pain, lost hiker" />
          </div>
          <div className="space-y-1">
            <Label className="text-gray-400">Starting priority</Label>
            <Select value={draft.priority_level} onValueChange={(v) => set({ priority_level: v })}>
              <SelectTrigger className="border-gray-700 bg-gray-900"><SelectValue /></SelectTrigger>
              <SelectContent className="border-gray-700 bg-gray-900">{["critical", "high", "medium", "low"].map((p) => <SelectItem key={p} value={p} className="capitalize">{p}</SelectItem>)}</SelectContent>
            </Select>
          </div>
        </div>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="h-10 bg-gray-800">
          <TabsTrigger value="writeup" className="px-4">Write-up <span className="ml-2 text-xs text-gray-500">{payload.steps.length} steps</span></TabsTrigger>
          <TabsTrigger value="triage" className="px-4">Triage flow <span className="ml-2 text-xs text-gray-500">{triageCount} questions</span></TabsTrigger>
        </TabsList>

        <TabsContent value="writeup" className="mt-4 space-y-4">
          <Card className="border-gray-700 bg-gray-800">
            <CardHeader className="pb-2"><CardTitle className="text-base text-gray-100">Initial actions</CardTitle><p className="text-xs text-gray-500">The first thing the operator does or says, shown at the top.</p></CardHeader>
            <CardContent><AutoTextarea minRows={3} value={draft.initial_actions} onChange={(e) => set({ initial_actions: e.target.value })} placeholder="e.g. Ask for the caller's callsign and exact location. Confirm 911 has been called." /></CardContent>
          </Card>
          <div className="grid gap-4 lg:grid-cols-5">
            <Card className="border-gray-700 bg-gray-800 lg:col-span-3">
              <CardHeader className="pb-2"><CardTitle className="text-base text-gray-100">Response steps</CardTitle><p className="text-xs text-gray-500">Enter adds a step below, Backspace on an empty step removes it, Alt+Up/Down reorders.</p></CardHeader>
              <CardContent><ListEditor items={draft.steps} onChange={(steps) => set({ steps })} placeholder="Describe the step…" addLabel="Add step" emptyText="No steps yet." /></CardContent>
            </Card>
            <Card className="border-gray-700 bg-gray-800 lg:col-span-2">
              <CardHeader className="pb-2"><CardTitle className="text-base text-gray-100">Key questions to ask</CardTitle><p className="text-xs text-gray-500">A checklist for the operator to read out.</p></CardHeader>
              <CardContent><ListEditor items={draft.questions_to_ask} onChange={(questions_to_ask) => set({ questions_to_ask })} placeholder="Question to ask the caller…" addLabel="Add question" numbered={false} emptyText="No questions yet." /></CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="triage" className="mt-4">
          <p className="mb-4 max-w-3xl text-sm text-gray-400">
            Quick questions the operator answers during an incident. Each answer can raise the priority (the highest one wins), add extra steps, or stop the questions early. Questions run in the order shown.
          </p>
          <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
            <TriageFlowBuilder value={draft.triage_flow} onChange={(triage_flow) => set({ triage_flow })} />
            <div className="lg:sticky lg:top-20 lg:self-start">
              <Card className="border-gray-700 bg-gray-800">
                <CardHeader className="pb-2"><CardTitle className="flex items-center gap-2 text-base text-gray-100"><Play className="h-4 w-4 text-sky-400" /> Try it</CardTitle><p className="text-xs text-gray-500">How operators will see it. Nothing here is saved to an incident.</p></CardHeader>
                <CardContent>
                  <TriageRunner key={JSON.stringify(payload.triage_flow)} guidance={{ ...payload }} />
                </CardContent>
              </Card>
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
