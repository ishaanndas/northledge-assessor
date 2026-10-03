#!/usr/bin/env node
// Build out/index.html: every assessment with click-through provenance.
// The page is static; data is embedded. Design tokens are borrowed from an
// earlier legal-drafting prototype whose "where this came from" pane solved
// the same problem: a reader must be able to see the source next to the claim.
import fs from "node:fs";
import path from "node:path";
import { OUT_DIR } from "./lib/sources.mjs";

const slugs = fs.readdirSync(OUT_DIR).filter((d) => fs.existsSync(path.join(OUT_DIR, d, "assessment.json"))).sort();
const records = slugs.map((s) => JSON.parse(fs.readFileSync(path.join(OUT_DIR, s, "assessment.json"), "utf8")));
const evalPath = path.join(OUT_DIR, "eval.json");
const evalData = fs.existsSync(evalPath) ? JSON.parse(fs.readFileSync(evalPath, "utf8")) : [];
const data = JSON.stringify({ records, eval: evalData }).replace(/<\/script/gi, "<\\/script");

const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Draft assessments</title>
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Libre+Baskerville:ital,wght@0,400;0,700;1,400&family=IBM+Plex+Sans:wght@400;450;500&family=IBM+Plex+Mono:wght@400&display=swap">
<style>
:root{--paper:oklch(98.5% .005 85);--surface:oklch(97.4% .007 85);--sheet:oklch(100% 0 0);--ink:oklch(22% .04 260);--ink-soft:oklch(40% .028 258);--muted:oklch(56% .018 258);--faint:oklch(68% .014 258);--brand:oklch(28% .055 258);--gold:oklch(70% .1 78);--gold-ink:oklch(48% .08 70);--risk:oklch(52% .17 27);--ok:oklch(50% .11 155);--line:oklch(92% .008 258);--line-soft:oklch(94.5% .006 258);--line-strong:oklch(87% .012 258);--hover:oklch(95.5% .009 258);--sel:oklch(91.5% .017 258);--gold-wash:oklch(95.5% .035 82);--risk-wash:oklch(96% .02 27);--sans:"IBM Plex Sans","Helvetica Neue",Arial,sans-serif;--serif:"Libre Baskerville",ui-serif,Georgia,serif;--mono:"IBM Plex Mono",ui-monospace,SFMono-Regular,monospace}
@media (prefers-color-scheme:dark){:root{--paper:oklch(19.5% .02 258);--surface:oklch(21.5% .02 258);--sheet:oklch(23.5% .02 258);--ink:oklch(94% .008 85);--ink-soft:oklch(83% .012 258);--muted:oklch(68% .015 258);--faint:oklch(55% .015 258);--brand:oklch(78% .06 258);--gold:oklch(80% .1 80);--gold-ink:oklch(80% .1 80);--risk:oklch(72% .15 27);--ok:oklch(74% .13 155);--line:oklch(29% .016 258);--line-soft:oklch(25.5% .014 258);--line-strong:oklch(34% .02 258);--hover:oklch(25% .022 258);--sel:oklch(30% .03 258);--gold-wash:oklch(28% .045 78);--risk-wash:oklch(26% .03 27)}}
*{box-sizing:border-box}[hidden]{display:none!important}
html,body{height:100%;margin:0}
body{background:var(--paper);color:var(--ink);font-family:var(--sans);font-size:14px;line-height:1.55;-webkit-font-smoothing:antialiased}
button{font:inherit;color:inherit;cursor:pointer;background:none;border:none;padding:0;text-align:left}
h1,h2,h3,h4{font-family:var(--serif);font-weight:400;margin:0;letter-spacing:-.012em;text-wrap:balance}
p{margin:0}
.mono{font-family:var(--mono);font-variant-numeric:tabular-nums;font-size:.92em}
.eyebrow{font-size:10px;letter-spacing:.16em;text-transform:uppercase;color:var(--faint)}
.app{display:grid;grid-template-columns:230px minmax(0,1fr) 380px;height:100vh}
nav{border-right:1px solid var(--line);background:var(--surface);display:flex;flex-direction:column;min-height:0}
nav .top{padding:18px 18px 14px;border-bottom:1px solid var(--line)}
nav .top h1{font-size:17px}
nav .top p{font-size:11.5px;color:var(--muted);margin-top:6px;line-height:1.5}
nav ul{list-style:none;margin:0;padding:6px 0;overflow:auto}
nav li button{display:block;width:100%;padding:11px 18px;border-left:2px solid transparent}
nav li button:hover{background:var(--hover)}
nav li button[aria-current="true"]{background:var(--sel);border-left-color:var(--gold)}
nav .nm{font-size:13px;font-weight:500;color:var(--ink)}
nav .ol{font-size:11.5px;color:var(--muted);margin-top:2px;line-height:1.4}
nav .st{font-family:var(--mono);font-size:10.5px;color:var(--faint);margin-top:5px}
main{overflow:auto;padding:36px 48px 80px;min-width:0}
.doc{max-width:720px}
.doc header h1{font-size:28px;margin-top:6px}
.doc header .sub{color:var(--muted);margin-top:6px;font-size:13.5px}
.doc header .meta{font-family:var(--mono);font-size:11px;color:var(--faint);margin-top:12px;line-height:1.7}
.doc section{margin-top:34px}
.doc h2{font-size:12.5px;font-family:var(--sans);font-weight:500;letter-spacing:.02em;text-transform:uppercase;color:var(--faint);padding-bottom:8px;border-bottom:1px solid var(--line);margin-bottom:14px}
.summary{font-family:var(--serif);font-size:15px;line-height:1.8;color:var(--ink)}
.integrity{background:var(--gold-wash);border-left:2px solid var(--gold);padding:12px 16px;font-size:12.5px;color:var(--ink-soft);line-height:1.6}
.integrity li{margin:4px 0}.integrity ul{margin:0;padding-left:18px}
.dim{margin-top:22px}
.dim h3{font-size:16px;margin-bottom:5px}
.dim .finding{color:var(--ink-soft);font-size:13.5px;margin-bottom:8px}
.claims{list-style:none;margin:0;padding:0}
.claim{display:grid;grid-template-columns:14px 1fr;gap:10px;padding:8px 10px 8px 8px;margin:0 -10px 0 -8px;border-radius:5px;cursor:pointer;font-size:13.5px;line-height:1.55}
.claim:hover{background:var(--hover)}
.claim.lit{background:var(--gold-wash)}
.dot{width:7px;height:7px;border-radius:50%;margin-top:8px;background:var(--ok)}
.claim.warning .dot{background:var(--gold)}.claim.failed .dot{background:var(--risk)}
.claim .t{color:var(--ink)}
.claim.failed .t{color:var(--muted)}
.cites{display:inline-flex;gap:5px;flex-wrap:wrap;margin-left:6px;vertical-align:1px}
.cite{font-family:var(--mono);font-size:10px;color:var(--gold-ink);border:1px solid var(--line-strong);border-radius:3px;padding:0 5px;line-height:16px;white-space:nowrap}
.cite.bad{color:var(--risk);border-color:var(--risk);text-decoration:line-through}
.basis{font-family:var(--mono);font-size:10px;color:var(--faint);margin-left:6px}
.oq{margin:8px 0 0;padding-left:18px;color:var(--muted);font-size:12.5px}
.oq li{margin:2px 0}
.missing{margin:0;display:grid;gap:10px}
.missing div{font-size:13px;line-height:1.55}
.missing b{font-weight:500;color:var(--ink)}
.missing span{color:var(--muted)}
.bear{border-left:2px solid var(--risk);padding-left:16px}
.bear .thesis{font-family:var(--serif);font-size:14.5px;line-height:1.75;margin-bottom:10px}
.evalrow{display:flex;flex-wrap:wrap;gap:8px}
.chip{font-size:11.5px;border:1px solid var(--line);border-radius:999px;padding:3px 10px;color:var(--muted);background:var(--sheet)}
.chip b{font-weight:500;color:var(--ink)}
.chip.miss{border-color:var(--risk);color:var(--risk)}
.evalnote{font-size:12px;color:var(--faint);margin-top:10px;line-height:1.6}
aside{border-left:1px solid var(--line);background:var(--surface);display:flex;flex-direction:column;min-height:0}
aside header{padding:14px 18px 12px;border-bottom:1px solid var(--line);display:flex;align-items:baseline;gap:10px}
aside header h4{font-family:var(--sans);font-size:12.5px;font-weight:500;flex:1}
aside header button{font-size:11.5px;color:var(--muted)}
aside header button:hover{color:var(--ink)}
.prov{flex:1;overflow:auto;padding:14px 18px 40px}
.prov .empty{font-size:12.5px;color:var(--faint);line-height:1.6}
.prov .claimbox{font-size:13px;color:var(--ink);line-height:1.55;padding-bottom:12px;border-bottom:1px solid var(--line-soft);margin-bottom:12px}
.prov .claimbox .status{font-family:var(--mono);font-size:10.5px;margin-top:6px}
.status.verified{color:var(--ok)}.status.warning{color:var(--gold-ink)}.status.failed{color:var(--risk)}
.psg{border-left:2px solid var(--line-strong);padding-left:12px;margin-bottom:16px}
.psg.lit{border-left-color:var(--gold)}
.psg .sh{display:flex;gap:8px;align-items:baseline;font-size:11px;margin-bottom:5px}
.psg .sh .id{font-family:var(--mono);color:var(--gold-ink)}
.psg .sh .nm{color:var(--muted);flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.psg .tx{font-family:var(--serif);font-size:12px;line-height:1.8;color:var(--muted);white-space:pre-wrap}
.psg mark{background:var(--gold-wash);color:var(--ink);padding:0 1px;border-bottom:1px solid var(--gold)}
.psg .warn{font-size:11px;color:var(--risk);margin-top:4px}
.srcgroup h5{font-family:var(--sans);font-size:11px;font-weight:500;letter-spacing:.08em;text-transform:uppercase;color:var(--faint);margin:18px 0 10px}
@media (max-width:1100px){.app{grid-template-columns:200px 1fr}aside{display:none}.app.show-src aside{display:flex;position:fixed;right:0;top:0;bottom:0;width:min(420px,100%);z-index:10;box-shadow:-10px 0 30px oklch(0% 0 0/.15)}}
@media (max-width:720px){.app{grid-template-columns:1fr;height:auto}nav{border-right:none;border-bottom:1px solid var(--line)}main{padding:24px 20px 60px}}
</style></head><body>
<div class="app" id="app">
<nav><div class="top"><div class="eyebrow">Seed fund · first-pass drafts</div><h1>Draft assessments</h1><p>Every claim cites a passage. Nothing here is a recommendation or a score. Click a claim to see where it came from.</p></div><ul id="navlist"></ul></nav>
<main><article class="doc" id="doc"></article></main>
<aside><header><h4 id="asideTitle">Where this came from</h4><button id="browseBtn">Browse all sources</button><button id="closeBtn" hidden>Close</button></header><div class="prov" id="prov"><p class="empty">Select a claim, contradiction or bear-case point. The passages it cites appear here with the quoted text marked.</p></div></aside>
</div>
<script id="data" type="application/json">${data}</script>
<script>
const DATA=JSON.parse(document.getElementById('data').textContent);
const esc=s=>String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const norm=s=>String(s).toLowerCase().replace(/[\\u2018\\u2019]/g,"'").replace(/[\\u201c\\u201d]/g,'"').replace(/[\\u2013\\u2014]/g,'-').replace(/\\s+/g,' ').trim();
let cur=null,sel=null;
const byId=r=>{const m=new Map();r.assessment.dimensions.forEach((d,di)=>d.claims.forEach((c,ci)=>m.set('d'+di+'.c'+ci,{stmt:c,where:d.name})));r.assessment.contradictions.forEach((c,i)=>m.set('x'+i,{stmt:c,where:'Contradictions'}));r.assessment.bear_case.points.forEach((c,i)=>m.set('b'+i,{stmt:c,where:'Bear case'}));return m};
function stmtHtml(id,s){const st=s.verification?.status||'verified';const cites=(s.citations||[]).map(c=>'<span class="cite'+(c.status&&c.status!=='ok'&&c.status!=='quote_too_long'?' bad':'')+'">'+esc(c.passage_id)+'</span>').join('');return '<li class="claim '+st+(sel===id?' lit':'')+'" data-id="'+id+'"><span class="dot"></span><span class="t">'+esc(s.text)+'<span class="cites">'+cites+'</span>'+(s.basis!=='stated'?'<span class="basis">'+s.basis+'</span>':'')+'</span></li>'}
function renderNav(){document.getElementById('navlist').innerHTML=DATA.records.map(r=>'<li><button data-slug="'+r.slug+'" aria-current="'+(cur&&cur.slug===r.slug)+'"><div class="nm">'+esc(r.company.name)+'</div><div class="ol">'+esc(r.company.one_liner)+'</div><div class="st">'+r.verification_summary.verified+'/'+r.verification_summary.statements+' verified · '+r.assessment.missing.length+' gaps</div></button></li>').join('')}
function renderDoc(){const r=cur,a=r.assessment,ev=DATA.eval.find(e=>e.slug===r.slug);let h='';
h+='<header><div class="eyebrow">Draft for partner review · not a recommendation</div><h1>'+esc(a.company_name)+'</h1><p class="sub">'+esc(r.company.one_liner)+' · '+esc(r.company.ask)+'</p><p class="meta">Drafted '+esc(r.generated_at)+' by '+esc(r.model)+' from '+r.sources.map(s=>esc(s.key)).join(', ')+'. '+r.verification_summary.verified+' of '+r.verification_summary.statements+' statements verified against source text, '+r.verification_summary.warning+' with warnings, '+r.verification_summary.failed+' unverified'+(r.repairs?' after one repair round':'')+'.</p></header>';
h+='<section><h2>Summary</h2><p class="summary">'+esc(a.summary)+'</p></section>';
if(a.integrity_notes.length)h+='<section><h2>Integrity notes</h2><div class="integrity"><ul>'+a.integrity_notes.map(n=>'<li>'+esc(n)+'</li>').join('')+'</ul></div></section>';
h+='<section><h2>Assessment</h2>'+a.dimensions.map((d,di)=>'<div class="dim"><h3>'+esc(d.name)+'</h3><p class="finding">'+esc(d.finding)+'</p><ul class="claims">'+d.claims.map((c,ci)=>stmtHtml('d'+di+'.c'+ci,c)).join('')+'</ul>'+(d.open_questions.length?'<ul class="oq">'+d.open_questions.map(q=>'<li>'+esc(q)+'</li>').join('')+'</ul>':'')+'</div>').join('')+'</section>';
h+='<section><h2>Where the sources disagree</h2>'+(a.contradictions.length?'<ul class="claims">'+a.contradictions.map((c,i)=>stmtHtml('x'+i,c)).join('')+'</ul>':'<p class="finding">No contradictions found between the sources.</p>')+'</section>';
h+='<section><h2>What is missing</h2><div class="missing">'+a.missing.map(m=>'<div><b>'+esc(m.item)+'.</b> <span>'+esc(m.why_it_matters)+'</span></div>').join('')+'</div></section>';
h+='<section><h2>The case against</h2><div class="bear"><p class="thesis">'+esc(a.bear_case.thesis)+'</p><ul class="claims">'+a.bear_case.points.map((c,i)=>stmtHtml('b'+i,c)).join('')+'</ul></div></section>';
if(ev){const j=ev.judge&&ev.judge.counts,missed=ev.expectations.filter(c=>!c.pass);h+='<section><h2>Automated checks</h2><div class="evalrow"><span class="chip">Quote check <b>'+ev.deterministic.verified+'/'+ev.deterministic.statements+'</b></span>'+(j?'<span class="chip">Judge supported <b>'+j.supported+'</b> · partial <b>'+j.partial+'</b> · unsupported <b>'+j.unsupported+'</b></span>':'')+'<span class="chip'+(ev.leaks.length?' miss':'')+'">Decision language <b>'+ev.leaks.length+'</b></span><span class="chip'+(missed.length?' miss':'')+'">Expectations <b>'+(ev.expectations.length-missed.length)+'/'+ev.expectations.length+'</b></span></div>'+(missed.length?'<p class="evalnote">Missed: '+missed.map(m=>esc(m.name)+(m.detail?' ('+esc(m.detail)+')':'')).join('; ')+'</p>':'')+(j&&ev.judge.rows.filter(x=>x.verdict!=='supported').length?'<p class="evalnote">Judge flagged: '+ev.judge.rows.filter(x=>x.verdict!=='supported').map(x=>'<b>'+x.id+'</b> '+x.verdict+': '+esc(x.reason)).join(' · ')+'</p>':'')+'</section>'}
document.getElementById('doc').innerHTML=h}
// Mirror lib/verify.mjs normalize(): lowercase, straight quotes and dashes, strip markdown
// marks, collapse whitespace. Build it char by char and keep a map from each normalized
// index back to the raw index so a match can be marked in the original text.
function buildNorm(text){let out='',map=[];for(let i=0;i<text.length;i++){let ch=text[i].toLowerCase();if(/[‘’‚]/.test(ch))ch="'";else if(/[“”„]/.test(ch))ch='"';else if(/[–—−]/.test(ch))ch='-';else if(/[*_\`#>]/.test(ch))continue;if(/\\s/.test(ch)){if(out.length===0||out[out.length-1]===' ')continue;ch=' '}out+=ch;map.push(i)}if(out.endsWith(' ')){out=out.slice(0,-1);map.pop()}return{out,map}}
function highlight(text,quote){const t=buildNorm(text),q=buildNorm(quote).out;if(!q)return esc(text);const i=t.out.indexOf(q);if(i<0)return null;const start=t.map[i],end=t.map[i+q.length-1]+1;return esc(text.slice(0,start))+'<mark>'+esc(text.slice(start,end))+'</mark>'+esc(text.slice(end))}
function renderProv(){const p=document.getElementById('prov');document.getElementById('asideTitle').textContent='Where this came from';if(!sel){p.innerHTML='<p class="empty">Select a claim, contradiction or bear-case point. The passages it cites appear here with the quoted text marked.</p>';return}
const {stmt,where}=byId(cur).get(sel);const st=stmt.verification?.status||'verified';let h='<div class="claimbox">'+esc(stmt.text)+'<div class="status '+st+'">'+esc(where)+' · '+st+(stmt.verification&&stmt.verification.issues.length?' · '+stmt.verification.issues.join(', '):'')+' · basis: '+stmt.basis+'</div></div>';
if(!stmt.citations.length)h+='<p class="empty">No citation given.</p>';
for(const c of stmt.citations){const ps=cur.passages[c.passage_id];if(!ps){h+='<div class="psg"><div class="sh"><span class="id">'+esc(c.passage_id)+'</span><span class="nm">no such passage</span></div><div class="warn">The cited passage id does not exist.</div></div>';continue}
const src=cur.sources.find(s=>s.key===ps.source);const hl=highlight(ps.text,c.quote);h+='<div class="psg lit"><div class="sh"><span class="id">'+esc(c.passage_id)+'</span><span class="nm">'+esc(src?src.title:ps.source)+'</span></div><div class="tx">'+(hl!==null?hl:esc(ps.text))+'</div>'+(hl===null?'<div class="warn">Quote not found in this passage: “'+esc(c.quote)+'”</div>':'')+'</div>'}
p.innerHTML=h}
function renderBrowse(){document.getElementById('asideTitle').textContent='All source passages';const p=document.getElementById('prov');p.innerHTML=cur.sources.map(s=>'<div class="srcgroup"><h5>'+esc(s.key)+' · '+esc(s.title)+'</h5>'+Object.entries(cur.passages).filter(([id,ps])=>ps.source===s.key).map(([id,ps])=>'<div class="psg"><div class="sh"><span class="id">'+esc(id)+'</span></div><div class="tx">'+esc(ps.text)+'</div></div>').join('')+'</div>').join('')}
function select(slug,id){cur=DATA.records.find(r=>r.slug===slug)||DATA.records[0];sel=id||null;renderNav();renderDoc();renderProv();setUrl()}
function setUrl(){try{history.replaceState(null,'','?c='+cur.slug+(sel?'&s='+sel:''))}catch(e){}}
document.getElementById('navlist').addEventListener('click',e=>{const b=e.target.closest('button[data-slug]');if(b){select(b.dataset.slug,null);document.querySelector('main').scrollTop=0}});
document.getElementById('doc').addEventListener('click',e=>{const li=e.target.closest('.claim');if(!li)return;sel=li.dataset.id;document.querySelectorAll('.claim.lit').forEach(x=>x.classList.remove('lit'));li.classList.add('lit');renderProv();document.getElementById('app').classList.add('show-src');document.getElementById('closeBtn').hidden=false;setUrl()});
document.getElementById('browseBtn').addEventListener('click',()=>{renderBrowse();document.getElementById('app').classList.add('show-src');document.getElementById('closeBtn').hidden=false});
document.getElementById('closeBtn').addEventListener('click',()=>{document.getElementById('app').classList.remove('show-src');document.getElementById('closeBtn').hidden=true});
const q=new URLSearchParams(location.search);select(q.get('c'),q.get('s'));
</script></body></html>`;
fs.writeFileSync(path.join(OUT_DIR, "index.html"), html);
console.log(`wrote out/index.html (${records.length} assessments, ${(html.length / 1024).toFixed(0)} KB)`);
