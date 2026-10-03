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

  // mode: "review" (actions, all statements), "partner" (decisions applied), "static" (read-only, all)
  function claim(id, s, o) {
    const d = (o.decisions || {})[id] || { action: "keep" };
    if (o.mode === "partner" && d.action === "remove") return "";
    const st = s.verification?.status || "verified";
    const text = d.action === "edit" && d.text ? d.text : s.text;
    const refs = (s.citations || []).map((c) => `<span class="ref${c.status && c.status !== "ok" && c.status !== "quote_too_long" ? " bad" : ""}">${esc(c.passage_id)}</span>`).join("");
    const cls = ["claim", st, o.selected === id ? "lit" : "", o.mode === "review" && d.action === "remove" ? "removed" : ""].join(" ");
    let acts = "";
    if (o.mode === "review") {
      acts = d.action === "remove"
        ? `<span class="acts"><button data-act="keep">Restore</button></span>`
        : `<span class="acts"><button data-act="edit">Edit</button><button data-act="remove">Remove</button></span>`;
    }
    const editor = o.mode === "review" && d.editing
      ? `<div class="editor"><textarea class="textarea" data-edit="${id}">${esc(d.text || s.text)}</textarea><div class="r"><button class="btn sm primary" data-editsave="${id}">Save</button><button class="btn sm quiet" data-editcancel="${id}">Cancel</button></div></div>`
      : "";
    const edited = d.action === "edit" && d.text ? `<span class="ed">${o.mode === "review" ? "edited" : ""}</span>` : "";
    return `<li class="${cls}" data-id="${id}"><span class="d"></span><span class="t">${esc(text)}${refs}${s.basis !== "stated" ? `<span class="ref">${s.basis}</span>` : ""}${edited}</span>${acts}${editor}</li>`;
  }

  function document(c, o) {
    const r = c.record, a = r.assessment, rv = c.reviewDoc, v = r.verification_summary;
    const claims = (arr, prefix) => arr.map((s, i) => claim(`${prefix}${i}`, s, o)).join("");
    let h = `<div class="label">Draft for partner review. Not a recommendation.</div><h1>${esc(a.company_name)}</h1>`;
    h += `<p class="meta">${esc(c.one_liner || "")}${c.ask ? ` · ${esc(c.ask)}` : ""}</p>`;
    h += `<p class="meta">Drafted ${esc(r.generated_at)} from ${r.sources.map((s) => esc(s.key)).join(", ")}. ${v.verified} of ${v.statements} statements verified against the source text${v.warning ? `, ${v.warning} with warnings` : ""}${v.failed ? `, ${v.failed} unverified` : ""}${r.repairs ? ", after one repair round" : ""}.${o.mode === "partner" && rv?.reviewer ? ` Reviewed by ${esc(rv.reviewer)}.` : ""}</p>`;
    if (o.mode === "review") {
      h += `<section><h2>Note to partners</h2><div class="reviewblock"><div class="row"><span>Shown at the top of the partner page, above the draft.</span><input class="input" id="reviewer" placeholder="Reviewer" value="${esc(o.reviewer || "")}"></div><textarea class="textarea" id="note" placeholder="Thesis fit, what the call felt like, anything the draft cannot know.">${esc(o.note || "")}</textarea></div></section>`;
    } else if (o.mode === "partner" && rv?.note?.trim()) {
      h += `<section><h2>Note from ${esc(rv.reviewer || "the associate")}</h2><p class="note">${esc(rv.note.trim())}</p></section>`;
    }
    h += `<section><h2>Summary</h2><p class="summary">${esc(a.summary)}</p></section>`;
    if (a.integrity_notes.length) h += `<section><h2>Things that are not evidence</h2><div class="flags"><ul>${a.integrity_notes.map((n) => `<li>${esc(n)}</li>`).join("")}</ul></div></section>`;
    h += `<section><h2>Assessment</h2>${a.dimensions.map((d, di) => {
      const items = claims(d.claims, `d${di}.c`);
      if (o.mode === "partner" && !items) return "";
      return `<div class="dim"><h3>${esc(d.name)}</h3><p class="finding">${esc(d.finding)}</p><ul class="claims">${items}</ul>${d.open_questions.length ? `<ul class="oq">${d.open_questions.map((q) => `<li>${esc(q)}</li>`).join("")}</ul>` : ""}</div>`;
    }).join("")}</section>`;
    const x = claims(a.contradictions, "x");
    h += `<section><h2>Where the sources disagree</h2>${x ? `<ul class="claims">${x}</ul>` : `<p class="finding">The sources do not contradict each other.</p>`}</section>`;
    h += `<section><h2>What is missing</h2><div class="gaps">${a.missing.map((m) => `<div><b>${esc(m.item)}.</b> <span>${esc(m.why_it_matters)}</span></div>`).join("")}</div></section>`;
    h += `<section><h2>The case against</h2><div class="bear"><p class="thesis">${esc(a.bear_case.thesis)}</p><ul class="claims">${claims(a.bear_case.points, "b")}</ul></div></section>`;
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
    let h = `<div class="cl">${esc(stmt.text)}<div class="st ${st}">${esc(where)} · ${st === "verified" ? "quote verified" : st === "warning" ? "warning: " + (stmt.verification?.issues || []).join(", ").replace(/_/g, " ") : "not verified: " + (stmt.verification?.issues || []).join(", ").replace(/_/g, " ")} · ${stmt.basis}</div></div>`;
    if (!stmt.citations.length) h += `<p class="none">No citation.</p>`;
    for (const cit of stmt.citations) {
      const ps = c.record.passages[cit.passage_id];
      if (!ps) { h += `<div class="src"><div class="sh"><span class="id">${esc(cit.passage_id)}</span><span class="nm">no such passage</span></div></div>`; continue; }
      const title = c.record.sources.find((s) => s.key === ps.source)?.title || ps.source;
      const hl = highlight(ps.text, cit.quote);
      h += `<div class="src"><div class="sh"><span class="id">${esc(cit.passage_id)}</span><span class="nm">${esc(title)}</span></div><div class="tx">${hl !== null ? hl : esc(ps.text)}</div>${hl === null ? `<div class="warn">Quote not found here: “${esc(cit.quote)}”</div>` : ""}</div>`;
    }
    return h;
  }

  function browse(c) {
    const bySource = {};
    for (const [id, p] of Object.entries(c.record.passages)) (bySource[p.source] ||= []).push([id, p]);
    return c.record.sources.map((s) => `<div class="src"><h5>${esc(s.key)} · ${esc(s.title)}</h5>${(bySource[s.key] || []).map(([id, p]) => `<div class="src"><div class="sh"><span class="id">${esc(id)}</span></div><div class="tx">${esc(p.text)}</div></div>`).join("")}</div>`).join("");
  }

  window.Doc = { esc, highlight, statements, document, provenance, browse };
})();
