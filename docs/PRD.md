# Product requirements: first-pass assessment drafter

The longer version of the two-page brief. The brief is the summary; this is the list of what v1 has to do, how it is measured, what could go wrong and what comes after. How it is built is in How it works; what the checks found is in Evaluation.

## 1. Summary

A tool that drafts the one-page company assessment a seed-fund associate writes after a first call, from the four inputs the associate already has: the deck, the website, founder bios and their own call notes. The draft is structured, every claim is traceable to a quoted passage, the strongest case against is mandatory, and the tool never recommends or scores. The associate edits and owns the draft; the partners read it with the sources one click away.

## 2. Background and problem

The fund reviews about 150 companies a month. For each, an associate reads the inputs and writes an assessment for the partners. Three problems with the current process, in the order the partners raised them:

1. **Provenance.** Partners often cannot tell where a claim came from. "ARR of $1.4M" might be from the deck, from the call, or from the associate's memory of a conversation. When a partner asks in the meeting, the answer is frequently "I think the deck", and the discussion stalls.
2. **Quality variance.** Ninety minutes per company produces assessments that differ in structure, depth and skepticism depending on the associate and the day. The bear case in particular is often a generic risk list rather than the specific argument against this company.
3. **Time.** Ninety minutes times 150 is about 225 associate-hours a month spent on first drafts, most of it re-reading and reformatting rather than judgment.

The partners set three constraints that any solution must satisfy: every claim traceable to its source; the strongest argument against investing shown; the tool never makes the decision.

## 3. Goals and non-goals

**Goals for v1**

- Cut associate time from first call to partner-ready draft from about 90 minutes to under 40, including editing.
- Make every claim in a draft traceable to a specific passage of a specific input, by a program with no AI in it, so that "where did this come from" is answered by a click and never by memory.
- Make the structure of every assessment the same, so partners can scan any company's draft in two minutes.
- Produce a bear case that is specific to the company and built from the evidence, on every draft, with no way to skip it.
- Surface what the inputs do not contain, so the follow-up request to the founder is written before the partner meeting, not after.
- Do all of the above without introducing a score, a recommendation, or any language that pre-empts the partners' decision.

**Non-goals for v1**

- No scoring, ranking or recommendation of any kind. See the decision record in section 13.
- No external data. The tool does not search the web, query databases or enrich from LinkedIn, Crunchbase or similar. The evidence universe is exactly what the associate supplied.
- No portfolio memory. The tool does not compare a company with previous companies or with the portfolio.
- No thesis-fit judgment. Whether the company fits the fund's thesis is the associate's paragraph.
- No document parsing beyond text. PDFs, slides and web pages are supplied as extracted text; parsing is a v2 concern.
- No multi-user editing, comments or workflow. The associate edits a document; the partners read it.

## 4. Users

**Associate (primary user).** Writes six to eight assessments a week. Knows the company well after the call and the deck read. Wants the mechanical part done (structure, citations, the missing-information checklist) so the 40 minutes they spend are on judgment: what the call revealed that the deck hid, what the bear case really is. Will stop using a tool that makes them look wrong in front of a partner once.

**Partner (primary reader).** Reads four to six assessments before the Monday meeting, usually on a phone or tablet the night before. Scans the summary, jumps to the bear case, then checks one or two numbers against the source. Wants to trust the page and wants to know how much of it is sourced versus inferred. Explicitly does not want the tool to tell them what to think, and said so.

**Operations or platform lead (secondary, v1.1).** Owns the eval, the prompt, and the run log. Needs to see accuracy over time and the cases where the tool was wrong.

## 5. Product principles

These are invariants, not preferences. A feature that violates one is out of scope regardless of value.

