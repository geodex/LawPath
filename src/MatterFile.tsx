import { ArrowLeft, Banknote, CalendarClock, CheckCircle2, FileText, FolderOpen, Loader2, MessageSquare, Plus, Scale, Users } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { completeDiaryEntry, computeCourtDeadline, createDiaryEntry, diariseFromRule, getCourtRules, getMatterFile } from "./api";
import type { CourtCalc, CourtRule, MatterDiaryEntry, MatterFile as MatterFileData } from "./api";

const money = (cents: number) =>
  new Intl.NumberFormat("en-ZA", { style: "currency", currency: "ZAR", maximumFractionDigits: 2 }).format(cents / 100);
const daysFrom = (d: string) => Math.ceil((new Date(d).getTime() - Date.now()) / 86400000);

type Tab = "overview" | "parties" | "money" | "documents" | "correspondence" | "diary";

const TABS: { key: Tab; label: string; icon: React.ElementType }[] = [
  { key: "overview", label: "Overview", icon: FolderOpen },
  { key: "parties", label: "Parties & FICA", icon: Users },
  { key: "money", label: "Money", icon: Banknote },
  { key: "documents", label: "Documents", icon: FileText },
  { key: "correspondence", label: "Correspondence", icon: MessageSquare },
  { key: "diary", label: "Diary", icon: CalendarClock }
];

