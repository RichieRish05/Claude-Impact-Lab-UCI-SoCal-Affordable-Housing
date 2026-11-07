# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md
@PRODUCT_SPECS.MD

The imported `PRODUCT_SPECS.MD` is the source of truth for what gets built: Groundwork, its data, eligibility rules, and LLM tools. The rest of this file covers what the spec can't tell you: how the repo differs from the spec today, and how to work in the existing code.

## Spec vs. current code

The app lives in this directory (`site/`, one level below the git root), and paths in the spec are relative to it. The code has working Neon Auth, a landing page, and the filter-panel search at `/dashboard`: map, filter panel and results list with a parcel card, backed by `parcels.search`. It runs against the fake parcels; there's no real parcel data yet.

Search gaps against the spec: no natural-language chat or filter chips, no "near a place" or map-area filters, no CSV export, and the lot-size filter is min/max inputs rather than a slider. The single-family and multifamily zone groups in `lib/parcel-filters.ts` are provisional until the spec's open question on HB zone codes is settled. Projects, the pipeline board and funding don't exist, and the Anthropic SDK isn't installed.

Prisma has no geometry type, so geometry columns need `Unsupported("geometry(...)")` and spatial queries go through `db.$queryRaw`. The spec's offline data jobs live in `../pipeline/`, a separate Python project that only writes rows into tables this schema defines.

## Search

- **Filters:** `lib/parcel-filters.ts` defines the filter set once: the zod input schema for `parcels.search` and the URL encoding. The URL is the only filter state; `lib/hooks/use-parcel-filters.ts` writes it with `history.replaceState`, which updates `useSearchParams` without a server round trip. The LLM's `search_parcels` tool should take the same schema.
- **Query:** `app/api/trpc/parcels.ts` builds the `WHERE` clause with `Prisma.sql` fragments, returns at most `SEARCH_RESULT_LIMIT` parcels, and computes the lot and home totals over every match with window functions.
- **Map:** MapLibre GL with OpenFreeMap's keyless Positron style. Lots are drawn as polygons from zoom 14 and as points below 15, because they're too small to see at city zoom.

New pages that need a signed-in user need `requirePageUser()` and an entry in the `proxy.ts` matcher, which currently covers only `/dashboard`. Use `assertOwner` for owned rows such as projects; it expects a `userId` field, so map it from a snake_case column.

`docs/superpowers/` dates from an earlier project. Its auth design is still accurate, but it contains no Groundwork requirements.

## Project structure

- **`lib/`:** shared, reusable, pure utility functions, plus constants, enums, and thin wrappers such as `lib/db.ts`. Shared types belong here. Eligibility rules don't: `../pipeline/` computes and stores them, and the app only reads the stored columns.
- **`lib/hooks/`:** every custom React hook, one per file named after the hook (`use-parcel-filters.ts`), even if only one page uses it today. Don't define hooks inside `app/` or `components/`; import them from here.
- **`app/`:** pages and API routes.
- **`components/`:** shared React components. `components/ui/` holds shadcn-registry components such as Magic UI's `dither-field.tsx`; add them with `pnpm dlx shadcn@latest add @magicui/<name>` rather than hand-writing them. Colors live as CSS variables in `app/globals.css`, and the app is light-only.
- **`inngest/`:** the Inngest client, functions, and step logic, if background jobs are added.
- **`docs/`:** feature plans.

### API routes

Define API routes as tRPC procedures. The handler is `app/api/trpc/[trpc]/route.ts`, and routers live beside it in `app/api/trpc/`.

Keep a plain route handler only when the caller dictates its own HTTP contract:

- `app/api/auth/[...path]`: Neon Auth's catch-all handler.
- `app/api/inngest`: Inngest's `serve()` handler, which uses `GET`, `POST`, and `PUT` on a single endpoint.
- Webhooks from third parties with a fixed request and response format that tRPC's `{ "result": { "data" } }` envelope and error statuses don't satisfy. Keep these routes thin adapters: put the logic in a tRPC procedure, call it with a server-side caller, and translate the outcome. A procedure that checks a webhook secret must check it itself, because it's also reachable at `/api/trpc`.

