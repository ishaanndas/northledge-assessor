#!/usr/bin/env node
// Smoke test: opens every screen in headless Chrome and checks every API
// route, so a broken page cannot ship unnoticed. Run before every deploy.
//
//   node scripts/smoke.mjs                 starts a local server on a spare port
//   node scripts/smoke.mjs --url https://… checks a running deployment
//
// It spends no money: it never starts a draft.
import { spawn, execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CHROME = process.env.CHROME || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const argUrl = process.argv.includes("--url") ? process.argv[process.argv.indexOf("--url") + 1] : null;
const BAD = [/is not defined/, /Cannot read properties/, /is not a function/, /Unexpected token/, /Failed to fetch/];

let server = null, base = argUrl;
if (!base) {
  const port = 4977;
  server = spawn(process.execPath, ["serve.mjs"], { cwd: ROOT, env: { ...process.env, PORT: String(port) }, stdio: "ignore" });
  base = `http://localhost:${port}`;
  for (let i = 0; i < 50; i++) { try { await fetch(base + "/api/companies"); break; } catch { await new Promise((r) => setTimeout(r, 200)); } }
}

const results = [];
const ok = (name, pass, detail = "") => { results.push({ name, pass, detail }); console.log(`${pass ? "ok  " : "FAIL"}  ${name}${detail ? "  " + detail : ""}`); };

async function getJson(p) { const r = await fetch(base + p); return { status: r.status, body: await r.json().catch(() => null) }; }

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

  // Pages, rendered by a real browser.
  const drafted = list.find((c) => c.origin === "example" && c.status !== "sources") || list.find((c) => c.status !== "sources");
  const notDrafted = list.find((c) => c.status === "sources");
  const pages = [["home", "#/", "Companies"], ["new company", "#/new", "New company"], ["inbox", "#/inbox", "Connections"]];
  if (drafted) pages.push(["assessment (edit)", `#/c/${drafted.slug}`, "Note to partners"], ["assessment (preview)", `#/c/${drafted.slug}?mode=partner`, "Summary"], ["sources", `#/c/${drafted.slug}/sources`, "What the model reads"], ["follow-up", `#/c/${drafted.slug}/followup`, "Email founder"]);
  if (notDrafted) pages.push(["assessment (not drafted)", `#/c/${notDrafted.slug}`, "What the draft will be built from"]);
  for (const [name, hash, expect] of pages) {
    let dom = "";
    try { dom = execFileSync(CHROME, ["--headless=new", "--disable-gpu", "--virtual-time-budget=6000", "--dump-dom", `${base}/?smoke=${Date.now()}${hash}`], { encoding: "utf8", timeout: 45000, stdio: ["ignore", "pipe", "ignore"] }); }
    catch (e) { ok(`page ${name}`, false, "chrome failed: " + e.message.slice(0, 80)); continue; }
    const text = dom.replace(/<script[\s\S]*?<\/script>/g, "").replace(/<style[\s\S]*?<\/style>/g, "");
    const bad = BAD.find((re) => re.test(text));
    ok(`page ${name}`, !bad && text.includes(expect), bad ? `error on page: ${text.match(bad)[0]}` : text.includes(expect) ? "" : `missing "${expect}"`);
  }
} finally {
  if (server) server.kill();
}
const failed = results.filter((r) => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} checks passed${failed.length ? "; FAILED: " + failed.map((f) => f.name).join(", ") : ""}`);
process.exit(failed.length ? 1 : 0);
