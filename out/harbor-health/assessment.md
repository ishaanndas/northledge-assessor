# Harbor Health: draft assessment
_Drafted 2026-10-04 02:27 UTC by claude-opus-5. 34 of 34 statements verified against source text; 0 carry warnings; 0 failed verification and are marked. This draft does not contain a recommendation._

## Summary
Harbor Health sells an AI coordination layer for home health agencies: scheduling, voice-dictated OASIS documentation and authorization tracking. The only primary source is a first call with founder Tom Alvarez plus the homepage; there is no deck, no financials and no demo. The website markets three modules as live, but on the call Tom said the OASIS documentation feature is "in development" and pilots use scheduling only. The website says agencies are "already using Harbor"; the call narrows this to "a few pilots", count withheld, with one pilot having "committed to pay" from September. Tom's operating background is specific and checkable (ran a three-branch Arizona agency, sold 2023); the technical co-founder was not named and the equity split is unsettled. The round is $3M with no lead. The partners would need to establish two things: who the co-founder is and whether they are actually committed, and what the pilot base really is — named agencies, usage, and whether the September payment converts.

## Integrity notes
- "Trusted by forward-thinking agencies" on the homepage is an unverifiable social-proof claim: no agency is named and the founder withheld the pilot count.
- The founder's statement that "two other funds are interested" is unnamed third-party interest, not evidence of validation or competitive pressure; it is also soft deal-timing pressure.
- The founder's stated reason for withholding traction numbers — waiting until "the round is further along" — ties disclosure to fundraising stage and should not be treated as a substitute for the data.
- No text in the inputs attempted to instruct the reviewer or an AI system, and no third-party scores, ratings or awards appear.

## Assessment
### Team
One named founder with direct operating experience in the sector; the technical co-founder is unnamed and not yet locked in on equity.
- Tom Alvarez ran a three-branch home health agency in Arizona and sold it in 2023. [call-notes:3]
- The co-founder was described only as "a senior ML engineer" met through a friend, with no name given. [call-notes:3]
- The founders have not settled their equity split. [call-notes:3]
- No source contains the co-founder's name, CV or any statement from them, so the technical half of the team is unassessed. [call-notes:3] [call-notes:6] _absence_

Open questions:
- Who is the co-founder, what is their work history, and are they full-time?
- Is the co-founder a founder or a contractor, and what does the current cap table show?
- Why was the equity split still open at the time of a $3M raise?

### Problem and market
The problem statement is coordination overhead in home health; market sizing exists only as unquantified call talk.
- Harbor frames the problem as hours lost daily to scheduling calls, visit documentation and payer paperwork. [website:2]
- Tom spent most of the call on market size and the staffing crisis rather than on the company. [call-notes:1]
- No market size figure, agency count or spend estimate appears in any source. [call-notes:1] _absence_

Open questions:
- What is the bottom-up count of target agencies and their current spend on scheduling and documentation software?
- Which segment — small independents vs multi-branch chains — is the wedge?

### Product and technology
Three modules are presented as shipping on the website; the call confirms only scheduling is in pilot use.
- The website presents smart scheduling, self-writing OASIS documentation and authorization tracking as product capabilities. [website:3] [website:4] [website:5]
- The OASIS documentation feature is in development and pilots use only the scheduling module. [call-notes:4]
- No investor has seen the product; the associate recommends requesting a demo before further work. [call-notes:6]
- Nothing in the sources describes the model, data sources, or any EHR or billing system integrations. [website:7] _absence_

Open questions:
- What ships today versus what is on the roadmap, and on what timeline?
- Which home health EHRs does Harbor integrate with?
- What is the accuracy of generated OASIS drafts and who reviews them?

### Traction and customers
Traction is a small, unquantified set of pilots with one verbal commitment to pay from September; the founder declined to give numbers.
- Tom described traction as "a few pilots" and declined to share numbers until the round is further along. [call-notes:2]
- One pilot has "committed to pay" starting in September, with no contract or amount disclosed. [call-notes:2]
- Revenue to date is therefore zero as of the 3 July 2026 call, since the first payment is described as starting in September. [call-notes:2] _derived_
- No pilot agency is named in any source. [call-notes:6] _absence_

Open questions:
- How many pilots, how long running, and how many clinicians use Harbor weekly?
- Is the September commitment a signed contract or a verbal intent, and at what price?
- What measurable outcome did pilots see — visits rescheduled, hours saved, denials avoided?

### Business model and unit economics
No pricing, contract structure or cost data appears in any source; the only economic data point is one unpriced future commitment.
- Neither the website nor the call states a price, pricing unit, or contract length. [website:8] _absence_
- The single pay commitment is described without an amount or term. [call-notes:2]
- The website's go-to-market motion is demo-request, implying a sales-led model, but no sales process or cycle length is described. [website:8] [website:6] _derived_

