import { Car, CircleDollarSign, FileSearch, History, Search, ShieldCheck, User, X } from "lucide-react";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { callVerifyNow, getMatters, getSearches, MatterSearch } from "./api";
import type { Matter } from "./types";

type Props = {
  log: (msg: string) => void;
  showToast: (type: "success" | "error" | "info", title: string, msg: string) => void;
};

type FieldDef = { key: string; label: string; placeholder?: string; required?: boolean };
type ServiceDef = {
  service: string;
  label: string;
  group: string;
  description: string;
  fields: FieldDef[];
  /** Constant fields the provider requires but the attorney never types. */
  fixed?: Record<string, unknown>;
};

// The catalogue is deliberately data-driven: VerifyNow has never been called
// live (no key until now), so if a field name is wrong for a service, the fix
// is one line here — not a rebuild.
const SERVICES: ServiceDef[] = [
  {
    service: "number-plate", label: "Number Plate", group: "Vehicle",
    description: "Vehicle lookup by licence plate — registration details for a vehicle involved in a claim.",
    fields: [{ key: "licence_number", label: "Licence plate number", placeholder: "e.g. CA 123-456", required: true }]
  },
  {
    service: "vin-decode", label: "VIN Decode", group: "Vehicle",
    description: "Decode a Vehicle Identification Number into make, model and build details.",
    fields: [{ key: "vin", label: "VIN", placeholder: "17-character VIN", required: true }]
  },
  {
    service: "consumer-trace", label: "Consumer Trace", group: "Consumer",
    description: "Full trace on an individual — addresses, contact details, employment indicators.",
    fields: [{ key: "id_number", label: "SA ID number", placeholder: "13-digit ID number", required: true }]
  },
  {
    service: "consumer-trace-lite", label: "Consumer Trace Lite", group: "Consumer",
    description: "Lighter, cheaper trace — most recent contact details only.",
    fields: [{ key: "id_number", label: "SA ID number", placeholder: "13-digit ID number", required: true }]
  },
  {
    service: "aml-pep", label: "AML / PEP Screening", group: "Consumer",
    description: "Sanctions, adverse media and politically-exposed-person screening.",
    fields: [{ key: "name", label: "Full name", placeholder: "Name to screen", required: true }],
    fixed: { entity: 0, country: "za", dataset: "all" }
  },
  {
    service: "verify", label: "ID Verification", group: "Consumer",
    description: "Verify an SA ID number against Home Affairs.",
    fields: [
      { key: "idNumber", label: "SA ID number", placeholder: "13-digit ID number", required: true }
    ]
  },
  {
    service: "cipc/company", label: "CIPC Company", group: "Company",
    description: "Company registration details and status from the CIPC register.",
    fields: [{ key: "registration_number", label: "Registration number", placeholder: "e.g. 2019/123456/07", required: true }],
    fixed: { reportType: "cipc_company_match" }
  },
  {
    service: "cipc/director", label: "CIPC Director", group: "Company",
    description: "Directorships held by an individual, by ID number.",
    fields: [{ key: "id_number", label: "SA ID number", placeholder: "13-digit ID number", required: true }]
  },
  {
    service: "bank-account-verification", label: "Bank Account Verification", group: "Bank",
    description: "Verify a bank account belongs to the named individual before paying out.",
    fields: [
      { key: "firstName", label: "First name", required: true },
      { key: "surname", label: "Surname", required: true },
      { key: "identityNumber", label: "SA ID number", required: true },
      { key: "bankName", label: "Bank", placeholder: "e.g. FNB", required: true },
      { key: "bankAccountNumber", label: "Account number", required: true },
      { key: "bankBranchCode", label: "Branch code", required: true }
    ],
    fixed: { type: "Individual", identityType: "IDNumber" }
  }
];

const GROUPS = ["Vehicle", "Consumer", "Company", "Bank"];
const GROUP_ICONS: Record<string, typeof Car> = { Vehicle: Car, Consumer: User, Company: FileSearch, Bank: CircleDollarSign };

function flatten(obj: unknown, prefix = "", out: Record<string, string> = {}): Record<string, string> {
  if (obj && typeof obj === "object" && !Array.isArray(obj)) {
    for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
      flatten(v, prefix ? `${prefix}_${k}` : k, out);
    }
  } else if (prefix) {
    out[prefix] = Array.isArray(obj) ? JSON.stringify(obj) : String(obj ?? "");
  }
  return out;
}

