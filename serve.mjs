// The app server: static files from app/ plus a small JSON API over the same
// pipeline the CLI uses. No dependencies. Start with `node serve.mjs`.
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { ROOT } from "./lib/env.mjs";
import { OUT_DIR, COMPANIES_DIR, listCompanies, loadCompany, findCompanyDir, outDirFor } from "./lib/sources.mjs";
import { draftCompany } from "./lib/pipeline.mjs";
import { extractFile, extractUrl } from "./lib/extract.mjs";
import { prefillFromDeck } from "./lib/prefill.mjs";
import { listInbox, importInboxMessage, INBOX_DIR, readSettings, writeSettings, startWatcher, forgetImport } from "./lib/inbox.mjs";
import { search } from "./lib/search.mjs";
import { toMarkdownApplied, toPlainText, toDocx } from "./lib/export.mjs";
import { markdownToHtml } from "./lib/markdown-html.mjs";
import { suggestTags, readTags, writeTags, effectiveTags, FIT, TAGS } from "./lib/tags.mjs";

const PORT = Number(process.env.PORT || 4950);
// One bad request or a failed background job must never take the app down.
process.on("unhandledRejection", (err) => console.error("unhandled rejection:", err?.message || err));
process.on("uncaughtException", (err) => console.error("uncaught exception:", err?.message || err));
const APP_DIR = path.join(ROOT, "app");
const TYPES = { ".zip": "application/zip", ".html": "text/html; charset=utf-8", ".json": "application/json", ".md": "text/markdown; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".pdf": "application/pdf", ".pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation", ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document" };
const SOURCE_ORDER = ["deck", "website", "founders", "call-notes", "email"];
// Drafts run as background jobs. The page starts one and then polls for
// progress, so a dropped connection, a refresh or leaving the page never
// loses track of it. Jobs are kept in memory; a restart mid-draft is detected
// and reported rather than left looking busy forever.
const jobs = new Map(); // slug -> { running, log: [], error, startedAt, finishedAt }
const running = { has: (slug) => !!jobs.get(slug)?.running };
// Suggest fit and topic tags from a finished draft. A failure here never fails the draft.
async function runTagging(slug, job, record) {
  record ??= readJson(path.join(outDirFor(slug), "assessment.json"));
  if (!record) return;
  const ev = { step: "tags", message: "Suggesting a fit tag" }; job?.log.push(ev);
  try {
    const ai = await suggestTags(record);
    writeTags(outDirFor(slug), { ai, person: null });
    ev.message = `${FIT[ai.fit]}${ai.tags.length ? ", " + ai.tags.map((t) => TAGS[t.tag]).join(", ") : ""}`;
  } catch (err) { ev.message = "Tags could not be suggested; add them by hand"; console.error("tagging failed", slug, err.message); }
}
function startDraftJob(slug) {
  const cur = jobs.get(slug);
  if (cur?.running) return cur;
  const job = { running: true, log: [], error: null, startedAt: Date.now(), finishedAt: null };
  jobs.set(slug, job);
  const reviewPath = path.join(outDirFor(slug), "review.json");
  if (fs.existsSync(reviewPath)) fs.unlinkSync(reviewPath); // a fresh draft supersedes the old review
  const tagsPath = path.join(outDirFor(slug), "tags.json");
  if (fs.existsSync(tagsPath)) fs.unlinkSync(tagsPath); // and the old tags
  draftCompany(slug, (e) => job.log.push(e.step === "done" ? { step: "done", message: e.message, summary: e.record.verification_summary, seconds: e.record.seconds, usage: e.record.usage } : e))
    .then((rec) => runTagging(slug, job, rec))
    .catch((err) => { job.error = err.message || String(err); job.log.push({ step: "error", message: job.error }); console.error("draft failed", slug, job.error); })
    .finally(() => { job.running = false; job.finishedAt = Date.now(); });
  return job;
}
// Files kept between "read this deck" and "create the company". They live inside
// companies/ so that, on the host, they sit on the same persistent volume as the
// company folders they are moved into.
const UPLOADS = path.join(COMPANIES_DIR, ".uploads");
// Move a file, even between two disks (a plain rename cannot cross disks: EXDEV).
function moveFile(from, to) {
  try { fs.renameSync(from, to); }
  catch (err) { if (err.code !== "EXDEV") throw err; fs.copyFileSync(from, to); fs.unlinkSync(from); }
}
// ---- Demo mode (DEMO_MODE=1): the public copy linked from techbrig.co ----
// New drafts are capped per visitor and per day, companies visitors add are
// cleared after a day, edits to the built-in examples reset after two hours,
// and documents that only make sense for the take-home are hidden.
const DEMO = process.env.DEMO_MODE === "1";
const LIMITS = {
  draft: { ip: Number(process.env.DEMO_DRAFTS_PER_VISITOR || 3), day: Number(process.env.DEMO_DRAFTS_PER_DAY || 25) },
  tags: { ip: 10, day: 100 },
  prefill: { ip: 15, day: 200 },
};
const usage = { day: "", counts: new Map() };
const visitor = (req) => String(req.headers["x-forwarded-for"] || req.socket.remoteAddress || "").split(",")[0].trim();
// Returns an error message when the limit is reached, otherwise counts the use.
function overLimit(kind, req) {
  if (!DEMO) return null;
  const today = new Date().toISOString().slice(0, 10);
  if (usage.day !== today) { usage.day = today; usage.counts.clear(); }
  const k = `${kind}:${visitor(req)}`, all = `${kind}:*`, L = LIMITS[kind];
  const mine = usage.counts.get(k) || 0, total = usage.counts.get(all) || 0;
  const what = kind === "draft" ? "new drafts" : kind === "tags" ? "tag suggestions" : "deck readings";
  if (mine >= L.ip) return `The demo allows ${L.ip} ${what} per visitor per day, and that limit has been reached. The example companies are already drafted.`;
  if (total >= L.day) return `The demo has reached today's limit of ${what}. The example companies are already drafted.`;
  usage.counts.set(k, mine + 1); usage.counts.set(all, total + 1);
  return null;
}
function demoSweep() {
  if (!DEMO) return;
  const now = Date.now();
  for (const c of listCompanies()) {
    try {
      if (c.origin === "intake") {
        const created = Date.parse(readJson(path.join(c.dir, "company.json"))?.created_at || 0);
        if (now - created > 24 * 3600e3 && !running.has(c.slug)) { fs.rmSync(c.dir, { recursive: true, force: true }); jobs.delete(c.slug); forgetImport(c.slug); }
      } else {
        const out = outDirFor(c.slug);
        for (const f of ["review.json", "sent.json"]) { const p = path.join(out, f); if (fs.existsSync(p) && now - fs.statSync(p).mtimeMs > 2 * 3600e3) fs.unlinkSync(p); }
        const tp = path.join(out, "tags.json"), t = readTags(out);
        if (t?.person && now - Date.parse(t.person.at || 0) > 2 * 3600e3) writeTags(out, { ...t, person: null });
      }
    } catch (e) { console.error("demo sweep", c.slug, e.message); }
  }
}

