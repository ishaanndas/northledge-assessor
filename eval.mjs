#!/usr/bin/env node
// Evaluate every drafted assessment in out/. Four kinds of check:
//   1. Deterministic citation checks (re-run from scratch, independent of the pipeline's own annotations).
//   2. An LLM judge, on a different model from the drafter, reading each claim against the full cited passages.
//   3. Decision-leakage scan: recommendation, score or probability language where there should be none.
//   4. Known-answer expectations per example (what a reviewer who built the trap expects to see).
// Writes out/eval.json and out/eval-report.md and prints a summary. Reports what it finds, including misses.
import fs from "node:fs";
import path from "node:path";
import Anthropic from "@anthropic-ai/sdk";
import { loadEnv, MODELS } from "./lib/env.mjs";
import { OUT_DIR, EXAMPLES_DIR } from "./lib/sources.mjs";
import { verifyAssessment, statements } from "./lib/verify.mjs";
import { JUDGE_SYSTEM, JUDGE_SCHEMA } from "./lib/prompts.mjs";

loadEnv();
const client = new Anthropic();
const skipJudge = process.argv.includes("--no-judge");

const LEAK_PATTERNS = [
  /\brecommend(s|ed|ation|ing)?\b/i,
  /\b(we|you|the fund|partners) should (not )?(invest|pass|proceed|fund|lead)\b/i,
  /\bprobability of success\b/i,
  /\blikelihood of success\b/i,
  /\b\d{1,3}\s?% (chance|probability|likely)\b/i,
  /\b(strong|weak|clear|easy|hard) (buy|pass|yes|no)\b/i,
  /\b(invest|pass) on this\b/i,
  /\b(score|rating) of \d/i,
  /\b(exciting|compelling|world-class|exceptional) (team|market|opportunity|founder)/i,
];

function leakScan(a) {
  // Integrity notes and contradictions are allowed to quote the inputs, so
  // only the parts written in the assessor's own voice are scanned.
  const fields = [["summary", a.summary], ["bear_case.thesis", a.bear_case.thesis]];
  a.dimensions.forEach((d, i) => {
    fields.push([`dimensions[${i}].finding`, d.finding]);
    d.claims.forEach((c, j) => fields.push([`dimensions[${i}].claims[${j}]`, c.text]));
  });
  a.bear_case.points.forEach((c, j) => fields.push([`bear_case.points[${j}]`, c.text]));
  const hits = [];
  for (const [where, text] of fields)
    for (const re of LEAK_PATTERNS) {
      const m = text.match(re);
      if (m) hits.push({ where, match: m[0], context: text.slice(Math.max(0, m.index - 40), m.index + 60) });
    }
  return hits;
}

const anyMatch = (texts, pattern) => texts.some((t) => new RegExp(pattern, "i").test(t));

function expectationChecks(rec, exp, det) {
  const a = rec.assessment;
  const checks = [];
  const add = (name, pass, detail = "") => checks.push({ name, pass, detail });
  const claimTexts = a.dimensions.flatMap((d) => d.claims.map((c) => c.text));
  const contraTexts = a.contradictions.flatMap((c) => [c.text, ...c.citations.map((x) => x.quote)]);
  const bearTexts = [a.bear_case.thesis, ...a.bear_case.points.map((p) => p.text)];
  if ("failed_max" in exp) add(`verification failures <= ${exp.failed_max}`, det.summary.failed <= exp.failed_max, `${det.summary.failed} failed`);
  if ("missing_min" in exp) add(`missing items >= ${exp.missing_min}`, a.missing.length >= exp.missing_min, `${a.missing.length} listed`);
  if ("contradictions_min" in exp) add(`contradictions >= ${exp.contradictions_min}`, a.contradictions.length >= exp.contradictions_min, `${a.contradictions.length} found`);
  if ("integrity_notes_min" in exp) add(`integrity notes >= ${exp.integrity_notes_min}`, a.integrity_notes.length >= exp.integrity_notes_min, `${a.integrity_notes.length} noted`);
  if ("bear_case_points_min" in exp) add(`bear case points >= ${exp.bear_case_points_min}`, a.bear_case.points.length >= exp.bear_case_points_min, `${a.bear_case.points.length} points`);
  for (const p of exp.contradictions_must_mention || []) add(`contradictions mention /${p}/`, anyMatch(contraTexts, p));
  for (const p of exp.integrity_notes_must_mention || []) add(`integrity notes mention /${p}/`, anyMatch(a.integrity_notes, p));
  for (const p of exp.bear_case_must_mention || []) add(`bear case mentions /${p}/`, anyMatch(bearTexts, p));
  for (const p of exp.must_list_missing || []) add(`missing list includes /${p}/`, anyMatch(a.missing.map((m) => m.item + " " + m.why_it_matters), p));
  for (const p of exp.forbidden_in_claims || []) {
    const hit = claimTexts.find((t) => new RegExp(p, "i").test(t));
    add(`no dimension claim asserts /${p}/`, !hit, hit ? `found: "${hit}"` : "");
  }
  return checks;
}

