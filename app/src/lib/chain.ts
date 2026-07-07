import { createClient } from "genlayer-js";
import { testnetBradbury } from "genlayer-js/chains";
import type { GenLayerClient, TransactionHash } from "genlayer-js/types";

// Baked-in contract address so the hosted site works without any env config.
// `VITE_CONTRACT_ADDRESS` overrides at build time when set.
export const FALLBACK_CONTRACT =
  "0xFA9d0A865F320309784aD884DF7d965D09C38B8c" as const;

export const CONTRACT_ADDRESS =
  (import.meta.env.VITE_CONTRACT_ADDRESS as `0x${string}` | undefined) ||
  FALLBACK_CONTRACT;

export const chain = testnetBradbury;

export const explorerBaseUrl = "https://explorer-bradbury.genlayer.com";

export const explorerTxUrl = (hash: string) => `${explorerBaseUrl}/tx/${hash}`;
export const explorerContractUrl = (addr: string) =>
  `${explorerBaseUrl}/contracts/${addr}`;
export const githubCommitUrl = (repo: string, sha: string) =>
  `https://github.com/${repo}/commit/${sha}`;

/**
 * Read-only client. Talks straight to the GenLayer RPC — no wallet needed.
 * This is what the ledger and stats sections use, so the page renders live
 * data even when nobody is connected.
 */
export function readClient(): GenLayerClient<typeof chain> {
  return createClient({ chain });
}

/**
 * Write-side client, bound to the wallet-injected provider. Used only from
 * the console when the user submits a verify_commit tx.
 */
export function writeClient(
  address: `0x${string}`,
  provider: unknown,
): GenLayerClient<typeof chain> {
  return createClient({
    chain,
    account: address,
    // genlayer-js accepts any EIP-1193-compatible provider here.
    provider: provider as never,
  });
}

export type TxHash = TransactionHash;
