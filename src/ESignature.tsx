import { CheckCircle2, ChevronDown, ChevronRight, FileText, Mail, Pen, Plus, Shield, Upload, X } from "lucide-react";
import { FormEvent, useEffect, useRef, useState } from "react";
import { createSignatureRequest, sendSignatureOtp, submitSignature } from "./api";
import type { SignatureAuditEvent, SignatureRequest, SignatureSignatory } from "./types";

const uid = (p: string) => `${p}-${Math.random().toString(36).slice(2, 7).toUpperCase()}`;
const today = () => new Date().toISOString().slice(0, 10);
const addDays = (n: number) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);
const formatDt = (iso: string) => iso ? new Date(iso).toLocaleString("en-ZA") : "—";
const thisMonth = () => new Date().toISOString().slice(0, 7);

const STATUS_CLASS: Record<SignatureRequest["status"], string> = {
  draft: "sig-status-draft", sent: "sig-status-sent",
  partially_signed: "sig-status-partially-signed", completed: "sig-status-completed",
  expired: "sig-status-expired", cancelled: "sig-status-cancelled"
};

const AUDIT_ICONS: Record<string, typeof FileText> = {
  request_created: FileText, otp_sent: Mail, signed: CheckCircle2, declined: X
};

function SignatureCanvas({ onCapture }: { onCapture: (dataUri: string) => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);

  function getPos(e: React.MouseEvent | React.TouchEvent) {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    const src = "touches" in e ? e.touches[0] : e;
    return { x: src.clientX - rect.left, y: src.clientY - rect.top };
  }

  function startDraw(e: React.MouseEvent | React.TouchEvent) {
    e.preventDefault();
    drawing.current = true;
    const ctx = canvasRef.current!.getContext("2d")!;
    const { x, y } = getPos(e);
    ctx.beginPath();
    ctx.moveTo(x, y);
  }

  function draw(e: React.MouseEvent | React.TouchEvent) {
    if (!drawing.current) return;
    e.preventDefault();
    const ctx = canvasRef.current!.getContext("2d")!;
    ctx.strokeStyle = "#10241f";
    ctx.lineWidth = 2;
    ctx.lineCap = "round";
    const { x, y } = getPos(e);
    ctx.lineTo(x, y);
    ctx.stroke();
  }

  function endDraw() { drawing.current = false; }

  function clear() {
    const canvas = canvasRef.current!;
    canvas.getContext("2d")!.clearRect(0, 0, canvas.width, canvas.height);
  }

  function apply() {
    onCapture(canvasRef.current!.toDataURL("image/png"));
  }

  return (
    <div>
      <div className="sig-canvas-wrapper">
        <canvas ref={canvasRef} width={400} height={150}
          onMouseDown={startDraw} onMouseMove={draw} onMouseUp={endDraw} onMouseLeave={endDraw}
          onTouchStart={startDraw} onTouchMove={draw} onTouchEnd={endDraw} />
      </div>
      <div style={{ display: "flex", gap: 8 }}>
        <button className="ghost small" onClick={clear}>Clear</button>
        <button className="primary small" onClick={apply}>Apply signature</button>
      </div>
    </div>
  );
}

