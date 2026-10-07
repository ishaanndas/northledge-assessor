#!/usr/bin/env node
// Build the static demo: the same app, running entirely in the browser, for
// hosting inside another site (techbrig.co/vc-screener-demo). No server: a
// stand-in (static/mock.js) answers the app's requests from a bundled data
// file, every draft is a real one made earlier and replayed, and each
// viewer's edits stay in their own browser.
//
//   node scripts/build-static.mjs                      build into dist-static/
//   node scripts/build-static.mjs --into ../techbrig-landing
//        also install it: assets to public/demos/vc-screener/, the app page and
//        the documents to lib/demos/vc-screener/ (served by the site's routes)
//
// Paths baked in (match the host site):
//   assets  /demos/vc-screener/        (the site's public/ folder)
//   app     /vc-screener-demo/app      (a route that serves index.html)
//   docs    /vc-screener-demo/docs/<id>
import fs from "node:fs";
import path from "node:path";
import { ROOT } from "../lib/env.mjs";
import { listExamples, loadCompany, outDirFor, findCompanyDir } from "../lib/sources.mjs";
import { extractFile } from "../lib/extract.mjs";
import { markdownToHtml } from "../lib/markdown-html.mjs";

const INTO = process.argv.includes("--into") ? path.resolve(process.argv[process.argv.indexOf("--into") + 1]) : null;
const OUT = path.join(ROOT, "dist-static");
const BASE = "/demos/vc-screener/";
const APP = "/vc-screener-demo/app";
const DOCS = "/vc-screener-demo/docs";
const OWN = "https://northledge-assessor-production.up.railway.app";

fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });
const readJson = (f) => (fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, "utf8")) : null);
const copy = (from, to) => { fs.mkdirSync(path.dirname(to), { recursive: true }); fs.copyFileSync(from, to); };

// ---- companies ----
// A company's files are copied under files/<key>/ and given a url the app uses directly.
function bundle(slug, key, { keepIntake = false } = {}) {
  const dir = findCompanyDir(slug);
  if (!dir) throw new Error(`missing company ${slug}`);
  const ex = loadCompany(dir);
  const company = { ...readJson(path.join(dir, "company.json")) };
  if (!keepIntake) delete company.intake;
  const files = {};
  for (const [k, f] of Object.entries(company.files || {})) {
    copy(path.join(dir, "files", f.name), path.join(OUT, "files", key, f.name));
    files[k] = { ...f, url: `${BASE}files/${key}/${encodeURIComponent(f.name)}` };
  }
  company.files = files;
  const record = readJson(path.join(outDirFor(slug), "assessment.json"));
  const tags = readJson(path.join(outDirFor(slug), "tags.json"));
  if (!record) throw new Error(`${slug} is not drafted`);
  if (!tags?.ai) throw new Error(`${slug} has no tags; run node assess.mjs --tags-only ${slug}`);
  return { slug, company, sourceDocs: ex.sources.map((s) => ({ key: s.key, title: s.title, file: s.file, passages: s.passages })), record, tagsAi: tags.ai };
}

const companies = listExamples().map((slug) => bundle(slug, slug));

// The sample companies behind the inbox emails and the test decks.
const SAMPLES = { "relay-voice": "relay-voice", grainline: "grainline", tidewatch: "tidewatch", kestrel: "kestrel", "northwind-battery-analytics": "northwind-battery-analytics", parcelbee: "parcelbee", "lumina-health": "lumina-health" };
const samples = {};
for (const [key, slug] of Object.entries(SAMPLES)) {
  const b = bundle(slug, `s-${key}`);
  delete b.company.design_note; // a company added from a sample is not one of the built-in examples
  samples[key] = { company: b.company, sourceDocs: b.sourceDocs, record: b.record, tagsAi: b.tagsAi };
}

// ---- inbox ----
const byMessage = {};
for (const slug of Object.values(SAMPLES)) { const c = readJson(path.join(ROOT, "companies", slug, "company.json")); if (c?.intake?.message_id) byMessage[c.intake.message_id] = slug; }
const inbox = [];
for (const id of fs.readdirSync(path.join(ROOT, "inbox")).sort().reverse()) {
  const dir = path.join(ROOT, "inbox", id), m = readJson(path.join(dir, "message.json"));
  if (!m) continue;
  const sample = byMessage[id] || (/lumina/i.test(id) ? "lumina-health" : null);
  if (!sample) { console.warn("inbox email with no sample:", id); continue; }
  const attachments = fs.readdirSync(dir).filter((f) => f !== "message.json" && !f.startsWith(".")).map((f) => { copy(path.join(dir, f), path.join(OUT, "inbox", id, f)); return { name: f, bytes: fs.statSync(path.join(dir, f)).size, kind: path.extname(f).slice(1).toLowerCase() }; });
  inbox.push({ id, ...m, attachments, links: [], sample });
}