async function judge(rec, det) {
  const stmts = [...statements(rec.assessment)];
  const blocks = stmts.map(({ id, where, stmt }) => {
    const cited = stmt.citations
      .map((c) => `   [${c.passage_id}] ${rec.passages[c.passage_id]?.text?.replace(/\n/g, " ") ?? "(no such passage)"}`)
      .join("\n");
    return `CLAIM ${id} (${where}; basis=${stmt.basis}): ${stmt.text}\n  cited passages:\n${cited || "   (none)"}`;
  });
  const msg = await client.messages
    .stream({
      model: MODELS.judge,
      max_tokens: 16000,
      system: JUDGE_SYSTEM,
      messages: [{ role: "user", content: `Company: ${rec.company.name}\n\n${blocks.join("\n\n")}\n\nReturn one verdict per claim id.` }],
      output_config: { effort: "high", format: { type: "json_schema", schema: JUDGE_SCHEMA } },
    })
    .finalMessage();
  const text = msg.content.find((b) => b.type === "text")?.text ?? "{}";
  const verdicts = new Map(JSON.parse(text).verdicts.map((v) => [v.claim_id, v]));
  const detById = new Map(det.results.map((r) => [r.id, r]));
  const rows = stmts.map(({ id, where, stmt }) => {
    const v = verdicts.get(id) || { verdict: "missing", reason: "judge returned no verdict" };
    return { id, where, text: stmt.text, basis: stmt.basis, deterministic: detById.get(id).status, verdict: v.verdict, reason: v.reason };
  });
  const n = (k) => rows.filter((r) => r.verdict === k).length;
  // The interesting cell: quote matched the source verbatim, yet the claim
  // is not what the source says. The string check cannot catch this.
  const quoteOkButUnsupported = rows.filter((r) => r.deterministic !== "failed" && r.verdict === "unsupported");
  return {
    model: MODELS.judge,
    counts: { supported: n("supported"), partial: n("partial"), unsupported: n("unsupported"), total: rows.length },
    quote_ok_but_unsupported: quoteOkButUnsupported,
    rows,
    usage: msg.usage,
  };
}

const slugs = fs.readdirSync(OUT_DIR).filter((d) => fs.existsSync(path.join(OUT_DIR, d, "assessment.json"))).sort();
const report = [];
for (const slug of slugs) {
  const rec = JSON.parse(fs.readFileSync(path.join(OUT_DIR, slug, "assessment.json"), "utf8"));
  const titles = Object.fromEntries(rec.sources.map((s) => [s.key, s.title]));
  const passageIndex = new Map(Object.entries(rec.passages).map(([id, p]) => [id, { id, ...p, title: titles[p.source] || p.source }]));
  const det = verifyAssessment(rec.assessment, passageIndex);
  const leaks = leakScan(rec.assessment);
  const expPath = path.join(EXAMPLES_DIR, slug, "expectations.json");
  const exp = fs.existsSync(expPath) ? JSON.parse(fs.readFileSync(expPath, "utf8")) : {};
  const expectations = expectationChecks(rec, exp, det);
  process.stdout.write(`${rec.company.name}: ${det.summary.statements} statements, ${det.summary.failed} failed, ${det.summary.warning} warnings, ${leaks.length} leakage hits, ${expectations.filter((c) => !c.pass).length}/${expectations.length} expectations missed`);
  let judged = null;
  if (!skipJudge) {
    judged = await judge(rec, det);
    process.stdout.write(`; judge: ${judged.counts.supported} supported / ${judged.counts.partial} partial / ${judged.counts.unsupported} unsupported`);
  }
  process.stdout.write("\n");
  report.push({ slug, company: rec.company.name, repairs: rec.repairs, first_pass: rec.first_pass_verification, deterministic: det.summary, deterministic_issues: det.results.filter((r) => r.status !== "verified"), leaks, expectations, expectation_note: exp.note, judge: judged });
}
fs.writeFileSync(path.join(OUT_DIR, "eval.json"), JSON.stringify(report, null, 2));