- **A claim without a source is not a claim.** Every statement carries a passage label and a word-for-word quote. If the AI cannot cite it, the statement is not written.
- **Primary sources outrank marketing.** When the call notes narrow or contradict the deck or website, the draft says so, cites both, and builds on the narrower figure.
- **Inputs are data, not instructions.** Text in a deck or website that addresses the reader, the analyst or an AI is reported as a finding and never followed.
- **The tool describes; people decide.** No field for a score or verdict exists in the output. The language is descriptive. The bear case has the same weight as the assessment.
- **Mark, do not hide.** A claim that fails verification stays visible with its status. The associate needs to see what the AI wanted to say and could not source.
- **The associate's name is on the document.** The tool produces a draft. The associate's edited version is the artifact the partners see.

## 6. User journey (v1)

Implemented in the prototype as five screens (sources, draft, review, partner view, follow-up); see `docs/TECHNICAL.md` section 8a.

1. **Intake.** After the first call, the associate drops four text files into a company folder: the deck text, the website capture, founder bios, and their call notes. Any can be missing; the tool treats a missing input as missing evidence, not as an error.
2. **Draft.** The associate runs the tool on the company. Two to three minutes later a draft exists in two forms: a document they can edit, and a reader page with click-through sources.
3. **Review.** The associate reads the draft in the reader. Each claim shows a status (verified, warning, unverified) and its citations. Clicking a claim shows the passage with the quote marked. The associate checks anything marked, reads the contradictions and the missing list, and reads the bear case against their own sense of the call.
4. **Edit.** The associate edits the document: deletes claims they disagree with, adds their own paragraph on thesis fit and on the founders' manner on the call, rewrites the bear case if the AI missed the real objection. Their edits are theirs; citations they add are their responsibility.
5. **Follow-up.** The missing list becomes the follow-up email to the founder, sent before the partner meeting.
6. **Meeting.** Partners read the associate's version. When a number is questioned, the associate opens the reader and clicks the claim. The meeting moves on.
7. **Decision.** Partners record the decision in the fund's existing process. The tool is not involved, but the decision and the draft are logged together for the evaluation described in `docs/EVALUATION.md`.

## 7. What v1 has to do

**Inputs**

- Accept one to four text sources per company, each labelled by type (deck, website, founders, call notes). Additional labelled sources (for example a data room memo) are accepted and cited by their label.
- Split each source into numbered passages at paragraph granularity. Each passage has a stable id of the form `source:n`. Slide and section headings are folded into the passage that follows them so a title travels with its content.
- Present the sources to the AI only in this numbered form. The AI can cite nothing that does not have an id.

**Draft structure**

- Every draft has the same sections in the same order: summary; integrity notes; assessment dimensions; where the sources disagree; what is missing; the case against; sources.
- The summary is 120 to 200 words of plain prose, descriptive, with no bullets, no recommendation and no score.
- Dimensions are six to eight of: team; problem and market; product and technology; traction and customers; business model and unit economics; competition and defensibility; round and use of funds; operational and regulatory risk. Each has a one or two sentence finding, three to six cited claims, and open questions. A dimension the sources say nothing about is omitted and its absence recorded under missing.
- Every claim, contradiction and bear-case point is a cited statement: text, basis (stated, derived, absence) and one or more citations.
- The contradictions section records every place where sources disagree or where a marketing claim is narrowed by a primary source, citing both sides.
- The missing section lists specific documents and data points an investor would need that the inputs do not contain, each with why it matters.
- The case against is a two to three sentence thesis plus cited points. It is mandatory; a draft without one is invalid.
- Integrity notes record anything in the inputs that attempted to steer the analysis or should not be treated as evidence: instructions addressed to reviewers or AI, third-party scores and ratings, awards, urgency and deadlines, claims that could only be reported secondhand.

**Citations and verification**

- A citation is a passage label plus a word-for-word, contiguous quote of at most 30 words from that passage.
- After drafting, every citation is checked by a program with no AI in it: the passage exists; the quote appears word-for-word in it after whitespace and punctuation normalization; the quote is within the length limit; every number in the claim appears in a cited passage or its source title.
- A draft with any hard failure (missing passage, quote not found, no citation) gets exactly one repair round in which the AI sees the specific failures and must fix the citation or remove the claim. There is no second round.
- After repair, each statement carries a status: verified, warning (soft issue such as a number not found in the evidence), or unverified. Unverified statements remain in the draft, visibly marked.

