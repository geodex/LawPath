import { Clock, FileText, Pause, Play, Plus, X } from "lucide-react";
import { FormEvent, useEffect, useState } from "react";
import { createTimeEntry, updateTimeEntryStatus } from "./api";
import type { TimeEntry } from "./types";

const money = (cents: number) =>
  new Intl.NumberFormat("en-ZA", { style: "currency", currency: "ZAR", maximumFractionDigits: 0 }).format(cents / 100);
const today = () => new Date().toISOString().slice(0, 10);
const uid = (prefix: string) => `${prefix}-${Math.random().toString(36).slice(2, 7).toUpperCase()}`;
const thisMonth = () => new Date().toISOString().slice(0, 7);

const activityLabels: Record<TimeEntry["activityType"], string> = {
  professional_fee: "Professional fee",
  attendance: "Attendance",
  consultation: "Consultation",
  research: "Research",
  drafting: "Drafting",
  court_appearance: "Court appearance",
  correspondence: "Correspondence",
  telephone: "Telephone",
  travel: "Travel",
  disbursement: "Disbursement",
  disbursement_recovery: "Disbursement recovery",
};

function formatTimer(secs: number) {
  const h = Math.floor(secs / 3600).toString().padStart(2, "0");
  const m = Math.floor((secs % 3600) / 60).toString().padStart(2, "0");
  const s = (secs % 60).toString().padStart(2, "0");
  return `${h}:${m}:${s}`;
}