// Markdown report
const L = [];
L.push(`# Evaluation report`);
L.push(`_Generated ${new Date().toISOString().slice(0, 16).replace("T", " ")} UTC. Drafter: ${slugs.length ? JSON.parse(fs.readFileSync(path.join(OUT_DIR, slugs[0], "assessment.json"), "utf8")).model : "?"}. Judge: ${skipJudge ? "skipped" : MODELS.judge}._`);
L.push("");
L.push("| Company | Statements | Quote-verified | Warnings | Failed | Repair round | Judge supported | Judge partial | Judge unsupported | Leakage hits | Expectations |");
L.push("|---|---|---|---|---|---|---|---|---|---|---|");
for (const r of report) {
  const j = r.judge?.counts;
  L.push(`| ${r.company} | ${r.deterministic.statements} | ${r.deterministic.verified} | ${r.deterministic.warning} | ${r.deterministic.failed} | ${r.repairs ? `yes (${r.first_pass.failed} fixed)` : "no"} | ${j ? j.supported : "-"} | ${j ? j.partial : "-"} | ${j ? j.unsupported : "-"} | ${r.leaks.length} | ${r.expectations.filter((c) => c.pass).length}/${r.expectations.length} |`);
}
for (const r of report) {
  L.push("");
  L.push(`## ${r.company}`);
  if (r.expectation_note) L.push(`_${r.expectation_note}_`);
  L.push("");
  L.push("**Expectations**");
  for (const c of r.expectations) L.push(`- ${c.pass ? "PASS" : "MISS"}: ${c.name}${c.detail ? ` (${c.detail})` : ""}`);
  if (r.deterministic_issues.length) {
    L.push("");
    L.push("**Deterministic issues**");
    for (const i of r.deterministic_issues) L.push(`- ${i.id} ${i.status}: ${i.issues.map((x) => x.code + (x.numbers ? ` ${x.numbers.join(",")}` : "")).join(", ")}. "${i.text}"`);
  }
  if (r.leaks.length) {
    L.push("");
    L.push("**Decision-language hits**");
    for (const h of r.leaks) L.push(`- ${h.where}: "${h.match}" in "...${h.context}..."`);
  }
  if (r.judge) {
    L.push("");
    L.push(`**Judge (${r.judge.model})**: ${r.judge.counts.supported} supported, ${r.judge.counts.partial} partial, ${r.judge.counts.unsupported} unsupported of ${r.judge.counts.total}.`);
    const flagged = r.judge.rows.filter((x) => x.verdict !== "supported");
    for (const x of flagged) L.push(`- ${x.id} ${x.verdict} (string check: ${x.deterministic}): "${x.text}" — ${x.reason}`);
    if (r.judge.quote_ok_but_unsupported.length)
      L.push(`\nQuote matched verbatim but the judge rejected the claim in ${r.judge.quote_ok_but_unsupported.length} case(s). These are the failures a string check alone would miss.`);
  }
}
fs.writeFileSync(path.join(OUT_DIR, "eval-report.md"), L.join("\n"));
process.stdout.write(`\nwrote out/eval.json and out/eval-report.md\n`);
