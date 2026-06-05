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

const uid = (p: string) => `${p}-${Math.random().toString(36).slice(2, 7).toUpperCase()}`;
const maxBytes = 8 * 1024 * 1024;

async function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

function StatusBadge({ status }: { status: DocumentAnalysis["analysisStatus"] }) {
  if (status === "Complete") {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800 border border-green-200">
        <CheckCircle2 size={11} />
        Complete
      </span>
    );
  }
  if (status === "Failed") {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-rose-100 text-rose-800 border border-rose-200">
        Failed
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800 border border-blue-200">
      <svg className="animate-spin h-3 w-3" fill="none" viewBox="0 0 24 24">
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
      </svg>
      {status}
    </span>
  );
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
    <div className="space-y-5">
      {/* Hero Notice */}
      <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-4 flex gap-3">
        <Sparkles className="text-indigo-600 mt-0.5 shrink-0" size={20} />
        <p className="text-sm text-indigo-800 leading-relaxed">
          Upload any South African contract, deed, order or agreement. The AI extracts parties, key dates, obligations
          and flags SA-specific legal risks (voetstoots, CPA cooling-off, NCA compliance, POPIA obligations).{" "}
          <span className="font-semibold">Attorney review required before acting on any AI analysis.</span>
        </p>
      </div>

      {/* Metrics */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "Total documents", value: analyses.length, icon: <FileText size={16} className="text-gray-500" /> },
          { label: "Complete analyses", value: completeCount, icon: <CheckCircle2 size={16} className="text-green-500" /> },
          { label: "Risk flags found", value: totalRiskFlags, icon: <AlertTriangle size={16} className="text-rose-500" /> },
          { label: "SA law flags found", value: totalSaFlags, icon: <Scale size={16} className="text-amber-500" /> },
        ].map(({ label, value, icon }) => (
          <div key={label} className="bg-white border border-gray-200 rounded-lg p-4 shadow-sm flex items-center gap-3">
            <div>{icon}</div>
            <div>
              <div className="text-xl font-bold text-gray-900">{value}</div>
              <div className="text-xs text-gray-500">{label}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Upload Form */}
      <form onSubmit={handleSubmit} className="bg-white border border-gray-200 rounded-lg p-5 shadow-sm space-y-4">
        <h2 className="text-base font-semibold text-gray-800 flex items-center gap-2">
          <Upload size={17} className="text-indigo-600" />
          Analyse a document
        </h2>

        <div className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              Document file <span className="text-gray-400 font-normal">(PDF, DOCX, TXT, MD — max 8 MB)</span>
            </label>
            <input
              id="doc-file-input"
              type="file"
              accept=".pdf,.docx,.txt,.md"
              disabled={uploading}
              onChange={(e) => setSelectedFile(e.target.files?.[0] ?? null)}
              className="block w-full text-sm text-gray-700 file:mr-3 file:py-1.5 file:px-3 file:rounded-md file:border-0 file:text-xs file:font-medium file:bg-indigo-50 file:text-indigo-700 hover:file:bg-indigo-100 cursor-pointer border border-gray-300 rounded-lg py-1.5 px-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              Matter reference <span className="text-gray-400 font-normal">(optional)</span>
            </label>
            <input
              type="text"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent placeholder-gray-400"
              placeholder="e.g. MAT-2024-001"
              value={matterRef}
              onChange={(e) => setMatterRef(e.target.value)}
              disabled={uploading}
            />
          </div>
        </div>

        <button
          type="submit"
          disabled={uploading || !selectedFile}
          className="inline-flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-300 text-white px-5 py-2.5 rounded-lg text-sm font-medium transition-colors"
        >
          {uploading ? (
            <>
              <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
              </svg>
              Analysing…
            </>
          ) : (
            <>
              <FileSearch size={16} />
              Analyse document
            </>
          )}
        </button>
      </form>

      {/* Analysis Register */}
      {analyses.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-lg shadow-sm overflow-hidden">
          <div className="px-5 py-3 border-b border-gray-100 bg-gray-50">
            <h2 className="text-sm font-semibold text-gray-700 flex items-center gap-2">
              <FileText size={15} className="text-indigo-500" />
              Analysis register
            </h2>
          </div>

          <div className="divide-y divide-gray-100">
            {analyses.map((a) => (
              <div key={a.id}>
                {/* Row */}
                <button
                  onClick={() => toggleExpand(a.id)}
                  className="w-full text-left px-5 py-3 hover:bg-gray-50 transition-colors flex items-center gap-4"
                >
                  <FileText size={16} className="text-indigo-400 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-sm text-gray-800 truncate">{a.fileName}</div>
                    <div className="text-xs text-gray-400 mt-0.5">
                      {a.documentType || "Detecting…"} &middot;{" "}
                      {a.analysedAt ? new Date(a.analysedAt).toLocaleString() : "—"}
                    </div>
                  </div>
                  <StatusBadge status={a.analysisStatus} />
                  <span className="text-xs text-gray-400 ml-2">{expandedId === a.id ? "▲" : "▼"}</span>
                </button>

                {/* Expanded detail */}
                {expandedId === a.id && (
                  <div className="px-5 pb-5 pt-2 bg-gray-50 border-t border-gray-100 space-y-5">
                    {/* Summary */}
                    {a.summary && (
                      <div>
                        <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
                          <Sparkles size={12} />
                          Summary
                        </h4>
                        <p className="text-sm text-gray-700 leading-relaxed">{a.summary}</p>
                      </div>
                    )}

                    {/* Parties */}
                    {a.parties.length > 0 && (
                      <div>
                        <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
                          Parties detected
                        </h4>
                        <div className="flex flex-wrap gap-2">
                          {a.parties.map((p, i) => (
                            <span
                              key={i}
                              className="px-2.5 py-1 bg-indigo-50 border border-indigo-100 text-indigo-800 text-xs rounded-full font-medium"
                            >
                              {p}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Key Dates */}
                    {a.keyDates.length > 0 && (
                      <div>
                        <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
                          Key dates
                        </h4>
                        <table className="w-full text-sm border border-gray-200 rounded-lg overflow-hidden">
                          <thead className="bg-gray-100">
                            <tr>
                              <th className="text-left px-3 py-2 text-xs font-medium text-gray-500">Event</th>
                              <th className="text-left px-3 py-2 text-xs font-medium text-gray-500">Date</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-100 bg-white">
                            {a.keyDates.map((kd, i) => (
                              <tr key={i} className="hover:bg-gray-50">
                                <td className="px-3 py-2 text-gray-700">{kd.label}</td>
                                <td className="px-3 py-2 text-gray-600 font-mono text-xs">{kd.date}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}

                    {/* Obligations */}
                    {a.obligations.length > 0 && (
                      <div>
                        <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
                          Obligations
                        </h4>
                        <ol className="space-y-1 list-decimal list-inside text-sm text-gray-700">
                          {a.obligations.map((o, i) => (
                            <li key={i} className="leading-relaxed">
                              {o}
                            </li>
                          ))}
                        </ol>
                      </div>
                    )}

                    {/* Risk Flags */}
                    {a.riskFlags.length > 0 && (
                      <div>
                        <h4 className="text-xs font-semibold text-rose-600 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                          <AlertTriangle size={12} />
                          Risk flags
                        </h4>
                        <ul className="space-y-2">
                          {a.riskFlags.map((flag, i) => (
                            <li
                              key={i}
                              className="risk-flag-item flex items-start gap-2 bg-rose-50 border border-rose-100 rounded-lg px-3 py-2 text-sm text-rose-800"
                            >
                              <span className="mt-0.5 shrink-0">⚠</span>
                              <span>{flag}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {/* SA Law Flags */}
                    {a.saLawFlags.length > 0 && (
                      <div>
                        <h4 className="text-xs font-semibold text-amber-700 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                          <Scale size={12} />
                          SA law flags
                        </h4>
                        <ul className="space-y-2">
                          {a.saLawFlags.map((flag, i) => (
                            <li
                              key={i}
                              className="flex items-start gap-2 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2 text-sm text-amber-800"
                            >
                              <span className="mt-0.5 shrink-0">⚖</span>
                              <span>{flag}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {/* Attorney review watermark */}
                    <div className="border-t border-gray-200 pt-4">
                      <p className="text-xs text-gray-400 italic text-center">
                        This analysis is AI-generated. All findings must be verified by a qualified attorney before
                        advising a client or taking any action.
                      </p>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {analyses.length === 0 && (
        <div className="bg-white border border-gray-200 rounded-lg p-10 text-center text-gray-400 shadow-sm">
          <FileSearch size={36} className="mx-auto mb-3 text-gray-300" />
          <p className="font-medium text-gray-500">No documents analysed yet</p>
          <p className="text-sm mt-1">Upload a document above to begin AI-powered analysis.</p>
        </div>
      )}
    </div>
  );
}
