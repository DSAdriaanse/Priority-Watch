import React, { useState, useEffect } from "react";
import { createContact, createRepeater, deleteContact, deleteRepeater, listContacts, listRepeaters, updateRepeater, type Repeater, type EmergencyContact, type AgencyType } from "@/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Plus, Phone, Trash2, Pencil } from "lucide-react";
import StatusBadge from "@/features/incidents/StatusBadge";
import { useToast } from "@/components/ui/use-toast";

const emptyRepeater: Partial<Repeater> = { node_number: "", name: "", callsign: "", location: "", state: "", frequency: "", coverage_area: "", link_webhook_url: "", delink_webhook_url: "", dtmf_link_code: "", dtmf_delink_code: "", status: "online", notes: "" };
const agencyTypes = ["911", "police", "fire", "emt", "power", "gas", "other"];
const agencyLabels = { "911": "911", police: "Police", fire: "Fire", emt: "EMT", power: "Power", gas: "Gas", other: "Other" };

// REPEATERS (/repeaters, admin only): add, edit and delete repeaters and the
// emergency contacts (911, police, fire ...) shown to operators during an incident.
// Each repeater also holds its node number for radio control and the two webhook
// addresses used to link and delink it.
export default function Repeaters() {
  const { toast } = useToast();
  const [repeaters, setRepeaters] = useState<Repeater[]>([]);
  const [contacts, setContacts] = useState<Record<string, EmergencyContact[]>>({});
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Partial<Repeater> | null>(null); // repeater being edited/created
  const [contactFor, setContactFor] = useState<string | null>(null); // repeater id for contact mgmt
  const [newContact, setNewContact] = useState<Partial<EmergencyContact>>({ agency_type: "911", agency_name: "", phone: "", alternate_phone: "", notes: "" });

  const load = async () => {
    setLoading(true);
    const reps = await listRepeaters();
    setRepeaters(reps);
    const allContacts = await listContacts();
    const byRep = {};
    allContacts.forEach((c) => { (byRep[c.repeater_id] ||= []).push(c); });
    setContacts(byRep);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const saveRepeater = async () => {
    if (!editing || !editing.name) return;
    if (editing.id) {
      await updateRepeater(editing.id, editing);
    } else {
      await createRepeater(editing);
    }
    setEditing(null);
    load();
  };

  const removeRepeater = async (r) => {
    if (!confirm(`Delete repeater ${r.name}?`)) return;
    await deleteRepeater(r.id);
    const conts = contacts[r.id] || [];
    for (const c of conts) await deleteContact(c.id);
    load();
  };

  const addContact = async () => {
    if (!newContact.phone || !contactFor) return;
    await createContact({ ...newContact, repeater_id: contactFor });
    setNewContact({ agency_type: "911", agency_name: "", phone: "", alternate_phone: "", notes: "" });
    load();
  };

  const removeContact = async (c) => {
    await deleteContact(c.id);
    load();
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-100">Repeaters</h1>
          <p className="text-sm text-gray-400 mt-1">Multi-state repeater system and emergency contacts</p>
        </div>
        <Button onClick={() => setEditing({ ...emptyRepeater })} className="bg-sky-700 hover:bg-sky-800 text-white"><Plus className="w-4 h-4 mr-2" /> Add Repeater</Button>
      </div>

      {loading ? <div className="text-gray-500 text-sm">Loading…</div> : (
        <div className="grid gap-4">
          {repeaters.map((r) => (
            <Card key={r.id} className="bg-gray-800 border-gray-700">
              <CardContent className="p-5">
                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      {r.node_number && <span className="text-xs font-mono px-2 py-0.5 rounded bg-sky-900/60 text-sky-300 border border-sky-700/50">#{r.node_number}</span>}
                      <h3 className="text-lg font-medium text-gray-100">{r.name}</h3>
                      <StatusBadge status={r.status} />
                    </div>
                    <div className="text-sm text-gray-400 mt-0.5">{r.callsign} · {r.frequency} · {r.location}, {r.state}</div>
                    <div className="text-xs text-gray-500 mt-1">Coverage: {r.coverage_area}</div>
                    {r.notes && <div className="text-xs text-gray-500 mt-1">{r.notes}</div>}
                  </div>
                  <div className="flex gap-2 flex-wrap">
                    <Button size="sm" variant="outline" onClick={() => setContactFor(r.id)} className="bg-gray-900 border-gray-700 text-gray-200"><Phone className="w-3.5 h-3.5 mr-1" /> Contacts ({(contacts[r.id] || []).length})</Button>
                    <Button size="sm" variant="outline" onClick={() => setEditing(r)} className="bg-gray-900 border-gray-700 text-gray-200"><Pencil className="w-3.5 h-3.5" /></Button>
                    <Button size="sm" variant="outline" onClick={() => removeRepeater(r)} className="bg-gray-900 border-gray-700 text-red-400"><Trash2 className="w-3.5 h-3.5" /></Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Repeater edit dialog */}
      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="bg-gray-800 border-gray-700 text-gray-100 max-w-lg">
          <DialogHeader><DialogTitle>{editing?.id ? "Edit Repeater" : "Add Repeater"}</DialogTitle></DialogHeader>
          {editing && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 py-2">
              <div className="space-y-1"><Label className="text-gray-300">Node #</Label><Input className="bg-gray-900 border-gray-700 font-mono" value={editing.node_number || ""} onChange={(e) => setEditing({ ...editing, node_number: e.target.value })} placeholder="e.g. 42" /></div>
              <div className="space-y-1"><Label className="text-gray-300">Name</Label><Input className="bg-gray-900 border-gray-700" value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} /></div>
              <div className="space-y-1"><Label className="text-gray-300">Callsign</Label><Input className="bg-gray-900 border-gray-700" value={editing.callsign} onChange={(e) => setEditing({ ...editing, callsign: e.target.value })} /></div>
              <div className="space-y-1"><Label className="text-gray-300">Frequency</Label><Input className="bg-gray-900 border-gray-700" value={editing.frequency} onChange={(e) => setEditing({ ...editing, frequency: e.target.value })} /></div>
              <div className="space-y-1"><Label className="text-gray-300">Location</Label><Input className="bg-gray-900 border-gray-700" value={editing.location} onChange={(e) => setEditing({ ...editing, location: e.target.value })} /></div>
              <div className="space-y-1"><Label className="text-gray-300">State</Label><Input className="bg-gray-900 border-gray-700" value={editing.state} onChange={(e) => setEditing({ ...editing, state: e.target.value })} /></div>
              <div className="col-span-2 space-y-1"><Label className="text-gray-300">Coverage Area</Label><Input className="bg-gray-900 border-gray-700" value={editing.coverage_area} onChange={(e) => setEditing({ ...editing, coverage_area: e.target.value })} /></div>
              <div className="space-y-1"><Label className="text-gray-300">Link Webhook URL</Label><Input className="bg-gray-900 border-gray-700" value={editing.link_webhook_url} onChange={(e) => setEditing({ ...editing, link_webhook_url: e.target.value })} /></div>
              <div className="space-y-1"><Label className="text-gray-300">Delink Webhook URL</Label><Input className="bg-gray-900 border-gray-700" value={editing.delink_webhook_url} onChange={(e) => setEditing({ ...editing, delink_webhook_url: e.target.value })} /></div>
              <div className="space-y-1"><Label className="text-gray-300">DTMF Link Code</Label><Input className="bg-gray-900 border-gray-700" value={editing.dtmf_link_code} onChange={(e) => setEditing({ ...editing, dtmf_link_code: e.target.value })} /></div>
              <div className="space-y-1"><Label className="text-gray-300">DTMF Delink Code</Label><Input className="bg-gray-900 border-gray-700" value={editing.dtmf_delink_code} onChange={(e) => setEditing({ ...editing, dtmf_delink_code: e.target.value })} /></div>
              <div className="col-span-2 space-y-1"><Label className="text-gray-300">Notes</Label><Textarea className="bg-gray-900 border-gray-700" rows={2} value={editing.notes} onChange={(e) => setEditing({ ...editing, notes: e.target.value })} /></div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)} className="bg-gray-900 border-gray-700 text-gray-200">Cancel</Button>
            <Button onClick={saveRepeater} className="bg-sky-700 hover:bg-sky-800 text-white">Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Contact management dialog */}
      <Dialog open={!!contactFor} onOpenChange={(o) => !o && setContactFor(null)}>
        <DialogContent className="bg-gray-800 border-gray-700 text-gray-100 max-w-lg">
          <DialogHeader><DialogTitle>Emergency Contacts</DialogTitle></DialogHeader>
          <div className="space-y-2 py-2 max-h-60 overflow-y-auto">
            {(contacts[contactFor as string] || []).map((c) => (
              <div key={c.id} className="flex items-center justify-between py-2 border-b border-gray-700/50">
                <div><div className="text-sm text-gray-200">{agencyLabels[c.agency_type]}: {c.agency_name}</div><div className="text-xs text-emerald-400 font-mono">{c.phone}</div></div>
                <Button size="sm" variant="outline" onClick={() => removeContact(c)} className="bg-gray-900 border-gray-700 text-red-400"><Trash2 className="w-3.5 h-3.5" /></Button>
              </div>
            ))}
          </div>
          <div className="border-t border-gray-700 pt-3 space-y-2">
            <div className="text-xs text-gray-400 uppercase tracking-wider">Add Contact</div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <select className="bg-gray-900 border border-gray-700 rounded-md px-2 py-1.5 text-sm text-gray-200" value={newContact.agency_type} onChange={(e) => setNewContact({ ...newContact, agency_type: e.target.value as AgencyType })}>
                {agencyTypes.map((t) => <option key={t} value={t}>{agencyLabels[t]}</option>)}
              </select>
              <Input className="bg-gray-900 border-gray-700" placeholder="Agency name" value={newContact.agency_name} onChange={(e) => setNewContact({ ...newContact, agency_name: e.target.value })} />
              <Input className="bg-gray-900 border-gray-700" placeholder="Phone" value={newContact.phone} onChange={(e) => setNewContact({ ...newContact, phone: e.target.value })} />
              <Input className="bg-gray-900 border-gray-700" placeholder="Alt phone" value={newContact.alternate_phone} onChange={(e) => setNewContact({ ...newContact, alternate_phone: e.target.value })} />
            </div>
            <Button onClick={addContact} size="sm" className="bg-sky-700 hover:bg-sky-800 text-white"><Plus className="w-3.5 h-3.5 mr-1" /> Add</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}