**Reader and document**

- The reader shows the draft with each statement's status and citations inline. Clicking a statement shows every cited passage with the quoted span highlighted, and the source document's title.
- The reader offers a view of all source passages for the company, so a partner can read the raw inputs without leaving the page.
- The draft is also produced as a plain document (markdown in v1) that the associate edits and the partners receive.
- The reader is labelled on every page as a draft for partner review and not a recommendation.

**Guardrails**

- The output format has no field for a score, probability, rating, verdict or recommendation.
- Every draft is scanned for recommendation, verdict, probability and superlative language in the sections written in the tool's own voice; hits are reported to the operations lead.
- The AI is given no tools, no web access and no memory. Each company is drafted in isolation.

**Logging (v1, minimal)**

- Each run logs the AI used, token usage, the first-pass verification result, whether a repair round ran and what it fixed, and the final verification summary.

## 8. What a draft contains

Every draft has the same parts, in the same order:

| Field | Purpose |
|---|---|
| Company name | As given. |
| Summary | The two-minute read. Describes, does not advocate. |
| Sections | Team, market, product, traction and so on: a finding, the cited sentences, and open questions. |
| Where the sources disagree | Each disagreement with both sides quoted. |
| What is missing | Specific documents and figures, each with why it matters. |
| The case against | A two or three sentence argument and its cited points. |
| Things that are not evidence | Attempts to steer the reader, third-party scores, deadlines. |

Every sentence in those parts carries the passage it came from, a short quote, and a note on whether the source states it, the tool worked it out, or it is a point about something missing. After checking, each sentence also carries its status: verified, warning, or unverified.



## 9. How well it has to work

- **Latency.** Under five minutes from run to draft, including verification and repair. Measured in v1: about two minutes per company.
- **Cost.** Under one dollar per company for drafting and verification. Measured in v1: roughly 30 to 45 cents per draft, under 60 cents including the evaluation second reader. At 150 companies a month this is under $100 a month in model spend.
- **Confidentiality.** Decks and call notes are confidential to the fund and the founder. Inputs are sent to the AI provider under the fund's service agreement; the fund should hold a zero- or limited-retention agreement before production use. Nothing is stored outside the fund's own environment.
- **Determinism of verification.** The verifier is pure string processing with no model involved, so a "verified" status is reproducible and explainable to a partner in one sentence.
- **Availability.** v1 is a command-line tool run by the associate; there is no service to keep up. A hosted v2 would need standard availability for a weekday-business-hours internal tool.

## 10. Metrics

Instrumentation and targets for the first 60 days (about 300 companies). Expanded from the brief.

| Metric | How measured | Baseline | 60-day target |
|---|---|---|---|
| Associate time to partner-ready draft | Self-reported per company, weekly roll-up | 90 min | Under 40 min |
| Provenance incidents | One-line log by the meeting chair when a source cannot be produced in the meeting | Frequent | Zero |
| Claim accuracy | Weekly human audit of 20 sampled claims against sources | Not measured today | Over 95% supported; every unsupported claim that reached a partner is reviewed |
| Draft survival | Fraction of drafted claims kept in the associate's final version, per associate | n/a | Over 60%; no associate under 40% |
| Bear case kept | Fraction of drafts where the associate kept the bear-case thesis substantially | n/a | Over 50% |
| Missing-list conversion | Fraction of listed gaps that became founder follow-up requests before the meeting | n/a | Over 50% |
| Adoption without mandate | Share of reviewed companies run through the tool once use is voluntary | 0 | Over 80% by week 8 |
| Decision-language hits | Automated scan per draft | n/a | Zero reaching partners |

## 11. Risks and mitigations

