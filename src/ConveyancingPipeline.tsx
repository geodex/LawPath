import { AlertTriangle, CheckCircle2, ChevronDown, ChevronRight, Home, Plus, TrendingUp } from "lucide-react";
import { FormEvent, useState } from "react";
import { advanceConveyancingStage, createConveyancingMatter, updateConveyancingClearances } from "./api";
import type { ConveyancingMatter, ConveyancingStage } from "./types";

const money = (cents: number) => new Intl.NumberFormat("en-ZA", { style: "currency", currency: "ZAR", maximumFractionDigits: 0 }).format(cents / 100);
const today = () => new Date().toISOString().slice(0, 10);
const uid = (p: string) => `${p}-${Math.random().toString(36).slice(2, 7).toUpperCase()}`;

const ALL_STAGES: ConveyancingStage[] = [
  "instruction_received", "fica_verification", "bond_cancellation_instructions",
  "draft_deeds", "sars_transfer_duty", "rates_clearance", "levy_clearance",
  "deeds_lodgement", "deeds_registration", "completed"
];

const STAGE_LABELS: Record<ConveyancingStage, string> = {
  instruction_received: "Instruction", fica_verification: "FICA",
  bond_cancellation_instructions: "Bond cancel", draft_deeds: "Draft deeds",
  sars_transfer_duty: "SARS duty", rates_clearance: "Rates",
  levy_clearance: "Levy", deeds_lodgement: "Lodgement",
  deeds_registration: "Registration", completed: "Complete"
};

const MATTER_TYPE_LABELS: Record<ConveyancingMatter["matterType"], string> = {
  transfer: "Transfer", bond_registration: "Bond registration",
  bond_cancellation: "Bond cancellation", sectional_title: "Sectional title",
  notarial_bond: "Notarial bond"
};

const CLEARANCE_STATUSES = ["Not requested", "Requested", "Received", "Expired"] as const;
const FICA_STATUSES = ["Pending", "In Progress", "Compliant"] as const;

function calcTransferDuty(priceCents: number): number {
  const p = priceCents / 100;
  if (p <= 1_100_000) return 0;
  if (p <= 1_512_500) return Math.round((p - 1_100_000) * 0.03 * 100);
  if (p <= 2_117_500) return Math.round((40_250 + (p - 1_512_500) * 0.06) * 100);
  if (p <= 2_722_500) return Math.round((76_550 + (p - 2_117_500) * 0.08) * 100);
  if (p <= 12_100_000) return Math.round((124_950 + (p - 2_722_500) * 0.11) * 100);
  return Math.round((1_156_550 + (p - 12_100_000) * 0.13) * 100);
}

function buildDefaultStages(currentStage: ConveyancingStage) {
  const idx = ALL_STAGES.indexOf(currentStage);
  return ALL_STAGES.map((stage, i) => ({
    stage, label: STAGE_LABELS[stage],
    status: (i < idx ? "completed" : i === idx ? "in_progress" : "pending") as "completed" | "in_progress" | "pending" | "blocked",
    completedAt: "", notes: ""
  }));
}

function daysUntil(dateStr: string) {
  if (!dateStr) return null;
  return Math.ceil((new Date(dateStr).getTime() - Date.now()) / 86400000);
}

