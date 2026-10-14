import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';
import { sendSms, buildAlertMessage } from '../../shared/notify.ts';
import { postSlackAlert } from '../../shared/slack.ts';

// Inbound webhook receiver: the repeater system (DTMF trigger) POSTs alerts here.
// No user auth — validated by a shared secret stored in Settings.
export default async function(req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);
    // Support both POST (JSON body, from repeater systems) and GET (query params,
    // for quick browser-based testing).
    let payload: any = {};
    if (req.method === "GET") {
      const url = new URL(req.url);
      payload = Object.fromEntries(url.searchParams.entries());
    } else {
      payload = await req.json().catch(() => ({}));
    }
    const {
      repeater_id,
      repeater_name,
      node_number,
      source_dtmf,
      alert_type,
      caller_info,
      location_info,
      nature,
      secret,
    } = payload || {};

    // Load settings to validate the shared secret.
    const settingsList = await base44.asServiceRole.entities.Settings.list();
    const settings = settingsList[0] || {};
    if (settings.inbound_webhook_secret && settings.inbound_webhook_secret.trim() !== "") {
      if (secret !== settings.inbound_webhook_secret) {
        return Response.json({ error: "Invalid webhook secret" }, { status: 401 });
      }
    }

    // Resolve the repeater.
    let repeater = null;
    if (repeater_id) {
      repeater = await base44.asServiceRole.entities.Repeater.get(repeater_id).catch(() => null);
    }
    if (!repeater && repeater_name) {
      const found = await base44.asServiceRole.entities.Repeater.filter({ name: repeater_name });
      repeater = found[0] || null;
    }
    if (!repeater && node_number) {
      const found = await base44.asServiceRole.entities.Repeater.filter({ node_number: String(node_number) });
      repeater = found[0] || null;
    }

    const finalRepeaterName = repeater?.name || repeater_name || "Unknown Repeater";

    // Create the incident.
    const incident = await base44.asServiceRole.entities.Incident.create({
      repeater_id: repeater ? [repeater.id] : (repeater_id ? [repeater_id] : []),
      repeater_name: [finalRepeaterName],
      alert_type: alert_type || "Priority Traffic",
      incident_category: "",
      incident_subtype: "",
      status: "active",
      priority_level: "high",
      source_dtmf: source_dtmf || "",
      caller_info: caller_info || "",
      location_info: location_info || "",
      nature: nature || "",
    });

    await base44.asServiceRole.entities.IncidentUpdate.create({
      incident_id: incident.id,
      operator_name: "System",
      message: `Inbound alert received from ${finalRepeaterName}${node_number ? ` (Node ${node_number})` : ""}${source_dtmf ? ` (DTMF: ${source_dtmf})` : ""}.`,
      action_type: "alert",
    });

    // Post alert to Slack if a channel is configured (same text as SMS).
    await postSlackAlert(
      base44,
      settings.slack_channel,
      settings.notification_template,
      finalRepeaterName,
      alert_type || "Priority Traffic",
      nature || ""
    ).catch(() => {});

    // Notify active volunteers.
    const volunteers = await base44.asServiceRole.entities.Volunteer.filter({ active: true });
    const message = buildAlertMessage(
      settings.notification_template,
      finalRepeaterName,
      alert_type || "Priority Traffic",
      nature || ""
    );

    const smsResults: any[] = [];
    for (const v of volunteers) {
      if (v.notify_sms && v.phone) {
        const r = await sendSms(
          settings.textbelt_key,
          v.phone,
          message
        );
        smsResults.push({ volunteer: v.name, ok: r.ok, status: r.status });
      }
      if (v.notify_email && v.email) {
        await base44.asServiceRole.integrations.Core.SendEmail({
          to: v.email,
          subject: `GMRS Priority Watch Alert — ${finalRepeaterName}`,
          text: message,
        }).catch(() => {});
      }
    }

    return Response.json({
      status: "ok",
      incident_id: incident.id,
      repeater: finalRepeaterName,
      notified: smsResults.length,
      sms_results: smsResults,
    });
  } catch (error: any) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}