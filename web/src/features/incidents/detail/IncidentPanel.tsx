import type { EmergencyContact, Incident, Repeater, User } from "@/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useState } from "react";
import { Phone, Send, UserCog, RadioTower } from "lucide-react";
import OwnerBadge from "@/features/incidents/OwnerBadge";
import NotificationResults from "@/features/incidents/NotificationResults";
import RepeaterControls from "@/features/dtmf/RepeaterControls";
import { INCIDENT_CATEGORIES, formatCategory } from "@/features/incidents/incidentTaxonomy";

const agencyLabels = { "911": "911 / Emergency", police: "Police", fire: "Fire", emt: "EMT / EMS", power: "Power Company", gas: "Gas Company", other: "Other" };

// Column 1 of the incident screen: owner and hand-off, the editable details, the
// emergency contacts with the Notify Team button, and the repeater controls.
// Fields save themselves on blur through onSaveField.
interface IncidentPanelProps {
  incident: Incident;
  readOnly: boolean;
  busy: boolean;
  volunteers: User[];
  contacts: EmergencyContact[];
  repeaters: Repeater[];
  notificationResults: unknown[] | null;
  onSaveField: (field: string, value: string) => void;
  onMatchGuidance: (category: string | undefined, subtype: string | undefined) => void;
  onTakeOwnership: () => void;
  /** Resolves to true if the hand-off worked, so the picker can reset. */
  onAssign: (name: string) => Promise<boolean>;
  onNotify: () => void;
}

export default function IncidentPanel({ incident, readOnly, busy, volunteers, contacts, repeaters, notificationResults, onSaveField, onMatchGuidance, onTakeOwnership, onAssign, onNotify }: IncidentPanelProps) {
  const [assignPick, setAssignPick] = useState("");
  return (
    <>
    <Card className="bg-gray-800 border-gray-700">
      <CardContent className="p-4 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <UserCog className="w-4 h-4 text-sky-400" />
            <span className="text-xs text-gray-500">Response owner</span>
            <OwnerBadge name={incident.assigned_operator} />
          </div>
          {!readOnly && (
            <Button size="sm" variant="outline" onClick={onTakeOwnership} disabled={busy} className="bg-gray-900 border-gray-700 text-gray-200">Take ownership</Button>
          )}
        </div>
        {!readOnly && (
          <div className="flex gap-2">
            <Select value={assignPick} onValueChange={setAssignPick}>
              <SelectTrigger className="flex-1 bg-gray-900 border-gray-700"><SelectValue placeholder="Hand off to…" /></SelectTrigger>
              <SelectContent className="bg-gray-900 border-gray-700">
                {volunteers.map((v) => <SelectItem key={v.id} value={v.name}>{v.name}{v.callsign ? ` · ${v.callsign}` : ""}</SelectItem>)}
              </SelectContent>
            </Select>
            <Button size="sm" onClick={async () => { if (await onAssign(assignPick)) setAssignPick(""); }} disabled={busy || !assignPick} className="bg-sky-700 hover:bg-sky-800 text-white">Hand off</Button>
          </div>
        )}

        <div className="space-y-3 border-t border-gray-700/60 pt-4">
          <div className="space-y-1.5">
            <Label htmlFor="inc-caller" className="text-gray-400 text-xs">Caller info</Label>
            <Input id="inc-caller" className="bg-gray-900 border-gray-700" defaultValue={incident.caller_info} readOnly={readOnly} onBlur={(e) => onSaveField("caller_info", e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="inc-location" className="text-gray-400 text-xs">Location</Label>
            <Input id="inc-location" className="bg-gray-900 border-gray-700" defaultValue={incident.location_info} readOnly={readOnly} onBlur={(e) => onSaveField("location_info", e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="inc-category" className="text-gray-400 text-xs">Category</Label>
              <Select value={incident.incident_category || ""} disabled={readOnly} onValueChange={(v) => { onSaveField("incident_category", v); onMatchGuidance(v, incident.incident_subtype); }}>
                <SelectTrigger id="inc-category" className="bg-gray-900 border-gray-700"><SelectValue placeholder="Classify" /></SelectTrigger>
                <SelectContent className="bg-gray-900 border-gray-700">
                  {INCIDENT_CATEGORIES.map((c) => <SelectItem key={c} value={c}>{formatCategory(c)}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="inc-priority" className="text-gray-400 text-xs">Priority</Label>
              <Select value={incident.priority_level} disabled={readOnly} onValueChange={(v) => onSaveField("priority_level", v)}>
                <SelectTrigger id="inc-priority" className="bg-gray-900 border-gray-700"><SelectValue /></SelectTrigger>
                <SelectContent className="bg-gray-900 border-gray-700">
                  {["critical", "high", "medium", "low"].map((p) => <SelectItem key={p} value={p} className="capitalize">{p}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="inc-subtype" className="text-gray-400 text-xs">Subtype</Label>
            <Input id="inc-subtype" className="bg-gray-900 border-gray-700" defaultValue={incident.incident_subtype || ""} readOnly={readOnly} placeholder="e.g. chest pain, brush fire, lost hiker" onBlur={(e) => { onSaveField("incident_subtype", e.target.value); onMatchGuidance(incident.incident_category, e.target.value); }} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="inc-nature" className="text-gray-400 text-xs">Nature of emergency</Label>
            <Textarea id="inc-nature" className="bg-gray-900 border-gray-700" rows={3} defaultValue={incident.nature} readOnly={readOnly} onBlur={(e) => onSaveField("nature", e.target.value)} />
          </div>
        </div>
      </CardContent>
    </Card>

    {/* Emergency contacts and team notification */}
    <Card className="bg-gray-800 border-gray-700">
      <CardHeader className="pb-3"><CardTitle className="text-sm text-gray-200 flex items-center gap-2"><Phone className="w-4 h-4 text-red-400" /> Emergency Contacts</CardTitle></CardHeader>
      <CardContent className="space-y-2">
        {contacts.length === 0 ? (
          <div className="text-sm text-gray-500">No contacts configured for this repeater.</div>
        ) : contacts.map((c) => (
          <div key={c.id} className="flex items-center justify-between gap-3 py-2 border-b border-gray-700/50 last:border-0">
            <div className="min-w-0">
              <div className="text-sm text-gray-200">{agencyLabels[c.agency_type] || c.agency_type}: {c.agency_name}</div>
              {c.notes && <div className="text-xs text-gray-500">{c.notes}</div>}
            </div>
            <a href={`tel:${c.phone}`} className="shrink-0 text-sm font-mono text-emerald-400 hover:text-emerald-300">{c.phone}</a>
          </div>
        ))}
        {!readOnly && (
          <div className="pt-3 space-y-3">
            <Button onClick={onNotify} disabled={busy} variant="outline" className="bg-gray-900 border-gray-700 text-gray-200">
              <Send className="w-4 h-4 mr-1" /> Notify Team
            </Button>
            <NotificationResults results={notificationResults} />
          </div>
        )}
      </CardContent>
    </Card>

    <Card className="bg-gray-800 border-gray-700">
      <CardHeader className="pb-3"><CardTitle className="text-sm text-gray-200 flex items-center gap-2"><RadioTower className="w-4 h-4 text-sky-400" /> Repeater Controls</CardTitle></CardHeader>
      <CardContent>
        <RepeaterControls repeaters={repeaters} />
      </CardContent>
    </Card>
    </>
  );
}
