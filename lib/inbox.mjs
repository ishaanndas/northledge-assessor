// The inbox. A real deployment connects a mailbox (Gmail or Microsoft 365
// through OAuth, or a forwarding address); this build watches a local drop
// folder with the same shape so the flow can be exercised end to end.
//
//   inbox/<message-id>/message.json   { from, subject, date, body }
//   inbox/<message-id>/<attachments>  deck.pdf, notes.docx, ...
//
// A message is "imported" when a company folder has been created from it.
import fs from "node:fs";
import path from "node:path";
import { ROOT } from "./env.mjs";
import { extractFile, extractUrl } from "./extract.mjs";
import { prefillFromDeck } from "./prefill.mjs";

export const INBOX_DIR = path.join(ROOT, "inbox");
// Kept with the companies (on the hosted disk), so a redeploy does not make
// already-imported messages look new and get imported a second time.
const STATE = path.join(ROOT, "companies", ".inbox-imported.json");
// The companies themselves are the record of what has been imported: each
// stores the message it came from. Rebuilt from disk on every read, so it can
// never drift from what actually exists.
function readState() {
  const out = {}; const dir = path.join(ROOT, "companies");
  if (!fs.existsSync(dir)) return out;
  for (const slug of fs.readdirSync(dir)) {
    const f = path.join(dir, slug, "company.json"); if (!fs.existsSync(f)) continue;
    try { const c = JSON.parse(fs.readFileSync(f, "utf8")); const id = c.intake?.via === "inbox" && c.intake.message_id; if (!id) continue;
      if (!out[id] || (c.created_at || "") < (out[id].at || "")) out[id] = { slug, at: c.created_at || "" }; } catch {}
  }
  return out;
}
// Connection settings live next to the companies so they persist on the hosted volume.
const SETTINGS = path.join(ROOT, "companies", ".inbox-settings.json");
const DEFAULTS = { providers: {}, forwarding: null, autoImport: false, autoDraft: false, rule: { attachments: ["pdf", "pptx", "docx"], subjectKeywords: ["deck", "seed", "pre-seed", "round", "pitch", "intro"] } };
export function forgetImport() { /* nothing to do: the record is the company folder itself */ }
export function readSettings() { try { return { ...DEFAULTS, ...JSON.parse(fs.readFileSync(SETTINGS, "utf8")) }; } catch { return { ...DEFAULTS }; } }
export function writeSettings(patch) { const next = { ...readSettings(), ...patch }; fs.mkdirSync(path.dirname(SETTINGS), { recursive: true }); fs.writeFileSync(SETTINGS, JSON.stringify(next, null, 2)); return next; }

export function connectorStatus() {
  const st = readSettings();
  const live = (id) => !!(id === "gmail" ? process.env.GMAIL_CLIENT_ID : process.env.MS_GRAPH_CLIENT_ID);
  const prov = (id, name, needs) => {
    const cfg = st.providers[id];
    const state = live(id) && cfg ? "connected" : cfg ? "pending" : "off";
    return { id, name, state, detail: state === "connected" ? `Watching ${cfg.watch} for ${cfg.account}` : state === "pending" ? `Set up for ${cfg.account}, watching ${cfg.watch}. Goes live when the ${needs} are added.` : `Not connected`, config: cfg || null };
  };
  return {
    providers: [
      prov("gmail", "Gmail / Google Workspace", "Google OAuth credentials"),
      prov("m365", "Microsoft 365 / Outlook", "Microsoft app registration"),
      { id: "forward", name: "Forwarding address", state: st.forwarding ? "pending" : "off", detail: st.forwarding ? `${st.forwarding.address}. Mail to it is delivered once the inbound domain is pointed at this app.` : "Not set up", config: st.forwarding },
      { id: "folder", name: "Drop folder (this prototype)", state: "connected", detail: `Watching ${path.relative(ROOT, INBOX_DIR)}/ on this machine; stands in for a mailbox so the flow can be tried end to end.`, config: null },
    ],
    automation: { autoImport: st.autoImport, autoDraft: st.autoDraft },
    rule: st.rule,
    goal: "Decks should arrive by email and be ready for review, with nobody uploading anything. A connected mailbox or a forwarding address feeds this inbox; with automation on, each message becomes a drafted company on arrival.",
  };
}

