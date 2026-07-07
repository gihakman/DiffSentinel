// Deploy DiffSentinel to Testnet Bradbury.
//
// Bradbury has a long appeal window before FINALIZED, so we take the
// following stance:
//   1. Wait for ACCEPTED — the contract is live and reachable via view calls
//      once the initial consensus round is over.
//   2. Verify by calling fee_config() and stats() through a fresh read
//      client. If those return sane data, deploy is real.
//   3. Save the deploy record. FINALIZED can be polled separately later.
//
// Reads:
//   ACCOUNT_PRIVATE_KEY  (required) — funded Bradbury signer.
//   FEE_RECIPIENT        (optional) — 0x address that receives the fee.
//                                     Blank = deployer.
//   FEE_BPS              (optional) — basis points; default 100 (1%).
//
// Writes:
//   deployments/bradbury.json

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
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
const FEE_RECIPIENT = (process.env.FEE_RECIPIENT || "").trim();
const FEE_BPS = Number.parseInt(process.env.FEE_BPS || "100", 10);
if (!Number.isFinite(FEE_BPS) || FEE_BPS < 0 || FEE_BPS > 10000) {
  console.error(`FEE_BPS invalid: ${process.env.FEE_BPS}`);
  process.exit(1);
}

const contractPath = path.join(repoRoot, "contracts", "diff_sentinel.py");
const contractSource = readFileSync(contractPath);
console.log(
  `contract source: ${contractPath} (${contractSource.length} bytes)`,
);

const privateKey = PRIVATE_KEY.startsWith("0x")
  ? PRIVATE_KEY
  : `0x${PRIVATE_KEY}`;
const account = createAccount(privateKey);
console.log(`deployer address: ${account.address}`);
console.log(`chain: ${testnetBradbury.name} (chainId=${testnetBradbury.id})`);
console.log(
  `fee_recipient arg: ${FEE_RECIPIENT === "" ? "(deployer)" : FEE_RECIPIENT}`,
);
console.log(`fee_bps arg: ${FEE_BPS}`);

const client = createClient({ chain: testnetBradbury, account });

const constructorArgs = [FEE_RECIPIENT, FEE_BPS];
console.log("submitting deploy...");
const txHash = await client.deployContract({
  code: contractSource,
  args: constructorArgs,
});
console.log(`deploy tx hash: ${txHash}`);

console.log("waiting for ACCEPTED status...");
const receipt = await client.waitForTransactionReceipt({
  hash: txHash,
  status: TransactionStatus.ACCEPTED,
  retries: 400,
  interval: 4000,
});
console.log(`tx status: ${receipt.statusName ?? receipt.status}`);
console.log(`tx execution: ${receipt.txExecutionResultName ?? "unknown"}`);

if (receipt.txExecutionResultName === ExecutionResult.FINISHED_WITH_ERROR) {
  console.error("deploy execution failed. dumping receipt:");
  const rp = (_k, v) => (typeof v === "bigint" ? v.toString() : v);
  console.error(JSON.stringify(receipt, rp, 2));
  process.exit(2);
}

// The contract address is the recipient on a deploy tx.
const contractAddress =
  receipt?.recipient ??
  receipt?.data?.contract_address ??
  receipt?.txDataDecoded?.contractAddress ??
  receipt?.to_address;
if (!contractAddress) {
  console.error("could not read contract address from receipt.");
  const rp = (_k, v) => (typeof v === "bigint" ? v.toString() : v);
  console.error(JSON.stringify(receipt, rp, 2));
  process.exit(3);
}
console.log(`contract address: ${contractAddress}`);

// Verify with view calls.
console.log("verifying contract via view calls...");
const readClient = createClient({ chain: testnetBradbury });

const feeConfig = await readClient.readContract({
  address: contractAddress,
  functionName: "fee_config",
  args: [],
});
console.log("fee_config():", feeConfig);

const stats = await readClient.readContract({
  address: contractAddress,
  functionName: "stats",
  args: [],
});
console.log("stats():", stats);

const ownerAddr = await readClient.readContract({
  address: contractAddress,
  functionName: "owner_address",
  args: [],
});
console.log("owner_address():", ownerAddr);

const deployDir = path.join(repoRoot, "deployments");
if (!existsSync(deployDir)) mkdirSync(deployDir, { recursive: true });
const outPath = path.join(deployDir, "bradbury.json");
const record = {
  network: "testnet-bradbury",
  chainId: testnetBradbury.id,
  address: contractAddress,
  deployTxHash: txHash,
  deployerAddress: account.address,
  constructorArgs: {
    fee_recipient_hex: FEE_RECIPIENT,
    fee_bps: FEE_BPS,
  },
  acceptedAt: new Date().toISOString(),
  explorer: {
    contract: `https://explorer-bradbury.genlayer.com/contracts/${contractAddress}`,
    tx: `https://explorer-bradbury.genlayer.com/tx/${txHash}`,
  },
};
writeFileSync(outPath, JSON.stringify(record, null, 2) + "\n", "utf8");
console.log(`wrote ${outPath}`);
console.log("done. deploy is ACCEPTED. Poll FINALIZED later via check.mjs.");
