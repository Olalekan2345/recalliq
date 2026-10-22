# Building an AI that remembers its mistakes: RecallIQ on Walrus, Tatum and x402

> **Draft.** Sections marked ⟦MEASURED⟧ must be filled with real numbers from the deployed Learning Lab before publishing. Do not estimate them.

## The problem

AI agents that answer questions about blockchains sound confident and repeat the same mistakes. A classic one is reporting raw atomic units as whole tokens: "received 1,500,000,000 SUI" instead of 1.5. Chat history does not fix this. The agent needs evidence that it was wrong, a durable lesson, and a way for that lesson to change what it does next time.

Agents that can buy data face a second problem: when is buying worth it?

## What RecallIQ does

RecallIQ investigates Sui Mainnet transactions, wallets and contracts from plain-language questions. Every factual statement in its report carries a machine-checkable assertion, for example "address X received exactly 1.5 SUI in transaction D". After the model finishes, an independent verification engine re-reads the chain through Tatum and checks each assertion. The model's agreement with itself is never counted as verification.

## How it uses Tatum

All chain data flows through Tatum's Sui gRPC gateway over native HTTP/2 with an `x-api-key`:

- `LedgerService`: transactions, checkpoints (including inclusion checks), objects, and `ListTransactions` with an affected-address filter for wallet history.
- `StateService`: balances, owned objects and `GetCoinInfo`, the on-chain decimals source behind every displayed amount.
- `MovePackageService` and `NameService`: contract structure and SuiNS.
- `TransactionExecutionService`: simulation and settlement of x402 payments, and the build step for the exact payment transaction the user signs.

Every fetched record is stored as evidence with its provider, method, checkpoint and hash. Citations like [E3] in an answer open the raw record.

## How it uses Walrus Memory

When verification contradicts a claim, the Agent Autopsy determines the cause from the evidence, for example "claimed value differs from the on-chain atomic amount by exactly 10⁹, coin decimals = 9". It then writes a structured lesson to Walrus Memory. The lesson counts as stored only when the relayer job reports `done` with a blob ID.

Before each new investigation, RecallIQ recalls relevant lessons, checks their provenance, filters superseded or conflicting ones, and maps allowlisted directives to policies enforced in code. With `verify_coin_decimals` active, a report that states an amount without running the decimals analyzer is rejected until the agent does it, and the trace records that change.

## How it pays (x402 on Sui)

RecallIQ runs a first-party specialist API protected by x402 (`exact` scheme on Sui). WorthIt decides whether proposing a purchase is reasonable: relevance, measured usefulness (Wilson lower bound), the user's limits, and memories of past purchases. The user approves the exact amount, asset, recipient and network in their own wallet. The seller verifies, computes, and settles through Tatum, and RecallIQ independently verifies the settlement on chain before using the result. If the result added no verified value, that becomes a cost-efficiency lesson.

## How it learns over time ⟦MEASURED⟧

- Stored lessons on Walrus Mainnet: ⟦count from Memory Vault⟧
- Paired evaluation (baseline vs memory): ⟦n pairs, contradicted claims baseline → memory, repeated errors, sign test p⟧
- Example trace: ⟦link to a real memory trace: failure → blob → later run → changed decision → verified outcome⟧
- Paid analyses: ⟦count, total settled, how many cited by verified claims⟧

If the evaluation is inconclusive, say so.

## Challenges and limitations

- Keyless Tatum access rate-limits quickly, so a key is required for real use.
- Walrus storage is append-only. "Forgetting" a lesson means retracting it from recall.
- Memories are stored through an operator MemWal account with per-user namespaces, not in user-owned accounts.
- The only Sui x402 facilitator we found was a hackathon project, so RecallIQ self-facilitates through Tatum.
- The learning effect needs volume. Small samples are reported as inconclusive by design.
