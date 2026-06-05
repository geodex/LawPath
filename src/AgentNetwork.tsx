import { Award, Building2, CheckCircle2, Copy, DollarSign, Link, Plus, Star, TrendingUp, Users } from "lucide-react";
import { FormEvent, useState } from "react";
import { createAgentReferral, createEstateAgent, updateReferralCommission } from "./api";
import type { AgentReferral, EstateAgent } from "./types";

const money = (cents: number) => new Intl.NumberFormat("en-ZA", { style: "currency", currency: "ZAR", maximumFractionDigits: 0 }).format(cents / 100);
const today = () => new Date().toISOString().slice(0, 10);
const uid = (p: string) => `${p}-${Math.random().toString(36).slice(2, 7).toUpperCase()}`;

const COMMISSION_STATUS_CLASS: Record<AgentReferral["commissionStatus"], string> = {
  pending: "commission-pending", approved: "commission-approved",
  paid: "commission-paid", disputed: "commission-disputed"
};

export function AgentNetwork({
  agents, setAgents, referrals, setReferrals, log, showToast
}: {
  agents: EstateAgent[];
  setAgents: React.Dispatch<React.SetStateAction<EstateAgent[]>>;
  referrals: AgentReferral[];
  setReferrals: React.Dispatch<React.SetStateAction<AgentReferral[]>>;
  log: (msg: string) => void;
  showToast: (type: "success" | "error" | "info", title: string, msg: string) => void;
}) {
  const [activeTab, setActiveTab] = useState<"agents" | "referrals" | "performance">("agents");
  const [showAgentForm, setShowAgentForm] = useState(false);
  const [showReferralForm, setShowReferralForm] = useState(false);
  const [expandedAgent, setExpandedAgent] = useState<string | null>(null);
  const [commissionNote, setCommissionNote] = useState<string | null>(null);

  const activeAgents = agents.filter(a => a.status === "active").length;
  const totalReferrals = referrals.length;
  const pendingCommission = referrals
    .filter(r => r.commissionStatus === "pending" || r.commissionStatus === "approved")
    .reduce((s, r) => s + r.commissionCents, 0);

  async function handleCreateAgent(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const rate = parseFloat(String(f.get("commissionRate") || "5")) / 100;
    const portalAccess = f.get("portalAccess") === "on";
    const input: Omit<EstateAgent, "id" | "portalToken" | "totalReferrals" | "totalCommissionCents"> = {
      agentName: String(f.get("agentName")),
      agencyName: String(f.get("agencyName")),
      email: String(f.get("email")),
      phone: String(f.get("phone") || ""),
      ffcNumber: String(f.get("ffcNumber") || ""),
      ppraRegistration: String(f.get("ppraRegistration") || ""),
      areaOfOperation: String(f.get("areaOfOperation") || ""),
      status: "active",
      commissionRate: rate,
      portalAccess
    };
    try {
      const res = await createEstateAgent(input);
      setAgents(prev => [res.agent, ...prev]);
      showToast("success", "Agent added", `${input.agentName} — ${input.agencyName}`);
      log(`Estate agent registered: ${input.agentName}`);
    } catch {
      const token = portalAccess ? `LP-AGENT-${Math.random().toString(36).slice(2, 6).toUpperCase()}` : "";
      const local: EstateAgent = { id: uid("EA"), ...input, portalToken: token, totalReferrals: 0, totalCommissionCents: 0 };
      setAgents(prev => [local, ...prev]);
      showToast("info", "Saved locally", "Agent saved locally.");
    }
    setShowAgentForm(false);
    (e.target as HTMLFormElement).reset();
  }

  async function handleCreateReferral(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const agentId = String(f.get("agentId"));
    const agent = agents.find(a => a.id === agentId);
    const priceCents = Math.round(parseFloat(String(f.get("purchasePrice") || "0")) * 100);
    const commissionCents = Math.round(priceCents * (agent?.commissionRate ?? 0.05));
    const input: Omit<AgentReferral, "id" | "agentId" | "agentName"> = {
      matterRef: String(f.get("matterRef")),
      propertyDescription: String(f.get("propertyDescription") || ""),
      buyerName: String(f.get("buyerName") || ""),
      sellerName: String(f.get("sellerName") || ""),
      purchasePriceCents: priceCents,
      commissionCents,
      commissionStatus: "pending",
      referralDate: String(f.get("referralDate") || today()),
      paidDate: ""
    };
    try {
      const res = await createAgentReferral(agentId, input);
      setReferrals(prev => [res.referral, ...prev]);
      setAgents(prev => prev.map(a => a.id === agentId ? { ...a, totalReferrals: a.totalReferrals + 1, totalCommissionCents: a.totalCommissionCents + commissionCents } : a));
      showToast("success", "Referral logged", `${input.matterRef} — ${money(commissionCents)} commission`);
      log(`Referral logged for ${agent?.agentName}: ${input.matterRef}`);
    } catch {
      const local: AgentReferral = { id: uid("AR"), agentId, agentName: agent?.agentName ?? "", ...input };
      setReferrals(prev => [local, ...prev]);
      showToast("info", "Saved locally", "Referral saved locally.");
    }
    setShowReferralForm(false);
    (e.target as HTMLFormElement).reset();
  }

  async function handleCommissionUpdate(referral: AgentReferral, status: AgentReferral["commissionStatus"]) {
    try {
      const res = await updateReferralCommission(referral.id, status);
      setReferrals(prev => prev.map(r => r.id === referral.id ? res.referral : r));
    } catch {
      setReferrals(prev => prev.map(r => r.id === referral.id ? { ...r, commissionStatus: status, paidDate: status === "paid" ? today() : r.paidDate } : r));
    }
    showToast("success", "Commission updated", `Marked ${status}.`);
    log(`Commission ${referral.matterRef} → ${status}`);
  }

  function generateCommissionNote(agent: EstateAgent, referral: AgentReferral) {
    const note = [
      `COMMISSION NOTE`,
      `Date: ${today()}`,
      ``,
      `Agent: ${agent.agentName}`,
      `Agency: ${agent.agencyName}`,
      `FFC Number: ${agent.ffcNumber || "N/A"}`,
      `PPRA: ${agent.ppraRegistration || "N/A"}`,
      ``,
      `Referral: ${referral.matterRef}`,
      `Property: ${referral.propertyDescription}`,
      `Seller: ${referral.sellerName} | Buyer: ${referral.buyerName}`,
      `Purchase price: ${money(referral.purchasePriceCents)}`,
      `Commission rate: ${(agent.commissionRate * 100).toFixed(1)}%`,
      `Commission amount: ${money(referral.commissionCents)}`,
      `Status: ${referral.commissionStatus.toUpperCase()}`,
      referral.paidDate ? `Paid date: ${referral.paidDate}` : "",
      ``,
      `This commission note is subject to the commission agreement between the parties.`
    ].filter(l => l !== undefined).join("\n");
    setCommissionNote(note);
  }

  function copyNote() {
    if (!commissionNote) return;
    navigator.clipboard.writeText(commissionNote).then(() => showToast("success", "Copied", "Commission note copied."));
  }

  const maxReferrals = Math.max(...agents.map(a => a.totalReferrals), 1);

  return (
    <>
      <div className="agent-notice">
        <Users size={18} style={{ color: "var(--gold)", flexShrink: 0 }} />
        <span style={{ marginLeft: 8 }}>
          Manage estate agent referral relationships. Each agent can receive a secure portal token to track conveyancing progress.
          PPRA registration number is required under the Property Practitioners Act 22 of 2019.
        </span>
      </div>

      <section className="metrics">
        <div className="metric"><span>Total agents</span><strong>{agents.length}</strong><small>Registered</small></div>
        <div className="metric"><span>Active agents</span><strong>{activeAgents}</strong><small>Sending referrals</small></div>
        <div className="metric"><span>Total referrals</span><strong>{totalReferrals}</strong><small>All time</small></div>
        <div className="metric"><span>Commission outstanding</span><strong>{money(pendingCommission)}</strong><small>Pending + approved</small></div>
      </section>

      {/* Tabs */}
      <div className="popia-tabs">
        {(["agents", "referrals", "performance"] as const).map(tab => (
          <button key={tab} className={`popia-tab${activeTab === tab ? " active" : ""}`} onClick={() => setActiveTab(tab)}>
            {tab === "agents" ? "Agents" : tab === "referrals" ? "Referrals" : "Performance"}
          </button>
        ))}
      </div>

      {/* AGENTS TAB */}
      {activeTab === "agents" && (
        <div className="tier1-section">
          <div className="panel-head">
            <h3>Estate agents ({agents.length})</h3>
            <button className="primary small" onClick={() => setShowAgentForm(v => !v)}>
              <Plus size={16} /> {showAgentForm ? "Cancel" : "Add agent"}
            </button>
          </div>

          {showAgentForm && (
            <div className="inline-form-toggle">
              <form className="form" onSubmit={handleCreateAgent}>
                <div className="form-row">
                  <label>Agent name<input name="agentName" required placeholder="Full name" /></label>
                  <label>Agency name<input name="agencyName" required placeholder="Agency / company" /></label>
                </div>
                <div className="form-row">
                  <label>Work email<input name="email" type="email" required /></label>
                  <label>Phone<input name="phone" placeholder="+27..." /></label>
                </div>
                <div className="form-row">
                  <label>FFC number<input name="ffcNumber" placeholder="Fidelity Fund Certificate" /></label>
                  <label>PPRA registration<input name="ppraRegistration" placeholder="PPRA number" /></label>
                </div>
                <div className="form-row">
                  <label>Area of operation<input name="areaOfOperation" placeholder="e.g. Sandton, Fourways" /></label>
                  <label>Commission rate (%)<input name="commissionRate" type="number" min="0" max="20" step="0.1" defaultValue="5" /></label>
                </div>
                <label className="switch-row"><input name="portalAccess" type="checkbox" /> Grant portal access (generates secure portal token)</label>
                <button className="primary" type="submit">Register agent</button>
              </form>
            </div>
          )}

          {agents.map(agent => (
            <div key={agent.id} className={`agent-card${expandedAgent === agent.id ? " expanded" : ""}`}
              onClick={() => setExpandedAgent(expandedAgent === agent.id ? null : agent.id)}>
              <div className="agent-card-head">
                <div>
                  <strong>{agent.agentName}</strong>
                  <span style={{ marginLeft: 8, fontSize: "0.85rem", color: "var(--muted)" }}>{agent.agencyName}</span>
                  <div style={{ marginTop: 2, fontSize: "0.82rem", color: "var(--muted)" }}>{agent.areaOfOperation}</div>
                </div>
                <div style={{ display: "flex", gap: 8, alignItems: "center", flexShrink: 0 }}>
                  <span className={`agent-status-${agent.status}`}>{agent.status}</span>
                  <span className="pill" style={{ fontSize: "0.78rem" }}>{agent.totalReferrals} referrals</span>
                  {agent.portalAccess && <span title="Portal access granted" style={{ color: "var(--green)" }}>🔓</span>}
                </div>
              </div>

              {expandedAgent === agent.id && (
                <div style={{ marginTop: 14, borderTop: "1px solid var(--line)", paddingTop: 14 }} onClick={e => e.stopPropagation()}>
                  <div className="form-row" style={{ fontSize: "0.85rem", marginBottom: 12 }}>
                    <div><strong>FFC:</strong> {agent.ffcNumber || "N/A"}</div>
                    <div><strong>PPRA:</strong> {agent.ppraRegistration || "N/A"}</div>
                    <div><strong>Commission:</strong> {(agent.commissionRate * 100).toFixed(1)}%</div>
                    <div><strong>Total earned:</strong> {money(agent.totalCommissionCents)}</div>
                  </div>
                  {agent.portalToken && (
                    <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 10 }}>
                      <span style={{ fontSize: "0.85rem", color: "var(--muted)" }}>Portal token: <strong>{agent.portalToken}</strong></span>
                      <button className="ghost small" onClick={() => {
                        const url = `${window.location.origin}/portal?token=${agent.portalToken}`;
                        navigator.clipboard.writeText(url).then(() => showToast("success", "Copied", "Portal link copied."));
                      }}><Link size={14} /> Copy link</button>
                    </div>
                  )}
                  <div style={{ display: "flex", gap: 8 }}>
                    <button className="ghost small" onClick={() => {
                      const agentRefs = referrals.filter(r => r.agentId === agent.id);
                      if (agentRefs.length) generateCommissionNote(agent, agentRefs[0]);
                      else showToast("info", "No referrals", "Add a referral first.");
                    }}>Generate commission note</button>
                  </div>
                </div>
              )}
            </div>
          ))}
          {agents.length === 0 && <p style={{ color: "var(--muted)", textAlign: "center", padding: 24 }}>No agents registered yet.</p>}
        </div>
      )}

      {/* REFERRALS TAB */}
      {activeTab === "referrals" && (
        <div className="tier1-section">
          <div className="panel-head">
            <h3>Referrals ({referrals.length})</h3>
            <button className="primary small" onClick={() => setShowReferralForm(v => !v)}>
              <Plus size={16} /> {showReferralForm ? "Cancel" : "Log referral"}
            </button>
          </div>

          {showReferralForm && (
            <div className="inline-form-toggle">
              <form className="form" onSubmit={handleCreateReferral}>
                <div className="form-row">
                  <label>Agent
                    <select name="agentId" required>
                      <option value="">Select agent</option>
                      {agents.filter(a => a.status === "active").map(a => <option key={a.id} value={a.id}>{a.agentName} — {a.agencyName}</option>)}
                    </select>
                  </label>
                  <label>Matter ref<input name="matterRef" required placeholder="M-2026-001" /></label>
                </div>
                <label>Property description<input name="propertyDescription" placeholder="Erf 1234, Sandton" /></label>
                <div className="form-row">
                  <label>Seller name<input name="sellerName" placeholder="Seller full name" /></label>
                  <label>Buyer name<input name="buyerName" placeholder="Buyer full name" /></label>
                </div>
                <div className="form-row">
                  <label>Purchase price (ZAR)<input name="purchasePrice" type="number" min="0" step="0.01" placeholder="0.00" /></label>
                  <label>Referral date<input name="referralDate" type="date" defaultValue={today()} /></label>
                </div>
                <button className="primary" type="submit">Log referral</button>
              </form>
            </div>
          )}

          <div>
            {referrals.map(r => (
              <div key={r.id} style={{ border: "1px solid var(--line)", borderRadius: 8, padding: "12px 16px", marginBottom: 8 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, marginBottom: 8 }}>
                  <div>
                    <strong>{r.matterRef}</strong>
                    <span style={{ marginLeft: 8, fontSize: "0.83rem", color: "var(--muted)" }}>{r.agentName}</span>
                    <p style={{ margin: "3px 0 0", fontSize: "0.85rem" }}>{r.propertyDescription}</p>
                    <p style={{ margin: "2px 0 0", fontSize: "0.82rem", color: "var(--muted)" }}>{r.sellerName} → {r.buyerName}</p>
                  </div>
                  <div style={{ textAlign: "right", flexShrink: 0 }}>
                    <div style={{ fontWeight: 700 }}>{money(r.commissionCents)}</div>
                    <span className={COMMISSION_STATUS_CLASS[r.commissionStatus]} style={{ fontSize: "0.82rem" }}>{r.commissionStatus}</span>
                  </div>
                </div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  {r.commissionStatus === "pending" && (
                    <>
                      <button className="ghost small" onClick={() => handleCommissionUpdate(r, "approved")}>Approve</button>
                      <button className="ghost small" style={{ color: "var(--rose)" }} onClick={() => handleCommissionUpdate(r, "disputed")}>Dispute</button>
                    </>
                  )}
                  {r.commissionStatus === "approved" && (
                    <button className="primary small" onClick={() => handleCommissionUpdate(r, "paid")}><CheckCircle2 size={14} /> Mark paid</button>
                  )}
                  {r.commissionStatus === "disputed" && (
                    <button className="ghost small" onClick={() => handleCommissionUpdate(r, "approved")}>Resolve → Approve</button>
                  )}
                  {r.commissionStatus === "paid" && (
                    <span style={{ fontSize: "0.82rem", color: "var(--green)" }}>✓ Paid {r.paidDate}</span>
                  )}
                  {agents.find(a => a.id === r.agentId) && (
                    <button className="ghost small" onClick={() => generateCommissionNote(agents.find(a => a.id === r.agentId)!, r)}>
                      <DollarSign size={14} /> Commission note
                    </button>
                  )}
                </div>
              </div>
            ))}
            {referrals.length === 0 && <p style={{ color: "var(--muted)", textAlign: "center", padding: 24 }}>No referrals logged yet.</p>}
          </div>
        </div>
      )}

      {/* PERFORMANCE TAB */}
      {activeTab === "performance" && (
        <div className="tier1-section">
          <div className="grid-two">
            <div className="panel">
              <div className="panel-head"><h3>Referrals by agent</h3></div>
              {agents.sort((a, b) => b.totalReferrals - a.totalReferrals).map((agent, i) => (
                <div key={agent.id} className="performance-bar-row">
                  <div style={{ minWidth: 140, fontSize: "0.87rem" }}>
                    {i === 0 && <Award size={14} style={{ color: "var(--gold)", marginRight: 4 }} />}
                    {agent.agentName}
                  </div>
                  <div className="performance-bar-track">
                    <div className="performance-bar-fill" style={{ width: `${(agent.totalReferrals / maxReferrals) * 100}%` }} />
                  </div>
                  <span style={{ fontSize: "0.82rem", fontWeight: 700, minWidth: 28 }}>{agent.totalReferrals}</span>
                </div>
              ))}
            </div>

            <div className="panel">
              <div className="panel-head"><h3>Commission summary</h3></div>
              {agents.map(agent => {
                const agentRefs = referrals.filter(r => r.agentId === agent.id);
                const pending = agentRefs.filter(r => r.commissionStatus === "pending").reduce((s, r) => s + r.commissionCents, 0);
                const paid = agentRefs.filter(r => r.commissionStatus === "paid").reduce((s, r) => s + r.commissionCents, 0);
                return (
                  <div key={agent.id} style={{ padding: "8px 0", borderBottom: "1px solid var(--line)", fontSize: "0.85rem" }}>
                    <div style={{ display: "flex", justifyContent: "space-between" }}>
                      <strong>{agent.agentName}</strong>
                      <span>{agentRefs.length} referrals</span>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", color: "var(--muted)", fontSize: "0.82rem" }}>
                      <span>Pending: {money(pending)}</span>
                      <span>Paid: {money(paid)}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Commission note modal */}
      {commissionNote && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
          <div style={{ background: "#fff", borderRadius: 12, padding: 24, maxWidth: 560, width: "100%", maxHeight: "80vh", overflow: "auto" }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 16 }}>
              <h3 style={{ margin: 0 }}>Commission Note</h3>
              <div style={{ display: "flex", gap: 8 }}>
                <button className="ghost small" onClick={copyNote}><Copy size={14} /> Copy</button>
                <button className="ghost small" onClick={() => setCommissionNote(null)}>Close</button>
              </div>
            </div>
            <div className="commission-note-box">{commissionNote}</div>
          </div>
        </div>
      )}
    </>
  );
}