// ---- test decks: what reading each one returns, and the fields it fills ----
const normName = (n) => String(n).toLowerCase().replace(/\s*\(\d+\)|_\d+_/g, "").replace(/[^a-z0-9.]+/g, "-").replace(/-+\./g, ".");
const DECKS = { "relay-voice-deck": "relay-voice", "grainline-deck": "grainline", "tidewatch-deck": "tidewatch", "lumina-health-deck": "lumina-health", "kestrel-deck": "kestrel", "northwind-deck": "northwind-battery-analytics", "parcelbee-deck": "parcelbee", "parcelbee-call-notes": "parcelbee" };
const extracts = {};
for (const f of fs.readdirSync(path.join(ROOT, "samples"))) {
  const stem = f.replace(/\.[^.]+$/, ""), sample = DECKS[stem];
  if (!sample || !/\.(pdf|pptx|docx)$/.test(f)) continue;
  const r = await extractFile(f, fs.readFileSync(path.join(ROOT, "samples", f)));
  extracts[normName(f)] = { sample, text: r.text, meta: r.meta, kind: path.extname(f).slice(1), pages: r.meta.pages || r.meta.slides || null };
  copy(path.join(ROOT, "samples", f), path.join(OUT, "samples", f));
}
copy(path.join(ROOT, "samples", "test-decks.zip"), path.join(OUT, "samples", "test-decks.zip"));
const prefill = {};
for (const [key, s] of Object.entries(samples)) {
  const founders = s.sourceDocs.find((d) => d.key === "founders");
  prefill[key] = { company_name: s.company.name, one_liner: s.company.one_liner || "", round: s.company.ask || "", website_url: "", founder_bios: founders ? founders.passages.map((p) => p.text).join("\n\n") : "", confidence: "high" };
}

const data = { companies, samples, inbox, extracts, prefill, eval: readJson(path.join(ROOT, "out", "eval.json")) || [] };
fs.writeFileSync(path.join(OUT, "data.json"), JSON.stringify(data));

// ---- the app ----
for (const f of ["app.css", "doc.js", "app.js", "tour.js"]) copy(path.join(ROOT, "app", f), path.join(OUT, f));
copy(path.join(ROOT, "static", "mock.js"), path.join(OUT, "mock.js"));
const STATIC = `window.STATIC={base:${JSON.stringify(BASE)},docs:${JSON.stringify(DOCS)},app:${JSON.stringify(APP)},url:function(p){if(p==="/docs")return this.docs;if(p.indexOf("/docs/")===0)return this.docs+p.slice(5);if(p.indexOf("/samples/")===0)return this.base+"samples/"+p.slice(9).replace(/\\?download$/,"");if(p.indexOf("/inbox/")===0)return this.base+p.slice(1);return p;}};`;
const v = Date.now().toString(36);
fs.writeFileSync(path.join(OUT, "index.html"), `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>VC Deal Screener Demo | TechBrig</title>
<meta name="description" content="Interactive demo of a VC deal screener built on Claude: first-pass assessments where every claim is traced to its page.">
<meta name="robots" content="noindex">
<link rel="icon" href="/icon-tb.svg" type="image/svg+xml">
<link rel="stylesheet" href="${BASE}app.css?v=${v}">
<!--GA-->
</head><body>
<header class="top" id="top"></header>
<div id="main"></div>
<script>${STATIC}</script>
<script src="${BASE}doc.js?v=${v}"></script>
<script src="${BASE}mock.js?v=${v}"></script>
<script src="${BASE}app.js?v=${v}"></script>
<script src="${BASE}tour.js?v=${v}"></script>
</body></html>
`);

