# Evidence manifest — RecallIQ demo video

Every technical claim in the video maps to a record below. Records come from the RecallIQ database (local instance, owner's account), Sui Mainnet (read through Tatum gRPC), and Walrus Mainnet (blob pages on walruscan.com). No credentials or personal data are listed. Times are UTC.

## What is real, what is concept

| On screen | Source |
| --- | --- |
| All app footage | Screen recordings of the running app (`scripts/capture.mjs`, Chromium screencast, 1920×1080). Nothing was redrawn or edited inside the frame. |
| "Public deployment" shots | Recorded from https://recalliq-seven.vercel.app on 27 Oct 2026. |
| "Real run / Earlier session / Later session" shots | Recorded from the owner's local instance (same code base; database on this machine; live Sui Mainnet via Tatum and Walrus Mainnet). The local build also contains three small display improvements on branch `feature/demo-video` (claim Asserted/Observed values, recalled-blob IDs in a run's Memory tab, wrapping in the influence trace). |
| Time-lapse badge | Real footage of run `d4100c5d` sped up 2.6–12× to remove waiting. Order of events is unchanged. |
| Walruscan shot | walruscan.com, an independent Walrus Mainnet explorer. |
| "How RecallIQ fits together" | Concept diagram, labelled as such. Each block maps to a module: `lib/memory` (recall/store), `lib/ai/worthit`, `lib/blockchain/tatum`, `lib/ai/verification`, `lib/ai/reflection` (autopsy), `server/services/payments` (x402). |
| Logo intro, end card, captions, highlight boxes | Motion graphics and annotations. |
| Narration | Synthetic voice (Google Gemini TTS, voice "Charon"), not the project owner's voice. |
| Music | Original, synthesised from code (`scripts/compose-music.mjs`); no samples or third-party audio. |

## Scene 3 — the new investigation (run `d4100c5d-2d48-4aea-830f-fb801d230d3b`)

- Question: "What has this address been doing on Sui recently, and what does it interact with? 0x77776760c06997206b13fa76f127aa016d24a645f04fce516be153ece0bddf23"
- Started 2026-10-26 17:53:21, completed 17:55:05 (1 min 43 s). Status COMPLETED. Category: contract_interaction.
- Memory recall: "Recalled 6 memories (6 relevant)"; 5 applied, 1 considered.

| Ref | Lesson | Disposition | Distance | Walrus blob |
| --- | --- | --- | --- | --- |
| M1 | Verified approach for contract interaction: tatum_transaction_inspector → balance_change_analyzer | applied, changed decision ("tatum_transaction_inspector preferred for contract_interaction") | 0.551 | `oR3JVoRDjdyY1Duh_HHPQbh9a0SdlD41UlRIw4D59gc` |
| M2 | Factual claim made without checkable evidence | applied | 0.595 | `27PERGpIN5rynPo2kfoLjFwQ-SQPV-RrsEoXF4RWmRA` |
| M3 | Applying "cite evidence for every fact" produced a fully verified result | applied | 0.610 | `9GE645a8qLWkH23OQ6-4nG5JCEaHXvUiE3BuKargjis` |
| M4 | Verified approach for wallet activity: tatum_wallet_inspector | considered | 0.631 | `S9rfs9S_TZ1Ut3WRIMI82N5Od3ES7n63cyjPpsFLjJk` |
| M5 | Factual claim made without checkable evidence (the lesson from scene 4) | applied | 0.638 | `qXq-A_vKJY87zubVjU5RSgV79CRokPP6cPQndbd5e2g` |
| M6 | Applying "cite evidence for every fact" produced a fully verified result | applied | 0.664 | `cUwnplSCt6tr-LdRXzIcnHkVv6VHDIjhCiDjI0c2bNQ` |

- WorthIt: "Selected 9 tools; paid analysis not offered" — reasons recorded: "Not a specialist fit for contract_interaction", "Expected benefit 0.20 below 0.25".
- Tools executed (all through Tatum Sui gRPC): tatum_wallet_inspector ×1, tatum_transaction_inspector ×3, evidence_cross_checker ×1.
- Verification (5 claims, 5 VERIFIED):
  - C1 Address holds 243,001,381,957 atomic units of SUI — StateService/GetBalance
  - C2 Address holds 84,030,941 atomic units of USDT — StateService/GetBalance
  - C3 Transaction 5Se6qQ9qKMC1ztZigo9XJ9vzLN2XAXc8Mk2QKX2hmFYC executed in checkpoint 335451404 — GetTransaction: checkpoint
  - C4 Transaction VoeMkptS1f4FHX9fdnb7Jkwu799Ebtf4EJY54gtszXz succeeded — GetTransaction: effects.status
  - C5 Transaction Fge72nXNLeVPShpdiR3YLJZ6TgAboehEZUofB2FhCDk9 succeeded — GetTransaction: effects.status
