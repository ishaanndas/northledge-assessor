// Routes: #/  #/new  #/c/:slug/(sources|draft|review|partner|followup)
const $ = (s, el = document) => el.querySelector(s);
const esc = Doc.esc;
const api = async (path, opts = {}) => {
  const r = await fetch("/api" + path, { headers: { "Content-Type": "application/json" }, ...opts });
  if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || r.statusText);
  return r.json();
};
const STAGES = [["sources", "Sources"], ["draft", "Draft"], ["review", "Review"], ["partner", "Partner page"], ["followup", "Follow-up"]];
const S = { slug: null, company: null, selected: null, decisions: {}, overrides: {}, reviewer: localStorage.getItem("reviewer") || "", note: "", saveTimer: null, saved: "" };
const fmt = (iso) => iso ? iso.replace("T", " ").slice(0, 16) : "";

// ---------- shell ----------
let inboxCount = null;
function topbar(crumbs = [], right = "") {
  $("#top").innerHTML = `<a class="name" href="#/"><span class="mark">SA</span>Seed assessments</a>${crumbs.length ? `<div class="crumbs">${crumbs.map((c, i) => `<span>/</span>${c.href ? `<a href="${c.href}">${esc(c.label)}</a>` : `<b>${esc(c.label)}</b>`}`).join("")}</div>` : ""}<div class="right"><a class="navlink" href="#/inbox" id="inboxLink">Inbox${inboxCount ? ` <span class="count">${inboxCount}</span>` : ""}</a>${right}</div>`;
  if (inboxCount === null) api("/inbox").then((r) => { inboxCount = r.messages.filter((m) => !m.imported).length; const el = $("#inboxLink"); if (el) el.innerHTML = `Inbox${inboxCount ? ` <span class="count">${inboxCount}</span>` : ""}`; }).catch(() => {});
}
function stageState(c, key) {
  const d = Object.values(c.reviewDoc?.decisions || {});
  switch (key) {
    case "sources": return `${c.sources.reduce((n, s) => n + s.passages, 0)} passages`;
    case "draft": return c.running ? "running" : c.record ? `${c.record.verification_summary.verified}/${c.record.verification_summary.statements} verified` : "not started";
    case "review": return !c.record ? "" : c.reviewDoc ? `${d.filter((x) => x.action === "remove").length} removed, ${d.filter((x) => x.action === "edit").length} edited` : "not started";
    case "partner": return c.record ? (c.reviewDoc ? "ready" : "unreviewed") : "";
    case "followup": return c.record ? `${c.record.assessment.missing.length} items` : "";
  }
}
function workspace(c, current, body) {
  const rail = STAGES.map(([k, label]) => `<a class="stage ${k === current ? "on" : ""} ${k !== "sources" && k !== "draft" && !c.record ? "off" : ""}" href="#/c/${c.slug}/${k}"><span>${label}</span><small>${esc(stageState(c, k))}</small></a>`).join("");
  const ref = `<a class="stage" href="#/">All companies</a>${c.record ? `<a class="stage" href="/${c.origin === "example" ? c.slug : "companies/" + c.slug + "/out"}/assessment.md" target="_blank">Markdown draft</a>` : ""}`;
  $("#main").innerHTML = `<div class="ws"><nav class="rail"><div class="co"><b>${esc(c.name)}</b><span>${esc(c.one_liner || "")}${c.ask ? ` · ${esc(c.ask)}` : ""}</span></div><div class="grp"><div class="seclabel">Workflow</div>${rail}</div><div class="grp"><div class="seclabel">Reference</div>${ref}</div><div class="foot">${c.origin === "example" ? "Example company" : "Added " + fmt(c.created_at)}</div></nav><div class="content">${body}</div></div>`;
}
const stagehead = (title, right = "", state = "") => `<div class="stagehead"><h2>${title}</h2>${state ? `<span class="state">${state}</span>` : ""}<div class="r">${right}</div></div>`;

async function load(slug) {
  const c = await api(`/companies/${slug}`);
  if (S.slug !== slug) { S.selected = null; S.note = ""; S.decisions = {}; S.overrides = {}; S.saved = ""; }
  if (c.reviewDoc) { S.decisions = c.reviewDoc.decisions || {}; S.overrides = c.reviewDoc.overrides || {}; S.note = c.reviewDoc.note || ""; if (c.reviewDoc.reviewer) S.reviewer = c.reviewDoc.reviewer; S.saved = c.reviewDoc.updated; }
  S.slug = slug; S.company = c;
  return c;
}

