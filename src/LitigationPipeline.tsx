import { AlertTriangle, Calendar, CheckCircle2, Gavel, Plus, Scale } from "lucide-react";
import { FormEvent, useState } from "react";
import { completeLitigationDeadline, createCourtDate, createCostOrder, createLitigationDeadline, createLitigationMatter } from "./api";
import type { CourtDate, CostOrder, LitigationDeadline, LitigationMatter } from "./types";

const money = (cents: number) => new Intl.NumberFormat("en-ZA", { style: "currency", currency: "ZAR", maximumFractionDigits: 0 }).format(cents / 100);
const today = () => new Date().toISOString().slice(0, 10);
const uid = (p: string) => `${p}-${Math.random().toString(36).slice(2, 7).toUpperCase()}`;
const daysRemaining = (d: string) => Math.ceil((new Date(d).getTime() - Date.now()) / 86400000);

const MATTER_TYPE_LABELS: Record<LitigationMatter["matterType"], string> = {
  opposed_motion: "Opposed motion", unopposed_motion: "Unopposed motion",
  trial: "Trial", urgent_application: "Urgent application",
  section_65: "Section 65 enquiry", section_69: "Section 69 enquiry",
  rule_43: "Rule 43 maintenance", default_judgment: "Default judgment",
  appeal: "Appeal", review: "Review"
};

const ORDER_TYPE_LABELS: Record<CostOrder["orderType"], string> = {
  costs: "Costs", costs_in_cause: "Costs in the cause",
  no_order: "No order as to costs", reserved: "Reserved",
  punitive_costs: "Punitive costs (de bonis propriis)"
};

const ROLL_TYPES = ["Unopposed", "Opposed", "Trial", "Urgent", "Appeal"] as const;

