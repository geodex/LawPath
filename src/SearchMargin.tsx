import { Banknote, TrendingUp, Wallet } from "lucide-react";
import { useEffect, useState } from "react";
import { getSearchMargin, SearchMargin as Margin } from "./api";

type Props = {
  showToast: (type: "success" | "error" | "info", title: string, msg: string) => void;
};

const money = (cents: number) => `R ${(cents / 100).toLocaleString("en-ZA", { minimumFractionDigits: 2 })}`;
const PERIODS = [7, 30, 90, 365];

function MarginCell({ cents, pct }: { cents: number; pct: number | null }) {
  return (
    <>
      <td style={{ textAlign: "right", whiteSpace: "nowrap", fontWeight: 600, color: cents < 0 ? "var(--rose)" : "var(--green)" }}>
        {money(cents)}
      </td>
      <td style={{ textAlign: "right", whiteSpace: "nowrap", color: "var(--muted)" }}>
        {pct === null ? "—" : `${pct}%`}
      </td>
    </>
  );
}

export function SearchMargin({ showToast }: Props) {
  const [days, setDays] = useState(30);
  const [data, setData] = useState<Margin | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    getSearchMargin(days)
      .then(setData)
      .catch((err: unknown) => showToast("error", "Search margin", err instanceof Error ? err.message : "Could not load."))
      .finally(() => setLoading(false));
  }, [days, showToast]);

  if (loading && !data) return <div className="panel"><p style={{ margin: 0, color: "var(--muted)" }}>Loading…</p></div>;
  if (!data) return null;

  const t = data.totals;

  return (
    <>
      <div className="panel" style={{ marginBottom: 18 }}>
        <div className="panel-head">
          <h3><TrendingUp size={16} style={{ verticalAlign: "-3px", marginRight: 6 }} /> Search margin</h3>
          <div style={{ display: "flex", gap: 6 }}>
            {PERIODS.map(d => (
              <button key={d} className={d === days ? "primary small" : "ghost small"} onClick={() => setDays(d)}>
                {d}d
              </button>
            ))}
          </div>
        </div>

        {/* .metrics / .metric is the house stat-tile pattern (see Metric in
            App.tsx) — span, strong, small. Inventing class names here rendered
            the labels and values as one run-on line. */}
        <section className="metrics">
          <div className="metric">
            <span>Billed to firms</span>
            <strong>{money(t.revenueCents)}</strong>
            <small>{t.searches} searches</small>
          </div>
          <div className="metric">
            <span>Paid to providers</span>
            <strong>{money(t.costCents)}</strong>
            <small>{t.failed} failed (not charged)</small>
          </div>
          <div className="metric">
            <span>Margin</span>
            <strong>{money(t.marginCents)}</strong>
            <small>{t.marginPct === null ? "no billing yet" : `${t.marginPct}% of revenue`}</small>
          </div>
          <div className="metric">
            <span>Credit held</span>
            <strong>{money(data.floatCents)}</strong>
            <small>prepaid, not yet earned</small>
          </div>
        </section>

        {data.owedCents > 0 && (
          <p style={{ margin: "14px 0 0", fontSize: "0.85rem", color: "var(--rose)" }}>
            <Wallet size={14} style={{ verticalAlign: "-2px", marginRight: 6 }} />
            {money(data.owedCents)} owed by firms whose balance went negative — searches already run and paid for.
          </p>
        )}
        <p style={{ margin: "10px 0 0", fontSize: "0.8rem", color: "var(--muted)" }}>
          <Banknote size={13} style={{ verticalAlign: "-2px", marginRight: 6 }} />
          Each search is counted at the price in force when it ran, so past periods keep the margin they actually earned.
        </p>
      </div>

      <div className="panel" style={{ marginBottom: 18 }}>
        <div className="panel-head"><h3>By provider</h3></div>
        <table className="cipc-directors-table">
          <thead>
            <tr>
              <th>Provider</th><th style={{ textAlign: "right" }}>Searches</th>
              <th style={{ textAlign: "right" }}>Cost</th><th style={{ textAlign: "right" }}>Billed</th>
              <th style={{ textAlign: "right" }}>Margin</th><th style={{ textAlign: "right" }}>%</th>
            </tr>
          </thead>
          <tbody>
            {data.byProvider.length === 0 ? (
              <tr><td colSpan={6} style={{ color: "var(--muted)", fontStyle: "italic" }}>No searches in this period.</td></tr>
            ) : data.byProvider.map(r => (
              <tr key={r.provider}>
                <td style={{ fontWeight: 600 }}>{r.provider}</td>
                <td style={{ textAlign: "right" }}>{r.searches}</td>
                <td style={{ textAlign: "right", color: "var(--muted)" }}>{money(r.costCents)}</td>
                <td style={{ textAlign: "right" }}>{money(r.revenueCents)}</td>
                <MarginCell cents={r.marginCents} pct={r.marginPct} />
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="panel" style={{ marginBottom: 18 }}>
        <div className="panel-head"><h3>By firm</h3></div>
        <table className="cipc-directors-table">
          <thead>
            <tr>
              <th>Firm</th><th style={{ textAlign: "right" }}>Searches</th>
              <th style={{ textAlign: "right" }}>Cost</th><th style={{ textAlign: "right" }}>Billed</th>
              <th style={{ textAlign: "right" }}>Margin</th><th style={{ textAlign: "right" }}>%</th>
              <th style={{ textAlign: "right" }}>Balance</th>
            </tr>
          </thead>
          <tbody>
            {data.byTenant.length === 0 ? (
              <tr><td colSpan={7} style={{ color: "var(--muted)", fontStyle: "italic" }}>No searches in this period.</td></tr>
            ) : data.byTenant.map(r => (
              <tr key={r.tenantId}>
                <td style={{ fontWeight: 600 }}>{r.tenantName}</td>
                <td style={{ textAlign: "right" }}>{r.searches}</td>
                <td style={{ textAlign: "right", color: "var(--muted)" }}>{money(r.costCents)}</td>
                <td style={{ textAlign: "right" }}>{money(r.revenueCents)}</td>
                <MarginCell cents={r.marginCents} pct={r.marginPct} />
                <td style={{ textAlign: "right", whiteSpace: "nowrap", color: r.balanceCents < 0 ? "var(--rose)" : undefined }}>
                  {money(r.balanceCents)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="panel">
        <div className="panel-head"><h3>By search type</h3></div>
        <table className="cipc-directors-table">
          <thead>
            <tr>
              <th>Search</th><th style={{ textAlign: "right" }}>Count</th>
              <th style={{ textAlign: "right" }}>Cost</th><th style={{ textAlign: "right" }}>Billed</th>
              <th style={{ textAlign: "right" }}>Margin</th><th style={{ textAlign: "right" }}>%</th>
            </tr>
          </thead>
          <tbody>
            {data.byService.length === 0 ? (
              <tr><td colSpan={6} style={{ color: "var(--muted)", fontStyle: "italic" }}>No searches in this period.</td></tr>
            ) : data.byService.map(r => (
              <tr key={`${r.provider}:${r.service}`}>
                <td>
                  <span style={{ fontWeight: 600 }}>{r.service}</span>
                  <span style={{ color: "var(--muted)" }}> · {r.provider}</span>
                </td>
                <td style={{ textAlign: "right" }}>{r.searches}</td>
                <td style={{ textAlign: "right", color: "var(--muted)" }}>{money(r.costCents)}</td>
                <td style={{ textAlign: "right" }}>{money(r.revenueCents)}</td>
                <MarginCell cents={r.marginCents} pct={r.marginPct} />
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