// ---------- companies ----------
async function pageCompanies() {
  topbar([], `<a class="btn primary" href="#/new">New company <span class="arr">→</span></a>`);
  const list = await api("/companies");
  const inbox = await api("/inbox").catch(() => ({ messages: [] }));
  const waiting = inbox.messages.filter((m) => !m.imported);
  const view = localStorage.getItem("view") || "grid";
  const badge = (c) => c.running ? `<span class="badge blue">Drafting</span>` : c.status === "reviewed" ? `<span class="badge green">Reviewed</span>` : c.status === "drafted" ? `<span class="badge amber">Needs review</span>` : `<span class="badge">Sources only</span>`;
  const tone = (c) => c.running ? "run" : c.status === "reviewed" ? "ok" : c.status === "drafted" ? "warn" : "";
  const target = (c) => `#/c/${c.slug}/${c.status === "sources" ? "sources" : "review"}`;
  const initials = (n) => n.split(/\s+/).map((w) => w[0]).join("").slice(0, 2).toUpperCase();
  const via = (c) => c.intake?.via === "inbox" ? "Inbox" : c.origin === "example" ? "Example" : "Manual";
  const filler = list.length % 3 ? `<div class="cardx add" data-href="#/new"><div class="ico">+</div><h3>New company</h3><p class="desc">Drop a deck, paste a link, or import from the inbox.</p></div>` : "";
  const cards = list.map((c) => `<div class="cardx ${tone(c)}" data-href="${target(c)}"><div class="row1"><div class="ico">${esc(initials(c.name))}</div>${badge(c)}</div><div><h3>${esc(c.name)}</h3></div><p class="desc">${esc(c.one_liner || "")}${c.ask ? ` · ${esc(c.ask)}` : ""}</p><div class="forms"><div class="micro">Sources</div><div class="chips">${c.sources.map((s) => `<span class="chip">${esc(s.key)} · ${s.passages}</span>`).join("")}</div></div><div class="foot"><span>${c.verification_summary ? `<b>${c.verification_summary.verified}/${c.verification_summary.statements}</b> verified · <b>${c.missing_count}</b> gaps${c.review?.reviewer ? ` · ${esc(c.review.reviewer)}` : ""}` : "Not drafted"}</span><span>${c.status === "sources" ? "Open sources" : "Open review"} →</span></div></div>`).join("");
  const rows = list.map((c) => `<tr class="row" data-href="${target(c)}"><td><div class="nm">${esc(c.name)}</div><div class="ol">${esc(c.one_liner || "")}</div></td><td class="nw">${badge(c)}</td><td class="sec">${c.sources.map((s) => esc(s.key)).join(", ")}</td><td class="num">${c.verification_summary ? `${c.verification_summary.verified} / ${c.verification_summary.statements}` : ""}</td><td class="num">${c.missing_count ?? ""}</td><td class="sec nw">${esc(c.ask || "")}</td><td class="sec nw">${via(c)}</td><td class="sec nw">${c.review ? esc(c.review.reviewer || "") : ""}</td></tr>`).join("");
  const table = `<table class="list"><thead><tr><th>Company</th><th>Stage</th><th>Sources</th><th>Verified</th><th>Gaps</th><th>Round</th><th>Via</th><th>Reviewer</th></tr></thead><tbody>${rows}</tbody></table>`;
  $("#main").innerHTML = `<div class="page"><div class="inner"><div class="head"><h1>Seed assessments</h1><p class="sub">First-pass drafts for partner review. Every claim cites a passage from the deck, website, bios or call notes; nothing here scores or recommends.</p></div>
  <div class="callouts"><div class="callout"><div class="ico">+</div><div><div class="micro">Start here</div><h3>Add a company</h3><p>Drop a deck (PDF, PPTX, DOCX), paste a website link, or paste text. The fields fill themselves from the deck.</p></div><a class="btn primary" href="#/new">New company <span class="arr">→</span></a></div>
  <div class="callout ${waiting.length ? "live" : ""}"><div class="ico">✉</div><div><div class="micro">Inbox</div><h3>${waiting.length ? `${waiting.length} message${waiting.length === 1 ? "" : "s"} with decks waiting` : "Nothing waiting"}</h3><p>Decks that arrive by email land here. Import one to create the company with its attachments already read.</p></div><a class="btn" href="#/inbox">Open inbox <span class="arr">→</span></a></div></div>
  <div class="gridhead"><span class="seclabel">Companies · ${list.length}</span><div class="seg" role="tablist"><button data-view="grid" class="${view === "grid" ? "on" : ""}">Cards</button><button data-view="list" class="${view === "list" ? "on" : ""}">List</button></div></div>
  ${list.length ? (view === "list" ? table : `<div class="cards">${cards}${filler}</div>`) : `<div class="empty">No companies yet.</div>`}</div></div>`;
  $("#main").addEventListener("click", (e) => {
    const v = e.target.closest("button[data-view]"); if (v) { localStorage.setItem("view", v.dataset.view); pageCompanies(); return; }
    const el = e.target.closest("[data-href]"); if (el) location.hash = el.dataset.href;
  });
}

