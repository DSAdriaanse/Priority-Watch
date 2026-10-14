// Slack posting through a bot token (SLACK_BOT_TOKEN).
const util = require(`${__hooks}/lib/util.js`);

const APP_NAME = "GMRS Priority Watch";

function postMessage(channel, text) {
  if (!channel || !channel.trim()) return { ok: false, error: "no_slack_channel" };
  const token = util.env("SLACK_BOT_TOKEN").trim();
  if (!token) return { ok: false, error: "no_slack_token" };
  try {
    const res = $http.send({
      url: util.env("SLACK_API_URL", "https://slack.com/api/chat.postMessage"),
      method: "POST",
      headers: { "content-type": "application/json", authorization: "Bearer " + token },
      body: JSON.stringify({ channel: channel.trim(), text: text, username: APP_NAME }),
      timeout: 15,
    });
    const data = res.json || {};
    return { ok: data.ok === true, error: data.ok ? undefined : (data.error || "slack_error") };
  } catch (err) {
    return { ok: false, error: "Slack could not be reached." };
  }
}

module.exports = { postMessage };
