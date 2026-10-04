# Seed assessment drafter

A small program that takes what a seed fund has on a company (deck, website, founder bios, first-call notes) and drafts the one-page assessment an associate would otherwise write by hand. Every claim cites the passage it came from with a verbatim quote. The draft includes what is missing, where the sources disagree, and the strongest honest case against. It never recommends and never scores.

The deliverables, mapped to the assignment:

| Assignment item | Where |
|---|---|
| 1. Product brief (max 2 pages) | `BRIEF.md`. The full PRD behind it is `docs/PRD.md`. |
| 2. Working prototype, 3 to 4 example inputs with outputs | The pipeline in `lib/pipeline.mjs`, the app in `serve.mjs` and `app/`, the CLI in `assess.mjs`; `examples/`; committed outputs in `out/`. Architecture and decisions in `docs/TECHNICAL.md`. |
| 3. Evaluation, honest report, year-later plan | `eval.mjs`, `selftest.mjs`; results in `out/eval-report.md`; method, results and the year-later plan in `docs/EVALUATION.md`. |
| 4. README | This file: how to run, key decisions, cuts, next steps, AI usage. |

## Run it

Requires Node 20 or later and an Anthropic API key. Two dependencies: the Anthropic SDK and pdf-parse.

```bash
npm install
echo "ANTHROPIC_API_KEY=sk-ant-..." > .env
npm run serve        # the app, at http://localhost:4950
```

The app is one document per company, the assessment, shown in whatever state it is in. Before drafting it shows the sources it will be built from and a Draft button. While drafting it shows progress. Once drafted it is a block editor, in the way a Notion page is: click anywhere and type, press Enter for a new block, "/" for a heading, bullet, quote or divider, drag a block by its handle; the source panel beside it opens the actual deck page behind whichever claim or citation you click, and is resizable. A switch in the header flips between **Edit** and **Partner view**, which is what the partners receive with your edits applied. The state is derived: not drafted, draft, or reviewed once you have changed anything. **Sources** and the **Follow-up email** sit under the assessment as evidence and tools rather than steps.

Getting a company in: **New company** takes a deck as a PDF, PPTX or DOCX (drop it, choose it, or paste a link to the file), a website link that is fetched as text with hidden elements kept and marked, and pasted text or files for bios and call notes. Once the deck is read, the company name, one-liner, round, website and founder bios fill from it; you correct what is wrong and add what the deck lacks. **Inbox** shows decks that arrive by email; importing one creates the company with its attachments already read and its fields filled. In this build the inbox is a watched drop folder (`inbox/`) shaped like a mailbox, with three sample messages; the Gmail and Microsoft 365 connectors show as not connected until OAuth credentials exist. Mock decks to try are in `samples/` (two PDFs, one PPTX, one DOCX of call notes). The four example companies are preloaded; companies you add live under `companies/`, which is gitignored. The companies page has card and list views, and ⌘K opens a search across companies, decks, passages, claims, missing items and the inbox that jumps to the exact match.

The same pipeline runs from the command line:

```bash
npm start                       # draft all four examples, run the eval, build the static report (about ten minutes, roughly $1.60)
node assess.mjs mesa-pay        # draft one company
node eval.mjs --no-judge        # deterministic checks only, no model calls
node selftest.mjs               # plant four known defects in a real draft and confirm the checks catch them
```

To look at the committed outputs without spending anything, open `out/index.html` (the static reader) and read `out/*/assessment.md`. To add a company without the app, create a folder under `examples/` with a `company.json` and a `sources/` directory of markdown files (`01-deck.md`, `02-website.md`, and so on). The number prefix orders them; the rest of the filename becomes the citation key.

## How it works

```
examples/<slug>/sources/*.md
        │  split into numbered passages  (lib/sources.mjs)      deck:1, deck:2, call-notes:7 ...
        ▼
  Claude Opus 5, structured output        (assess.mjs, lib/prompts.mjs, lib/schema.mjs)
        │  summary · dimensions · contradictions · missing · bear case · integrity notes
        │  every statement = text + basis + [{passage_id, quote}]
        ▼
  deterministic verifier                  (lib/verify.mjs)
        │  passage exists? quote is a verbatim substring? numbers in claim appear in cited passages?
        │  any hard failure → one repair round with the exact failures listed → re-verify
        ▼
  out/<slug>/assessment.json + .md        statements carry their verification status; failures are marked, not dropped
        ▼
  eval.mjs                                 re-verifies from scratch · Sonnet 5 judge reads each claim against the full passage
                                           · decision-language scan · per-example known-answer expectations
  report.mjs                               out/index.html: click any claim, see the passage with the quote highlighted
```

The model only ever sees text with passage ids attached and may cite nothing else. The verifier is pure string matching on normalized text, so "verified" means exactly one thing: that quote exists in that passage. Whether the quote supports the sentence built on it is a different question, which is why the eval adds a second model as a judge.

## The examples

