import { useEffect, useMemo, useState } from "react";
import { Building2, AlertTriangle, RefreshCw, TrendingUp, Users } from "lucide-react";
import { getTenantsOverview } from "./api";
import type { TenantOverviewRow, TenantsOverviewTotals } from "./types";

type SortKey =
  | "company_name" | "plan" | "user_count" | "matter_count"
  | "ai_calls_30d" | "lightstone_calls_30d" | "verifynow_credits_30d"
  | "last_activity_at" | "created_at";

const planClass = (plan: string | null) => {
  const p = (plan || "trial").toLowerCase();
  if (p === "firm" || p === "enterprise") return "pill plan-firm";
  if (p === "practice") return "pill plan-practice";
  if (p === "solo") return "pill plan-solo";
  return "pill plan-trial";
};

const statusClass = (status: string | null) => {
  const s = (status || "").toLowerCase();
  if (s === "active") return "pill inv-paid";
  if (s === "trial" || s === "trialing") return "pill inv-sent";
  if (s === "suspended") return "pill inv-overdue";
  if (s === "cancelled") return "pill inv-void";
  return "pill inv-draft";
};

function fmtNum(n: number | string | null | undefined) {
  const v = typeof n === "string" ? Number(n) : n;
  if (v == null || isNaN(v)) return "0";
  return v.toLocaleString("en-ZA");
}

function fmtDate(iso: string | null) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-ZA");
}

