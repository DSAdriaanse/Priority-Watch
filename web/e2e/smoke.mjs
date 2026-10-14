import { chromium } from "playwright-core";
import fs from "node:fs";

const PB = "http://127.0.0.1:8090";
const run = Date.now().toString(36);
const shots = process.env.SHOTS || ".";
const log = (...a) => console.log(...a);
const fails = [];
const check = (name, cond, extra = "") => { log(cond ? "PASS" : "FAIL", name, extra); if (!cond) fails.push(name); };

const api = async (path, { method = "GET", token, body, headers = {} } = {}) => {
  const r = await fetch(PB + path, { method, headers: { "content-type": "application/json", ...(token ? { authorization: token } : {}), ...headers }, body: body ? JSON.stringify(body) : undefined });
  let j = null; try { j = await r.json(); } catch {}
  return { status: r.status, json: j };
};

const su = (await api("/api/collections/_superusers/auth-with-password", { method: "POST", body: { identity: "admin@test.local", password: "testpass1234" } })).json.token;
const mkUser = async (name, role) => {
  const email = `${role}.${run}@e2e.local`;
  const r = await api("/api/collections/users/records", { method: "POST", token: su, body: { email, password: "password-1234", passwordConfirm: "password-1234", name, role, active: true, verified: true } });
  if (r.status !== 200) throw new Error(JSON.stringify(r.json));
  return { id: r.json.id, email, name };
};
const admin = await mkUser("Eve Admin", "admin");
const op = await mkUser("Otto Operator", "operator");
const rep = await api("/api/collections/repeaters/records", { method: "POST", token: su, body: { name: `E2E Repeater ${run}`, node_number: "4242", status: "online", state: "AZ" } });

const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome", args: ["--no-sandbox"] });
const errors = [];
async function newPage(ctx) {
  const page = await ctx.newPage();
  page.on("pageerror", (e) => errors.push("pageerror: " + e.message));
  page.on("console", (m) => { if (m.type() === "error") errors.push("console: " + m.text()); });
  page.on("response", async (r) => { if (r.status() >= 400 && r.status() !== 401) console.log("HTTP", r.status(), r.request().method(), decodeURIComponent(r.url()).slice(0, 160)); });
  page.on("dialog", (d) => d.accept());
  return page;
}
async function login(page, u) {
  await page.goto(PB + "/login");
  await page.fill("#email", u.email);
  await page.fill("#password", "password-1234");
  await page.click('button[type="submit"]');
  await page.waitForURL(PB + "/", { timeout: 10000 });
}

// ---------- signed out
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, acceptDownloads: true });
let page = await newPage(ctx);
await page.goto(PB + "/");
await page.waitForURL(/\/login/);
check("signed-out visitors land on /login", true);
check("login page has no self-registration link", (await page.getByText("Create one").count()) === 0);
await page.screenshot({ path: `${shots}/01-login.png` });

// wrong password
await page.fill("#email", admin.email); await page.fill("#password", "nope-nope"); await page.click('button[type="submit"]');
await page.waitForSelector("text=/Failed|Invalid|invalid/", { timeout: 5000 }).then(() => check("wrong password shows an error", true)).catch(() => check("wrong password shows an error", false));

// ---------- admin: dashboard and realtime
await login(page, admin);
await page.waitForSelector("text=Incident Dashboard");
check("admin sees dashboard", true);
const navText = await page.locator("nav").innerText();
check("admin nav has Settings and Volunteers", /Settings/.test(navText) && /Volunteers/.test(navText));
await page.waitForSelector("text=Repeaters Online");

const before = await page.locator("a[href^='/incident/']").count();
const hook = await api("/api/pw/webhook/inbound", { method: "POST", headers: { "x-webhook-secret": "s3cret" }, body: { node_number: "4242", alert_type: "Priority Traffic", nature: "E2E realtime check" } });
check("webhook accepted", hook.status === 200, JSON.stringify(hook.json).slice(0, 80));
await page.waitForSelector("text=E2E realtime check", { timeout: 8000 }).then(() => check("new incident appears live without reload", true)).catch(() => check("new incident appears live without reload", false));
await page.screenshot({ path: `${shots}/02-dashboard.png` });

