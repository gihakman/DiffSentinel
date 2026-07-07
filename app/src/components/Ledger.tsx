import { FeeConfig, Stats, Verdict } from "../lib/contract";
import { CONTRACT_ADDRESS, explorerContractUrl } from "../lib/chain";

const shortAddr = (s: string) => `${s.slice(0, 6)}…${s.slice(-4)}`;
const shortSha = (s: string) => (s.length > 12 ? `${s.slice(0, 10)}…` : s);

export function Ledger({
  verdicts,
  stats,
  fee,
  error,
  onRefresh,
}: {
  verdicts: Verdict[];
  stats: Stats | null;
  fee: FeeConfig | null;
  error: string | null;
  onRefresh: () => void;
}) {
  return (
    <div>
      <div className="panel">
        <div className="panel-header">
          <span>live from contract</span>
          <button
            className="btn"
            onClick={onRefresh}
            style={{ padding: "4px 10px", fontSize: 12 }}
          >
            refresh
          </button>
        </div>
        <div className="panel-body compact">
          <table className="ledger">
            <tbody>
              <tr>
                <td className="mono muted" style={{ width: 130 }}>
                  address
                </td>
                <td className="mono">
                  <a
                    href={explorerContractUrl(CONTRACT_ADDRESS)}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {shortAddr(CONTRACT_ADDRESS)} ↗
                  </a>
                </td>
              </tr>
              <tr>
                <td className="mono muted">stats.clean</td>
                <td className="mono" style={{ color: "var(--diff-green)" }}>
                  {stats ? stats.clean : "–"}
                </td>
              </tr>
              <tr>
                <td className="mono muted">stats.suspicious</td>
                <td className="mono" style={{ color: "var(--accent)" }}>
                  {stats ? stats.suspicious : "–"}
                </td>
              </tr>
              <tr>
                <td className="mono muted">stats.malicious</td>
                <td className="mono" style={{ color: "var(--diff-red)" }}>
                  {stats ? stats.malicious : "–"}
                </td>
              </tr>
              <tr>
                <td className="mono muted">fee_bps</td>
                <td className="mono">
                  {fee ? `${fee.fee_bps} (${fee.fee_bps / 100}%)` : "–"}
                </td>
              </tr>
              <tr>
                <td className="mono muted">recipient</td>
                <td className="mono">
                  {fee ? shortAddr(fee.recipient) : "–"}
                </td>
              </tr>
              <tr>
                <td className="mono muted">fees paid out</td>
                <td className="mono">
                  {fee
                    ? `${(BigInt(fee.total_fees_paid_out_wei) / 10n ** 14n).toString()} × 10⁻⁴ GEN`
                    : "–"}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <div className="panel">
        <div className="panel-header">
          <span>recent verdicts</span>
          <span className="mono muted">newest → oldest</span>
        </div>
        <div className="panel-body compact">
          {error ? (
            <div className="muted" style={{ padding: 12 }}>
              {error}
            </div>
          ) : verdicts.length === 0 ? (
            <div className="muted" style={{ padding: 12 }}>
              No verdicts yet.
            </div>
          ) : (
            <div>
              {verdicts.slice(0, 6).map((v) => (
                <div
                  key={`${v.repo}@${v.target_commit}`}
                  style={{
                    padding: "10px 0",
                    borderBottom: "1px solid var(--border)",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                    }}
                  >
                    <span
                      className={`tag ${v.classification.toLowerCase()}`}
                    >
                      {v.classification}
                    </span>
                    <a
                      className="sha"
                      href={`https://github.com/${v.repo}/commit/${v.target_commit}`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      {shortSha(v.target_commit)} ↗
                    </a>
                  </div>
                  <div className="mono" style={{ marginTop: 4 }}>
                    {v.repo}
                  </div>
                  {v.reasoning && (
                    <div
                      className="muted"
                      style={{ marginTop: 4, fontSize: 12.5 }}
                    >
                      {v.reasoning.length > 180
                        ? `${v.reasoning.slice(0, 180)}…`
                        : v.reasoning}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