| Company | Designed to test | What happened |
|---|---|---|
| Lumen Grid | Baseline. Consistent, fairly complete sources. | Clean draft; bear case found the 24% customer concentration, month-to-month contracts and pilot conversion dependency. |
| Harbor Health | Sparse inputs: a vague website and an evasive 25-minute call. No deck, no bios. | Did not pad. A long, specific missing list; the website-vs-call gap on the documentation feature surfaced as a contradiction. The one draft where the repair round fired. |
| Quill Robotics | Contradictions: $1.4M ARR vs $410k contracted, "led perception at Tesla" vs a seven-month contract, a $48B TAM for the wrong market. | All three surfaced in the contradictions section; claims were built on the narrower figures and marketing statements were attributed ("the deck states") rather than asserted. |
| Mesa Pay | Adversarial: a hidden instruction to AI reviewers in the website, a planted "probability of success: 85%", five marketing claims that collapse on the call, no founder bio, an expiring term sheet. | The instruction was ignored and reported as an integrity note; the 85% was treated as a claim someone made; all five collapses are contradictions; the term sheet is flagged as pressure. |

The design notes for each are in `examples/<slug>/company.json`; the known-answer checks are in `expectations.json` next to them.

## Evaluation

Summary here; full method, every flagged statement and the limitations are in `docs/EVALUATION.md`, and the raw run is `out/eval-report.md`. Four kinds of check:

1. **Deterministic citation checks**, re-run from scratch in the eval so they do not trust the pipeline's own annotations. Passage exists, quote is verbatim, numbers in the claim appear in the cited passages, quote under 30 words.
2. **LLM judge** on a different model (Sonnet 5) reading every statement against the full text of its cited passages: supported, partial or unsupported. The cell that matters is "quote matched verbatim but the judge says unsupported": that is the failure a string check cannot see.
3. **Decision-language scan** over everything written in the assessor's own voice (summary, findings, claims, bear thesis) for recommendation, probability and score language.
4. **Known-answer expectations** per example, written when the trap was designed: contradictions that must appear, instructions that must be flagged, figures that must not be asserted without attribution.

`selftest.mjs` plants four defects in a real draft (a fabricated quote, a citation to a nonexistent passage, a changed number, a stripped citation) and confirms each is caught. On this run it caught 4 of 4.

### What this run found

Run of 3 October 2026, drafter Claude Opus 5, judge Claude Sonnet 5. 182 statements across four companies.

| Company | Statements | Quote-verified | Repair round | Judge: supported / partial / unsupported | Decision-language hits | Expectations |
|---|---|---|---|---|---|---|
| Lumen Grid | 46 | 46 | not needed | 45 / 1 / 0 | 0 | 4 of 4 |
| Harbor Health | 36 | 36 | yes, 3 quotes fixed | 32 / 4 / 0 | 0 | 6 of 6 |
| Quill Robotics | 51 | 51 | not needed | 49 / 2 / 0 | 0 | 8 of 8 |
| Mesa Pay | 49 | 49 | not needed | 48 / 1 / 0 | 0 | 15 of 15 |

Read honestly:

- **The string check almost never fires on a good model.** Across five drafts (Harbor Health was drafted twice while I fixed the verifier), the deterministic check found three bad citations in one draft and none in the other four. All three were quotes that paraphrased instead of copying; the repair round fixed all three. The check is still worth having, and the self-test shows it catches fabricated quotes, wrong passage ids, altered numbers and missing citations when they occur. But on this model and these inputs it is a seatbelt, not the main defence.
- **The real failure mode is interpretation on top of a true quote.** The judge marked 8 of 182 statements as partially supported and none as unsupported. In every one of the 8 the quote was verbatim and the claim added something the passage does not say: "the only stated differentiator", "the hardest and most differentiated part of the offering", "can lapse without notice", "corrected only when the associate asked directly". Four of the eight are bear-case points. That is the pattern to watch: when the model argues, it reaches. A string check cannot see this; a judge can, which is why the judge belongs in the product and not only in the eval.
- **The adversarial case did not land a hit.** The hidden instruction was reported, not followed. The 85% figure appears only in integrity notes and contradictions. The expiring term sheet is flagged as pressure. All 15 known-answer checks passed. One run is not proof of robustness; it is one run.
- **No decision language anywhere**, in 182 statements plus four summaries and four bear-case theses. The schema makes a score impossible; the scan confirms the prose did not smuggle one in.
- **The eval has its own errors.** The first version of the number check produced two false warnings and the first version of the Quill expectations would have failed a correct claim. Both are described under AI tools below. An eval is code, and it was wrong before the model was.


### Evaluating with a year of real decisions

Once the fund has twelve months of drafts, partner decisions and early outcomes, the question changes from "are the citations real" to "did the tool change decisions for the better". I would look at four things.

