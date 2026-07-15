import { AlertOctagon, AlertTriangle, CheckCircle2, Loader2, Plus, ShieldQuestion, X } from "lucide-react";
import { useState } from "react";
import { checkConflicts } from "./api";
import type { ConflictHit, ConflictResult } from "./api";

const SOURCE_LABELS: Record<ConflictHit["source"], string> = {
  matter: "Matter", litigation: "Litigation", conveyancing: "Conveyancing",
  fica: "FICA", client: "Client roll"
};

/**
 * Conflict check — a professional duty before accepting an instruction.
 * Reusable: embed in an intake flow, or run standalone from Practice Areas.
 * `initialClient` / `initialOpposing` let a matter form pre-fill the parties.
 */
export function ConflictCheck({
  initialClient = "", initialOpposing = [], compact = false, onResult
}: {
  initialClient?: string;
  initialOpposing?: string[];
  compact?: boolean;
  onResult?: (r: ConflictResult) => void;
}) {
  const [clientName, setClientName] = useState(initialClient);
  const [opposing, setOpposing] = useState<string[]>(initialOpposing.length ? initialOpposing : [""]);
  const [result, setResult] = useState<ConflictResult | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState("");

  async function run() {
    setRunning(true);
    setError("");
    setResult(null);
    try {
      const r = await checkConflicts({
        clientName: clientName.trim(),
        opposingParties: opposing.map(o => o.trim()).filter(Boolean)
      });
      setResult(r);
      onResult?.(r);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Conflict check failed.");
    }
    setRunning(false);
  }

  const canRun = clientName.trim().length >= 3 || opposing.some(o => o.trim().length >= 3);

  return (
    <div className={compact ? "" : "tier1-section"}>
      {!compact && (
        <div className="panel-head">
          <span className="eyebrow"><ShieldQuestion size={16} /> Conflict check</span>
        </div>
      )}

      <div className="inline-form-toggle" style={{ display: "grid", gap: 10 }}>
        <label style={{ display: "grid", gap: 4, fontSize: "0.84rem", fontWeight: 600 }}>
          Proposed client
          <input value={clientName} onChange={e => setClientName(e.target.value)} placeholder="Full legal name of the person or entity instructing you" />
        </label>

        <div style={{ display: "grid", gap: 6 }}>
          <span style={{ fontSize: "0.84rem", fontWeight: 600 }}>Opposing / other parties</span>
          {opposing.map((o, i) => (
            <div key={i} style={{ display: "flex", gap: 6 }}>
              <input style={{ flex: 1 }} value={o} placeholder="Opposing party, co-party, or other interested party"
                onChange={e => setOpposing(prev => prev.map((v, j) => j === i ? e.target.value : v))} />
              {opposing.length > 1 && (
                <button className="ghost small" onClick={() => setOpposing(prev => prev.filter((_, j) => j !== i))} title="Remove">
                  <X size={13} />
                </button>
              )}
            </div>
          ))}
          <button className="ghost small" style={{ justifySelf: "start" }} onClick={() => setOpposing(prev => [...prev, ""])}>
            <Plus size={13} /> Add party
          </button>
        </div>

        <button className="primary small" style={{ justifySelf: "start" }} onClick={run} disabled={running || !canRun}>
          {running ? <><Loader2 size={13} style={{ animation: "spin 0.8s linear infinite" }} /> Checking…</> : "Run conflict check"}
        </button>
        {!canRun && <small style={{ color: "var(--muted)" }}>Enter at least one name of 3 characters or more.</small>}
      </div>

      {error && <p style={{ color: "var(--rose)", fontSize: "0.85rem", marginTop: 10 }}>{error}</p>}

      {result && <ConflictResultView result={result} />}
    </div>
  );
}

function ConflictResultView({ result }: { result: ConflictResult }) {
  const { counts, hits } = result;

  return (
    <div style={{ marginTop: 14 }}>
      {result.clear ? (
        <div className="inline-form-toggle" style={{ border: "1px solid var(--green)", borderRadius: 8, padding: 12, display: "flex", gap: 10, alignItems: "flex-start" }}>
          <CheckCircle2 size={18} color="var(--green)" style={{ flexShrink: 0, marginTop: 2 }} />
          <div>
            <strong style={{ fontSize: "0.88rem" }}>No match found in this firm's records</strong>
            <p style={{ margin: "4px 0 0", fontSize: "0.82rem", color: "var(--muted)" }}>{result.disclaimer}</p>
          </div>
        </div>
      ) : (
        <>
          <div style={{ display: "flex", gap: 8, marginBottom: 10, flexWrap: "wrap" }}>
            {counts.critical > 0 && <span className="pill" style={{ background: "var(--rose)", color: "#fff" }}>{counts.critical} critical</span>}
            {counts.warning > 0 && <span className="pill" style={{ background: "var(--gold)", color: "#fff" }}>{counts.warning} to consider</span>}
            {counts.info > 0 && <span className="pill">{counts.info} prior involvement</span>}
          </div>

          {counts.critical > 0 && (
            <div className="inline-form-toggle" style={{ border: "1px solid var(--rose)", borderRadius: 8, padding: 12, marginBottom: 12, display: "flex", gap: 10, alignItems: "flex-start" }}>
              <AlertOctagon size={18} color="var(--rose)" style={{ flexShrink: 0, marginTop: 2 }} />
              <div>
                <strong style={{ fontSize: "0.88rem" }}>A proposed opposing party appears to be your own client</strong>
                <p style={{ margin: "4px 0 0", fontSize: "0.82rem" }}>
                  Acting against an existing client is a conflict. Do not accept the mandate without resolving it.
                </p>
              </div>
            </div>
          )}

          {hits.map((h, i) => <HitRow key={i} hit={h} />)}

          <p style={{ margin: "12px 0 0", fontSize: "0.8rem", color: "var(--muted)" }}>{result.disclaimer}</p>
        </>
      )}
    </div>
  );
}

function HitRow({ hit: h }: { hit: ConflictHit }) {
  const colour = h.severity === "critical" ? "var(--rose)" : h.severity === "warning" ? "var(--gold)" : "var(--line)";
  const Icon = h.severity === "critical" ? AlertOctagon : h.severity === "warning" ? AlertTriangle : ShieldQuestion;
  const relation = h.wasOurClient === true ? "your client"
                 : h.wasOurClient === false ? "opposing party"
                 : "involved";

  return (
    <div className="deadline-row" style={{ borderLeft: `3px solid ${colour}` }}>
      <div>
        <strong style={{ fontSize: "0.86rem", display: "flex", alignItems: "center", gap: 6 }}>
          <Icon size={13} color={colour} /> {h.matchedName}
        </strong>
        <small style={{ display: "block", color: "var(--muted)" }}>
          matched “{h.searchedName}” ({h.searchedSide === "client" ? "proposed client" : "opposing party"})
          {h.detail ? ` · ${h.detail}` : ""}
        </small>
      </div>
      <span className="pill" style={{ fontSize: "0.72rem" }}>{SOURCE_LABELS[h.source]}{h.ref ? ` ${h.ref}` : ""}</span>
      <span style={{ fontSize: "0.8rem" }}>as {h.matchedRole}</span>
      <span className="pill" style={{ fontSize: "0.72rem" }}>{relation}</span>
    </div>
  );
}
