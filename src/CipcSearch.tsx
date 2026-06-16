import { Building2, CheckCircle2, Search, UserCheck, X } from "lucide-react";
import { FormEvent, useState } from "react";
import { searchCipc } from "./api";
import type { CipcSearchResult } from "./types";

type Props = {
  log: (msg: string) => void;
  showToast: (type: "success" | "error" | "info", title: string, msg: string) => void;
  onImportToFica?: (result: CipcSearchResult) => void;
};

function maskId(id: string): string {
  if (id.length <= 6) return id;
  return id.slice(0, 6) + "****";
}

function StatusBadge({ status }: { status: CipcSearchResult["status"] }) {
  const cls =
    status === "Active" ? "cipc-status-active" :
    status === "In liquidation" ? "cipc-status-liquidation" :
    status === "Final deregistration" ? "cipc-status-final" :
    "cipc-status-deregistered";
  return <span className={cls}>{status}</span>;
}

const SUFFIX_GUIDE = [
  { suffix: "/07", label: "Private Company" },
  { suffix: "/06", label: "Public Company" },
  { suffix: "/10", label: "Non-profit Company" },
  { suffix: "/21", label: "Close Corporation" },
  { suffix: "/11", label: "Trust" },
];

export function CipcSearch({ log, showToast, onImportToFica }: Props) {
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<CipcSearchResult[]>([]);
  const [apiNote, setApiNote] = useState<string | null>(null);
  const [searched, setSearched] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const q = query.trim();
    if (!q) return;
    setLoading(true);
    setSearched(false);
    setResults([]);
    setApiNote(null);
    log(`CIPC search: "${q}"`);
    try {
      const res = await searchCipc(q);
      setResults(res.results);
      if (res.note) setApiNote(res.note);
      setSearched(true);
      log(`CIPC search returned ${res.results.length} result(s)${res.cached ? " (cached)" : ""}`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Search failed";
      showToast("error", "CIPC Search Error", msg);
      log(`CIPC search error: ${msg}`);
    } finally {
      setLoading(false);
    }
  }

  function handleImport(result: CipcSearchResult) {
    if (onImportToFica) {
      onImportToFica(result);
      showToast("success", "Imported to FICA", `${result.companyName} imported to FICA client record.`);
      log(`Imported to FICA: ${result.companyName} (${result.registrationNumber})`);
    } else {
      showToast("info", "Import to FICA", "Copy registration number and name to your FICA client record.");
    }
  }

  return (
    <>
      <div className="cipc-notice">
        <p style={{ margin: 0, fontSize: "0.9rem", lineHeight: 1.5 }}>
          <Building2 size={16} style={{ verticalAlign: "-3px", marginRight: 8, color: "var(--blue)" }} />
          The Companies and Intellectual Property Commission (CIPC) maintains the official register of South African
          companies. Live CIPC data requires a registered data provider (Lightstone, LexisNexis DataSec).
          Currently operating in <strong>simulation mode</strong>.
        </p>
      </div>

      <div className="split">
        <section>
          <div className="panel">
            <div className="panel-head">
              <h3><Search size={16} style={{ verticalAlign: "-3px", marginRight: 6 }} /> Search CIPC Register</h3>
            </div>
            <form className="form" onSubmit={handleSubmit}>
              <label>
                <span>Company name or registration number</span>
                <input
                  type="text"
                  placeholder="e.g. Acme Trading or 2019/123456/07"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  disabled={loading}
                />
              </label>
              <button className="primary" type="submit" disabled={loading || !query.trim()}>
                {loading ? "Searching…" : <><Search size={16} /> Search</>}
              </button>
            </form>
          </div>

          {apiNote && (
            <div className="cipc-notice" style={{ borderLeftColor: "var(--gold)", background: "var(--gold-bg)", marginTop: 18 }}>
              <p style={{ margin: 0, fontSize: "0.88rem", color: "var(--gold)" }}>{apiNote}</p>
            </div>
          )}

          {searched && results.length === 0 && (
            <div className="panel" style={{ marginTop: 18, textAlign: "center" }}>
              <X size={28} style={{ color: "var(--muted)", marginBottom: 8 }} />
              <p style={{ margin: 0, fontWeight: 600 }}>No results found</p>
              <small style={{ color: "var(--muted)" }}>Try a different company name or registration number.</small>
            </div>
          )}

          {results.map((r) => (
            <div key={r.registrationNumber} className="cipc-result-card" style={{ marginTop: 18 }}>
              <div className="cipc-result-head">
                <div>
                  <h3 style={{ margin: 0, fontFamily: "var(--font-serif)", fontSize: "1.1rem" }}>{r.companyName}</h3>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: "4px 14px", marginTop: 4, fontSize: "0.85rem", color: "var(--muted)" }}>
                    <span style={{ fontFamily: "var(--font-mono)" }}>{r.registrationNumber}</span>
                    <span>{r.companyType}</span>
                    <span>Registered: {r.registrationDate}</span>
                  </div>
                </div>
                <div style={{ display: "flex", gap: 8, alignItems: "center", flexShrink: 0 }}>
                  <StatusBadge status={r.status} />
                  <button className="ghost small" onClick={() => handleImport(r)}>
                    <UserCheck size={14} /> Import to FICA
                  </button>
                </div>
              </div>

              <div>
                <h4 style={{ margin: "0 0 10px", fontSize: "0.78rem", textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--muted)", display: "flex", alignItems: "center", gap: 6 }}>
                  <CheckCircle2 size={13} /> Directors / Officers
                </h4>
                {r.directors.length === 0 ? (
                  <p style={{ margin: 0, color: "var(--muted)", fontStyle: "italic", fontSize: "0.88rem" }}>
                    No director information available.
                  </p>
                ) : (
                  <table className="cipc-directors-table">
                    <thead>
                      <tr>
                        <th>Name</th>
                        <th>ID Number</th>
                        <th>Appointment Date</th>
                        <th>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {r.directors.map((d, i) => (
                        <tr key={i}>
                          <td style={{ fontWeight: 600 }}>{d.name}</td>
                          <td style={{ fontFamily: "var(--font-mono)", color: "var(--muted)" }}>{maskId(d.idNumber)}</td>
                          <td style={{ color: "var(--muted)" }}>{d.appointmentDate}</td>
                          <td>
                            <span className={d.status === "Active" ? "cipc-status-active" : "pill"} style={d.status !== "Active" ? { background: "var(--surface)", color: "var(--muted)" } : {}}>
                              {d.status}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          ))}
        </section>

        <aside>
          <div className="panel" style={{ position: "sticky", top: 16 }}>
            <div className="panel-head">
              <h3><Building2 size={15} style={{ verticalAlign: "-3px", marginRight: 6, color: "var(--green)" }} /> Suffix guide</h3>
            </div>
            <dl className="cipc-suffix-guide" style={{ margin: 0 }}>
              {SUFFIX_GUIDE.map(({ suffix, label }) => (
                <div key={suffix} style={{ marginBottom: 8 }}>
                  <dt style={{ fontFamily: "var(--font-mono)" }}>{suffix}</dt>
                  <dd>— {label}</dd>
                </div>
              ))}
            </dl>
            <p style={{ marginTop: 14, fontSize: "0.8rem", color: "var(--muted)", lineHeight: 1.5 }}>
              The suffix appears at the end of the CIPC registration number, e.g.{" "}
              <span style={{ fontFamily: "var(--font-mono)" }}>2019/123456/07</span>.
            </p>
          </div>
        </aside>
      </div>
    </>
  );
}
