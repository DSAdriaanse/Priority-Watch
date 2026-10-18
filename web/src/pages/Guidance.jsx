import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { entities } from "@/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useToast } from "@/components/ui/use-toast";
import { Plus, Trash2, Pencil, BookOpen, Copy } from "lucide-react";
import { formatCategory } from "@/lib/incidentTaxonomy";

// GUIDANCE LIST (/guidance, admin only): all response scripts. Click one to edit it in
// the full-page editor (pages/GuidanceEditor.jsx).
export default function Guidance() {
  const [guides, setGuides] = useState([]);
  const navigate = useNavigate();
  const { toast } = useToast();

  const load = async () => setGuides(await entities.GuidanceScript.list());
  useEffect(() => { load(); }, []);

  const remove = async (e, g) => {
    e.stopPropagation();
    if (!confirm(`Delete guidance "${g.title}"?`)) return;
    await entities.GuidanceScript.delete(g.id);
    load();
  };

  const duplicate = async (e, g) => {
    e.stopPropagation();
    try {
      const { id, ...rest } = g;
      const copy = await entities.GuidanceScript.create({ ...rest, title: `${g.title} (copy)` });
      navigate(`/guidance/${copy.id}`);
    } catch (err) {
      toast({ title: "Could not duplicate", description: err.message, variant: "destructive" });
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-100">Response Guidance</h1>
          <p className="text-sm text-gray-400 mt-1">Step-by-step protocols operators follow by emergency type</p>
        </div>
        <Button onClick={() => navigate("/guidance/new")} className="bg-amber-600 hover:bg-amber-700 text-white"><Plus className="w-4 h-4 mr-2" /> Add Guidance</Button>
      </div>

      <div className="grid gap-4">
        {guides.map((g) => (
          <Card
            key={g.id}
            role="link"
            tabIndex={0}
            onClick={() => navigate(`/guidance/${g.id}`)}
            onKeyDown={(e) => e.key === "Enter" && navigate(`/guidance/${g.id}`)}
            className="bg-gray-800 border-gray-700 cursor-pointer hover:border-gray-500 transition-colors"
          >
            <CardContent className="p-5">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <BookOpen className="w-4 h-4 text-amber-400" />
                    <h3 className="text-lg font-medium text-gray-100">{g.title}</h3>
                    <span className="text-[11px] px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-300 border border-amber-500/40 capitalize">{g.priority_level}</span>
                    <span className="text-[11px] px-2 py-0.5 rounded-full bg-gray-700 text-gray-300">{formatCategory(g.incident_category)}</span>
                    {g.incident_subtype && <span className="text-[11px] px-2 py-0.5 rounded-full bg-gray-700/60 text-gray-400">{g.incident_subtype}</span>}
                  </div>
                  <p className="text-sm text-gray-400 mt-1 line-clamp-2">{g.initial_actions}</p>
                  <div className="text-xs text-gray-500 mt-2">{g.steps?.length || 0} steps · {g.questions_to_ask?.length || 0} key questions · {g.triage_flow?.length || 0} triage questions</div>
                </div>
                <div className="flex gap-2 shrink-0">
                  <Button size="sm" variant="outline" onClick={(e) => { e.stopPropagation(); navigate(`/guidance/${g.id}`); }} className="bg-gray-900 border-gray-700 text-gray-200" aria-label="Edit"><Pencil className="w-3.5 h-3.5" /></Button>
                  <Button size="sm" variant="outline" onClick={(e) => duplicate(e, g)} className="bg-gray-900 border-gray-700 text-gray-200" aria-label="Duplicate"><Copy className="w-3.5 h-3.5" /></Button>
                  <Button size="sm" variant="outline" onClick={(e) => remove(e, g)} className="bg-gray-900 border-gray-700 text-red-400" aria-label="Delete"><Trash2 className="w-3.5 h-3.5" /></Button>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
