import { AlertTriangle, CheckCircle2, ChevronDown, ChevronUp, Plus, Scale } from "lucide-react";
import { FormEvent, useState } from "react";
import { createTrustTransaction, saveTrustReconciliation } from "./api";
import type { TrustReconciliation, TrustTransaction } from "./types";

const money = (cents: number) =>
  new Intl.NumberFormat("en-ZA", { style: "currency", currency: "ZAR", maximumFractionDigits: 0 }).format(cents / 100);
const today = () => new Date().toISOString().slice(0, 10);
const uid = (prefix: string) => `${prefix}-${Math.random().toString(36).slice(2, 7).toUpperCase()}`;
const thisMonth = () => new Date().toISOString().slice(0, 7);

export function TrustAccount({
  transactions,
  setTransactions,
  balanceCents,
  setBalanceCents,
  reconciliations,
  setReconciliations,
  log,
  showToast,
}: {
  transactions: TrustTransaction[];
  setTransactions: React.Dispatch<React.SetStateAction<TrustTransaction[]>>;
  balanceCents: number;
  setBalanceCents: React.Dispatch<React.SetStateAction<number>>;
  reconciliations: TrustReconciliation[];
  setReconciliations: React.Dispatch<React.SetStateAction<TrustReconciliation[]>>;
  log: (msg: string) => void;
  showToast: (type: "success" | "error" | "info", title: string, msg: string) => void;
}) {
  // Entry form state
  const [showEntryForm, setShowEntryForm] = useState(false);
  const [clientName, setClientName] = useState("");
  const [description, setDescription] = useState("");
  const [reference, setReference] = useState("");
  const [entryType, setEntryType] = useState<TrustTransaction["entryType"]>("receipt");
  const [amountInput, setAmountInput] = useState("");
  const [valueDate, setValueDate] = useState(today());
  const [entryLoading, setEntryLoading] = useState(false);

  // Reconciliation form state
  const [showReconForm, setShowReconForm] = useState(false);
  const [periodMonth, setPeriodMonth] = useState("");
  const [bankStatementInput, setBankStatementInput] = useState("");
  const [ledgerInput, setLedgerInput] = useState("");
  const [clientCreditInput, setClientCreditInput] = useState("");
  const [reconStatus, setReconStatus] = useState<TrustReconciliation["status"]>("Draft");
  const [reconNotes, setReconNotes] = useState("");
  const [reconLoading, setReconLoading] = useState(false);

  // Computed metrics
  const currentMonth = thisMonth();
  const receiptsThisMonth = transactions
    .filter(t => (t.entryType === "receipt" || t.entryType === "transfer_in") && t.valueDate.startsWith(currentMonth))
    .reduce((sum, t) => sum + t.amountCents, 0);
  const paymentsThisMonth = transactions
    .filter(t => (t.entryType === "payment" || t.entryType === "transfer_out") && t.valueDate.startsWith(currentMonth))
    .reduce((sum, t) => sum + t.amountCents, 0);
  const unreconciledCount = transactions.filter(t => !t.reconciled).length;

  // Entry type helpers
  const isCredit = (et: TrustTransaction["entryType"]) => et === "receipt" || et === "transfer_in";

  function entryTypePill(et: TrustTransaction["entryType"]) {
    if (et === "receipt" || et === "transfer_in") return <span className="pill trust-type-receipt">Receipt</span>;
    if (et === "payment" || et === "transfer_out") return <span className="pill trust-type-payment">Payment</span>;
    return <span className="pill trust-type-adjustment">Adj</span>;
  }

  async function handleEntrySubmit(e: FormEvent) {
    e.preventDefault();
    const amountCents = Math.round(parseFloat(amountInput) * 100);
    if (!clientName.trim() || !description.trim() || isNaN(amountCents) || amountCents <= 0) return;
    setEntryLoading(true);
    try {
      const res = await createTrustTransaction({ clientName, description, reference, entryType, amountCents, valueDate });
      setTransactions(prev => [res.transaction, ...prev]);
      setBalanceCents(prev => isCredit(entryType) ? prev + amountCents : prev - amountCents);
      showToast("success", "Entry recorded", `${entryType} of ${money(amountCents)} recorded.`);
      log(`Trust entry: ${entryType} ${money(amountCents)} for ${clientName}`);
    } catch {
      const localEntry: TrustTransaction = {
        id: uid("TT"),
        clientName,
        description,
        reference,
        entryType,
        amountCents,
        runningBalanceCents: balanceCents,
        valueDate,
        reconciled: false,
      };
      setTransactions(prev => [localEntry, ...prev]);
      showToast("info", "Saved locally", "Entry recorded locally. Connect the API to persist.");
    } finally {
      setEntryLoading(false);
      setClientName("");
      setDescription("");
      setReference("");
      setAmountInput("");
      setValueDate(today());
      setEntryType("receipt");
      setShowEntryForm(false);
    }
  }

  async function handleReconSubmit(e: FormEvent) {
    e.preventDefault();
    const bankStatementBalanceCents = Math.round(parseFloat(bankStatementInput) * 100);
    const ledgerBalanceCents = Math.round(parseFloat(ledgerInput) * 100);
    const clientCreditTotalCents = Math.round(parseFloat(clientCreditInput) * 100);
    if (!periodMonth.trim() || isNaN(bankStatementBalanceCents) || isNaN(ledgerBalanceCents) || isNaN(clientCreditTotalCents)) return;
    setReconLoading(true);
    try {
      const res = await saveTrustReconciliation({ periodMonth, bankStatementBalanceCents, ledgerBalanceCents, clientCreditTotalCents, status: reconStatus });
      setReconciliations(prev => {
        const idx = prev.findIndex(r => r.periodMonth === periodMonth);
        return idx >= 0 ? prev.map((r, i) => i === idx ? res.reconciliation : r) : [res.reconciliation, ...prev];
      });
      showToast("success", "Reconciliation saved", `${periodMonth} reconciliation recorded.`);
      log(`Trust reconciliation: ${periodMonth} — ${reconStatus}`);
    } catch {
      const local: TrustReconciliation = {
        id: uid("TR"),
        periodMonth,
        bankStatementBalanceCents,
        ledgerBalanceCents,
        clientCreditTotalCents,
        status: reconStatus,
      };
      setReconciliations(prev => [local, ...prev]);
      showToast("info", "Saved locally", "Reconciliation saved locally.");
    } finally {
      setReconLoading(false);
      setPeriodMonth("");
      setBankStatementInput("");
      setLedgerInput("");
      setClientCreditInput("");
      setReconStatus("Draft");
      setReconNotes("");
      setShowReconForm(false);
    }
  }

  function reconStatusClass(status: TrustReconciliation["status"]) {
    if (status === "Draft") return "pill recon-status-draft";
    if (status === "Submitted") return "pill recon-status-submitted";
    return "pill recon-status-approved";
  }

  const receiptsCount = transactions.filter(t => t.entryType === "receipt" || t.entryType === "transfer_in").length;
  const paymentsCount = transactions.filter(t => t.entryType === "payment" || t.entryType === "transfer_out").length;
  const reconciledMonths = reconciliations.filter(r => r.status === "LPC Approved").length;

  return (
    <div className="tier1-section">
      {/* Section 86 Notice */}
      <div className="section-86-notice">
        <AlertTriangle size={18} />
        <span>
          Section 86(4) of the Legal Practice Act requires monthly trust account reconciliation. Ensure your bank
          statement, ledger and client credit balances agree before submitting to the LPC.
        </span>
      </div>

      {/* Metrics */}
      <div className="metrics">
        <div className="metric">
          <span className="eyebrow">Trust Balance</span>
          <strong style={{ color: balanceCents >= 0 ? "var(--green, #16a34a)" : undefined }}>{money(balanceCents)}</strong>
        </div>
        <div className="metric">
          <span className="eyebrow">Receipts This Month</span>
          <strong>{money(receiptsThisMonth)}</strong>
        </div>
        <div className="metric">
          <span className="eyebrow">Payments This Month</span>
          <strong>{money(paymentsThisMonth)}</strong>
        </div>
        <div className="metric">
          <span className="eyebrow">Unreconciled Entries</span>
          <strong>{unreconciledCount}</strong>
        </div>
      </div>

      {/* Trust Ledger Panel */}
      <div className="panel">
        <div className="panel-head">
          <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <Scale size={16} />
            Trust Ledger
          </span>
          <button
            className="ghost small"
            onClick={() => setShowEntryForm(v => !v)}
            style={{ display: "flex", alignItems: "center", gap: 4 }}
          >
            <Plus size={14} />
            Record trust entry
            {showEntryForm ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </button>
        </div>

        {showEntryForm && (
          <div className="inline-form-toggle">
            <form className="form" onSubmit={handleEntrySubmit}>
              <div className="form-row">
                <label>
                  Client Name *
                  <input
                    type="text"
                    value={clientName}
                    onChange={e => setClientName(e.target.value)}
                    required
                    placeholder="Client name"
                  />
                </label>
                <label>
                  Description *
                  <input
                    type="text"
                    value={description}
                    onChange={e => setDescription(e.target.value)}
                    required
                    placeholder="Transaction description"
                  />
                </label>
              </div>
              <div className="form-row">
                <label>
                  Reference
                  <input
                    type="text"
                    value={reference}
                    onChange={e => setReference(e.target.value)}
                    placeholder="Reference number"
                  />
                </label>
                <label>
                  Entry Type
                  <select value={entryType} onChange={e => setEntryType(e.target.value as TrustTransaction["entryType"])}>
                    <option value="receipt">Receipt</option>
                    <option value="payment">Payment</option>
                    <option value="transfer_in">Transfer In</option>
                    <option value="transfer_out">Transfer Out</option>
                    <option value="adjustment">Adjustment</option>
                  </select>
                </label>
              </div>
              <div className="form-row">
                <label>
                  Amount (ZAR) *
                  <input
                    type="number"
                    min="0.01"
                    step="0.01"
                    value={amountInput}
                    onChange={e => setAmountInput(e.target.value)}
                    required
                    placeholder="0.00"
                  />
                </label>
                <label>
                  Value Date
                  <input
                    type="date"
                    value={valueDate}
                    onChange={e => setValueDate(e.target.value)}
                  />
                </label>
              </div>
              <div className="form-row">
                <button type="submit" className="primary small" disabled={entryLoading}>
                  {entryLoading ? "Saving…" : "Record Entry"}
                </button>
                <button type="button" className="ghost small" onClick={() => setShowEntryForm(false)}>
                  Cancel
                </button>
              </div>
            </form>
          </div>
        )}

        <div className="trust-ledger">
          <table className="table">
            <thead>
              <tr className="row">
                <th>Date</th>
                <th>Client</th>
                <th>Description</th>
                <th>Reference</th>
                <th>Type</th>
                <th>Amount</th>
                <th>Running Balance</th>
                <th>Reconciled</th>
              </tr>
            </thead>
            <tbody>
              {transactions.length === 0 ? (
                <tr className="row">
                  <td colSpan={8} style={{ textAlign: "center", padding: "1.5rem", color: "var(--muted)" }}>
                    No trust entries yet. Record your first entry above.
                  </td>
                </tr>
              ) : (
                transactions.map(t => (
                  <tr key={t.id} className="trust-entry row">
                    <td>{t.valueDate}</td>
                    <td>{t.clientName}</td>
                    <td>{t.description}</td>
                    <td>{t.reference || "—"}</td>
                    <td>{entryTypePill(t.entryType)}</td>
                    <td className={isCredit(t.entryType) ? "trust-amount-credit" : "trust-amount-debit"}>
                      {isCredit(t.entryType) ? "+" : "-"}{money(t.amountCents)}
                    </td>
                    <td className="ledger-running-balance">{money(t.runningBalanceCents)}</td>
                    <td style={{ textAlign: "center" }}>
                      {t.reconciled ? <CheckCircle2 size={16} color="var(--green, #16a34a)" /> : ""}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Monthly Reconciliation Panel */}
      <div className="panel">
        <div className="panel-head">
          <span>Monthly Reconciliation</span>
          <button
            className="ghost small"
            onClick={() => setShowReconForm(v => !v)}
            style={{ display: "flex", alignItems: "center", gap: 4 }}
          >
            <Plus size={14} />
            Reconcile month
            {showReconForm ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </button>
        </div>

        {showReconForm && (
          <div className="inline-form-toggle">
            <form className="form" onSubmit={handleReconSubmit}>
              <div className="form-row">
                <label>
                  Period Month *
                  <input
                    type="text"
                    value={periodMonth}
                    onChange={e => setPeriodMonth(e.target.value)}
                    placeholder="2026-06"
                    required
                  />
                </label>
                <label>
                  Status
                  <select value={reconStatus} onChange={e => setReconStatus(e.target.value as TrustReconciliation["status"])}>
                    <option value="Draft">Draft</option>
                    <option value="Submitted">Submitted</option>
                    <option value="LPC Approved">LPC Approved</option>
                  </select>
                </label>
              </div>
              <div className="form-row">
                <label>
                  Bank Statement Balance (ZAR) *
                  <input
                    type="number"
                    step="0.01"
                    value={bankStatementInput}
                    onChange={e => setBankStatementInput(e.target.value)}
                    placeholder="0.00"
                    required
                  />
                </label>
                <label>
                  Ledger Balance (ZAR) *
                  <input
                    type="number"
                    step="0.01"
                    value={ledgerInput}
                    onChange={e => setLedgerInput(e.target.value)}
                    placeholder="0.00"
                    required
                  />
                </label>
              </div>
              <div className="form-row">
                <label>
                  Client Credit Total (ZAR) *
                  <input
                    type="number"
                    step="0.01"
                    value={clientCreditInput}
                    onChange={e => setClientCreditInput(e.target.value)}
                    placeholder="0.00"
                    required
                  />
                </label>
                <label>
                  Notes
                  <textarea
                    value={reconNotes}
                    onChange={e => setReconNotes(e.target.value)}
                    placeholder="Optional notes"
                    rows={2}
                  />
                </label>
              </div>
              <div className="form-row">
                <button type="submit" className="primary small" disabled={reconLoading}>
                  {reconLoading ? "Saving…" : "Save Reconciliation"}
                </button>
                <button type="button" className="ghost small" onClick={() => setShowReconForm(false)}>
                  Cancel
                </button>
              </div>
            </form>
          </div>
        )}

        <div className="recon-table">
          <table className="table">
            <thead>
              <tr className="row">
                <th>Period</th>
                <th>Bank Balance</th>
                <th>Ledger Balance</th>
                <th>Client Credits</th>
                <th>Difference</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {reconciliations.length === 0 ? (
                <tr className="row">
                  <td colSpan={6} style={{ textAlign: "center", padding: "1.5rem", color: "var(--muted)" }}>
                    No reconciliations yet. Start your first monthly reconciliation above.
                  </td>
                </tr>
              ) : (
                reconciliations.map(r => {
                  const diff = r.bankStatementBalanceCents - r.ledgerBalanceCents;
                  return (
                    <tr key={r.id} className="row">
                      <td>{r.periodMonth}</td>
                      <td>{money(r.bankStatementBalanceCents)}</td>
                      <td>{money(r.ledgerBalanceCents)}</td>
                      <td>{money(r.clientCreditTotalCents)}</td>
                      <td style={{ color: diff === 0 ? "var(--green, #16a34a)" : "var(--rose, #e11d48)", fontWeight: 600 }}>
                        {diff === 0 ? "Balanced" : money(Math.abs(diff))}
                      </td>
                      <td>
                        <span className={reconStatusClass(r.status)}>{r.status}</span>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Compliance Summary Strip */}
      <div className="compliance-summary">
        <div className="compliance-stat">
          <span className="eyebrow">Total Entries</span>
          <strong>{transactions.length}</strong>
        </div>
        <div className="compliance-stat">
          <span className="eyebrow">Receipts</span>
          <strong>{receiptsCount}</strong>
        </div>
        <div className="compliance-stat">
          <span className="eyebrow">Payments</span>
          <strong>{paymentsCount}</strong>
        </div>
        <div className="compliance-stat">
          <span className="eyebrow">Reconciled Months</span>
          <strong>{reconciledMonths}</strong>
        </div>
      </div>
    </div>
  );
}
