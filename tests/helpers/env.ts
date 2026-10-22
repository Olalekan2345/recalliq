/**
 * Integration-test environment. No real credentials: external services are
 * replaced by explicit, isolated test doubles injected per test (the SDK's own
 * MemWalMock, a recorded-fixture chain client, a scripted mock LLM). Never
 * used by the application itself.
 */
(process.env as Record<string, string>).NODE_ENV = "test";
process.env.LOG_LEVEL = "error";
process.env.NEXT_PUBLIC_APP_URL = "http://localhost:3300";
process.env.WORKER_MODE = "off";
process.env.X402_NETWORK = "sui:mainnet";
process.env.X402_PAY_TO = "0x" + "a".repeat(64);
process.env.X402_ALLOWED_RECIPIENTS = "0x" + "a".repeat(64);
process.env.X402_PAYMENT_ASSET = "0x2::sui::SUI";
process.env.X402_FORENSICS_PRICE_ATOMIC = "10000000";
process.env.X402_FACILITATOR_MODE = "self";
// MemWalMock scores by token overlap, not cosine distance — a looser cutoff for tests.
process.env.MEMWAL_RECALL_MAX_DISTANCE = "0.9";
delete process.env.DATABASE_URL;
delete process.env.MEMWAL_KEY;
delete process.env.MEMWAL_ACCOUNT_ID;
delete process.env.TATUM_API_KEY;