- Autopsy: "no failures detected". Memory write: lessons already remembered (deduplicated), so nothing new was written.

## Scene 4 — the mistake and the lesson (run `c6158cb4-d9c5-48c1-b281-2cf980004eeb`)

- Question: forensic deep-dive on transaction `F1ggvedPEc1ERhbQJsz68BNcb7EzpjnQszst2f6eKZXW`. 2026-10-23 05:15:20 → 05:15:37. Status PARTIALLY_COMPLETED.
- C1 VERIFIED — failed with MoveAbort code 3018 (GetTransaction: effects.status).
- C2 CONTRADICTED — the claim's machine-checkable assertion was `netGasAtomic: -100950`; the chain read `netGasAtomic: 100950` (GetTransaction: effects.gas_used = computation + storage − rebate). Source tatum-grpc, verified 2026-10-23 05:15:37.
- Autopsy: category `unsupported_claim`.
- Lesson written: memory `50b39a3d-523b-493c-80f2-72da5c3ddc31`, type failure, directive `cite_evidence_for_every_fact`, summary "Factual claim made without checkable evidence".
  - Walrus job `c6c5a5d7-a57d-40ba-9e33-5e020b6bc4b8`; storage status `stored` after 1 attempt; stored 2026-10-23 05:16:11.
  - Blob ID `qXq-A_vKJY87zubVjU5RSgV79CRokPP6cPQndbd5e2g` — https://walruscan.com/mainnet/blob/qXq-A_vKJY87zubVjU5RSgV79CRokPP6cPQndbd5e2g (Walruscan shows: sender 0xe6fff6…0ac50751, Sui object 0x33805f…fcd67625, 1.02 KB, epochs 42–57, transactions `seal_encrypt_fence`, `certify_blob`, `redeem_funds`).
  - Namespace `recalliq-u-eba92bda38efbaf5628c` (per-user, hashed). Content is Seal-encrypted; the readable text shown in the Memory Vault is the exact outbox text that was submitted.

## Scene 5 — the lesson changes a later session (run `b4823d2e-ad83-41c7-b636-b8974b051802`)

- Question: which contract functions did transaction `8Ui2kGVbAtPf5qAB2u4aTJtGiM3KxqTRSrEW9NpP3BFc` call, and how much WAL, USDC and SUI left the sender's wallet. 2026-10-23 19:20:27 → 19:20:47 (the same day, about 14 hours after scene 4). Status COMPLETED.
- Recall: "Recalled 2 memories (2 relevant)". M2 is the scene-4 lesson (blob `qXq-A_…`, distance 0.559, applied).
- Policy enforcement recorded: "Learned policy enforced: report rejected (cite_evidence_for_every_fact)". The memory usage row records the changed decision: "Final report rejected until the agent complied (1×): 3 factual claim(s) lack evidence refs or assertions".
- Verification: C1–C4 all VERIFIED (status success; exact WAL −314,844,563,829, USDC −11,866,233 and SUI −4,266,908 atomic amounts via GetTransaction balance_changes).
- The lesson's influence trace lists 5 later investigations that retrieved it, including scene 3's run.

## Scene 6 — WorthIt and payments

- Tool Intelligence: Network Status reliability bars (success lower bound 92 %, cited-by-verified-claims lower bound 76 %, n = 43) are computed from real tool executions (Wilson lower bound).
- Forensic Analyzer (paid, x402): price "x402 · 0.01 SUI per call" as configured on the deployment; "Insufficient data to estimate reliability (n=0)".
- Payments: the database holds 0 payment intents and 0 settlements. The video therefore shows no completed payment, and says so on screen: "The x402 payment flow is implemented and tested · no paid call was made for this video". The described flow (user signs the exact asset, amount and recipient; settlement confirmed on chain before use) is covered by `tests/integration/payments.test.ts`.

## Scene 2 — public deployment

- Integration health on https://recalliq-seven.vercel.app at recording time: Database, Tatum Sui gRPC (Sui mainnet · checkpoint 338417867), Walrus Memory (relayer ok v0.1.0), Language model (google · gemini-3.5-flash-lite), x402 payments — all Operational.

## Totals at recording time

- Lessons stored on Walrus with a blob ID: 8. Three earlier writes failed during a Walrus relayer outage on 22 Oct 2026 and are not counted.
- The video does not claim measured accuracy improvements: no controlled evaluation had been run, and the Learning Lab says so.
