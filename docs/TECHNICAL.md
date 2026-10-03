# Technical writeup

How the prototype is built, why it is built that way, what it measured, and what a production version would change. Read `README.md` first for how to run it; this document assumes you have.

## 1. System overview

```
examples/<slug>/
  company.json              name, one-liner, round, design note
  expectations.json         known-answer checks for the eval
  sources/01-deck.md ...    the inputs, as text

        │ lib/sources.mjs          split into passages: deck:1 ... call-notes:9
        ▼
assess.mjs ──► Claude Opus 5 (structured output, effort high, streaming)
        │  lib/prompts.mjs system prompt · lib/schema.mjs JSON schema
        ▼
lib/verify.mjs               deterministic: passage exists · quote verbatim · ≤30 words · numbers present
        │  hard failures? ──► one repair turn with the failures listed ──► re-verify
        ▼
out/<slug>/assessment.json   record: company, model, usage, passages, assessment (annotated), verification results
out/<slug>/assessment.md     the document an associate would edit

eval.mjs ──► re-verify from the record · Claude Sonnet 5 judge · leakage scan · expectations ──► out/eval.json, out/eval-report.md
report.mjs ──► out/index.html   static reader with embedded data and click-through provenance
selftest.mjs                    plants four defects in a real record, confirms the verifier catches them
serve.mjs                       static file server for out/ on port 4950
```

About 930 lines of JavaScript across nine files. One dependency, the Anthropic SDK. Node 20 or later, ES modules, no build step.

## 2. Repository layout

| Path | Role |
|---|---|
| `assess.mjs` | Drafting pipeline. One company per iteration; writes the record. |
| `eval.mjs` | Evaluation. Reads records, never the pipeline's in-memory state. |
| `report.mjs` | Builds the reader. Pure function of `out/`. |
| `selftest.mjs` | Mutation test for the verifier. |
| `serve.mjs` | Static server. |
| `lib/env.mjs` | `.env` loader, project root, model ids (`DRAFTER_MODEL`, `JUDGE_MODEL` env overrides). |
| `lib/sources.mjs` | Example loading, passage splitting, rendering for the model. |
| `lib/schema.mjs` | The assessment JSON schema. |
| `lib/prompts.mjs` | Drafter system prompt, repair message, judge prompt and schema. |
| `lib/verify.mjs` | Normalization, number extraction, verification, annotation, failure formatting. |
| `lib/markdown.mjs` | Record to markdown. |
| `examples/` | Four companies, each with sources and expectations. |
| `out/` | Committed outputs of the 3 October 2026 run. |
| `BRIEF.md`, `docs/` | Product brief, PRD, this document, evaluation. |

## 3. Data model

**Source.** A markdown file. The filename's numeric prefix orders it; the remainder is the citation key (`01-deck.md` becomes `deck`). The first `# ` heading is the source title, which is shown to the model in the source header and counted as evidence for the number check (dates and durations tend to live there).

**Passage.** A blank-line separated block within a source, after dropping the title line. A heading-only block (`## Slide 3: Traction`) is folded into the block that follows it. Passages are numbered from 1 within each source; the id is `key:n`. Paragraph granularity was chosen over sentence granularity because a sentence-level id makes the model's citing job fussier without making the verification stronger: the verbatim quote already pins the span inside the passage.

**Rendered input.** What the model reads:

```
=== SOURCE "deck" (Mesa Pay — Seed Deck (August 2026)) ===
[deck:1] Slide 1: Small exporters are locked out of modern payments There are 1.2 million ...

[deck:2] Slide 2: Product A multi-currency receiving account ...
```

**Assessment.** The object in `lib/schema.mjs`. The shape is described in the PRD section 8. Two design points worth noting in the schema itself: `additionalProperties: false` everywhere so the model cannot add a `score` field even if it wanted to, and the `basis` enum (`stated`, `derived`, `absence`) so the reader can tell a quotation from an inference from an argument about a gap.

**Record** (`out/<slug>/assessment.json`). Everything the eval and the reader need without re-reading the examples: company metadata, timestamp, model, repair count, first-pass and final verification summaries, the first-pass failures, the source list, every passage keyed by id, the annotated assessment, and the per-statement verification results. The eval deliberately reads only this file so it can be run on records produced elsewhere.

**Verification result.** Per statement: id (`d2.c1` for dimension 2 claim 1, `x3` for contradiction 3, `b0` for bear point 0), location, text, basis, per-citation status, overall status (`verified`, `warning`, `failed`) and an issues list with codes.

