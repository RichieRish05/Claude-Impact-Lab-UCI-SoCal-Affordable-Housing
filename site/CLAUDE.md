# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md
@PRODUCT_SPECS.MD

The imported `PRODUCT_SPECS.MD` is the source of truth for what gets built: StackUp, its data contracts, and its rules for agents. The rest of this file covers what the spec can't tell you: how the repo differs from the spec today, and how to work in the existing code.

## Spec vs. current code

The app lives in this directory (`site/`, one level below the git root), and paths in the spec are relative to it. The code is a Next.js scaffold with working Neon Auth, carried over from an earlier project. None of the StackUp product exists yet: no `lib/match.ts`, `lib/plan.ts`, `lib/types.ts`, `data/rules/`, `scripts/`, or `/api/profile`, and `app/page.tsx` is still the `create-next-app` starter.

Where the spec and the code disagree:

| Topic | Spec says | Repo has |
|---|---|---|
| Package manager | `npm run ...` | pnpm (`packageManager` field, `pnpm-lock.yaml`). Use pnpm. |
| `typecheck`, `ingest` scripts | Exist | Not in `package.json` yet. Add them when needed; use the typecheck command below until then. |
| Backend | Supabase for profiles and tracker state | Neon Auth (`neon.ts`, `@neondatabase/*`). No Supabase or database client is installed. |
| Claude API | Used for ingest and explanations | No Anthropic SDK installed. |

**The Supabase vs. Neon choice is unresolved, so ask before adding a database client.** Likewise, ask whether StackUp keeps login at all: the spec doesn't mention user accounts, and the form must work end to end as the demo path.

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

## Auth

Neon Auth (email/password and Google). `lib/auth/server.ts` is the only server-side import of the SDK. All other server code goes through `lib/auth/guards.ts`, never `auth.getSession()`:

- **Route handlers:** call `requireUser()` inside `try`, `assertOwner(user, row)` for owned resources, and `toErrorResponse(e)` in `catch` (401/404 JSON). `app/api/me/route.ts` is the reference.
- **Server actions:** use `requireUser()` and `assertOwner()`, but never return `toErrorResponse`, because an action can't return a `Response`. Let the error propagate or return `{ error }`.
- **Pages:** call `requirePageUser()`, which redirects to `/auth/sign-in`. These pages must also be under the `proxy.ts` matcher, because the proxy refreshes the session cookie and a Server Component can't write it.

`proxy.ts` (Next 16's name for middleware) is only an optimistic redirect, so never rely on it for security. Keep `/api/*`, `/auth/*`, and static assets out of its matcher.

`assertOwner` throws `NotFoundError` for both missing and other users' resources, so responses don't reveal that another user's resource exists.

In tests, mock `@/lib/auth/session` (`getCurrentUser`), not the SDK.

`@neondatabase/auth` and `@neondatabase/auth-ui` are beta packages pinned to exact versions. Keep them pinned, without a `^`.
