# Fieldnote Labs: draft assessment
_Drafted 2026-10-03 22:38 UTC by claude-opus-5. 40 of 40 statements verified against source text; 0 carry warnings; 0 failed verification and are marked. This draft does not contain a recommendation._

## Summary
Fieldnote Labs sells voice-to-report software to independent agronomy consultants: spoken notes recorded in the truck become structured field reports with photos, GPS-tagged observations and a recommendation section. The deck reports $9,400 MRR from 78 paying consultants, 92% month-two retention and 61 reports per consultant per month. The first call narrows both headline numbers. Of the 78 accounts, 31 come from a single Saskatchewan co-op distributor deal that pays on the consultants' behalf and renews each January; direct paying consultants are 47. The 92% figure covers only consultants who completed onboarding, and about a third of sign-ups never do. Transcription is an off-the-shelf speech API; the claimed differentiation is an agronomy term dictionary and report templates built over eight months of the CEO's time. The round is $1.5M on a $9M post SAFE with $250k committed and seven months of runway. Partners would need the full cohort data including non-onboarded sign-ups, and the co-op distributor agreement with its January renewal terms, before the retention and revenue figures can be read at face value.

## Integrity notes
- No text in the inputs was addressed to reviewers or AI systems, and no instruction attempting to steer the assessment was found.
- Seven-month runway and a $250k commitment were stated as facts about the round; neither is evidence about the business and no expiring deadline was asserted in the inputs.
- The associate's characterisations "Maya is credible on the workflow" and "Demo was strong" are subjective first-call impressions from a 35-minute conversation, not verified evidence.
- All traction figures ($9,400 MRR, 78 consultants, 92% retention, 61 reports per month) are company-reported; the call confirmed the MRR verbally but no financial records were reviewed.
- Three items remain explicitly unverified by the associate's own follow-up list: cohort data including non-onboarded sign-ups, the co-op distributor agreement, and Jonah's Rev references.

## Assessment
### Team
Two founders with directly relevant domain and technical backgrounds; the company is effectively three to five people with no sales hire.
- CEO Maya Lindqvist was a certified crop adviser for nine years in Saskatchewan. [deck:5]
- CTO Jonah Reyes built speech pipelines at Rev for four years and has been full-time at Fieldnote since June. [deck:5] [call-notes:6]
- Beyond the founders the team is two part-time contractors, with no sales hire and Maya handling all sales. [call-notes:6]
- The associate's read that Maya is credible on the workflow is an impression from a 35-minute call, not a verified reference. [call-notes:1] [call-notes:8]

Open questions:
- Was Jonah part-time or elsewhere before June 2026, and what is the founder equity split?
- What do Jonah's Rev references say about his scope of ownership on speech pipelines?
- What are the two contractors working on and are they convertible to full-time hires?

### Problem and market
The problem statement is a concrete time cost per report; the market sizing is a simple headcount-times-price calculation on a narrow segment.
- The deck frames the problem as consultants visiting 15 to 25 farms a week and spending evenings typing reports that take 40 minutes each. [deck:1]
- The stated market is 14,000 independent crop consultants in the US and Canada, sized at $20M annually at $120 per month. [deck:4]
- The larger agribusiness retail agronomist segment is named but not sized anywhere in the inputs. [deck:4] [deck:6] _absence_
- No source gives the share of the 14,000 consultants that is realistically addressable or any bottom-up segmentation of it. [deck:4] _absence_

Open questions:
- Where does the 14,000 figure come from and what is its source year?
- How seasonal is consultant usage outside the growing season?
- What is the size and price tolerance of the retail agronomist segment the round is meant to unlock?

### Product and technology
The speech layer is bought in; the founders locate differentiation in an agronomy term dictionary and report templates built over eight months.
- The product converts spoken notes into a structured report with photos, GPS-tagged observations and a recommendation section. [deck:2]
- Transcription runs on an off-the-shelf speech API, with the agronomy term dictionary and report templates as the claimed differentiated layer, representing eight months of Maya's time. [call-notes:4]
- The inputs contain no transcription accuracy figures, no error-rate benchmarks against generic speech-to-text, and no description of how reports are reviewed before a farmer acts on them. [call-notes:4] [deck:2] _absence_

