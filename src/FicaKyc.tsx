import { AlertTriangle, CheckCircle2, ChevronDown, ChevronUp, Plus, Shield, UserCheck } from "lucide-react";
import { FormEvent, useState } from "react";
import { createFicaClient, updateFicaClient } from "./api";
import type { FicaClient, FicaDocument } from "./types";

const uid = (p: string) => `${p}-${Math.random().toString(36).slice(2, 7).toUpperCase()}`;
const today = () => new Date().toISOString().slice(0, 10);

function buildDefaultDocs(clientType: FicaClient["clientType"]): FicaDocument[] {
  const base = (type: string, name: string): FicaDocument => ({
    id: uid("FD"),
    documentType: type,
    documentName: name,
    status: "Required",
    expiryDate: "",
  });
  if (clientType === "legal_entity") return [
    base("cipc_cert", "CIPC registration certificate"),
    base("moi", "Memorandum of Incorporation"),
    base("directors", "Certified ID copies of all directors"),
    base("proof_of_address", "Proof of business address"),
    base("source_of_funds", "Source of funds declaration"),
  ];
  if (clientType === "trust") return [
    base("trust_deed", "Certified trust deed"),
    base("letter_of_authority", "Letter of authority (Masters Office)"),
    base("trustees_id", "Certified ID copies of all trustees"),
    base("proof_of_address", "Proof of principal address"),
  ];
  return [
    base("identity", "Certified ID / Passport copy"),
    base("proof_of_address", "Proof of residence (not older than 3 months)"),
    base("source_of_funds", "Source of funds declaration"),
  ];
}

const riskPillClass: Record<FicaClient["riskRating"], string> = {
  Low: "risk-low-pill",
  Medium: "risk-medium-pill",
  High: "risk-high-pill",
  PEP: "risk-pep-pill",
};
const statusClass: Record<FicaClient["ficaStatus"], string> = {
  "Pending": "fica-status-pending",
  "In Progress": "fica-status-in-progress",
  "Compliant": "fica-status-compliant",
  "Expired": "fica-status-expired",
  "Rejected": "fica-status-rejected",
};
const docStatusClass: Record<FicaDocument["status"], string> = {
  "Required": "fica-doc-required",
  "Uploaded": "fica-doc-uploaded",
  "Verified": "fica-doc-verified",
  "Expired": "fica-doc-expired",
  "Rejected": "fica-doc-rejected",
};
const clientTypeLabel: Record<FicaClient["clientType"], string> = {
  natural_person: "Natural person",
  legal_entity: "Legal entity",
  trust: "Trust",
};

type Props = {
  clients: FicaClient[];
  setClients: React.Dispatch<React.SetStateAction<FicaClient[]>>;
  log: (msg: string) => void;
  showToast: (type: "success" | "error" | "info", title: string, msg: string) => void;
};

type EditState = {
  riskRating: FicaClient["riskRating"];
  ficaStatus: FicaClient["ficaStatus"];
};