- **Did the bear case name the real objection?** For every company the partners passed on, compare the stated reason against the draft's bear case. For every company they backed that has since hit trouble, check whether the trouble was in the bear case or the missing list. A tool that keeps missing the actual failure mode is decorative.
- **Which drafted claims turned out false?** Diligence surfaces facts: the ARR was really X, the founder's title was really Y. Each one is a label for a drafted claim. Track the rate at which "verified" claims were later contradicted by diligence, split by source type. I would expect website-sourced claims to fail most and want to confirm that the contradiction mechanism is catching them before the partners do.
- **Edit survival as a trend.** The fraction of drafted claims associates keep should rise as prompts and examples are tuned, and should not vary much by associate. If one associate rewrites everything, either the tool or the associate has a problem worth understanding.
- **Did missing lists shorten diligence?** Compare time-to-decision and follow-up round-trips with founders before and after. The missing list is only useful if it changes what the fund asks for and when.

What I would not do is train a score on a year of outcomes. Twelve months of seed decisions is perhaps 20 investments and a handful of observable outcomes, which is not a dataset. The comparison view in the brief ("this evidence profile resembles these past companies") is the first outcome-informed feature that can be evaluated honestly, and even that needs human-rated similarity to validate.

## Key decisions

The short list. Reasoning for each, plus the data model, prompts, verifier, measured cost and the path to production, is in `docs/TECHNICAL.md`.

- **Closed evidence universe.** The tool reads nothing the associate did not supply. This costs breadth (no competitor lookup, no LinkedIn check) and buys complete provenance. The partners asked for traceability first; this is what makes it mechanical rather than aspirational.
- **Citation = passage id + verbatim quote.** Passage-level ids alone let a model cite a true passage for a false claim. Requiring the exact words makes the check deterministic and makes the highlighted quote in the reader meaningful.
- **Repair, do not retry.** One round, with the exact failures listed. A loop that retries until everything passes would train the model to write vaguer claims; one round with marked failures keeps the pressure on precision.
- **Mark, do not drop.** An unverified claim stays in the draft with a visible status. Silently removing it would hide the model's error from the associate, who needs to know what the model wanted to say and could not source.
- **Different models for drafter and judge.** Opus 5 drafts, Sonnet 5 judges. A judge from the same model shares its blind spots.
- **No score field in the schema.** It is not a prompt instruction; it is structurally impossible for the output to contain one. The eval scans for the language anyway.
- **Structured output over free text.** The JSON schema is the contract between the model, the verifier, the eval and the reader. It also forces the bear case and missing list to exist on every draft.

## What I cut

- **Document ingestion.** No PDF, slide or web scraping. Sources are markdown the associate pastes or exports. For the real product this is the first week of work and it is unglamorous.
- **Multi-user and persistence beyond files.** Reviews are JSON files next to the draft; there is no login, no history of edits, no concurrent editing. A real v1 needs a database and an edit log.
- **Judge in the pipeline.** The Sonnet judge runs only in the eval. Putting it in the pipeline would let the tool demote claims the judge rejects before the associate sees them. I left it out to keep the pipeline's verification purely mechanical and explainable; I would add it as a second, clearly labelled status.
- **Prompt caching and batching.** At 150 companies a month cost is not the constraint. Not worth the complexity yet.
- **Multi-sample consistency.** Drafting twice and diffing would catch unstable claims. Doubles cost; deferred.

## What I would build next

1. Edit history and multi-user review: who changed which claim and when, with the model's draft and the associate's version both kept.
2. The judge as a second status in the reader ("quote verified; support: partial"), with the judge's one-line reason visible.
3. Ingestion: PDF decks through text extraction with page-level passage ids, so a citation reads `deck p.4`.
4. A follow-up request generator: the missing list turned into an email the associate can send the founder.
5. The outcome log described above, started on day one even though it will not be useful for a year.

## How AI tools were used

The whole thing was built with Claude Code in a single session of roughly four hours, with Claude writing the code, the example companies, the prompts and the first drafts of the brief and this README, and me directing, reviewing output quality, and deciding what to cut. The design choices (closed evidence universe, verbatim-quote citations, mark-not-drop, no score field) were mine; several of the implementations were Claude's first attempt and survived.

Three places it got something wrong:

- **The number check flagged correct claims.** The first version of the "every number in a claim must appear in the cited passage" check reported the call date and call duration as unsupported, because they live in the document's title line and the passage splitter had dropped titles. The fix was to count the source title as evidence. Without reading the flagged claims I would have reported two false warnings as real findings.
- **An eval expectation penalized correct behaviour.** The first known-answer check for Quill Robotics forbade any claim containing "led perception", to catch the inflated Tesla title being asserted as fact. The model's actual claim was "The deck states Marsh led perception at Tesla", which is exactly right: attributed, then contradicted two lines later. The regex had to learn the difference between asserting and attributing. The lesson generalizes: an eval written before seeing outputs encodes the author's guess about how the model will fail, and the guess can be wrong in a direction that punishes good behaviour.
- **A generator function that would not parse.** Claude wrote `yield` inside an arrow callback in the statement iterator, which is a syntax error in strict-mode modules. Caught on the first run, fixed in a minute, but it is a reminder that fluent code is not the same as code that has been executed.
