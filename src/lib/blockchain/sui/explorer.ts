export type SuiNetwork = "mainnet" | "testnet";

const BASE: Record<SuiNetwork, string> = {
  mainnet: "https://suiscan.xyz/mainnet",
  testnet: "https://suiscan.xyz/testnet",
};

export function txUrl(digest: string, network: SuiNetwork = "mainnet"): string {
  return `${BASE[network]}/tx/${encodeURIComponent(digest)}`;
}

export function accountUrl(address: string, network: SuiNetwork = "mainnet"): string {
  return `${BASE[network]}/account/${encodeURIComponent(address)}`;
}

export function objectUrl(id: string, network: SuiNetwork = "mainnet"): string {
  return `${BASE[network]}/object/${encodeURIComponent(id)}`;
}

export function checkpointUrl(seq: string, network: SuiNetwork = "mainnet"): string {
  return `${BASE[network]}/checkpoint/${encodeURIComponent(seq)}`;
}

/** Walrus aggregator view of a blob (public; content is Seal-encrypted by MemWal). */
export function walrusBlobUrl(blobId: string): string {
  return `https://walruscan.com/mainnet/blob/${encodeURIComponent(blobId)}`;
}

export function x402NetworkToSui(network: string): SuiNetwork {
  return network === "sui:testnet" ? "testnet" : "mainnet";
}
