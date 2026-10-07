// Routes: #/  #/new  #/c/:slug/(sources|draft|review|partner|followup)
const $ = (s, el = document) => el.querySelector(s);
const esc = Doc.esc;
const api = async (path, opts = {}) => {
  const r = await fetch("/api" + path, { headers: { "Content-Type": "application/json" }, ...opts });
  if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || r.statusText);
  return r.json();
};
const S = { slug: null, company: null, selected: null, decisions: {}, overrides: {}, reviewer: localStorage.getItem("reviewer") || "", note: "", saveTimer: null, saved: "" };
const fmt = (iso) => iso ? iso.replace("T", " ").slice(0, 16) : "";

// ---------- shell ----------
let inboxCount = null;
function topbar(crumbs = [], right = "") {
  $("#top").innerHTML = `<a class="name" href="#/"><span class="mark">SA</span>Seed assessments</a>${crumbs.length ? `<div class="crumbs">${crumbs.map((c, i) => `<span>/</span>${c.href ? `<a href="${c.href}">${esc(c.label)}</a>` : `<b>${esc(c.label)}</b>`}`).join("")}</div>` : ""}<button class="searchbox" id="openSearch"><span class="ico">⌕</span><span>Search companies, decks, claims…</span><kbd>⌘K</kbd></button><div class="right"><a class="navlink" href="#/inbox" id="inboxLink">Inbox${inboxCount ? ` <span class="count">${inboxCount}</span>` : ""}</a><button class="tourbtn" id="tourBtn">Tour</button><a class="navlink" href="/docs">Docs</a>${right}</div>`;
  $("#openSearch").addEventListener("click", openPalette);
  $("#tourBtn").addEventListener("click", () => window.Tour?.start());
  demoBar();
  if (inboxCount === null) api("/inbox").then((r) => { inboxCount = r.messages.filter((m) => !m.imported).length; const el = $("#inboxLink"); if (el) el.innerHTML = `Inbox${inboxCount ? ` <span class="count">${inboxCount}</span>` : ""}`; }).catch(() => {});
}
// On the public demo copy, one line says what is limited.
let demoInfo = null;
function demoBar() {
  if (demoInfo === null) { demoInfo = false; fetch("/api/config").then((r) => r.json()).then((c) => { demoInfo = c.demo ? c : false; demoBar(); }).catch(() => {}); return; }
  if (!demoInfo || $("#demobar")) return;
  const bar = document.createElement("div"); bar.id = "demobar";
  bar.innerHTML = `<span>Live demo</span><span class="sep">·</span><span>Up to ${demoInfo.draftsPerVisitor} new drafts per visitor per day</span><span class="sep">·</span><span>Companies you add are cleared after a day</span><span class="sep">·</span><button id="demoTour">Take the tour</button>`;
  $("#top").after(bar); $("#demoTour").addEventListener("click", () => window.Tour?.start());
}
// The assessment's state, derived: nothing is set by hand.
function assessmentState(c) {
  if (c.running) return { key: "drafting", label: "Drafting", tone: "blue" };
  if (!c.record) return { key: "none", label: "Not drafted", tone: "" };
  if (c.sent) return { key: "sent", label: "Sent to partner", tone: "green", detail: `to ${c.sent.to} · ${fmt(c.sent.at)}` };
  const d = Object.values(c.reviewDoc?.decisions || {});
  const touched = c.reviewDoc && (d.length || (c.reviewDoc.note || "").trim() || Object.keys(c.reviewDoc.overrides || {}).some((k) => k !== "inserts" ? Object.keys(c.reviewDoc.overrides[k] || {}).length || typeof c.reviewDoc.overrides[k] === "string" : Object.keys(c.reviewDoc.overrides.inserts || {}).length));
  if (touched) return { key: "reviewed", label: "Reviewed", tone: "green", detail: `${d.filter((x) => x.action === "remove").length} removed, ${d.filter((x) => x.action === "edit").length} edited${c.reviewDoc.reviewer ? ` · ${c.reviewDoc.reviewer}` : ""}` };
  return { key: "draft", label: "Draft", tone: "amber", detail: `${c.record.verification_summary.verified}/${c.record.verification_summary.statements} verified` };
}
function workspace(c, current, body) {
  const st = assessmentState(c);
  const item = (key, label, small, href) => `<a class="stage ${key === current ? "on" : ""}" href="${href}"><span>${label}</span><small>${esc(small || "")}</small></a>`;
  const rail = `<div class="grp">${item("assessment", "Assessment", st.label, `#/c/${c.slug}`)}${item("sources", "Sources", `${c.sources.reduce((n, s) => n + s.passages, 0)} passages`, `#/c/${c.slug}/sources`)}</div>`;
  setTimeout(() => $("#delCompany")?.addEventListener("click", async () => { if (!confirm(`Delete ${c.name}? Its sources, draft and review are removed. If it came from the inbox, the message can be imported again.`)) return; try { await api(`/companies/${c.slug}`, { method: "DELETE" }); inboxCount = null; location.hash = "#/"; } catch (err) { alert(err.message); } }), 0);
  $("#main").innerHTML = `<div class="ws"><nav class="rail"><div class="co"><b>${esc(c.name)}</b><span>${esc(c.one_liner || "")}${c.ask ? ` · ${esc(c.ask)}` : ""}</span></div>${rail}<div class="foot">${c.origin === "example" ? "Example company" : `Added ${fmt(c.created_at)}<br><button class="dellink" id="delCompany">Delete company</button>`}</div></nav><div class="content">${body}</div></div>`;
}
const stagehead = (title, right = "", state = "") => `<div class="stagehead"><h2>${title}</h2>${state ? `<span class="state">${state}</span>` : ""}<div class="r">${right}</div></div>`;

async function load(slug) {
  const c = await api(`/companies/${slug}`);
  if (S.slug !== slug) { S.selected = null; S.note = ""; S.decisions = {}; S.overrides = {}; S.saved = ""; }
  if (c.reviewDoc) { S.decisions = c.reviewDoc.decisions || {}; S.overrides = c.reviewDoc.overrides || {}; S.note = c.reviewDoc.note || ""; if (c.reviewDoc.reviewer) S.reviewer = c.reviewDoc.reviewer; S.saved = c.reviewDoc.updated; }
  S.slug = slug; S.company = c; blocksCache = null;
  return c;
}


