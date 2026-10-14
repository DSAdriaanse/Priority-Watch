import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Plus, Trash2, Pencil, Phone, Mail } from "lucide-react";

const emptyVolunteer = { name: "", callsign: "", phone: "", email: "", role: "operator", active: true, notify_sms: true, notify_email: true };

export default function Volunteers() {
  const [volunteers, setVolunteers] = useState([]);
  const [editing, setEditing] = useState(null);

  const load = async () => setVolunteers(await base44.entities.Volunteer.list());
  useEffect(() => { load(); }, []);

  const save = async () => {
    if (!editing.name) return;
    if (editing.id) await base44.entities.Volunteer.update(editing.id, editing);
    else await base44.entities.Volunteer.create(editing);
    setEditing(null);
    load();
  };

  const remove = async (v) => {
    if (!confirm(`Remove volunteer ${v.name}?`)) return;
    await base44.entities.Volunteer.delete(v.id);
    load();
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-100">Volunteers</h1>
          <p className="text-sm text-gray-400 mt-1">Priority watch team members receiving alerts</p>
        </div>
        <Button onClick={() => setEditing({ ...emptyVolunteer })} className="bg-sky-700 hover:bg-sky-800 text-white"><Plus className="w-4 h-4 mr-2" /> Add Volunteer</Button>
      </div>

      <div className="grid gap-3">
        {volunteers.map((v) => (
          <Card key={v.id} className="bg-gray-800 border-gray-700">
            <CardContent className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="font-medium text-gray-100">{v.name}</h3>
                  {v.callsign && <span className="text-xs text-gray-500 font-mono">{v.callsign}</span>}
                  <span className="text-[11px] px-2 py-0.5 rounded-full bg-gray-700 text-gray-300 capitalize">{v.role.replace("_", " ")}</span>
                  {!v.active && <span className="text-[11px] px-2 py-0.5 rounded-full bg-gray-700 text-gray-500">inactive</span>}
                </div>
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-1 text-xs text-gray-400">
                  {v.phone && <span className="flex items-center gap-1"><Phone className="w-3 h-3" /> {v.phone} {v.notify_sms && <span className="text-emerald-500">SMS</span>}</span>}
                  {v.email && <span className="flex items-center gap-1"><Mail className="w-3 h-3" /> {v.email} {v.notify_email && <span className="text-emerald-500">Email</span>}</span>}
                </div>
              </div>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={() => setEditing(v)} className="bg-gray-900 border-gray-700 text-gray-200"><Pencil className="w-3.5 h-3.5" /></Button>
                <Button size="sm" variant="outline" onClick={() => remove(v)} className="bg-gray-900 border-gray-700 text-red-400"><Trash2 className="w-3.5 h-3.5" /></Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="bg-gray-800 border-gray-700 text-gray-100 max-w-md">
          <DialogHeader><DialogTitle>{editing?.id ? "Edit Volunteer" : "Add Volunteer"}</DialogTitle></DialogHeader>
          {editing && (
            <div className="space-y-3 py-2">
              <div className="space-y-1"><Label className="text-gray-300">Name</Label><Input className="bg-gray-900 border-gray-700" value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} /></div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1"><Label className="text-gray-300">Callsign</Label><Input className="bg-gray-900 border-gray-700" value={editing.callsign} onChange={(e) => setEditing({ ...editing, callsign: e.target.value })} /></div>
                <div className="space-y-1"><Label className="text-gray-300">Role</Label>
                  <Select value={editing.role} onValueChange={(val) => setEditing({ ...editing, role: val })}>
                    <SelectTrigger className="bg-gray-900 border-gray-700"><SelectValue /></SelectTrigger>
                    <SelectContent className="bg-gray-900 border-gray-700">{["admin", "operator", "priority_watch"].map((r) => <SelectItem key={r} value={r} className="capitalize">{r.replace("_", " ")}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-1"><Label className="text-gray-300">Phone (SMS)</Label><Input className="bg-gray-900 border-gray-700" value={editing.phone} onChange={(e) => setEditing({ ...editing, phone: e.target.value })} /></div>
              <div className="space-y-1"><Label className="text-gray-300">Email</Label><Input className="bg-gray-900 border-gray-700" value={editing.email} onChange={(e) => setEditing({ ...editing, email: e.target.value })} /></div>
              <div className="flex items-center gap-4 pt-1">
                <label className="flex items-center gap-2 text-sm text-gray-300"><input type="checkbox" checked={editing.notify_sms} onChange={(e) => setEditing({ ...editing, notify_sms: e.target.checked })} /> SMS alerts</label>
                <label className="flex items-center gap-2 text-sm text-gray-300"><input type="checkbox" checked={editing.notify_email} onChange={(e) => setEditing({ ...editing, notify_email: e.target.checked })} /> Email alerts</label>
                <label className="flex items-center gap-2 text-sm text-gray-300"><input type="checkbox" checked={editing.active} onChange={(e) => setEditing({ ...editing, active: e.target.checked })} /> Active</label>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)} className="bg-gray-900 border-gray-700 text-gray-200">Cancel</Button>
            <Button onClick={save} className="bg-sky-700 hover:bg-sky-800 text-white">Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}