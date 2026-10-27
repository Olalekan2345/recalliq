# RecallIQ demo video

The official 2:37 demo for the Walrus × Tatum Total Recall hackathon, produced entirely from genuine recordings of the running app. This folder is separate from the web app: it is excluded from the app's TypeScript, ESLint and Vercel builds.

## Deliverables

| File | What it is |
| --- | --- |
| `exports/recalliq-hackathon-demo.mp4` | Final video: 1920×1080, 30 fps, H.264 + AAC, burned-in captions (not committed: rebuild with the steps below) |
| `exports/recalliq-thumbnail.png` | Thumbnail (uses a real frame from the recorded run) |
| `subtitles/recalliq-demo.srt` | Captions, aligned to the pauses in the voice |
| `scripts/final-narration.md` | Narration with scene labels, times and visual cues |
| `storyboard/final-storyboard.md` | Shot list with the source window of every shot |
| `evidence/evidence-manifest.md` | The records behind every technical claim (runs, verifications, Walrus blobs, payments) |
| `submission.md` | Hackathon submission description |

## How it is made

1. **Record** (`scripts/capture.mjs`, shot list in `scripts/shots.mjs`): Playwright drives the real app and Chromium's screencast captures every frame at 1920×1080; frames are timestamped on arrival and encoded to a constant 30 fps clip. A visible pointer is drawn for viewers; nothing else is added to the page. Shots run against a local instance signed in with a short-lived session created by `scripts/demo-session.mjs` (local only; `delete` removes it), and against the public deployment.
2. **Map motion** (`scripts/motion-map.mjs`): finds when each recording scrolls or changes, so highlight boxes are timed to the footage.
3. **Narrate** (`scripts/narrate.mjs`, text in `scripts/narration.json`): Gemini TTS, voice "Charon". `scripts/transcribe.mjs` transcribes each file to confirm the exact words.
4. **Music** (`scripts/compose-music.mjs`): an original ambient bed synthesised from code.
5. **Captions** (`scripts/build-captions.mjs`): cue boundaries snapped to real pauses; writes `src/cues.json`, `src/gains.json` and the SRT.
6. **Edit and render** with Remotion (`src/`): `src/Demo.tsx` is the edit decision list.

```bash
cd video-demo
pnpm install
# optional, to re-record: the app running on :3300, then
node scripts/demo-session.mjs create <userId> <state.json>
DEMO_STATE=<state.json> LIVE_RUN_URL=<run url> node scripts/capture.mjs <shot> …
node scripts/demo-session.mjs delete
# audio and captions
node scripts/narrate.mjs            # needs GOOGLE_GENERATIVE_AI_API_KEY in ../.env
node scripts/compose-music.mjs 175
node scripts/build-captions.mjs
# preview and render
pnpm studio
pnpm render
pnpm thumbnail
```

`FFMPEG` defaults to the ffmpeg bundled with Remotion's Windows compositor; set it if yours lives elsewhere. Raw recordings, voice and music files are not committed (`.gitignore`); everything needed to regenerate them is.

## Honesty rules this edit follows

- Every product shot is real footage, labelled with its source. Sped-up stretches carry a "Time-lapse · real run sped up" badge and keep the original order of events.
- The architecture diagram is labelled as a concept diagram.
- No payment is shown as completed, because none was made; the Payment Center shot says so on screen.
- No accuracy or cost improvement is claimed; no controlled evaluation had been run.
- The narration is synthetic and is not presented as the project owner's voice.
