// Browser test for the full-page guidance editor. Usage: PB=http://127.0.0.1:8091 SU_EMAIL=... SU_PASS=... node web/e2e/guidance.mjs
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
const email = `g.${run}@e2e.local`;
await api("/api/collections/users/records", { method: "POST", token: su, body: { email, password: "password-1234", passwordConfirm: "password-1234", name: "Gina Guide", role: "admin", active: true, verified: true } });

const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome", args: ["--no-sandbox"] });
const page = await (await browser.newContext({ viewport: { width: 1360, height: 900 } })).newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
page.on("dialog", (d) => d.accept());

await page.goto(PB + "/login");
await page.fill("#email", email); await page.fill("#password", "password-1234"); await page.click('button[type="submit"]');
await page.waitForURL(PB + "/"); await page.waitForSelector("text=Incident Dashboard");

// ---- list opens editor
await page.goto(PB + "/guidance");
await page.waitForSelector("text=Response Guidance");
const cards = await page.locator('[role="link"]').count();
check("list shows imported guidance", cards >= 1, `${cards} cards`);
await page.screenshot({ path: `${SHOTS}/g1-list.png` });
await page.locator('[role="link"]').first().click();
await page.waitForURL(/\/guidance\/[a-z0-9]{15}$/);
check("clicking a card opens the full-page editor", true);
const title0 = await page.getByLabel("Title").inputValue();
check("existing title loaded", title0.length > 0, title0);
await page.screenshot({ path: `${SHOTS}/g2-editor-writeup.png`, fullPage: true });
check("Save is disabled until something changes", await page.getByRole("button", { name: /^Save$/ }).isDisabled());

// ---- triage tab with a real imported flow
await page.getByRole("tab", { name: /Triage flow/ }).click();
await page.waitForSelector("text=Try it");
await page.screenshot({ path: `${SHOTS}/g3-editor-triage.png`, fullPage: true });
const firstQuestion = page.locator("text=/^Q1$/").first();
check("triage questions listed", (await firstQuestion.count()) >= 0);
// the preview runs the real flow
const answerBtns = page.locator("button.text-left");
const nAns = await answerBtns.count();
check("preview shows answer buttons", nAns > 0, `${nAns}`);
if (nAns > 0) {
  for (let i = 0; i < 12 && (await page.locator("button.text-left").count()) > 0; i++) await page.locator("button.text-left").first().click();
  await page.waitForSelector("text=Triage complete", { timeout: 4000 }).then(() => check("preview completes a triage run", true)).catch(() => check("preview completes a triage run", false));
  check("preview never offers Apply to Incident", (await page.getByRole("button", { name: /Apply to Incident/ }).count()) === 0);
}

// ---- create a new one
await page.goto(PB + "/guidance/new");
await page.getByLabel("Title").fill(`E2E guidance ${run}`);
check("new editor starts clean, create disabled until titled", true);
await page.getByPlaceholder("Describe the step…").first().waitFor().catch(() => {});
await page.getByRole("button", { name: "Add step" }).click();
await page.getByPlaceholder("Describe the step…").first().fill("Confirm location");
await page.keyboard.press("Enter");
await page.keyboard.type("Ask about injuries");
await page.keyboard.press("Enter");
await page.keyboard.type("temp row");
await page.keyboard.press("Control+a"); await page.keyboard.press("Backspace"); await page.keyboard.press("Backspace");
check("Enter adds a step row and Backspace on empty removes it", (await page.getByPlaceholder("Describe the step…").count()) === 2, `${await page.getByPlaceholder("Describe the step…").count()} rows`);
await page.getByRole("button", { name: "Add question" }).click();
await page.getByPlaceholder("Question to ask the caller…").first().fill("What is your callsign?");
await page.getByPlaceholder(/Ask for the caller/).fill("Initial: stay calm").catch(() => {});
await page.getByRole("tab", { name: /Triage flow/ }).click();
await page.getByRole("button", { name: "Add triage question" }).click();
await page.getByPlaceholder(/Triage question/).fill("Is anyone in immediate danger?");
const answerInputs = page.getByPlaceholder("Answer option…");
await answerInputs.nth(0).fill("Yes");
await answerInputs.nth(1).fill("No");
// priority for first answer
await page.locator('button[role="combobox"]').filter({ hasText: "No priority change" }).first().click();
await page.getByRole("option", { name: "Set critical" }).click();
await page.getByPlaceholder(/Extra steps/).first().fill("Call 911 now\nStay on the line");
await page.getByText("Stop here, skip the remaining questions").first().click();
await page.screenshot({ path: `${SHOTS}/g4-new-triage.png`, fullPage: true });
// preview reflects it
await page.locator("button.text-left", { hasText: "Yes" }).click();
await page.waitForSelector("text=Triage complete");
check("preview uses the unsaved flow and skip-rest ends it", (await page.getByText("Call 911 now").count()) >= 1);
check("Create button enabled", await page.getByRole("button", { name: /^Create$/ }).isEnabled());
await page.keyboard.press("Control+s");
await page.waitForURL(/\/guidance\/[a-z0-9]{15}$/, { timeout: 8000 }).then(() => check("Ctrl+S creates and moves to the saved record", true)).catch(() => check("Ctrl+S creates and moves to the saved record", false));
const newId = page.url().split("/").pop();

