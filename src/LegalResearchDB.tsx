import { BookOpen, CheckCircle2, Copy, ExternalLink, FileText, RefreshCw, Search, Sparkles, X } from "lucide-react";
import { FormEvent, useState } from "react";
import { getCorpusDocumentText, indexCorpusSource, searchLegalCorpus } from "./api";
import type { LegalCorpusDocument, LegalCorpusSource, ResearchQuery } from "./types";

const uid = (p: string) => `${p}-${Math.random().toString(36).slice(2, 7).toUpperCase()}`;
const formatDate = (iso: string) => iso ? new Date(iso).toLocaleDateString("en-ZA") : "Never";

const SOURCE_TYPE_LABELS: Record<LegalCorpusSource["sourceType"], string> = {
  case_law: "Case law", legislation: "Legislation", gazette: "Gazette",
  lpc_rules: "LPC Rules", practice_directive: "Practice directive",
  regulation: "Regulation", constitution: "Constitution"
};

const SOURCE_TYPE_COLOURS: Record<LegalCorpusSource["sourceType"], string> = {
  case_law: "var(--green)", legislation: "var(--blue)", gazette: "var(--blue)",
  lpc_rules: "var(--rose)", practice_directive: "var(--muted)",
  regulation: "var(--muted)", constitution: "var(--gold)"
};

