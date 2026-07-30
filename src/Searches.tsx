import { Car, CircleDollarSign, FileSearch, History, Search, ShieldCheck, User, X } from "lucide-react";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { callVerifyNow, getMatters, getSearchServices, getSearches, getVerifyNowCredits, MatterSearch } from "./api";
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
};

// Labels, descriptions and input fields only. PRICES ARE NOT HERE: they depend
// on the platform's credit cost and markup, so they are fetched from the server
// (a hardcoded price would eventually quote one figure and charge another).
// The provider's discriminators (reportType/bundle) are injected server-side.
const SERVICES: ServiceDef[] = [
  {
    service: "number-plate", label: "Number Plate", group: "Vehicle",
    description: "Vehicle specification lookup by registration number — make, model, year and engine details for a vehicle involved in a claim.",
    fields: [{ key: "registrationNumber", label: "Registration number", placeholder: "e.g. ABC 123 GP", required: true }]
  },
  {
    service: "vin-decode", label: "VIN Decode", group: "Vehicle",
    description: "Vehicle lookup by VIN. The provider documents a VIN mode on this endpoint but publishes no example — if the field name is wrong, the error will say so and nothing is charged.",
    fields: [{ key: "vin", label: "VIN", placeholder: "17-character VIN", required: true }]
  },
  {
    service: "consumer-trace", label: "Consumer Trace", group: "Trace",
    description: "Comprehensive trace — current and historical addresses, employment history and contact numbers.",
    fields: [{ key: "idNumber", label: "SA ID number", placeholder: "13-digit ID number", required: true }]
  },
  {
    service: "consumer-trace-lite", label: "Consumer Trace Lite", group: "Trace",
    description: "Faster, focused trace — core identity, marital and deceased status, essential contact and address details.",
    fields: [{ key: "idNumber", label: "SA ID number", placeholder: "13-digit ID number", required: true }]
  },
  {
    service: "address-lookup", label: "Address Lookup", group: "Trace",
    description: "Last-known recorded physical address for an SA ID number. Not proof of current residence. A lookup that finds no address is still charged.",
    fields: [{ key: "idNumber", label: "SA ID number", placeholder: "13-digit ID number", required: true }]
  },
  {
    service: "phone-lookup", label: "Phone Lookup (Reverse)", group: "Trace",
    description: "Identify the person linked to an SA mobile or landline number.",
    fields: [{ key: "contactNumber", label: "Phone number", placeholder: "e.g. 0821234567", required: true }]
  },
  {
    service: "property-search", label: "Property Search", group: "Trace",
    description: "Property records linked to an SA ID number — useful when assessing what a debtor or claimant owns. A no-record result is still charged.",
    fields: [{ key: "idNumber", label: "SA ID number", placeholder: "13-digit ID number", required: true }]
  },
  {
    service: "aml-pep", label: "AML / PEP Screening", group: "Person",
    description: "Screen against global sanctions lists, PEP databases and adverse media records.",
    fields: [{ key: "name", label: "Full name", placeholder: "Name to screen", required: true }]
  },
  {
    service: "verify", label: "ID Verification", group: "Person",
    description: "Verify an SA ID number against Home Affairs. The cheapest check — confirms the number is real and whose it is.",
    fields: [{ key: "idNumber", label: "SA ID number", placeholder: "13-digit ID number", required: true }]
  },
  {
    service: "alive-status", label: "Alive / Deceased", group: "Person",
    description: "Real-time Home Affairs status — deceased status and date, blocked status, citizenship, marital status. Establishes whether a claimant or witness is alive.",
    fields: [{ key: "idNumber", label: "SA ID number", placeholder: "13-digit ID number", required: true }]
  },
  {
    service: "marital-status", label: "Marital Status", group: "Person",
    description: "Real-time marital status as recorded by Home Affairs — matters for matrimonial-property consequences and locus standi.",
    fields: [{ key: "idNumber", label: "SA ID number", placeholder: "13-digit ID number", required: true }]
  },
  {
    service: "cipc/company", label: "CIPC Company", group: "Company",
    description: "Company registration details and status from CIPC. Must be a registration number such as 2020/123456/07 — not a company name.",
    fields: [{ key: "registration_number", label: "Registration number", placeholder: "e.g. 2019/123456/07", required: true }]
  },
  {
    service: "cipc/director", label: "CIPC Director", group: "Company",
    description: "All active and historical directorships held by an individual, by SA ID number.",
    fields: [{ key: "idNumber", label: "SA ID number", placeholder: "13-digit ID number", required: true }]
  },
  {
    service: "bank-account-verification", label: "Bank Account Verification", group: "Bank",
    description: "Verify a bank account belongs to the named individual before paying it. Unsuccessful outcomes are not charged.",
    fields: [
      { key: "firstName", label: "First name", required: true },
      { key: "surname", label: "Surname", required: true },
      { key: "identityNumber", label: "SA ID number", required: true },
      { key: "bankName", label: "Bank", placeholder: "e.g. FNB", required: true },
      { key: "bankAccountNumber", label: "Account number", required: true },
      { key: "bankBranchCode", label: "Branch code", placeholder: "e.g. 250655", required: true },
      { key: "bankAccountType", label: "Account type", placeholder: "e.g. Savings or Cheque", required: true }
    ]
  }
];

