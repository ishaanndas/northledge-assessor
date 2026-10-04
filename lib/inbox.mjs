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

export const INBOX_DIR = path.join(ROOT, "inbox");
const STATE = path.join(INBOX_DIR, ".imported.json");
const readState = () => (fs.existsSync(STATE) ? JSON.parse(fs.readFileSync(STATE, "utf8")) : {});

export function connectorStatus() {
  const gmail = !!process.env.GMAIL_CLIENT_ID, ms = !!process.env.MS_GRAPH_CLIENT_ID;
  return {
    providers: [
      { id: "gmail", name: "Gmail", connected: gmail, detail: gmail ? "Watching label Deal flow" : "Needs OAuth client credentials (GMAIL_CLIENT_ID)" },
      { id: "m365", name: "Microsoft 365", connected: ms, detail: ms ? "Watching folder Deal flow" : "Needs an app registration (MS_GRAPH_CLIENT_ID)" },
      { id: "folder", name: "Drop folder", connected: true, detail: `Watching ${path.relative(ROOT, INBOX_DIR)}/ on this machine` },
    ],
    rule: "Messages with a PDF, PPTX or DOCX attachment, or a deck link in the body, appear here. Nothing is drafted until an associate imports it.",
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
      messages.push({ id, ...m, attachments, links, imported: imported[id] || null });
    }
  }
  return { status: connectorStatus(), messages };
}

export async function importInboxMessage(id, { companiesDir, slugify }) {
  const dir = path.join(INBOX_DIR, id);
  if (!fs.existsSync(path.join(dir, "message.json"))) throw new Error("No such message");
  const m = JSON.parse(fs.readFileSync(path.join(dir, "message.json"), "utf8"));
  const files = fs.readdirSync(dir).filter((f) => f !== "message.json" && !f.startsWith("."));
  const sources = {};
  const notes = [];
  for (const f of files) {
    const ext = path.extname(f).toLowerCase();
    if (![".pdf", ".pptx", ".docx", ".md", ".txt"].includes(ext)) continue;
    const { text, meta } = await extractFile(f, fs.readFileSync(path.join(dir, f)));
    const key = /deck|pitch|overview/i.test(f) || [".pdf", ".pptx"].includes(ext) ? "deck" : /note|call|memo/i.test(f) ? "call-notes" : /founder|team|bio/i.test(f) ? "founders" : "attachment-" + path.basename(f, ext).toLowerCase().replace(/[^a-z0-9]+/g, "-");
    sources[key] = sources[key] ? sources[key] + "\n\n" + text : text;
    notes.push(`${f}: ${meta.method}${meta.pages ? `, ${meta.pages} pages` : meta.slides ? `, ${meta.slides} slides` : ""}`);
  }
  const links = [...String(m.body || "").matchAll(/https?:\/\/[^\s)>"]+/g)].map((x) => x[0]);
  const site = links.find((l) => !/docsend|dropbox|drive\.google|notion|pitch\.com|loom/i.test(l));
  if (site) { try { sources.website = (await extractUrl(site)).text; notes.push(`${site}: fetched`); } catch (e) { notes.push(`${site}: could not fetch (${e.message})`); } }
  sources.email = `# Email from ${m.from} — ${m.subject} (${m.date})\n\n${String(m.body || "").trim()}`;
  const name = m.company || (m.subject || "").replace(/^(fwd?|re):\s*/i, "").split(/[-–—:|]/)[0].trim() || "Untitled";
  const slug = slugify(name);
  const cdir = path.join(companiesDir, slug);
  fs.mkdirSync(path.join(cdir, "sources"), { recursive: true });
  fs.writeFileSync(path.join(cdir, "company.json"), JSON.stringify({ slug, name, one_liner: m.one_liner || "", ask: m.ask || "", created_at: new Date().toISOString(), intake: { via: "inbox", message_id: id, from: m.from, subject: m.subject, notes } }, null, 2));
  const order = ["deck", "website", "founders", "call-notes", "email"];
  Object.entries(sources).sort(([a], [b]) => ((order.indexOf(a) + 100) % 100) - ((order.indexOf(b) + 100) % 100)).forEach(([key, text], i) => {
    const titled = /^#\s/.test(text) ? text : `# ${name} — ${key}\n\n${text}`;
    fs.writeFileSync(path.join(cdir, "sources", `${String(i + 1).padStart(2, "0")}-${key}.md`), titled + "\n");
  });
  const st = readState(); st[id] = { slug, at: new Date().toISOString() }; fs.writeFileSync(STATE, JSON.stringify(st, null, 2));
  return { slug, notes, sources: Object.keys(sources) };
}
