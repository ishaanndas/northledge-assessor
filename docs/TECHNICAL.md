# How it works

What the tool does, in the order it does it. Written for someone who will use it or decide about it, not someone who will maintain the code.

## In one paragraph

An associate gives the tool what they have on a company: the deck, the website, the founders' bios, their own notes from the first call. The tool breaks those into numbered passages and asks the AI to write an assessment where every sentence points at one passage and quotes it. A separate program then checks every quote against the source. Anything that fails gets one chance to be fixed; whatever still fails is shown as unverified rather than hidden. The associate edits the result in a document that opens the real slide behind any sentence. The tool never recommends and never scores.

## Getting a company in

Three ways, all ending in the same folder of text files, one per source.

- **Drop in files.** The deck as PDF, PowerPoint or Word, or a link to one. The text is pulled out so that one passage is one slide. The original file is kept, which is what lets the app show the real slide later.
- **Paste a link.** A website is fetched and turned into text. Hidden text on the page is kept and labelled, because that is where instructions aimed at AI tend to be planted.
- **The inbox.** Decks that arrive by email appear in an inbox; one click turns a message into a company with its attachments already read. In this prototype the inbox is a folder with sample messages in it. Connecting a real mailbox is a matter of credentials, and the screen says so until then.

Once a deck is read, the company name, one-line description, round, website and founder bios are filled in from it. The associate corrects whatever is wrong.

## Drafting

Each source is split at paragraph breaks into passages with short labels, such as `deck:3` for the third slide or `call-notes:7` for the seventh paragraph of the notes. Slide titles stay with their slide. The AI only ever sees text with these labels attached, and it is told it may point at nothing else.

It returns the assessment in a fixed shape every time: a summary a partner can read in two minutes, six to eight sections such as team, market and traction, where the sources disagree, what is missing, the strongest case against, and a list of anything in the inputs that tried to steer the reader. That shape has no slot for a score or a verdict, so neither can appear even by accident.

Every sentence carries the label of the passage it came from and a short quote from it, thirty words at most. Each sentence also says whether the source states it, whether the tool worked it out from numbers in the source, or whether it is a point about something the source does not contain.

## Checking the quotes

A small program, with no AI in it, reads every quote and asks: does this passage exist, do these exact words appear in it, is the quote short enough, and does every number in the sentence appear somewhere in the passages it points to.

If anything fails, the AI is shown the exact failures and asked once to fix the quote, point at the right passage, or drop the sentence. There is no second chance. Whatever still fails stays in the draft, marked, so the associate can see what the tool wanted to say and could not back up.

"Verified" therefore means one specific thing: these words really are in that source. Whether the sentence built on them is fair is a separate question, answered by the second reader described in the Evaluation.

## The document

A company has one assessment, shown in whatever state it is in: not drafted, drafting, draft, or reviewed once the associate has changed anything.

The editor behaves like a Notion page. Click anywhere and type. Enter makes a new block, a slash offers a heading, bullet, quote or divider, and blocks drag by their handle. Sentences can be reworded or removed, but their quote and source stay attached. Clicking a sentence, or the small source label after it, opens the actual deck page in a panel beside the text with the quoted words highlighted. The panel resizes.

The AI's draft is never overwritten. The associate's edits sit on top of it, so the original and the edited version can always be compared.

A switch flips between Edit and Preview; Preview is what the partners receive. Export gives Word, PDF, Markdown or a clean copy, all with the edits applied. A follow-up email to the founder is composed from the missing list and the open questions. Search (Cmd+K) finds anything across every company: a phrase in a slide, a sentence in a draft, a missing item, an inbox message.

## Cost and time

| Step | Per company |
|---|---|
| Drafting | 2 to 3 minutes, about 30 to 50 cents |
| Fixing failed quotes, when needed | about a minute more |
| The second reader, in the evaluation | about a minute, under 10 cents |
| Filling the intake form from a deck | a few seconds, a few cents |

At 150 companies a month, the AI spend is under $100.

## Where it runs

The app is hosted at https://northledge-assessor-production.up.railway.app. Companies created there are kept between updates. These documents are served by the same app under `/docs`. The code is at https://github.com/ishaanndas/northledge-assessor and runs locally with one command; see the README.

## What a real version would add

- **Better intake.** Slide numbers that read as `deck p.4`, better website capture, call recordings turned into notes. The biggest and least glamorous piece of work.
- **A database** in place of folders, holding companies, sources, drafts, edits and the partners' decisions.
- **The second reader on every draft**, with its verdict shown next to each sentence alongside the quote check.
- **Sign-in**, and partner pages that can be sent as links.
- **A record of outcomes from day one**, so that after a year the tool can be judged on whether it helped the fund decide, not only on whether its quotes were real.

## Limits worth knowing

- The five example companies were written by the person who built the tool. They test the mistakes that person thought of.
- Each example was run once; a second run would be worded differently.
- The second reader has not yet been checked by a person.
- Very long documents make passages too big for a quote to pin precisely.
- The number check is literal: it misses numbers written as words and can be fooled by a coincidence.
