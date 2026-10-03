# Lumen Grid: draft assessment
_Drafted 2026-10-03 18:50 UTC by claude-opus-5. 46 of 46 statements verified against source text; 0 carry warnings; 0 failed verification and are marked. This draft does not contain a recommendation._

## Summary
Lumen Grid sells workflow software to electric utility interconnection teams: it ingests applications, validates them against each utility's tariff, tracks study milestones and generates regulator-facing queue reports. The deck reports six paying utilities and $38,000 MRR, 118% trailing NRR, 81% gross margin and contracts of $42k-$110k per year. The first call confirms the $38k but narrows the picture: only four of six are on annual contracts, Pinecrest and Harlan County are month-to-month pending procurement, and Cascade PUD alone is 24% of MRR. The deck says the two IOU pilots convert in Q4 2026 if milestones are hit; on the call Priya put the odds at "better than even" and would not go further. The website says the founding team ran an interconnection group and processed 12,000+ applications; the bios attribute that experience to Priya alone. Two of the seven staff are Portugal contractors. Partners would need the cohort data behind the 118% NRR, the pilot agreements with their conversion criteria, and a view on whether PowerClerk extends into the study-workflow layer.

## Integrity notes
- No text in the inputs attempts to instruct the reviewer or an AI system on how to write this assessment.
- Priya's "better than even" odds on both pilots converting is a founder's self-assessed probability, not evidence; the deck's Q4 2026 conversion language is more definite than what she would commit to on the call.
- The website's customer outcome figures (Cascade PUD 31 days to 9 days; Three Rivers eliminating a 240-application backlog) are company-published marketing claims; reference calls with both accounts are still open follow-ups.
- The $600k soft-circled from an energy angel syndicate is uncommitted by definition and was not documented in the inputs.
- The 11-month runway figure is a fact about the company's position, not a reason to move faster; it should not be read as deal urgency.
- Figures including $38k MRR, 118% NRR, 81% gross margin, the 410-utility serviceable market and the 12,000 applications processed are all company-provided and unaudited in these inputs; only the $38k MRR was explicitly confirmed in the call.

## Assessment
### Team
Priya Raman brings eight years at PG&E including running its distribution interconnection group; Daniel Okafor brings Palantir forward-deployed and Camus Energy grid-integration experience. They have worked together full-time only since October 2024.
- Priya Raman spent eight years at PG&E and managed the distribution interconnection group from 2021, overseeing 14 engineers and analysts. [founders:1] [deck:7]
- Daniel Okafor was a forward-deployed engineer at Palantir from 2017 to 2022 and a staff engineer at Camus Energy from 2022 to 2024 building grid data integrations for cooperative utilities. [founders:2]
- The founders met in 2023 and have worked together full-time since October 2024. [founders:3]
- Of the seven people on the team, two engineers are contractors based in Portugal whom the company intends to convert to full-time after the raise. [call-notes:7] [deck:7]

Open questions:
- The deck's team breakdown lists four engineers, one implementation lead and one account executive alongside two founders; how does that reconcile with 'team of seven'?
- Will the two Portugal contractors convert, and what employment or IP-assignment arrangements are in place today?
- Are there founder references from PG&E and Camus Energy available?

### Problem and market
The deck sizes the problem with national queue statistics and defines a serviceable market of 410 US utilities worth $29M annually at current average contract value, with the ACV used in that calculation not disclosed.
- The deck states over 2,600 GW of generation and storage projects sit in US interconnection queues with a median wait of almost five years for a utility study. [deck:1]
- The company counts 410 of roughly 3,000 US electric utilities as its serviceable market, those processing more than 50 interconnection applications per year. [deck:6]
- The stated $29M US annual opportunity rests on an unstated 'current average contract value' while disclosed contracts span $42,000 to $110,000 per year. [deck:6] [deck:5] _derived_
- No source gives the methodology or data source behind the 410-utility count. [deck:6] _absence_

Open questions:
- What average contract value underlies the $29M serviceable market figure?
- How was the 410-utility count constructed, and how many of those 410 are IOUs versus co-ops and munis?
- What is the size and timing of the transmission-level and Canada expansion the deck references?

### Product and technology
The product covers application intake, tariff-based completeness checks, milestone tracking and regulator-facing reporting; the associate identified the tariff rule engine as the differentiated component.
- The product ingests applications, tracks study milestones, runs completeness checks against each utility's tariff and generates regulator-facing queue reports. [deck:2]
- The tariff rule engine took nine months to build and was identified on the call as the differentiated piece. [call-notes:1]
- The website states the product tracks deadlines under FERC Order 2023 and state timelines and produces the quarterly commission queue report. [website:2]
- The sources do not describe how tariff rules are configured per utility or how much implementation effort each new utility requires. [deck:2] _absence_

