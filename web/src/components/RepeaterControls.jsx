import React, { useState, useEffect } from "react";
import { entities, functions, auth } from "@/api";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Loader2, Send } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";

// Used on the Repeater Control screen and inside an incident.
// Sends only a repeater id and a command id; the server looks up the node number
// and the digits itself. Commands marked confirm_required ask "are you sure?" first.
// Reusable DTMF control panel. `repeaters` is the list of repeaters to offer;
// only those with a node number are selectable. Calls the runDtmf backend function.
export default function RepeaterControls({ repeaters }) {
  const { toast } = useToast();
  const [commands, setCommands] = useState([]);
  const [repeaterId, setRepeaterId] = useState("");
  const [commandId, setCommandId] = useState("");
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState(null);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const eligible = (repeaters || []).filter(
    (r) => r.node_number && String(r.node_number).trim() !== ""
  );

  const loadCommands = async () => {
    const list = await entities.DtmfCommand.filter({ enabled: true }, "order", 100);
    setCommands(list || []);
  };
  useEffect(() => { loadCommands(); }, []);

  useEffect(() => {
    if (eligible.length && !eligible.find((r) => r.id === repeaterId)) {
      setRepeaterId(eligible[0].id);
    }
  }, [repeaters]);

  useEffect(() => {
    if (commands.length && !commands.find((c) => c.id === commandId)) {
      setCommandId(commands[0].id);
    }
  }, [commands]);

  const selectedRepeater = eligible.find((r) => r.id === repeaterId);
  const selectedCommand = commands.find((c) => c.id === commandId);

  const doSend = async () => {
    if (!repeaterId || !commandId) return;
    setSending(true);
    setResult(null);
    try {
      const res = await functions.invoke("runDtmf", { repeaterId, commandId });
      const data = res.data || {};
      if (data.ok) {
        setResult({ ok: true, output: data.output });
        toast({ title: "Command sent", description: data.output });
      } else {
        setResult({ ok: false, error: data.error || "Failed" });
        toast({ title: "Command failed", description: data.error, variant: "destructive" });
      }
    } catch (e) {
      const msg = e?.response?.data?.error || e.message || "Request failed";
      setResult({ ok: false, error: msg });
      toast({ title: "Command failed", description: msg, variant: "destructive" });
    } finally {
      setSending(false);
    }
  };

  const onSendClick = () => {
    if (!repeaterId || !commandId) return;
    if (selectedCommand?.confirm_required) setConfirmOpen(true);
    else doSend();
  };

  if (eligible.length === 0) {
    return <div className="text-sm text-gray-500">No repeaters with a node number are available.</div>;
  }

  return (
    <div className="space-y-3">
      <div className="grid sm:grid-cols-2 gap-3">
        <div className="space-y-1">
          <label className="text-xs text-gray-400 uppercase tracking-wider">Repeater</label>
          <Select value={repeaterId} onValueChange={setRepeaterId}>
            <SelectTrigger className="bg-gray-900 border-gray-700"><SelectValue placeholder="Select repeater" /></SelectTrigger>
            <SelectContent className="bg-gray-900 border-gray-700">
              {eligible.map((r) => (
                <SelectItem key={r.id} value={r.id}>{r.name} · Node {r.node_number}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <label className="text-xs text-gray-400 uppercase tracking-wider">Command</label>
          <Select value={commandId} onValueChange={setCommandId}>
            <SelectTrigger className="bg-gray-900 border-gray-700"><SelectValue placeholder="Select command" /></SelectTrigger>
            <SelectContent className="bg-gray-900 border-gray-700">
              {commands.length === 0 && <div className="px-3 py-2 text-xs text-gray-500">No commands configured</div>}
              {commands.map((c) => (
                <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <Button onClick={onSendClick} disabled={sending || !repeaterId || !commandId} className="bg-sky-700 hover:bg-sky-800 text-white">
        {sending ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Sending…</> : <><Send className="w-4 h-4 mr-2" /> Send Command</>}
      </Button>

      {result && (
        <div className={`text-sm rounded-md p-3 border ${result.ok ? "bg-emerald-900/20 border-emerald-700/40 text-emerald-200" : "bg-red-900/20 border-red-700/40 text-red-200"}`}>
          <div className="text-xs uppercase tracking-wider mb-1">{result.ok ? "Output" : "Error"}</div>
          <pre className="whitespace-pre-wrap font-sans">{result.ok ? result.output : result.error}</pre>
        </div>
      )}

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent className="bg-gray-800 border-gray-700">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-gray-100">Confirm command</AlertDialogTitle>
            <AlertDialogDescription className="text-gray-400">
              Send {selectedCommand?.name} to {selectedRepeater?.name} (node {selectedRepeater?.node_number})?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="bg-gray-900 border-gray-700 text-gray-200">Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={doSend} className="bg-sky-700 hover:bg-sky-800 text-white">Send</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}