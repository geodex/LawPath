import { Building2, CheckCircle2, ChevronDown, ChevronRight, FileSearch, Loader2, MapPin, Plus, ShieldCheck } from "lucide-react";
import { FormEvent, useCallback, useRef, useState } from "react";
import { advanceConveyancingStage, callVerifyNow, createConveyancingMatter, getLightstonePropertyBundle, getLightstoneSectionalUnits, searchLightstoneAddress, updateConveyancingClearances } from "./api";
import type { LightstoneAddress, LightstonePropertyBundle, LightstoneSectionalUnit } from "./api";
import type { ConveyancingMatter, ConveyancingStage } from "./types";
import { SearchWorksPanel } from "./SearchWorksPanel";

const money = (cents: number) => new Intl.NumberFormat("en-ZA", { style: "currency", currency: "ZAR", maximumFractionDigits: 0 }).format(cents / 100);
const today = () => new Date().toISOString().slice(0, 10);
const uid = (p: string) => `${p}-${Math.random().toString(36).slice(2, 7).toUpperCase()}`;

const ALL_STAGES: ConveyancingStage[] = [
  "instruction_received", "fica_verification", "bond_cancellation_instructions",
  "draft_deeds", "sars_transfer_duty", "rates_clearance", "levy_clearance",
  "deeds_lodgement", "deeds_registration", "completed"
];

const STAGE_LABELS: Record<ConveyancingStage, string> = {
  instruction_received: "Instruction", fica_verification: "FICA",
  bond_cancellation_instructions: "Bond cancel", draft_deeds: "Draft deeds",
  sars_transfer_duty: "SARS duty", rates_clearance: "Rates",
  levy_clearance: "Levy", deeds_lodgement: "Lodgement",
  deeds_registration: "Registration", completed: "Complete"
};

const MATTER_TYPE_LABELS: Record<ConveyancingMatter["matterType"], string> = {
  transfer: "Transfer", bond_registration: "Bond registration",
  bond_cancellation: "Bond cancellation", sectional_title: "Sectional title",
  notarial_bond: "Notarial bond"
};

const CLEARANCE_STATUSES = ["Not requested", "Requested", "Received", "Expired"] as const;
const FICA_STATUSES = ["Pending", "In Progress", "Compliant"] as const;

// ─── VerifyNow Due Diligence ──────────────────────────────────────────────────

type VnStatus = "idle" | "loading" | "pass" | "fail" | "error";

interface VnCheckState {
  status: VnStatus;
  result?: Record<string, unknown>;
  error?: string;
  creditsSpent?: number;
}

type VnChecks = Record<string, VnCheckState>;   // keyed by matterId:checkKey

const BANKS = ["ABSA", "FNB", "Standard Bank", "Nedbank", "Capitec", "Investec", "African Bank", "TymeBank", "Discovery Bank"];

function statusClass(s: VnStatus) {
  return `dd-status dd-status-${s}`;
}

function statusLabel(s: VnStatus) {
  return s === "idle" ? "Not run" : s === "loading" ? "Checking…" : s === "pass" ? "Passed" : s === "fail" ? "Flagged" : "Error";
}

function ResultRow({ label, value, variant }: { label: string; value: string; variant?: "danger" | "warning" | "ok" }) {
  return (
    <div className="dd-result-row">
      <span className="dd-result-key">{label}</span>
      <span className={`dd-result-val${variant ? ` ${variant}` : ""}`}>{value || "—"}</span>
    </div>
  );
}