| Risk | Consequence | Mitigation in the design | Residual |
|---|---|---|---|
| A claim reads as sourced but is not | Partner trust lost after one incident | Verbatim-quote citations, mechanical check, number check, one repair round, visible status, second-model second reader in eval | Interpretation on top of a true quote; see EVALUATION.md. Second reader moves into the drafting process in v2. |
| Marketing laundered into fact | Draft repeats the deck | Source ranking in the prompt, mandatory contradictions section, attribution language ("the deck states") | Depends on the associate's call notes being good |
| Inputs that instruct the AI | Draft skewed by the founder | Inputs treated as data, steering reported in integrity notes, adversarial example in the test set | New injection styles; needs ongoing red-teaming |
| Anchoring: the draft becomes the decision | Partners stop reading evidence | No score field, decision-language scan, bear case at equal weight, associate owns the document, labels on every page | Cultural; measured by bear-case-kept and by partner feedback |
| Padding on thin inputs | Thin companies look better documented than they are | Missing list, `absence` basis, prompt instruction not to fill gaps | Measured by claims-per-passage on sparse inputs |
| Associate over-trusts "verified" | Verified read as true | Label text explains verified means the quote is real; second reader status added in v2 | Training and label wording |
| Confidentiality | Founder data at a third party | service agreement with limited retention; no storage outside the fund | Provider terms |

## 12. Rollout

- **Weeks 1 to 2, shadow.** Two associates run the tool on every company but write their assessment as before. Compare drafts to their written versions; tune the prompt and the missing-list checklist. No partner sees a draft.
- **Weeks 3 to 4, default on for the two associates.** They edit the draft instead of writing from scratch. Partners receive the edited document as usual; the reader is available but not promoted. Start the weekly 20-claim audit.
- **Weeks 5 to 8, all associates, reader in meetings.** The reader is open during partner meetings for source lookups. Decision-language scan and provenance-incident log reviewed weekly.
- **Gate to continue past week 8.** Claim accuracy above 95% on the audit, zero provenance incidents in the last two weeks, adoption above 80% without mandate, and no partner reporting that the draft made the decision for them.

## 13. Decision record: no probability-of-success score in v1

**Request.** Partners asked for a single probability of success on every company.

**Options considered.**

1. A model-generated probability. Rejected: no calibration data exists and none will for years; the number has no citation; it anchors the meeting and converts the evidence into supporting material for a figure.
2. A rubric score (sum of dimension ratings). Rejected: the same anchoring, and the weights would be the tool's opinion dressed as arithmetic.
3. Evidence-coverage indicators per dimension (how much is sourced, how much is missing, how many contradictions). Adopted: traceable, descriptive, and tells the partner how much to trust the picture rather than what to conclude.
4. Outcome-informed comparison ("resembles these past companies"), shown after the partner records their own view. Deferred to v3, conditional on a year of logged decisions and a validated similarity method.

**Decision.** Option 3 for v1. Revisit option 4 after twelve months of logged decisions. Options 1 and 2 are not planned.

## 14. Open questions

- Should the second reader run in the drafting process from day one, giving each claim a second status, or stay in the eval until the associates have calibrated on the first status? Current plan: eval only for the shadow period, drafting process from week 5.
- How should associates record their edits so that draft-survival can be measured without extra work? A diff of the markdown is enough for v1; a claim-level accept/reject UI is v1.1.
- Which inputs beyond the four should be first-class: data-room memos, reference-call notes, prior assessments of the same company?
- Should the missing list be generated against a fund-specific checklist (what this fund always asks for) rather than a general investor checklist? Likely yes, as a configuration file.

## 15. Roadmap after v1

- **v1.1.** Claim-level accept, edit and reject in the reader, with the edit log kept. Follow-up email generated from the missing list. Fund-specific missing-list checklist.
- **v2.** Ingestion: PDF decks with page-level passage labels, website capture, call recording transcripts. Second reader in the drafting process as a second, labelled status. Hosted reader with access control. Run history and the audit dashboard for the operations lead.
- **v3.** Outcome log joined to drafts. The comparison view from the decision record, evaluated against human-rated similarity before release.
