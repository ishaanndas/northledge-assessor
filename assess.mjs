#!/usr/bin/env node
// Draft an assessment for every example (or the slugs given as arguments).
//   node assess.mjs            all examples
//   node assess.mjs mesa-pay   one example
import fs from "node:fs";
import path from "node:path";
import Anthropic from "@anthropic-ai/sdk";
import { loadEnv, MODELS } from "./lib/env.mjs";
import { listExamples, loadExample, renderSources, OUT_DIR } from "./lib/sources.mjs";
import { ASSESSMENT_SCHEMA } from "./lib/schema.mjs";
import { DRAFTER_SYSTEM, drafterUserMessage, repairMessage } from "./lib/prompts.mjs";
import { verifyAssessment, annotate, hardFailures } from "./lib/verify.mjs";
import { toMarkdown } from "./lib/markdown.mjs";

loadEnv();
const client = new Anthropic();
const slugs = process.argv.slice(2).length ? process.argv.slice(2) : listExamples();

async function draft(messages) {
  const stream = client.messages.stream({
    model: MODELS.drafter,
    max_tokens: 32000,
    system: DRAFTER_SYSTEM,
    messages,
    output_config: { effort: "high", format: { type: "json_schema", schema: ASSESSMENT_SCHEMA } },
  });
  const msg = await stream.finalMessage();
  if (msg.stop_reason === "refusal") throw new Error(`Model refused: ${msg.stop_details?.explanation ?? ""}`);
  if (msg.stop_reason === "max_tokens") throw new Error("Hit max_tokens; raise the limit");
  const text = msg.content.find((b) => b.type === "text")?.text ?? "";
  return { msg, assessment: JSON.parse(text) };
}

const usageTotal = { input: 0, output: 0 };
function addUsage(u) {
  usageTotal.input += u.input_tokens + (u.cache_read_input_tokens || 0) + (u.cache_creation_input_tokens || 0);
  usageTotal.output += u.output_tokens;
}

for (const slug of slugs) {
  const t0 = Date.now();
  const ex = loadExample(slug);
  ex.rendered = renderSources(ex);
  const passages = ex.sources.reduce((n, s) => n + s.passages.length, 0);
  process.stdout.write(`\n${ex.company.name} (${slug}): ${ex.sources.length} sources, ${passages} passages\n`);

  const messages = [{ role: "user", content: drafterUserMessage(ex) }];
  let { msg, assessment } = await draft(messages);
  addUsage(msg.usage);
  let verification = verifyAssessment(assessment, ex.passageIndex);
  let repairs = 0;
  let firstPass = { ...verification.summary };
  process.stdout.write(`  draft: ${verification.summary.statements} statements, ${verification.summary.failed} failed verification\n`);

  const failures = hardFailures(verification);
  if (failures.length) {
    for (const f of failures) process.stdout.write(`    - ${f.where}: "${f.quote.slice(0, 70)}" ${f.reason} (${f.passage_id})\n`);
    // One repair round. The model sees exactly which quotes did not match and
    // must fix the citation or drop the claim. It never gets a third try.
    messages.push({ role: "assistant", content: msg.content });
    messages.push({ role: "user", content: repairMessage(failures) });
    ({ msg, assessment } = await draft(messages));
    addUsage(msg.usage);
    verification = verifyAssessment(assessment, ex.passageIndex);
    repairs = 1;
    process.stdout.write(`  repair: ${verification.summary.statements} statements, ${verification.summary.failed} still failed\n`);
  }

  annotate(assessment, verification);
  const record = {
    slug,
    company: ex.company,
    generated_at: new Date().toISOString().slice(0, 16).replace("T", " ") + " UTC",
    model: MODELS.drafter,
    repairs,
    first_pass_verification: firstPass,
    first_pass_failures: failures,
    verification_summary: verification.summary,
    sources: ex.sources.map((s) => ({ key: s.key, title: s.title, passages: s.passages.length })),
    passages: Object.fromEntries([...ex.passageIndex].map(([id, p]) => [id, { source: p.source, text: p.text }])),
    assessment,
    verification: verification.results,
  };
  const dir = path.join(OUT_DIR, slug);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "assessment.json"), JSON.stringify(record, null, 2));
  fs.writeFileSync(path.join(dir, "assessment.md"), toMarkdown(record));
  process.stdout.write(`  wrote out/${slug}/assessment.{json,md} in ${((Date.now() - t0) / 1000).toFixed(0)}s\n`);
}
process.stdout.write(`\nTokens: ${usageTotal.input.toLocaleString()} in, ${usageTotal.output.toLocaleString()} out (${MODELS.drafter})\n`);
