import React, { useState, useEffect } from "react";
import { configStatus, createSettings, getSettings, updateSettings } from "@/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Save, Webhook, MessageSquare, FileText, Slack, RadioTower, CheckCircle2, CircleAlert } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";
import DataBackup from "@/features/settings/DataBackup";
import DtmfCommandManager from "@/features/dtmf/DtmfCommandManager";

const DEFAULT_TEMPLATE = "GMRS PRIORITY WATCH ALERT\nRepeater: {repeater}\nType: {alert_type}\nDetails: {nature}\nCheck the Priority Watch dashboard immediately.";

const emptySettings = {
  wordpress_url: "", wordpress_username: "",
  notification_template: DEFAULT_TEMPLATE,
  slack_channel: "",
  allmon3_base_url: "", allmon3_username: "",
  emergency_hub_node: "", incident_closeout_macro: "",
};

// Shows whether a server-side secret is set, without ever showing the secret.
function SecretStatus({ ok, name }) {
  return (
    <div className={`flex items-center gap-2 text-xs rounded-md p-3 border ${ok ? "border-emerald-700/40 bg-emerald-900/10 text-emerald-300" : "border-amber-700/40 bg-amber-900/10 text-amber-300"}`}>
      {ok ? <CheckCircle2 className="w-4 h-4 shrink-0" /> : <CircleAlert className="w-4 h-4 shrink-0" />}
      <span>
        <span className="font-mono">{name}</span> {ok ? "is set on the server." : "is not set. Add it to the server's .env file and restart."}
      </span>
    </div>
  );
}