## 4. The drafting call

```js
client.messages.stream({
  model: "claude-opus-5",
  max_tokens: 32000,
  system: DRAFTER_SYSTEM,
  messages,
  output_config: { effort: "high", format: { type: "json_schema", schema: ASSESSMENT_SCHEMA } },
});
const msg = await stream.finalMessage();
```

Choices and reasons:

- **Opus 5** as the drafter. The task is judgment-heavy (what is the real objection, what is the primary source) and runs 150 times a month, so the cost difference against a smaller model is a rounding error next to associate time. The drafter and the judge are deliberately different models (section 7).
- **Structured output** with a raw JSON schema rather than a tool call or free text with a parser. The schema is the contract between the model, the verifier, the eval and the reader, and the API guarantees conformance. No Zod dependency; the schema object is plain JSON.
- **Effort high, thinking left at the model's default (adaptive).** The task benefits from reasoning about source conflicts. Thinking display is omitted; the reasoning is not shown and not stored.
- **Streaming** with `finalMessage()` because the output is long (8k to 14k tokens) and a non-streaming request risks the HTTP timeout. Nothing is rendered incrementally.
- **No tools, no web access.** The evidence universe is closed by construction. This is a product principle (PRD P1) implemented as the absence of a feature.
- **Stop reasons are checked.** `refusal` and `max_tokens` both throw rather than silently producing a partial draft.

## 5. Verification

`lib/verify.mjs` is pure string processing. The important functions:

**`normalize(s)`**: lowercase; curly quotes to straight; en, em and minus dashes to hyphen; strip `* _ \` # >` (markdown marks); collapse whitespace; trim. Both the quote and the passage go through it, so a quote that differs only in typographic quotes or line wrapping still matches. A quote that paraphrases does not.

**`extractNumbers(text)`**: finds numeric tokens with optional thousands separators, decimals and a `k`, `M`, `B`, `million`, `billion` suffix, and returns both the scaled value and the bare figure. So `$38k` in a claim matches `$38,000` in a passage, and `118%` matches `118%`. Years, counts and percentages are all just numbers to this function.

**`verifyAssessment(assessment, passageIndex)`** walks every cited statement and records issues:

| Code | Hard? | Meaning |
|---|---|---|
| `no_citation` | yes | The statement has no citations at all. |
| `missing_passage` | yes | The cited id does not exist. |
| `quote_not_found` | yes | The normalized quote is not a substring of the normalized passage. |
| `quote_too_long` | no | Over 30 words. Still matched, but the model is over-quoting. |
| `number_not_in_evidence` | no | A number in the claim text appears in none of the cited passages or their source titles. Skipped for `derived` statements, which are allowed to compute. |

A statement with any hard issue is `failed`; with only soft issues `warning`; otherwise `verified`. The summary counts are what the reader shows.

**Why verbatim and not fuzzy.** A fuzzy match (token overlap, edit distance) would let a paraphrase pass, and a paraphrase is exactly where meaning drifts. The cost of strictness is that a correct claim with a slightly wrong quote fails verification; the repair round exists for that case and the failure is visible if it persists. On the run described in `docs/EVALUATION.md`, strictness produced no false failures that survived repair.

**Why numbers get a soft check.** Numbers are where misattribution does the most damage, but the check cannot distinguish "the model invented 24%" from "the model wrote 24% that it correctly computed from 110,000 over 38,000 times twelve". The `derived` basis is the model's declaration that it computed; the check trusts the declaration and the judge verifies the arithmetic.

## 6. The repair round

If verification produces any hard failure, `assess.mjs` appends the model's full previous turn (including its thinking blocks, unchanged, as the API requires) and a user message listing each failure with the statement, the cited id, the quote and the reason. The model must return a complete assessment again and is told to fix the quote, re-cite a passage that actually contains the support, or remove the claim, and not to make claims vaguer to pass.

Exactly one round. A loop until clean would optimize for passing the string check, which is a worse objective than being precise. After the round, whatever still fails is marked and shipped.

On the 3 October run the round fired on one draft of five (the second Harbor Health draft): three quotes that paraphrased instead of copying. All three were fixed. The failures are stored in the record (`first_pass_failures`) from this run forward.

## 7. Evaluation architecture

The eval is a separate program with its own entry point and no shared in-memory state with the pipeline. Design rules:

