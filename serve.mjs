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
import { listInbox, importInboxMessage, INBOX_DIR, readSettings, writeSettings, startWatcher } from "./lib/inbox.mjs";
import { search } from "./lib/search.mjs";
import { toMarkdownApplied, toPlainText, toDocx } from "./lib/export.mjs";
import { markdownToHtml } from "./lib/markdown-html.mjs";

const PORT = Number(process.env.PORT || 4950);
const APP_DIR = path.join(ROOT, "app");
const TYPES = { ".html": "text/html; charset=utf-8", ".json": "application/json", ".md": "text/markdown; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".pdf": "application/pdf", ".pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation", ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document" };
const SOURCE_ORDER = ["deck", "website", "founders", "call-notes", "email"];
const running = new Map(); // slug -> true while a draft is in flight
const UPLOADS = path.join(ROOT, "uploads"); // files kept between extract and create; gitignored
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
  const ex = loadCompany(dir);
  return {
    slug,
    origin,
    ...company,
    status: review ? "reviewed" : record ? "drafted" : "sources",
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
  while (findCompanyDir(slug)) slug = `${base}-${n++}`;
  return slug;
}

async function api(req, res, url) {
  const parts = url.pathname.split("/").filter(Boolean); // api, companies, slug?, action?

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
      if (typeof b.autoDraft === "boolean") patch.autoDraft = b.autoDraft;
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
      fs.mkdirSync(path.join(dir, "sources"), { recursive: true });
      const files = {};
      for (const [key, f] of Object.entries(b.files || {})) {
        if (!f?.token) continue;
        const src = fs.readdirSync(UPLOADS).find((n) => n.startsWith(f.token + "__"));
        if (!src) continue;
        fs.mkdirSync(path.join(dir, "files"), { recursive: true });
        const name = src.split("__").slice(1).join("__");
        fs.renameSync(path.join(UPLOADS, src), path.join(dir, "files", name));
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
      reviewDoc: readJson(path.join(outDirFor(slug), "review.json")),
      eval: evalData.find((e) => e.slug === slug) || null,
    });
  }

  if (action === "draft" && req.method === "POST") {
    if (running.has(slug)) return send(res, 409, { error: "already running" });
    res.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-store", Connection: "keep-alive" });
    const emit = (e) => res.write(`data: ${JSON.stringify(e)}\n\n`);
    running.set(slug, true);
    try {
      // A fresh draft supersedes any review of the previous one.
      const reviewPath = path.join(outDirFor(slug), "review.json");
      if (fs.existsSync(reviewPath)) fs.unlinkSync(reviewPath);
      await draftCompany(slug, (e) => emit(e.step === "done" ? { step: "done", message: e.message, summary: e.record.verification_summary, seconds: e.record.seconds, usage: e.record.usage } : e));
    } catch (err) {
      emit({ step: "error", message: err.message });
    } finally {
      running.delete(slug);
      res.end();
    }
    return;
  }

  // Export with the review applied: ?format=md|txt|docx
  if (action === "export" && req.method === "GET") {
    const record = readJson(path.join(outDirFor(slug), "assessment.json"));
    if (!record) return send(res, 404, { error: "not drafted yet" });
    const company = readJson(path.join(dir, "company.json"));
    const c = { ...company, record, reviewDoc: readJson(path.join(outDirFor(slug), "review.json")) };
    const fmt = url.searchParams.get("format") || "md", base = `${slug}-assessment`;
    const dispo = (ext) => `attachment; filename="${base}.${ext}"`;
    if (fmt === "docx") { res.writeHead(200, { "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "Content-Disposition": dispo("docx") }); return res.end(toDocx(c)); }
    if (fmt === "txt") return send(res, 200, toPlainText(c), "text/plain; charset=utf-8");
    res.writeHead(200, { "Content-Type": "text/markdown; charset=utf-8", ...(url.searchParams.get("download") ? { "Content-Disposition": dispo("md") } : {}) }); return res.end(toMarkdownApplied(c));
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
const DOCS = [
  { id: "readme", file: "README.md", title: "README", blurb: "How to run it, key decisions, what was cut, what comes next, how AI tools were used." },
  { id: "brief", file: "BRIEF.md", title: "Product brief", blurb: "Two pages: who it is for, what v1 does and does not do, how success is measured, the three biggest risks, and why there is no probability score." },
  { id: "how-it-works", file: "docs/TECHNICAL.md", title: "How it works", blurb: "The pipeline, the verifier, the editor, the app, and what a production version would change." },
  { id: "evaluation", file: "docs/EVALUATION.md", title: "Evaluation", blurb: "What the automated checks are, what they found on the committed run, what they cannot see, and how to evaluate after a year of real decisions." },
  { id: "prd", file: "docs/PRD.md", title: "Product requirements", blurb: "The longer version of the brief: requirements, metrics, risks, rollout, roadmap." },
  { id: "eval-report", file: "out/eval-report.md", title: "Eval run", blurb: "The raw output of the last evaluation run: every flagged statement with the judge's reason." },
  { id: "test-decks", file: "samples/README.md", title: "Test decks", blurb: "The sample decks for testing intake, and everything planted in the trap deck." },
];
function docPage(title, bodyHtml, current) {
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
  <header class="top"><a class="name" href="/"><span class="mark">SA</span>Seed assessments</a><div class="crumbs"><span>/</span><a href="/docs">Docs</a>${current ? `<span>/</span><b>${title}</b>` : ""}</div><div class="right"><a class="navlink" href="/">Open the app</a><a class="navlink" href="https://github.com/ishaanndas/northledge-assessor">GitHub</a></div></header>
  <div class="docs"><nav><div class="seclabel">Documents</div>${nav}</nav><main class="prose">${bodyHtml}</main></div></body></html>`;
}
function docsIndex() {
  const list = DOCS.map((d) => `<a href="/docs/${d.id}"><b>${d.title}</b><span>${d.blurb}</span></a>`).join("");
  return docPage("Docs", `<h1>Documents</h1><p>Everything that goes with the prototype. The app itself is at <a href="/">/</a>; the source is on <a href="https://github.com/ishaanndas/northledge-assessor">GitHub</a>.</p><div class="doclist">${list}</div>`, null);
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
      let f = path.join(APP_DIR, safe);
      if (!fs.existsSync(f)) f = path.join(OUT_DIR, safe);
      if (!fs.existsSync(f) && (safe.startsWith("/samples/") || safe.startsWith("/inbox/") || safe.startsWith("/companies/") || /^\/examples\/[^/]+\/files\//.test(safe))) f = path.join(ROOT, safe);
      fs.readFile(f, (err, data) => {
        if (err) return send(res, 404, "Not found", "text/plain");
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
  .listen(PORT, () => { console.log(`app at http://localhost:${PORT}`); startWatcher({ companiesDir: COMPANIES_DIR, slugify, draft: (slug) => draftCompany(slug) }); });
