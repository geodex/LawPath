import { AlertTriangle, CheckCircle2, FileText, Plus, Scale, ShieldAlert, ShieldCheck, X } from "lucide-react";
import { FormEvent, useState } from "react";
import { createPopiaBreachIncident, createPopiaDsrRequest, createPopiaProcessingRecord, updatePopiaDsrStatus } from "./api";
import type { PopiaBreachIncident, PopiaDsrRequest, PopiaProcessingRecord } from "./types";

const uid = (p: string) => `${p}-${Math.random().toString(36).slice(2, 7).toUpperCase()}`;

function daysRemaining(dueAt: string): number {
  return Math.ceil((new Date(dueAt).getTime() - Date.now()) / 86400000);
}

interface Props {
  processingRecords: PopiaProcessingRecord[];
  setProcessingRecords: React.Dispatch<React.SetStateAction<PopiaProcessingRecord[]>>;
  dsrRequests: PopiaDsrRequest[];
  setDsrRequests: React.Dispatch<React.SetStateAction<PopiaDsrRequest[]>>;
  breachIncidents: PopiaBreachIncident[];
  setBreachIncidents: React.Dispatch<React.SetStateAction<PopiaBreachIncident[]>>;
  log: (msg: string) => void;
  showToast: (type: "success" | "error" | "info", title: string, msg: string) => void;
}

export function PopiaCompliance({
  processingRecords,
  setProcessingRecords,
  dsrRequests,
  setDsrRequests,
  breachIncidents,
  setBreachIncidents,
  log,
  showToast,
}: Props) {
  const [activeTab, setActiveTab] = useState("Processing Register");

  return (
    <div className="panel">
      <div className="panel-head">
        <ShieldCheck size={18} />
        <span>POPIA Compliance</span>
      </div>

      <div className="popia-tabs">
        {["Processing Register", "Data Subject Requests", "Breach Incidents"].map((tab) => (
          <button
            key={tab}
            className={`popia-tab${activeTab === tab ? " active" : ""}`}
            onClick={() => setActiveTab(tab)}
          >
            {tab}
          </button>
        ))}
      </div>

      {activeTab === "Processing Register" && (
        <ProcessingRegisterTab
          records={processingRecords}
          setRecords={setProcessingRecords}
          showToast={showToast}
        />
      )}
      {activeTab === "Data Subject Requests" && (
        <DsrTab
          requests={dsrRequests}
          setRequests={setDsrRequests}
          log={log}
          showToast={showToast}
        />
      )}
      {activeTab === "Breach Incidents" && (
        <BreachTab
          incidents={breachIncidents}
          setIncidents={setBreachIncidents}
          log={log}
          showToast={showToast}
        />
      )}
    </div>
  );
}

// ── Tab 1: Processing Register ────────────────────────────────────────────────

