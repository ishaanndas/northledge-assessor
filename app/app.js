// Assessment drafter: single-page client over the JSON API in serve.mjs.
// Routes: #/  #/new  #/c/:slug  #/c/:slug/draft  #/c/:slug/review  #/c/:slug/partner  #/c/:slug/followup
const $ = (s, el = document) => el.querySelector(s);
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const api = async (path, opts = {}) => {
  const r = await fetch("/api" + path, { headers: { "Content-Type": "application/json" }, ...opts });
  if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || r.statusText);
  return r.json();
};
const STEPS = [["", "Sources"], ["draft", "Draft"], ["review", "Review"], ["partner", "Partner view"], ["followup", "Follow-up"]];
const state = { company: null, sel: null, decisions: {}, reviewer: "", note: "", runLog: [] };

// ---------- normalization mirrors lib/verify.mjs; index map lets us mark the raw span ----------
function buildNorm(text) {
  let out = "", map = [];
  for (let i = 0; i < text.length; i++) {
    let ch = text[i].toLowerCase();
    if (/[‘’‚]/.test(ch)) ch = "'"; else if (/[“”„]/.test(ch)) ch = '"'; else if (/[–—−]/.test(ch)) ch = "-"; else if (/[*_`#>]/.test(ch)) continue;
    if (/\s/.test(ch)) { if (out.length === 0 || out[out.length - 1] === " ") continue; ch = " "; }
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
  const start = t.map[i], end = t.map[i + q.length - 1] + 1;
  return esc(text.slice(0, start)) + "<mark>" + esc(text.slice(start, end)) + "</mark>" + esc(text.slice(end));
}

// ---------- statement helpers ----------
function statementMap(a) {
  const m = new Map();
  a.dimensions.forEach((d, di) => d.claims.forEach((c, ci) => m.set(`d${di}.c${ci}`, { stmt: c, where: d.name })));
  a.contradictions.forEach((c, i) => m.set(`x${i}`, { stmt: c, where: "Contradictions" }));
  a.bear_case.points.forEach((c, i) => m.set(`b${i}`, { stmt: c, where: "Bear case" }));
  return m;
}
const decisionFor = (id) => state.decisions[id] || { action: "keep" };
const shownText = (id, stmt) => { const d = decisionFor(id); return d.action === "edit" && d.text ? d.text : stmt.text; };

function stmtHtml(id, s, mode) {
  const st = s.verification?.status || "verified";
  const d = decisionFor(id);
  if (mode === "partner" && d.action === "remove") return "";
  const cites = (s.citations || []).map((c) => `<span class="cite${c.status && c.status !== "ok" && c.status !== "quote_too_long" ? " bad" : ""}">${esc(c.passage_id)}</span>`).join("");
  const cls = ["claim", st, state.sel === id ? "lit" : "", mode === "review" ? d.action + "ed" : "", mode === "review" && d.action === "remove" ? "removed" : ""].join(" ");
  const acts = mode === "review"
    ? `<span class="acts"><button data-act="keep" class="${d.action === "keep" ? "on" : ""}">Keep</button><button data-act="edit" class="${d.action === "edit" ? "on" : ""}">Edit</button><button data-act="remove" class="${d.action === "remove" ? "on" : ""}">Remove</button></span>`
    : "";
  const edit = mode === "review" && d.editing
    ? `<div class="editbox"><textarea data-edit="${id}">${esc(d.text || s.text)}</textarea><div class="r"><button class="btn" data-editsave="${id}">Save edit</button><button class="btn" data-editcancel="${id}">Cancel</button></div></div>`
    : "";
  return `<li class="${cls}" data-id="${id}"><span class="dot"></span><span class="t">${esc(shownText(id, s))}<span class="cites">${cites}</span>${s.basis !== "stated" ? `<span class="basis">${s.basis}</span>` : ""}</span>${acts}${edit}</li>`;
}

// ---------- document (shared by review and partner view) ----------
function docHtml(c, mode) {
  const r = c.record, a = r.assessment, ev = c.eval;
  const rv = c.reviewDoc;
  let h = `<div class="in"><header><div class="eyebrow">Draft for partner review · not a recommendation</div><h1>${esc(a.company_name)}</h1><p class="sub">${esc(c.one_liner)}${c.ask ? " · " + esc(c.ask) : ""}</p><p class="meta">Drafted ${esc(r.generated_at)} by ${esc(r.model)} from ${r.sources.map((s) => esc(s.key)).join(", ")}. ${r.verification_summary.verified} of ${r.verification_summary.statements} statements verified against source text, ${r.verification_summary.warning} with warnings, ${r.verification_summary.failed} unverified${r.repairs ? " after one repair round" : ""}.${mode === "partner" && rv?.reviewer ? ` Reviewed and edited by ${esc(rv.reviewer)}, ${esc(rv.updated)}.` : ""}</p></header>`;
  if (mode === "partner" && rv?.note?.trim()) h += `<section><h2>Associate's note</h2><p class="note">${esc(rv.note.trim())}</p></section>`;
  h += `<section><h2>Summary</h2><p class="summary">${esc(a.summary)}</p></section>`;
  if (a.integrity_notes.length) h += `<section><h2>Integrity notes</h2><div class="integrity"><ul>${a.integrity_notes.map((n) => `<li>${esc(n)}</li>`).join("")}</ul></div></section>`;
  h += `<section><h2>Assessment</h2>${a.dimensions.map((d, di) => {
    const items = d.claims.map((cl, ci) => stmtHtml(`d${di}.c${ci}`, cl, mode)).join("");
    if (mode === "partner" && !items) return "";
    return `<div class="dim"><h3>${esc(d.name)}</h3><p class="finding">${esc(d.finding)}</p><ul class="claims">${items}</ul>${d.open_questions.length ? `<ul class="oq">${d.open_questions.map((q) => `<li>${esc(q)}</li>`).join("")}</ul>` : ""}</div>`;
  }).join("")}</section>`;
  const contra = a.contradictions.map((cl, i) => stmtHtml(`x${i}`, cl, mode)).join("");
  h += `<section><h2>Where the sources disagree</h2>${contra ? `<ul class="claims">${contra}</ul>` : `<p class="finding">No contradictions found between the sources.</p>`}</section>`;
  h += `<section><h2>What is missing</h2><div class="missing">${a.missing.map((m) => `<div><b>${esc(m.item)}.</b> <span>${esc(m.why_it_matters)}</span></div>`).join("")}</div></section>`;
  h += `<section><h2>The case against</h2><div class="bear"><p class="thesis">${esc(a.bear_case.thesis)}</p><ul class="claims">${a.bear_case.points.map((cl, i) => stmtHtml(`b${i}`, cl, mode)).join("")}</ul></div></section>`;
  if (ev && mode === "review") {
    const j = ev.judge?.counts, missed = ev.expectations.filter((x) => !x.pass), flagged = ev.judge ? ev.judge.rows.filter((x) => x.verdict !== "supported") : [];
    h += `<section><h2>Automated checks</h2><div class="evalrow"><span class="chip">Quote check <b>${ev.deterministic.verified}/${ev.deterministic.statements}</b></span>${j ? `<span class="chip">Judge supported <b>${j.supported}</b> · partial <b>${j.partial}</b> · unsupported <b>${j.unsupported}</b></span>` : ""}<span class="chip${ev.leaks.length ? " miss" : ""}">Decision language <b>${ev.leaks.length}</b></span><span class="chip${missed.length ? " miss" : ""}">Expectations <b>${ev.expectations.length - missed.length}/${ev.expectations.length}</b></span></div>${flagged.length ? `<p class="evalnote">Judge flagged: ${flagged.map((x) => `<b>${x.id}</b> ${x.verdict}: ${esc(x.reason)}`).join(" · ")}</p>` : ""}</section>`;
  }
  return h + "</div>";
}

function provHtml(c) {
  if (!state.sel) return `<p class="empty">Select a claim, contradiction or bear-case point. The passages it cites appear here with the quoted text marked.</p>`;
  const { stmt, where } = statementMap(c.record.assessment).get(state.sel);
  const st = stmt.verification?.status || "verified";
  let h = `<div class="claimbox">${esc(stmt.text)}<div class="status ${st}">${esc(where)} · ${st}${stmt.verification?.issues?.length ? " · " + stmt.verification.issues.join(", ") : ""} · basis: ${stmt.basis}</div></div>`;
  if (!stmt.citations.length) h += `<p class="empty">No citation given.</p>`;
  for (const cit of stmt.citations) {
    const ps = c.record.passages[cit.passage_id];
    if (!ps) { h += `<div class="psg"><div class="sh"><span class="id">${esc(cit.passage_id)}</span><span class="nm">no such passage</span></div><div class="warn">The cited passage id does not exist.</div></div>`; continue; }
    const src = c.record.sources.find((s) => s.key === ps.source);
    const hl = highlight(ps.text, cit.quote);
    h += `<div class="psg lit"><div class="sh"><span class="id">${esc(cit.passage_id)}</span><span class="nm">${esc(src ? src.title : ps.source)}</span></div><div class="tx">${hl !== null ? hl : esc(ps.text)}</div>${hl === null ? `<div class="warn">Quote not found in this passage: “${esc(cit.quote)}”</div>` : ""}</div>`;
  }
  return h;
}
function browseHtml(c) {
  return c.sourceDocs.map((s) => `<div class="srcgroup"><h5>${esc(s.key)} · ${esc(s.title)}</h5>${s.passages.map((p) => `<div class="psg"><div class="sh"><span class="id">${esc(p.id)}</span></div><div class="tx">${esc(p.text)}</div></div>`).join("")}</div>`).join("");
}

function readerHtml(c, mode, toolbar = "") {
  return `${toolbar}<div class="reader" id="reader"><main class="doc" id="doc">${docHtml(c, mode)}</main><aside class="prov"><header><h4 id="asideTitle">Where this came from</h4><button id="browseBtn">Browse all sources</button><button id="closeBtn" hidden>Close</button></header><div class="provbody" id="prov">${provHtml(c)}</div></aside></div>`;
}
function wireReader(c, mode) {
  const doc = $("#doc");
  doc.addEventListener("click", (e) => {
    const act = e.target.closest("button[data-act]");
    const li = e.target.closest(".claim");
    if (act && li) {
      const id = li.dataset.id, a = act.dataset.act;
      if (a === "edit") state.decisions[id] = { ...decisionFor(id), action: "edit", editing: true, text: decisionFor(id).text };
      else state.decisions[id] = { action: a };
      rerenderDoc(c, mode); return;
    }
    if (e.target.closest("[data-editsave]")) { const id = e.target.closest("[data-editsave]").dataset.editsave; const t = $(`textarea[data-edit="${id}"]`).value.trim(); state.decisions[id] = t && t !== statementMap(c.record.assessment).get(id).stmt.text ? { action: "edit", text: t } : { action: "keep" }; rerenderDoc(c, mode); return; }
    if (e.target.closest("[data-editcancel]")) { const id = e.target.closest("[data-editcancel]").dataset.editcancel; const d = decisionFor(id); state.decisions[id] = d.text ? { action: "edit", text: d.text } : { action: "keep" }; rerenderDoc(c, mode); return; }
    if (e.target.closest("textarea")) return;
    if (!li) return;
    state.sel = li.dataset.id;
    doc.querySelectorAll(".claim.lit").forEach((x) => x.classList.remove("lit"));
    li.classList.add("lit");
    $("#asideTitle").textContent = "Where this came from";
    $("#prov").innerHTML = provHtml(c);
    $("#reader").classList.add("show-src"); $("#closeBtn").hidden = false;
  });
  $("#browseBtn").addEventListener("click", () => { $("#asideTitle").textContent = "All source passages"; $("#prov").innerHTML = browseHtml(c); $("#reader").classList.add("show-src"); $("#closeBtn").hidden = false; });
  $("#closeBtn").addEventListener("click", () => { $("#reader").classList.remove("show-src"); $("#closeBtn").hidden = true; });
}
function rerenderDoc(c, mode) {
  const scroll = $("#doc").scrollTop;
  $("#doc").innerHTML = docHtml(c, mode);
  $("#doc").scrollTop = scroll;
  updateReviewCounts();
}

// ---------- screens ----------
async function screenCompanies() {
  setSteps(null);
  const list = await api("/companies");
  const rows = list.map((c) => `<a class="card" href="#/c/${c.slug}${c.status === "sources" ? "" : "/review"}"><div><div class="nm">${esc(c.name)}</div><div class="ol">${esc(c.one_liner)}${c.ask ? " · " + esc(c.ask) : ""}</div></div><div class="src">${c.sources.map((s) => esc(s.key)).join(", ")}<div class="mono">${c.sources.reduce((n, s) => n + s.passages, 0)} passages${c.origin === "example" ? " · example" : ""}</div></div><div class="meta">${c.verification_summary ? `${c.verification_summary.verified}/${c.verification_summary.statements} verified<br>${c.missing_count} gaps` : "not drafted"}${c.review ? `<br>reviewed by ${esc(c.review.reviewer || "associate")}` : ""}</div><span class="tag ${c.status}">${c.running ? "drafting" : c.status}</span></a>`).join("");
  $("#main").innerHTML = `<div class="page"><div class="wrap"><div class="eyebrow">Pipeline</div><h1>Companies</h1><p class="lede">Each company moves through five steps: sources in, draft, associate review, partner view, follow-up to the founder. Nothing here scores or recommends.</p><div class="actions"><a class="btn primary" href="#/new">New company</a><span class="chip">${list.length} companies</span><span class="chip">${list.filter((c) => c.status === "reviewed").length} reviewed</span></div><div class="cards"><div class="head"><span>Company</span><span>Sources</span><span>Draft</span><span></span></div>${rows}</div></div></div>`;
}

function screenNew() {
  setSteps(null);
  const src = (key, label, hint) => `<label class="f"><span><b>${label}</b> · ${hint}</span><textarea name="${key}" placeholder="Paste the text here, or choose a file below. Leave empty if you do not have it."></textarea><span class="filepick"><input type="file" accept=".md,.txt" data-into="${key}"></span></label>`;
  $("#main").innerHTML = `<div class="page"><div class="wrap"><div class="eyebrow">Step 1 · Sources</div><h1>New company</h1><p class="lede">Paste what you have after the first call. Any input can be missing; the draft will say so rather than fill the gap. Each document is split into numbered passages, and the draft can only cite those.</p>
  <form class="form" id="newform"><div class="row"><label class="f"><span><b>Company name</b></span><input name="name" required placeholder="Lumen Grid"></label><label class="f"><span><b>One-liner</b></span><input name="one_liner" placeholder="Interconnection-queue software for utilities"></label><label class="f"><span><b>Round</b></span><input name="ask" placeholder="$2.5M seed"></label></div>
  <div class="srcgrid">${src("deck", "Deck", "slide text, one slide per paragraph")}${src("website", "Website", "page text, including hidden elements")}${src("founders", "Founder bios", "as provided by the company")}${src("call-notes", "First-call notes", "your notes, verbatim")}</div>
  <div class="actions"><button class="btn primary" type="submit">Save sources and continue</button><span class="err" id="newerr"></span></div></form></div></div>`;
  $("#newform").addEventListener("change", (e) => {
    const f = e.target.closest("input[type=file]"); if (!f || !f.files[0]) return;
    f.files[0].text().then((t) => { $(`textarea[name="${f.dataset.into}"]`).value = t; });
  });
  $("#newform").addEventListener("submit", async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const payload = { name: fd.get("name"), one_liner: fd.get("one_liner"), ask: fd.get("ask"), sources: { deck: fd.get("deck"), website: fd.get("website"), founders: fd.get("founders"), "call-notes": fd.get("call-notes") } };
    try { const { slug } = await api("/companies", { method: "POST", body: JSON.stringify(payload) }); location.hash = `#/c/${slug}`; }
    catch (err) { $("#newerr").textContent = err.message; }
  });
}

async function loadCompany(slug) {
  const c = await api(`/companies/${slug}`);
  state.company = c;
  if (c.reviewDoc) { state.decisions = c.reviewDoc.decisions || {}; state.reviewer = c.reviewDoc.reviewer || ""; state.note = c.reviewDoc.note || ""; }
  else if (state.companySlug !== slug) { state.decisions = {}; state.reviewer = state.reviewer || ""; state.note = ""; }
  state.companySlug = slug;
  return c;
}

function setSteps(c, current = "") {
  const el = $("#steps");
  if (!c) { el.hidden = true; return; }
  el.hidden = false;
  const drafted = !!c.record;
  el.innerHTML = `<div class="co">${esc(c.name)}<span>${esc(c.one_liner)}</span></div>` + STEPS.map(([k, label], i) => {
    const done = k === "" ? true : k === "draft" ? drafted : k === "review" ? !!c.reviewDoc : false;
    const locked = (k === "review" || k === "partner" || k === "followup") && !drafted;
    const on = k === current;
    return `<a class="step ${on ? "on" : done ? "done" : ""} ${locked ? "locked" : ""}" href="#/c/${c.slug}${k ? "/" + k : ""}"><i>${done && !on ? "✓" : i + 1}</i>${label}</a>`;
  }).join("");
}

async function screenSources(slug) {
  const c = await loadCompany(slug);
  setSteps(c, "");
  $("#main").innerHTML = `<div class="page"><div class="wrap"><div class="eyebrow">Step 1 · Sources</div><h1>${esc(c.name)}</h1><p class="lede">${esc(c.one_liner)}${c.ask ? " · " + esc(c.ask) : ""}. This is exactly what the model will read: ${c.sourceDocs.length} source${c.sourceDocs.length === 1 ? "" : "s"}, ${c.sourceDocs.reduce((n, s) => n + s.passages.length, 0)} numbered passages. A claim in the draft can cite nothing else.</p>
  <div class="actions">${c.record ? `<a class="btn" href="#/c/${slug}/review">Open draft</a><a class="btn" href="#/c/${slug}/draft">Re-draft</a>` : `<a class="btn primary" href="#/c/${slug}/draft">Draft assessment</a>`}<span class="chip">${c.origin === "example" ? "committed example" : "created through intake"}</span></div>
  ${c.sourceDocs.map((s) => `<div class="srcdoc"><h3>${esc(s.key)}</h3><div class="ti">${esc(s.title)} · ${s.passages.length} passages</div>${s.passages.map((p) => `<div class="psg"><div class="sh"><span class="id">${esc(p.id)}</span></div><div class="tx">${esc(p.text)}</div></div>`).join("")}</div>`).join("")}</div></div>`;
}

async function screenDraft(slug) {
  const c = await loadCompany(slug);
  setSteps(c, "draft");
  const stepRows = [["split", "Split"], ["draft", "Draft"], ["verify", "Verify"], ["repair", "Repair"], ["reverify", "Re-verify"], ["done", "Write"]];
  const render = (log, running) => {
    const byStep = Object.fromEntries(log.map((e) => [e.step, e]));
    // The latest event names the step that is in progress; earlier ones are done.
    const last = log.length ? log[log.length - 1].step : null;
    const rows = stepRows.map(([k, label]) => {
      const e = byStep[k];
      const skipped = (k === "repair" || k === "reverify") && byStep.done && !byStep.repair;
      const cls = e ? (running && k === last && k !== "done" ? "on" : "done") : "";
      const extra = e?.failures ? `<ul class="fail">${e.failures.map((f) => `<li>${esc(f.where)}: “${esc(f.quote.slice(0, 80))}” ${esc(f.reason)}</li>`).join("")}</ul>` : "";
      return `<div class="st ${cls}"><i></i><span class="k">${label}</span><span class="m">${skipped ? "not needed" : esc(e?.message || "")}${extra}</span></div>`;
    }).join("");
    const err = log.find((e) => e.step === "error");
    const done = byStep.done;
    const summ = done ? `<div class="summ"><span class="chip ok">${done.summary.verified}/${done.summary.statements} verified</span><span class="chip${done.summary.warning ? " gold" : ""}">${done.summary.warning} warnings</span><span class="chip${done.summary.failed ? " miss" : ""}">${done.summary.failed} unverified</span><span class="chip">${done.seconds}s</span><span class="chip">${done.usage.input.toLocaleString()} in / ${done.usage.output.toLocaleString()} out tokens</span></div><div class="actions"><a class="btn primary" href="#/c/${slug}/review">Review the draft</a></div>` : "";
    return `<div class="run">${rows}${err ? `<div class="st err"><i></i><span class="k">Error</span><span class="m">${esc(err.message)}</span></div>` : ""}</div>${summ}`;
  };
  const existing = c.record ? `<div class="summ"><span class="chip">Last drafted ${esc(c.record.generated_at)}</span><span class="chip ok">${c.record.verification_summary.verified}/${c.record.verification_summary.statements} verified</span>${c.record.repairs ? `<span class="chip gold">repair round ran</span>` : ""}${c.reviewDoc ? `<span class="chip">reviewed by ${esc(c.reviewDoc.reviewer || "associate")}</span>` : ""}</div>` : "";
  $("#main").innerHTML = `<div class="page"><div class="wrap"><div class="eyebrow">Step 2 · Draft</div><h1>Draft assessment</h1><p class="lede">The model reads the numbered passages and returns a structured draft. Every citation is then checked mechanically; if any fail, the model gets exactly one round to fix or drop them. Unverified statements stay in the draft, marked. About two minutes.</p>${existing}<div class="actions">${c.record ? `<a class="btn" href="#/c/${slug}/review">Open existing draft</a>` : ""}<button class="btn ${c.record ? "" : "primary"}" id="runBtn" ${c.running ? "disabled" : ""}>${c.record ? "Re-draft (replaces the draft and any review)" : "Start drafting"}</button></div><div id="runout"></div></div></div>`;
  $("#runBtn").addEventListener("click", async () => {
    if (c.record && !confirm("Re-drafting replaces the current draft and clears the associate review. Continue?")) return;
    $("#runBtn").disabled = true;
    const log = []; $("#runout").innerHTML = render(log, true);
    const res = await fetch(`/api/companies/${slug}/draft`, { method: "POST" });
    const reader = res.body.getReader(), dec = new TextDecoder(); let buf = "";
    while (true) {
      const { value, done } = await reader.read(); if (done) break;
      buf += dec.decode(value, { stream: true });
      let i; while ((i = buf.indexOf("\n\n")) >= 0) { const line = buf.slice(0, i).replace(/^data: /, ""); buf = buf.slice(i + 2); if (line) { log.push(JSON.parse(line)); $("#runout").innerHTML = render(log, true); } }
    }
    $("#runout").innerHTML = render(log, false);
    state.decisions = {}; state.note = "";
    const fresh = await loadCompany(slug); setSteps(fresh, "draft");
  });
}

function updateReviewCounts() {
  const el = $("#cnt"); if (!el) return;
  const d = Object.values(state.decisions);
  el.textContent = `${d.filter((x) => x.action === "remove").length} removed · ${d.filter((x) => x.action === "edit" && x.text).length} edited`;
}
async function screenReview(slug) {
  const c = await loadCompany(slug);
  if (!c.record) { location.hash = `#/c/${slug}/draft`; return; }
  setSteps(c, "review");
  const toolbar = `<div class="reviewbar"><input id="reviewer" placeholder="Your name" value="${esc(state.reviewer)}"><textarea id="note" placeholder="Associate's note for the partners: thesis fit, impressions from the call, anything the draft cannot know. Shown at the top of the partner view.">${esc(state.note)}</textarea><div class="r"><div style="display:flex;gap:8px"><button class="btn primary" id="saveBtn">Save review</button><a class="btn" href="#/c/${slug}/partner">Partner view</a></div><span class="cnt" id="cnt"></span><span class="savedmsg" id="saved">${c.reviewDoc ? "Saved " + esc(c.reviewDoc.updated) : ""}</span></div></div>`;
  $("#main").innerHTML = readerHtml(c, "review", toolbar);
  wireReader(c, "review"); updateReviewCounts();
  $("#saveBtn").addEventListener("click", async () => {
    state.reviewer = $("#reviewer").value; state.note = $("#note").value;
    const clean = Object.fromEntries(Object.entries(state.decisions).filter(([, d]) => d.action !== "keep").map(([k, d]) => [k, { action: d.action, text: d.text }]));
    const doc = await api(`/companies/${slug}/review`, { method: "PUT", body: JSON.stringify({ reviewer: state.reviewer, note: state.note, decisions: clean }) });
    $("#saved").textContent = "Saved " + doc.updated;
    c.reviewDoc = doc; setSteps(c, "review");
  });
}
async function screenPartner(slug) {
  const c = await loadCompany(slug);
  if (!c.record) { location.hash = `#/c/${slug}/draft`; return; }
  setSteps(c, "partner");
  const bar = `<div class="reviewbar" style="grid-template-columns:1fr auto"><p class="lede" style="font-size:12.5px">What the partners receive: the associate's note, then the draft with removed statements gone and edited ones in their edited form. Every remaining claim still opens its source. ${c.reviewDoc ? "" : "No review has been saved yet, so this is the unedited draft."}</p><div style="display:flex;gap:8px"><button class="btn" onclick="window.print()">Print or save as PDF</button><a class="btn" href="/${slug}/assessment.md" target="_blank">Markdown</a><a class="btn primary" href="#/c/${slug}/followup">Follow-up</a></div></div>`;
  $("#main").innerHTML = readerHtml(c, "partner", bar);
  wireReader(c, "partner");
}
async function screenFollowup(slug) {
  const c = await loadCompany(slug);
  if (!c.record) { location.hash = `#/c/${slug}/draft`; return; }
  setSteps(c, "followup");
  const a = c.record.assessment;
  const items = a.missing.map((m, i) => ({ i, ...m }));
  const oqs = a.dimensions.flatMap((d) => d.open_questions.map((q) => ({ dim: d.name, q })));
  const build = () => {
    const picked = items.filter((m) => $(`#m${m.i}`).checked);
    const qs = oqs.filter((_, i) => $(`#q${i}`)?.checked);
    const name = $("#from").value.trim() || "[your name]";
    const body = `Hi [founder],\n\nThank you for the time on the call. To take ${c.name} to our partners we would need the following${picked.length ? ":" : "."}\n\n${picked.map((m) => `- ${m.item}. ${m.why_it_matters}`).join("\n")}${qs.length ? `\n\nA few questions we did not get to:\n\n${qs.map((x) => `- ${x.q}`).join("\n")}` : ""}\n\nAnything you can share this week helps; partial is fine. Happy to jump on a short call if easier.\n\nBest,\n${name}`;
    $("#email").innerHTML = `<div class="subj">Subject: Follow-ups after our call · ${esc(c.name)}</div>${esc(body)}`;
    $("#copyBtn").onclick = () => navigator.clipboard.writeText(`Subject: Follow-ups after our call · ${c.name}\n\n${body}`).then(() => { $("#copyBtn").textContent = "Copied"; setTimeout(() => ($("#copyBtn").textContent = "Copy email"), 1500); });
  };
  $("#main").innerHTML = `<div class="page"><div class="wrap" style="max-width:1100px"><div class="eyebrow">Step 5 · Follow-up</div><h1>Follow-up to the founder</h1><p class="lede">The missing list becomes the request, sent before the partner meeting rather than after it. Untick anything you already have. The questions are the draft's open questions per dimension; include the ones worth asking in writing.</p>
  <div class="fu"><div><h3 style="font-size:15px;margin-bottom:12px">What is missing</h3><ul>${items.map((m) => `<li><input type="checkbox" id="m${m.i}" checked><div><b>${esc(m.item)}</b><br><span>${esc(m.why_it_matters)}</span></div></li>`).join("")}</ul><h3 style="font-size:15px;margin:22px 0 12px">Open questions</h3><ul>${oqs.map((x, i) => `<li><input type="checkbox" id="q${i}"><div><span class="faint" style="font-size:11px">${esc(x.dim)}</span><br>${esc(x.q)}</div></li>`).join("")}</ul></div>
  <div><div class="actions" style="margin:0 0 12px"><input id="from" placeholder="Your name" value="${esc(state.reviewer)}" style="border:1px solid var(--line-strong);border-radius:6px;padding:7px 10px;background:var(--sheet);font-size:12.5px;outline:none"><button class="btn primary" id="copyBtn">Copy email</button></div><div class="email" id="email"></div></div></div></div></div>`;
  $("#main").addEventListener("input", build); build();
}

// ---------- router ----------
async function route() {
  const h = location.hash.replace(/^#\/?/, "");
  const parts = h.split("/").filter(Boolean);
  document.querySelectorAll("[data-nav]").forEach((a) => a.classList.toggle("on", (a.dataset.nav === "new" && parts[0] === "new") || (a.dataset.nav === "companies" && parts[0] !== "new")));
  try {
    if (!parts.length) return await screenCompanies();
    if (parts[0] === "new") return screenNew();
    if (parts[0] === "c" && parts[1]) {
      const slug = parts[1], sub = parts[2] || "";
      if (state.companySlug !== slug) state.sel = null;
      if (sub === "") return await screenSources(slug);
      if (sub === "draft") return await screenDraft(slug);
      if (sub === "review") return await screenReview(slug);
      if (sub === "partner") return await screenPartner(slug);
      if (sub === "followup") return await screenFollowup(slug);
    }
    location.hash = "#/";
  } catch (err) {
    $("#main").innerHTML = `<div class="page"><p class="err">${esc(err.message)}</p></div>`;
  }
}
window.addEventListener("hashchange", route);
route();
