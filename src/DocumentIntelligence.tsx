import { AlertTriangle, CalendarPlus, CheckCircle2, Columns3, FileSearch, FileText, FolderOpen, Loader2, RefreshCw, Scale, Sparkles, Trash2, Upload, X } from "lucide-react";
import { FormEvent, useEffect, useRef, useState } from "react";
import { compareDocuments, createDiaryEntry, deleteDocumentAnalysis, deleteDocumentComparison, fileDocumentToMatter, getDocumentAnalyses, getDocumentComparisons, getDocumentMatterSuggestions, submitDocumentForAnalysis } from "./api";
import type { DocumentComparison, MatterSuggestion } from "./api";
import type { DocumentAnalysis, DocumentAuthorityMatch } from "./types";

/**
 * Case law bearing on a single flag.
 *
 * Framing is deliberate. Every citation shown here exists in the firm's corpus
 * — the model chooses among real authorities and is never asked to produce one
 * — but whether an authority truly governs these facts is its judgement, not a
 * verified fact. So this reads "starting points to read", never "this is the
 * law". The attorney goes and reads the judgment; that is the whole workflow.
 */
function FlagAuthorities({ flag, matches }: { flag: string; matches: DocumentAuthorityMatch[] }) {
  const match = (matches || []).find(m => m.flag === flag);
  if (!match || !match.authorities.length) return null;
  return (
    <div style={{ margin: "2px 0 12px 26px", paddingLeft: 10, borderLeft: "2px solid var(--line)" }}>
      <div style={{ fontSize: "0.7rem", textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--muted)", marginBottom: 4 }}>
        From the firm's corpus — read before relying
      </div>
      {match.authorities.map((a, i) => (
        <div key={i} style={{ marginBottom: 6, fontSize: "0.82rem" }}>
          <span style={{ fontWeight: 700 }}>{a.citation}</span>
          {a.title ? <span> — {a.title}</span> : null}
          {a.court ? <span style={{ color: "var(--muted)" }}> · {a.court}{a.year ? ` (${a.year})` : ""}</span> : null}
          {a.note ? <div style={{ color: "var(--muted)" }}>{a.note}</div> : null}
          {a.sourceUrl ? (
            <a href={a.sourceUrl} target="_blank" rel="noopener noreferrer" style={{ fontSize: "0.78rem" }}>
              Read the judgment
            </a>
          ) : null}
        </div>
      ))}
    </div>
  );
}

type Props = {
  analyses: DocumentAnalysis[];
  setAnalyses: React.Dispatch<React.SetStateAction<DocumentAnalysis[]>>;
  log: (msg: string) => void;
  showToast: (type: "success" | "error" | "info", title: string, msg: string) => void;
};

const maxBytes = 50 * 1024 * 1024;

async function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

const FILING_LABEL: Record<string, string> = {
  upload: "filed on upload", auto: "auto-filed from the parties", manual: "filed by hand"
};

/**
 * Where a document lives. An auto-filed document is an inference, so it says so
 * and stays one click from being corrected — filing a privileged document to the
 * wrong client's file is a confidentiality problem, not an untidiness one.
 */
function FilingPanel({
  analysis: a, onFiled, showToast
}: {
  analysis: DocumentAnalysis;
  onFiled: (updated: DocumentAnalysis) => void;
  showToast: (type: "success" | "error" | "info", title: string, msg: string) => void;
}) {
  const [suggestions, setSuggestions] = useState<MatterSuggestion[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);

  async function loadSuggestions() {
    setLoading(true);
    try {
      const r = await getDocumentMatterSuggestions(a.id);
      setSuggestions(r.suggestions);
      if (!r.suggestions.length) showToast("info", "No match", "No matter shares this document's parties.");
    } catch {
      showToast("error", "Could not load suggestions", "Please try again.");
    }
    setLoading(false);
  }

  async function file(matterId: string | null) {
    setBusy(true);
    try {
      const r = await fileDocumentToMatter(a.id, matterId);
      onFiled(r.analysis);
      showToast("success", matterId ? "Filed" : "Unfiled", a.fileName);
      setSuggestions(null);
    } catch {
      showToast("error", "Could not file", "Please try again.");
    }
    setBusy(false);
  }

  return (
    <div style={{ marginBottom: 16, padding: 10, border: `1px solid ${a.matterId ? "var(--line)" : "var(--gold)"}`, borderRadius: 8 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <FolderOpen size={14} color="var(--green)" />
        {a.matterId ? (
          <>
            <strong style={{ fontSize: "0.84rem" }}>Filed to {a.matterRef || "a matter"}</strong>
            {a.filingSource && (
              <span className="pill" style={{ fontSize: "0.7rem", background: a.filingSource === "auto" ? "var(--gold)" : undefined, color: a.filingSource === "auto" ? "#fff" : undefined }}>
                {FILING_LABEL[a.filingSource] || a.filingSource}
              </span>
            )}
            <button className="ghost small" disabled={busy} onClick={() => file(null)} style={{ marginLeft: "auto" }}>
              Unfile
            </button>
          </>
        ) : (
          <>
            <strong style={{ fontSize: "0.84rem" }}>Not filed to a matter</strong>
            {a.matterRef && <span className="pill" style={{ fontSize: "0.7rem" }}>“{a.matterRef}” didn’t match a matter</span>}
            <button className="ghost small" disabled={loading} onClick={loadSuggestions} style={{ marginLeft: "auto" }}>
              {loading ? <Loader2 size={12} style={{ animation: "spin 0.8s linear infinite" }} /> : null} Find its matter
            </button>
          </>
        )}
      </div>

      {a.filingSource === "auto" && (
        <small style={{ display: "block", marginTop: 6, color: "var(--muted)" }}>
          Matched automatically from the extracted parties — check it landed on the right file.
        </small>
      )}

      {suggestions && suggestions.length > 0 && (
        <div style={{ display: "grid", gap: 6, marginTop: 8 }}>
          {suggestions.map(s => (
            <div key={s.matterId} style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <strong style={{ fontSize: "0.82rem" }}>{s.ref}</strong>
                <small style={{ display: "block", color: "var(--muted)" }}>
                  {s.label} · matches {s.matchedParties.join(", ")}
                </small>
              </div>
              <button className="primary small" disabled={busy} onClick={() => file(s.matterId)}>File here</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function StatusPill({ status }: { status: DocumentAnalysis["analysisStatus"] }) {
  const key = status.toLowerCase();
  const cls =
    status === "Complete" ? "doc-analysis-status-complete" :
    status === "Failed" ? "doc-analysis-status-failed" :
    "doc-analysis-status-analysing";
  return <span className={cls} data-status={key}>{status}</span>;
}

const SEVERITY_COLOUR: Record<string, string> = {
  high: "var(--rose)", medium: "var(--gold)", low: "var(--muted)"
};

/**
 * One comparison, ordered the way an attorney reads it: summary first, then the
 * date conflicts (the cross-check she asked for by name, and the kind of error
 * that costs a deadline), then clause divergences, then anomalies, then the
 * full working notes.
 *
 * Each divergence shows the ACTUAL wording from each document side by side. A
 * comparison that only said "these differ on notice periods" would send her
 * back into both contracts to find out how — which is the work she was trying
 * to avoid.
 */
function ComparisonResult({ c, onDelete }: { c: DocumentComparison; onDelete: (id: string) => void }) {
  const [showNotes, setShowNotes] = useState(false);
  const running = c.status === "Queued" || c.status === "Analysing";

  return (
    <div style={{ border: "1px solid var(--line)", borderRadius: 8, padding: 12, marginBottom: 10 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 8 }}>
        <Columns3 size={15} color="var(--green)" />
        <strong style={{ fontSize: "0.9rem" }}>{c.documentNames.join("  ·  ")}</strong>
        <StatusPill status={c.status} />
        <button className="ghost small" onClick={() => onDelete(c.id)} style={{ marginLeft: "auto", color: "var(--muted)" }}>
          <Trash2 size={13} />
        </button>
      </div>

      {c.focus && (
        <div style={{ fontSize: "0.8rem", color: "var(--muted)", marginBottom: 8 }}>Focus: {c.focus}</div>
      )}

      {running && (
        <div style={{ fontSize: "0.85rem", color: "var(--muted)", display: "flex", alignItems: "center", gap: 6 }}>
          <Loader2 size={13} style={{ animation: "spin 0.8s linear infinite" }} />
          Reading {c.documentNames.length} documents against each other…
        </div>
      )}

      {c.status === "Failed" && (
        <div className="doc-risk-item">
          <AlertTriangle size={15} style={{ flexShrink: 0 }} />
          <span>{c.summary || "The comparison failed."}</span>
        </div>
      )}

      {c.status === "Complete" && (
        <>
          {c.summary && <p style={{ fontSize: "0.88rem", marginTop: 0 }}>{c.summary}</p>}

          {c.dateConflicts.length > 0 && (
            <div style={{ marginBottom: 14 }}>
              <h4 style={{ margin: "0 0 6px", fontSize: "0.78rem", textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--rose)" }}>
                Date conflicts ({c.dateConflicts.length})
              </h4>
              {c.dateConflicts.map((d, i) => (
                <div key={i} className="doc-risk-item" style={{ display: "block" }}>
                  <strong>{d.description}</strong>
                  <div style={{ fontSize: "0.82rem", marginTop: 2 }}>
                    {d.doc}: <strong>{d.date}</strong>
                    {d.conflictsWith ? <> — conflicts with {d.conflictsWith}</> : null}
                  </div>
                  {d.note && <div style={{ fontSize: "0.8rem", color: "var(--muted)" }}>{d.note}</div>}
                </div>
              ))}
            </div>
          )}

          {c.issues.length > 0 && (
            <div style={{ marginBottom: 14 }}>
              <h4 style={{ margin: "0 0 6px", fontSize: "0.78rem", textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--muted)" }}>
                Where the documents differ ({c.issues.length})
              </h4>
              {c.issues.map((iss, i) => (
                <div key={i} style={{ borderLeft: "3px solid " + (SEVERITY_COLOUR[iss.severity] || "var(--line)"), paddingLeft: 10, marginBottom: 12 }}>
                  <div style={{ display: "flex", gap: 8, alignItems: "baseline", flexWrap: "wrap" }}>
                    <strong style={{ fontSize: "0.88rem" }}>{iss.topic}</strong>
                    <span style={{ fontSize: "0.72rem", textTransform: "uppercase", color: SEVERITY_COLOUR[iss.severity] || "var(--muted)", fontWeight: 700 }}>
                      {iss.severity}
                    </span>
                  </div>
                  {iss.divergence && <div style={{ fontSize: "0.84rem", margin: "2px 0 6px" }}>{iss.divergence}</div>}
                  {iss.findings.map((f, j) => (
                    <div key={j} style={{ fontSize: "0.82rem", marginBottom: 4 }}>
                      <span style={{ color: "var(--muted)" }}>{f.doc}:</span> {f.value}
                      {f.note && <span style={{ color: "var(--muted)" }}> — {f.note}</span>}
                    </div>
                  ))}
                </div>
              ))}
            </div>
          )}

          {c.anomalies.length > 0 && (
            <div style={{ marginBottom: 14 }}>
              <h4 style={{ margin: "0 0 6px", fontSize: "0.78rem", textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--gold)" }}>
                Anomalies
              </h4>
              {c.anomalies.map((a, i) => (
                <div key={i} className="doc-sa-law-item">
                  <span style={{ flexShrink: 0 }}>!</span><span>{a}</span>
                </div>
              ))}
            </div>
          )}

          {!c.issues.length && !c.dateConflicts.length && !c.anomalies.length && (
            <p style={{ fontSize: "0.86rem", color: "var(--muted)" }}>
              No divergences were found between these documents on the terms compared. That is a finding, not a failure — but read the working notes for what was and was not covered.
            </p>
          )}

          {c.notes && (
            <>
              <button className="ghost small" onClick={() => setShowNotes(v => !v)}>
                {showNotes ? "Hide" : "Show"} full working notes
              </button>
              {showNotes && (
                <pre style={{ whiteSpace: "pre-wrap", fontSize: "0.82rem", marginTop: 8, fontFamily: "inherit" }}>{c.notes}</pre>
              )}
            </>
          )}

          <p className="doc-attorney-review" style={{ marginTop: 12 }}>
            AI-generated comparison. Every difference reported must be checked against the documents themselves before it is relied on or put to a client.
          </p>
        </>
      )}
    </div>
  );
}

export function DocumentIntelligence({ analyses, setAnalyses, log, showToast }: Props) {
  const onAnalysisUpdated = (updated: DocumentAnalysis) =>
    setAnalyses(prev => prev.map(x => x.id === updated.id ? updated : x));
  const [expandedId, setExpandedId] = useState<string | null>(null);
  // Comparative analysis: which documents are ticked, and the comparisons run
  // so far. Selection lives here (not in a modal) so the attorney can keep
  // browsing and expanding documents while building up a set.
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [comparisons, setComparisons] = useState<DocumentComparison[]>([]);
  const [comparing, setComparing] = useState(false);
  const [compareFocus, setCompareFocus] = useState("");
  const [openComparisonId, setOpenComparisonId] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [matterRef, setMatterRef] = useState("");

  async function refreshAnalyses() {
    setRefreshing(true);
    try {
      const res = await getDocumentAnalyses();
      setAnalyses(res.analyses);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Refresh failed";
      showToast("error", "Refresh failed", msg);
    } finally {
      setRefreshing(false);
    }
  }

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const hasPending = analyses.some(a => a.analysisStatus === "Queued" || a.analysisStatus === "Analysing");

  useEffect(() => {
    if (hasPending && !pollRef.current) {
      pollRef.current = setInterval(async () => {
        try {
          const res = await getDocumentAnalyses();
          setAnalyses(res.analyses);
        } catch { /* silent — will retry next tick */ }
      }, 4000);
    }
    if (!hasPending && pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
    return () => { if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; } };
  }, [hasPending, setAnalyses]);

  // Comparisons load once and then poll only while one is still running —
  // a comparison over several full contracts takes a while.
  const comparisonPollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const comparisonPending = comparisons.some(c => c.status === "Queued" || c.status === "Analysing");

  useEffect(() => {
    getDocumentComparisons().then(r => setComparisons(r.comparisons)).catch(() => { /* non-fatal */ });
  }, []);

  useEffect(() => {
    if (comparisonPending && !comparisonPollRef.current) {
      comparisonPollRef.current = setInterval(async () => {
        try { setComparisons((await getDocumentComparisons()).comparisons); } catch { /* retry */ }
      }, 5000);
    }
    if (!comparisonPending && comparisonPollRef.current) {
      clearInterval(comparisonPollRef.current);
      comparisonPollRef.current = null;
    }
    return () => { if (comparisonPollRef.current) { clearInterval(comparisonPollRef.current); comparisonPollRef.current = null; } };
  }, [comparisonPending]);

  function toggleSelected(id: string) {
    setSelectedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  }

  async function runComparison() {
    if (selectedIds.length < 2) return;
    setComparing(true);
    try {
      const r = await compareDocuments({ analysisIds: selectedIds, focus: compareFocus.trim() || undefined });
      setComparisons(prev => [r.comparison, ...prev]);
      setOpenComparisonId(r.comparison.id);
      setSelectedIds([]);
      setCompareFocus("");
      log(`Comparing ${r.comparison.documentNames.length} documents`);
      showToast("info", "Comparison started", "Reading the documents against each other — this takes a minute for long contracts.");
    } catch (error) {
      showToast("error", "Could not compare", error instanceof Error ? error.message : "Please try again.");
    }
    setComparing(false);
  }

  async function removeComparison(id: string) {
    try {
      await deleteDocumentComparison(id);
      setComparisons(prev => prev.filter(c => c.id !== id));
      if (openComparisonId === id) setOpenComparisonId(null);
    } catch {
      showToast("error", "Could not delete", "Please try again.");
    }
  }

  const totalRiskFlags = analyses.reduce((acc, a) => acc + a.riskFlags.length, 0);
  const totalSaFlags = analyses.reduce((acc, a) => acc + a.saLawFlags.length, 0);
  const completeCount = analyses.filter((a) => a.analysisStatus === "Complete").length;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!selectedFile) return;

    if (selectedFile.size > maxBytes) {
      showToast("error", "File too large", "Maximum file size is 50 MB.");
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

  async function handleDelete(id: string, fileName: string) {
    if (!confirm(`Delete analysis for "${fileName}"?`)) return;
    try {
      await deleteDocumentAnalysis(id);
      setAnalyses((prev) => prev.filter((a) => a.id !== id));
      showToast("success", "Analysis deleted", fileName);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Delete failed";
      showToast("error", "Delete failed", msg);
    }
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
              <span>Document file <em style={{ color: "var(--muted)", fontStyle: "normal", fontWeight: 400 }}>(PDF, DOCX, XLSX, TXT, MD, CSV, or a voice note: MP3, WAV, M4A, OGG — max 50 MB)</em></span>
              <input
                id="doc-file-input"
                type="file"
                accept=".pdf,.docx,.xlsx,.txt,.md,.csv,.mp3,.wav,.m4a,.ogg,.opus,.webm,.flac"
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

      {comparisons.length > 0 && (
        <div className="panel" style={{ marginBottom: 20 }}>
          <div className="panel-head">
            <h3><Columns3 size={16} style={{ verticalAlign: "-3px", marginRight: 6, color: "var(--green)" }} /> Comparisons</h3>
            <span className="pill">{comparisons.length}</span>
          </div>
          <div>
            {comparisons.map(c => <ComparisonResult key={c.id} c={c} onDelete={removeComparison} />)}
          </div>
        </div>
      )}

      {analyses.length > 0 && (
        <div className="panel">
          <div className="panel-head">
            <h3><FileText size={16} style={{ verticalAlign: "-3px", marginRight: 6, color: "var(--green)" }} /> Analysis register</h3>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <button className="ghost small" onClick={refreshAnalyses} disabled={refreshing} title="Refresh statuses">
                <RefreshCw size={13} /> {refreshing ? "Refreshing…" : "Refresh"}
              </button>
              <span className="pill">{analyses.length}</span>
            </div>
          </div>

          {selectedIds.length > 0 && (
            <div style={{ padding: "10px 12px", margin: "0 0 8px", border: "1px solid var(--green)", borderRadius: 8, display: "grid", gap: 8 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                <Columns3 size={15} color="var(--green)" />
                <strong style={{ fontSize: "0.88rem" }}>
                  {selectedIds.length} selected{selectedIds.length < 2 ? " — pick at least one more" : ""}
                </strong>
                <button className="ghost small" onClick={() => setSelectedIds([])} style={{ marginLeft: "auto" }}>
                  <X size={12} /> Clear
                </button>
                <button className="primary small" disabled={selectedIds.length < 2 || comparing} onClick={runComparison}>
                  {comparing ? <Loader2 size={12} style={{ animation: "spin 0.8s linear infinite" }} /> : <Columns3 size={12} />}
                  {comparing ? " Starting…" : ` Compare ${selectedIds.length} documents`}
                </button>
              </div>
              <input
                value={compareFocus}
                onChange={(e) => setCompareFocus(e.target.value)}
                placeholder="Optional — what should it focus on? e.g. escalation clauses and renewal dates"
                style={{ fontSize: "0.84rem" }}
              />
              {analyses.some(x => selectedIds.includes(x.id) && !x.hasText) && (
                <small style={{ color: "var(--gold)" }}>
                  Some of these were uploaded before full text was retained, so they are compared from their extracted analysis. Findings involving them are provisional — re-upload those documents for a full-text comparison.
                </small>
              )}
            </div>
          )}

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
                      {/*
                        Sized explicitly: styles.css applies
                        `input, select, textarea { width: 100%; padding: 10px 13px }`
                        to every input, which renders a bare checkbox as a full-width
                        box and shoves the file name out of the card. Kept inline rather
                        than in a class so no other component can be affected.
                      */}
                      <input
                        type="checkbox"
                        checked={selectedIds.includes(a.id)}
                        disabled={a.analysisStatus !== "Complete"}
                        title={
                          a.analysisStatus !== "Complete" ? "Still analysing"
                            : !a.hasText ? "Will be compared from its extracted analysis — re-upload for a full-text comparison"
                            : "Select for comparison"
                        }
                        onClick={(e) => e.stopPropagation()}
                        onChange={() => toggleSelected(a.id)}
                        style={{ width: 16, height: 16, padding: 0, margin: 0, flexShrink: 0, cursor: "pointer" }}
                      />
                      <FileText size={16} style={{ color: "var(--green)", flexShrink: 0 }} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 600, fontSize: "0.92rem", color: "var(--ink)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {a.fileName}
                        </div>
                        <div style={{ fontSize: "0.78rem", color: "var(--muted)", marginTop: 2 }}>
                          {a.documentType || "Detecting…"} · {a.analysedAt ? new Date(a.analysedAt).toLocaleString() : "—"}
                          {a.analysisStatus === "Complete" && !a.hasText && (
                            <span title="Uploaded before full text was retained. It can still be compared, from its extracted analysis — re-upload for a full-text comparison." style={{ marginLeft: 6, color: "var(--gold)" }}>
                              · summary only
                            </span>
                          )}
                        </div>
                      </div>
                      <StatusPill status={a.analysisStatus} />
                      <button
                        className="ghost small"
                        title="Delete analysis"
                        onClick={(e) => { e.stopPropagation(); handleDelete(a.id, a.fileName); }}
                        style={{ padding: "4px 6px", color: "var(--muted)" }}
                      >
                        <Trash2 size={14} />
                      </button>
                      <span style={{ color: "var(--muted)", fontSize: "0.85rem", marginLeft: 2 }}>
                        {expanded ? "▲" : "▼"}
                      </span>
                    </div>
                  </div>

                  {expanded && (
                    <div className="doc-detail">
                      {a.analysisStatus === "Failed" && (
                        <div className="doc-risk-item" style={{ marginBottom: 16 }}>
                          <AlertTriangle size={16} style={{ flexShrink: 0 }} />
                          <span><strong>Analysis failed.</strong>{a.summary ? ` ${a.summary}` : " The AI could not produce a structured analysis for this document."}</span>
                        </div>
                      )}
                      {a.analysisStatus === "Complete" &&
                        !a.summary &&
                        a.parties.length === 0 &&
                        a.keyDates.length === 0 &&
                        a.obligations.length === 0 &&
                        a.riskFlags.length === 0 &&
                        a.saLawFlags.length === 0 && (
                        <div className="doc-risk-item" style={{ marginBottom: 16, background: "var(--gold-bg)", color: "var(--gold)" }}>
                          <AlertTriangle size={16} style={{ flexShrink: 0 }} />
                          <span>Analysis completed but returned no extracted data. The document may be too short or unclear, or the AI model may not have a configured key. Retry with a longer extract, or ask your administrator to check the AI provider configuration under Settings.</span>
                        </div>
                      )}
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

                      {a.analysisStatus === "Complete" && (
                        <FilingPanel analysis={a} onFiled={onAnalysisUpdated} showToast={showToast} />
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
                                {a.matterId && /^\d{4}-\d{2}-\d{2}$/.test(String(kd.date)) && (
                                  <button
                                    className="ghost small"
                                    title="Add this date to the matter's diary"
                                    onClick={async () => {
                                      try {
                                        await createDiaryEntry(a.matterId!, {
                                          description: kd.label, dueDate: kd.date,
                                          source: "document", sourceDocumentId: a.id
                                        });
                                        showToast("success", "Diarised", `${kd.label} — ${kd.date}`);
                                      } catch {
                                        showToast("error", "Could not diarise", "Please try again.");
                                      }
                                    }}
                                  >
                                    <CalendarPlus size={12} /> Diarise
                                  </button>
                                )}
                              </div>
                            ))}
                          </div>
                          {!a.matterId && (
                            <small style={{ color: "var(--muted)" }}>File this document to a matter to diarise its dates.</small>
                          )}
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
                            <div key={i}>
                              <div className="doc-risk-item">
                                <span style={{ flexShrink: 0 }}>⚠</span>
                                <span>{flag}</span>
                              </div>
                              <FlagAuthorities flag={flag} matches={a.authorities} />
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
                            <div key={i}>
                              <div className="doc-sa-law-item">
                                <span style={{ flexShrink: 0 }}>⚖</span>
                                <span>{flag}</span>
                              </div>
                              <FlagAuthorities flag={flag} matches={a.authorities} />
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
