#!/usr/bin/env node
// Build out/index.html: a static, self-contained copy of every assessment with
// click-through provenance, using the same stylesheet and document renderer
// as the app (app/app.css, app/doc.js) so the committed artifact matches it.
import fs from "node:fs";
import path from "node:path";
import { ROOT } from "./lib/env.mjs";
import { OUT_DIR } from "./lib/sources.mjs";

const slugs = fs.readdirSync(OUT_DIR).filter((d) => fs.existsSync(path.join(OUT_DIR, d, "assessment.json"))).sort();
const records = slugs.map((s) => JSON.parse(fs.readFileSync(path.join(OUT_DIR, s, "assessment.json"), "utf8")));
const evalPath = path.join(OUT_DIR, "eval.json");
const evalData = fs.existsSync(evalPath) ? JSON.parse(fs.readFileSync(evalPath, "utf8")) : [];
const companies = records.map((r) => ({ slug: r.slug, name: r.company.name, one_liner: r.company.one_liner, ask: r.company.ask, record: r, reviewDoc: null, eval: evalData.find((e) => e.slug === r.slug) || null }));
const data = JSON.stringify(companies).replace(/<\/script/gi, "<\\/script");
const css = fs.readFileSync(path.join(ROOT, "app", "app.css"), "utf8");
const docjs = fs.readFileSync(path.join(ROOT, "app", "doc.js"), "utf8");

const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Assessments</title>
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&display=swap">
<style>${css}</style>
</head><body>
<header class="top"><span class="name">Assessments</span><div class="crumbs"><span>/</span><b>Static report</b></div><div class="right"><span class="ter" style="font-size:12.5px">Committed run. No scores, no recommendations.</span></div></header>
<div id="main"></div>
<script id="data" type="application/json">${data}</script>
<script>${docjs}</script>
<script>
const DATA=JSON.parse(document.getElementById('data').textContent);
const $=(s)=>document.querySelector(s);
let cur=null,sel=null;
function render(){
  const rail=DATA.map(c=>'<a class="stage '+(cur.slug===c.slug?'on':'')+'" href="#'+c.slug+'"><span>'+Doc.esc(c.name)+'</span><small>'+c.record.verification_summary.verified+'/'+c.record.verification_summary.statements+'</small></a>').join('');
  $('#main').innerHTML='<div class="ws"><nav class="rail"><div class="co"><b>Companies</b><span>'+DATA.length+' drafted</span></div><div class="stages">'+rail+'</div><div class="foot">Click a statement to see the passage it cites.</div></nav><div class="content"><div class="split" id="split"><div class="docwrap"><article class="doc" id="doc">'+Doc.document(cur,{mode:'static',selected:sel})+'</article></div><aside class="sources"><div class="h"><b id="sideTitle">Source</b><button id="browse">All passages</button><button id="closeSide" hidden>Close</button></div><div class="body" id="side">'+Doc.provenance(cur,sel)+'</div></aside></div></div></div>';
  $('#doc').addEventListener('click',e=>{const li=e.target.closest('.claim');if(!li)return;sel=li.dataset.id;$('#doc').querySelectorAll('.claim.lit').forEach(x=>x.classList.remove('lit'));li.classList.add('lit');$('#sideTitle').textContent='Source';$('#side').innerHTML=Doc.provenance(cur,sel);$('#split').classList.add('show');$('#closeSide').hidden=false});
  $('#browse').addEventListener('click',()=>{$('#sideTitle').textContent='All passages';$('#side').innerHTML=Doc.browse(cur);$('#split').classList.add('show');$('#closeSide').hidden=false});
  $('#closeSide').addEventListener('click',()=>{$('#split').classList.remove('show');$('#closeSide').hidden=true});
}
function route(){const slug=location.hash.slice(1);const next=DATA.find(c=>c.slug===slug)||DATA[0];if(cur!==next){cur=next;sel=null}render()}
window.addEventListener('hashchange',route);route();
</script></body></html>`;
fs.writeFileSync(path.join(OUT_DIR, "index.html"), html);
console.log(`wrote out/index.html (${records.length} assessments, ${(html.length / 1024).toFixed(0)} KB)`);