`app/api/trpc/init.ts` defines `publicProcedure` and `protectedProcedure`; `router.ts` merges routers into `appRouter`. Test procedures with `createCallerFactory(appRouter)({})`, as `tests/app/api/trpc/parcels.test.ts` does.

### Frontend data fetching

Client components fetch through TanStack React Query, using tRPC's `@trpc/tanstack-react-query` integration: `useQuery(trpc.x.queryOptions())` with `useTRPC()`. Don't call `fetch` on tRPC routes directly or use the classic `@trpc/react-query` client. The client setup is a thin wrapper, so it goes in `lib/trpc/`.

### Comments

Keep comments minimal. Add one only when the code can't show why it does something, such as a hidden constraint or workaround, and never restate what the code does.

### Keeping docs current

Keep the project context in the md files fresh. When a change makes `CLAUDE.md`, `PRODUCT_SPECS.MD`, `../pipeline/CLAUDE.md`, the root `CLAUDE.md`, or a plan in `docs/` inaccurate, update the file in the same change, including removing gaps from "Spec vs. current code" as they're built. Don't edit `AGENTS.md`, because `next dev` rewrites it.

## Commands

```bash
pnpm install
pnpm dev                                  # dev server on :3000; also rewrites AGENTS.md
pnpm build
pnpm lint                                 # ESLint 9 flat config
pnpm test                                 # Vitest, all tests
pnpm test:watch
pnpm vitest run tests/proxy.test.ts       # one file
pnpm vitest run -t "assertOwner"          # tests matching a name
pnpm exec next typegen && pnpm exec tsc --noEmit   # typecheck
```

- **Typecheck:** `PageProps` and `LayoutProps` are generated globals, so `tsc` fails on a fresh checkout until `next typegen`, `next dev`, or `next build` has run.
- **Env vars:** `pnpm build` and server boot fail without `NEON_AUTH_BASE_URL` and `NEON_AUTH_COOKIE_SECRET` (at least 32 characters; generate with `openssl rand -base64 32`) in `.env.local`. `instrumentation.ts` loads `lib/auth/server.ts` at startup so bad config fails immediately. Tests need no env vars.
- **Tests:** Vitest runs in the `node` environment and only picks up `tests/**/*.test.ts`, mirroring source paths. There is no jsdom, so `.tsx` component tests won't run without config changes.

The `@/*` import alias maps to this directory.

## Database

Prisma is the ORM, and all database queries must go through it. Import `db` from `lib/db.ts`, and never query with `pg` or another client directly. `lib/db.ts` exports the only client, which connects over node-postgres using the pooled `DATABASE_URL`. The Prisma CLI uses Neon's direct host instead, because schema changes can fail through PgBouncer: `prisma.config.ts` derives it by removing `-pooler` from `DATABASE_URL`.

The Neon project is `UGCEditor` (`raspy-rice-16858150`), and local development uses its `dev` branch. `.neon` only sets the Neon CLI's target, while `DATABASE_URL` decides what the app and Prisma connect to. Run `neon link --project-id raspy-rice-16858150 --branch dev --no-env-pull` once per checkout.

