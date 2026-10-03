// The drafting pipeline as a function, shared by the CLI (assess.mjs) and the
// app server (serve.mjs). Draft, verify, one repair round, annotate, write.
import fs from "node:fs";
import path from "node:path";
import Anthropic from "@anthropic-ai/sdk";
import { loadEnv, MODELS } from "./env.mjs";
import { loadExample, renderSources, outDirFor } from "./sources.mjs";
import { ASSESSMENT_SCHEMA } from "./schema.mjs";
import { DRAFTER_SYSTEM, drafterUserMessage, repairMessage } from "./prompts.mjs";
import { verifyAssessment, annotate, hardFailures } from "./verify.mjs";
import { toMarkdown } from "./markdown.mjs";

loadEnv();
let client;
const getClient = () => (client ??= new Anthropic());

async function draft(messages) {
  const stream = getClient().messages.stream({
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

const sumUsage = (u) => ({
  input: u.input_tokens + (u.cache_read_input_tokens || 0) + (u.cache_creation_input_tokens || 0),
  output: u.output_tokens,
});

// onProgress receives {step, message, ...data} events as the run advances.
export async function draftCompany(slug, onProgress = () => {}) {
  const t0 = Date.now();
  const ex = loadExample(slug);
  ex.rendered = renderSources(ex);
  const passages = ex.sources.reduce((n, s) => n + s.passages.length, 0);
  onProgress({ step: "split", message: `${ex.sources.length} sources split into ${passages} passages`, sources: ex.sources.map((s) => ({ key: s.key, passages: s.passages.length })) });

  onProgress({ step: "draft", message: `Drafting with ${MODELS.drafter}` });
  const messages = [{ role: "user", content: drafterUserMessage(ex) }];
  let { msg, assessment } = await draft(messages);
  const usage = sumUsage(msg.usage);
  let verification = verifyAssessment(assessment, ex.passageIndex);
  const firstPass = { ...verification.summary };
  onProgress({ step: "verify", message: `${verification.summary.statements} statements, ${verification.summary.failed} failed verification`, summary: verification.summary });

  const failures = hardFailures(verification);
  let repairs = 0;
  if (failures.length) {
    onProgress({ step: "repair", message: `Repair round for ${failures.length} citation${failures.length === 1 ? "" : "s"}`, failures });
    messages.push({ role: "assistant", content: msg.content });
    messages.push({ role: "user", content: repairMessage(failures) });
    ({ msg, assessment } = await draft(messages));
    const u = sumUsage(msg.usage);
    usage.input += u.input;
    usage.output += u.output;
    verification = verifyAssessment(assessment, ex.passageIndex);
    repairs = 1;
    onProgress({ step: "reverify", message: `${verification.summary.statements} statements, ${verification.summary.failed} still failed`, summary: verification.summary });
  }

  annotate(assessment, verification);
  const record = {
    slug,
    company: ex.company,
    generated_at: new Date().toISOString().slice(0, 16).replace("T", " ") + " UTC",
    model: MODELS.drafter,
    usage,
    seconds: Math.round((Date.now() - t0) / 1000),
    repairs,
    first_pass_verification: firstPass,
    first_pass_failures: failures,
    verification_summary: verification.summary,
    sources: ex.sources.map((s) => ({ key: s.key, title: s.title, passages: s.passages.length })),
    passages: Object.fromEntries([...ex.passageIndex].map(([id, p]) => [id, { source: p.source, text: p.text }])),
    assessment,
    verification: verification.results,
  };
  const dir = outDirFor(slug);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "assessment.json"), JSON.stringify(record, null, 2));
  fs.writeFileSync(path.join(dir, "assessment.md"), toMarkdown(record));
  onProgress({ step: "done", message: `Wrote ${path.relative(process.cwd(), dir)}/assessment.{json,md} in ${record.seconds}s`, record });
  return record;
}
