# Total Recall submission checklist

Deadline: **November 10, 2026, 17:00 UTC**. Each item below is marked as done or as an operator action.

## Mandatory requirements

| Requirement                                      | Status                                                                      | Action                                                                                                                                                                                                                                                         |
| ------------------------------------------------ | --------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Walrus Memory integrated, writing on **Mainnet** | Code complete (relayer `https://relayer.memory.walrus.xyz`)                 | Create an account and delegate key at memory.walrus.xyz, then set `MEMWAL_KEY`, `MEMWAL_ACCOUNT_ID`. Run `pnpm test:live` to confirm a real blob ID.                                                                                                           |
| Tatum RPC for on-chain data                      | Done (all chain reads, simulation and settlement go through Tatum Sui gRPC) | Set `TATUM_API_KEY` (keyless access rate-limits).                                                                                                                                                                                                              |
| **≥ 10 memories stored on Mainnet**              | Not yet: requires real investigations                                       | Run real investigations with memory on. Lessons are only written for verified mistakes, verified successes of learned policies, repeated tool timeouts and paid-tool value judgements. Check the Memory Vault "Stored on Walrus" counter. Do not write filler. |
| Published blog post                              | Draft in `docs/BLOG_DRAFT.md`                                               | Fill in the real measured results from the Learning Lab, then publish.                                                                                                                                                                                         |
| Working demo + public repo                       | App builds and passes E2E locally                                           | Deploy (see `docs/DEPLOYMENT.md`); push to a public GitHub repo.                                                                                                                                                                                               |
| 2–3 minute demo video                            | —                                                                           | Record the real flow (see the script below).                                                                                                                                                                                                                   |
| Submission form                                  | —                                                                           | Needs: Tatum ID, Sui address, Sui Account ID, `MEMWAL_AGENT_ID` (your MemWal account), repo, video, description.                                                                                                                                               |

## Agent payments (Best Use of Agent Payments)

1. Set `X402_PAY_TO` to your own Sui address, `X402_ALLOWED_RECIPIENTS` to the same, and `X402_FORENSICS_PRICE_ATOMIC` (for example `10000000` = 0.01 SUI).
2. Use a separate wallet (for example Slush) holding a small amount of SUI for the price plus gas.
3. Ask a wallet-activity or comparison question that free tools cannot fully answer. Approve the request in the workspace and sign in the wallet.
4. The Payment Center shows the digest with recipient/asset/amount checks. Keep the Suiscan link as evidence of a real, non-zero Mainnet settlement.

## Suggested demo video (real flow only)

1. The landing page and live integration status.
2. Investigation 1 on a real transfer: the activity feed streams, claims are verified, and if a claim is contradicted, the autopsy diagnoses it and stores a lesson (storage pending → stored with a blob ID).
3. Memory Vault: the lesson, its exact Walrus text, the blob ID and Walruscan link.
4. Investigation 2 (a new session, a different transaction): the lesson is recalled and the policy is enforced. The trace shows "Changed decision" and the new claims are verified.
5. A paid analysis: the approval card, wallet signature, settlement verified on chain, and the result used.
6. Learning Lab: a paired evaluation with honest sample size and conclusion.

> If a mistake does not happen naturally during recording, do not stage one. Use the Learning Lab's labelled controlled fault injection, or show the integration test `tests/integration/learning-loop.test.ts`, and say what it is.

## Optional: Tatum AI Builder prize

That prize is for apps built primarily with ai.tatum.io. RecallIQ is not built with it; this is noted for completeness.
