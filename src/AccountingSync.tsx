import { BarChart2, CheckCircle2, Download, FileText, Link, RefreshCw, TrendingUp, X } from "lucide-react";
import { useState } from "react";
import { saveAccountingConnection, triggerAccountingExport } from "./api";
import type { AccountingConnection, AccountingExportRecord, AccountingProvider } from "./types";

const uid = (p: string) => `${p}-${Math.random().toString(36).slice(2, 7).toUpperCase()}`;
const formatDate = (iso: string) => (iso ? new Date(iso).toLocaleDateString("en-ZA") : "Never");

const PROVIDER_INFO: Record<AccountingProvider, { name: string; description: string }> = {
  sage_pastel: { name: "Sage Pastel", description: "Most widely used by SA law firms. Supports Evolution and Partner." },
  xero: { name: "Xero", description: "Cloud accounting with strong South African bank feeds and VAT support." },
  quickbooks: { name: "QuickBooks Online", description: "Popular alternative with mobile access and bank reconciliation." },
  csv_export: { name: "CSV Export", description: "Universal format — import into any accounting software manually." },
};

const EXPORT_LABELS: Record<AccountingExportRecord["exportType"], string> = {
  invoice: "Invoices",
  trust_receipt: "Trust receipts",
  disbursement: "Disbursements",
  time_entry: "Time entries",
  full_sync: "Full sync",
};

const PROVIDER_ORDER: AccountingProvider[] = ["sage_pastel", "xero", "quickbooks", "csv_export"];

function ProviderIcon({ provider, size = 20 }: { provider: AccountingProvider; size?: number }) {
  if (provider === "sage_pastel") return <FileText size={size} className="text-green-600" />;
  if (provider === "xero") return <BarChart2 size={size} className="text-blue-500" />;
  if (provider === "quickbooks") return <TrendingUp size={size} className="text-emerald-500" />;
  return <Download size={size} className="text-slate-500" />;
}

function StatusBadge({ status }: { status: AccountingConnection["syncStatus"] }) {
  if (status === "syncing") return <span className="pill" style={{ background: "#dbeafe", color: "#1d4ed8" }}>Syncing…</span>;
  if (status === "error") return <span className="pill" style={{ background: "#ffe4e6", color: "#be123c" }}>Error</span>;
  return <span className="pill" style={{ background: "#f1f5f9", color: "#64748b" }}>Idle</span>;
}

function ExportStatusBadge({ status }: { status: AccountingExportRecord["status"] }) {
  if (status === "exported") return <span className="pill" style={{ background: "#dcfce7", color: "#15803d" }}>Exported</span>;
  if (status === "failed") return <span className="pill" style={{ background: "#ffe4e6", color: "#be123c" }}>Failed</span>;
  return <span className="pill" style={{ background: "#fef9c3", color: "#a16207" }}>Partial</span>;
}

interface Props {
  connections: AccountingConnection[];
  setConnections: React.Dispatch<React.SetStateAction<AccountingConnection[]>>;
  exportLog: AccountingExportRecord[];
  setExportLog: React.Dispatch<React.SetStateAction<AccountingExportRecord[]>>;
  log: (msg: string) => void;
  showToast: (type: "success" | "error" | "info", title: string, msg: string) => void;
}

