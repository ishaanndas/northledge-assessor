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

  // mode: "review" (editable in place), "partner" (decisions and overrides applied), "static" (read-only, all)
  // o.decisions: {id: {action, text}}  o.overrides: {summary, findings:{di}, thesis, missing:{i:{text,removed}}, questions:{"di.qi":text}}
  const ov = (o, path, fallback) => { const v = path.split(".").reduce((a, k) => (a == null ? a : a[k]), o.overrides || {}); return v == null || v === "" ? fallback : v; };
  const ed = (o, field, text, cls = "", tag = "span", placeholder = "") =>
    o.mode === "review"
      ? `<${tag} class="e ${cls}" contenteditable="plaintext-only" data-field="${field}" data-placeholder="${esc(placeholder)}">${esc(text)}</${tag}>`
      : `<${tag} class="${cls}">${esc(text)}</${tag}>`;

  function claim(id, s, o) {
    const d = (o.decisions || {})[id] || { action: "keep" };
    const removed = d.action === "remove";
    if (o.mode !== "review" && removed) return "";
    const st = s.verification?.status || "verified";
    const text = d.action === "edit" && d.text ? d.text : s.text;
    const refs = (s.citations || []).map((c) => `<span class="chip${c.status && c.status !== "ok" && c.status !== "quote_too_long" ? " bad" : ""}">${esc(c.passage_id)}</span>`).join("");
    const cls = ["claim", st, o.selected === id ? "lit" : "", removed ? "removed" : "", d.action === "edit" && d.text ? "edited" : ""].join(" ");
    const body = o.mode === "review" && !removed
      ? `<span class="t e" contenteditable="plaintext-only" data-claim="${id}">${esc(text)}</span>`
      : `<span class="t">${esc(text)}</span>`;
    const acts = o.mode === "review" ? (removed ? `<button class="x" data-act="keep" title="Restore">Restore</button>` : `<button class="x" data-act="remove" title="Remove">×</button>`) : "";
    return `<li class="${cls}" data-id="${id}"><span class="d"></span><span class="body">${body}<span class="refs">${refs}${s.basis !== "stated" ? `<span class="chip">${s.basis}</span>` : ""}</span></span>${acts}</li>`;
  }

  function document(c, o) {
    const r = c.record, a = r.assessment, rv = c.reviewDoc, v = r.verification_summary;
    const claims = (arr, prefix) => arr.map((s, i) => claim(`${prefix}${i}`, s, o)).join("");
    const reviewer = o.mode === "review" ? o.reviewer : rv?.reviewer;
    let h = `<div class="label">Draft for partner review. Not a recommendation.</div><h1>${esc(a.company_name)}</h1>`;
    h += `<p class="meta">${esc(c.one_liner || "")}${c.ask ? ` · ${esc(c.ask)}` : ""}</p>`;
    h += `<p class="meta">Drafted ${esc(r.generated_at)} from ${r.sources.map((s) => esc(s.key)).join(", ")}. ${v.verified} of ${v.statements} statements verified against the source text${v.warning ? `, ${v.warning} with warnings` : ""}${v.failed ? `, ${v.failed} unverified` : ""}${r.repairs ? ", after one repair round" : ""}.</p>`;
    if (o.mode === "review") h += `<p class="meta">Reviewed by ${ed(o, "reviewer", o.reviewer || "", "inline", "span", "your name")}</p>`;
    else if (reviewer) h += `<p class="meta">Reviewed by ${esc(reviewer)}.</p>`;
    const note = o.mode === "review" ? o.note || "" : rv?.note?.trim() || "";
    if (o.mode === "review") h += `<section><h2>Note to partners</h2>${ed(o, "note", note, "note", "div", "Thesis fit, what the call felt like, anything the draft cannot know. Shown above the draft on the partner page.")}</section>`;
    else if (note) h += `<section><h2>Note from ${esc(reviewer || "the associate")}</h2><p class="note">${esc(note)}</p></section>`;
    h += `<section><h2>Summary</h2>${ed(o, "summary", ov(o, "summary", a.summary), "summary", "p")}</section>`;
    if (a.integrity_notes.length) h += `<section><h2>Things that are not evidence</h2><ul class="flags">${a.integrity_notes.map((n) => `<li>${esc(n)}</li>`).join("")}</ul></section>`;
    h += `<section><h2>Assessment</h2>${a.dimensions.map((d, di) => {
      const items = claims(d.claims, `d${di}.c`);
      if (o.mode !== "review" && !items) return "";
      const qs = d.open_questions.map((q, qi) => `<li>${ed(o, `questions.${di}.${qi}`, ov(o, `questions.${di}.${qi}`, q))}</li>`).join("");
      return `<div class="dim"><h3>${esc(d.name)}</h3>${ed(o, `findings.${di}`, ov(o, `findings.${di}`, d.finding), "finding", "p")}<ul class="claims">${items}</ul>${qs ? `<ul class="oq">${qs}</ul>` : ""}</div>`;
    }).join("")}</section>`;
    const x = claims(a.contradictions, "x");
    h += `<section><h2>Where the sources disagree</h2>${x ? `<ul class="claims">${x}</ul>` : `<p class="finding">The sources do not contradict each other.</p>`}</section>`;
    const gaps = a.missing.map((m, i) => {
      const g = (o.overrides?.missing || {})[i] || {};
      if (g.removed && o.mode !== "review") return "";
      const text = g.text || `${m.item}. ${m.why_it_matters}`;
      return `<li class="gap ${g.removed ? "removed" : ""}" data-gap="${i}">${o.mode === "review" && !g.removed ? `<span class="e" contenteditable="plaintext-only" data-field="missing.${i}.text">${esc(text)}</span>` : `<span>${esc(text)}</span>`}${o.mode === "review" ? (g.removed ? `<button class="x" data-gapact="restore">Restore</button>` : `<button class="x" data-gapact="remove" title="Remove">×</button>`) : ""}</li>`;
    }).join("");
    h += `<section><h2>What is missing</h2><ul class="gaps">${gaps}</ul></section>`;
    h += `<section><h2>The case against</h2><div class="bear">${ed(o, "thesis", ov(o, "thesis", a.bear_case.thesis), "thesis", "p")}<ul class="claims">${claims(a.bear_case.points, "b")}</ul></div></section>`;
    if (o.mode !== "partner" && c.eval) {
      const e = c.eval, j = e.judge?.counts, flagged = e.judge ? e.judge.rows.filter((r2) => r2.verdict !== "supported") : [];
      h += `<section><h2>Automated checks</h2><div class="checks">Quotes found in source: <b>${e.deterministic.verified} of ${e.deterministic.statements}</b>.${j ? ` Second-model read of each claim against its passages: <b>${j.supported} supported</b>, <b>${j.partial} partial</b>, <b>${j.unsupported} unsupported</b>.` : ""} Recommendation or score language: <b>${e.leaks.length ? e.leaks.length + " hits" : "none"}</b>.${flagged.length ? `<div class="fl">Partial: ${flagged.map((f) => `${f.id}, ${esc(f.reason)}`).join(" · ")}</div>` : ""}</div></section>`;
    }
    return h;
  }

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

  window.Doc = { esc, highlight, statements, document, provenance, browse };
})();
