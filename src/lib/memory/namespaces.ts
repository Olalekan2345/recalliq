/**
 * Walrus Memory namespaces.
 *
 * Ownership model (disclosed in the UI): RecallIQ writes to one operator-owned
 * MemWal account. Each user gets a private namespace derived from a hash of
 * their user id; server-side authorization ensures a user's runs only ever
 * recall their own namespace plus the platform namespace. The platform
 * namespace holds only generic tool-level lessons generated from templates
 * that never include user inputs, addresses or digests.
 */
import { createHash } from "node:crypto";

function hash(input: string): string {
  return createHash("sha256").update(input).digest("hex").slice(0, 20);
}

export function userNamespace(prefix: string, userId: string): string {
  return `${prefix}-u-${hash(`user:${userId}`)}`;
}

export function platformNamespace(prefix: string): string {
  return `${prefix}-platform-tools`;
}