const GROUPS = ["Vehicle", "Trace", "Person", "Company", "Bank"];
const GROUP_ICONS: Record<string, typeof Car> = { Vehicle: Car, Trace: History, Person: User, Company: FileSearch, Bank: CircleDollarSign };

// ─── Result rendering ─────────────────────────────────────────────────────────
// These payloads are deeply nested and inconsistent: a directorship list is an
// array of objects, a vehicle's extras are an array of [label, value] pairs,
// Home Affairs fields arrive as {CarMake:{CurrentTextValue:"…"}}, and some
// providers hand back JSON as a *string*. Flattening it all to one key/value map
// produced walls of raw JSON, so each shape is rendered as what it is.

/** Provider noise that carries no meaning for a reader. */
const NOISE_KEYS = new Set(["CurrentTextValue", "currentTextValue", "value", "Value"]);

function humanise(key: string): string {
  const cleaned = key
    .replace(/[_-]+/g, " ")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/\s+/g, " ")
    .trim();
  return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
}

/** Some fields arrive as a JSON string rather than parsed JSON. */
function maybeParse(value: unknown): unknown {
  if (typeof value !== "string") return value;
  const t = value.trim();
  if (!(t.startsWith("{") || t.startsWith("["))) return value;
  try { return JSON.parse(t); } catch { return value; }
}

/** {CarMake: {CurrentTextValue: "LAND ROVER"}} reads as "Land Rover", not a nest. */
function unwrapNoise(value: unknown): unknown {
  if (!value || typeof value !== "object" || Array.isArray(value)) return value;
  const entries = Object.entries(value as Record<string, unknown>);
  if (entries.length === 1 && NOISE_KEYS.has(entries[0][0])) return entries[0][1];
  return value;
}

function isEmpty(value: unknown): boolean {
  if (value === null || value === undefined) return true;
  if (typeof value === "string") return value.trim() === "";
  if (Array.isArray(value)) return value.length === 0;
  if (typeof value === "object") return Object.keys(value as object).length === 0;
  return false;
}

/** An array of [label, value] pairs, as the vehicle "Extended" block uses. */
function isPairArray(value: unknown): value is [string, unknown][] {
  return Array.isArray(value) && value.length > 0 &&
    value.every(v => Array.isArray(v) && v.length === 2 && typeof v[0] === "string");
}

