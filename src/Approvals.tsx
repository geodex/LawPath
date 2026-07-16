import { Banknote, Check, Download, FileDown, FileText, Loader2, MessageSquare, Sparkles, Timer, Undo2, X } from "lucide-react";
import { useEffect, useState } from "react";
import { decideApproval, downloadDocumentDoc, downloadDocumentPdf, getApprovals, withdrawApproval } from "./api";
import type { ApprovalRequest } from "./api";

const money = (cents: number) =>
  new Intl.NumberFormat("en-ZA", { style: "currency", currency: "ZAR", maximumFractionDigits: 2 }).format(cents / 100);

const KIND_META: Record<ApprovalRequest["kind"], { label: string; icon: React.ElementType }> = {
  invoice: { label: "Invoice", icon: FileText },
  document: { label: "Document", icon: FileText },
  trust_payment: { label: "Trust payment", icon: Banknote },
  client_message: { label: "Client message", icon: MessageSquare },
  time_entry: { label: "Time entry", icon: Timer },
  other: { label: "Other", icon: FileText }
};

const FILTERS = ["pending", "approved", "rejected", "all"] as const;

export function Approvals({
  log, showToast
}: {
  log: (msg: string) => void;
  showToast: (type: "success" | "error" | "info", title: string, msg: string) => void;
}) {
  const [items, setItems] = useState<ApprovalRequest[]>([]);
  const [canApprove, setCanApprove] = useState(false);
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>("pending");
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});

  async function load(status: string) {
    setLoading(true);
    try {
      const res = await getApprovals(status);
      setItems(res.approvals);
      setCanApprove(res.canApprove);
    } catch {
      showToast("error", "Could not load approvals", "Please try again.");
    }
    setLoading(false);
  }

  useEffect(() => { load(filter); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [filter]);

  async function decide(a: ApprovalRequest, decision: "approved" | "rejected") {
    setBusyId(a.id);
    try {
      await decideApproval(a.id, decision, notes[a.id] || undefined);
      showToast("success", decision === "approved" ? "Approved" : "Rejected", a.title);
      log(`Approval ${decision}: ${a.title}`);
      setItems(prev => prev.filter(x => x.id !== a.id));
    } catch (err) {
      showToast("error", "Could not record decision", err instanceof Error ? err.message : "Please try again.");
    }
    setBusyId(null);
  }

  async function withdraw(a: ApprovalRequest) {
    setBusyId(a.id);
    try {
      await withdrawApproval(a.id);
      showToast("info", "Withdrawn", a.title);
      setItems(prev => prev.filter(x => x.id !== a.id));
    } catch {
      showToast("error", "Could not withdraw", "Only your own pending request can be withdrawn.");
    }
    setBusyId(null);
  }

  const pendingCount = items.filter(i => i.status === "pending").length;

  return (
    <div className="tier1-section">
      <div className="panel-head">
        <span className="eyebrow"><Check size={16} /> Approvals</span>
        <div className="popia-tabs" style={{ margin: 0 }}>
          {FILTERS.map(f => (
            <button key={f} className={`popia-tab${filter === f ? " active" : ""}`} onClick={() => setFilter(f)}>
              {f[0].toUpperCase() + f.slice(1)}
            </button>
          ))}
        </div>
      </div>

      <p style={{ margin: "0 0 12px", fontSize: "0.83rem", color: "var(--muted)" }}>
        Everything that leaves the firm or moves money is signed off here. AI drafts are marked and
        carry no more authority than a secretary's draft — an attorney decides.
        {!canApprove && " You can raise and withdraw requests, but only an attorney or firm admin may approve them."}
      </p>

      {loading && (
        <p style={{ display: "flex", gap: 8, alignItems: "center", color: "var(--muted)", fontSize: "0.87rem" }}>
          <Loader2 size={14} style={{ animation: "spin 0.8s linear infinite" }} /> Loading…
        </p>
      )}

      {!loading && items.length === 0 && (
        <p style={{ color: "var(--muted)", fontSize: "0.87rem", padding: "12px 0" }}>
          {filter === "pending" ? "Nothing waiting for sign-off." : `No ${filter} requests.`}
        </p>
      )}

      {!loading && filter === "pending" && pendingCount > 0 && (
        <div style={{ marginBottom: 10 }}>
          <span className="pill" style={{ background: "var(--gold)", color: "#fff" }}>{pendingCount} awaiting sign-off</span>
        </div>
      )}

      <div style={{ display: "grid", gap: 10 }}>
        {items.map(a => {
          const meta = KIND_META[a.kind] ?? KIND_META.other;
          const body = typeof a.payload?.body === "string" ? a.payload.body : "";
          const busy = busyId === a.id;
          return (
            <div key={a.id} className="inline-form-toggle" style={{ border: "1px solid var(--line)", borderRadius: 10, padding: 12 }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "flex-start" }}>
                <div>
                  <strong style={{ fontSize: "0.9rem", display: "flex", alignItems: "center", gap: 6 }}>
                    <meta.icon size={14} /> {a.title}
                  </strong>
                  {a.summary && <p style={{ margin: "3px 0 0", fontSize: "0.83rem", color: "var(--muted)" }}>{a.summary}</p>}
                  <p style={{ margin: "3px 0 0", fontSize: "0.78rem", color: "var(--muted)" }}>
                    {meta.label} · raised by {a.origin === "ai" ? "AI" : (a.requestedByName || "a colleague")} · {new Date(a.requestedAt).toLocaleString("en-ZA")}
                  </p>
                </div>
                <div style={{ display: "flex", gap: 6, alignItems: "center", flexShrink: 0 }}>
                  {a.origin === "ai" && (
                    <span className="pill" style={{ background: "var(--gold)", color: "#fff", fontSize: "0.72rem" }}>
                      <Sparkles size={11} /> AI draft
                    </span>
                  )}
                  {a.amountCents != null && <span className="pill">{money(a.amountCents)}</span>}
                  <span className="pill">{a.status}</span>
                </div>
              </div>

              {body && (
                // 4 rows suits a WhatsApp update; a drafted opinion with its
                // schedule of authorities needs a real reading pane — an
                // approver must be able to READ what they are signing off.
                <textarea readOnly value={body} rows={body.length > 600 ? 16 : 4}
                  style={{ width: "100%", marginTop: 10, fontSize: "0.84rem", fontFamily: body.length > 600 ? "var(--font-mono)" : undefined }} />
              )}

              {body && (
                // Download regardless of status: the attorney's workflow is to
                // take the draft into Word, read the authorities, and edit.
                // The document carries its own guard rails — the "Prepared with
                // AI assistance / Reviewed and settled by ___" line and the
                // schedule of authorities with any NOT VERIFIED flags — so the
                // warning travels with the file. Sign-off is still governed
                // here; downloading is how the editing gets done.
                <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                  <button className="ghost small" onClick={async () => {
                    const r = await downloadDocumentPdf(a.title, body, a.title.replace(/[^a-z0-9\-_ ]/gi, "_").replace(/\s+/g, "-"));
                    if (r.ok) log(`Downloaded PDF: ${a.title}`);
                    else showToast("error", "PDF download failed", r.error || "Please try again.");
                  }}>
                    <FileDown size={13} /> PDF
                  </button>
                  <button className="ghost small" onClick={() => {
                    const r = downloadDocumentDoc(a.title, body, a.title.replace(/[^a-z0-9\-_ ]/gi, "_").replace(/\s+/g, "-"));
                    if (r.ok) log(`Downloaded Word document: ${a.title}`);
                    else showToast("error", "Download failed", "Please try again.");
                  }}>
                    <Download size={13} /> Word
                  </button>
                </div>
              )}

              {a.status === "pending" && (
                <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap", alignItems: "center" }}>
                  {canApprove && (
                    <>
                      <input
                        style={{ flex: 1, minWidth: 180 }}
                        placeholder="Note (optional — recorded with your decision)"
                        value={notes[a.id] || ""}
                        onChange={e => setNotes(p => ({ ...p, [a.id]: e.target.value }))}
                      />
                      <button className="ghost small" disabled={busy} onClick={() => decide(a, "rejected")}>
                        <X size={13} /> Reject
                      </button>
                      <button className="primary small" disabled={busy} onClick={() => decide(a, "approved")}>
                        {busy ? <Loader2 size={13} style={{ animation: "spin 0.8s linear infinite" }} /> : <Check size={13} />} Approve
                      </button>
                    </>
                  )}
                  <button className="ghost small" disabled={busy} onClick={() => withdraw(a)} title="Withdraw your own request">
                    <Undo2 size={13} /> Withdraw
                  </button>
                </div>
              )}

              {a.status !== "pending" && a.decidedByName && (
                <p style={{ margin: "8px 0 0", fontSize: "0.79rem", color: "var(--muted)" }}>
                  {a.status} by {a.decidedByName} · {a.decidedAt ? new Date(a.decidedAt).toLocaleString("en-ZA") : ""}
                  {a.decisionNote ? ` — “${a.decisionNote}”` : ""}
                  {a.requestedBy && a.decidedBy && a.requestedBy === a.decidedBy ? " · self-approved" : ""}
                </p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
