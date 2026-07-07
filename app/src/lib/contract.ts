import { readClient, writeClient, CONTRACT_ADDRESS } from "./chain";
import { TransactionStatus } from "genlayer-js/types";

export type Verdict = {
  repo: string;
  base_commit: string;
  target_commit: string;
  classification: "CLEAN" | "SUSPICIOUS" | "MALICIOUS" | string;
  reasoning: string;
  red_flags: string;
  submitted_by: string;
  timestamp: string;
  fee_paid_wei: string;
};

export type Stats = {
  clean: number;
  suspicious: number;
  malicious: number;
  total: number;
};

export type FeeConfig = {
  recipient: string;
  fee_bps: number;
  total_fees_paid_out_wei: string;
};

const client = readClient();

// Simple in-flight de-dupe so React strict-mode doesn't double-hit the RPC.
const inflight = new Map<string, Promise<unknown>>();

async function once<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const existing = inflight.get(key);
  if (existing) return existing as Promise<T>;
  const p = fn().finally(() => {
    // Give the response a very small cache window so a rapid re-render
    // (React double-invoke, tab focus) doesn't re-fire.
    setTimeout(() => inflight.delete(key), 200);
  });
  inflight.set(key, p);
  return p as Promise<T>;
}

export async function getStats(): Promise<Stats> {
  return once("stats", async () => {
    const raw = (await client.readContract({
      address: CONTRACT_ADDRESS,
      functionName: "stats",
      args: [],
    })) as Stats;
    return raw;
  });
}

export async function getFeeConfig(): Promise<FeeConfig> {
  return once("fee_config", async () => {
    const raw = (await client.readContract({
      address: CONTRACT_ADDRESS,
      functionName: "fee_config",
      args: [],
    })) as FeeConfig;
    return raw;
  });
}

export async function getRecentVerdicts(limit = 20): Promise<Verdict[]> {
  return once(`recent:${limit}`, async () => {
    const raw = (await client.readContract({
      address: CONTRACT_ADDRESS,
      functionName: "recent_verdicts",
      args: [limit],
    })) as Verdict[];
    return raw;
  });
}

export async function getLedgerSize(): Promise<number> {
  return once("ledger_size", async () => {
    const raw = (await client.readContract({
      address: CONTRACT_ADDRESS,
      functionName: "ledger_size",
      args: [],
    })) as bigint | number;
    return typeof raw === "bigint" ? Number(raw) : raw;
  });
}

export async function getOwner(): Promise<string> {
  return once("owner_address", async () => {
    const raw = (await client.readContract({
      address: CONTRACT_ADDRESS,
      functionName: "owner_address",
      args: [],
    })) as string;
    return raw;
  });
}

export async function hasVerdict(
  repo: string,
  target: string,
): Promise<boolean> {
  const raw = (await client.readContract({
    address: CONTRACT_ADDRESS,
    functionName: "has_verdict",
    args: [repo, target],
  })) as boolean;
  return raw;
}

export async function getVerdict(
  repo: string,
  target: string,
): Promise<Verdict> {
  const raw = (await client.readContract({
    address: CONTRACT_ADDRESS,
    functionName: "get_verdict",
    args: [repo, target],
  })) as Verdict;
  return raw;
}

/**
 * Submit a verify_commit transaction using the wallet-bound client and
 * return both the tx hash and a poller for status updates.
 */
export async function submitVerifyCommit(
  from: `0x${string}`,
  provider: unknown,
  {
    repo,
    baseCommit,
    targetCommit,
    changelog,
    valueWei,
  }: {
    repo: string;
    baseCommit: string;
    targetCommit: string;
    changelog: string;
    valueWei: bigint;
  },
) {
  const w = writeClient(from, provider);
  const hash = await w.writeContract({
    address: CONTRACT_ADDRESS,
    functionName: "verify_commit",
    args: [repo, baseCommit, targetCommit, changelog],
    value: valueWei,
  });
  return hash as `0x${string}`;
}

export async function waitAccepted(hash: `0x${string}`) {
  const c = readClient();
  return c.waitForTransactionReceipt({
    hash: hash as never,
    status: TransactionStatus.ACCEPTED,
    retries: 400,
    interval: 4000,
  });
}
