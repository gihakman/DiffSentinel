// Poll a transaction until it hits ACCEPTED / FINALIZED and dump the receipt.
// Usage: node scripts/check.mjs 0x<txhash> [FINALIZED|ACCEPTED]

import { createClient } from "genlayer-js";
import { testnetBradbury } from "genlayer-js/chains";
import { TransactionStatus } from "genlayer-js/types";

const txHash = process.argv[2];
const targetStatusName = (process.argv[3] || "ACCEPTED").toUpperCase();
if (!txHash) {
  console.error("usage: node scripts/check.mjs 0x<txhash> [ACCEPTED|FINALIZED]");
  process.exit(1);
}

const client = createClient({ chain: testnetBradbury });
const target =
  TransactionStatus[targetStatusName] ?? TransactionStatus.ACCEPTED;

console.log(`waiting for tx ${txHash} to reach ${targetStatusName}...`);
const receipt = await client.waitForTransactionReceipt({
  hash: txHash,
  status: target,
  retries: 400,
  interval: 4000,
});
console.log(`status: ${receipt.statusName ?? receipt.status}`);
console.log(
  `execution: ${receipt.txExecutionResultName ?? "unknown"}`,
);
const bigIntReplacer = (_k, v) => (typeof v === "bigint" ? v.toString() : v);
console.log(JSON.stringify(receipt, bigIntReplacer, 2));