function formatDuration(minutes: number, isDisbursement: boolean) {
  if (isDisbursement) return "—";
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

function statusClass(status: TimeEntry["status"]) {
  switch (status) {
    case "WIP": return "time-status-wip";
    case "Billed": return "time-status-billed";
    case "Written off": return "time-status-written-off";
    case "On hold": return "time-status-on-hold";
  }
}

interface Props {
  entries: TimeEntry[];
  setEntries: React.Dispatch<React.SetStateAction<TimeEntry[]>>;
  wipCents: number;
  setWipCents: React.Dispatch<React.SetStateAction<number>>;
  log: (msg: string) => void;
  showToast: (type: "success" | "error" | "info", title: string, msg: string) => void;
}

export function TimeRecording({ entries, setEntries, wipCents, setWipCents, log, showToast }: Props) {
  // Timer state
  const [timerRunning, setTimerRunning] = useState(false);
  const [timerSeconds, setTimerSeconds] = useState(0);
  const [timerClient, setTimerClient] = useState("");
  const [timerDesc, setTimerDesc] = useState("");

  useEffect(() => {
    if (!timerRunning) return;
    const id = setInterval(() => setTimerSeconds(s => s + 1), 1000);
    return () => clearInterval(id);
  }, [timerRunning]);

  // Form state
  const [showForm, setShowForm] = useState(false);
  const [clientName, setClientName] = useState("");
  const [matterRef, setMatterRef] = useState("");
  const [feeEarnerName, setFeeEarnerName] = useState("");
  const [entryDate, setEntryDate] = useState(today());
  const [activityType, setActivityType] = useState<TimeEntry["activityType"]>("professional_fee");
  const [description, setDescription] = useState("");
  const [isDisbursement, setIsDisbursement] = useState(false);
  const [disbursementVendor, setDisbursementVendor] = useState("");
  const [durationMinutes, setDurationMinutes] = useState(0);
  const [rateCents, setRateCents] = useState(0);
  const [amountCents, setAmountCents] = useState(0);
  const [submitting, setSubmitting] = useState(false);

  // Tab filter
  const [activeTab, setActiveTab] = useState<"WIP" | "Billed" | "Written off">("WIP");

  function handleStopAndLog() {
    setTimerRunning(false);
    const elapsed = Math.round(timerSeconds / 60);
    setTimerSeconds(0);
    setClientName(timerClient);
    setDescription(timerDesc);
    setDurationMinutes(elapsed);
    setShowForm(true);
    setTimerClient("");
    setTimerDesc("");
  }

  function recomputeAmount(mins: number, rate: number) {
    return Math.round((mins / 60) * rate);
  }

  function handleDurationBlur() {
    if (!isDisbursement) setAmountCents(recomputeAmount(durationMinutes, rateCents));
  }

  function handleRateBlur() {
    if (!isDisbursement) setAmountCents(recomputeAmount(durationMinutes, rateCents));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    const vat = Math.round(amountCents * 0.15);
    const payload: Omit<TimeEntry, "id"> = {
      clientName,
      matterRef,
      feeEarnerName,
      entryDate,
      activityType,
      description,
      durationMinutes,
      rateCents,
      amountCents,
      vatAmountCents: vat,
      status: "WIP",
      isDisbursement,
    };
    try {
      const res = await createTimeEntry(payload);
      setEntries(prev => [res.entry, ...prev]);
      if (!isDisbursement) setWipCents(prev => prev + amountCents);
      showToast("success", "Time entry logged", `${money(amountCents)} + VAT recorded.`);
      log(`Time recorded: ${money(amountCents)} for ${clientName}`);
    } catch {
      const local: TimeEntry = { id: uid("TE"), ...payload };
      setEntries(prev => [local, ...prev]);
      if (!isDisbursement) setWipCents(prev => prev + amountCents);
      showToast("info", "Saved locally", "Entry saved locally.");
    }
    // Reset form
    setClientName("");
    setMatterRef("");
    setFeeEarnerName("");
    setEntryDate(today());
    setActivityType("professional_fee");
    setDescription("");
    setIsDisbursement(false);
    setDisbursementVendor("");
    setDurationMinutes(0);
    setRateCents(0);
    setAmountCents(0);
    setShowForm(false);
    setSubmitting(false);
  }

  async function changeStatus(entry: TimeEntry, newStatus: TimeEntry["status"]) {
    try {
      const res = await updateTimeEntryStatus(entry.id, newStatus);
      setEntries(prev => prev.map(e => e.id === entry.id ? res.entry : e));
    } catch {
      setEntries(prev => prev.map(e => e.id === entry.id ? { ...e, status: newStatus } : e));
    }
    if (entry.status === "WIP") setWipCents(prev => prev - entry.amountCents);
    showToast("success", "Status updated", `Entry marked ${newStatus}.`);
    log(`Time entry ${entry.id} → ${newStatus}`);
  }

  // Metrics
  const wipEntries = entries.filter(e => e.status === "WIP");
  const thisMonthStr = thisMonth();
  const entriesThisMonth = entries.filter(e => e.entryDate.startsWith(thisMonthStr));
  const disbursementsWip = wipEntries.filter(e => e.isDisbursement).reduce((s, e) => s + e.amountCents, 0);
  const billedThisMonth = entries
    .filter(e => e.status === "Billed" && e.entryDate.startsWith(thisMonthStr))
    .reduce((s, e) => s + e.amountCents, 0);

  // Draft bill
  const wipFees = wipEntries.filter(e => !e.isDisbursement).reduce((s, e) => s + e.amountCents, 0);
  const wipDisb = wipEntries.filter(e => e.isDisbursement).reduce((s, e) => s + e.amountCents, 0);
  const wipSubtotal = wipFees + wipDisb;
  const wipVat = wipEntries.reduce((s, e) => s + e.vatAmountCents, 0);
  const wipTotal = wipSubtotal + wipVat;

  // Filtered entries
  const filteredEntries = entries.filter(e => e.status === activeTab);

  return (
    <div className="tier1-section">
      <div className="panel-head">
        <span className="eyebrow"><Clock size={16} /> Time Recording</span>
        <button className="primary small" onClick={() => setShowForm(v => !v)}>
          <Plus size={14} /> Log time
        </button>
      </div>

      {/* Timer widget */}
      <div className="timer-widget">
        <div className="timer-display">{formatTimer(timerSeconds)}</div>
        <div style={{ display: "flex", gap: "0.5rem", marginBottom: "0.5rem" }}>
          <input
            type="text"
            placeholder="Client"
            value={timerClient}
            onChange={e => setTimerClient(e.target.value)}
            style={{ flex: 1 }}
          />
          <input
            type="text"
            placeholder="Description"
            value={timerDesc}
            onChange={e => setTimerDesc(e.target.value)}
            style={{ flex: 2 }}
          />
        </div>
        <div className="timer-controls">
          <button
            className="primary small"
            onClick={() => setTimerRunning(true)}
            disabled={timerRunning}
            title="Start"
          >
            <Play size={14} />
          </button>
          <button
            className="ghost small"
            onClick={() => setTimerRunning(false)}
            disabled={!timerRunning}
            title="Pause"
          >
            <Pause size={14} />
          </button>
          <button
            className="ghost small"
            onClick={handleStopAndLog}
            disabled={timerSeconds === 0}
            title="Stop & Log"
          >
            <X size={14} /> Stop &amp; Log
          </button>
        </div>
      </div>

      {/* Metrics */}
      <div className="metrics">
        <div className="metric">
          <span className="eyebrow">WIP Total</span>
          <strong>{money(wipCents)}</strong>
        </div>
        <div className="metric">
          <span className="eyebrow">Entries This Month</span>
          <strong>{entriesThisMonth.length}</strong>
        </div>
        <div className="metric">
          <span className="eyebrow">Disbursements WIP</span>
          <strong>{money(disbursementsWip)}</strong>
        </div>
        <div className="metric">
          <span className="eyebrow">Billed This Month</span>
          <strong>{money(billedThisMonth)}</strong>
        </div>
      </div>

      {/* Inline form */}
      {showForm && (
        <div className="inline-form-toggle">
          <form className="form" onSubmit={handleSubmit}>
            <div className="form-row">
              <label>
                Client *
                <input
                  type="text"
                  required
                  value={clientName}
                  onChange={e => setClientName(e.target.value)}
                />
              </label>
              <label>
                Matter Ref
                <input
                  type="text"
                  value={matterRef}
                  onChange={e => setMatterRef(e.target.value)}
                />
              </label>
            </div>
            <div className="form-row">
              <label>
                Fee Earner *
                <input
                  type="text"
                  required
                  value={feeEarnerName}
                  onChange={e => setFeeEarnerName(e.target.value)}
                />
              </label>
              <label>
                Date
                <input
                  type="date"
                  value={entryDate}
                  onChange={e => setEntryDate(e.target.value)}
                />
              </label>
            </div>
            <div className="form-row">
              <label>
                Activity Type
                <select
                  value={activityType}
                  onChange={e => setActivityType(e.target.value as TimeEntry["activityType"])}
                >
                  {(Object.keys(activityLabels) as TimeEntry["activityType"][]).map(k => (
                    <option key={k} value={k}>{activityLabels[k]}</option>
                  ))}
                </select>
              </label>
              <label style={{ display: "flex", alignItems: "center", gap: "0.5rem", paddingTop: "1.2rem" }}>
                <input
                  type="checkbox"
                  checked={isDisbursement}
                  onChange={e => setIsDisbursement(e.target.checked)}
                />
                Disbursement
              </label>
            </div>
            {isDisbursement && (
              <div className="form-row">
                <label>
                  Vendor
                  <input
                    type="text"
                    value={disbursementVendor}
                    onChange={e => setDisbursementVendor(e.target.value)}
                  />
                </label>
              </div>
            )}
            {!isDisbursement && (
              <div className="form-row">
                <label>
                  Duration (minutes)
                  <input
                    type="number"
                    min={0}
                    value={durationMinutes}
                    onChange={e => setDurationMinutes(Number(e.target.value))}
                    onBlur={handleDurationBlur}
                  />
                </label>
                <label>
                  Hourly Rate (ZAR)
                  <input
                    type="number"
                    min={0}
                    value={rateCents / 100}
                    onChange={e => setRateCents(Math.round(Number(e.target.value) * 100))}
                    onBlur={handleRateBlur}
                  />
                </label>
              </div>
            )}
            <div className="form-row">
              <label>
                Amount (ZAR)
                <input
                  type="number"
                  min={0}
                  value={amountCents / 100}
                  onChange={e => setAmountCents(Math.round(Number(e.target.value) * 100))}
                />
              </label>
            </div>
            <div className="form-row">
              <label style={{ flex: 1 }}>
                Description *
                <textarea
                  required
                  rows={3}
                  value={description}
                  onChange={e => setDescription(e.target.value)}
                  style={{ width: "100%" }}
                />
              </label>
            </div>
            <div style={{ display: "flex", gap: "0.5rem" }}>
              <button type="submit" className="primary small" disabled={submitting}>
                {submitting ? "Saving…" : "Save Entry"}
              </button>
              <button type="button" className="ghost small" onClick={() => setShowForm(false)}>
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Tab filter */}
      <div style={{ display: "flex", gap: "0.5rem", margin: "1rem 0 0.5rem" }}>
        {(["WIP", "Billed", "Written off"] as const).map(tab => (
          <button
            key={tab}
            className={activeTab === tab ? "primary small" : "ghost small"}
            onClick={() => setActiveTab(tab)}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* Entry table */}
      <div className="wip-table">
        <div className="wip-row" style={{ fontWeight: 600, fontSize: "0.8rem", opacity: 0.7 }}>
          <span>Date</span>
          <span>Client</span>
          <span>Matter</span>
          <span>Fee Earner</span>
          <span>Activity</span>
          <span>Description</span>
          <span>Duration</span>
          <span>Amount</span>
          <span>VAT</span>
          <span>Status</span>
          <span>Actions</span>
        </div>
        {filteredEntries.length === 0 && (
          <div style={{ padding: "1.5rem", textAlign: "center", opacity: 0.5 }}>
            No {activeTab} entries.
          </div>
        )}
        {filteredEntries.map(entry => (
          <div className="wip-row" key={entry.id}>
            <span>{entry.entryDate}</span>
            <span>{entry.clientName}</span>
            <span>{entry.matterRef || "—"}</span>
            <span>{entry.feeEarnerName}</span>
            <span>
              <span className="activity-type-badge pill">{activityLabels[entry.activityType]}</span>
            </span>
            <span title={entry.description}>
              {entry.description.length > 50 ? entry.description.slice(0, 50) + "…" : entry.description}
            </span>
            <span>{formatDuration(entry.durationMinutes, entry.isDisbursement)}</span>
            <span>{money(entry.amountCents)}</span>
            <span>{money(entry.vatAmountCents)}</span>
            <span>
              <span className={`pill ${statusClass(entry.status)}`}>{entry.status}</span>
            </span>
            <span>
              {entry.status === "WIP" && (
                <span style={{ display: "flex", gap: "0.25rem" }}>
                  <button
                    className="primary small"
                    onClick={() => changeStatus(entry, "Billed")}
                  >
                    Bill
                  </button>
                  <button
                    className="ghost small"
                    onClick={() => changeStatus(entry, "Written off")}
                  >
                    Write off
                  </button>
                </span>
              )}
            </span>
          </div>
        ))}
      </div>

      {/* Draft Bill Summary */}
      {activeTab === "WIP" && wipEntries.length > 0 && (
        <div className="draft-bill-panel">
          <div className="eyebrow" style={{ marginBottom: "0.75rem" }}>
            <FileText size={14} /> Draft Bill Summary
          </div>
          <div className="draft-bill-row">
            <span>Professional Fees</span>
            <span>{money(wipFees)}</span>
          </div>
          <div className="draft-bill-row">
            <span>Disbursements</span>
            <span>{money(wipDisb)}</span>
          </div>
          <div className="draft-bill-row">
            <span>Subtotal</span>
            <span>{money(wipSubtotal)}</span>
          </div>
          <div className="draft-bill-row">
            <span>VAT (15%)</span>
            <span>{money(wipVat)}</span>
          </div>
          <div className="draft-bill-total">
            <span>Total</span>
            <span>{money(wipTotal)}</span>
          </div>
          <button
            className="ghost small"
            style={{ marginTop: "0.75rem" }}
            onClick={() => log("Draft invoice generated from WIP")}
          >
            Generate draft invoice
          </button>
        </div>
      )}
    </div>
  );
}
