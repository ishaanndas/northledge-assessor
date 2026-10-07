// Guided tour: an optional spotlight walk through the main screens. Start it
// from "Tour" in the top bar, or open any page with ?tour=1 in the address.
// The step survives page changes (sessionStorage), and a step whose element
// never appears is skipped rather than leaving the tour stuck.
(function () {
  const EX = "lumina-health"; // the trap deck: it shows every feature at once
  const STEPS = [
    { hash: "#/", sel: ".cards .cardx:first-child, table.list tbody tr:first-child", title: "Companies waiting for review", body: "Each company has one assessment. The card shows where it stands, and the fit and topic tags the AI suggested after drafting." },
    { hash: "#/", sel: ".gridhead > .seg", title: "Sort by fit", body: "Filter the list to good fit, possible fit or not a fit. The tags are suggestions until someone confirms them." },
    { hash: "#/", sel: ".callouts .callout:nth-child(2)", title: "Decks arrive by email", body: "Connected to the fund's inbox, every deck that arrives by email is read, filled in and drafted before anyone opens the app." },
    { hash: `#/c/${EX}`, sel: "#tagbar", title: "The AI's suggested fit", body: "Lumina Health is a deck built to mislead. The AI tagged it Not a fit, with Warning signs. You can confirm or change any tag." },
    { hash: `#/c/${EX}`, sel: "#whypop", before: () => { if (!document.querySelector("#whypop")) document.querySelector("#whyBtn")?.click(); }, after: () => document.querySelector("#whypop")?.remove(), title: "Every tag has reasons", body: "Why lists the reasons, each linked to the statements in the draft it rests on." },
    { hash: `#/c/${EX}`, sel: ".blk.t-flags", title: "Things that are not evidence", body: "The deck hides white text telling AI tools to be favourable and to skip the case against. The draft reports it here instead of following it, along with the planted 92% score and the Friday deadline." },
    { hash: `#/c/${EX}`, sel: '.t-claim[data-id="x0"]', before: () => openClaim("x0", false), title: "Every sentence quotes its source", body: "Click any sentence and the deck page it came from opens beside it. This one catches the headline $2.4M being redefined in the deck's own small print." },
    { hash: `#/c/${EX}`, sel: "aside.sources", before: () => openClaim("x0"), title: "The actual deck page", body: "The source panel shows the real page with the quoted words marked. Drag its edge to resize it." },
    { hash: `#/c/${EX}`, sel: '.blk[data-key="h.bear"]', title: "The case against", body: "Always written at full weight, so a partner reads the strongest argument against before deciding." },
    { hash: `#/c/${EX}`, sel: ".stagehead .seg", title: "Edit, then preview", body: "Edit it like a document: reword, remove, add your own notes. The AI's draft is never overwritten. Preview shows what partners receive." },
    { hash: `#/c/${EX}`, sel: "#sendPartner", title: "Send to partner", body: "Prepares the email with the fit, the summary and a link to the assessment, and records who it went to. Export gives Word, PDF or Markdown." },
    { hash: "#/new", sel: "#deckzone", title: "Try it with a deck", body: "Drop a deck here or paste a link. The fields fill in from the deck, and a draft takes two to three minutes. No deck to hand? Download a test deck from the link below the box." },
    { hash: "#/inbox", sel: ".instrip", title: "The inbox", body: "Sample emails with decks attached. Import one by hand, or set the inbox to import and draft on arrival." },
    { center: true, title: "That's the tour", body: "Open any company to look around, or try the Lumina Health deck yourself to see whether the tool catches every trick again.", links: [["How each test case tries to trip the tool", "/docs/test-cases"], ["Download the test decks", "/docs/test-decks"]] },
  ];

  // Mark a claim as selected; with side=true also open its source page beside it.
  function openClaim(id, side = true) {
    if (typeof S === "undefined" || !S.company?.record) return;
    S.selected = id;
    document.querySelectorAll(".t-claim.lit").forEach((x) => x.classList.remove("lit"));
    document.querySelector(`.t-claim[data-id="${id}"]`)?.classList.add("lit");
    if (!side) { document.querySelector("#split")?.classList.remove("show"); return; }
    try { renderSide(S.company, false); document.querySelector("#split")?.classList.add("show"); } catch {}
  }

  const KEY = "tourStep";
  let el = null, timer = null;
  const get = () => { try { const v = sessionStorage.getItem(KEY); return v === null ? null : Number(v); } catch { return null; } };
  const set = (i) => { try { i === null ? sessionStorage.removeItem(KEY) : sessionStorage.setItem(KEY, String(i)); } catch {} };

  function build() {
    if (el) return el;
    el = document.createElement("div"); el.id = "tour";
    el.innerHTML = `<div class="tour-catch"></div><div class="tour-hole"></div><div class="tour-card" role="dialog" aria-live="polite"><div class="tour-n"></div><h4></h4><p></p><div class="tour-links"></div><div class="tour-a"><button class="linkbtn" data-t="close">End tour</button><span class="grow"></span><button class="btn sm" data-t="back">Back</button><button class="btn sm primary" data-t="next">Next</button></div></div>`;
    document.body.appendChild(el);
    el.addEventListener("click", (e) => { const b = e.target.closest("[data-t]"); if (!b) return; const t = b.dataset.t; if (t === "close") stop(); else go(get() + (t === "next" ? 1 : -1)); });
    addEventListener("resize", () => { const i = get(); if (i !== null) place(STEPS[i]); });
    document.addEventListener("keydown", (e) => { if (get() === null || !el) return; if (e.key === "Escape") stop(); else if (e.key === "ArrowRight") go(get() + 1); else if (e.key === "ArrowLeft") go(get() - 1); });
    return el;
  }

  function place(step) {
    const hole = el.querySelector(".tour-hole"), card = el.querySelector(".tour-card");
    const target = step.center ? null : document.querySelector(step.sel);
    if (!target) { hole.style.cssText = "left:50%;top:40%;width:0;height:0"; card.style.cssText = "left:50%;top:40%;transform:translate(-50%,-50%)"; return; }
    const r = target.getBoundingClientRect(), pad = 6;
    const top = Math.max(4, r.top - pad), left = Math.max(4, r.left - pad);
    const w = Math.min(innerWidth - left - 4, r.width + pad * 2), h = Math.min(innerHeight - top - 4, r.height + pad * 2);
    hole.style.cssText = `left:${left}px;top:${top}px;width:${w}px;height:${h}px`;
    const cw = Math.min(360, innerWidth - 24), ch = card.offsetHeight || 200;
    let cx = Math.min(Math.max(12, left), innerWidth - cw - 12), cy = top + h + 12;
    if (cy + ch > innerHeight - 12) cy = top - ch - 12;                       // above
    if (cy < 12) {                                                             // beside
      cy = Math.min(Math.max(12, top), innerHeight - ch - 12);
      if (left + w + 12 + cw < innerWidth) cx = left + w + 12;
      else if (left - cw - 12 > 0) cx = left - cw - 12;
      else { cx = innerWidth - cw - 16; cy = innerHeight - ch - 16; }         // no room: bottom corner, over the target
    }
    card.style.cssText = `left:${cx}px;top:${cy}px;width:${cw}px`;
  }

  async function go(i) {
    const prev = get();
    if (prev !== null && STEPS[prev]?.after) try { STEPS[prev].after(); } catch {}
    if (i < 0) i = 0;
    if (i >= STEPS.length) return stop();
    set(i); build();
    const step = STEPS[i];
    el.querySelector(".tour-n").textContent = `${i + 1} of ${STEPS.length}`;
    el.querySelector("h4").textContent = step.title;
    el.querySelector("p").textContent = step.body;
    el.querySelector(".tour-links").innerHTML = (step.links || []).map(([t, u]) => `<a href="${window.STATIC ? window.STATIC.url(u) : u}" target="_blank">${t}</a>`).join("");
    el.querySelector('[data-t="back"]').disabled = i === 0;
    el.querySelector('[data-t="next"]').textContent = i === STEPS.length - 1 ? "Done" : "Next";
    el.classList.add("busy");
    if (step.hash && location.hash.split("?")[0] !== step.hash) location.hash = step.hash;
    if (!step.center) {
      const found = await waitFor(step);
      if (get() !== i) return; // the user moved on while we waited
      if (!found) return go(i + 1);
      document.querySelector(step.sel)?.scrollIntoView({ block: "center", behavior: "instant" });
      await new Promise((r) => setTimeout(r, 120));
    }
    el.classList.remove("busy");
    place(step);
  }

  function waitFor(step) {
    return new Promise((resolve) => {
      const t0 = Date.now();
      clearInterval(timer);
      timer = setInterval(() => {
        if (step.before) try { step.before(); } catch {}
        const t = document.querySelector(step.sel);
        if (t && t.getBoundingClientRect().height > 0) { clearInterval(timer); resolve(true); }
        else if (Date.now() - t0 > 7000) { clearInterval(timer); resolve(false); }
      }, 150);
    });
  }

  function stop() {
    const i = get(); if (i !== null && STEPS[i]?.after) try { STEPS[i].after(); } catch {}
    set(null); clearInterval(timer); el?.remove(); el = null;
  }

  window.Tour = { start: () => go(0), stop };
  // Resume after a reload, or start from ?tour=1.
  addEventListener("load", () => {
    const q = new URLSearchParams(location.search);
    if (q.get("tour") === "1") { history.replaceState(null, "", location.pathname + location.hash); setTimeout(() => go(0), 400); }
    else if (get() !== null) setTimeout(() => go(get()), 400);
  });
})();