function ProcessingRegisterTab({
  records,
  setRecords,
  showToast,
}: {
  records: PopiaProcessingRecord[];
  setRecords: React.Dispatch<React.SetStateAction<PopiaProcessingRecord[]>>;
  showToast: Props["showToast"];
}) {
  const [showForm, setShowForm] = useState(false);
  const [processing, setProcessing] = useState(false);

  const [processingActivity, setProcessingActivity] = useState("");
  const [purpose, setPurpose] = useState("");
  const [legalBasis, setLegalBasis] = useState("Legal obligation");
  const [dataSubjects, setDataSubjects] = useState("");
  const [personalInfoTypes, setPersonalInfoTypes] = useState("");
  const [retentionPeriod, setRetentionPeriod] = useState("");
  const [thirdPartyRecipients, setThirdPartyRecipients] = useState("");
  const [crossBorderTransfer, setCrossBorderTransfer] = useState(false);
  const [reviewDate, setReviewDate] = useState("");

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setProcessing(true);
    const input = {
      processingActivity,
      purpose,
      legalBasis,
      dataSubjects: dataSubjects.split(",").map((s) => s.trim()).filter(Boolean),
      personalInfoTypes: personalInfoTypes.split(",").map((s) => s.trim()).filter(Boolean),
      retentionPeriod,
      thirdPartyRecipients,
      crossBorderTransfer,
      reviewDate,
      active: true,
    };
    try {
      const res = await createPopiaProcessingRecord(input);
      setRecords((prev) => [res.record, ...prev]);
      showToast("success", "Processing record added", processingActivity);
    } catch {
      const local: PopiaProcessingRecord = { id: uid("PR"), ...input };
      setRecords((prev) => [local, ...prev]);
      showToast("info", "Saved locally", "Record saved locally.");
    }
    setProcessing(false);
    setShowForm(false);
    setProcessingActivity("");
    setPurpose("");
    setLegalBasis("Legal obligation");
    setDataSubjects("");
    setPersonalInfoTypes("");
    setRetentionPeriod("");
    setThirdPartyRecipients("");
    setCrossBorderTransfer(false);
    setReviewDate("");
  }

  return (
    <div className="tier1-section">
      <div className="popia-notice">
        <FileText size={15} />
        <span>
          Section 18 of POPIA requires you to maintain a Record of Processing Activities. The
          Information Regulator may request this register during a compliance audit.
        </span>
      </div>

      <div className="inline-form-toggle">
        <button className="ghost small" onClick={() => setShowForm((v) => !v)}>
          {showForm ? <X size={14} /> : <Plus size={14} />}
          {showForm ? "Cancel" : "Add activity"}
        </button>
      </div>

      {showForm && (
        <form className="form" onSubmit={handleSubmit}>
          <div className="form-row">
            <label>
              Processing activity *
              <input
                required
                value={processingActivity}
                onChange={(e) => setProcessingActivity(e.target.value)}
                placeholder="e.g. Client onboarding"
              />
            </label>
            <label>
              Purpose *
              <input
                required
                value={purpose}
                onChange={(e) => setPurpose(e.target.value)}
                placeholder="e.g. KYC compliance"
              />
            </label>
          </div>
          <div className="form-row">
            <label>
              Legal basis
              <select value={legalBasis} onChange={(e) => setLegalBasis(e.target.value)}>
                <option>Legal obligation</option>
                <option>Contract</option>
                <option>Consent</option>
                <option>Legitimate interest</option>
                <option>Vital interest</option>
                <option>Public interest</option>
              </select>
            </label>
            <label>
              Retention period *
              <input
                required
                value={retentionPeriod}
                onChange={(e) => setRetentionPeriod(e.target.value)}
                placeholder="e.g. 5 years after matter close"
              />
            </label>
          </div>
          <div className="form-row">
            <label>
              Data subjects (comma-separated)
              <input
                value={dataSubjects}
                onChange={(e) => setDataSubjects(e.target.value)}
                placeholder="e.g. Clients, Employees"
              />
            </label>
            <label>
              Personal info types (comma-separated)
              <input
                value={personalInfoTypes}
                onChange={(e) => setPersonalInfoTypes(e.target.value)}
                placeholder="e.g. ID number, Address"
              />
            </label>
          </div>
          <div className="form-row">
            <label>
              Third-party recipients
              <input
                value={thirdPartyRecipients}
                onChange={(e) => setThirdPartyRecipients(e.target.value)}
                placeholder="e.g. CIPC, SARS"
              />
            </label>
            <label>
              Review date
              <input
                type="date"
                value={reviewDate}
                onChange={(e) => setReviewDate(e.target.value)}
              />
            </label>
          </div>
          <div className="form-row">
            <label style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <input
                type="checkbox"
                checked={crossBorderTransfer}
                onChange={(e) => setCrossBorderTransfer(e.target.checked)}
              />
              Cross-border transfer
            </label>
          </div>
          <button className="primary small" type="submit" disabled={processing}>
            {processing ? "Saving…" : "Save record"}
          </button>
        </form>
      )}

      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr>
            <th>Activity</th>
            <th>Purpose</th>
            <th>Legal basis</th>
            <th>Data subjects</th>
            <th>Retention</th>
            <th>Review date</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {records.map((r) => (
            <tr key={r.id} className="popia-ropa-row">
              <td>{r.processingActivity}</td>
              <td>{r.purpose}</td>
              <td>
                <span className="pill">{r.legalBasis}</span>
              </td>
              <td>{r.dataSubjects.join(", ") || "—"}</td>
              <td>{r.retentionPeriod}</td>
              <td>{r.reviewDate || "—"}</td>
              <td>
                <span className={`pill ${r.active ? "severity-low" : ""}`}>
                  {r.active ? "Active" : "Inactive"}
                </span>
              </td>
            </tr>
          ))}
          {records.length === 0 && (
            <tr>
              <td colSpan={7} style={{ textAlign: "center", padding: "1rem", opacity: 0.5 }}>
                No processing records yet.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

// ── Tab 2: Data Subject Requests ──────────────────────────────────────────────

function DsrTab({
  requests,
  setRequests,
  log,
  showToast,
}: {
  requests: PopiaDsrRequest[];
  setRequests: React.Dispatch<React.SetStateAction<PopiaDsrRequest[]>>;
  log: Props["log"];
  showToast: Props["showToast"];
}) {
  const [showForm, setShowForm] = useState(false);
  const [processing, setProcessing] = useState(false);

  const [requestType, setRequestType] = useState<PopiaDsrRequest["requestType"]>("Access");
  const [requestorName, setRequestorName] = useState("");
  const [requestorEmail, setRequestorEmail] = useState("");
  const [description, setDescription] = useState("");

  const [pendingStatus, setPendingStatus] = useState<Record<string, PopiaDsrRequest["status"]>>({});

  const now = Date.now();
  const total = requests.length;
  const open = requests.filter((r) => r.status === "Received" || r.status === "In Progress").length;
  const overdue = requests.filter(
    (r) =>
      r.status !== "Completed" &&
      r.status !== "Denied" &&
      new Date(r.dueAt).getTime() < now
  ).length;

  async function updateDsr(req: PopiaDsrRequest, newStatus: PopiaDsrRequest["status"]) {
    try {
      const res = await updatePopiaDsrStatus(req.id, newStatus);
      setRequests((prev) => prev.map((r) => (r.id === req.id ? res.request : r)));
    } catch {
      setRequests((prev) => prev.map((r) => (r.id === req.id ? { ...r, status: newStatus } : r)));
    }
    showToast("success", "DSR updated", `Request marked ${newStatus}.`);
    log(`DSR ${req.id} → ${newStatus}`);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setProcessing(true);
    const input = {
      requestType,
      requestorName,
      requestorEmail,
      description,
      status: "Received" as const,
      receivedAt: new Date().toISOString(),
      responseNotes: "",
    };
    try {
      const res = await createPopiaDsrRequest(input);
      setRequests((prev) => [res.request, ...prev]);
      showToast("success", "DSR logged", requestorName + " request received.");
    } catch {
      const local: PopiaDsrRequest = {
        id: uid("DSR"),
        ...input,
        dueAt: new Date(Date.now() + 30 * 86400000).toISOString(),
        completedAt: "",
      };
      setRequests((prev) => [local, ...prev]);
      showToast("info", "Saved locally", "DSR logged locally.");
    }
    setProcessing(false);
    setShowForm(false);
    setRequestorName("");
    setRequestorEmail("");
    setDescription("");
    setRequestType("Access");
  }

  function getDueClass(dueAt: string, status: PopiaDsrRequest["status"]) {
    if (status === "Completed" || status === "Denied") return "";
    const days = daysRemaining(dueAt);
    if (days < 0) return "dsr-overdue";
    if (days <= 7) return "dsr-due-soon";
    return "dsr-days-ok";
  }

  function getDueLabel(dueAt: string, status: PopiaDsrRequest["status"]) {
    if (status === "Completed" || status === "Denied") return "—";
    const days = daysRemaining(dueAt);
    if (days < 0) return "OVERDUE";
    return `${days} days`;
  }

  return (
    <div className="tier1-section">
      <div className="popia-notice">
        <Scale size={15} />
        <span>
          Section 23 of POPIA grants data subjects rights of access, correction and deletion. You
          must respond within 30 days of receipt. Failure to respond constitutes a violation.
        </span>
      </div>

      <div className="metrics">
        <div className="metric">
          <span className="eyebrow">Total DSRs</span>
          <strong>{total}</strong>
        </div>
        <div className="metric">
          <span className="eyebrow">Open</span>
          <strong>{open}</strong>
        </div>
        <div className="metric">
          <span className="eyebrow">Overdue</span>
          <strong style={{ color: overdue > 0 ? "var(--red, #e53e3e)" : undefined }}>{overdue}</strong>
        </div>
      </div>

      <div className="inline-form-toggle">
        <button className="ghost small" onClick={() => setShowForm((v) => !v)}>
          {showForm ? <X size={14} /> : <Plus size={14} />}
          {showForm ? "Cancel" : "Log DSR"}
        </button>
      </div>

      {showForm && (
        <form className="form" onSubmit={handleSubmit}>
          <div className="form-row">
            <label>
              Request type
              <select
                value={requestType}
                onChange={(e) => setRequestType(e.target.value as PopiaDsrRequest["requestType"])}
              >
                <option>Access</option>
                <option>Correction</option>
                <option>Deletion</option>
                <option>Objection</option>
                <option>Portability</option>
              </select>
            </label>
            <label>
              Requestor name *
              <input
                required
                value={requestorName}
                onChange={(e) => setRequestorName(e.target.value)}
              />
            </label>
          </div>
          <div className="form-row">
            <label>
              Requestor email *
              <input
                required
                type="email"
                value={requestorEmail}
                onChange={(e) => setRequestorEmail(e.target.value)}
              />
            </label>
          </div>
          <div className="form-row">
            <label style={{ width: "100%" }}>
              Description *
              <textarea
                required
                rows={3}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </label>
          </div>
          <button className="primary small" type="submit" disabled={processing}>
            {processing ? "Saving…" : "Log request"}
          </button>
        </form>
      )}

      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr>
            <th>Requestor</th>
            <th>Type</th>
            <th>Status</th>
            <th>Received</th>
            <th>Due</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {requests.map((req) => {
            const sel = pendingStatus[req.id] ?? req.status;
            const dueClass = getDueClass(req.dueAt, req.status);
            return (
              <tr key={req.id} className="dsr-row">
                <td>
                  <div>{req.requestorName}</div>
                  <div style={{ fontSize: "0.78rem", opacity: 0.6 }}>{req.requestorEmail}</div>
                </td>
                <td>
                  <span className="dsr-type-badge">{req.requestType}</span>
                </td>
                <td>
                  <span className="pill">{req.status}</span>
                </td>
                <td>{new Date(req.receivedAt).toLocaleDateString()}</td>
                <td>
                  <span className={dueClass}>{getDueLabel(req.dueAt, req.status)}</span>
                </td>
                <td style={{ display: "flex", gap: 6, alignItems: "center" }}>
                  <select
                    value={sel}
                    onChange={(e) =>
                      setPendingStatus((prev) => ({
                        ...prev,
                        [req.id]: e.target.value as PopiaDsrRequest["status"],
                      }))
                    }
                    style={{ fontSize: "0.8rem" }}
                  >
                    <option>Received</option>
                    <option>In Progress</option>
                    <option>Completed</option>
                    <option>Denied</option>
                    <option>Escalated</option>
                  </select>
                  <button
                    className="ghost small"
                    onClick={() => updateDsr(req, sel)}
                    disabled={sel === req.status}
                  >
                    Update
                  </button>
                </td>
              </tr>
            );
          })}
          {requests.length === 0 && (
            <tr>
              <td colSpan={6} style={{ textAlign: "center", padding: "1rem", opacity: 0.5 }}>
                No DSR requests logged yet.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

// ── Tab 3: Breach Incidents ───────────────────────────────────────────────────

function BreachTab({
  incidents,
  setIncidents,
  log,
  showToast,
}: {
  incidents: PopiaBreachIncident[];
  setIncidents: React.Dispatch<React.SetStateAction<PopiaBreachIncident[]>>;
  log: Props["log"];
  showToast: Props["showToast"];
}) {
  const [showForm, setShowForm] = useState(false);
  const [processing, setProcessing] = useState(false);

  const [incidentDate, setIncidentDate] = useState("");
  const [description, setDescription] = useState("");
  const [dataSubjectsAffected, setDataSubjectsAffected] = useState("");
  const [personalInfoTypes, setPersonalInfoTypes] = useState("");
  const [severity, setSeverity] = useState<PopiaBreachIncident["severity"]>("Medium");
  const [remediationSteps, setRemediationSteps] = useState("");

  const total = incidents.length;
  const openCount = incidents.filter((i) => i.status === "Open" || i.status === "Under investigation").length;
  const regulatorNotified = incidents.filter((i) => i.regulatorNotified).length;
  const criticalHigh = incidents.filter((i) => i.severity === "Critical" || i.severity === "High").length;

  function severityClass(s: PopiaBreachIncident["severity"]) {
    if (s === "Low") return "severity-low";
    if (s === "Medium") return "severity-medium";
    if (s === "High") return "severity-high";
    return "severity-critical";
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setProcessing(true);
    const input = {
      incidentDate,
      description,
      dataSubjectsAffected: Number(dataSubjectsAffected),
      severity,
      status: "Open" as const,
      regulatorNotified: false,
      remediationSteps,
    };
    try {
      const res = await createPopiaBreachIncident(input);
      setIncidents((prev) => [res.incident, ...prev]);
      showToast(
        "success",
        "Breach reported",
        "Incident logged. Consider notifying the Information Regulator."
      );
      log(`Breach incident reported: ${severity} severity`);
    } catch {
      const local: PopiaBreachIncident = { id: uid("BR"), ...input };
      setIncidents((prev) => [local, ...prev]);
      showToast("info", "Saved locally", "Incident logged locally.");
    }
    setProcessing(false);
    setShowForm(false);
    setIncidentDate("");
    setDescription("");
    setDataSubjectsAffected("");
    setPersonalInfoTypes("");
    setSeverity("Medium");
    setRemediationSteps("");
  }

  return (
    <div className="tier1-section">
      <div className="popia-breach-notice">
        <AlertTriangle size={15} />
        <span>
          Section 22 of POPIA: you must notify the Information Regulator as soon as reasonably
          possible after becoming aware of a breach. Where data subjects may be at risk, notify
          them directly.
        </span>
      </div>

      <div className="compliance-summary">
        <div className="compliance-stat">
          <span className="eyebrow">Total incidents</span>
          <strong>{total}</strong>
        </div>
        <div className="compliance-stat">
          <span className="eyebrow">Open</span>
          <strong>{openCount}</strong>
        </div>
        <div className="compliance-stat">
          <span className="eyebrow">Regulator notified</span>
          <strong>{regulatorNotified}</strong>
        </div>
        <div className="compliance-stat">
          <span className="eyebrow">Critical / High</span>
          <strong style={{ color: criticalHigh > 0 ? "var(--red, #e53e3e)" : undefined }}>
            {criticalHigh}
          </strong>
        </div>
      </div>

      <div className="inline-form-toggle">
        <button className="ghost small" onClick={() => setShowForm((v) => !v)}>
          {showForm ? <X size={14} /> : <ShieldAlert size={14} />}
          {showForm ? "Cancel" : "Report breach"}
        </button>
      </div>

      {showForm && (
        <form className="form" onSubmit={handleSubmit}>
          <div className="form-row">
            <label>
              Incident date/time *
              <input
                required
                type="datetime-local"
                value={incidentDate}
                onChange={(e) => setIncidentDate(e.target.value)}
              />
            </label>
            <label>
              Severity
              <select
                value={severity}
                onChange={(e) => setSeverity(e.target.value as PopiaBreachIncident["severity"])}
              >
                <option>Low</option>
                <option>Medium</option>
                <option>High</option>
                <option>Critical</option>
              </select>
            </label>
          </div>
          <div className="form-row">
            <label>
              Data subjects affected
              <input
                type="number"
                min={0}
                value={dataSubjectsAffected}
                onChange={(e) => setDataSubjectsAffected(e.target.value)}
              />
            </label>
            <label>
              Personal info types (comma-separated)
              <input
                value={personalInfoTypes}
                onChange={(e) => setPersonalInfoTypes(e.target.value)}
                placeholder="e.g. ID numbers, Financials"
              />
            </label>
          </div>
          <div className="form-row">
            <label style={{ width: "100%" }}>
              Description *
              <textarea
                required
                rows={3}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Describe how the breach occurred…"
              />
            </label>
          </div>
          <div className="form-row">
            <label style={{ width: "100%" }}>
              Remediation steps
              <textarea
                rows={3}
                value={remediationSteps}
                onChange={(e) => setRemediationSteps(e.target.value)}
                placeholder="Steps taken or planned to contain the breach…"
              />
            </label>
          </div>
          <button className="primary small" type="submit" disabled={processing}>
            {processing ? "Saving…" : "Report incident"}
          </button>
        </form>
      )}

      <table className="breach-table" style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr>
            <th>Date</th>
            <th>Description</th>
            <th>Subjects affected</th>
            <th>Severity</th>
            <th>Status</th>
            <th>Regulator</th>
            <th>Remediation</th>
          </tr>
        </thead>
        <tbody>
          {incidents.map((inc) => (
            <tr key={inc.id}>
              <td>{new Date(inc.incidentDate).toLocaleDateString()}</td>
              <td>{inc.description}</td>
              <td>{inc.dataSubjectsAffected.toLocaleString()}</td>
              <td>
                <span className={`pill ${severityClass(inc.severity)}`}>{inc.severity}</span>
              </td>
              <td>
                <span className="pill">{inc.status}</span>
              </td>
              <td>
                {inc.regulatorNotified ? (
                  <span className="regulator-notified">
                    <CheckCircle2 size={12} /> Notified ✓
                  </span>
                ) : (
                  <span className="regulator-pending">Pending</span>
                )}
              </td>
              <td style={{ maxWidth: 200, fontSize: "0.8rem" }}>
                {inc.remediationSteps || "—"}
              </td>
            </tr>
          ))}
          {incidents.length === 0 && (
            <tr>
              <td colSpan={7} style={{ textAlign: "center", padding: "1rem", opacity: 0.5 }}>
                No breach incidents reported.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
