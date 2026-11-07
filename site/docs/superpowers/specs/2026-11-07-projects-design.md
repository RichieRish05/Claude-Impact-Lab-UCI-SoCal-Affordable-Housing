# Projects: design

Nov 7, 2026. Round one of the spec's Feature 2, project tracking (`site/PRODUCT_SPECS.MD`).

## Intent

A small builder finds lots in search and then needs somewhere to track each one, from "found it" through to "homes under construction." This is also the first thing in Groundwork that stores data per user, which is what makes signing in worth it. Each builder has their own projects and sees only those.

The product spec already defines Projects. This design follows it: its eight stages, several parcels per project, a board with one column per stage, the SB 684 checklist, and the 60-day review clock. Where this design and the spec disagree, the spec should be updated to match this design (see the notes field below).

## Goals for this round

1. Save a parcel from search into a new or existing project.
2. A `/projects` board with one column per stage.
3. A project page with the project's parcels, a notes box, the SB 684 checklist, the review clock, and an activity log.
4. Change a project's stage, rename it, delete it, and remove a parcel from it.

## Non-goals (later rounds or other branches)

- Funding panel and capital stack.
- The AI assistant, which is being built on its own branch. Don't build anything for it here. The data model shouldn't make it hard to add later, since the spec says the activity log will include "AI actions."
- Dragging cards between columns on the board. The spec's demo script says "drag the project to Application submitted"; for now the demo uses the stage dropdown on the project page.
- Teams, sharing, permissions, and document uploads.
- Owner outreach letters or contacting owners.

## Anti-goals

- **Claiming eligibility.** Checklist items never start checked from parcel data, even when the stored columns suggest an item passes. The spec says "no legal advice or guarantees of eligibility," so the builder confirms every item. Keep the "Screening estimate, not legal advice" line wherever parcel eligibility shows.
- **Leaking projects between users.** Every read and write is scoped to the signed-in user. Another user's project returns not found, never forbidden (`assertOwner` already does this).

## Stages

In this order, matching the spec: Found, Screening, Owner outreach, Feasibility, Application submitted, Approved, Funded, Under construction. A new project starts in Found. Define the list once in `lib/` and have the board, the dropdown, and validation all read from it.

## Saving from search

- The parcel card on `/dashboard` gets a "Save to project" button. It opens a small picker that lists the user's projects and has an option to create a new one by name.
- A project holds one or more parcels. One parcel can be in more than one project, since a builder might try the same lot in two deals. Adding a parcel that's already in the chosen project does nothing and doesn't error.
- *Builder's call:* how the picker shows that a parcel is already in a project.

## The board (`/projects`)

- Add a "Projects" link to the dashboard header nav, next to "Search," and to the site header for signed-in users.
- There's one column per stage, in order, and each column header shows its count. Empty columns still show.
- Each card shows the project name, the number of lots, total possible homes (the sum of `max_homes`), and one status line:
  - In Application submitted, with a submission date: the review clock ("12 days left" or "Missed by 3 days"), colored the same way as on the project page.
  - Otherwise: checklist progress ("Checklist 3/8") or when it was last updated. Builder's call.
- Clicking a card opens the project page.
- The page has a "New project" button that creates an empty project in Found.
- Empty state: a short message that points to search.

## The project page (`/projects/[id]`)