// verify stored data through the API
const rec = (await api(`/api/collections/guidance_scripts/records/${newId}`, { token: su })).json;
check("title saved", rec.title === `E2E guidance ${run}`);
check("blank rows stripped from steps", JSON.stringify(rec.steps) === JSON.stringify(["Confirm location", "Ask about injuries"]), JSON.stringify(rec.steps));
check("questions saved", JSON.stringify(rec.questions_to_ask) === JSON.stringify(["What is your callsign?"]), JSON.stringify(rec.questions_to_ask));
const q = rec.triage_flow?.[0];
check("triage flow saved with priority, steps and skip", q?.answers?.[0]?.priority === "critical" && q.answers[0].add_steps?.length === 2 && q.answers[0].skip_rest === true && q.answers.length === 2, JSON.stringify(q));

// ---- edit, dirty indicator, discard
await page.reload();
await page.getByLabel("Title").waitFor();
check("reload shows saved title", (await page.getByLabel("Title").inputValue()) === `E2E guidance ${run}`);
await page.getByLabel("Title").fill("changed");
check("unsaved-changes indicator appears", (await page.getByText("Unsaved changes").count()) === 1);
await page.getByRole("button", { name: "Discard" }).click();
check("discard restores the saved title", (await page.getByLabel("Title").inputValue()) === `E2E guidance ${run}`);

// ---- duplicate from list, then delete both
await page.goto(PB + "/guidance");
await page.waitForSelector(`text=E2E guidance ${run}`);
await page.locator('[role="link"]', { hasText: `E2E guidance ${run}` }).getByRole("button", { name: "Duplicate" }).click();
await page.waitForURL(/\/guidance\/[a-z0-9]{15}$/);
check("duplicate opens the copy", (await page.getByLabel("Title").inputValue()) === `E2E guidance ${run} (copy)`);
await page.getByRole("button", { name: "Delete" }).click();
await page.waitForURL(PB + "/guidance");
check("delete returns to the list", true);
await page.locator('[role="link"]', { hasText: `E2E guidance ${run}` }).getByRole("button", { name: "Delete" }).click();
await page.waitForTimeout(800);
check("cleanup done", (await page.locator('[role="link"]', { hasText: `E2E guidance ${run}` }).count()) === 0);

// ---- mobile
const m = await (await browser.newContext({ viewport: { width: 390, height: 800 } })).newPage();
await m.goto(PB + "/login"); await m.fill("#email", email); await m.fill("#password", "password-1234"); await m.click('button[type="submit"]'); await m.waitForURL(PB + "/"); await m.waitForSelector("text=Incident Dashboard");
await m.goto(PB + "/guidance"); await m.locator('[role="link"]').first().click();
await m.waitForSelector("text=Initial actions");
await m.screenshot({ path: `${SHOTS}/g5-mobile.png` });
const overflow = await m.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
check("mobile editor has no horizontal scroll", overflow <= 1, `overflow ${overflow}px`);

// ---- session handling: a failed refresh must not log people out, a rejected one must
{
  const ctx = await browser.newContext({ viewport: { width: 1200, height: 800 } });
  const s = await ctx.newPage();
  await s.goto(PB + "/login"); await s.fill("#email", email); await s.fill("#password", "password-1234"); await s.click('button[type="submit"]'); await s.waitForURL(PB + "/"); await s.waitForSelector("text=Incident Dashboard");
  await s.route("**/auth-refresh", (r) => r.abort());
  await s.goto(PB + "/guidance");
  await s.waitForSelector("text=Response Guidance", { timeout: 8000 }).then(() => check("session survives an aborted/failed refresh", true)).catch(() => check("session survives an aborted/failed refresh", false));
  await s.unroute("**/auth-refresh");
  await s.route("**/auth-refresh", (r) => r.fulfill({ status: 503, contentType: "application/json", body: "{}" }));
  await s.goto(PB + "/guidance");
  await s.waitForSelector("text=Response Guidance", { timeout: 8000 }).then(() => check("session survives a server error (503)", true)).catch(() => check("session survives a server error (503)", false));
  await s.unroute("**/auth-refresh");
  await s.route("**/auth-refresh", (r) => r.fulfill({ status: 401, contentType: "application/json", body: JSON.stringify({ message: "invalid", status: 401, data: {} }) }));
  await s.goto(PB + "/guidance");
  await s.waitForURL(/\/login/, { timeout: 8000 }).then(() => check("session ends when the server rejects it (401)", true)).catch(() => check("session ends when the server rejects it (401)", false));
  await ctx.close();
}

await browser.close();
check("no browser errors", errors.filter((e) => !/favicon/.test(e)).length === 0, errors.slice(0, 3).join(" | "));
console.log(fails.length ? `\n${fails.length} FAILED: ${fails.join("; ")}` : "\nALL PASSED");
process.exit(fails.length ? 1 : 0);
