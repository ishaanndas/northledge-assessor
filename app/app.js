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
  $("#top").innerHTML = `<a class="name" href="#/"><span class="mark">SA</span>Seed assessments</a>${crumbs.length ? `<div class="crumbs">${crumbs.map((c, i) => `<span>/</span>${c.href ? `<a href="${c.href}">${esc(c.label)}</a>` : `<b>${esc(c.label)}</b>`}`).join("")}</div>` : ""}<button class="searchbox" id="openSearch"><span class="ico">⌕</span><span>Search companies, decks, claims…</span><kbd>⌘K</kbd></button><div class="right"><a class="navlink" href="#/inbox" id="inboxLink">Inbox${inboxCount ? ` <span class="count">${inboxCount}</span>` : ""}</a><a class="navlink" href="/docs">Docs</a>${right}</div>`;
  $("#openSearch").addEventListener("click", openPalette);
  if (inboxCount === null) api("/inbox").then((r) => { inboxCount = r.messages.filter((m) => !m.imported).length; const el = $("#inboxLink"); if (el) el.innerHTML = `Inbox${inboxCount ? ` <span class="count">${inboxCount}</span>` : ""}`; }).catch(() => {});
}
// The assessment's state, derived: nothing is set by hand.
function assessmentState(c) {
  if (c.running) return { key: "drafting", label: "Drafting", tone: "blue" };
  if (!c.record) return { key: "none", label: "Not drafted", tone: "" };
  const d = Object.values(c.reviewDoc?.decisions || {});
  const touched = c.reviewDoc && (d.length || (c.reviewDoc.note || "").trim() || Object.keys(c.reviewDoc.overrides || {}).some((k) => k !== "inserts" ? Object.keys(c.reviewDoc.overrides[k] || {}).length || typeof c.reviewDoc.overrides[k] === "string" : Object.keys(c.reviewDoc.overrides.inserts || {}).length));
  if (touched) return { key: "reviewed", label: "Reviewed", tone: "green", detail: `${d.filter((x) => x.action === "remove").length} removed, ${d.filter((x) => x.action === "edit").length} edited${c.reviewDoc.reviewer ? ` · ${c.reviewDoc.reviewer}` : ""}` };
  return { key: "draft", label: "Draft", tone: "amber", detail: `${c.record.verification_summary.verified}/${c.record.verification_summary.statements} verified` };
}
function workspace(c, current, body) {
  const st = assessmentState(c);
  const item = (key, label, small, href) => `<a class="stage ${key === current ? "on" : ""}" href="${href}"><span>${label}</span><small>${esc(small || "")}</small></a>`;
  const rail = `<div class="grp">${item("assessment", "Assessment", st.label, `#/c/${c.slug}`)}${item("sources", "Sources", `${c.sources.reduce((n, s) => n + s.passages, 0)} passages`, `#/c/${c.slug}/sources`)}</div>`;
  $("#main").innerHTML = `<div class="ws"><nav class="rail"><div class="co"><b>${esc(c.name)}</b><span>${esc(c.one_liner || "")}${c.ask ? ` · ${esc(c.ask)}` : ""}</span></div>${rail}<div class="foot">${c.origin === "example" ? "Example company" : "Added " + fmt(c.created_at)}</div></nav><div class="content">${body}</div></div>`;
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
    if (!items.length) { res.innerHTML = `<div class="pal-empty">${input.value.trim() ? "Nothing matches." : "Type to search everything: company names, deck slides, website text, call notes, drafted claims, missing items and inbox messages."}</div>`; return; }
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
  const badge = (c) => c.running ? `<span class="badge blue">Drafting</span>` : c.status === "reviewed" ? `<span class="badge green">Reviewed</span>` : c.status === "drafted" ? `<span class="badge amber">Draft</span>` : `<span class="badge">Not drafted</span>`;
  const tone = (c) => c.running ? "run" : c.status === "reviewed" ? "ok" : c.status === "drafted" ? "warn" : "";
  const target = (c) => `#/c/${c.slug}`;
  const initials = (n) => n.split(/\s+/).map((w) => w[0]).join("").slice(0, 2).toUpperCase();
  const via = (c) => c.intake?.via === "inbox" ? "Inbox" : c.origin === "example" ? "Example" : "Manual";
  const filler = list.length % 3 ? `<div class="cardx add" data-href="#/new"><div class="ico">+</div><h3>New company</h3><p class="desc">Drop a deck, paste a link, or import from the inbox.</p></div>` : "";
  const cards = list.map((c) => `<div class="cardx ${tone(c)}" data-href="${target(c)}"><div class="row1"><div class="ico">${esc(initials(c.name))}</div>${badge(c)}</div><div><h3>${esc(c.name)}</h3>${c.origin === "example" ? `<div class="tc">${esc(testLabel(c))}</div>` : ""}</div><p class="desc">${esc(c.one_liner || "")}${c.ask ? ` · ${esc(c.ask)}` : ""}</p><div class="forms"><div class="micro">Sources</div><div class="chips">${c.sources.map((s) => `<span class="chip">${esc(s.key)} · ${s.passages}</span>`).join("")}</div></div><div class="foot"><span>${c.verification_summary ? `<b>${c.verification_summary.verified}/${c.verification_summary.statements}</b> verified · <b>${c.missing_count}</b> gaps${c.review?.reviewer ? ` · ${esc(c.review.reviewer)}` : ""}` : "Not drafted"}${evalLine(c)}</span><span>${c.status === "sources" ? "Open" : "Open assessment"} →</span></div></div>`).join("");
  const rows = list.map((c) => `<tr class="row" data-href="${target(c)}"><td><div class="nm">${esc(c.name)}</div><div class="ol">${esc(c.one_liner || "")}</div></td><td class="nw">${badge(c)}</td><td class="sec">${c.sources.map((s) => esc(s.key)).join(", ")}</td><td class="num">${c.verification_summary ? `${c.verification_summary.verified} / ${c.verification_summary.statements}` : ""}</td><td class="num">${c.missing_count ?? ""}</td><td class="sec nw">${esc(c.ask || "")}</td><td class="sec">${c.origin === "example" ? esc(testLabel(c)) : via(c)}</td><td class="sec nw">${c.review ? esc(c.review.reviewer || "") : ""}</td></tr>`).join("");
  const table = `<table class="list"><thead><tr><th>Company</th><th>Stage</th><th>Sources</th><th>Verified</th><th>Gaps</th><th>Round</th><th>Source</th><th>Reviewer</th></tr></thead><tbody>${rows}</tbody></table>`;
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
  const kept = {}; // source key -> {token, kind, pages} for files the server kept
  const describe = (m) => m.pages ? `${m.pages} pages` : m.slides ? `${m.slides} slides` : m.paragraphs ? `${m.paragraphs} paragraphs` : "read";
  const shortUrl = (u) => u.replace(/^https?:\/\//, "").replace(/\/$/, "");
  async function ingestFile(key, file) {
    status(key, `Reading ${file.name}…`);
    try {
      const r = await api("/extract", { method: "POST", body: JSON.stringify({ filename: file.name, data: await toB64(file) }) });
      ta(key).value = r.text; if (r.file) kept[key] = r.file;
      status(key, `${file.name}: ${describe(r.meta)}`, "ok");
      if (key === "deck") autofill(r.text);
    } catch (err) { status(key, err.message, "bad"); }
  }
  async function ingestUrl(key, url) {
    if (!url.trim()) return;
    status(key, `Fetching ${shortUrl(url)}…`);
    try {
      const r = await api("/extract", { method: "POST", body: JSON.stringify({ url }) });
      ta(key).value = r.text; if (r.file) kept[key] = r.file;
      status(key, `${r.meta.filename || r.meta.title || shortUrl(url)}: ${describe(r.meta)}`, "ok");
      if (key === "deck") autofill(r.text);
    } catch (err) { status(key, /fetch failed/i.test(err.message) ? `Could not reach ${shortUrl(url)}. Paste the page text instead.` : err.message, "bad"); }
  }
  async function autofill(deckText) {
    const box = $("#fill"); box.hidden = false; box.className = "fill"; box.textContent = "Reading the deck to fill the fields…";
    try {
      const p = await api("/prefill", { method: "POST", body: JSON.stringify({ deck: deckText }) });
      const filled = [];
      const set = (name, val) => { const el = $(`[name="${name}"]`); if (val && !el.value.trim()) { el.value = val; el.classList.add("auto"); filled.push({ name: "company", one_liner: "one-liner", ask: "round" }[name] || name); } };
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
  const stateBadge = (p) => p.state === "connected" ? `<span class="badge green">Connected</span>` : p.state === "pending" ? `<span class="badge amber">Set up · waiting for credentials</span>` : `<span class="badge">Not connected</span>`;
  const action = (p) => p.id === "folder" ? "" : p.state === "off" ? `<button class="btn sm" data-connect="${p.id}">${p.id === "forward" ? "Set up" : "Connect"}</button>` : `<button class="btn sm quiet" data-disconnect="${p.id}">Remove</button>`;
  const prov = status.providers.map((p) => `<div class="prov ${p.state !== "off" ? "on" : ""}"><span class="dot"></span><div class="pb"><b>${esc(p.name)}</b>${stateBadge(p)}<span>${esc(p.detail)}</span>${p.id === "forward" && p.config ? `<code class="addr">${esc(p.config.address)}</code>` : ""}</div><div class="pa">${action(p)}</div></div>`).join("");
  const auto = `<div class="auto"><label><input type="checkbox" id="autoImport" ${status.automation.autoImport ? "checked" : ""}> <b>Import on arrival.</b> Every message with a deck becomes a company, with its attachments read and its fields filled, without anyone clicking.</label><label><input type="checkbox" id="autoDraft" ${status.automation.autoDraft ? "checked" : ""} ${status.automation.autoImport ? "" : "disabled"}> <b>Draft on arrival.</b> Each imported company is drafted straight away, so it is waiting for review by the time an associate opens the app.</label><p class="hint">Rule: messages with a ${status.rule.attachments.join(", ")} attachment or a deck link, from any sender. Everything else is left in the mailbox.</p></div>`;
  const rows = messages.map((m) => `<div class="msg ${m.imported ? "done" : ""}" data-id="${m.id}"><div class="who"><b>${esc(m.from)}</b><span>${esc(m.date)}</span></div><div class="subj">${esc(m.subject)}</div><div class="body">${esc(m.body.split("\n").filter(Boolean)[0] || "")}</div><div class="att">${m.attachments.map((a) => `<a class="file" href="/inbox/${encodeURIComponent(m.id)}/${encodeURIComponent(a.name)}" target="_blank"><span class="k">${kindIcon(a.kind)}</span>${esc(a.name)}<span class="sz">${(a.bytes / 1024).toFixed(0)} KB</span></a>`).join("")}${m.links.map((l) => `<span class="file"><span class="k">URL</span>${esc(l.replace(/^https?:\/\//, ""))}</span>`).join("")}</div><div class="act">${m.imported ? `<span class="badge green">Imported</span><a class="btn sm" href="#/c/${m.imported.slug}">Open</a>` : `<button class="btn primary sm" data-import="${m.id}">Import as company <span class="arr">→</span></button>`}</div></div>`).join("");
  $("#main").innerHTML = `<div class="page"><div class="inner" style="max-width:960px"><div class="head"><h1>Inbox</h1><p class="sub">${esc(status.goal)}</p></div>
  <div class="seclabel" style="margin-bottom:10px">Connections</div><div class="provs">${prov}</div>
  <div class="seclabel" style="margin:26px 0 10px">Automation</div>${auto}
  <div class="gridhead" style="margin-top:28px"><span class="seclabel">Messages · ${messages.length}</span><span class="hint">In this prototype, the drop folder stands in for a mailbox: a folder with a message file and its attachments is one email.</span></div>
  <div class="msgs">${rows || `<div class="empty">Nothing waiting.</div>`}</div></div></div>`;
  const save = async (patch) => { await api("/inbox/settings", { method: "PUT", body: JSON.stringify(patch) }); inboxCount = null; pageInbox(); };
  $("#autoImport").addEventListener("change", (e) => save({ autoImport: e.target.checked, ...(e.target.checked ? {} : { autoDraft: false }) }));
  $("#autoDraft").addEventListener("change", (e) => save({ autoDraft: e.target.checked }));
  $("#main").addEventListener("click", async (e) => {
    const c = e.target.closest("button[data-connect]"); if (c) { connectFlow(c.dataset.connect, save); return; }
    const d = e.target.closest("button[data-disconnect]"); if (d) { if (confirm("Remove this connection?")) save({ disconnect: d.dataset.disconnect }); return; }
    const b = e.target.closest("button[data-import]"); if (!b) return;
    b.disabled = true; b.textContent = "Reading attachments…";
    try { const r = await api(`/inbox/${encodeURIComponent(b.dataset.import)}/import`, { method: "POST" }); inboxCount = null; location.hash = `#/c/${r.slug}`; }
    catch (err) { b.disabled = false; b.textContent = "Import failed: " + err.message; }
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
      { t: "What gets connected", b: `A read-only connection to one mailbox, limited to the label or folder you choose. The app reads messages in that label, pulls deck attachments and links, and never sends, moves or deletes mail.` },
      { t: "Which mailbox and label", form: true },
      { t: "What happens next", b: `${isGmail ? "Google" : "Microsoft"} requires the fund's own ${isGmail ? "OAuth client" : "app registration"} for a connection like this, and that is created by the fund's IT or by us on their behalf during setup. Save these settings now; the moment the credentials are in place, the connection goes live and messages start arriving here on their own.` },
    ]
    : [
      { t: "How it works", b: `We give you an address. Add it as a forwarding rule in your mail client, or hand it to the people who receive decks, and anything sent to it lands in this inbox with its attachments. No access to your mailbox is needed.` },
      { t: "Your address", forward: true },
    ];
  let i = 0; const data = { account: "", watch: isGmail ? "Deal flow" : "Deal flow" };
  const render = () => {
    const st = steps[i];
    el.innerHTML = `<div class="pal connect"><div class="ch"><b>Connect ${esc(name)}</b><span>Step ${i + 1} of ${steps.length}</span><button class="x" id="cx">×</button></div><div class="cb"><h3>${esc(st.t)}</h3>${st.b ? `<p>${esc(st.b)}</p>` : ""}${st.form ? `<label class="field">Mailbox<input class="input" id="acct" placeholder="deals@yourfund.com" value="${esc(data.account)}"></label><label class="field" style="margin-top:12px">${isGmail ? "Gmail label to watch" : "Outlook folder to watch"}<input class="input" id="watch" value="${esc(data.watch)}"></label><p class="hint" style="margin-top:10px">Only messages in this ${isGmail ? "label" : "folder"} are read. A filter in ${isGmail ? "Gmail" : "Outlook"} can route deck emails into it automatically.</p>` : ""}${st.forward ? `<p>Generate the address, then add it as a forwarding rule or share it with founders and introducers.</p>` : ""}</div><div class="cf">${i > 0 ? `<button class="btn" id="back">Back</button>` : ""}<span style="flex:1"></span>${i < steps.length - 1 ? `<button class="btn primary" id="next">Continue</button>` : `<button class="btn primary" id="done">${st.forward ? "Generate address" : "Save connection"}</button>`}</div></div>`;
    el.querySelector("#cx").onclick = () => el.remove();
    el.querySelector("#back")?.addEventListener("click", () => { i--; render(); });
    el.querySelector("#next")?.addEventListener("click", () => { if (st.form) { data.account = el.querySelector("#acct").value.trim(); data.watch = el.querySelector("#watch").value.trim(); if (!data.account) { el.querySelector("#acct").focus(); return; } } i++; render(); });
    el.querySelector("#done")?.addEventListener("click", async () => { el.remove(); if (st.forward) await save({ forwarding: true }); else await save({ provider, account: data.account, watch: `${isGmail ? "label" : "folder"} ${data.watch}` }); });
    el.querySelector("#acct")?.focus();
  };
  document.body.appendChild(el); el.addEventListener("click", (e) => { if (e.target === el) el.remove(); }); render();
}

// ---------- the assessment: one document, several states ----------
const RUN_ROWS = [["split", "Split"], ["draft", "Draft"], ["verify", "Verify"], ["repair", "Repair"], ["reverify", "Re-verify"], ["done", "Write"]];
function runHtml(log, running, slug) {
  const by = Object.fromEntries(log.map((e) => [e.step, e]));
  const last = log.length ? log[log.length - 1].step : null;
  const list = RUN_ROWS.map(([k, label]) => {
    const e = by[k], skip = (k === "repair" || k === "reverify") && by.done && !by.repair;
    const cls = e ? (running && k === last && k !== "done" ? "on" : "done") : skip ? "skip" : "";
    const f = e?.failures ? `<ul class="f">${e.failures.map((x) => `<li>${esc(x.where)}: “${esc(x.quote.slice(0, 90))}” ${esc(x.reason)}</li>`).join("")}</ul>` : "";
    return `<div class="step ${cls}"><i></i><span class="k">${label}</span><span class="m">${skip ? "not needed" : esc(e?.message || "")}${f}</span></div>`;
  }).join("");
  const err = log.find((e) => e.step === "error"), done = by.done;
  return `<div class="run">${list}${err ? `<div class="step err"><i></i><span class="k">Error</span><span class="m">${esc(err.message)}</span></div>` : ""}${done ? `<div class="result"><span><b>${done.summary.verified}</b> of ${done.summary.statements} verified</span><span><b>${done.summary.warning}</b> warnings</span><span><b>${done.summary.failed}</b> unverified</span><span>${done.seconds}s</span><span style="margin-left:auto">Opening the draft…</span></div>` : ""}</div>`;
}
async function startDraft(slug, c) {
  const out = $("#assessbody"); const log = [];
  out.innerHTML = `<div class="pad">${runHtml(log, true, slug)}</div>`;
  document.querySelectorAll("#startDraft,#redraft").forEach((b) => (b.disabled = true));
  const res = await fetch(`/api/companies/${slug}/draft`, { method: "POST" });
  if (!res.ok) { out.innerHTML = `<div class="pad"><p style="color:var(--bad)">${esc((await res.json().catch(() => ({}))).error || res.statusText)}</p></div>`; return; }
  const rd = res.body.getReader(), dec = new TextDecoder(); let buf = "";
  for (;;) {
    const { value, done } = await rd.read(); if (done) break;
    buf += dec.decode(value, { stream: true });
    let i; while ((i = buf.indexOf("\n\n")) >= 0) { const line = buf.slice(0, i).replace(/^data: /, ""); buf = buf.slice(i + 2); if (line) { log.push(JSON.parse(line)); out.innerHTML = `<div class="pad">${runHtml(log, true, slug)}</div>`; } }
  }
  out.innerHTML = `<div class="pad">${runHtml(log, false, slug)}</div>`;
  S.decisions = {}; S.overrides = {}; S.note = ""; S.saved = ""; blocksCache = null;
  if (log.some((e) => e.step === "done")) setTimeout(() => pageAssessment(slug, new URLSearchParams()), 900);
  else document.querySelectorAll("#startDraft,#redraft").forEach((b) => (b.disabled = false));
}
async function pageAssessment(slug, q = new URLSearchParams()) {
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
      <div class="seclabel" style="margin:8px 0 10px">What the draft will be built from</div><div class="srclist">${srcList}</div><p class="hint" style="margin-top:14px">Every statement in the draft will cite one of these passages. <a href="#/c/${slug}/sources">Read them</a>, or draft now; about two minutes.</p></div></div>`;
    workspace(c, "assessment", body);
    $("#startDraft").addEventListener("click", () => startDraft(slug, c));
    if (q.get("start") === "1" && !c.running) startDraft(slug, c);
    return;
  }

  // Drafted: the document, editing or previewing what the partners receive.
  const modeSwitch = `<div class="seg"><a href="#/c/${slug}" class="${mode === "review" ? "on" : ""}">Edit</a><a href="#/c/${slug}?mode=partner" class="${mode === "partner" ? "on" : ""}">Preview</a></div>`;
  const exportBtn = `<div class="dd"><button class="btn" id="exportBtn">Export <span class="arr">▾</span></button><div class="ddm" id="exportMenu" hidden><a href="/api/companies/${slug}/export?format=docx">Word (.docx)</a><button data-export="pdf">PDF</button><a href="/api/companies/${slug}/export?format=md&download=1">Markdown (.md)</a><div class="sep"></div><button data-export="copy">Copy as text</button><button data-export="copymd">Copy as Markdown</button></div></div>`;
  const right = mode === "review"
    ? `<span class="state" id="savestate">${S.saved ? "Saved " + S.saved.slice(11, 16) : "Edits save automatically"}</span>${modeSwitch}${exportBtn}<a class="btn" href="#/c/${slug}/followup">Email founder</a><button class="btn quiet" id="redraft" title="Replace the draft and clear the review">Draft again</button>`
    : `${modeSwitch}${exportBtn}<a class="btn" href="#/c/${slug}/followup">Email founder</a>`;
  const body = `<div class="stagehead"><h2>Assessment</h2>${pill}<div class="r">${right}</div></div><div id="assessbody" style="display:contents">${splitView(c, mode)}</div>`;
  workspace(c, "assessment", body);
  wireSplit(c, mode);
  $("#redraft")?.addEventListener("click", () => { if (confirm("Draft again? This replaces the current draft and clears the review.")) { $("#assessbody").style.display = "block"; startDraft(slug, c); } });
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
  const [hashPath, query = ""] = location.hash.replace(/^#\/?/, "").split("?");
  const p = hashPath.split("/").filter(Boolean);
  const q = new URLSearchParams(query);
  try {
    if (!p.length) return await pageCompanies();
    if (p[0] === "new") return pageNew();
    if (p[0] === "inbox") return await pageInbox();
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
