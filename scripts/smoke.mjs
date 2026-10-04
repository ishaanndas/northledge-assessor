#!/usr/bin/env node
// Smoke test: opens every screen in a real browser and checks every API
// route, so a broken page cannot ship unnoticed. Run before every deploy.
//
//   node scripts/smoke.mjs                 starts a local server on a spare port
//   node scripts/smoke.mjs --url https://… checks a running deployment
//
// It spends no money: it never starts a draft.
//
// The browser is one headless Chrome driven through its debugging protocol.
// For each page it records uncaught script errors and console errors, then
// reads the visible text and checks the screen actually rendered.
import { spawn } from "node:child_process";
import path from "node:path";
import os from "node:os";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CHROME = process.env.CHROME || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const argUrl = process.argv.includes("--url") ? process.argv[process.argv.indexOf("--url") + 1] : null;
const BAD_TEXT = [/is not defined/, /Cannot read properties/, /is not a function/, /Unexpected token/];
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

const results = [];
const ok = (name, pass, detail = "") => { results.push({ name, pass, detail }); console.log(`${pass ? "ok  " : "FAIL"}  ${name}${detail ? "  " + detail : ""}`); };

// ---- server ----
let server = null, base = argUrl;
if (!base) {
  const port = 4977;
  server = spawn(process.execPath, ["serve.mjs"], { cwd: ROOT, env: { ...process.env, PORT: String(port) }, stdio: "ignore" });
  base = `http://localhost:${port}`;
  for (let i = 0; i < 50; i++) { try { await fetch(base + "/api/companies"); break; } catch { await wait(200); } }
}

// ---- browser ----
const profile = fs.mkdtempSync(path.join(os.tmpdir(), "smoke-chrome-"));
const DEBUG_PORT = 9400 + Math.floor(Math.random() * 400);
const chrome = spawn(CHROME, ["--headless=new", "--disable-gpu", "--no-first-run", "--no-default-browser-check", "--disable-extensions", `--user-data-dir=${profile}`, `--remote-debugging-port=${DEBUG_PORT}`, "about:blank"], { stdio: "ignore" });
async function devtools(pathname, method = "GET") {
  for (let i = 0; i < 60; i++) { try { const r = await fetch(`http://127.0.0.1:${DEBUG_PORT}${pathname}`, { method }); if (r.ok) return r.json(); } catch {} await wait(250); }
  throw new Error("Chrome debugging port did not open");
}

// Open one page in a fresh tab, collect errors for a few seconds, read its text.
async function visit(url, settleMs = 3500) {
  const target = await devtools(`/json/new?${encodeURIComponent(url)}`, "PUT");
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  let id = 0; const pending = new Map(); const errors = [];
  ws.onmessage = (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) { pending.get(m.id)(m.result); pending.delete(m.id); return; }
    if (m.method === "Runtime.exceptionThrown") errors.push(m.params.exceptionDetails?.exception?.description?.split("\n")[0] || m.params.exceptionDetails?.text);
    if (m.method === "Runtime.consoleAPICalled" && m.params.type === "error") errors.push("console: " + (m.params.args?.[0]?.value ?? m.params.args?.[0]?.description ?? ""));
  };
  const send = (method, params = {}) => new Promise((res) => { const i = ++id; pending.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });
  await send("Runtime.enable");
  await send("Page.reload", { ignoreCache: true }); // reload so errors during first load are captured
  await wait(settleMs);
  const r = await send("Runtime.evaluate", { expression: "document.body ? document.body.textContent : ''", returnByValue: true });
  ws.close();
  await fetch(`http://127.0.0.1:${DEBUG_PORT}/json/close/${target.id}`).catch(() => {});
  return { text: r?.result?.value || "", errors };
}

async function getJson(p) { const r = await fetch(base + p); return { status: r.status, body: await r.json().catch(() => null) }; }

let code = 0;
try {
  const companies = await getJson("/api/companies");
  ok("GET /api/companies", companies.status === 200 && Array.isArray(companies.body), `${companies.body?.length ?? 0} companies`);
  const list = companies.body || [];
  const inbox = await getJson("/api/inbox");
  ok("GET /api/inbox", inbox.status === 200 && Array.isArray(inbox.body?.messages), `${inbox.body?.messages?.length ?? 0} messages`);
  const ev = await getJson("/eval.json");
  ok("GET /eval.json", ev.status === 200 && Array.isArray(ev.body));
  for (const d of ["", "/readme", "/brief", "/how-it-works", "/evaluation", "/prd", "/eval-report", "/test-decks"]) {
    const r = await fetch(base + "/docs" + d); ok(`GET /docs${d}`, r.status === 200);
  }
  for (const c of list) {
    const p = await getJson(`/api/companies/${c.slug}/progress`);
    ok(`progress ${c.slug}`, p.status === 200 && typeof p.body?.running === "boolean");
    if (c.status !== "sources") { const r = await fetch(`${base}/api/companies/${c.slug}/export?format=docx`); ok(`export docx ${c.slug}`, r.status === 200 && (await r.arrayBuffer()).byteLength > 1000); }
  }

  const drafted = list.find((c) => c.origin === "example" && c.status !== "sources") || list.find((c) => c.status !== "sources");
  const notDrafted = list.find((c) => c.status === "sources");
  const pages = [["home", "#/", "Companies"], ["new company", "#/new", "New company"], ["inbox", "#/inbox", "Connections"], ["docs", "", "Documents", "/docs"]];
  if (drafted) pages.push(["assessment (edit)", `#/c/${drafted.slug}`, "Note to partners"], ["assessment (preview)", `#/c/${drafted.slug}?mode=partner`, "Summary"], ["sources", `#/c/${drafted.slug}/sources`, "What the model reads"], ["follow-up", `#/c/${drafted.slug}/followup`, "Email founder"]);
  if (notDrafted) pages.push(["assessment (not drafted)", `#/c/${notDrafted.slug}`, "What the draft will be built from"]);
  for (const [name, hash, expect, pathname = "/"] of pages) {
    let v; try { v = await visit(`${base}${pathname}?smoke=${Date.now()}${hash}`); } catch (e) { ok(`page ${name}`, false, "browser: " + e.message); continue; }
    const badText = BAD_TEXT.find((re) => re.test(v.text));
    const problem = v.errors[0] || (badText && v.text.match(badText)[0]) || (!v.text.includes(expect) && `missing "${expect}"`);
    ok(`page ${name}`, !problem, problem || "");
  }
} catch (e) {
  ok("smoke run", false, e.message);
} finally {
  chrome.kill(); if (server) server.kill();
  setTimeout(() => fs.rmSync(profile, { recursive: true, force: true }), 500);
}
const failed = results.filter((r) => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} checks passed${failed.length ? "; FAILED: " + failed.map((f) => f.name).join(", ") : ""}`);
setTimeout(() => process.exit(failed.length ? 1 : 0), 700);