// On start: remove company folders left half-made by a failed create (no company.json),
// and uploads older than a day that were never turned into a company.
function tidyCompanies() {
  if (!fs.existsSync(COMPANIES_DIR)) return;
  for (const d of fs.readdirSync(COMPANIES_DIR)) {
    if (d.startsWith(".") || d === "lost+found") continue;
    const dir = path.join(COMPANIES_DIR, d);
    // Only folders this app made: they always get a sources/ or files/ folder first.
    const ours = fs.statSync(dir).isDirectory() && (fs.existsSync(path.join(dir, "sources")) || fs.existsSync(path.join(dir, "files")));
    if (ours && !fs.existsSync(path.join(dir, "company.json"))) { fs.rmSync(dir, { recursive: true, force: true }); console.log("removed half-made company folder", d); }
  }
  if (fs.existsSync(UPLOADS)) for (const f of fs.readdirSync(UPLOADS)) {
    const p = path.join(UPLOADS, f);
    if (Date.now() - fs.statSync(p).mtimeMs > 86400000) fs.rmSync(p, { force: true });
  }
}
const safeName = (n) => String(n).replace(/[^\w.\- ]+/g, "_").slice(0, 120) || "file";
const FILE_KINDS = { ".pdf": "pdf", ".pptx": "pptx", ".docx": "docx", ".md": "text", ".txt": "text" };