export function LitigationPipeline({
  matters, setMatters, log, showToast
}: {
  matters: LitigationMatter[];
  setMatters: React.Dispatch<React.SetStateAction<LitigationMatter[]>>;
  log: (msg: string) => void;
  showToast: (type: "success" | "error" | "info", title: string, msg: string) => void;
}) {
  const [showForm, setShowForm] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"deadlines" | "court" | "costs">("deadlines");
  const [showDeadlineForm, setShowDeadlineForm] = useState(false);
  const [showCourtForm, setShowCourtForm] = useState(false);
  const [showCostForm, setShowCostForm] = useState(false);

  const selected = matters.find(m => m.id === selectedId) ?? null;

  const allDeadlines = matters.flatMap(m => m.deadlines);
  const overdue = allDeadlines.filter(d => !d.completed && daysRemaining(d.dueDate) < 0).length;
  const thisMonth = new Date().toISOString().slice(0, 7);
  const courtDatesThisMonth = matters.flatMap(m => m.courtDates).filter(c => c.courtDate.startsWith(thisMonth)).length;
  const totalCostsInFavour = matters.flatMap(m => m.costOrders).reduce((s, o) => s + o.amountCents, 0);

  async function handleCreate(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const input: Omit<LitigationMatter, "id" | "deadlines" | "courtDates" | "costOrders"> = {
      matterRef: String(f.get("matterRef")),
      caseNumber: String(f.get("caseNumber") || ""),
      court: String(f.get("court")),
      courtDivision: String(f.get("courtDivision") || ""),
      plaintiff: String(f.get("plaintiff")),
      defendant: String(f.get("defendant")),
      matterType: String(f.get("matterType")) as LitigationMatter["matterType"],
      currentStage: "pleadings",
      claimAmountCents: Math.round(parseFloat(String(f.get("claimAmount") || "0")) * 100),
      costsRecoveredCents: 0,
      status: "Active",
      serviceDate: String(f.get("serviceDate") || ""),
      notes: String(f.get("notes") || "")
    };
    try {
      const res = await createLitigationMatter(input);
      setMatters(prev => [res.matter, ...prev]);
      showToast("success", "Matter created", `${input.matterRef} — ${input.plaintiff} v ${input.defendant}`);
      log(`Litigation matter created: ${input.matterRef}`);
    } catch {
      const local: LitigationMatter = { id: uid("LM"), ...input, deadlines: [], courtDates: [], costOrders: [] };
      setMatters(prev => [local, ...prev]);
      showToast("info", "Saved locally", "Matter saved locally.");
    }
    setShowForm(false);
    (e.target as HTMLFormElement).reset();
  }

  async function handleAddDeadline(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!selected) return;
    const f = new FormData(e.currentTarget);
    const input: Omit<LitigationDeadline, "id"> = {
      description: String(f.get("description")),
      ruleReference: String(f.get("ruleReference") || ""),
      dueDate: String(f.get("dueDate")),
      daysFromService: Number(f.get("daysFromService") || 0),
      completed: false,
      priority: String(f.get("priority")) as LitigationDeadline["priority"]
    };
    try {
      const res = await createLitigationDeadline(selected.id, input);
      setMatters(prev => prev.map(m => m.id === selected.id ? { ...m, deadlines: [...m.deadlines, res.deadline] } : m));
      showToast("success", "Deadline added", input.description);
    } catch {
      const local: LitigationDeadline = { id: uid("DL"), ...input };
      setMatters(prev => prev.map(m => m.id === selected.id ? { ...m, deadlines: [...m.deadlines, local] } : m));
      showToast("info", "Saved locally", "Deadline saved locally.");
    }
    setShowDeadlineForm(false);
    (e.target as HTMLFormElement).reset();
  }

  async function handleCompleteDeadline(deadline: LitigationDeadline) {
    if (!selected) return;
    try {
      const res = await completeLitigationDeadline(selected.id, deadline.id);
      setMatters(prev => prev.map(m => m.id === selected.id
        ? { ...m, deadlines: m.deadlines.map(d => d.id === deadline.id ? res.deadline : d) } : m));
    } catch {
      setMatters(prev => prev.map(m => m.id === selected.id
        ? { ...m, deadlines: m.deadlines.map(d => d.id === deadline.id ? { ...d, completed: true } : d) } : m));
    }
    showToast("success", "Deadline completed", deadline.description);
    log(`Deadline completed: ${deadline.description}`);
  }

  async function handleAddCourtDate(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!selected) return;
    const f = new FormData(e.currentTarget);
    const input: Omit<CourtDate, "id"> = {
      courtDate: String(f.get("courtDate")),
      courtTime: String(f.get("courtTime") || ""),
      court: String(f.get("court")),
      purpose: String(f.get("purpose")),
      rollType: String(f.get("rollType")) as CourtDate["rollType"],
      outcome: String(f.get("outcome") || ""),
      postponedTo: String(f.get("postponedTo") || "")
    };
    try {
      const res = await createCourtDate(selected.id, input);
      setMatters(prev => prev.map(m => m.id === selected.id ? { ...m, courtDates: [...m.courtDates, res.courtDate] } : m));
      showToast("success", "Court date added", `${input.courtDate} — ${input.purpose}`);
    } catch {
      setMatters(prev => prev.map(m => m.id === selected.id ? { ...m, courtDates: [...m.courtDates, { id: uid("CD"), ...input }] } : m));
      showToast("info", "Saved locally", "Court date saved locally.");
    }
    setShowCourtForm(false);
    (e.target as HTMLFormElement).reset();
  }

  async function handleAddCostOrder(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!selected) return;
    const f = new FormData(e.currentTarget);
    const input: Omit<CostOrder, "id"> = {
      orderDate: String(f.get("orderDate")),
      orderType: String(f.get("orderType")) as CostOrder["orderType"],
      inFavourOf: String(f.get("inFavourOf")),
      amountCents: Math.round(parseFloat(String(f.get("amount") || "0")) * 100),
      scale: String(f.get("scale") || ""),
      notes: String(f.get("notes") || "")
    };
    try {
      const res = await createCostOrder(selected.id, input);
      setMatters(prev => prev.map(m => m.id === selected.id ? { ...m, costOrders: [...m.costOrders, res.costOrder] } : m));
      showToast("success", "Cost order recorded", ORDER_TYPE_LABELS[input.orderType]);
    } catch {
      setMatters(prev => prev.map(m => m.id === selected.id ? { ...m, costOrders: [...m.costOrders, { id: uid("CO"), ...input }] } : m));
      showToast("info", "Saved locally", "Cost order saved locally.");
    }
    setShowCostForm(false);
    (e.target as HTMLFormElement).reset();
  }

  return (
    <>
      <div className="strike-off-notice">
        <AlertTriangle size={18} style={{ color: "var(--gold)", flexShrink: 0 }} />
        <span>Monitor court dates closely. Failure to appear or comply with time limits may result in your matter being struck off the roll. All deadlines must be calendared from service date.</span>
      </div>

      <section className="metrics">
        <div className="metric"><span>Active matters</span><strong>{matters.filter(m => m.status === "Active").length}</strong><small>In progress</small></div>
        <div className="metric"><span>Overdue deadlines</span><strong style={{ color: overdue > 0 ? "var(--rose)" : undefined }}>{overdue}</strong><small>Require immediate attention</small></div>
        <div className="metric"><span>Court dates this month</span><strong>{courtDatesThisMonth}</strong><small>{thisMonth}</small></div>
        <div className="metric"><span>Costs in favour of client</span><strong>{money(totalCostsInFavour)}</strong><small>All matters</small></div>
      </section>

      <section className="tier1-section">
        <div className="panel-head">
          <h3>Litigation matters</h3>
          <button className="primary small" onClick={() => setShowForm(v => !v)}>
            <Plus size={16} /> {showForm ? "Cancel" : "New matter"}
          </button>
        </div>

        {showForm && (
          <div className="inline-form-toggle">
            <form className="form" onSubmit={handleCreate}>
              <div className="form-row">
                <label>Matter ref<input name="matterRef" required placeholder="LIT-2026-001" /></label>
                <label>Case number<input name="caseNumber" placeholder="e.g. 12345/2026" /></label>
              </div>
              <div className="form-row">
                <label>Court<input name="court" required placeholder="e.g. Gauteng High Court, Johannesburg" /></label>
                <label>Division<input name="courtDivision" placeholder="e.g. Commercial" /></label>
              </div>
              <div className="form-row">
                <label>Plaintiff / Applicant<input name="plaintiff" required placeholder="Full legal name" /></label>
                <label>Defendant / Respondent<input name="defendant" required placeholder="Full legal name" /></label>
              </div>
              <div className="form-row">
                <label>Matter type
                  <select name="matterType">
                    {Object.entries(MATTER_TYPE_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                  </select>
                </label>
                <label>Claim amount (ZAR)<input name="claimAmount" type="number" min="0" step="0.01" placeholder="0.00" /></label>
              </div>
              <div className="form-row">
                <label>Service date<input name="serviceDate" type="date" /></label>
              </div>
              <label>Notes<textarea name="notes" rows={2} /></label>
              <button className="primary" type="submit">Create matter</button>
            </form>
          </div>
        )}

        <div style={{ marginTop: 14 }}>
          {matters.map(m => {
            const overdueCount = m.deadlines.filter(d => !d.completed && daysRemaining(d.dueDate) < 0).length;
            return (
              <div key={m.id} className={`lit-matter-card${selectedId === m.id ? " selected" : ""}`}
                onClick={() => setSelectedId(selectedId === m.id ? null : m.id)}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                  <div>
                    <strong>{m.matterRef}</strong>
                    {m.caseNumber && <span style={{ marginLeft: 8, color: "var(--muted)", fontSize: "0.83rem" }}>Case {m.caseNumber}</span>}
                    <p style={{ margin: "3px 0 0", fontSize: "0.88rem" }}>{m.plaintiff} v {m.defendant}</p>
                    <p style={{ margin: "2px 0 0", fontSize: "0.82rem", color: "var(--muted)" }}>{m.court} — {MATTER_TYPE_LABELS[m.matterType]}</p>
                  </div>
                  <div style={{ display: "flex", gap: 8, alignItems: "center", flexShrink: 0 }}>
                    {overdueCount > 0 && <span className="pill" style={{ background: "var(--rose)", color: "#fff" }}>{overdueCount} overdue</span>}
                    <span className={`pill lit-status-${m.status.toLowerCase().replace(" ", "-")}`}>{m.status}</span>
                  </div>
                </div>

                {selectedId === m.id && (
                  <div style={{ marginTop: 18 }} onClick={e => e.stopPropagation()}>
                    <div className="popia-tabs">
                      {(["deadlines", "court", "costs"] as const).map(tab => (
                        <button key={tab} className={`popia-tab${activeTab === tab ? " active" : ""}`}
                          onClick={() => setActiveTab(tab)}>
                          {tab === "deadlines" ? "Deadlines" : tab === "court" ? "Court Diary" : "Cost Orders"}
                        </button>
                      ))}
                    </div>

                    {activeTab === "deadlines" && (
                      <>
                        <div className="panel-head" style={{ marginBottom: 10 }}>
                          <span style={{ fontSize: "0.88rem", color: "var(--muted)" }}>{m.deadlines.length} deadlines</span>
                          <button className="ghost small" onClick={() => setShowDeadlineForm(v => !v)}>
                            <Plus size={14} /> Add deadline
                          </button>
                        </div>
                        {showDeadlineForm && (
                          <div className="inline-form-toggle" style={{ marginBottom: 14 }}>
                            <form className="form" onSubmit={handleAddDeadline}>
                              <label>Description<input name="description" required placeholder="e.g. Deliver plea" /></label>
                              <div className="form-row">
                                <label>Rule reference<input name="ruleReference" placeholder="e.g. Rule 22(1)" /></label>
                                <label>Due date<input name="dueDate" type="date" required /></label>
                              </div>
                              <div className="form-row">
                                <label>Days from service<input name="daysFromService" type="number" min="0" defaultValue="0" /></label>
                                <label>Priority
                                  <select name="priority">
                                    <option>Normal</option><option>Urgent</option><option>Critical</option>
                                  </select>
                                </label>
                              </div>
                              <button className="primary small" type="submit">Add deadline</button>
                            </form>
                          </div>
                        )}
                        {m.deadlines.length === 0 && <p style={{ color: "var(--muted)", fontSize: "0.87rem" }}>No deadlines recorded.</p>}
                        {m.deadlines.map(d => {
                          const days = daysRemaining(d.dueDate);
                          const dayClass = d.completed ? "" : days < 0 ? "dsr-overdue" : days <= 7 ? "dsr-due-soon" : "dsr-days-ok";
                          return (
                            <div key={d.id} className={`deadline-row${days < 0 && !d.completed ? " overdue" : ""}${d.completed ? " completed" : ""}${d.priority === "Critical" ? " critical" : d.priority === "Urgent" ? " urgent" : ""}`}>
                              <div>
                                <strong style={{ fontSize: "0.88rem" }}>{d.description}</strong>
                                {d.ruleReference && <small style={{ display: "block", color: "var(--muted)" }}>{d.ruleReference}</small>}
                              </div>
                              <span className={dayClass} style={{ fontSize: "0.83rem", fontWeight: 700 }}>
                                {d.completed ? "✓ Done" : days < 0 ? `${Math.abs(days)} days overdue` : `${days} days`}
                              </span>
                              <span style={{ fontSize: "0.82rem" }}>{d.dueDate}</span>
                              <span className={`priority-${d.priority.toLowerCase()}`}>{d.priority}</span>
                              {!d.completed && (
                                <button className="ghost small" onClick={() => handleCompleteDeadline(d)}>
                                  <CheckCircle2 size={14} /> Done
                                </button>
                              )}
                            </div>
                          );
                        })}
                      </>
                    )}

                    {activeTab === "court" && (
                      <>
                        <div className="panel-head" style={{ marginBottom: 10 }}>
                          <span style={{ fontSize: "0.88rem", color: "var(--muted)" }}>{m.courtDates.length} court dates</span>
                          <button className="ghost small" onClick={() => setShowCourtForm(v => !v)}>
                            <Plus size={14} /> Add court date
                          </button>
                        </div>
                        {showCourtForm && (
                          <div className="inline-form-toggle" style={{ marginBottom: 14 }}>
                            <form className="form" onSubmit={handleAddCourtDate}>
                              <div className="form-row">
                                <label>Court date<input name="courtDate" type="date" required defaultValue={today()} /></label>
                                <label>Time<input name="courtTime" type="time" /></label>
                              </div>
                              <div className="form-row">
                                <label>Court<input name="court" required placeholder="e.g. Gauteng High Court" /></label>
                                <label>Roll type
                                  <select name="rollType">
                                    {ROLL_TYPES.map(r => <option key={r}>{r}</option>)}
                                  </select>
                                </label>
                              </div>
                              <label>Purpose<input name="purpose" required placeholder="e.g. Hearing of opposed application" /></label>
                              <div className="form-row">
                                <label>Outcome<input name="outcome" placeholder="e.g. Granted / Dismissed / Postponed" /></label>
                                <label>Postponed to<input name="postponedTo" type="date" /></label>
                              </div>
                              <button className="primary small" type="submit">Add court date</button>
                            </form>
                          </div>
                        )}
                        {m.courtDates.length === 0 && <p style={{ color: "var(--muted)", fontSize: "0.87rem" }}>No court dates recorded.</p>}
                        {m.courtDates.map(c => (
                          <div key={c.id} className="court-date-row">
                            <strong style={{ fontSize: "0.87rem" }}>{c.courtDate}</strong>
                            <span style={{ fontSize: "0.82rem", color: "var(--muted)" }}>{c.courtTime || "—"}</span>
                            <span style={{ fontSize: "0.87rem" }}>{c.court}</span>
                            <span style={{ fontSize: "0.87rem" }}>{c.purpose}</span>
                            <span className={`pill roll-type-${c.rollType.toLowerCase()}`}>{c.rollType}</span>
                            <span style={{ fontSize: "0.83rem", color: "var(--muted)" }}>
                              {c.outcome || (c.postponedTo ? `→ ${c.postponedTo}` : "Pending")}
                            </span>
                          </div>
                        ))}
                      </>
                    )}

                    {activeTab === "costs" && (
                      <>
                        <div className="panel-head" style={{ marginBottom: 10 }}>
                          <span style={{ fontSize: "0.88rem", color: "var(--muted)" }}>{m.costOrders.length} cost orders</span>
                          <button className="ghost small" onClick={() => setShowCostForm(v => !v)}>
                            <Plus size={14} /> Add cost order
                          </button>
                        </div>
                        {showCostForm && (
                          <div className="inline-form-toggle" style={{ marginBottom: 14 }}>
                            <form className="form" onSubmit={handleAddCostOrder}>
                              <div className="form-row">
                                <label>Order date<input name="orderDate" type="date" required defaultValue={today()} /></label>
                                <label>Order type
                                  <select name="orderType">
                                    {Object.entries(ORDER_TYPE_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                                  </select>
                                </label>
                              </div>
                              <div className="form-row">
                                <label>In favour of<input name="inFavourOf" required placeholder="Party name" /></label>
                                <label>Amount (ZAR, 0 if not quantified)<input name="amount" type="number" min="0" step="0.01" defaultValue="0" /></label>
                              </div>
                              <div className="form-row">
                                <label>Scale<input name="scale" placeholder="e.g. party and party" /></label>
                                <label>Notes<input name="notes" placeholder="Additional notes" /></label>
                              </div>
                              <button className="primary small" type="submit">Record cost order</button>
                            </form>
                          </div>
                        )}
                        {m.costOrders.length === 0 && <p style={{ color: "var(--muted)", fontSize: "0.87rem" }}>No cost orders recorded.</p>}
                        {m.costOrders.map(o => (
                          <div key={o.id} className="cost-order-row">
                            <span style={{ fontSize: "0.87rem" }}>{o.orderDate}</span>
                            <span style={{ fontSize: "0.87rem" }}>{ORDER_TYPE_LABELS[o.orderType]}</span>
                            <span style={{ fontSize: "0.87rem" }}>{o.inFavourOf}</span>
                            <strong>{o.amountCents > 0 ? money(o.amountCents) : "—"}</strong>
                            <span style={{ fontSize: "0.82rem", color: "var(--muted)" }}>{o.scale || "—"}</span>
                          </div>
                        ))}
                        {m.costOrders.length > 0 && (
                          <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 12, fontWeight: 700, fontSize: "0.9rem" }}>
                            Total costs: {money(m.costOrders.reduce((s, o) => s + o.amountCents, 0))}
                          </div>
                        )}
                      </>
                    )}
                  </div>
                )}
              </div>
            );
          })}
          {matters.length === 0 && <p style={{ color: "var(--muted)", textAlign: "center", padding: 24 }}>No litigation matters yet.</p>}
        </div>
      </section>
    </>
  );
}
