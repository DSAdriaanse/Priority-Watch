/// <reference path="../pb_data/types.d.ts" />
//
// Send a configured DTMF command to a repeater's AllStarLink node via Allmon3.
//   POST /api/pw/dtmf/run   { repeaterId, commandId }
// The client never sends a raw DTMF string or node number.
//
// Only a repeater id and a command id come from the browser. The server looks up
// the node number and the DTMF digits itself, so a signed-in user cannot make it
// send arbitrary tones. Digits are checked against 0-9, A-D, * and # only.
// Talking to Allmon3 takes two web requests: log in (get a cookie), then send
// the command "rpt fun <node> <digits>". Every attempt is written to dtmf_logs.

routerAdd("POST", "/api/pw/dtmf/run", (e) => {
  const u = require(`${__hooks}/lib/util.js`);

  const user = u.requireRole(e, ["admin", "operator"]);
  const body = e.requestInfo().body || {};
  const repeaterId = String(body.repeaterId || "");
  const commandId = String(body.commandId || "");
  if (!repeaterId || !commandId) throw new BadRequestError("repeaterId and commandId are required.");

  let repeater;
  try { repeater = $app.findRecordById("repeaters", repeaterId); } catch (_) { throw new NotFoundError("Repeater not found."); }
  const node = repeater.getString("node_number").trim();
  if (!/^[0-9]+$/.test(node)) throw new BadRequestError("Repeater has no valid node number.");

  let command;
  try { command = $app.findRecordById("dtmf_commands", commandId); } catch (_) { throw new NotFoundError("Command not found."); }
  if (!command.getBool("enabled")) throw new BadRequestError("Command is disabled.");
  const dtmf = command.getString("dtmf").trim();
  if (!/^[0-9A-D*#]{1,24}$/.test(dtmf)) throw new BadRequestError("Invalid DTMF sequence.");

  const cfg = u.settings();
  const base = u.setting(cfg, "allmon3_base_url").trim().replace(/\/+$/, "");
  const allmonUser = u.setting(cfg, "allmon3_username").trim();
  const pass = u.env("ALLMON_PASS");
  if (!base || !allmonUser || !pass) {
    throw new ApiError(500, "Allmon3 is not configured (base URL, username, or ALLMON_PASS missing).", {});
  }

  // Allmon3 expects classic form-encoded bodies, not JSON.
  const form = (o) => Object.keys(o).map((k) => encodeURIComponent(k) + "=" + encodeURIComponent(o[k])).join("&");

  let output = "";
  let ok = false;
  let errorMsg = "";

  try {
    // 1. Log in and keep the session cookie.
    const login = $http.send({
      url: base + "/master/login",
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: form({ user: allmonUser, pass: pass, action: "login" }),
      timeout: 15,
    });
    if (login.statusCode < 200 || login.statusCode >= 300) {
      errorMsg = "Allmon3 login HTTP " + login.statusCode;
    } else {
      let cookie = "";
      const names = Object.keys(login.cookies || {});
      if (names.length) cookie = names[0] + "=" + login.cookies[names[0]].value;
      if (!cookie) {
        errorMsg = "Allmon3 login failed";
      } else {
        // 2. Send the command.
        const cmd = $http.send({
          url: base + "/master/cmd",
          method: "POST",
          headers: { "content-type": "application/x-www-form-urlencoded", cookie: cookie },
          body: form({ node: node, cmd: "rpt fun " + node + " " + dtmf }),
          timeout: 15,
        });
        if (cmd.statusCode < 200 || cmd.statusCode >= 300) {
          errorMsg = "Allmon3 cmd HTTP " + cmd.statusCode;
        } else {
          const j = cmd.json;
          if (j && j.SUCCESS !== undefined && j.SUCCESS !== null) {
            ok = true;
            const val = j.SUCCESS;
            // Allmon3 returns the command output base64-encoded.
            const b64 = typeof val === "string" ? val : ((val && (val.output || val.data || val.text)) || "");
            try { output = Buffer.from(String(b64), "base64").toString("utf8"); } catch (_) { output = String(b64 || ""); }
            if (!output) output = "Command accepted";
          } else if (j && j.SECURITY !== undefined && j.SECURITY !== null) {
            errorMsg = "Allmon3 security error";
          } else if (j && j.ERROR !== undefined && j.ERROR !== null) {
            errorMsg = typeof j.ERROR === "string" ? j.ERROR : "Allmon3 error";
          } else {
            errorMsg = "Unexpected Allmon3 response";
          }
        }
      }
    }
  } catch (err) {
    errorMsg = (err && err.message) || "Allmon3 request failed";
  }

  // 3. Log every attempt.
  try {
    const log = new Record($app.findCollectionByNameOrId("dtmf_logs"));
    log.set("user_email", user.email());
    log.set("user_name", u.displayName(user));
    log.set("repeater_name", repeater.getString("name"));
    log.set("node", node);
    log.set("command_name", command.getString("name"));
    log.set("dtmf", dtmf);
    log.set("result", ok ? "success" : "error");
    log.set("output", u.trunc(ok ? output : errorMsg, 20000));
    $app.save(log);
  } catch (_) {}

  if (ok) return e.json(200, { ok: true, output: output });
  return e.json(502, { ok: false, error: errorMsg || "Unknown error" });
});
