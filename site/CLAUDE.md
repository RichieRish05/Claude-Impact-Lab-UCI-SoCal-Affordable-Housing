# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md
@PRODUCT_SPECS.MD

The imported `PRODUCT_SPECS.MD` is the source of truth for what gets built: StackUp, its data contracts, and its rules for agents. The rest of this file covers what the spec can't tell you: how the repo differs from the spec today, and how to work in the existing code.

## Spec vs. current code

The app lives in this directory (`site/`, one level below the git root), and paths in the spec are relative to it. The code is a Next.js scaffold with working Neon Auth, carried over from an earlier project. None of the StackUp product exists yet: no `lib/match.ts`, `lib/plan.ts`, `lib/types.ts`, `lib/ingest/`, `program_rules` table, or `/api/profile`, and `app/page.tsx` is still the `create-next-app` starter.

Dependencies the spec calls for are also missing: no Anthropic SDK or Inngest SDK is installed. Check the current Inngest docs before building the pipeline; the spec's design wasn't validated against them.

Intake requires login, so new pages such as onboarding need `requirePageUser()` and an entry in the `proxy.ts` matcher, which currently covers only `/dashboard`. Signed-in users without a profile may use only onboarding, on both pages and APIs. Programs, Tracker, and Checklist also stay locked until the profile is complete, and the matcher must never run on an incomplete one. These gates are still to build: `lib/auth/guards.ts` checks only for a session, and `providers.tsx` sends every sign-in to `/dashboard`. Enforce it in the guards, because `proxy.ts` is only an optimistic redirect. `assertOwner` expects `userId`, while the `UserProfile` contract uses `user_id`, so map the field when calling it.

`docs/superpowers/` and the `/dashboard` page date from the earlier project. Their auth design is still accurate, but they contain no StackUp requirements.

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

Prisma is the ORM. `lib/db.ts` exports the only client (`db`), which connects over node-postgres using the pooled `DATABASE_URL`. The Prisma CLI uses Neon's direct host instead, because migrations can fail through PgBouncer: `prisma.config.ts` derives it by removing `-pooler` from `DATABASE_URL`. The schema has no models yet.

- **Generated client:** it lives in `lib/generated/prisma`, is gitignored, and is rebuilt by `postinstall`. Run `pnpm exec prisma generate` after editing `prisma/schema.prisma`.
- **Migrations:** `pnpm exec prisma migrate dev --name <name>`. Prisma manages only the `public` schema; `neon_auth` belongs to Neon Auth.
- **Versions:** the Prisma packages are pinned to the same exact version, because `prisma`'s npm `latest` tag points at an 8.0 release candidate. Don't install `prisma@latest`.
- **Node:** Prisma supports Node 20.19+, 22.12+, and 24+, not Node 23. Its install-time version check is disabled in `pnpm-workspace.yaml` so it can't fail `pnpm install`.
- **Tests:** mock `@/lib/db`. It throws on import if `DATABASE_URL` is missing.

## Auth

Neon Auth (email/password and Google). `lib/auth/server.ts` is the only server-side import of the SDK. All other server code goes through `lib/auth/guards.ts`, never `auth.getSession()`:

- **Route handlers:** call `requireUser()` inside `try`, `assertOwner(user, row)` for owned resources, and `toErrorResponse(e)` in `catch` (401/404 JSON). `app/api/me/route.ts` is the reference.
- **Server actions:** use `requireUser()` and `assertOwner()`, but never return `toErrorResponse`, because an action can't return a `Response`. Let the error propagate or return `{ error }`.
- **Pages:** call `requirePageUser()`, which redirects to `/auth/sign-in`. These pages must also be under the `proxy.ts` matcher, because the proxy refreshes the session cookie and a Server Component can't write it.

`proxy.ts` (Next 16's name for middleware) is only an optimistic redirect, so never rely on it for security. Keep `/api/*`, `/auth/*`, and static assets out of its matcher.

`assertOwner` throws `NotFoundError` for both missing and other users' resources, so responses don't reveal that another user's resource exists.

In tests, mock `@/lib/auth/session` (`getCurrentUser`), not the SDK.

`@neondatabase/auth` and `@neondatabase/auth-ui` are beta packages pinned to exact versions. Keep them pinned, without a `^`.
