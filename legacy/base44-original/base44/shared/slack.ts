// Posts messages to a Slack channel via the shared Slack Bot connector.
import { buildAlertMessage } from './notify.ts';

const APP_NAME = "GMRS Priority Watch";
const APP_ICON_URL = "https://media.base44.com/images/public/6aa019a76bec366de9fe62ee/263dca544_logo.png";

// Post an arbitrary text message to Slack.
export async function postSlackMessage(
  base44: any,
  channel: string,
  text: string
): Promise<{ ok: boolean; error?: string }> {
  if (!channel || !channel.trim()) {
    return { ok: false, error: "no_slack_channel" };
  }
  const { accessToken } = await base44.asServiceRole.connectors.getConnection("slackbot");

  const res = await fetch("https://slack.com/api/chat.postMessage", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      channel: channel.trim(),
      text,
      username: APP_NAME,
      icon_url: APP_ICON_URL,
    }),
  });

  const data: any = await res.json();
  return { ok: data.ok === true, error: data.ok ? undefined : data.error };
}

// Post an incident alert to Slack, mirroring the SMS notification template.
export async function postSlackAlert(
  base44: any,
  channel: string,
  template: string | undefined,
  repeaterName: string,
  alertType: string,
  nature: string
): Promise<{ ok: boolean; error?: string }> {
  const text = buildAlertMessage(template, repeaterName, alertType, nature);
  return postSlackMessage(base44, channel, text);
}