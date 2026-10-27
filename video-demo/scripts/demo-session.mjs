// Temporary sign-in for recording the owner's own local sessions (local instance only).
//   node demo-session.mjs create <userId> <cookieFile>   → inserts a 2-hour session, writes a Playwright storage state
//   node demo-session.mjs delete                          → removes every session this script created
// The session row is labelled "video-demo-…" so cleanup is exact. Never prints the token or secret.
import { createRequire } from "node:module";
import { randomBytes, webcrypto } from "node:crypto";
import { writeFileSync } from "node:fs";

const require = createRequire("C:/Users/USER/Desktop/RECALL/package.json");
require("dotenv").config({ path: "C:/Users/USER/Desktop/RECALL/.env", quiet: true });
const postgres = require("postgres");

const [cmd, userId, cookieFile] = process.argv.slice(2);
const sql = postgres(process.env.DATABASE_URL, { max: 1, onnotice: () => {} });
const url = new URL(process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3300");
if (!["localhost", "127.0.0.1"].includes(url.hostname)) throw new Error("Refusing: this script only runs against a local instance");

if (cmd === "create") {
  const token = randomBytes(24).toString("base64url");
  const id = `video-demo-${randomBytes(6).toString("hex")}`;
  const expires = new Date(Date.now() + 2 * 60 * 60 * 1000);
  await sql`insert into session (id, token, user_id, expires_at, user_agent) values (${id}, ${token}, ${userId}, ${expires}, 'RecallIQ demo-video recording')`;
  // Same signing as better-call: HMAC-SHA256(secret, token), base64, "token.signature", URI-encoded.
  const key = await webcrypto.subtle.importKey("raw", new TextEncoder().encode(process.env.BETTER_AUTH_SECRET), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = Buffer.from(await webcrypto.subtle.sign("HMAC", key, new TextEncoder().encode(token))).toString("base64");
  const value = encodeURIComponent(`${token}.${sig}`);
  writeFileSync(
    cookieFile,
    JSON.stringify({
      cookies: [{ name: "better-auth.session_token", value, domain: url.hostname, path: "/", expires: Math.floor(expires.getTime() / 1000), httpOnly: true, secure: false, sameSite: "Lax" }],
      origins: [],
    }),
  );
  console.log(`created session ${id} for user ${userId.slice(0, 8)}…, expires ${expires.toISOString()}`);
} else if (cmd === "delete") {
  const rows = await sql`delete from session where id like 'video-demo-%' returning id`;
  console.log(`deleted ${rows.length} demo session(s)`);
} else {
  console.log("usage: create <userId> <cookieFile> | delete");
}
await sql.end();