// ---- documents ----
// Only the product documents, rewritten for a copy with no server: links go to
// the bundled files, and passages about hosting are left out.
const dropSection = (md, heading) => md.replace(new RegExp(`\\n## ${heading}\\n[\\s\\S]*?(?=\\n## |$)`), "\n");
const swap = (md, from, to) => { if (!md.includes(from)) throw new Error(`docs text changed, update build-static: ${from.slice(0, 60)}`); return md.split(from).join(to); };
const DOCLIST = [
  { id: "demo-guide", file: "docs/DEMO-GUIDE.md", title: "Demo guide", blurb: "A five-minute click-through: what to click and what to point out." },
  { id: "test-cases", file: "docs/TEST-CASES.md", title: "Test cases", blurb: "What each example company hides to trip the tool up, and what the tool did." },
  { id: "test-decks", file: "samples/README.md", title: "Test decks", blurb: "Download the decks and try them in the demo." },
  { id: "how-it-works", file: "docs/TECHNICAL.md", title: "How it works", blurb: "Intake, drafting, the quote checks, the editor and the tags, in plain words." },
  { id: "evaluation", file: "docs/EVALUATION.md", title: "Evaluation", blurb: "The automated checks, what they found, and what they cannot see." },
  { id: "next-steps", file: "docs/NEXT-STEPS.md", title: "Next steps", blurb: "What it takes to run this on a fund's real deal flow." },
];
const EDITS = {
  "demo-guide": (md) => swap(swap(swap(md,
    "Click **Create and draft**. The draft takes two to three minutes:", "Click **Create and draft**. In this demo the draft is replayed from a real run in a few seconds; the live version takes two to three minutes:"),
    "- **A link to a deck will not open.** Google links have to be shared as \"Anyone with the link\". Downloading the file and dropping it in always works.", "- **A file or link will not load.** This demo runs in the browser with the sample decks only. Download one from the Test decks page and drop it in."),
    "- **The demo says the draft limit is reached.** The public demo allows a few new drafts per visitor per day. Every example company is already drafted and can be shown in full.", "- **You want a clean slate.** Click Start over in the bar at the top of the demo. Edits and added companies are kept only in your browser."),
  "test-decks": (md) => swap(md, "open the live app, click New company", "open the demo, click New company"),
  "how-it-works": (md) => dropSection(dropSection(md, "Keeping it working"), "Where it runs"),
};
const page = (title, body, current) => `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title} · VC Deal Screener Demo | TechBrig</title><meta name="robots" content="noindex"><link rel="icon" href="/icon-tb.svg" type="image/svg+xml"><link rel="stylesheet" href="${BASE}app.css?v=${v}"><style>
  body{display:block}.docs{display:grid;grid-template-columns:240px minmax(0,1fr);min-height:calc(100vh - 56px)}
  .docs nav{border-right:1px solid var(--border);background:oklch(99% 0 0);padding:20px 12px;position:sticky;top:0;align-self:start;height:calc(100vh - 56px);overflow:auto}
  .docs nav a{display:block;padding:7px 10px;border-radius:6px;font-size:13.5px;color:var(--muted-foreground)}.docs nav a:hover{background:var(--muted);color:var(--heading)}.docs nav a.on{background:var(--muted-2);color:var(--heading);font-weight:600}
  .docs nav .seclabel{padding:0 10px 8px}
  .prose{max-width:760px;padding:40px 48px 120px;font-size:15px;line-height:1.65;color:var(--foreground)}
  .prose h1{font-size:28px;font-weight:600;letter-spacing:-.5px;color:var(--heading);margin:0 0 18px}.prose h2{font-size:19px;font-weight:600;color:var(--heading);margin:36px 0 12px}.prose h3{font-size:16px;font-weight:600;color:var(--heading);margin:24px 0 8px}
  .prose p{margin:0 0 14px}.prose ul,.prose ol{margin:0 0 16px;padding-left:22px}.prose li{margin:0 0 6px}
  .prose code{font-family:var(--mono);font-size:13px;background:var(--muted-2);padding:1px 5px}.prose pre{background:var(--muted-2);padding:14px 16px;overflow:auto;margin:0 0 16px}.prose pre code{background:none;padding:0}
  .prose .tbl{overflow:auto;margin:0 0 18px}.prose table{border-collapse:collapse;font-size:13.5px;width:100%}.prose th,.prose td{border:1px solid var(--border-2);padding:8px 10px;text-align:left;vertical-align:top}.prose th{background:var(--muted);font-weight:600;color:var(--heading)}
  .prose blockquote{border-left:2px solid var(--border-2);margin:0 0 14px;padding:4px 16px;color:var(--muted-foreground)}.prose hr{border:0;border-top:1px solid var(--border-2);margin:28px 0}.prose a{color:var(--blue);text-decoration:underline}
  .doclist{display:grid;gap:1px;background:var(--border-2);border:1px solid var(--border-2)}.doclist a{display:block;background:#fff;padding:16px 18px;text-decoration:none}.doclist a:hover{background:var(--muted)}.doclist b{display:block;font-weight:600;color:var(--heading);font-size:15px;margin-bottom:3px}.doclist span{font-size:13.5px;color:var(--muted-foreground)}
  @media (max-width:820px){.docs{grid-template-columns:1fr}.docs nav{position:static;height:auto;border-right:0;border-bottom:1px solid var(--border)}.prose{padding:24px 20px 80px}}
  </style><!--GA--></head><body>
  <header class="top"><a class="name" href="${APP}"><span class="mark">SA</span>Seed assessments</a><div class="crumbs"><span>/</span><a href="${DOCS}">Docs</a>${current ? `<span>/</span><b>${title}</b>` : ""}</div><div class="right"><a class="navlink" href="${APP}">Open the demo</a><a class="navlink" href="/vc-screener-demo">About this demo</a></div></header>
  <div class="docs"><nav><div class="seclabel">Documents</div>${DOCLIST.map((d) => `<a href="${DOCS}/${d.id}" class="${d.id === current ? "on" : ""}">${d.title}</a>`).join("")}</nav><main class="prose">${body}</main></div></body></html>`;
