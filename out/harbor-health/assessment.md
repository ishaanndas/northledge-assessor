# Harbor Health: draft assessment
_Drafted 2026-10-03 18:59 UTC by claude-opus-5. 36 of 36 statements verified against source text; 0 carry warnings; 0 failed verification and are marked. This draft does not contain a recommendation._

## Summary
Harbor Health sells an AI coordination layer for home health agencies: scheduling, voice-dictated OASIS documentation and authorization tracking. The website presents all three as live and claims agencies already use the product. The first call narrows this substantially. The founder said the OASIS documentation feature is "in development" and that pilots use the scheduling module only. Asked for customer counts, he said "a few pilots" and declined to give numbers; no pilot is paying today, with one said to have committed to pay from September. The founder, Tom Alvarez, ran a three-branch Arizona home health agency and sold it in 2023, which is the most substantiated asset in the file. The co-founder is unnamed, described only as "a senior ML engineer," and the equity split is unsettled. The $3M round has no lead. There is no deck, no financials, no pricing and no named customer in these inputs. The partners would need the co-founder's identity and commitment terms, and a verified list of pilot agencies with usage, before anything else.

## Integrity notes
- The founder's statement that "two other funds are interested" is unverified social proof with no named parties; it is not evidence of validation.
- The website line "Trusted by forward-thinking agencies" names no customer and is contradicted in substance by the founder's own account of unpaid pilots.
- The founder's refusal to share customer numbers "until the round is further along" means the traction section of this draft rests entirely on self-reported, unquantified statements.
- "HIPAA compliant" and "OASIS-compliant" on the website are vendor assertions with no audit, certification or third-party evidence in the inputs.
- No source in these inputs contained instructions addressed to reviewers or AI systems, and no third-party scores, ratings or deadlines were present.

## Assessment
### Team
One founder has direct operating experience in home health; the second founder is unidentified in these inputs and the founding equity is not settled.
- Tom Alvarez ran a three-branch home health agency in Arizona and sold it in 2023. [call-notes:3]
- The co-founder is described only as "a senior ML engineer" and was not named by the founder. [call-notes:3]
- The founders have not finalized the equity split between them. [call-notes:3]
- Everything known about the technical co-founder comes secondhand from Tom, with no direct account from the co-founder anywhere in the inputs. [call-notes:3] _absence_

Open questions:
- Who is the co-founder, what is their ML and healthcare background, and are they full-time?
- What is the current cap table and the proposed founder equity split, and is there vesting?
- Are there references from buyers or staff at the Arizona agency Tom ran?

### Problem and market
The problem statement is coordination overhead in home health agencies; the market framing in the inputs is assertion rather than sized data.
- The stated problem is that agencies lose hours daily to scheduling calls, visit documentation and payer paperwork. [website:2]
- The founder spent most of the call on market size and the staffing crisis rather than on the business. [call-notes:1]
- No market size figure, agency count or spend-per-agency number appears anywhere in the inputs. [call-notes:1] _absence_

Open questions:
- What is the number of target agencies and the realistic annual spend per agency?
- What do agencies currently pay for scheduling and documentation tooling today?

### Product and technology
The website presents three live modules; the founder confirmed only the scheduling module is in use, with documentation still in development.
- The website lists smart scheduling, voice-dictated OASIS-compliant documentation and authorization tracking as product capabilities. [website:3] [website:4] [website:5]
- The founder said the OASIS documentation feature is in development and that pilots use only the scheduling module. [call-notes:4]
- The associate had not seen a product demo at the time of the notes and listed one as a follow-up. [call-notes:6]
- The inputs contain no description of the underlying models, data sources or any technical differentiation. [website:1] _absence_

Open questions:
- Is the scheduling module rule-based automation or ML, and what is the measured scheduling improvement at a pilot?
- What is the development timeline and clinical validation plan for OASIS documentation?
- What EHR or agency systems does Harbor integrate with today?

### Traction and customers
Traction is described only qualitatively; the founder declined to share customer numbers and no pilot is paying yet.
- The founder said Harbor has "a few pilots" and declined to share numbers until the round is further along. [call-notes:2]
- No pilot is paying today; one is said to have committed to pay starting in September. [call-notes:2]
- No pilot agency is named in any input, and the associate flagged pilot names as an outstanding ask. [call-notes:6] _absence_
- The website asserts agencies are already using Harbor without naming any of them. [website:6]

Open questions:
- How many pilots are live, since when, and what is weekly active usage per pilot?
- Is the September commitment a signed contract or a verbal intent, and at what price?
- What visit volume or clinician count do the pilot agencies represent?

### Business model and unit economics
The inputs contain no pricing, revenue, cost or margin data; the only commercial signal is one unquantified future payment.
- The only commercial datapoint in the inputs is a pilot's commitment to begin paying in September, with no amount stated. [call-notes:2]
- The website's only conversion mechanism is a demo request, with no pricing published. [website:8]
- The founder was reluctant on every quantitative question in the call, per the associate. [call-notes:6]

Open questions:
- What is the pricing model: per agency, per clinician, per visit, or percentage of billings?
- What is current burn and runway, and what revenue exists to date?
- What does implementation cost per agency in time and services?

