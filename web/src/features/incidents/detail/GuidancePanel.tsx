import type { GuidanceScript, Incident } from "@/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { BookOpen, Stethoscope } from "lucide-react";
import TriageRunner from "@/features/incidents/TriageRunner";

// Column 3: pick a guidance script and follow its steps, questions and triage flow.
interface GuidancePanelProps {
  incident: Incident;
  guidance: GuidanceScript[];
  selectedGuidance: string | null;
  onSelect: (id: string) => void;
  onApplied: () => void;
}

export default function GuidancePanel({ incident, guidance, selectedGuidance, onSelect, onApplied }: GuidancePanelProps) {
  const activeGuidance = guidance.find((g) => g.id === selectedGuidance);
  return (
    <>
    <Card className="bg-gray-800 border-gray-700">
      <CardHeader className="pb-3"><CardTitle className="text-sm text-gray-200 flex items-center gap-2"><BookOpen className="w-4 h-4 text-amber-400" /> Response Guidance</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        <Select value={selectedGuidance || ""} onValueChange={onSelect}>
          <SelectTrigger className="bg-gray-900 border-gray-700"><SelectValue placeholder="Select guidance script" /></SelectTrigger>
          <SelectContent className="bg-gray-900 border-gray-700">
            {guidance.map((g) => <SelectItem key={g.id} value={g.id}>{g.title}</SelectItem>)}
          </SelectContent>
        </Select>
        {!activeGuidance && <div className="text-sm text-gray-500">Pick a guidance script, or set a category on the incident to match one.</div>}
        {activeGuidance && (
          <div className="space-y-3 pt-1">
            <div className="text-xs text-amber-300 font-medium">Initial Actions</div>
            <div className="text-sm text-gray-300 bg-amber-500/5 border border-amber-500/20 rounded-md p-3">{activeGuidance.initial_actions}</div>
            <div className="text-xs text-gray-400 font-medium">Steps</div>
            <ol className="space-y-1.5 list-decimal list-inside text-sm text-gray-300">
              {activeGuidance.steps?.map((s, i) => <li key={i}>{s}</li>)}
            </ol>
            {activeGuidance.questions_to_ask?.length > 0 && (
              <>
                <div className="text-xs text-gray-400 font-medium pt-1">Key Questions</div>
                <ul className="space-y-1 list-disc list-inside text-sm text-gray-400">
                  {activeGuidance.questions_to_ask.map((q, i) => <li key={i}>{q}</li>)}
                </ul>
              </>
            )}
          </div>
        )}
        {(activeGuidance?.triage_flow?.length ?? 0) > 0 && (
          <div className="pt-3 border-t border-gray-700/60 space-y-3">
            <div className="text-xs text-amber-300 font-medium flex items-center gap-2"><Stethoscope className="w-3.5 h-3.5" /> Triage Flow</div>
            <TriageRunner guidance={activeGuidance} incident={incident} onApplied={onApplied} />
          </div>
        )}
      </CardContent>
    </Card>
    </>
  );
}
