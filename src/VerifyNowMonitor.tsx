import { AlertTriangle, CheckCircle2, Clock, RefreshCw, Shield, TrendingUp, Zap } from "lucide-react";
import { useEffect, useState } from "react";
import { getVerifyNowUsage } from "./api";
import type { VerifyNowLogEntry, VerifyNowServiceStat, VerifyNowTenantStat, VerifyNowUsageTotals } from "./types";

const fmtCredits = (n: string | number | null | undefined) =>
  n == null ? "0" : Number(n).toLocaleString("en-ZA", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const SERVICE_LABELS: Record<string, string> = {
  "verify":                    "SA ID Verify",
  "verify-document":           "Document OCR",
  "face-match":                "Face Match",
  "aml-pep":                   "AML / PEP",
  "consumer-trace":            "Consumer Trace",
  "consumer-trace-lite":       "Consumer Trace Lite",
  "cipc/company":              "CIPC Company",
  "cipc/director":             "CIPC Director",
  "bank-account-verification": "Bank Account",
  "number-plate":              "Number Plate",
  "vin-decode":                "VIN Decode",
};

export function VerifyNowMonitor({
  showToast
}: {
  showToast: (type: "success" | "error" | "info", title: string, msg: string) => void;
}) {
  const [loading, setLoading] = useState(false);
  const [totals, setTotals] = useState<VerifyNowUsageTotals | null>(null);
  const [byService, setByService] = useState<VerifyNowServiceStat[]>([]);
  const [byTenant, setByTenant] = useState<VerifyNowTenantStat[]>([]);
  const [recentLog, setRecentLog] = useState<VerifyNowLogEntry[]>([]);
  const [lastRefreshed, setLastRefreshed] = useState<string>("");

  async function load() {
    setLoading(true);
    try {
      const data = await getVerifyNowUsage();
      setTotals(data.totals);
      setByService(data.byService);
      setByTenant(data.byTenant);
      setRecentLog(data.recentLog);
      setLastRefreshed(new Date().toLocaleTimeString("en-ZA"));
    } catch {
      showToast("info", "VerifyNow monitoring", "No usage data yet — make your first API call to start tracking.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  return (
    <section className="integrations-shell" style={{ marginBottom: 20 }}>
      <div className="panel-head">
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <Shield size={18} style={{ color: "var(--green)" }} />
          <div>
            <p className="eyebrow">Super admin only</p>
            <h3>VerifyNow SA — Credit usage monitoring</h3>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {lastRefreshed && <span style={{ fontSize: "0.78rem", color: "var(--muted)" }}>Refreshed {lastRefreshed}</span>}
          <button className="ghost small" onClick={load} disabled={loading}>
            <RefreshCw size={13} style={loading ? { animation: "spin 1s linear infinite" } : undefined} />
            {loading ? "Loading..." : "Refresh"}
          </button>
        </div>
      </div>

      {/* Note: VerifyNow has no dedicated balance/credit endpoint */}
      <div style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "10px 14px", background: "var(--blue-bg)", border: "1px solid rgba(40,87,154,0.18)", borderRadius: 8, marginBottom: 18, fontSize: "0.85rem", color: "var(--muted)" }}>
        <AlertTriangle size={15} style={{ color: "var(--blue)", flexShrink: 0, marginTop: 1 }} />
        <span>
          VerifyNow does not expose a credit balance endpoint. Credits consumed are reported per-response
          and tracked here by LawPath. <strong style={{ color: "var(--ink)" }}>Contact VerifyNow directly</strong> to top up your credit balance.
        </span>
      </div>

      {/* KPI metrics */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: 14, marginBottom: 20 }}>
        {[
          { label: "Credits today",    value: fmtCredits(totals?.credits_today),  icon: <Zap size={15} />,         accent: "var(--gold)" },
          { label: "Credits this week", value: fmtCredits(totals?.credits_7d),    icon: <TrendingUp size={15} />,  accent: "var(--green)" },
          { label: "Credits 30 days",  value: fmtCredits(totals?.credits_30d),    icon: <TrendingUp size={15} />,  accent: "var(--green)" },
          { label: "Total calls",      value: Number(totals?.total_calls || 0).toLocaleString("en-ZA"), icon: <CheckCircle2 size={15} />, accent: "var(--blue)" },
          { label: "Errors",           value: Number(totals?.error_calls || 0).toLocaleString("en-ZA"), icon: <AlertTriangle size={15} />, accent: "var(--rose)" },
          { label: "Avg latency",      value: totals?.avg_latency_ms ? `${totals.avg_latency_ms}ms` : "—", icon: <Clock size={15} />, accent: "var(--muted)" },
        ].map(({ label, value, icon, accent }) => (
          <div key={label} style={{ padding: "14px 16px", border: "1px solid var(--line)", borderRadius: 10, background: "var(--panel)", boxShadow: "var(--shadow-sm)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8, color: accent }}>{icon}<span style={{ fontSize: "0.78rem", fontWeight: 600, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.06em" }}>{label}</span></div>
            <strong style={{ fontSize: "1.5rem", fontWeight: 800, color: "var(--ink)", fontVariantNumeric: "tabular-nums", letterSpacing: "-0.025em" }}>{value}</strong>
          </div>
        ))}
      </div>

      {/* Per-service breakdown */}
      {byService.length > 0 && (
        <div style={{ marginBottom: 20 }}>
          <p style={{ fontSize: "0.82rem", fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 10 }}>Credits by service</p>
          <div style={{ display: "grid", gap: 4 }}>
            {byService.map(s => {
              const maxCredits = Math.max(...byService.map(x => Number(x.credits) || 0));
              const pct = maxCredits > 0 ? Math.round((Number(s.credits) / maxCredits) * 100) : 0;
              return (
                <div key={s.service} style={{ display: "grid", gridTemplateColumns: "160px 1fr 100px 70px 60px", gap: 12, alignItems: "center", padding: "9px 14px", background: "var(--surface)", borderRadius: 7, fontSize: "0.85rem" }}>
                  <span style={{ fontWeight: 600, color: "var(--ink)" }}>{SERVICE_LABELS[s.service] || s.service}</span>
                  <div style={{ height: 8, background: "var(--line)", borderRadius: 999, overflow: "hidden" }}>
                    <div style={{ height: "100%", width: `${pct}%`, background: "var(--green)", borderRadius: 999, transition: "width 0.4s ease" }} />
                  </div>
                  <span style={{ color: "var(--muted)", textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{fmtCredits(s.credits)} cr</span>
                  <span style={{ color: "var(--muted)", textAlign: "right" }}>{Number(s.calls).toLocaleString("en-ZA")} calls</span>
                  <span style={{ color: Number(s.errors) > 0 ? "var(--rose)" : "var(--muted)", textAlign: "right" }}>
                    {Number(s.errors) > 0 ? `${s.errors} err` : "—"}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Per-tenant breakdown (30 days) */}
      {byTenant.length > 0 && (
        <div style={{ marginBottom: 20 }}>
          <p style={{ fontSize: "0.82rem", fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 10 }}>Credits by tenant (last 30 days)</p>
          <div style={{ display: "grid", gap: 4 }}>
            {byTenant.map(t => (
              <div key={t.tenant_id || "platform"} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 14px", background: "var(--surface)", borderRadius: 7, fontSize: "0.85rem" }}>
                <span style={{ fontWeight: 600, color: "var(--ink)" }}>{t.tenant_name || "Platform (no tenant)"}</span>
                <div style={{ display: "flex", gap: 20 }}>
                  <span style={{ color: "var(--muted)" }}>{Number(t.calls).toLocaleString("en-ZA")} calls</span>
                  <span style={{ fontWeight: 700, color: "var(--green)", fontVariantNumeric: "tabular-nums" }}>{fmtCredits(t.credits)} credits</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Recent log */}
      {recentLog.length > 0 && (
        <div>
          <p style={{ fontSize: "0.82rem", fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 10 }}>Recent calls (last 50)</p>
          <div style={{ overflowX: "auto" }}>
            <div style={{ display: "grid", gap: 2, minWidth: 680 }}>
              <div style={{ display: "grid", gridTemplateColumns: "140px 160px 130px 90px 70px 90px", gap: 10, padding: "7px 12px", background: "var(--green-light)", borderRadius: 6, fontSize: "0.78rem", fontWeight: 700, color: "var(--green)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                <span>Time</span><span>Service</span><span>Tenant</span><span>Credits</span><span>Latency</span><span>Status</span>
              </div>
              {recentLog.map(entry => (
                <div key={entry.id} style={{ display: "grid", gridTemplateColumns: "140px 160px 130px 90px 70px 90px", gap: 10, padding: "8px 12px", background: "var(--surface)", borderRadius: 6, fontSize: "0.83rem", alignItems: "center" }}>
                  <span style={{ color: "var(--muted)" }}>{new Date(entry.created_at).toLocaleString("en-ZA", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}</span>
                  <span style={{ fontWeight: 600, color: "var(--ink)" }}>{SERVICE_LABELS[entry.service] || entry.service}</span>
                  <span style={{ color: "var(--muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{entry.tenant_name || "—"}</span>
                  <span style={{ fontVariantNumeric: "tabular-nums", fontWeight: 600 }}>{fmtCredits(entry.credits_spent)}</span>
                  <span style={{ color: "var(--muted)" }}>{entry.latency_ms ? `${entry.latency_ms}ms` : "—"}</span>
                  <span style={{ color: entry.status === "success" ? "var(--green)" : "var(--rose)", fontWeight: 700, fontSize: "0.78rem" }}>
                    {entry.status === "success" ? "✓ OK" : `✗ ${entry.error_code || "ERR"}`}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {!loading && recentLog.length === 0 && (
        <div style={{ textAlign: "center", padding: "28px 20px", color: "var(--muted)" }}>
          <Shield size={32} style={{ marginBottom: 10, opacity: 0.4 }} />
          <p style={{ margin: 0 }}>No VerifyNow calls yet. Add your API key above and make the first check.</p>
        </div>
      )}
    </section>
  );
}
