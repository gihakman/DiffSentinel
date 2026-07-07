import { useState } from "react";
import { useWallet } from "../lib/wallet";
import { submitVerifyCommit, waitAccepted } from "../lib/contract";
import { explorerTxUrl } from "../lib/chain";

type LogEntry = {
  ts: string;
  kind: "info" | "ok" | "warn" | "err";
  msg: string;
  hash?: string;
};

const stamp = () =>
  new Date().toISOString().replace("T", " ").replace("Z", "").slice(11, 19);

// Default form values point to a well-known small commit — makes it easy
// for a first-time visitor to run a real verification end-to-end.
const DEFAULT_FORM = {
  repo: "octocat/Hello-World",
  base: "762941318ee16e59dabbacb1b4049eec22f0d303",
  target: "7fd1a60b01f91b314f59955a4e4d4e80d8edf11d",
  changelog:
    "Merge pull request #6 from Spaceghost/patch-1. Adds a Spanish greeting to README with a trailing newline.",
};

export function Console({
  wallet,
  onSuccess,
}: {
  wallet: ReturnType<typeof useWallet>;
  onSuccess: () => void;
}) {
  const [repo, setRepo] = useState(DEFAULT_FORM.repo);
  const [base, setBase] = useState(DEFAULT_FORM.base);
  const [target, setTarget] = useState(DEFAULT_FORM.target);
  const [changelog, setChangelog] = useState(DEFAULT_FORM.changelog);
  const [log, setLog] = useState<LogEntry[]>([]);
  const [busy, setBusy] = useState(false);

  const push = (
    kind: LogEntry["kind"],
    msg: string,
    hash?: string,
  ) => setLog((l) => [...l, { ts: stamp(), kind, msg, hash }]);

  const canSubmit = wallet.state.kind === "ready" && !busy;

  const submit = async () => {
    if (wallet.state.kind !== "ready") return;
    if (!window.ethereum) return;
    if (!repo || !base || !target) {
      push("err", "repo, base and target are required");
      return;
    }
    setBusy(true);
    try {
      push("info", `preparing verify_commit for ${repo}@${target.slice(0, 10)}`);
      const hash = await submitVerifyCommit(
        wallet.state.address,
        window.ethereum,
        {
          repo: repo.trim(),
          baseCommit: base.trim(),
          targetCommit: target.trim(),
          changelog: changelog.trim(),
          valueWei: 0n,
        },
      );
      push("ok", `submitted → ${hash}`, hash);
      push("info", "waiting for ACCEPTED (validators are fetching the diff)…");
      const receipt = (await waitAccepted(hash)) as {
        statusName?: string;
        txExecutionResultName?: string;
      };
      if (receipt.txExecutionResultName === "FINISHED_WITH_ERROR") {
        push(
          "warn",
          "consensus accepted but execution errored — commit may already be recorded or the diff was rejected.",
        );
      } else {
        push(
          "ok",
          `accepted: status=${receipt.statusName ?? "?"} exec=${
            receipt.txExecutionResultName ?? "?"
          }`,
        );
        onSuccess();
      }
    } catch (err) {
      push("err", (err as Error)?.message ?? String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="panel">
      <div className="panel-header">
        <span>submit verify_commit</span>
        <span className="mono">
          value 0 GEN · fee flow via set_fee_config
        </span>
      </div>
      <div className="panel-body">
        <div className="field">
          <label>Repository (owner/name)</label>
          <input
            value={repo}
            onChange={(e) => setRepo(e.target.value)}
            placeholder="octocat/Hello-World"
            spellCheck={false}
          />
        </div>
        <div className="field">
          <label>Base commit SHA</label>
          <input
            value={base}
            onChange={(e) => setBase(e.target.value)}
            spellCheck={false}
          />
        </div>
        <div className="field">
          <label>Target commit SHA</label>
          <input
            value={target}
            onChange={(e) => setTarget(e.target.value)}
            spellCheck={false}
          />
        </div>
        <div className="field">
          <label>Changelog (maintainer text)</label>
          <textarea
            value={changelog}
            onChange={(e) => setChangelog(e.target.value)}
            spellCheck={false}
          />
        </div>

        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <button
            className="btn primary"
            onClick={submit}
            disabled={!canSubmit}
          >
            {busy ? "Submitting…" : "Verify on-chain"}
          </button>
          {wallet.state.kind !== "ready" && (
            <span className="muted mono">
              connect wallet to submit
            </span>
          )}
        </div>

        <div className="status-log" style={{ marginTop: 16 }}>
          {log.length === 0 ? (
            <span className="muted">
              tx status appears here. Read calls do not need a wallet — the
              ledger to the right is live.
            </span>
          ) : (
            log.map((e, i) => (
              <div key={i}>
                <span className="ts">{e.ts}</span>{" "}
                <span className={e.kind}>{e.msg}</span>
                {e.hash && (
                  <>
                    {" "}
                    ·{" "}
                    <a
                      href={explorerTxUrl(e.hash)}
                      target="_blank"
                      rel="noreferrer"
                    >
                      explorer ↗
                    </a>
                  </>
                )}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