export function ConveyancingPipeline({
  matters, setMatters, log, showToast
}: {
  matters: ConveyancingMatter[];
  setMatters: React.Dispatch<React.SetStateAction<ConveyancingMatter[]>>;
  log: (msg: string) => void;
  showToast: (type: "success" | "error" | "info", title: string, msg: string) => void;
}) {
  const [showForm, setShowForm] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [advanceNotes, setAdvanceNotes] = useState("");
  const [showAdvance, setShowAdvance] = useState(false);
  const [priceInput, setPriceInput] = useState("");
  const [calcDuty, setCalcDuty] = useState(0);
  const [calcFee, setCalcFee] = useState(0);
  const [windeedResults, setWindeedResults] = useState<any[]>([]);
  const [windeedQuery, setWindeedQuery] = useState("");
  const [windeedLoading, setWindeedLoading] = useState(false);

  const selected = matters.find(m => m.id === selectedId) ?? null;
  const totalFees = matters.reduce((s, m) => s + m.conveyancingFeeCents + m.vatOnFeeCents, 0);
  const activeCount = matters.filter(m => m.currentStage !== "completed").length;

  function onPriceBlur(val: string) {
    const cents = Math.round(parseFloat(val.replace(/[^0-9.]/g, "") || "0") * 100);
    setCalcDuty(calcTransferDuty(cents));
    setCalcFee(Math.round(cents * 0.015));
  }

  async function handleCreate(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const priceCents = Math.round(parseFloat(String(f.get("purchasePrice") || "0").replace(/[^0-9.]/g, "")) * 100);
    const duty = calcTransferDuty(priceCents);
    const fee = Math.round(priceCents * 0.015);
    const input: Omit<ConveyancingMatter, "id" | "stages"> = {
      matterRef: String(f.get("matterRef")),
      matterType: String(f.get("matterType")) as ConveyancingMatter["matterType"],
      sellerName: String(f.get("sellerName")),
      buyerName: String(f.get("buyerName")),
      propertyDescription: String(f.get("propertyDescription")),
      erfNumber: String(f.get("erfNumber") || ""),
      purchasePriceCents: priceCents,
      transferDutyCents: duty,
      conveyancingFeeCents: fee,
      vatOnFeeCents: Math.round(fee * 0.15),
      estateAgent: String(f.get("estateAgent") || ""),
      bondBank: String(f.get("bondBank") || ""),
      currentStage: "instruction_received",
      ficaStatus: "Pending",
      ratesClearanceStatus: "Not requested",
      levyClearanceStatus: "Not requested",
      ratesClearanceExpiry: "",
      levyClearanceExpiry: "",
      targetRegistrationDate: String(f.get("targetRegistrationDate") || ""),
      notes: String(f.get("notes") || "")
    };
    try {
      const res = await createConveyancingMatter(input);
      setMatters(prev => [res.matter, ...prev]);
      showToast("success", "Matter created", `${input.matterRef} — ${input.sellerName} → ${input.buyerName}`);
      log(`Conveyancing matter created: ${input.matterRef}`);
    } catch {
      const local: ConveyancingMatter = { id: uid("CM"), ...input, stages: buildDefaultStages("instruction_received") };
      setMatters(prev => [local, ...prev]);
      showToast("info", "Saved locally", "Matter saved. Connect API to persist.");
    }
    setShowForm(false);
  }

  async function handleAdvanceStage() {
    if (!selected) return;
    const currentIdx = ALL_STAGES.indexOf(selected.currentStage);
    if (currentIdx >= ALL_STAGES.length - 1) return;
    const nextStage = ALL_STAGES[currentIdx + 1];
    try {
      const res = await advanceConveyancingStage(selected.id, nextStage, advanceNotes);
      setMatters(prev => prev.map(m => m.id === selected.id ? res.matter : m));
      showToast("success", "Stage advanced", `${STAGE_LABELS[nextStage]}`);
      log(`Conveyancing ${selected.matterRef} → ${STAGE_LABELS[nextStage]}`);
    } catch {
      setMatters(prev => prev.map(m => m.id === selected.id
        ? { ...m, currentStage: nextStage, stages: buildDefaultStages(nextStage) } : m));
      showToast("info", "Updated locally", "Stage advanced locally.");
    }
    setShowAdvance(false);
    setAdvanceNotes("");
  }

  async function handleWindeedSearch() {
    if (!windeedQuery.trim()) return;
    setWindeedLoading(true);
    try {
      const token = localStorage.getItem("lawpath.auth.token") || "";
      const res = await fetch(`/api/windeed/search?q=${encodeURIComponent(windeedQuery)}&type=erf`, { headers: { Authorization: `Bearer ${token}` } });
      const data = await res.json();
      setWindeedResults(data.results || []);
      if (data.note) showToast("info", "Windeed", data.note);
    } catch {
      showToast("error", "Search failed", "Could not search property register.");
    } finally {
      setWindeedLoading(false);
    }
  }

  async function handleClearanceUpdate(field: string, value: string) {
    if (!selected) return;
    const patch: Partial<ConveyancingMatter> = { [field]: value };
    try {
      const res = await updateConveyancingClearances(selected.id, patch);
      setMatters(prev => prev.map(m => m.id === selected.id ? res.matter : m));
    } catch {
      setMatters(prev => prev.map(m => m.id === selected.id ? { ...m, ...patch } : m));
    }
    showToast("success", "Updated", `${field} updated.`);
  }

  return (
    <>
      <section className="metrics">
        <div className="metric"><span>Total matters</span><strong>{matters.length}</strong><small>All types</small></div>
        <div className="metric"><span>Active transfers</span><strong>{activeCount}</strong><small>Not yet completed</small></div>
        <div className="metric"><span>Completed</span><strong>{matters.length - activeCount}</strong><small>Registered</small></div>
        <div className="metric"><span>Total fees excl. VAT</span><strong>{money(totalFees)}</strong><small>Conveyancing fees</small></div>
      </section>

      <section className="tier1-section">
        <div className="panel-head">
          <h3>Conveyancing matters</h3>
          <button className="primary small" onClick={() => setShowForm(v => !v)}>
            <Plus size={16} /> {showForm ? "Cancel" : "New matter"}
          </button>
        </div>

        {showForm && (
          <div className="inline-form-toggle">
            <form className="form" onSubmit={handleCreate}>
              <div className="form-row">
                <label>Matter ref<input name="matterRef" required placeholder="M-2026-001" /></label>
                <label>Matter type
                  <select name="matterType">
                    {Object.entries(MATTER_TYPE_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                  </select>
                </label>
              </div>
              <div className="form-row">
                <label>Seller full name<input name="sellerName" required placeholder="Seller name" /></label>
                <label>Buyer full name<input name="buyerName" required placeholder="Buyer name" /></label>
              </div>
              <label>Property description<input name="propertyDescription" required placeholder="Erf 1234, Sandton, Gauteng" /></label>
              <div className="form-row">
                <label>Erf / unit number<input name="erfNumber" placeholder="Erf 1234" /></label>
                <label>Estate agent<input name="estateAgent" placeholder="Agency name" /></label>
              </div>
              <div className="form-row">
                <label>Bond bank<input name="bondBank" placeholder="FNB / ABSA / Standard Bank / Nedbank" /></label>
                <label>Target registration date<input name="targetRegistrationDate" type="date" /></label>
              </div>
              <div className="form-row">
                <label>Purchase price (ZAR)
                  <input name="purchasePrice" placeholder="e.g. 2500000"
                    value={priceInput}
                    onChange={e => setPriceInput(e.target.value)}
                    onBlur={e => onPriceBlur(e.target.value)} />
                </label>
                <label>Transfer duty (auto-calculated)
                  <input readOnly value={calcDuty ? money(calcDuty) : "R 0"} style={{ background: "#f5f8f5", color: "var(--green-dark)" }} />
                </label>
              </div>
              {calcFee > 0 && (
                <p className="transfer-duty-note">
                  Prescribed conveyancing fee (GN R234): {money(calcFee)} excl. VAT ({money(Math.round(calcFee * 0.15))} VAT) — attorney review required before issuing account.
                </p>
              )}
              <label>Notes<textarea name="notes" rows={2} /></label>
              <button className="primary" type="submit">Create matter</button>
            </form>
          </div>
        )}

        <div style={{ marginTop: 14 }}>
          {matters.map(m => (
            <div key={m.id}
              className={`conv-matter-card${selectedId === m.id ? " selected" : ""}`}
              onClick={() => setSelectedId(selectedId === m.id ? null : m.id)}>
              <div className="conv-matter-head" style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                <div>
                  <strong>{m.matterRef}</strong>
                  <span style={{ marginLeft: 10, color: "var(--muted)", fontSize: "0.85rem" }}>{MATTER_TYPE_LABELS[m.matterType]}</span>
                  <p style={{ margin: "4px 0 0", fontSize: "0.88rem" }}>{m.sellerName} → {m.buyerName}</p>
                  <p style={{ margin: "2px 0 0", fontSize: "0.83rem", color: "var(--muted)" }}>{m.propertyDescription}</p>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span className={`pill ${m.currentStage === "completed" ? "recon-status-approved" : "time-status-wip"}`}>
                    {STAGE_LABELS[m.currentStage]}
                  </span>
                  {selectedId === m.id ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                </div>
              </div>

              {selectedId === m.id && (
                <div style={{ marginTop: 18 }} onClick={e => e.stopPropagation()}>
                  {/* Stage pipeline */}
                  <h4 style={{ margin: "0 0 12px" }}>Transfer pipeline</h4>
                  <div className="conv-stage-track">
                    {ALL_STAGES.map((stage, i) => {
                      const stageRec = m.stages.find(s => s.stage === stage);
                      const status = stageRec?.status ?? (i < ALL_STAGES.indexOf(m.currentStage) ? "completed" : i === ALL_STAGES.indexOf(m.currentStage) ? "in_progress" : "pending");
                      return (
                        <div key={stage} style={{ display: "flex", alignItems: "center" }}>
                          <div className="conv-stage-wrapper">
                            <div className={`conv-stage-dot ${status}`}>
                              {status === "completed" ? <CheckCircle2 size={14} /> : i + 1}
                            </div>
                            <div className="conv-stage-label">{STAGE_LABELS[stage]}</div>
                          </div>
                          {i < ALL_STAGES.length - 1 && (
                            <div className={`conv-stage-line${status === "completed" ? " completed" : ""}`} />
                          )}
                        </div>
                      );
                    })}
                  </div>

                  {m.currentStage !== "completed" && (
                    <div style={{ marginTop: 14 }}>
                      {!showAdvance ? (
                        <button className="primary small" onClick={() => setShowAdvance(true)}>
                          Advance to: {STAGE_LABELS[ALL_STAGES[ALL_STAGES.indexOf(m.currentStage) + 1]] ?? "Complete"}
                        </button>
                      ) : (
                        <div className="inline-form-toggle" style={{ marginTop: 0 }}>
                          <label style={{ display: "grid", gap: 6, fontWeight: 600, fontSize: "0.88rem" }}>
                            Notes for this stage
                            <textarea rows={2} value={advanceNotes} onChange={e => setAdvanceNotes(e.target.value)} />
                          </label>
                          <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
                            <button className="primary small" onClick={handleAdvanceStage}>Confirm advance</button>
                            <button className="ghost small" onClick={() => setShowAdvance(false)}>Cancel</button>
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Clearances */}
                  <h4 style={{ margin: "20px 0 10px" }}>Clearances & FICA</h4>
                  <div className="conv-fee-summary">
                    <div className="conv-clearance-row">
                      <span>FICA status</span>
                      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                        <select value={m.ficaStatus} onChange={e => handleClearanceUpdate("ficaStatus", e.target.value)}>
                          {FICA_STATUSES.map(s => <option key={s}>{s}</option>)}
                        </select>
                        <span className={`pill ${m.ficaStatus === "Compliant" ? "recon-status-approved" : m.ficaStatus === "In Progress" ? "fica-status-in-progress" : "fica-status-pending"}`}>{m.ficaStatus}</span>
                      </div>
                    </div>
                    {(["ratesClearanceStatus", "levyClearanceStatus"] as const).map(field => {
                      const label = field === "ratesClearanceStatus" ? "Rates clearance" : "Levy clearance";
                      const expiryField = field === "ratesClearanceStatus" ? "ratesClearanceExpiry" : "levyClearanceExpiry";
                      const expiry = m[expiryField];
                      const daysLeft = expiry ? daysUntil(expiry) : null;
                      return (
                        <div key={field} className="conv-clearance-row">
                          <div>
                            <span>{label}</span>
                            {expiry && (
                              <small style={{ display: "block", color: daysLeft !== null && daysLeft < 0 ? "var(--rose)" : daysLeft !== null && daysLeft <= 30 ? "var(--gold)" : "var(--muted)" }}>
                                {daysLeft !== null && daysLeft < 0 ? "⚠ EXPIRED" : daysLeft !== null && daysLeft <= 30 ? `⚠ Expires in ${daysLeft} days` : `Expires: ${expiry}`}
                              </small>
                            )}
                          </div>
                          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                            <select value={m[field]} onChange={e => handleClearanceUpdate(field, e.target.value)}>
                              {CLEARANCE_STATUSES.map(s => <option key={s}>{s}</option>)}
                            </select>
                            <input type="date" style={{ padding: "6px 8px", border: "1px solid var(--line)", borderRadius: 6, fontSize: "0.85rem" }}
                              value={expiry}
                              onChange={e => handleClearanceUpdate(expiryField, e.target.value)} />
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Fee summary */}
                  <h4 style={{ margin: "20px 0 10px" }}>Fee summary</h4>
                  <div className="conv-fee-summary">
                    <div className="conv-fee-row"><span>Purchase price</span><strong>{money(m.purchasePriceCents)}</strong></div>
                    <div className="conv-fee-row"><span>Transfer duty (SARS)</span><strong>{money(m.transferDutyCents)}</strong></div>
                    <div className="conv-fee-row"><span>Conveyancing fee</span><strong>{money(m.conveyancingFeeCents)}</strong></div>
                    <div className="conv-fee-row"><span>VAT on fee (15%)</span><strong>{money(m.vatOnFeeCents)}</strong></div>
                    <div className="conv-fee-row conv-fee-total">
                      <span>Total (duty + fees + VAT)</span>
                      <strong>{money(m.transferDutyCents + m.conveyancingFeeCents + m.vatOnFeeCents)}</strong>
                    </div>
                    <p className="transfer-duty-note">Transfer duty scale per SARS GN R234 (2024/2025). Conveyancing fee is indicative only — prescribed tariff applies. Attorney review required before issuing account to client.</p>
                  </div>

                  {/* Windeed property search */}
                  <h4 style={{ margin: "20px 0 10px" }}>Property search (Windeed)</h4>
                  <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
                    <input value={windeedQuery} onChange={e => setWindeedQuery(e.target.value)} placeholder="Erf number, title deed or street address" style={{ flex: 1, padding: "10px 12px", border: "1px solid var(--line)", borderRadius: 8 }} onKeyDown={e => e.key === "Enter" && handleWindeedSearch()} />
                    <button className="primary small" onClick={handleWindeedSearch} disabled={windeedLoading}>{windeedLoading ? "Searching..." : "Search"}</button>
                  </div>
                  {windeedResults.map((r, i) => (
                    <div key={i} style={{ border: "1px solid var(--line)", borderRadius: 8, padding: "12px 16px", marginBottom: 8, fontSize: "0.87rem" }}>
                      <strong>{r.propertyDescription}</strong>
                      <div style={{ color: "var(--muted)", marginTop: 4 }}>
                        <span>ERF: {r.erfNumber}</span> · <span>Title deed: {r.titleDeedNumber}</span>
                      </div>
                      <div style={{ marginTop: 4 }}>Owner: {r.registeredOwner} · Bond: {r.bondHolder}</div>
                      <div style={{ marginTop: 4 }}>Value: {r.municipalValue} · Rates: {r.ratesLevied}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
          {matters.length === 0 && <p style={{ color: "var(--muted)", textAlign: "center", padding: 24 }}>No conveyancing matters yet. Create the first one above.</p>}
        </div>
      </section>

      <section className="compliance-summary">
        {(["transfer", "bond_registration", "bond_cancellation", "sectional_title"] as ConveyancingMatter["matterType"][]).map(type => (
          <div key={type} className="compliance-stat">
            <strong>{matters.filter(m => m.matterType === type).length}</strong>
            <span>{MATTER_TYPE_LABELS[type]}</span>
          </div>
        ))}
      </section>
    </>
  );
}
