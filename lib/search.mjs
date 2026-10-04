// Global search over everything the app knows: companies, source passages
// (decks, websites, notes, emails), drafted statements, missing items and
// inbox messages. Small data, so the index is built per query from disk.
import fs from "node:fs";
import path from "node:path";
import { listCompanies, loadCompany, outDirFor } from "./sources.mjs";
import { listInbox } from "./inbox.mjs";
import { statements } from "./verify.mjs";

const norm = (s) => String(s || "").toLowerCase().replace(/[‘’]/g, "'").replace(/[“”]/g, '"');
function score(text, q, terms) {
  const t = norm(text);
  if (!t) return 0;
  let sc = 0;
  if (t.includes(q)) sc += 10;
  const hits = terms.filter((w) => t.includes(w)).length;
  if (hits < terms.length) return sc; // require all terms unless the phrase matched
  sc += 4 * hits;
  if (t.startsWith(q)) sc += 3;
  return sc;
}
function snippet(text, q, terms) {
  const t = String(text || ""), lower = norm(t);
  let i = lower.indexOf(q); if (i < 0) for (const w of terms) { i = lower.indexOf(w); if (i >= 0) break; }
  if (i < 0) i = 0;
  const start = Math.max(0, i - 60), end = Math.min(t.length, i + 120);
  return (start > 0 ? "…" : "") + t.slice(start, end).replace(/\s+/g, " ") + (end < t.length ? "…" : "");
}

export function search(query, limit = 40) {
  const q = norm(query).trim();
  if (!q) return { query, results: [] };
  const terms = q.split(/\s+/).filter(Boolean);
  const out = [];
  const add = (r, text) => { const sc = score(text, q, terms); if (sc > 0) out.push({ ...r, score: sc, snippet: snippet(text, q, terms) }); };
  for (const { slug, dir, origin } of listCompanies()) {
    let c; try { c = loadCompany(dir); } catch { continue; }
    const name = c.company.name;
    add({ type: "company", title: name, subtitle: `${c.company.one_liner || ""}${c.company.ask ? " · " + c.company.ask : ""}`, href: `#/c/${slug}/review`, slug }, `${name} ${c.company.one_liner || ""} ${c.company.ask || ""} ${slug}`);
    for (const s of c.sources) {
      for (const p of s.passages) add({ type: "passage", title: `${p.id}`, subtitle: `${name} · ${s.title}`, href: `#/c/${slug}/sources?p=${encodeURIComponent(p.id)}`, slug }, p.text);
      if (c.company.files?.[s.key]) add({ type: "file", title: c.company.files[s.key].name, subtitle: `${name} · ${s.key}`, href: `#/c/${slug}/sources?p=${encodeURIComponent(s.key + ":1")}`, slug }, c.company.files[s.key].name);
    }
    const rec = (() => { const f = path.join(outDirFor(slug), "assessment.json"); return fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, "utf8")) : null; })();
    if (rec) {
      for (const { id, where, stmt } of statements(rec.assessment)) add({ type: "claim", title: stmt.text, subtitle: `${name} · ${where}`, href: `#/c/${slug}/review?s=${id}`, slug }, stmt.text);
      rec.assessment.missing.forEach((m, i) => add({ type: "gap", title: m.item, subtitle: `${name} · missing`, href: `#/c/${slug}/review?g=${i}`, slug }, `${m.item} ${m.why_it_matters}`));
      rec.assessment.integrity_notes.forEach((n) => add({ type: "flag", title: n, subtitle: `${name} · not evidence`, href: `#/c/${slug}/review?k=flags`, slug }, n));
      add({ type: "summary", title: "Summary", subtitle: name, href: `#/c/${slug}/review?k=summary`, slug }, rec.assessment.summary);
      add({ type: "bear", title: "The case against", subtitle: name, href: `#/c/${slug}/review?k=thesis`, slug }, rec.assessment.bear_case.thesis);
    }
  }
  for (const m of listInbox().messages) add({ type: "message", title: m.subject, subtitle: `${m.from} · ${m.date}${m.attachments.length ? " · " + m.attachments.map((a) => a.name).join(", ") : ""}`, href: `#/inbox`, id: m.id }, `${m.subject} ${m.from} ${m.body} ${m.attachments.map((a) => a.name).join(" ")}`);
  out.sort((a, b) => b.score - a.score);
  return { query, results: out.slice(0, limit), total: out.length };
}
