# UGC Auto-Editor — Product & Technical Specification

Context document for AI-assisted development. Treat everything here as the source of truth unless a later instruction overrides it. Sections marked **OPEN** are undecided; do not assume a resolution without asking.

---

## 1. Product

**What it is.** A SaaS that automatically edits user-generated (creator) videos. A creator uploads a raw clip; the system returns a finished edit with:

1. **Filler words removed** ("um", "uh", "like" as filler, etc.).
2. **Duplicate takes removed** — when a creator repeats a line back-to-back, only the **last** take is kept.
3. **Pauses tightened** — any silence longer than the user's max pause is shortened to that length. Without this, removing an "um" from inside a pause leaves the pause, and the output does not feel edited (confirmed in the 2026-09-25 spike).
4. **Styled, word-synced captions.** The finished cut is shown in the app with captions rendered as a **live overlay**, and the user picks a **caption preset** (style) from a catalogue. Captions are **burned in only on export**, from the chosen preset. A downloadable SRT is always available.

**Key product constraint.** There is **no manual editing step**. The cut (fillers, duplicate takes, pauses) goes from upload to finished automatically; the user cannot move or undo cuts. The only choices are settings before upload (max pause length, brand terms) and, after the cut is ready, the caption preset and captions on/off at export time. Cut quality must therefore be reliable without human correction.

**Two-stage output.**
1. **Cut** (automatic): the edited video with no captions. This is the clean version and the preview source.
2. **Export** (user-triggered, repeatable): the cut with the selected caption preset burned in. A user can export the same video more than once with different presets.

**Target inputs.** Short-form phone footage (TikTok / Reels / Shorts style): vertical, often variable frame rate, talking-head or voiceover, typically under a few minutes.

---

## 2. Stack

| Layer | Choice | Notes |
|---|---|---|
| Frontend / app | Next.js | Hosting **OPEN** (Vercel vs AWS via SST) |
| Orchestration | Inngest | Functions live inside the Next.js app |
| Database | Neon Postgres via Prisma | Pooled connection for app, direct for migrations |
| Auth | Neon Auth | Enabled per branch via `neon.ts` (`auth: true`); user tables live in the same Neon database |
| Object storage | AWS S3 | Private bucket, presigned URLs only |
| Delivery | AWS CloudFront | Origin access control (OAC) |
| Heavy compute | Modal | `transcribe` (GPU), `render` (CPU, the cut), `export` (CPU, caption burn-in) |
| LLM | External LLM API | Provider **OPEN** |
| IaC | SST | Manages S3, CloudFront, IAM, Neon (via Pulumi provider) |

### Component responsibilities