// ---------- command palette ----------
const COMMANDS = [
  { type: "command", title: "New company", subtitle: "Drop a deck, paste a link, or paste text", href: "#/new" },
  { type: "command", title: "Inbox", subtitle: "Decks that arrived by email", href: "#/inbox" },
  { type: "command", title: "All companies", subtitle: "Cards or list", href: "#/" },
];
const TYPE_LABEL = { command: "Go to", company: "Companies", file: "Files", passage: "Source passages", claim: "Claims", gap: "Missing items", flag: "Not evidence", summary: "Summaries", bear: "Case against", message: "Inbox" };
let paletteTimer = null;
function openPalette() {
  if ($("#palette")) return;
  const el = document.createElement("div"); el.id = "palette";
  el.innerHTML = `<div class="pal"><div class="pal-in"><span class="ico">⌕</span><input id="palq" placeholder="Search companies, decks, passages, claims, inbox…" autocomplete="off"><kbd>esc</kbd></div><div class="pal-res" id="palres"></div></div>`;
  document.body.appendChild(el);
  const input = $("#palq"), res = $("#palres");
  let items = [], active = 0;
  const render = () => {
    if (!items.length) { res.innerHTML = `<div class="pal-empty">${input.value.trim() ? "Nothing matches." : "Type to search everything: company names, deck slides, website text, call notes, drafted claims, missing items and inbox emails."}</div>`; return; }
    let lastType = null, h = "";
    items.forEach((it, i) => {
      if (it.type !== lastType) { h += `<div class="pal-grp">${TYPE_LABEL[it.type] || it.type}</div>`; lastType = it.type; }
      h += `<button class="pal-item ${i === active ? "on" : ""}" data-i="${i}"><span class="pt">${esc(it.title)}</span>${it.snippet && it.type !== "company" && it.type !== "command" ? `<span class="ps">${esc(it.snippet)}</span>` : ""}<span class="pm">${esc(it.subtitle || "")}</span></button>`;
    });
    res.innerHTML = h;
    res.querySelector(".pal-item.on")?.scrollIntoView({ block: "nearest" });
  };
  const go = (it) => { closePalette(); if (it.type === "message") { location.hash = "#/inbox"; return; } location.hash = it.href; if (location.hash === it.href) window.dispatchEvent(new HashChangeEvent("hashchange")); };
  const run = async () => {
    const q = input.value.trim();
    if (!q) { items = COMMANDS; active = 0; render(); return; }
    const r = await api(`/search?q=${encodeURIComponent(q)}`);
    const cmds = COMMANDS.filter((c) => c.title.toLowerCase().includes(q.toLowerCase()));
    // Group by type in a sensible order, keep score order within a type.
    const order = ["command", "company", "file", "message", "claim", "passage", "gap", "flag", "summary", "bear"];
    items = [...cmds, ...r.results].sort((a, b) => order.indexOf(a.type) - order.indexOf(b.type) || b.score - a.score);
    active = 0; render();
  };
  input.addEventListener("input", () => { clearTimeout(paletteTimer); paletteTimer = setTimeout(run, 120); });
  input.addEventListener("keydown", (e) => {
    if (e.key === "ArrowDown") { e.preventDefault(); active = Math.min(items.length - 1, active + 1); render(); }
    else if (e.key === "ArrowUp") { e.preventDefault(); active = Math.max(0, active - 1); render(); }
    else if (e.key === "Enter") { e.preventDefault(); if (items[active]) go(items[active]); }
    else if (e.key === "Escape") closePalette();
  });
  res.addEventListener("click", (e) => { const b = e.target.closest(".pal-item"); if (b) go(items[b.dataset.i]); });
  el.addEventListener("click", (e) => { if (e.target === el) closePalette(); });
  items = COMMANDS; render(); input.focus();
}
function closePalette() { $("#palette")?.remove(); }
document.addEventListener("keydown", (e) => { if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") { e.preventDefault(); $("#palette") ? closePalette() : openPalette(); } });

// ---------- companies ----------
async function pageCompanies() {
  topbar([], `<a class="btn primary" href="#/new">New company <span class="arr">→</span></a>`);
  const list = await api("/companies");
  const inbox = await api("/inbox").catch(() => ({ messages: [] }));
  const evals = await fetch("/eval.json").then((r) => (r.ok ? r.json() : [])).catch(() => []);
  const testLabel = (c) => c.origin !== "example" ? "" : !c.design_note ? "Test case" : /adversarial|trap/i.test(c.design_note) ? "Test case · designed to trip the tool" : /contradiction/i.test(c.design_note) ? "Test case · contradicting sources" : /sparse/i.test(c.design_note) ? "Test case · sparse inputs" : "Test case · baseline";
  const evalOf = (c) => evals.find((e) => e.slug === c.slug);
  const evalLine = (c) => { const ev = evalOf(c); if (!ev) return ""; const j = ev.judge?.counts; const miss = ev.expectations.filter((x) => !x.pass).length; return `<span class="evl">${j ? `${j.supported} supported · ${j.partial} partial · ${j.unsupported} unsupported` : ""}${ev.expectations.length ? ` · ${ev.expectations.length - miss}/${ev.expectations.length} expectations` : ""}</span>`; };
  const waiting = inbox.messages.filter((m) => !m.imported);
  const view = localStorage.getItem("view") || "grid";
  const badge = (c) => c.running ? `<span class="badge blue">Drafting</span>` : c.status === "sent" ? `<span class="badge green">Sent to partner</span>` : c.status === "reviewed" ? `<span class="badge green">Reviewed</span>` : c.status === "drafted" ? `<span class="badge amber">Draft</span>` : `<span class="badge">Not drafted</span>`;
  const tone = (c) => c.running ? "run" : c.status === "reviewed" || c.status === "sent" ? "ok" : c.status === "drafted" ? "warn" : "";
  const target = (c) => `#/c/${c.slug}`;
  const initials = (n) => n.split(/\s+/).map((w) => w[0]).join("").slice(0, 2).toUpperCase();
  const via = (c) => c.intake?.via === "inbox" ? "Inbox" : c.origin === "example" ? "Example" : "Manual";
  const filler = list.length % 3 ? `<div class="cardx add" data-href="#/new"><div class="ico">+</div><h3>New company</h3><p class="desc">Drop a deck, paste a link, or import from the inbox.</p></div>` : "";
  const fitRow = (c) => c.tags && (c.tags.fit || c.tags.tags.length) ? `${c.tags.fit ? fitPill(c.tags.fit, c.tags.fitBy === "ai") : ""}${c.tags.tagLabels.map((t) => `<span class="tagchip">${esc(t)}</span>`).join("")}` : "";
  const fitFilter = localStorage.getItem("fitFilter") || "all";
  const shown = fitFilter === "all" ? list : list.filter((c) => c.tags?.fit === fitFilter);
  const count = (k) => list.filter((c) => c.tags?.fit === k).length;
  const filterSeg = `<div class="seg">${[["all", `All ${list.length}`], ...Object.entries(FIT).map(([k, l]) => [k, `${l} ${count(k)}`])].map(([k, l]) => `<button data-fit="${k}" class="${fitFilter === k ? "on" : ""}">${l}</button>`).join("")}</div>`;
  const cards = shown.map((c) => `<div class="cardx ${tone(c)}" data-href="${target(c)}"><div class="row1"><div class="ico">${esc(initials(c.name))}</div>${badge(c)}</div><div><h3>${esc(c.name)}</h3>${c.origin === "example" ? `<div class="tc">${esc(testLabel(c))}</div>` : ""}</div><p class="desc">${esc(c.one_liner || "")}${c.ask ? ` · ${esc(c.ask)}` : ""}</p>${fitRow(c) ? `<div class="forms"><div class="micro">Fit and tags</div><div class="chips">${fitRow(c)}</div></div>` : `<div class="forms"><div class="micro">Sources</div><div class="chips">${c.sources.map((s) => `<span class="chip">${esc(s.key)} · ${s.passages}</span>`).join("")}</div></div>`}<div class="foot"><span>${c.verification_summary ? `<b>${c.verification_summary.verified}/${c.verification_summary.statements}</b> verified · <b>${c.missing_count}</b> gaps${c.review?.reviewer ? ` · ${esc(c.review.reviewer)}` : ""}` : "Not drafted"}${evalLine(c)}</span><span>${c.status === "sources" ? "Open" : "Open assessment"} →</span></div></div>`).join("");
  const rows = shown.map((c) => `<tr class="row" data-href="${target(c)}"><td><div class="nm">${esc(c.name)}</div><div class="ol">${esc(c.one_liner || "")}</div></td><td class="nw">${badge(c)}</td><td class="nw">${c.tags?.fit ? fitPill(c.tags.fit, c.tags.fitBy === "ai") : ""}</td><td class="sec">${(c.tags?.tagLabels || []).map(esc).join(", ")}</td><td class="num">${c.verification_summary ? `${c.verification_summary.verified} / ${c.verification_summary.statements}` : ""}</td><td class="num">${c.missing_count ?? ""}</td><td class="sec nw">${esc(c.ask || "")}</td><td class="sec">${c.origin === "example" ? esc(testLabel(c)) : via(c)}</td></tr>`).join("");
  const table = `<table class="list"><thead><tr><th>Company</th><th>Stage</th><th>Fit</th><th>Tags</th><th>Verified</th><th>Gaps</th><th>Round</th><th>Source</th></tr></thead><tbody>${rows}</tbody></table>`;
  $("#main").innerHTML = `<div class="page"><div class="inner"><div class="head"><h1>Seed assessments</h1><p class="sub">First-pass drafts for partner review. Every claim cites a passage from the deck, website, bios or call notes. Fit tags are suggested by AI and set by the associate.</p></div>
  <div class="callouts"><div class="callout"><div class="ico">+</div><div><div class="micro">Start here</div><h3>Add a company</h3><p>Drop a deck (PDF, PPTX, DOCX), paste a website link, or paste text. The fields fill themselves from the deck.</p></div><a class="btn primary" href="#/new">New company <span class="arr">→</span></a></div>
  <div class="callout ${waiting.length ? "live" : ""}"><div class="ico">✉</div><div><div class="micro">Inbox</div><h3>${waiting.length ? `${waiting.length} email${waiting.length === 1 ? "" : "s"} with decks waiting` : "Nothing waiting"}</h3><p>Decks that arrive by email land here. Import one to create the company with its attachments already read.</p></div><a class="btn" href="#/inbox">Open inbox <span class="arr">→</span></a></div></div>
  <div class="gridhead"><span class="seclabel">Companies · ${list.length}</span>${filterSeg}<div class="seg" role="tablist"><button data-view="grid" class="${view === "grid" ? "on" : ""}">Cards</button><button data-view="list" class="${view === "list" ? "on" : ""}">List</button></div></div>
  ${list.length ? (shown.length ? (view === "list" ? table : `<div class="cards">${cards}${fitFilter === "all" ? filler : ""}</div>`) : `<div class="empty">No companies tagged ${esc(FIT[fitFilter] || "")}.</div>`) : `<div class="empty">No companies yet.</div>`}</div></div>`;
  $("#main").onclick = (e) => {
    const v = e.target.closest("button[data-view]"); if (v) { localStorage.setItem("view", v.dataset.view); pageCompanies(); return; }
    const f = e.target.closest("button[data-fit]"); if (f) { localStorage.setItem("fitFilter", f.dataset.fit); pageCompanies(); return; }
    const el = e.target.closest("[data-href]"); if (el) location.hash = el.dataset.href;
  };
}

// ---------- new company ----------
function pageNew() {
  topbar([{ label: "New company" }]);
  const src = (key, label, hint, allowUrl) => `<div class="src" data-key="${key}"><div class="lab"><b>${label}</b><span>${hint}</span><span class="st" id="st-${key}"></span><label class="pick">Choose file<input type="file" accept=".pdf,.pptx,.docx,.md,.txt" data-into="${key}"></label></div>
    ${allowUrl ? `<div class="urlrow"><input class="input" placeholder="https://company.com" data-url="${key}"><button class="btn sm" data-fetch="${key}">Fetch</button></div>` : ""}
    <div class="drop" data-drop="${key}"><textarea class="textarea" name="${key}" placeholder="Paste text, or drop a file here"></textarea></div></div>`;
  $("#main").innerHTML = `<div class="page" id="newpage"><div class="inner" style="max-width:820px"><div class="head"><h1>New company</h1><p class="sub">Start with the deck. The company name, one-liner, round, website and founder bios fill in from it; correct anything that is wrong.</p></div>
  <form class="form" id="f">
    <div class="deckzone" id="deckzone" data-drop="deck">
      <div class="dz-empty" id="dzEmpty"><div class="dz-icon">↓</div><b>Drop the deck here</b><span>PDF, PowerPoint or Word. Or <label class="dz-pick">choose a file<input type="file" accept=".pdf,.pptx,.docx,.md,.txt" data-into="deck"></label>, or paste a link below.</span>
        <div class="urlrow dz-url"><input class="input" placeholder="Link to the deck: a PDF, a Google Slides link or a Drive link" data-url="deck"><button class="btn sm" data-fetch="deck">Fetch</button></div>
        <span class="dz-test">No deck to hand? <a href="/docs/test-decks" target="_blank">Download a test deck</a> or <a href="/samples/test-decks.zip?download">all of them as a zip</a>.</span></div>
      <div class="dz-busy" id="dzBusy" hidden><div class="spin"></div><b id="dzBusyText">Reading the deck…</b></div>
      <div class="dz-done" id="dzDone" hidden><div class="dz-file"><span class="k" id="dzKind">PDF</span><div><b id="dzName"></b><span id="dzMeta"></span></div><button class="btn sm quiet" type="button" id="dzReplace">Replace</button></div>
        <details class="dz-text"><summary>See the text that was read from it</summary><textarea class="textarea" name="deck" placeholder="Deck text"></textarea></details></div>
      <p class="dz-err" id="dzErr" hidden></p>
    </div>
    <div class="fill" id="fill" hidden></div>
    <div class="three"><label class="field">Company<input class="input" name="name" required></label><label class="field">One-liner<input class="input" name="one_liner"></label><label class="field">Round<input class="input" name="ask" placeholder="$2M seed"></label></div>
    <div class="seclabel" style="margin-top:6px">Other sources, if you have them</div>
    ${src("website", "Website", "the company's site, read as text", true)}${src("founders", "Founder bios", "filled from the deck's team slide, or paste your own", false)}${src("call-notes", "Call notes", "your notes from the first call", false)}
    <div class="foot"><button class="btn primary" type="submit">Create and draft <span class="arr">→</span></button><span class="hint">Drafting takes about two minutes.</span><span class="err" id="err"></span></div>
  </form></div></div>`;
  const ta = (key) => $(`textarea[name="${key}"]`);
  const status = (key, text, cls = "") => { const el = $(`#st-${key}`); if (el) { el.textContent = text; el.className = "st " + cls; } };
  const toB64 = (file) => new Promise((ok, no) => { const r = new FileReader(); r.onload = () => ok(r.result.split(",")[1]); r.onerror = no; r.readAsDataURL(file); });
  const kept = {}; // source key -> {token, kind, pages} for files the server kept
  const describe = (m) => m.pages ? `${m.pages} pages` : m.slides ? `${m.slides} slides` : m.paragraphs ? `${m.paragraphs} paragraphs` : "read";
  const shortUrl = (u) => u.replace(/^https?:\/\//, "").replace(/\/$/, "");
  // The deck area has three looks: empty (drop here), busy, and done (file card).
  const deckState = (state, info = {}) => {
    $("#dzEmpty").hidden = state !== "empty"; $("#dzBusy").hidden = state !== "busy"; $("#dzDone").hidden = state !== "done";
    $("#deckzone").classList.toggle("has-deck", state === "done");
    if (state === "busy") $("#dzBusyText").textContent = info.text || "Reading the deck…";
    if (state === "done") { $("#dzName").textContent = info.name; $("#dzMeta").textContent = info.meta; $("#dzKind").textContent = info.kind; }
    $("#dzErr").hidden = !info.error; if (info.error) $("#dzErr").textContent = info.error;
  };
  async function ingestFile(key, file) {
    if (key === "deck") deckState("busy", { text: `Reading ${file.name}…` }); else status(key, `Reading ${file.name}…`);
    try {
      const r = await api("/extract", { method: "POST", body: JSON.stringify({ filename: file.name, data: await toB64(file) }) });
      ta(key).value = r.text; if (r.file) kept[key] = r.file;
      if (key === "deck") { deckState("done", { name: file.name, meta: describe(r.meta), kind: (file.name.split(".").pop() || "").toUpperCase().slice(0, 4) }); autofill(r.text); }
      else status(key, `${file.name}: ${describe(r.meta)}`, "ok");
    } catch (err) { if (key === "deck") deckState("empty", { error: err.message }); else status(key, err.message, "bad"); }
  }
  async function ingestUrl(key, url) {
    if (!url.trim()) return;
    if (key === "deck") deckState("busy", { text: `Fetching ${shortUrl(url).slice(0, 60)}…` }); else status(key, `Fetching ${shortUrl(url)}…`);
    try {
      const r = await api("/extract", { method: "POST", body: JSON.stringify({ url }) });
      ta(key).value = r.text; if (r.file) kept[key] = r.file;
      if (key === "deck") { deckState("done", { name: r.meta.filename || r.meta.title || shortUrl(url), meta: describe(r.meta) + " · from a link", kind: (r.meta.method || "LINK").toUpperCase().slice(0, 4) }); autofill(r.text); }
      else status(key, `${r.meta.filename || r.meta.title || shortUrl(url)}: ${describe(r.meta)}`, "ok");
    } catch (err) { if (key === "deck") deckState("empty", { error: err.message }); else status(key, err.message, "bad"); }
  }
  async function autofill(deckText) {
    const box = $("#fill"); box.hidden = false; box.className = "fill"; box.textContent = "Reading the deck to fill in the fields…";
    try {
      const p = await api("/prefill", { method: "POST", body: JSON.stringify({ deck: deckText }) });
      const filled = [];
      const set = (name, val) => { const el = $(`[name="${name}"]`); if (val && !el.value.trim()) { el.value = val; el.classList.add("auto"); filled.push({ name: "company", one_liner: "one-liner", ask: "round" }[name] || name); } };
      set("name", p.company_name); set("one_liner", p.one_liner); set("ask", p.round);
      if (p.founder_bios && !ta("founders").value.trim()) { ta("founders").value = p.founder_bios; status("founders", "filled from the deck's team slide", "ok"); filled.push("founder bios"); }
      if (p.website_url && !ta("website").value.trim()) { $('[data-url="website"]').value = p.website_url; status("website", "address from the deck; click Fetch if it is the right site", ""); filled.push("website address"); }
      box.className = "fill ok";
      box.textContent = filled.length ? `Filled in from the deck: ${filled.join(", ")}. Check them; anything green came from the deck.` : "The deck did not state the company details clearly. Fill them in by hand.";
    } catch (err) { box.className = "fill bad"; box.textContent = `Could not read the company details from the deck: ${err.message}`; }
  }
  const f = $("#f");
  f.addEventListener("change", (e) => { const inp = e.target.closest("input[type=file]"); if (inp?.files[0]) ingestFile(inp.dataset.into, inp.files[0]); });
  f.addEventListener("click", (e) => { const b = e.target.closest("button[data-fetch]"); if (b) { e.preventDefault(); ingestUrl(b.dataset.fetch, $(`[data-url="${b.dataset.fetch}"]`).value); } });
  f.addEventListener("keydown", (e) => { if (e.key === "Enter" && e.target.matches("[data-url]")) { e.preventDefault(); ingestUrl(e.target.dataset.url, e.target.value); } });
  f.addEventListener("input", (e) => { if (e.target.matches("input,textarea")) e.target.classList.remove("auto"); });
  $("#dzReplace").addEventListener("click", () => { ta("deck").value = ""; delete kept.deck; deckState("empty"); });
  // Drag and drop: onto a source box puts the file there; anywhere else on the
  // page counts as the deck while there isn't one yet.
  const page = $("#newpage"); let depth = 0;
  const fileFrom = (e) => e.dataTransfer?.files?.[0];
  const urlFrom = (e) => { const u = e.dataTransfer?.getData("text/uri-list") || e.dataTransfer?.getData("text"); return /^https?:/.test(u || "") ? u : null; };
  page.addEventListener("dragenter", (e) => { e.preventDefault(); depth++; page.classList.add("dragging-file"); });
  page.addEventListener("dragleave", () => { if (--depth <= 0) { depth = 0; page.classList.remove("dragging-file"); f.querySelectorAll(".over").forEach((x) => x.classList.remove("over")); } });
  page.addEventListener("dragover", (e) => { e.preventDefault(); const z = e.target.closest("[data-drop]"); f.querySelectorAll(".over").forEach((x) => x !== z && x.classList.remove("over")); (z || $("#deckzone")).classList.add("over"); });
  page.addEventListener("drop", (e) => {
    e.preventDefault(); depth = 0; page.classList.remove("dragging-file"); f.querySelectorAll(".over").forEach((x) => x.classList.remove("over"));
    const z = e.target.closest("[data-drop]"); const key = z ? z.dataset.drop : "deck";
    const file = fileFrom(e), url = urlFrom(e);
    if (file) ingestFile(key, file); else if (url) ingestUrl(key, url);
  });
  f.addEventListener("submit", async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    if (!String(fd.get("deck") || "").trim() && !["website", "founders", "call-notes"].some((k) => String(fd.get(k) || "").trim())) { $("#err").textContent = "Add the deck, or at least one other source."; return; }
    try {
      const { slug } = await api("/companies", { method: "POST", body: JSON.stringify({ name: fd.get("name"), one_liner: fd.get("one_liner"), ask: fd.get("ask"), intake: { via: "manual" }, files: kept, sources: { deck: fd.get("deck"), website: fd.get("website"), founders: fd.get("founders"), "call-notes": fd.get("call-notes") } }) });
      location.hash = `#/c/${slug}?start=1`;
    } catch (err) { $("#err").textContent = err.message; }
  });
}

// ---------- inbox ----------
async function pageInbox() {
  topbar([{ label: "Inbox" }]);
  const { status, messages } = await api("/inbox");
  const kindIcon = (k) => ({ pdf: "PDF", pptx: "PPT", docx: "DOC", md: "MD", txt: "TXT" }[k] || k.toUpperCase());
  const live = status.providers.filter((p) => p.state !== "off");
  const strip = `<div class="instrip"><span>${live.map((p) => `<span class="dot ${p.state === "connected" ? "on" : "wait"}"></span>${esc(p.id === "folder" ? "Sample emails" : p.name)}${p.state === "pending" ? " (waiting for credentials)" : ""}`).join('<span class="sep">·</span>')}</span><span class="sep">·</span><span>${status.automation.autoImport ? (status.automation.autoDraft ? "New emails are imported and drafted on arrival" : "New emails are imported on arrival") : "New emails wait here for you to import"}</span><a class="btn sm" href="#/settings">Inbox settings</a></div>`;
  const waiting = messages.filter((m) => !m.imported).length;
  const rows = messages.map((m) => `<div class="msg ${m.imported ? "done" : ""}" data-id="${m.id}"><div class="who"><b>${esc(m.from)}</b><span>${esc(m.date)}</span></div><div class="subj">${esc(m.subject)}</div><div class="body">${esc(m.body.split("\n").map((l) => l.trim()).filter((l) => l && !/^(hi|hello|hey|dear)\b[^.!?]{0,30}[,!]?$/i.test(l))[0] || "")}</div><div class="att">${m.attachments.map((a) => `<a class="file" href="/inbox/${encodeURIComponent(m.id)}/${encodeURIComponent(a.name)}" target="_blank"><span class="k">${kindIcon(a.kind)}</span>${esc(a.name)}<span class="sz">${(a.bytes / 1024).toFixed(0)} KB</span></a>`).join("")}${m.links.map((l) => `<span class="file"><span class="k">URL</span>${esc(l.replace(/^https?:\/\//, ""))}</span>`).join("")}</div><div class="act">${m.imported ? `<span class="badge green">Imported</span><a class="btn sm" href="#/c/${m.imported.slug}">Open</a>` : `<button class="btn primary sm" data-import="${m.id}">Import as company <span class="arr">→</span></button>`}</div></div>`).join("");
  $("#main").innerHTML = `<div class="page"><div class="inner" style="max-width:960px"><div class="head"><h1>Inbox</h1><p class="sub">Emails with a deck attached, ready to turn into a company. ${waiting ? `${waiting} waiting.` : "Nothing waiting."}</p></div>
  ${strip}
  <div class="msgs">${rows || `<div class="empty">No emails with decks yet.</div>`}</div></div></div>`;
  $("#main").addEventListener("click", async (e) => {
    const b = e.target.closest("button[data-import]"); if (!b) return;
    b.disabled = true; b.textContent = "Reading attachments…";
    try { const r = await api(`/inbox/${encodeURIComponent(b.dataset.import)}/import`, { method: "POST" }); inboxCount = null; location.hash = `#/c/${r.slug}`; }
    catch (err) { b.disabled = false; b.textContent = "Import failed: " + err.message; }
  });
}

async function pageSettings() {
  topbar([{ href: "#/inbox", label: "Inbox" }, { label: "Settings" }]);
  const { status } = await api("/inbox");
  const stateBadge = (p) => p.state === "connected" ? `<span class="badge green">Connected</span>` : p.state === "pending" ? `<span class="badge amber">Set up, waiting for credentials</span>` : `<span class="badge">Not connected</span>`;
  const action = (p) => p.id === "folder" ? "" : p.state === "off" ? `<button class="btn sm" data-connect="${p.id}">${p.id === "forward" ? "Set up" : "Connect"}</button>` : `<button class="btn sm quiet" data-disconnect="${p.id}">Remove</button>`;
  const prov = status.providers.map((p) => `<div class="prov ${p.state !== "off" ? "on" : ""}"><span class="dot"></span><div class="pb"><b>${esc(p.name)}</b>${stateBadge(p)}<span>${esc(p.detail)}</span>${p.id === "forward" && p.config ? `<code class="addr">${esc(p.config.address)}</code>` : ""}</div><div class="pa">${action(p)}</div></div>`).join("");
  const auto = `<div class="auto"><label><input type="checkbox" id="autoImport" ${status.automation.autoImport ? "checked" : ""}> <b>Import on arrival.</b> Every email with a deck becomes a company, with its attachments read and its details filled in, without anyone clicking.</label><label><input type="checkbox" id="autoDraft" ${status.automation.autoDraft ? "checked" : ""} ${status.automation.autoImport ? "" : "disabled"}> <b>Draft on arrival.</b> Each imported company is drafted straight away, so it is waiting for review by the time someone opens the app.</label><p class="hint">Picked up: emails with a ${status.rule.attachments.join(", ")} attachment or a link to a deck. Everything else stays in the mailbox.</p></div>`;
  $("#main").innerHTML = `<div class="page"><div class="inner" style="max-width:860px"><div class="head"><h1>Inbox settings</h1><p class="sub">${esc(status.goal)}</p></div>
  <div class="seclabel" style="margin-bottom:10px">Where emails come from</div><div class="provs">${prov}</div>
  <p class="hint" style="margin:10px 0 0">Mailbox connections are set up with each fund, because Google and Microsoft require the fund's own credentials and every fund routes deal flow a little differently.</p>
  <div class="seclabel" style="margin:28px 0 10px">What happens when an email arrives</div>${auto}
  <div class="actions"><a class="btn" href="#/inbox">Back to the inbox</a></div></div></div>`;
  const save = async (patch) => { await api("/inbox/settings", { method: "PUT", body: JSON.stringify(patch) }); inboxCount = null; pageSettings(); };
  $("#autoImport").addEventListener("change", (e) => save({ autoImport: e.target.checked, ...(e.target.checked ? {} : { autoDraft: false }) }));
  $("#autoDraft").addEventListener("change", (e) => save({ autoDraft: e.target.checked }));
  $("#main").addEventListener("click", (e) => {
    const c = e.target.closest("button[data-connect]"); if (c) { connectFlow(c.dataset.connect, save); return; }
    const d = e.target.closest("button[data-disconnect]"); if (d && confirm("Remove this connection?")) save({ disconnect: d.dataset.disconnect });
  });
}

// The connection flow. Steps mirror what the real OAuth flow asks for; the
// credentials themselves come from the client's own Google or Microsoft app,
// never typed here, so the last step is honest about what happens next.
function connectFlow(provider, save) {
  closePalette();
  const el = document.createElement("div"); el.id = "palette";
  const isGmail = provider === "gmail", isMs = provider === "m365";
  const name = isGmail ? "Gmail / Google Workspace" : isMs ? "Microsoft 365 / Outlook" : "Forwarding address";
  const steps = isGmail || isMs
    ? [
      { t: "What gets connected", b: `A read-only connection to one mailbox, limited to the label or folder you choose. The app reads emails in that label, pulls out deck attachments and links, and never sends, moves or deletes anything.` },
      { t: "Which mailbox and label", form: true },
      { t: "What happens next", b: `${isGmail ? "Google" : "Microsoft"} requires the fund's own ${isGmail ? "OAuth client" : "app registration"} for a connection like this, and that is created by the fund's IT or by us on their behalf during setup. Save these settings now; the moment the credentials are in place, the connection goes live and emails start arriving here on their own.` },
    ]
    : [
      { t: "How it works", b: `We give you an address. Add it as a forwarding rule in your mail client, or hand it to the people who receive decks, and anything sent to it lands in this inbox with its attachments. No access to your mailbox is needed.` },
      { t: "Your address", forward: true },
    ];
  let i = 0; const data = { account: "", watch: isGmail ? "Deal flow" : "Deal flow" };
  const render = () => {
    const st = steps[i];
    el.innerHTML = `<div class="pal connect"><div class="ch"><b>Connect ${esc(name)}</b><span>Step ${i + 1} of ${steps.length}</span><button class="x" id="cx">×</button></div><div class="cb"><h3>${esc(st.t)}</h3>${st.b ? `<p>${esc(st.b)}</p>` : ""}${st.form ? `<label class="field">Mailbox<input class="input" id="acct" placeholder="deals@yourfund.com" value="${esc(data.account)}"></label><label class="field" style="margin-top:12px">${isGmail ? "Gmail label to watch" : "Outlook folder to watch"}<input class="input" id="watch" value="${esc(data.watch)}"></label><p class="hint" style="margin-top:10px">Only emails in this ${isGmail ? "label" : "folder"} are read. A filter in ${isGmail ? "Gmail" : "Outlook"} can route deck emails into it automatically.</p>` : ""}${st.forward ? `<p>Generate the address, then add it as a forwarding rule or share it with founders and introducers.</p>` : ""}</div><div class="cf">${i > 0 ? `<button class="btn" id="back">Back</button>` : ""}<span style="flex:1"></span>${i < steps.length - 1 ? `<button class="btn primary" id="next">Continue</button>` : `<button class="btn primary" id="done">${st.forward ? "Generate address" : "Save connection"}</button>`}</div></div>`;
    el.querySelector("#cx").onclick = () => el.remove();
    el.querySelector("#back")?.addEventListener("click", () => { i--; render(); });
    el.querySelector("#next")?.addEventListener("click", () => { if (st.form) { data.account = el.querySelector("#acct").value.trim(); data.watch = el.querySelector("#watch").value.trim(); if (!data.account) { el.querySelector("#acct").focus(); return; } } i++; render(); });
    el.querySelector("#done")?.addEventListener("click", async () => { el.remove(); if (st.forward) await save({ forwarding: true }); else await save({ provider, account: data.account, watch: `${isGmail ? "label" : "folder"} ${data.watch}` }); });
    el.querySelector("#acct")?.focus();
  };
  document.body.appendChild(el); el.addEventListener("click", (e) => { if (e.target === el) el.remove(); }); render();
}

// ---------- sources ----------
async function pageSources(slug, openPid) {
  const c = await load(slug);
  topbar([{ label: c.name }]);
  const body = stagehead("Sources", c.record ? `<a class="btn" href="#/c/${slug}">Open assessment <span class="arr">→</span></a>` : `<a class="btn primary" href="#/c/${slug}?start=1">Draft assessment <span class="arr">→</span></a>`, "What the model reads. Click a passage to see where it came from.") +
    `<div class="split" id="split" style="--side-w:${sideWidth()}px"><div class="docwrap"><div class="pad narrow">${c.design_note ? `<div class="callout" style="grid-template-columns:1fr;margin-bottom:28px"><div><div class="micro">Why this example exists</div><p style="margin-top:6px">${esc(c.design_note)}</p></div></div>` : ""}${c.intake?.via === "inbox" ? `<div class="callout" style="grid-template-columns:1fr;margin-bottom:28px"><div><div class="micro">Imported from the inbox</div><p style="margin-top:6px">${esc(c.intake.from)} · ${esc(c.intake.subject)}. ${(c.intake.notes || []).map(esc).join(" · ")}</p></div></div>` : ""}${c.sourceDocs.map((s) => `<div class="srcblock"><div class="sbh"><h3>${esc(s.key)}</h3><span class="ti">${esc(s.title)} · ${s.passages.length} passages${c.files?.[s.key] ? ` · <a href="${fileUrl(c, s.key)}" target="_blank">${esc(c.files[s.key].name)}</a>` : ""}</span></div>${s.passages.map((p) => `<div class="psg clickable" data-pid="${esc(p.id)}"><span class="id">${esc(p.id)}</span><span class="tx">${esc(p.text)}</span></div>`).join("")}</div>`).join("")}</div></div>
    <div class="gutter" id="gutter" title="Drag to resize"></div><aside class="sources"><div class="h"><b id="sideTitle">Source</b><button id="closeSide" hidden>Close</button></div><div class="body" id="side"><p class="none">Click a passage and the page it came from opens here.</p></div></aside></div>`;
  workspace(c, "sources", body);
  wireGutter();
  const show = (pid) => { $("#side").innerHTML = viewerHtml(c, pid, null); $("#split").classList.add("show"); $("#closeSide").hidden = false; document.querySelectorAll(".psg.lit").forEach((x) => x.classList.remove("lit")); document.querySelector(`.psg[data-pid="${CSS.escape(pid)}"]`)?.classList.add("lit"); };
  $("#main").addEventListener("click", (e) => { const v = e.target.closest("[data-view]"); if (v) { show(v.dataset.view); return; } const p = e.target.closest(".psg[data-pid]"); if (p) show(p.dataset.pid); });
  $("#closeSide").addEventListener("click", () => { $("#split").classList.remove("show"); $("#closeSide").hidden = true; });
  if (openPid) { show(openPid); document.querySelector(`.psg[data-pid="${CSS.escape(openPid)}"]`)?.scrollIntoView({ block: "center" }); }
}

// ---------- review / partner ----------
function docOpts(mode) { return { mode, decisions: S.decisions, overrides: S.overrides, selected: S.selected, reviewer: S.reviewer, note: S.note }; }
function renderSide(c, browse) { $("#sideTitle").textContent = browse ? "All passages" : "Source"; $("#side").innerHTML = browse ? Doc.browse(c) : S.selected ? statementSide(c, S.selected, S.focusPid) : `<p class="none">Select a statement, or click a citation, and the source opens here.</p>`; }
function splitView(c, mode) {
  return `<div class="split" id="split" style="--side-w:${sideWidth()}px"><div class="docwrap"><article class="doc" id="doc">${Doc.document(c, docOpts(mode))}</article></div><div class="gutter" id="gutter" title="Drag to resize"></div><aside class="sources"><div class="h"><b id="sideTitle">Source</b><button id="browse">All passages</button><button id="closeSide" hidden>Close</button></div><div class="body" id="side">${S.selected ? statementSide(c, S.selected, S.focusPid) : `<p class="none">Select a statement, or click a citation, and the source opens here.</p>`}</div></aside></div>`;
}
function setPath(obj, path, value) {
  const keys = path.split("."); let o = obj;
  for (const k of keys.slice(0, -1)) o = o[k] ??= {};
  o[keys[keys.length - 1]] = value;
}

// ---------- source viewer: the real page behind a passage ----------
// PDF decks open at the page in the browser's viewer; everything else renders
// the passage as a slide-shaped card so the reader still sees it "as a slide".
const fileUrl = (c, key) => c.files?.[key] ? `/${c.origin === "example" ? "examples" : "companies"}/${c.slug}/files/${encodeURIComponent(c.files[key].name)}` : null;
function slideCard(passageText, pid) {
  const lines = passageText.split("\n");
  const m = lines[0].match(/^Slide (\d+):?\s*(.*)$/);
  const title = m ? m[2] || `Slide ${m[1]}` : lines[0];
  const body = (m ? lines.slice(1) : lines.slice(1)).filter(Boolean);
  return `<div class="slidecard"><div class="sc-title">${esc(title)}</div><div class="sc-body">${body.map((l) => `<p>${esc(l)}</p>`).join("")}</div><div class="sc-foot">${esc(pid)}</div></div>`;
}
function passageOf(c, pid) { return c.record?.passages?.[pid]?.text ?? c.sourceDocs?.find((s) => s.key === pid.split(":")[0])?.passages.find((p) => p.id === pid)?.text ?? ""; }
function sourceTitle(c, key) { return c.sourceDocs?.find((s) => s.key === key)?.title || c.record?.sources?.find((s) => s.key === key)?.title || key; }
function sourceLength(c, key) { return c.files?.[key]?.pages || c.sourceDocs?.find((s) => s.key === key)?.passages.length || c.record?.sources?.find((s) => s.key === key)?.passages || 0; }
const hl = (text, quote) => (quote ? Doc.highlight(text, quote) : null) ?? esc(text);
// The thing itself: a PDF page, a slide, or the passage as a page card, with the quoted words marked.
function viewerHtml(c, pid, quote) {
  const [key, n] = pid.split(":"), i = Number(n);
  const file = c.files?.[key], url = fileUrl(c, key), text = passageOf(c, pid), total = sourceLength(c, key);
  const lines = text.split("\n"), slideLike = /^Slide \d+/.test(lines[0]);
  let body;
  if (file?.kind === "pdf" && url) body = `<iframe class="pdf" src="${url}#page=${i}&toolbar=0&navpanes=0&view=Fit" title="${esc(file.name)} page ${i}"></iframe><div class="vquote">${hl(text, quote)}</div>`;
  else if (slideLike) {
    const m = lines[0].match(/^Slide (\d+):?\s*(.*)$/), title = m?.[2] || `Slide ${m?.[1] || i}`;
    body = `<div class="slidecard"><div class="sc-title">${hl(title, quote)}</div><div class="sc-body">${lines.slice(1).filter(Boolean).map((l) => `<p>${hl(l, quote)}</p>`).join("")}</div><div class="sc-foot">${esc(pid)}</div></div>`;
  } else body = `<div class="pagecard">${hl(text, quote)}</div>`;
  const nav = `<div class="vnav"><button class="vb" data-view="${key}:${i - 1}" ${i <= 1 ? "disabled" : ""} title="Previous">←</button><span>${esc(sourceTitle(c, key))}${file ? "" : ""} · ${file?.kind === "pdf" ? "page" : slideLike ? "slide" : "passage"} ${i}${total ? ` of ${total}` : ""}</span><button class="vb" data-view="${key}:${i + 1}" ${total && i >= total ? "disabled" : ""} title="Next">→</button>${url ? `<a class="vb" href="${url}" target="_blank" title="Open the file">↗</a>` : ""}</div>`;
  return `<div class="viewer" data-pid="${esc(pid)}">${nav}${body}</div>`;
}
// Side panel for a statement: the claim, then each cited source shown as itself.
function statementSide(c, id, focusPid) {
  const entry = Doc.statements(c.record.assessment).get(id);
  if (!entry) return `<p class="none">Nothing selected.</p>`;
  const { stmt, where } = entry, st = stmt.verification?.status || "verified";
  const issues = (stmt.verification?.issues || []).join(", ").replace(/_/g, " ");
  const cits = focusPid ? stmt.citations.filter((x) => x.passage_id === focusPid) : stmt.citations;
  let h = `<div class="cl">${esc(stmt.text)}<div class="st"><span class="badge ${st === "verified" ? "green" : st === "warning" ? "amber" : "red"}">${st === "verified" ? "Quote verified" : st === "warning" ? "Warning: " + esc(issues) : "Not verified: " + esc(issues)}</span><span class="badge">${esc(where)}</span>${stmt.basis !== "stated" ? `<span class="badge">${stmt.basis}</span>` : ""}</div></div>`;
  if (!stmt.citations.length) return h + `<p class="none">No citation.</p>`;
  if (focusPid && stmt.citations.length > 1) h += `<button class="btn sm quiet" data-allsources="1" style="margin-bottom:10px">Show all ${stmt.citations.length} sources</button>`;
  for (const cit of cits) {
    const ps = c.record.passages[cit.passage_id];
    if (!ps) { h += `<div class="src"><div class="sh"><span class="chip bad">${esc(cit.passage_id)}</span><span class="nm">no such passage</span></div></div>`; continue; }
    h += viewerHtml(c, cit.passage_id, cit.quote);
  }
  return h;
}

// ---------- resizable side panel ----------
function sideWidth() { const w = Number(localStorage.getItem("sideW")); return w >= 320 ? Math.min(w, Math.floor(innerWidth * 0.7)) : 420; }
function wireGutter() {
  const g = $("#gutter"), split = $("#split"); if (!g || !split) return;
  g.addEventListener("pointerdown", (e) => {
    e.preventDefault(); document.body.classList.add("is-resizing");
    const move = (ev) => { const w = Math.max(320, Math.min(Math.floor(innerWidth * 0.7), Math.round(split.getBoundingClientRect().right - ev.clientX))); split.style.setProperty("--side-w", w + "px"); };
    const up = () => { document.body.classList.remove("is-resizing"); document.removeEventListener("pointermove", move); document.removeEventListener("pointerup", up); document.removeEventListener("pointercancel", up); localStorage.setItem("sideW", String(parseInt(split.style.getPropertyValue("--side-w")) || 420)); };
    document.addEventListener("pointermove", move); document.addEventListener("pointerup", up); document.addEventListener("pointercancel", up);
  });
  g.addEventListener("dblclick", () => { split.style.setProperty("--side-w", "420px"); localStorage.setItem("sideW", "420"); });
}

// ---------- editor ----------
// Caret helpers for contenteditable blocks.
const sel = () => window.getSelection();
function caretAtStart(el) { const s = sel(); if (!s.rangeCount) return false; const r = s.getRangeAt(0).cloneRange(); r.selectNodeContents(el); r.setEnd(s.getRangeAt(0).startContainer, s.getRangeAt(0).startOffset); return r.toString().length === 0; }
function caretAtEnd(el) { const s = sel(); if (!s.rangeCount) return false; const r = s.getRangeAt(0).cloneRange(); r.selectNodeContents(el); r.setStart(s.getRangeAt(0).endContainer, s.getRangeAt(0).endOffset); return r.toString().trim().length === 0; }
function placeCaret(el, where = "end") { if (!el) return; el.focus(); const r = document.createRange(); r.selectNodeContents(el); r.collapse(where === "start"); const s = sel(); s.removeAllRanges(); s.addRange(r); }
function splitAtCaret(el) { const s = sel(); const r = s.getRangeAt(0); const tail = document.createRange(); tail.setStart(r.endContainer, r.endOffset); tail.setEndAfter(el.lastChild || el); const frag = tail.extractContents(); const d = document.createElement("div"); d.appendChild(frag); return d.innerHTML; }
const uid = () => Math.random().toString(36).slice(2, 9);
const editableBlocks = () => [...$("#doc").querySelectorAll(".bc[contenteditable]")];
const blockEl = (bc) => bc.closest(".blk");
const keyOf = (bc) => bc.dataset.key;

// Inserts live in S.overrides.inserts[anchorKey] = [{id,type,html}].
function insertAfter(anchorKey, type = "p", html = "") {
  const ins = (S.overrides.inserts ??= {});
  const id = uid();
  (ins[anchorKey] ??= []).unshift({ id, type, html });
  // Blocks that were anchored to the anchor now follow the new block, so order is preserved.
  if (ins[anchorKey].length > 1) { const rest = ins[anchorKey].splice(1); ins[`ins.${id}`] = [...rest, ...(ins[`ins.${id}`] || [])]; }
  return `ins.${id}`;
}
function findInsert(key) { const id = key.replace(/^ins\./, ""); for (const [anchor, arr] of Object.entries(S.overrides.inserts || {})) { const i = arr.findIndex((x) => x.id === id); if (i >= 0) return { anchor, arr, i, item: arr[i] }; } return null; }
function deleteInsert(key) {
  const f = findInsert(key); if (!f) return;
  const children = (S.overrides.inserts[key] || []); delete S.overrides.inserts[key];
  f.arr.splice(f.i, 1, ...children);
  if (!f.arr.length) delete S.overrides.inserts[f.anchor];
}
function readBlock(bc, c) {
  const key = keyOf(bc), b = currentBlocks(c).find((x) => x.key === key); if (!b) return;
  if (b.type === "claim") { const text = bc.innerText.replace(/ /g, " ").trim(); const orig = b.stmt.text; S.decisions[b.id] = text && text !== orig ? { action: "edit", text } : { action: "keep" }; }
  else if (b.insert) { const f = findInsert(key); if (f) f.item.html = Doc.sanitize(bc.innerHTML); }
  else if (b.field === "note") S.note = Doc.sanitize(bc.innerHTML);
  else if (b.field === "reviewer") { S.reviewer = bc.innerText.trim(); localStorage.setItem("reviewer", S.reviewer); }
  else if (b.field) setPath(S.overrides, b.field, bc.innerText.replace(/ /g, " ").trim());
}
let blocksCache = null;
function currentBlocks(c) { return (blocksCache ??= Doc.buildBlocks(c, docOpts("review"))); }
function renderDoc(c, mode) { blocksCache = null; const el = $("#doc"); const y = el.parentElement.scrollTop; el.innerHTML = Doc.document(c, docOpts(mode)); el.parentElement.scrollTop = y; }
function focusKey(key, where = "end") { const bc = $("#doc").querySelector(`.bc[data-key="${CSS.escape(key)}"]`); placeCaret(bc, where); return bc; }
function closeMenus() { document.querySelectorAll(".menu,.slash").forEach((m) => m.remove()); }
function showMenu(items, x, y, cls = "menu") {
  closeMenus();
  const m = document.createElement("div"); m.className = cls; m.style.left = x + "px"; m.style.top = y + "px";
  m.innerHTML = items.map((it, i) => it.sep ? `<div class="sep"></div>` : `<button data-i="${i}" class="${i === 0 ? "on" : ""}${it.danger ? " danger" : ""}"><span>${esc(it.label)}</span>${it.hint ? `<small>${esc(it.hint)}</small>` : ""}</button>`).join("");
  document.body.appendChild(m);
  m.addEventListener("mousedown", (e) => e.preventDefault());
  m.addEventListener("click", (e) => { const b = e.target.closest("button[data-i]"); if (!b) return; closeMenus(); items[b.dataset.i].run(); });
  return m;
}

function wireSplit(c, mode) {
  const doc = $("#doc");
  const showSource = (id, pid = null) => { S.selected = id; S.focusPid = pid; doc.querySelectorAll(".t-claim.lit").forEach((x) => x.classList.remove("lit")); doc.querySelector(`.t-claim[data-id="${id}"]`)?.classList.add("lit"); renderSide(c, false); $("#split").classList.add("show"); $("#closeSide").hidden = false; };
  const change = () => { blocksCache = null; queueSave(); };
  const rerender = () => { renderDoc(c, mode); };

  doc.addEventListener("click", (e) => {
    const blk = e.target.closest(".blk");
    const act = e.target.closest("button[data-act]");
    if (act && blk) { S.decisions[blk.dataset.id] = { action: act.dataset.act }; change(); rerender(); return; }
    const gact = e.target.closest("button[data-gapact]");
    if (gact && blk) { setPath(S.overrides, `missing.${blk.dataset.gap}.removed`, gact.dataset.gapact === "remove"); change(); rerender(); return; }
    if (e.target.closest("button[data-handle]")) { e.preventDefault(); return; }
    const chip = e.target.closest(".chip.ref[data-pid]");
    if (chip && blk) { e.preventDefault(); showSource(blk.dataset.id, chip.dataset.pid); return; }
    if (blk?.classList.contains("t-claim") && !e.target.closest("[contenteditable]")) showSource(blk.dataset.id);
  });
  doc.addEventListener("focusin", (e) => { const blk = e.target.closest(".t-claim"); if (blk && e.target.hasAttribute("contenteditable") && S.selected !== blk.dataset.id) showSource(blk.dataset.id); });

  function openBlockMenu(key, rect) {
    const b = currentBlocks(c).find((x) => x.key === key); if (!b) return;
    const items = [];
    if (b.type === "claim") items.push(b.decision.action === "remove" ? { label: "Restore claim", run: () => { S.decisions[b.id] = { action: "keep" }; change(); rerender(); } } : { label: "Remove claim", hint: "strikes through, keeps the citation", danger: true, run: () => { S.decisions[b.id] = { action: "remove" }; change(); rerender(); } });
    if (b.type === "claim" && b.decision.action === "edit") items.push({ label: "Revert to the model's wording", run: () => { S.decisions[b.id] = { action: "keep" }; change(); rerender(); } });
    if (b.type === "gap") items.push(b.removed ? { label: "Restore item", run: () => { setPath(S.overrides, `missing.${b.index}.removed`, false); change(); rerender(); } } : { label: "Remove item", danger: true, run: () => { setPath(S.overrides, `missing.${b.index}.removed`, true); change(); rerender(); } });
    if (b.field && !b.insert && b.type !== "reviewer" && b.type !== "note") items.push({ label: "Revert to the model's wording", run: () => { setPath(S.overrides, b.field, ""); change(); rerender(); } });
    if (!b.insert && (S.overrides.moves || {})[key]) items.push({ label: "Put back where the draft had it", run: () => { delete S.overrides.moves[key]; change(); rerender(); } });
    if (b.insert) {
      for (const [t, label] of Object.entries(Doc.INSERT_TYPES)) if (t !== b.type) items.push({ label: `Turn into ${label.toLowerCase()}`, run: () => { const f = findInsert(key); if (f) { f.item.type = t; if (t === "divider") f.item.html = ""; } change(); rerender(); focusKey(key); } });
      items.push({ sep: true }, { label: "Delete block", danger: true, run: () => { deleteInsert(key); change(); rerender(); } });
    }
    items.push({ sep: true }, { label: "Move up", hint: "Alt+↑", run: () => moveBlock(key, -1) }, { label: "Move down", hint: "Alt+↓", run: () => moveBlock(key, 1) });
    items.push({ sep: true }, { label: "Add a block below", hint: "Enter", run: () => { const k = insertAfter(key); change(); rerender(); focusKey(k, "start"); } });
    showMenu(items, rect.left, rect.bottom + 4);
  }

  // Moving blocks. Inserted blocks move by re-anchoring; model blocks record a move override.
  function placeAfter(key, anchorKey) {
    if (key === anchorKey || anchorKey === key) return;
    if (key.startsWith("ins.")) { const f = findInsert(key); if (!f) return; const item = f.item; deleteInsert(key); const ins = (S.overrides.inserts ??= {}); (ins[anchorKey] ??= []).unshift(item); if (ins[anchorKey].length > 1) { const rest = ins[anchorKey].splice(1); ins[key] = [...rest, ...(ins[key] || [])]; } }
    else (S.overrides.moves ??= {})[key] = anchorKey; // keys contain dots, so no setPath here
    change(); rerender();
  }
  function moveBlock(key, dir) {
    const els = [...doc.querySelectorAll(".blk[data-key]")]; const i = els.findIndex((e) => e.dataset.key === key); if (i < 0) return;
    const anchor = dir < 0 ? els[i - 2] : els[i + 1];
    if (dir < 0 && i === 1) return; // already first movable position
    if (!anchor) return;
    placeAfter(key, anchor.dataset.key);
    const el = doc.querySelector(`.blk[data-key="${CSS.escape(key)}"]`); el?.classList.add("flash"); el?.scrollIntoView({ block: "nearest" });
    const bc = el?.querySelector(".bc[contenteditable]"); if (bc) placeCaret(bc, "end");
  }
  // Drag with pointer events (works with mouse, trackpad and automation alike).
  let drag = null;
  const clearDrop = () => { doc.querySelectorAll(".drop-before,.drop-after").forEach((e) => e.classList.remove("drop-before", "drop-after")); };
  doc.addEventListener("pointerdown", (e) => {
    const h = e.target.closest("button[data-handle]"); if (!h || e.button !== 0) return;
    e.preventDefault();
    const blk = h.closest(".blk");
    drag = { key: h.dataset.handle, blk, startY: e.clientY, moved: false, target: null, after: true, ghost: null };
    h.setPointerCapture?.(e.pointerId);
  });
  doc.addEventListener("pointermove", (e) => {
    if (!drag) return;
    if (!drag.moved) { if (Math.abs(e.clientY - drag.startY) < 4) return; drag.moved = true; drag.blk.classList.add("dragging"); document.body.classList.add("is-dragging"); closeMenus();
      const g = drag.blk.cloneNode(true); g.className = "blk drag-ghost"; g.style.width = drag.blk.offsetWidth + "px"; document.body.appendChild(g); drag.ghost = g; }
    drag.ghost.style.transform = `translate(${e.clientX + 12}px, ${e.clientY - 10}px)`;
    const under = document.elementFromPoint(e.clientX, e.clientY)?.closest?.(".blk[data-key]");
    clearDrop();
    if (!under || under === drag.blk || under.closest(".drag-ghost")) { drag.target = null; return; }
    const r = under.getBoundingClientRect(); drag.after = e.clientY > r.top + r.height / 2; drag.target = under;
    under.classList.add(drag.after ? "drop-after" : "drop-before");
    const wrap = doc.parentElement; if (e.clientY < 80) wrap.scrollTop -= 12; else if (e.clientY > window.innerHeight - 80) wrap.scrollTop += 12;
  });
  const endDrag = (e) => {
    if (!drag) return;
    const d = drag; drag = null;
    d.ghost?.remove(); d.blk.classList.remove("dragging"); document.body.classList.remove("is-dragging"); clearDrop();
    if (!d.moved) { if (e.type === "pointerup") openBlockMenu(d.key, d.blk.querySelector(".handle").getBoundingClientRect()); return; }
    if (!d.target) return;
    const els = [...doc.querySelectorAll(".blk[data-key]")]; const i = els.indexOf(d.target);
    const anchor = d.after ? d.target : els[i - 1];
    if (anchor && anchor.dataset.key !== d.key) { placeAfter(d.key, anchor.dataset.key); doc.querySelector(`.blk[data-key="${CSS.escape(d.key)}"]`)?.classList.add("flash"); }
  };
  doc.addEventListener("pointerup", endDrag);
  doc.addEventListener("pointercancel", endDrag);

  function slashMenu(bc) {
    const key = keyOf(bc), rect = bc.getBoundingClientRect();
    const types = Object.entries(Doc.INSERT_TYPES).map(([t, label]) => ({ label, run: () => { const f = findInsert(key); if (f) { f.item.type = t; f.item.html = ""; } bc.innerHTML = ""; change(); rerender(); const nb = focusKey(key, "start"); if (t === "divider") { const k = insertAfter(key); change(); rerender(); focusKey(k, "start"); } } }));
    const m = showMenu(types, rect.left, rect.bottom + 4, "slash");
    m.dataset.for = key;
  }

  doc.addEventListener("keydown", (e) => {
    const bc = e.target.closest(".bc[contenteditable]"); if (!bc) return;
    const key = keyOf(bc), b = currentBlocks(c).find((x) => x.key === key); if (!b) return;
    const isEnter = e.key === "Enter" || e.key === "Return";
    const open = document.querySelector(".slash");
    if (open) {
      const btns = [...open.querySelectorAll("button")], i = btns.findIndex((x) => x.classList.contains("on"));
      if (e.key === "ArrowDown" || e.key === "ArrowUp") { e.preventDefault(); btns[i]?.classList.remove("on"); btns[(i + (e.key === "ArrowDown" ? 1 : btns.length - 1)) % btns.length].classList.add("on"); return; }
      if (isEnter) { e.preventDefault(); btns[i]?.click(); return; }
      if (e.key === "Escape" || e.key === "Backspace") { closeMenus(); if (e.key === "Escape") e.preventDefault(); return; }
    }
    if (e.key === "/" && b.insert && bc.innerText.trim() === "") { e.preventDefault(); slashMenu(bc); return; }
    if (e.key === "Escape") { bc.blur(); return; }
    if ((e.metaKey || e.ctrlKey) && b.rich && (e.key === "b" || e.key === "i")) { e.preventDefault(); document.execCommand(e.key === "b" ? "bold" : "italic"); readBlock(bc, c); change(); return; }
    if (isEnter && !e.shiftKey) {
      e.preventDefault();
      if (b.type === "reviewer") { bc.blur(); return; }
      let html = "";
      if (b.rich && !caretAtEnd(bc)) { html = splitAtCaret(bc); readBlock(bc, c); }
      const k = insertAfter(key, b.type === "bullet" && b.insert && bc.innerText.trim() ? "bullet" : "p", html);
      change(); rerender(); focusKey(k, "start"); return;
    }
    if (e.key === "Backspace" && caretAtStart(bc) && bc.innerText.trim() === "") {
      e.preventDefault();
      if (b.insert) { const all = editableBlocks(); const i = all.findIndex((x) => keyOf(x) === key); deleteInsert(key); change(); rerender(); const prev = editableBlocks()[Math.max(0, i - 1)]; placeCaret(prev, "end"); return; }
      if (b.type === "claim") { S.decisions[b.id] = { action: "remove" }; change(); rerender(); return; }
      if (b.type === "gap") { setPath(S.overrides, `missing.${b.index}.removed`, true); change(); rerender(); return; }
      return;
    }
    if (e.altKey && (e.key === "ArrowUp" || e.key === "ArrowDown") && !b.fixed) { e.preventDefault(); moveBlock(key, e.key === "ArrowUp" ? -1 : 1); return; }
    if ((e.key === "ArrowUp" && caretAtStart(bc)) || (e.key === "ArrowDown" && caretAtEnd(bc))) {
      const all = editableBlocks(), i = all.indexOf(bc), next = all[i + (e.key === "ArrowUp" ? -1 : 1)];
      if (next) { e.preventDefault(); placeCaret(next, e.key === "ArrowUp" ? "end" : "start"); }
    }
  });
  doc.addEventListener("paste", (e) => { const bc = e.target.closest(".bc[contenteditable]"); if (!bc) return; e.preventDefault(); document.execCommand("insertText", false, (e.clipboardData.getData("text/plain") || "").replace(/\r/g, "")); });
  doc.addEventListener("input", (e) => { const bc = e.target.closest(".bc[contenteditable]"); if (!bc) return; readBlock(bc, c); blockEl(bc)?.classList.toggle("edited", bc.closest(".t-claim") && S.decisions[bc.closest(".t-claim").dataset.id]?.action === "edit"); queueSave(); });
  document.addEventListener("click", (e) => { if (!e.target.closest(".menu,.slash,button[data-handle]")) closeMenus(); }, { capture: true });
  $("#browse").addEventListener("click", () => { renderSide(c, true); $("#split").classList.add("show"); $("#closeSide").hidden = false; });
  $("#closeSide").addEventListener("click", () => { $("#split").classList.remove("show"); $("#closeSide").hidden = true; });
  $("#side").addEventListener("click", (e) => {
    const v = e.target.closest("[data-view]"); if (v) { const vw = v.closest(".viewer"); const html = viewerHtml(c, v.dataset.view, null); vw.outerHTML = html; return; }
    if (e.target.closest("[data-allsources]")) { S.focusPid = null; renderSide(c, false); }
  });
  wireGutter();
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
// ---------- the assessment: one document, several states ----------
const RUN_ROWS = [["split", "Read the sources"], ["draft", "Write the draft"], ["verify", "Check every quote"], ["repair", "Fix failed quotes"], ["reverify", "Check again"], ["done", "Save"], ["tags", "Suggest tags"]];
function runHtml(log, running, slug) {
  const by = Object.fromEntries(log.map((e) => [e.step, e]));
  const last = log.length ? log[log.length - 1].step : null;
  const list = RUN_ROWS.map(([k, label]) => {
    const e = by[k], skip = (k === "repair" || k === "reverify") && by.done && !by.repair;
    const cls = e ? (running && k === last && k !== "done" ? "on" : "done") : skip ? "skip" : "";
    const f = e?.failures ? `<ul class="f">${e.failures.map((x) => `<li>${esc(x.where)}: “${esc(x.quote.slice(0, 90))}” ${esc(x.reason)}</li>`).join("")}</ul>` : "";
    return `<div class="step ${cls}"><i></i><span class="k">${label}</span><span class="m">${skip ? "not needed" : esc(e?.message || "")}${f}</span></div>`;
  }).join("");
  const err = log.find((e) => e.step === "error"), done = by.done, retry = log.filter((e) => e.step === "retry").pop();
  const elapsed = !done && !err && running ? `<div class="step"><i></i><span class="k"></span><span class="m" style="color:var(--muted-foreground)">Usually two to three minutes. You can leave this page; the draft carries on and will be here when you come back.${retry ? ` ${esc(retry.message)}.` : ""}</span></div>` : "";
  return `<div class="run">${list}${elapsed}${err ? `<div class="step err"><i></i><span class="k">Error</span><span class="m">${esc(err.message)}</span></div>` : ""}${done ? `<div class="result"><span><b>${done.summary.verified}</b> of ${done.summary.statements} verified</span><span><b>${done.summary.warning}</b> warnings</span><span><b>${done.summary.failed}</b> unverified</span><span>${done.seconds}s</span><span style="margin-left:auto">${running ? "Suggesting tags" : "Opening the draft"}</span></div>` : ""}</div>`;
}
// Drafting runs as a job on the server; the page starts it and polls. Leaving,
// refreshing or losing the connection never loses it: opening the company
// again picks the progress back up.
let draftPoll = null;
function stopPolling() { if (draftPoll) { clearInterval(draftPoll); draftPoll = null; } }
async function startDraft(slug) {
  document.querySelectorAll("#startDraft,#redraft").forEach((b) => (b.disabled = true));
  try { await api(`/companies/${slug}/draft`, { method: "POST" }); }
  catch (err) { const out = $("#assessbody"); if (out) out.innerHTML = `<div class="pad"><p style="color:var(--red)">Could not start the draft: ${esc(err.message)}</p></div>`; return; }
  followDraft(slug);
}
function followDraft(slug) {
  stopPolling();
  const startedHere = location.hash;
  const tick = async () => {
    if (location.hash.split("?")[0] !== startedHere.split("?")[0]) { stopPolling(); return; } // user left the page
    let p; try { p = await api(`/companies/${slug}/progress`); } catch { return; } // transient; try again next tick
    const out = $("#assessbody"); if (!out) return;
    if (out.style.display === "contents") out.style.display = "block";
    const log = p.log || [];
    out.innerHTML = `<div class="pad">${runHtml(log, p.running, slug)}${!p.running && p.error ? `<div class="actions"><button class="btn primary" id="retryDraft">Try again</button></div>` : ""}${!p.running && !p.known && !p.drafted ? `<p style="margin-top:14px;color:var(--muted-foreground)">The draft was interrupted, probably because the app restarted. Nothing was lost; start it again.</p><div class="actions"><button class="btn primary" id="retryDraft">Draft again</button></div>` : ""}</div>`;
    $("#retryDraft")?.addEventListener("click", () => startDraft(slug));
    if (!p.running) {
      stopPolling();
      if (p.drafted && !p.error) { S.decisions = {}; S.overrides = {}; S.note = ""; S.saved = ""; blocksCache = null; setTimeout(() => pageAssessment(slug, new URLSearchParams()), 700); }
      else document.querySelectorAll("#startDraft,#redraft").forEach((b) => (b.disabled = false));
    }
  };
  tick(); draftPoll = setInterval(tick, 2000);
}
async function pageAssessment(slug, q = new URLSearchParams()) {
  stopPolling();
  const c = await load(slug);
  const mode = q.get("mode") === "partner" ? "partner" : "review";
  if (q.get("s")) S.selected = q.get("s");
  topbar([{ label: c.name }]);
  const st = assessmentState(c);
  const pill = `<span class="badge ${st.tone}">${st.label}</span>${st.detail ? `<span class="state">${esc(st.detail)}</span>` : ""}`;

  if (!c.record) {
    // Not drafted yet: what we have, and the one action.
    const srcList = c.sourceDocs.map((s) => `<div class="srcrow"><span class="chip">${esc(s.key)}</span><span class="t">${esc(s.title)}</span><span class="n">${s.passages.length} passages${c.files?.[s.key] ? ` · <a href="${fileUrl(c, s.key)}" target="_blank">${esc(c.files[s.key].name)}</a>` : ""}</span></div>`).join("");
    const body = stagehead("Assessment", `<button class="btn primary" id="startDraft" ${c.running ? "disabled" : ""}>Draft assessment <span class="arr">→</span></button>`, "") +
      `<div class="scroll" id="assessbody"><div class="pad narrow"><div class="statusline">${pill}</div>
      ${c.design_note ? `<div class="callout" style="grid-template-columns:1fr"><div><div class="micro">Why this example exists</div><p style="margin-top:6px">${esc(c.design_note)}</p></div></div>` : ""}
      ${c.intake?.via === "inbox" ? `<div class="callout" style="grid-template-columns:1fr"><div><div class="micro">Imported from the inbox</div><p style="margin-top:6px">${esc(c.intake.from)} · ${esc(c.intake.subject)}. ${(c.intake.notes || []).map(esc).join(" · ")}</p></div></div>` : ""}
      <div class="seclabel" style="margin:8px 0 10px">What the draft will be built from</div><div class="srclist">${srcList}</div>
      ${c.intake?.suggestedWebsite && !c.sourceDocs.some((s) => s.key === "website") ? `<div class="suggest"><div><b>Website named in the deck:</b> ${esc(c.intake.suggestedWebsite)}<span>Not read automatically, because the address in a deck can belong to someone else. Add it if it is the right site.</span></div><button class="btn sm" id="addSite">Add as a source</button></div>` : ""}<p class="hint" style="margin-top:14px">Every statement in the draft will cite one of these passages. <a href="#/c/${slug}/sources">Read them</a>, or draft now; about two minutes.</p></div></div>`;
    workspace(c, "assessment", body);
    $("#startDraft").addEventListener("click", () => startDraft(slug));
    $("#addSite")?.addEventListener("click", async (e) => { e.target.disabled = true; e.target.textContent = "Reading the site…"; try { await api(`/companies/${slug}/website`, { method: "POST", body: JSON.stringify({ url: c.intake.suggestedWebsite }) }); pageAssessment(slug, new URLSearchParams()); } catch (err) { e.target.disabled = false; e.target.textContent = "Add as a source"; alert(err.message); } });
    if (c.running) followDraft(slug);
    else if (q.get("start") === "1") startDraft(slug);
    return;
  }

  // Drafted: the document, editing or previewing what the partners receive.
  const modeSwitch = `<div class="seg"><a href="#/c/${slug}" class="${mode === "review" ? "on" : ""}">Edit</a><a href="#/c/${slug}?mode=partner" class="${mode === "partner" ? "on" : ""}">Preview</a></div>`;
  const exportBtn = `<div class="dd"><button class="btn" id="exportBtn">Export <span class="arr">▾</span></button><div class="ddm" id="exportMenu" hidden><a href="/api/companies/${slug}/export?format=docx">Word (.docx)</a><button data-export="pdf">PDF</button><a href="/api/companies/${slug}/export?format=md&download=1">Markdown (.md)</a><div class="sep"></div><button data-export="copy">Copy as text</button><button data-export="copymd">Copy as Markdown</button></div></div>`;
  const right = mode === "review"
    ? `<span class="state" id="savestate">${S.saved ? "Saved " + S.saved.slice(11, 16) : "Edits save automatically"}</span>${modeSwitch}${exportBtn}<a class="btn" href="#/c/${slug}/followup">Email founder</a><button class="btn primary" id="sendPartner">Send to partner</button><button class="btn quiet more" id="moreBtn" title="More">⋯</button>`
    : `${modeSwitch}${exportBtn}<a class="btn" href="#/c/${slug}/followup">Email founder</a><button class="btn primary" id="sendPartner">Send to partner</button>`;
  if (mode === "partner") c.tagsView = c.tags; // preview shows the fit line the partner will see
  const body = `<div class="stagehead"><h2>Assessment</h2>${pill}<div class="r">${right}</div></div><div id="assessbody" style="display:contents">${mode === "review" ? `<div class="tagbar" id="tagbar">${tagbarHtml(c)}</div>` : ""}${splitView(c, mode)}</div>`;
  workspace(c, "assessment", body);
  wireSplit(c, mode);
  if (mode === "review") wireTagbar(c);
  $("#sendPartner").addEventListener("click", () => sendToPartner(c));
  const redraft = () => { if (confirm("Draft again? This replaces the current draft, its tags and the review.")) { $("#assessbody").style.display = "block"; startDraft(slug); } };
  $("#moreBtn")?.addEventListener("click", (e) => { const r = e.currentTarget.getBoundingClientRect(); const m = showMenu([{ label: "Draft again", hint: "replaces the draft", run: redraft }], r.right - 230, r.bottom + 4); m.querySelector("button.on")?.classList.remove("on"); });
  if (c.running) { $("#assessbody").style.display = "block"; followDraft(slug); }
  $("#exportBtn").addEventListener("click", (e) => { e.stopPropagation(); const m = $("#exportMenu"); m.hidden = !m.hidden; });
  document.addEventListener("click", () => { const m = $("#exportMenu"); if (m) m.hidden = true; }, { once: false });
  $("#exportMenu").addEventListener("click", async (e) => {
    const b = e.target.closest("button[data-export]"); if (!b) return;
    const kind = b.dataset.export;
    if (kind === "pdf") { if (mode !== "partner") { location.hash = `#/c/${slug}?mode=partner`; setTimeout(() => window.print(), 600); } else window.print(); return; }
    const text = await (await fetch(`/api/companies/${slug}/export?format=${kind === "copy" ? "txt" : "md"}`)).text();
    await navigator.clipboard.writeText(text); b.textContent = "Copied"; setTimeout(() => (b.textContent = kind === "copy" ? "Copy as text" : "Copy as Markdown"), 1400);
  });
  const target = q.get("s") ? `.t-claim[data-id="${CSS.escape(q.get("s"))}"]` : q.get("g") ? `.blk[data-key="gap.${q.get("g")}"]` : q.get("k") ? `.blk[data-key="${CSS.escape(q.get("k"))}"]` : null;
  if (target) { const el = $("#doc").querySelector(target); if (el) { el.scrollIntoView({ block: "center" }); el.classList.add("flash"); if (q.get("s")) { renderSide(c, false); $("#split").classList.add("show"); } } }
}

// ---------- fit and tags ----------
const FIT = { good: "Good fit", possible: "Possible fit", not: "Not a fit" };
const TAGS = { "needs-info": "Needs more info", "sources-disagree": "Sources disagree", "numbers-overstated": "Claims overstated", "warning-signs": "Warning signs", "paying-customers": "Paying customers", "pre-revenue": "Pre-revenue", "strong-team": "Strong team", "crowded-market": "Crowded market" };
const fitPill = (fit, ai) => fit ? `<span class="fitpill ${fit}"><i></i>${FIT[fit]}${ai ? `<small>AI</small>` : ""}</span>` : "";
function tagbarHtml(c) {
  const t = c.tags, doc = c.tagsDoc;
  if (!t || (!doc && !t.fit)) return `<span class="lbl">Fit</span><span class="muted">No tags yet.</span><button class="btn sm" id="suggestTags">Suggest tags</button>`;
  const ai = t.fitBy === "ai";
  const who = ai ? "AI suggestion" : `Set by ${esc(t.fitBy)}`;
  const chips = t.tags.map((k) => `<span class="tagchip">${esc(TAGS[k] || k)}<button data-untag="${esc(k)}" title="Remove">×</button></span>`).join("");
  return `<span class="lbl">Fit</span><button class="fitbtn" id="fitBtn">${t.fit ? fitPill(t.fit, false) : `<span class="muted">Not set</span>`}<span class="arr">▾</span></button><span class="who">${who}</span>${doc?.ai ? `<button class="linkbtn" id="whyBtn">Why</button>` : ""}<span class="sep"></span><span class="lbl">Tags</span>${chips}<button class="linkbtn" id="addTag">+ Add tag</button>`;
}
function wireTagbar(c) {
  const bar = $("#tagbar"); if (!bar) return;
  const redraw = () => { bar.innerHTML = tagbarHtml(c); };
  const save = async (patch) => {
    try { c.tagsDoc = await api(`/companies/${c.slug}/tags`, { method: "PUT", body: JSON.stringify({ ...patch, by: S.reviewer }) }); }
    catch (err) { alert(err.message); return; }
    c.tags = effective(c.tagsDoc); redraw();
  };
  bar.addEventListener("click", async (e) => {
    const r = (el) => el.getBoundingClientRect();
    if (e.target.closest("#suggestTags") || e.target.closest("[data-again]")) {
      const b = e.target.closest("button"); b.disabled = true; b.textContent = "Suggesting…";
      try { c.tagsDoc = await api(`/companies/${c.slug}/tags`, { method: "POST" }); c.tags = effective(c.tagsDoc); redraw(); } catch (err) { b.disabled = false; b.textContent = "Suggest tags"; alert(err.message); }
      return;
    }
    const fb = e.target.closest("#fitBtn");
    if (fb) {
      const ai = c.tagsDoc?.ai, items = Object.entries(FIT).map(([k, label]) => ({ label, hint: ai?.fit === k ? "AI suggestion" : "", run: () => save({ fit: k }) }));
      if (c.tagsDoc?.person) items.push({ sep: true }, { label: "Go back to the AI suggestion", run: () => save({ reset: true }) });
      items.push({ sep: true }, { label: "Suggest again", hint: "asks the AI", run: async () => { bar.querySelector(".who").textContent = "Suggesting…"; try { const d = await api(`/companies/${c.slug}/tags`, { method: "POST" }); c.tagsDoc = d; c.tags = effective(d); redraw(); } catch (err) { alert(err.message); redraw(); } } });
      const m = showMenu(items, r(fb).left, r(fb).bottom + 4); m.querySelector("button.on")?.classList.remove("on"); return;
    }
    const add = e.target.closest("#addTag");
    if (add) {
      const left = Object.keys(TAGS).filter((k) => !c.tags.tags.includes(k));
      if (!left.length) return;
      const m = showMenu(left.map((k) => ({ label: TAGS[k], run: () => save({ tags: [...c.tags.tags, k] }) })), r(add).left, r(add).bottom + 4); m.querySelector("button.on")?.classList.remove("on"); return;
    }
    const un = e.target.closest("[data-untag]");
    if (un) return save({ tags: c.tags.tags.filter((k) => k !== un.dataset.untag) });
    const why = e.target.closest("#whyBtn");
    if (why) { $("#whypop") ? $("#whypop").remove() : showWhy(c, why); }
  });
}
// Mirrors lib/tags.mjs effectiveTags, so the strip updates without a reload.
function effective(doc) {
  const p = doc?.person, ai = doc?.ai;
  const fit = p && "fit" in p ? p.fit : ai?.fit ?? null;
  const tags = p && Array.isArray(p.tags) ? p.tags : (ai?.tags || []).map((t) => t.tag);
  return { fit, fitLabel: fit ? FIT[fit] : null, fitBy: p && "fit" in p ? (p.by || "the associate") : ai ? "ai" : null, tags, tagLabels: tags.map((t) => TAGS[t]), reasons: ai && fit === ai.fit ? ai.fit_reasons.map((x) => x.text) : [] };
}
function showWhy(c, anchor) {
  const ai = c.tagsDoc.ai, rect = anchor.getBoundingClientRect();
  const refs = (ids) => ids.map((id) => `<button class="chip" data-stmt="${esc(id)}">${esc(stmtLabel(c, id))}</button>`).join(" ");
  const el = document.createElement("div"); el.id = "whypop"; el.className = "whypop";
  el.style.left = Math.min(rect.left, innerWidth - 500) + "px"; el.style.top = rect.bottom + 6 + "px";
  el.innerHTML = `<div class="h"><b>AI suggestion: ${FIT[ai.fit]}</b><button class="linkbtn" data-close>Close</button></div><ul>${ai.fit_reasons.map((x) => `<li>${esc(x.text)}<div class="refs">${refs(x.statement_ids)}</div></li>`).join("")}</ul>${ai.tags.length ? `<div class="micro">Tags</div><ul>${ai.tags.map((t) => `<li><b>${esc(TAGS[t.tag])}.</b> ${esc(t.reason)}${t.evidence_ids?.length ? `<div class="refs">${refs(t.evidence_ids)}</div>` : ""}</li>`).join("")}</ul>` : ""}<p class="hint">Click a reference to open the statement and its source.</p>`;
  document.body.appendChild(el);
  el.addEventListener("click", (e) => {
    if (e.target.closest("[data-close]")) return el.remove();
    const b = e.target.closest("[data-stmt]"); if (!b) return;
    const id = b.dataset.stmt; el.remove();
    if (id.startsWith("n")) { const f = $("#doc").querySelector('.blk.t-flags'); f?.scrollIntoView({ block: "center" }); f?.classList.add("flash"); return; }
    S.selected = id; const t = $("#doc").querySelector(`.t-claim[data-id="${CSS.escape(id)}"]`);
    if (t) { t.scrollIntoView({ block: "center" }); t.classList.add("flash"); }
    renderSide(c, false); $("#split").classList.add("show");
  });
  setTimeout(() => document.addEventListener("mousedown", function off(e) { if (!el.contains(e.target) && e.target !== anchor) { el.remove(); document.removeEventListener("mousedown", off); } }), 0);
}
function stmtLabel(c, id) {
  const a = c.record.assessment;
  if (id.startsWith("x")) return `Disagreement ${Number(id.slice(1)) + 1}`;
  if (id.startsWith("b")) return `Case against ${Number(id.slice(1)) + 1}`;
  if (id.startsWith("n")) return `Not evidence ${Number(id.slice(1)) + 1}`;
  const m = id.match(/^d(\d+)\.c(\d+)$/); return m ? `${a.dimensions[m[1]]?.name || "Claim"} ${Number(m[2]) + 1}` : id;
}

// ---------- send to partner ----------
function sendToPartner(c) {
  const a = c.record.assessment, t = c.tags;
  const partners = (() => { try { return JSON.parse(localStorage.getItem("partners") || "[]"); } catch { return []; } })();
  const link = `${location.origin}/#/c/${c.slug}?mode=partner`;
  const summary = (S.overrides?.summary ?? a.summary).replace(/<[^>]+>/g, "");
  const fitLine = t?.fit ? `Fit: ${t.fitLabel}${t.fitBy === "ai" ? " (AI suggestion)" : ""}.${t.tagLabels.length ? ` Tags: ${t.tagLabels.join(", ")}.` : ""}\n\n` : "";
  const subject = `Assessment: ${c.name}`;
  const bodyText = `Hi,\n\nThe first-pass assessment for ${c.name}${c.one_liner ? ` (${c.one_liner}${c.ask ? `, ${c.ask}` : ""})` : ""} is ready for you.\n\n${fitLine}${summary}\n\nThe full assessment, with every claim linked to its source:\n${link}\n\n${S.reviewer || ""}`.trim();
  const el = document.createElement("div"); el.id = "sendDlg"; el.className = "dlgwrap";
  el.innerHTML = `<div class="dlg"><div class="dh"><b>Send to partner</b><button class="linkbtn" data-close>Close</button></div>
    <label class="fl">To<input class="input" id="sendTo" placeholder="partner@fund.com" value="${esc(partners[0] || "")}"></label>
    ${partners.length > 1 ? `<div class="picks">${partners.slice(0, 5).map((p) => `<button class="chip" data-pick="${esc(p)}">${esc(p)}</button>`).join("")}</div>` : ""}
    <label class="fl">Subject<input class="input" id="sendSubj" value="${esc(subject)}"></label>
    <label class="fl">Message<textarea class="input" id="sendBody" rows="12">${esc(bodyText)}</textarea></label>
    ${t?.fitBy === "ai" ? `<p class="hint">The fit tag is still the AI's suggestion. You can change it in the tag strip before sending.</p>` : ""}
    <div class="da"><a class="btn" href="/api/companies/${c.slug}/export?format=docx">Download Word to attach</a><span class="grow"></span><button class="btn" id="sendCopy">Copy message</button><button class="btn primary" id="sendOpen">Open in email</button></div></div>`;
  document.body.appendChild(el);
  $("#sendTo").focus();
  const close = () => el.remove();
  const record = async () => {
    const to = $("#sendTo").value.trim(); if (!to) { $("#sendTo").focus(); $("#sendTo").classList.add("bad"); return false; }
    localStorage.setItem("partners", JSON.stringify([to, ...partners.filter((p) => p !== to)].slice(0, 8)));
    try { c.sent = await api(`/companies/${c.slug}/sent`, { method: "POST", body: JSON.stringify({ to, by: S.reviewer }) }); } catch (err) { alert(err.message); return false; }
    return to;
  };
  el.addEventListener("click", async (e) => {
    if (e.target === el || e.target.closest("[data-close]")) return close();
    const pk = e.target.closest("[data-pick]"); if (pk) { $("#sendTo").value = pk.dataset.pick; return; }
    if (e.target.closest("#sendCopy")) {
      const to = await record(); if (!to) return;
      try { await navigator.clipboard.writeText(`To: ${to}\nSubject: ${$("#sendSubj").value}\n\n${$("#sendBody").value}`); }
      catch { $("#sendBody").select(); document.execCommand("copy"); }
      close(); pageAssessment(c.slug, new URLSearchParams(location.hash.split("?")[1] || ""));
    }
    if (e.target.closest("#sendOpen")) {
      const to = await record(); if (!to) return;
      location.href = `mailto:${encodeURIComponent(to)}?subject=${encodeURIComponent($("#sendSubj").value)}&body=${encodeURIComponent($("#sendBody").value)}`;
      close(); setTimeout(() => pageAssessment(c.slug, new URLSearchParams(location.hash.split("?")[1] || "")), 300);
    }
  });
  el.addEventListener("keydown", (e) => { if (e.key === "Escape") close(); });
}

// ---------- follow-up ----------
async function pageFollowup(slug) {
  const c = await load(slug);
  if (!c.record) return (location.hash = `#/c/${slug}`);
  topbar([{ label: c.name }]);
  const a = c.record.assessment;
  const items = a.missing, qs = a.dimensions.flatMap((d) => d.open_questions.map((q) => ({ dim: d.name, q })));
  workspace(c, "assessment", stagehead("Email founder", `<a class="btn" href="#/c/${slug}">Back to the assessment</a><button class="btn primary" id="copy">Copy email</button>`, "The missing list as a request, sent before the partner meeting.") +
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
  if (typeof stopPolling === "function" && !/^#\/c\//.test(location.hash)) stopPolling();
  const [hashPath, query = ""] = location.hash.replace(/^#\/?/, "").split("?");
  const p = hashPath.split("/").filter(Boolean);
  const q = new URLSearchParams(query);
  // A fresh container per page, so one page's listeners never fire on the next.
  const m = $("#main"); if (m) m.replaceWith(Object.assign(m.cloneNode(false), { onclick: null }));
  document.querySelectorAll("#whypop,#sendDlg").forEach((x) => x.remove());
  try {
    if (!p.length) return await pageCompanies();
    if (p[0] === "new") return pageNew();
    if (p[0] === "inbox") return await pageInbox();
    if (p[0] === "settings") return await pageSettings();
    if (p[0] === "c" && p[1]) {
      const slug = p[1], stage = p[2] || "";
      if (stage === "sources") return await pageSources(slug, q.get("p"));
      if (stage === "followup") return await pageFollowup(slug);
      if (stage === "draft" || stage === "review" || stage === "partner" || stage === "") {
        if (stage === "partner") q.set("mode", "partner");
        if (stage !== "") { history.replaceState(null, "", `#/c/${slug}${q.toString() ? "?" + q.toString() : ""}`); }
        return await pageAssessment(slug, q);
      }
    }
    location.hash = "#/";
  } catch (err) { $("#main").innerHTML = `<div class="page"><div class="inner"><p style="color:var(--bad)">${esc(err.message)}</p></div></div>`; }
}
window.addEventListener("hashchange", route);
route();
