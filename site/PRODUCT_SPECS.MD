# UGC Auto-Editor — Product & Technical Specification

Context document for AI-assisted development. Treat everything here as the source of truth unless a later instruction overrides it. Sections marked **OPEN** are undecided; do not assume a resolution without asking.

---

## 1. Product

**What it is.** A SaaS that automatically edits user-generated (creator) videos. A creator uploads a raw clip; the system returns a finished edit with:

1. **Filler words removed** ("um", "uh", "like" as filler, etc.).
2. **Duplicate takes removed** — when a creator repeats a line back-to-back, only the **last** take is kept.
3. **Styled, word-synced captions** burned into the video, plus a downloadable SRT.

**Key product constraint.** There is **no manual review step**. Videos go from upload to finished edit fully automatically. The user only chooses settings before upload (caption preset, captions on/off, brand terms). Output quality must therefore be reliable without human correction.

**Target inputs.** Short-form phone footage (TikTok / Reels / Shorts style): vertical, often variable frame rate, talking-head or voiceover, typically under a few minutes.

---

## 2. Stack

| Layer | Choice | Notes |
|---|---|---|
| Frontend / app | Next.js | Hosting **OPEN** (Vercel vs AWS via SST) |
| Orchestration | Inngest | Functions live inside the Next.js app |
| Database | Neon Postgres via Prisma | Pooled connection for app, direct for migrations |
| Object storage | AWS S3 | Private bucket, presigned URLs only |
| Delivery | AWS CloudFront | Origin access control (OAC) |
| Heavy compute | Modal | `transcribe` (GPU), `render` (CPU) |
| LLM | External LLM API | Provider **OPEN** |
| IaC | SST | Manages S3, CloudFront, IAM, Neon (via Pulumi provider) |

### Component responsibilities

