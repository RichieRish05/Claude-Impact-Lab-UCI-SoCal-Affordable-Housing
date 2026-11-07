Groundwork: Product Spec
Nov 7, 2026 · @Rishi
Overview
Groundwork lets anyone ask in plain English where new homes can go in Orange County, see the qualifying lots on a map, and track each lot from "found" to "funded." The MVP covers Huntington Beach and California's starter-home law (SB 684 as expanded by SB 1123).
The problem. The OC median home price rose from $799,000 in September 2016 to nearly $1.4 million in March 2026. Huntington Beach alone must plan for 13,368 homes under its state housing allocation, and adopted its housing element on June 16, 2026 after court-ordered penalties. Yet nobody has a simple way to see which specific lots qualify for fast, no-hearing approval under state law, across 34 cities with 34 different zoning codes.
How it covers all three tracks.
Track
What Groundwork does
Find it
Natural-language search over every parcel, scored for SB 684/1123 eligibility and possible homes
Clear it
Project pipeline with an auto-generated approval checklist and the 60-day ministerial review clock
Fund it
Per-project capital stack that matches funding sources, starting with the OC Housing Finance Trust
Users
The primary user is a small builder or nonprofit developer looking for land; city staff and funders are secondary.
User
Job to be done
What they use
Small builder or nonprofit developer
Find lots that qualify for fast approval and move them toward a permit
Search, projects, checklist
Community land trust or housing nonprofit
Build a pipeline of sites for starter homes
Search, pipeline board
City planning staff
See which lots could meet housing element targets
Search, countywide totals
Funder (e.g. OC Housing Finance Trust)
See projects ready for gap financing
Funding panel, pipeline board
Scope
The MVP makes search real for one city and keeps tracking simple; everything else is seeded or deferred.
Area
Hackathon MVP
Later
Geography
Huntington Beach only
All 34 OC cities, then other counties
Eligibility rules
SB 684/1123 plus HB's residential zone standards
SB 9 lot splits, ADUs, transit-area density, faith-land housing
Search
Filter panel plus natural language, sharing one query
Saved searches and alerts when new lots qualify
Projects
Create, update, move between stages; checklist; 60-day clock
Teams, permissions, document uploads, city portal sync
Funding
Manual capital stack with 10 to 20 seeded programs
Automatic eligibility matching and application drafting
Data freshness
One-time snapshot
Scheduled refresh from county and city sources
Non-goals for the hackathon. No legal advice or guarantees of eligibility. No contacting real property owners. No integration with city permit systems. No pricing or acquisition modeling beyond assessed value.
Feature 1: Land search (filters and natural language)
Search has two entry points that share one filter state and one query: a filter panel people set by hand, and a chat box where the LLM sets the same filters for them. The LLM never reads parcels directly, so the same filters always return the same lots.
Filter panel (deterministic search)
Filter
Control
Field
SB 684 eligible
Toggle
sb684_eligible
Vacant
Toggle, with confidence threshold
vacant, vacant_confidence
Zone
Multi-select: single-family, multifamily, or specific zone codes
zone
Lot size
Range slider (sq ft)
lot_sqft
Possible homes
Minimum, 1 to 10
max_homes
Assessed value
Maximum ($)
assessed_value
Near a place
Address or street plus radius (mi)
geom
Near transit
Maximum distance (ft)
dist_transit_ft
Flood zone
Exclude toggle
flood_zone
Neighborhood
Multi-select
neighborhood
Map area
Draw a rectangle or lasso on the map
geom
• Results update as filters change, with a running count ("142 lots · 611 possible homes").
• Sort by possible homes, lot size, assessed value or distance.
• The full filter set lives in the URL, so any search can be bookmarked, shared or saved to a project.
• Export results as CSV.
• No LLM in this path: same filters in, same lots out.
How a natural-language query runs
1. The user types a question, for example "vacant lots near Beach Blvd that could fit at least 4 starter homes."
2. The LLM picks tools and arguments: geocode "Beach Blvd," then search_parcels with vacant = true, sb684_eligible = true, max_homes >= 4, within 0.5 mi.
3. The database returns matching parcels; the map highlights them and a results list shows APN, address, lot size and possible homes.
4. The LLM writes a two-sentence summary ("23 lots match; most are along the northern stretch") with no numbers it didn't get from a tool.
Filter chips. Every filter the LLM applied appears as an editable chip above the map (Vacant · SB 684 eligible · 4+ homes · within 0.5 mi of Beach Blvd). Users can remove or edit a chip without retyping. This is the main trust feature: anyone can see exactly what was searched. Chips and the filter panel show the same state, so editing one updates the other, and a user can switch between typing and clicking at any point.
Follow-ups. The conversation keeps the current filter set, so follow-ups refine it:
• "Only ones under $1M assessed value" adds a chip.
• "Which of these is closest to a bus stop?" sorts by transit distance.
• "Why does 1234 Main St qualify?" calls get_parcel and explains each rule it passed, citing the code section.
• "Save the top 3 to a new project called HB Starter Homes" calls save_to_project.
Example queries for testing
Query
Expected behavior
Where can I build 10 starter homes in Huntington Beach?
Eligible lots with max_homes = 10 ("starter homes" means eligible; vacant is added only when asked)
Show vacant single-family lots under an acre
Vacant, single-family zone, area < 43,560 sq ft
Lots that fit 4+ homes within half a mile of a park
Spatial filter on a parks layer
Which neighborhoods have the most buildable lots?
Grouped count by neighborhood, shown as a heat map
Find something to build on
Asks one clarifying question, or shows top eligible lots by homes possible
Out-of-scope questions ("Is this a good investment?") get a short answer that the tool covers zoning eligibility only.
Feature 2: Project tracking
A project is one or more parcels plus everything needed to get homes built on them; it is where search results turn into work.
Pipeline stages (shown as a board, one column per stage):
1. Found: saved from search
2. Screening: team confirms eligibility and site conditions
3. Owner outreach: contact the owner (drafted, never auto-sent)
4. Feasibility: unit count, rough cost, funding gap
5. Application submitted: starts the 60-day review clock
6. Approved
7. Funded
8. Under construction
Project page contents
Panel
What it shows
Parcels
Map of the project's lots, APNs, lot size, zone, possible homes
Checklist
Auto-generated from the approval pathway (below)
Review clock
Days remaining in the 60-day ministerial review; turns amber at 15 days, red when missed
Funding
Capital stack: total cost, each source and amount, remaining gap
Activity
Timestamped log of stage changes, notes and AI actions
Assistant
Chat scoped to this project
SB 684/1123 checklist (seeded). Items come from the state's qualifying criteria and typical city application materials:
[ ] Lot is zoned multifamily, or is vacant and zoned single-family
[ ] Lot is no larger than 1.5 acres and substantially surrounded by urban uses
[ ] New parcels at least 600 sq ft (multifamily zone) or 1,200 sq ft (single-family zone)
[ ] 10 or fewer parcels and 10 or fewer homes
[ ] Tentative parcel map prepared
[ ] Owner authorization (if applicant is not the owner)
[ ] Occupancy affidavit (if an existing unit is demolished or altered)
[ ] Complete application submitted; record the date
AI helpers inside a project
• Draft an owner outreach letter from the project's facts; the user edits and sends it themselves.
• Summarize status: "Application submitted 22 days ago; 38 days left; $1.2M funding gap."
• Answer "what's blocking this?" from unchecked items and the funding gap.
• Suggest funding sources from the seeded program list for this project's size and income targets.
Data and eligibility engine
All eligibility work happens offline before the demo: the LLM reads each zone's rules once, code applies them to every parcel, and results are stored as columns search can filter on.
Sources
Data
Source
Notes
Parcel boundaries, APN, size, land use, assessed value
OC Public Works, OC Survey parcel landbase (free download)
May not include zoning
Zoning districts
Huntington Beach city GIS zoning layer
Joined to parcels by spatial overlay
Zoning code text
Huntington Beach municipal code, residential chapters
Input to LLM extraction
Vacancy
Assessor land-use codes, confirmed with satellite imagery for top results
Flag uncertain lots
Context layers
Transit stops, parks, flood zones
Optional, for search filters
Pipeline
1. Load parcels and the zoning layer into PostGIS; spatial-join so each parcel gets a zone.
2. For each residential zone (expect 3 to 6 in HB), send the code text to the LLM and get back structured rules as JSON: minimum lot size, setbacks, height, parking, units allowed, source section.
3. A person spot-checks every extracted zone against the code before it is used.
4. Code computes per-parcel fields: vacant flag, SB 684 eligibility, possible new parcels, max homes, and a plain-English reason.
5. Store results; search reads only these columns.
State rules applied in code (SB 684 as amended by SB 1123)
• Multifamily-zoned lot, or vacant single-family-zoned lot
• Lot no larger than 1.5 acres, substantially surrounded by urban uses
• New parcels no smaller than 600 sq ft (multifamily) or 1,200 sq ft (single-family)
• Up to 10 parcels and 10 homes
Precomputed fields per parcel: apn, address, geometry, zone, lot_sqft, vacant, vacant_confidence, sb684_eligible, max_homes, eligibility_reason, assessed_value, dist_transit_ft, flood_zone, neighborhood.
Architecture and stack
A Next.js app talks to one Postgres database with PostGIS; the LLM sits behind an API route and can only act through five tools.
Questions flow left to right through the assistant and its tools; the offline jobs fill the database before anyone searches.
Stack
Layer
Choice
Why
Front end
Next.js, MapLibre or Mapbox GL
Fast map rendering, one codebase
Database
Neon Postgres + PostGIS, Prisma, Neon Auth
Spatial queries, auth and hosting in one
LLM
Claude with tool use
Reliable tool calling for search and helpers
Offline data jobs
Python with GeoPandas
Load, join and score parcels
Hosting
Vercel + Neon
Deploys in minutes
Database schema (core tables)
parcels (apn PK, address, geom, zone, lot_sqft, vacant, vacant_confidence,
         sb684_eligible, max_homes, eligibility_reason, assessed_value,
         dist_transit_ft, flood_zone, neighborhood)