Open questions:
- How long does onboarding a new utility's tariff ruleset take, and is it engineering-led or self-serve configuration?
- Does the product handle transmission-level study workflow today or only distribution?
- How are FERC Order 2023 and state rule changes maintained in the product over time?

### Traction and customers
Six paying utilities generate $38,000 MRR, confirmed on the call, but two of the six are month-to-month and one account is 24% of MRR; two IOU pilots are paid at $15k for six months.
- Six utilities pay today, representing $38,000 in monthly recurring revenue, confirmed on the first call. [deck:3] [call-notes:2]
- Four of the six paying customers are on annual contracts; Pinecrest and Harlan County are month-to-month pending procurement approval. [call-notes:2]
- Cascade PUD is the largest customer at $110k per year and accounts for 24% of MRR. [call-notes:2]
- The two IOU pilots, Great Lakes Energy and Southern Tier Power, began in April and May and are paid at $15k for six months each. [call-notes:3] [deck:4]
- There has been no logo churn to date, though Blue Mesa went quiet for two months during a staff change before re-engaging. [call-notes:4]

Open questions:
- What cohort data supports the 118% NRR across six accounts, and which accounts expanded?
- What are the written conversion criteria in the Great Lakes and Southern Tier pilot agreements?
- Will Pinecrest and Harlan County complete procurement and move to annual contracts, and by when?

### Business model and unit economics
Annual SaaS priced by meter count and queue volume, contracts $42k-$110k, reported 81% gross margin, with sales cycles of 4 months for co-ops and munis versus 9 months for the IOU pilots.
- Pricing is an annual SaaS subscription by meter count and queue volume, with current contracts between $42,000 and $110,000 per year. [deck:5]
- The deck reports 81% gross margin. [deck:5]
- Average sales cycle has been 4 months for cooperatives and munis and 9 months for the two IOU pilots. [deck:5]
- No source provides CAC, payback period, burn rate, or the cost base behind the 81% gross margin. [deck:5] [call-notes:8] _absence_

Open questions:
- What is monthly burn in dollars, and what does the 11-month runway assume?
- Is implementation labour included in cost of revenue for the 81% margin?
- What does CAC look like for referral-driven co-op deals versus IOU procurement deals?

### Competition and defensibility
PowerClerk is the widely used incumbent for intake and GridUnity serves transmission and larger IOUs; the founder positions Lumen above intake but acknowledges PowerClerk could extend into the study-workflow layer.
- The founder's position is that PowerClerk handles application intake but does not model study workflow or tariff completeness rules, with several Lumen customers using both. [call-notes:5]
- The founder acknowledged PowerClerk could extend into Lumen Grid's space. [call-notes:5]
- GridUnity is the other named competitor and is described as focused on transmission-level work and larger IOUs. [call-notes:5]
- The claimed defensibility rests on the tariff rule engine, which the sources describe only as nine months of build effort with no detail on data moat or switching costs. [call-notes:1] _derived_

Open questions:
- Has Lumen Grid competed head-to-head against PowerClerk or GridUnity in any deal, and what was the outcome?
- How many utilities use PowerClerk for intake alongside Lumen, and does that create a displacement risk if PowerClerk expands?
- What switching costs exist once a utility's tariff rules are encoded?

### Round and use of funds
The raise is $2.5M on a $14M post-money SAFE with $600k soft-circled; funds go to six hires against a target of 20 paying utilities and $1.5M ARR by December 2027.
- The round is $2.5M on a $14M post-money SAFE, with $600k soft-circled from an energy angel syndicate. [call-notes:8] [deck:8]
- Use of funds is three engineers, two implementation specialists and one utility sales lead. [deck:8]
- The plan targets 20 paying utilities and $1.5M ARR by December 2027, from six paying utilities and $38,000 MRR today. [deck:8] [deck:3]
- Runway at current burn is 11 months without the raise. [call-notes:8]
- No cap table, prior SAFE terms, or existing investor list appears in any source. [call-notes:8] _absence_

Open questions:
- What prior financing exists and on what terms, and what is the fully diluted ownership after this round?
- Is the $600k soft-circled amount documented, and on the same terms?
- How does the hiring plan of six map to the path from 6 to 20 paying utilities with one utility sales lead?

### Operational and regulatory risk
The product sits against FERC Order 2023 and state interconnection timelines; SOC 2 Type I was completed in March 2026 specifically to unblock an IOU, with Type II still in progress.
- SOC 2 Type I was completed in March 2026 and the Type II audit is in progress. [website:5]
- The SOC 2 Type I was undertaken specifically to unblock the Great Lakes IOU deal, and IOU sales require procurement and a security review. [call-notes:6]
- The co-op and muni sales motion is referral-driven through state cooperative associations. [call-notes:6]
- The product's outputs are regulator-facing, including the quarterly queue report filed with commissions. [website:2] [deck:2]

