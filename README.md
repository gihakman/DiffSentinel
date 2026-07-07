# DiffSentinel

Decentralized code-diff security oracle. Submits a Git commit plus its
changelog to a GenLayer Intelligent Contract; a network of LLM-backed
validators reaches consensus on whether the change is `CLEAN`,
`SUSPICIOUS`, or `MALICIOUS`, and writes the verdict to an immutable
on-chain ledger.

Live on **Testnet Bradbury**:

- Contract: `0xFA9d0A865F320309784aD884DF7d965D09C38B8c`
  ([explorer](https://explorer-bradbury.genlayer.com/contracts/0xFA9d0A865F320309784aD884DF7d965D09C38B8c))
- Deploy tx:
  [`0xc6695f9f4f573ee60befcf76812964e8c81c2d420ab483802a768e2d3eb87d00`](https://explorer-bradbury.genlayer.com/tx/0xc6695f9f4f573ee60befcf76812964e8c81c2d420ab483802a768e2d3eb87d00)
- Deployer: `0x0b30FFf90Ed88739670A0bf10e9e70717372Ae28`
- Runner: `py-genlayer:1jb45aa8ynh2a9c9xn3b7qqh8sm5q93hwfp7jqmwsfhh8jpz09h6`

## What it is

Software supply-chain attacks are cheap to launch and expensive to detect.
A hijacked maintainer pushes a minor patch, and the compromise flows into
every downstream project that pulls the new version. Traditional tools
either miss semantic backdoors, run behind a single vendor's API, or need
a human reviewer per patch.

DiffSentinel puts the review on chain. Any signer can submit
`verify_commit(repo, base, target, changelog)`. Every validator fetches
the same public diff from GitHub's compare API, strips comments and long
string literals to defuse prompt injection, and asks an LLM whether the
code matches its stated intent. Consensus is only reached when validators
agree on the categorical verdict; reasoning strings can vary freely.

## What ships in this repo

| Path | What lives there |
|---|---|
| `contracts/diff_sentinel.py` | The Intelligent Contract. 476 lines, one Python file, pinned to runner `py-genlayer:1jb45aa8…`. |
| `tests/direct/test_diff_sentinel.py` | 12 direct-mode tests covering state, access control, LLM output normalization, error handling, and validator consensus. |
| `scripts/deploy.mjs` | genlayer-js deployer. Reads `.env`, waits for ACCEPTED, verifies with a view call, writes `deployments/bradbury.json`. |
| `scripts/seed.mjs` | Idempotent seeder that submits real GitHub compare pairs against the live contract. |
| `scripts/record_deploy.mjs` | Regenerates the deployment record from on-chain reads. |
| `scripts/check.mjs` | Ad-hoc tx status probe. |
| `deployments/bradbury.json` | Address, deploy tx, and seed txs, all real. |
| `app/` | Vite + React + genlayer-js frontend. Docs-first layout, dark forensic aesthetic, live wallet + console. |
| `vercel.json` | Zero-config deploy target for the frontend. |

## How consensus works here

The write method wraps the LLM call in a custom validator pattern:

```python
def leader_fn():
    diff = gl.nondet.web.get(compare_url).body   # real HTTP from every validator
    prompt = build_prompt(sanitized(diff), changelog)
    raw = gl.nondet.exec_prompt(prompt, response_format="json")
    return {"classification": raw["classification"], "reasoning": raw["reasoning"], ...}

def validator_fn(leader_result):
    # Re-run the same task locally and compare only the categorical verdict.
    mine = leader_fn()
    return mine["classification"] == leader_result.calldata["classification"]

adjudication = gl.vm.run_nondet_unsafe(leader_fn, validator_fn)
```

- `strict_eq` would fail: LLM output is non-deterministic word-for-word.
- Comparative LLM judging would let subtle reasoning drift decide the vote.
- The strict-on-verdict, permissive-on-reasoning pattern matches the design
  brief: subtle wording differences never break consensus, but the
  categorical decision must agree exactly.

Errors are classified with `[EXPECTED]`, `[EXTERNAL]`, `[TRANSIENT]`, and
`[LLM_ERROR]` prefixes. The validator function pipes those into an
`_handle_leader_error` helper so business errors must match exactly,
transient network errors count as agreement, and LLM misbehavior forces
leader rotation.

## Real seeded ledger

Four end-to-end verifications, submitted from `scripts/seed.mjs`, live on
Bradbury today:

| Verdict | Repository | Commit | Reasoning (first line) | Tx |
|---|---|---|---|---|
| CLEAN | octocat/Hello-World | [`762941318ee1`](https://github.com/octocat/Hello-World/commit/762941318ee16e59dabbacb1b4049eec22f0d303) | Diff shows only the stated addition of a newline at end of file. | [`0x62832bf0…`](https://explorer-bradbury.genlayer.com/tx/0x62832bf0ab8fd321b7a6ed28df82eae9a5a90bb87b29bff363f7dbfd70dd1fe6) |
| CLEAN | octocat/Hello-World | [`7fd1a60b01f9`](https://github.com/octocat/Hello-World/commit/7fd1a60b01f91b314f59955a4e4d4e80d8edf11d) | No executable code changed in this commit range. | [`0x5d6e9a3e…`](https://explorer-bradbury.genlayer.com/tx/0x5d6e9a3edabe4b703e6b3b254a0022ed884c8b0d7a266e80d7992246ff646900) |
| CLEAN | expressjs/express | [`9d8223d92ee8`](https://github.com/expressjs/express/commit/9d8223d92ee81137a50a28eb6ad55a096791091d) | Replaces the deprecated `trimRight()` with `trimEnd()`; no behaviour change. | [`0xf33220d1…`](https://explorer-bradbury.genlayer.com/tx/0xf33220d19317fe7b7f35e87efb0d24a35db35d9e42f00931a91749c0d5b1a1fd) |
| CLEAN | expressjs/express | [`66878d3e7043`](https://github.com/expressjs/express/commit/66878d3e70437ba7b887ec519a3e33edc5bca0c7) | Documentation-only change (Readme.md). | [`0x2ebfc545…`](https://explorer-bradbury.genlayer.com/tx/0x2ebfc5455ae417ab590284d071a2c52a664f2508292f35539dc7e434b59425cd) |

Each row was produced by validators that independently fetched the GitHub
diff, ran an LLM, and voted `AGREE`. The frontend renders these rows
directly from `recent_verdicts()` — no fixture files.

## Tech stack

- **Contract**: Python 3.12, GenLayer SDK, pinned runner
  `py-genlayer:1jb45aa8ynh2a9c9xn3b7qqh8sm5q93hwfp7jqmwsfhh8jpz09h6`
  (v0.2.5, matched to the current network deploy).
- **Tests**: [`genlayer-test`](https://pypi.org/project/genlayer-test/)
  direct mode, `pytest`. 12 tests, all pass in ~0.3s.
- **Lint**: [`genvm-linter`](https://pypi.org/project/genvm-linter/) —
  static checks plus SDK-driven validation.
- **Deploy / seed / check**:
  [`genlayer-js`](https://www.npmjs.com/package/genlayer-js) 1.1.8 from
  plain Node ESM scripts. No custom framework.
- **Frontend**: Vite 6 + React 18 + TypeScript 5, `genlayer-js` client for
  contract reads and wallet-signed writes. No wallet SDK dependency
  beyond the injected EIP-1193 provider.

## Running locally

```bash
# Contract lint + tests
python3.12 -m venv .venv && .venv/bin/pip install genvm-linter genlayer-test
.venv/bin/genvm-lint check contracts/diff_sentinel.py
.venv/bin/pytest tests/direct/ -v

# Deploy a fresh instance from the funded key in .env (do NOT commit .env)
npm install
node scripts/deploy.mjs

# Seed real verifications
node scripts/seed.mjs --wait

# Frontend
cd app && npm install && npm run dev
```

The frontend reads its contract address from `VITE_CONTRACT_ADDRESS` at
build time; if the variable is unset it falls back to the on-chain
deployment recorded in `deployments/bradbury.json`, so the hosted build
works without any environment configuration.

## Deploying the frontend

`vercel.json` at the repo root sets the frontend build to
`cd app && npm install && npm run build` and the output directory to
`app/dist`. `vercel --prod` from the repo root ships a static bundle that
talks to Bradbury out of the box.

## Security notes

- Comments and long string literals are stripped from the diff before the
  prompt is constructed. This is the recommended defense against prompt
  injection carried inside a code change.
- The write path caps changelog input at 4 KiB and the aggregated diff at
  8 KiB, filters out non-executable file extensions, and caps at 20 files
  per commit to keep gas and LLM context bounded.
- GitHub is contacted only on `.com`, meeting the design's requirement to
  keep contract-fetched URLs on common TLDs.
- Duplicate `verify_commit(repo, target)` submissions are rejected on
  chain, preventing re-run spam.
- Only the deployer can update the fee recipient and rate via
  `set_fee_config`.

## What's next

- Add an appeal-style path for maintainers to contest a `SUSPICIOUS` or
  `MALICIOUS` verdict.
- A GitHub Action wrapper that reads the ledger and blocks a merge when a
  dependency-bump target commit has a non-CLEAN verdict.
- A subscription / staking pool for repositories that want priority
  verification.

Contributions welcome.