const readJson = (f) => (fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, "utf8")) : null);
const send = (res, code, body, type = "application/json") => {
  res.writeHead(code, { "Content-Type": type, "Cache-Control": "no-store" });
  res.end(type === "application/json" && !Buffer.isBuffer(body) ? JSON.stringify(body) : body);
};
const body = (req) =>
  new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (c) => (data += c));
    req.on("end", () => {
      try { resolve(data ? JSON.parse(data) : {}); } catch (e) { reject(e); }
    });
  });

function companySummary({ slug, dir, origin }) {
  const company = readJson(path.join(dir, "company.json"));
  const record = readJson(path.join(outDirFor(slug), "assessment.json"));
  const review = readJson(path.join(outDirFor(slug), "review.json"));
  const sentLog = readJson(path.join(outDirFor(slug), "sent.json")) || [];
  const sent = record ? sentLog.filter((x) => x.draft === record.generated_at).pop() || null : null;
  const ex = loadCompany(dir);
  return {
    slug,
    origin,
    ...company,
    status: sent ? "sent" : review ? "reviewed" : record ? "drafted" : "sources",
    sent,
    tags: record ? effectiveTags(readTags(outDirFor(slug))) : null,
    sources: ex.sources.map((s) => ({ key: s.key, passages: s.passages.length })),
    generated_at: record?.generated_at ?? null,
    verification_summary: record?.verification_summary ?? null,
    missing_count: record?.assessment.missing.length ?? null,
    review: review ? { reviewer: review.reviewer, updated: review.updated } : null,
    running: running.has(slug),
  };
}

function slugify(name) {
  let base = String(name).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "company";
  let slug = base, n = 2;
  while (findCompanyDir(slug) || fs.existsSync(path.join(COMPANIES_DIR, slug))) slug = `${base}-${n++}`;
  return slug;
}

