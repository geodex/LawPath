import { useState } from "react";
import { Building2, FileSearch, ExternalLink, Loader2, ShieldCheck, UserSearch } from "lucide-react";
import { searchworksCall } from "./api";

export const DEEDS_OFFICES: { value: string; label: string }[] = [
  { value: "1",  label: "Bloemfontein" },
  { value: "2",  label: "Cape Town" },
  { value: "3",  label: "Johannesburg" },
  { value: "4",  label: "Kimberley" },
  { value: "5",  label: "King William's Town" },
  { value: "6",  label: "Pietermaritzburg" },
  { value: "7",  label: "Pretoria" },
  { value: "8",  label: "Vryburg" },
  { value: "9",  label: "Umtata" },
  { value: "11", label: "Mpumalanga" },
  { value: "12", label: "Limpopo" }
];

type SearchType = "erf" | "person" | "document" | "dots";

type Response = Record<string, unknown> & {
  ResponseMessage?: string;
  PDFCopyURL?: string;
  ResponseObject?: Record<string, unknown>;
};

interface Props {
  // Optional matter-level defaults so the form is pre-populated when launched
  // from a Conveyancing or Litigation matter detail view.
  defaultErfNumber?: string;
  defaultTownship?: string;
  defaultDeedsOffice?: string;
  matterRef?: string;
  showToast: (type: "success" | "error" | "info", title: string, msg: string) => void;
  log?: (msg: string) => void;
}

