/** Live balance of the user's connected wallet for the configured payment asset (via Tatum). */
import { chain } from "@/lib/blockchain/tatum/client";
import { formatAtomic } from "@/lib/blockchain/sui/amounts";
import { normalizeAddress } from "@/lib/blockchain/sui/validation";
import { x402Config } from "@/lib/env";
import { hitRateLimit } from "@/lib/security/rate-limit";
import { ApiError, handle, json, requireApiUser } from "@/server/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = handle(async (req) => {
  const user = await requireApiUser(req);
  const rl = await hitRateLimit(`balance:${user.id}`, 30, 60);
  if (!rl.allowed) throw new ApiError(429, "Too many balance requests", "rate_limited");
  const address = normalizeAddress(new URL(req.url).searchParams.get("address") ?? "");
  if (!address) throw new ApiError(400, "Invalid address", "invalid_address");
  const asset = x402Config().asset;
  const [bal, info] = await Promise.all([
    chain().getBalance(address, asset),
    chain()
      .getCoinInfo(asset)
      .catch(() => null),
  ]);
  const decimals = info?.data.decimals ?? null;
  return json({
    address,
    asset,
    balanceAtomic: bal.data.balanceAtomic,
    display: decimals !== null ? `${formatAtomic(bal.data.balanceAtomic, decimals)} ${info?.data.symbol ?? ""}`.trim() : null,
    provider: bal.provenance.providerLabel,
    fetchedAt: bal.provenance.fetchedAt,
  });
});
