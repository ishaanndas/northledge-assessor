// Document renderer shared by the app and the static report. Plain script,
// defines window.Doc. Everything here is a pure function of a record plus
// review decisions; nothing fetches.
(function () {
  const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

  // Mirrors lib/verify.mjs normalize(), with an index map back to the raw string.
  function buildNorm(text) {
    let out = "", map = [];
    for (let i = 0; i < text.length; i++) {
      let ch = text[i].toLowerCase();
      if (/[‘’‚]/.test(ch)) ch = "'"; else if (/[“”„]/.test(ch)) ch = '"'; else if (/[–—−]/.test(ch)) ch = "-"; else if (/[*_`#>]/.test(ch)) continue;
      if (/\s/.test(ch)) { if (!out.length || out[out.length - 1] === " ") continue; ch = " "; }
      out += ch; map.push(i);
    }
    if (out.endsWith(" ")) { out = out.slice(0, -1); map.pop(); }
    return { out, map };
  }
  function highlight(text, quote) {
    const t = buildNorm(text), q = buildNorm(quote).out;
    if (!q) return esc(text);
    const i = t.out.indexOf(q);
    if (i < 0) return null;
    const s = t.map[i], e = t.map[i + q.length - 1] + 1;
    return esc(text.slice(0, s)) + "<mark>" + esc(text.slice(s, e)) + "</mark>" + esc(text.slice(e));
  }

  function statements(a) {
    const m = new Map();
    a.dimensions.forEach((d, di) => d.claims.forEach((c, ci) => m.set(`d${di}.c${ci}`, { stmt: c, where: d.name })));
    a.contradictions.forEach((c, i) => m.set(`x${i}`, { stmt: c, where: "Where the sources disagree" }));
    a.bear_case.points.forEach((c, i) => m.set(`b${i}`, { stmt: c, where: "The case against" }));
    return m;
  }

  // ---------------------------------------------------------------------------
  // Block model. The document is an ordered list of blocks. Blocks that come
  // from the model (claims, findings, summary, thesis, gaps) can be edited in
  // place or removed; the associate can also insert blocks of their own after
  // any block (paragraph, heading, bullet, quote). Nothing mutates the draft:
  // edits live in review.decisions / review.overrides, inserts in
  // overrides.inserts[anchorKey] = [{id, type, html}].
  // ---------------------------------------------------------------------------
  const INSERT_TYPES = { p: "Text", h: "Heading", bullet: "Bulleted item", quote: "Quote", divider: "Divider" };
  const ov = (o, path, fallback) => { const v = path.split(".").reduce((a, k) => (a == null ? a : a[k]), o.overrides || {}); return v == null || v === "" ? fallback : v; };
  const sanitize = (html) => String(html || "")
    .replace(/<div>/gi, "<br>").replace(/<\/div>/gi, "").replace(/<p[^>]*>/gi, "").replace(/<\/p>/gi, "<br>")
    .replace(/<(?!\/?(b|strong|i|em|u|br|a)\b)[^>]*>/gi, "")
    .replace(/<a\b[^>]*href="([^"]*)"[^>]*>/gi, '<a href="$1" target="_blank" rel="noopener">')
    .replace(/(<br>\s*)+$/i, "");

  function buildBlocks(c, o) {
    const r = c.record, a = r.assessment, rv = c.reviewDoc, v = r.verification_summary;
    const review = o.mode === "review";
    const B = [];
    const push = (b) => B.push(b);
    const claimBlocks = (arr, prefix) => arr.forEach((s, i) => {
      const id = `${prefix}${i}`, d = (o.decisions || {})[id] || { action: "keep" };
      if (!review && d.action === "remove") return;
      push({ key: `claim.${id}`, type: "claim", id, stmt: s, decision: d, editable: review && d.action !== "remove", text: d.action === "edit" && d.text ? d.text : s.text });
    });
    push({ key: "label", type: "label", text: "Draft for partner review. Not a recommendation.", fixed: true });
    push({ key: "title", type: "title", text: a.company_name, fixed: true });
    push({ key: "meta1", type: "meta", text: `${c.one_liner || ""}${c.ask ? ` · ${c.ask}` : ""}`, fixed: true });
    push({ key: "meta2", type: "meta", text: `Drafted ${r.generated_at} from ${r.sources.map((s) => s.key).join(", ")}. ${v.verified} of ${v.statements} statements verified against the source text${v.warning ? `, ${v.warning} with warnings` : ""}${v.failed ? `, ${v.failed} unverified` : ""}${r.repairs ? ", after one repair round" : ""}.`, fixed: true });
    const reviewer = review ? o.reviewer : rv?.reviewer;
    if (review) push({ key: "reviewer", type: "reviewer", text: o.reviewer || "", editable: true, field: "reviewer", placeholder: "your name" });
    else if (reviewer) push({ key: "meta3", type: "meta", text: `Reviewed by ${reviewer}.`, fixed: true });
    const note = review ? o.note || "" : rv?.note?.trim() || "";
    if (review) { push({ key: "h.note", type: "h2", text: "Note to partners", fixed: true }); push({ key: "note", type: "note", html: note, rich: true, editable: true, field: "note", placeholder: "Thesis fit, what the call felt like, anything the draft cannot know. Shown above the draft on the partner page." }); }
    else if (note) { push({ key: "h.note", type: "h2", text: `Note from ${reviewer || "the associate"}`, fixed: true }); push({ key: "note", type: "note", html: note, rich: true }); }
    push({ key: "h.summary", type: "h2", text: "Summary", fixed: true });
    push({ key: "summary", type: "summary", text: ov(o, "summary", a.summary), editable: review, field: "summary" });
    if (a.integrity_notes.length) { push({ key: "h.flags", type: "h2", text: "Things that are not evidence", fixed: true }); push({ key: "flags", type: "flags", items: a.integrity_notes, fixed: true }); }
    push({ key: "h.assessment", type: "h2", text: "Assessment", fixed: true });
    a.dimensions.forEach((d, di) => {
      const visible = review || d.claims.some((_, ci) => ((o.decisions || {})[`d${di}.c${ci}`] || {}).action !== "remove");
      if (!visible) return;
      push({ key: `dim.${di}`, type: "h3", text: d.name, fixed: true });
      push({ key: `finding.${di}`, type: "finding", text: ov(o, `findings.${di}`, d.finding), editable: review, field: `findings.${di}` });
      claimBlocks(d.claims, `d${di}.c`);
      d.open_questions.forEach((q, qi) => push({ key: `q.${di}.${qi}`, type: "bullet", text: ov(o, `questions.${di}.${qi}`, q), editable: review, field: `questions.${di}.${qi}`, muted: true }));
    });
    push({ key: "h.contra", type: "h2", text: "Where the sources disagree", fixed: true });
    if (a.contradictions.length) claimBlocks(a.contradictions, "x"); else push({ key: "contra.none", type: "finding", text: "The sources do not contradict each other.", fixed: true });
    push({ key: "h.missing", type: "h2", text: "What is missing", fixed: true });
    a.missing.forEach((m, i) => {
      const g = (o.overrides?.missing || {})[i] || {};
      if (g.removed && !review) return;
      push({ key: `gap.${i}`, type: "gap", text: g.text || `${m.item}. ${m.why_it_matters}`, editable: review && !g.removed, field: `missing.${i}.text`, removed: !!g.removed, index: i });
    });
    push({ key: "h.bear", type: "h2", text: "The case against", fixed: true, bear: true });
    push({ key: "thesis", type: "thesis", text: ov(o, "thesis", a.bear_case.thesis), editable: review, field: "thesis" });
    claimBlocks(a.bear_case.points, "b");
    if (o.mode !== "partner" && c.eval) push({ key: "checks", type: "checks", eval: c.eval, fixed: true });
    // Moves: overrides.moves[key] = anchorKey means "render this block right after anchorKey".
    // Applied in two passes so a block can be dropped after an inserted block too.
    const moves = Object.entries(o.overrides?.moves || {});
    const applyMoves = (list, pending) => { const left = []; for (const [key, anchor] of pending) { const i = list.findIndex((b) => b.key === key); const j = list.findIndex((b) => b.key === anchor); if (i < 0 || j < 0 || key === anchor) { if (i >= 0 && j < 0) left.push([key, anchor]); continue; } const [b] = list.splice(i, 1); const j2 = list.findIndex((x) => x.key === anchor); list.splice(j2 + 1, 0, b); } return left; };
    const later = applyMoves(B, moves);
    // Weave in the associate's inserted blocks after their anchors.
    const inserts = o.overrides?.inserts || {};
    const out = [];
    const addWithInserts = (b) => { out.push(b); for (const ins of inserts[b.key] || []) addWithInserts({ key: `ins.${ins.id}`, type: ins.type, html: ins.html || "", rich: ins.type !== "divider", editable: review && ins.type !== "divider", insert: true, id: ins.id }); };
    B.forEach(addWithInserts);
    applyMoves(out, later);
    return out;
  }

  function renderBlock(b, o) {
    const review = o.mode === "review";
    const ce = b.editable ? (b.rich ? ' contenteditable="true"' : ' contenteditable="plaintext-only"') : "";
    const ph = b.placeholder ? ` data-placeholder="${esc(b.placeholder)}"` : b.insert ? ' data-placeholder="Type, or press / for a block type"' : "";
    const inner = b.rich ? sanitize(b.html) : esc(b.text ?? "");
    const handle = review && !b.fixed ? `<button class="handle" data-handle="${esc(b.key)}" draggable="true" tabindex="-1" title="Drag to move, click for options">⋮⋮</button>` : "";
    const cls = `blk t-${b.type}${b.editable ? " editable" : ""}${b.insert ? " insert" : ""}${b.muted ? " muted" : ""}${b.removed ? " removed" : ""}`;
    switch (b.type) {
      case "label": return `<div class="${cls}">${esc(b.text)}</div>`;
      case "title": return `<h1 class="${cls}">${esc(b.text)}</h1>`;
      case "meta": return `<p class="${cls}">${esc(b.text)}</p>`;
      case "reviewer": return `<p class="${cls}">Reviewed by <span class="bc inline"${ce} data-key="${b.key}"${ph}>${inner}</span></p>`;
      case "h2": return `<h2 class="${cls}${b.bear ? " bear" : ""}" data-key="${esc(b.key)}">${esc(b.text)}</h2>`;
      case "h3": return `<h3 class="${cls}" data-key="${esc(b.key)}">${esc(b.text)}</h3>`;
      case "flags": return `<ul class="${cls}">${b.items.map((n) => `<li>${esc(n)}</li>`).join("")}</ul>`;
      case "checks": {
        const e = b.eval, j = e.judge?.counts, flagged = e.judge ? e.judge.rows.filter((r2) => r2.verdict !== "supported") : [];
        return `<h2 class="blk t-h2">Automated checks</h2><div class="${cls}">Quotes found in source: <b>${e.deterministic.verified} of ${e.deterministic.statements}</b>.${j ? ` Second-model read of each claim against its passages: <b>${j.supported} supported</b>, <b>${j.partial} partial</b>, <b>${j.unsupported} unsupported</b>.` : ""} Recommendation or score language: <b>${e.leaks.length ? e.leaks.length + " hits" : "none"}</b>.${flagged.length ? `<div class="fl">Partial: ${flagged.map((f) => `${f.id}, ${esc(f.reason)}`).join(" · ")}</div>` : ""}</div>`;
      }
      case "claim": {
        const s = b.stmt, st = s.verification?.status || "verified", d = b.decision;
        const refs = (s.citations || []).map((c) => `<span class="chip${c.status && c.status !== "ok" && c.status !== "quote_too_long" ? " bad" : ""}">${esc(c.passage_id)}</span>`).join("") + (s.basis !== "stated" ? `<span class="chip">${s.basis}</span>` : "");
        const removed = d.action === "remove";
        return `<div class="${cls} ${st}${removed ? " removed" : ""}${d.action === "edit" && d.text ? " edited" : ""}${o.selected === b.id ? " lit" : ""}" data-key="${esc(b.key)}" data-id="${b.id}">${handle}<span class="dot"></span><div class="body"><span class="bc"${removed ? "" : ce} data-key="${esc(b.key)}">${inner}</span><span class="refs">${refs}</span></div>${review ? (removed ? `<button class="x" data-act="keep">Restore</button>` : `<button class="x" data-act="remove" title="Remove">×</button>`) : ""}</div>`;
      }
      case "gap": return `<div class="${cls}" data-key="${esc(b.key)}" data-gap="${b.index}">${handle}<span class="bc"${b.removed ? "" : ce} data-key="${esc(b.key)}">${inner}</span>${review ? (b.removed ? `<button class="x" data-gapact="restore">Restore</button>` : `<button class="x" data-gapact="remove" title="Remove">×</button>`) : ""}</div>`;
      case "divider": return `<div class="${cls}" data-key="${esc(b.key)}">${handle}<hr></div>`;
      case "bullet": return `<div class="${cls}" data-key="${esc(b.key)}">${handle}<span class="bul"></span><span class="bc"${ce} data-key="${esc(b.key)}"${ph}>${inner}</span></div>`;
      case "h": return `<div class="${cls}" data-key="${esc(b.key)}">${handle}<span class="bc"${ce} data-key="${esc(b.key)}"${ph}>${inner}</span></div>`;
      case "quote": return `<div class="${cls}" data-key="${esc(b.key)}">${handle}<span class="bc"${ce} data-key="${esc(b.key)}"${ph}>${inner}</span></div>`;
      default: // p, note, summary, finding, thesis
        return `<div class="${cls}" data-key="${esc(b.key)}">${handle}<span class="bc"${ce} data-key="${esc(b.key)}"${ph}>${inner}</span></div>`;
    }
  }

  function document(c, o) { return buildBlocks(c, o).map((b) => renderBlock(b, o)).join(""); }

  function provenance(c, id) {
    if (!id) return `<p class="none">Select a statement in the draft. The passages it cites appear here with the quoted words marked.</p>`;
    const entry = statements(c.record.assessment).get(id);
    if (!entry) return `<p class="none">Nothing selected.</p>`;
    const { stmt, where } = entry, st = stmt.verification?.status || "verified";
    const issues = (stmt.verification?.issues || []).join(", ").replace(/_/g, " ");
    let h = `<div class="cl">${esc(stmt.text)}<div class="st"><span class="badge ${st === "verified" ? "green" : st === "warning" ? "amber" : "red"}">${st === "verified" ? "Quote verified" : st === "warning" ? "Warning: " + esc(issues) : "Not verified: " + esc(issues)}</span><span class="badge">${esc(where)}</span><span class="badge">${stmt.basis}</span></div></div>`;
    if (!stmt.citations.length) h += `<p class="none">No citation.</p>`;
    for (const cit of stmt.citations) {
      const ps = c.record.passages[cit.passage_id];
      if (!ps) { h += `<div class="src"><div class="sh"><span class="chip bad">${esc(cit.passage_id)}</span><span class="nm">no such passage</span></div></div>`; continue; }
      const title = c.record.sources.find((s) => s.key === ps.source)?.title || ps.source;
      const hl = highlight(ps.text, cit.quote);
      h += `<div class="src"><div class="sh"><span class="chip">${esc(cit.passage_id)}</span><span class="nm">${esc(title)}</span></div><div class="tx">${hl !== null ? hl : esc(ps.text)}</div>${hl === null ? `<div class="warn">Quote not found here: “${esc(cit.quote)}”</div>` : ""}</div>`;
    }
    return h;
  }

  function browse(c) {
    const bySource = {};
    for (const [id, p] of Object.entries(c.record.passages)) (bySource[p.source] ||= []).push([id, p]);
    return c.record.sources.map((s) => `<div class="src"><h5>${esc(s.key)} · ${esc(s.title)}</h5>${(bySource[s.key] || []).map(([id, p]) => `<div class="src"><div class="sh"><span class="chip">${esc(id)}</span></div><div class="tx">${esc(p.text)}</div></div>`).join("")}</div>`).join("");
  }

  window.Doc = { esc, highlight, statements, document, buildBlocks, provenance, browse, sanitize, INSERT_TYPES };
})();