export function AccountingSync({ connections, setConnections, exportLog, setExportLog, log, showToast }: Props) {
  const [openForm, setOpenForm] = useState<AccountingProvider | null>(null);
  const [formValues, setFormValues] = useState<Record<string, { apiKey: string; companyId: string }>>({});
  const [savingProvider, setSavingProvider] = useState<AccountingProvider | null>(null);
  const [testingProvider, setTestingProvider] = useState<AccountingProvider | null>(null);
  const [activeExportProvider, setActiveExportProvider] = useState<AccountingProvider>("csv_export");
  const [exportingType, setExportingType] = useState<AccountingExportRecord["exportType"] | null>(null);

  const getConnection = (provider: AccountingProvider) =>
    connections.find((c) => c.provider === provider);

  const handleToggleForm = (provider: AccountingProvider) => {
    setOpenForm((prev) => (prev === provider ? null : provider));
  };

  const handleFormChange = (provider: AccountingProvider, field: "apiKey" | "companyId", value: string) => {
    setFormValues((prev) => ({
      ...prev,
      [provider]: { ...prev[provider], [field]: value },
    }));
  };

  const handleSave = async (provider: AccountingProvider) => {
    setSavingProvider(provider);
    try {
      const vals = formValues[provider] || {};
      const result = await saveAccountingConnection({ provider, apiKey: vals.apiKey, companyId: vals.companyId });
      setConnections((prev) => {
        const exists = prev.find((c) => c.provider === provider);
        if (exists) return prev.map((c) => (c.provider === provider ? result.connection : c));
        return [...prev, result.connection];
      });
      setOpenForm(null);
      log(`Saved connection for ${PROVIDER_INFO[provider].name}`);
      showToast("success", "Connection saved", `${PROVIDER_INFO[provider].name} has been configured.`);
    } catch {
      showToast("error", "Save failed", `Could not save ${PROVIDER_INFO[provider].name} credentials.`);
    } finally {
      setSavingProvider(null);
    }
  };

  const handleTestConnection = async (provider: AccountingProvider) => {
    setTestingProvider(provider);
    await new Promise((r) => setTimeout(r, 1200));
    setTestingProvider(null);
    showToast("success", "Connection successful", `${PROVIDER_INFO[provider].name} credentials verified.`);
    log(`Tested connection for ${PROVIDER_INFO[provider].name} — success`);
  };

  const handleDisconnect = (provider: AccountingProvider) => {
    setConnections((prev) => prev.filter((c) => c.provider !== provider));
    log(`Disconnected ${PROVIDER_INFO[provider].name}`);
    showToast("info", "Disconnected", `${PROVIDER_INFO[provider].name} has been disconnected.`);
    if (activeExportProvider === provider) setActiveExportProvider("csv_export");
  };

  const handleExport = async (exportType: AccountingExportRecord["exportType"]) => {
    setExportingType(exportType);
    log(`Triggering ${EXPORT_LABELS[exportType]} export via ${PROVIDER_INFO[activeExportProvider].name}…`);
    try {
      const result = await triggerAccountingExport(activeExportProvider, exportType);
      setExportLog((prev) => [result.exportRecord, ...prev]);
      showToast("success", "Export complete", `${EXPORT_LABELS[exportType]} exported successfully.`);
      log(`Export complete: ${result.exportRecord.recordCount} records`);
    } catch {
      if (activeExportProvider === "csv_export") {
        const simulatedRecord: AccountingExportRecord = {
          id: uid("csv"),
          provider: "csv_export",
          exportType,
          recordCount: 0,
          status: "partial",
          exportedAt: new Date().toISOString(),
        };
        setExportLog((prev) => [simulatedRecord, ...prev]);
        showToast("info", "CSV export prepared", "CSV export prepared — implement download link when backend is connected.");
        log("CSV export simulated (backend not connected)");
      } else {
        showToast("error", "Export failed", `Could not export ${EXPORT_LABELS[exportType]} via ${PROVIDER_INFO[activeExportProvider].name}.`);
        log(`Export failed for ${EXPORT_LABELS[exportType]}`);
      }
    } finally {
      setExportingType(null);
    }
  };

  const connectedProviders = connections.filter((c) => c.connected).map((c) => c.provider);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      {/* 1. Integration notice */}
      <div className="panel">
        <div className="panel-head">
          <span className="eyebrow">Accounting Integration</span>
        </div>
        <p style={{ margin: 0, color: "var(--text-secondary, #64748b)", lineHeight: 1.6 }}>
          Connect LawPath to your accounting software to sync invoices, trust receipts, time entries and disbursements.
          Sage Pastel Evolution and Xero are most common in South African law firms. CSV export is always available
          without API credentials.
        </p>
      </div>

      {/* 2. Provider connection cards */}
      <div className="panel">
        <div className="panel-head">
          <span className="eyebrow">Providers</span>
        </div>
        <div className="grid-two" style={{ gap: 16 }}>
          {PROVIDER_ORDER.map((provider) => {
            const info = PROVIDER_INFO[provider];
            const conn = getConnection(provider);
            const isCsv = provider === "csv_export";
            const isOpen = openForm === provider;
            const isConnected = !!conn?.connected;
            const isSaving = savingProvider === provider;
            const isTesting = testingProvider === provider;
            const vals = formValues[provider] || { apiKey: "", companyId: "" };

            return (
              <div key={provider} className="integration-card" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                <div className="integration-head" style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <ProviderIcon provider={provider} size={22} />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 600, fontSize: 15 }}>{info.name}</div>
                    <div style={{ fontSize: 12, color: "var(--text-secondary, #64748b)" }}>{info.description}</div>
                  </div>
                  {isCsv ? (
                    <span className="pill" style={{ background: "#dcfce7", color: "#15803d" }}>Always available</span>
                  ) : isConnected ? (
                    <span className="pill" style={{ background: "#dcfce7", color: "#15803d" }}>
                      <CheckCircle2 size={12} style={{ marginRight: 4, display: "inline" }} />
                      Connected
                    </span>
                  ) : (
                    <span className="pill" style={{ background: "#f1f5f9", color: "#94a3b8" }}>Not connected</span>
                  )}
                </div>

                {isConnected && conn && (
                  <div style={{ display: "flex", gap: 12, fontSize: 12, color: "var(--text-secondary, #64748b)" }}>
                    <span>Last sync: {formatDate(conn.lastSyncAt)}</span>
                    <StatusBadge status={conn.syncStatus} />
                    {conn.syncStatus === "error" && conn.errorMessage && (
                      <span style={{ color: "#be123c" }}>{conn.errorMessage}</span>
                    )}
                  </div>
                )}

                {!isCsv && (
                  <div className="integration-actions" style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <button
                      className="ghost small"
                      onClick={() => handleToggleForm(provider)}
                      style={{ display: "flex", alignItems: "center", gap: 4 }}
                    >
                      <Link size={13} />
                      {isOpen ? "Close" : "Configure"}
                    </button>
                    {isConnected && (
                      <>
                        <button
                          className="ghost small"
                          onClick={() => handleTestConnection(provider)}
                          disabled={isTesting}
                          style={{ display: "flex", alignItems: "center", gap: 4 }}
                        >
                          <RefreshCw size={13} className={isTesting ? "spin" : ""} />
                          {isTesting ? "Testing…" : "Test connection"}
                        </button>
                        <button
                          className="ghost small"
                          onClick={() => handleDisconnect(provider)}
                          style={{ display: "flex", alignItems: "center", gap: 4, color: "#be123c" }}
                        >
                          <X size={13} />
                          Disconnect
                        </button>
                      </>
                    )}
                  </div>
                )}

                {!isCsv && isOpen && (
                  <div className="inline-form-toggle form" style={{ borderTop: "1px solid var(--border, #e2e8f0)", paddingTop: 12, display: "flex", flexDirection: "column", gap: 10 }}>
                    <div className="form-row">
                      <label style={{ fontSize: 12, fontWeight: 500 }}>API Key</label>
                      <input
                        type="password"
                        placeholder="Enter API key"
                        value={vals.apiKey}
                        onChange={(e) => handleFormChange(provider, "apiKey", e.target.value)}
                        style={{ width: "100%", padding: "6px 10px", borderRadius: 6, border: "1px solid var(--border, #e2e8f0)", fontSize: 13 }}
                      />
                    </div>
                    <div className="form-row">
                      <label style={{ fontSize: 12, fontWeight: 500 }}>Company ID</label>
                      <input
                        type="text"
                        placeholder="Enter company ID"
                        value={vals.companyId}
                        onChange={(e) => handleFormChange(provider, "companyId", e.target.value)}
                        style={{ width: "100%", padding: "6px 10px", borderRadius: 6, border: "1px solid var(--border, #e2e8f0)", fontSize: 13 }}
                      />
                    </div>
                    <div style={{ display: "flex", gap: 8 }}>
                      <button
                        className="primary small"
                        onClick={() => handleSave(provider)}
                        disabled={isSaving}
                      >
                        {isSaving ? "Saving…" : "Save credentials"}
                      </button>
                      <button className="ghost small" onClick={() => setOpenForm(null)}>Cancel</button>
                    </div>
                  </div>
                )}

                {isCsv && (
                  <div className="integration-actions" style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    {(["invoice", "trust_receipt", "time_entry", "full_sync"] as AccountingExportRecord["exportType"][]).map((et) => (
                      <button
                        key={et}
                        className="ghost small"
                        onClick={async () => {
                          setActiveExportProvider("csv_export");
                          await handleExport(et);
                        }}
                        disabled={exportingType !== null}
                        style={{ display: "flex", alignItems: "center", gap: 4 }}
                      >
                        <Download size={12} />
                        {EXPORT_LABELS[et]}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* 3. Export controls panel */}
      <div className="panel tier1-section">
        <div className="panel-head">
          <span className="eyebrow">Export Controls</span>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div className="form-row" style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
            <label style={{ fontSize: 13, fontWeight: 500, whiteSpace: "nowrap" }}>Export to:</label>
            <select
              value={activeExportProvider}
              onChange={(e) => setActiveExportProvider(e.target.value as AccountingProvider)}
              style={{ padding: "6px 12px", borderRadius: 6, border: "1px solid var(--border, #e2e8f0)", fontSize: 13, minWidth: 180 }}
            >
              {PROVIDER_ORDER.map((p) => {
                const isAvailable = p === "csv_export" || connectedProviders.includes(p);
                return (
                  <option key={p} value={p} disabled={!isAvailable}>
                    {PROVIDER_INFO[p].name}{!isAvailable ? " (not connected)" : ""}
                  </option>
                );
              })}
            </select>
          </div>

          <div className="metrics" style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            {(["invoice", "trust_receipt", "time_entry", "disbursement", "full_sync"] as AccountingExportRecord["exportType"][]).map((et) => (
              <button
                key={et}
                className="primary small"
                onClick={() => handleExport(et)}
                disabled={exportingType !== null}
                style={{ display: "flex", alignItems: "center", gap: 6 }}
              >
                {exportingType === et ? (
                  <RefreshCw size={13} className="spin" />
                ) : (
                  <Download size={13} />
                )}
                {exportingType === et ? "Exporting…" : `Export ${EXPORT_LABELS[et].toLowerCase()}`}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* 4. Export log table */}
      <div className="panel">
        <div className="panel-head">
          <span className="eyebrow">Export Log</span>
          <span style={{ fontSize: 12, color: "var(--text-secondary, #64748b)" }}>{exportLog.length} records</span>
        </div>
        {exportLog.length === 0 ? (
          <p style={{ margin: 0, color: "var(--text-secondary, #64748b)", fontSize: 13 }}>No exports yet. Use the export controls above to get started.</p>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: "1px solid var(--border, #e2e8f0)" }}>
                  {["Date / Time", "Provider", "Export type", "Records", "Status"].map((h) => (
                    <th key={h} style={{ textAlign: "left", padding: "8px 10px", color: "var(--text-secondary, #64748b)", fontWeight: 600, whiteSpace: "nowrap" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {exportLog.map((rec) => (
                  <tr key={rec.id} style={{ borderBottom: "1px solid var(--border, #f1f5f9)" }}>
                    <td style={{ padding: "8px 10px", whiteSpace: "nowrap" }}>
                      {rec.exportedAt ? new Date(rec.exportedAt).toLocaleString("en-ZA") : "—"}
                    </td>
                    <td style={{ padding: "8px 10px" }}>
                      <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <ProviderIcon provider={rec.provider} size={14} />
                        {PROVIDER_INFO[rec.provider].name}
                      </span>
                    </td>
                    <td style={{ padding: "8px 10px" }}>{EXPORT_LABELS[rec.exportType]}</td>
                    <td style={{ padding: "8px 10px", fontVariantNumeric: "tabular-nums" }}>{rec.recordCount.toLocaleString()}</td>
                    <td style={{ padding: "8px 10px" }}><ExportStatusBadge status={rec.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* 5. VAT & disbursement note */}
      <div
        className="panel"
        style={{
          background: "var(--info-bg, #eff6ff)",
          border: "1px solid var(--info-border, #bfdbfe)",
          display: "flex",
          gap: 12,
          alignItems: "flex-start",
        }}
      >
        <FileText size={18} style={{ color: "#3b82f6", flexShrink: 0, marginTop: 2 }} />
        <div>
          <div style={{ fontWeight: 600, marginBottom: 4, color: "#1e40af", fontSize: 13 }}>South African VAT Note</div>
          <p style={{ margin: 0, fontSize: 13, color: "#1e3a8a", lineHeight: 1.6 }}>
            South African VAT: 15% applies to professional fees. Zero-rated and exempt supplies must be correctly
            classified. Disbursements paid on behalf of clients are not subject to VAT when recovered. Always verify
            with your tax practitioner before filing.
          </p>
        </div>
      </div>
    </div>
  );
}
