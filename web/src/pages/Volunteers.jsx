import React, { useState, useEffect } from "react";
import { team } from "@/api";
import { useAuth } from "@/lib/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Plus, Trash2, Pencil, Phone, Mail, KeyRound } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";

const emptyVolunteer = { name: "", callsign: "", phone: "", email: "", role: "operator", active: true, notify_sms: true, notify_email: true, password: "" };

// VOLUNTEERS (/volunteers, admin only): the team. Each person is a login account
// (role, active or not) plus private contact details (phone, whether they get SMS
// and email alerts). New people are emailed a link to set their own password (once email is set up).
// All the work happens in src/api/team.js.
export default function Volunteers() {
  const { toast } = useToast();
  const { user } = useAuth();
  const [volunteers, setVolunteers] = useState([]);
  const [editing, setEditing] = useState(null);
  const [saving, setSaving] = useState(false);

  const load = async () => setVolunteers(await team.listVolunteers());
  useEffect(() => { load(); }, []);

  const save = async () => {
    if (!editing.name) return;
    if (!editing.id && !editing.email) {
      toast({ title: "Email is required", description: "It is the person's sign-in.", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const res = await team.saveVolunteer(editing);
      if (!editing.id) {
        toast({
          title: "Volunteer added",
          description: editing.password
            ? "They can sign in with the password you set."
            : res.resetEmailSent
              ? `A password-setup email was sent to ${editing.email}.`
              : "Email is not set up on the server, so no message was sent. Use Send reset link once SMTP is configured, or set a password.",
        });
      }
      setEditing(null);
      load();
    } catch (e) {
      const detail = e?.response?.data
        ? Object.values(e.response.data).map((x) => x?.message).filter(Boolean).join(" ")
        : "";
      toast({ title: "Save failed", description: detail || e.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const remove = async (v) => {
    if (v.id === user?.id) { toast({ title: "You cannot remove your own account", variant: "destructive" }); return; }
    if (!confirm(`Remove volunteer ${v.name}? Their sign-in is deleted too.`)) return;
    await team.deleteVolunteer(v.id);
    load();
  };

  const sendReset = async (v) => {
    try {
      await team.sendPasswordReset(v.email);
      toast({ title: "Reset link sent", description: v.email });
    } catch (e) {
      toast({ title: "Could not send", description: "Email may not be set up on the server.", variant: "destructive" });
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-100">Volunteers</h1>
          <p className="text-sm text-gray-400 mt-1">Team members who sign in and receive alerts</p>
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
                <Button size="sm" variant="outline" title="Send password reset link" onClick={() => sendReset(v)} className="bg-gray-900 border-gray-700 text-gray-200"><KeyRound className="w-3.5 h-3.5" /></Button>
                <Button size="sm" variant="outline" onClick={() => setEditing({ ...v, password: "" })} className="bg-gray-900 border-gray-700 text-gray-200"><Pencil className="w-3.5 h-3.5" /></Button>
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
              <div className="space-y-1"><Label className="text-gray-300">Email (sign-in and alerts)</Label><Input type="email" className="bg-gray-900 border-gray-700" value={editing.email} onChange={(e) => setEditing({ ...editing, email: e.target.value })} /></div>
              <div className="space-y-1">
                <Label className="text-gray-300">{editing.id ? "Set a new password (optional)" : "Password (optional)"}</Label>
                <Input type="password" autoComplete="new-password" className="bg-gray-900 border-gray-700" value={editing.password} onChange={(e) => setEditing({ ...editing, password: e.target.value })} />
                {!editing.id && <p className="text-xs text-gray-500">Leave blank and the person gets an email to choose their own.</p>}
              </div>
              <div className="flex items-center gap-4 pt-1">
                <label className="flex items-center gap-2 text-sm text-gray-300"><input type="checkbox" checked={editing.notify_sms} onChange={(e) => setEditing({ ...editing, notify_sms: e.target.checked })} /> SMS alerts</label>
                <label className="flex items-center gap-2 text-sm text-gray-300"><input type="checkbox" checked={editing.notify_email} onChange={(e) => setEditing({ ...editing, notify_email: e.target.checked })} /> Email alerts</label>
                <label className="flex items-center gap-2 text-sm text-gray-300"><input type="checkbox" checked={editing.active} onChange={(e) => setEditing({ ...editing, active: e.target.checked })} /> Active</label>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)} className="bg-gray-900 border-gray-700 text-gray-200">Cancel</Button>
            <Button onClick={save} disabled={saving} className="bg-sky-700 hover:bg-sky-800 text-white">{saving ? "Saving…" : "Save"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