export function SearchWorksPanel({
  defaultErfNumber,
  defaultTownship,
  defaultDeedsOffice,
  matterRef,
  showToast,
  log
}: Props) {
  const [searchType, setSearchType] = useState<SearchType>("erf");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<Response | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [erfForm, setErfForm] = useState({
    deedsOffice:   defaultDeedsOffice || "3",
    township:      defaultTownship    || "",
    erfNumber:     defaultErfNumber   || "",
    portionNumber: ""
  });
  const [personForm, setPersonForm] = useState({
    deedsOffice: defaultDeedsOffice || "3",
    surname:     "",
    firstname:   "",
    idNumber:    ""
  });
  const [docForm, setDocForm] = useState({
    deedsOffice:    defaultDeedsOffice || "3",
    documentNumber: ""
  });
  const [dotsForm, setDotsForm] = useState({
    deedsOffice: defaultDeedsOffice || "3",
    barcode:     ""
  });

  function reference() {
    return matterRef ? `${matterRef}-${searchType}` : `lawpath-${searchType}`;
  }

  async function runSearch() {
    setLoading(true);
    setResult(null);
    setErrorMsg(null);
    try {
      let data: Response;
      switch (searchType) {
        case "erf":
          data = await searchworksCall<Response>("deeds-property-erf", { reference: reference(), ...erfForm });
          break;
        case "person":
          data = await searchworksCall<Response>("deeds-person", { reference: reference(), ...personForm });
          break;
        case "document":
          data = await searchworksCall<Response>("deeds-document", { reference: reference(), ...docForm });
          break;
        case "dots":
          data = await searchworksCall<Response>("dots-barcode", { reference: reference(), ...dotsForm });
          break;
      }
      setResult(data);
      const responseMessage = String(data.ResponseMessage || "");
      const isNotFound = /not\s*found/i.test(responseMessage);
      if (isNotFound) {
        showToast("info", "SearchWorks", "No matching record found at the Deeds Office.");
      } else {
        showToast("success", "SearchWorks", "Search complete — see results below.");
        log?.(`SearchWorks ${searchType} search complete for ${matterRef || "lawpath"}`);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      setErrorMsg(msg);
      showToast("error", "SearchWorks failed", msg);
    } finally {
      setLoading(false);
    }
  }

  const searchTabs: { key: SearchType; label: string; icon: React.ElementType }[] = [
    { key: "erf",      label: "Property by Erf",   icon: Building2 },
    { key: "person",   label: "Person",            icon: UserSearch },
    { key: "document", label: "Document number",   icon: FileSearch },
    { key: "dots",     label: "DOTS tracking",     icon: ShieldCheck }
  ];

  return (
    <div className="sw-panel">
      <div className="sw-tabs">
        {searchTabs.map(t => {
          const Icon = t.icon;
          return (
            <button
              key={t.key}
              className={`sw-tab${searchType === t.key ? " active" : ""}`}
              onClick={() => { setSearchType(t.key); setResult(null); setErrorMsg(null); }}
            >
              <Icon size={14} />
              <span>{t.label}</span>
            </button>
          );
        })}
      </div>

      <div className="sw-form">
        {searchType === "erf" && (
          <div className="sw-form-grid">
            <label>Deeds Office<select value={erfForm.deedsOffice} onChange={e => setErfForm({ ...erfForm, deedsOffice: e.target.value })}>
              {DEEDS_OFFICES.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select></label>
            <label>Township<input value={erfForm.township} onChange={e => setErfForm({ ...erfForm, township: e.target.value })} placeholder="e.g. Sandown" /></label>
            <label>Erf number<input value={erfForm.erfNumber} onChange={e => setErfForm({ ...erfForm, erfNumber: e.target.value })} placeholder="e.g. 1234" /></label>
            <label>Portion (optional)<input value={erfForm.portionNumber} onChange={e => setErfForm({ ...erfForm, portionNumber: e.target.value })} placeholder="e.g. 0" /></label>
          </div>
        )}
        {searchType === "person" && (
          <div className="sw-form-grid">
            <label>Deeds Office<select value={personForm.deedsOffice} onChange={e => setPersonForm({ ...personForm, deedsOffice: e.target.value })}>
              {DEEDS_OFFICES.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select></label>
            <label>Surname<input value={personForm.surname} onChange={e => setPersonForm({ ...personForm, surname: e.target.value })} placeholder="Smith" /></label>
            <label>First name<input value={personForm.firstname} onChange={e => setPersonForm({ ...personForm, firstname: e.target.value })} placeholder="Jane" /></label>
            <label>ID number<input value={personForm.idNumber} onChange={e => setPersonForm({ ...personForm, idNumber: e.target.value })} placeholder="13-digit SA ID" maxLength={13} /></label>
          </div>
        )}
        {searchType === "document" && (
          <div className="sw-form-grid">
            <label>Deeds Office<select value={docForm.deedsOffice} onChange={e => setDocForm({ ...docForm, deedsOffice: e.target.value })}>
              {DEEDS_OFFICES.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select></label>
            <label>Document number<input value={docForm.documentNumber} onChange={e => setDocForm({ ...docForm, documentNumber: e.target.value })} placeholder="e.g. T12345/2024" /></label>
          </div>
        )}
        {searchType === "dots" && (
          <div className="sw-form-grid">
            <label>Deeds Office<select value={dotsForm.deedsOffice} onChange={e => setDotsForm({ ...dotsForm, deedsOffice: e.target.value })}>
              {DEEDS_OFFICES.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select></label>
            <label>Barcode<input value={dotsForm.barcode} onChange={e => setDotsForm({ ...dotsForm, barcode: e.target.value })} placeholder="Lodgement barcode" /></label>
          </div>
        )}

        <div className="sw-actions">
          <button className="primary small" onClick={runSearch} disabled={loading}>
            {loading
              ? <><Loader2 size={13} style={{ animation: "spin 0.8s linear infinite" }} /> Searching</>
              : "Run SearchWorks query"}
          </button>
        </div>
      </div>

      {errorMsg && <div className="sw-error">{errorMsg}</div>}

      {result && <SearchWorksResultView result={result} />}
    </div>
  );
}

function SearchWorksResultView({ result }: { result: Response }) {
  const message = String(result.ResponseMessage || "");
  const isNotFound = /not\s*found/i.test(message);
  const pdfUrl = typeof result.PDFCopyURL === "string" ? result.PDFCopyURL : null;
  const info = (result.ResponseObject as Record<string, any> | undefined)?.SearchInformation as Record<string, any> | undefined;

  return (
    <div className="sw-result">
      <div className="sw-result-head">
        <div className={`sw-status ${isNotFound ? "sw-status-empty" : "sw-status-ok"}`}>
          {isNotFound ? "No record found" : (message || "Result returned")}
        </div>
        {pdfUrl && (
          <a href={pdfUrl} target="_blank" rel="noreferrer" className="ghost small">
            <ExternalLink size={13} /> Open PDF report
          </a>
        )}
      </div>

      {info && (
        <div className="sw-meta-grid">
          {info.SearchTypeDescription && <div><dt>Search type</dt><dd>{info.SearchTypeDescription}</dd></div>}
          {info.SearchDescription     && <div><dt>Query</dt><dd>{info.SearchDescription}</dd></div>}
          {info.Reference             && <div><dt>Reference</dt><dd>{info.Reference}</dd></div>}
          {info.ReportDate            && <div><dt>Date</dt><dd>{info.ReportDate}</dd></div>}
          {info.SearchToken           && <div><dt>SearchWorks token</dt><dd><code>{info.SearchToken}</code></dd></div>}
          {info.SearchUserName        && <div><dt>Run by</dt><dd>{info.SearchUserName}</dd></div>}
        </div>
      )}

      {/* Show any extra ResponseObject fields beyond SearchInformation */}
      {result.ResponseObject && (() => {
        const ro = result.ResponseObject as Record<string, any>;
        const extras = Object.entries(ro).filter(([k]) => k !== "SearchInformation");
        if (!extras.length) return null;
        return (
          <details className="sw-extras">
            <summary>Raw response data ({extras.length} additional field{extras.length === 1 ? "" : "s"})</summary>
            <pre>{JSON.stringify(Object.fromEntries(extras), null, 2)}</pre>
          </details>
        );
      })()}
    </div>
  );
}
