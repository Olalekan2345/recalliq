# Security

## Model boundaries

- The model can only call registered tools, and every argument is validated by zod. There are no shell commands, arbitrary URLs or file access.
- Tool output, on-chain strings, event payloads, package names and recalled memories are framed as untrusted data in the prompt. Memory text never becomes policy: only allowlisted directive tokens parsed from a strict header, on memories with local provenance, are enforced.
- Spending decisions are made by trusted code (`lib/payments/authorization/policy.ts`). Checks run when a request is proposed and again when it is authorized. The model can only propose.

## Payments

- Non-custodial. The user's wallet signs exact bytes; RecallIQ never sees keys or seed phrases.
- Recipient and asset allowlists, network check, per-payment, per-investigation and 24h user limits, plus platform caps.
- Signed bytes are verified before acceptance (signature, sender == connected wallet, not already executed, simulation credits the recipient exactly).
- Replay protection: chain-level (digest executes once) and seller ledger (`x402_sale` unique digest).
- Idempotency: one authorization per intent, one settle job per intent, unique transaction digests.
- Ambiguous outcomes are reconciled from chain state. A timed-out payment is never replaced by a new one.
- SSRF guard: the agent can only reach the registered specialist URL.

## Application

- Better Auth: database sessions, httpOnly cookies (Secure on HTTPS), scrypt password hashing, built-in rate limits on auth endpoints.
- Every protected page and API route resolves the session on the server. All queries are scoped by `user_id`, and the isolation tests cover runs, evidence, memories and payments.
- Same-origin check on all state-changing API requests, in addition to SameSite cookies.
- Postgres-backed rate limits for runs, evaluations, payment decisions, balance lookups and the x402 endpoint.
- Request size limits on every JSON body.
- Security headers: CSP, HSTS, `X-Frame-Options: DENY`, `nosniff`, Referrer-Policy, Permissions-Policy.
- Model output is rendered as text only (`SafeText`); `dangerouslySetInnerHTML` is lint-banned.
- Logs are structured JSON with redaction of API keys, Sui private keys, credentials in URLs and 64-hex secrets. Errors persisted to the DB pass through the same redaction.
- Memory writes reject anything resembling a key, seed phrase or credential. Platform lessons reject addresses and digests.

## Secrets

- All secrets are server-side environment variables (`.env.example` lists keys only). Nothing secret uses `NEXT_PUBLIC_`.
- The MemWal delegate key, Tatum key and LLM keys never reach the browser. The browser's wallet kit uses the public Sui fullnode only for wallet-side resolution.

## Known limitations

- Better Auth's built-in rate limiter uses in-memory storage, so it is per instance; app-level limits are Postgres-backed.
- zkLogin signature verification goes through the configured chain client (Tatum). It has not been exercised against a live zkLogin wallet yet.
- Retraction cannot delete data from Walrus (append-only); it only stops recall.
