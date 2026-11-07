# Natural-Language Search Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A question box over the `/dashboard` map that turns plain English into the existing filter set, with removable filter chips and a new "near a street" filter.

**Architecture:** Claude never reads parcels. A tRPC mutation `assistant.ask` runs a tool-use loop whose `search_parcels` tool takes `parcelFiltersSchema` and reuses `buildParcelWhere`. It returns `{ filters, reply }`, and the client writes `filters` to the URL, the only filter state, so the map, list, panel and chips all follow. "Near a street" is a regular filter: a scalar subquery over lots whose normalized address street matches.

**Tech Stack:** Next.js 16, tRPC 11 with TanStack Query, Prisma `$queryRaw` with PostGIS, zod 4, `@anthropic-ai/sdk`, and Vitest in the node environment.

**Spec:** `site/docs/superpowers/specs/2026-11-07-natural-language-search-design.md`. Read it before starting. Also read `site/CLAUDE.md` and `site/AGENTS.md`: this Next.js version differs from training data, so check `node_modules/next/dist/docs/` before touching Next APIs.

All paths below are relative to `site/`. Run commands from `site/`.

## Global Constraints

- API routes are tRPC procedures (`protectedProcedure`). Custom hooks go in `lib/hooks/`, one per file. All DB access goes through `db` from `lib/db.ts`, with `$queryRaw` for spatial queries.
- Comments stay minimal: only for constraints the code can't show.
- Tests live in `tests/**/*.test.ts`, mirroring source paths. Mock `@/lib/db`, `@/lib/auth/session` and `@/lib/anthropic`. There are no component tests, because there's no jsdom.
- Model: `claude-sonnet-5-5`, exported as `ASSISTANT_MODEL`. Before writing SDK code, load the `claude-api` skill for current SDK usage.
- `ANTHROPIC_API_KEY` is read only server-side, from `.env.local`.
- Replies are one or two sentences, and their numbers come only from tool results.
- "Starter homes" sets `eligible` only. `vacant` is set only when the question says "vacant" or "empty".
- Default radius: `NEAR_DEFAULT_MI = 0.5`. `nearMi` ranges from 0.1 to 2.
- The street search must stay well under one second on the dev data.

## Review Focus

1. **A follow-up after removing a chip by hand.** The next question must start from the URL's current filters, not from the filters Claude last returned. Test this in Task 4: `ask` uses `input.filters` as the base.
2. **A street that doesn't exist** ("near Fake Blvd"). Expect zero lots, a reply that says the street wasn't found, and a removable chip. Test this in Task 4: `search_parcels` reports `streetFound: false`.
3. **Claude sends invalid tool arguments** (`minHomes: 20`). Claude gets an error tool result and retries, and the user doesn't see a 500. Test this in Task 4.
4. **Claude never calls a tool, or the loop runs out of turns.** Expect the filters unchanged and a reply still returned. Test this in Task 4: the turn limit returns a fallback reply.
5. **A shared URL with `mi` but no `street`.** The radius is ignored, and no chip appears for it. Test this in Task 1 (URL parsing) and Task 3 (chips).

---

### Task 1: Zone groups and the near-street filter in the schema and URL

**Files:**
- Modify: `lib/parcel-filters.ts`
- Create: `lib/streets.ts`
- Test: `tests/lib/parcel-filters.test.ts`, `tests/lib/streets.test.ts`

**Interfaces:**
- Produces:
  - `ZONE_GROUPS`: `{ "Single-family": ["RL"], Multifamily: ["RM", "RMH", "RMH-A", "RH"] }`. Remove the "Provisional" comment and replace it with one saying the groups mirror `zone_rules.rules_json.housing_type`. `RMP` is a mobile-home park and belongs to neither group.
  - `parcelFiltersSchema` gains `nearStreet: z.string().trim().min(1).max(80).optional()` and `nearMi: z.number().min(0.1).max(2).optional()`.
  - `NEAR_DEFAULT_MI = 0.5`.
  - URL params `street` (from `nearStreet`) and `mi` (from `nearMi`).
  - `normalizeStreet(name: string): { base: string; suffix: string | null } | null` in `lib/streets.ts`. It returns null for an empty name.