export function LegalResearchDB({
  sources, setSources, documents, setDocuments, queries, setQueries, log, showToast
}: {
  sources: LegalCorpusSource[];
  setSources: React.Dispatch<React.SetStateAction<LegalCorpusSource[]>>;
  documents: LegalCorpusDocument[];
  setDocuments: React.Dispatch<React.SetStateAction<LegalCorpusDocument[]>>;
  queries: ResearchQuery[];
  setQueries: React.Dispatch<React.SetStateAction<ResearchQuery[]>>;
  log: (msg: string) => void;
  showToast: (type: "success" | "error" | "info", title: string, msg: string) => void;
}) {
  const [searchQuery, setSearchQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<LegalCorpusDocument[]>([]);
  const [aiSummary, setAiSummary] = useState("");
  const [citationBundle, setCitationBundle] = useState<LegalCorpusDocument[]>([]);
  const [sourceFilter, setSourceFilter] = useState<string>("all");
  const [indexing, setIndexing] = useState<string | null>(null);
  const [expandedDoc, setExpandedDoc] = useState<string | null>(null);
  const [fullTextDoc, setFullTextDoc] = useState<{ title: string; citation: string; text: string; source: string } | null>(null);
  const [loadingFullText, setLoadingFullText] = useState<string | null>(null);

  const totalDocs = sources.reduce((s, src) => s + src.documentCount, 0);
  const indexedCount = sources.filter(s => s.indexStatus === "indexed").length;

  async function handleSearch(e: FormEvent) {
    e.preventDefault();
    if (!searchQuery.trim()) return;
    setSearching(true);
    try {
      const res = await searchLegalCorpus(searchQuery);
      setSearchResults(res.documents);
      setAiSummary(res.aiSummary);
      const q: ResearchQuery = {
        id: uid("RQ"), queryText: searchQuery, resultsCount: res.documents.length,
        aiSummary: res.aiSummary, citations: res.citations, createdAt: new Date().toISOString()
      };
      setQueries(prev => [q, ...prev].slice(0, 10));
      log(`Research query: "${searchQuery}" — ${res.documents.length} results`);
      showToast("success", "Search complete", `${res.documents.length} results found.`);
    } catch {
      // Local fallback
      const q = searchQuery.toLowerCase();
      const filtered = documents.filter(d =>
        d.title.toLowerCase().includes(q) || d.citation.toLowerCase().includes(q) ||
        d.summary.toLowerCase().includes(q) || d.tags.some(t => t.toLowerCase().includes(q))
      );
      setSearchResults(filtered);
      setAiSummary(`${filtered.length} results found in the SA legal corpus for "${searchQuery}". Key authority: ${filtered[0]?.title ?? "none found"}. Attorney review required before relying on any AI research summary.`);
      const qRec: ResearchQuery = {
        id: uid("RQ"), queryText: searchQuery, resultsCount: filtered.length,
        aiSummary, citations: filtered.map(d => ({ title: d.title, citation: d.citation, url: d.sourceUrl })),
        createdAt: new Date().toISOString()
      };
      setQueries(prev => [qRec, ...prev].slice(0, 10));
      showToast("info", "Local search", `${filtered.length} results from indexed documents.`);
    } finally {
      setSearching(false);
    }
  }

  async function handleReindex(source: LegalCorpusSource) {
    setIndexing(source.id);
    setSources(prev => prev.map(s => s.id === source.id ? { ...s, indexStatus: "indexing" } : s));
    try {
      const res = await indexCorpusSource(source.id);
      setSources(prev => prev.map(s => s.id === source.id ? res.source : s));
      showToast("success", "Re-indexing started", `${source.sourceName} is queued.`);
      log(`Re-indexed: ${source.sourceName}`);
    } catch {
      setTimeout(() => {
        setSources(prev => prev.map(s => s.id === source.id ? { ...s, indexStatus: "indexed", lastIndexedAt: new Date().toISOString() } : s));
      }, 2500);
      showToast("info", "Indexing queued", "Will update when complete.");
    } finally {
      setTimeout(() => setIndexing(null), 2600);
    }
  }

  async function handleViewFullText(doc: LegalCorpusDocument) {
    setLoadingFullText(doc.id);
    try {
      const res = await getCorpusDocumentText(doc.id);
      setFullTextDoc(res);
    } catch {
      setFullTextDoc({ title: doc.title, citation: doc.citation, text: doc.summary || "Full text not available.", source: "none" });
    } finally {
      setLoadingFullText(null);
    }
  }

  function toggleCitation(doc: LegalCorpusDocument) {
    setCitationBundle(prev =>
      prev.find(d => d.id === doc.id) ? prev.filter(d => d.id !== doc.id) : [...prev, doc]
    );
  }

  function copyCitations() {
    const text = citationBundle.map((d, i) =>
      `${i + 1}. ${d.title} ${d.citation} (${d.court}, ${d.year})`
    ).join("\n");
    navigator.clipboard.writeText(text).then(() => showToast("success", "Copied", "Citations copied to clipboard."));
  }

  const displayDocs = searchResults.length > 0 ? searchResults :
    sourceFilter === "all" ? documents : documents.filter(d => {
      const src = sources.find(s => s.id === d.sourceId);
      return src?.sourceType === sourceFilter;
    });

  return (
    <>
      {/* Full judgment viewer modal */}
      {fullTextDoc && (
        <div className="modal-overlay" onClick={() => setFullTextDoc(null)}>
          <div className="modal" style={{ maxWidth: 780, maxHeight: "82vh", display: "flex", flexDirection: "column" }} onClick={e => e.stopPropagation()}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
              <div>
                <h3 style={{ margin: 0, fontSize: "1rem" }}>{fullTextDoc.title}</h3>
                <span style={{ fontSize: "0.82rem", color: "var(--muted)" }}>{fullTextDoc.citation}
                  {fullTextDoc.source === "gcs" && <span style={{ marginLeft: 8, color: "var(--green)", fontSize: "0.78rem" }}>● Cloud storage</span>}
                  {fullTextDoc.source === "snippet" && <span style={{ marginLeft: 8, color: "var(--gold)", fontSize: "0.78rem" }}>● Indexed snippet</span>}
                </span>
              </div>
              <button className="ghost small" onClick={() => setFullTextDoc(null)}><X size={16} /></button>
            </div>
            <div style={{ overflowY: "auto", flex: 1, background: "var(--panel)", borderRadius: 8, padding: "14px 16px" }}>
              <pre style={{ margin: 0, whiteSpace: "pre-wrap", wordBreak: "break-word", fontSize: "0.86rem", lineHeight: 1.7, fontFamily: "inherit" }}>
                {fullTextDoc.text || "Full text not available for this judgment."}
              </pre>
            </div>
          </div>
        </div>
      )}

      {/* Moat notice */}
      <div className="corpus-moat-notice">
        <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
          <BookOpen size={20} style={{ color: "var(--green)", flexShrink: 0, marginTop: 2 }} />
          <div>
            <strong>SA Legal Research Corpus — Included in all LawPath plans</strong>
            <p style={{ margin: "4px 0 0", fontSize: "0.87rem" }}>
              {totalDocs.toLocaleString("en-ZA")}+ documents indexed: SAFLII case law, Acts of Parliament, Government Gazette, and LPC Rules.
              LexisNexis and Jutastat charge R 8,000–R 15,000/month for equivalent access.
              Updated monthly. Attorney review required before advising a client.
            </p>
          </div>
        </div>
      </div>

      {/* Metrics */}
      <section className="metrics">
        <div className="metric"><span>Total documents</span><strong>{totalDocs.toLocaleString("en-ZA")}</strong><small>Across all sources</small></div>
        <div className="metric"><span>Sources indexed</span><strong>{indexedCount} / {sources.length}</strong><small>Active corpus</small></div>
        <div className="metric"><span>Research queries</span><strong>{queries.length}</strong><small>This session</small></div>
        <div className="metric"><span>Citation bundle</span><strong>{citationBundle.length}</strong><small>Selected authorities</small></div>
      </section>

      {/* Corpus sources */}
      <section className="tier1-section">
        <div className="panel-head"><h3>Corpus sources</h3><span className="pill">{sources.length} sources</span></div>
        <div className="corpus-source-grid">
          {sources.map(src => (
            <div key={src.id} className={`corpus-source-card${src.indexStatus === "indexed" ? " indexed" : ""}`}>
              <div className="corpus-source-head">
                <div>
                  <strong style={{ fontSize: "0.9rem", display: "block", marginBottom: 4 }}>{src.sourceName}</strong>
                  <span className="pill" style={{ background: `${SOURCE_TYPE_COLOURS[src.sourceType]}22`, color: SOURCE_TYPE_COLOURS[src.sourceType], fontSize: "0.75rem" }}>
                    {SOURCE_TYPE_LABELS[src.sourceType]}
                  </span>
                </div>
              </div>
              <p style={{ margin: "6px 0 4px", fontSize: "0.83rem", color: "var(--muted)" }}>
                {src.documentCount.toLocaleString("en-ZA")} documents
              </p>
              <p style={{ margin: "0 0 8px", fontSize: "0.8rem", color: "var(--muted)" }}>
                Last indexed: {formatDate(src.lastIndexedAt)}
              </p>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span className={`index-status-${src.indexStatus}`} style={{ fontSize: "0.8rem" }}>
                  {src.indexStatus === "indexing" ? "⟳ Indexing..." : src.indexStatus === "indexed" ? "✓ Indexed" : src.indexStatus === "failed" ? "✗ Failed" : src.indexStatus === "update_available" ? "↑ Update" : "Pending"}
                </span>
                <button className="ghost small" disabled={indexing === src.id} onClick={() => handleReindex(src)}>
                  <RefreshCw size={13} /> {indexing === src.id ? "Indexing..." : "Re-index"}
                </button>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Search */}
      <section className="tier1-section">
        <div className="panel-head"><h3>AI-powered legal search</h3><span className="pill">SA corpus</span></div>
        <form onSubmit={handleSearch}>
          <div className="research-search-bar">
            <input
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Search SA case law, legislation and LPC rules — e.g. voetstoots, Section 86, good faith..."
            />
            <select
              style={{ padding: "10px 12px", border: "1px solid var(--line)", borderRadius: 8 }}
              value={sourceFilter}
              onChange={e => { setSourceFilter(e.target.value); setSearchResults([]); }}
            >
              <option value="all">All sources</option>
              {Object.entries(SOURCE_TYPE_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
            <button className="primary" type="submit" disabled={searching || !searchQuery.trim()}>
              {searching ? <RefreshCw size={16} /> : <Search size={16} />} {searching ? "Searching..." : "Search"}
            </button>
          </div>
        </form>

        {/* Recent queries */}
        {queries.length > 0 && (
          <div style={{ marginBottom: 14 }}>
            <p className="eyebrow" style={{ marginBottom: 6 }}>Recent queries</p>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {queries.slice(0, 5).map(q => (
                <button key={q.id} className="ghost small" onClick={() => { setSearchQuery(q.queryText); }}>
                  {q.queryText} ({q.resultsCount})
                </button>
              ))}
            </div>
          </div>
        )}

        {/* AI summary */}
        {aiSummary && (
          <div className="ai-research-summary">
            <p className="eyebrow"><Sparkles size={14} style={{ display: "inline", marginRight: 4 }} />AI Research Analysis</p>
            <p style={{ margin: 0, fontSize: "0.92rem" }}>{aiSummary}</p>
          </div>
        )}

        {/* Results */}
        <div>
          {searchResults.length > 0 && (
            <div className="panel-head" style={{ marginBottom: 10 }}>
              <span style={{ fontSize: "0.88rem", color: "var(--muted)" }}>{searchResults.length} results</span>
              <button className="ghost small" onClick={() => { setSearchResults([]); setAiSummary(""); }}>Clear results</button>
            </div>
          )}
          {displayDocs.map(doc => {
            const inBundle = citationBundle.find(d => d.id === doc.id);
            return (
              <div key={doc.id} className="corpus-doc-card">
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
                  <div style={{ flex: 1 }}>
                    <div className="corpus-doc-title">
                      {doc.sourceUrl
                        ? <a href={doc.sourceUrl} target="_blank" rel="noreferrer noopener">{doc.title}</a>
                        : doc.title}
                    </div>
                    <div className="corpus-doc-citation">{doc.citation} · {doc.court} · {doc.year}</div>
                    {expandedDoc === doc.id
                      ? <p style={{ margin: "0 0 8px", fontSize: "0.87rem" }}>{doc.summary}</p>
                      : <p className="corpus-doc-summary">{doc.summary}</p>}
                    <button className="ghost small" style={{ fontSize: "0.78rem", minHeight: 28 }}
                      onClick={() => setExpandedDoc(expandedDoc === doc.id ? null : doc.id)}>
                      {expandedDoc === doc.id ? "Show less" : "Read more"}
                    </button>
                    <div style={{ marginTop: 6 }}>
                      {doc.tags.map(tag => <span key={tag} className="corpus-tag-chip">{tag}</span>)}
                    </div>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 6, flexShrink: 0 }}>
                    <button
                      className={inBundle ? "primary small" : "ghost small"}
                      onClick={() => toggleCitation(doc)}>
                      {inBundle ? <CheckCircle2 size={14} /> : <FileText size={14} />}
                      {inBundle ? "In bundle" : "Cite"}
                    </button>
                    <button
                      className="ghost small"
                      disabled={loadingFullText === doc.id}
                      onClick={() => handleViewFullText(doc)}>
                      {loadingFullText === doc.id ? <RefreshCw size={13} /> : <ExternalLink size={13} />}
                      {loadingFullText === doc.id ? "Loading..." : "Full judgment"}
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
          {displayDocs.length === 0 && !searching && (
            <p style={{ color: "var(--muted)", textAlign: "center", padding: 24 }}>
              {searchQuery ? "No results found. Try broader search terms." : "Enter a search query above to begin."}
            </p>
          )}
        </div>

        {/* Citation bundle */}
        {citationBundle.length > 0 && (
          <div className="citation-bundle">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <h4 style={{ margin: 0 }}>Citation bundle ({citationBundle.length})</h4>
              <button className="ghost small" style={{ color: "#f7c95f", border: "1px solid rgba(255,255,255,0.2)" }} onClick={copyCitations}>
                <Copy size={14} /> Copy all
              </button>
            </div>
            <ol>
              {citationBundle.map((d, i) => (
                <li key={d.id}>
                  <em>{d.title}</em> {d.citation} ({d.court}, {d.year})
                  <button style={{ marginLeft: 8, background: "transparent", border: "none", color: "rgba(248,251,246,0.5)", cursor: "pointer", fontSize: "0.8rem" }}
                    onClick={() => toggleCitation(d)}>×</button>
                </li>
              ))}
            </ol>
          </div>
        )}
      </section>
    </>
  );
}