const fixLinks = (html) => html
  .split(`href="${OWN}/samples/`).join(`href="${BASE}samples/`)
  .split(`href="${OWN}/docs/`).join(`href="${DOCS}/`)
  .replace(/href="\/docs\//g, `href="${DOCS}/`)
  .replace(/href="\/samples\//g, `href="${BASE}samples/`)
  .replace(/(href="[^"]*?)\?download"/g, '$1"');
fs.mkdirSync(path.join(OUT, "docs"), { recursive: true });
for (const d of DOCLIST) {
  let md = fs.readFileSync(path.join(ROOT, d.file), "utf8");
  if (EDITS[d.id]) md = EDITS[d.id](md);
  const html = fixLinks(markdownToHtml(md));
  if (html.includes("railway.app") || html.includes("github.com/ishaanndas")) throw new Error(`${d.id} still links to the hosted app or the repo`);
  fs.writeFileSync(path.join(OUT, "docs", `${d.id}.html`), page(d.title, html, d.id));
}
fs.writeFileSync(path.join(OUT, "docs", "index.html"), page("Docs", `<h1>Documents</h1><p>How the screener works, the test cases, and the decks to try it with. The demo itself is at <a href="${APP}">${APP}</a>.</p><div class="doclist">${DOCLIST.map((d) => `<a href="${DOCS}/${d.id}"><b>${d.title}</b><span>${d.blurb}</span></a>`).join("")}</div>`, null));

const size = (p) => { let n = 0; for (const f of fs.readdirSync(p, { withFileTypes: true })) n += f.isDirectory() ? size(path.join(p, f.name)) : fs.statSync(path.join(p, f.name)).size; return n; };
console.log(`built ${OUT}: ${companies.length} examples, ${Object.keys(samples).length} samples, ${inbox.length} inbox emails, ${Object.keys(extracts).length} readable decks, ${(size(OUT) / 1e6).toFixed(1)} MB`);

if (INTO) {
  if (!fs.existsSync(path.join(INTO, "app", "site.css"))) throw new Error(`${INTO} does not look like the techbrig-landing repo`);
  const pub = path.join(INTO, "public", "demos", "vc-screener"), lib = path.join(INTO, "lib", "demos", "vc-screener");
  fs.rmSync(pub, { recursive: true, force: true }); fs.rmSync(lib, { recursive: true, force: true });
  fs.cpSync(OUT, pub, { recursive: true });
  fs.mkdirSync(path.join(lib, "docs"), { recursive: true });
  fs.renameSync(path.join(pub, "index.html"), path.join(lib, "app.html"));
  for (const f of fs.readdirSync(path.join(pub, "docs"))) fs.renameSync(path.join(pub, "docs", f), path.join(lib, "docs", f));
  fs.rmdirSync(path.join(pub, "docs"));
  console.log(`installed into ${INTO}`);
}