export function FicaKyc({ clients, setClients, log, showToast }: Props) {
  const [showAddForm, setShowAddForm] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [saving, setSaving] = useState<string | null>(null);

  // Add form state
  const [clientName, setClientName] = useState("");
  const [clientType, setClientType] = useState<FicaClient["clientType"]>("natural_person");
  const [idNumber, setIdNumber] = useState("");
  const [riskRating, setRiskRating] = useState<FicaClient["riskRating"]>("Low");
  const [sourceOfFunds, setSourceOfFunds] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Per-card edit state
  const [editStates, setEditStates] = useState<Record<string, EditState>>({});

  // Metrics
  const totalClients = clients.length;
  const compliantCount = clients.filter(c => c.ficaStatus === "Compliant").length;
  const pendingInProgress = clients.filter(c => c.ficaStatus === "Pending" || c.ficaStatus === "In Progress").length;
  const highRiskPep = clients.filter(c => c.riskRating === "High" || c.riskRating === "PEP").length;

  // Compliance summary
  const pendingCount = clients.filter(c => c.ficaStatus === "Pending").length;
  const inProgressCount = clients.filter(c => c.ficaStatus === "In Progress").length;
  const expiredCount = clients.filter(c => c.ficaStatus === "Expired").length;

  function resetAddForm() {
    setClientName("");
    setClientType("natural_person");
    setIdNumber("");
    setRiskRating("Low");
    setSourceOfFunds("");
  }

  async function handleAddClient(e: FormEvent) {
    e.preventDefault();
    if (!clientName.trim()) return;
    setSubmitting(true);
    try {
      const res = await createFicaClient({
        clientName,
        clientType,
        idNumber,
        riskRating,
        ficaStatus: "Pending",
        ficaExpiryDate: "",
        sourceOfFunds,
        sanctionsChecked: false,
      });
      setClients(prev => [res.client, ...prev]);
      showToast("success", "Client added", clientName + " FICA record created.");
      log("FICA client added: " + clientName);
    } catch {
      const local: FicaClient = {
        id: uid("FC"),
        clientName,
        clientType,
        idNumber,
        riskRating,
        ficaStatus: "Pending",
        ficaExpiryDate: "",
        sourceOfFunds,
        sanctionsChecked: false,
        documents: buildDefaultDocs(clientType),
      };
      setClients(prev => [local, ...prev]);
      showToast("info", "Saved locally", "Client saved locally.");
    } finally {
      setSubmitting(false);
      resetAddForm();
      setShowAddForm(false);
    }
  }

  function getEditState(client: FicaClient): EditState {
    return editStates[client.id] ?? { riskRating: client.riskRating, ficaStatus: client.ficaStatus };
  }

  function setEditField<K extends keyof EditState>(id: string, field: K, value: EditState[K]) {
    setEditStates(prev => ({
      ...prev,
      [id]: { ...(prev[id] ?? { riskRating: "Low", ficaStatus: "Pending" }), [field]: value },
    }));
  }

  async function handleSaveChanges(client: FicaClient) {
    const edit = getEditState(client);
    setSaving(client.id);
    try {
      const res = await updateFicaClient(client.id, {
        riskRating: edit.riskRating,
        ficaStatus: edit.ficaStatus,
      });
      setClients(prev => prev.map(c => c.id === client.id ? res.client : c));
      showToast("success", "Client updated", client.clientName + " record saved.");
      log("FICA client updated: " + client.clientName);
    } catch {
      setClients(prev =>
        prev.map(c =>
          c.id === client.id
            ? { ...c, riskRating: edit.riskRating, ficaStatus: edit.ficaStatus }
            : c
        )
      );
      showToast("info", "Saved locally", "Changes saved locally.");
    } finally {
      setSaving(null);
    }
  }

  async function handleMarkSanctions(client: FicaClient) {
    setSaving(client.id);
    try {
      const res = await updateFicaClient(client.id, { sanctionsChecked: true });
      setClients(prev => prev.map(c => c.id === client.id ? res.client : c));
      showToast("success", "Sanctions screened", client.clientName + " marked as sanctions screened.");
      log("FICA sanctions screened: " + client.clientName);
    } catch {
      setClients(prev =>
        prev.map(c => c.id === client.id ? { ...c, sanctionsChecked: true } : c)
      );
      showToast("info", "Saved locally", "Sanctions status saved locally.");
    } finally {
      setSaving(null);
    }
  }

  return (
    <div className="panel">
      <div className="panel-head">
        <span className="eyebrow">FICA / KYC</span>
        <h2>Client Verification</h2>
      </div>

      {/* FICA Notice Banner */}
      <div className="fica-notice">
        <Shield size={16} />
        <span>
          Attorneys are accountable institutions under FICA (Act 38 of 2001). Client verification and
          risk assessment must be completed before rendering any legal services. Records must be kept
          for 5 years.
        </span>
      </div>

      {/* Metrics */}
      <div className="metrics">
        <div className="metric">
          <span className="eyebrow">Total clients</span>
          <strong>{totalClients}</strong>
        </div>
        <div className="metric">
          <span className="eyebrow">Compliant</span>
          <strong>{compliantCount}</strong>
        </div>
        <div className="metric">
          <span className="eyebrow">Pending / In Progress</span>
          <strong>{pendingInProgress}</strong>
        </div>
        <div className="metric">
          <span className="eyebrow">High Risk + PEP</span>
          <strong>{highRiskPep}</strong>
        </div>
      </div>

      {/* Add Client Toggle */}
      <div className="tier1-section">
        <button
          className="ghost small"
          onClick={() => setShowAddForm(v => !v)}
        >
          <Plus size={14} />
          {showAddForm ? "Cancel" : "Add client"}
        </button>

        {showAddForm && (
          <div className="inline-form-toggle">
            <form className="form" onSubmit={handleAddClient}>
              <div className="form-row">
                <label>
                  Client name *
                  <input
                    type="text"
                    required
                    value={clientName}
                    onChange={e => setClientName(e.target.value)}
                    placeholder="Full name or entity name"
                  />
                </label>
                <label>
                  Client type
                  <select
                    value={clientType}
                    onChange={e => setClientType(e.target.value as FicaClient["clientType"])}
                  >
                    <option value="natural_person">Natural person</option>
                    <option value="legal_entity">Legal entity</option>
                    <option value="trust">Trust</option>
                  </select>
                </label>
              </div>
              <div className="form-row">
                <label>
                  ID / Registration number
                  <input
                    type="text"
                    value={idNumber}
                    onChange={e => setIdNumber(e.target.value)}
                    placeholder="ID or registration number"
                  />
                </label>
                <label>
                  Risk rating
                  <select
                    value={riskRating}
                    onChange={e => setRiskRating(e.target.value as FicaClient["riskRating"])}
                  >
                    <option value="Low">Low</option>
                    <option value="Medium">Medium</option>
                    <option value="High">High</option>
                    <option value="PEP">PEP</option>
                  </select>
                </label>
              </div>
              <div className="form-row">
                <label>
                  Source of funds
                  <input
                    type="text"
                    value={sourceOfFunds}
                    onChange={e => setSourceOfFunds(e.target.value)}
                    placeholder="e.g. Employment income, business revenue"
                  />
                </label>
              </div>
              <div className="form-row">
                <button className="primary small" type="submit" disabled={submitting}>
                  {submitting ? "Adding…" : "Add client"}
                </button>
              </div>
            </form>
          </div>
        )}
      </div>

      {/* Client List */}
      <div className="tier1-section">
        {clients.length === 0 && (
          <p style={{ color: "var(--muted)", fontSize: "0.875rem" }}>No FICA clients yet. Add a client above.</p>
        )}
        {clients.map(client => {
          const isExpanded = expandedId === client.id;
          const edit = getEditState(client);
          return (
            <div
              key={client.id}
              className={`fica-client-card${isExpanded ? " expanded" : ""}`}
            >
              <div
                className="fica-client-head"
                onClick={() => setExpandedId(isExpanded ? null : client.id)}
                style={{ cursor: "pointer" }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap" }}>
                  <strong>{client.clientName}</strong>
                  <span className="pill" style={{ fontSize: "0.7rem" }}>
                    {clientTypeLabel[client.clientType]}
                  </span>
                  <span className={`pill ${riskPillClass[client.riskRating]}`}>
                    {client.riskRating}
                  </span>
                  <span className={`pill ${statusClass[client.ficaStatus]}`}>
                    {client.ficaStatus}
                  </span>
                  {client.sanctionsChecked ? (
                    <span style={{ color: "var(--green, #22c55e)", display: "flex", alignItems: "center", gap: "0.2rem", fontSize: "0.75rem" }}>
                      <CheckCircle2 size={13} /> Sanctions clear
                    </span>
                  ) : (
                    <span style={{ color: "var(--amber, #f59e0b)", display: "flex", alignItems: "center", gap: "0.2rem", fontSize: "0.75rem" }}>
                      <AlertTriangle size={13} /> Sanctions pending
                    </span>
                  )}
                </div>
                <span style={{ marginLeft: "auto" }}>
                  {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                </span>
              </div>

              {isExpanded && (
                <div style={{ padding: "0.75rem 0 0.25rem" }}>
                  {/* Document checklist */}
                  <div className="fica-doc-list">
                    <span className="eyebrow" style={{ display: "block", marginBottom: "0.4rem" }}>
                      Required documents
                    </span>
                    {client.documents.length === 0 && (
                      <p style={{ fontSize: "0.8rem", color: "var(--muted)" }}>No documents defined.</p>
                    )}
                    {client.documents.map(doc => (
                      <div key={doc.id} className={`fica-doc-item ${docStatusClass[doc.status]}`}>
                        <span>{doc.documentName}</span>
                        <span className={`pill ${docStatusClass[doc.status]}`} style={{ fontSize: "0.7rem" }}>
                          {doc.status}
                        </span>
                        {doc.expiryDate && (
                          <span style={{ fontSize: "0.7rem", color: "var(--muted)" }}>
                            Expires: {doc.expiryDate}
                          </span>
                        )}
                      </div>
                    ))}
                  </div>

                  {/* Update controls */}
                  <div className="form" style={{ marginTop: "0.75rem" }}>
                    <div className="form-row">
                      <label>
                        Risk rating
                        <select
                          value={edit.riskRating}
                          onChange={e =>
                            setEditField(client.id, "riskRating", e.target.value as FicaClient["riskRating"])
                          }
                        >
                          <option value="Low">Low</option>
                          <option value="Medium">Medium</option>
                          <option value="High">High</option>
                          <option value="PEP">PEP</option>
                        </select>
                      </label>
                      <label>
                        FICA status
                        <select
                          value={edit.ficaStatus}
                          onChange={e =>
                            setEditField(client.id, "ficaStatus", e.target.value as FicaClient["ficaStatus"])
                          }
                        >
                          <option value="Pending">Pending</option>
                          <option value="In Progress">In Progress</option>
                          <option value="Compliant">Compliant</option>
                          <option value="Expired">Expired</option>
                          <option value="Rejected">Rejected</option>
                        </select>
                      </label>
                    </div>
                    <div className="sanctions-row" style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
                      {!client.sanctionsChecked && (
                        <button
                          className="ghost small"
                          disabled={saving === client.id}
                          onClick={() => handleMarkSanctions(client)}
                        >
                          <UserCheck size={13} />
                          Mark sanctions screened
                        </button>
                      )}
                      <button
                        className="primary small"
                        disabled={saving === client.id}
                        onClick={() => handleSaveChanges(client)}
                      >
                        {saving === client.id ? "Saving…" : "Save changes"}
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Compliance Summary */}
      <div className="compliance-summary">
        <div className="compliance-stat">
          <span className="eyebrow">Pending</span>
          <strong>{pendingCount}</strong>
        </div>
        <div className="compliance-stat">
          <span className="eyebrow">In Progress</span>
          <strong>{inProgressCount}</strong>
        </div>
        <div className="compliance-stat">
          <span className="eyebrow">Compliant</span>
          <strong>{compliantCount}</strong>
        </div>
        <div className="compliance-stat">
          <span className="eyebrow">Expired</span>
          <strong>{expiredCount}</strong>
        </div>
      </div>
    </div>
  );
}
