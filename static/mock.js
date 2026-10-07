// In-browser stand-in for the server, used by the static demo build (the copy
// that runs inside techbrig.co with no backend). It answers the same /api/*
// requests the app makes, from a bundled data file: the example companies,
// the sample inbox and the sample decks, each with a real draft made earlier.
// Each viewer's edits, tags, sends and imported companies are kept in their
// own browser (localStorage). Drafting is replayed from the real run.
// Load order: doc.js, this file, app.js, tour.js. window.STATIC is set first.
(function () {
  const S = window.STATIC;
  const BASE = S.base;
  const realFetch = window.fetch.bind(window);
  let DATA = null;
  const ready = realFetch(BASE + "data.json").then((r) => r.json()).then((d) => (DATA = d));

  // ---------- per-viewer state ----------
  const KEY = "vcs-demo-v1";
  const blank = () => ({ created: {}, reviews: {}, tags: {}, sent: {}, imported: {}, drafted: {}, settings: null });
  let st = (() => { try { return { ...blank(), ...JSON.parse(localStorage.getItem(KEY) || "{}") }; } catch { return blank(); } })();
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(st)); } catch {} };
  S.reset = () => { try { localStorage.removeItem(KEY); sessionStorage.clear(); } catch {} location.href = location.pathname + "#/"; location.reload(); };

  // ---------- companies ----------
  function all() {
    const ex = DATA.companies.map((c) => ({ ...c, origin: "example", drafted: true }));
    const mine = Object.values(st.created).map((x) => {
      const s = DATA.samples[x.sample];
      return { slug: x.slug, origin: "intake", sample: x.sample, company: { ...s.company, ...x.company, slug: x.slug, files: s.company.files }, sourceDocs: s.sourceDocs, record: s.record, tagsAi: s.tagsAi, drafted: !!st.drafted[x.slug] };
    });
    return [...ex, ...mine];
  }
  const find = (slug) => all().find((c) => c.slug === slug);
  const FIT = { good: "Good fit", possible: "Possible fit", not: "Not a fit" };
  const TAGS = { "needs-info": "Needs more info", "sources-disagree": "Sources disagree", "numbers-overstated": "Claims overstated", "warning-signs": "Warning signs", "paying-customers": "Paying customers", "pre-revenue": "Pre-revenue", "strong-team": "Strong team", "crowded-market": "Crowded market" };
  function effective(ai, p) {
    const fit = p && "fit" in p ? p.fit : ai?.fit ?? null;
    const tags = p && Array.isArray(p.tags) ? p.tags : (ai?.tags || []).map((t) => t.tag);
    return { fit, fitLabel: fit ? FIT[fit] : null, fitBy: p && "fit" in p ? (p.by || "the associate") : ai ? "ai" : null, tags, tagLabels: tags.map((t) => TAGS[t]).filter(Boolean), reasons: ai && fit === ai.fit ? ai.fit_reasons.map((r) => r.text) : [], changedBy: p?.by || null, changedAt: p?.at || null };
  }
  const running = (slug) => !!jobs.get(slug)?.running;
  const recordOf = (c) => (c.drafted && !running(c.slug) ? c.record : null);
  function summary(c) {
    const rec = recordOf(c), review = st.reviews[c.slug] || null;
    const sent = rec ? (st.sent[c.slug] || []).filter((x) => x.draft === rec.generated_at).pop() || null : null;
    return {
      slug: c.slug, origin: c.origin, ...c.company,
      status: sent ? "sent" : review ? "reviewed" : rec ? "drafted" : "sources",
      sent, tags: rec ? effective(c.tagsAi, st.tags[c.slug]) : null,
      sources: c.sourceDocs.map((s) => ({ key: s.key, passages: s.passages.length })),
      generated_at: rec?.generated_at ?? null, verification_summary: rec?.verification_summary ?? null,
      missing_count: rec?.assessment.missing.length ?? null,
      review: review ? { reviewer: review.reviewer, updated: review.updated } : null,
      running: running(c.slug),
    };
  }
  function detail(c) {
    const rec = recordOf(c);
    return { ...summary(c), sourceDocs: c.sourceDocs, record: rec, tagsDoc: rec ? { ai: c.tagsAi, person: st.tags[c.slug] || null } : null, reviewDoc: st.reviews[c.slug] || null, eval: DATA.eval.find((e) => e.slug === c.slug) || null };
  }
  function slugify(name) {
    const base = String(name).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "company";
    let slug = base, n = 2; while (find(slug)) slug = `${base}-${n++}`; return slug;
  }
  function create(sample, fields) {
    const s = DATA.samples[sample];
    const slug = slugify(fields.name || s.company.name);
    st.created[slug] = { slug, sample, company: { name: fields.name || s.company.name, one_liner: fields.one_liner ?? s.company.one_liner, ask: fields.ask ?? s.company.ask, created_at: new Date().toISOString(), intake: fields.intake || {} } };
    save(); return slug;
  }

  // ---------- drafting, replayed from the real run ----------
  const jobs = new Map();
  function startJob(slug) {
    const c = find(slug); if (!c || running(slug)) return jobs.get(slug);
    const r = c.record, v = r.verification_summary, fp = r.first_pass_verification;
    const passages = c.sourceDocs.reduce((n, s) => n + s.passages.length, 0);
    const ai = c.tagsAi;
    const steps = [
      [600, { step: "split", message: `${c.sourceDocs.length} sources split into ${passages} passages` }],
      [900, { step: "draft", message: "Drafting with Claude (replaying a real draft)" }],
      [5200, { step: "verify", message: `${fp?.statements ?? v.statements} statements, ${fp?.failed ?? 0} failed verification` }],
      ...(r.repairs ? [[1600, { step: "repair", message: `Asked the model to fix ${fp?.failed ?? "the"} failed quotes` }], [1600, { step: "reverify", message: `${v.failed} still unverified` }]] : []),
      [1200, { step: "done", message: "Draft saved", summary: v, seconds: r.seconds || 140 }],
      [1600, { step: "tags", message: ai ? `${FIT[ai.fit]}${ai.tags.length ? ", " + ai.tags.map((t) => TAGS[t.tag]).join(", ") : ""}` : "No tags" }],
    ];
    const job = { running: true, log: [], startedAt: Date.now() };
    jobs.set(slug, job);
    st.drafted[slug] = true; delete st.reviews[slug]; delete st.tags[slug]; save();
    let t = 0;
    steps.forEach(([ms, ev], i) => { t += ms; setTimeout(() => { job.log.push(ev); if (i === steps.length - 1) { job.running = false; job.finishedAt = Date.now(); } }, t); });
    return job;
  }

  // ---------- inbox ----------
  const DEFAULT_SETTINGS = { providers: {}, forwarding: null, autoImport: false, autoDraft: false };
  const settings = () => st.settings || { ...DEFAULT_SETTINGS };
  function status() {
    const s = settings();
    const prov = (id, name, needs) => { const cfg = s.providers[id]; const state = cfg ? "pending" : "off"; return { id, name, state, detail: cfg ? `Set up, watching ${cfg.watch}. Goes live when the ${needs} are added.` : "Not connected", config: cfg || null }; };
    return {
      providers: [
        prov("gmail", "Gmail / Google Workspace", "Google OAuth credentials"),
        prov("m365", "Microsoft 365 / Outlook", "Microsoft app registration"),
        { id: "forward", name: "Forwarding address", state: s.forwarding ? "pending" : "off", detail: s.forwarding ? `${s.forwarding.address}. Mail to it is delivered once the inbound domain is pointed at the app.` : "Not set up", config: s.forwarding },
        { id: "folder", name: "Sample emails", state: "connected", detail: "Sample emails for this demo. They stand in for a real mailbox so the whole flow can be tried.", config: null },
      ],
      automation: { autoImport: s.autoImport, autoDraft: s.autoDraft },
      rule: { attachments: ["pdf", "pptx", "docx"] },
      goal: "Decks arrive by email and are ready for review, with nobody uploading anything. A connected mailbox or a forwarding address feeds the inbox; with both switches below on, each email becomes a drafted company as it arrives.",
    };
  }
  function inbox() {
    return { status: status(), messages: DATA.inbox.map((m) => ({ ...m, imported: st.imported[m.id] && find(st.imported[m.id]) ? { slug: st.imported[m.id] } : null })) };
  }
  function importMessage(id) {
    const m = DATA.inbox.find((x) => x.id === id); if (!m) throw new Error("No such email");
    const prev = st.imported[id]; if (prev && find(prev)) return { slug: prev, notes: ["already imported"], sources: [] };
    const slug = create(m.sample, { intake: { via: "inbox", message_id: id, from: m.from, subject: m.subject, notes: ["Deck read from the attachment", "Details filled in from the deck"] } });
    st.imported[id] = slug; save();
    if (settings().autoDraft) startJob(slug);
    return { slug, notes: ["Deck read from the attachment"], sources: DATA.samples[m.sample].sourceDocs.map((s) => s.key) };
  }

  // ---------- search (mirrors lib/search.mjs) ----------
  const norm = (s) => String(s || "").toLowerCase().replace(/[‘’]/g, "'").replace(/[“”]/g, '"');
  function search(query) {
    const q = norm(query).trim(); if (!q) return { query, results: [] };
    const terms = q.split(/\s+/).filter(Boolean), out = [];
    const score = (text) => { const t = norm(text); if (!t) return 0; let sc = t.includes(q) ? 10 : 0; const hits = terms.filter((w) => t.includes(w)).length; if (hits < terms.length) return sc; sc += 4 * hits; if (t.startsWith(q)) sc += 3; return sc; };
    const snip = (text) => { const t = String(text || ""), lower = norm(t); let i = lower.indexOf(q); if (i < 0) for (const w of terms) { i = lower.indexOf(w); if (i >= 0) break; } if (i < 0) i = 0; const a = Math.max(0, i - 60), b = Math.min(t.length, i + 120); return (a > 0 ? "…" : "") + t.slice(a, b).replace(/\s+/g, " ") + (b < t.length ? "…" : ""); };
    const add = (r, text) => { const sc = score(text); if (sc > 0) out.push({ ...r, score: sc, snippet: snip(text) }); };
    for (const c of all()) {
      const name = c.company.name, slug = c.slug;
      add({ type: "company", title: name, subtitle: `${c.company.one_liner || ""}${c.company.ask ? " · " + c.company.ask : ""}`, href: `#/c/${slug}`, slug }, `${name} ${c.company.one_liner || ""} ${c.company.ask || ""} ${slug}`);
      for (const s of c.sourceDocs) for (const p of s.passages) add({ type: "passage", title: p.id, subtitle: `${name} · ${s.title}`, href: `#/c/${slug}/sources?p=${encodeURIComponent(p.id)}`, slug }, p.text);
      const rec = recordOf(c); if (!rec) continue;
      const a = rec.assessment;
      a.dimensions.forEach((d, di) => d.claims.forEach((s, ci) => add({ type: "claim", title: s.text, subtitle: `${name} · ${d.name}`, href: `#/c/${slug}?s=d${di}.c${ci}`, slug }, s.text)));
      a.contradictions.forEach((s, i) => add({ type: "claim", title: s.text, subtitle: `${name} · Contradictions`, href: `#/c/${slug}?s=x${i}`, slug }, s.text));
      a.bear_case.points.forEach((s, i) => add({ type: "claim", title: s.text, subtitle: `${name} · Bear case`, href: `#/c/${slug}?s=b${i}`, slug }, s.text));
      a.missing.forEach((m, i) => add({ type: "gap", title: m.item, subtitle: `${name} · missing`, href: `#/c/${slug}?g=${i}`, slug }, `${m.item} ${m.why_it_matters}`));
      a.integrity_notes.forEach((n) => add({ type: "flag", title: n, subtitle: `${name} · not evidence`, href: `#/c/${slug}?k=flags`, slug }, n));
      add({ type: "summary", title: "Summary", subtitle: name, href: `#/c/${slug}?k=summary`, slug }, a.summary);
      add({ type: "bear", title: "The case against", subtitle: name, href: `#/c/${slug}?k=thesis`, slug }, a.bear_case.thesis);
    }
    for (const m of DATA.inbox) add({ type: "message", title: m.subject, subtitle: `${m.from} · ${m.date}`, href: "#/inbox", id: m.id }, `${m.subject} ${m.from} ${m.body}`);
    out.sort((x, y) => y.score - x.score);
    return { query, results: out.slice(0, 40), total: out.length };
  }

  // ---------- export (mirrors lib/export.mjs) ----------
  const unesc = (s) => String(s || "").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, "&");
  const htmlToMd = (h) => unesc(String(h || "").replace(/<br\s*\/?>/gi, "\n").replace(/<(b|strong)>(.*?)<\/\1>/gi, "**$2**").replace(/<(i|em)>(.*?)<\/\1>/gi, "*$2*").replace(/<a [^>]*href="([^"]*)"[^>]*>(.*?)<\/a>/gi, "[$2]($1)").replace(/<[^>]+>/g, ""));
  function blocksFor(c) {
    const rec = recordOf(c), rv = st.reviews[c.slug] || {};
    const cc = { ...c.company, record: rec, reviewDoc: st.reviews[c.slug] || null, tagsView: effective(c.tagsAi, st.tags[c.slug]) };
    return window.Doc.buildBlocks(cc, { mode: "partner", decisions: rv.decisions || {}, overrides: rv.overrides || {}, reviewer: rv.reviewer, note: rv.note });
  }
  function toMarkdown(c) {
    const L = [];
    for (const b of blocksFor(c)) {
      const text = b.rich ? htmlToMd(b.html) : b.text;
      switch (b.type) {
        case "label": L.push(`_${text}_`, ""); break;
        case "title": L.push(`# ${text}`, ""); break;
        case "meta": L.push(text, ""); break;
        case "h2": L.push(`## ${text}`, ""); break;
        case "h3": case "h": L.push(`### ${text}`, ""); break;
        case "flags": L.push(...b.items.map((n) => `- ${n}`), ""); break;
        case "claim": L.push(`- ${text} ${(b.stmt.citations || []).map((x) => `[${x.passage_id}]`).join(" ")}`); break;
        case "bullet": case "gap": L.push(`- ${text}`); break;
        case "quote": L.push(`> ${text}`, ""); break;
        case "divider": L.push("---", ""); break;
        case "checks": break;
        default: if (text) L.push(text, "");
      }
    }
    return L.join("\n").replace(/\n(- [^\n]*)\n(?!- |\n)/g, "\n$1\n\n").trim() + "\n";
  }
  const toText = (c) => toMarkdown(c).replace(/^#+\s*/gm, "").replace(/\*\*(.*?)\*\*/g, "$1").replace(/\*(.*?)\*/g, "$1").replace(/^_(.*)_$/gm, "$1").replace(/^> /gm, "");
  const xesc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  function runs(html) {
    const out = [], re = /<br\s*\/?>|<(\/?)(b|strong|i|em)>|<a [^>]*>|<\/a>|[^<]+/gi; let bold = 0, ital = 0, m;
    while ((m = re.exec(String(html || "")))) { const t = m[0]; if (/^<br/i.test(t)) out.push({ br: true }); else if (m[2]) { const on = !m[1]; if (/^(b|strong)$/i.test(m[2])) bold += on ? 1 : -1; else ital += on ? 1 : -1; } else if (/^<\/?a/i.test(t)) continue; else out.push({ text: unesc(t), bold: bold > 0, ital: ital > 0 }); }
    return out;
  }
  const para = (content, style, o = {}) => `<w:p><w:pPr>${style ? `<w:pStyle w:val="${style}"/>` : ""}${o.bullet ? `<w:numPr><w:ilvl w:val="0"/><w:numId w:val="1"/></w:numPr>` : ""}</w:pPr>${content.map((r) => r.br ? `<w:r><w:br/></w:r>` : `<w:r>${r.bold || r.ital ? `<w:rPr>${r.bold ? "<w:b/>" : ""}${r.ital ? "<w:i/>" : ""}</w:rPr>` : ""}<w:t xml:space="preserve">${xesc(r.text)}</w:t></w:r>`).join("")}</w:p>`;
  function toDocx(c) {
    const P = [];
    for (const b of blocksFor(c)) {
      const content = b.rich ? runs(b.html) : [{ text: b.text || "" }];
      switch (b.type) {
        case "label": P.push(para(content, "Label")); break;
        case "title": P.push(para(content, "Title")); break;
        case "meta": P.push(para(content, "Meta")); break;
        case "h2": P.push(para(content, "Heading2")); break;
        case "h3": case "h": P.push(para(content, "Heading3")); break;
        case "flags": b.items.forEach((n) => P.push(para([{ text: n }], "Normal", { bullet: true }))); break;
        case "claim": P.push(para([{ text: b.text }, { text: "  " + (b.stmt.citations || []).map((x) => x.passage_id).join(", ") }], "Normal", { bullet: true })); break;
        case "bullet": case "gap": P.push(para(content, "Normal", { bullet: true })); break;
        case "quote": P.push(para(content, "Quote")); break;
        case "divider": P.push(para([{ text: "" }], "Normal")); break;
        case "checks": break;
        default: P.push(para(content, b.type === "summary" || b.type === "note" ? "Body" : "Normal"));
      }
    }
    const W = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"', X = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
    const sty = (id, name, rpr, ppr = "") => `<w:style w:type="paragraph" w:styleId="${id}"><w:name w:val="${name}"/><w:basedOn w:val="Normal"/>${ppr ? `<w:pPr>${ppr}</w:pPr>` : ""}<w:rPr>${rpr}</w:rPr></w:style>`;
    const files = [
      ["[Content_Types].xml", `${X}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/><Override PartName="/word/numbering.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml"/></Types>`],
      ["_rels/.rels", `${X}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`],
      ["word/document.xml", `${X}<w:document ${W}><w:body>${P.join("")}<w:sectPr><w:pgSz w:w="12240" w:h="15840"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" w:header="708" w:footer="708" w:gutter="0"/></w:sectPr></w:body></w:document>`],
      ["word/_rels/document.xml.rels", `${X}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/numbering" Target="numbering.xml"/></Relationships>`],
      ["word/styles.xml", `${X}<w:styles ${W}><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:cs="Calibri"/><w:sz w:val="22"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="120" w:line="276" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults><w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/></w:style>${sty("Title", "Title", '<w:b/><w:sz w:val="44"/><w:color w:val="17181A"/>', '<w:spacing w:after="80"/>')}${sty("Label", "Label", '<w:caps/><w:sz w:val="16"/><w:color w:val="8A8C92"/>')}${sty("Meta", "Meta", '<w:sz w:val="20"/><w:color w:val="55575C"/>', '<w:spacing w:after="40"/>')}${sty("Heading2", "heading 2", '<w:b/><w:caps/><w:sz w:val="18"/><w:color w:val="8A8C92"/>', '<w:keepNext/><w:spacing w:before="360" w:after="120"/>')}${sty("Heading3", "heading 3", '<w:b/><w:sz w:val="26"/>', '<w:keepNext/><w:spacing w:before="240" w:after="80"/>')}${sty("Body", "Body", '<w:sz w:val="23"/>')}${sty("Quote", "Quote", '<w:i/><w:color w:val="55575C"/>', '<w:ind w:left="567"/>')}</w:styles>`],
      ["word/numbering.xml", `${X}<w:numbering ${W}><w:abstractNum w:abstractNumId="0"><w:lvl w:ilvl="0"><w:start w:val="1"/><w:numFmt w:val="bullet"/><w:lvlText w:val="•"/><w:lvlJc w:val="left"/><w:pPr><w:ind w:left="720" w:hanging="360"/></w:pPr></w:lvl></w:abstractNum><w:num w:numId="1"><w:abstractNumId w:val="0"/></w:num></w:numbering>`],
    ];
    return zip(files);
  }
  // A stored (uncompressed) zip, which Word opens fine.
  const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
  const crc32 = (b) => { let c = 0xffffffff; for (let i = 0; i < b.length; i++) c = CRC[(c ^ b[i]) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  function zip(files) {
    const enc = new TextEncoder(), parts = [], central = []; let offset = 0;
    for (const [name, text] of files) {
      const data = enc.encode(text), nb = enc.encode(name), crc = crc32(data);
      const lh = new DataView(new ArrayBuffer(30)); [[0, 0x04034b50, 4], [4, 20, 2], [6, 0, 2], [8, 0, 2], [10, 0, 2], [12, 0, 2], [14, crc, 4], [18, data.length, 4], [22, data.length, 4], [26, nb.length, 2], [28, 0, 2]].forEach(([o, v, s]) => (s === 4 ? lh.setUint32(o, v, true) : lh.setUint16(o, v, true)));
      const cd = new DataView(new ArrayBuffer(46)); [[0, 0x02014b50, 4], [4, 20, 2], [6, 20, 2], [8, 0, 2], [10, 0, 2], [12, 0, 2], [14, 0, 2], [16, crc, 4], [20, data.length, 4], [24, data.length, 4], [28, nb.length, 2], [30, 0, 2], [32, 0, 2], [34, 0, 2], [36, 0, 2], [38, 0, 4], [42, offset, 4]].forEach(([o, v, s]) => (s === 4 ? cd.setUint32(o, v, true) : cd.setUint16(o, v, true)));
      parts.push(new Uint8Array(lh.buffer), nb, data); central.push(new Uint8Array(cd.buffer), nb); offset += 30 + nb.length + data.length;
    }
    const cdLen = central.reduce((n, p) => n + p.length, 0);
    const end = new DataView(new ArrayBuffer(22)); [[0, 0x06054b50, 4], [4, 0, 2], [6, 0, 2], [8, files.length, 2], [10, files.length, 2], [12, cdLen, 4], [16, offset, 4], [20, 0, 2]].forEach(([o, v, s]) => (s === 4 ? end.setUint32(o, v, true) : end.setUint16(o, v, true)));
    return new Blob([...parts, ...central, new Uint8Array(end.buffer)], { type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" });
  }
  function download(blob, name) { const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000); }
  // Export links are plain anchors in the app; build the file here instead.
  document.addEventListener("click", async (e) => {
    const a = e.target.closest && e.target.closest('a[href^="/api/companies/"]'); if (!a) return;
    const m = a.getAttribute("href").match(/^\/api\/companies\/([^/]+)\/export\?format=(\w+)/); if (!m) return;
    e.preventDefault(); await ready;
    const c = find(m[1]); if (!c) return;
    if (m[2] === "docx") download(toDocx(c), `${c.slug}-assessment.docx`);
    else download(new Blob([toMarkdown(c)], { type: "text/markdown" }), `${c.slug}-assessment.md`);
  }, true);

  // ---------- the fake fetch ----------
  const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const NOT_HERE = "This demo runs in your browser with sample decks, so it cannot read other files or links. Download a test deck from the link below the box and drop it here.";
  const normName = (n) => String(n).toLowerCase().replace(/\s*\(\d+\)|_\d+_/g, "").replace(/[^a-z0-9.]+/g, "-").replace(/-+\./g, ".");

  async function api(method, url, body) {
    const p = url.pathname.split("/").filter(Boolean); // api, x, y, z
    if (p[1] === "config") return json({ demo: true, static: true });
    if (p[1] === "search") return json(search(url.searchParams.get("q") || ""));
    if (p[1] === "extract" && method === "POST") {
      await wait(700);
      if (body.url) return json({ error: NOT_HERE }, 422);
      const hit = DATA.extracts[normName(body.filename || "")];
      if (!hit) return json({ error: NOT_HERE }, 422);
      return json({ text: hit.text, meta: { ...hit.meta, filename: body.filename }, file: { token: hit.sample, name: body.filename, kind: hit.kind, pages: hit.pages } });
    }
    if (p[1] === "prefill" && method === "POST") {
      await wait(1100);
      const hit = Object.values(DATA.extracts).find((x) => x.text === body.deck) || Object.values(DATA.extracts).find((x) => String(body.deck || "").startsWith(x.text.slice(0, 200)));
      return hit ? json(DATA.prefill[hit.sample]) : json({ error: "Could not read the deck" }, 502);
    }
    if (p[1] === "inbox") {
      if (method === "GET" && !p[2]) return json(inbox());
      if (method === "PUT" && p[2] === "settings") {
        const s = settings();
        if (body.provider) s.providers = { ...s.providers, [body.provider]: { account: "", watch: String(body.watch || "").trim() || (body.provider === "gmail" ? "label Deal flow" : "folder Deal flow"), setAt: new Date().toISOString() } };
        if (body.disconnect) { s.providers = { ...s.providers }; delete s.providers[body.disconnect]; if (body.disconnect === "forward") s.forwarding = null; }
        if (body.forwarding) s.forwarding = { address: `deals-${Math.random().toString(36).slice(2, 8)}@inbound.assessments.example`, setAt: new Date().toISOString() };
        if (typeof body.autoImport === "boolean") s.autoImport = body.autoImport;
        if (typeof body.autoDraft === "boolean") s.autoDraft = body.autoDraft;
        st.settings = s; save();
        if (s.autoImport) setTimeout(() => DATA.inbox.forEach((m) => { if (!st.imported[m.id] || !find(st.imported[m.id])) importMessage(m.id); }), 800);
        return json(status());
      }
      if (method === "POST" && p[3] === "import") { await wait(900); try { return json(importMessage(decodeURIComponent(p[2])), 201); } catch (err) { return json({ error: err.message }, 422); } }
      return json({ error: "not found" }, 404);
    }
    if (p[1] !== "companies") return json({ error: "not found" }, 404);
    const slug = p[2], action = p[3];
    if (!slug) {
      if (method === "GET") return json(all().map(summary));
      if (method === "POST") {
        if (!body.name?.trim()) return json({ error: "name is required" }, 400);
        const token = Object.values(body.files || {}).map((f) => f?.token).find((t) => t && DATA.samples[t]);
        if (!token) return json({ error: "In this demo a company starts from one of the sample decks. Drop a test deck at the top of the page." }, 400);
        return json({ slug: create(token, { name: body.name.trim(), one_liner: (body.one_liner || "").trim(), ask: (body.ask || "").trim(), intake: body.intake || { via: "upload" } }) }, 201);
      }
    }
    const c = find(slug); if (!c) return json({ error: `no company ${slug}` }, 404);
    if (!action && method === "GET") return json(detail(c));
    if (!action && method === "DELETE") {
      if (c.origin === "example") return json({ error: "The built-in examples cannot be deleted." }, 403);
      for (const k of ["created", "reviews", "tags", "sent", "drafted"]) delete st[k][slug];
      for (const [id, s] of Object.entries(st.imported)) if (s === slug) delete st.imported[id];
      jobs.delete(slug); save(); return json({ ok: true });
    }
    if (action === "progress") { const j = jobs.get(slug); return json(j ? { running: j.running, log: j.log, error: null, drafted: true, known: true, startedAt: j.startedAt, finishedAt: j.finishedAt } : { running: false, log: [], error: null, drafted: c.drafted, known: false }); }
    if (action === "draft" && method === "POST") { const j = startJob(slug); return json({ running: j.running, startedAt: j.startedAt }, 202); }
    if (action === "website") return json({ error: "Reading websites needs the live version. This demo runs on the sample decks." }, 422);
    if (action === "review" && method === "PUT") { const doc = { reviewer: String(body.reviewer || "").trim(), note: String(body.note || ""), decisions: body.decisions || {}, overrides: body.overrides || {}, updated: new Date().toISOString().slice(0, 16).replace("T", " ") + " UTC" }; st.reviews[slug] = doc; save(); return json(doc); }
    if (action === "tags" && method === "POST") { await wait(1400); return json({ ai: c.tagsAi, person: st.tags[slug] || null }); }
    if (action === "tags" && method === "PUT") {
      if (body.reset) delete st.tags[slug];
      else { const person = { ...(st.tags[slug] || {}) }; if ("fit" in body) person.fit = body.fit; if (Array.isArray(body.tags)) person.tags = [...new Set(body.tags.filter((t) => TAGS[t]))]; person.by = String(body.by || "").trim() || "the associate"; person.at = new Date().toISOString(); st.tags[slug] = person; }
      save(); return json({ ai: c.tagsAi, person: st.tags[slug] || null });
    }
    if (action === "sent" && method === "POST") {
      const rec = recordOf(c); if (!rec) return json({ error: "Draft the assessment first." }, 409);
      const entry = { to: String(body.to || "").trim(), by: String(body.by || "").trim(), at: new Date().toISOString(), draft: rec.generated_at };
      (st.sent[slug] ||= []).push(entry); save(); return json(entry);
    }
    if (action === "export") { const f = url.searchParams.get("format"); return new Response(f === "txt" ? toText(c) : toMarkdown(c), { headers: { "Content-Type": "text/plain; charset=utf-8" } }); }
    return json({ error: "not found" }, 404);
  }

  window.fetch = async (input, init = {}) => {
    const raw = typeof input === "string" ? input : input.url;
    const url = new URL(raw, location.origin);
    if (url.origin === location.origin && (url.pathname.startsWith("/api/") || url.pathname === "/eval.json")) {
      await ready;
      if (url.pathname === "/eval.json") return json(DATA.eval);
      let body = {}; try { body = init.body ? JSON.parse(init.body) : {}; } catch {}
      try { return await api((init.method || "GET").toUpperCase(), url, body); } catch (err) { console.error(err); return json({ error: err.message }, 500); }
    }
    return realFetch(input, init);
  };
})();
