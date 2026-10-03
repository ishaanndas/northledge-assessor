#!/usr/bin/env node
// Draft an assessment for every example (or the slugs given as arguments).
//   node assess.mjs            all examples
//   node assess.mjs mesa-pay   one example
import { MODELS } from "./lib/env.mjs";
import { listExamples } from "./lib/sources.mjs";
import { draftCompany } from "./lib/pipeline.mjs";

const slugs = process.argv.slice(2).length ? process.argv.slice(2) : listExamples();
const total = { input: 0, output: 0 };
for (const slug of slugs) {
  const record = await draftCompany(slug, (e) => {
    if (e.step === "split") process.stdout.write(`\n${slug}: ${e.message}\n`);
    else if (e.step === "repair") for (const f of e.failures) process.stdout.write(`    - ${f.where}: "${f.quote.slice(0, 70)}" ${f.reason} (${f.passage_id})\n`);
    else if (e.step !== "draft") process.stdout.write(`  ${e.step}: ${e.message}\n`);
  });
  total.input += record.usage.input;
  total.output += record.usage.output;
}
process.stdout.write(`\nTokens: ${total.input.toLocaleString()} in, ${total.output.toLocaleString()} out (${MODELS.drafter})\n`);
