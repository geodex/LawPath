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
  const map: Record<CipcSearchResult["status"], { label: string; cls: string }> = {
    Active: { label: "Active", cls: "bg-green-100 text-green-800 border border-green-200" },
    Deregistered: { label: "Deregistered", cls: "bg-rose-100 text-rose-800 border border-rose-200" },
    "In liquidation": { label: "In liquidation", cls: "bg-amber-100 text-amber-800 border border-amber-200" },
    "Final deregistration": { label: "Final deregistration", cls: "bg-rose-100 text-rose-800 border border-rose-200" },
  };
  const { label, cls } = map[status] ?? { label: status, cls: "bg-gray-100 text-gray-700" };
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${cls}`}>
      {label}
    </span>
  );
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
    <div className="space-y-5">
      {/* CIPC Notice */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 flex gap-3">
        <Building2 className="text-blue-600 mt-0.5 shrink-0" size={20} />
        <p className="text-sm text-blue-800 leading-relaxed">
          The Companies and Intellectual Property Commission (CIPC) maintains the official register of South African
          companies. Results shown include registration status and directorship information. Live CIPC data requires a
          registered data provider (Lightstone, LexisNexis DataSec). Currently operating in{" "}
          <span className="font-semibold">simulation mode</span>.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Main search area */}
        <div className="lg:col-span-2 space-y-5">
          {/* Search Form */}
          <form onSubmit={handleSubmit} className="bg-white border border-gray-200 rounded-lg p-5 shadow-sm space-y-3">
            <h2 className="text-base font-semibold text-gray-800 flex items-center gap-2">
              <Search size={18} className="text-indigo-600" />
              Search CIPC Register
            </h2>
            <div className="flex gap-2">
              <input
                type="text"
                className="flex-1 border border-gray-300 rounded-lg px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent placeholder-gray-400"
                placeholder="e.g. Acme Trading or 2019/123456/07"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                disabled={loading}
              />
              <button
                type="submit"
                disabled={loading || !query.trim()}
                className="bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-300 text-white px-5 py-3 rounded-lg text-sm font-medium transition-colors flex items-center gap-2"
              >
                {loading ? (
                  <>
                    <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                    </svg>
                    Searching…
                  </>
                ) : (
                  <>
                    <Search size={16} />
                    Search
                  </>
                )}
              </button>
            </div>
          </form>

          {/* API Note */}
          {apiNote && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 text-sm text-amber-800">
              {apiNote}
            </div>
          )}

          {/* No Results */}
          {searched && results.length === 0 && (
            <div className="bg-white border border-gray-200 rounded-lg p-8 text-center text-gray-500 shadow-sm">
              <X size={32} className="mx-auto mb-2 text-gray-300" />
              <p className="font-medium">No results found</p>
              <p className="text-xs mt-1">Try a different company name or registration number.</p>
            </div>
          )}

          {/* Results */}
          {results.map((r) => (
            <div key={r.registrationNumber} className="bg-white border border-gray-200 rounded-lg shadow-sm overflow-hidden">
              {/* Header */}
              <div className="p-5 border-b border-gray-100">
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div>
                    <h3 className="text-base font-bold text-gray-900">{r.companyName}</h3>
                    <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1 text-sm text-gray-500">
                      <span className="font-mono">{r.registrationNumber}</span>
                      <span>{r.companyType}</span>
                      <span>Registered: {r.registrationDate}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <StatusBadge status={r.status} />
                    <button
                      onClick={() => handleImport(r)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 rounded-lg transition-colors"
                    >
                      <UserCheck size={13} />
                      Import to FICA
                    </button>
                  </div>
                </div>
              </div>

              {/* Directors */}
              <div className="p-5">
                <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3 flex items-center gap-1.5">
                  <CheckCircle2 size={13} />
                  Directors / Officers
                </h4>
                {r.directors.length === 0 ? (
                  <p className="text-sm text-gray-400 italic">No director information available.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-left text-xs text-gray-400 border-b border-gray-100">
                          <th className="pb-2 font-medium pr-4">Name</th>
                          <th className="pb-2 font-medium pr-4">ID Number</th>
                          <th className="pb-2 font-medium pr-4">Appointment Date</th>
                          <th className="pb-2 font-medium">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-50">
                        {r.directors.map((d, i) => (
                          <tr key={i} className="hover:bg-gray-50">
                            <td className="py-2 pr-4 font-medium text-gray-800">{d.name}</td>
                            <td className="py-2 pr-4 font-mono text-gray-600">{maskId(d.idNumber)}</td>
                            <td className="py-2 pr-4 text-gray-600">{d.appointmentDate}</td>
                            <td className="py-2">
                              {d.status === "Active" ? (
                                <span className="text-xs font-medium text-green-700 bg-green-50 px-2 py-0.5 rounded-full">
                                  Active
                                </span>
                              ) : (
                                <span className="text-xs font-medium text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">
                                  Resigned
                                </span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* Suffix Guide Panel */}
        <div className="lg:col-span-1">
          <div className="bg-white border border-gray-200 rounded-lg shadow-sm p-5 sticky top-4">
            <h3 className="text-sm font-semibold text-gray-700 flex items-center gap-2 mb-3">
              <Building2 size={15} className="text-indigo-500" />
              Registration number suffix guide
            </h3>
            <ul className="space-y-2">
              {SUFFIX_GUIDE.map(({ suffix, label }) => (
                <li key={suffix} className="flex items-center gap-3 text-sm">
                  <span className="font-mono text-xs bg-indigo-50 text-indigo-700 border border-indigo-100 px-2 py-0.5 rounded font-semibold min-w-[44px] text-center">
                    {suffix}
                  </span>
                  <span className="text-gray-600">{label}</span>
                </li>
              ))}
            </ul>
            <p className="mt-4 text-xs text-gray-400 leading-relaxed">
              The suffix appears at the end of the CIPC registration number, e.g. <span className="font-mono">2019/123456/07</span>.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