function fmtRelative(iso: string | null) {
  if (!iso) return "Never";
  const t = new Date(iso).getTime();
  if (!t || t < new Date("1971-01-01").getTime()) return "Never";
  const diff = Date.now() - t;
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d ago`;
  return fmtDate(iso);
}

interface Props {
  log: (msg: string) => void;
  showToast: (type: "success" | "error" | "info", title: string, msg: string) => void;
}

export function SuperTenants({ log, showToast }: Props) {
  const [rows, setRows] = useState<TenantOverviewRow[]>([]);
  const [totals, setTotals] = useState<TenantsOverviewTotals | null>(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("last_activity_at");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [refreshing, setRefreshing] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const load = async () => {
    try {
      setRefreshing(true);
      const data = await getTenantsOverview();
      setRows(data.tenants);
      setTotals(data.totals);
      log(`Loaded ${data.tenants.length} tenants for overview.`);
    } catch (err: any) {
      showToast("error", "Failed to load tenants", err?.message || "Unknown error");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, []);

  const sortedRows = useMemo(() => {
    const filtered = filter.trim()
      ? rows.filter(r => (r.company_name + " " + r.slug + " " + (r.plan || "")).toLowerCase().includes(filter.toLowerCase()))
      : rows;
    const dir = sortDir === "asc" ? 1 : -1;
    return [...filtered].sort((a, b) => {
      const av = (a as any)[sortKey];
      const bv = (b as any)[sortKey];
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      if (typeof av === "number" && typeof bv === "number") return (av - bv) * dir;
      return String(av).localeCompare(String(bv)) * dir;
    });
  }, [rows, filter, sortKey, sortDir]);

  const toggleSort = (k: SortKey) => {
    if (sortKey === k) setSortDir(sortDir === "asc" ? "desc" : "asc");
    else { setSortKey(k); setSortDir("desc"); }
  };

  const sortIndicator = (k: SortKey) => sortKey === k ? (sortDir === "asc" ? " ↑" : " ↓") : "";

  if (loading) {
    return (
      <section className="panel">
        <header className="panel-head">
          <h2><Building2 size={20} /> Tenants overview</h2>
        </header>
        <div className="panel-body"><p className="muted">Loading tenant data…</p></div>
      </section>
    );
  }

  return (
    <>
      <section className="metric-row">
        <article className="metric">
          <h3>Total tenants</h3>
          <strong>{fmtNum(totals?.tenant_count)}</strong>
          <small>{fmtNum(totals?.active_tenants)} active · {fmtNum(totals?.trial_tenants)} trial</small>
        </article>
        <article className="metric">
          <h3>AI calls (30d)</h3>
          <strong>{fmtNum(totals?.ai_calls_30d)}</strong>
          <small>Across all tenants</small>
        </article>
        <article className="metric">
          <h3>Lightstone calls (30d)</h3>
          <strong>{fmtNum(totals?.lightstone_calls_30d)}</strong>
          <small>Property API usage</small>
        </article>
        <article className="metric">
          <h3>VerifyNow (30d)</h3>
          <strong>{fmtNum(totals?.verifynow_calls_30d)}</strong>
          <small>Searchwork360 ID/CIPC/AML</small>
        </article>
      </section>

      <section className="panel">
        <header className="panel-head">
          <h2><Building2 size={20} /> Tenants</h2>
          <div className="panel-head-actions">
            <input
              type="search"
              className="search-input"
              placeholder="Filter by name, slug, plan…"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              style={{ minWidth: 220 }}
            />
            <button className="ghost small" onClick={load} disabled={refreshing}>
              <RefreshCw size={14} /> {refreshing ? "Refreshing…" : "Refresh"}
            </button>
          </div>
        </header>
        <div className="panel-body">
          {sortedRows.length === 0 ? (
            <p className="muted">No tenants match the current filter.</p>
          ) : (
            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th onClick={() => toggleSort("company_name")} style={{ cursor: "pointer" }}>Tenant{sortIndicator("company_name")}</th>
                    <th onClick={() => toggleSort("plan")} style={{ cursor: "pointer" }}>Plan{sortIndicator("plan")}</th>
                    <th>Status</th>
                    <th onClick={() => toggleSort("user_count")} style={{ cursor: "pointer", textAlign: "right" }}>Users{sortIndicator("user_count")}</th>
                    <th onClick={() => toggleSort("matter_count")} style={{ cursor: "pointer", textAlign: "right" }}>Matters{sortIndicator("matter_count")}</th>
                    <th onClick={() => toggleSort("ai_calls_30d")} style={{ cursor: "pointer", textAlign: "right" }}>AI 30d{sortIndicator("ai_calls_30d")}</th>
                    <th onClick={() => toggleSort("lightstone_calls_30d")} style={{ cursor: "pointer", textAlign: "right" }}>Lightstone 30d{sortIndicator("lightstone_calls_30d")}</th>
                    <th onClick={() => toggleSort("verifynow_credits_30d")} style={{ cursor: "pointer", textAlign: "right" }}>VerifyNow 30d{sortIndicator("verifynow_credits_30d")}</th>
                    <th onClick={() => toggleSort("last_activity_at")} style={{ cursor: "pointer" }}>Last activity{sortIndicator("last_activity_at")}</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedRows.map((r) => {
                    const isExpanded = expandedId === r.id;
                    const hasErrors = r.ai_errors_30d > 0 || r.lightstone_errors_30d > 0 || r.verifynow_errors_30d > 0;
                    return (
                      <>
                        <tr key={r.id} onClick={() => setExpandedId(isExpanded ? null : r.id)} style={{ cursor: "pointer" }}>
                          <td>
                            <div style={{ display: "flex", flexDirection: "column" }}>
                              <strong>{r.company_name}</strong>
                              <small className="muted">{r.slug}</small>
                            </div>
                          </td>
                          <td><span className={planClass(r.plan)}>{r.plan || "trial"}</span></td>
                          <td><span className={statusClass(r.plan_status || r.status)}>{r.plan_status || r.status}</span></td>
                          <td style={{ textAlign: "right" }}>{fmtNum(r.user_count)}</td>
                          <td style={{ textAlign: "right" }}>{fmtNum(r.matter_count)}</td>
                          <td style={{ textAlign: "right" }}>
                            {fmtNum(r.ai_calls_30d)}
                            {r.ai_errors_30d > 0 && <span className="pill inv-overdue" style={{ marginLeft: 6 }}>{r.ai_errors_30d} err</span>}
                          </td>
                          <td style={{ textAlign: "right" }}>{fmtNum(r.lightstone_calls_30d)}</td>
                          <td style={{ textAlign: "right" }}>
                            {fmtNum(r.verifynow_calls_30d)}
                            {r.verifynow_credits_30d > 0 && <small className="muted" style={{ marginLeft: 6 }}>({fmtNum(r.verifynow_credits_30d)} cr)</small>}
                          </td>
                          <td>
                            <small>{fmtRelative(r.last_activity_at)}</small>
                            {hasErrors && <AlertTriangle size={14} style={{ color: "var(--rose)", marginLeft: 6, verticalAlign: "middle" }} />}
                          </td>
                        </tr>
                        {isExpanded && (
                          <tr className="row-detail">
                            <td colSpan={9}>
                              <div className="tenant-detail-grid">
                                <div>
                                  <strong>Account</strong>
                                  <dl>
                                    <dt>Tenant ID</dt><dd><code>{r.id}</code></dd>
                                    <dt>Slug</dt><dd>{r.slug}</dd>
                                    <dt>Created</dt><dd>{fmtDate(r.created_at)}</dd>
                                    <dt>Trial ends</dt><dd>{fmtDate(r.trial_ends_at)}</dd>
                                  </dl>
                                </div>
                                <div>
                                  <strong>AI usage</strong>
                                  <dl>
                                    <dt>Calls (30d)</dt><dd>{fmtNum(r.ai_calls_30d)}</dd>
                                    <dt>Errors (30d)</dt><dd>{fmtNum(r.ai_errors_30d)}</dd>
                                    <dt>Chars (30d)</dt><dd>{fmtNum(r.ai_chars_30d)}</dd>
                                    <dt>Calls (all time)</dt><dd>{fmtNum(r.ai_calls_total)}</dd>
                                  </dl>
                                </div>
                                <div>
                                  <strong>External APIs</strong>
                                  <dl>
                                    <dt>Lightstone (30d)</dt><dd>{fmtNum(r.lightstone_calls_30d)} calls, {fmtNum(r.lightstone_errors_30d)} errors</dd>
                                    <dt>VerifyNow (30d)</dt><dd>{fmtNum(r.verifynow_calls_30d)} calls, {fmtNum(r.verifynow_credits_30d)} credits, {fmtNum(r.verifynow_errors_30d)} errors</dd>
                                  </dl>
                                </div>
                                <div>
                                  <strong>Workspace</strong>
                                  <dl>
                                    <dt>Active users</dt><dd><Users size={12} style={{ verticalAlign: "middle" }} /> {fmtNum(r.user_count)}</dd>
                                    <dt>Matters</dt><dd><TrendingUp size={12} style={{ verticalAlign: "middle" }} /> {fmtNum(r.matter_count)}</dd>
                                    <dt>Last activity</dt><dd>{fmtRelative(r.last_activity_at)}</dd>
                                  </dl>
                                </div>
                              </div>
                            </td>
                          </tr>
                        )}
                      </>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </section>
    </>
  );
}
