import React, { useState, useEffect } from "react";
import { createDtmfCommand, deleteDtmfCommand, listDtmfCommands, updateDtmfCommand, updateDtmfCommands } from "@/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";
import { Plus, Pencil, Trash2, ArrowUp, ArrowDown } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";

const DTMF_RE = /^[0-9A-D*#]{1,24}$/;

// Settings panel for the saved DTMF commands operators can send: add, edit, enable or
// disable, reorder (swaps the `order` numbers of two neighbours) and delete.
export default function DtmfCommandManager() {
  const { toast } = useToast();
  const [commands, setCommands] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({ name: "", dtmf: "", confirm_required: true, enabled: true });
  const [open, setOpen] = useState(false);

  const load = async () => {
    setLoading(true);
    const list = await listDtmfCommands();
    setCommands(list || []);
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const openNew = () => {
    setEditing(null);
    setForm({ name: "", dtmf: "", confirm_required: true, enabled: true });
    setOpen(true);
  };
  const openEdit = (cmd) => {
    setEditing(cmd);
    setForm({ name: cmd.name, dtmf: cmd.dtmf, confirm_required: cmd.confirm_required, enabled: cmd.enabled });
    setOpen(true);
  };

  const save = async () => {
    if (!form.name.trim()) {
      toast({ title: "Name is required", variant: "destructive" });
      return;
    }
    if (!DTMF_RE.test(form.dtmf.trim())) {
      toast({ title: "Invalid DTMF", description: "Use 1-24 characters: 0-9, A-D, *, #", variant: "destructive" });
      return;
    }
    try {
      if (editing) {
        await updateDtmfCommand(editing.id, {
          name: form.name.trim(),
          dtmf: form.dtmf.trim().toUpperCase(),
          confirm_required: form.confirm_required,
          enabled: form.enabled,
        });
      } else {
        const order = commands.length ? (commands[commands.length - 1].order || 0) + 1 : 0;
        await createDtmfCommand({
          name: form.name.trim(),
          dtmf: form.dtmf.trim().toUpperCase(),
          confirm_required: form.confirm_required,
          enabled: form.enabled,
          order,
        });
      }
      setOpen(false);
      load();
      toast({ title: "Command saved" });
    } catch (e) {
      toast({ title: "Save failed", description: e.message, variant: "destructive" });
    }
  };

  const toggle = async (cmd) => {
    await updateDtmfCommand(cmd.id, { enabled: !cmd.enabled });
    load();
  };

  const remove = async (cmd) => {
    if (!window.confirm(`Delete command "${cmd.name}"?`)) return;
    await deleteDtmfCommand(cmd.id);
    load();
    toast({ title: "Command deleted" });
  };

  const move = async (idx, dir) => {
    const target = idx + dir;
    if (target < 0 || target >= commands.length) return;
    const a = commands[idx];
    const b = commands[target];
    await updateDtmfCommands([
      { id: a.id, order: b.order },
      { id: b.id, order: a.order },
    ]);
    load();
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs text-gray-400">Commands available to operators. Reorder with the arrows.</p>
        <Button size="sm" onClick={openNew} className="bg-sky-700 hover:bg-sky-800 text-white">
          <Plus className="w-4 h-4 mr-1" /> Add Command
        </Button>
      </div>

      {loading ? (
        <div className="text-sm text-gray-500">Loading…</div>
      ) : commands.length === 0 ? (
        <div className="text-sm text-gray-500">No commands yet.</div>
      ) : (
        <div className="space-y-2">
          {commands.map((cmd, idx) => (
            <div key={cmd.id} className="flex items-center gap-3 rounded-md border border-gray-700 bg-gray-900/60 px-3 py-2">
              <div className="flex flex-col">
                <button onClick={() => move(idx, -1)} disabled={idx === 0} className="text-gray-500 hover:text-gray-200 disabled:opacity-30">
                  <ArrowUp className="w-3.5 h-3.5" />
                </button>
                <button onClick={() => move(idx, 1)} disabled={idx === commands.length - 1} className="text-gray-500 hover:text-gray-200 disabled:opacity-30">
                  <ArrowDown className="w-3.5 h-3.5" />
                </button>
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm text-gray-200">{cmd.name}</div>
                <div className="text-xs text-gray-500 font-mono">{cmd.dtmf}{cmd.confirm_required ? " · confirm" : ""}</div>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] uppercase text-gray-500">{cmd.enabled ? "on" : "off"}</span>
                <Switch checked={!!cmd.enabled} onCheckedChange={() => toggle(cmd)} />
              </div>
              <button onClick={() => openEdit(cmd)} className="text-gray-400 hover:text-gray-100"><Pencil className="w-4 h-4" /></button>
              <button onClick={() => remove(cmd)} className="text-red-400 hover:text-red-300"><Trash2 className="w-4 h-4" /></button>
            </div>
          ))}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="bg-gray-800 border-gray-700">
          <DialogHeader>
            <DialogTitle className="text-gray-100">{editing ? "Edit Command" : "New Command"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label className="text-gray-300">Name</Label>
              <Input className="bg-gray-900 border-gray-700" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Link Repeater" />
            </div>
            <div className="space-y-1">
              <Label className="text-gray-300">DTMF</Label>
              <Input className="bg-gray-900 border-gray-700 font-mono" value={form.dtmf} onChange={(e) => setForm({ ...form, dtmf: e.target.value.toUpperCase() })} placeholder="e.g. *8" />
              <p className="text-xs text-gray-500">1-24 characters: 0-9, A-D, *, #</p>
            </div>
            <div className="flex items-center justify-between">
              <Label className="text-gray-300">Require confirmation</Label>
              <Switch checked={form.confirm_required} onCheckedChange={(v) => setForm({ ...form, confirm_required: v })} />
            </div>
            <div className="flex items-center justify-between">
              <Label className="text-gray-300">Enabled</Label>
              <Switch checked={form.enabled} onCheckedChange={(v) => setForm({ ...form, enabled: v })} />
            </div>
          </div>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline" className="bg-gray-900 border-gray-700 text-gray-200">Cancel</Button>
            </DialogClose>
            <Button onClick={save} className="bg-sky-700 hover:bg-sky-800 text-white">Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}