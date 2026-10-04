# How it works

A plain walkthrough of what the prototype does, in the order it does it. The code is small: about 2,000 lines of JavaScript, two dependencies (the Anthropic SDK and a PDF text reader), no build step.

## 1. The idea in one paragraph

An associate gives the tool what they have on a company: the deck, the website, founder bios, their call notes. The tool splits those into numbered passages, asks Claude to write a structured assessment where every sentence points at a passage and quotes it, then checks every quote mechanically against the source. Anything that fails gets one chance to be fixed. What is left is shown to the associate as an editable document with the source one click away. The tool never recommends and never scores.

## 2. Getting a company in

Three ways, all ending in the same place: a folder of text files, one per source.

- **Files.** Drop a deck (PDF, PowerPoint or Word), or choose it, or paste a link to the file. The text is pulled out so that one passage equals one slide or page. The original file is kept, which is what lets the app show the real slide later.
- **Links.** A website address is fetched and reduced to text. Hidden elements are kept and labelled, because that is where instructions aimed at machines tend to hide.
- **Inbox.** Decks that arrive by email show up in an inbox. Importing a message creates the company with its attachments already read. In this prototype the inbox is a folder on disk shaped like a mailbox, with sample messages in it; connecting Gmail or Microsoft 365 is a matter of credentials and is shown as not connected until then.

Once a deck is read, the company name, one-liner, round, website and founder bios are filled in from it. The associate corrects anything wrong.

## 3. Drafting

Each source is split at paragraph breaks into passages with ids like `deck:3` or `call-notes:7`. Slide titles travel with their slide. The model only ever sees text with these ids attached and is told it may cite nothing else.

Claude Opus 5 then returns a fixed shape: a summary, six to eight assessment dimensions, where the sources disagree, what is missing, the case against, and integrity notes (anything in the inputs that tried to steer the reader). The shape is enforced by the API, and it has no field for a score or a verdict, so one cannot appear even by accident.

Every claim carries a passage id and a verbatim quote of at most 30 words. Each claim also says whether it is stated in the source, derived from numbers in the source, or an argument about something the source does not contain.

## 4. Checking the citations

A verifier with no model in it reads every citation and asks four things: does the passage exist, does the quote appear in it word for word (after ignoring capitalisation, curly quotes and line breaks), is the quote under 30 words, and does every number in the claim appear somewhere in the cited passages.

If anything hard fails, the model is shown the exact failures and asked once to fix the quote, cite the right passage, or drop the claim. There is no second round. Whatever still fails is kept in the draft and marked as unverified, so the associate sees what the model wanted to say and could not source.

"Verified" therefore means one thing: the quote is real. Whether the sentence built on it is fair is a different question, which is what the evaluation's second model is for.

## 5. The document

The assessment is one document in one place, and its state is derived rather than set: not drafted, drafting, draft, or reviewed the moment the associate changes anything.

The editor works the way a Notion page does. Click anywhere and type. Enter makes a new block, "/" offers a heading, bullet, quote or divider, blocks drag by their handle. Claims can be edited or removed, but their citations stay attached, so a claim can be reworded without losing where it came from. Clicking a claim or a citation opens the actual deck page in a panel beside the document, with the quoted words highlighted. The panel resizes.

The model's draft is never overwritten. Edits, removals, moves and added blocks are stored separately and applied on top, so the original can always be compared with what the associate changed.

A switch flips between Edit and Preview; Preview is what the partners receive. Export gives Word, PDF, Markdown or copy to clipboard, all with the review applied. A follow-up email to the founder is composed from the missing list and open questions.

Search (Cmd+K) covers company names, deck slides, website text, call notes, drafted claims, missing items and inbox messages, and opens the exact claim or passage.

## 6. Evaluation

A separate program re-checks every citation from scratch, asks a second model (Claude Sonnet 5) whether each claim is actually supported by its cited passages, scans the draft for recommendation or score language, and runs a short list of expectations written for each example before it was drafted (this contradiction must appear, this hidden instruction must be flagged, this inflated figure must not be asserted). A self-test plants four defects in a real draft and confirms the verifier catches them. Results and what they mean are in the Evaluation document.

## 7. What it costs and how long it takes

| Step | Per company |
|---|---|
| Drafting | about 2 to 3 minutes, roughly $0.30 to $0.50 |
| Repair round, when needed | about 1 minute more |
| Evaluation judge | about 1 minute, under $0.10 |
| Filling the intake form from a deck | about 4 seconds, a few cents |

At 150 companies a month the model spend is under $100.

## 8. Hosting

The app runs on Railway at https://northledge-assessor-production.up.railway.app. Companies created there persist on a mounted disk. Reviews of the five built-in examples reset when the app is redeployed, which is fine for a demo. The documents you are reading are served by the same app under `/docs`.

## 9. What a production version would change

- **Ingestion.** Page-level ids for PDF decks (`deck p.4` reads better than `deck:4`), better website capture, call recordings transcribed into notes. The least glamorous and largest piece of work.
- **Storage.** A proper database instead of folders: companies, sources, passages, drafts, claims, citations, the associate's edits, and the partners' decision.
- **The second model in the pipeline.** Today it runs only in the evaluation. In production each claim would carry a second, clearly labelled status: quote verified, support partial.
- **Access.** Sign-in, and partner pages that can be sent as links.
- **An outcome log from day one.** Every draft joined to the partners' decision and, later, to what happened to the company. The year-later evaluation depends on this existing.

## 10. Known limits

- Five examples, written by the same person who wrote the prompt. They test the failures that person thought of.
- One run per example. Output varies between runs; the committed numbers are one sample.
- The second model has not been checked against a human grader yet.
- Long documents produce passages too big for a quote to pin precisely; pages or sentences would be needed.
- The number check is literal: it misses numbers written as words and can be fooled by a coincidence.