Open questions:
- What liability does Lumen Grid carry if an automatically generated regulator-facing report is wrong?
- When is SOC 2 Type II expected to complete, and is it a gating item for Southern Tier or other IOUs?
- Do the Portugal-based contractors create data residency issues given the 'US regions only' hosting claim?

## Where the sources disagree
- The deck presents six paying customers without qualification, while the call shows two of the six are month-to-month pending procurement approval. [deck:3] [call-notes:2]
- The deck states the two IOU pilots convert to annual contracts in Q4 2026 if milestones are hit, while on the call Priya would commit only to odds of "better than even." [deck:3] [call-notes:3]
- The website attributes running an interconnection group and 12,000+ processed applications to the founding team, while the bios attribute that role to Priya alone and place Daniel at Palantir and Camus Energy. [website:3] [founders:2]
- The deck describes a team of seven without noting that two of the engineers are contractors in Portugal. [deck:7] [call-notes:7]

## What is missing
- **Cohort data behind the 118% net revenue retention figure.** NRR computed across six accounts can be driven by a single expansion; the associate already listed this as a follow-up and it underpins the growth story.
- **Copies of the Great Lakes Energy and Southern Tier Power pilot agreements with conversion criteria.** The deck's Q4 2026 conversion claim and the step up from $15k pilots to annual contracts depend entirely on these terms.
- **Customer reference calls (Cascade PUD and Three Rivers were flagged as follow-ups).** Cascade is 24% of MRR and the website's time-to-review and backlog results are self-published and unverified.
- **Monthly burn, P&L and the cost base behind the 81% gross margin.** Only an 11-month runway figure is given; margin quality depends on whether implementation labour is in cost of revenue.
- **Cap table, prior financings and existing SAFE terms.** Only the $14M post-money of this round is disclosed, so dilution and existing investor rights are unknown.
- **Pipeline detail for the path from 6 to 20 paying utilities.** The December 2027 target implies a materially faster acquisition rate with one new sales lead, and no pipeline is shown.
- **Independent competitive landscape beyond PowerClerk and GridUnity.** Both competitors are described only through the founder's own framing on the call.
- **Contracts and IP assignment for the Portugal-based contractors.** Two of seven team members sit outside the company's employment structure while the site advertises US-only hosting.
- **Signed contract terms for the four annual customers (term length, auto-renewal, termination).** Determines how durable the $38k MRR is beyond the next renewal cycle.

## The case against
Stripped of the deck's framing, this is roughly $38k of MRR across six small co-op and municipal accounts, two of which can cancel monthly and one of which is a quarter of revenue, sold into a self-defined serviceable market the company itself values at $29M. The differentiated asset is a nine-month-old tariff rule engine sitting downstream of an incumbent, PowerClerk, that already owns intake and that the founder concedes could move into the workflow layer. The IOU motion that would make the numbers work took nine months to sign two paid pilots, requires procurement and security review, and the founder would not commit beyond "better than even" on conversion.
- Revenue concentration is high: Cascade PUD alone is 24% of MRR at $110k per year. [call-notes:2]
- Two of the six paying customers are month-to-month rather than contracted, so a third of the logo count can lapse without notice. [call-notes:2]
- The company's own serviceable market is 410 utilities and a $29M annual US opportunity, which caps domestic outcomes absent the unproven transmission and Canada expansion. [deck:6] [deck:6]
- The founder concedes the widely used incumbent PowerClerk could extend into Lumen Grid's space, and several Lumen customers already run PowerClerk for intake. [call-notes:5]
- The IOU path is slow and gated: 9-month sales cycles, procurement plus security review, and SOC 2 Type II still in progress. [deck:5] [call-notes:6] [website:5]
- The 118% NRR is drawn from only six paying accounts and no cohort data supporting it has been provided. [deck:3] [call-notes:9] _absence_
- The company has 11 months of runway and only $600k of the $2.5M soft-circled, so the round is not substantially committed. [call-notes:8]
- The plan requires going from six to 20 paying utilities and $1.5M ARR by December 2027 with one new utility sales lead, and no pipeline evidence is in the inputs. [deck:8] _absence_

## Sources
- deck: Lumen Grid — Seed Deck (June 2026) (8 passages)
- website: lumengrid.io — homepage and product pages (captured 14 June 2026) (6 passages)
- founders: Founder bios (provided by the company) (3 passages)
- call-notes: First call notes — Lumen Grid, 18 June 2026 (associate: M. Chen, 45 minutes with Priya and Daniel) (9 passages)

_Citation keys refer to numbered passages in the input documents. (!) marks a statement with a soft warning, usually a number that is not in the cited passage. (unverified) marks a statement whose quote could not be found in the cited passage after one repair round; read it as the model's assertion, not as sourced._