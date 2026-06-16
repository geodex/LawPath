import { AlertTriangle, BookOpenCheck, FileText, Lock, Trash2, Upload } from "lucide-react";
import { FormEvent, useMemo, useState } from "react";
import { deleteRagSource, queueRagSource } from "./api";
import type { RagSource } from "./types";

type Props = {
  ragSources: RagSource[];
  setRagSources: React.Dispatch<React.SetStateAction<RagSource[]>>;
  tenantId: string | null;
  log: (msg: string) => void;
  showToast: (type: "success" | "error" | "info", title: string, msg: string) => void;
};

const MAX_BYTES = 50 * 1024 * 1024; // 50 MB per file
const ACCEPTED = ".pdf,.docx,.txt,.md";

const SOURCE_TYPES: RagSource["sourceType"][] = [
  "Firm precedent",
  "Practice manual",
  "Contract bank",
  "Document upload"
];

async function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

function statusClass(status: RagSource["status"]) {
  if (status === "Indexed") return "doc-analysis-status-complete";
  if (status === "Failed") return "doc-analysis-status-failed";
  return "doc-analysis-status-analysing";
}

export function TenantTraining({ ragSources, setRagSources, tenantId, log, showToast }: Props) {
  const [busy, setBusy] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [name, setName] = useState("");
  const [sourceType, setSourceType] = useState<RagSource["sourceType"]>("Firm precedent");

  // Only this tenant's private training sources are shown. Platform-scoped
  // sources are managed by super admins under Settings → AI Training.
  const ownSources = useMemo(() => {
    return ragSources.filter((s) => s.scope === "Tenant private");
  }, [ragSources]);

  async function handleUpload(e: FormEvent) {
    e.preventDefault();
    if (!file) return;
    if (file.size > MAX_BYTES) {
      showToast("error", "File too large", `Maximum upload size is ${(MAX_BYTES / 1024 / 1024).toFixed(0)} MB.`);
      return;
    }
    const finalName = name.trim() || file.name.replace(/\.[^.]+$/, "");
    setBusy(true);
    log(`Uploading training source: ${file.name}`);
    try {
      const dataUrl = await fileToDataUrl(file);
      const res = await queueRagSource({
        name: finalName,
        scope: "Tenant private",
        sourceType,
        documentCount: 1,
        fileName: file.name,
        mimeType: file.type,
        fileDataUrl: dataUrl
      });
      setRagSources((prev) => [res.source, ...prev]);
      showToast("success", "Source queued", `${file.name} has been added to your firm's training library.`);
      log(`Training source queued: ${res.source.id}`);
      setFile(null);
      setName("");
      const input = document.getElementById("tenant-training-file") as HTMLInputElement | null;
      if (input) input.value = "";
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Upload failed";
      showToast("error", "Upload failed", msg);
      log(`Training upload error: ${msg}`);
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete(source: RagSource) {
    if (!window.confirm(`Permanently remove "${source.name}" from your training library? This cannot be undone.`)) {
      return;
    }
    try {
      await deleteRagSource(source.id);
      setRagSources((prev) => prev.filter((s) => s.id !== source.id));
      showToast("success", "Source removed", `${source.name} was removed from your training library.`);
      log(`Training source deleted: ${source.id}`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Delete failed";
      showToast("error", "Delete failed", msg);
    }
  }

  const totalDocs = ownSources.reduce((s, x) => s + (x.documentCount || 0), 0);

  return (
    <>
      <div className="doc-notice" style={{ borderLeftColor: "var(--blue)", background: "var(--blue-bg)" }}>
        <p style={{ margin: 0, fontSize: "0.9rem", lineHeight: 1.5 }}>
          <Lock size={16} style={{ verticalAlign: "-3px", marginRight: 8, color: "var(--blue)" }} />
          Documents you upload here become part of <strong>your firm's private AI knowledge</strong>. They are scoped
          to your tenant and are never used to train, retrieve for, or influence any other firm's results. Upload
          your firm precedents, practice manuals and clause banks to make the AI assistant respond in your house style.
        </p>
      </div>

      <section className="metrics">
        <div className="metric">
          <span>Training sources</span>
          <strong>{ownSources.length}</strong>
          <small>Private to your firm</small>
        </div>
        <div className="metric">
          <span>Documents indexed</span>
          <strong>{ownSources.filter((s) => s.status === "Indexed").reduce((s, x) => s + (x.documentCount || 0), 0)}</strong>
          <small>Searchable by the AI</small>
        </div>
        <div className="metric">
          <span>Queued / processing</span>
          <strong>{ownSources.filter((s) => s.status === "Queued").length}</strong>
          <small>Awaiting embedding</small>
        </div>
        <div className="metric">
          <span>Documents total</span>
          <strong>{totalDocs}</strong>
          <small>Across all sources</small>
        </div>
      </section>

      <div className="panel" style={{ marginBottom: 20 }}>
        <div className="panel-head">
          <h3><Upload size={16} style={{ verticalAlign: "-3px", marginRight: 6, color: "var(--green)" }} /> Upload a training document</h3>
        </div>
        <form className="form" onSubmit={handleUpload}>
          <div className="form-row">
            <label>
              <span>Source name</span>
              <input
                type="text"
                placeholder="e.g. Firm Standard Sale Agreement v2"
                value={name}
                onChange={(e) => setName(e.target.value)}
                disabled={busy}
              />
            </label>
            <label>
              <span>Source type</span>
              <select
                value={sourceType}
                onChange={(e) => setSourceType(e.target.value as RagSource["sourceType"])}
                disabled={busy}
              >
                {SOURCE_TYPES.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </label>
          </div>
          <label>
            <span>Document file <em style={{ color: "var(--muted)", fontStyle: "normal", fontWeight: 400 }}>(PDF, DOCX, TXT, MD — max 50 MB)</em></span>
            <input
              id="tenant-training-file"
              type="file"
              accept={ACCEPTED}
              disabled={busy}
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
          </label>
          <button className="primary" type="submit" disabled={busy || !file}>
            {busy ? "Uploading…" : <><Upload size={16} /> Add to training library</>}
          </button>
        </form>
        <p style={{ margin: "12px 0 0", fontSize: "0.82rem", color: "var(--muted)", lineHeight: 1.5 }}>
          <AlertTriangle size={13} style={{ verticalAlign: "-2px", marginRight: 6, color: "var(--gold)" }} />
          POPIA reminder: do not upload material containing personal information of data subjects who haven't consented
          to AI processing for this purpose. Redact ID numbers, contact details and other personal information from
          precedents before upload.
        </p>
      </div>

      <div className="panel">
        <div className="panel-head">
          <h3><BookOpenCheck size={16} style={{ verticalAlign: "-3px", marginRight: 6, color: "var(--green)" }} /> Your training library</h3>
          <span className="pill">{ownSources.length} source{ownSources.length === 1 ? "" : "s"}</span>
        </div>

        {ownSources.length === 0 ? (
          <div style={{ textAlign: "center", padding: "30px 20px" }}>
            <FileText size={32} style={{ color: "var(--muted)", marginBottom: 8 }} />
            <p style={{ margin: "8px 0 4px", fontWeight: 600 }}>No training documents yet</p>
            <small style={{ color: "var(--muted)" }}>Upload your first firm precedent or clause bank above to teach the AI your house style.</small>
          </div>
        ) : (
          <div>
            {ownSources.map((source) => (
              <div key={source.id} className="doc-analysis-row" style={{ marginBottom: 8 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <FileText size={16} style={{ color: "var(--green)", flexShrink: 0 }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: "0.92rem", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {source.name}
                    </div>
                    <div style={{ fontSize: "0.78rem", color: "var(--muted)", marginTop: 2 }}>
                      {source.sourceType} · {source.documentCount} doc{source.documentCount === 1 ? "" : "s"} · Last indexed: {source.lastIndexed || "Pending"}
                    </div>
                  </div>
                  <span className={statusClass(source.status)}>{source.status}</span>
                  <button
                    className="ghost small"
                    onClick={() => handleDelete(source)}
                    title="Remove from training library"
                    aria-label={`Remove ${source.name}`}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        <p style={{ margin: "14px 0 0", fontSize: "0.8rem", color: "var(--muted)", fontStyle: "italic" }}>
          Tenant context: {tenantId ?? "—"}
        </p>
      </div>
    </>
  );
}