const money = (cents: number) => `R ${(cents / 100).toLocaleString("en-ZA", { minimumFractionDigits: 2 })}`;

export function Searches({ log, showToast }: Props) {
  const [selected, setSelected] = useState<ServiceDef>(SERVICES[0]);
  const [values, setValues] = useState<Record<string, string>>({});
  const [matters, setMatters] = useState<Matter[]>([]);
  const [matterId, setMatterId] = useState<string>("");
  const [running, setRunning] = useState(false);
  const [lastResult, setLastResult] = useState<{ service: string; flat: Record<string, string>; credits: number } | null>(null);
  const [history, setHistory] = useState<MatterSearch[]>([]);
  const [historyMatter, setHistoryMatter] = useState<string>("");
  const [openEntry, setOpenEntry] = useState<string | null>(null);

  const loadHistory = useCallback(async (mid: string) => {
    try {
      const res = await getSearches(mid ? { matterId: mid } : undefined);
      setHistory(res.searches);
    } catch { /* register is non-critical; searching still works */ }
  }, []);

  useEffect(() => {
    getMatters().then(res => setMatters(res.matters)).catch(() => {});
    loadHistory("");
  }, [loadHistory]);

  function pickService(def: ServiceDef) {
    setSelected(def);
    setValues({});
    setLastResult(null);
  }

  async function handleRun(e: FormEvent) {
    e.preventDefault();
    const body: Record<string, unknown> = { ...(selected.fixed || {}) };
    for (const f of selected.fields) {
      const v = (values[f.key] || "").trim();
      if (f.required && !v) { showToast("error", selected.label, `${f.label} is required.`); return; }
      if (v) body[f.key] = v;
    }
    if (matterId) body.matter_id = matterId;
    setRunning(true);
    setLastResult(null);
    log(`Search: ${selected.label}${matterId ? " (filed to matter)" : ""}`);
    try {
      const res = await callVerifyNow(selected.service, body);
      const flat = flatten(res.data);
      const credits = res.metadata?.credits_spent ?? 0;
      setLastResult({ service: selected.service, flat, credits });
      showToast("success", selected.label, `Search complete${credits ? ` — ${credits} credits` : ""}.`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Search failed";
      showToast("error", selected.label, msg);
      log(`Search failed: ${msg}`);
    } finally {
      setRunning(false);
      loadHistory(historyMatter);
    }
  }

  const grouped = useMemo(() =>
    GROUPS.map(g => ({ group: g, defs: SERVICES.filter(s => s.group === g) })), []);

  return (
    <>
      <div className="cipc-notice">
        <p style={{ margin: 0, fontSize: "0.9rem", lineHeight: 1.5 }}>
          <ShieldCheck size={16} style={{ verticalAlign: "-3px", marginRight: 8, color: "var(--blue)" }} />
          Vehicle, consumer, company and bank searches via VerifyNow SA. Each search costs credits, is logged,
          and — when filed to a matter — lands on the matter&apos;s search register as evidence and a disbursement candidate.
          Use only for a lawful purpose connected to a mandate (POPIA s11).
        </p>
      </div>

      <div className="split">
        <section>
          <div className="panel">
            <div className="panel-head">
              <h3><Search size={16} style={{ verticalAlign: "-3px", marginRight: 6 }} /> Run a search</h3>
            </div>

            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 16 }}>
              {grouped.map(({ group, defs }) => {
                const Icon = GROUP_ICONS[group];
                return (
                  <div key={group} style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
                    <span style={{ fontSize: "0.72rem", textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--muted)", display: "flex", alignItems: "center", gap: 4 }}>
                      <Icon size={12} /> {group}
                    </span>
                    {defs.map(def => (
                      <button
                        key={def.service}
                        type="button"
                        className={def.service === selected.service ? "primary small" : "ghost small"}
                        onClick={() => pickService(def)}
                      >
                        {def.label}
                      </button>
                    ))}
                  </div>
                );
              })}
            </div>

            <p style={{ margin: "0 0 14px", fontSize: "0.85rem", color: "var(--muted)" }}>{selected.description}</p>

            <form className="form" onSubmit={handleRun}>
              {selected.fields.map(f => (
                <label key={f.key}>
                  <span>{f.label}</span>
                  <input
                    type="text"
                    placeholder={f.placeholder || ""}
                    value={values[f.key] || ""}
                    onChange={e => setValues(prev => ({ ...prev, [f.key]: e.target.value }))}
                    disabled={running}
                  />
                </label>
              ))}
              <label>
                <span>File to matter (optional)</span>
                <select value={matterId} onChange={e => setMatterId(e.target.value)} disabled={running}>
                  <option value="">— ad-hoc search, no matter —</option>
                  {matters.map(m => (
                    <option key={m.uuid} value={m.uuid}>{m.id} — {m.title}</option>
                  ))}
                </select>
              </label>
              <button className="primary" type="submit" disabled={running}>
                {running ? "Searching…" : <><Search size={16} /> Run search</>}
              </button>
            </form>
          </div>

          {lastResult && (
            <div className="panel" style={{ marginTop: 18 }}>
              <div className="panel-head">
                <h3>Result</h3>
                {lastResult.credits > 0 && <span className="pill">{lastResult.credits} credits</span>}
              </div>
              {Object.keys(lastResult.flat).length === 0 ? (
                <p style={{ margin: 0, color: "var(--muted)", fontStyle: "italic" }}>The provider returned no data fields.</p>
              ) : (
                <table className="cipc-directors-table">
                  <tbody>
                    {Object.entries(lastResult.flat).map(([k, v]) => (
                      <tr key={k}>
                        <td style={{ fontWeight: 600, whiteSpace: "nowrap" }}>{k.replace(/_/g, " ")}</td>
                        <td style={{ color: "var(--muted)", wordBreak: "break-word" }}>{v}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}
        </section>

        <aside>
          <div className="panel" style={{ position: "sticky", top: 16 }}>
            <div className="panel-head">
              <h3><History size={15} style={{ verticalAlign: "-3px", marginRight: 6, color: "var(--green)" }} /> Search register</h3>
            </div>
            <label style={{ display: "block", marginBottom: 12 }}>
              <select
                value={historyMatter}
                onChange={e => { setHistoryMatter(e.target.value); loadHistory(e.target.value); }}
              >
                <option value="">All matters</option>
                {matters.map(m => (
                  <option key={m.uuid} value={m.uuid}>{m.id} — {m.title}</option>
                ))}
              </select>
            </label>
            {history.length === 0 ? (
              <p style={{ margin: 0, color: "var(--muted)", fontStyle: "italic", fontSize: "0.88rem" }}>
                No searches recorded yet.
              </p>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 10, maxHeight: 520, overflowY: "auto" }}>
                {history.map(s => {
                  const def = SERVICES.find(d => d.service === s.service);
                  const open = openEntry === s.id;
                  return (
                    <div key={s.id} style={{ border: "1px solid var(--line)", borderRadius: "var(--radius-sm, 8px)", padding: "10px 12px", cursor: "pointer" }} onClick={() => setOpenEntry(open ? null : s.id)}>
                      <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "baseline" }}>
                        <strong style={{ fontSize: "0.85rem" }}>{def?.label || s.service}</strong>
                        {s.status === "error"
                          ? <span className="pill" style={{ background: "var(--rose-bg)", color: "var(--rose)" }}><X size={11} style={{ verticalAlign: "-1px" }} /> failed</span>
                          : s.creditsSpent > 0 && <span className="pill">{money(s.creditsSpent)}</span>}
                      </div>
                      <div style={{ fontSize: "0.8rem", color: "var(--muted)", marginTop: 2 }}>
                        {s.inputRef && <span style={{ fontFamily: "var(--font-mono)" }}>{s.inputRef}</span>}
                        {s.matterNumber && <span> · {s.matterNumber}</span>}
                        <span> · {new Date(s.createdAt).toLocaleDateString("en-ZA")}</span>
                        {s.userName && <span> · {s.userName}</span>}
                      </div>
                      {open && (
                        <div style={{ marginTop: 8, fontSize: "0.8rem" }}>
                          {s.status === "error" ? (
                            <p style={{ margin: 0, color: "var(--rose)" }}>{s.errorMessage || "Search failed."}</p>
                          ) : (
                            <table className="cipc-directors-table">
                              <tbody>
                                {Object.entries(flatten((s.result as Record<string, unknown>)?.data ?? s.result)).slice(0, 20).map(([k, v]) => (
                                  <tr key={k}>
                                    <td style={{ fontWeight: 600, whiteSpace: "nowrap" }}>{k.replace(/_/g, " ")}</td>
                                    <td style={{ color: "var(--muted)", wordBreak: "break-word" }}>{v}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </aside>
      </div>
    </>
  );
}