Open questions:
- Which speech vendor is used, at what cost per minute, and what happens if its pricing or terms change?
- How large is the agronomy term dictionary and how was it validated?
- Is any proprietary audio or correction data being accumulated that would improve accuracy over time?

### Traction and customers
Revenue is confirmed at $9,400 MRR, but the customer count and the retention figure are both narrower than the deck presents.
- $9,400 MRR from 78 paying consultants was confirmed on the call. [call-notes:2] [deck:3]
- 31 of the 78 accounts come from one Saskatchewan co-op distributor deal and 47 are direct paying consultants. [call-notes:2]
- The 92% month-two retention covers only consultants who completed onboarding, and about a third of sign-ups never complete onboarding and are excluded from the figure. [deck:3] [call-notes:3]
- Usage is reported at 61 reports per consultant per month, with no breakdown between co-op and direct accounts. [deck:3] [call-notes:8]
- No retention data beyond month two appears in any source. [deck:3] _absence_

Open questions:
- What is month-six and month-twelve retention for direct consultants?
- Do co-op-paid consultants use the product at the same rate as direct payers?
- Why do a third of sign-ups fail to complete onboarding, and has that rate moved?

### Business model and unit economics
Pricing is around $120 per consultant per month on the deck's own math, and the inputs contain no acquisition cost, gross margin or payback data.
- Blended revenue per paying consultant is roughly the $120 per month used in the deck's market sizing, derived by dividing $9,400 MRR across 78 paying consultants. [call-notes:2] [deck:4] _derived_
- Part of revenue is paid by a co-op on consultants' behalf rather than by the end user, and that contract renews annually in January. [call-notes:2]
- The inputs give no customer acquisition cost, gross margin, speech API cost per report, or payback period. [call-notes:4] [call-notes:6] _absence_

Open questions:
- What does the co-op pay per seat versus a direct consultant?
- What is the variable cost per report, including speech API and storage?
- How much does it cost to acquire a direct consultant today, given the founder does all selling?

### Competition and defensibility
The named incumbents are farm-management platforms without a voice-first flow; the founder herself expects one of them could add it.
- Maya characterised Climate FieldView and Agworld as farm-management platforms consultants find heavy, with no voice-first report flow today. [call-notes:5]
- The founder expects Agworld could add a voice-first flow. [call-notes:5]
- The claimed moat is the agronomy term dictionary and report templates, not the speech technology, which is purchased. [call-notes:4]
- No source covers general-purpose voice note or AI transcription tools as substitutes, nor any patent, data or switching-cost advantage. [call-notes:5] _absence_

Open questions:
- What would it cost Agworld or FieldView to replicate the agronomy dictionary?
- Do consultants need Fieldnote reports to flow into the farm-management platform their clients already use?
- How many consultants evaluated a generic transcription tool before choosing Fieldnote?

### Round and use of funds
$1.5M on a $9M post SAFE with $250k committed, against seven months of runway, funding two engineers, a sales lead and a retail integration.
- The round is $1.5M on a $9M post-money SAFE with $250k committed from an ag-focused angel group. [call-notes:7]
- Current runway is seven months. [call-notes:7]
- Proceeds are earmarked for two engineers, a sales lead and the agronomy retail integration. [deck:6]
- No cap table, prior SAFE terms, burn rate or milestone plan for the new capital appears in the inputs. [call-notes:7] _absence_

Open questions:
- What is the current monthly burn that produces seven months of runway?
- Are there earlier SAFEs or notes stacking into the $9M post?
- What specific milestone is the $1.5M meant to reach, and over how many months?

### Operational and regulatory risk
The product generates agronomic recommendations a farmer acts on, and the inputs say nothing about liability, data ownership or any regulatory treatment.
- The product outputs a recommendation section the farmer can act on, and no source addresses liability for an incorrect recommendation or transcription error. [deck:2] _absence_
- Field data is GPS-tagged and photographed, and no source states who owns that data when a co-op pays for the seat. [deck:2] [call-notes:2] _absence_
- Certified crop adviser reporting standards are not discussed anywhere in the inputs despite the CEO holding that background. [deck:5] _absence_

Open questions:
- Do certified crop adviser or provincial reporting rules constrain how a machine-generated report may be filed?
- Who owns consultant and farm data under the co-op agreement?
- What indemnity does the customer contract carry for erroneous recommendations?

