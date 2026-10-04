#!/usr/bin/env node
// Draft an assessment for every example (or the slugs given as arguments),
// then suggest its fit and topic tags.
//   node assess.mjs                 all examples
//   node assess.mjs mesa-pay        one example
//   node assess.mjs --tags-only     re-suggest tags for the existing drafts, no redraft
import fs from "node:fs";
import path from "node:path";
import { MODELS } from "./lib/env.mjs";
import { listExamples, outDirFor } from "./lib/sources.mjs";
import { draftCompany } from "./lib/pipeline.mjs";
import { suggestTags, writeTags, readTags, FIT, TAGS } from "./lib/tags.mjs";

const args = process.argv.slice(2);
const tagsOnly = args.includes("--tags-only");
const named = args.filter((a) => !a.startsWith("--"));
const slugs = named.length ? named : listExamples();
const total = { input: 0, output: 0 };

async function tag(slug, record) {
  const ai = await suggestTags(record);
  writeTags(outDirFor(slug), { ai, person: readTags(outDirFor(slug))?.person || null });
  process.stdout.write(`  tags: ${FIT[ai.fit]}${ai.tags.length ? " · " + ai.tags.map((t) => TAGS[t.tag]).join(", ") : ""}\n`);
}

for (const slug of slugs) {
  if (tagsOnly) {
    const f = path.join(outDirFor(slug), "assessment.json");
    if (!fs.existsSync(f)) { process.stdout.write(`${slug}: not drafted, skipped\n`); continue; }
    process.stdout.write(`${slug}\n`);
    await tag(slug, JSON.parse(fs.readFileSync(f, "utf8")));
    continue;
  }
  const record = await draftCompany(slug, (e) => {
    if (e.step === "split") process.stdout.write(`\n${slug}: ${e.message}\n`);
    else if (e.step === "repair") for (const f of e.failures) process.stdout.write(`    - ${f.where}: "${f.quote.slice(0, 70)}" ${f.reason} (${f.passage_id})\n`);
    else if (e.step !== "draft") process.stdout.write(`  ${e.step}: ${e.message}\n`);
  });
  total.input += record.usage.input;
  total.output += record.usage.output;
  await tag(slug, record);
}
if (!tagsOnly) process.stdout.write(`\nTokens: ${total.input.toLocaleString()} in, ${total.output.toLocaleString()} out (${MODELS.drafter})\n`);