async function api(req, res, url) {
  const parts = url.pathname.split("/").filter(Boolean); // api, companies, slug?, action?

  if (parts[1] === "config" && req.method === "GET") return send(res, 200, { demo: DEMO, draftsPerVisitor: LIMITS.draft.ip });
  if (parts[1] === "search" && req.method === "GET") return send(res, 200, search(url.searchParams.get("q") || ""));
  // Turn a file or a URL into source text. Files arrive as base64 JSON; no multipart parser needed.
  if (parts[1] === "extract" && req.method === "POST") {
    const b = await body(req);
    try {
      if (b.url) {
        const r = await extractUrl(String(b.url).trim());
        if (r.buffer) {
          fs.mkdirSync(UPLOADS, { recursive: true });
          const token = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
          fs.writeFileSync(path.join(UPLOADS, `${token}__${safeName(r.meta.filename)}`), r.buffer);
          r.file = { token, name: safeName(r.meta.filename), kind: FILE_KINDS[path.extname(r.meta.filename).toLowerCase()] || "file", pages: r.meta.pages || r.meta.slides || null };
          delete r.buffer;
        }
        return send(res, 200, r);
      }
      if (b.filename && b.data) {
        const buf = Buffer.from(b.data, "base64");
        const r = await extractFile(b.filename, buf);
        // Keep the original so the reader can open the page a passage came from.
        fs.mkdirSync(UPLOADS, { recursive: true });
        const token = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
        fs.writeFileSync(path.join(UPLOADS, `${token}__${safeName(b.filename)}`), buf);
        r.file = { token, name: safeName(b.filename), kind: FILE_KINDS[path.extname(b.filename).toLowerCase()] || "file", pages: r.meta.pages || r.meta.slides || null };
        return send(res, 200, r);
      }
      return send(res, 400, { error: "send {url} or {filename, data}" });
    } catch (err) { return send(res, 422, { error: err.message }); }
  }
  // Propose the intake fields from the deck text.
  if (parts[1] === "prefill" && req.method === "POST") {
    const lim = overLimit("prefill", req); if (lim) return send(res, 429, { error: lim });
    const b = await body(req);
    if (!b.deck?.trim()) return send(res, 400, { error: "deck text required" });
    try { return send(res, 200, await prefillFromDeck(b.deck)); } catch (err) { return send(res, 502, { error: err.message }); }
  }
  // The inbox: messages waiting in the drop folder (and, when configured, a mailbox).
  if (parts[1] === "inbox") {
    if (req.method === "GET" && !parts[2]) return send(res, 200, listInbox());
    // Connection setup. Credentials are never typed here; the client's own OAuth app
    // supplies them as environment variables, and the connection goes live when they exist.
    if (req.method === "PUT" && parts[2] === "settings") {
      const b = await body(req); const patch = {};
      if (b.provider && ["gmail", "m365"].includes(b.provider)) { const st = readSettings(); patch.providers = { ...st.providers, [b.provider]: { account: String(b.account || "").trim(), watch: String(b.watch || "").trim() || (b.provider === "gmail" ? "label Deal flow" : "folder Deal flow"), setAt: new Date().toISOString() } }; }
      if (b.disconnect) { const st = readSettings(); const p2 = { ...st.providers }; delete p2[b.disconnect]; patch.providers = p2; if (b.disconnect === "forward") patch.forwarding = null; }
      if (b.forwarding) patch.forwarding = { address: `deals-${Math.random().toString(36).slice(2, 8)}@inbound.assessments.example`, setAt: new Date().toISOString() };
      if (typeof b.autoImport === "boolean") patch.autoImport = b.autoImport;
      if (typeof b.autoDraft === "boolean") patch.autoDraft = DEMO ? false : b.autoDraft; // the demo never drafts on its own
      if (DEMO && patch.providers) for (const k of Object.keys(patch.providers)) patch.providers[k] = { ...patch.providers[k], account: "" };
      writeSettings(patch);
      return send(res, 200, listInbox().status);
    }
    if (req.method === "POST" && parts[2] && parts[3] === "import") {
      try { return send(res, 201, await importInboxMessage(parts[2], { companiesDir: COMPANIES_DIR, slugify })); } catch (err) { return send(res, 422, { error: err.message }); }
    }
    return send(res, 404, { error: "not found" });
  }

  if (parts[1] !== "companies") return send(res, 404, { error: "not found" });
  const slug = parts[2], action = parts[3];

  if (!slug) {
    if (req.method === "GET") return send(res, 200, listCompanies().map(companySummary));
    if (req.method === "POST") {
      const b = await body(req);
      if (!b.name?.trim()) return send(res, 400, { error: "name is required" });
      const sources = Object.entries(b.sources || {}).filter(([, v]) => String(v || "").trim());
      if (!sources.length) return send(res, 400, { error: "at least one source is required" });
      const newSlug = slugify(b.name);
      const dir = path.join(COMPANIES_DIR, newSlug);
      try {
      fs.mkdirSync(path.join(dir, "sources"), { recursive: true });
      const files = {};
      for (const [key, f] of Object.entries(b.files || {})) {
        if (!f?.token) continue;
        const src = fs.existsSync(UPLOADS) && fs.readdirSync(UPLOADS).find((n) => n.startsWith(f.token + "__"));
        if (!src) continue;
        fs.mkdirSync(path.join(dir, "files"), { recursive: true });
        const name = src.split("__").slice(1).join("__");
        moveFile(path.join(UPLOADS, src), path.join(dir, "files", name));
        files[key] = { name, kind: f.kind, pages: f.pages };
      }
      fs.writeFileSync(path.join(dir, "company.json"), JSON.stringify({ slug: newSlug, name: b.name.trim(), one_liner: (b.one_liner || "").trim(), ask: (b.ask || "").trim(), created_at: new Date().toISOString(), intake: b.intake || {}, files }, null, 2));
      sources
        .sort(([a], [b2]) => (SOURCE_ORDER.indexOf(a) + 100) % 100 - (SOURCE_ORDER.indexOf(b2) + 100) % 100)
        .forEach(([key, text], i) => {
          const safe = key.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || `source-${i + 1}`;
          const t = String(text).trim();
          const titled = /^#\s/.test(t) ? t : `# ${b.name.trim()} — ${safe}\n\n${t}`;
          fs.writeFileSync(path.join(dir, "sources", `${String(i + 1).padStart(2, "0")}-${safe}.md`), titled + "\n");
        });
      } catch (err) {
        // Never leave a half-made company behind.
        fs.rmSync(dir, { recursive: true, force: true });
        console.error("create company failed", newSlug, err);
        return send(res, 500, { error: "The company could not be saved. Please try again." });
      }
      return send(res, 201, { slug: newSlug });
    }
    return send(res, 405, { error: "method" });
  }

  const dir = findCompanyDir(slug);
  if (!dir) return send(res, 404, { error: `no company ${slug}` });

  if (!action && req.method === "GET") {
    const ex = loadCompany(dir);
    const evalData = readJson(path.join(OUT_DIR, "eval.json")) || [];
    return send(res, 200, {
      ...companySummary({ slug, dir, origin: dir.startsWith(COMPANIES_DIR) ? "intake" : "example" }),
      sourceDocs: ex.sources.map((s) => ({ key: s.key, title: s.title, file: s.file, passages: s.passages })),
      record: readJson(path.join(outDirFor(slug), "assessment.json")),
      tagsDoc: readTags(outDirFor(slug)),
      reviewDoc: readJson(path.join(outDirFor(slug), "review.json")),
      eval: evalData.find((e) => e.slug === slug) || null,
    });
  }

  // Add a website (or replace it) before drafting.
  if (action === "website" && req.method === "POST") {
    if (fs.existsSync(path.join(outDirFor(slug), "assessment.json"))) return send(res, 409, { error: "Already drafted. Draft again after adding sources." });
    const b = await body(req);
    try {
      const r = await extractUrl(String(b.url || "").trim());
      const sdir = path.join(dir, "sources"); const existing = fs.readdirSync(sdir);
      for (const f of existing.filter((f) => /-website\.md$/.test(f))) fs.unlinkSync(path.join(sdir, f));
      const n = Math.max(0, ...fs.readdirSync(sdir).map((f) => parseInt(f) || 0)) + 1;
      fs.writeFileSync(path.join(sdir, `${String(n).padStart(2, "0")}-website.md`), r.text + "\n");
      const cj = path.join(dir, "company.json"); const company = readJson(cj); if (company.intake) company.intake.suggestedWebsite = null; fs.writeFileSync(cj, JSON.stringify(company, null, 2));
      return send(res, 200, { ok: true, paragraphs: r.meta.paragraphs, title: r.meta.title });
    } catch (err) { return send(res, 422, { error: err.message }); }
  }
  // Delete a company created in the app (never the built-in examples).
  if (!action && req.method === "DELETE") {
    if (!dir.startsWith(COMPANIES_DIR)) return send(res, 403, { error: "The built-in examples cannot be deleted." });
    if (running.has(slug)) return send(res, 409, { error: "A draft is running for this company." });
    fs.rmSync(dir, { recursive: true, force: true }); jobs.delete(slug); forgetImport(slug);
    return send(res, 200, { ok: true });
  }

  if (action === "draft" && req.method === "POST") {
    if (!running.has(slug)) { const lim = overLimit("draft", req); if (lim) return send(res, 429, { error: lim }); }
    const job = startDraftJob(slug);
    return send(res, 202, { running: job.running, startedAt: job.startedAt });
  }
  if (action === "progress" && req.method === "GET") {
    const job = jobs.get(slug);
    const drafted = fs.existsSync(path.join(outDirFor(slug), "assessment.json"));
    if (!job) return send(res, 200, { running: false, log: [], error: null, drafted, known: false });
    return send(res, 200, { running: job.running, log: job.log, error: job.error, drafted, known: true, startedAt: job.startedAt, finishedAt: job.finishedAt });
  }

  // Export with the review applied: ?format=md|txt|docx
  if (action === "export" && req.method === "GET") {
    const record = readJson(path.join(outDirFor(slug), "assessment.json"));
    if (!record) return send(res, 404, { error: "not drafted yet" });
    const company = readJson(path.join(dir, "company.json"));
    const c = { ...company, record, reviewDoc: readJson(path.join(outDirFor(slug), "review.json")), tagsView: effectiveTags(readTags(outDirFor(slug))) };
    const fmt = url.searchParams.get("format") || "md", base = `${slug}-assessment`;
    const dispo = (ext) => `attachment; filename="${base}.${ext}"`;
    if (fmt === "docx") { res.writeHead(200, { "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "Content-Disposition": dispo("docx") }); return res.end(toDocx(c)); }
    if (fmt === "txt") return send(res, 200, toPlainText(c), "text/plain; charset=utf-8");
    res.writeHead(200, { "Content-Type": "text/markdown; charset=utf-8", ...(url.searchParams.get("download") ? { "Content-Disposition": dispo("md") } : {}) }); return res.end(toMarkdownApplied(c));
  }

  // Tags: POST asks the AI again; PUT records the associate's choice.
  if (action === "tags" && req.method === "POST") {
    { const lim = overLimit("tags", req); if (lim) return send(res, 429, { error: lim }); }
    if (running.has(slug)) return send(res, 409, { error: "A draft is running for this company." });
    const record = readJson(path.join(outDirFor(slug), "assessment.json"));
    if (!record) return send(res, 409, { error: "Draft the assessment first." });
    try { const ai = await suggestTags(record); const prev = readTags(outDirFor(slug)); return send(res, 200, writeTags(outDirFor(slug), { ai, person: prev?.person || null })); }
    catch (err) { return send(res, 502, { error: "Tags could not be suggested: " + err.message }); }
  }
  if (action === "tags" && req.method === "PUT") {
    const b = await body(req); const prev = readTags(outDirFor(slug)) || { ai: null, person: null };
    if (b.reset) return send(res, 200, writeTags(outDirFor(slug), { ...prev, person: null }));
    const person = { ...(prev.person || {}) };
    if ("fit" in b) { if (b.fit !== null && !FIT[b.fit]) return send(res, 400, { error: "unknown fit" }); person.fit = b.fit; }
    if (Array.isArray(b.tags)) person.tags = [...new Set(b.tags.filter((t) => TAGS[t]))];
    person.by = String(b.by || "").trim() || "the associate"; person.at = new Date().toISOString();
    return send(res, 200, writeTags(outDirFor(slug), { ...prev, person }));
  }
  // Record that the assessment went to a partner.
  if (action === "sent" && req.method === "POST") {
    const b = await body(req);
    const record = readJson(path.join(outDirFor(slug), "assessment.json"));
    if (!record) return send(res, 409, { error: "Draft the assessment first." });
    const to = String(b.to || "").trim(); if (!to) return send(res, 400, { error: "Who is it going to?" });
    const f = path.join(outDirFor(slug), "sent.json"); const log = readJson(f) || [];
    const entry = { to, by: String(b.by || "").trim(), at: new Date().toISOString(), draft: record.generated_at };
    log.push(entry); fs.mkdirSync(outDirFor(slug), { recursive: true }); fs.writeFileSync(f, JSON.stringify(log, null, 2));
    return send(res, 200, entry);
  }

  if (action === "review" && req.method === "PUT") {
    const b = await body(req);
    const doc = { reviewer: String(b.reviewer || "").trim(), note: String(b.note || ""), decisions: b.decisions || {}, overrides: b.overrides || {}, updated: new Date().toISOString().slice(0, 16).replace("T", " ") + " UTC" };
    fs.mkdirSync(outDirFor(slug), { recursive: true });
    fs.writeFileSync(path.join(outDirFor(slug), "review.json"), JSON.stringify(doc, null, 2));
    return send(res, 200, doc);
  }

  return send(res, 404, { error: "not found" });
}


// ---- Documents, rendered from the markdown in the repo so the link stays clean ----
const DOCS_ALL = [
  { id: "readme", file: "README.md", title: "README", blurb: "How to run it, key decisions, what was cut, what comes next, how AI tools were used." },
  { id: "brief", file: "BRIEF.md", title: "Product brief", blurb: "Two pages: who it is for, what v1 does and does not do, how success is measured, the three biggest risks, and why there is no probability score." },
  { id: "how-it-works", file: "docs/TECHNICAL.md", title: "How it works", blurb: "The pipeline, the verifier, the editor, the app, and what a production version would change." },
  { id: "evaluation", file: "docs/EVALUATION.md", title: "Evaluation", blurb: "What the automated checks are, what they found on the committed run, what they cannot see, and how to evaluate after a year of real decisions." },
  { id: "demo-guide", file: "docs/DEMO-GUIDE.md", title: "Demo guide", blurb: "A five-minute click-through for showing the screener: what to click and what to point out. The Tour button in the app covers the same steps." },
  { id: "next-steps", file: "docs/NEXT-STEPS.md", title: "Next steps", blurb: "What it would take to make this ready for real use: testing against real assessments with a fund, an engineering review, sign-in, security, the inbox connection, and the open questions." },
  { id: "prd", file: "docs/PRD.md", title: "Product requirements", blurb: "The longer version of the brief: requirements, metrics, risks, rollout, roadmap." },
  { id: "eval-report", file: "out/eval-report.md", title: "Eval run", blurb: "The raw output of the last evaluation run: every flagged statement with the judge's reason." },
  { id: "test-cases", file: "docs/TEST-CASES.md", title: "Test cases", blurb: "What each example company is, what was hidden in it to trip the tool up, why that would fool an AI tool, and what the tool did." },
  { id: "test-decks", file: "samples/README.md", title: "Test decks", blurb: "Download the test decks, one by one or as a zip, to try the tool yourself; plus everything planted in the trap deck." },
];
// The demo copy shows only the product documents, not the take-home ones.
const DEMO_HIDDEN = new Set(["readme", "brief", "prd", "eval-report"]);
const DOCS = DOCS_ALL.filter((d) => !(DEMO && DEMO_HIDDEN.has(d.id)));
const OWN = "https://northledge-assessor-production.up.railway.app";
function docPage(title, bodyHtml, current) {
  bodyHtml = bodyHtml.split(`href="${OWN}`).join('href="'); // links to this app stay on whichever copy is serving them
  if (DEMO) bodyHtml = bodyHtml.split(OWN).join(process.env.PUBLIC_URL || "this demo");
  const nav = DOCS.map((d) => `<a href="/docs/${d.id}" class="${d.id === current ? "on" : ""}">${d.title}</a>`).join("");
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title} · Seed assessments</title><link rel="stylesheet" href="/app.css"><style>
  .docs{display:grid;grid-template-columns:240px minmax(0,1fr);min-height:calc(100vh - 56px)}
  .docs nav{border-right:1px solid var(--border);background:oklch(99% 0 0);padding:20px 12px;position:sticky;top:56px;align-self:start;height:calc(100vh - 56px);overflow:auto}
  .docs nav a{display:block;padding:8px 12px 8px 16px;border-radius:6px;font-size:13px;color:oklch(44.6% .043 257.281);position:relative}
  .docs nav a:hover{background:var(--muted);color:var(--heading)}.docs nav a.on{background:var(--muted-2);color:var(--heading);font-weight:500}
  .docs nav a.on::before{content:"";position:absolute;left:0;top:9px;bottom:9px;width:2px;background:var(--primary)}
  .docs nav .seclabel{padding:0 8px 8px}
  .prose{max-width:760px;padding:40px 48px 120px;font-size:15px;line-height:1.65;color:var(--foreground)}
  .prose h1{font-size:32px;font-weight:600;letter-spacing:-.7px;margin:0 0 18px}.prose h2{font-size:20px;font-weight:600;letter-spacing:-.3px;margin:36px 0 10px}.prose h3{font-size:16px;font-weight:600;margin:24px 0 6px}
  .prose p{margin:0 0 14px}.prose ul,.prose ol{margin:0 0 14px;padding-left:24px}.prose li{margin:4px 0}
  .prose code{font-family:var(--mono);font-size:12.5px;background:var(--muted-2);padding:1px 5px}.prose pre{background:var(--muted);border:1px solid var(--border-2);padding:12px 14px;overflow:auto;font-size:12.5px;line-height:1.5}.prose pre code{background:none;padding:0}
  .prose .tbl{overflow-x:auto;margin:0 0 16px}.prose table{border-collapse:collapse;width:100%;font-size:13.5px}.prose th{text-align:left;font-size:11px;font-weight:600;letter-spacing:.4px;text-transform:uppercase;color:var(--subtle);padding:8px 10px;border-bottom:1px solid var(--border-2);background:var(--muted)}.prose td{padding:9px 10px;border-bottom:1px solid var(--border);vertical-align:top}
  .prose blockquote{border-left:2px solid var(--border-2);margin:0 0 14px;padding:4px 16px;color:var(--muted-foreground)}.prose hr{border:0;border-top:1px solid var(--border-2);margin:28px 0}
  .prose a{color:var(--blue);text-decoration:underline}
  .doclist{display:grid;gap:1px;background:var(--border-2);border:1px solid var(--border-2)}.doclist a{display:block;background:#fff;padding:16px 18px;text-decoration:none}.doclist a:hover{background:var(--muted)}.doclist b{display:block;font-weight:600;color:var(--heading);font-size:15px;margin-bottom:3px}.doclist span{font-size:13.5px;color:var(--muted-foreground)}
  @media (max-width:820px){.docs{grid-template-columns:1fr}.docs nav{position:static;height:auto;border-right:0;border-bottom:1px solid var(--border)}.prose{padding:24px 20px 80px}}
  </style></head><body>
  <header class="top"><a class="name" href="/"><span class="mark">SA</span>Seed assessments</a><div class="crumbs"><span>/</span><a href="/docs">Docs</a>${current ? `<span>/</span><b>${title}</b>` : ""}</div><div class="right"><a class="navlink" href="/">Open the app</a>${DEMO ? "" : `<a class="navlink" href="https://github.com/ishaanndas/northledge-assessor">GitHub</a>`}</div></header>
  <div class="docs"><nav><div class="seclabel">Documents</div>${nav}</nav><main class="prose">${bodyHtml}</main></div></body></html>`;
}
function docsIndex() {
  const list = DOCS.map((d) => `<a href="/docs/${d.id}"><b>${d.title}</b><span>${d.blurb}</span></a>`).join("");
  return docPage("Docs", `<h1>Documents</h1><p>${DEMO ? "How the screener works, the test cases and the decks to try it with. The app itself is at <a href=\"/\">/</a>." : `Everything that goes with the prototype. The app itself is at <a href="/">/</a>; the source is on <a href="https://github.com/ishaanndas/northledge-assessor">GitHub</a>.`}</p><div class="doclist">${list}</div>`, null);
}

http
  .createServer(async (req, res) => {
    const url = new URL(req.url, `http://localhost:${PORT}`);
    try {
      if (url.pathname.startsWith("/api/")) return await api(req, res, url);
      if (url.pathname === "/docs" || url.pathname === "/docs/") return send(res, 200, docsIndex(), "text/html; charset=utf-8");
      const dm = url.pathname.match(/^\/docs\/([a-z-]+)$/);
      if (dm) {
        const d = DOCS.find((x) => x.id === dm[1]); if (!d) return send(res, 404, "Not found", "text/plain");
        const f = path.join(ROOT, d.file); if (!fs.existsSync(f)) return send(res, 404, "Not found", "text/plain");
        return send(res, 200, docPage(d.title, markdownToHtml(fs.readFileSync(f, "utf8")), d.id), "text/html; charset=utf-8");
      }
      // Static: app/ first, then out/ (the committed report and markdown).
      let p = decodeURIComponent(url.pathname);
      if (p === "/" || p === "/index.html") p = "/app.html";
      const safe = path.normalize(p).replace(/^(\.\.[/\\])+/, "");
      if (/\/\./.test(safe)) return send(res, 404, "Not found", "text/plain"); // hidden files (uploads, inbox settings) are never served
      let f = path.join(APP_DIR, safe);
      if (!fs.existsSync(f)) f = path.join(OUT_DIR, safe);
      if (!fs.existsSync(f) && (safe.startsWith("/samples/") || safe.startsWith("/inbox/") || safe.startsWith("/companies/") || /^\/examples\/[^/]+\/files\//.test(safe))) f = path.join(ROOT, safe);
      fs.readFile(f, (err, data) => {
        if (err) return send(res, 404, "Not found", "text/plain");
        // ?download saves the file instead of opening it in the browser (used for the test decks).
        if (url.searchParams.has("download")) res.setHeader("Content-Disposition", `attachment; filename="${path.basename(f)}"`);
        send(res, 200, data, TYPES[path.extname(f)] || "application/octet-stream");
      });
    } catch (err) {
      send(res, 500, { error: err.message });
    }
  })
  .on("error", (err) => {
    if (err.code === "EADDRINUSE") { console.error(`Port ${PORT} is already in use. Another copy of the app is probably running; open http://localhost:${PORT} or stop it first (lsof -ti:${PORT} | xargs kill).`); process.exit(1); }
    throw err;
  })
  .listen(PORT, () => { try { tidyCompanies(); } catch (e) { console.error("tidy failed", e.message); }
    if (DEMO) { console.log("demo mode"); demoSweep(); setInterval(demoSweep, 15 * 60e3); } console.log(`app at http://localhost:${PORT}`); startWatcher({ companiesDir: COMPANIES_DIR, slugify, draft: (slug) => { startDraftJob(slug); } }); });
