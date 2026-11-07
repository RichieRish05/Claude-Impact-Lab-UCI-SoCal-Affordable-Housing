# CLAUDE.md — StackUp (working title)

Down payment assistance stacking matcher. One-day hackathon build (UCI Impact Lab, Nov 7 2026, theme: AI for affordable homeownership). A family creates an account, answers ~8 onboarding questions (web form or phone call), and gets: every assistance program they qualify for, how the programs legally stack, the combined dollar impact, and an ordered application plan. They can change their answers later in the profile tab on the dashboard.

## Core principle (repeat in the pitch)

**LLM extracts, code decides, LLM explains.**

- An LLM parses messy program PDFs/websites into structured JSON rules — in a **background ingest pipeline, never during a user request** — then a second LLM pass checks them against the source.
- Eligibility matching and plan ordering are **pure deterministic TypeScript**. No LLM call ever decides whether someone qualifies. Never violate this.
- An LLM turns match results into plain-language explanations at runtime.

## Architecture

```
INGEST (Inngest on Vercel, started manually)
  `ingest.requested` event → one run per program → the 7 steps below
                           → Neon `program_rules` table (verified = true only if nothing is flagged)

RUNTIME
  sign in → onboarding form ─┐
  dashboard profile tab ─────┤ (/api/profile)
  voice call + code ─────────┘ (/api/voice-webhook)
     ↓ save profile, load verified rules from Neon
  lib/match.ts (deterministic)
     → lib/plan.ts (topo sort)
     → Claude: plain-language explain
     → dashboard tabs
```

Account first, then gated: a family creates an account, then completes onboarding. Until a profile exists, onboarding is the only page or API they can use, and signing in sends them back to it. After that, the same questions are edited in the dashboard's profile tab.

Phone intake links to the account with a code: the onboarding page shows a short, single-use, expiring code, and the caller reads it out. The Vapi webhook has no session, so `/api/voice-webhook` uses the code to find the user. Once the profile is saved, the gate opens.

No message queue, no background workers on the user path. ~15 programs, not 15,000. The only async outside ingest is the Vapi webhook POST.

## Ingest pipeline

An Inngest function deployed on Vercel. Each step retries on its own, and completed steps aren't re-run. The Claude steps use `step.fetch`, so Inngest makes the HTTP request and the Vercel function doesn't wait on it. The code steps use `step.run` and run on Vercel, so they must fit within the Vercel function time limit.

| Step | Type | What it does |
|---|---|---|
| 1. Fetch source | Code | Download the site or PDF, convert it to text, store the text and its hash in `program_sources` |
| 2. Check for changes | Code | Stop if the hash is unchanged and the rule is already verified |
| 3. Extract | Claude (`step.fetch`) | Turn the source text into a `ProgramRule`, using structured output |
| 4. Validate | Code | Check the rule's shape and types, and require `source_url` |
| 5. Verify | Claude (`step.fetch`) | In a separate call that sees only the source text and the rule, check each field and quote the source passage |
| 6. Check quotes | Code | Confirm each quote appears in the stored text, ignoring whitespace differences; record any flags |
| 7. Save | Code | Write to `program_rules`, with `verified` true only if nothing is flagged |

- **Plain functions:** the step logic lives in `lib/ingest/`, and the Inngest function only calls it. This keeps the logic testable without Inngest.
- **Same text for both passes:** Claude gets the stored text, not the raw PDF, so quotes can be compared exactly.
- **Pass IDs between steps:** steps read source text from Neon by ID rather than passing documents through step results. The exception is the Claude request body, which has to contain the text and therefore passes through Inngest.
- **Re-runs:** a verified rule stays live until its replacement passes. If the replacement is flagged, keep the live rule and record the flags on its row, so they can be seen and acted on.
- **Concurrency:** limit concurrent runs to stay within Claude rate limits.
- **Starting a run:** send `ingest.requested` from the Inngest dashboard. There is no public trigger route, because anyone who could call one could spend API credits.
- **Sources:** the program URLs live in `lib/ingest/sources.json`. Pages that won't fetch, such as ones rendered with JavaScript, may need their text added to `program_sources` by hand.
- **Database:** the Vercel deployment's `DATABASE_URL` determines which Neon branch receives the rules. It must be the branch the demo reads from.