- **Next.js** — UI; API routes (presigned URL issuance, upload confirmation); caption style settings; hosts Inngest functions; runs lightweight FFmpeg **audio extraction only** via `ffmpeg-static`. Never runs video encoding.
- **Inngest** — Orchestrates the pipeline as one durable function with per-step retries.
  - `step.run()` for in-app work.
  - `step.fetch()` for external HTTP calls (offloaded to Inngest's servers so Next.js is not billed while waiting).
  - `step.waitForEvent()` to pause until a Modal job reports completion. **Every wait has a timeout.**
- **Neon** — Video records, status, transcripts, edit decision lists, caption settings, user settings.
- **S3** — Original uploads, extracted audio, caption files, final renders. Private; all access via presigned URLs.
- **CloudFront** — Serves finished videos and caption files; bucket stays private via OAC.
- **Modal** — Two functions, each exposed as a web endpoint that spawns a background job and returns immediately. Jobs report completion by sending events to Inngest's event API.
  - `transcribe` — GPU (T4 or L4), Whisper-family model, word-level timestamps, filler words preserved.
  - `render` — CPU, FFmpeg.

---

## 3. Pipeline (single Inngest function, triggered by `video.uploaded`)

Each step updates `Video.status` in Neon so the UI can show progress. Failed steps retry individually. An `onFailure` handler sets status `failed`, stores the error message, and notifies the user.

| # | Step | Runs on | Mechanism | In | Out |
|---|---|---|---|---|---|
| 1 | **Upload** | Browser + Next.js API route | — | Creates `Video` row (`uploading`), returns presigned S3 PUT URL. Browser uploads directly to S3, then calls confirm. | Status `uploaded`; emits `video.uploaded`. |
| 2 | **Extract audio** | Next.js | `step.run` | Presigned GET of original | FFmpeg **copies** the audio stream (no re-encode) → small audio file → PUT to `audio/`. |
| 3 | **Transcribe** | Modal GPU | `step.fetch` + `step.waitForEvent` | Presigned GET of audio | Word-level transcript JSON `[{word, start, end}]` with fillers preserved. Emits `transcription.completed` or `transcription.failed`. |
| 4 | **Detect fillers** | Next.js | `step.run` | Raw transcript | Filler time ranges. |
| 5 | **Detect duplicate takes + polish transcript** | LLM API | `step.fetch` | Transcript + optional user brand-terms list | **One call** returns (a) adjacent sentences flagged as repeated attempts at the same line (keep the last), and (b) corrected spelling / casing / punctuation. |
| 6 | **Build edit decision list (EDL)** | Next.js | `step.run` | Filler ranges + duplicate ranges | Merged list of **segments to keep**, with padding so words are not clipped. Saved to Neon. |
| 7 | **Build captions** | Next.js | `step.run` | Polished transcript + EDL + caption preset | Remove cut words; **remap remaining word timestamps to the edited timeline**; group words into short chunks that never span a cut; generate **ASS** (styled per preset) and **SRT**. Both PUT to `captions/`. |
| 8 | **Render** | Modal CPU | `step.fetch` + `step.waitForEvent` | EDL, ASS file URL, presigned read (original) + write (output) URLs | FFmpeg: cut to kept segments with short audio crossfades, normalize to constant frame rate, burn in captions, encode, PUT to `outputs/`. Emits `render.completed` or `render.failed`. |
| 9 | **Finish** | Next.js | `step.run` | — | Status `complete`, store output key, notify user. Video + SRT served via CloudFront. |

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
        | captioning | rendering | complete | failed
  captionsEnabled: boolean
  captionPreset: string
  s3OriginalKey, s3AudioKey, s3CaptionsAssKey, s3CaptionsSrtKey, s3OutputKey
  createdAt, updatedAt, completedAt
  errorMessage

Transcript
  videoId
  rawWords: JSON      -- [{word, start, end}] as returned by transcription
  polishedWords: JSON -- same shape, after LLM polish

EditDecisionList
  videoId
  segments: JSON      -- [{start, end}] segments to KEEP, in edited order
  removals: JSON      -- [{start, end, reason: "filler" | "duplicate"}]
  -- Stored even though there is no review UI, for debugging and future features.

UserSettings
  userId
  defaultCaptionPreset
  brandTerms: string[]
```

Prisma notes: use Neon's **pooled** connection string for the app runtime and the **direct** connection string for migrations.

---

## 5. S3 layout & policies

- Prefixes: `originals/`, `audio/`, `captions/`, `outputs/` (or separate buckets).
- CORS configured for direct browser PUT uploads.
- Lifecycle rules: auto-delete `audio/` quickly after use; delete `originals/` after a set retention period.
- Bucket is private. CloudFront reads via OAC. Everything else uses presigned URLs.

---

## 6. Security

- Presigned URLs for **all** S3 access. Modal never holds AWS credentials.
- Modal endpoints require a **shared secret** so outsiders cannot submit jobs.
- Modal uses an **Inngest event key** to send completion events.
- If hosted on Vercel: AWS access via **OIDC federation** to an IAM role (no long-lived keys).
- Secrets (Modal, Inngest, LLM keys) stored per stage with `sst secret`.

---

## 7. Cost design rules (enforce in every implementation decision)

1. Only the **small audio file** leaves AWS for transcription. The **full video leaves AWS exactly once**, for the render.
2. Caption burn-in happens inside the existing render encode. **No extra encoding pass.**
3. Transcript polish is folded into the duplicate-detection LLM call. **One LLM request per video.**
4. Modal's default **preemptible** containers are acceptable because Inngest retries failed jobs.
5. **Heavy video encoding never runs in Next.js functions** (timeouts, function pricing).
6. Inngest `step.fetch` is used for all long external waits so app compute is not billed while idle.

---

## 8. Known technical gotchas (must handle)

- **Whisper drops filler words.** Mitigate with a filler-laden initial prompt or a verbatim-tuned model (e.g. CrisperWhisper), plus word alignment (e.g. WhisperX). Must be tested on real UGC clips.
- **Caption drift.** Caption timestamps must be remapped to the edited timeline, accounting for crossfade and padding adjustments, or captions desync after each cut.
- **Fonts.** Caption fonts must be baked into the Modal render container image for FFmpeg to use them.
- **Safe zones.** Captions must sit clear of TikTok / Reels / Shorts UI overlays at the bottom and right edges.
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
| Neon branch ownership | Vercel's Neon integration vs SST creating a branch per stage | Pick one; do not mix. |
| Render location | Modal CPU vs AWS Fargate | Modal: one worker platform, simpler. Fargate: no egress fee, video never leaves AWS. |
| Transcription model | Which Whisper variant | Must keep fillers and give accurate word timings. |
| LLM provider | For duplicate detection + polish | — |
| Caption outputs | Captioned only vs also a clean uncaptioned version | Clean version costs a second render. |
| User notification | Email vs realtime UI vs polling | — |

---

## 10. Glossary

- **EDL** — Edit decision list: the ordered list of source-time segments to keep.
- **Take** — One attempt at a line. A *duplicate take* is an adjacent repeat of the same line; keep the last.
- **Filler** — Non-lexical speech ("um", "uh") or discourse filler with no content.
- **ASS** — Advanced SubStation Alpha subtitle format; supports styling and is burned in by FFmpeg.
- **SRT** — SubRip subtitle format; plain, delivered alongside the video.
- **Edited timeline** — Time as it appears in the output video, after cuts; distinct from source time.