- **Re-verify from the record.** The eval rebuilds the passage index from `assessment.json` and runs the verifier again rather than trusting the statuses the pipeline wrote. If the pipeline had a bug that marked everything verified, the eval would still catch it.
- **A different model as judge.** Sonnet 5 reads every statement with the full text of its cited passages (not just the quote) and returns `supported`, `partial` or `unsupported` with a one-line reason. One call per company, all statements batched, structured output. The judge is instructed to be strict about numbers and about words that carry more than the source does ("led", "partnered", "customers"), to check arithmetic on `derived` statements, and to treat `absence` statements as supported when the cited passage is the closest the sources come and does not contain the thing. The judge is also a language model and can be wrong; its verdicts are reported with reasons so a human can disagree.
- **The interesting cell is "quote verified, judge unsupported or partial".** That is the failure a string check cannot see, and the eval reports it as its own list.
- **Decision-language scan.** Regular expressions over the summary, dimension findings, claims and bear thesis for recommendation, verdict, probability and superlative language. Integrity notes and contradictions are excluded because they legitimately quote the inputs (the planted "85% probability of success" lives there).
- **Known-answer expectations.** A small JSON per example written when the trap was designed: minimum counts (contradictions, missing items, integrity notes, bear points), regexes that must appear in contradictions, integrity notes, the bear case or the missing list, and regexes that must not appear in dimension claims. The forbidden-claim regexes are attribution-aware: "The deck states Marsh led perception at Tesla" is correct behaviour and must not be penalized, so the pattern excludes statements that attribute ("deck", "states", "claims", "presents" and so on).
- **Self-test.** `selftest.mjs` copies a real record, plants a fabricated quote, a nonexistent passage id, an altered number and a stripped citation, and confirms the verifier reports each. It is the test that the test works.

Full method, results and limitations are in `docs/EVALUATION.md`.

## 8. The reader

`report.mjs` writes one static HTML file with the records and the eval results embedded as JSON. No server-side rendering, no framework, no network calls apart from web fonts. The client script renders the navigation, the document and the provenance pane from the embedded data.

The provenance highlight mirrors the server's normalizer: it builds the normalized passage character by character while recording a map from each normalized index back to the raw index, finds the normalized quote, and marks the raw span. The first version walked the two strings in parallel and drifted by the number of collapsed whitespace characters; the fix was the explicit index map. A check over all 246 citations in the committed run finds every quote.

Layout is three columns (companies, document, sources) above 1100px, two columns with a slide-in sources pane below, and a single column on phones. Design tokens (paper background, serif headings, gold accent for provenance) were borrowed from an earlier legal-drafting prototype that solved the same reader problem for contract clauses.

The page is labelled "Draft for partner review · not a recommendation" on every company. The automated-checks strip at the bottom of each draft shows the eval's counts and the judge's flagged statements with reasons.

## 9. Measured performance (3 October 2026 run)

| Stage | Per company | Notes |
|---|---|---|
| Drafting latency | 90 to 125 seconds | Opus 5, effort high, 8k to 14k output tokens |
| Drafting tokens | 4k to 6k in, 8k to 12k out | Input is small because the evidence universe is closed |
| Repair round, when it fires | about 60 seconds, 10k in, 5k out | Replays the first turn |
| Judge latency | 50 to 70 seconds | Sonnet 5, one batched call |
| Judge tokens | about 9k in, 5k out | |
| Cost per company | roughly $0.30 to $0.45 draft, about $0.07 judge | Opus 5 at $5 / $25 per million; Sonnet 5 at $2 / $10 |
| Full `npm start` | about 10 to 12 minutes, about $1.60 | Four companies, sequential |

At 150 companies a month, model spend is on the order of $60 to $80 a month. Companies could be drafted in parallel or through the Batch API overnight; neither was worth the complexity for the prototype.

## 10. Failure modes observed and what was done

| Observed | Where | Response |
|---|---|---|
| Quotes that paraphrase rather than copy | Harbor Health second draft, 3 of 33 statements | Repair round fixed all three. Kept as evidence that the round is needed. |
| Interpretation on top of a true quote ("the only differentiator", "can lapse without notice") | 8 of 182 statements across all four, half in bear cases | Not caught by the verifier, caught by the judge. Judge moves into the pipeline in v2 as a second status. |
| Number check flagged dates and call durations | Harbor Health first draft, 2 statements | Source titles counted as evidence. |
| Eval regex penalized correctly attributed claims | Quill Robotics expectations | Attribution-aware patterns. |
| Reader highlight offset | All citations | Index-map rewrite; verified over all 246 citations. |
| Em dash in model prose | One Mesa Pay bear point | Not a correctness issue; a style instruction would remove it. Left as is to keep the committed run honest. |