- **Next.js** — UI, including the **preview player** (plays the cut from CloudFront and draws word-synced captions as a DOM/canvas overlay from the edited-timeline word JSON and the selected preset); API routes (presigned URL issuance, upload confirmation, export requests); builds the ASS file from a preset at export time; hosts Inngest functions; runs lightweight FFmpeg **audio extraction only** via `ffmpeg-static`. Never runs video encoding.
- **Inngest** — Orchestrates the pipeline as one durable function with per-step retries.
  - `step.run()` for in-app work.
  - `step.fetch()` for external HTTP calls (offloaded to Inngest's servers so Next.js is not billed while waiting).
  - `step.waitForEvent()` to pause until a Modal job reports completion. **Every wait has a timeout.**
- **Neon** — Video records, status, transcripts, edit decision lists, caption settings, user settings.
- **Neon Auth** — User sign-up / sign-in and sessions. Every `userId` in §4 is the Neon Auth user id. Pages and API routes (presigned URLs, upload confirm, export requests) require a signed-in user and only ever act on that user's own videos and exports. Config: `NEON_AUTH_BASE_URL`, `NEON_AUTH_JWKS_URL` (pulled into `.env.local` by `neon link` / `neon deploy`).
- **S3** — Original uploads, extracted audio, caption files, final renders. Private; all access via presigned URLs.
- **CloudFront** — Serves finished videos and caption files; bucket stays private via OAC.
- **Modal** — Three functions, each exposed as a web endpoint that spawns a background job and returns immediately. Jobs report completion by sending events to Inngest's event API.
  - `transcribe` — GPU (T4 or L4), Whisper-family model with a filler-laden initial prompt, **followed by mandatory forced alignment** (wav2vec2 via WhisperX or equivalent) that replaces Whisper's word timestamps. Whisper's own word times drift 0.2–0.4 s and are not accurate enough to cut on.
  - `render` — CPU, FFmpeg. Cuts the original to the EDL and normalizes frame rate. **No captions.**
  - `export` — CPU, FFmpeg. Burns an ASS file into the cut. Input is the already-cut file, so it never re-does the edit. Same container image as `render` (fonts baked in).

---

## 3. Pipeline (single Inngest function, triggered by `video.uploaded`)

Each step updates `Video.status` in Neon so the UI can show progress. Failed steps retry individually. An `onFailure` handler sets status `failed`, stores the error message, and notifies the user.

| # | Step | Runs on | Mechanism | In | Out |
|---|---|---|---|---|---|
| 1 | **Upload** | Browser + Next.js API route | — | Creates `Video` row (`uploading`), returns presigned S3 PUT URL. Browser uploads directly to S3, then calls confirm. | Status `uploaded`; emits `video.uploaded`. |
| 2 | **Extract audio + detect silence** | Next.js | `step.run` | Presigned GET of original | FFmpeg **copies** the audio stream (no re-encode) → small audio file → PUT to `audio/`. Same FFmpeg invocation runs `silencedetect` (about −35 dB, min 0.2 s) and returns the silence ranges `[{start, end}]` as small JSON. |
| 3 | **Transcribe + align** | Modal GPU | `step.fetch` + `step.waitForEvent` | Presigned GET of audio | Word-level transcript JSON `[{word, start, end}]` with fillers preserved, where `start`/`end` come from **forced alignment**, not Whisper. Emits `transcription.completed` or `transcription.failed`. |
| 4 | **Detect fillers** | Next.js | `step.run` | Aligned transcript | Filler time ranges. Each range **absorbs adjacent silence** up to ~0.6 s on either side, never past a neighbouring word, because an isolated "um" inside a pause is otherwise only partly removed. |
| 5 | **Detect duplicate takes + polish transcript** | LLM API | `step.fetch` | Transcript + optional user brand-terms list | **One call** returns (a) adjacent sentences flagged as repeated attempts at the same line (keep the last), and (b) corrected spelling / casing / punctuation. |
| 6 | **Build edit decision list (EDL)** | Next.js | `step.run` | Filler ranges + duplicate ranges + silence ranges + max pause setting | (a) **Snap to silence**: a cut boundary that lands inside speech moves outward to the nearest silence boundary within ~0.6 s, never past a neighbouring kept word. (b) **Pause tightening**: every silence longer than `maxPauseSeconds` is cut down to that length, trimmed from its middle. (c) **Padding protects kept words**: each cut widens by ~40 ms into the removed side but is clamped to the neighbouring kept words. (d) Cuts closer than ~0.25 s merge; kept segments shorter than ~0.3 s are dropped, so no sliver of a removed word survives. Output is the merged list of **segments to keep**. Saved to Neon. |
| 7 | **Build edited-timeline captions data** | Next.js | `step.run` | Polished transcript + EDL | Remove cut words; **remap remaining word timestamps to the edited timeline**; group words into short chunks that never span a cut. Save the result as `editedWords` + `chunks` JSON in Neon (style-independent; the preview overlay and every export are generated from it). Generate **SRT** now and PUT to `captions/`. **No ASS yet** — that needs a preset. |
| 8 | **Render cut** | Modal CPU | `step.fetch` + `step.waitForEvent` | EDL, presigned read (original) + write (cut) URLs | FFmpeg: cut to kept segments with short audio crossfades, normalize to constant frame rate, encode, PUT to `cuts/`. **No caption burn-in.** Emits `render.completed` or `render.failed`. |
| 9 | **Ready** | Next.js | `step.run` | — | Status `ready`, store cut key, notify user. Cut + SRT served via CloudFront. The app opens the preview player. |

### Export flow (separate Inngest function, triggered by `export.requested`)

Runs when the user picks a preset and clicks export. Repeatable per video.

| # | Step | Runs on | Mechanism | In | Out |
|---|---|---|---|---|---|
| E1 | **Request** | Next.js API route | — | `videoId`, `presetId`, `captionsEnabled` | Creates `Export` row (`queued`); emits `export.requested`. |
| E2 | **Build ASS** | Next.js | `step.run` | `chunks` JSON + preset definition + cut dimensions | Generate **ASS** styled per preset (font, colours, highlight mode, position, safe-zone margins). PUT to `captions/`. Skipped when captions are off; the export is then just a copy of the cut. |
| E3 | **Burn in** | Modal CPU | `step.fetch` + `step.waitForEvent` | ASS URL, presigned read (cut) + write (export) URLs | FFmpeg: `ass` filter over the cut, encode, PUT to `exports/`. Emits `export.completed` or `export.failed`. |
| E4 | **Finish** | Next.js | `step.run` | — | `Export.status = complete`, store key, notify user. Served via CloudFront. |

### Caption presets

A preset is **one definition that drives both renderers**: the in-app overlay and the ASS generator must produce the same look from the same fields. Keep the schema narrow so that parity is achievable.

```
CaptionPreset
  id, name, thumbnailUrl
  font: { family, weight, sizePct }          -- size as % of video height
  colors: { text, highlight, outline, background? }
  highlight: "karaoke-fill" | "word-pop" | "box" | "none"
  transform: "upper" | "none"
  position: { anchor: "bottom" | "center", offsetPct }   -- offsetPct from bottom, inside safe zone
  chunk: { maxWords, maxSeconds }
  outline: { widthPct, shadow }
```

Rules:
- Presets are **system-defined** in v1 (a curated catalogue of ~6). No custom presets.
- Fonts used by presets ship as web fonts for the overlay **and** as TTF/OTF baked into the Modal image. Same files, same version.
- `karaoke-fill` maps to ASS `\kf`; `word-pop` maps to per-word `\fscx\fscy` scaling; `box` maps to `BorderStyle=3`. Anything that cannot be expressed in ASS is not allowed in the preset schema.
- Every preset is verified by rendering the same clip through both paths and comparing frames (see §8 "Preview / export parity").

### Payload rules

- **Never pass video or audio bytes through Inngest step results or events.** Pass S3 keys, presigned URLs, and small JSON only.
- Modal receives presigned URLs and a shared secret; it never receives AWS credentials.
- Transcript JSON is returned to Inngest (via the completion event or a follow-up fetch) and persisted to Neon by the Inngest function.

---

## 4. Data model

```
Video
  id, userId
  status: uploading | uploaded | extracting_audio | transcribing | analyzing
        | captioning | rendering | ready | failed
  maxPauseSeconds: float  -- copied from UserSettings at upload; 0 disables pause tightening
  s3OriginalKey, s3AudioKey, s3CaptionsSrtKey, s3CutKey
  width, height, durationSeconds  -- of the cut; the ASS generator needs them
  createdAt, updatedAt, readyAt
  errorMessage

Transcript
  videoId
  rawWords: JSON      -- [{word, start, end}] after forced alignment (Whisper's own times are not stored)
  polishedWords: JSON -- same shape, after LLM polish
  silences: JSON      -- [{start, end}] from silencedetect in step 2
  editedWords: JSON   -- [{word, start, end}] on the EDITED timeline, cut words removed
  chunks: JSON        -- [{start, end, words: [{word, start, end}]}] caption groups; never span a cut

Export
  id, videoId
  presetId: string        -- references the system preset catalogue (code, not DB, in v1)
  captionsEnabled: boolean
  status: queued | building_captions | exporting | complete | failed
  s3CaptionsAssKey, s3ExportKey
  createdAt, completedAt, errorMessage
  -- One row per export; a video can have many.

EditDecisionList
  videoId
  segments: JSON      -- [{start, end}] segments to KEEP, in edited order
  removals: JSON      -- [{start, end, reason: "filler" | "duplicate" | "pause"}]
  -- Stored even though there is no review UI, for debugging and future features.

UserSettings
  userId
  defaultPresetId              -- preselected in the preview; last-used preset overwrites it
  defaultMaxPauseSeconds: float  -- default 0.4
  brandTerms: string[]
```

Prisma notes: use Neon's **pooled** connection string for the app runtime and the **direct** connection string for migrations.

---

## 5. S3 layout & policies

- Prefixes: `originals/`, `audio/`, `captions/`, `cuts/`, `exports/` (or separate buckets).
- CORS configured for direct browser PUT uploads.
- Lifecycle rules: auto-delete `audio/` quickly after use; delete `originals/` after a set retention period. `cuts/` must outlive `originals/` because every export reads from the cut.
- Bucket is private. CloudFront reads via OAC. Everything else uses presigned URLs.

---

## 6. Security

- **Authentication via Neon Auth.** Every page and API route except sign-in requires a session. Authorization is ownership: a user can only read, upload, or export against rows whose `userId` matches their session. Presigned URLs are issued only after that check.
- Presigned URLs for **all** S3 access. Modal never holds AWS credentials.
- Modal endpoints require a **shared secret** so outsiders cannot submit jobs.
- Modal uses an **Inngest event key** to send completion events.
- If hosted on Vercel: AWS access via **OIDC federation** to an IAM role (no long-lived keys).
- Secrets (Modal, Inngest, LLM keys) stored per stage with `sst secret`.

---

## 7. Cost design rules (enforce in every implementation decision)

1. Only the **small audio file** leaves AWS for transcription. The **original leaves AWS exactly once**, for the cut render. Each export moves the (shorter) cut out once more.
2. **Two encodes per video, not one.** The cut is encoded once, automatically. Caption burn-in is a second, user-triggered encode of the cut. This is the price of previewing styles before committing. Never re-cut on export; the export job only ever burns captions into the existing cut. Preview is free: the overlay runs in the browser.
3. Transcript polish is folded into the duplicate-detection LLM call. **One LLM request per video.**
4. Modal's default **preemptible** containers are acceptable because Inngest retries failed jobs.
5. **Heavy video encoding never runs in Next.js functions** (timeouts, function pricing).
6. Inngest `step.fetch` is used for all long external waits so app compute is not billed while idle.

---

## 8. Known technical gotchas (must handle)

- **Whisper drops filler words.** Mitigate with a filler-laden initial prompt or a verbatim-tuned model (e.g. CrisperWhisper). In the 2026-09-25 spike, faster-whisper `small.en` and `medium.en` kept every "um" on the test clip with and without the prompt, but that is one scripted clip; must still be tested on real UGC.
- **Whisper word timestamps drift.** Confirmed in the spike: 0.2–0.4 s off on both model sizes, enough to leave fragments of cut words in the output. Forced alignment (WhisperX) brought the output to an exact match with the intended edit. Alignment is therefore **mandatory**, not a mitigation (see §3 step 3).
- **Cut slivers.** Padding that shrinks a cut, or a kept segment that is only a few frames long, leaves audible fragments of removed words. See §3 step 6 (c) and (d).
- **Pause-only "um".** An "um" that sits alone in a pause has an unreliable timestamp and, once removed, leaves the pause intact. Filler ranges absorb adjacent silence (§3 step 4) and pause tightening (§3 step 6 b) handles the rest.
- **FFmpeg must be built with libass.** The `ass` / `subtitles` filters are absent from some builds (e.g. Homebrew's default `ffmpeg`). The render container image must use a build with `--enable-libass`.
- **ASS karaoke tags are case-sensitive.** Uppercasing a caption line turns `\kf` into `\KF` and silently disables per-word highlighting. Uppercase the words, not the line.
- **Caption drift.** Caption timestamps must be remapped to the edited timeline, accounting for crossfade and padding adjustments, or captions desync after each cut.
- **Fonts.** Caption fonts must be baked into the Modal export container image for FFmpeg to use them, and the same font files must be served as web fonts for the preview overlay. A version mismatch shows up as different line breaks between preview and export.
- **Preview / export parity.** The browser overlay and libass lay out text differently (kerning, wrapping, outline rendering). Mitigate by keeping the preset schema narrow (§3), using fixed chunking (no reflow: the chunk from `Transcript.chunks` is the line), sizing everything as a percentage of video height, and frame-comparing each preset against the burned output before it ships.
- **Safe zones.** Captions must sit clear of TikTok / Reels / Shorts UI overlays at the bottom and right edges. The preset's `position.offsetPct` is the only knob and its allowed range enforces this; the preview shows the safe-zone outline.
- **Variable frame rate.** Phone footage is often VFR, which causes A/V drift when cutting. The render step normalizes to constant frame rate.
- **Prisma + Neon.** Pooled string for app, direct string for migrations (see §4).
- **ffmpeg-static bundling.** May need `outputFileTracingIncludes` in `next.config` to be included in the build.
- **No video through Inngest.** Keys/URLs/small JSON only (see §3).
- **Completion-event race.** If a Modal job finishes before `step.waitForEvent()` is listening, the event could be missed. Verify Inngest's actual behavior. Alternatives: chain separate Inngest functions triggered by completion events, or check job status in Neon on timeout.

---

## 9. OPEN decisions

| Decision | Options | Considerations |
|---|---|---|
| Next.js hosting | Vercel vs AWS via SST | Vercel: simpler, polished previews, OIDC to AWS. SST/AWS: one account, resource linking, audio extraction next to S3. |
| Neon branch ownership | Vercel's Neon integration vs SST creating a branch per stage | Pick one; do not mix. Current state: project `raspy-rice-16858150` has `production` (default) and `dev`; local `site/` is linked to `dev` via the Neon CLI. Neon Auth must be enabled on every branch the app runs against. |
| Render location | Modal CPU vs AWS Fargate | Modal: one worker platform, simpler. Fargate: no egress fee, video never leaves AWS. |
| Transcription model | Which Whisper variant | Must keep fillers. Word timings come from the forced-alignment pass regardless of variant, so the choice is about transcript accuracy and GPU cost. Spike data point: `medium.en` was about 3× slower than `small.en` on CPU with no timing benefit once aligned. |
| Pause tightening default | 0.4 s vs 0.5 s vs off | 0.4 s produced a natural-feeling edit on the spike clip. Setting is per user and per video. |
| LLM provider | For duplicate detection + polish | — |
| ~~Caption outputs~~ | ~~Captioned only vs also a clean uncaptioned version~~ | **Resolved** by the two-stage output: the cut *is* the clean version and always exists. |
| Preview player captions | DOM overlay vs canvas overlay | DOM is simpler and styleable with CSS; canvas gives exact control over outline/shadow and matches libass more closely. Decide after the first parity test. |
| User notification | Email vs realtime UI vs polling | — |

---

## 10. Glossary

- **EDL** — Edit decision list: the ordered list of source-time segments to keep.
- **Take** — One attempt at a line. A *duplicate take* is an adjacent repeat of the same line; keep the last.
- **Filler** — Non-lexical speech ("um", "uh") or discourse filler with no content.
- **Forced alignment** — A second pass that maps each transcribed word onto the audio with a phoneme-level model (e.g. wav2vec2 via WhisperX) to get accurate word start/end times.
- **Pause tightening** — Shortening any silence longer than the user's max pause to that length, cutting from the middle of the silence.
- **Snap to silence** — Moving a cut boundary that falls inside speech outward to the nearest detected silence boundary.
- **ASS** — Advanced SubStation Alpha subtitle format; supports styling and is burned in by FFmpeg.
- **SRT** — SubRip subtitle format; plain, delivered alongside the video.
- **Edited timeline** — Time as it appears in the output video, after cuts; distinct from source time.
- **Cut** — The automatically edited video with no captions. The preview source and the input to every export.
- **Export** — A user-triggered render that burns one caption preset into the cut.
- **Caption preset** — A system-defined style (font, colours, highlight mode, position, chunking) that drives both the preview overlay and the ASS generator.