import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';

// Resolve an incident: generate an AI summary from logged updates and post it to WordPress.
export default async function(req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me().catch(() => null);
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const { incident_id, false_alarm } = body || {};
    if (!incident_id) return Response.json({ error: "incident_id is required" }, { status: 400 });

    const incident = await base44.entities.Incident.get(incident_id).catch(() => null);
    if (!incident) return Response.json({ error: "Incident not found" }, { status: 404 });

    // False alarm: close and log without AI summary or WordPress post.
    if (false_alarm) {
      await base44.entities.Incident.update(incident_id, {
        status: "resolved",
        ai_summary: "Closed as false alarm — no action required.",
        wordpress_post_url: "",
        resolved_date: new Date().toISOString(),
      });
      await base44.entities.IncidentUpdate.create({
        incident_id,
        operator_name: user.full_name || "Operator",
        message: "Incident closed as false alarm. Not posted to WordPress.",
        action_type: "resolution",
      });
      return Response.json({ status: "ok", incident_id, false_alarm: true });
    }

    const updates = await base44.entities.IncidentUpdate.filter({ incident_id }, "-created_date", 200);

    // Build a timeline for the LLM.
    const timeline = updates
      .map((u: any) => `[${u.action_type}] ${u.operator_name}: ${u.message}`)
      .join("\n");

    const prompt = `You are the summarizer for a GMRS Priority Watch emergency coordination system.
Generate a clear, professional incident report suitable for public posting on a ham-radio community site.

Incident details:
- Repeater: ${(Array.isArray(incident.repeater_name) ? incident.repeater_name.join(", ") : incident.repeater_name) || "unknown"}
- Alert type: ${incident.alert_type}
- Category: ${incident.incident_category || "unspecified"}
- Subtype: ${incident.incident_subtype || "unspecified"}
- Caller info: ${incident.caller_info || "unknown"}
- Location: ${incident.location_info || "unknown"}
- Nature: ${incident.nature || "unspecified"}
- Operator summary: ${incident.summary || "none"}

Logged event timeline (newest first):
${timeline || "No events logged."}

Write the report in two parts:
1. A short title (one line).
2. A concise narrative summary (3-6 paragraphs) covering what happened, actions taken, and resolution.
Do not include personal phone numbers. Use plain text.`;

    const llmRes: any = await base44.asServiceRole.integrations.Core.InvokeLLM({
      prompt,
    });
    const aiSummary: string = typeof llmRes === "string" ? llmRes : llmRes?.response || llmRes?.summary || JSON.stringify(llmRes);

    // Split title from body (first line = title).
    const lines = aiSummary.split("\n").filter((l: string) => l.trim() !== "");
    const title = lines[0]?.replace(/^#+\s*/, "").slice(0, 120) || `Incident Report — ${Array.isArray(incident.repeater_name) ? incident.repeater_name.join(", ") : incident.repeater_name}`;
    const content = lines.slice(1).join("\n\n") || aiSummary;

    // Post to WordPress.
    const settingsList = await base44.asServiceRole.entities.Settings.list();
    const settings = settingsList[0] || {};
    let wordpressPostUrl = "";

    if (settings.wordpress_url && settings.wordpress_username && settings.wordpress_app_password) {
      const endpoint = settings.wordpress_url.replace(/\/$/, "") + "/wp-json/wp/v2/posts";
      const auth = btoa(`${settings.wordpress_username}:${settings.wordpress_app_password}`);
      try {
        const res = await fetch(endpoint, {
          method: "POST",
          headers: {
            Authorization: `Basic ${auth}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            title,
            content,
            status: "publish",
          }),
        });
        if (res.ok) {
          const post = await res.json();
          wordpressPostUrl = post.link || "";
        }
      } catch (e) {
        // WordPress post failed — still resolve the incident.
      }
    }

    // Mark resolved.
    const updated = await base44.entities.Incident.update(incident_id, {
      status: "resolved",
      ai_summary: aiSummary,
      wordpress_post_url: wordpressPostUrl,
      resolved_date: new Date().toISOString(),
    });

    await base44.entities.IncidentUpdate.create({
      incident_id,
      operator_name: user.full_name || "Operator",
      message: `Incident marked resolved. AI summary generated.${wordpressPostUrl ? ` Posted to WordPress: ${wordpressPostUrl}` : " WordPress not posted (check settings)."}`,
      action_type: "resolution",
    });

    return Response.json({
      status: "ok",
      incident_id,
      ai_summary: aiSummary,
      wordpress_post_url: wordpressPostUrl,
    });
  } catch (error: any) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}