Not observed on this run, but designed for: fabricated quotes, citations to nonexistent passages, numbers absent from evidence, claims without citations (all exercised by the self-test); instruction-following from inputs; recommendation or probability language.

## 11. Security and trust posture

- **Prompt injection.** Inputs are rendered as data under a system prompt that says so and tells the model to report steering attempts. The model has no tools, so an injection cannot cause an action, only a biased draft, and the adversarial example tests for that. This is defence by design plus testing, not a guarantee; new inputs should be red-teamed periodically.
- **No external calls from the model.** No web search, no fetch, no MCP. The only network traffic is the Messages API.
- **Secrets.** The API key is read from `.env`, which is gitignored. Nothing else is secret.
- **Data handling.** Inputs are sent to the model provider; retention is governed by the fund's API agreement. Outputs are written to the local filesystem only. A production version would store records in the fund's own database with access control.
- **Auditability.** Every record carries the model id, token usage, the verification results and the first-pass failures. The eval report is reproducible from records alone.

## 12. Extending the prototype

- **Add a company.** Create `examples/<slug>/company.json` and `sources/NN-key.md` files. Optionally `expectations.json`. Run `node assess.mjs <slug>`.
- **Add a source type.** Any markdown file in `sources/` works; the citation key is the filename after the number. Nothing else needs to change.
- **Change models.** `DRAFTER_MODEL` and `JUDGE_MODEL` environment variables. Keep them different.
- **Add a dimension or change the shape.** Edit `lib/schema.mjs` and the dimension list in `lib/prompts.mjs`. The verifier, markdown and reader walk the schema generically; only the reader's section headings are hard-coded.
- **Add a verification rule.** Add an issue code in `verifyAssessment`, mark it hard or soft. Hard codes trigger repair and need a reason string in `hardFailures`.
- **Add an eval check.** Expectations support count minimums and regex presence or absence per section; new field types go in `expectationChecks` in `eval.mjs`.

## 13. Path to production

What changes when this becomes a service rather than a script.

- **Ingestion.** PDF decks through text extraction with page-level ids (`deck p.4` reads better to a partner than `deck:7`), website capture with hidden-element text preserved (the adversarial example shows why), transcript import for call recordings. This is the largest piece of work and the least interesting.
- **Storage.** Postgres tables for companies, sources, passages, drafts, statements, citations, verification results, associate edits and partner decisions. The record format in `out/` maps onto this directly.
- **Judge in the pipeline.** Run the judge after verification and store its verdict as a second status per statement, labelled distinctly ("quote verified; support: partial"). Do not let it delete statements; the associate decides.
- **Reader as a hosted app.** Same static reader behind the fund's SSO, reading from the database. Claim-level accept, edit and reject with an edit log.
- **Operations.** A run log and a dashboard for the weekly audit: accuracy by source type, repair frequency, judge partials, decision-language hits, per-associate draft survival.
- **Cost and throughput.** Parallel drafting; Batch API for overnight runs of the week's pipeline at half price; prompt caching is irrelevant because the per-company input is small and unique.
- **Outcome log.** From day one, join every draft to the partners' decision and, later, to the company's outcome. The year-later evaluation in `docs/EVALUATION.md` depends on this existing.

## 14. Known limitations

- Four author-written examples. The examples were written by the same person who wrote the prompt, in one session. They exercise the designed failure modes and nothing else.
- One run. Model output varies between runs; the committed numbers are one sample, not a distribution.
- The judge is a language model. Its partials are plausible on reading, but it has not been audited against a human.
- Paragraph passages are coarse for long documents. A ten-page memo would produce passages that are too big for a quote to pin meaningfully; sentence or page sub-ids would be needed.
- The number check is lexical. It will miss a number written as a word and will match a coincidental equal number.
- The reader is read-only and the markdown is the editing surface. Edits are not tracked.
- Em dashes appear in model prose occasionally. A style rule in the prompt would remove them; it was not added so the committed outputs match the committed prompt.

## 15. Testing

What exists: the mutation self-test for the verifier, the eval as an end-to-end check, and the known-answer expectations as regression tests for the four examples. What a production version needs and this prototype lacks: unit tests for the splitter and normalizer edge cases (Windows line endings, nested headings, markdown tables), snapshot tests of the rendered input, a regression set that grows with every incident from the weekly audit, and a variance run (the same company drafted five times) to measure how stable the claims, contradictions and bear case are.