export function listInbox() {
  const imported = readState();
  const messages = [];
  if (fs.existsSync(INBOX_DIR)) {
    for (const id of fs.readdirSync(INBOX_DIR).sort().reverse()) {
      const dir = path.join(INBOX_DIR, id), meta = path.join(dir, "message.json");
      if (!fs.existsSync(meta)) continue;
      const m = JSON.parse(fs.readFileSync(meta, "utf8"));
      const attachments = fs.readdirSync(dir).filter((f) => f !== "message.json" && !f.startsWith(".")).map((f) => ({ name: f, bytes: fs.statSync(path.join(dir, f)).size, kind: path.extname(f).slice(1).toLowerCase() }));
      const links = [...String(m.body || "").matchAll(/https?:\/\/[^\s)>"]+/g)].map((x) => x[0]);
      const imp = imported[id] && fs.existsSync(path.join(ROOT, "companies", imported[id].slug, "company.json")) ? imported[id] : null;
      messages.push({ id, ...m, attachments, links, imported: imp });
    }
  }
  return { status: connectorStatus(), messages };
}

// Automation: with autoImport on, new messages become companies as they arrive;
// with autoDraft on, each one is drafted too. Polls the drop folder; a mailbox
// connector would push into the same path.
let ticking = false;
export function startWatcher({ companiesDir, slugify, draft }) {
  setInterval(async () => {
    if (ticking) return; ticking = true;
    try {
      const st = readSettings(); if (!st.autoImport) return;
      for (const m of listInbox().messages.filter((x) => !x.imported)) {
        const r = await importInboxMessage(m.id, { companiesDir, slugify });
        if (st.autoDraft) { try { await draft(r.slug); } catch (e) { console.error("auto-draft failed", r.slug, e.message); } }
      }
    } catch (e) { console.error("inbox watcher", e.message); } finally { ticking = false; }
  }, 20000).unref();
}

const importing = new Map(); // message id -> promise, so a double click imports once
export function importInboxMessage(id, opts) {
  const prev = readState()[id];
  if (prev && fs.existsSync(path.join(opts.companiesDir, prev.slug, "company.json"))) return Promise.resolve({ slug: prev.slug, notes: ["already imported"], sources: [] });
  if (!importing.has(id)) importing.set(id, doImport(id, opts).finally(() => importing.delete(id)));
  return importing.get(id);
}
async function doImport(id, { companiesDir, slugify }) {
  const dir = path.join(INBOX_DIR, id);
  if (!fs.existsSync(path.join(dir, "message.json"))) throw new Error("No such message");
  const m = JSON.parse(fs.readFileSync(path.join(dir, "message.json"), "utf8"));
  const files = fs.readdirSync(dir).filter((f) => f !== "message.json" && !f.startsWith("."));
  const sources = {};
  const notes = [];
  const kept = {}; // source key -> {name, kind, pages, from}
  for (const f of files) {
    const ext = path.extname(f).toLowerCase();
    if (![".pdf", ".pptx", ".docx", ".md", ".txt"].includes(ext)) continue;
    const { text, meta } = await extractFile(f, fs.readFileSync(path.join(dir, f)));
    const key = /deck|pitch|overview/i.test(f) || [".pdf", ".pptx"].includes(ext) ? "deck" : /note|call|memo/i.test(f) ? "call-notes" : /founder|team|bio/i.test(f) ? "founders" : "attachment-" + path.basename(f, ext).toLowerCase().replace(/[^a-z0-9]+/g, "-");
    if (!kept[key]) kept[key] = { name: f, kind: { ".pdf": "pdf", ".pptx": "pptx", ".docx": "docx" }[ext] || "text", pages: meta.pages || meta.slides || null, from: path.join(dir, f) };
    sources[key] = sources[key] ? sources[key] + "\n\n" + text : text;
    notes.push(`${f}: ${meta.method}${meta.pages ? `, ${meta.pages} pages` : meta.slides ? `, ${meta.slides} slides` : ""}`);
  }
  // Fill the company fields from the deck, the same way the intake form does.
  let pre = null;
  if (sources.deck) {
    try { pre = await prefillFromDeck(sources.deck); notes.push(`fields from deck (${pre.confidence} confidence)`); } catch (e) { notes.push(`could not read fields from deck (${e.message})`); }
    if (pre?.founder_bios && !sources.founders) sources.founders = `# ${pre.company_name || m.company || "Founders"} — founder bios (from the deck)\n\n${pre.founder_bios}`;
  }
  // Fetch a website only when the sender gave a full link. The address read off
  // a deck is a suggestion: it can belong to someone else, so a person adds it.
  const links = [...String(m.body || "").matchAll(/https?:\/\/[^\s)>"]+/g)].map((x) => x[0]);
  const site = links.find((l) => !/docsend|dropbox|drive\.google|notion|pitch\.com|loom/i.test(l));
  if (site) { try { sources.website = (await extractUrl(site)).text; notes.push(`${site}: fetched`); } catch (e) { notes.push(`${site}: could not fetch (${e.message})`); } }
  sources.email = `# Email from ${m.from} — ${m.subject} (${m.date})\n\n${String(m.body || "").trim()}`;
  const name = m.company || pre?.company_name || (m.subject || "").replace(/^(fwd?|re):\s*/i, "").split(/[-–—:|]/)[0].trim() || "Untitled";
  const slug = slugify(name);
  const cdir = path.join(companiesDir, slug);
  fs.mkdirSync(path.join(cdir, "sources"), { recursive: true });
  const filesMeta = {};
  for (const [key, k] of Object.entries(kept)) { fs.mkdirSync(path.join(cdir, "files"), { recursive: true }); fs.copyFileSync(k.from, path.join(cdir, "files", k.name)); filesMeta[key] = { name: k.name, kind: k.kind, pages: k.pages }; }
  fs.writeFileSync(path.join(cdir, "company.json"), JSON.stringify({ slug, name, one_liner: m.one_liner || pre?.one_liner || "", ask: m.ask || pre?.round || "", created_at: new Date().toISOString(), intake: { via: "inbox", message_id: id, from: m.from, subject: m.subject, notes, suggestedWebsite: !site && pre?.website_url ? pre.website_url : null }, files: filesMeta }, null, 2));
  const order = ["deck", "website", "founders", "call-notes", "email"];
  Object.entries(sources).sort(([a], [b]) => ((order.indexOf(a) + 100) % 100) - ((order.indexOf(b) + 100) % 100)).forEach(([key, text], i) => {
    const titled = /^#\s/.test(text) ? text : `# ${name} — ${key}\n\n${text}`;
    fs.writeFileSync(path.join(cdir, "sources", `${String(i + 1).padStart(2, "0")}-${key}.md`), titled + "\n");
  });

  return { slug, notes, sources: Object.keys(sources) };
}