// SETTINGS (/settings, admin only): non-secret configuration (alert message template,
// Slack channel, WordPress address, Allmon3 address) stored in the database, the
// DTMF command list, and the Excel backup. Secrets such as API keys are NOT here:
// they live in /etc/priority-watch/env, and this page only shows whether each is set.
export default function Settings() {
  const { toast } = useToast();
  const [settings, setSettings] = useState(null);
  const [status, setStatus] = useState(null);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    const saved = await getSettings();
    setSettings(saved ? { ...emptySettings, ...saved } : { ...emptySettings });
    configStatus().then(setStatus).catch(() => setStatus({}));
  };
  useEffect(() => { load(); }, []);

  const save = async () => {
    setSaving(true);
    try {
      if (settings.id) await updateSettings(settings.id, settings);
      else await createSettings(settings);
      toast({ title: "Settings saved" });
      load();
    } catch (e) {
      toast({ title: "Save failed", description: e.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  if (!settings) return <div className="text-gray-500 text-sm">Loading…</div>;

  const s = status || {};
  const webhookUrl = `${window.location.origin}/api/pw/webhook/inbound`;
  const curlExample = `curl -X POST ${webhookUrl} \\\n  -H "Content-Type: application/json" \\\n  -H "X-Webhook-Secret: YOUR_SECRET" \\\n  -d '{"node_number":"402","alert_type":"Test","nature":"Test alert"}'`;

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="text-2xl font-semibold text-gray-100">System Settings</h1>
        <p className="text-sm text-gray-400 mt-1">Configure integrations and notification channels. Passwords and keys are kept in the server's .env file, not here.</p>
      </div>

      {/* Inbound webhook */}
      <Card className="bg-gray-800 border-gray-700">
        <CardHeader className="pb-3"><CardTitle className="text-sm text-gray-200 flex items-center gap-2"><Webhook className="w-4 h-4 text-sky-400" /> Inbound Webhook</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <p className="text-xs text-gray-400">Point your repeater system's DTMF-triggered webhook at this URL with a POST. Send the shared secret in the <span className="font-mono text-sky-400">X-Webhook-Secret</span> header, or as a <span className="font-mono text-sky-400">secret</span> field in the JSON body. Secrets in the URL are refused.</p>
          <div className="text-xs text-gray-400 bg-gray-900/50 rounded-md p-3 space-y-1.5">
            <div className="text-gray-300 font-medium mb-1">Payload fields</div>
            <div><span className="text-sky-400 font-mono">node_number</span> — linked-network node identifier; used to look up the repeater when no ID/name is sent</div>
            <div><span className="text-sky-400 font-mono">repeater_id</span> — record ID of the target repeater (most precise match)</div>
            <div><span className="text-sky-400 font-mono">repeater_name</span> — repeater name; used to match when no ID is sent</div>
            <div><span className="text-sky-400 font-mono">source_dtmf</span> — DTMF code that triggered the alert, logged on the incident</div>
            <div><span className="text-sky-400 font-mono">alert_type</span> — label for the alert (defaults to "Priority Traffic")</div>
            <div><span className="text-sky-400 font-mono">caller_info</span> — caller name or callsign and contact details</div>
            <div><span className="text-sky-400 font-mono">location_info</span> — reported location of the emergency</div>
            <div><span className="text-sky-400 font-mono">nature</span> — description of the emergency</div>
          </div>
          <div className="flex flex-col sm:flex-row sm:items-center gap-2">
            <Input readOnly className="bg-gray-900 border-gray-700 font-mono text-xs" value={webhookUrl} />
            <Button variant="outline" onClick={() => { navigator.clipboard.writeText(webhookUrl); toast({ title: "Copied" }); }} className="bg-gray-900 border-gray-700 text-gray-200 shrink-0">Copy</Button>
          </div>
          <pre className="text-xs text-gray-400 bg-gray-900/50 rounded-md p-3 font-mono overflow-x-auto">{curlExample}</pre>
          <SecretStatus ok={!!s.webhook_secret} name="INBOUND_WEBHOOK_SECRET" />
        </CardContent>
      </Card>

      {/* Textbelt SMS */}
      <Card className="bg-gray-800 border-gray-700">
        <CardHeader className="pb-3"><CardTitle className="text-sm text-gray-200 flex items-center gap-2"><MessageSquare className="w-4 h-4 text-emerald-400" /> Textbelt SMS Notifications</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          <p className="text-xs text-gray-400">SMS alerts to volunteers are sent with your Textbelt key. Use "textbelt" as the key for a free test (1/day, fake delivery).</p>
          <SecretStatus ok={!!s.textbelt} name="TEXTBELT_KEY" />
          <SecretStatus ok={!!s.smtp} name="SMTP_HOST (email alerts and password resets)" />
        </CardContent>
      </Card>

      {/* WordPress */}
      <Card className="bg-gray-800 border-gray-700">
        <CardHeader className="pb-3"><CardTitle className="text-sm text-gray-200 flex items-center gap-2"><FileText className="w-4 h-4 text-amber-400" /> WordPress Publishing</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-1"><Label className="text-gray-300">Site URL</Label><Input className="bg-gray-900 border-gray-700" value={settings.wordpress_url || ""} onChange={(e) => setSettings({ ...settings, wordpress_url: e.target.value })} placeholder="https://yourblog.wordpress.com" /></div>
          <div className="space-y-1"><Label className="text-gray-300">Username</Label><Input className="bg-gray-900 border-gray-700" value={settings.wordpress_username || ""} onChange={(e) => setSettings({ ...settings, wordpress_username: e.target.value })} /></div>
          <SecretStatus ok={!!s.wordpress_password} name="WORDPRESS_APP_PASSWORD" />
          <SecretStatus ok={!!s.anthropic} name="ANTHROPIC_API_KEY (AI incident summaries)" />
          <p className="text-xs text-gray-500">Resolved incidents are auto-posted here when an AI summary was written. Without an AI key the summary stays internal and nothing is published. Generate an application password under WordPress → Users → Profile.</p>
        </CardContent>
      </Card>

      {/* Slack */}
      <Card className="bg-gray-800 border-gray-700">
        <CardHeader className="pb-3"><CardTitle className="text-sm text-gray-200 flex items-center gap-2"><Slack className="w-4 h-4 text-purple-400" /> Slack Alerts</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          <p className="text-xs text-gray-400">Inbound incident alerts are posted to this channel by your Slack bot. Use a channel name (e.g. #alerts) or channel ID. For private channels, invite the bot first.</p>
          <div className="space-y-1"><Label className="text-gray-300">Slack Channel</Label><Input className="bg-gray-900 border-gray-700 font-mono" value={settings.slack_channel || ""} onChange={(e) => setSettings({ ...settings, slack_channel: e.target.value })} placeholder="#alerts" /></div>
          <SecretStatus ok={!!s.slack} name="SLACK_BOT_TOKEN" />
        </CardContent>
      </Card>

      {/* AllStarLink / Allmon3 */}
      <Card className="bg-gray-800 border-gray-700">
        <CardHeader className="pb-3"><CardTitle className="text-sm text-gray-200 flex items-center gap-2"><RadioTower className="w-4 h-4 text-sky-400" /> AllStarLink / Allmon3</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <p className="text-xs text-gray-400">Connection details for sending DTMF commands to repeater nodes. The password is kept as <span className="font-mono text-sky-400">ALLMON_PASS</span> in the server's .env file and is never shown or edited here.</p>
          <div className="space-y-1"><Label className="text-gray-300">Allmon3 Base URL</Label><Input className="bg-gray-900 border-gray-700 font-mono" value={settings.allmon3_base_url || ""} onChange={(e) => setSettings({ ...settings, allmon3_base_url: e.target.value })} placeholder="https://YOUR_NODE_ADDRESS/allmon3" /></div>
          <div className="space-y-1"><Label className="text-gray-300">Allmon3 Username</Label><Input className="bg-gray-900 border-gray-700" value={settings.allmon3_username || ""} onChange={(e) => setSettings({ ...settings, allmon3_username: e.target.value })} /></div>
          <div className="space-y-1"><Label className="text-gray-300">Emergency Hub Node Number</Label><Input className="bg-gray-900 border-gray-700 font-mono" value={settings.emergency_hub_node || ""} onChange={(e) => setSettings({ ...settings, emergency_hub_node: e.target.value })} placeholder="e.g. 12345" /></div>
          <div className="space-y-1"><Label className="text-gray-300">Incident Closeout Macro</Label><Input className="bg-gray-900 border-gray-700 font-mono" value={settings.incident_closeout_macro || ""} onChange={(e) => setSettings({ ...settings, incident_closeout_macro: e.target.value.toUpperCase() })} placeholder="e.g. *81" /><p className="text-xs text-gray-500">DTMF string sent to close out an incident. Use 1-24 characters: 0-9, A-D, *, #.</p></div>
          <SecretStatus ok={!!s.allmon3_password} name="ALLMON_PASS" />
          <div className="pt-2 border-t border-gray-700/60">
            <div className="text-xs text-gray-400 uppercase tracking-wider mb-2">DTMF Commands</div>
            <DtmfCommandManager />
          </div>
        </CardContent>
      </Card>

      {/* Notification template */}
      <Card className="bg-gray-800 border-gray-700">
        <CardHeader className="pb-3"><CardTitle className="text-sm text-gray-200">Notification Message Template</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          <Textarea className="bg-gray-900 border-gray-700 font-mono text-sm" rows={4} value={settings.notification_template || ""} onChange={(e) => setSettings({ ...settings, notification_template: e.target.value })} />
          <p className="text-xs text-gray-500">Placeholders: {"{repeater}"}, {"{alert_type}"}, {"{nature}"}</p>
        </CardContent>
      </Card>

      <DataBackup />

      <Button onClick={save} disabled={saving} className="bg-emerald-700 hover:bg-emerald-800 text-white">
        <Save className="w-4 h-4 mr-2" /> {saving ? "Saving…" : "Save Settings"}
      </Button>
    </div>
  );
}
