#!/usr/bin/env node
// Checks the fit and topic tags on every example. Free: it reads saved files
// and never calls the AI.
//
//   1. Every reason and every tag points at statements that exist in the draft.
//   2. Each example's tags meet what its expectations.json says (for example,
//      a company built to mislead must never be tagged "Good fit").
//   3. A test of the tester: five planted bad tags are fed to the same filter the
//      app uses, and each one must be dropped.
import fs from "node:fs";
import path from "node:path";
import { listExamples, outDirFor, EXAMPLES_DIR } from "../lib/sources.mjs";
import { cleanTags, FIT, TAGS } from "../lib/tags.mjs";

const rows = [];
const ok = (slug, name, pass, detail = "") => { rows.push({ slug, name, pass, detail }); console.log(`${pass ? "ok  " : "FAIL"}  ${slug}: ${name}${detail ? "  " + detail : ""}`); };

for (const slug of listExamples()) {
  const dir = outDirFor(slug);
  const rec = JSON.parse(fs.readFileSync(path.join(dir, "assessment.json"), "utf8"));
  const tf = path.join(dir, "tags.json");
  if (!fs.existsSync(tf)) { ok(slug, "has tags", false, "no tags.json; run node assess.mjs --tags-only"); continue; }
  const ai = JSON.parse(fs.readFileSync(tf, "utf8")).ai;

  // 1. Re-running the filter on the saved tags must change nothing.
  const again = cleanTags({ fit: ai.fit, fit_reasons: ai.fit_reasons, tags: ai.tags }, rec);
  ok(slug, "every reason points at real statements", again.fit_reasons.length === ai.fit_reasons.length && ai.fit_reasons.length > 0, `${ai.fit_reasons.length} reasons`);
  ok(slug, "every tag is backed by the draft", again.tags.length === ai.tags.length, `${ai.tags.length} tags`);

  // 2. Expectations written before the tags were generated.
  const exp = JSON.parse(fs.readFileSync(path.join(EXAMPLES_DIR, slug, "expectations.json"), "utf8")).tags || {};
  const have = ai.tags.map((t) => t.tag);
  if (exp.fit_not) ok(slug, `fit is not ${exp.fit_not.map((f) => FIT[f]).join(" or ")}`, !exp.fit_not.includes(ai.fit), `got ${FIT[ai.fit]}`);
  for (const t of exp.must_include || []) ok(slug, `tagged ${TAGS[t]}`, have.includes(t));
  for (const t of exp.must_not_include || []) ok(slug, `not tagged ${TAGS[t]}`, !have.includes(t));
}

// 3. Test of the tester, on one real draft.
const rec = JSON.parse(fs.readFileSync(path.join(outDirFor("quill-robotics"), "assessment.json"), "utf8"));
const noneNote = rec.assessment.integrity_notes.findIndex((n) => /no text addressed/i.test(n));
const planted = cleanTags({
  fit: "good",
  fit_reasons: [{ text: "Invented reason", statement_ids: ["d99.c0", "x42"] }, { text: "Real reason", statement_ids: ["x0"] }],
  tags: [
    { tag: "strong-team", reason: "No evidence given", evidence_ids: [] },
    { tag: "crowded-market", reason: "Points at nothing real", evidence_ids: ["b99"] },
    { tag: "warning-signs", reason: "Cites a claim, not a steering note", evidence_ids: ["x0"] },
    { tag: "warning-signs", reason: "Cites the 'nothing found' note", evidence_ids: noneNote >= 0 ? [`n${noneNote}`] : ["n0"] },
    { tag: "pre-revenue", reason: "Cites a statement that reports revenue", evidence_ids: ["x0"] },
    { tag: "numbers-overstated", reason: "Real", evidence_ids: ["x0"] },
  ],
}, rec);
ok("planted", "reason pointing at statements that do not exist is dropped", planted.fit_reasons.length === 1);
ok("planted", "five bad tags dropped, the real one kept", planted.dropped.length === 5 && planted.tags.length === 1 && planted.tags[0].tag === "numbers-overstated", `dropped ${planted.dropped.length}`);

const failed = rows.filter((r) => !r.pass);
console.log(`\n${rows.length - failed.length}/${rows.length} tag checks passed${failed.length ? "; FAILED: " + failed.map((f) => `${f.slug} ${f.name}`).join(", ") : ""}`);
fs.writeFileSync(path.join(path.dirname(outDirFor("quill-robotics")), "tag-checks.json"), JSON.stringify(rows, null, 2));
process.exit(failed.length ? 1 : 0);