## Dashboard

Four tabs, all behind the profile gate:

- **Programs** — the programs they're eligible for, with plain-language explanations, plus the stack total and ordered plan. Reflects the current profile.
- **Application tracker** — status of each program's application.
- **Checklist** — shared document checklist.
- **Profile** — edit onboarding answers and fill in missing info.

Programs stays locked until every onboarding question is answered, and points to the Profile tab until then. This is enforced on the server: the matcher never runs on an incomplete profile, so it never has to handle unknown values. Tracker and Checklist lock too, since they depend on the matched programs. Answers can be incomplete if, for example, a phone call drops partway through.

Intake (web and voice) asks for a best-estimate credit band if the family doesn't know their score, and explains how to check it for free. Programs states that results depend on the band they gave.

## Stack

- **Next.js (App Router) + TypeScript** on Vercel — frontend and API routes in one deploy
- **Neon Postgres** — program rules, profiles, and tracker state; queried from server code only, never from the client
- **Neon Auth** — email/password and Google, required for intake; server-side checks go through `lib/auth/guards.ts`
- **Program rules** — one row per program in `program_rules`: `id`, `verified`, `verification_flags`, and a `rule` JSONB column holding the `ProgramRule`. The `id` and `verified` columns are authoritative: the rule loader overwrites those fields in the object with the column values
- **Inngest** — durable ingest pipeline only, served from `/api/inngest`; authenticated by Inngest's signing key, not a user session, and never on the user path
- **Claude API** — ingest extraction and verification + runtime explanation endpoint
- **Vapi (or Retell)** — hosted voice agent; its tool-call POSTs the finished profile and link code to `/api/voice-webhook`

## Layout

```
app/                 pages (onboarding, dashboard tabs) + api routes (app/api/profile, app/api/explain, app/api/voice-webhook, app/api/inngest)
lib/match.ts         eligibility engine — pure functions over ProgramRule[]
lib/plan.ts          dependency resolution — topological sort over prerequisites/requires
lib/types.ts         the two contracts below; import from here only
lib/auth/            Neon Auth setup, session, and guards (already built)
lib/ingest/          ingest step logic and sources.json; plain functions called by the Inngest function
```

## The two contracts

Everything meets at these. Change them only by team agreement.

```ts
// ProgramRule — `rule` column of the Neon `program_rules` table
interface ProgramRule {
  id: string;                      // "calhfa-myhome"
  name: string;
  agency: string;                  // "CalHFA", "County of Orange", "City of Santa Ana"
  type: "grant" | "deferred_loan" | "forgivable_loan" | "below_market_first" | "tax_credit";
  jurisdiction: { state: "CA"; counties: string[]; cities: string[] };  // [] = no restriction at that level
  assistance: {
    kind: "percent_of_price" | "fixed" | "percent_of_loan";
    value: number;                 // 3.5 means 3.5%
    cap_usd: number | null;
  };
  income_limit: {
    basis: "ami_pct" | "fixed_by_household_size";
    ami_pct?: number;              // e.g. 80 or 120
    by_household_size?: Record<string, number>;  // "4": 139000 (annual USD)
  };
  requirements: {
    first_time_buyer: boolean;
    primary_residence: boolean;
    homebuyer_education: boolean;
    min_credit?: number;
    veteran_only?: boolean;
    property_types?: string[];
  };
  stacking: {
    requires: string[];            // program ids this must ride on (e.g. CalHFA first mortgage)
    excludes: string[];            // cannot combine with these ids
    max_lien_position?: number;
  };
  prerequisites: string[];         // step ids, e.g. ["homebuyer-ed-cert", "lender-preapproval"]
  funding_status: "open" | "waitlist" | "exhausted" | "unknown";
  source_url: string;              // REQUIRED — every rule must be traceable
  last_verified: string;           // ISO date
  verified: boolean;               // set by the second LLM pass; matcher must ignore rules where false
}

// UserProfile — Neon Postgres `profiles` table + /api/profile body
interface UserProfile {
  id: string;
  user_id: string;                 // Neon Auth user id; one profile per user
  created_via: "web" | "voice";
  household_size: number;
  annual_income_usd: number;
  savings_usd: number;
  city: string;
  county: string;                  // "Orange"
  first_time_buyer: boolean;
  veteran: boolean;
  credit_band: "lt620" | "620-679" | "680-739" | "740plus" | "unknown";  // "unknown" counts as unanswered
  target_price_usd?: number;       // optional only while incomplete; required to unlock Programs
}
```