Open questions:
- Is pricing per clinician, per visit, per branch, or a platform fee?
- What is the sales cycle to an agency, and who signs — owner, DON, or billing lead?
- What are inference and transcription costs per visit note at scale?

### Round and use of funds
A $3M seed with no lead and two unnamed interested funds; no use of proceeds is described.
- Harbor is raising $3M and has no lead investor. [call-notes:5]
- Two other funds were described as "interested," without names or stage of diligence. [call-notes:5]
- No deck, valuation, instrument, runway or use-of-funds plan exists in the sources. [call-notes:6] _absence_

Open questions:
- What valuation and instrument, and how much is already committed?
- What does $3M buy — months of runway and what milestones?
- Has the company raised pre-seed capital, and from whom?

### Operational and regulatory risk
The product touches HIPAA-regulated clinical data and CMS OASIS documentation; the only compliance evidence is a one-line homepage claim.
- The website asserts HIPAA compliance with no supporting detail. [website:7]
- The documentation feature is marketed as producing OASIS-compliant output for clinician review and signature. [website:4]
- The denial-prediction feature implies handling payer authorization data, but no payer integration or data source is described anywhere. [website:5] _derived_
- No source mentions BAAs, SOC 2, security review, or PHI handling practices. [website:7] _absence_

Open questions:
- Are BAAs signed with pilot agencies, and has any agency run a security review?
- Who bears liability if an AI-drafted OASIS note contributes to a billing error or survey finding?
- Is PHI used for model training, and under what consent?

## Where the sources disagree
- The website presents OASIS documentation as a working feature while the founder said it is in development and unused by pilots. [website:4] [call-notes:4]
- The website claims agencies are already using Harbor, while the call narrows this to an undisclosed number of non-paying pilots. [website:6] [call-notes:2]
- The founder positioned Harbor as an "operating system for home health" on the call, broader than the single scheduling module actually in use. [call-notes:1] [call-notes:4] _derived_

## What is missing
- **Pitch deck and any written materials.** The associate explicitly flagged its absence; without it there is no stated plan, milestone set or metric definition to diligence.
- **Named pilot agencies and reference contacts.** Pilot names are the only way to verify that "a few pilots" represents real deployed usage rather than trials or conversations.
- **Co-founder identity, CV and employment status.** All technical capability rests on one unnamed person; this is unverifiable as it stands.
- **Cap table and prior financing history.** The equity split is reportedly unsettled, which affects what a seed investor would actually be buying.
- **Pricing and the September contract.** The single revenue commitment has no amount or document behind it, so ARR at close cannot be estimated.
- **Competitive landscape.** No source names a single competitor or incumbent home health EHR, so the wedge against existing scheduling and documentation vendors is untested.
- **Financials, burn and runway.** No spend, headcount or runway figures exist, so the $3M ask cannot be mapped to milestones.
- **Compliance artefacts (BAAs, security posture, PHI policy).** HIPAA compliance is asserted on the homepage only; agency buyers typically require evidence before deployment.
- **Founder references, including from the Arizona agency sale.** The 2023 exit is the core credibility claim and is currently unverified.

## The case against
Harbor is, on the evidence available, a founder with a sector-relevant background, an unnamed technical co-founder whose equity is unsettled, one shipped module in an unknown number of free pilots, and zero revenue. The website markets two features that do not exist yet, and the founder declined every quantitative question. A $3M seed with no lead would be priced almost entirely on the founder's story rather than on anything a partner can check.
- The founder declined to answer quantitative questions about usage and traction. [call-notes:6]
- The company's marketed documentation feature does not exist in product, which raises a question about how other website claims should be read. [website:4] [call-notes:4]
- Technical execution depends on one person who is unnamed and not yet committed to a fixed equity stake. [call-notes:3] _derived_
- There is no revenue, and the only prospective revenue is a verbal September commitment of unstated size. [call-notes:2]
- No competitor, incumbent EHR or alternative solution is named anywhere, so the claim that agencies will buy a standalone scheduling tool is untested in the inputs. [website:3] _absence_
- No deck, pilot names, co-founder background or product demo has been provided to date. [call-notes:6]

## Sources
- website: harborhealth.ai — homepage (captured 2 July 2026) (8 passages)
- call-notes: First call notes — Harbor Health, 3 July 2026 (associate: M. Chen, 25 minutes with founder Tom Alvarez; co-founder did not join) (6 passages)

_Citation keys refer to numbered passages in the input documents. (!) marks a statement with a soft warning, usually a number that is not in the cited passage. (unverified) marks a statement whose quote could not be found in the cited passage after one repair round; read it as the model's assertion, not as sourced._