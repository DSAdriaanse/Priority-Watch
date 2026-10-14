import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';

// Operator-triggered repeater link/delink via outgoing webhook.
export default async function(req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me().catch(() => null);
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const { repeater_id, action, incident_id } = body || {};
    if (!repeater_id || !action) {
      return Response.json({ error: "repeater_id and action are required" }, { status: 400 });
    }
    if (action !== "link" && action !== "delink") {
      return Response.json({ error: "action must be 'link' or 'delink'" }, { status: 400 });
    }

    const repeater = await base44.entities.Repeater.get(repeater_id).catch(() => null);
    if (!repeater) return Response.json({ error: "Repeater not found" }, { status: 404 });

    const webhookUrl = action === "link" ? repeater.link_webhook_url : repeater.delink_webhook_url;
    if (!webhookUrl) {
      return Response.json({ error: `No ${action} webhook URL configured for this repeater` }, { status: 400 });
    }

    // Fire the outgoing webhook.
    let webhookOk = false;
    let webhookStatus = 0;
    try {
      const res = await fetch(webhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, repeater: repeater.name, callsign: repeater.callsign, operator: user.full_name }),
      });
      webhookOk = res.ok;
      webhookStatus = res.status;
    } catch (e) {
      webhookOk = false;
    }

    // Update repeater status.
    const newStatus = action === "link" ? "linked" : "online";
    await base44.entities.Repeater.update(repeater_id, { status: newStatus });

    // Log the action against the incident if provided.
    if (incident_id) {
      await base44.entities.IncidentUpdate.create({
        incident_id,
        operator_name: user.full_name || "Operator",
        message: `${action === "link" ? "Linked" : "Delinked"} repeater ${repeater.name}. Webhook ${webhookOk ? "succeeded" : "failed"}.`,
        action_type: action === "link" ? "link_repeater" : "delink_repeater",
      });
    }

    return Response.json({
      status: "ok",
      repeater: repeater.name,
      action,
      webhook_ok: webhookOk,
      webhook_status: webhookStatus,
    });
  } catch (error: any) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}