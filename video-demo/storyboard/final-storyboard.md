# Final storyboard — RecallIQ demo

1920×1080, 30 fps, 2:37. The authoritative edit list is `src/Demo.tsx`; this table mirrors it. "Source" is the recording in `assets/captures/` and the window used (seconds in that recording). Every source shot carries an on-screen source label (green = public deployment, cyan = recorded real run, violet = external explorer). Shots that open a section hold their label back while the section title shows. Transitions are 0.3 s dissolves unless noted; highlight boxes are cyan outlines drawn only while the element is on screen.

| Time | Scene | Source (window) | On screen | Narration |
| --- | --- | --- | --- | --- |
| 0:00–0:04 | 1 Hook | Motion graphics | Glow → emblem rises from depth → "RecallIQ" → "Your AI remembers. Your intelligence evolves." | "Most AI agents can solve a task today." |
| 0:04–0:08 | 1 Hook | `run-a` 11.2–14.6 (0.85×) | Zoom on claim C2: Asserted −100950 / Observed 100950 boxed | "…a bad assumption, the wrong tool," |
| 0:08–0:11 | 1 Hook | `live-memory` 10.3–13.1 | Zoom on recalled lesson M5 with its Walrus blob | "…carry over to tomorrow?" |
| 0:11–0:14 | 1 Hook | `lesson` 12.8–16.4 | Zoom on "Changed decision" in the lesson's trace | "Usually not. Every session starts from zero." |
| 0:14–0:22 | 2 Built | `prod-home` 0–8.1 | Public homepage hero, then scroll | "This is RecallIQ…" |
| 0:22–0:28 | 2 Built | `prod-status` 0–5.2 | Live integration status; Walrus Memory and Tatum Sui gRPC boxed | "…keeps what it learns in Walrus Memory…" |
| 0:28–0:33 | 3 New run | `live-run` 6–20 (2.6×, time-lapse) | Title card 1; the question typed and submitted | "Let's ask it something new…" |
| 0:33–0:40 | 3 New run | `live-run` 31–49 (3×, time-lapse) | "Recalled 6 memories (6 relevant)" and "Selected 9 tools; paid analysis not offered" boxed | "First, it recalls six relevant lessons…" |
| 0:40–0:47 | 3 New run | `live-run` 50–147 (12×, time-lapse) | Tool calls stream in (Wallet Inspector, Transaction Inspector ×3, Evidence Cross-Checker) | "Every call reads live Sui data through Tatum's gRPC gateway…" |
| 0:47–0:53 | 3 New run | `live-run` 151–157 | Verification steps C1–C5 VERIFIED boxed | "…re-checked against a fresh chain read. All five verified." |
| 0:53–0:55 | 3 New run | `live-result` 4.9–6.9 | "5 verified" boxed | (beat) |
| 0:55–1:02 | 3 New run | `live-memory` 5.1–8.6, 10.2–13.2 | Memory tab: "Changed decision", "Recalled from Walrus blob" rows boxed | "And here's why it worked that way…" |
| 1:02–1:04 | 4 Autopsy | `live-memory` 10.4–13.2 | Title card 2; lesson M5 boxed | "One of them came from a real mistake." |
| 1:04–1:08 | 4 Autopsy | `run-a` 0–3.3 | The earlier session's question, "Partially completed" | "A few days earlier, in another session," |
| 1:08–1:12 | 4 Autopsy | `run-a` 11.2–14.6 (0.75×) | C2 claim, then Asserted/Observed boxed | "…a gas amount with the wrong sign, and the chain contradicted it." |
| 1:12–1:21 | 4 Autopsy | `run-a` 16.6–22.0 (0.6×) | "Autopsy: unsupported claim"; then "Lesson submitted to Walrus" boxed | "The Agent Autopsy diagnosed…" |
| 1:21–1:25 | 4 Walrus | `lesson` 0.3–4.1 | Memory Vault: "Stored on Walrus" + blob ID boxed | "That lesson was written to Walrus Mainnet." |
| 1:25–1:27 | 4 Walrus | `lesson` 4.0–6.4 | The exact text stored on Walrus boxed | "Here's the exact text it stored," |
| 1:27–1:31 | 4 Walrus | `walruscan` 1.9–6.6 | Walruscan: Blob ID and its Sui object row boxed | "…and here's its blob, on Walruscan." |
| 1:31–1:35 | 5 Behaviour | `run-b` 0–2.6 | Title card 3; the later session's question | "Later that day, a completely different question." |
| 1:35–1:40 | 5 Behaviour | `run-b` 4.4–7.2 (0.53×) | "Recalled 2 memories (2 relevant)" boxed | "RecallIQ brought that lesson back from Walrus…" |
| 1:40–1:43 | 5 Behaviour | `run-b` 8.8–10.8 | "Learned policy enforced: report rejected" boxed | "…it's an enforced policy." |
| 1:43–1:46 | 5 Behaviour | `lesson` 12.8–15.5 | Trace: "Final report rejected… 3 factual claim(s) lack evidence" boxed | "The agent's first report was rejected…" |
| 1:46–1:49 | 5 Behaviour | `run-b` 10.4–12.2 (0.5×) | C1–C4 VERIFIED boxed | "The agent fixed them, and all four verified." |
| 1:49–1:51 | 5 Behaviour | `lesson` 15.0–16.5 | "5 later investigation(s) retrieved this memory" and the retrieval list boxed | (pause) |
| 1:51–1:58 | 6 WorthIt | `tools` 0.3–10.2 (1.6×) | Title card 4; Tool Intelligence; reliability bars boxed | "WorthIt decides what's worth paying for…" |
| 1:58–2:02 | 6 WorthIt | `tools` 6.8–10.1 (0.75×) | Forensic Analyzer (paid, x402) card and its 0.01 SUI price boxed | "A paid specialist is only offered when…" |
| 2:02–2:05 | 6 WorthIt | `live-memory` 18.6–21.9 | "Paid analysis not offered · Expected benefit 0.20 below 0.25" boxed | "Here it didn't, so nothing was spent." |
| 2:05–2:15 | 6 Payments | `payments` 0.3–9.5 | Payment Center; "every payment requires your explicit signature" boxed; note "no paid call was made for this video" | "When one is worth it, you approve…" |
| 2:15–2:21 | 7 Learning Lab | `learning` 1.0–8.8 (1.25×) | Title card 5; influence traces; "Previous failure" boxed | "The Learning Lab traces every lesson…" |
| 2:21–2:28 | 7 Close | Motion graphics (concept) | "How RecallIQ fits together — concept diagram": question → recall (Walrus) → WorthIt → Tatum → verify → autopsy → store (Walrus) → next session; x402 dashed from WorthIt | "RecallIQ brings persistent memory…" |
| 2:28–2:37 | 7 Close | Motion graphics | Emblem, "An AI agent that learns from verified experience.", stack chips, recalliq-seven.vercel.app, github.com/Olalekan2345/recalliq | "Because software should learn from experience…" |

Sound: one soundtrack mixed offline (`scripts/mix-audio.mjs`): narration (10 segments, levelled to −19 dB) over an original synthesised ambient bed that ducks smoothly under the voice and lifts in the gaps. Camera moves are gentle (at most 1.2×) and never crop past the edge of the recording. Captions are burned in and also delivered as `subtitles/recalliq-demo.srt`.