function DueDiligencePanel({
  matter, checks, onRun, showToast
}: {
  matter: ConveyancingMatter;
  checks: VnChecks;
  onRun: (checkKey: string, service: string, payload: Record<string, unknown>) => Promise<void>;
  showToast: (type: "success" | "error" | "info", title: string, msg: string) => void;
}) {
  const [buyerSaId, setBuyerSaId]       = useState("");
  const [sellerSaId, setSellerSaId]     = useState("");
  const [bankName, setBankName]         = useState("FNB");
  const [accountNumber, setAccountNumber] = useState("");
  const [accountHolder, setAccountHolder] = useState("");
  const [cipcReg, setCipcReg]           = useState("");

  const ck = (key: string): VnCheckState => checks[`${matter.id}:${key}`] ?? { status: "idle" };

  function renderResult(key: string, content: React.ReactNode) {
    const state = ck(key);
    if (state.status === "idle" || state.status === "loading") return null;
    if (state.status === "error") return <div className="dd-result"><ResultRow label="Error" value={state.error ?? "Unknown error"} variant="danger" /></div>;
    return <div className="dd-result">{content}</div>;
  }

  // ── ID Verification ───────────────────────────────────────────────────────
  function runIdVerify(party: "buyer" | "seller") {
    const idNum = party === "buyer" ? buyerSaId : sellerSaId;
    const name  = party === "buyer" ? matter.buyerName : matter.sellerName;
    if (!idNum.trim()) { showToast("error", "SA ID required", `Enter ${party}'s 13-digit SA ID number.`); return; }
    return onRun(`id-${party}`, "verify", { id_number: idNum.trim(), full_name: name });
  }

  function renderIdResult(key: string) {
    const state = ck(key);
    if (state.status !== "pass" && state.status !== "fail") return null;
    const d = (state.result ?? {}) as Record<string, string>;
    const vs = d.verification_status ?? "unknown";
    return renderResult(key, <>
      <ResultRow label="Verification status" value={vs.replace(/_/g, " ")} variant={vs === "verified" ? "ok" : "danger"} />
      <ResultRow label="Full name" value={d.full_name} />
      <ResultRow label="Date of birth" value={d.dob} />
      <ResultRow label="Gender" value={d.gender} />
      <ResultRow label="Deceased" value={d.deceased === "true" ? "Yes — DO NOT PROCEED" : "No"} variant={d.deceased === "true" ? "danger" : "ok"} />
      <ResultRow label="ID number" value={d.id_number} />
    </>);
  }

  // ── AML / PEP Screening ───────────────────────────────────────────────────
  function runAmlPep(party: "buyer" | "seller") {
    const idNum = party === "buyer" ? buyerSaId : sellerSaId;
    const name  = party === "buyer" ? matter.buyerName : matter.sellerName;
    if (!name.trim()) { showToast("error", "Name required", `Enter ${party} name.`); return; }
    return onRun(`aml-${party}`, "aml-pep", { full_name: name, id_number: idNum.trim() || undefined });
  }

  function renderAmlResult(key: string) {
    const state = ck(key);
    if (state.status !== "pass" && state.status !== "fail") return null;
    const d = (state.result ?? {}) as Record<string, string>;
    const isPep       = d.is_pep === "true";
    const isSanctioned = d.is_sanctioned === "true";
    const risk        = d.risk_level ?? "unknown";
    return renderResult(key, <>
      <ResultRow label="Risk level" value={risk.toUpperCase()} variant={risk === "high" ? "danger" : risk === "medium" ? "warning" : "ok"} />
      <ResultRow label="PEP status" value={isPep ? "⚠ Politically Exposed Person" : "Not flagged"} variant={isPep ? "warning" : "ok"} />
      <ResultRow label="Sanctions" value={isSanctioned ? "⛔ SANCTIONED — halt transaction" : "Clear"} variant={isSanctioned ? "danger" : "ok"} />
      <ResultRow label="Matches found" value={d.match_count ?? "0"} />
      {isPep && <ResultRow label="Note" value="Enhanced due diligence required per FICA §21" variant="warning" />}
    </>);
  }

  // ── Bank Account Verification ─────────────────────────────────────────────
  function runBankVerify() {
    if (!accountNumber.trim() || !accountHolder.trim()) {
      showToast("error", "Fields required", "Enter account holder name and account number."); return;
    }
    return onRun("bank-verify", "bank-account-verification", {
      bank_name: bankName, account_number: accountNumber.trim(), account_holder: accountHolder.trim()
    });
  }

  function renderBankResult() {
    const state = ck("bank-verify");
    if (state.status !== "pass" && state.status !== "fail") return null;
    const d = (state.result ?? {}) as Record<string, string>;
    const verified = d.verified === "true";
    return renderResult("bank-verify", <>
      <ResultRow label="Verified" value={verified ? "Yes — account active" : "No — mismatch or closed"} variant={verified ? "ok" : "danger"} />
      <ResultRow label="Account holder" value={d.account_holder_name} />
      <ResultRow label="Bank" value={d.bank_name} />
      <ResultRow label="Account number" value={d.account_number} />
      <ResultRow label="Account type" value={d.account_type} />
    </>);
  }

  // ── CIPC Company Lookup ───────────────────────────────────────────────────
  function runCipc() {
    if (!cipcReg.trim()) { showToast("error", "Reg number required", "Enter company registration number (e.g. 2006/123456/07)."); return; }
    return onRun("cipc", "cipc/company", { registration_number: cipcReg.trim() });
  }

  function renderCipcResult() {
    const state = ck("cipc");
    if (state.status !== "pass" && state.status !== "fail") return null;
    const d = (state.result ?? {}) as Record<string, string>;
    const active = (d.status ?? "").toLowerCase().includes("active");
    return renderResult("cipc", <>
      <ResultRow label="Company name" value={d.company_name} />
      <ResultRow label="Reg number" value={d.registration_number} />
      <ResultRow label="Status" value={d.status} variant={active ? "ok" : "warning"} />
      <ResultRow label="Company type" value={d.company_type} />
      <ResultRow label="Registered date" value={d.registration_date} />
      <ResultRow label="Business address" value={d.registered_address} />
    </>);
  }

  const SpinIcon = () => <Loader2 size={13} style={{ animation: "spin 0.8s linear infinite" }} />;

  return (
    <div className="dd-panel">
      <h4 style={{ margin: "0 0 4px", display: "flex", alignItems: "center", gap: 8 }}>
        <ShieldCheck size={18} color="var(--green)" /> VerifyNow Due Diligence
      </h4>
      <p style={{ fontSize: "0.82rem", color: "var(--muted)", margin: "0 0 14px" }}>
        FICA-compliant identity, AML/PEP, bank and CIPC checks — all logged and credit-tracked via VerifyNow SA.
      </p>

      <div className="dd-grid">
        {/* ── Buyer ID Verify ─────────────────────────────── */}
        <div className="dd-card">
          <div className="dd-card-head">
            <span className="dd-card-title">Buyer — ID Verify</span>
            <span className="dd-card-cost">~1 credit</span>
          </div>
          <p style={{ margin: "0 0 8px", fontSize: "0.83rem", color: "var(--muted)" }}>{matter.buyerName}</p>
          <div className="dd-input-row">
            <input value={buyerSaId} onChange={e => setBuyerSaId(e.target.value)} placeholder="SA ID number (13 digits)" maxLength={13} />
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <button className="primary small" onClick={() => runIdVerify("buyer")} disabled={ck("id-buyer").status === "loading"}>
              {ck("id-buyer").status === "loading" ? <><SpinIcon /> Checking</> : "Verify"}
            </button>
            <span className={statusClass(ck("id-buyer").status)}>{statusLabel(ck("id-buyer").status)}</span>
          </div>
          {renderIdResult("id-buyer")}
        </div>

        {/* ── Seller ID Verify ─────────────────────────────── */}
        <div className="dd-card">
          <div className="dd-card-head">
            <span className="dd-card-title">Seller — ID Verify</span>
            <span className="dd-card-cost">~1 credit</span>
          </div>
          <p style={{ margin: "0 0 8px", fontSize: "0.83rem", color: "var(--muted)" }}>{matter.sellerName}</p>
          <div className="dd-input-row">
            <input value={sellerSaId} onChange={e => setSellerSaId(e.target.value)} placeholder="SA ID number (13 digits)" maxLength={13} />
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <button className="primary small" onClick={() => runIdVerify("seller")} disabled={ck("id-seller").status === "loading"}>
              {ck("id-seller").status === "loading" ? <><SpinIcon /> Checking</> : "Verify"}
            </button>
            <span className={statusClass(ck("id-seller").status)}>{statusLabel(ck("id-seller").status)}</span>
          </div>
          {renderIdResult("id-seller")}
        </div>

        {/* ── Buyer AML / PEP ──────────────────────────────── */}
        <div className="dd-card">
          <div className="dd-card-head">
            <span className="dd-card-title">Buyer — AML / PEP Screen</span>
            <span className="dd-card-cost">~2 credits</span>
          </div>
          <p style={{ margin: "0 0 8px", fontSize: "0.83rem", color: "var(--muted)" }}>{matter.buyerName}</p>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <button className="primary small" onClick={() => runAmlPep("buyer")} disabled={ck("aml-buyer").status === "loading"}>
              {ck("aml-buyer").status === "loading" ? <><SpinIcon /> Screening</> : "Screen"}
            </button>
            <span className={statusClass(ck("aml-buyer").status)}>{statusLabel(ck("aml-buyer").status)}</span>
          </div>
          {renderAmlResult("aml-buyer")}
        </div>

        {/* ── Seller AML / PEP ─────────────────────────────── */}
        <div className="dd-card">
          <div className="dd-card-head">
            <span className="dd-card-title">Seller — AML / PEP Screen</span>
            <span className="dd-card-cost">~2 credits</span>
          </div>
          <p style={{ margin: "0 0 8px", fontSize: "0.83rem", color: "var(--muted)" }}>{matter.sellerName}</p>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <button className="primary small" onClick={() => runAmlPep("seller")} disabled={ck("aml-seller").status === "loading"}>
              {ck("aml-seller").status === "loading" ? <><SpinIcon /> Screening</> : "Screen"}
            </button>
            <span className={statusClass(ck("aml-seller").status)}>{statusLabel(ck("aml-seller").status)}</span>
          </div>
          {renderAmlResult("aml-seller")}
        </div>

        {/* ── Bank Account Verification ─────────────────────── */}
        <div className="dd-card">
          <div className="dd-card-head">
            <span className="dd-card-title">Bank Account Verify</span>
            <span className="dd-card-cost">~2 credits</span>
          </div>
          <p style={{ margin: "0 0 8px", fontSize: "0.83rem", color: "var(--muted)" }}>Verify disbursement / purchase account</p>
          <div className="dd-input-row" style={{ marginBottom: 6 }}>
            <input value={accountHolder} onChange={e => setAccountHolder(e.target.value)} placeholder="Account holder name" />
          </div>
          <div className="dd-input-row">
            <select value={bankName} onChange={e => setBankName(e.target.value)} style={{ maxWidth: 130, flex: "none" }}>
              {BANKS.map(b => <option key={b}>{b}</option>)}
            </select>
            <input value={accountNumber} onChange={e => setAccountNumber(e.target.value)} placeholder="Account number" />
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <button className="primary small" onClick={runBankVerify} disabled={ck("bank-verify").status === "loading"}>
              {ck("bank-verify").status === "loading" ? <><SpinIcon /> Verifying</> : "Verify"}
            </button>
            <span className={statusClass(ck("bank-verify").status)}>{statusLabel(ck("bank-verify").status)}</span>
          </div>
          {renderBankResult()}
        </div>

        {/* ── CIPC Company Lookup ──────────────────────────── */}
        <div className="dd-card">
          <div className="dd-card-head">
            <span className="dd-card-title">CIPC Company Lookup</span>
            <span className="dd-card-cost">~1 credit</span>
          </div>
          <p style={{ margin: "0 0 8px", fontSize: "0.83rem", color: "var(--muted)" }}>For company or CC buyer / seller</p>
          <div className="dd-input-row">
            <input value={cipcReg} onChange={e => setCipcReg(e.target.value)} placeholder="Reg no e.g. 2006/123456/07" />
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <button className="primary small" onClick={runCipc} disabled={ck("cipc").status === "loading"}>
              {ck("cipc").status === "loading" ? <><SpinIcon /> Looking up</> : "Look up"}
            </button>
            <span className={statusClass(ck("cipc").status)}>{statusLabel(ck("cipc").status)}</span>
          </div>
          {renderCipcResult()}
        </div>
      </div>

      <p className="dd-notice">
        Each check consumes VerifyNow credits from your tenant balance. Results are logged in Super Admin → VerifyNow Usage.
        These checks do not constitute legal advice — attorney review of all flagged results is required per FICA §21 and the LPC Rules of Conduct.
      </p>
    </div>
  );
}

