# Auth design: Neon Auth login with unit-tested guards

**Date:** 2026-09-26
**Status:** Approved in brainstorming, awaiting written-spec review

## Goal

A signed-in user can reach protected pages and API routes, and nobody else can. Every piece of authorization logic we write is covered by Vitest unit tests. Neon's own behavior (password checks, the Google OAuth exchange, cookie issuance) is trusted and checked by hand.

## Decisions

| Decision | Choice |
|---|---|
| Identity provider | Neon Auth (Managed Better Auth). Already enabled on `dev` via `neon.ts` (`auth: true`). |
| Sign-in methods | Email + password, and Google. Google uses Neon's shared dev credentials for now. |
| Scope | Working login end to end: handler, proxy, sign-in/up UI, sign-out, protected placeholder page, guards, tests |
| UI | Prebuilt `@neondatabase/auth-ui` (`AuthView`), with no custom forms |
| Ownership | A pure `assertOwner` now. DB-scoped queries come in the Prisma/`Video` piece. |
| Test seam | Our own session wrapper (`lib/auth/session.ts`), the only server-side caller of the SDK. Tests mock that module. |
| Tests | Vitest unit tests only, in a top-level `tests/` folder that mirrors the source layout |

Package versions at design time: `@neondatabase/auth@0.5.0-beta` and `@neondatabase/auth-ui@0.3.0-beta` (peer: `next >=16`). Both are beta, which is why SDK access is confined to one file.

## Components

### Auth core (`lib/auth/`)

| File | Responsibility | Depends on |
|---|---|---|
| `server.ts` | `export const auth = createNeonAuth({ baseUrl, cookies: { secret } })`. The only server-side SDK import. | `NEON_AUTH_BASE_URL`, `NEON_AUTH_COOKIE_SECRET` |
| `client.ts` | `export const authClient = createAuthClient()` from `@neondatabase/auth/next` (takes no arguments; talks to the same-origin proxy) | SDK |
| `session.ts` | `getCurrentUser(): Promise<SessionUser \| null>`, where `SessionUser = { id: string; email: string; name: string }`. Maps `auth.getSession()`'s `{ data, error }` to `SessionUser` and fails closed: an SDK error, a thrown exception, or a missing user returns `null`, and the error cases are logged. | `server.ts` |
| `guards.ts` | `requireUser(): Promise<SessionUser>` throws `UnauthorizedError` when there's no user (for API routes and server actions). `requirePageUser(): Promise<SessionUser>` calls `redirect("/auth/sign-in")` when there's no user (for pages). | `session.ts`, `errors.ts`, `next/navigation` |
| `authorize.ts` | `assertOwner(user: SessionUser, resource: { userId: string }): void` throws `NotFoundError` when `resource.userId !== user.id`. Pure. | `errors.ts` |
| `errors.ts` | `UnauthorizedError`, `NotFoundError`, and `toErrorResponse(e: unknown): Response`: 401 `{ error: "Unauthorized" }`, 404 `{ error: "Not found" }`, and any other error is rethrown. | nothing |

### Routes and UI

- `app/api/auth/[...path]/route.ts`: `export const { GET, POST, PUT, DELETE, PATCH } = auth.handler();`
- `app/auth/[path]/page.tsx`: renders `<AuthView path={path} />` (sign-in, sign-up, Google button).
- `app/providers.tsx`: a client component that wraps the app in `NeonAuthUIProvider` with `authClient`, Google as a social provider, and redirect-to `/dashboard`. The root layout imports it along with the auth-ui CSS (one of `/css` or `/tailwind`, never both).
- `app/dashboard/page.tsx`: calls `requirePageUser()` and shows the user's email and a sign-out button (`authClient.signOut()`, then go to `/auth/sign-in`).
- `app/api/me/route.ts`: the reference pattern for protected API routes:

  ```ts
  export async function GET() {
    try {
      const user = await requireUser();
      return Response.json({ id: user.id, email: user.email });
    } catch (e) {
      return toErrorResponse(e);
    }
  }
  ```

