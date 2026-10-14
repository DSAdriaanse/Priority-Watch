// Shared notification helpers used by inbound-webhook and notify-volunteers functions.

// Sends an SMS via Textbelt (https://textbelt.com). A Textbelt key is required;
// "textbelt" is a free test key (1 message/day, fake delivery).
export async function sendSms(
  textbeltKey: string,
  toNumber: string,
  body: string
): Promise<{ ok: boolean; status: number; error?: string }> {
  if (!textbeltKey || !textbeltKey.trim()) {
    return { ok: false, status: 0, error: "Textbelt API key is missing. Add it in System Settings." };
  }
  try {
    const res = await fetch("https://textbelt.com/text", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone: toNumber, message: body, key: textbeltKey.trim() }),
    });
    const data: any = await res.json().catch(() => ({}));
    return { ok: data.success === true, status: res.status, error: data.success === true ? undefined : (data.error || `Textbelt rejected the request (HTTP ${res.status}).`) };
  } catch (e) {
    return { ok: false, status: 0, error: "Could not reach Textbelt. Try again." };
  }
}

export function buildAlertMessage(
  template: string | undefined,
  repeaterName: string,
  alertType: string,
  nature: string
): string {
  const tmpl = template && template.trim()
    ? template
    : "GMRS PRIORITY WATCH ALERT\nRepeater: {repeater}\nType: {alert_type}\nDetails: {nature}\nCheck the Priority Watch dashboard immediately.";
  return tmpl
    .replace(/\{repeater\}/g, repeaterName || "Unknown")
    .replace(/\{alert_type\}/g, alertType || "Priority Traffic")
    .replace(/\{nature\}/g, nature || "Not specified");
}