export function MatterFile({ matterUuid, onBack }: { matterUuid: string; onBack: () => void }) {
  const [data, setData] = useState<MatterFileData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [tab, setTab] = useState<Tab>("overview");

  const reload = useCallback(() => {
    setError("");
    return getMatterFile(matterUuid)
      .then(res => setData(res))
      .catch(err => setError(err instanceof Error ? err.message : "Could not load this matter file."));
  }, [matterUuid]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");
    getMatterFile(matterUuid)
      .then(res => { if (!cancelled) setData(res); })
      .catch(err => { if (!cancelled) setError(err instanceof Error ? err.message : "Could not load this matter file."); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [matterUuid]);

  if (loading) {
    return (
      <div className="tier1-section" style={{ display: "flex", alignItems: "center", gap: 10, padding: 28 }}>
        <Loader2 size={18} style={{ animation: "spin 0.8s linear infinite" }} /> Loading matter file…
      </div>
    );
  }
  if (error || !data) {
    return (
      <div className="tier1-section" style={{ padding: 24 }}>
        <button className="ghost small" onClick={onBack}><ArrowLeft size={14} /> Back</button>
        <p style={{ color: "var(--rose)", marginTop: 12 }}>{error || "Matter file not found."}</p>
      </div>
    );
  }

  const m = data.matter;
  const kind = data.litigation ? "Litigation" : data.conveyancing ? "Conveyancing" : "General";

  return (
    <div className="tier1-section">
      <div className="panel-head">
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <button className="ghost small" onClick={onBack}><ArrowLeft size={14} /> Matters</button>
          <span className="eyebrow"><FolderOpen size={15} /> Matter file</span>
        </div>
        <span className="pill time-status-wip">{kind}</span>
      </div>

      <div style={{ marginTop: 6, marginBottom: 14 }}>
        <h2 style={{ margin: "0 0 4px" }}>{m.title || m.id}</h2>
        <p style={{ margin: 0, color: "var(--muted)", fontSize: "0.86rem" }}>
          {m.id}{m.client ? ` · Client: ${m.client}` : ""}{m.role ? ` (acting for the ${m.role})` : ""}
          {m.stage ? ` · ${String(m.stage).replace(/_/g, " ")}` : ""}
        </p>
      </div>

      <MoneyStrip money={data.money} />

      <div className="popia-tabs" style={{ marginTop: 16 }}>
        {TABS.map(t => (
          <button key={t.key} className={`popia-tab${tab === t.key ? " active" : ""}`} onClick={() => setTab(t.key)}>
            <t.icon size={13} /> {t.label}
          </button>
        ))}
      </div>

      <div style={{ marginTop: 16 }}>
        {tab === "overview" && <OverviewTab data={data} />}
        {tab === "parties" && <PartiesTab data={data} />}
        {tab === "money" && <MoneyTab data={data} />}
        {tab === "documents" && <DocumentsTab data={data} />}
        {tab === "correspondence" && <CorrespondenceTab data={data} />}
        {tab === "diary" && <DiaryTab data={data} matterUuid={matterUuid} onChanged={reload} />}
      </div>
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p style={{ color: "var(--muted)", fontSize: "0.87rem", padding: "10px 0" }}>{children}</p>;
}

function MoneyStrip({ money: mo }: { money: MatterFileData["money"] }) {
  return (
    <div className="metrics">
      <div className="metric"><span className="eyebrow">Unbilled WIP</span><strong>{money(mo.wipCents)}</strong></div>
      <div className="metric"><span className="eyebrow">Invoiced</span><strong>{money(mo.invoicedCents)}</strong></div>
      <div className="metric"><span className="eyebrow">Paid</span><strong>{money(mo.paidCents)}</strong></div>
      <div className="metric">
        <span className="eyebrow">Trust balance</span>
        <strong style={{ color: mo.trustBalanceCents < 0 ? "var(--rose)" : undefined }}>{money(mo.trustBalanceCents)}</strong>
      </div>
    </div>
  );
}

function OverviewTab({ data }: { data: MatterFileData }) {
  const { litigation: lit, conveyancing: conv, matter: m } = data;
  const rows: [string, string][] = [
    ["Matter number", m.id],
    ["Client", m.client || "—"],
    ["Acting for", m.role || "not stated"],
    ["Type", m.matterType || "—"],
    ["Stage", String(m.stage || "—").replace(/_/g, " ")],
  ];
  if (lit) {
    rows.push(["Parties", `${lit.plaintiff} v ${lit.defendant}`]);
    rows.push(["Court", [lit.court, lit.courtDivision].filter(Boolean).join(" — ") || "—"]);
    if (lit.caseNumber) rows.push(["Case number", lit.caseNumber]);
    if (lit.prescriptionDate) {
      const d = daysFrom(lit.prescriptionDate);
      rows.push(["Prescribes", lit.prescriptionInterrupted
        ? `${lit.prescriptionDate} (interrupted)`
        : `${lit.prescriptionDate} — ${d < 0 ? `${Math.abs(d)} days ago` : `in ${d} days`}`]);
    }
  }
  if (conv) {
    rows.push(["Parties", `${conv.sellerName} → ${conv.buyerName}`]);
    rows.push(["Property", conv.propertyDescription || "—"]);
    if (conv.dotsLastStatus) rows.push(["DOTS status", conv.dotsLastStatus]);
  }

  return (
    <div className="conv-fee-summary">
      {rows.map(([k, v]) => (
        <div key={k} className="conv-fee-row"><span>{k}</span><strong style={{ textAlign: "right" }}>{v}</strong></div>
      ))}
    </div>
  );
}

function PartiesTab({ data }: { data: MatterFileData }) {
  const { ficaClients: fica, litigation: lit, conveyancing: conv } = data;
  return (
    <>
      <h4 style={{ margin: "0 0 8px" }}>Parties</h4>
      <div className="conv-fee-summary" style={{ marginBottom: 16 }}>
        {lit && <>
          <div className="conv-fee-row"><span>Plaintiff / Applicant</span><strong>{lit.plaintiff}</strong></div>
          <div className="conv-fee-row"><span>Defendant / Respondent</span><strong>{lit.defendant}</strong></div>
        </>}
        {conv && <>
          <div className="conv-fee-row"><span>Seller</span><strong>{conv.sellerName}</strong></div>
          <div className="conv-fee-row"><span>Buyer</span><strong>{conv.buyerName}</strong></div>
          {conv.bondBank && <div className="conv-fee-row"><span>Bond bank</span><strong>{conv.bondBank}</strong></div>}
        </>}
        {!lit && !conv && <Empty>No pipeline parties recorded on this matter.</Empty>}
      </div>

      <h4 style={{ margin: "0 0 8px" }}>FICA</h4>
      {fica.length === 0 && <Empty>No FICA client linked to this matter yet.</Empty>}
      {fica.map(f => (
        <div key={f.id} className="deadline-row">
          <div><strong style={{ fontSize: "0.88rem" }}>{f.clientName}</strong>
            <small style={{ display: "block", color: "var(--muted)" }}>{f.clientType?.replace(/_/g, " ")} · {f.riskRating} risk</small>
          </div>
          <span className={`pill ${f.ficaStatus === "Compliant" ? "recon-status-approved" : "fica-status-pending"}`}>{f.ficaStatus}</span>
          <span style={{ fontSize: "0.82rem" }}>{f.ficaExpiryDate || "—"}</span>
        </div>
      ))}
    </>
  );
}

function MoneyTab({ data }: { data: MatterFileData }) {
  const { timeEntries: te, trustTransactions: tt, invoices: inv } = data;
  return (
    <>
      <h4 style={{ margin: "0 0 8px" }}>Time / WIP</h4>
      {te.length === 0 && <Empty>No time recorded against this matter.</Empty>}
      {te.slice(0, 25).map(t => (
        <div key={t.id} className="deadline-row">
          <div><strong style={{ fontSize: "0.86rem" }}>{t.description}</strong>
            <small style={{ display: "block", color: "var(--muted)" }}>{t.feeEarnerName} · {t.activityType.replace(/_/g, " ")} · {t.durationMinutes} min</small>
          </div>
          <span style={{ fontSize: "0.82rem" }}>{t.entryDate}</span>
          <strong style={{ fontSize: "0.86rem" }}>{money(t.amountCents)}</strong>
          <span className="pill">{t.status}</span>
        </div>
      ))}

      <h4 style={{ margin: "18px 0 8px" }}>Trust</h4>
      {tt.length === 0 && <Empty>No trust movement on this matter.</Empty>}
      {tt.slice(0, 25).map(t => (
        <div key={t.id} className="deadline-row">
          <div><strong style={{ fontSize: "0.86rem" }}>{t.description}</strong>
            <small style={{ display: "block", color: "var(--muted)" }}>{t.entryType.replace(/_/g, " ")}{t.reference ? ` · ${t.reference}` : ""}</small>
          </div>
          <span style={{ fontSize: "0.82rem" }}>{t.valueDate}</span>
          <strong style={{ fontSize: "0.86rem", color: ["receipt", "transfer_in"].includes(t.entryType) ? "var(--green)" : "var(--rose)" }}>
            {["receipt", "transfer_in"].includes(t.entryType) ? "+" : "−"}{money(t.amountCents)}
          </strong>
        </div>
      ))}

      <h4 style={{ margin: "18px 0 8px" }}>Invoices</h4>
      {inv.length === 0 && <Empty>No invoices raised on this matter.</Empty>}
      {inv.map(i => (
        <div key={i.id} className="deadline-row">
          <div><strong style={{ fontSize: "0.86rem" }}>{i.invoiceNumber}</strong>
            <small style={{ display: "block", color: "var(--muted)" }}>{i.clientName}</small>
          </div>
          <span style={{ fontSize: "0.82rem" }}>{i.issuedAt || "—"}</span>
          <strong style={{ fontSize: "0.86rem" }}>{money(i.amountCents)}</strong>
          <span className="pill">{i.status}</span>
        </div>
      ))}
    </>
  );
}

function DocumentsTab({ data }: { data: MatterFileData }) {
  const { documents: docs } = data;
  if (!docs.length) return <Empty>No documents filed to this matter yet. Documents are linked from Document Intelligence.</Empty>;
  return (
    <>
      {docs.map(d => (
        <div key={d.id} className="deadline-row">
          <div><strong style={{ fontSize: "0.86rem" }}>{d.fileName}</strong>
            <small style={{ display: "block", color: "var(--muted)" }}>{d.documentType || "Document"}{d.parties?.length ? ` · ${d.parties.slice(0, 3).join(", ")}` : ""}</small>
          </div>
          <span className="pill">{d.analysisStatus}</span>
        </div>
      ))}
    </>
  );
}

function CorrespondenceTab({ data }: { data: MatterFileData }) {
  const { correspondence: msgs } = data;
  if (!msgs.length) return <Empty>No correspondence on this matter. WhatsApp messages tagged with this matter reference appear here.</Empty>;
  return (
    <>
      {msgs.map(c => (
        <div key={c.id} className="deadline-row">
          <div>
            <small style={{ color: "var(--muted)" }}>{c.direction === "outbound" ? "→ Sent" : "← Received"}</small>
            <strong style={{ display: "block", fontSize: "0.86rem", fontWeight: 500 }}>{c.body}</strong>
          </div>
          <span style={{ fontSize: "0.8rem" }}>{c.sentAt ? new Date(c.sentAt).toLocaleString("en-ZA") : ""}</span>
          <span className="pill">{c.status}</span>
        </div>
      ))}
    </>
  );
}

const SOURCE_LABEL: Record<MatterDiaryEntry["source"], string> = {
  manual: "", document: "from a document", ai: "AI-suggested", rule_engine: "from court rules"
};

/**
 * Court-day calculator. Shows the working — which days were skipped and why —
 * because a bare computed date is exactly the kind of thing a practitioner
 * should not take on trust. Dies non is surfaced as a toggle, not buried, since
 * over the December recess it can move a date by a month.
 */
function CourtRuleCalculator({ matterUuid, onDiarised }: { matterUuid: string; onDiarised: () => void }) {
  const [open, setOpen] = useState(false);
  const [rules, setRules] = useState<CourtRule[]>([]);
  const [disclaimer, setDisclaimer] = useState("");
  const [ruleKey, setRuleKey] = useState("");
  const [from, setFrom] = useState("");
  const [diesNon, setDiesNon] = useState(false);
  const [calc, setCalc] = useState<CourtCalc | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    if (!open || rules.length) return;
    getCourtRules().then(r => {
      setRules(r.rules);
      setDisclaimer(r.disclaimer);
      if (r.rules[0]) { setRuleKey(r.rules[0].key); setDiesNon(r.rules[0].diesNon); }
    }).catch(() => setErr("Could not load the court rules."));
  }, [open, rules.length]);

  const selected = rules.find(r => r.key === ruleKey) || null;

  function pickRule(key: string) {
    setRuleKey(key);
    setCalc(null);
    const r = rules.find(x => x.key === key);
    if (r) setDiesNon(r.diesNon);
  }

  async function compute() {
    if (!from || !ruleKey) return;
    setBusy(true); setErr("");
    try {
      setCalc(await computeCourtDeadline({ ruleKey, fromDate: from, diesNon }));
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not compute the date.");
    }
    setBusy(false);
  }

  async function diarise() {
    setBusy(true); setErr("");
    try {
      await diariseFromRule(matterUuid, { ruleKey, fromDate: from, diesNon });
      setCalc(null); setFrom(""); setOpen(false);
      onDiarised();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not diarise.");
    }
    setBusy(false);
  }

  if (!open) {
    return (
      <button className="ghost small" style={{ marginBottom: 12 }} onClick={() => setOpen(true)}>
        <Scale size={13} /> Compute a deadline from the court rules
      </button>
    );
  }

  return (
    <div className="inline-form-toggle" style={{ marginBottom: 12, border: "1px solid var(--line)", borderRadius: 10, padding: 12, display: "grid", gap: 8 }}>
      <div className="panel-head" style={{ marginBottom: 0 }}>
        <span style={{ display: "flex", alignItems: "center", gap: 6, fontWeight: 700, fontSize: "0.88rem" }}>
          <Scale size={14} /> Court-rule deadline
        </span>
        <button className="ghost small" onClick={() => setOpen(false)}>Close</button>
      </div>

      <label style={{ display: "grid", gap: 4, fontSize: "0.82rem", fontWeight: 600 }}>
        Rule
        <select value={ruleKey} onChange={e => pickRule(e.target.value)}>
          {rules.map(r => <option key={r.key} value={r.key}>{r.label} — {r.days} {r.basis} days</option>)}
        </select>
      </label>
      {selected && (
        <small style={{ color: "var(--muted)" }}>
          {selected.citation} · runs from: {selected.trigger}
        </small>
      )}

      <div style={{ display: "flex", gap: 8, alignItems: "flex-end", flexWrap: "wrap" }}>
        <label style={{ display: "grid", gap: 4, fontSize: "0.82rem", fontWeight: 600 }}>
          Trigger date
          <input type="date" value={from} onChange={e => { setFrom(e.target.value); setCalc(null); }} />
        </label>
        <label style={{ display: "flex", gap: 6, alignItems: "center", fontSize: "0.82rem" }}>
          <input type="checkbox" checked={diesNon} style={{ width: "auto" }}
            onChange={e => { setDiesNon(e.target.checked); setCalc(null); }} />
          Apply dies non (16 Dec – 15 Jan)
        </label>
        <button className="primary small" onClick={compute} disabled={busy || !from}>Compute</button>
      </div>

      {err && <small style={{ color: "var(--rose)" }}>{err}</small>}

      {calc && (
        <div style={{ borderTop: "1px solid var(--line)", paddingTop: 8 }}>
          <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
            <span className="pill" style={{ background: "var(--green)", color: "#fff" }}>Due {calc.dueDate}</span>
            <small style={{ color: "var(--muted)" }}>
              {calc.days} {calc.basis} days from {calc.fromDate} · {calc.skippedCount} non-court days skipped
            </small>
            <button className="primary small" style={{ marginLeft: "auto" }} onClick={diarise} disabled={busy}>
              Add to diary
            </button>
          </div>
          {calc.skipped.length > 0 && (
            <details style={{ marginTop: 6 }}>
              <summary style={{ cursor: "pointer", fontSize: "0.8rem", color: "var(--muted)" }}>
                Show the working ({calc.skipped.length} days skipped)
              </summary>
              <div style={{ marginTop: 6, display: "grid", gap: 2, maxHeight: 180, overflowY: "auto" }}>
                {calc.skipped.map((s, i) => (
                  <small key={i} style={{ color: "var(--muted)" }}>{s.date} — {s.reason}</small>
                ))}
              </div>
            </details>
          )}
          {disclaimer && <small style={{ display: "block", marginTop: 8, color: "var(--muted)" }}>{disclaimer}</small>}
        </div>
      )}
    </div>
  );
}

function DiaryTab({ data, matterUuid, onChanged }: { data: MatterFileData; matterUuid: string; onChanged: () => void }) {
  const { deadlines, courtDates, entries } = data.diary;
  const [adding, setAdding] = useState(false);
  const [desc, setDesc] = useState("");
  const [due, setDue] = useState("");
  const [saving, setSaving] = useState(false);

  async function add() {
    if (!desc.trim() || !due) return;
    setSaving(true);
    try {
      await createDiaryEntry(matterUuid, { description: desc.trim(), dueDate: due, source: "manual" });
      setDesc(""); setDue(""); setAdding(false);
      onChanged();
    } catch { /* surfaced by the empty state staying put */ }
    setSaving(false);
  }

  async function complete(id: string) {
    try { await completeDiaryEntry(matterUuid, id); onChanged(); } catch { /* no-op */ }
  }

  const nothing = !deadlines.length && !courtDates.length && !entries.length;

  return (
    <>
      <div className="panel-head" style={{ marginBottom: 10 }}>
        <span style={{ fontSize: "0.86rem", color: "var(--muted)" }}>
          {entries.length + deadlines.length + courtDates.length} diarised
        </span>
        <button className="ghost small" onClick={() => setAdding(v => !v)}>
          <Plus size={13} /> {adding ? "Cancel" : "Add diary entry"}
        </button>
      </div>

      {adding && (
        <div className="inline-form-toggle" style={{ marginBottom: 12, display: "grid", gap: 8 }}>
          <input value={desc} onChange={e => setDesc(e.target.value)} placeholder="What needs doing?" />
          <div style={{ display: "flex", gap: 8 }}>
            <input type="date" value={due} onChange={e => setDue(e.target.value)} />
            <button className="primary small" onClick={add} disabled={saving || !desc.trim() || !due}>
              {saving ? "Saving…" : "Add to diary"}
            </button>
          </div>
        </div>
      )}

      <CourtRuleCalculator matterUuid={matterUuid} onDiarised={onChanged} />

      {nothing && <Empty>Nothing diarised on this matter.</Empty>}

      {entries.length > 0 && <h4 style={{ margin: "0 0 8px" }}>Diary</h4>}
      {entries.map(e => {
        const days = daysFrom(e.dueDate);
        return (
          <div key={e.id} className={`deadline-row${!e.completed && days < 0 ? " overdue" : ""}${e.completed ? " completed" : ""}`}>
            <div>
              <strong style={{ fontSize: "0.86rem" }}>{e.description}</strong>
              {SOURCE_LABEL[e.source] && (
                <small style={{ display: "block", color: "var(--muted)" }}>{SOURCE_LABEL[e.source]}</small>
              )}
            </div>
            <span style={{ fontSize: "0.82rem", fontWeight: 700 }}>
              {e.completed ? "✓ Done" : days < 0 ? `${Math.abs(days)} days overdue` : `${days} days`}
            </span>
            <span style={{ fontSize: "0.82rem" }}>{e.dueDate}</span>
            {!e.completed && (
              <button className="ghost small" onClick={() => complete(e.id)}><CheckCircle2 size={13} /> Done</button>
            )}
          </div>
        );
      })}

      {courtDates.length > 0 && <h4 style={{ margin: "18px 0 8px" }}>Court dates</h4>}
      {courtDates.map(c => (
        <div key={c.id} className="deadline-row">
          <div><strong style={{ fontSize: "0.86rem" }}>{c.purpose || "Hearing"}</strong>
            <small style={{ display: "block", color: "var(--muted)" }}>{c.court}{c.rollType ? ` · ${c.rollType}` : ""}</small>
          </div>
          <span style={{ fontSize: "0.82rem" }}>{c.courtDate}{c.courtTime ? ` ${c.courtTime}` : ""}</span>
        </div>
      ))}

      {deadlines.length > 0 && <h4 style={{ margin: "18px 0 8px" }}>Litigation deadlines</h4>}
      {deadlines.map(d => {
        const days = daysFrom(d.dueDate);
        return (
          <div key={d.id} className={`deadline-row${!d.completed && days < 0 ? " overdue" : ""}${d.completed ? " completed" : ""}`}>
            <div><strong style={{ fontSize: "0.86rem" }}>{d.description}</strong>
              {d.ruleReference && <small style={{ display: "block", color: "var(--muted)" }}>{d.ruleReference}</small>}
            </div>
            <span style={{ fontSize: "0.82rem", fontWeight: 700 }}>
              {d.completed ? "✓ Done" : days < 0 ? `${Math.abs(days)} days overdue` : `${days} days`}
            </span>
            <span style={{ fontSize: "0.82rem" }}>{d.dueDate}</span>
          </div>
        );
      })}
    </>
  );
}
