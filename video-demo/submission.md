# RecallIQ — submission description

**Track:** Smart Agents for Real Life · Walrus × Tatum Total Recall
**Live app:** https://recalliq-seven.vercel.app
**Code:** https://github.com/Olalekan2345/recalliq
**Demo video:** `video-demo/exports/recalliq-hackathon-demo.mp4` (2:37)

## The problem

AI agents start every session from zero. When one makes a mistake (a wrong assumption, the wrong tool, a paid call that added nothing), nothing durable carries over, so the next session can repeat it.

## What we built

RecallIQ is an AI agent that investigates real Sui Mainnet activity, checks every claim it makes against fresh chain data, and keeps evidence-backed lessons in Walrus Memory, so later sessions start better informed.

- **Tatum** supplies the chain data: every tool reads Sui Mainnet through Tatum's Sui gRPC gateway, and everything read becomes evidence with its source method. After the agent reports, each claim's machine-checkable assertion is re-checked against a fresh Tatum read and marked Verified, Contradicted or Unverified.
- **Agent Autopsy:** when a claim is contradicted, the autopsy diagnoses the cause from evidence and turns it into a lesson with an enforceable directive.
- **Walrus Memory** stores those lessons (encrypted, per-user namespace). A lesson counts as stored only once Walrus returns a blob ID. Later investigations recall lessons by meaning, and directives are enforced in code: a report that breaks a learned rule is rejected until the agent complies.
- **WorthIt** ranks tools by relevance and by reliability measured on real runs (Wilson lower bound), and offers a paid specialist only when its expected benefit clears a threshold.
- **x402 on Sui:** when paid analysis is offered, the user approves the exact asset, amount and recipient in their own wallet, and RecallIQ confirms the settlement on chain through Tatum before using the result.
- **Learning Lab** traces every lesson from the failure that created it to each later decision it changed, and runs paired evaluations (memory on and off) that report "inconclusive" when the data cannot support a claim.

## What the demo shows (all real records)

1. A new investigation recalls 6 lessons from Walrus, applies 5 of them, uses only free Tatum tools ("paid analysis not offered: expected benefit 0.20 below 0.25"), and verifies 5 of 5 claims.
2. One of those lessons came from an earlier session in which the agent asserted a gas amount with the wrong sign (asserted −100950, chain 100950). The autopsy turned it into the rule "every fact needs evidence and a checkable assertion", stored on Walrus Mainnet as blob `qXq-A_vKJY87zubVjU5RSgV79CRokPP6cPQndbd5e2g`, shown on Walruscan.
3. Later the same day, a different question recalled that lesson. The agent's first report was rejected because 3 claims lacked evidence; it fixed them, and all 4 claims verified. The lesson's trace shows 5 later investigations that retrieved it.

Full references (run IDs, verification methods, blob IDs) are in `video-demo/evidence/evidence-manifest.md`.

## Honest limits

- No paid x402 call was made during the demo; the payment flow is implemented and covered by integration tests.
- No controlled memory-on/off evaluation had been run at recording time, so the demo claims no measured accuracy gain.
- Lessons are stored under RecallIQ's MemWal account, isolated per user, not in users' own wallets.