- **Header:** the project name, which can be renamed inline; a stage dropdown; and a delete button with a confirm step. Don't use `window.confirm`; use an in-page confirm.
- **Parcels:** a map of the project's lots (reuse the MapLibre setup from search) and a list showing address, APN, zone, lot size, possible homes, and the SB 684 badge. Clicking a lot opens the same parcel card as search, so extract it into a shared component. Each lot has a Remove action. Adding lots happens from search.
- **Notes:** one free-text box per project that the builder keeps editing. It is not a log of separate entries. *My call:* it saves automatically after the builder stops typing, and shows a quiet "Saved" when it does. Editing notes doesn't add an activity entry. The spec's Activity panel lists "notes" among its entries; update the spec to say notes are a single box.
- **SB 684 checklist:** the spec's eight items, all unchecked when a project is created, each one checked by the builder:
  1. Lot is zoned multifamily, or is vacant and zoned single-family
  2. Lot is no larger than 1.5 acres and substantially surrounded by urban uses
  3. New parcels at least 600 sq ft (multifamily zone) or 1,200 sq ft (single-family zone)
  4. 10 or fewer parcels and 10 or fewer homes
  5. Tentative parcel map prepared
  6. Owner authorization (if applicant is not the owner)
  7. Occupancy affidavit (if an existing unit is demolished or altered)
  8. Complete application submitted; record the date

  Checking item 8 asks for the submission date, which defaults to today. That date can be edited later.

  *My call:* item 8 and the Application submitted stage are linked both ways.
  - Moving the stage to Application submitted asks for the submission date (default today) and checks item 8. If item 8 is already checked, the stage moves without asking again.
  - Checking item 8 while the project is in an earlier stage offers to move it to Application submitted. The builder can decline. Then the date is saved and the clock shows on the project page, and the board shows the clock once the stage catches up.
  - Moving the stage back out of Application submitted to an earlier stage leaves item 8 and the date alone. Only unchecking item 8 clears them.
  - Each linked change writes its own activity entries (stage change, item checked).
- **Review clock:** appears once a submission date exists. The deadline is the submission date plus 60 calendar days (*my call*; SB 684's 60 days runs from a complete application). It shows days left and the deadline date, turns amber at 15 days left or fewer, and turns red once the deadline has passed ("Missed by N days"). When the project moves to Approved or a later stage, the clock stops and shows when it was approved relative to the deadline. *My call:* record the approval time the first time the stage reaches Approved or any later stage, so skipping straight to Funded still records it. If the project moves back below Approved, the clock runs again and the next time it reaches Approved overwrites the approval time. Unchecking item 8 clears the submission date and hides the clock.
- *My call:* conditional items 6 and 7 have no separate "doesn't apply" state. The builder checks them off when they're done or don't apply, so each item is just done or not done, as in the spec's `checklist_items`.
- **Activity:** a timestamped, newest-first log written by the server. It records project created (and with how many parcels), each stage change (from and to), parcels added and removed, checklist items checked and unchecked, and changes to the submission date. Notes edits and renames are not logged.

## How it's built (decided by the existing code)

- Data lives in new Prisma tables in `site/prisma/schema.prisma`, with snake_case columns and `@@map` like the existing models. Start from the spec's core tables (`projects`, `project_parcels`, `checklist_items`, `activity`) and add what this design needs: `user_id`, `notes`, and the approval time on `projects`. Skip `funding_sources` and `total_cost`, which belong to the funding round. All new tables are additive, so use `prisma db push` per `site/CLAUDE.md`.
- The AI branch will add the spec's `save_to_project` and `update_project` tools. Put the logic for saving parcels, changing stage, checking items, and writing activity in plain server functions that the tRPC procedures call, so those tools can call the same functions.
- Ownership: a project row stores the Neon Auth user id (`user_id`). Map it to `userId` for `assertOwner`.
- Parcels reference `parcels.apn`, and deleting a parcel removes it from projects (cascade). The activity log keeps the APN as text, so history still reads correctly. **Known and accepted:** `pipeline/load.py` deletes every parcel and reloads them all, so re-running it empties every project's lot list. Leave it that way for this round. Don't change the pipeline, and don't work around it.
- API: a `projects` tRPC router built on `protectedProcedure`, merged into `appRouter`. The client uses `useTRPC()` with TanStack Query. Tests use `createCallerFactory` with `@/lib/db` and `@/lib/auth/session` mocked, following `tests/app/api/trpc/parcels.test.ts`.
- Pages: `/projects` and `/projects/[id]` call `requirePageUser()`, and `proxy.ts`'s matcher adds `/projects/:path*`.
- Hooks go in `lib/hooks/`, and shared constants such as stages and checklist items go in `lib/`.
- Update `site/CLAUDE.md` ("Spec vs. current code" and the matcher note) and `PRODUCT_SPECS.MD` (notes as a single box) in the same change.

## Left to the builder

- Visual design, within the existing light theme and the CSS variables in `app/globals.css`.
- Whether the stage dropdown and checklist use optimistic updates.
- What the board's status line shows outside Application submitted (see above).