- `proxy.ts` (Next 16's name for middleware): `export default auth.middleware({ loginUrl: "/auth/sign-in" })` with `config.matcher = ["/dashboard/:path*"]`. It's only for convenience (it reads the cookie optimistically). Security comes from the guards, which never assume the proxy ran.

### Config

- `NEON_AUTH_COOKIE_SECRET` in `.env.local`, generated with `openssl rand -base64 32`. Neon doesn't inject it.
- Google enabled as a social provider on the `dev` branch's Managed Auth, with shared dev credentials. Localhost origins are pre-approved as trusted domains.

## Data flow

**Sign-in:** the browser goes to `/auth/sign-in` (outside the proxy matcher) → `AuthView` → `authClient` → `/api/auth/*` → Managed Auth sets the session cookie → redirect to `/dashboard`. For Google, the provider returns through `{NEON_AUTH_BASE_URL}/callback/google` and then back to the app.

**Protected page:** the proxy redirects if there's no session cookie → the page calls `requirePageUser()` → `getCurrentUser()` → redirect if `null`, otherwise render.

**Protected API:** `requireUser()` → (in later routes: load the resource, then `assertOwner`) → respond. `toErrorResponse` in the catch block turns auth errors into 401 or 404.

## Error handling

| Situation | Result |
|---|---|
| No session, expired session, or the SDK returns an `error` or throws | `getCurrentUser()` returns `null` and logs the SDK failure. APIs return 401; pages redirect to sign-in. |
| Signed in, but the resource belongs to someone else | `NotFoundError` → 404, the same response as a missing resource (existence isn't revealed) |
| Any other error | Rethrown by `toErrorResponse`, so Next returns a 500 |
| Wrong password, email already taken | Shown by `AuthView`. We add no code. |

An SDK outage therefore fails closed and looks like being logged out. The log line tells an outage apart from a normal logout.

## Testing

**Setup:** dev dependencies `vitest` and `vite-tsconfig-paths`. `vitest.config.mts` sets `environment: "node"` and `include: ["tests/**/*.test.ts"]`. Scripts: `test` (`vitest run`) and `test:watch` (`vitest`). Tests import source through `@/*`.

| Test file | Mocks | Cases |
|---|---|---|
| `tests/lib/auth/authorize.test.ts` | nothing | The owner passes; a different `userId` throws `NotFoundError` |
| `tests/lib/auth/errors.test.ts` | nothing | `UnauthorizedError` → 401 with body `{ error: "Unauthorized" }`; `NotFoundError` → 404 with body `{ error: "Not found" }`; a generic `Error` is rethrown |
| `tests/lib/auth/session.test.ts` | `@/lib/auth/server` | A valid session maps to exactly `{ id, email, name }` (extra SDK fields dropped); `data: null` → `null`; `error` set → `null` and logged; `getSession` throws → `null` and logged |
| `tests/lib/auth/guards.test.ts` | `@/lib/auth/session`, `next/navigation` | `requireUser` returns the user, or throws `UnauthorizedError` when `null`; `requirePageUser` returns the user, or calls `redirect("/auth/sign-in")` when `null` |
| `tests/app/api/me/route.test.ts` | `@/lib/auth/session` | `null` → 401 `{ error: "Unauthorized" }`; a user → 200 `{ id, email }` and nothing else |
| `tests/proxy.test.ts` | `@/lib/auth/server` | Uses `unstable_doesMiddlewareMatch` from `next/experimental/testing/server` (the installed Next 16.3.6 exports this name; the docs say `unstable_doesProxyMatch`, which does not exist). Matches `/dashboard` and `/dashboard/settings`. Doesn't match `/`, `/auth/sign-in`, `/auth/sign-up`, `/api/auth/get-session`, `/api/inngest`, `/api/me` or `/_next/static/chunk.js`. |

**Not automated (trusted to Neon):** password checks, the Google OAuth exchange, cookie issuance, and how `auth.middleware` behaves once it runs.

**Manual checklist** (run in a browser against `pnpm dev` on the `dev` branch; results reported item by item):
1. Sign up with email and password → land on `/dashboard`.
2. Reload → still signed in.
3. Sign out → back at sign-in; visiting `/dashboard` redirects to sign-in.
4. Sign in with email and password → `/dashboard`.
5. Wrong password → an error appears in `AuthView`.
6. `curl -i localhost:3000/api/me` with no cookie → 401.
7. Google sign-in → `/dashboard`. This may need the project owner to click through with their own Google account. If so, the report says it wasn't verified.

**Definition of done:** `pnpm test`, `pnpm lint` and `pnpm build` all pass, and the manual checklist results are reported.

## Docs

Update the Commands section of `CLAUDE.md` with `pnpm test` / `pnpm test:watch`, removing "No test runner is configured yet", and add a note that server-side auth checks go through `lib/auth/guards.ts` (API: `requireUser` + `toErrorResponse`; pages: `requirePageUser`).

## Out of scope

| Item | Later piece |
|---|---|
| DB-scoped ownership queries (`getOwnedVideo`) calling `assertOwner` | Prisma/`Video` |
| Protecting the upload, export and presign routes | Each route copies the `/api/me` pattern when it's built |
| Production Google OAuth credentials, custom SMTP, production trusted domains | Deploy/hosting (hosting is **OPEN** in spec §9) |
| Enabling Neon Auth plus Google on the `production` branch | Deploy/hosting |
| Email verification, password reset, forgot-password UI | Later (verification links need custom SMTP) |
| Integration and E2E tests | Not planned |
| Styling `AuthView` to match the brand | Frontend design |
