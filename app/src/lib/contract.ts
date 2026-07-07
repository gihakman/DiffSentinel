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

// The GenLayer SDK deserializes u64 to `bigint`. React can render a plain
// bigint but many downstream utilities cannot; normalize at the boundary.
const toNum = (v: unknown): number => {
  if (typeof v === "number") return v;
  if (typeof v === "bigint") return Number(v);
  if (typeof v === "string") return Number(v);
  return 0;
};

const toStr = (v: unknown): string => {
  if (typeof v === "bigint") return v.toString();
  return String(v ?? "");
};

async function read<T>(name: string, args: unknown[] = []): Promise<T> {
  try {
    const raw = await client.readContract({
      address: CONTRACT_ADDRESS,
      functionName: name,
      args: args as never,
    });
    return raw as T;
  } catch (e) {
    console.error(`[DiffSentinel] readContract(${name}) failed:`, e);
    throw e;
  }
}

export async function getStats(): Promise<Stats> {
  const raw = (await read<Record<string, unknown>>("stats")) ?? {};
  return {
    clean: toNum(raw.clean),
    suspicious: toNum(raw.suspicious),
    malicious: toNum(raw.malicious),
    total: toNum(raw.total),
  };
}

export async function getFeeConfig(): Promise<FeeConfig> {
  const raw = (await read<Record<string, unknown>>("fee_config")) ?? {};
  return {
    recipient: toStr(raw.recipient),
    fee_bps: toNum(raw.fee_bps),
    total_fees_paid_out_wei: toStr(raw.total_fees_paid_out_wei),
  };
}

export async function getRecentVerdicts(limit = 20): Promise<Verdict[]> {
  const raw = (await read<unknown[]>("recent_verdicts", [limit])) ?? [];
  return raw.map((v) => {
    const o = v as Record<string, unknown>;
    return {
      repo: toStr(o.repo),
      base_commit: toStr(o.base_commit),
      target_commit: toStr(o.target_commit),
      classification: toStr(o.classification),
      reasoning: toStr(o.reasoning),
      red_flags: toStr(o.red_flags),
      submitted_by: toStr(o.submitted_by),
      timestamp: toStr(o.timestamp),
      fee_paid_wei: toStr(o.fee_paid_wei),
    };
  });
}

export async function getLedgerSize(): Promise<number> {
  const raw = await read<unknown>("ledger_size");
  return toNum(raw);
}

export async function getOwner(): Promise<string> {
  const raw = await read<unknown>("owner_address");
  return toStr(raw);
}

export async function hasVerdict(
  repo: string,
  target: string,
): Promise<boolean> {
  return await read<boolean>("has_verdict", [repo, target]);
}

export async function getVerdict(
  repo: string,
  target: string,
): Promise<Verdict> {
  const raw = (await read<Record<string, unknown>>(
    "get_verdict",
    [repo, target],
  )) ?? {};
  return {
    repo: toStr(raw.repo),
    base_commit: toStr(raw.base_commit),
    target_commit: toStr(raw.target_commit),
    classification: toStr(raw.classification),
    reasoning: toStr(raw.reasoning),
    red_flags: toStr(raw.red_flags),
    submitted_by: toStr(raw.submitted_by),
    timestamp: toStr(raw.timestamp),
    fee_paid_wei: toStr(raw.fee_paid_wei),
  };
}

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