// ---------- new company ----------
function pageNew(prefillSlug) {
  topbar([{ label: "New company" }]);
  const src = (key, label, hint, allowUrl) => `<div class="src" data-key="${key}"><div class="lab"><b>${label}</b><span>${hint}</span><span class="st" id="st-${key}"></span><label class="pick">Choose file<input type="file" accept=".pdf,.pptx,.docx,.md,.txt" data-into="${key}"></label></div>
    ${allowUrl ? `<div class="urlrow"><input class="input" placeholder="${key === "website" ? "https://company.com" : "Link to the deck (DocSend links need the file downloaded first)"}" data-url="${key}"><button class="btn sm" data-fetch="${key}">Fetch</button></div>` : ""}
    <div class="drop" data-drop="${key}"><textarea class="textarea" name="${key}" placeholder="Paste text, or drop a file here"></textarea></div></div>`;
  $("#main").innerHTML = `<div class="page"><div class="inner" style="max-width:820px"><div class="head"><h1>New company</h1><p class="sub">Drop the deck first. The company name, one-liner, round, website and founder bios fill from it; correct anything that is wrong and add what the deck does not have.</p></div>
  <form class="form" id="f"><div class="three"><label class="field">Company<input class="input" name="name" required></label><label class="field">One-liner<input class="input" name="one_liner"></label><label class="field">Round<input class="input" name="ask" placeholder="$2M seed"></label></div>
  <div class="fill" id="fill" hidden></div>
  ${src("deck", "Deck", "PDF, PPTX or DOCX; one passage per slide", true)}${src("website", "Website", "fetched as text, hidden elements included", true)}${src("founders", "Founder bios", "from the deck's team slide or pasted", false)}${src("call-notes", "Call notes", "your notes from the first call; PDF, DOCX or text", false)}
  <div class="foot"><button class="btn primary" type="submit">Create and draft <span class="arr">→</span></button><span class="hint">Drafting takes about two minutes.</span><span class="err" id="err"></span></div></form></div></div>`;
  const ta = (key) => $(`textarea[name="${key}"]`);
  const status = (key, text, cls = "") => { const el = $(`#st-${key}`); el.textContent = text; el.className = "st " + cls; };
  const toB64 = (file) => new Promise((ok, no) => { const r = new FileReader(); r.onload = () => ok(r.result.split(",")[1]); r.onerror = no; r.readAsDataURL(file); });
  async function ingestFile(key, file) {
    status(key, `Reading ${file.name}…`);
    try {
      const r = await api("/extract", { method: "POST", body: JSON.stringify({ filename: file.name, data: await toB64(file) }) });
      ta(key).value = r.text;
      const m = r.meta;
      status(key, `${file.name}: ${m.pages ? m.pages + " pages" : m.slides ? m.slides + " slides" : m.paragraphs ? m.paragraphs + " paragraphs" : "read"}`, "ok");
      if (key === "deck") autofill(r.text);
    } catch (err) { status(key, err.message, "bad"); }
  }
  async function ingestUrl(key, url) {
    if (!url.trim()) return;
    status(key, `Fetching ${url}…`);
    try {
      const r = await api("/extract", { method: "POST", body: JSON.stringify({ url }) });
      ta(key).value = r.text;
      status(key, `${r.meta.title || url}: ${r.meta.paragraphs} paragraphs`, "ok");
      if (key === "deck") autofill(r.text);
    } catch (err) { status(key, err.message, "bad"); }
  }
  async function autofill(deckText) {
    const box = $("#fill"); box.hidden = false; box.className = "fill"; box.textContent = "Reading the deck to fill the fields…";
    try {
      const p = await api("/prefill", { method: "POST", body: JSON.stringify({ deck: deckText }) });
      const filled = [];
      const set = (name, val) => { const el = $(`[name="${name}"]`); if (val && !el.value.trim()) { el.value = val; el.classList.add("auto"); filled.push(name.replace("_", " ")); } };
      set("name", p.company_name); set("one_liner", p.one_liner); set("ask", p.round);
      if (p.founder_bios && !ta("founders").value.trim()) { ta("founders").value = p.founder_bios; status("founders", "from the deck's team slide", "ok"); filled.push("founder bios"); }
      if (p.website_url && !ta("website").value.trim()) { $('[data-url="website"]').value = p.website_url; filled.push("website link"); ingestUrl("website", p.website_url); }
      box.className = "fill ok";
      box.innerHTML = filled.length ? `Filled from the deck: ${filled.join(", ")}. Confidence ${p.confidence}. Check them; the deck's words, not ours.` : `The deck did not state the company fields clearly. Fill them in by hand.`;
    } catch (err) { box.className = "fill bad"; box.textContent = `Could not read the deck for fields: ${err.message}`; }
  }
  const f = $("#f");
  f.addEventListener("change", (e) => { const inp = e.target.closest("input[type=file]"); if (inp?.files[0]) ingestFile(inp.dataset.into, inp.files[0]); });
  f.addEventListener("click", (e) => { const b = e.target.closest("button[data-fetch]"); if (b) { e.preventDefault(); ingestUrl(b.dataset.fetch, $(`[data-url="${b.dataset.fetch}"]`).value); } });
  f.addEventListener("keydown", (e) => { if (e.key === "Enter" && e.target.matches("[data-url]")) { e.preventDefault(); ingestUrl(e.target.dataset.url, e.target.value); } });
  f.addEventListener("input", (e) => { if (e.target.matches("input,textarea")) e.target.classList.remove("auto"); });
  for (const z of f.querySelectorAll("[data-drop]")) {
    z.addEventListener("dragover", (e) => { e.preventDefault(); z.classList.add("over"); });
    z.addEventListener("dragleave", () => z.classList.remove("over"));
    z.addEventListener("drop", (e) => { e.preventDefault(); z.classList.remove("over"); const file = e.dataTransfer.files[0]; if (file) ingestFile(z.dataset.drop, file); else { const url = e.dataTransfer.getData("text/uri-list") || e.dataTransfer.getData("text"); if (/^https?:/.test(url)) ingestUrl(z.dataset.drop, url); } });
  }
  f.addEventListener("submit", async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    try {
      const { slug } = await api("/companies", { method: "POST", body: JSON.stringify({ name: fd.get("name"), one_liner: fd.get("one_liner"), ask: fd.get("ask"), intake: { via: "manual" }, sources: { deck: fd.get("deck"), website: fd.get("website"), founders: fd.get("founders"), "call-notes": fd.get("call-notes") } }) });
      location.hash = `#/c/${slug}/draft?start=1`;
    } catch (err) { $("#err").textContent = err.message; }
  });
}

