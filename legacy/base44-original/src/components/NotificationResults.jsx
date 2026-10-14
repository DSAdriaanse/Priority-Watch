import React from "react";

const slackErrors = {
  no_slack_channel: "Set a Slack channel in System Settings.",
  not_in_channel: "Invite the connected bot to the Slack channel.",
  channel_not_found: "Check the channel ID in System Settings and invite the connected bot to that channel, especially if it is private.",
  invalid_auth: "Reconnect the Slack bot account.",
  token_revoked: "Reconnect the Slack bot account.",
  missing_scope: "The Slack connection is missing permission to post.",
};

export default function NotificationResults({ results }) {
  if (!results) return null;
  return (
    <div className="space-y-2 rounded-md border border-border bg-background p-3 text-sm" role="status" aria-live="polite">
      <div className="font-medium text-foreground">Notification results</div>
      <p className="text-xs text-muted-foreground">Accepted means the service accepted the request, not confirmed delivery.</p>
      {results.map((result, index) => (
        <div key={index} className="space-y-1">
          <div className="text-foreground">{result.channel === "sms" ? "SMS" : result.channel === "slack" ? "Slack" : "Email"}{result.volunteer ? ` · ${result.volunteer}` : ""}: {result.ok ? "Accepted" : "Failed"}</div>
          {!result.ok && <p className="text-muted-foreground break-words">{slackErrors[result.error] || result.error || "No reason was provided by the service."}</p>}
        </div>
      ))}
    </div>
  );
}