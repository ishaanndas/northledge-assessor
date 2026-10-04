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
  $("#top").innerHTML = `<a class="name" href="#/"><span class="mark">SA</span>Seed assessments</a>${crumbs.length ? `<div class="crumbs">${crumbs.map((c, i) => `<span>/</span>${c.href ? `<a href="${c.href}">${esc(c.label)}</a>` : `<b>${esc(c.label)}</b>`}`).join("")}</div>` : ""}<button class="searchbox" id="openSearch"><span class="ico">⌕</span><span>Search companies, decks, claims…</span><kbd>⌘K</kbd></button><div class="right"><a class="navlink" href="#/inbox" id="inboxLink">Inbox${inboxCount ? ` <span class="count">${inboxCount}</span>` : ""}</a>${right}</div>`;
  $("#openSearch").addEventListener("click", openPalette);
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
async function pageSources(slug, openPid) {
  const c = await load(slug);
  topbar([{ label: c.name }]);
  const body = stagehead("Sources", c.record ? `<a class="btn" href="#/c/${slug}/draft">Draft again</a>` : `<a class="btn primary" href="#/c/${slug}/draft?start=1">Draft assessment <span class="arr">→</span></a>`, "What the model reads. Click a passage to see where it came from.") +
    `<div class="split" id="split"><div class="docwrap"><div class="pad narrow">${c.design_note ? `<div class="callout" style="grid-template-columns:1fr;margin-bottom:28px"><div><div class="micro">Why this example exists</div><p style="margin-top:6px">${esc(c.design_note)}</p></div></div>` : ""}${c.intake?.via === "inbox" ? `<div class="callout" style="grid-template-columns:1fr;margin-bottom:28px"><div><div class="micro">Imported from the inbox</div><p style="margin-top:6px">${esc(c.intake.from)} · ${esc(c.intake.subject)}. ${(c.intake.notes || []).map(esc).join(" · ")}</p></div></div>` : ""}${c.sourceDocs.map((s) => `<div class="srcblock"><div class="sbh"><h3>${esc(s.key)}</h3><span class="ti">${esc(s.title)} · ${s.passages.length} passages${c.files?.[s.key] ? ` · <a href="${fileUrl(c, s.key)}" target="_blank">${esc(c.files[s.key].name)}</a>` : ""}</span></div>${s.passages.map((p) => `<div class="psg clickable" data-pid="${esc(p.id)}"><span class="id">${esc(p.id)}</span><span class="tx">${esc(p.text)}</span></div>`).join("")}</div>`).join("")}</div></div>
    <aside class="sources"><div class="h"><b id="sideTitle">Source</b><button id="closeSide" hidden>Close</button></div><div class="body" id="side"><p class="none">Click a passage. PDF decks open at that page; other sources show the passage as a slide.</p></div></aside></div>`;
  workspace(c, "sources", body);
  const show = (pid) => { $("#side").innerHTML = viewerHtml(c, pid); $("#split").classList.add("show"); $("#closeSide").hidden = false; document.querySelectorAll(".psg.lit").forEach((x) => x.classList.remove("lit")); document.querySelector(`.psg[data-pid="${CSS.escape(pid)}"]`)?.classList.add("lit"); };
  $("#main").addEventListener("click", (e) => { const v = e.target.closest("[data-view]"); if (v) { show(v.dataset.view); return; } const p = e.target.closest(".psg[data-pid]"); if (p) show(p.dataset.pid); });
  $("#closeSide").addEventListener("click", () => { $("#split").classList.remove("show"); $("#closeSide").hidden = true; });
  if (openPid) { show(openPid); document.querySelector(`.psg[data-pid="${CSS.escape(openPid)}"]`)?.scrollIntoView({ block: "center" }); }
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
function renderSide(c, browse) { $("#sideTitle").textContent = browse ? "All passages" : "Source"; $("#side").innerHTML = browse ? Doc.browse(c) : Doc.provenance(c, S.selected); $("#side").querySelectorAll(".src .sh .chip").forEach((ch) => { const pid = ch.textContent.trim(); if (/^[\w-]+:\d+$/.test(pid)) { const b = document.createElement("button"); b.className = "open-slide"; b.dataset.view = pid; b.textContent = c.files?.[pid.split(":")[0]]?.kind === "pdf" ? "Open page" : "View as slide"; ch.parentElement.appendChild(b); } }); }
function showViewer(c, pid) { $("#sideTitle").textContent = "Source"; $("#side").innerHTML = `<button class="btn sm quiet" id="backToSource" style="margin-bottom:10px">← Back to the passage</button>` + viewerHtml(c, pid); $("#split").classList.add("show"); $("#closeSide").hidden = false; }
function splitView(c, mode) {
  return `<div class="split" id="split"><div class="docwrap"><article class="doc" id="doc">${Doc.document(c, docOpts(mode))}</article></div><aside class="sources"><div class="h"><b id="sideTitle">Source</b><button id="browse">All passages</button><button id="closeSide" hidden>Close</button></div><div class="body" id="side">${Doc.provenance(c, S.selected)}</div></aside></div>`;
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
function viewerHtml(c, pid) {
  const [key, n] = pid.split(":");
  const file = c.files?.[key];
  const text = c.record?.passages?.[pid]?.text ?? c.sourceDocs?.find((s) => s.key === key)?.passages.find((p) => p.id === pid)?.text ?? "";
  const url = fileUrl(c, key);
  const title = c.sourceDocs?.find((s) => s.key === key)?.title || c.record?.sources?.find((s) => s.key === key)?.title || key;
  let body;
  if (file?.kind === "pdf" && url) body = `<iframe class="pdf" src="${url}#page=${Number(n)}&toolbar=0&navpanes=0&view=Fit" title="${esc(file.name)} page ${n}"></iframe>`;
  else body = slideCard(text, pid);
  const nav = (() => { const total = file?.pages || c.sourceDocs?.find((s) => s.key === key)?.passages.length || c.record?.sources?.find((s) => s.key === key)?.passages || 0; const i = Number(n); return `<div class="vnav"><button class="btn sm" data-view="${key}:${i - 1}" ${i <= 1 ? "disabled" : ""}>←</button><span>${file?.kind === "pdf" ? "Page" : "Slide"} ${i}${total ? ` of ${total}` : ""}</span><button class="btn sm" data-view="${key}:${i + 1}" ${total && i >= total ? "disabled" : ""}>→</button>${url ? `<a class="btn sm" href="${url}" target="_blank" style="margin-left:auto">Open file</a>` : ""}</div>`; })();
  return `<div class="viewer"><div class="vhead"><span class="chip">${esc(pid)}</span><span class="vt">${esc(title)}${file ? ` · ${esc(file.name)}` : ""}</span></div>${nav}${body}<div class="vtext"><div class="micro">Passage text</div>${esc(text)}</div></div>`;
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
  const showSource = (id) => { S.selected = id; doc.querySelectorAll(".t-claim.lit").forEach((x) => x.classList.remove("lit")); doc.querySelector(`.t-claim[data-id="${id}"]`)?.classList.add("lit"); renderSide(c, false); $("#split").classList.add("show"); $("#closeSide").hidden = false; };
  const change = () => { blocksCache = null; queueSave(); };
  const rerender = () => { renderDoc(c, mode); };

  doc.addEventListener("click", (e) => {
    const blk = e.target.closest(".blk");
    const act = e.target.closest("button[data-act]");
    if (act && blk) { S.decisions[blk.dataset.id] = { action: act.dataset.act }; change(); rerender(); return; }
    const gact = e.target.closest("button[data-gapact]");
    if (gact && blk) { setPath(S.overrides, `missing.${blk.dataset.gap}.removed`, gact.dataset.gapact === "remove"); change(); rerender(); return; }
    if (e.target.closest("button[data-handle]")) { e.preventDefault(); return; }
    if (blk?.classList.contains("t-claim") && !e.target.closest("[contenteditable]")) showSource(blk.dataset.id);
  });
  doc.addEventListener("focusin", (e) => { const blk = e.target.closest(".t-claim"); if (blk && e.target.hasAttribute("contenteditable")) showSource(blk.dataset.id); });

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
  $("#side").addEventListener("click", (e) => { const v = e.target.closest("[data-view]"); if (v) { showViewer(c, v.dataset.view); return; } if (e.target.closest("#backToSource")) renderSide(c, false); });
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
async function pageReview(slug, q = new URLSearchParams()) {
  const c = await load(slug);
  if (!c.record) return (location.hash = `#/c/${slug}/draft`);
  if (q.get("s")) S.selected = q.get("s");
  topbar([{ label: c.name }]);
  workspace(c, "review", stagehead("Review", `<span class="state" id="savestate">${S.saved ? "Saved " + S.saved.slice(11, 16) : "Edits save automatically"}</span><a class="btn primary" href="#/c/${slug}/partner">Partner page <span class="arr">→</span></a>`, "Click anywhere to edit. Click a statement to see its source.") + splitView(c, "review"));
  wireSplit(c, "review");
  const target = q.get("s") ? `.t-claim[data-id="${CSS.escape(q.get("s"))}"]` : q.get("g") ? `.blk[data-key="gap.${q.get("g")}"]` : q.get("k") ? `.blk[data-key="${CSS.escape(q.get("k"))}"]` : null;
  if (target) { const el = $("#doc").querySelector(target); if (el) { el.scrollIntoView({ block: "center" }); el.classList.add("flash"); if (q.get("s")) { renderSide(c, false); $("#split").classList.add("show"); } } }
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
      if (stage === "sources") return await pageSources(slug, q.get("p"));
      if (stage === "draft") return await pageDraft(slug, q.get("start") === "1");
      if (stage === "review") return await pageReview(slug, q);
      if (stage === "partner") return await pagePartner(slug);
      if (stage === "followup") return await pageFollowup(slug);
    }
    location.hash = "#/";
  } catch (err) { $("#main").innerHTML = `<div class="page"><div class="inner"><p style="color:var(--bad)">${esc(err.message)}</p></div></div>`; }
}
window.addEventListener("hashchange", route);
route();
