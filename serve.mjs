// The app server: static files from app/ plus a small JSON API over the same
// pipeline the CLI uses. No dependencies. Start with `node serve.mjs`.
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { ROOT } from "./lib/env.mjs";
import { OUT_DIR, COMPANIES_DIR, listCompanies, loadCompany, findCompanyDir, outDirFor } from "./lib/sources.mjs";
import { draftCompany } from "./lib/pipeline.mjs";

const PORT = Number(process.env.PORT || 4950);
const APP_DIR = path.join(ROOT, "app");
const TYPES = { ".html": "text/html; charset=utf-8", ".json": "application/json", ".md": "text/markdown; charset=utf-8", ".js": "text/javascript", ".css": "text/css" };
const SOURCE_ORDER = ["deck", "website", "founders", "call-notes"];
const running = new Map(); // slug -> true while a draft is in flight

const readJson = (f) => (fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, "utf8")) : null);
const send = (res, code, body, type = "application/json") => {
  res.writeHead(code, { "Content-Type": type, "Cache-Control": "no-store" });
  res.end(type === "application/json" ? JSON.stringify(body) : body);
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
      fs.writeFileSync(path.join(dir, "company.json"), JSON.stringify({ slug: newSlug, name: b.name.trim(), one_liner: (b.one_liner || "").trim(), ask: (b.ask || "").trim(), created_at: new Date().toISOString() }, null, 2));
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

  if (action === "review" && req.method === "PUT") {
    const b = await body(req);
    const doc = { reviewer: String(b.reviewer || "").trim(), note: String(b.note || ""), decisions: b.decisions || {}, updated: new Date().toISOString().slice(0, 16).replace("T", " ") + " UTC" };
    fs.mkdirSync(outDirFor(slug), { recursive: true });
    fs.writeFileSync(path.join(outDirFor(slug), "review.json"), JSON.stringify(doc, null, 2));
    return send(res, 200, doc);
  }

  return send(res, 404, { error: "not found" });
}

http
  .createServer(async (req, res) => {
    const url = new URL(req.url, `http://localhost:${PORT}`);
    try {
      if (url.pathname.startsWith("/api/")) return await api(req, res, url);
      // Static: app/ first, then out/ (the committed report and markdown).
      let p = decodeURIComponent(url.pathname);
      if (p === "/" || p === "/index.html") p = "/app.html";
      const safe = path.normalize(p).replace(/^(\.\.[/\\])+/, "");
      let f = path.join(APP_DIR, safe);
      if (!fs.existsSync(f)) f = path.join(OUT_DIR, safe);
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
  .listen(PORT, () => console.log(`app at http://localhost:${PORT}`));
