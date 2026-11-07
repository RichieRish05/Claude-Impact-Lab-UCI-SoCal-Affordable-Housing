# Natural-language search, filter chips and "near a street"

Nov 7, 2026. Builds Feature 1's natural-language path from `PRODUCT_SPECS.MD` on top of the existing filter-panel search at `/dashboard`.

## Why

This is the opening of the demo (0:20 to 1:35 in the spec's script). Someone types "Where can I build starter homes in Huntington Beach?", the map lights up with eligible lots, and the total count lands as the punchline. Today the app can only do that by hand through the filter panel, which looks like any GIS tool. The typed question is the moment judges remember.

**Success:** the scripted questions light up the right lots on the map within a few seconds, the count reads as the punchline, and every filter Claude applied is visible as a chip the presenter can remove.

## Goals

- A question box that turns plain English into the existing filter set and runs the existing search.
- Filter chips above the map showing every active filter, each removable.
- A new "near a street" filter (street name plus radius), usable from the chat, the panel and the URL.
- Follow-ups that refine the current search ("only ones under $1M").
- "Why does this one qualify?" answered from the stored eligibility reason, with the zone rule's code citation.

## Non-goals

- Geocoding addresses or landmarks ("near Golden West College", "near 123 Main St"). Streets only for now.
- Map-area drawing, CSV export, saved searches.
- `save_to_project`, `update_project`, projects, the pipeline board, funding.
- Persisting the conversation. Filters survive a reload because they're in the URL, but the chat history doesn't.
- Neighborhood questions: the `neighborhood` column is empty in the real data.

## Anti-goals (a failure even if it technically works)

- **Chatty answers.** The chat stays quiet: one or two sentences. The map and chips do the talking.
- **Invented numbers.** The summary may only use numbers a tool returned.
- **Claude reading or choosing parcels.** Claude only picks filters. The same filters always return the same lots, whether they came from the chat, the panel or a shared URL.
- **Chips, panel and map disagreeing.** They all read one filter state: the URL.

## What the user sees

Layout A from the mockups (chosen by the user):

- A question box floats at the top of the map, Google Maps style.
- Under it: the filter chips (`SB 684 eligible ✕` `4+ homes ✕` `Within 0.5 mi of Beach Blvd ✕`), then the one- or two-sentence summary.
- The filter panel stays on the left and the results list on the right, unchanged. The running count ("123 lots · 1,029 possible homes") stays where it is in the results header.
- While Claude is working, the box shows a pending state, and the map keeps the previous results until the new filters arrive.
- Removing a chip, or changing the panel, updates the URL, and the map, list and count follow. Chips show whenever filters are active, including when they were set from the panel.

## How it works

### Filter state

The URL is still the only filter state (`lib/parcel-filters.ts`, `lib/hooks/use-parcel-filters.ts`). The chat's result is a filter set the client writes with `setFilters`. Nothing else changes in how the map and list fetch.

### The assistant procedure

A new tRPC router (`assistant`) with one `protectedProcedure` mutation, `ask`:

- **Input:** the new message, the conversation so far (prior user messages and Claude's replies, text only), the current filter set, and the selected APN if a lot is selected, so "this one" can be resolved.
- **Server:** runs a Claude tool-use loop with two tools, below. The system prompt includes the current filters so follow-ups build on them, the rules from this document (quiet summaries, numbers only from tools, zoning-eligibility scope only), and the Huntington Beach zone codes and groups from `ZONE_GROUPS`.
- **Output:** `{ filters, reply }`. `filters` is the filter set from Claude's last `search_parcels` call, or the unchanged input filters if it didn't search, as with a "why" question. `reply` is the text shown under the chips.

Tools:

| Tool | Arguments | Returns to Claude |
|---|---|---|
| `search_parcels` | the full filter set, using `parcelFiltersSchema` | `total`, `totalHomes`, the top 10 lots (APN, address, zone, lot size, possible homes, assessed value), and, for a near filter, whether the street was found |
| `get_parcel` | `apn` | all stored fields, `eligibility_reason`, and the zone's `source_section` from `zone_rules` |

`search_parcels` reuses `buildParcelWhere` and the totals query from `app/api/trpc/parcels.ts`, so the chat and the panel can't drift apart. It doesn't build geometry.

**Follow-ups:** Claude always sends the full filter set it wants. It starts from the current filters in the prompt, so "only ones under $1M" keeps the earlier filters and adds `maxValue`.

**"Starter homes" means eligible only (the user's decision).** "Where can I build starter homes?" sets `eligible` and nothing else. Claude adds `vacant` only when the question says "vacant" or "empty". The pipeline already counts only open land as eligible, so adding vacant would cut the citywide count from 123 lots to 39. This differs from the spec's example table, which expects "Vacant, eligible lots" for "Where can I build 10 starter homes?"; update that row in `PRODUCT_SPECS.MD` to match.

**Out of scope:** questions like "is this a good investment?" get one line saying Groundwork covers zoning eligibility only, and filters stay unchanged.

**Vague questions:** for "find something to build on", show the eligible lots sorted by possible homes rather than asking a clarifying question. This is the spec's second option. It keeps the demo moving.

### "Near a street" filter

New fields in `parcelFiltersSchema`: `nearStreet` (string) and `nearMi` (number, 0.1 to 2, defaulting to 0.5 when `nearStreet` is set). These need new URL params, a panel control (a street text input and a radius), and a chip.

The street is resolved from parcel addresses, with no outside service. Addresses look like `424 19th St, Huntington Beach, CA`, so the street is the first comma-separated part without the house number. A lot matches when its polygon is within `nearMi` of the polygon of any lot whose street matches `nearStreet` (edge to edge). If no lot is on that street, the search returns no lots, and `search_parcels` tells Claude the street wasn't found so the reply can say so.

Street normalization (Claude's call), applied to both the address and the typed name:
- Ignore case.
- Strip unit and space numbers after the street ("Beach Blvd Spc 169", "N Pacific Ave # 1").
- Ignore a leading direction letter (N, S, E, W), so "Pacific Ave" matches "S Pacific Ave".
- Treat common suffix spellings as the same ("Blvd" and "Boulevard", "St" and "Street", "Ave" and "Avenue", "Dr" and "Drive", "Ln" and "Lane").
- A typed name with no suffix ("Beach") matches any suffix.

Checked against the dev data: citywide, 123 lots are eligible, with 1,029 possible homes, and 39 of those are also vacant. About 86 eligible lots with 4+ homes are within half a mile of Beach Blvd, measured edge to edge (9 if vacant is added too). Tests should assert on the rules, not these counts, because the pipeline can be re-run.

## Constraints

- Follow `site/CLAUDE.md`: tRPC procedures for API routes, hooks in `lib/hooks/`, queries through Prisma (`$queryRaw` for spatial), minimal comments, and docs updated in the same change, including removing the built gaps from "Spec vs. current code".
- Install `@anthropic-ai/sdk`, and add `ANTHROPIC_API_KEY` to `.env.local`. Server code only reads it.
- Eligibility stays in `../pipeline/`. The app reads stored columns only.
- Tests run in Vitest's node environment with `@/lib/db` mocked. No component tests.

## Calls made by Claude (not discussed with the user)

- **Model:** `claude-sonnet-5-5`, for speed on stage. Switch to Opus if tool choices are unreliable in the test queries.
- **No streaming:** the reply is short, so a pending state is enough.
- **Chips are remove-only:** editing a value happens in the panel, which shows the same state.
- **The conversation lives in client state only.** A reload or a manual "clear" starts a new one.
- **The default radius is half a mile.**
- **Zone groups follow the pipeline.** `ZONE_GROUPS` currently lists Multifamily as `RM` and `RMH` only, but the pipeline treats `RMH-A` as multifamily, and `RMH-A` holds 48 of the 123 eligible lots. Update `ZONE_GROUPS` to match the housing type each zone has in `zone_rules` (single-family, multifamily, mobile-home park). This also changes the panel's zone toggles. Note it under the spec's open question on HB zone codes.
- **"Why" answers stay short.** Following the user's "quiet chat" answer, the reply is still one or two sentences, built from `eligibility_reason`. The code citation goes on the parcel card instead: `parcels.search` also returns the zone's `source_section`, and the card shows it under the reason, with no LLM involved. The card is what the presenter points at on stage.
- **No cached demo answers.** The spec's risk table lists cached responses as a live-demo fallback. That stays out of this work; the recorded backup video covers it.

## Testing

- Unit tests: the near-street `WHERE` clause and suffix normalization, the URL round trip for the new params, and the `ask` procedure with a mocked Anthropic client. Check that it returns the last search's filters, keeps the filters unchanged when there's no search, and rejects tool arguments that fail the schema.
- A script that runs the spec's example queries, plus the demo script's questions and an adversarial "make up a number" question, against the real API and dev data, printing the filters and reply for each. Run it by hand before the demo, not in CI.

## Left to the builder

- Component structure and styling of the question box and chips, within layout A.
- Exact system prompt wording and tool descriptions.
- How the street match is written in SQL. Precompute nothing unless it's slow; it must stay well under a second on the dev data.
- How tool-argument validation errors go back to Claude.
- The tool-loop turn limit.
