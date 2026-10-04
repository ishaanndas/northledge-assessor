# Next steps and open questions

What it would take to go from this prototype to something a fund uses every week, in plain terms.

## Where it stands today

The prototype works end to end. Decks come in by upload, link or a sample inbox; the tool drafts an assessment where every sentence quotes its source; a program checks every quote; the associate edits the draft and sends it on. It has been tested on five example companies written for the purpose, two of them designed to trick it.

It is not yet ready for real deal flow. The quality has only been measured against examples we wrote ourselves, the code was built quickly to prove the idea, and there is no sign-in. The steps below close those gaps.

## 1. Test it against real assessments with a fund

This is the most important step and the one that only a fund can help with.

- **Gather real past cases.** Ask the fund for 50 to 100 companies it has already assessed by hand, with the inputs the associate had (deck, notes, bios) and the write-up they produced. Include companies the fund passed on and ones it backed.
- **Run the tool on all of them** and put each draft next to the associate's own write-up.
- **Have partners and associates grade the drafts.** Simple questions: would you send this to a partner after light edits? What did it get wrong? What did it miss that the associate caught? Was the case against the real reason the fund passed?
- **Agree what "good enough" means before starting.** For example: partners rate at least 8 in 10 drafts as usable with light edits, no invented facts reach a partner, and the case against names the fund's actual objection in most of the companies it passed on.
- **Adjust and repeat.** Tune the instructions the AI follows, the sections it writes and the checklist of what is missing, until the drafts meet that bar. Expect several rounds. Quality only gets to the fund's standard through real examples and real feedback; it cannot be reasoned into place.
- **Check the second reader too.** Have a person grade about 100 of the second reader's verdicts, so the fund knows whether "partly supported" can be trusted.

## 2. Have a seasoned engineer review and clean up the code

The prototype was built fast to prove the idea. Before real company data goes into it, an experienced engineer should go through it properly.

- **Review the code** for mistakes, weak spots and anything that would be hard to maintain.
- **Add automated tests** for the parts that matter most: reading decks, checking quotes, saving edits.
- **Replace folders with a proper database**, so companies, drafts, edits and decisions are stored safely and can be searched and backed up.
- **Add monitoring and alerts**, so someone knows straight away if drafting fails or the app goes down.
- **Tidy the structure** so a small team can work on it without stepping on each other.

## 3. Sign-in and permissions

- **Accounts for everyone who uses it**, signing in with the fund's existing Google or Microsoft accounts.
- **Decide who sees what.** For example, associates see the companies they are working on; partners see everything.
- **Keep a record of changes**: who edited a draft, who sent it, when.
- **Partner pages that can be shared as a link**, visible only to people at the fund.

## 4. Security and privacy

Founders send decks in confidence, so this needs care.

- **An agreement with the AI provider** that the fund's data is not used for training and is not kept longer than needed.
- **Encryption** of stored decks and drafts, and regular backups.
- **A clear place where the data lives**, agreed with the fund.
- **A way to delete a company's data completely** when asked.
- **A check of the app by someone who looks for security problems** before launch.

## 5. Connect the fund's inbox

The goal is that nobody uploads anything: decks arrive by email and are waiting, read and drafted, when an associate opens the app. The connection is built with each fund rather than shipped as one button, because:

- Google and Microsoft each require the fund's own credentials for a read-only connection, which the fund's IT sets up with us.
- Every fund routes deal flow differently: a shared deals@ address, a label, a forwarding rule, sometimes a Slack channel.

The app already has the screens for this and saves the settings; what remains is setting up the credentials with the fund and testing on their real mail.

## 6. Fit it to how the fund works

- **The sections of the assessment** the fund's partners expect, in their order.
- **The fund's own checklist of what is missing**: the documents and numbers they always ask founders for.
- **House style** for the summary and the case against.
- **The format partners read in**: a link, a PDF, a Word file, a weekly digest.
- **What "good fit" means for this fund.** Today the fit tag is judged on the evidence in the draft alone. With the fund's thesis (stage, sectors, round size, geography) written down, the tag can be judged against it, and the topic tags can follow the fund's own vocabulary.
- **Sending from the app.** Send to partner currently opens the associate's own email app. Sending directly, and seeing when a partner opened it, would go through the same email connection as the inbox.
- **Connect the fund's CRM, if it has one.** Most funds already track deal flow somewhere: a CRM such as Affinity, Attio, HubSpot or Salesforce, or a shared spreadsheet or Notion board. If they do, the tool should fit into it rather than become a second list. That means mapping their fields to ours (company, stage, owner, round, fit, tags, status), deciding which way information flows (create the company in the CRM when a deck arrives, write the fit, tags and a link back once the draft is ready, read the partners' decision back for the outcome record), and avoiding duplicates when the same company arrives twice. Like the inbox, this is built per fund, once we know what they use.

## 7. Start recording outcomes from day one

To judge after a year whether the tool helped the fund decide better, these need saving from the first day: the draft as written and as edited, the partners' decision and their reason, every follow-up question sent to a founder, and every fact that diligence later proved wrong. The Evaluation document explains how these would be used.

## 8. Roll out gradually

- **Two weeks alongside the current process.** Two associates run the tool on every company but still write their own assessments. Nothing goes to partners from the tool.
- **Two weeks on by default for those two associates.** They edit the draft instead of starting from scratch.
- **Then everyone**, with the source viewer open in partner meetings.
- **Keep going only if** quality holds on a weekly spot check, partners never find a claim they cannot trace, and associates choose to use it without being told to.

## Open questions for the fund

- Where do decks arrive today, and who receives them?
- What do they use to track companies today: a CRM such as Affinity, Attio, HubSpot or Salesforce, a spreadsheet, a Notion board, or nothing? Should the tool feed it, read from it, or both?
- If there is a CRM, which fields matter (stage, owner, status, source of the deal), and who keeps them up to date?
- Where are partners' decisions and reasons recorded today, so they can be linked back to the draft?
- What do partners read today, in what format, and what do they wish it had?
- Which past companies can be used for testing, and who can grade the drafts?
- What does "good enough" look like to the partners, in their words?
- Who should be able to see which companies?
- Which fit labels and topic tags would partners actually sort by?
- How long should decks and drafts be kept, and where?
- Should the tool ever read anything beyond what the fund gives it, such as reference call notes or data-room documents?
- Who at the fund owns the checklist and the house style once it is live?

## Rough order and effort

Steps 1 and 2 can run at the same time and are the bulk of the work: a few weeks each, depending on how quickly the fund can share past cases and grade drafts. Steps 3 to 6 are standard work once the code has been cleaned up. Step 7 is small but has to be in place before launch, and step 8 is about two months of careful use before the tool is part of the normal process.