- [ ] **Step 1: Write the failing tests.**

  In `parcel-filters.test.ts`:
  - Add `nearStreet: "Beach Blvd", nearMi: 0.5` to the "round-trips every filter" fixture.
  - Add a test that `parse("mi=1")` equals `{ sort: "homes" }`. The `mi` param is dropped when there's no `street`.
  - Add a test that `parse("street=Beach%20Blvd&mi=5")` equals `{ sort: "homes", nearStreet: "Beach Blvd" }`. A radius outside 0.1 to 2 is dropped.

  In `streets.test.ts`, each case runs `normalizeStreet(input)`:

  | Input | Expected |
  |---|---|
  | `"Beach Blvd"` | `{ base: "beach", suffix: "blvd" }` |
  | `"BEACH BOULEVARD"` | `{ base: "beach", suffix: "blvd" }` |
  | `"S Pacific Ave"` | `{ base: "pacific", suffix: "ave" }` |
  | `"Pacific Avenue"` | `{ base: "pacific", suffix: "ave" }` |
  | `"Beach"` | `{ base: "beach", suffix: null }` |
  | `"Main Street"` | `{ base: "main", suffix: "st" }` |
  | `"Golden West Dr"` | `{ base: "golden west", suffix: "dr" }` |
  | `"Oak Lane"` | `{ base: "oak", suffix: "ln" }` |
  | `"   "` | `null` |
  | `"N"` | `{ base: "n", suffix: null }` (a lone letter isn't stripped as a direction) |

- [ ] **Step 2: Run the tests and confirm they fail.** Run `pnpm vitest run tests/lib/parcel-filters.test.ts tests/lib/streets.test.ts`. They should fail on the new fields and the missing module.

- [ ] **Step 3: Implement the changes.**
  - `nearStreet` is a string field. Parse and write it like a single list value, and add it to the `PARAM` map so `countActiveFilters` counts it.
  - `nearMi` joins `NUMBER_FIELDS`, but `filtersFromSearchParams` drops it when `nearStreet` is absent.
  - In `normalizeStreet`:
    - Lowercase the name, collapse whitespace, and strip one leading `n`, `s`, `e` or `w` token when more tokens follow.
    - Map the last token through `SUFFIXES`: `{ blvd: ["blvd","boulevard"], st: ["st","street"], ave: ["ave","avenue"], dr: ["dr","drive"], ln: ["ln","lane"], rd: ["rd","road"], cir: ["cir","circle"], ct: ["ct","court"], pl: ["pl","place"], way: ["way"], hwy: ["hwy","highway"] }`.
    - Export `SUFFIXES`, because Task 2's SQL uses the same list.

- [ ] **Step 4: Run the tests and confirm they pass.** Run the same command, then `pnpm test` to check that nothing else broke.

- [ ] **Step 5: Commit** with the message "Add the near-street filter and complete the multifamily zone group".

### Task 2: Near-street SQL, the street check, and the code citation

**Files:**
- Modify: `app/api/trpc/parcels.ts`
- Test: `tests/app/api/trpc/parcels.test.ts`

**Interfaces:**
- Consumes: `normalizeStreet` and `SUFFIXES` (Task 1), and `NEAR_DEFAULT_MI`.
- Produces:
  - `buildParcelWhere(filters)` handles `nearStreet` and `nearMi`.
  - `streetSql(): Prisma.Sql` is the SQL expression for an address's normalized `{base, suffix}`, so the WHERE clause and the street check share it.
  - `countStreetLots(street: string): Promise<number>`.
  - `ParcelResult` gains `source_section: string | null`.
  - `searchSummary(filters: ParcelFilters, limit: number): Promise<{ total: number; totalHomes: number; parcels: Pick<ParcelResult, "apn" | "address" | "zone" | "lot_sqft" | "max_homes" | "assessed_value">[] }>` runs the totals and a narrow top-N query with no geometry. Task 4 uses it.

- [ ] **Step 1: Write the failing tests.**
  - `buildParcelWhere({ sort: "homes", nearStreet: "Beach Blvd" })`:
    - The SQL contains `ST_DWithin(`.
    - `values` contains `"beach"`, `"blvd"` and `804.672`, which is 0.5 mi in meters.
  - With `nearMi: 1`, `values` contains `1609.344`.
  - With `nearStreet: "Beach"`, the suffix value is `null`, so any suffix matches.
  - `search` returns `source_section` on each parcel. Mock a row with `source_section: "HBZSO §210.06"` and check it's passed through.
  - `searchSummary` returns `{ total, totalHomes, parcels }` from the mocked queries. Check that its page query SQL contains no `ST_AsGeoJSON`.

- [ ] **Step 2: Run the tests and confirm they fail.** Run `pnpm vitest run tests/app/api/trpc/parcels.test.ts`.

- [ ] **Step 3: Implement the changes.**
  - The near condition is a scalar subquery, which Postgres runs once as an InitPlan:
    ```sql
    ST_DWithin(geom::geography,
      (SELECT ST_Union(geom) FROM parcels WHERE <street matches>)::geography,
      <meters>)
    ```
    Add a `geom && ST_Expand(<that union>, <degrees margin>)` prefilter if needed to meet the time limit.
  - `streetSql()` takes `split_part(address, ',', 1)` and then:
    - lowercases it;
    - strips the leading house-number token;
    - strips everything from ` spc `, ` unit `, ` apt `, ` ste ` or ` #` to the end;
    - strips a leading `n `, `s `, `e ` or `w `;
    - splits off the last token as the suffix, mapped through `SUFFIXES`.
  - It matches when `base = $base AND ($suffix IS NULL OR suffix = $suffix)`.
  - Add `LEFT JOIN zone_rules USING (zone)` to the page query, selecting `source_section`.

- [ ] **Step 4: Run the tests and confirm they pass.** Run the same command.

- [ ] **Step 5: Check against the dev data.** Open the Neon dev branch (`br-orange-block-arnnbd70`) through Neon MCP `run_sql`, or with `psql "$DATABASE_URL"`. Run `EXPLAIN ANALYZE` on the totals query that `buildParcelWhere({ sort: "homes", eligible: true, minHomes: 4, nearStreet: "Beach Blvd" })` produces, with the values substituted. It passes when:
  - The count is about 86.
  - The execution time is under 500 ms.
  - The street check counts about 547 lots for "Beach Blvd", because space numbers are now included.

  If it's slower, add the `&&` prefilter and measure again.

- [ ] **Step 6: Commit** with the message "Filter parcels by distance to a street and return the zone's code citation".

### Task 3: Filter chips, near-street panel controls, and the citation on the card

**Files:**
- Create: `lib/filter-chips.ts`, `app/dashboard/filter-chips.tsx`
- Modify: `app/dashboard/filter-panel.tsx`, `app/dashboard/results-list.tsx` (`ParcelCard`), `app/dashboard/parcel-search.tsx`
- Test: `tests/lib/filter-chips.test.ts`

**Interfaces:**
- Consumes: `ParcelFilters`, `ZONE_GROUPS`, `NEAR_DEFAULT_MI`, and `ParcelResult.source_section`.
- Produces:
  - `type ChipKey = "eligible" | "vacant" | "zones" | "lot" | "minHomes" | "maxValue" | "maxTransitFt" | "excludeFlood" | "neighborhoods" | "near"`.
  - `filterChips(filters: ParcelFilters): { key: ChipKey; label: string }[]`.
  - `removeChip(filters: ParcelFilters, key: ChipKey): ParcelFilters`.
  - `<FilterChips filters onChange={setFilters} />`.

- [ ] **Step 1: Write the failing tests.**
  - Chips appear in this order, with these exact labels:
    - `{ eligible: true }` gives `"SB 684 eligible"`.
    - `{ vacant: true, minVacantConfidence: 0.8 }` gives `"Vacant (80%+ sure)"`.
    - `{ zones: ["RM","RMH","RMH-A","RH"] }` gives `"Multifamily"`.
    - `{ zones: ["RL","RM"] }` gives `"Zones RL, RM"`.
    - `{ minLotSqft: 2000, maxLotSqft: 43560 }` gives one chip, `"Lot 2,000–43,560 sq ft"`.
    - `{ maxLotSqft: 43560 }` gives `"Lot under 43,560 sq ft"`.
    - `{ minHomes: 4 }` gives `"4+ homes"`.
    - `{ maxValue: 1_000_000 }` gives `"Under $1M assessed"`.
    - `{ maxTransitFt: 1320 }` gives `"Within 1,320 ft of transit"`.
    - `{ excludeFlood: true }` gives `"Outside flood zones"`.
    - `{ neighborhoods: ["Oak View"] }` gives `"Oak View"`.
    - `{ nearStreet: "Beach Blvd" }` gives `"Within 0.5 mi of Beach Blvd"`.
    - `{ nearStreet: "Beach Blvd", nearMi: 1 }` gives `"Within 1 mi of Beach Blvd"`.
  - `sort` never produces a chip, and `{ nearMi: 1 }` alone produces none.
  - `removeChip(…, "vacant")` also clears `minVacantConfidence`. `removeChip(…, "lot")` clears both lot bounds. `removeChip(…, "near")` clears `nearStreet` and `nearMi`. Every other field and `sort` stay the same.

- [ ] **Step 2: Run the tests and confirm they fail.** Run `pnpm vitest run tests/lib/filter-chips.test.ts`.

- [ ] **Step 3: Implement `lib/filter-chips.ts`.** Use the formatters in `lib/format.ts` where they fit.

- [ ] **Step 4: Run the tests and confirm they pass.**

- [ ] **Step 5: Build the UI.**
  - `FilterChips` renders a wrapping row of pills, each with a ✕ button labelled `Remove <label>` that calls `onChange(removeChip(filters, key))`. It renders nothing when there are no chips.
  - In `ParcelSearch`, render the chips in a top overlay inside the map `<section>`, in the slot that Task 5's ask box will sit above.
  - In `FilterPanel`, add a "Near a street" section with a text input for `nearStreet` and a radius `NumberField` for `nearMi`, with placeholder `0.5`, step 0.1 and range 0.1 to 2. The radius is disabled until a street is entered. Commit the street on blur or Enter, not on every keystroke, because each change runs a search.
  - In `ParcelCard`, show `source_section` as a small muted line under the eligibility reason, prefixed "Zoning code:".

- [ ] **Step 6: Check it in the browser.**
  - Run `pnpm dev` and sign in.
  - Open `/dashboard?eligible=1&homes=4&street=Beach%20Blvd`. Three chips should show, and the count should read about 86 lots.
  - Remove the street chip. The count should rise to the citywide 4+ homes total, and the panel's street input should clear.
  - Select a lot. The card should show the citation.
  - Run `pnpm lint` and `pnpm exec next typegen && pnpm exec tsc --noEmit`. Both should be clean.

- [ ] **Step 7: Commit** with the message "Show active filters as removable chips and add near-street controls".

### Task 4: The assistant procedure

**Files:**
- Create: `lib/anthropic.ts`, `app/api/trpc/assistant.ts`, `app/api/trpc/assistant-prompt.ts`
- Modify: `app/api/trpc/router.ts`, `package.json` (add `@anthropic-ai/sdk`)
- Test: `tests/app/api/trpc/assistant.test.ts`

**Interfaces:**
- Consumes: `parcelFiltersSchema`, `searchSummary`, `countStreetLots` and `ZONE_GROUPS`.
- Produces:
  - `lib/anthropic.ts` exports `anthropic`, an `Anthropic` client, and `ASSISTANT_MODEL = "claude-sonnet-5-5"`.
  - `askInputSchema`:
    ```ts
    z.object({
      message: z.string().trim().min(1).max(1000),
      history: z.array(z.object({ role: z.enum(["user", "assistant"]), text: z.string() })).max(20),
      filters: parcelFiltersSchema,
      selectedApn: z.string().optional(),
    })
    ```
  - `runAssistant(input: AskInput): Promise<{ filters: ParcelFilters; reply: string }>`.
  - `assistantRouter` with `ask: protectedProcedure.input(askInputSchema).mutation(...)`, mounted as `appRouter.assistant`.
  - `MAX_TURNS = 6`.

**Tools:**

| Tool | Input | Returns (as JSON text) |
|---|---|---|
| `search_parcels` | JSON Schema from `z.toJSONSchema(parcelFiltersSchema)` | `searchSummary(filters, 10)`, plus `streetFound` when `nearStreet` is set (`countStreetLots > 0`) |
| `get_parcel` | `{ apn: string }` | the parcel's stored fields and `source_section` from one `$queryRaw` with a `LEFT JOIN zone_rules`, with no geometry, or `{ error: "No parcel with that APN" }` |

`buildSystemPrompt(filters, selectedApn)` goes in `assistant-prompt.ts`. It must state:
- Groundwork covers Huntington Beach and SB 684/1123 zoning eligibility only.
- Claude picks filters and never reads parcels.
- `search_parcels` always takes the full filter set, starting from the current filters (given as JSON), and a follow-up refines them.
- "Starter homes" sets `eligible` only, and `vacant` is set only when the question says "vacant" or "empty".
- The zone groups, from `ZONE_GROUPS`.
- "Near a street" uses `nearStreet`, with a default radius of 0.5 mi.
- A vague question shows eligible lots sorted by homes.
- "This one" means `selectedApn` (if given).
- Replies are one or two sentences, with numbers only from tool results.
- An out-of-scope question gets one line saying Groundwork covers zoning eligibility only, with no search.

- [ ] **Step 1: Write the failing tests.** Mock `@/lib/anthropic`'s `anthropic.messages.create` with a queue of responses, plus `@/lib/db` and `@/lib/auth/session`. Call through `createCallerFactory(appRouter)({})` as a signed-in user. Tests:
  - **"returns the last search's filters"**: the first response is a `tool_use` of `search_parcels` with `{eligible:true, sort:"homes"}`, then a second `search_parcels` with `{eligible:true, minHomes:4, sort:"homes"}`, then a text reply `"86 lots match."`. The result should be `{ filters: { eligible: true, minHomes: 4, sort: "homes" }, reply: "86 lots match." }`.
  - **"keeps filters when there is no search"**: Claude returns text only. The result filters should equal `input.filters`, which has `{ minHomes: 4, sort: "homes" }` (Review Focus 1).
  - **"builds on the URL's filters"**: the system prompt sent to `messages.create` contains `JSON.stringify(input.filters)`.
  - **"reports a missing street"**: with `nearStreet: "Fake Blvd"` and `countStreetLots` returning 0, the tool result content sent back contains `"streetFound":false` (Review Focus 2).
  - **"returns schema errors to Claude"**: `search_parcels` with `{ minHomes: 20 }` gets a tool result with `is_error: true`, and the filters from that call aren't used (Review Focus 3).
  - **"stops after MAX_TURNS"**: every response is a `tool_use`. `messages.create` should be called 6 times, and the result should have the last valid filters and a reply of `"I couldn't finish that search. Try rephrasing it."` (Review Focus 4).
  - **"answers why from get_parcel"**: Claude calls `get_parcel` with `selectedApn`, and the `db.$queryRaw` mock is called with that APN as a value.
  - **"rejects signed-out users"**: the call is rejected with `UNAUTHORIZED`.

- [ ] **Step 2: Run the tests and confirm they fail.** Run `pnpm vitest run tests/app/api/trpc/assistant.test.ts`.

- [ ] **Step 3: Install the SDK and implement.**
  - Run `pnpm add @anthropic-ai/sdk`.
  - Write a manual loop over `anthropic.messages.create`, not the SDK's tool runner, so tests can feed it responses.
  - Use `max_tokens: 1024`.
  - Map history to alternating text messages.
  - Run multiple `tool_use` blocks in a turn with `Promise.all`.
  - An Anthropic API error becomes a `TRPCError` `INTERNAL_SERVER_ERROR` with the message `"The assistant is unavailable. Use the filters instead."`.

- [ ] **Step 4: Run the tests and confirm they pass.** Run the same command, then `pnpm test`.

- [ ] **Step 5: Commit** with the message "Add the assistant procedure with search and parcel tools".

### Task 5: The ask box

**Files:**
- Create: `lib/hooks/use-assistant.ts`, `app/dashboard/ask-box.tsx`
- Modify: `app/dashboard/parcel-search.tsx`

**Interfaces:**
- Consumes: `trpc.assistant.ask.mutationOptions()`, `setFilters` from `useParcelFilters`, and `<FilterChips>` (Task 3).
- Produces:
  - `useAssistant({ filters, selectedApn, onFilters })` returns `{ ask(message: string): void; reply: string | null; pending: boolean; error: string | null; clear(): void }`.
  - The hook keeps `history` in `useState`. On success it appends the user and assistant turns, sets `reply`, and calls `onFilters(result.filters)`.
  - `clear()` empties the history and the reply, and leaves the filters alone.

- [ ] **Step 1: Build the hook and the box.**
  - The box is a rounded input with a submit button, overlaid at the top of the map section (layout A), with `FilterChips` and then the reply directly below it.
  - The placeholder is "Ask where homes can go in Huntington Beach…".
  - While pending, the input is disabled and shows "Thinking…", and the map keeps its current results.
  - An error shows as one red line in the reply slot.
  - A small "New question" link calls `clear()`.
  - Each request sends the current URL filters, not a stored copy.

- [ ] **Step 2: Check it in the browser.** Run `pnpm dev` and add `ANTHROPIC_API_KEY` to `.env.local`. Then:
  - Type "Where can I build starter homes in Huntington Beach?". It passes when there's one `SB 684 eligible` chip, the count is 123 lots and 1,029 homes, and the reply is at most two sentences.
  - Follow up with "only ones that fit at least 4 homes near Beach Blvd". It passes when `4+ homes` and `Within 0.5 mi of Beach Blvd` chips are added and the count is about 86.
  - Remove the `4+ homes` chip, then ask "only under $1M". The `4+ homes` chip should stay gone.
  - Select a lot and ask "why does this one qualify?". The reply should be short, and the card should show the citation.
  - Run `pnpm lint` and the typecheck.

- [ ] **Step 3: Commit** with the message "Add the question box over the dashboard map".

### Task 6: Query check script and docs

**Files:**
- Create: `scripts/try-assistant.ts`
- Modify: `package.json` (add `tsx` as a dev dependency and a `"try:assistant": "tsx --env-file=.env.local scripts/try-assistant.ts"` script), `CLAUDE.md`, `PRODUCT_SPECS.MD`

- [ ] **Step 1: Write the script.**
  - It calls `runAssistant` directly, with no auth, for each of these questions, starting from `{ sort: "homes" }`:
    - "Where can I build starter homes in Huntington Beach?"
    - "only ones that fit at least 4 homes near Beach Blvd" (a follow-up to the first)
    - "Where can I build 10 starter homes in Huntington Beach?"
    - "Show vacant single-family lots under an acre"
    - "Find something to build on"
    - "Lots near Fake Blvd"
    - "Is this a good investment?"
    - "Just tell me roughly how many homes the whole county could fit"
  - It prints each question's filters, the `filterChips` labels and the reply.

- [ ] **Step 2: Run it and check the output.** Run `pnpm try:assistant`. Check these against the spec:
  - The 10-homes question sets `eligible` and `minHomes: 10`, without `vacant`.
  - The vacant single-family question sets `vacant`, `zones: ["RL"]` and `maxLotSqft: 43560`.
  - Fake Blvd says the street wasn't found.
  - The investment question doesn't search.
  - The county question gives no number that didn't come from a tool.

  Tune `assistant-prompt.ts` until all of these pass. Record any that still fail in the commit message.

- [ ] **Step 3: Update the docs.**
  - **`CLAUDE.md`, "Spec vs. current code":**
    - Remove "runs against the fake parcels; there's no real parcel data yet". Say that the real Huntington Beach parcels are loaded.
    - Remove the natural-language chat, the filter chips and the near filter from the gaps.
    - Note that "near a place" covers streets only.
    - Remove "the Anthropic SDK isn't installed".
    - Say that the zone groups now mirror `zone_rules`.
    - Add a short "Assistant" bullet under Search, covering `assistant.ask`, its two tools and the "filters only" rule.
  - **`PRODUCT_SPECS.MD`:**
    - In the example-queries table, change "Vacant, eligible lots with max_homes = 10" to "Eligible lots with max_homes = 10".
    - Tick the open question on HB zone codes, noting the groups.

- [ ] **Step 4: Run `pnpm test`, `pnpm lint` and the typecheck, then commit** with the message "Add an assistant query check script and update docs for natural-language search".
