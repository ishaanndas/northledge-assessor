#!/usr/bin/env node
// Prove the deterministic checks fire. Takes a real drafted assessment,
// plants four known defects in a copy, and confirms each one is caught.
// No model calls. Run after assess.mjs.
import fs from "node:fs";
import path from "node:path";
import { OUT_DIR } from "./lib/sources.mjs";
import { verifyAssessment } from "./lib/verify.mjs";

const slug = process.argv[2] || "lumen-grid";
const rec = JSON.parse(fs.readFileSync(path.join(OUT_DIR, slug, "assessment.json"), "utf8"));
const titles = Object.fromEntries(rec.sources.map((s) => [s.key, s.title]));
const passageIndex = new Map(Object.entries(rec.passages).map(([id, p]) => [id, { id, ...p, title: titles[p.source] || p.source }]));
const a = structuredClone(rec.assessment);
const claims = a.dimensions.flatMap((d) => d.claims).filter((c) => c.basis === "stated" && c.citations.length);

const planted = [];
// 1. A quote that was never in the source (fabricated evidence).
claims[0].citations[0].quote = "the company has signed a national distribution agreement";
planted.push({ claim: claims[0].text, defect: "fabricated quote", expect: "quote_not_found" });
// 2. A citation pointing at a passage that does not exist.
claims[1].citations[0].passage_id = "deck:99";
planted.push({ claim: claims[1].text, defect: "citation to nonexistent passage", expect: "missing_passage" });
// 3. A number changed in the claim but not in the evidence (misstated figure).
const numbered = claims.find((c, i) => i > 1 && /\d/.test(c.text));
numbered.text = numbered.text.replace(/\d[\d,.]*/, (m) => String(Number(m.replace(/,/g, "")) * 7 + 1));
planted.push({ claim: numbered.text, defect: "number not in cited passage", expect: "number_not_in_evidence" });
// 4. A claim with its citations stripped.
const bare = claims.find((c) => c !== claims[0] && c !== claims[1] && c !== numbered);
bare.citations = [];
planted.push({ claim: bare.text, defect: "no citation", expect: "no_citation" });

const v = verifyAssessment(a, passageIndex);
let caught = 0;
for (const p of planted) {
  const r = v.results.find((x) => x.text === p.claim);
  const hit = r?.issues.some((i) => i.code === p.expect);
  caught += hit ? 1 : 0;
  console.log(`${hit ? "CAUGHT " : "MISSED "} ${p.defect} -> ${r ? r.issues.map((i) => i.code).join(",") || "no issues" : "claim not found"}`);
}
console.log(`\n${caught}/${planted.length} planted defects caught. Original draft: ${rec.verification_summary.failed} failed, ${rec.verification_summary.warning} warnings. Mutated copy: ${v.summary.failed} failed, ${v.summary.warning} warnings.`);
process.exit(caught === planted.length ? 0 : 1);
