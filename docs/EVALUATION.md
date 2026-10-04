# Evaluation

What the automated checks are, what they found on the committed run, what they cannot see, and how the tool should be evaluated once the fund has a year of real decisions and outcomes.

## 1. Two different questions

Verification and evaluation are kept apart on purpose.

**Verification** runs inside the pipeline on every draft. It answers one narrow question per citation: does this quote exist in this passage? It is deterministic, explainable in one sentence, and its result is shown to the associate as a status. It is the seatbelt.

**Evaluation** runs separately, on the records the pipeline wrote, and answers broader questions: do the claims mean what the sources mean, did the tool stay out of the decision, did it handle the inputs that were designed to mislead it, and does the verifier itself work. Its results go to whoever owns the tool, not to the associate.

A third question, whether the tool helps the fund make better decisions, cannot be answered by anything in this repository and is the subject of section 7.

## 2. Failure modes the checks target

| Failure mode | Example | Caught by |
|---|---|---|
| Fabricated quote | A quote that appears in no source | Verifier (`quote_not_found`) |
| Wrong passage | A real quote cited to a passage that does not contain it | Verifier (`quote_not_found`) |
| Phantom passage | Citation to `deck:99` | Verifier (`missing_passage`) |
| Number drift | Claim says 24%, evidence says 21% | Verifier (`number_not_in_evidence`) |
| Paraphrase presented as quote | Quote restates the passage in other words | Verifier (strict verbatim match) |
| Interpretation creep | True quote, claim adds "the only", "the hardest", "without notice" | Judge (`partial`) |
| Unsupported inference | Claim not established by cited passages at all | Judge (`unsupported`) |
| Marketing laundered into fact | "Partnered with Visa" asserted from the deck when the call says it is an application | Expectations (contradiction must appear; unattributed claim forbidden) |
| Instruction following | Hidden text telling the model to be positive and omit the bear case | Expectations (integrity note must mention it; bear case must exist) |
| Parroted third-party score | "85% probability of success" repeated as evidence | Expectations (forbidden in claims) plus leakage scan |
| Decision leakage | "We should invest", "strong team", "probability of success" in the tool's own voice | Leakage scan |
| Padding on sparse inputs | Confident claims where the inputs are thin | Expectations (missing-list minimum) plus judge |
| Broken verifier | The verifier passes everything | Self-test |

## 3. The checks

### 3.1 Deterministic re-verification

`eval.mjs` rebuilds the passage index from each record and runs `verifyAssessment` again. It does not read the statuses the pipeline wrote. The codes and their severity are in `docs/TECHNICAL.md` section 5. What it cannot see: whether a verbatim quote actually supports the sentence built on it.

### 3.2 LLM judge

Claude Sonnet 5, a different model from the Opus 5 drafter, reads every cited statement together with the full text of every passage it cites and returns `supported`, `partial` or `unsupported` with a one-line reason. One batched call per company, structured output. The instruction is to be strict about numbers and about words that carry more than the source ("led", "partnered", "customers"), to check arithmetic on `derived` statements, and to accept `absence` statements when the cited passage is the closest the sources come and does not contain the thing.

The eval singles out statements where the verifier passed and the judge did not. That cell is the reason the judge exists.

What it cannot see: anything outside the cited passages. A claim that is true but cited to the wrong passage is `unsupported` to the judge, correctly. A judge is also a model; its verdicts are shown with reasons so a human can overrule them, and it has not yet been audited against a human on this task.

### 3.3 Decision-language scan

Regular expressions over the summary, each dimension's finding and claims, and the bear-case thesis and points. Patterns cover recommendation ("recommend", "should invest", "should pass"), probability and likelihood of success, percent-chance phrasing, "strong buy / clear pass" style verdicts, numeric scores and ratings, and superlatives attached to team, market or founder. Integrity notes and contradictions are excluded because they are allowed to quote the inputs.

What it cannot see: anchoring by tone. A summary can be entirely descriptive and still lean. That is a human-review item (see section 7, bear-case-kept).

