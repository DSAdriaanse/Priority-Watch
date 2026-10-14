// Fake third-party services for local testing: Textbelt, Slack, Anthropic, WordPress, Allmon3.
// Usage: node mock-services.mjs [port]   (default 9100)
import http from "node:http";

const port = Number(process.argv[2] || 9100);
let calls = [];

const readBody = (req) =>
  new Promise((resolve) => {
    let data = "";
    req.on("data", (c) => (data += c));
    req.on("end", () => resolve(data));
  });

const send = (res, status, obj, headers = {}) => {
  res.writeHead(status, { "content-type": "application/json", ...headers });
  res.end(JSON.stringify(obj));
};

http
  .createServer(async (req, res) => {
    const url = new URL(req.url, `http://127.0.0.1:${port}`);
    const raw = await readBody(req);

    if (url.pathname === "/_calls") return send(res, 200, calls);
    if (url.pathname === "/_reset") { calls = []; return send(res, 200, { ok: true }); }

    let body = raw;
    try { body = JSON.parse(raw); } catch {}
    calls.push({ path: url.pathname, method: req.method, headers: req.headers, body });

    switch (url.pathname) {
      case "/textbelt":
        return send(res, 200, { success: true, textId: "1" });
      case "/slack":
        return send(res, 200, { ok: true });
      case "/anthropic":
        return send(res, 200, { content: [{ type: "text", text: "Delivery van recovered\nThe van was recovered without injury.\nNo further action required." }] });
      case "/wp/wp-json/wp/v2/posts":
        return send(res, 201, { link: "https://wp.test/post-1" });
      case "/allmon/master/login":
        return send(res, 200, { SUCCESS: "ok" }, { "set-cookie": "allmon=session123; Path=/; HttpOnly" });
      case "/allmon/master/cmd":
        if (!String(req.headers.cookie || "").includes("allmon=session123")) return send(res, 200, { SECURITY: "no session" });
        return send(res, 200, { SUCCESS: Buffer.from("Command output OK").toString("base64") });
      case "/linkhook":
        return send(res, 200, { ok: true });
      default:
        return send(res, 404, { error: "unknown mock route " + url.pathname });
    }
  })
  .listen(port, "127.0.0.1", () => console.log("mock services on", port));
