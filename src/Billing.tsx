import { ChevronDown, ChevronUp, Printer, Settings2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { createInvoice, downloadInvoicePdf, getInvoicePdfUrl, getInvoices, recordInvoicePayment, saveTenantProfile, sendInvoiceByEmail, syncInvoiceToAccounting, updateInvoice } from "./api";
import type { InvoiceHeaderField, Invoice, InvoicePayment, TenantProfile, TimeEntry } from "./types";

interface Props {
  entries: TimeEntry[];
  setEntries: React.Dispatch<React.SetStateAction<TimeEntry[]>>;
  pendingWipIds: string[];
  onClearPendingWip: () => void;
  tenantProfile: TenantProfile;
  setTenantProfile: React.Dispatch<React.SetStateAction<TenantProfile>>;
  log: (msg: string) => void;
  showToast: (type: "success" | "error" | "info", title: string, msg: string) => void;
  setActiveView: (view: string) => void;
}

const ALL_HEADER_FIELDS: { key: InvoiceHeaderField; label: string }[] = [
  { key: "address", label: "Address" },
  { key: "phone", label: "Phone" },
  { key: "website", label: "Website" },
  { key: "vatNumber", label: "VAT number" },
  { key: "lpcNumber", label: "LPC registration" },
];

type FilterTab = "All" | Invoice["status"];
const TABS: FilterTab[] = ["All", "Draft", "Sent", "Part-paid", "Overdue", "Paid", "Void"];
const PAY_METHODS: InvoicePayment["paymentMethod"][] = ["EFT", "Cash", "Card", "Cheque", "Trust transfer", "Other"];

function rands(cents: number) {
  return `R ${(cents / 100).toLocaleString("en-ZA", { minimumFractionDigits: 2 })}`;
}

function statusPillClass(s: Invoice["status"]) {
  if (s === "Paid") return "pill inv-paid";
  if (s === "Overdue") return "pill inv-overdue";
  if (s === "Part-paid") return "pill inv-part-paid";
  if (s === "Sent") return "pill inv-sent";
  if (s === "Void") return "pill inv-void";
  return "pill inv-draft";
}

function fmtDate(iso: string) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-ZA");
}

const EMPTY_PAY = {
  amountCents: "",
  paymentDate: new Date().toISOString().slice(0, 10),
  paymentMethod: "EFT" as InvoicePayment["paymentMethod"],
  reference: "",
  notes: "",
};

const EMPTY_DRAFT = {
  clientName: "",
  clientEmail: "",
  matterRef: "",
  dueAt: "",
  notes: "",
  terms: "Payment due within 30 days of invoice date.",
};

