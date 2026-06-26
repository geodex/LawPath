import { BookOpen, CheckCircle2, Copy, ExternalLink, FileText, RefreshCw, Search, Sparkles, X } from "lucide-react";
import { FormEvent, useState } from "react";
import { getCorpusDocumentText, indexCorpusSource, searchLegalCorpus } from "./api";
import type { LegalCorpusDocument, LegalCorpusSource, ResearchQuery } from "./types";

const uid = (p: string) => `${p}-${Math.random().toString(36).slice(2, 7).toUpperCase()}`;
const formatDate = (iso: string) => iso ? new Date(iso).toLocaleDateString("en-ZA") : "Never";

// Escape user / DB content before injecting into the standalone judgment HTML
// document. Plain HTML — no React tree, no DOMPurify dependency.
function escapeHtml(s: string) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// Build a self-contained styled HTML document for the full-judgment view.
// Opened via a Blob URL in a new tab so the user gets dedicated scroll,
// browser find, print + save-as-PDF. Closing the tab drops everything.
function buildJudgmentHtml(d: { title: string; citation: string; court: string; year: string; text: string; source: string; sourceUrl: string }) {
  // Laws.Africa's API returns curated extracts (typically 1-5 KB of
  // headnote-style "Issues / Held" text), not the full judgment. Detect
  // that case and surface a prominent CTA to the source URL.
  const isExtract = d.source === "snippet" || (d.text.length > 0 && d.text.length < 12000);
  const isFullText = d.source === "gcs";

  const sourceLabel = isFullText        ? "Full text from cloud archive"
    : isExtract                          ? "Indexed extract — full text on source site"
    : d.source === "none"                ? "Full text not available"
    : "";
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>${escapeHtml(d.title)}</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=Lora:ital,wght@0,500;0,600;1,400&display=swap" rel="stylesheet">
  <style>
    :root {
      --ink: #0d1b17;
      --muted: #5c7569;
      --line: #dce4de;
      --paper: #f3f5f2;
      --panel: #ffffff;
      --surface: #f7f9f7;
      --green: #177a5f;
      --green-dark: #091410;
      --gold: #b8870c;
    }
    * { box-sizing: border-box; }
    html, body { margin: 0; padding: 0; background: var(--paper); color: var(--ink); }
    body {
      font-family: "Inter", system-ui, -apple-system, Segoe UI, Roboto, sans-serif;
      line-height: 1.7;
      font-size: 16px;
    }
    .wrap {
      max-width: 820px;
      margin: 0 auto;
      padding: 36px 28px 80px;
    }
    .brand {
      display: flex;
      align-items: center;
      gap: 10px;
      font-size: 13px;
      color: var(--muted);
      margin-bottom: 14px;
      letter-spacing: 0.05em;
      text-transform: uppercase;
    }
    .brand .dot {
      width: 8px; height: 8px; border-radius: 50%; background: var(--green);
    }
    h1 {
      font-family: "Lora", Georgia, "Times New Roman", serif;
      font-weight: 600;
      font-size: 28px;
      line-height: 1.25;
      letter-spacing: -0.01em;
      margin: 0 0 8px;
      color: var(--ink);
    }
    .meta {
      color: var(--muted);
      font-size: 14px;
      margin-bottom: 18px;
    }
    .meta strong { color: var(--ink); }
    .source-pill {
      display: inline-block;
      padding: 3px 10px;
      background: rgba(23,122,95,0.10);
      color: var(--green-dark);
      border-radius: 999px;
      font-size: 12px;
      font-weight: 600;
      margin-right: 8px;
    }
    .source-pill.snippet { background: rgba(184,135,12,0.12); color: var(--gold); }
    .source-pill.none    { background: var(--surface); color: var(--muted); }
    .ext-link {
      display: inline-block;
      margin-bottom: 22px;
      color: var(--green);
      text-decoration: none;
      font-weight: 600;
      font-size: 14px;
      border-bottom: 1px solid currentColor;
    }
    .ext-link:hover { color: var(--green-dark); }
    .full-text-cta {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 16px;
      margin: 0 0 20px;
      padding: 16px 20px;
      background: linear-gradient(135deg, rgba(23,122,95,0.10) 0%, rgba(23,122,95,0.04) 100%);
      border: 1px solid rgba(23,122,95,0.20);
      border-left: 4px solid var(--green);
      border-radius: 10px;
    }
    .full-text-cta-text {
      font-size: 13.5px;
      color: var(--ink);
      line-height: 1.55;
      max-width: 460px;
    }
    .full-text-cta-text strong { color: var(--green-dark); }
    .full-text-cta-btn {
      flex-shrink: 0;
      padding: 11px 20px;
      background: linear-gradient(160deg, #177a5f 0%, #0f6b52 100%);
      color: #ffffff !important;
      text-decoration: none;
      border-radius: 8px;
      font-weight: 700;
      font-size: 14px;
      box-shadow: 0 2px 8px rgba(23,122,95,0.30);
      transition: transform 0.15s, box-shadow 0.15s;
      white-space: nowrap;
    }
    .full-text-cta-btn:hover {
      transform: translateY(-1px);
      box-shadow: 0 4px 14px rgba(23,122,95,0.40);
    }
    .extract-note {
      font-size: 12.5px;
      color: var(--muted);
      margin: 18px 0 0;
      padding-top: 14px;
      border-top: 1px dashed var(--line);
      line-height: 1.5;
    }
    .extract-note a { color: var(--green); font-weight: 600; }
    hr {
      border: 0;
      border-top: 1px solid var(--line);
      margin: 22px 0 28px;
    }
    .body-text {
      white-space: pre-wrap;
      word-break: break-word;
      font-size: 15.5px;
      line-height: 1.8;
      color: var(--ink);
      background: var(--panel);
      padding: 28px 32px;
      border-radius: 10px;
      box-shadow: 0 1px 3px rgba(0,0,0,0.06);
    }
    .footer {
      margin-top: 28px;
      padding: 14px 16px;
      background: var(--surface);
      border: 1px solid var(--line);
      border-radius: 8px;
      font-size: 12.5px;
      color: var(--muted);
      line-height: 1.55;
    }
    .footer strong { color: var(--ink); }
    @media print {
      body { background: white; font-size: 11pt; }
      .wrap { max-width: none; padding: 0; }
      .body-text { box-shadow: none; padding: 0; border-radius: 0; }
      .source-pill, .ext-link, .footer { display: none; }
    }
  </style>
</head>
<body>
  <div class="wrap">
    <div class="brand"><span class="dot"></span> LawPath SA · Legal Research Corpus</div>
    <h1>${escapeHtml(d.title)}</h1>
    <div class="meta">
      ${d.citation ? `<strong>${escapeHtml(d.citation)}</strong>` : ""}
      ${d.citation && (d.court || d.year) ? " · " : ""}
      ${d.court ? escapeHtml(d.court) : ""}
      ${d.court && d.year ? " · " : ""}
      ${d.year ? escapeHtml(d.year) : ""}
    </div>
    <div>
      ${sourceLabel ? `<span class="source-pill ${d.source === "snippet" ? "snippet" : d.source === "none" ? "none" : ""}">${escapeHtml(sourceLabel)}</span>` : ""}
    </div>
    ${(isExtract && d.sourceUrl) ? `
    <div class="full-text-cta">
      <div class="full-text-cta-text">
        <strong>This is an indexed extract</strong> — typically a headnote with the issues and held. The complete judgment is hosted on the original source site.
      </div>
      <a class="full-text-cta-btn" href="${escapeHtml(d.sourceUrl)}" target="_blank" rel="noopener noreferrer">Read the full judgment ↗</a>
    </div>` : (d.sourceUrl ? `<a class="ext-link" href="${escapeHtml(d.sourceUrl)}" target="_blank" rel="noopener noreferrer">Open original source ↗</a>` : "")}
    <hr>
    <div class="body-text">${escapeHtml(d.text)}</div>
    ${isExtract && d.sourceUrl ? `
    <p class="extract-note">
      The extract above ends where the source data ends. For the complete reasoning, parties, dates and any subsequent treatment, see the full judgment at
      <a href="${escapeHtml(d.sourceUrl)}" target="_blank" rel="noopener noreferrer">${escapeHtml(d.sourceUrl)}</a>.
    </p>` : ""}
    <div class="footer">
      <strong>Attorney review required.</strong> This judgment text is shown for research purposes only. Always verify the citation, holding, and current authority against the official law report before relying on it in a matter.
    </div>
  </div>
</body>
</html>`;
}

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
  const [aiRanked, setAiRanked] = useState(false);
  const [queryExpansion, setQueryExpansion] = useState<string | null>(null);
  const [citationBundle, setCitationBundle] = useState<LegalCorpusDocument[]>([]);
  const [sourceFilter, setSourceFilter] = useState<string>("all");
  const [indexing, setIndexing] = useState<string | null>(null);
  const [expandedDoc, setExpandedDoc] = useState<string | null>(null);
  const [fullTextDoc, setFullTextDoc] = useState<{ title: string; citation: string; text: string; source: string; sourceUrl?: string } | null>(null);
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
      if (res.documents.length === 0) {
        if (res.corpusSize === 0) {
          setAiSummary("The legal corpus is empty on this server. Run the indexer: node server/saflii.js --queries 95 --top-k 20");
        } else if (res.corpusSize != null) {
          setAiSummary(`No matches found in ${res.corpusSize.toLocaleString("en-ZA")} indexed documents. Try a shorter query or different keywords.`);
        } else {
          setAiSummary(res.aiSummary);
        }
      } else {
        setAiSummary(res.aiSummary);
      }
      setAiRanked(Boolean(res.aiRanked));
      setQueryExpansion(res.queryExpansion);
      const q: ResearchQuery = {
        id: uid("RQ"), queryText: searchQuery, resultsCount: res.documents.length,
        aiSummary: res.aiSummary, citations: res.citations, createdAt: new Date().toISOString()
      };
      setQueries(prev => [q, ...prev].slice(0, 10));
      log(`Research query: "${searchQuery}" — ${res.documents.length} results`);
      showToast("success", "Search complete", `${res.documents.length} results found.`);
    } catch (err) {
      // Surface the actual API error so we don't silently mask 403s or 500s
      // behind an empty local result.
      const msg = err instanceof Error ? err.message : "Search failed.";
      setSearchResults([]);
      setAiSummary(`Search failed: ${msg}`);
      showToast("error", "Search failed", msg);
      console.error("[research-db] search failed:", err);
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
      // Build a self-contained HTML document, open it via a Blob URL in a
      // new tab. When the user closes the tab the Blob URL is revoked and
      // nothing persists.
      const html = buildJudgmentHtml({
        title: res.title || doc.title,
        citation: res.citation || doc.citation || "",
        court: doc.court || "",
        year: doc.year ? String(doc.year) : "",
        text: res.text || doc.summary || "Full text not available for this judgment.",
        source: res.source,
        sourceUrl: res.sourceUrl || doc.sourceUrl || ""
      });
      const blob = new Blob([html], { type: "text/html;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const win = window.open(url, "_blank", "noopener,noreferrer");
      if (!win) {
        // Popup blocked — fall back to the in-page modal so the user sees something.
        URL.revokeObjectURL(url);
        setFullTextDoc(res);
        showToast("info", "Popup blocked", "Allow popups for this site to open judgments in a new tab.");
      } else {
        // Revoke the URL after the new tab has had time to load (60s buffer);
        // closing the tab earlier is fine — the browser keeps the document
        // until the tab actually closes.
        setTimeout(() => URL.revokeObjectURL(url), 60_000);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Could not load the judgment.";
      showToast("error", "Full judgment failed", msg);
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
                  {fullTextDoc.source === "gcs" && <span style={{ marginLeft: 8, color: "var(--green)", fontSize: "0.78rem" }}>● Full text from cloud</span>}
                  {fullTextDoc.source === "snippet" && <span style={{ marginLeft: 8, color: "var(--gold)", fontSize: "0.78rem" }}>● Indexed extract</span>}
                </span>
              </div>
              <button className="ghost small" onClick={() => setFullTextDoc(null)}><X size={16} /></button>
            </div>
            {fullTextDoc.sourceUrl && (
              <a href={fullTextDoc.sourceUrl} target="_blank" rel="noopener noreferrer"
                style={{ display: "inline-flex", alignItems: "center", gap: 6, marginBottom: 10, fontSize: "0.84rem", color: "var(--accent)" }}>
                Read full judgment on source site ↗
              </a>
            )}
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
              placeholder="Ask in plain English — e.g. &quot;Can a seller hide a leaking roof using voetstoots?&quot; AI understands legal concepts and SA Acts."
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
            <p className="eyebrow">
              <Sparkles size={14} style={{ display: "inline", marginRight: 4 }} />
              AI Research Analysis
              {aiRanked && <span className="ai-ranked-badge">AI-ranked</span>}
            </p>
            <p style={{ margin: 0, fontSize: "0.92rem" }}>{aiSummary}</p>
            {queryExpansion && (
              <details className="query-expansion-details">
                <summary>Search terms used</summary>
                <code>{queryExpansion}</code>
              </details>
            )}
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
                    {doc.relevanceReason && (
                      <div className="corpus-doc-relevance">
                        <Sparkles size={11} /> {doc.relevanceReason}
                      </div>
                    )}
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
