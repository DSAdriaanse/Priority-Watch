import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';
import { sendSms, buildAlertMessage } from '../../shared/notify.ts';
import { postSlackMessage } from '../../shared/slack.ts';

// Operator-triggered manual notification to the volunteer team.
export default async function(req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me().catch(() => null);
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const { message, incident_id, repeater_name, alert_type, nature } = body || {};
    if (!message && !nature) {
      return Response.json({ error: "message or nature is required" }, { status: 400 });
    }

    const settingsList = await base44.asServiceRole.entities.Settings.list();
    const settings = settingsList[0] || {};

    const text = message
      ? message
      : buildAlertMessage(settings.notification_template, repeater_name || "", alert_type || "Operator Notice", nature || "");

    // Keep each delivery outcome so one failure does not hide or block the others.
    const results: any[] = [];
    const slack = await postSlackMessage(base44, settings.slack_channel, text)
      .catch(() => ({ ok: false, error: "Slack connection failed. Check the connected Slack account." }));
    results.push({ channel: "slack", ok: slack.ok, error: slack.error });

    const volunteers = await base44.asServiceRole.entities.Volunteer.filter({ active: true });
    for (const v of volunteers) {
      if (v.notify_sms && v.phone) {
        const r = await sendSms(
          settings.textbelt_key,
          v.phone,
          text
        );
        results.push({ volunteer: v.name, channel: "sms", ok: r.ok, status: r.status, error: r.error });
      }
      if (v.notify_email && v.email) {
        const email = await base44.asServiceRole.integrations.Core.SendEmail({
          to: v.email,
          subject: `GMRS Priority Watch — ${repeater_name || "Notice"}`,
          text,
        }).then(() => ({ ok: true, error: undefined }))
          .catch(() => ({ ok: false, error: "Email was not accepted for sending." }));
        results.push({ volunteer: v.name, channel: "email", ...email });
      }
    }

    if (!results.some((r) => r.channel === "sms")) {
      results.push({ channel: "sms", ok: false, error: "No active volunteers have SMS enabled and a phone number." });
    }
    const notified = results.filter((r) => r.ok).length;
    const failed = results.filter((r) => !r.ok).length;

    if (incident_id) {
      await base44.entities.IncidentUpdate.create({
        incident_id,
        operator_name: user.full_name || "Operator",
        message: `Team notification attempted: ${notified} accepted, ${failed} failed. ${results.filter((r) => !r.ok).map((r) => `${r.channel}${r.volunteer ? ` (${r.volunteer})` : ""}: ${r.error || "Failed"}`).join("; ")}\n${text}`,
        action_type: "note",
      });
    }

    return Response.json({ status: failed ? (notified ? "partial" : "failed") : "ok", notified, failed, results });
  } catch (error: any) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}