function Scalar({ value }: { value: unknown }) {
  const text = typeof value === "boolean" ? (value ? "Yes" : "No") : String(value);
  const isBad = /^(false|no|deregist|not verified|failed)/i.test(text);
  const isGood = /^(true|yes|active|approved|verified|success)/i.test(text);
  return (
    <span style={{ color: isBad ? "var(--rose)" : isGood ? "var(--green)" : undefined, fontWeight: isBad || isGood ? 600 : undefined }}>
      {text}
    </span>
  );
}

function ResultValue({ value, depth = 0 }: { value: unknown; depth?: number }) {
  const v = unwrapNoise(maybeParse(value));

  if (isEmpty(v)) return <span style={{ color: "var(--muted)", fontStyle: "italic" }}>—</span>;
  if (depth > 5) return <span style={{ color: "var(--muted)" }}>…</span>;

  if (isPairArray(v)) {
    return (
      <table className="cipc-directors-table">
        <tbody>
          {v.map(([k, val], i) => (
            <tr key={`${k}-${i}`}>
              <td style={{ fontWeight: 600, whiteSpace: "nowrap" }}>{humanise(k)}</td>
              <td><ResultValue value={val} depth={depth + 1} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    );
  }

  if (Array.isArray(v)) {
    const objects = v.filter(x => x && typeof x === "object" && !Array.isArray(x));
    // A list of records (directorships, properties, addresses) — one card each.
    if (objects.length === v.length && v.length > 0) {
      return (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {v.map((item, i) => (
            <div key={i} style={{ border: "1px solid var(--line)", borderRadius: 8, padding: "8px 10px" }}>
              <div style={{ fontSize: "0.72rem", textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--muted)", marginBottom: 4 }}>
                {v.length > 1 ? `${i + 1} of ${v.length}` : "Record"}
              </div>
              <ResultValue value={item} depth={depth + 1} />
            </div>
          ))}
        </div>
      );
    }
    return (
      <ul style={{ margin: 0, paddingLeft: 18 }}>
        {v.map((item, i) => <li key={i}><ResultValue value={item} depth={depth + 1} /></li>)}
      </ul>
    );
  }

  if (typeof v === "object") {
    const rows = Object.entries(v as Record<string, unknown>).filter(([, val]) => !isEmpty(unwrapNoise(maybeParse(val))));
    if (!rows.length) return <span style={{ color: "var(--muted)", fontStyle: "italic" }}>—</span>;
    return (
      <table className="cipc-directors-table">
        <tbody>
          {rows.map(([k, val]) => (
            <tr key={k}>
              <td style={{ fontWeight: 600, whiteSpace: "nowrap", verticalAlign: "top" }}>{humanise(k)}</td>
              <td><ResultValue value={val} depth={depth + 1} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    );
  }

  return <Scalar value={v} />;
}

/** The `results` block, whose top-level keys are the provider's report names. */
function ResultTree({ data }: { data: unknown }) {
  const parsed = maybeParse(data);
  if (isEmpty(parsed)) {
    return <p style={{ margin: 0, color: "var(--muted)", fontStyle: "italic" }}>The provider returned no data.</p>;
  }
  if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
    const sections = Object.entries(parsed as Record<string, unknown>).filter(([, v]) => !isEmpty(v));
    if (sections.length > 1) {
      return (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {sections.map(([name, value]) => (
            <div key={name}>
              <h4 style={{ margin: "0 0 6px", fontSize: "0.78rem", textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--muted)" }}>
                {humanise(name)}
              </h4>
              <ResultValue value={value} />
            </div>
          ))}
        </div>
      );
    }
    if (sections.length === 1) return <ResultValue value={sections[0][1]} />;
  }
  return <ResultValue value={parsed} />;
}

/** Strip the envelope so only the report content is rendered. */
function resultPayload(raw: unknown): unknown {
  if (!raw || typeof raw !== "object") return raw;
  const r = raw as Record<string, unknown>;
  return r.results ?? r.result ?? r.data ?? r.Result ?? raw;
}

const money = (cents: number) => `R ${(cents / 100).toLocaleString("en-ZA", { minimumFractionDigits: 2 })}`;

export function Searches({ log, showToast }: Props) {
  const [selected, setSelected] = useState<ServiceDef>(SERVICES[0]);
  const [values, setValues] = useState<Record<string, string>>({});
  const [matters, setMatters] = useState<Matter[]>([]);
  const [matterId, setMatterId] = useState<string>("");
  const [running, setRunning] = useState(false);
  const [lastResult, setLastResult] = useState<{ service: string; data: unknown; remaining: number | null } | null>(null);
  const [history, setHistory] = useState<MatterSearch[]>([]);
  const [historyMatter, setHistoryMatter] = useState<string>("");
  const [openEntry, setOpenEntry] = useState<string | null>(null);
  const [credits, setCredits] = useState<number | null>(null);
  // Prices come from the server (they depend on the platform's markup), so
  // until they arrive no figure is shown rather than a wrong one.
  const [prices, setPrices] = useState<Record<string, { credits: number; chargeCents: number }>>({});
  const selectedPrice = prices[selected.service] ?? null;

  const refreshCredits = useCallback(() => {
    getVerifyNowCredits().then(r => setCredits(r.credits)).catch(() => setCredits(null));
  }, []);

  const loadHistory = useCallback(async (mid: string) => {
    try {
      const res = await getSearches(mid ? { matterId: mid } : undefined);
      setHistory(res.searches);
    } catch { /* register is non-critical; searching still works */ }
  }, []);

  useEffect(() => {
    getMatters().then(res => setMatters(res.matters)).catch(() => {});
    getSearchServices()
      .then(res => setPrices(Object.fromEntries(res.services.map(s => [s.service, { credits: s.credits, chargeCents: s.chargeCents }]))))
      .catch(() => {});
    loadHistory("");
    refreshCredits();
  }, [loadHistory, refreshCredits]);

  function pickService(def: ServiceDef) {
    setSelected(def);
    setValues({});
    setLastResult(null);
  }

  async function handleRun(e: FormEvent) {
    e.preventDefault();
    const body: Record<string, unknown> = {};
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
      // This provider nests the payload under `results`, and reports what is
      // left rather than what was spent.
      const payload = res as unknown as Record<string, unknown>;
      const remaining = typeof payload.remainingCredits === "number"
        ? payload.remainingCredits
        : typeof payload.remaining_credits === "number" ? payload.remaining_credits : null;
      setLastResult({ service: selected.service, data: resultPayload(payload), remaining });
      showToast("success", selected.label, `Search complete${selectedPrice ? ` — ${money(selectedPrice.chargeCents)}` : ""}${remaining !== null ? `, ${remaining} credits left` : ""}.`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Search failed";
      showToast("error", selected.label, msg);
      log(`Search failed: ${msg}`);
    } finally {
      setRunning(false);
      loadHistory(historyMatter);
      refreshCredits();
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
              {credits !== null && (
                <span className="pill" style={credits < 20 ? { background: "var(--rose-bg)", color: "var(--rose)" } : {}}>
                  {credits} credits
                </span>
              )}
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

            <p style={{ margin: "0 0 6px", fontSize: "0.85rem", color: "var(--muted)" }}>{selected.description}</p>
            {selectedPrice && (
              <p style={{ margin: "0 0 14px", fontSize: "0.85rem", fontWeight: 600 }}>
                Cost: {money(selectedPrice.chargeCents)} per search — recoverable as a disbursement
              </p>
            )}

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
                {lastResult.remaining !== null && <span className="pill">{lastResult.remaining} credits left</span>}
              </div>
              <ResultTree data={lastResult.data} />
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
                          : s.chargeCents !== null && s.chargeCents > 0 && <span className="pill">{money(s.chargeCents)}</span>}
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
                            <ResultTree data={resultPayload(s.result)} />
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