// ---------- incident detail
await page.click("text=E2E realtime check");
await page.waitForSelector("text=Incident Log");
await page.fill('input[placeholder="Log an update…"]', "Operator note from e2e");
await page.click('button:has-text("Add")');
await page.waitForSelector("text=Operator note from e2e", { timeout: 5000 }).then(() => check("incident note saved and shown", true)).catch(() => check("incident note saved and shown", false));
await page.click('button:has-text("Take Ownership")');
await page.waitForSelector("text=Response ownership assigned to Eve Admin", { timeout: 5000 }).then(() => check("take ownership logs assignment", true)).catch(() => check("take ownership logs assignment", false));
await page.click('button:has-text("Notify Team")');
await page.waitForSelector("text=Notification results", { timeout: 10000 }).then(() => check("notify team shows results", true)).catch(() => check("notify team shows results", false));
await page.screenshot({ path: `${shots}/03-incident.png`, fullPage: true });
await page.click('button:has-text("Resolve & Publish")');
await page.waitForSelector("text=Resolution Summary", { timeout: 15000 }).then(() => check("resolve produces a summary", true)).catch(() => check("resolve produces a summary", false));
check("resolved incident hides the log input", (await page.locator('input[placeholder="Log an update…"]').count()) === 0);
check("admin sees Delete Report on resolved incident", (await page.locator('button:has-text("Delete Report")').count()) === 1);

// ---------- admin pages
for (const [path, text] of [["/repeaters", "Repeaters"], ["/guidance", "Guidance"], ["/volunteers", "Volunteers"], ["/settings", "System Settings"], ["/reports", "Reports"], ["/dtmf", "Repeater"], ["/dtmf-log", "Command"]]) {
  await page.goto(PB + path);
  await page.waitForSelector(`text=${text}`, { timeout: 8000 }).then(() => check(`admin can open ${path}`, true)).catch(() => check(`admin can open ${path}`, false));
}
await page.goto(PB + "/settings");
await page.waitForSelector("text=INBOUND_WEBHOOK_SECRET");
check("settings shows webhook secret status", (await page.getByText("is set on the server").count()) >= 3);
check("settings never prints the secret value", !(await page.content()).includes("s3cret"));
await page.screenshot({ path: `${shots}/04-settings.png`, fullPage: true });

// excel round trip
const [dl] = await Promise.all([page.waitForEvent("download"), page.click('button:has-text("Export to Excel")')]);
const file = `${shots}/export.xlsx`; await dl.saveAs(file);
check("excel export downloads a file", fs.statSync(file).size > 1000, fs.statSync(file).size + " bytes");
await page.setInputFiles('input[type="file"]', file);
await page.waitForSelector("text=Import complete", { timeout: 15000 }).then(() => check("excel import of the export succeeds", true)).catch(() => check("excel import of the export succeeds", false));

// volunteers: add one
await page.goto(PB + "/volunteers");
await page.click('button:has-text("Add Volunteer")');
await page.fill('input[type="email"]', `new.${run}@e2e.local`);
const nameInput = page.locator('div[role="dialog"] input').first();
await nameInput.fill("Nina New");
await page.fill('input[autocomplete="new-password"]', "password-5678");
await page.click('div[role="dialog"] button:has-text("Save")');
await page.waitForSelector("text=Nina New", { timeout: 8000 }).then(() => check("admin can add a volunteer", true)).catch(() => check("admin can add a volunteer", false));
await page.screenshot({ path: `${shots}/05-volunteers.png` });

// ---------- operator
const ctx2 = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const p2 = await newPage(ctx2);
await login(p2, op);
await p2.waitForSelector("text=Incident Dashboard");
const nav2 = await p2.locator("nav").innerText();
check("operator nav hides admin pages", !/Settings|Volunteers|Guidance/.test(nav2) && /Repeater Control/.test(nav2), nav2.replace(/\n/g, " | "));
await p2.goto(PB + "/settings");
await p2.waitForTimeout(1200);
check("operator is denied /settings", (await p2.getByText("INBOUND_WEBHOOK_SECRET").count()) === 0);
await p2.screenshot({ path: `${shots}/06-operator-denied.png` });
await p2.goto(PB + "/dtmf");
await p2.waitForSelector("text=Repeater", { timeout: 8000 });
check("operator can open Repeater Control", true);

// mobile
const ctx3 = await browser.newContext({ viewport: { width: 390, height: 800 } });
const p3 = await newPage(ctx3);
await login(p3, op);
await p3.waitForSelector("text=Incident Dashboard");
await p3.screenshot({ path: `${shots}/07-mobile.png` });

await browser.close();
const real = errors.filter((e) => !/favicon|manifest|status of 400|ClientResponseError 0/.test(e));
check("no browser console errors", real.length === 0, real.slice(0, 5).join(" || "));
log(fails.length ? `\n${fails.length} FAILED: ${fails.join("; ")}` : "\nALL PASSED");
process.exit(fails.length ? 1 : 0);
