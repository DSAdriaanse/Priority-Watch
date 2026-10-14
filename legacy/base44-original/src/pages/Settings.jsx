import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Save, Webhook, MessageSquare, FileText, Slack, RadioTower } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";
import DataBackup from "@/components/DataBackup";
import DtmfCommandManager from "@/components/DtmfCommandManager";

const emptySettings = {
  wordpress_url: "", wordpress_username: "", wordpress_app_password: "",
  textbelt_key: "",
  inbound_webhook_secret: "", notification_template: "GMRS PRIORITY WATCH ALERT\nRepeater: {repeater}\nType: {alert_type}\nDetails: {nature}\nCheck the Priority Watch dashboard immediately.",
  slack_channel: "",
  allmon3_base_url: "",
  allmon3_username: "",
  emergency_hub_node: "",
  incident_closeout_macro: "",
};

export default function Settings() {
  const { toast } = useToast();
  const [settings, setSettings] = useState(null);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    const list = await base44.entities.Settings.list();
    setSettings(list[0] ? { ...list[0] } : { ...emptySettings });
  };
  useEffect(() => { load(); }, []);

  const save = async () => {
    setSaving(true);
    try {
      if (settings.id) await base44.entities.Settings.update(settings.id, settings);
      else await base44.entities.Settings.create(settings);
      toast({ title: "Settings saved" });
      load();
    } finally {
      setSaving(false);
    }
  };

  if (!settings) return <div className="text-gray-500 text-sm">Loading…</div>;

  const webhookUrl = "https://priority.apps.swcrs.org/api/functions/handleInboundWebhook";

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="text-2xl font-semibold text-gray-100">System Settings</h1>
        <p className="text-sm text-gray-400 mt-1">Configure integrations and notification channels</p>
      </div>

      {/* Inbound webhook */}
      <Card className="bg-gray-800 border-gray-700">
        <CardHeader className="pb-3"><CardTitle className="text-sm text-gray-200 flex items-center gap-2"><Webhook className="w-4 h-4 text-sky-400" /> Inbound Webhook</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <p className="text-xs text-gray-400">Point your repeater system's DTMF-triggered webhook to this URL. Include the shared secret in the payload.</p>
          <div className="text-xs text-gray-400 bg-gray-900/50 rounded-md p-3 space-y-1.5">
            <div className="text-gray-300 font-medium mb-1">Payload variables</div>
            <div><span className="text-sky-400 font-mono">secret</span> — shared secret; must match the value above (required)</div>
            <div><span className="text-sky-400 font-mono">node_number</span> — linked-network node identifier; used to look up the repeater when no ID/name is sent</div>
            <div><span className="text-sky-400 font-mono">repeater_id</span> — Base44 record ID of the target repeater (most precise match)</div>
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
          <div className="space-y-1">
            <Label className="text-gray-300">Inbound Webhook Secret</Label>
            <Input className="bg-gray-900 border-gray-700 font-mono" value={settings.inbound_webhook_secret} onChange={(e) => setSettings({ ...settings, inbound_webhook_secret: e.target.value })} placeholder="Shared secret sent in payload as 'secret'" />
          </div>
          {settings.inbound_webhook_secret && (
            <div className="space-y-1">
              <Label className="text-gray-300">Test URL (opens in browser)</Label>
              <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                <Input readOnly className="bg-gray-900 border-gray-700 font-mono text-xs" value={`${webhookUrl}?secret=${encodeURIComponent(settings.inbound_webhook_secret)}&node_number=&alert_type=Test`} />
                <div className="flex gap-2 shrink-0">
                  <Button variant="outline" onClick={() => { navigator.clipboard.writeText(`${webhookUrl}?secret=${encodeURIComponent(settings.inbound_webhook_secret)}&node_number=&alert_type=Test`); toast({ title: "Copied" }); }} className="bg-gray-900 border-gray-700 text-gray-200">Copy</Button>
                  <a href={`${webhookUrl}?secret=${encodeURIComponent(settings.inbound_webhook_secret)}&node_number=&alert_type=Test`} target="_blank" rel="noreferrer">
                    <Button variant="outline" className="bg-gray-900 border-gray-700 text-gray-200 w-full">Open</Button>
                  </a>
                </div>
              </div>
              <p className="text-xs text-gray-500">This URL includes your secret so the webhook accepts it. Save settings first if you just changed the secret.</p>
            </div>
          )}
          <div className="text-xs text-gray-500 bg-gray-900/50 rounded-md p-3 font-mono">
            POST {webhookUrl}
          </div>
        </CardContent>
      </Card>

      {/* Textbelt SMS */}
      <Card className="bg-gray-800 border-gray-700">
        <CardHeader className="pb-3"><CardTitle className="text-sm text-gray-200 flex items-center gap-2"><MessageSquare className="w-4 h-4 text-emerald-400" /> Textbelt SMS Notifications</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          <p className="text-xs text-gray-400">Uses your Textbelt key to send SMS alerts to volunteers. Use "textbelt" as the key for a free test (1/day, fake delivery).</p>
          <div className="space-y-1"><Label className="text-gray-300">Textbelt Key</Label><Input type="password" className="bg-gray-900 border-gray-700 font-mono" value={settings.textbelt_key || ""} onChange={(e) => setSettings({ ...settings, textbelt_key: e.target.value })} placeholder="textbelt" /></div>
        </CardContent>
      </Card>

      {/* WordPress */}
      <Card className="bg-gray-800 border-gray-700">
        <CardHeader className="pb-3"><CardTitle className="text-sm text-gray-200 flex items-center gap-2"><FileText className="w-4 h-4 text-amber-400" /> WordPress Publishing</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-1"><Label className="text-gray-300">Site URL</Label><Input className="bg-gray-900 border-gray-700" value={settings.wordpress_url} onChange={(e) => setSettings({ ...settings, wordpress_url: e.target.value })} placeholder="https://yourblog.wordpress.com" /></div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1"><Label className="text-gray-300">Username</Label><Input className="bg-gray-900 border-gray-700" value={settings.wordpress_username} onChange={(e) => setSettings({ ...settings, wordpress_username: e.target.value })} /></div>
            <div className="space-y-1"><Label className="text-gray-300">Application Password</Label><Input type="password" className="bg-gray-900 border-gray-700 font-mono" value={settings.wordpress_app_password} onChange={(e) => setSettings({ ...settings, wordpress_app_password: e.target.value })} /></div>
          </div>
          <p className="text-xs text-gray-500">Resolved incidents are auto-posted here. Generate an application password under WordPress → Users → Profile.</p>
        </CardContent>
      </Card>

      {/* Slack */}
      <Card className="bg-gray-800 border-gray-700">
        <CardHeader className="pb-3"><CardTitle className="text-sm text-gray-200 flex items-center gap-2"><Slack className="w-4 h-4 text-purple-400" /> Slack Alerts</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          <p className="text-xs text-gray-400">Inbound incident alerts are posted to this channel through the connected Slack bot. Use a channel name (e.g. #alerts) or channel ID. For private channels, invite the bot first.</p>
          <div className="space-y-1"><Label className="text-gray-300">Slack Channel</Label><Input className="bg-gray-900 border-gray-700 font-mono" value={settings.slack_channel || ""} onChange={(e) => setSettings({ ...settings, slack_channel: e.target.value })} placeholder="#alerts" /></div>
        </CardContent>
      </Card>

      {/* AllStarLink / Allmon3 */}
      <Card className="bg-gray-800 border-gray-700">
        <CardHeader className="pb-3"><CardTitle className="text-sm text-gray-200 flex items-center gap-2"><RadioTower className="w-4 h-4 text-sky-400" /> AllStarLink / Allmon3</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <p className="text-xs text-gray-400">Connection details for sending DTMF commands to repeater nodes. The password is stored securely as the <span className="font-mono text-sky-400">ALLMON_PASS</span> environment secret and is never shown or edited here — set it under the Secrets dashboard.</p>
          <div className="space-y-1"><Label className="text-gray-300">Allmon3 Base URL</Label><Input className="bg-gray-900 border-gray-700 font-mono" value={settings.allmon3_base_url || ""} onChange={(e) => setSettings({ ...settings, allmon3_base_url: e.target.value })} placeholder="https://YOUR_NODE_ADDRESS/allmon3" /></div>
          <div className="space-y-1"><Label className="text-gray-300">Allmon3 Username</Label><Input className="bg-gray-900 border-gray-700" value={settings.allmon3_username || ""} onChange={(e) => setSettings({ ...settings, allmon3_username: e.target.value })} /></div>
          <div className="space-y-1"><Label className="text-gray-300">Emergency Hub Node Number</Label><Input className="bg-gray-900 border-gray-700 font-mono" value={settings.emergency_hub_node || ""} onChange={(e) => setSettings({ ...settings, emergency_hub_node: e.target.value })} placeholder="e.g. 12345" /></div>
          <div className="space-y-1"><Label className="text-gray-300">Incident Closeout Macro</Label><Input className="bg-gray-900 border-gray-700 font-mono" value={settings.incident_closeout_macro || ""} onChange={(e) => setSettings({ ...settings, incident_closeout_macro: e.target.value.toUpperCase() })} placeholder="e.g. *81" /><p className="text-xs text-gray-500">DTMF string sent to close out an incident. Use 1-24 characters: 0-9, A-D, *, #.</p></div>
          <div className="text-xs text-gray-500 bg-gray-900/50 rounded-md p-3 border border-gray-700/50">Password: managed via the <span className="font-mono text-sky-400">ALLMON_PASS</span> secret. Not editable in this UI.</div>
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
          <Textarea className="bg-gray-900 border-gray-700 font-mono text-sm" rows={4} value={settings.notification_template} onChange={(e) => setSettings({ ...settings, notification_template: e.target.value })} />
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