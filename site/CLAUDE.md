# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

## Repository state

The git root is `UGCEditor/`; the app lives in `site/`. Right now `site/` is a fresh `create-next-app` scaffold (Next.js 16, React 19, Tailwind v4, TypeScript strict). None of the product architecture below exists in code yet. **`PRODUCT_SPECS.MD` is the source of truth** for what gets built. Read the relevant section before implementing any part of the pipeline. Items marked **OPEN** in the spec (§9: hosting, LLM provider, render location, Whisper variant, notification method, and others) are undecided. Ask before picking one.

## Commands

Package manager is **pnpm** (`packageManager: pnpm@10.10.0`). Run these from `site/`.

- `pnpm dev`: dev server on :3000. This also rewrites `AGENTS.md` (see that file).
- `pnpm build` / `pnpm start`
- `pnpm lint`: ESLint 9 flat config (`eslint-config-next` core-web-vitals + typescript)

No test runner is configured yet.

Path alias: `@/*` maps to `site/*`.

## Product architecture (from PRODUCT_SPECS.MD)

This is a UGC auto-editor. A creator uploads a raw vertical clip. The system removes filler words and duplicate takes and tightens pauses, all with **no manual editing step**. Styled captions are then burned in only when the user exports.

Output has two stages:
1. **Cut**: automatic and uncaptioned. It is encoded once, is the preview source, and is the input to every export.
2. **Export**: user-triggered and repeatable per video. It burns one caption preset into the existing cut and never re-cuts.

How the pieces split up:
- **Next.js** handles the UI, including a preview player that draws word-synced captions as an overlay; API routes (presigned URLs, upload confirm, export request); Inngest functions; building the ASS file at export time; and audio extraction plus `silencedetect` through `ffmpeg-static`. It **never encodes video**.
- **Inngest** has two durable functions: the pipeline, triggered by `video.uploaded`, and the export, triggered by `export.requested`. Use `step.run` for in-app work and `step.fetch` for external calls. Modal jobs report completion with events that `step.waitForEvent` waits for, and **every wait needs a timeout**.
- **Modal** runs three endpoints: `transcribe` (GPU; Whisper followed by **mandatory** wav2vec2/WhisperX forced alignment), `render` (CPU; FFmpeg cut to the EDL, constant-frame-rate normalization, no captions) and `export` (CPU; ASS burn-in, same image as `render` with fonts baked in).
- **Neon Postgres via Prisma**: the app runtime uses the pooled connection string and migrations use the direct one.
- **S3** is private and accessed only through presigned URLs. It has prefixes `originals/ audio/ captions/ cuts/ exports/`. **CloudFront** serves content through OAC. **SST** is the IaC.

## Invariants to hold in every change

- Never pass video or audio bytes through Inngest events or step results. Pass only S3 keys, presigned URLs and small JSON.
- Modal gets presigned URLs and a shared secret, never AWS credentials.
- Use one LLM call per video. It covers both duplicate-take detection and transcript polish.
- Word timestamps must come from forced alignment. Whisper's own timings drift 0.2–0.4 s, which leaves slivers of cut words in the output. This was confirmed in the 2026-09-25 spike.
- The EDL rules are in spec §3 step 6: snap cuts to silence, tighten pauses from the middle, pad cuts about 40 ms but clamp them to kept words, and merge or drop tiny cuts and segments. Caption words must be remapped to the **edited timeline**, and chunks never span a cut.
- **Caption presets** are one schema that drives both the browser overlay and the ASS generator, and the two must look the same. Don't add preset fields that ASS can't express. Fixed chunking means no reflow. Size everything as a percentage of video height. Use the same font files for web and for the Modal image.
- ASS gotchas: uppercase the words, not the whole line, because uppercasing the line turns `\kf` into `\KF` and breaks karaoke highlighting. FFmpeg needs `--enable-libass` (on macOS, Homebrew's default `ffmpeg` doesn't have it; use `ffmpeg-full`).
- `ffmpeg-static` may need `outputFileTracingIncludes` in `next.config.ts` so it gets bundled.