## Where the sources disagree
- The deck presents 78 paying consultants while the call shows 47 direct payers plus 31 seats bought through a single co-op distributor deal. [deck:3] [call-notes:2]
- The deck's 92% month-two retention excludes the roughly one third of sign-ups who never complete onboarding, which the call makes explicit and the founder agreed should be disclosed. [deck:3] [call-notes:3]
- The deck's team slide describes both founders without noting that the CTO has been full-time only since June and that no sales hire exists. [deck:5] [call-notes:6]

## What is missing
- **Full cohort data including sign-ups who never completed onboarding.** The headline 92% retention is measured on a filtered population; true sign-up-to-paid conversion and retention cannot be assessed without it.
- **The Saskatchewan co-op distributor agreement.** 31 of 78 accounts and an unknown share of $9,400 MRR depend on one contract that renews in January; pricing, term, exclusivity and termination rights are unknown.
- **Jonah Reyes's Rev references.** The technical hire's speech-pipeline experience is the stated basis for execution on the core workflow and is currently unverified.
- **Cap table and prior financing instruments.** A $9M post SAFE cannot be evaluated for dilution or stacked instruments without knowing what already converts.
- **Monthly burn and a milestone plan for the $1.5M.** Runway is seven months; partners need to know what the round buys and what metric the next round would be raised against.
- **Unit economics: CAC, gross margin, speech API cost per report.** Pricing near $120 per month only works if variable costs and acquisition costs leave margin, and none of these figures appear.
- **Competitive landscape beyond the two platforms the associate named.** Generic AI transcription tools and other ag-specific note apps were not discussed, so substitution risk is unmeasured.
- **Customer references from direct paying consultants.** All qualitative evidence on product value comes from the founder and a demo, not from users.
- **Seasonality of usage and revenue.** Agronomy consulting is seasonal; monthly MRR and 61 reports per month may not hold outside the growing season.
- **Data ownership, liability and any regulatory treatment of generated recommendations.** The product issues agronomic recommendations farmers act on, and no source addresses who is responsible if one is wrong.

## The case against
Fieldnote is a thin application layer on a purchased speech API, selling into a segment the deck itself sizes at $20M a year, with roughly 40% of accounts resting on one co-op contract that renews in January. The two metrics that make the traction look strong, 78 customers and 92% retention, both shrink under questioning. A skeptical partner would say the company has 47 direct customers, one unproven channel, seven months of runway, and a feature that the incumbent the founder named could add.
- The deck's own market sizing caps the core segment at $20M a year, which constrains the outcome unless the unsized retail agronomist segment works. [deck:4]
- 31 of 78 accounts and the revenue attached to them sit behind one Saskatchewan co-op deal that renews annually in January, and the agreement has not been reviewed. [call-notes:2] [call-notes:8]
- Headline retention of 92% is survivor-filtered: about a third of sign-ups never complete onboarding and are excluded, so the real funnel is unmeasured. [deck:3] [call-notes:3]
- The technical core is bought in, and the defensible asset is a term dictionary and templates representing eight months of one founder's work, which the founder concedes Agworld could replicate. [call-notes:4] [call-notes:5]
- Sales is entirely founder-led with no sales hire, so there is no evidence that acquisition works without Maya. [call-notes:6]
- Seven months of runway against $250k committed of a $1.5M target means the round must close quickly, and no burn figure or milestone plan was provided to show what the money buys. [call-notes:7] [deck:6]
- No customer reference, churn curve beyond month two, or unit economics appear anywhere in the inputs, so the durability of the $9,400 MRR cannot be tested from these materials. [deck:3] [call-notes:8] _absence_

## Sources
- deck: Fieldnote Labs — Pre-seed deck (September 2026) (6 passages)
- call-notes: First call notes — Fieldnote Labs, 24 September 2026 (associate: M. Chen, 35 minutes with Maya Lindqvist) (8 passages)

_Citation keys refer to numbered passages in the input documents. (!) marks a statement with a soft warning, usually a number that is not in the cited passage. (unverified) marks a statement whose quote could not be found in the cited passage after one repair round; read it as the model's assertion, not as sourced._