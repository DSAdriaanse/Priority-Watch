// Browser test for the incident page layout (three columns on wide screens, tabs below).
// Usage: PB=http://127.0.0.1:8090 SU_EMAIL=... SU_PASS=... SHOTS=./shots node web/e2e/incident-layout.mjs
import { chromium } from "playwright-core";
const PB = process.env.PB || "http://127.0.0.1:8090";
const SHOTS = process.env.SHOTS || ".";
const run = Date.now().toString(36);
const fails = [];
const check = (n, c, x = "") => { console.log(c ? "PASS" : "FAIL", n, x); if (!c) fails.push(n); };
const api = async (p, { method = "GET", token, body } = {}) => {
  const r = await fetch(PB + p, { method, headers: { "content-type": "application/json", ...(token ? { authorization: token } : {}) }, body: body ? JSON.stringify(body) : undefined });
  return { status: r.status, json: await r.json().catch(() => null) };
};
const su = (await api("/api/collections/_superusers/auth-with-password", { method: "POST", body: { identity: process.env.SU_EMAIL, password: process.env.SU_PASS } })).json.token;
const post = async (col, body) => (await api(`/api/collections/${col}/records`, { method: "POST", token: su, body })).json;

// ---- seed
const email = `l.${run}@e2e.local`;
await post("users", { email, password: "password-1234", passwordConfirm: "password-1234", name: "Lena Layout", role: "admin", active: true, verified: true });
const rep = await post("repeaters", { name: `Pinal 675 ${run}`, node_number: "401", state: "AZ", status: "online" });
await post("emergency_contacts", { repeater_id: rep.id, agency_type: "911", agency_name: "Pinal County Dispatch", phone: "520-555-0100" });
await post("guidance_scripts", {
  incident_category: "transportation", title: `Vehicle Accident Response ${run}`, priority_level: "high",
  initial_actions: "Get location and assess for injuries. Determine if the roadway is blocked.",
  steps: ["Get the exact location.", "Ask about number of vehicles and injuries.", "Determine if the road is blocked or passable.", "Relay to 911.", "Warn oncoming traffic if safe.", "Stay on the air until responders arrive.", "Log all details."],
  questions_to_ask: ["What is your exact location?", "How many vehicles are involved?", "Is anyone injured or trapped?"],
  triage_flow: [
    { question: "Is anyone trapped, ejected, or not moving?", answers: [{ label: "Trapped / pinned", priority: "critical", skip_rest: true }, { label: "No, occupants are mobile", priority: "high" }] },
    { question: "Is the roadway blocked?", answers: [{ label: "Yes", priority: "high" }, { label: "No" }] },
  ],
});
const inc = await post("incidents", { repeater_id: [rep.id], repeater_name: [rep.name], alert_type: "Manual Report", status: "active", priority_level: "critical", incident_category: "transportation", nature: "Two vehicle collision" });
for (let i = 1; i <= 25; i++) {
  await post("incident_updates", { incident_id: inc.id, operator_name: "Lena Layout", action_type: i === 25 ? "guidance_followed" : "note",
    message: i === 25 ? "Triage completed → priority critical.\nQ: Is anyone trapped?\nA: Trapped / pinned (critical)" : `Note number ${i}` });
}

const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome", args: ["--no-sandbox"] });
async function open(width, height) {
  const ctx = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: width < 500 ? 2 : 1 });
  const page = await ctx.newPage();
  page.__errors = [];
  page.on("pageerror", (e) => page.__errors.push(e.message));
  page.on("console", (m) => { if (m.type() === "error") page.__errors.push(m.text()); });
  await page.goto(PB + "/login");
  await page.fill("#email", email); await page.fill("#password", "password-1234"); await page.click('button[type="submit"]');
  await page.waitForURL(PB + "/"); await page.waitForSelector("text=Incident Dashboard");
  await page.goto(`${PB}/incident/${inc.id}`);
  // below xl the log panel is hidden until its tab is chosen, so wait for it to exist rather than to be visible
  await page.waitForSelector("text=Note number 24", { state: "attached" });
  return page;
}
const box = async (page, sel) => (await page.locator(sel).first().boundingBox());