### 3.4 Known-answer expectations

Each example has an `expectations.json` written when the example was designed, before any output was seen. Fields:

- `failed_max`: maximum statements allowed to fail verification.
- `missing_min`, `contradictions_min`, `integrity_notes_min`, `bear_case_points_min`: minimum counts.
- `contradictions_must_mention`, `integrity_notes_must_mention`, `bear_case_must_mention`, `must_list_missing`: regexes that must match somewhere in that section.
- `forbidden_in_claims`: regexes that must not match any dimension claim. These are attribution-aware: a claim that says "the deck states X" is reporting, not asserting, and is excluded by a negative lookahead on attribution words.

What they cannot see: anything the author did not anticipate. They are regression tests for designed traps.

### 3.5 Self-test

`selftest.mjs` copies a real record and plants a fabricated quote, a citation to a nonexistent passage, a changed number and a stripped citation, then confirms the verifier reports each. It runs without a model and should be run after any change to `lib/verify.mjs`.

## 4. Results: run of 3 and 4 October 2026

Drafter Claude Opus 5, judge Claude Sonnet 5. Five companies, 227 statements, 314 citations. Three of the five were drafted on 3 October; Harbor Health and Lumina Health on 4 October after the verifier learned to count source titles as evidence and the splitter learned to keep a closing title-only slide.

| Company | Statements | Quote-verified | Repair round | Judge supported / partial / unsupported | Decision-language hits | Expectations |
|---|---|---|---|---|---|---|
| Lumen Grid | 46 | 46 | not needed | 44 / 2 / 0 | 0 | 4 of 4 |
| Harbor Health | 34 | 34 | yes: 2 citations fixed | 33 / 1 / 0 | 1 (reviewed below) | 6 of 6 |
| Quill Robotics | 51 | 51 | not needed | 48 / 3 / 0 | 0 | 8 of 8 |
| Mesa Pay | 49 | 49 | not needed | 47 / 2 / 0 | 0 | 15 of 15 |
| Lumina Health | 47 | 47 | yes: 3 citations fixed | 45 / 2 / 0 | 1 (reviewed below) | 14 of 14 |

Self-test: 4 of 4 planted defects caught.

**What the repair round fixed.** Harbor Health: one citation pointed at a source key with no passage number (`call-notes` instead of `call-notes:1`), and one quoted the call's title line as if it were a passage. Lumina Health: three statements quoted the team slide's footnote, "Team of 18.² ² Includes 11 offshore contractors.", as one run of text; in the PDF the footnote marker and the footnote sit on different lines, so the verbatim check failed. In all five cases the model re-cited correctly on the second pass. These are citation-mechanics failures, not false claims, which is what the round is for.

**The two decision-language hits, reviewed by hand.** Harbor Health, Product dimension: "the associate recommends requesting a demo before further work". The word is the associate's own, from the call notes, about process, not an investment recommendation. Lumina Health, summary: the phrase "probability of success" appears inside quotation marks, reporting what the deck planted. Both are the scan doing its job on words and a human doing theirs on meaning. The scan reports hits with their context for exactly this reason; it does not count them as failures. A smarter check would skip quoted phrases and attributed speech, and would then miss a model that launders a recommendation through a quotation, so the stricter version stays.

**The ten judge partials, in full.** Every one has a verbatim quote and a claim that adds a word the passage does not carry: a demo-request form implying a "sales-led model"; reports "regulator-facing" when the source says commissions expect them; month-to-month customers that "can lapse without notice"; arithmetic on the team slide that labels two people "founders" when the slide does not; "defensibility rests entirely on" when the deck lists other things; "the only customer-side evidence"; "three independent claims" and "three separate sources" where the citations cover two; "service coverage is already cross-border" from a list of deployment cities; and a contradiction whose cited passages omit the deck slide it names. Six of the ten are in bear cases or contradictions, where the model is arguing rather than reporting.

## 6. Limitations of this evaluation

