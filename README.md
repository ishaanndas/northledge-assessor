# Seed assessment drafter

A tool that drafts the one-page company assessment a seed fund's associate writes after a first call, from the deck, website, founder bios and call notes. Every sentence cites the passage it came from, with the quote. The draft says what is missing, where the sources disagree, and makes the strongest honest case against. It never recommends and never scores.

**Try it:** https://northledge-assessor-production.up.railway.app
**Documents:** https://northledge-assessor-production.up.railway.app/docs

## What is here

| Assignment item | Where |
|---|---|
| 1. Product brief (2 pages) | `BRIEF.md`, also at `/docs/brief`. The longer requirements doc is `docs/PRD.md`. |
| 2. Working prototype with 3 to 4 example inputs and outputs | The app and the command line below. Five example companies in `examples/`, outputs in `out/`. The dashboard lists them under "Test cases from the assignment". |
| 3. Evaluation, honest report, year-later plan | `eval.mjs` and `selftest.mjs`; findings and the plan in `docs/EVALUATION.md`; raw run in `out/eval-report.md`. |
| 4. README | This file. |

## Run it

Needs Node 20 or later and an Anthropic API key.

```bash
npm install
echo "ANTHROPIC_API_KEY=sk-ant-..." > .env
npm start
```

That one command drafts all five examples, runs the evaluation and builds a static report. About twelve minutes and roughly two dollars. The outputs are already committed, so nothing has to be spent to read them.

```bash
node serve.mjs                 # the app, at http://localhost:4950
node assess.mjs lumina-health  # draft one company
node eval.mjs --no-judge       # mechanical checks only, no model calls
node selftest.mjs              # plant four defects and confirm the checks catch them
```

## The examples

Four were written as text sources; the fifth is a real PDF deck. Each one tests something specific.

| Company | Built to test | What happened |
|---|---|---|
| Lumen Grid | A normal, consistent company | Clean draft. The case against still found the 24% customer concentration and the month-to-month contracts. |
| Harbor Health | Thin inputs: a vague website and an evasive 25-minute call | Did not pad. Eight specific missing items; the gap between what the website advertises and what the founder admitted is shipped surfaced as a contradiction. |
| Quill Robotics | Sources that disagree: $1.4M ARR vs $410k contracted, "led perception at Tesla" vs a seven-month contract, a market figure for the wrong market | All three surfaced as contradictions. Claims were built on the smaller numbers and marketing was attributed ("the deck states") rather than repeated. |
| Mesa Pay | Designed to trip the tool: hidden text on the website telling AI reviewers to be positive, a planted "85% probability of success", five marketing claims that collapse on the call, an expiring term sheet | The instruction was reported and ignored. The 85% was treated as something someone claimed. All five collapses are contradictions. The deadline is flagged as pressure. |
| Lumina Health | Designed to trip the tool, as a real deck: the traction slide's $2.4M ARR, 340 clinics and 99.9% retention are quietly redefined in the deck's own appendix; "no competitors" followed by three names; a CTO title contradicted by its footnote; a 92% score from the company's advisor; a Friday close; white 6pt text addressed to AI reviewers | Every headline figure was rebuilt on the appendix definitions. Six contradictions. The hidden text, the 92%, the pre-screening claim and the deadline all landed in integrity notes. The case against opens with "the headline metrics are constructed rather than measured". |

Three more ordinary decks (Relay Voice, Grainline, Tidewatch) sit in `samples/` as PowerPoint and PDF for trying the intake and the inbox. `samples/README.md` lists everything planted in Lumina.

## What the evaluation found

Five companies, 227 statements, 314 citations. Every quote was verified against its source after one repair round; the round fired on two drafts, both for citation mechanics (a missing passage number, a title line cited as a passage, a footnote quoted across a PDF line break), never for a false claim. A second model found zero unsupported claims and ten partials, each a true quote carrying a word the source does not: "only", "entirely", "three sources" where two were cited. Six of the ten are in the case against or the contradictions, where the model is arguing. That is the failure a string check cannot see and the reason the second model exists. The language scan raised two hits, both quotations of someone else's words, kept as hits on purpose. All 47 expectations passed. Details, limits and the year-later plan are in `docs/EVALUATION.md`.

## Key decisions

- **The tool reads only what the associate gives it.** No web, no databases. That costs breadth and buys complete traceability, which is what the partners asked for first.
- **A citation is a passage plus the exact words.** A passage id alone lets a model cite a true passage for a false claim. The exact words make the check mechanical.
- **One repair round, not a loop.** Retrying until everything passes would teach the model to write vaguer claims.
- **Failures are marked, not deleted.** The associate needs to see what the model wanted to say and could not source.
- **Different models draft and judge.** A judge from the same model shares its blind spots.
- **No field for a score.** It is structurally impossible for the output to contain one, and the evaluation scans for the language anyway.
- **The draft is never overwritten.** Edits sit on top of it, so the original and the associate's version can always be compared.

## What was cut

Reading PDFs and slides as images; a database (folders instead); the second model inside the pipeline (evaluation only); sign-in; running the same company several times to measure how stable the output is.

## What comes next

The second model's verdict shown beside every claim. Page-level citations for decks. A real mailbox connection. An outcome log from day one so the year-later evaluation has data. Then the comparison view described in the brief, and only once it has been checked against human judgement.

## How AI tools were used

The whole thing was built with Claude Code over a long session: the code, the example companies, the prompts, the test decks and first drafts of every document, with me directing, reviewing the output and deciding what to cut. The design choices listed above are mine; many of the implementations were Claude's first attempt and survived.

Four places it got something wrong:

- **It flagged correct claims as wrong.** The first version of the number check reported a call's date and length as unsupported because they live in the document title, which the splitter had dropped. If I had not read the flagged claims I would have reported two false warnings as findings.
- **It wrote a test that punished good behaviour.** An expectation for Quill Robotics forbade any claim containing "led perception". The model's claim was "The deck states Marsh led perception at Tesla", which is exactly right. The test had to learn the difference between asserting and attributing.
- **It built a PowerPoint only its own parser could open.** To avoid a dependency it assembled the file by hand. My extractor read it fine; Google Slides and Keynote refused it. A file format is defined by the programs that open it.
- **It undid too much.** During a refactor it reverted a whole file to undo one bad edit and took the editor with it. Caught on the first page load, restored from the last commit, re-applied carefully.