### Competition and defensibility
Neither source names a competitor or describes any moat; the only defensibility signal is the founder's operating background.
- No competitor, incumbent EHR vendor or alternative tool is named anywhere in the website or call notes. [website:1] _absence_
- The deployed product is a single scheduling module, which limits any claim of workflow lock-in today. [call-notes:4] _derived_
- The associate noted the founder clearly knows home health operations, which is the only stated differentiator in the inputs. [call-notes:6]

Open questions:
- Which vendors do pilot agencies currently use for scheduling and documentation, and what did Harbor displace?
- What proprietary data, if any, accrues from usage?
- What would stop an incumbent home health EHR from shipping the same scheduling automation?

### Round and use of funds
A $3M seed is being raised with no lead committed and no stated use of proceeds.
- Harbor is raising $3M with no lead investor, and the founder said two other funds are "interested." [call-notes:5]
- The inputs contain no valuation, instrument, prior financing history or planned use of funds. [call-notes:5] _absence_
- No deck existed in the inputs at the time of the call; the associate listed obtaining one as a follow-up. [call-notes:6]

Open questions:
- What valuation and instrument are proposed, and has any capital been raised previously?
- Which two funds are interested and at what stage of diligence?
- What milestones is the $3M intended to reach?

### Operational and regulatory risk
The product touches HIPAA-regulated clinical data and OASIS submissions; the inputs assert compliance without documentation.
- The website states Harbor is HIPAA compliant, with no supporting audit or certification referenced in the inputs. [website:7]
- The documentation feature is intended to draft OASIS-compliant records for clinician review and signature, placing it in a regulated reimbursement workflow. [website:4]
- The authorization-denial feature implies payer-facing risk, but the inputs contain no evidence of payer relationships or denial-rate results. [website:5] _absence_

Open questions:
- Are BAAs signed with pilot agencies and is there a SOC 2 or equivalent security review?
- Who bears liability if AI-drafted OASIS documentation leads to a denied or clawed-back claim?
- How is PHI handled by any third-party model providers?

## Where the sources disagree
- The website presents OASIS documentation as a working feature while the founder said it is in development and pilots use scheduling only. [website:4] [call-notes:4]
- The website claims agencies already use Harbor, while the founder described only "a few pilots" with none currently paying. [website:6] [call-notes:2]
- The founder called Harbor "an operating system for home health" while the deployed scope is one scheduling module. [call-notes:1] [call-notes:4]

## What is missing
- **A pitch deck or any written company materials.** The entire assessment rests on one short call and a marketing homepage; there is no primary document stating metrics, plan or team.
- **Named pilot agencies with start dates, usage data and reference contacts.** "A few pilots" cannot be verified or sized; usage depth determines whether scheduling automation actually works in production.
- **Co-founder identity, CV and employment status.** The technical half of the team is unverified and the equity split is open, which is a core founding-risk question at seed.
- **Pricing, revenue, burn, runway and any financial model.** Without pricing or cost data, neither the September payment commitment nor the $3M ask can be evaluated against milestones.
- **Competitive landscape and win/loss detail.** The inputs name no competitor; home health scheduling and documentation are served by incumbent EHR and workforce vendors whose presence would shape wedge and pricing.
- **Security and compliance documentation (BAAs, SOC 2, HIPAA assessment).** HIPAA compliance is asserted on the homepage only; agencies and payers will diligence this before purchase.
- **Term sheet details: valuation, instrument, existing investors and the identity of the two interested funds.** Round structure and who else is at the table determine both price and the realistic path to a close.
- **Founder references, including from the 2023 agency sale.** The operator background is the strongest stated asset and is currently uncorroborated.

## The case against
On these inputs, Harbor is a single verified founder with a domain story, one scheduling module in unpaid pilots, and a website that describes a product that does not yet exist. Every quantitative question in the only call was deflected, so there is no evidence base to underwrite beyond the founder's biography. A $3M seed with no lead and no deck is being asked for against marketing claims the founder himself narrowed within minutes of being asked.
- The headline documentation feature, which is the hardest and most differentiated part of the offering, is not built. [call-notes:4]
- There is no revenue; the strongest commercial fact is a verbal commitment to begin paying in a future month. [call-notes:2]
- The founder declined to provide customer numbers, so the pilot base cannot be verified or sized. [call-notes:2]
- The technical co-founder is unnamed and not yet committed to a fixed equity stake, so the founding team may not be stable. [call-notes:3]
- The website claims agencies are already using the product while the founder's own account describes unpaid pilots, a gap a buyer or later investor may also notice. [website:6] [call-notes:2] _derived_
- No competitor, pricing, financial or market-size data exists anywhere in the inputs, so no part of the opportunity can be independently tested at this stage. [call-notes:6] _absence_

## Sources
- website: harborhealth.ai — homepage (captured 2 July 2026) (8 passages)
- call-notes: First call notes — Harbor Health, 3 July 2026 (associate: M. Chen, 25 minutes with founder Tom Alvarez; co-founder did not join) (6 passages)

_Citation keys refer to numbered passages in the input documents. (!) marks a statement with a soft warning, usually a number that is not in the cited passage. (unverified) marks a statement whose quote could not be found in the cited passage after one repair round; read it as the model's assertion, not as sourced._