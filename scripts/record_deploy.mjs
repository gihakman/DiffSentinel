// Verify the existing deploy tx and write deployments/bradbury.json.
// Idempotent — safe to re-run.

import { writeFileSync, mkdirSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { createClient } from "genlayer-js";
import { testnetBradbury } from "genlayer-js/chains";
import { TransactionStatus } from "genlayer-js/types";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");

const TX_HASH =
  "0xc6695f9f4f573ee60befcf76812964e8c81c2d420ab483802a768e2d3eb87d00";
const CONTRACT_ADDRESS = "0xFA9d0A865F320309784aD884DF7d965D09C38B8c";
const DEPLOYER = "0x0b30FFf90Ed88739670A0bf10e9e70717372Ae28";

const client = createClient({ chain: testnetBradbury });

console.log("checking tx", TX_HASH);
const receipt = await client.waitForTransactionReceipt({
  hash: TX_HASH,
  status: TransactionStatus.ACCEPTED,
  retries: 5,
  interval: 2000,
});
console.log("status:", receipt.statusName ?? receipt.status);
console.log("execution:", receipt.txExecutionResultName);

console.log("reading fee_config()...");
const feeConfig = await client.readContract({
  address: CONTRACT_ADDRESS,
  functionName: "fee_config",
  args: [],
});
console.log("fee_config():", feeConfig);

console.log("reading stats()...");
const stats = await client.readContract({
  address: CONTRACT_ADDRESS,
  functionName: "stats",
  args: [],
});
console.log("stats():", stats);

console.log("reading owner_address()...");
const owner = await client.readContract({
  address: CONTRACT_ADDRESS,
  functionName: "owner_address",
  args: [],
});
console.log("owner_address():", owner);

const deployDir = path.join(repoRoot, "deployments");
if (!existsSync(deployDir)) mkdirSync(deployDir, { recursive: true });
const outPath = path.join(deployDir, "bradbury.json");
const record = {
  network: "testnet-bradbury",
  chainId: testnetBradbury.id,
  address: CONTRACT_ADDRESS,
  deployTxHash: TX_HASH,
  deployerAddress: DEPLOYER,
  constructorArgs: {
    fee_recipient_hex: "",
    fee_bps: 100,
  },
  acceptedAt: new Date().toISOString(),
  explorer: {
    contract: `https://explorer-bradbury.genlayer.com/contracts/${CONTRACT_ADDRESS}`,
    tx: `https://explorer-bradbury.genlayer.com/tx/${TX_HASH}`,
  },
  runnerVersion:
    "py-genlayer:1jb45aa8ynh2a9c9xn3b7qqh8sm5q93hwfp7jqmwsfhh8jpz09h6",
  seeds: [
    {
      repo: "octocat/Hello-World",
      base: "553c2077f0edc3d5dc5d17262f6aa498e69d6f8e",
      target: "762941318ee16e59dabbacb1b4049eec22f0d303",
      tx: "0x62832bf0ab8fd321b7a6ed28df82eae9a5a90bb87b29bff363f7dbfd70dd1fe6",
    },
    {
      repo: "octocat/Hello-World",
      base: "762941318ee16e59dabbacb1b4049eec22f0d303",
      target: "7fd1a60b01f91b314f59955a4e4d4e80d8edf11d",
      tx: "0x5d6e9a3edabe4b703e6b3b254a0022ed884c8b0d7a266e80d7992246ff646900",
    },
    {
      repo: "expressjs/express",
      base: "90ec6206d3275fdf2787f2028c6f48a2d92e8042",
      target: "9d8223d92ee81137a50a28eb6ad55a096791091d",
      tx: "0xf33220d19317fe7b7f35e87efb0d24a35db35d9e42f00931a91749c0d5b1a1fd",
    },
    {
      repo: "expressjs/express",
      base: "18e5985b8a9d5e8423db0a9121f22bdaecd5b120",
      target: "66878d3e70437ba7b887ec519a3e33edc5bca0c7",
      tx: "0x2ebfc5455ae417ab590284d071a2c52a664f2508292f35539dc7e434b59425cd",
    },
  ],
};
writeFileSync(outPath, JSON.stringify(record, null, 2) + "\n", "utf8");
console.log(`wrote ${outPath}`);