Match output: `{ program_id, eligible: boolean, reasons: string[], estimated_amount_usd: number }[]`.
Plan output: ordered steps from topo-sorting the union of `prerequisites` + `stacking.requires` edges across eligible programs.

## Rules for agents working in this repo

1. **Never put an LLM call inside `lib/match.ts` or `lib/plan.ts`.** Deterministic only — this is the anti-hallucination story for judges. They also never query the database: API routes load the rules and pass them in as `ProgramRule[]`.
2. Rules with `verified: false` are invisible to the matcher. A missing quote or a disagreement in the second pass flags the rule, and a flagged new rule stays out until a re-run passes. The demo answer to "what about hallucination?" is this check plus `source_url`.
3. **Never collect or store SSN, DOB, or bank/account numbers** — web form or voice. Income band, household size, city is all we need.
4. All user-facing strings, including voice intake, are English only for now. No i18n framework.
5. Money is integer USD (annual income, caps, estimates). No cents, no floats in comparisons.
6. Boring tech wins: no queues, no microservices, no new frameworks mid-day. Inngest is the one exception, limited to ingest; nothing on the demo path may depend on it. If a feature endangers the demo path, cut the feature.
7. Demo path is sacred: sign-in → onboarding form → matches → stack total → plan must work at all times on `main`. Voice and tracker are additive layers.
8. The voice webhook (`/api/voice-webhook`) must validate the payload shape and fail soft — a garbled call should never 500 the app.

## Demo persona (seed this)

Maria — hotel worker, Santa Ana, household of 4, $58,000/yr, $8,000 saved, first-time buyer. Target: condo ~$550k. The demo beat: her out-of-pocket drops from six figures to ~$15k via 3–4 stacked programs, shown live. She creates an account on the web, reads the on-screen code into a phone call, and does intake by voice; the dashboard then opens with her results.

## Scope ladder (cut from the bottom)

1. Matcher + stack math + plan (core — never cut)
2. Sign-in, onboarding form, dashboard Programs and Profile tabs
3. Voice intake via Vapi
4. Dashboard Application tracker and Checklist tabs (per-program status, shared doc checklist)
5. Counselor dashboard / PDF auto-fill (stretch)

## Commands

```bash
pnpm dev               # local dev
pnpm build
pnpm lint
pnpm test              # Vitest
pnpm exec next typegen && pnpm exec tsc --noEmit   # typecheck; run before every commit
pnpm dlx inngest-cli@latest dev   # planned: local Inngest dev server, for developing the pipeline
```

Env vars (`.env.local` and Vercel, never committed): `NEON_AUTH_BASE_URL`, `NEON_AUTH_COOKIE_SECRET`, `DATABASE_URL`, `ANTHROPIC_API_KEY`, `INNGEST_EVENT_KEY`, `INNGEST_SIGNING_KEY`, `VAPI_API_KEY`, `VAPI_WEBHOOK_SECRET`.