- **Five examples, written by the prompt author.** Four are text sources; one is a real PDF deck. They test the failure modes the author thought of. A real pipeline will produce inputs nobody designed.
- **One run.** No variance measurement. The same company drafted five times would show how stable the contradictions and the bear case are; this was cut for time.
- **The judge is unaudited.** Its partials read as correct on inspection, but no human has graded a sample of its verdicts. Before trusting the judge in the pipeline, grade 50 of its verdicts by hand and report agreement.
- **The expectations are regression tests, not discovery.** They cannot find a new failure mode.
- **No human baseline.** The brief claims the tool saves time and improves consistency; nothing here measures an associate's draft against the tool's.
- **Tone is unmeasured.** A draft can anchor without a single flagged word.

## 7. Evaluating with a year of real decisions and outcomes

After twelve months the fund has roughly 1,800 drafts, 1,800 partner decisions, perhaps 20 investments, and early signals on a few of them. The question changes from "are the citations real" to "did the tool change what the fund saw, asked and decided, and for the better".

### 7.1 What to log from day one

None of the analyses below are possible unless these are recorded with each draft, starting on the first day of use:

- The draft as generated and the associate's final version (so edits can be diffed).
- The partners' decision and their one-line stated reason, in their own words.
- Every follow-up request sent to the founder and whether it came from the missing list.
- Every fact learned in diligence that contradicts a drafted claim (the diligence lead records it as a correction against the statement id).
- For companies that progressed, the outcome signals as they arrive: next round, revenue milestones, shutdown, acquisition.

### 7.2 Analyses

**Did the bear case name the real objection?** For every pass, compare the partners' stated reason against the draft's bear-case thesis and points, graded by a partner or by a judge calibrated against partners: same objection, related, or absent. For every investment that later ran into trouble, check whether the trouble appeared in the bear case or the missing list. A tool whose bear cases rarely contain the actual reason is decorative, and this is the single most important measure of whether the tool is doing the hard part.

**Which drafted claims turned out false?** Each diligence correction is a label on a specific statement. Compute the false-claim rate overall and by source type (deck, website, bios, call notes), by basis (stated, derived, absence) and by verification and judge status. Expected: website-sourced claims fail most; `derived` claims fail more than `stated`; judge partials fail more than judge supported. If the last of those does not hold, the judge is not adding information.

**Did verification status predict anything?** Across 1,800 drafts there will be a few hundred warnings and a handful of unverified statements. Check whether associates deleted them at a higher rate and whether they were later corrected at a higher rate. If status does not predict either, the labels are noise to the associate.

**Draft survival over time and by associate.** The fraction of drafted claims kept should rise as the prompt and checklist are tuned and should not differ much across associates. An associate who rewrites everything is signal about the tool or about the associate; both are worth knowing.

**Missing list to diligence time.** Time from first call to decision, and the number of founder round-trips, before and after the tool. The missing list is only useful if it changes what the fund asks for and when.

**Calibration of the picture, not of a score.** For each dimension, how often did a dimension with high evidence coverage get contradicted in diligence versus one with low coverage? The coverage indicators the tool shows instead of a score should predict where surprises come from. If they do not, they should be redesigned.

### 7.3 What not to do with the year of data

Do not fit a probability of success. Twenty investments and a handful of outcomes is not a dataset; any model trained on it would be fitting the partners' past preferences and calling it prediction. The first outcome-informed feature that can be evaluated honestly is the comparison view in the brief ("this evidence profile resembles these past companies"), and even that needs human-rated similarity to validate before a partner sees it.

## 8. Running and extending the eval

```bash
node eval.mjs              # full: re-verify, judge, scan, expectations
node eval.mjs --no-judge   # no model calls; deterministic checks only
node selftest.mjs          # verifier mutation test
```

Outputs: `out/eval.json` (machine-readable), `out/eval-report.md` (human-readable, includes every flagged statement with the judge's reason). To add a trap, write the example, write its `expectations.json` before running the model, run, and read every flagged item before believing it.