// ---------- inbox ----------
async function pageInbox() {
  topbar([{ label: "Inbox" }]);
  const { status, messages } = await api("/inbox");
  const prov = status.providers.map((p) => `<div class="prov ${p.connected ? "on" : ""}"><span class="dot"></span><div><b>${esc(p.name)}</b><span>${esc(p.detail)}</span></div></div>`).join("");
  const kindIcon = (k) => ({ pdf: "PDF", pptx: "PPT", docx: "DOC", md: "MD", txt: "TXT" }[k] || k.toUpperCase());
  const rows = messages.map((m) => `<div class="msg ${m.imported ? "done" : ""}" data-id="${m.id}"><div class="who"><b>${esc(m.from)}</b><span>${esc(m.date)}</span></div><div class="subj">${esc(m.subject)}</div><div class="body">${esc(m.body.split("\n").filter(Boolean)[0] || "")}</div><div class="att">${m.attachments.map((a) => `<a class="file" href="/inbox/${encodeURIComponent(m.id)}/${encodeURIComponent(a.name)}" target="_blank"><span class="k">${kindIcon(a.kind)}</span>${esc(a.name)}<span class="sz">${(a.bytes / 1024).toFixed(0)} KB</span></a>`).join("")}${m.links.map((l) => `<span class="file"><span class="k">URL</span>${esc(l.replace(/^https?:\/\//, ""))}</span>`).join("")}</div><div class="act">${m.imported ? `<span class="badge green">Imported</span><a class="btn sm" href="#/c/${m.imported.slug}/review">Open ${esc(m.imported.slug)}</a>` : `<button class="btn primary sm" data-import="${m.id}">Import as company <span class="arr">→</span></button>`}</div></div>`).join("");
  $("#main").innerHTML = `<div class="page"><div class="inner" style="max-width:960px"><div class="head"><h1>Inbox</h1><p class="sub">Decks that arrive by email. ${esc(status.rule)}</p></div>
  <div class="provs">${prov}</div>
  <div class="gridhead"><span class="seclabel">Messages · ${messages.length}</span><span class="hint">To add one by hand, drop a folder with a message.json and the attachments into inbox/.</span></div>
  <div class="msgs">${rows || `<div class="empty">Nothing waiting.</div>`}</div></div></div>`;
  $("#main").addEventListener("click", async (e) => {
    const b = e.target.closest("button[data-import]"); if (!b) return;
    b.disabled = true; b.textContent = "Reading attachments…";
    try {
      const r = await api(`/inbox/${encodeURIComponent(b.dataset.import)}/import`, { method: "POST" });
      inboxCount = null;
      location.hash = `#/c/${r.slug}/sources`;
    } catch (err) { b.disabled = false; b.textContent = "Import failed: " + err.message; }
  });
}

// ---------- sources ----------
async function pageSources(slug) {
  const c = await load(slug);
  topbar([{ label: c.name }]);
  const body = stagehead("Sources", c.record ? `<a class="btn" href="#/c/${slug}/draft">Draft again</a>` : `<a class="btn primary" href="#/c/${slug}/draft?start=1">Draft assessment <span class="arr">→</span></a>`, "What the model reads. A claim can cite nothing else.") +
    `<div class="scroll"><div class="pad narrow">${c.design_note ? `<div class="callout" style="grid-template-columns:1fr;margin-bottom:28px"><div><div class="micro">Why this example exists</div><p style="margin-top:6px">${esc(c.design_note)}</p></div></div>` : ""}${c.intake?.via === "inbox" ? `<div class="callout" style="grid-template-columns:1fr;margin-bottom:28px"><div><div class="micro">Imported from the inbox</div><p style="margin-top:6px">${esc(c.intake.from)} · ${esc(c.intake.subject)}. ${(c.intake.notes || []).map(esc).join(" · ")}</p></div></div>` : ""}${c.sourceDocs.map((s) => `<div class="srcblock"><div class="sbh"><h3>${esc(s.key)}</h3><span class="ti">${esc(s.title)} · ${s.passages.length} passages</span></div>${s.passages.map((p) => `<div class="psg"><span class="id">${esc(p.id)}</span><span class="tx">${esc(p.text)}</span></div>`).join("")}</div>`).join("")}</div></div>`;
  workspace(c, "sources", body);
}

// ---------- draft ----------
async function pageDraft(slug, autostart) {
  const c = await load(slug);
  topbar([{ label: c.name }]);
  const rows = [["split", "Split"], ["draft", "Draft"], ["verify", "Verify"], ["repair", "Repair"], ["reverify", "Re-verify"], ["done", "Write"]];
  const render = (log, running) => {
    const by = Object.fromEntries(log.map((e) => [e.step, e]));
    const last = log.length ? log[log.length - 1].step : null;
    const list = rows.map(([k, label]) => {
      const e = by[k], skip = (k === "repair" || k === "reverify") && by.done && !by.repair;
      const cls = e ? (running && k === last && k !== "done" ? "on" : "done") : skip ? "skip" : "";
      const f = e?.failures ? `<ul class="f">${e.failures.map((x) => `<li>${esc(x.where)}: “${esc(x.quote.slice(0, 90))}” ${esc(x.reason)}</li>`).join("")}</ul>` : "";
      return `<div class="step ${cls}"><i></i><span class="k">${label}</span><span class="m">${skip ? "not needed" : esc(e?.message || "")}${f}</span></div>`;
    }).join("");
    const err = log.find((e) => e.step === "error"), done = by.done;
    return `<div class="run">${list}${err ? `<div class="step err"><i></i><span class="k">Error</span><span class="m">${esc(err.message)}</span></div>` : ""}${done ? `<div class="result"><span><b>${done.summary.verified}</b> of ${done.summary.statements} verified</span><span><b>${done.summary.warning}</b> warnings</span><span><b>${done.summary.failed}</b> unverified</span><span>${done.seconds}s</span><a class="btn primary" href="#/c/${slug}/review" style="margin-left:auto">Open review <span class="arr">→</span></a></div>` : ""}</div>`;
  };
  const prev = c.record ? `<div class="run"><div class="result" style="margin:0 0 22px"><span>Last draft ${esc(c.record.generated_at)}</span><span><b>${c.record.verification_summary.verified}</b> of ${c.record.verification_summary.statements} verified</span>${c.record.repairs ? "<span>repair round ran</span>" : ""}<a class="btn" href="#/c/${slug}/review" style="margin-left:auto">Open review</a></div></div>` : "";
  const body = stagehead("Draft", `<button class="btn ${c.record ? "" : "primary"}" id="run" ${c.running ? "disabled" : ""}>${c.record ? "Draft again" : "Start"}</button>`, c.record ? "Drafting again replaces the draft and clears the review." : "") +
    `<div class="scroll"><div class="pad">${prev}<div id="out"></div></div></div>`;
  workspace(c, "draft", body);
  const start = async () => {
    if (c.record && !autostart && !confirm("Draft again? This replaces the current draft and clears the review.")) return;
    $("#run").disabled = true;
    const log = []; $("#out").innerHTML = render(log, true);
    const res = await fetch(`/api/companies/${slug}/draft`, { method: "POST" });
    if (!res.ok) { $("#out").innerHTML = `<p class="err" style="color:var(--bad)">${esc((await res.json().catch(() => ({}))).error || res.statusText)}</p>`; $("#run").disabled = false; return; }
    const rd = res.body.getReader(), dec = new TextDecoder(); let buf = "";
    for (;;) {
      const { value, done } = await rd.read(); if (done) break;
      buf += dec.decode(value, { stream: true });
      let i; while ((i = buf.indexOf("\n\n")) >= 0) { const line = buf.slice(0, i).replace(/^data: /, ""); buf = buf.slice(i + 2); if (line) { log.push(JSON.parse(line)); $("#out").innerHTML = render(log, true); } }
    }
    $("#out").innerHTML = render(log, false);
    S.decisions = {}; S.note = "";
    if (log.some((e) => e.step === "done")) setTimeout(() => (location.hash = `#/c/${slug}/review`), 900);
    else $("#run").disabled = false;
  };
  $("#run").addEventListener("click", start);
  if (autostart && !c.running) start();
}

// ---------- review / partner ----------
function docOpts(mode) { return { mode, decisions: S.decisions, overrides: S.overrides, selected: S.selected, reviewer: S.reviewer, note: S.note }; }
function renderDoc(c, mode) { const el = $("#doc"); const y = el.parentElement.scrollTop; el.innerHTML = Doc.document(c, docOpts(mode)); el.parentElement.scrollTop = y; }
function renderSide(c, browse) { $("#sideTitle").textContent = browse ? "All passages" : "Source"; $("#side").innerHTML = browse ? Doc.browse(c) : Doc.provenance(c, S.selected); }
function splitView(c, mode) {
  return `<div class="split" id="split"><div class="docwrap"><article class="doc" id="doc">${Doc.document(c, docOpts(mode))}</article></div><aside class="sources"><div class="h"><b id="sideTitle">Source</b><button id="browse">All passages</button><button id="closeSide" hidden>Close</button></div><div class="body" id="side">${Doc.provenance(c, S.selected)}</div></aside></div>`;
}
function setPath(obj, path, value) {
  const keys = path.split("."); let o = obj;
  for (const k of keys.slice(0, -1)) o = o[k] ??= {};
  o[keys[keys.length - 1]] = value;
}
function wireSplit(c, mode) {
  const doc = $("#doc");
  const showSource = (id) => { S.selected = id; doc.querySelectorAll(".claim.lit").forEach((x) => x.classList.remove("lit")); doc.querySelector(`.claim[data-id="${id}"]`)?.classList.add("lit"); renderSide(c, false); $("#split").classList.add("show"); $("#closeSide").hidden = false; };
  doc.addEventListener("click", (e) => {
    const li = e.target.closest(".claim");
    const act = e.target.closest("button[data-act]");
    if (act && li) { S.decisions[li.dataset.id] = { action: act.dataset.act }; renderDoc(c, mode); queueSave(); return; }
    const gact = e.target.closest("button[data-gapact]");
    if (gact) { const i = gact.closest("[data-gap]").dataset.gap; setPath(S.overrides, `missing.${i}.removed`, gact.dataset.gapact === "remove"); renderDoc(c, mode); queueSave(); return; }
    if (li && !e.target.closest("[contenteditable]")) showSource(li.dataset.id);
  });
  doc.addEventListener("focusin", (e) => { const li = e.target.closest(".claim"); if (li && e.target.hasAttribute("contenteditable")) showSource(li.dataset.id); });
  doc.addEventListener("keydown", (e) => {
    const el = e.target.closest("[contenteditable]"); if (!el) return;
    const single = el.dataset.claim || el.classList.contains("inline") || el.dataset.field?.startsWith("questions.") || el.dataset.field?.startsWith("missing.");
    if (e.key === "Enter" && single) { e.preventDefault(); el.blur(); }
    if (e.key === "Escape") el.blur();
    if (e.key === "Backspace" && el.dataset.claim && el.textContent.trim() === "") { e.preventDefault(); S.decisions[el.dataset.claim] = { action: "remove" }; renderDoc(c, mode); queueSave(); }
  });
  doc.addEventListener("input", (e) => {
    const el = e.target.closest("[contenteditable]"); if (!el) return;
    const text = el.innerText.replace(/\u00a0/g, " ").replace(/\n+$/, "");
    if (el.dataset.claim) { const orig = Doc.statements(c.record.assessment).get(el.dataset.claim).stmt.text; S.decisions[el.dataset.claim] = text.trim() && text.trim() !== orig ? { action: "edit", text: text.trim() } : { action: "keep" }; }
    else if (el.dataset.field === "note") S.note = text;
    else if (el.dataset.field === "reviewer") { S.reviewer = text.trim(); localStorage.setItem("reviewer", S.reviewer); }
    else if (el.dataset.field) setPath(S.overrides, el.dataset.field, text.trim());
    queueSave();
  });
  doc.addEventListener("focusout", (e) => { const el = e.target.closest?.("[data-claim]"); if (el) { const d = S.decisions[el.dataset.claim]; if (d?.action === "edit") { el.classList.add("was-edited"); } } });
  $("#browse").addEventListener("click", () => { renderSide(c, true); $("#split").classList.add("show"); $("#closeSide").hidden = false; });
  $("#closeSide").addEventListener("click", () => { $("#split").classList.remove("show"); $("#closeSide").hidden = true; });
}
function queueSave() {
  clearTimeout(S.saveTimer);
  const el = $("#savestate"); if (el) el.textContent = "Saving…";
  S.saveTimer = setTimeout(async () => {
    const clean = Object.fromEntries(Object.entries(S.decisions).filter(([, d]) => d.action !== "keep").map(([k, d]) => [k, { action: d.action, text: d.text }]));
    const doc = await api(`/companies/${S.slug}/review`, { method: "PUT", body: JSON.stringify({ reviewer: S.reviewer, note: S.note, decisions: clean, overrides: S.overrides }) });
    S.saved = doc.updated; S.company.reviewDoc = doc;
    const el2 = $("#savestate"); if (el2) el2.textContent = `Saved ${doc.updated.slice(11, 16)}`;
    const st = document.querySelector('.stage[href$="/review"] small'); if (st) st.textContent = stageState(S.company, "review");
  }, 700);
}
async function pageReview(slug) {
  const c = await load(slug);
  if (!c.record) return (location.hash = `#/c/${slug}/draft`);
  topbar([{ label: c.name }]);
  workspace(c, "review", stagehead("Review", `<span class="state" id="savestate">${S.saved ? "Saved " + S.saved.slice(11, 16) : "Edits save automatically"}</span><a class="btn primary" href="#/c/${slug}/partner">Partner page <span class="arr">→</span></a>`, "Click anywhere to edit. Click a statement to see its source.") + splitView(c, "review"));
  wireSplit(c, "review");
}
async function pagePartner(slug) {
  const c = await load(slug);
  if (!c.record) return (location.hash = `#/c/${slug}/draft`);
  topbar([{ label: c.name }]);
  workspace(c, "partner", stagehead("Partner page", `<button class="btn" onclick="window.print()">Print</button><a class="btn primary" href="#/c/${slug}/followup">Follow-up <span class="arr">→</span></a>`, c.reviewDoc ? "What the partners receive." : "No review yet, so this is the unedited draft.") + splitView(c, "partner"));
  wireSplit(c, "partner");
}

// ---------- follow-up ----------
async function pageFollowup(slug) {
  const c = await load(slug);
  if (!c.record) return (location.hash = `#/c/${slug}/draft`);
  topbar([{ label: c.name }]);
  const a = c.record.assessment;
  const items = a.missing, qs = a.dimensions.flatMap((d) => d.open_questions.map((q) => ({ dim: d.name, q })));
  workspace(c, "followup", stagehead("Follow-up", `<button class="btn primary" id="copy">Copy email</button>`, "Sent to the founder before the partner meeting.") +
    `<div class="scroll"><div class="pad"><div class="fu"><div><h3>Missing</h3><ul>${items.map((m, i) => `<li><input type="checkbox" id="m${i}" checked><div><b>${esc(m.item)}</b><span>${esc(m.why_it_matters)}</span></div></li>`).join("")}</ul><h3>Open questions</h3><ul>${qs.map((x, i) => `<li><input type="checkbox" id="q${i}"><div>${esc(x.q)}<small>${esc(x.dim)}</small></div></li>`).join("")}</ul></div><div><div class="tools"><input class="input" id="from" placeholder="Your name" value="${esc(S.reviewer)}"></div><div class="email" id="email"></div></div></div></div></div>`);
  const build = () => {
    const picked = items.filter((_, i) => $(`#m${i}`).checked), q = qs.filter((_, i) => $(`#q${i}`).checked);
    const body = `Hi [founder],\n\nThanks for the time on the call. To take ${c.name} to our partners we would need:\n\n${picked.map((m) => `- ${m.item}. ${m.why_it_matters}`).join("\n")}${q.length ? `\n\nA few questions we did not get to:\n\n${q.map((x) => `- ${x.q}`).join("\n")}` : ""}\n\nAnything you can share this week helps; partial is fine.\n\nBest,\n${$("#from").value.trim() || "[your name]"}`;
    $("#email").innerHTML = `<div class="subj">Follow-ups after our call · ${esc(c.name)}</div>${esc(body)}`;
    $("#copy").onclick = () => navigator.clipboard.writeText(`Subject: Follow-ups after our call · ${c.name}\n\n${body}`).then(() => { $("#copy").textContent = "Copied"; setTimeout(() => ($("#copy").textContent = "Copy email"), 1400); });
  };
  $("#main").addEventListener("input", build); build();
}

// ---------- router ----------
async function route() {
  const [hashPath, query = ""] = location.hash.replace(/^#\/?/, "").split("?");
  const p = hashPath.split("/").filter(Boolean);
  const q = new URLSearchParams(query);
  try {
    if (!p.length) return await pageCompanies();
    if (p[0] === "new") return pageNew();
    if (p[0] === "inbox") return await pageInbox();
    if (p[0] === "c" && p[1]) {
      const slug = p[1], stage = p[2] || "review";
      if (stage === "sources") return await pageSources(slug);
      if (stage === "draft") return await pageDraft(slug, q.get("start") === "1");
      if (stage === "review") return await pageReview(slug);
      if (stage === "partner") return await pagePartner(slug);
      if (stage === "followup") return await pageFollowup(slug);
    }
    location.hash = "#/";
  } catch (err) { $("#main").innerHTML = `<div class="page"><div class="inner"><p style="color:var(--bad)">${esc(err.message)}</p></div></div>`; }
}
window.addEventListener("hashchange", route);
route();