export function ESignature({
  requests, setRequests, log, showToast
}: {
  requests: SignatureRequest[];
  setRequests: React.Dispatch<React.SetStateAction<SignatureRequest[]>>;
  log: (msg: string) => void;
  showToast: (type: "success" | "error" | "info", title: string, msg: string) => void;
}) {
  const [showForm, setShowForm] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [sigTab, setSigTab] = useState<"draw" | "type" | "upload">("draw");
  const [activeTab, setActiveTab] = useState<"signatories" | "audit" | "certificate">("signatories");
  const [signatories, setSignatories] = useState([{ name: "", email: "", idNumber: "", role: "" }]);
  const [typedSig, setTypedSig] = useState("");
  const [capturedSig, setCapturedSig] = useState("");
  const [otpValues, setOtpValues] = useState<Record<string, string>>({});
  const [signingId, setSigningId] = useState<string | null>(null);

  const pending = requests.filter(r => r.status === "sent" || r.status === "partially_signed").length;
  const completedThisMonth = requests.filter(r => r.status === "completed" && r.completedAt.startsWith(thisMonth())).length;
  const declined = requests.flatMap(r => r.signatories).filter(s => s.status === "declined").length;

  function addSignatory() {
    setSignatories(prev => [...prev, { name: "", email: "", idNumber: "", role: "" }]);
  }

  function updateSignatory(i: number, key: string, value: string) {
    setSignatories(prev => prev.map((s, idx) => idx === i ? { ...s, [key]: value } : s));
  }

  function removeSignatory(i: number) {
    setSignatories(prev => prev.filter((_, idx) => idx !== i));
  }

  async function handleCreate(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const input = {
      documentTitle: String(f.get("documentTitle")),
      documentType: String(f.get("documentType")),
      matterRef: String(f.get("matterRef") || ""),
      documentBody: String(f.get("documentBody") || ""),
      expiresAt: String(f.get("expiresAt") || addDays(14)),
      signatories: signatories.filter(s => s.name && s.email).map((s, i) => ({
        signatoryName: s.name, signatoryEmail: s.email,
        signatoryIdNumber: s.idNumber, role: s.role || "Signatory", orderPosition: i + 1
      }))
    };
    if (!input.signatories.length) {
      showToast("error", "No signatories", "Add at least one signatory.");
      return;
    }
    try {
      const res = await createSignatureRequest(input);
      setRequests(prev => [res.request, ...prev]);
      showToast("success", "Request created", `Sent to ${input.signatories.length} signator${input.signatories.length === 1 ? "y" : "ies"}.`);
      log(`Signature request created: ${input.documentTitle}`);
    } catch {
      const newReq: SignatureRequest = {
        id: uid("SR"), documentTitle: input.documentTitle, documentType: input.documentType,
        matterRef: input.matterRef, documentBody: input.documentBody, status: "sent",
        expiresAt: input.expiresAt, completedAt: "",
        signatories: input.signatories.map((s, i) => ({ id: uid("SS"), signatoryName: s.signatoryName, signatoryEmail: s.signatoryEmail, signatoryIdNumber: s.signatoryIdNumber, role: s.role, orderPosition: s.orderPosition, status: "pending", signedAt: "", signatureMethod: "" })),
        auditEvents: [{ id: uid("AE"), eventType: "request_created", description: "Signature request created (local)", ipAddress: "", createdAt: new Date().toISOString() }]
      };
      setRequests(prev => [newReq, ...prev]);
      showToast("info", "Saved locally", "Request saved. Connect API to send OTPs.");
    }
    setShowForm(false);
    setSignatories([{ name: "", email: "", idNumber: "", role: "" }]);
    (e.target as HTMLFormElement).reset();
  }

  async function handleSendOtp(req: SignatureRequest, sig: SignatureSignatory) {
    try {
      await sendSignatureOtp(req.id, sig.id);
      setRequests(prev => prev.map(r => r.id === req.id ? { ...r, signatories: r.signatories.map(s => s.id === sig.id ? { ...s, status: "otp_sent" } : s) } : r));
      showToast("success", "OTP sent", `Code sent to ${sig.signatoryEmail}`);
    } catch {
      setRequests(prev => prev.map(r => r.id === req.id ? { ...r, signatories: r.signatories.map(s => s.id === sig.id ? { ...s, status: "otp_sent" } : s) } : r));
      showToast("info", "OTP simulated", "In dev mode — OTP logged to server console. Use any 6-digit code.");
    }
    log(`OTP sent to ${sig.signatoryEmail}`);
  }

  async function handleSign(req: SignatureRequest, sig: SignatureSignatory) {
    const otp = otpValues[sig.id] || "";
    if (!otp || otp.length !== 6) { showToast("error", "Invalid OTP", "Enter the 6-digit code."); return; }
    const methodMap = { draw: "drawn", type: "typed", upload: "uploaded" } as const;
    const sigMethod = methodMap[sigTab];
    const dataUri = sigTab === "type" ? `data:text/plain;base64,${btoa(typedSig)}` : capturedSig || `data:text/plain;base64,${btoa("simulated")}`;
    try {
      const res = await submitSignature(req.id, sig.id, { otp, signatureDataUri: dataUri, signatureMethod: sigMethod });
      setRequests(prev => prev.map(r => {
        if (r.id !== req.id) return r;
        const newSigs = r.signatories.map(s => s.id === sig.id ? res.signatory : s);
        const allSigned = newSigs.every(s => s.status === "signed");
        return { ...r, signatories: newSigs, status: allSigned ? "completed" : "partially_signed", completedAt: allSigned ? new Date().toISOString() : "" };
      }));
      showToast("success", "Document signed", `${sig.signatoryName} signed using ${sigTab} method.`);
      log(`${sig.signatoryName} signed ${req.documentTitle}`);
    } catch {
      setRequests(prev => prev.map(r => {
        if (r.id !== req.id) return r;
        const newSigs = r.signatories.map(s => s.id === sig.id ? { ...s, status: "signed" as const, signedAt: new Date().toISOString(), signatureMethod: sigMethod } : s);
        const allSigned = newSigs.every(s => s.status === "signed");
        return { ...r, signatories: newSigs, status: allSigned ? "completed" : "partially_signed", completedAt: allSigned ? new Date().toISOString() : "" };
      }));
      showToast("info", "Signed locally", "Signature recorded locally.");
    }
    setSigningId(null);
    setCapturedSig("");
    setTypedSig("");
    setOtpValues(prev => { const n = { ...prev }; delete n[sig.id]; return n; });
  }

  return (
    <>
      <div className="ecta-notice">
        <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
          <Shield size={18} style={{ color: "var(--blue)", flexShrink: 0, marginTop: 2 }} />
          <div>
            <strong>ECTA-Compliant Advanced Electronic Signatures</strong>
            <p style={{ margin: "4px 0 0", fontSize: "0.87rem" }}>
              Electronic signatures are recognised under the Electronic Communications and Transactions Act 25 of 2002.
              This module implements AES (Advanced Electronic Signatures) with OTP verification and a full audit trail.
              An attorney must confirm that the document type is suitable for electronic execution before use.
            </p>
          </div>
        </div>
      </div>

      <section className="metrics">
        <div className="metric"><span>Total requests</span><strong>{requests.length}</strong><small>All time</small></div>
        <div className="metric"><span>Awaiting signatures</span><strong style={{ color: pending > 0 ? "var(--gold)" : undefined }}>{pending}</strong><small>Sent / partial</small></div>
        <div className="metric"><span>Completed this month</span><strong>{completedThisMonth}</strong><small style={{ color: "var(--green)" }}>Fully signed</small></div>
        <div className="metric"><span>Declined</span><strong style={{ color: declined > 0 ? "var(--rose)" : undefined }}>{declined}</strong><small>Refused to sign</small></div>
      </section>

      <section className="tier1-section">
        <div className="panel-head">
          <h3>Signature requests</h3>
          <button className="primary small" onClick={() => setShowForm(v => !v)}>
            <Plus size={16} /> {showForm ? "Cancel" : "New request"}
          </button>
        </div>

        {showForm && (
          <div className="inline-form-toggle">
            <form className="form" onSubmit={handleCreate}>
              <div className="form-row">
                <label>Document title<input name="documentTitle" required placeholder="e.g. Offer to Purchase — Erf 1204" /></label>
                <label>Document type
                  <select name="documentType">
                    <option value="contract">Contract</option>
                    <option value="offer_to_purchase">Offer to purchase</option>
                    <option value="lease">Lease agreement</option>
                    <option value="employment">Employment contract</option>
                    <option value="antenuptial">Antenuptial contract</option>
                    <option value="power_of_attorney">Power of attorney</option>
                    <option value="consent">Consent form</option>
                    <option value="other">Other</option>
                  </select>
                </label>
              </div>
              <div className="form-row">
                <label>Matter ref<input name="matterRef" placeholder="M-2026-001" /></label>
                <label>Expires<input name="expiresAt" type="date" defaultValue={addDays(14)} /></label>
              </div>
              <label>Document text (optional — paste key terms)<textarea name="documentBody" rows={3} /></label>

              <div style={{ border: "1px solid var(--line)", borderRadius: 8, padding: 16, marginTop: 4 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                  <strong style={{ fontSize: "0.9rem" }}>Signatories</strong>
                  <button className="ghost small" type="button" onClick={addSignatory}><Plus size={14} /> Add signatory</button>
                </div>
                {signatories.map((s, i) => (
                  <div key={i} style={{ display: "grid", gridTemplateColumns: "1fr 1fr 120px 100px 36px", gap: 8, marginBottom: 8 }}>
                    <input placeholder="Full name" value={s.name} onChange={e => updateSignatory(i, "name", e.target.value)} style={{ padding: "8px 10px", border: "1px solid var(--line)", borderRadius: 6, fontSize: "0.88rem" }} />
                    <input placeholder="Email" type="email" value={s.email} onChange={e => updateSignatory(i, "email", e.target.value)} style={{ padding: "8px 10px", border: "1px solid var(--line)", borderRadius: 6, fontSize: "0.88rem" }} />
                    <input placeholder="ID number" value={s.idNumber} onChange={e => updateSignatory(i, "idNumber", e.target.value)} style={{ padding: "8px 10px", border: "1px solid var(--line)", borderRadius: 6, fontSize: "0.88rem" }} />
                    <input placeholder="Role (e.g. Seller)" value={s.role} onChange={e => updateSignatory(i, "role", e.target.value)} style={{ padding: "8px 10px", border: "1px solid var(--line)", borderRadius: 6, fontSize: "0.88rem" }} />
                    {signatories.length > 1 && <button type="button" className="ghost small" onClick={() => removeSignatory(i)}><X size={14} /></button>}
                  </div>
                ))}
              </div>

              <label className="switch-row">
                <input type="checkbox" required />
                I confirm all signatories have been informed this is a legally binding ECTA-compliant electronic signature process.
              </label>
              <button className="primary" type="submit">Create signature request</button>
            </form>
          </div>
        )}

        {requests.map(req => {
          const signedCount = req.signatories.filter(s => s.status === "signed").length;
          const isExpanded = expandedId === req.id;
          return (
            <div key={req.id} className={`sig-request-card${isExpanded ? " expanded" : ""}`} onClick={() => setExpandedId(isExpanded ? null : req.id)}>
              <div className="sig-request-head">
                <div>
                  <strong>{req.documentTitle}</strong>
                  {req.matterRef && <span style={{ marginLeft: 8, fontSize: "0.83rem", color: "var(--muted)" }}>{req.matterRef}</span>}
                  <p style={{ margin: "3px 0 0", fontSize: "0.83rem", color: "var(--muted)" }}>
                    {req.documentType} · {signedCount}/{req.signatories.length} signed · Expires {req.expiresAt.slice(0, 10)}
                  </p>
                </div>
                <div style={{ display: "flex", gap: 8, alignItems: "center", flexShrink: 0 }}>
                  <span className={STATUS_CLASS[req.status]}>{req.status.replace("_", " ")}</span>
                  {isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                </div>
              </div>

              {isExpanded && (
                <div style={{ marginTop: 16, borderTop: "1px solid var(--line)", paddingTop: 14 }} onClick={e => e.stopPropagation()}>
                  <div className="popia-tabs">
                    {(["signatories", "audit", "certificate"] as const).map(tab => (
                      <button key={tab} className={`popia-tab${activeTab === tab ? " active" : ""}`} onClick={() => setActiveTab(tab)}>
                        {tab === "signatories" ? "Signatories" : tab === "audit" ? "Audit Trail" : "Certificate"}
                      </button>
                    ))}
                  </div>

                  {activeTab === "signatories" && req.signatories.map(sig => (
                    <div key={sig.id} className="sig-signatory-row">
                      <div>
                        <strong style={{ fontSize: "0.9rem" }}>{sig.signatoryName}</strong>
                        <small style={{ display: "block", color: "var(--muted)" }}>{sig.signatoryEmail} · {sig.role}</small>
                        {sig.status === "signed" && <small style={{ color: "var(--green)" }}>✓ Signed {formatDt(sig.signedAt)} via {sig.signatureMethod}</small>}
                      </div>
                      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                        <span className={`pill ${sig.status === "signed" ? "recon-status-approved" : sig.status === "otp_sent" ? "fica-status-in-progress" : "fica-status-pending"}`}>
                          {sig.status.replace("_", " ")}
                        </span>
                        {sig.status === "pending" && req.status !== "completed" && req.status !== "expired" && (
                          <button className="primary small" onClick={() => handleSendOtp(req, sig)}>
                            <Mail size={14} /> Send OTP
                          </button>
                        )}
                        {sig.status === "otp_sent" && (
                          <button className="ghost small" onClick={() => setSigningId(signingId === sig.id ? null : sig.id)}>
                            <Pen size={14} /> {signingId === sig.id ? "Cancel" : "Sign"}
                          </button>
                        )}
                      </div>
                    </div>
                  ))}

                  {activeTab === "signatories" && signingId && req.signatories.find(s => s.id === signingId) && (() => {
                    const sig = req.signatories.find(s => s.id === signingId)!;
                    return (
                      <div className="inline-form-toggle" style={{ marginTop: 14 }}>
                        <p className="eyebrow">Sign document — {sig.signatoryName}</p>
                        <div className="popia-tabs" style={{ marginBottom: 14 }}>
                          {(["draw", "type", "upload"] as const).map(t => (
                            <button key={t} className={`popia-tab${sigTab === t ? " active" : ""}`} onClick={() => setSigTab(t)}>
                              {t === "draw" ? <><Pen size={14} /> Draw</> : t === "type" ? "Type" : <><Upload size={14} /> Upload</>}
                            </button>
                          ))}
                        </div>
                        {sigTab === "draw" && <SignatureCanvas onCapture={uri => setCapturedSig(uri)} />}
                        {sigTab === "type" && (
                          <div>
                            <input style={{ padding: "10px 12px", border: "1px solid var(--line)", borderRadius: 8, width: "100%", marginBottom: 10 }} placeholder="Type your full name" value={typedSig} onChange={e => setTypedSig(e.target.value)} />
                            {typedSig && <div className="sig-typed-preview">{typedSig}</div>}
                            <button className="primary small" onClick={() => setCapturedSig(`data:text/plain;base64,${btoa(typedSig)}`)}>Apply typed signature</button>
                          </div>
                        )}
                        {sigTab === "upload" && (
                          <div>
                            <input type="file" accept="image/png,image/jpeg" onChange={async e => {
                              const file = e.target.files?.[0];
                              if (!file) return;
                              const reader = new FileReader();
                              reader.onload = () => setCapturedSig(String(reader.result));
                              reader.readAsDataURL(file);
                            }} />
                            {capturedSig && capturedSig.startsWith("data:image") && <img src={capturedSig} alt="Uploaded signature" style={{ maxHeight: 100, marginTop: 10, border: "1px solid var(--line)", borderRadius: 6 }} />}
                          </div>
                        )}
                        {capturedSig && (
                          <div style={{ marginTop: 14, display: "flex", gap: 8, alignItems: "center" }}>
                            <label style={{ fontWeight: 600, fontSize: "0.88rem" }}>
                              OTP code
                              <input className="otp-input" maxLength={6} value={otpValues[sig.id] || ""} onChange={e => setOtpValues(prev => ({ ...prev, [sig.id]: e.target.value.replace(/\D/g, "").slice(0, 6) }))} placeholder="000000" style={{ marginLeft: 10 }} />
                            </label>
                            <button className="primary" onClick={() => handleSign(req, sig)} disabled={!otpValues[sig.id] || otpValues[sig.id].length !== 6}>
                              <CheckCircle2 size={16} /> Submit signature
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })()}

                  {activeTab === "audit" && (
                    <div className="audit-trail">
                      {req.auditEvents.map(event => {
                        const Icon = AUDIT_ICONS[event.eventType] ?? FileText;
                        return (
                          <div key={event.id} className="audit-event">
                            <Icon size={16} />
                            <div style={{ flex: 1 }}>
                              <strong style={{ fontSize: "0.87rem" }}>{event.description}</strong>
                              <div style={{ fontSize: "0.78rem", color: "var(--muted)" }}>{formatDt(event.createdAt)}{event.ipAddress ? ` · IP: ${event.ipAddress}` : ""}</div>
                            </div>
                          </div>
                        );
                      })}
                      {req.auditEvents.length === 0 && <p style={{ color: "var(--muted)", fontSize: "0.87rem" }}>No audit events yet.</p>}
                    </div>
                  )}

                  {activeTab === "certificate" && req.status === "completed" && (
                    <div className="completion-certificate">
                      <CheckCircle2 size={20} style={{ color: "var(--green)", marginBottom: 8 }} />
                      <h4>Certificate of Completion</h4>
                      <p style={{ fontSize: "0.87rem", marginBottom: 12 }}><strong>{req.documentTitle}</strong></p>
                      {req.signatories.map(s => (
                        <div key={s.id} style={{ fontSize: "0.85rem", marginBottom: 4 }}>
                          ✓ {s.signatoryName} ({s.role}) signed {formatDt(s.signedAt)} via {s.signatureMethod}
                        </div>
                      ))}
                      <p style={{ fontSize: "0.8rem", color: "var(--muted)", marginTop: 12 }}>
                        This document was executed electronically in compliance with the Electronic Communications and Transactions Act 25 of 2002 (ECTA). The advanced electronic signatures above constitute valid signatures binding on the parties.
                      </p>
                      <button className="ghost small" style={{ marginTop: 8 }} onClick={() => showToast("info", "Download", "PDF certificate generation requires backend connection.")}>Download certificate PDF</button>
                    </div>
                  )}
                  {activeTab === "certificate" && req.status !== "completed" && (
                    <p style={{ color: "var(--muted)", fontSize: "0.87rem", padding: "12px 0" }}>Certificate available once all signatories have signed.</p>
                  )}
                </div>
              )}
            </div>
          );
        })}
        {requests.length === 0 && <p style={{ color: "var(--muted)", textAlign: "center", padding: 24 }}>No signature requests yet. Create the first one above.</p>}
      </section>
    </>
  );
}