// ---- wide: three columns
{
  const page = await open(1440, 900);
  const [c1, c2, c3] = [await box(page, '[role="tabpanel"] >> nth=0'), await box(page, '[role="tabpanel"] >> nth=1'), await box(page, '[role="tabpanel"] >> nth=2')];
  check("wide: three columns side by side, left to right", c1.x < c2.x && c2.x < c3.x && Math.abs(c1.y - c2.y) < 2 && Math.abs(c2.y - c3.y) < 2, `${Math.round(c1.x)},${Math.round(c2.x)},${Math.round(c3.x)}`);
  check("wide: tab bar hidden", !(await page.getByRole("tab", { name: "Guidance" }).isVisible()));
  const pageScroll = await page.evaluate(() => document.querySelector("main").scrollHeight - document.querySelector("main").clientHeight);
  check("wide: page itself does not scroll", pageScroll <= 2, `${pageScroll}px`);
  const logScrolls = await page.evaluate(() => { const el = document.querySelectorAll('[role="tabpanel"]')[1]; return el.scrollHeight > el.clientHeight + 5; });
  check("wide: the log column scrolls on its own", logScrolls);
  check("wide: log column shows newest entry first", (await page.locator('[role="tabpanel"] >> nth=1').innerText()).indexOf("Triage completed") < (await page.locator('[role="tabpanel"] >> nth=1').innerText()).indexOf("Note number 3"));
  const lineBreaks = await page.evaluate(() => getComputedStyle([...document.querySelectorAll("div")].find((d) => d.textContent.startsWith("Triage completed") && d.children.length === 0)).whiteSpace);
  check("wide: log keeps line breaks in triage answers", lineBreaks.startsWith("pre-wrap"), lineBreaks);
  await page.screenshot({ path: `${SHOTS}/il1-wide.png` });
  check("wide: no console errors", page.__errors.length === 0, page.__errors.join(" | "));
  await page.context().close();
}

// ---- tablet and phone: tabs
for (const [name, w, h] of [["tablet", 1024, 768], ["phone", 390, 844]]) {
  const page = await open(w, h);
  const tabsVisible = await page.getByRole("tab", { name: "Guidance" }).isVisible();
  check(`${name}: tab bar visible`, tabsVisible);
  const panelsVisible = await page.evaluate(() => [...document.querySelectorAll('[role="tabpanel"]')].map((p) => p.offsetParent !== null));
  check(`${name}: only the Incident panel shows at first`, JSON.stringify(panelsVisible) === "[true,false,false]", JSON.stringify(panelsVisible));
  check(`${name}: Log tab shows the entry count`, await page.getByRole("tab", { name: /Log \(\d+\)/ }).isVisible());
  await page.screenshot({ path: `${SHOTS}/il2-${name}-incident.png` });

  // typed-but-unsaved text and triage progress survive switching tabs
  await page.getByLabel("Caller info", { exact: true }).fill("Highway patrol, unit 12");
  await page.getByRole("tab", { name: "Guidance" }).click();
  check(`${name}: Guidance tab shows the script`, await page.getByText("Initial Actions").isVisible());
  await page.getByRole("button", { name: /No, occupants are mobile/ }).click();
  check(`${name}: triage moves to question 2`, await page.getByText("Is the roadway blocked?").isVisible());
  await page.screenshot({ path: `${SHOTS}/il3-${name}-guidance.png` });
  await page.getByRole("tab", { name: /Log/ }).click();
  check(`${name}: Log tab shows the log and input`, await page.getByPlaceholder("Log an update…").isVisible());
  await page.screenshot({ path: `${SHOTS}/il4-${name}-log.png` });
  await page.getByRole("tab", { name: "Guidance" }).click();
  check(`${name}: triage progress kept after switching tabs`, await page.getByText("Is the roadway blocked?").isVisible());
  await page.getByRole("tab", { name: "Incident" }).click();
  check(`${name}: typed field kept after switching tabs`, (await page.getByLabel("Caller info", { exact: true }).inputValue()) === "Highway patrol, unit 12");

  // adding a log entry from the Log tab
  await page.getByRole("tab", { name: /Log/ }).click();
  await page.getByPlaceholder("Log an update…").fill(`from ${name}`);
  await page.getByRole("button", { name: "Add" }).click();
  await page.waitForSelector(`text=from ${name}`);
  check(`${name}: new log entry appears`, true);
  const hscroll = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  check(`${name}: no sideways scrolling`, hscroll <= 1, `${hscroll}px`);
  check(`${name}: no console errors`, page.__errors.length === 0, page.__errors.join(" | "));
  await page.context().close();
}

await browser.close();
console.log(fails.length ? `\n${fails.length} FAILED` : "\nALL PASSED");
process.exit(fails.length ? 1 : 0);