function calcTransferDuty(priceCents: number): number {
  const p = priceCents / 100;
  if (p <= 1_100_000) return 0;
  if (p <= 1_512_500) return Math.round((p - 1_100_000) * 0.03 * 100);
  if (p <= 2_117_500) return Math.round((40_250 + (p - 1_512_500) * 0.06) * 100);
  if (p <= 2_722_500) return Math.round((76_550 + (p - 2_117_500) * 0.08) * 100);
  if (p <= 12_100_000) return Math.round((124_950 + (p - 2_722_500) * 0.11) * 100);
  return Math.round((1_156_550 + (p - 12_100_000) * 0.13) * 100);
}

function buildDefaultStages(currentStage: ConveyancingStage) {
  const idx = ALL_STAGES.indexOf(currentStage);
  return ALL_STAGES.map((stage, i) => ({
    stage, label: STAGE_LABELS[stage],
    status: (i < idx ? "completed" : i === idx ? "in_progress" : "pending") as "completed" | "in_progress" | "pending" | "blocked",
    completedAt: "", notes: ""
  }));
}

function daysUntil(dateStr: string) {
  if (!dateStr) return null;
  return Math.ceil((new Date(dateStr).getTime() - Date.now()) / 86400000);
}

export function ConveyancingPipeline({
  matters, setMatters, log, showToast
}: {
  matters: ConveyancingMatter[];
  setMatters: React.Dispatch<React.SetStateAction<ConveyancingMatter[]>>;
  log: (msg: string) => void;
  showToast: (type: "success" | "error" | "info", title: string, msg: string) => void;
}) {
  const [showForm, setShowForm] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [advanceNotes, setAdvanceNotes] = useState("");
  const [showAdvance, setShowAdvance] = useState(false);
  const [priceInput, setPriceInput] = useState("");
  const [calcDuty, setCalcDuty] = useState(0);
  const [calcFee, setCalcFee] = useState(0);
  // Lightstone property search (replaces Windeed)
  const [lsQuery, setLsQuery]                         = useState("");
  const [lsLoading, setLsLoading]                     = useState(false);
  const [lsResults, setLsResults]                     = useState<LightstoneAddress[]>([]);
  const [lsSelected, setLsSelected]                   = useState<LightstoneAddress | null>(null);
  const [lsBundle, setLsBundle]                       = useState<LightstonePropertyBundle | null>(null);
  const [lsBundleLoading, setLsBundleLoading]         = useState(false);
  const [lsSectional, setLsSectional]                 = useState<LightstoneSectionalUnit[]>([]);
  const [lsSectionalLoading, setLsSectionalLoading]   = useState(false);
  const [lsSearched, setLsSearched]                   = useState(false);
  const lsAbort = useRef<AbortController | null>(null);
  // VerifyNow: keyed by "matterId:checkKey"
  const [vnChecks, setVnChecks] = useState<VnChecks>({});

  const selected = matters.find(m => m.id === selectedId) ?? null;
  const totalFees = matters.reduce((s, m) => s + m.conveyancingFeeCents + m.vatOnFeeCents, 0);
  const activeCount = matters.filter(m => m.currentStage !== "completed").length;

  function onPriceBlur(val: string) {
    const cents = Math.round(parseFloat(val.replace(/[^0-9.]/g, "") || "0") * 100);
    setCalcDuty(calcTransferDuty(cents));
    setCalcFee(Math.round(cents * 0.015));
  }

  async function handleCreate(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const priceCents = Math.round(parseFloat(String(f.get("purchasePrice") || "0").replace(/[^0-9.]/g, "")) * 100);
    const duty = calcTransferDuty(priceCents);
    const fee = Math.round(priceCents * 0.015);
    const input: Omit<ConveyancingMatter, "id" | "stages"> = {
      matterRef: String(f.get("matterRef")),
      matterType: String(f.get("matterType")) as ConveyancingMatter["matterType"],
      sellerName: String(f.get("sellerName")),
      buyerName: String(f.get("buyerName")),
      propertyDescription: String(f.get("propertyDescription")),
      erfNumber: String(f.get("erfNumber") || ""),
      purchasePriceCents: priceCents,
      transferDutyCents: duty,
      conveyancingFeeCents: fee,
      vatOnFeeCents: Math.round(fee * 0.15),
      estateAgent: String(f.get("estateAgent") || ""),
      bondBank: String(f.get("bondBank") || ""),
      currentStage: "instruction_received",
      ficaStatus: "Pending",
      ratesClearanceStatus: "Not requested",
      levyClearanceStatus: "Not requested",
      ratesClearanceExpiry: "",
      levyClearanceExpiry: "",
      targetRegistrationDate: String(f.get("targetRegistrationDate") || ""),
      notes: String(f.get("notes") || "")
    };
    try {
      const res = await createConveyancingMatter(input);
      setMatters(prev => [res.matter, ...prev]);
      showToast("success", "Matter created", `${input.matterRef} — ${input.sellerName} → ${input.buyerName}`);
      log(`Conveyancing matter created: ${input.matterRef}`);
    } catch {
      const local: ConveyancingMatter = { id: uid("CM"), ...input, stages: buildDefaultStages("instruction_received") };
      setMatters(prev => [local, ...prev]);
      showToast("info", "Saved locally", "Matter saved. Connect API to persist.");
    }
    setShowForm(false);
  }

  async function handleAdvanceStage() {
    if (!selected) return;
    const currentIdx = ALL_STAGES.indexOf(selected.currentStage);
    if (currentIdx >= ALL_STAGES.length - 1) return;
    const nextStage = ALL_STAGES[currentIdx + 1];
    try {
      const res = await advanceConveyancingStage(selected.id, nextStage, advanceNotes);
      setMatters(prev => prev.map(m => m.id === selected.id ? res.matter : m));
      showToast("success", "Stage advanced", `${STAGE_LABELS[nextStage]}`);
      log(`Conveyancing ${selected.matterRef} → ${STAGE_LABELS[nextStage]}`);
    } catch {
      setMatters(prev => prev.map(m => m.id === selected.id
        ? { ...m, currentStage: nextStage, stages: buildDefaultStages(nextStage) } : m));
      showToast("info", "Updated locally", "Stage advanced locally.");
    }
    setShowAdvance(false);
    setAdvanceNotes("");
  }

  async function handleLightstoneSearch() {
    if (!lsQuery.trim()) return;
    if (lsAbort.current) lsAbort.current.abort();
    setLsLoading(true);
    setLsResults([]);
    setLsSelected(null);
    setLsSectional([]);
    setLsSearched(false);
    try {
      const data = await searchLightstoneAddress(lsQuery.trim());
      setLsResults(data.results || []);
      setLsSearched(true);
      if (!data.results?.length) showToast("info", "Lightstone", "No matching properties found. Try a street address, suburb or erf number.");
    } catch (err: unknown) {
      const msg = (err instanceof Error) ? err.message : "Property search failed";
      showToast("error", "Lightstone search failed", msg);
    } finally {
      setLsLoading(false);
    }
  }

  async function handleLightstoneSelectResult(addr: LightstoneAddress) {
    setLsSelected(addr);
    setLsBundle(null);
    setLsSectional([]);

    // Fetch property detail bundle (owners + legal + municipal + land) in parallel
    if (addr.propertyId) {
      setLsBundleLoading(true);
      try {
        const bundle = await getLightstonePropertyBundle(addr.propertyId, addr.id);
        setLsBundle(bundle);
      } catch (err: unknown) {
        const msg = (err instanceof Error) ? err.message : "Could not load property details";
        showToast("error", "Lightstone property detail", msg);
      } finally {
        setLsBundleLoading(false);
      }
    }

    // Sectional units (only if sectional title)
    if (addr.schemeGroupId && addr.schemeGroupId > 0) {
      setLsSectionalLoading(true);
      try {
        const data = await getLightstoneSectionalUnits(addr.id);
        setLsSectional(data.units || []);
      } catch { /* optional */ } finally {
        setLsSectionalLoading(false);
      }
    }
  }

  const handleVnRun = useCallback(async (
    checkKey: string,
    service: string,
    payload: Record<string, unknown>
  ) => {
    if (!selectedId) return;
    const fullKey = `${selectedId}:${checkKey}`;
    setVnChecks(prev => ({ ...prev, [fullKey]: { status: "loading" } }));
    try {
      const res = await callVerifyNow(service, payload);
      // Flatten the top-level data object into a string-keyed map for display
      const flat: Record<string, string> = {};
      function flatten(obj: unknown, prefix = "") {
        if (obj && typeof obj === "object" && !Array.isArray(obj)) {
          for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
            flatten(v, prefix ? `${prefix}_${k}` : k);
          }
        } else {
          flat[prefix] = String(obj ?? "");
        }
      }
      flatten(res.data);
      // Determine pass/fail from known fields
      const failed =
        flat["verification_status"]?.includes("not_verified") ||
        flat["verified"] === "false" ||
        flat["is_sanctioned"] === "true" ||
        flat["risk_level"] === "high" ||
        flat["status"]?.toLowerCase().includes("deregistered");
      setVnChecks(prev => ({
        ...prev,
        [fullKey]: {
          status: failed ? "fail" : "pass",
          result: flat,
          creditsSpent: res.metadata?.credits_spent ?? 0
        }
      }));
      showToast(failed ? "error" : "success", `VerifyNow: ${checkKey}`, failed ? "Check flagged — review result below." : "Check passed.");
      log(`VerifyNow ${service} — ${failed ? "FLAGGED" : "PASS"} (${res.metadata?.credits_spent ?? 0} credits)`);
    } catch (err: unknown) {
      const msg = (err instanceof Error) ? err.message : "Check failed";
      setVnChecks(prev => ({ ...prev, [fullKey]: { status: "error", error: msg } }));
      showToast("error", "VerifyNow error", msg);
    }
  }, [selectedId, showToast, log]);

  async function handleClearanceUpdate(field: string, value: string) {
    if (!selected) return;
    const patch: Partial<ConveyancingMatter> = { [field]: value };
    try {
      const res = await updateConveyancingClearances(selected.id, patch);
      setMatters(prev => prev.map(m => m.id === selected.id ? res.matter : m));
    } catch {
      setMatters(prev => prev.map(m => m.id === selected.id ? { ...m, ...patch } : m));
    }
    showToast("success", "Updated", `${field} updated.`);
  }

  return (
    <>
      <section className="metrics">
        <div className="metric"><span>Total matters</span><strong>{matters.length}</strong><small>All types</small></div>
        <div className="metric"><span>Active transfers</span><strong>{activeCount}</strong><small>Not yet completed</small></div>
        <div className="metric"><span>Completed</span><strong>{matters.length - activeCount}</strong><small>Registered</small></div>
        <div className="metric"><span>Total fees excl. VAT</span><strong>{money(totalFees)}</strong><small>Conveyancing fees</small></div>
      </section>

      <section className="tier1-section">
        <div className="panel-head">
          <h3>Conveyancing matters</h3>
          <button className="primary small" onClick={() => setShowForm(v => !v)}>
            <Plus size={16} /> {showForm ? "Cancel" : "New matter"}
          </button>
        </div>

        {showForm && (
          <div className="inline-form-toggle">
            <form className="form" onSubmit={handleCreate}>
              <div className="form-row">
                <label>Matter ref<input name="matterRef" required placeholder="M-2026-001" /></label>
                <label>Matter type
                  <select name="matterType">
                    {Object.entries(MATTER_TYPE_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                  </select>
                </label>
              </div>
              <div className="form-row">
                <label>Seller full name<input name="sellerName" required placeholder="Seller name" /></label>
                <label>Buyer full name<input name="buyerName" required placeholder="Buyer name" /></label>
              </div>
              <label>Property description<input name="propertyDescription" required placeholder="Erf 1234, Sandton, Gauteng" /></label>
              <div className="form-row">
                <label>Erf / unit number<input name="erfNumber" placeholder="Erf 1234" /></label>
                <label>Estate agent<input name="estateAgent" placeholder="Agency name" /></label>
              </div>
              <div className="form-row">
                <label>Bond bank<input name="bondBank" placeholder="FNB / ABSA / Standard Bank / Nedbank" /></label>
                <label>Target registration date<input name="targetRegistrationDate" type="date" /></label>
              </div>
              <div className="form-row">
                <label>Purchase price (ZAR)
                  <input name="purchasePrice" placeholder="e.g. 2500000"
                    value={priceInput}
                    onChange={e => setPriceInput(e.target.value)}
                    onBlur={e => onPriceBlur(e.target.value)} />
                </label>
                <label>Transfer duty (auto-calculated)
                  <input readOnly value={calcDuty ? money(calcDuty) : "R 0"} style={{ background: "#f5f8f5", color: "var(--green-dark)" }} />
                </label>
              </div>
              {calcFee > 0 && (
                <p className="transfer-duty-note">
                  Prescribed conveyancing fee (GN R234): {money(calcFee)} excl. VAT ({money(Math.round(calcFee * 0.15))} VAT) — attorney review required before issuing account.
                </p>
              )}
              <label>Notes<textarea name="notes" rows={2} /></label>
              <button className="primary" type="submit">Create matter</button>
            </form>
          </div>
        )}

        <div style={{ marginTop: 14 }}>
          {matters.map(m => (
            <div key={m.id}
              className={`conv-matter-card${selectedId === m.id ? " selected" : ""}`}
              onClick={() => setSelectedId(selectedId === m.id ? null : m.id)}>
              <div className="conv-matter-head" style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                <div>
                  <strong>{m.matterRef}</strong>
                  <span style={{ marginLeft: 10, color: "var(--muted)", fontSize: "0.85rem" }}>{MATTER_TYPE_LABELS[m.matterType]}</span>
                  <p style={{ margin: "4px 0 0", fontSize: "0.88rem" }}>{m.sellerName} → {m.buyerName}</p>
                  <p style={{ margin: "2px 0 0", fontSize: "0.83rem", color: "var(--muted)" }}>{m.propertyDescription}</p>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span className={`pill ${m.currentStage === "completed" ? "recon-status-approved" : "time-status-wip"}`}>
                    {STAGE_LABELS[m.currentStage]}
                  </span>
                  {selectedId === m.id ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                </div>
              </div>

              {selectedId === m.id && (
                <div style={{ marginTop: 18 }} onClick={e => e.stopPropagation()}>
                  {/* Stage pipeline */}
                  <h4 style={{ margin: "0 0 12px" }}>Transfer pipeline</h4>
                  <div className="conv-stage-track">
                    {ALL_STAGES.map((stage, i) => {
                      const stageRec = m.stages.find(s => s.stage === stage);
                      const status = stageRec?.status ?? (i < ALL_STAGES.indexOf(m.currentStage) ? "completed" : i === ALL_STAGES.indexOf(m.currentStage) ? "in_progress" : "pending");
                      return (
                        <div key={stage} style={{ display: "flex", alignItems: "center" }}>
                          <div className="conv-stage-wrapper">
                            <div className={`conv-stage-dot ${status}`}>
                              {status === "completed" ? <CheckCircle2 size={14} /> : i + 1}
                            </div>
                            <div className="conv-stage-label">{STAGE_LABELS[stage]}</div>
                          </div>
                          {i < ALL_STAGES.length - 1 && (
                            <div className={`conv-stage-line${status === "completed" ? " completed" : ""}`} />
                          )}
                        </div>
                      );
                    })}
                  </div>

                  {m.currentStage !== "completed" && (
                    <div style={{ marginTop: 14 }}>
                      {!showAdvance ? (
                        <button className="primary small" onClick={() => setShowAdvance(true)}>
                          Advance to: {STAGE_LABELS[ALL_STAGES[ALL_STAGES.indexOf(m.currentStage) + 1]] ?? "Complete"}
                        </button>
                      ) : (
                        <div className="inline-form-toggle" style={{ marginTop: 0 }}>
                          <label style={{ display: "grid", gap: 6, fontWeight: 600, fontSize: "0.88rem" }}>
                            Notes for this stage
                            <textarea rows={2} value={advanceNotes} onChange={e => setAdvanceNotes(e.target.value)} />
                          </label>
                          <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
                            <button className="primary small" onClick={handleAdvanceStage}>Confirm advance</button>
                            <button className="ghost small" onClick={() => setShowAdvance(false)}>Cancel</button>
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Clearances */}
                  <h4 style={{ margin: "20px 0 10px" }}>Clearances & FICA</h4>
                  <div className="conv-fee-summary">
                    <div className="conv-clearance-row">
                      <span>FICA status</span>
                      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                        <select value={m.ficaStatus} onChange={e => handleClearanceUpdate("ficaStatus", e.target.value)}>
                          {FICA_STATUSES.map(s => <option key={s}>{s}</option>)}
                        </select>
                        <span className={`pill ${m.ficaStatus === "Compliant" ? "recon-status-approved" : m.ficaStatus === "In Progress" ? "fica-status-in-progress" : "fica-status-pending"}`}>{m.ficaStatus}</span>
                      </div>
                    </div>
                    {(["ratesClearanceStatus", "levyClearanceStatus"] as const).map(field => {
                      const label = field === "ratesClearanceStatus" ? "Rates clearance" : "Levy clearance";
                      const expiryField = field === "ratesClearanceStatus" ? "ratesClearanceExpiry" : "levyClearanceExpiry";
                      const expiry = m[expiryField];
                      const daysLeft = expiry ? daysUntil(expiry) : null;
                      return (
                        <div key={field} className="conv-clearance-row">
                          <div>
                            <span>{label}</span>
                            {expiry && (
                              <small style={{ display: "block", color: daysLeft !== null && daysLeft < 0 ? "var(--rose)" : daysLeft !== null && daysLeft <= 30 ? "var(--gold)" : "var(--muted)" }}>
                                {daysLeft !== null && daysLeft < 0 ? "⚠ EXPIRED" : daysLeft !== null && daysLeft <= 30 ? `⚠ Expires in ${daysLeft} days` : `Expires: ${expiry}`}
                              </small>
                            )}
                          </div>
                          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                            <select value={m[field]} onChange={e => handleClearanceUpdate(field, e.target.value)}>
                              {CLEARANCE_STATUSES.map(s => <option key={s}>{s}</option>)}
                            </select>
                            <input type="date" style={{ padding: "6px 8px", border: "1px solid var(--line)", borderRadius: 6, fontSize: "0.85rem" }}
                              value={expiry}
                              onChange={e => handleClearanceUpdate(expiryField, e.target.value)} />
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Fee summary */}
                  <h4 style={{ margin: "20px 0 10px" }}>Fee summary</h4>
                  <div className="conv-fee-summary">
                    <div className="conv-fee-row"><span>Purchase price</span><strong>{money(m.purchasePriceCents)}</strong></div>
                    <div className="conv-fee-row"><span>Transfer duty (SARS)</span><strong>{money(m.transferDutyCents)}</strong></div>
                    <div className="conv-fee-row"><span>Conveyancing fee</span><strong>{money(m.conveyancingFeeCents)}</strong></div>
                    <div className="conv-fee-row"><span>VAT on fee (15%)</span><strong>{money(m.vatOnFeeCents)}</strong></div>
                    <div className="conv-fee-row conv-fee-total">
                      <span>Total (duty + fees + VAT)</span>
                      <strong>{money(m.transferDutyCents + m.conveyancingFeeCents + m.vatOnFeeCents)}</strong>
                    </div>
                    <p className="transfer-duty-note">Transfer duty scale per SARS GN R234 (2024/2025). Conveyancing fee is indicative only — prescribed tariff applies. Attorney review required before issuing account to client.</p>
                  </div>

                  {/* Lightstone property search */}
                  <h4 style={{ margin: "20px 0 10px", display: "flex", alignItems: "center", gap: 8 }}>
                    <MapPin size={16} color="var(--green)" /> Property search (Lightstone)
                  </h4>
                  <div className="ls-search-bar">
                    <input
                      value={lsQuery}
                      onChange={e => setLsQuery(e.target.value)}
                      onKeyDown={e => e.key === "Enter" && handleLightstoneSearch()}
                      placeholder="Street address, suburb, erf number or estate name…"
                    />
                    <button className="primary small" onClick={handleLightstoneSearch} disabled={lsLoading}>
                      {lsLoading ? <><Loader2 size={13} style={{ animation: "spin 0.8s linear infinite" }} /> Searching</> : "Search"}
                    </button>
                  </div>

                  {lsSearched && !lsResults.length && (
                    <div className="ls-no-results">No properties found for "{lsQuery}"</div>
                  )}

                  {lsResults.length > 0 && (
                    <div className="ls-results">
                      {lsResults.map(addr => (
                        <div
                          key={addr.id}
                          className={`ls-result-card${lsSelected?.id === addr.id ? " selected" : ""}`}
                          onClick={() => handleLightstoneSelectResult(addr)}
                        >
                          <div className="ls-result-main">
                            <div className="ls-result-address">{addr.addressString || addr.name}</div>
                            <div className="ls-result-meta">
                              {[addr.suburbName, addr.municipalityName, addr.provinceName].filter(Boolean).join(" · ")}
                              {addr.postCode ? ` · ${addr.postCode}` : ""}
                            </div>
                          </div>
                          <div className="ls-result-badges">
                            {addr.schemeGroupId > 0 && <span className="ls-badge ls-badge-sectional">Sectional</span>}
                            {addr.estateName && <span className="ls-badge ls-badge-estate">{addr.estateName}</span>}
                            {addr.relevanceScore > 0 && (
                              <span className="ls-badge ls-badge-score">{Math.round(addr.relevanceScore * 100)}%</span>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {lsSelected && (
                    <div className="ls-property-detail">
                      {/* Header */}
                      <div className="ls-detail-head">
                        <div>
                          <div className="ls-detail-title">{lsSelected.addressString}</div>
                          <div className="ls-detail-pid">
                            Property ID: {lsSelected.propertyId} · Address ID: {lsSelected.id}
                            {lsSelected.deedsOfficeId ? ` · Deeds Office: ${lsSelected.deedsOfficeId}` : ""}
                          </div>
                        </div>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          {lsBundleLoading && <Loader2 size={16} color="var(--green)" style={{ animation: "spin 0.8s linear infinite" }} />}
                          <Building2 size={22} color="var(--green)" style={{ flexShrink: 0 }} />
                        </div>
                      </div>

                      {/* ── Address fields ── */}
                      <div className="ls-detail-grid" style={{ marginBottom: 16 }}>
                        {([
                          ["Street",         [lsSelected.streetNumber, lsSelected.streetName, lsSelected.streetType].filter(Boolean).join(" ")],
                          ["Estate",         lsSelected.estateName],
                          ["Scheme",         lsSelected.schemeName],
                          ["Suburb",         lsSelected.suburbName],
                          ["Town / City",    lsSelected.townName],
                          ["Municipality",   lsSelected.municipalityName],
                          ["District",       lsSelected.districtCouncilName],
                          ["Province",       lsSelected.provinceName],
                          ["Post code",      lsSelected.postCode],
                        ] as [string, string | undefined | number][]).filter(([, v]) => v).map(([label, val]) => (
                          <div key={label} className="ls-detail-field">
                            <span className="ls-detail-label">{label}</span>
                            <span className="ls-detail-value">{String(val)}</span>
                          </div>
                        ))}
                      </div>

                      {/* ── Registered Owners ── */}
                      {(lsBundle?.owners && (Array.isArray(lsBundle.owners) ? lsBundle.owners.length > 0 : true)) && (
                        <div className="ls-data-section">
                          <div className="ls-section-head">Registered Owner(s)</div>
                          {(Array.isArray(lsBundle.owners) ? lsBundle.owners : [lsBundle.owners]).map((owner, i) => (
                            <div key={i} className="ls-detail-grid" style={{ marginBottom: 8 }}>
                              {([
                                ["Name",            owner.fullName || [owner.firstName, owner.lastName].filter(Boolean).join(" ") || owner.entityName],
                                ["ID / Reg no",     owner.idNumber || owner.registrationNumber],
                                ["Owner type",      owner.ownerType],
                                ["Purchase price",  owner.purchasePrice ? `R ${Number(owner.purchasePrice).toLocaleString("en-ZA")}` : null],
                                ["Purchase date",   owner.purchaseDate],
                                ["Ownership %",     owner.ownershipPercentage != null ? `${owner.ownershipPercentage}%` : null],
                              ] as [string, string | null | undefined][]).filter(([, v]) => v).map(([label, val]) => (
                                <div key={label} className="ls-detail-field">
                                  <span className="ls-detail-label">{label}</span>
                                  <span className="ls-detail-value">{String(val)}</span>
                                </div>
                              ))}
                            </div>
                          ))}
                        </div>
                      )}

                      {/* ── Title Deed / Legal ── */}
                      {lsBundle?.legal && (
                        <div className="ls-data-section">
                          <div className="ls-section-head">Title Deed &amp; Bonds</div>
                          <div className="ls-detail-grid">
                            {([
                              ["Title deed",          lsBundle.legal.titleDeedNumber],
                              ["Deed type",           lsBundle.legal.deedType],
                              ["Registration date",   lsBundle.legal.registrationDate],
                              ["Purchase price",      lsBundle.legal.purchasePrice ? `R ${Number(lsBundle.legal.purchasePrice).toLocaleString("en-ZA")}` : null],
                              ["Bond holder",         lsBundle.legal.bondHolder],
                              ["Bond amount",         lsBundle.legal.bondAmount ? `R ${Number(lsBundle.legal.bondAmount).toLocaleString("en-ZA")}` : null],
                              ["Bond registered",     lsBundle.legal.bondRegistrationDate],
                              ["Bond cancelled",      lsBundle.legal.bondCancelledDate],
                            ] as [string, string | null | undefined][]).filter(([, v]) => v).map(([label, val]) => (
                              <div key={label} className="ls-detail-field">
                                <span className="ls-detail-label">{label}</span>
                                <span className="ls-detail-value">{String(val)}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* ── Municipal ── */}
                      {lsBundle?.municipal && (
                        <div className="ls-data-section">
                          <div className="ls-section-head">Municipal Valuation</div>
                          <div className="ls-detail-grid">
                            {([
                              ["Municipality",      lsBundle.municipal.municipalityName],
                              ["Account no",        lsBundle.municipal.accountNumber],
                              ["Municipal value",   lsBundle.municipal.municipalValue ? `R ${Number(lsBundle.municipal.municipalValue).toLocaleString("en-ZA")}` : null],
                              ["Valuation date",    lsBundle.municipal.municipalValueDate],
                              ["Monthly rates",     lsBundle.municipal.monthlyRates ? `R ${Number(lsBundle.municipal.monthlyRates).toLocaleString("en-ZA")}` : null],
                            ] as [string, string | null | undefined][]).filter(([, v]) => v).map(([label, val]) => (
                              <div key={label} className="ls-detail-field">
                                <span className="ls-detail-label">{label}</span>
                                <span className="ls-detail-value">{String(val)}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* ── Land ── */}
                      {lsBundle?.land && (
                        <div className="ls-data-section">
                          <div className="ls-section-head">Land &amp; Erf</div>
                          <div className="ls-detail-grid">
                            {([
                              ["Erf number",  lsBundle.land.erfNumber],
                              ["Extent",      lsBundle.land.extent ? `${Number(lsBundle.land.extent).toLocaleString("en-ZA")} m²` : null],
                              ["Land use",    lsBundle.land.landUse],
                              ["Zoning",      lsBundle.land.zoning],
                            ] as [string, string | null | undefined][]).filter(([, v]) => v).map(([label, val]) => (
                              <div key={label} className="ls-detail-field">
                                <span className="ls-detail-label">{label}</span>
                                <span className="ls-detail-value">{String(val)}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* ── Sectional units ── */}
                      {lsSelected.schemeGroupId > 0 && (
                        <div className="ls-data-section ls-sectional">
                          <div className="ls-section-head">
                            Sectional scheme units
                            {lsSectionalLoading && <Loader2 size={13} style={{ marginLeft: 8, animation: "spin 0.8s linear infinite", verticalAlign: "middle" }} />}
                          </div>
                          {!lsSectionalLoading && lsSectional.length === 0 && (
                            <p style={{ color: "var(--muted)", fontSize: "0.83rem", margin: 0 }}>No units returned.</p>
                          )}
                          {lsSectional.length > 0 && (
                            <table className="ls-sectional-table">
                              <thead><tr><th>Unit / Address</th><th>Scheme</th><th>Suburb</th><th>ID</th></tr></thead>
                              <tbody>
                                {lsSectional.map((u, i) => (
                                  <tr key={u.id ?? i}>
                                    <td>{u.unitNumber || u.addressString || "—"}</td>
                                    <td>{u.schemeName || "—"}</td>
                                    <td>{u.suburbName || "—"}</td>
                                    <td style={{ color: "var(--muted)", fontSize: "0.8rem" }}>{u.id ?? "—"}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          )}
                        </div>
                      )}

                      {/* Loading placeholder */}
                      {lsBundleLoading && !lsBundle && (
                        <div style={{ textAlign: "center", padding: "20px 0", color: "var(--muted)", fontSize: "0.85rem" }}>
                          <Loader2 size={18} style={{ animation: "spin 0.8s linear infinite", marginBottom: 6 }} />
                          <div>Loading owners, legal &amp; municipal data…</div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* SearchWorks deeds office search */}
                  <hr style={{ border: "none", borderTop: "1px solid var(--line)", margin: "22px 0" }} />
                  <h4 style={{ margin: "0 0 10px", display: "flex", alignItems: "center", gap: 8 }}>
                    <FileSearch size={16} color="var(--green)" /> Deeds Office search (SearchWorks)
                  </h4>
                  <SearchWorksPanel
                    defaultErfNumber={m.erfNumber}
                    matterRef={m.matterRef}
                    showToast={showToast}
                    log={log}
                  />

                  {/* VerifyNow Due Diligence */}
                  <hr style={{ border: "none", borderTop: "1px solid var(--line)", margin: "22px 0" }} />
                  <DueDiligencePanel
                    matter={m}
                    checks={vnChecks}
                    onRun={handleVnRun}
                    showToast={showToast}
                  />
                </div>
              )}
            </div>
          ))}
          {matters.length === 0 && <p style={{ color: "var(--muted)", textAlign: "center", padding: 24 }}>No conveyancing matters yet. Create the first one above.</p>}
        </div>
      </section>

      <section className="compliance-summary">
        {(["transfer", "bond_registration", "bond_cancellation", "sectional_title"] as ConveyancingMatter["matterType"][]).map(type => (
          <div key={type} className="compliance-stat">
            <strong>{matters.filter(m => m.matterType === type).length}</strong>
            <span>{MATTER_TYPE_LABELS[type]}</span>
          </div>
        ))}
      </section>
    </>
  );
}
