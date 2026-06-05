import { AlertTriangle, Award, BarChart2, CheckCircle2, RefreshCw, TrendingUp, Users } from "lucide-react";
import { useState } from "react";
import { generateAnalyticsSnapshot } from "./api";
import type { AnalyticsSnapshot, FeeEarnerStat, MatterTypeStat } from "./types";

// ─── helpers ────────────────────────────────────────────────────────────────

const money = (cents: number) =>
  new Intl.NumberFormat("en-ZA", {
    style: "currency",
    currency: "ZAR",
    maximumFractionDigits: 0,
  }).format(cents / 100);

const pct = (rate: number) => `${(rate * 100).toFixed(1)}%`;

const rateColor = (rate: number, good: number, warn: number) =>
  rate >= good ? "var(--green)" : rate >= warn ? "var(--gold)" : "var(--rose)";

// ─── component ──────────────────────────────────────────────────────────────

interface Props {
  snapshot: AnalyticsSnapshot | null;
  setSnapshot: React.Dispatch<React.SetStateAction<AnalyticsSnapshot | null>>;
  log: (msg: string) => void;
  showToast: (type: "success" | "error" | "info", title: string, msg: string) => void;
}

export function PracticeAnalytics({ snapshot, setSnapshot, log, showToast }: Props) {
  const [refreshing, setRefreshing] = useState(false);

  // ── 1. Refresh handler ────────────────────────────────────────────────────

  async function handleRefresh() {
    setRefreshing(true);
    log("Generating analytics snapshot…");
    try {
      const { snapshot: snap } = await generateAnalyticsSnapshot();
      setSnapshot(snap);
      log(`Analytics snapshot generated for ${snap.periodMonth}`);
      showToast("success", "Analytics refreshed", `Snapshot for ${snap.periodMonth} is ready.`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      log(`Analytics error: ${msg}`);
      showToast("error", "Refresh failed", msg);
    } finally {
      setRefreshing(false);
    }
  }

  // ── empty state ───────────────────────────────────────────────────────────

  if (!snapshot) {
    return (
      <div className="panel" style={{ padding: "2.5rem", textAlign: "center" }}>
        <BarChart2 size={48} style={{ color: "var(--muted)", marginBottom: "1rem" }} />
        <p className="eyebrow" style={{ marginBottom: "1rem" }}>No analytics snapshot available</p>
        <button className="primary" onClick={handleRefresh} disabled={refreshing}>
          <RefreshCw size={16} />
          {refreshing ? "Generating…" : "Generate first snapshot"}
        </button>
      </div>
    );
  }

  // ── derived values ────────────────────────────────────────────────────────

  const {
    periodMonth,
    totalMattersActive,
    totalMattersClosed,
    wipTotalCents,
    billedTotalCents,
    collectedCents,
    writtenOffCents,
    trustBalanceCents,
    debtors30Cents,
    debtors60Cents,
    debtors90Cents,
    debtors120PlusCents,
    realisationRate,
    collectionRate,
    feeEarnerStats,
    matterTypeStats,
    collectedTotalCents,
  } = snapshot as AnalyticsSnapshot & { collectedCents?: number };

  // normalise field name (types use collectedTotalCents, keep compatible)
  const collected = collectedTotalCents ?? (collectedCents as number | undefined) ?? 0;

  const totalDebtors =
    debtors30Cents + debtors60Cents + debtors90Cents + debtors120PlusCents;

  const debtorSegments = [
    { label: "0–30 days", cents: debtors30Cents, color: "var(--green)" },
    { label: "31–60 days", cents: debtors60Cents, color: "var(--gold)" },
    { label: "61–90 days", cents: debtors90Cents, color: "#e07830" },
    { label: "90+ days", cents: debtors120PlusCents, color: "var(--rose)" },
  ];

  // sorted fee earner table
  const sortedEarners = [...feeEarnerStats].sort(
    (a, b) => b.collectedCents - a.collectedCents
  );

  // pipeline forecast
  const avgFeeCents =
    totalMattersClosed > 0
      ? Math.round(billedTotalCents / totalMattersClosed)
      : 0;
  const pipelineCents = totalMattersActive * avgFeeCents;

  // matter type bar chart scale
  const maxMatterFee = Math.max(...matterTypeStats.map((m) => m.totalFeeCents), 1);

  // ── render ────────────────────────────────────────────────────────────────

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>

      {/* ── 1. Header ─────────────────────────────────────────────────────── */}
      <div className="panel-head" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "0.75rem" }}>
        <div>
          <span className="eyebrow" style={{ display: "block", marginBottom: "0.25rem" }}>
            Practice Analytics
          </span>
          <h2 style={{ margin: 0, fontSize: "1.25rem", fontWeight: 700 }}>
            Partner Dashboard — {periodMonth}
          </h2>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
          <span className="small" style={{ color: "var(--muted)" }}>
            Period: {periodMonth}
          </span>
          <button
            className="ghost"
            onClick={handleRefresh}
            disabled={refreshing}
            style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}
          >
            <RefreshCw size={15} style={{ animation: refreshing ? "spin 1s linear infinite" : "none" }} />
            {refreshing ? "Refreshing…" : "Refresh analytics"}
          </button>
        </div>
      </div>

      {/* ── 2. KPI cards ──────────────────────────────────────────────────── */}
      <section className="tier1-section">
        {/* Row 1 */}
        <div className="metrics">
          <div className="metric panel">
            <span className="eyebrow">WIP</span>
            <span className="metric-value">{money(wipTotalCents)}</span>
            <span className="small" style={{ color: "var(--muted)" }}>Total fees on file</span>
          </div>

          <div className="metric panel">
            <span className="eyebrow">Billed this period</span>
            <span className="metric-value">{money(billedTotalCents)}</span>
          </div>

          <div className="metric panel">
            <span className="eyebrow">Collected</span>
            <span
              className="metric-value"
              style={{ color: collectionRate > 0.85 ? "var(--green)" : undefined }}
            >
              {money(collected)}
            </span>
          </div>

          <div className="metric panel">
            <span className="eyebrow">Written off</span>
            <span
              className="metric-value"
              style={{ color: writtenOffCents > 0 ? "var(--rose)" : undefined }}
            >
              {money(writtenOffCents)}
            </span>
          </div>
        </div>

        {/* Row 2 */}
        <div className="metrics" style={{ marginTop: "1rem" }}>
          <div className="metric panel">
            <span className="eyebrow">Realisation rate</span>
            <span
              className="metric-value"
              style={{ color: rateColor(realisationRate, 0.8, 0.6) }}
            >
              {pct(realisationRate)}
            </span>
          </div>

          <div className="metric panel">
            <span className="eyebrow">Collection rate</span>
            <span
              className="metric-value"
              style={{ color: rateColor(collectionRate, 0.8, 0.6) }}
            >
              {pct(collectionRate)}
            </span>
          </div>

          <div className="metric panel">
            <span className="eyebrow">Trust balance</span>
            <span className="metric-value" style={{ color: "var(--green)" }}>
              {money(trustBalanceCents)}
            </span>
          </div>

          <div className="metric panel">
            <span className="eyebrow">Active matters</span>
            <span className="metric-value">{totalMattersActive}</span>
          </div>
        </div>
      </section>

      {/* ── 3. Debtor age analysis ────────────────────────────────────────── */}
      <section className="panel">
        <div className="panel-head" style={{ marginBottom: "1rem" }}>
          <span className="eyebrow">Debtors book by age</span>
          <span className="small" style={{ color: "var(--muted)", marginLeft: "0.5rem" }}>
            Total: {money(totalDebtors)}
          </span>
        </div>

        {totalDebtors > 0 ? (
          <>
            {/* Stacked bar */}
            <div
              style={{
                display: "flex",
                height: "2rem",
                borderRadius: "0.4rem",
                overflow: "hidden",
                width: "100%",
              }}
            >
              {debtorSegments.map((seg) =>
                seg.cents > 0 ? (
                  <div
                    key={seg.label}
                    style={{
                      width: `${(seg.cents / totalDebtors) * 100}%`,
                      background: seg.color,
                      transition: "width 0.4s ease",
                    }}
                    title={`${seg.label}: ${money(seg.cents)}`}
                  />
                ) : null
              )}
            </div>

            {/* Legend */}
            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                gap: "1rem",
                marginTop: "0.75rem",
              }}
            >
              {debtorSegments.map((seg) => (
                <div key={seg.label} style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
                  <div
                    style={{
                      width: "0.75rem",
                      height: "0.75rem",
                      borderRadius: "2px",
                      background: seg.color,
                      flexShrink: 0,
                    }}
                  />
                  <span className="small">
                    <strong>{seg.label}</strong>: {money(seg.cents)}{" "}
                    <span style={{ color: "var(--muted)" }}>
                      ({totalDebtors > 0 ? ((seg.cents / totalDebtors) * 100).toFixed(1) : "0"}%)
                    </span>
                  </span>
                </div>
              ))}
            </div>
          </>
        ) : (
          <p className="small" style={{ color: "var(--muted)" }}>No debtor balances recorded.</p>
        )}
      </section>

      {/* ── 4. Fee earner performance ─────────────────────────────────────── */}
      <section className="panel">
        <div className="panel-head" style={{ marginBottom: "1rem", display: "flex", alignItems: "center", gap: "0.5rem" }}>
          <Users size={16} />
          <span className="eyebrow">Fee earner performance</span>
        </div>

        {sortedEarners.length === 0 ? (
          <p className="small" style={{ color: "var(--muted)" }}>No fee earner data available.</p>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table className="table" style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr className="row">
                  <th style={{ textAlign: "left", padding: "0.5rem 0.75rem" }}>Fee earner</th>
                  <th style={{ textAlign: "right", padding: "0.5rem 0.75rem" }}>Matters</th>
                  <th style={{ textAlign: "right", padding: "0.5rem 0.75rem" }}>WIP</th>
                  <th style={{ textAlign: "right", padding: "0.5rem 0.75rem" }}>Billed</th>
                  <th style={{ textAlign: "right", padding: "0.5rem 0.75rem" }}>Collected</th>
                  <th style={{ textAlign: "right", padding: "0.5rem 0.75rem" }}>Realisation %</th>
                  <th style={{ textAlign: "right", padding: "0.5rem 0.75rem" }}>Collection %</th>
                </tr>
              </thead>
              <tbody>
                {sortedEarners.map((earner: FeeEarnerStat, idx: number) => (
                  <tr key={earner.name} className="row">
                    <td style={{ padding: "0.5rem 0.75rem" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                        {idx === 0 && (
                          <span
                            className="pill"
                            style={{
                              background: "var(--gold)",
                              color: "#1a1200",
                              display: "inline-flex",
                              alignItems: "center",
                              gap: "0.25rem",
                              padding: "0.1rem 0.4rem",
                              borderRadius: "999px",
                              fontSize: "0.7rem",
                              fontWeight: 700,
                            }}
                          >
                            <Award size={11} />
                            Top earner
                          </span>
                        )}
                        {earner.name}
                      </div>
                    </td>
                    <td style={{ textAlign: "right", padding: "0.5rem 0.75rem" }}>{earner.matterCount}</td>
                    <td style={{ textAlign: "right", padding: "0.5rem 0.75rem" }}>{money(earner.wipCents)}</td>
                    <td style={{ textAlign: "right", padding: "0.5rem 0.75rem" }}>{money(earner.billedCents)}</td>
                    <td style={{ textAlign: "right", padding: "0.5rem 0.75rem" }}>{money(earner.collectedCents)}</td>
                    <td style={{ textAlign: "right", padding: "0.5rem 0.75rem" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", justifyContent: "flex-end" }}>
                        <div
                          style={{
                            width: "3.5rem",
                            height: "0.4rem",
                            borderRadius: "999px",
                            background: "var(--border)",
                            overflow: "hidden",
                          }}
                        >
                          <div
                            style={{
                              height: "100%",
                              width: `${Math.min(earner.realisationRate * 100, 100)}%`,
                              background: rateColor(earner.realisationRate, 0.8, 0.6),
                              borderRadius: "999px",
                            }}
                          />
                        </div>
                        <span style={{ color: rateColor(earner.realisationRate, 0.8, 0.6) }}>
                          {pct(earner.realisationRate)}
                        </span>
                      </div>
                    </td>
                    <td style={{ textAlign: "right", padding: "0.5rem 0.75rem" }}>
                      <span style={{ color: rateColor(earner.collectionRate, 0.9, 0.75) }}>
                        {pct(earner.collectionRate)}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* ── 5. Matter type breakdown ──────────────────────────────────────── */}
      <section className="panel">
        <div className="panel-head" style={{ marginBottom: "1rem", display: "flex", alignItems: "center", gap: "0.5rem" }}>
          <BarChart2 size={16} />
          <span className="eyebrow">Matter type breakdown</span>
        </div>

        {matterTypeStats.length === 0 ? (
          <p className="small" style={{ color: "var(--muted)" }}>No matter type data available.</p>
        ) : (
          <div className="grid-two" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1.5rem" }}>
            {/* Table */}
            <div style={{ overflowX: "auto" }}>
              <table className="table" style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr className="row">
                    <th style={{ textAlign: "left", padding: "0.5rem 0.75rem" }}>Matter type</th>
                    <th style={{ textAlign: "right", padding: "0.5rem 0.75rem" }}>Count</th>
                    <th style={{ textAlign: "right", padding: "0.5rem 0.75rem" }}>Avg cycle (days)</th>
                    <th style={{ textAlign: "right", padding: "0.5rem 0.75rem" }}>Total fees</th>
                  </tr>
                </thead>
                <tbody>
                  {matterTypeStats.map((mt: MatterTypeStat) => (
                    <tr key={mt.matterType} className="row">
                      <td style={{ padding: "0.5rem 0.75rem" }}>{mt.matterType}</td>
                      <td style={{ textAlign: "right", padding: "0.5rem 0.75rem" }}>{mt.count}</td>
                      <td style={{ textAlign: "right", padding: "0.5rem 0.75rem" }}>{mt.avgCycleTimeDays.toFixed(1)}</td>
                      <td style={{ textAlign: "right", padding: "0.5rem 0.75rem" }}>{money(mt.totalFeeCents)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Proportional bar chart */}
            <div style={{ display: "flex", flexDirection: "column", gap: "0.6rem", justifyContent: "center" }}>
              {matterTypeStats.map((mt: MatterTypeStat, idx: number) => {
                const hues = [210, 150, 270, 40, 0, 185, 320];
                const hue = hues[idx % hues.length];
                const widthPct = maxMatterFee > 0 ? (mt.totalFeeCents / maxMatterFee) * 100 : 0;
                return (
                  <div key={mt.matterType}>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "0.2rem" }}>
                      <span className="small">{mt.matterType}</span>
                      <span className="small" style={{ color: "var(--muted)" }}>{money(mt.totalFeeCents)}</span>
                    </div>
                    <div
                      style={{
                        height: "0.5rem",
                        borderRadius: "999px",
                        background: "var(--border)",
                        overflow: "hidden",
                      }}
                    >
                      <div
                        style={{
                          height: "100%",
                          width: `${widthPct}%`,
                          background: `hsl(${hue}, 65%, 50%)`,
                          borderRadius: "999px",
                          transition: "width 0.4s ease",
                        }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </section>

      {/* ── 6. Pipeline forecast ──────────────────────────────────────────── */}
      <section className="panel">
        <div className="panel-head" style={{ marginBottom: "1rem", display: "flex", alignItems: "center", gap: "0.5rem" }}>
          <TrendingUp size={16} />
          <span className="eyebrow">Pipeline forecast</span>
        </div>

        {totalMattersClosed === 0 ? (
          <p className="small" style={{ color: "var(--muted)" }}>Insufficient closed matters to compute a forecast.</p>
        ) : (
          <div
            style={{
              background: "var(--surface-raised, var(--surface))",
              border: "1px solid var(--border)",
              borderRadius: "0.5rem",
              padding: "1.25rem",
              lineHeight: 1.7,
            }}
          >
            <p style={{ margin: 0 }}>
              Based on{" "}
              <strong>{totalMattersActive}</strong> active matter{totalMattersActive !== 1 ? "s" : ""} and an average
              fee of <strong>{money(avgFeeCents)}</strong>, the estimated pipeline value is{" "}
              <strong style={{ color: "var(--green)", fontSize: "1.1em" }}>{money(pipelineCents)}</strong>.
            </p>
            <p className="small" style={{ margin: "0.5rem 0 0", color: "var(--muted)" }}>
              Calculated as: {totalMattersActive} active matters × {money(avgFeeCents)} avg fee (from{" "}
              {totalMattersClosed} closed matters billed {money(billedTotalCents)}).
            </p>
          </div>
        )}
      </section>

      {/* ── 7. Realisation & collection explanation ───────────────────────── */}
      <section
        style={{
          display: "flex",
          alignItems: "flex-start",
          gap: "0.75rem",
          background: "var(--surface-raised, var(--surface))",
          border: "1px solid var(--border)",
          borderRadius: "0.5rem",
          padding: "1rem 1.25rem",
        }}
      >
        <CheckCircle2 size={18} style={{ color: "var(--green)", flexShrink: 0, marginTop: "0.1rem" }} />
        <div>
          <span className="eyebrow" style={{ display: "block", marginBottom: "0.25rem" }}>
            Rate definitions &amp; targets
          </span>
          <p className="small" style={{ margin: 0, color: "var(--muted)", lineHeight: 1.65 }}>
            <strong>Realisation rate</strong> = fees billed ÷ WIP recorded.{" "}
            <strong>Collection rate</strong> = fees collected ÷ fees billed.{" "}
            Target: Realisation ≥ 80%, Collection ≥ 90%.{" "}
            Low rates indicate either write-offs or slow debtors.
          </p>
        </div>
        {(realisationRate < 0.6 || collectionRate < 0.75) && (
          <AlertTriangle size={18} style={{ color: "var(--rose)", flexShrink: 0, marginTop: "0.1rem" }} />
        )}
      </section>

    </div>
  );
}