- **Parcels and zone rules:** `../pipeline/` fills `parcels` and `zone_rules`, and the app only reads them. Fields filled after the load step are nullable. `updated_at` has a database default because the pipeline writes without the Prisma client, so keep that default on any table the pipeline writes.
- **Fake parcels:** `prisma/fake-parcels.sql` seeds 12 made-up Huntington Beach parcels, all with APNs starting `FAKE-`, so the app has data before the pipeline runs. Run it with `pnpm exec prisma db execute --file prisma/fake-parcels.sql`. The pipeline deletes them before loading real parcels.
- **PostGIS:** enabled on the `dev` branch with `CREATE EXTENSION postgis`, which Prisma doesn't track, so enable it on any new branch before pushing the schema. The extension adds a `spatial_ref_sys` table to `public` that isn't in the schema. Prisma currently ignores it, but if `db push` or `migrate dev` ever proposes dropping it, refuse.
- **Generated client:** it lives in `lib/generated/prisma`, is gitignored, and is rebuilt by `postinstall`. Run `pnpm exec prisma generate` after editing `prisma/schema.prisma`.
- **Schema changes:** Prisma manages only the `public` schema; `neon_auth` belongs to Neon Auth. Edit `prisma/schema.prisma`, check which database `DATABASE_URL` points at, then pick the command by whether the change affects existing data:
  - **Additive changes use `pnpm exec prisma db push`:** new tables, and new columns that are nullable or have a default. Never pass `--accept-data-loss`; a data-loss warning means the change belongs in a migration.
  - **Everything else uses `pnpm exec prisma migrate dev --name <name>`:** renames, drops, type changes, making a column required, and anything else that touches existing rows or columns. Check the generated SQL, because a rename generates a drop and an add unless you edit it to `RENAME COLUMN`.
  - **Record pushed changes before migrating:** `db push` leaves no migration history, so `migrate dev` treats pushed changes as drift and offers to reset the database. Never accept the reset. Write what's missing to `prisma/migrations/<timestamp>_baseline/migration.sql` with `pnpm exec prisma migrate diff --from-migrations prisma/migrations --to-config-datasource --script` (use `--from-empty` for the first migration), mark it with `pnpm exec prisma migrate resolve --applied <timestamp>_baseline`, then run `migrate dev`.
- **Versions:** the Prisma packages are pinned to the same exact version, because `prisma`'s npm `latest` tag points at an 8.0 release candidate. Don't install `prisma@latest`.
- **Node:** Prisma supports Node 20.19+, 22.12+, and 24+, not Node 23. Its install-time version check is disabled in `pnpm-workspace.yaml` so it can't fail `pnpm install`.
- **Tests:** mock `@/lib/db`. It throws on import if `DATABASE_URL` is missing.

## Auth

Neon Auth (email/password and Google). `lib/auth/server.ts` is the only server-side import of the SDK. All other server code goes through `lib/auth/guards.ts`, never `auth.getSession()`:

- **tRPC procedures:** use `protectedProcedure`, which runs `requireUser()` in shared middleware, call `assertOwner(user, row)` for owned resources, and map auth errors to `TRPCError` (`UNAUTHORIZED`, `NOT_FOUND`) rather than using `toErrorResponse`.
- **Plain route handlers (the exceptions above):** where a route needs a user session, call `requireUser()` inside `try`, `assertOwner(user, row)` for owned resources, and `toErrorResponse(e)` in `catch` (401/404 JSON).
- **Server actions:** use `requireUser()` and `assertOwner()`, but never return `toErrorResponse`, because an action can't return a `Response`. Let the error propagate or return `{ error }`.
- **Pages:** call `requirePageUser()`, which redirects to `/auth/sign-in`. These pages must also be under the `proxy.ts` matcher, because the proxy refreshes the session cookie and a Server Component can't write it.

- **Public pages that only vary their UI by session:** call `getCurrentUser()` from `lib/auth/session.ts`, as `components/site-header.tsx` does. Keep these pages out of the `proxy.ts` matcher, because it redirects signed-out visitors. Reading the session makes the page render per request.

`proxy.ts` (Next 16's name for middleware) is only an optimistic redirect, so never rely on it for security. Keep `/api/*`, `/auth/*`, and static assets out of its matcher.

`assertOwner` throws `NotFoundError` for both missing and other users' resources, so responses don't reveal that another user's resource exists.

In tests, mock `@/lib/auth/session` (`getCurrentUser`), not the SDK.

`@neondatabase/auth` and `@neondatabase/auth-ui` are beta packages pinned to exact versions. Keep them pinned, without a `^`.
