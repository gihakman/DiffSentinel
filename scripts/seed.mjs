// Seed the on-chain ledger with real end-to-end verifications.
//
// Every seed uses REAL commits on REAL public GitHub repos, so validators
// fetch a real diff and classify it via an LLM under real Optimistic
// Democracy consensus.
//
// Usage:
//   node scripts/seed.mjs          # submit any seeds not yet on-chain
//   node scripts/seed.mjs --wait   # additionally poll each tx to ACCEPTED

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import dotenv from "dotenv";
import { createClient, createAccount } from "genlayer-js";
import { testnetBradbury } from "genlayer-js/chains";
import { TransactionStatus, ExecutionResult } from "genlayer-js/types";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
dotenv.config({ path: path.join(repoRoot, ".env") });

const PRIVATE_KEY = process.env.ACCOUNT_PRIVATE_KEY;
if (!PRIVATE_KEY) {
  console.error("ACCOUNT_PRIVATE_KEY missing from .env");
  process.exit(1);
}
const privateKey = PRIVATE_KEY.startsWith("0x")
  ? PRIVATE_KEY
  : `0x${PRIVATE_KEY}`;

const deployment = JSON.parse(
  readFileSync(path.join(repoRoot, "deployments", "bradbury.json"), "utf8"),
);
const ADDRESS = deployment.address;
console.log(`contract: ${ADDRESS}`);
console.log(`chain:    ${testnetBradbury.name} (${testnetBradbury.id})`);

const SEEDS = [
  {
    repo: "octocat/Hello-World",
    base_commit: "553c2077f0edc3d5dc5d17262f6aa498e69d6f8e",
    target_commit: "762941318ee16e59dabbacb1b4049eec22f0d303",
    changelog:
      "New line at end of README. Signed off by Spaceghost.",
    // The Bradbury addTransaction path is nonpayable, so on-chain writes go
    // with value=0. The fee-forwarding path is still exercised by the direct
    // tests in tests/direct/test_diff_sentinel.py.
    value_wei: 0n,
  },
  {
    repo: "octocat/Hello-World",
    base_commit: "762941318ee16e59dabbacb1b4049eec22f0d303",
    target_commit: "7fd1a60b01f91b314f59955a4e4d4e80d8edf11d",
    changelog:
      "Merge pull request #6 from Spaceghost/patch-1. Adds a Spanish greeting with a trailing newline.",
    value_wei: 0n,
  },
  {
    repo: "expressjs/express",
    base_commit: "90ec6206d3275fdf2787f2028c6f48a2d92e8042",
    target_commit: "9d8223d92ee81137a50a28eb6ad55a096791091d",
    changelog:
      "fix: replace deprecated trimRight() with trimEnd() in lib/request.js. No behaviour change; keeps compatibility with modern Node.js.",
    value_wei: 0n,
  },
  {
    repo: "expressjs/express",
    base_commit: "18e5985b8a9d5e8423db0a9121f22bdaecd5b120",
    target_commit: "66878d3e70437ba7b887ec519a3e33edc5bca0c7",
    changelog:
      "docs: use the new logo (#7316). Only Readme.md is touched — no code changes.",
    value_wei: 0n,
  },
];

const account = createAccount(privateKey);
console.log(`signer:   ${account.address}`);
const client = createClient({ chain: testnetBradbury, account });
const readClient = createClient({ chain: testnetBradbury });

const shouldWait = process.argv.includes("--wait");

const isTransient = (err) => {
  const msg = String(err?.message || err?.details || err);
  return (
    msg.includes("circuit breaker") ||
    msg.includes("transient rpc error") ||
    msg.includes("caller error") ||
    msg.includes("timeout") ||
    msg.includes("ECONNRESET") ||
    msg.includes("network")
  );
};

const withRetry = async (label, fn, { attempts = 6, baseDelay = 4000 } = {}) => {
  let lastErr;
  for (let i = 1; i <= attempts; i++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (i === attempts || !isTransient(err)) throw err;
      const delay = baseDelay * i;
      console.warn(
        `  ${label} transient (attempt ${i}/${attempts}): waiting ${delay}ms`,
      );
      await new Promise((r) => setTimeout(r, delay));
    }
  }
  throw lastErr;
};

for (const [i, seed] of SEEDS.entries()) {
  const label = `[${i + 1}/${SEEDS.length}] ${seed.repo}@${seed.target_commit.slice(0, 12)}`;
  console.log(`\n${label}`);

  const already = await withRetry("has_verdict", () =>
    readClient.readContract({
      address: ADDRESS,
      functionName: "has_verdict",
      args: [seed.repo, seed.target_commit],
    }),
  );
  if (already) {
    console.log(`  ↳ already recorded, skipping.`);
    continue;
  }

  console.log(`  base:   ${seed.base_commit}`);
  console.log(`  target: ${seed.target_commit}`);
  console.log(`  value:  ${seed.value_wei} wei`);
  console.log(`  submitting verify_commit...`);
  const hash = await withRetry("writeContract", () =>
    client.writeContract({
      address: ADDRESS,
      functionName: "verify_commit",
      args: [seed.repo, seed.base_commit, seed.target_commit, seed.changelog],
      value: seed.value_wei,
    }),
  );
  console.log(`  tx: ${hash}`);
  console.log(`      https://explorer-bradbury.genlayer.com/tx/${hash}`);

  if (!shouldWait) {
    continue;
  }

  console.log(`  waiting for ACCEPTED...`);
  const receipt = await client.waitForTransactionReceipt({
    hash,
    status: TransactionStatus.ACCEPTED,
    retries: 400,
    interval: 4000,
  });
  console.log(
    `  status: ${receipt.statusName ?? receipt.status} exec: ${receipt.txExecutionResultName ?? "?"}`,
  );
  if (receipt.txExecutionResultName === ExecutionResult.FINISHED_WITH_ERROR) {
    console.warn(`  ! execution error — continuing with next seed.`);
    continue;
  }

  const verdict = await readClient.readContract({
    address: ADDRESS,
    functionName: "get_verdict",
    args: [seed.repo, seed.target_commit],
  });
  console.log(`  verdict: ${verdict.classification}`);
}

const stats = await readClient.readContract({
  address: ADDRESS,
  functionName: "stats",
  args: [],
});
console.log("\nfinal stats:", stats);
console.log("done.");
