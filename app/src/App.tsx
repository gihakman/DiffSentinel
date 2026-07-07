import { useEffect, useState } from "react";
import "./styles.css";
import { Logo } from "./components/Logo";
import { useWallet } from "./lib/wallet";
import {
  CONTRACT_ADDRESS,
  chain,
  explorerContractUrl,
  explorerTxUrl,
} from "./lib/chain";
import {
  FeeConfig,
  Stats,
  Verdict,
  getFeeConfig,
  getLedgerSize,
  getRecentVerdicts,
  getStats,
} from "./lib/contract";
import { Console } from "./components/Console";
import { Ledger } from "./components/Ledger";
import { GithubMark, REPO_URL } from "./components/GithubMark";

const shortSha = (s: string) => (s.length > 12 ? `${s.slice(0, 10)}…` : s);
const shortAddr = (s: string) => `${s.slice(0, 6)}…${s.slice(-4)}`;

export default function App() {
  const wallet = useWallet();
  const [stats, setStats] = useState<Stats | null>(null);
  const [fee, setFee] = useState<FeeConfig | null>(null);
  const [ledgerSize, setLedgerSize] = useState<number | null>(null);
  const [verdicts, setVerdicts] = useState<Verdict[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [refreshTick, setRefreshTick] = useState(0);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      // Read each field independently so one failure does not kill the
      // rest of the page. Errors are logged to the browser console so you
      // can inspect them via DevTools.
      const safe = async <T,>(label: string, fn: () => Promise<T>) => {
        try {
          return await fn();
        } catch (e) {
          console.error(`[DiffSentinel] ${label} failed:`, e);
          if (!cancelled) {
            setLoadError((prev) => prev ?? (e as Error)?.message ?? String(e));
          }
          return null;
        }
      };

      const s = await safe("stats", getStats);
      if (!cancelled && s) setStats(s);
      const size = await safe("ledger_size", getLedgerSize);
      if (!cancelled && size !== null) setLedgerSize(size);
      const f = await safe("fee_config", getFeeConfig);
      if (!cancelled && f) setFee(f);
      const recent = await safe("recent_verdicts", () => getRecentVerdicts(20));
      if (!cancelled && recent) setVerdicts(recent);
    })();
    return () => {
      cancelled = true;
    };
  }, [refreshTick]);

  const refresh = () => setRefreshTick((t) => t + 1);

  return (
    <>
      <Header wallet={wallet} />

      <main>
        <section className="hero">
          <div className="shell">
            <span className="eyebrow">GenLayer · Intelligent Contract</span>
            <h1>
              A trustless gatekeeper for the code you pull into production.
            </h1>
            <p className="lede">
              DiffSentinel reads a Git commit diff and its published changelog,
              then reaches decentralized consensus over the code's intent. Every
              processed commit is written to an on-chain ledger of{" "}
              <span style={{ color: "var(--diff-green)" }}>CLEAN</span>,{" "}
              <span style={{ color: "var(--accent)" }}>SUSPICIOUS</span>, and{" "}
              <span style={{ color: "var(--diff-red)" }}>MALICIOUS</span>{" "}
              verdicts. No centralized AI wrapper, no oracle to bribe.
            </p>

            <div className="cta-row">
              <a className="btn primary" href="#console">
                Verify a commit
              </a>
              <a className="btn" href="#ledger">
                Explore the ledger
              </a>
              <a
                className="btn"
                target="_blank"
                rel="noreferrer"
                href={explorerContractUrl(CONTRACT_ADDRESS)}
              >
                Contract on explorer ↗
              </a>
            </div>

            <div className="stat-row">
              <div className="stat clean">
                <div className="value">
                  {stats ? String(stats.clean).padStart(2, "0") : "–"}
                </div>
                <div className="label">Clean verdicts</div>
                <div className="meter">
                  <span
                    style={{
                      width:
                        stats && stats.total > 0
                          ? `${Math.round((stats.clean / stats.total) * 100)}%`
                          : "0%",
                    }}
                  />
                </div>
                <div className="sub">
                  {stats && stats.total > 0
                    ? `${Math.round((stats.clean / stats.total) * 100)}% of ledger`
                    : "no data yet"}
                </div>
              </div>
              <div className="stat suspicious">
                <div className="value">
                  {stats ? String(stats.suspicious).padStart(2, "0") : "–"}
                </div>
                <div className="label">Suspicious</div>
                <div className="meter">
                  <span
                    style={{
                      width:
                        stats && stats.total > 0
                          ? `${Math.round((stats.suspicious / stats.total) * 100)}%`
                          : "0%",
                    }}
                  />
                </div>
                <div className="sub">
                  {stats && stats.total > 0
                    ? `${Math.round((stats.suspicious / stats.total) * 100)}% of ledger`
                    : "no data yet"}
                </div>
              </div>
              <div className="stat malicious">
                <div className="value">
                  {stats ? String(stats.malicious).padStart(2, "0") : "–"}
                </div>
                <div className="label">Malicious</div>
                <div className="meter">
                  <span
                    style={{
                      width:
                        stats && stats.total > 0
                          ? `${Math.round((stats.malicious / stats.total) * 100)}%`
                          : "0%",
                    }}
                  />
                </div>
                <div className="sub">
                  {stats && stats.total > 0
                    ? `${Math.round((stats.malicious / stats.total) * 100)}% of ledger`
                    : "no data yet"}
                </div>
              </div>
              <div className="stat total">
                <div className="value">
                  {ledgerSize !== null
                    ? String(ledgerSize).padStart(2, "0")
                    : "–"}
                </div>
                <div className="label">Total on chain</div>
                <div className="meter">
                  <span
                    style={{
                      width: ledgerSize !== null && ledgerSize > 0 ? "100%" : "0%",
                    }}
                  />
                </div>
                <div className="sub">
                  {ledgerSize !== null && ledgerSize > 0
                    ? `${ledgerSize} verified commit${ledgerSize === 1 ? "" : "s"}`
                    : "empty"}
                </div>
              </div>
            </div>

            {loadError && !stats && (
              <div
                className="mono"
                style={{
                  marginTop: 24,
                  padding: "12px 16px",
                  color: "var(--diff-red)",
                  border: "1px solid var(--border)",
                  background: "var(--surface)",
                  fontSize: 12.5,
                }}
              >
                Could not read contract state: {loadError}. Check the browser
                console for details, then click refresh in the console panel
                below.
              </div>
            )}
          </div>
        </section>

        <section id="how" style={{ padding: "56px 0" }}>
          <div className="shell">
            <span className="eyebrow">How it works</span>
            <h2>Four steps, one on-chain verdict.</h2>
            <p className="lede">
              Every verify_commit call runs the same pipeline. Validators fetch
              the same public diff, sanitize the same content, and vote on the
              same categorical classification. Reasoning may differ; the verdict
              does not.
            </p>
            <div className="steps">
              <div className="step">
                <div className="num">01</div>
                <h3>Submit</h3>
                <p>
                  Frontend or CI action sends a verify_commit tx with the
                  repository slug, base and target SHAs, and the changelog.
                </p>
              </div>
              <div className="step">
                <div className="num">02</div>
                <h3>Fetch</h3>
                <p>
                  Every validator hits GitHub's public compare API from inside
                  a non-deterministic block, skipping non-executable files.
                </p>
              </div>
              <div className="step">
                <div className="num">03</div>
                <h3>Reason</h3>
                <p>
                  Comments and long string literals are stripped, then an LLM
                  compares the diff to the changelog under a hardened prompt.
                </p>
              </div>
              <div className="step">
                <div className="num">04</div>
                <h3>Settle</h3>
                <p>
                  Optimistic Democracy demands strict agreement on the enum
                  verdict. The commit is written to the immutable ledger.
                </p>
              </div>
            </div>
          </div>
        </section>

        <section id="console">
          <div className="shell">
            <span className="eyebrow">Interactive console</span>
            <h2>Run a verification against the live contract.</h2>
            <p className="lede">
              Submits a real transaction to Bradbury. Validators will fetch the
              GitHub diff, classify it, and vote. Free view calls do not need a
              wallet.
            </p>
            <div className="console-grid">
              <Console wallet={wallet} onSuccess={refresh} />
              <Ledger
                verdicts={verdicts}
                stats={stats}
                fee={fee}
                error={loadError}
                onRefresh={refresh}
              />
            </div>
          </div>
        </section>

        <section id="ledger" style={{ paddingTop: "48px" }}>
          <div className="shell">
            <span className="eyebrow">On-chain ledger</span>
            <h2>Every commit ever adjudicated.</h2>
            <p className="lede">
              Read live from the contract. Tap any row to open its target
              commit on GitHub or the submitting tx on the explorer.
            </p>
            <div className="panel">
              <div className="panel-header">
                <span>recent_verdicts</span>
                <span className="mono">
                  {ledgerSize ?? "–"} total ·{" "}
                  {stats ? `${stats.clean}/${stats.suspicious}/${stats.malicious}` : "–"}
                </span>
              </div>
              <div className="panel-body compact">
                {loadError ? (
                  <div className="muted" style={{ padding: 16 }}>
                    Could not read ledger: {loadError}
                  </div>
                ) : verdicts.length === 0 ? (
                  <div className="muted" style={{ padding: 16 }}>
                    Ledger empty. Submit the first verification above.
                  </div>
                ) : (
                  <table className="ledger">
                    <thead>
                      <tr>
                        <th>Verdict</th>
                        <th>Repository</th>
                        <th>Target</th>
                        <th>Reasoning</th>
                        <th>Submitted by</th>
                      </tr>
                    </thead>
                    <tbody>
                      {verdicts.map((v) => (
                        <tr key={`${v.repo}@${v.target_commit}`}>
                          <td>
                            <span
                              className={`tag ${v.classification.toLowerCase()}`}
                            >
                              {v.classification}
                            </span>
                          </td>
                          <td className="repo">
                            <a
                              href={`https://github.com/${v.repo}`}
                              target="_blank"
                              rel="noreferrer"
                            >
                              {v.repo}
                            </a>
                          </td>
                          <td>
                            <a
                              className="sha"
                              href={`https://github.com/${v.repo}/commit/${v.target_commit}`}
                              target="_blank"
                              rel="noreferrer"
                              title={v.target_commit}
                            >
                              {shortSha(v.target_commit)}
                            </a>
                          </td>
                          <td className="reasoning">
                            {v.reasoning || <span className="muted">—</span>}
                            {v.red_flags ? (
                              <div
                                className="muted"
                                style={{ marginTop: 4, fontSize: 12 }}
                              >
                                red flags: {v.red_flags}
                              </div>
                            ) : null}
                          </td>
                          <td className="sha">{shortAddr(v.submitted_by)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          </div>
        </section>

        <section id="integrate">
          <div className="shell">
            <span className="eyebrow">Integrate</span>
            <h2>Wire it into any pipeline.</h2>
            <p className="lede">
              DiffSentinel is a plain intelligent contract. Any GenLayer client
              can read the ledger; any signer with a funded Bradbury account can
              submit a verify_commit tx.
            </p>

            <div className="console-grid">
              <div className="panel">
                <div className="panel-header">
                  <span>Read a verdict — genlayer-js</span>
                </div>
                <div className="panel-body">
                  <pre>
{`import { createClient } from "genlayer-js";
import { testnetBradbury } from "genlayer-js/chains";

const client = createClient({ chain: testnetBradbury });
const verdict = await client.readContract({
  address: "${CONTRACT_ADDRESS}",
  functionName: "get_verdict",
  args: [
    "octocat/Hello-World",
    "762941318ee16e59dabbacb1b4049eec22f0d303",
  ],
});
`}
                  </pre>
                </div>
              </div>
              <div className="panel">
                <div className="panel-header">
                  <span>Submit a verification — CLI-style</span>
                </div>
                <div className="panel-body">
                  <pre>
{`# Any signer with a funded Bradbury account
node scripts/seed.mjs --wait

# Or from CI, POST verify_commit through the RPC
curl -X POST https://rpc-bradbury.genlayer.com \\
  -H 'Content-Type: application/json' \\
  -d '{"jsonrpc":"2.0","method":"gen_call", ...}'
`}
                  </pre>
                </div>
              </div>
            </div>

            <div className="panel" style={{ marginTop: 16 }}>
              <div className="panel-header">
                <span>Contract methods</span>
                <a
                  target="_blank"
                  rel="noreferrer"
                  href={explorerContractUrl(CONTRACT_ADDRESS)}
                >
                  view on explorer ↗
                </a>
              </div>
              <div className="panel-body">
                <table className="ledger">
                  <thead>
                    <tr>
                      <th>Method</th>
                      <th>Type</th>
                      <th>Purpose</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td className="mono">verify_commit(repo, base, target, changelog)</td>
                      <td>write · payable</td>
                      <td>Fetch diff, classify via consensus, record verdict.</td>
                    </tr>
                    <tr>
                      <td className="mono">set_fee_config(recipient, fee_bps)</td>
                      <td>write · owner</td>
                      <td>Update fee recipient and bps rate.</td>
                    </tr>
                    <tr>
                      <td className="mono">get_verdict(repo, target)</td>
                      <td>view</td>
                      <td>Return the recorded verdict for a commit.</td>
                    </tr>
                    <tr>
                      <td className="mono">recent_verdicts(limit)</td>
                      <td>view</td>
                      <td>Newest-first slice of the ledger.</td>
                    </tr>
                    <tr>
                      <td className="mono">stats() · fee_config() · ledger_size() · owner_address() · has_verdict() · get_repo_status()</td>
                      <td>view</td>
                      <td>Dashboard, config, and lookups.</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </section>
      </main>

      <footer className="site-footer">
        <div className="shell row">
          <span>
            <Logo size={18} showWordmark={false} /> DiffSentinel · a GenLayer
            Intelligent Contract on {chain.name}
          </span>
          <span
            style={{ display: "inline-flex", alignItems: "center", gap: 18 }}
          >
            <a
              target="_blank"
              rel="noreferrer"
              href={REPO_URL}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                textDecoration: "none",
              }}
            >
              <GithubMark size={15} /> source
            </a>
            <span>
              Contract{" "}
              <a
                target="_blank"
                rel="noreferrer"
                href={explorerContractUrl(CONTRACT_ADDRESS)}
              >
                {shortAddr(CONTRACT_ADDRESS)} ↗
              </a>{" "}
              · Deploy{" "}
              <a
                target="_blank"
                rel="noreferrer"
                href={explorerTxUrl(
                  "0xc6695f9f4f573ee60befcf76812964e8c81c2d420ab483802a768e2d3eb87d00",
                )}
              >
                tx ↗
              </a>
            </span>
          </span>
        </div>
      </footer>
    </>
  );
}

function Header({ wallet }: { wallet: ReturnType<typeof useWallet> }) {
  const { state, connect, disconnect, switchToBradbury } = wallet;
  return (
    <header className="site-header">
      <div className="shell row">
        <a href="#top" style={{ textDecoration: "none" }}>
          <Logo />
        </a>
        <nav>
          <a href="#how">How it works</a>
          <a href="#console">Console</a>
          <a href="#ledger">Ledger</a>
          <a href="#integrate">Integrate</a>
        </nav>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <a
            className="icon-link"
            href={REPO_URL}
            target="_blank"
            rel="noreferrer"
            aria-label="View source on GitHub"
            title="View source on GitHub"
          >
            <GithubMark />
          </a>
          {state.kind === "unavailable" && (
            <span className="mono muted">
              <span className="dot off" /> No wallet detected
            </span>
          )}
          {state.kind === "idle" && (
            <button className="btn" onClick={connect}>
              Connect wallet
            </button>
          )}
          {state.kind === "connecting" && (
            <span className="mono muted">
              <span className="dot warn" /> Connecting…
            </span>
          )}
          {state.kind === "wrong-network" && (
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <span className="mono" style={{ color: "var(--diff-red)" }}>
                <span className="dot off" /> Wrong network
              </span>
              <button className="btn primary" onClick={switchToBradbury}>
                Switch to Bradbury
              </button>
            </div>
          )}
          {state.kind === "ready" && (
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <span className="mono">
                <span className="dot on" /> {shortAddr(state.address)}
              </span>
              <button className="btn" onClick={disconnect}>
                Disconnect
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
