import { AlertTriangle, CheckCircle2, FileSearch, FileText, Scale, Sparkles, Upload } from "lucide-react";
import { FormEvent, useState } from "react";
import { submitDocumentForAnalysis } from "./api";
import type { DocumentAnalysis } from "./types";

type Props = {
  analyses: DocumentAnalysis[];
  setAnalyses: React.Dispatch<React.SetStateAction<DocumentAnalysis[]>>;
  log: (msg: string) => void;
  showToast: (type: "success" | "error" | "info", title: string, msg: string) => void;
};

const maxBytes = 8 * 1024 * 1024;

async function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

function StatusPill({ status }: { status: DocumentAnalysis["analysisStatus"] }) {
  const key = status.toLowerCase();
  const cls =
    status === "Complete" ? "doc-analysis-status-complete" :
    status === "Failed" ? "doc-analysis-status-failed" :
    "doc-analysis-status-analysing";
  return <span className={cls} data-status={key}>{status}</span>;
}

export function DocumentIntelligence({ analyses, setAnalyses, log, showToast }: Props) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [matterRef, setMatterRef] = useState("");

  const totalRiskFlags = analyses.reduce((acc, a) => acc + a.riskFlags.length, 0);
  const totalSaFlags = analyses.reduce((acc, a) => acc + a.saLawFlags.length, 0);
  const completeCount = analyses.filter((a) => a.analysisStatus === "Complete").length;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!selectedFile) return;

    if (selectedFile.size > maxBytes) {
      showToast("error", "File too large", "Maximum file size is 8 MB.");
      return;
    }

    setUploading(true);
    log(`Submitting document for analysis: ${selectedFile.name}`);
    try {
      const fileDataUrl = await fileToDataUrl(selectedFile);
      const res = await submitDocumentForAnalysis({
        fileName: selectedFile.name,
        fileDataUrl,
        matterRef: matterRef.trim() || undefined,
      });
      setAnalyses((prev) => [res.analysis, ...prev]);
      showToast("success", "Document queued for AI analysis.", `${selectedFile.name} has been submitted.`);
      log(`Document analysis queued: ${res.analysis.id}`);
      setSelectedFile(null);
      setMatterRef("");
      const fileInput = document.getElementById("doc-file-input") as HTMLInputElement | null;
      if (fileInput) fileInput.value = "";
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Upload failed";
      showToast("error", "Analysis submission failed", msg);
      log(`Document analysis error: ${msg}`);
    } finally {
      setUploading(false);
    }
  }

  function toggleExpand(id: string) {
    setExpandedId((prev) => (prev === id ? null : id));
  }

  return (
    <>
      <div className="doc-notice">
        <p style={{ margin: 0, fontSize: "0.9rem", lineHeight: 1.5 }}>
          <Sparkles size={16} style={{ verticalAlign: "-3px", marginRight: 8, color: "var(--green)" }} />
          Upload any South African contract, deed, order or agreement. The AI extracts parties, key dates, obligations
          and flags SA-specific legal risks (voetstoots, CPA cooling-off, NCA compliance, POPIA obligations).{" "}
          <strong>Attorney review required before acting on any AI analysis.</strong>
        </p>
      </div>

      <section className="metrics">
        <div className="metric">
          <span>Total documents</span>
          <strong>{analyses.length}</strong>
          <small>Submitted for analysis</small>
        </div>
        <div className="metric">
          <span>Complete analyses</span>
          <strong>{completeCount}</strong>
          <small>Ready to review</small>
        </div>
        <div className="metric">
          <span>Risk flags found</span>
          <strong style={{ color: totalRiskFlags > 0 ? "var(--rose)" : undefined }}>{totalRiskFlags}</strong>
          <small>Across all documents</small>
        </div>
        <div className="metric">
          <span>SA law flags found</span>
          <strong style={{ color: totalSaFlags > 0 ? "var(--gold)" : undefined }}>{totalSaFlags}</strong>
          <small>Voetstoots / CPA / NCA / POPIA</small>
        </div>
      </section>

      <div className="panel" style={{ marginBottom: 20 }}>
        <div className="panel-head">
          <h3><Upload size={16} style={{ verticalAlign: "-3px", marginRight: 6, color: "var(--green)" }} /> Analyse a document</h3>
        </div>
        <form className="form" onSubmit={handleSubmit}>
          <div className="form-row">
            <label>
              <span>Document file <em style={{ color: "var(--muted)", fontStyle: "normal", fontWeight: 400 }}>(PDF, DOCX, TXT, MD — max 8 MB)</em></span>
              <input
                id="doc-file-input"
                type="file"
                accept=".pdf,.docx,.txt,.md"
                disabled={uploading}
                onChange={(e) => setSelectedFile(e.target.files?.[0] ?? null)}
              />
            </label>
            <label>
              <span>Matter reference <em style={{ color: "var(--muted)", fontStyle: "normal", fontWeight: 400 }}>(optional)</em></span>
              <input
                type="text"
                placeholder="e.g. MAT-2024-001"
                value={matterRef}
                onChange={(e) => setMatterRef(e.target.value)}
                disabled={uploading}
              />
            </label>
          </div>
          <button className="primary" type="submit" disabled={uploading || !selectedFile}>
            {uploading ? "Analysing…" : <><FileSearch size={16} /> Analyse document</>}
          </button>
        </form>
      </div>

      {analyses.length > 0 && (
        <div className="panel">
          <div className="panel-head">
            <h3><FileText size={16} style={{ verticalAlign: "-3px", marginRight: 6, color: "var(--green)" }} /> Analysis register</h3>
            <span className="pill">{analyses.length}</span>
          </div>
          <div>
            {analyses.map((a) => {
              const expanded = expandedId === a.id;
              return (
                <div key={a.id}>
                  <div
                    className={`doc-analysis-row${expanded ? " expanded" : ""}`}
                    onClick={() => toggleExpand(a.id)}
                    role="button"
                    tabIndex={0}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                      <FileText size={16} style={{ color: "var(--green)", flexShrink: 0 }} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 600, fontSize: "0.92rem", color: "var(--ink)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {a.fileName}
                        </div>
                        <div style={{ fontSize: "0.78rem", color: "var(--muted)", marginTop: 2 }}>
                          {a.documentType || "Detecting…"} · {a.analysedAt ? new Date(a.analysedAt).toLocaleString() : "—"}
                        </div>
                      </div>
                      <StatusPill status={a.analysisStatus} />
                      <span style={{ color: "var(--muted)", fontSize: "0.85rem", marginLeft: 6 }}>
                        {expanded ? "▲" : "▼"}
                      </span>
                    </div>
                  </div>

                  {expanded && (
                    <div className="doc-detail">
                      {a.summary && (
                        <div style={{ marginBottom: 16 }}>
                          <h4 style={{ margin: "0 0 6px", fontSize: "0.78rem", textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--muted)", display: "flex", alignItems: "center", gap: 6 }}>
                            <Sparkles size={12} /> Summary
                          </h4>
                          <p style={{ margin: 0, fontSize: "0.9rem", lineHeight: 1.55 }}>{a.summary}</p>
                        </div>
                      )}

                      {a.parties.length > 0 && (
                        <div style={{ marginBottom: 16 }}>
                          <h4 style={{ margin: "0 0 8px", fontSize: "0.78rem", textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--muted)" }}>
                            Parties detected
                          </h4>
                          <div>
                            {a.parties.map((p, i) => (
                              <span key={i} className="doc-party-chip">{p}</span>
                            ))}
                          </div>
                        </div>
                      )}

                      {a.keyDates.length > 0 && (
                        <div style={{ marginBottom: 16 }}>
                          <h4 style={{ margin: "0 0 8px", fontSize: "0.78rem", textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--muted)" }}>
                            Key dates
                          </h4>
                          <div className="doc-key-dates">
                            {a.keyDates.map((kd, i) => (
                              <div key={i} className="doc-key-date">
                                <strong>{kd.label}</strong>
                                <span style={{ fontFamily: "var(--font-mono)", fontSize: "0.88rem" }}>{kd.date}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {a.obligations.length > 0 && (
                        <div style={{ marginBottom: 16 }}>
                          <h4 style={{ margin: "0 0 8px", fontSize: "0.78rem", textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--muted)" }}>
                            Obligations
                          </h4>
                          <ol className="doc-obligation-list">
                            {a.obligations.map((o, i) => (
                              <li key={i}><span>{o}</span></li>
                            ))}
                          </ol>
                        </div>
                      )}

                      {a.riskFlags.length > 0 && (
                        <div style={{ marginBottom: 16 }}>
                          <h4 style={{ margin: "0 0 8px", fontSize: "0.78rem", textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--rose)", display: "flex", alignItems: "center", gap: 6 }}>
                            <AlertTriangle size={12} /> Risk flags
                          </h4>
                          {a.riskFlags.map((flag, i) => (
                            <div key={i} className="doc-risk-item">
                              <span style={{ flexShrink: 0 }}>⚠</span>
                              <span>{flag}</span>
                            </div>
                          ))}
                        </div>
                      )}

                      {a.saLawFlags.length > 0 && (
                        <div style={{ marginBottom: 16 }}>
                          <h4 style={{ margin: "0 0 8px", fontSize: "0.78rem", textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--gold)", display: "flex", alignItems: "center", gap: 6 }}>
                            <Scale size={12} /> SA law flags
                          </h4>
                          {a.saLawFlags.map((flag, i) => (
                            <div key={i} className="doc-sa-law-item">
                              <span style={{ flexShrink: 0 }}>⚖</span>
                              <span>{flag}</span>
                            </div>
                          ))}
                        </div>
                      )}

                      <p className="doc-attorney-review">
                        This analysis is AI-generated. All findings must be verified by a qualified attorney before
                        advising a client or taking any action.
                      </p>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {analyses.length === 0 && (
        <div className="panel" style={{ textAlign: "center", padding: "40px 20px" }}>
          <FileSearch size={36} style={{ color: "var(--muted)", marginBottom: 8 }} />
          <p style={{ margin: "8px 0 4px", fontWeight: 600 }}>No documents analysed yet</p>
          <small style={{ color: "var(--muted)" }}>Upload a document above to begin AI-powered analysis.</small>
        </div>
      )}
    </>
  );
}