export function Billing({ entries, setEntries, pendingWipIds, onClearPendingWip, tenantProfile, setTenantProfile, log, showToast, setActiveView }: Props) {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<FilterTab>("All");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [emailTarget, setEmailTarget] = useState<string | null>(null);
  const [syncingId, setSyncingId] = useState<string | null>(null);
  const [pdfLoadingId, setPdfLoadingId] = useState<string | null>(null);
  const [pdfDownloadingId, setPdfDownloadingId] = useState<string | null>(null);

  const [createWipIds, setCreateWipIds] = useState<string[]>([]);
  const [createDraft, setCreateDraft] = useState(EMPTY_DRAFT);
  const [creating, setCreating] = useState(false);

  const [payingId, setPayingId] = useState<string | null>(null);
  const [payForm, setPayForm] = useState(EMPTY_PAY);
  const [paySubmitting, setPaySubmitting] = useState(false);

  const [emailForm, setEmailForm] = useState({ toEmail: "", toName: "", message: "" });
  const [emailSending, setEmailSending] = useState(false);

  const [printingId, setPrintingId] = useState<string | null>(null);

  const [showHeaderSettings, setShowHeaderSettings] = useState(false);
  const [headerFieldsDraft, setHeaderFieldsDraft] = useState<InvoiceHeaderField[]>([]);
  const [headerSettingsSaving, setHeaderSettingsSaving] = useState(false);

  const didInitPending = useRef(false);
  const headerModalRef = useRef<HTMLDivElement>(null);
  const headerModalScrollPos = useRef(0);
  const createModalRef = useRef<HTMLDivElement>(null);
  const createModalScrollPos = useRef(0);
  const emailModalRef = useRef<HTMLDivElement>(null);
  const emailModalScrollPos = useRef(0);
  const payFormRef = useRef<HTMLDivElement>(null);
  const payFormScrollPos = useRef(0);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const res = await getInvoices({ limit: 200 });
      if (res?.invoices) setInvoices(res.invoices);
      setLoading(false);
    })();
  }, []);

  useEffect(() => {
    function onAfterPrint() { setPrintingId(null); }
    window.addEventListener("afterprint", onAfterPrint);
    return () => window.removeEventListener("afterprint", onAfterPrint);
  }, []);

  function handlePrint(id: string) {
    setExpandedId(id);
    setPrintingId(id);
    setTimeout(() => window.print(), 60);
  }

  useEffect(() => {
    if (pendingWipIds.length > 0 && !didInitPending.current) {
      didInitPending.current = true;
      setCreateWipIds(pendingWipIds);
      const first = entries.find(e => e.id === pendingWipIds[0]);
      if (first) setCreateDraft(d => ({ ...d, clientName: first.clientName, matterRef: first.matterRef }));
      setShowCreate(true);
      onClearPendingWip();
    }
  }, [pendingWipIds]);

  useEffect(() => {
    if (showHeaderSettings && headerModalRef.current) {
      headerModalRef.current.scrollTop = headerModalScrollPos.current;
    }
  }, [showHeaderSettings]);

  useEffect(() => {
    if (showCreate && createModalRef.current) {
      createModalRef.current.scrollTop = createModalScrollPos.current;
    }
  }, [showCreate]);

  useEffect(() => {
    if (emailTarget && emailModalRef.current) {
      emailModalRef.current.scrollTop = emailModalScrollPos.current;
    }
  }, [emailTarget]);

  useEffect(() => {
    if (payingId && payFormRef.current) {
      payFormRef.current.scrollTop = payFormScrollPos.current;
    }
  }, [payingId]);

  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  const outstanding = invoices.filter(i => i.status !== "Paid" && i.status !== "Void").reduce((s, i) => s + i.amountCents - i.paidCents, 0);
  const dueThisMonth = invoices.filter(i => i.status !== "Paid" && i.status !== "Void" && new Date(i.dueAt) >= startOfMonth && new Date(i.dueAt) < endOfMonth).reduce((s, i) => s + i.amountCents - i.paidCents, 0);
  const overdueCount = invoices.filter(i => i.status === "Overdue").length;
  const collectedYtd = invoices.filter(i => new Date(i.issuedAt).getFullYear() === now.getFullYear()).reduce((s, i) => s + i.paidCents, 0);

  const filtered = tab === "All" ? invoices : invoices.filter(i => i.status === tab);
  const wipEntries = entries.filter(e => e.status === "WIP");
  const selTotal = wipEntries.filter(e => createWipIds.includes(e.id)).reduce((s, e) => s + e.amountCents, 0);
  const selVat = wipEntries.filter(e => createWipIds.includes(e.id)).reduce((s, e) => s + e.vatAmountCents, 0);

  async function handleCreate() {
    if (!createWipIds.length) { showToast("error", "No entries", "Select at least one WIP entry."); return; }
    if (!createDraft.clientName.trim()) { showToast("error", "Client required", "Enter a client name."); return; }
    setCreating(true);
    const res = await createInvoice({ entryIds: createWipIds, clientName: createDraft.clientName, clientEmail: createDraft.clientEmail || undefined, matterRef: createDraft.matterRef, dueAt: createDraft.dueAt || undefined, notes: createDraft.notes, terms: createDraft.terms });
    setCreating(false);
    if (res?.invoice) {
      setInvoices(prev => [res.invoice, ...prev]);
      setEntries(prev => prev.map(e => createWipIds.includes(e.id) ? { ...e, status: "Billed" as const } : e));
      setShowCreate(false);
      setCreateWipIds([]);
      setCreateDraft(EMPTY_DRAFT);
      didInitPending.current = false;
      log(`Created invoice ${res.invoice.invoiceNumber}`);
      showToast("success", "Invoice created", res.invoice.invoiceNumber);
    } else {
      showToast("error", "Create failed", "Could not create invoice.");
    }
  }

  async function handleVoid(id: string) {
    const res = await updateInvoice(id, { status: "Void" });
    if (res?.invoice) {
      setInvoices(prev => prev.map(i => i.id === id ? res.invoice : i));
      showToast("info", "Voided", "Invoice marked void.");
    }
  }

  async function handlePaySubmit(invoiceId: string) {
    const cents = Math.round(parseFloat(payForm.amountCents) * 100);
    if (isNaN(cents) || cents <= 0) { showToast("error", "Invalid amount", "Enter a valid payment amount."); return; }
    setPaySubmitting(true);
    const res = await recordInvoicePayment(invoiceId, { amountCents: cents, paymentDate: payForm.paymentDate, paymentMethod: payForm.paymentMethod, reference: payForm.reference, notes: payForm.notes });
    setPaySubmitting(false);
    if (res?.invoice) {
      setInvoices(prev => prev.map(i => i.id === invoiceId ? res.invoice : i));
      setPayingId(null);
      setPayForm(EMPTY_PAY);
      showToast("success", "Payment recorded", `${rands(cents)} received.`);
    } else {
      showToast("error", "Failed", "Could not record payment.");
    }
  }

  async function handleOpenPdf(id: string) {
    setPdfLoadingId(id);
    const res = await getInvoicePdfUrl(id);
    setPdfLoadingId(null);
    if (res?.url) window.open(res.url, "_blank");
    else showToast("error", "PDF error", "Could not generate PDF.");
  }

  async function handleDownloadPdf(inv: Invoice) {
    setPdfDownloadingId(inv.id);
    const safeClient = inv.clientName.replace(/[^a-z0-9 ]/gi, "_").trim();
    const filename = `${inv.invoiceNumber} - ${safeClient}.pdf`;
    const res = await downloadInvoicePdf(inv.id, filename);
    setPdfDownloadingId(null);
    if (!res.ok) showToast("error", "Download failed", res.error ?? "Could not download PDF.");
  }

  async function handleSendEmail(id: string) {
    if (!emailForm.toEmail) { showToast("error", "Email required", "Enter recipient email."); return; }
    setEmailSending(true);
    const res = await sendInvoiceByEmail(id, { toEmail: emailForm.toEmail, toName: emailForm.toName, message: emailForm.message });
    setEmailSending(false);
    if (res?.invoice) {
      setInvoices(prev => prev.map(i => i.id === id ? res.invoice : i));
      setEmailTarget(null);
      setEmailForm({ toEmail: "", toName: "", message: "" });
      showToast("success", "Sent", `Invoice emailed to ${emailForm.toEmail}`);
    } else {
      showToast("error", "Send failed", "Could not send email.");
    }
  }

  async function handleSyncAccounting(id: string) {
    setSyncingId(id);
    const res = await syncInvoiceToAccounting(id, "default");
    setSyncingId(null);
    if (res?.invoice) {
      setInvoices(prev => prev.map(i => i.id === id ? res.invoice : i));
      showToast("success", "Synced", "Invoice synced to accounting.");
    } else {
      showToast("error", "Sync failed", "Could not sync to accounting.");
    }
  }

  function openHeaderSettings() {
    const current = tenantProfile.invoiceHeaderFields?.length
      ? tenantProfile.invoiceHeaderFields
      : ALL_HEADER_FIELDS.map(f => f.key);
    setHeaderFieldsDraft(current);
    setShowHeaderSettings(true);
  }

  function toggleHeaderField(key: InvoiceHeaderField) {
    setHeaderFieldsDraft(prev =>
      prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]
    );
  }

  function moveHeaderField(index: number, direction: -1 | 1) {
    setHeaderFieldsDraft(prev => {
      const next = [...prev];
      const swapIndex = index + direction;
      if (swapIndex < 0 || swapIndex >= next.length) return prev;
      [next[index], next[swapIndex]] = [next[swapIndex], next[index]];
      return next;
    });
  }

  async function saveHeaderSettings() {
    setHeaderSettingsSaving(true);
    try {
      const updated: TenantProfile = { ...tenantProfile, invoiceHeaderFields: headerFieldsDraft };
      const res = await saveTenantProfile(updated);
      setTenantProfile(res.tenantProfile);
      setShowHeaderSettings(false);
      showToast("success", "Header saved", "Invoice print header updated.");
      log("Billing staff updated invoice header fields");
    } catch (error) {
      showToast("error", "Save failed", error instanceof Error ? error.message : "Could not save header settings.");
    } finally {
      setHeaderSettingsSaving(false);
    }
  }

  const activeHeaderFields: InvoiceHeaderField[] = tenantProfile.invoiceHeaderFields?.length
    ? tenantProfile.invoiceHeaderFields
    : ALL_HEADER_FIELDS.map(f => f.key);

  return (
    <div className="billing-view">
      {/* PAGE HEADER */}
      <div className="topbar">
        <h1>Billing</h1>
        <div className="top-actions">
          <button className="ghost small" title="Customise print header" onClick={openHeaderSettings}>
            <Settings2 size={15} /> Header fields
          </button>
          <button className="primary" onClick={() => setShowCreate(true)}>+ New Invoice</button>
        </div>
      </div>

      {/* INVOICE HEADER SETTINGS PANEL */}
      {showHeaderSettings && (
        <div className="modal-backdrop" onClick={() => setShowHeaderSettings(false)}>
          <div
            className="modal"
            style={{ maxWidth: 420 }}
            onClick={e => e.stopPropagation()}
            ref={headerModalRef}
            onScroll={() => { headerModalScrollPos.current = headerModalRef.current?.scrollTop ?? 0; }}
          >
            <div className="modal-head">
              <h3>Invoice print header fields</h3>
              <button className="ghost small" onClick={() => setShowHeaderSettings(false)}>✕</button>
            </div>
            <p style={{ color: "var(--muted)", fontSize: "0.88rem", margin: "0 0 1rem" }}>
              Choose which firm details appear beside your logo on printed invoices. Use the arrows to reorder them.
            </p>

            {/* Live preview */}
            {(() => {
              const missingLogo = !tenantProfile.logoPublicUrl && !tenantProfile.logoDataUrl;
              const missingName = !tenantProfile.tradingName;
              const missingSelectedFields = headerFieldsDraft.some(field => {
                if (field === "address") {
                  const lines = [tenantProfile.addressLine1, tenantProfile.addressLine2].filter(Boolean);
                  const cityLine = [tenantProfile.city, tenantProfile.province, tenantProfile.postalCode].filter(Boolean).join(", ");
                  return lines.length === 0 && !cityLine;
                }
                if (field === "phone") return !tenantProfile.phone;
                if (field === "website") return !tenantProfile.website;
                if (field === "vatNumber") return !tenantProfile.vatNumber;
                if (field === "lpcNumber") return !tenantProfile.lpcRegistrationNumber;
                return false;
              });
              const hasMissingData = missingLogo || missingName || missingSelectedFields;
              return (
                <div className="inv-header-preview-wrap">
                  <div className="inv-header-preview-label">Preview</div>
                  <div className="inv-header-preview">
                    <div className="inv-print-header-left">
                      {(tenantProfile.logoPublicUrl || tenantProfile.logoDataUrl) ? (
                        <img
                          src={tenantProfile.logoPublicUrl || tenantProfile.logoDataUrl}
                          alt={tenantProfile.tradingName}
                          className="inv-header-preview-logo"
                        />
                      ) : (
                        <div className="inv-header-preview-logo-box">LOGO</div>
                      )}
                      <div className="inv-print-firm-name">{tenantProfile.tradingName || "Firm Name"}</div>
                    </div>
                    <div className="inv-print-header-right">
                      {headerFieldsDraft.length === 0 && (
                        <span style={{ opacity: 0.35, fontStyle: "italic" }}>No fields selected</span>
                      )}
                      {headerFieldsDraft.map(field => {
                        if (field === "address") {
                          const lines = [tenantProfile.addressLine1, tenantProfile.addressLine2].filter(Boolean);
                          const cityLine = [tenantProfile.city, tenantProfile.province, tenantProfile.postalCode].filter(Boolean).join(", ");
                          const hasData = lines.length > 0 || cityLine;
                          return hasData ? (
                            <>
                              {lines.map((l, i) => <span key={`addr-${i}`}>{l}</span>)}
                              {cityLine && <span key="city">{cityLine}</span>}
                            </>
                          ) : (
                            <span key="addr-placeholder" style={{ opacity: 0.35 }}>123 Example St, City</span>
                          );
                        }
                        if (field === "phone") return <span key="phone">{tenantProfile.phone ? `Tel: ${tenantProfile.phone}` : <span style={{ opacity: 0.35 }}>Tel: +27 00 000 0000</span>}</span>;
                        if (field === "website") return <span key="website">{tenantProfile.website ? tenantProfile.website : <span style={{ opacity: 0.35 }}>www.yourfirm.co.za</span>}</span>;
                        if (field === "vatNumber") return <span key="vat">{tenantProfile.vatNumber ? `VAT: ${tenantProfile.vatNumber}` : <span style={{ opacity: 0.35 }}>VAT: 4012345678</span>}</span>;
                        if (field === "lpcNumber") return <span key="lpc">{tenantProfile.lpcRegistrationNumber ? `LPC: ${tenantProfile.lpcRegistrationNumber}` : <span style={{ opacity: 0.35 }}>LPC: 123/456</span>}</span>;
                        return null;
                      })}
                    </div>
                  </div>
                  {hasMissingData && (
                    <div style={{ marginTop: "0.5rem", textAlign: "right" }}>
                      <button
                        className="ghost small"
                        style={{ fontSize: "0.8rem", color: "var(--accent, #4f6ef7)", padding: "0.15rem 0.3rem" }}
                        onClick={() => { setShowHeaderSettings(false); setActiveView("settings"); }}
                      >
                        Edit firm profile →
                      </button>
                    </div>
                  )}
                </div>
              );
            })()}

            <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem", marginBottom: "1.25rem" }}>
              {ALL_HEADER_FIELDS.map(({ key, label }) => {
                const enabledIndex = headerFieldsDraft.indexOf(key);
                const enabled = enabledIndex !== -1;
                return (
                  <div key={key} style={{ display: "flex", alignItems: "center", gap: "0.6rem", padding: "0.45rem 0.6rem", borderRadius: 6, background: "var(--surface-raised, #f8f8f8)" }}>
                    <input
                      type="checkbox"
                      id={`hf-${key}`}
                      checked={enabled}
                      onChange={() => toggleHeaderField(key)}
                      style={{ cursor: "pointer" }}
                    />
                    <label htmlFor={`hf-${key}`} style={{ flex: 1, cursor: "pointer", userSelect: "none" }}>{label}</label>
                    {enabled && (
                      <span style={{ display: "flex", gap: "0.2rem" }}>
                        <button
                          className="ghost small"
                          title="Move up"
                          disabled={enabledIndex === 0}
                          onClick={() => moveHeaderField(enabledIndex, -1)}
                          style={{ padding: "0 0.3rem" }}
                        ><ChevronUp size={13} /></button>
                        <button
                          className="ghost small"
                          title="Move down"
                          disabled={enabledIndex === headerFieldsDraft.length - 1}
                          onClick={() => moveHeaderField(enabledIndex, 1)}
                          style={{ padding: "0 0.3rem" }}
                        ><ChevronDown size={13} /></button>
                      </span>
                    )}
                    {!enabled && <span style={{ width: 44 }} />}
                  </div>
                );
              })}
            </div>
            <div style={{ display: "flex", gap: "0.6rem", justifyContent: "flex-end" }}>
              <button className="ghost small" onClick={() => setShowHeaderSettings(false)}>Cancel</button>
              <button className="primary small" disabled={headerSettingsSaving} onClick={saveHeaderSettings}>
                {headerSettingsSaving ? "Saving…" : "Save header"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* METRICS */}
      <section className="metrics">
        <div className="metric">
          <span>Outstanding</span>
          <strong>{rands(outstanding)}</strong>
          <small>Unpaid + part-paid</small>
        </div>
        <div className="metric">
          <span>Due This Month</span>
          <strong>{rands(dueThisMonth)}</strong>
          <small>Due before month-end</small>
        </div>
        <div className="metric">
          <span>Overdue</span>
          <strong>{overdueCount}</strong>
          <small>Require follow-up</small>
        </div>
        <div className="metric">
          <span>Collected YTD</span>
          <strong>{rands(collectedYtd)}</strong>
          <small>Payments received</small>
        </div>
      </section>

      {/* FILTER TABS */}
      <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", marginBottom: "1rem" }}>
        {TABS.map(t => (
          <button key={t} className={tab === t ? "primary small" : "ghost small"} onClick={() => setTab(t)}>{t}</button>
        ))}
      </div>

      {/* INVOICE LIST */}
      <div className="panel">
        <div className="panel-head">
          <h3>Invoices</h3>
          <span className="pill">{filtered.length} {tab !== "All" ? tab : "total"}</span>
        </div>

        {loading ? (
          <p style={{ padding: "1rem", color: "var(--muted)" }}>Loading invoices…</p>
        ) : filtered.length === 0 ? (
          <p style={{ padding: "1rem", color: "var(--muted)" }}>No {tab !== "All" ? tab.toLowerCase() : ""} invoices yet.</p>
        ) : (
          <div className="inv-table">
            {/* Header */}
            <div className="inv-row inv-row-head">
              <span>Invoice #</span>
              <span>Client / Matter</span>
              <span>Issued</span>
              <span>Due</span>
              <span style={{ textAlign: "right" }}>Total</span>
              <span style={{ textAlign: "right" }}>Balance</span>
              <span>Status</span>
              <span>Actions</span>
            </div>

            {filtered.map(inv => (
              <div key={inv.id} className={printingId === inv.id ? "invoice-print-target" : undefined}>
                {printingId === inv.id && (
                  <div className="inv-print-header">
                    <div className="inv-print-header-left">
                      {(tenantProfile.logoPublicUrl || tenantProfile.logoDataUrl) && (
                        <img
                          src={tenantProfile.logoPublicUrl || tenantProfile.logoDataUrl}
                          alt={tenantProfile.tradingName}
                          className="inv-print-logo"
                        />
                      )}
                      <div className="inv-print-firm-name">{tenantProfile.tradingName}</div>
                    </div>
                    <div className="inv-print-header-right">
                      {activeHeaderFields.map(field => {
                        if (field === "address") {
                          const lines = [tenantProfile.addressLine1, tenantProfile.addressLine2].filter(Boolean);
                          const cityLine = [tenantProfile.city, tenantProfile.province, tenantProfile.postalCode].filter(Boolean).join(", ");
                          return (
                            <>
                              {lines.map((l, i) => <span key={`addr-${i}`}>{l}</span>)}
                              {cityLine && <span key="city">{cityLine}</span>}
                            </>
                          );
                        }
                        if (field === "phone" && tenantProfile.phone) return <span key="phone">Tel: {tenantProfile.phone}</span>;
                        if (field === "website" && tenantProfile.website) return <span key="website">{tenantProfile.website}</span>;
                        if (field === "vatNumber" && tenantProfile.vatNumber) return <span key="vat">VAT: {tenantProfile.vatNumber}</span>;
                        if (field === "lpcNumber" && tenantProfile.lpcRegistrationNumber) return <span key="lpc">LPC: {tenantProfile.lpcRegistrationNumber}</span>;
                        return null;
                      })}
                    </div>
                  </div>
                )}
                {printingId === inv.id && (
                  <div className="inv-print-title">
                    <div className="inv-print-title-heading">TAX INVOICE</div>
                    <div className="inv-print-title-meta">
                      <div className="inv-print-title-row">
                        <span className="inv-print-title-label">Invoice No</span>
                        <span className="inv-print-title-value">{inv.invoiceNumber}</span>
                      </div>
                      <div className="inv-print-title-row">
                        <span className="inv-print-title-label">Issue Date</span>
                        <span className="inv-print-title-value">{fmtDate(inv.issuedAt)}</span>
                      </div>
                      <div className="inv-print-title-row">
                        <span className="inv-print-title-label">Due Date</span>
                        <span className="inv-print-title-value">{fmtDate(inv.dueAt)}</span>
                      </div>
                      <div className="inv-print-title-row">
                        <span className="inv-print-title-label">Client</span>
                        <span className="inv-print-title-value">{inv.clientName}</span>
                      </div>
                      {inv.matterRef && (
                        <div className="inv-print-title-row">
                          <span className="inv-print-title-label">Matter Ref</span>
                          <span className="inv-print-title-value">{inv.matterRef}</span>
                        </div>
                      )}
                      {inv.paymentRef && (
                        <div className="inv-print-title-row">
                          <span className="inv-print-title-label">Payment Ref</span>
                          <span className="inv-print-title-value">{inv.paymentRef}</span>
                        </div>
                      )}
                    </div>
                  </div>
                )}
                <div className={`inv-row${expandedId === inv.id ? " inv-row-open" : ""}`}>
                  <span><code style={{ fontSize: "0.82rem", fontWeight: 700 }}>{inv.invoiceNumber}</code></span>
                  <span>
                    <strong style={{ display: "block", fontSize: "0.9rem" }}>{inv.clientName}</strong>
                    {inv.matterRef && <small style={{ color: "var(--muted)" }}>{inv.matterRef}</small>}
                  </span>
                  <span style={{ color: "var(--muted)", fontSize: "0.88rem" }}>{fmtDate(inv.issuedAt)}</span>
                  <span style={{ color: "var(--muted)", fontSize: "0.88rem" }}>{fmtDate(inv.dueAt)}</span>
                  <span style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{rands(inv.amountCents)}</span>
                  <span style={{ textAlign: "right", fontVariantNumeric: "tabular-nums", fontWeight: inv.amountCents - inv.paidCents > 0 ? 700 : 400 }}>{rands(inv.amountCents - inv.paidCents)}</span>
                  <span><span className={statusPillClass(inv.status)}>{inv.status}</span></span>
                  <span>
                    <div style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap" }}>
                      <button className="ghost small" title={expandedId === inv.id ? "Collapse" : "Expand"} onClick={() => setExpandedId(expandedId === inv.id ? null : inv.id)}>
                        {expandedId === inv.id ? "▲" : "▼"}
                      </button>
                      <button className="ghost small" disabled={pdfLoadingId === inv.id} onClick={() => handleOpenPdf(inv.id)}>
                        {pdfLoadingId === inv.id ? "…" : "PDF"}
                      </button>
                      <button className="ghost small" disabled={pdfDownloadingId === inv.id} onClick={() => handleDownloadPdf(inv)}>
                        {pdfDownloadingId === inv.id ? "…" : "Download PDF"}
                      </button>
                      <button className="ghost small" title="Print invoice" onClick={() => handlePrint(inv.id)}>
                        <Printer size={14} /> Print
                      </button>
                      <button className="ghost small" onClick={() => { setEmailTarget(inv.id); setEmailForm({ toEmail: inv.clientEmail || "", toName: inv.clientName || "", message: "" }); }}>Email Invoice</button>
                      {inv.status !== "Void" && inv.status !== "Paid" && (
                        <button className="ghost small" style={{ color: "var(--rose)" }} onClick={() => handleVoid(inv.id)}>Void</button>
                      )}
                    </div>
                  </span>
                </div>

                {expandedId === inv.id && (
                  <div className="inv-detail">
                    <InvoiceDetail
                      invoice={inv}
                      payingId={payingId}
                      payForm={payForm}
                      paySubmitting={paySubmitting}
                      syncingId={syncingId}
                      PAY_METHODS={PAY_METHODS}
                      onSetPayingId={setPayingId}
                      onPayFormChange={setPayForm}
                      onPaySubmit={handlePaySubmit}
                      onSyncAccounting={handleSyncAccounting}
                      rands={rands}
                      fmtDate={fmtDate}
                      payFormRef={payFormRef}
                      onPayFormScroll={(top) => { payFormScrollPos.current = top; }}
                    />
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {showCreate && (
        <CreateModal
          wipEntries={wipEntries}
          createWipIds={createWipIds}
          setCreateWipIds={setCreateWipIds}
          createDraft={createDraft}
          setCreateDraft={setCreateDraft}
          selTotal={selTotal}
          selVat={selVat}
          creating={creating}
          onSubmit={handleCreate}
          onClose={() => { setShowCreate(false); setCreateWipIds([]); setCreateDraft(EMPTY_DRAFT); didInitPending.current = false; }}
          rands={rands}
          modalRef={createModalRef}
          onScrollSave={(top) => { createModalScrollPos.current = top; }}
        />
      )}

      {emailTarget && (
        <EmailModal
          invoice={invoices.find(i => i.id === emailTarget)!}
          emailForm={emailForm}
          setEmailForm={setEmailForm}
          sending={emailSending}
          onSubmit={() => handleSendEmail(emailTarget)}
          onClose={() => { setEmailTarget(null); setEmailForm({ toEmail: "", toName: "", message: "" }); }}
          rands={rands}
          modalRef={emailModalRef}
          onScrollSave={(top) => { emailModalScrollPos.current = top; }}
        />
      )}
    </div>
  );
}

// ─── InvoiceDetail ─────────────────────────────────────────────────────────────

type PayForm = typeof EMPTY_PAY;

function InvoiceDetail({ invoice, payingId, payForm, paySubmitting, syncingId, PAY_METHODS, onSetPayingId, onPayFormChange, onPaySubmit, onSyncAccounting, rands, fmtDate, payFormRef, onPayFormScroll }: {
  invoice: Invoice;
  payingId: string | null;
  payForm: PayForm;
  paySubmitting: boolean;
  syncingId: string | null;
  PAY_METHODS: InvoicePayment["paymentMethod"][];
  onSetPayingId: (id: string | null) => void;
  onPayFormChange: React.Dispatch<React.SetStateAction<PayForm>>;
  onPaySubmit: (id: string) => void;
  onSyncAccounting: (id: string) => void;
  rands: (c: number) => string;
  fmtDate: (s: string) => string;
  payFormRef?: React.RefObject<HTMLDivElement>;
  onPayFormScroll?: (top: number) => void;
}) {
  return (
    <div style={{ display: "grid", gap: "1.25rem" }}>
      {/* Line items */}
      {invoice.lineItems?.length > 0 && (
        <div>
          <p style={{ margin: "0 0 0.5rem", fontWeight: 700, fontSize: "0.875rem" }}>Line items</p>
          <div className="inv-lines">
            <div className="inv-line-head">
              <span>Date</span><span>Description</span><span>Fee Earner</span><span>Mins</span>
              <span style={{ textAlign: "right" }}>Amount</span><span style={{ textAlign: "right" }}>VAT</span>
            </div>
            {invoice.lineItems.map(li => (
              <div key={li.id} className="inv-line-row">
                <span style={{ color: "var(--muted)", fontSize: "0.85rem" }}>{fmtDate(li.entryDate)}</span>
                <span style={{ fontSize: "0.9rem" }}>{li.description}</span>
                <span style={{ color: "var(--muted)", fontSize: "0.85rem" }}>{li.feeEarnerName}</span>
                <span style={{ color: "var(--muted)", fontSize: "0.85rem" }}>{li.isDisbursement ? "—" : li.durationMinutes}</span>
                <span style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{rands(li.amountCents)}</span>
                <span style={{ textAlign: "right", fontVariantNumeric: "tabular-nums", color: "var(--muted)" }}>{rands(li.vatCents)}</span>
              </div>
            ))}
            <div className="inv-line-total">
              <span>Subtotal</span><span style={{ textAlign: "right" }}>{rands(invoice.subtotalCents)}</span>
            </div>
            <div className="inv-line-total">
              <span>VAT (15%)</span><span style={{ textAlign: "right" }}>{rands(invoice.vatCents)}</span>
            </div>
            <div className="inv-line-total" style={{ fontWeight: 800 }}>
              <span>Total</span><span style={{ textAlign: "right" }}>{rands(invoice.amountCents)}</span>
            </div>
          </div>
        </div>
      )}

      {/* Payments */}
      <div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.5rem" }}>
          <p style={{ margin: 0, fontWeight: 700, fontSize: "0.875rem" }}>Payments</p>
          {invoice.status !== "Paid" && invoice.status !== "Void" && (
            <button className={payingId === invoice.id ? "ghost small" : "primary small"} onClick={() => onSetPayingId(payingId === invoice.id ? null : invoice.id)}>
              {payingId === invoice.id ? "Cancel" : "+ Record payment"}
            </button>
          )}
        </div>

        {invoice.payments?.length > 0 ? (
          <div className="inv-lines">
            <div className="inv-line-head"><span>Date</span><span>Method</span><span>Reference</span><span style={{ textAlign: "right" }}>Amount</span></div>
            {invoice.payments.map(p => (
              <div key={p.id} className="inv-line-row">
                <span style={{ color: "var(--muted)", fontSize: "0.85rem" }}>{fmtDate(p.paymentDate)}</span>
                <span>{p.paymentMethod}</span>
                <span style={{ color: "var(--muted)" }}>{p.reference || "—"}</span>
                <span style={{ textAlign: "right", fontVariantNumeric: "tabular-nums", fontWeight: 700, color: "var(--green)" }}>{rands(p.amountCents)}</span>
              </div>
            ))}
          </div>
        ) : (
          <p style={{ margin: 0, color: "var(--muted)", fontSize: "0.88rem" }}>No payments recorded.</p>
        )}

        {payingId === invoice.id && (
          <div ref={payFormRef} onScroll={() => { if (payFormRef?.current) onPayFormScroll?.(payFormRef.current.scrollTop); }} style={{ marginTop: "1rem", padding: "1rem", background: "var(--surface)", borderRadius: 8, border: "1px solid var(--line)", display: "grid", gap: "0.75rem" }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "0.75rem" }}>
              <label>Amount (ZAR)
                <input type="number" min="0" step="0.01" placeholder="0.00" value={payForm.amountCents}
                  onChange={e => onPayFormChange(f => ({ ...f, amountCents: e.target.value }))} />
              </label>
              <label>Payment date
                <input type="date" value={payForm.paymentDate}
                  onChange={e => onPayFormChange(f => ({ ...f, paymentDate: e.target.value }))} />
              </label>
              <label>Method
                <select value={payForm.paymentMethod} onChange={e => onPayFormChange(f => ({ ...f, paymentMethod: e.target.value as InvoicePayment["paymentMethod"] }))}>
                  {PAY_METHODS.map(m => <option key={m}>{m}</option>)}
                </select>
              </label>
            </div>
            <label>Reference / EFT proof
              <input type="text" placeholder="EFT ref, cheque no., etc." value={payForm.reference}
                onChange={e => onPayFormChange(f => ({ ...f, reference: e.target.value }))} />
            </label>
            <div>
              <button className="primary small" disabled={paySubmitting} onClick={() => onPaySubmit(invoice.id)}>
                {paySubmitting ? "Saving…" : "Save payment"}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Accounting */}
      <div style={{ paddingTop: "0.5rem", borderTop: "1px solid var(--line)", display: "flex", alignItems: "center", gap: "1rem" }}>
        {invoice.accountingSyncedAt
          ? <span style={{ fontSize: "0.85rem", color: "var(--muted)" }}>Synced to {invoice.accountingProvider} on {fmtDate(invoice.accountingSyncedAt)}</span>
          : <button className="ghost small" disabled={syncingId === invoice.id} onClick={() => onSyncAccounting(invoice.id)}>
              {syncingId === invoice.id ? "Syncing…" : "Sync to accounting"}
            </button>
        }
        {invoice.notes && <span style={{ fontSize: "0.85rem", color: "var(--muted)" }}>{invoice.notes}</span>}
      </div>
    </div>
  );
}

// ─── CreateModal ───────────────────────────────────────────────────────────────

function CreateModal({ wipEntries, createWipIds, setCreateWipIds, createDraft, setCreateDraft, selTotal, selVat, creating, onSubmit, onClose, rands, modalRef, onScrollSave }: {
  wipEntries: TimeEntry[];
  createWipIds: string[];
  setCreateWipIds: React.Dispatch<React.SetStateAction<string[]>>;
  createDraft: typeof EMPTY_DRAFT;
  setCreateDraft: React.Dispatch<React.SetStateAction<typeof EMPTY_DRAFT>>;
  selTotal: number;
  selVat: number;
  creating: boolean;
  onSubmit: () => void;
  onClose: () => void;
  rands: (c: number) => string;
  modalRef?: React.RefObject<HTMLDivElement>;
  onScrollSave?: (top: number) => void;
}) {
  function toggleWip(id: string) {
    setCreateWipIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div ref={modalRef} className="modal" style={{ maxWidth: 680, maxHeight: "88vh", display: "flex", flexDirection: "column", overflowY: "auto" }} onClick={e => e.stopPropagation()} onScroll={() => { if (modalRef?.current) onScrollSave?.(modalRef.current.scrollTop); }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.25rem" }}>
          <h3 style={{ margin: 0, fontFamily: "var(--font-serif)", fontSize: "1.4rem" }}>New Invoice</h3>
          <button className="ghost small" onClick={onClose}>✕</button>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "0.75rem", marginBottom: "1.25rem" }}>
          <label style={{ gridColumn: "span 1" }}>Client name *
            <input type="text" value={createDraft.clientName} onChange={e => setCreateDraft(d => ({ ...d, clientName: e.target.value }))} />
          </label>
          <label>Client email
            <input type="email" placeholder="client@example.com" value={createDraft.clientEmail} onChange={e => setCreateDraft(d => ({ ...d, clientEmail: e.target.value }))} />
          </label>
          <label>Matter ref
            <input type="text" value={createDraft.matterRef} onChange={e => setCreateDraft(d => ({ ...d, matterRef: e.target.value }))} />
          </label>
          <label>Due date
            <input type="date" value={createDraft.dueAt} onChange={e => setCreateDraft(d => ({ ...d, dueAt: e.target.value }))} />
          </label>
        </div>

        <p style={{ margin: "0 0 0.5rem", fontWeight: 700, fontSize: "0.875rem" }}>Select WIP entries ({createWipIds.length} selected)</p>
        {wipEntries.length === 0 ? (
          <p style={{ color: "var(--muted)", fontSize: "0.88rem" }}>No WIP entries available. Log time first.</p>
        ) : (
          <div style={{ display: "grid", gap: "0.4rem", maxHeight: 240, overflowY: "auto", padding: "0.5rem", background: "var(--surface)", borderRadius: 8, border: "1px solid var(--line)", marginBottom: "1rem" }}>
            {wipEntries.map(e => (
              <label key={e.id} style={{ display: "grid", gridTemplateColumns: "auto 1fr auto", gap: "0.75rem", alignItems: "center", padding: "0.5rem 0.25rem", cursor: "pointer", fontSize: "0.88rem", fontWeight: 400 }}>
                <input type="checkbox" checked={createWipIds.includes(e.id)} onChange={() => toggleWip(e.id)} style={{ width: 16, height: 16 }} />
                <span>
                  <strong style={{ display: "block", fontSize: "0.875rem" }}>{e.clientName} · {e.description}</strong>
                  <small style={{ color: "var(--muted)" }}>{e.entryDate} · {e.feeEarnerName}</small>
                </span>
                <span style={{ fontVariantNumeric: "tabular-nums", fontWeight: 700, color: "var(--green)" }}>{rands(e.amountCents)}</span>
              </label>
            ))}
          </div>
        )}

        {createWipIds.length > 0 && (
          <div style={{ display: "flex", gap: "1.5rem", padding: "0.75rem 1rem", background: "var(--green-light)", borderRadius: 8, marginBottom: "1rem", fontSize: "0.9rem" }}>
            <span>Subtotal: <strong>{rands(selTotal)}</strong></span>
            <span>VAT (15%): <strong>{rands(selVat)}</strong></span>
            <span style={{ marginLeft: "auto" }}>Total: <strong style={{ color: "var(--green)", fontSize: "1rem" }}>{rands(selTotal + selVat)}</strong></span>
          </div>
        )}

        <div style={{ display: "grid", gap: "0.75rem", marginBottom: "1.25rem" }}>
          <label>Notes
            <textarea rows={2} style={{ minHeight: "unset" }} value={createDraft.notes} onChange={e => setCreateDraft(d => ({ ...d, notes: e.target.value }))} />
          </label>
          <label>Payment terms
            <textarea rows={2} style={{ minHeight: "unset" }} value={createDraft.terms} onChange={e => setCreateDraft(d => ({ ...d, terms: e.target.value }))} />
          </label>
        </div>

        <div style={{ display: "flex", gap: "0.75rem", justifyContent: "flex-end", paddingTop: "0.75rem", borderTop: "1px solid var(--line)" }}>
          <button className="ghost" onClick={onClose}>Cancel</button>
          <button className="primary" disabled={creating} onClick={onSubmit}>{creating ? "Creating…" : "Create Invoice"}</button>
        </div>
      </div>
    </div>
  );
}

// ─── EmailModal ────────────────────────────────────────────────────────────────

function EmailModal({ invoice, emailForm, setEmailForm, sending, onSubmit, onClose, rands, modalRef, onScrollSave }: {
  invoice: Invoice;
  emailForm: { toEmail: string; toName: string; message: string };
  setEmailForm: React.Dispatch<React.SetStateAction<{ toEmail: string; toName: string; message: string }>>;
  sending: boolean;
  onSubmit: () => void;
  onClose: () => void;
  rands: (c: number) => string;
  modalRef?: React.RefObject<HTMLDivElement>;
  onScrollSave?: (top: number) => void;
}) {
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div ref={modalRef} className="modal" style={{ maxWidth: 520, maxHeight: "88vh", overflowY: "auto", display: "flex", flexDirection: "column" }} onClick={e => e.stopPropagation()} onScroll={() => { if (modalRef?.current) onScrollSave?.(modalRef.current.scrollTop); }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.25rem" }}>
          <h3 style={{ margin: 0, fontFamily: "var(--font-serif)", fontSize: "1.4rem" }}>Send Invoice</h3>
          <button className="ghost small" onClick={onClose}>✕</button>
        </div>

        <div style={{ padding: "0.75rem 1rem", background: "var(--surface)", borderRadius: 8, marginBottom: "1.25rem", display: "flex", gap: "1rem", fontSize: "0.9rem", alignItems: "center" }}>
          <code style={{ fontWeight: 700 }}>{invoice.invoiceNumber}</code>
          <span style={{ color: "var(--muted)" }}>{invoice.clientName}</span>
          <span style={{ marginLeft: "auto", fontWeight: 700 }}>{rands(invoice.amountCents)}</span>
        </div>

        <div style={{ display: "grid", gap: "0.75rem", marginBottom: "1.25rem" }}>
          <label>Recipient email *
            <input type="email" value={emailForm.toEmail} onChange={e => setEmailForm(f => ({ ...f, toEmail: e.target.value }))} />
          </label>
          <label>Recipient name
            <input type="text" value={emailForm.toName} onChange={e => setEmailForm(f => ({ ...f, toName: e.target.value }))} />
          </label>
          <label>Personal message (optional)
            <textarea rows={3} style={{ minHeight: "unset" }} value={emailForm.message} onChange={e => setEmailForm(f => ({ ...f, message: e.target.value }))} />
          </label>
        </div>

        <div style={{ display: "flex", gap: "0.75rem", justifyContent: "flex-end", paddingTop: "0.75rem", borderTop: "1px solid var(--line)" }}>
          <button className="ghost" onClick={onClose}>Cancel</button>
          <button className="primary" disabled={sending} onClick={onSubmit}>{sending ? "Sending…" : "Send Invoice"}</button>
        </div>
      </div>
    </div>
  );
}