zone_rules (zone PK, rules_json, source_section, verified_by, verified_at)
projects (id PK, name, stage, pathway, submitted_at, total_cost, created_at)
project_parcels (project_id FK, apn FK)
checklist_items (id PK, project_id FK, label, done, done_at)
funding_sources (id PK, project_id FK, program, amount, status)
activity (id PK, project_id FK, kind, body, created_at)
LLM tools
Tool
Arguments
Returns
search_parcels
filters (vacant, eligible, min_homes, zone, max_value, ...), limit, sort
Parcel list + count
near
place name or point, radius_mi
Geometry to pass into search_parcels
get_parcel
apn
All fields + rule-by-rule eligibility explanation
save_to_project
apns, project name or id
Project id and link
update_project
project id, stage or checklist item or note
Updated project
The search response returns the filter set alongside results, so the front end renders it as chips. The filter panel calls the same search endpoint directly, with no LLM involved. Tool results are capped (e.g. 200 parcels) and the map draws from the same query, so the LLM never handles large lists.
Demo script (3 minutes)
One story, Huntington Beach, walks through all three tracks: find the land, start the clock, close the funding gap.
Time
Screen
What the presenter says or does
0:00
Title slide
OC median home price is nearly $1.4M; HB must plan for 13,368 homes. Where do they go?
0:20
Search, empty map
Type: "Where can I build starter homes in Huntington Beach?" Map lights up; show the total count of eligible lots
0:50
Filter chips
Follow-up: "only ones that fit at least 4 homes near Beach Blvd." Chips update; open the filter panel to show the same filters, adjustable by hand
1:15
Parcel card
Ask "why does this one qualify?" Show the rule-by-rule explanation with code citations
1:35
Save to project
"Save the top 3 to a project called HB Starter Homes." Open the board
1:55
Pipeline board
Drag the project to Application submitted; the 60-day clock appears. Show two seeded projects further along
2:15
Project page
Checklist, AI status summary, draft owner letter
2:35
Funding panel
Add OC Housing Finance Trust and two seeded programs; the gap bar shrinks
2:50
Closing
One number: X lots, Y possible homes in one city, found in seconds
Live vs. cached. Search and the project actions run live. Zone extraction is precomputed. Keep a recorded video of the full flow as a fallback.
Build plan
The plan assumes a 24-hour event and four people; the rule is that an end-to-end ugly version works by hour 8, and everything after is polish.
Hours
Data
Backend + LLM
Front end
Product + demo
0 to 2
Download parcels and HB zoning; load into PostGIS
Enable PostGIS on Neon, schema, API skeleton
Next.js app, map showing raw parcels
Collect zone code text; draft 20 test queries
2 to 6
Spatial join; vacancy flag
Zone extraction prompt; run on HB residential zones
Results list and parcel card
Spot-check extracted rules against the code
6 to 8
Compute eligibility and max_homes
search_parcels and get_parcel tools wired to Claude
Chat box; highlight results on map
Run test queries; log failures
8 to 14
Context layers (transit, parks)
near, save_to_project, update_project tools
Filter chips; pipeline board
Seed funding programs and 2 sample projects
14 to 20
Fix data edge cases
Project assistant and owner letter draft
Project page: checklist, clock, funding panel
Write pitch; first full rehearsal
20 to 24
Freeze data
Prompt tuning on failed queries
Visual polish, loading states
Record backup video; final rehearsals
Checkpoint at hour 8: a typed question returns highlighted eligible lots on the map. If not, cut the transit and parks layers and the funding panel first.
Risks and open questions
The biggest risk is wrong eligibility results; every mitigation points back to keeping rules in code and showing users exactly why a lot qualified.
Risk
Mitigation
LLM misreads a zoning rule
Extract once per zone, human spot-check, store source section, show citation on every parcel card
Vacancy flag is wrong (land-use code outdated)
Show a confidence level; confirm top results with satellite imagery
"Substantially surrounded by urban uses" is hard to compute
Approximate from neighboring parcel land uses; label it as an estimate
LLM invents numbers in summaries
Summaries may only use values returned by tools; test with adversarial queries
Parcel data lacks zoning
Join the city zoning layer; fall back to manually digitizing zones for the demo area
Live demo fails
Cached responses for the scripted queries plus a recorded video
Judges question legal accuracy
State clearly it is a screening tool, not legal advice; show the verification step
Open questions
[x] Does HB's zoning layer download cleanly, and which zone codes count as single-family vs. multifamily? Yes. Single-family is RL; multifamily is RM, RMH, RMH-A and RH; RMP is a mobile-home park zone. The search's zone groups follow zone_rules.
[ ] Has HB's June 2026 housing element changed any zoning we should reflect?
[ ] Which 10 to 20 funding programs do we seed, and does anyone on the team know their eligibility rules?
[ ] Can we get a planner or housing attorney to review the rules for 30 minutes?
[ ] Event length and team size: adjust the build plan if not 24 hours and four people.
Sources
• Rep. Derek Tran: $250,000 for OC Housing Finance Trust (OC home prices)
• Argent: Huntington Beach housing element penalties and RHNA
• Burke Williams & Sorensen: SB 1123 revisions to SB 684
• City of East Palo Alto: SB 684/1123 lot criteria
• San Mateo County: SB 684/1123 eligibility and checklist
• SB 684 staff review template (60-day review)
• New Santa Ana: OC Housing Finance Trust background
• MuckRock: OC Survey parcel landbase