import { useEffect, useRef, useState } from "react";
import { archiveClient, createClient, getClients, updateClient } from "./api";
import type { Client, ClientCategory, ClientType, FicaStatus, RiskRating } from "./types";

// ─── Types used by sub-components ────────────────────────────────────────────
type SetField = (key: keyof Client, value: unknown) => void;

// ─── Constants ────────────────────────────────────────────────────────────────

const SA_PROVINCES = ["Gauteng","Western Cape","Eastern Cape","KwaZulu-Natal","Free State","North West","Mpumalanga","Limpopo","Northern Cape"];
const CLIENT_TYPES: { value: ClientType; label: string }[] = [
  { value: "natural_person",    label: "Natural Person" },
  { value: "company",           label: "Company (Pty) Ltd" },
  { value: "close_corporation", label: "Close Corporation" },
  { value: "trust",             label: "Trust" },
  { value: "partnership",       label: "Partnership" },
  { value: "non_profit",        label: "Non-Profit Organisation" },
  { value: "sole_proprietor",   label: "Sole Proprietor" },
  { value: "other_entity",      label: "Other Entity" },
];
const FICA_LABELS: Record<FicaStatus, string> = {
  pending: "Pending", compliant: "Compliant", non_compliant: "Non-Compliant", expired: "Expired", exempt: "Exempt"
};
const RISK_LABELS: Record<RiskRating, string> = {
  unrated: "Unrated", low: "Low Risk", medium: "Medium Risk", high: "High Risk", pep: "PEP"
};
const REFERRAL_SOURCES = ["Referral — existing client","Referral — attorney","Walk-in","Google / online search","Legal Aid / assigned","Social media","Networking event","Former employer","Other"];
const ACTIVITY_TYPES = ["Conveyancing","Litigation","Corporate / Commercial","Family Law","Labour Law","Criminal Law","Estate Administration","Drafting / Contracts","Intellectual Property","Immigration","Wills & Trusts","Other"];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function ficaPillClass(s: FicaStatus) {
  if (s === "compliant") return "pill inv-paid";
  if (s === "non_compliant" || s === "expired") return "pill inv-overdue";
  if (s === "exempt") return "pill inv-sent";
  return "pill inv-draft";
}

function riskPillClass(r: RiskRating) {
  if (r === "low") return "pill risk-low";
  if (r === "medium") return "pill risk-medium";
  if (r === "high" || r === "pep") return "pill risk-high";
  return "pill";
}

function categoryPillClass(c: ClientCategory) {
  if (c === "vip") return "pill inv-part-paid";
  if (c === "inactive") return "pill inv-void";
  if (c === "prospect") return "pill inv-sent";
  return "pill inv-draft";
}

function typeLabel(t: ClientType) {
  return CLIENT_TYPES.find(x => x.value === t)?.label ?? t;
}

function initials(name: string) {
  return name.split(" ").filter(Boolean).slice(0, 2).map(w => w[0]).join("").toUpperCase();
}

function fmtDate(iso: string) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-ZA");
}

/** Parse 13-digit SA ID: extract DOB, gender, citizenship */
function parseSaId(id: string) {
  if (!/^\d{13}$/.test(id)) return null;
  const yy = parseInt(id.slice(0, 2)), mm = parseInt(id.slice(2, 4)), dd = parseInt(id.slice(4, 6));
  const year = yy <= 29 ? 2000 + yy : 1900 + yy;
  const dob = `${year}-${String(mm).padStart(2, "0")}-${String(dd).padStart(2, "0")}`;
  const genderDigit = parseInt(id.slice(6, 10));
  const gender = genderDigit >= 5000 ? "male" : "female";
  const citizenship = id[10] === "0" ? "South African" : "Permanent Resident";
  return { dob, gender, citizenship };
}

const EMPTY_CLIENT: Partial<Client> = {
  clientType: "natural_person", clientCategory: "standard",
  firstName: "", lastName: "", fullName: "",
  saIdNumber: "", passportNumber: "", passportCountry: "", dateOfBirth: "",
  gender: "", nationality: "South African", incomeTaxRef: "",
  registeredName: "", tradingName: "", registrationNumber: "", registrationDate: "", vatNumber: "",
  email: "", emailAlt: "", mobile: "", phoneLandline: "", whatsappNumber: "", preferredContact: "email",
  addressLine1: "", addressLine2: "", suburb: "", city: "", province: "", postalCode: "", country: "South Africa",
  postalSameAsPhysical: true, postalLine1: "", postalLine2: "", postalSuburb: "", postalCity: "", postalProvince: "", postalCodePost: "",
  ficaStatus: "pending", riskRating: "unrated", isPep: false, pepDetails: "",
  sanctionsClear: null, sourceOfFunds: "", sourceOfWealth: "", natureOfBusiness: "",
  conflictsChecked: false, conflictsNotes: "",
  defaultRateCents: 0, billingEmail: "", paymentTermsDays: 30, creditLimitCents: 0,
  relationshipPartner: "", originatingAttorney: "", clientSince: "", referralSource: "",
  tags: [], portalEmail: "", portalActive: false, internalNotes: "",
};

type DetailTab = "profile" | "identity" | "contact" | "fica" | "billing" | "notes";
const DETAIL_TABS: { key: DetailTab; label: string }[] = [
  { key: "profile",   label: "Profile" },
  { key: "identity",  label: "Identity" },
  { key: "contact",   label: "Contact & Address" },
  { key: "fica",      label: "FICA & Compliance" },
  { key: "billing",   label: "Billing" },
  { key: "notes",     label: "Notes" },
];

// ─── Main component ───────────────────────────────────────────────────────────

export function Clients({ showToast, log }: {
  showToast: (type: "success" | "error" | "info", title: string, msg: string) => void;
  log: (msg: string) => void;
}) {
  const [clients, setClients] = useState<Client[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterType, setFilterType] = useState<"" | ClientType>("");
  const [filterFica, setFilterFica] = useState<"" | FicaStatus>("");
  const [filterCategory, setFilterCategory] = useState<"" | ClientCategory>("");
  const [selected, setSelected] = useState<Client | null>(null);
  const [detailTab, setDetailTab] = useState<DetailTab>("profile");
  const [editing, setEditing] = useState(false);
  const [editDraft, setEditDraft] = useState<Partial<Client>>({});
  const [saving, setSaving] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [createStep, setCreateStep] = useState(0);
  const [createDraft, setCreateDraft] = useState<Partial<Client>>({ ...EMPTY_CLIENT });
  const [creating, setCreating] = useState(false);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = async (q = search, type = filterType, fica = filterFica, cat = filterCategory) => {
    setLoading(true);
    const res = await getClients({ search: q || undefined, clientType: type || undefined, ficaStatus: fica || undefined, category: cat || undefined, limit: 100 });
    if (res?.clients) { setClients(res.clients); setTotal(res.total); }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  function handleSearch(val: string) {
    setSearch(val);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => load(val, filterType, filterFica, filterCategory), 350);
  }

  function applyFilter(type: typeof filterType, fica: typeof filterFica, cat: typeof filterCategory) {
    setFilterType(type); setFilterFica(fica); setFilterCategory(cat);
    load(search, type, fica, cat);
  }

  async function handleCreate() {
    const d = createDraft;
    if (!d.fullName?.trim()) { showToast("error", "Name required", "Enter the client's full name."); return; }
    if (d.clientType === "natural_person" && !d.firstName?.trim()) { showToast("error", "First name required", "Enter first name."); return; }
    setCreating(true);
    try {
      const res = await createClient(d);
      if (res?.client) {
        setClients(prev => [res.client, ...prev]);
        setTotal(t => t + 1);
        setShowCreate(false);
        setCreateDraft({ ...EMPTY_CLIENT });
        setCreateStep(0);
        log(`Created client: ${res.client.fullName}`);
        showToast("success", "Client added", res.client.fullName);
        setSelected(res.client);
        setDetailTab("profile");
      } else {
        showToast("error", "Failed", "Could not create client.");
      }
    } catch (err) {
      showToast("error", "Could not create client", err instanceof Error ? err.message : "Server rejected the request.");
    } finally {
      setCreating(false);
    }
  }

  async function handleSaveEdit() {
    if (!selected) return;
    setSaving(true);
    const res = await updateClient(selected.id, editDraft);
    setSaving(false);
    if (res?.client) {
      setClients(prev => prev.map(c => c.id === res.client.id ? res.client : c));
      setSelected(res.client);
      setEditing(false);
      showToast("success", "Saved", "Client record updated.");
    } else {
      showToast("error", "Save failed", "Could not save changes.");
    }
  }

  async function handleArchive(client: Client) {
    const res = await archiveClient(client.id);
    if (res?.client) {
      setClients(prev => prev.filter(c => c.id !== client.id));
      setTotal(t => t - 1);
      if (selected?.id === client.id) setSelected(null);
      showToast("info", "Archived", `${client.fullName} moved to archive.`);
    }
  }

  function startEdit(client: Client) {
    setEditDraft({ ...client });
    setEditing(true);
  }

  // Auto-populate fullName from first+last in create form
  function setCreateField(key: keyof Client, value: unknown) {
    setCreateDraft(d => {
      const updated = { ...d, [key]: value };
      if ((key === "firstName" || key === "lastName") && updated.clientType === "natural_person") {
        updated.fullName = `${updated.firstName || ""} ${updated.lastName || ""}`.trim();
      }
      // Auto-parse SA ID
      if (key === "saIdNumber" && typeof value === "string") {
        const parsed = parseSaId(value);
        if (parsed) {
          updated.dateOfBirth = parsed.dob;
          updated.gender = parsed.gender as Client["gender"];
          updated.nationality = parsed.citizenship;
        }
      }
      return updated;
    });
  }

  function setEditField(key: keyof Client, value: unknown) {
    setEditDraft(d => {
      const updated = { ...d, [key]: value };
      if ((key === "firstName" || key === "lastName") && updated.clientType === "natural_person") {
        updated.fullName = `${updated.firstName || ""} ${updated.lastName || ""}`.trim();
      }
      if (key === "saIdNumber" && typeof value === "string") {
        const parsed = parseSaId(value);
        if (parsed) {
          updated.dateOfBirth = parsed.dob;
          updated.gender = parsed.gender as Client["gender"];
          updated.nationality = parsed.citizenship;
        }
      }
      return updated;
    });
  }

  // ── Derived metrics ──────────────────────────────────────────────────────────
  const totalAll     = total;
  const compliantCount  = clients.filter(c => c.ficaStatus === "compliant").length;
  const pendingCount    = clients.filter(c => c.ficaStatus === "pending" || c.ficaStatus === "expired" || c.ficaStatus === "non_compliant").length;
  const vipCount        = clients.filter(c => c.clientCategory === "vip").length;

  // ── Detail view ──────────────────────────────────────────────────────────────
  if (selected) {
    const c = editing ? editDraft as Client : selected;
    const f = (key: keyof Client) => (val: unknown) => setEditField(key, val);

    return (
      <div className="clients-view">
        {/* Back bar */}
        <div className="topbar" style={{ marginBottom: "1.5rem" }}>
          <button className="ghost small" onClick={() => { setSelected(null); setEditing(false); }}>← All Clients</button>
          <div className="top-actions">
            {editing ? (
              <>
                <button className="ghost" onClick={() => setEditing(false)}>Cancel</button>
                <button className="primary" disabled={saving} onClick={handleSaveEdit}>{saving ? "Saving…" : "Save Changes"}</button>
              </>
            ) : (
              <>
                <button className="ghost small" onClick={() => startEdit(selected)}>Edit</button>
                <button className="ghost small" style={{ color: "var(--rose)" }} onClick={() => handleArchive(selected)}>Archive</button>
              </>
            )}
          </div>
        </div>

        {/* Client header */}
        <div className="client-head" style={{ marginBottom: "1.5rem", gap: "1.25rem" }}>
          <div className="client-avatar">{initials(selected.fullName)}</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <h1 style={{ margin: 0, fontSize: "clamp(1.5rem, 3vw, 2.4rem)" }}>{selected.fullName}</h1>
            <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", marginTop: "0.5rem", alignItems: "center" }}>
              <span className="pill" style={{ background: "var(--surface)" }}>{typeLabel(selected.clientType)}</span>
              <span className={ficaPillClass(selected.ficaStatus)}>{FICA_LABELS[selected.ficaStatus]}</span>
              <span className={riskPillClass(selected.riskRating)}>{RISK_LABELS[selected.riskRating]}</span>
              <span className={categoryPillClass(selected.clientCategory)}>{selected.clientCategory.charAt(0).toUpperCase() + selected.clientCategory.slice(1)}</span>
              {selected.conflictsChecked && <span className="pill risk-low">Conflicts ✓</span>}
              {selected.isPep && <span className="pill risk-high">PEP</span>}
            </div>
            <div style={{ marginTop: "0.5rem", fontSize: "0.87rem", color: "var(--muted)", display: "flex", gap: "1.25rem", flexWrap: "wrap" }}>
              {selected.email && <span>✉ {selected.email}</span>}
              {selected.mobile && <span>📱 {selected.mobile}</span>}
              {selected.relationshipPartner && <span>⚖️ {selected.relationshipPartner}</span>}
              {selected.clientSince && <span>Client since {fmtDate(selected.clientSince)}</span>}
            </div>
          </div>
        </div>

        {/* Detail tabs */}
        <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", marginBottom: "1.25rem" }}>
          {DETAIL_TABS.map(t => (
            <button key={t.key} className={detailTab === t.key ? "primary small" : "ghost small"} onClick={() => setDetailTab(t.key)}>{t.label}</button>
          ))}
        </div>

        <div className="panel">
          <ClientDetailPanel tab={detailTab} c={c} editing={editing} setField={f} saProvinces={SA_PROVINCES} clientTypes={CLIENT_TYPES} activityTypes={ACTIVITY_TYPES} referralSources={REFERRAL_SOURCES} />
        </div>
      </div>
    );
  }

  // ── List view ────────────────────────────────────────────────────────────────
  return (
    <div className="clients-view">
      <div className="topbar">
        <h1>Clients</h1>
        <div className="top-actions">
          <button className="primary" onClick={() => { setShowCreate(true); setCreateStep(0); setCreateDraft({ ...EMPTY_CLIENT }); }}>+ New Client</button>
        </div>
      </div>

      <section className="metrics">
        <div className="metric"><span>Total Clients</span><strong>{totalAll}</strong><small>Active in practice</small></div>
        <div className="metric"><span>FICA Compliant</span><strong>{compliantCount}</strong><small>Verified &amp; current</small></div>
        <div className="metric"><span>FICA Action Needed</span><strong>{pendingCount}</strong><small>Pending, expired or non-compliant</small></div>
        <div className="metric"><span>VIP Clients</span><strong>{vipCount}</strong><small>Priority relationship</small></div>
      </section>

      {/* Search + filters */}
      <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap", alignItems: "center", marginBottom: "1rem" }}>
        <div style={{ position: "relative", flex: "1 1 260px" }}>
          <input
            type="text"
            placeholder="Search by name, email, ID, registration number…"
            value={search}
            onChange={e => handleSearch(e.target.value)}
            style={{ paddingLeft: "2.25rem" }}
          />
          <span style={{ position: "absolute", left: "0.75rem", top: "50%", transform: "translateY(-50%)", color: "var(--muted)", pointerEvents: "none" }}>🔍</span>
        </div>
        <button className={!filterType && !filterFica && !filterCategory ? "primary small" : "ghost small"} onClick={() => applyFilter("", "", "")}>All</button>
        <button className={filterType === "natural_person" ? "primary small" : "ghost small"} onClick={() => applyFilter("natural_person", filterFica, filterCategory)}>Individuals</button>
        <button className={filterType !== "" && filterType !== "natural_person" ? "primary small" : "ghost small"} onClick={() => applyFilter("company", filterFica, filterCategory)}>Entities</button>
        <button className={filterCategory === "vip" ? "primary small" : "ghost small"} onClick={() => applyFilter(filterType, filterFica, "vip")}>VIP</button>
        <button className={filterFica === "pending" ? "primary small" : "ghost small"} onClick={() => applyFilter(filterType, "pending", filterCategory)}>FICA Pending</button>
        <button className={filterCategory === "prospect" ? "primary small" : "ghost small"} onClick={() => applyFilter(filterType, filterFica, "prospect")}>Prospects</button>
      </div>

      <div className="panel">
        <div className="panel-head">
          <h3>Clients</h3>
          <span className="pill">{total} {total === 1 ? "client" : "clients"}</span>
        </div>

        {loading ? (
          <p style={{ padding: "1rem", color: "var(--muted)" }}>Loading clients…</p>
        ) : clients.length === 0 ? (
          <div style={{ padding: "2rem", textAlign: "center", color: "var(--muted)" }}>
            <p style={{ fontSize: "1rem", marginBottom: "0.5rem" }}>No clients found.</p>
            <button className="primary small" onClick={() => setShowCreate(true)}>+ Add your first client</button>
          </div>
        ) : (
          <div className="clients-table">
            {/* Header */}
            <div className="client-row client-row-head">
              <span>Client</span><span>Contact</span><span>FICA</span><span>Risk</span><span>Partner</span><span>Since</span><span></span>
            </div>
            {clients.map(client => (
              <div key={client.id} className="client-row" onClick={() => { setSelected(client); setDetailTab("profile"); setEditing(false); }} style={{ cursor: "pointer" }}>
                <span style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
                  <span className="client-avatar client-avatar-sm">{initials(client.fullName)}</span>
                  <span>
                    <strong style={{ display: "block" }}>{client.fullName}</strong>
                    <small style={{ color: "var(--muted)" }}>{typeLabel(client.clientType)}</small>
                  </span>
                </span>
                <span>
                  {client.email ? <span style={{ display: "block", fontSize: "0.875rem" }}>{client.email}</span> : null}
                  {client.mobile ? <span style={{ display: "block", fontSize: "0.875rem", color: "var(--muted)" }}>{client.mobile}</span> : null}
                </span>
                <span><span className={ficaPillClass(client.ficaStatus)}>{FICA_LABELS[client.ficaStatus]}</span></span>
                <span><span className={riskPillClass(client.riskRating)}>{RISK_LABELS[client.riskRating]}</span></span>
                <span style={{ fontSize: "0.875rem", color: "var(--muted)" }}>{client.relationshipPartner || "—"}</span>
                <span style={{ fontSize: "0.875rem", color: "var(--muted)" }}>{fmtDate(client.clientSince) !== "—" ? fmtDate(client.clientSince) : "—"}</span>
                <span onClick={e => e.stopPropagation()}>
                  <button className="ghost small" onClick={() => { setSelected(client); startEdit(client); setDetailTab("profile"); }}>Edit</button>
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {showCreate && (
        <CreateClientModal
          step={createStep} setStep={setCreateStep}
          draft={createDraft} setField={setCreateField}
          creating={creating}
          onSubmit={handleCreate}
          onClose={() => { setShowCreate(false); setCreateStep(0); setCreateDraft({ ...EMPTY_CLIENT }); }}
          clientTypes={CLIENT_TYPES} saProvinces={SA_PROVINCES}
          activityTypes={ACTIVITY_TYPES} referralSources={REFERRAL_SOURCES}
        />
      )}
    </div>
  );
}

// ─── ClientDetailPanel ────────────────────────────────────────────────────────

function ClientDetailPanel({ tab, c, editing, setField, saProvinces, clientTypes, activityTypes, referralSources }: {
  tab: DetailTab; c: Client; editing: boolean; setField: SetField;
  saProvinces: string[]; clientTypes: { value: ClientType; label: string }[];
  activityTypes: string[]; referralSources: string[];
}) {
  const ro = !editing; // read-only shorthand
  const Field = ({ label, value, fieldKey, type = "text", children }: {
    label: string; value: string | number | boolean; fieldKey: keyof Client;
    type?: string; children?: React.ReactNode;
  }) => (
    <div className="client-field">
      <label style={{ display: "grid", gap: "4px", color: "var(--muted)", fontSize: "0.8rem", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.04em" }}>
        {label}
        {children ? children : ro
          ? <span style={{ color: "var(--ink)", fontSize: "0.9375rem", fontWeight: 400, textTransform: "none", letterSpacing: 0 }}>{value || "—"}</span>
          : <input type={type} value={String(value ?? "")} onChange={e => setField(fieldKey, type === "number" ? Number(e.target.value) : e.target.value)} />
        }
      </label>
    </div>
  );

  const Select = ({ label, fieldKey, value, options }: { label: string; fieldKey: keyof Client; value: string; options: { value: string; label: string }[] }) => (
    <div className="client-field">
      <label style={{ display: "grid", gap: "4px", color: "var(--muted)", fontSize: "0.8rem", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.04em" }}>
        {label}
        {ro
          ? <span style={{ color: "var(--ink)", fontSize: "0.9375rem", fontWeight: 400, textTransform: "none", letterSpacing: 0 }}>{options.find(o => o.value === value)?.label || value || "—"}</span>
          : <select value={value} onChange={e => setField(fieldKey, e.target.value)}>
              <option value="">— select —</option>
              {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
        }
      </label>
    </div>
  );

  const isEntity = c.clientType !== "natural_person";

  if (tab === "profile") return (
    <div className="detail-section-grid">
      <div className="detail-col">
        <h4 className="section-heading">Classification</h4>
        <Select label="Client Type" fieldKey="clientType" value={c.clientType} options={clientTypes} />
        <Select label="Category" fieldKey="clientCategory" value={c.clientCategory} options={[
          {value:"vip",label:"VIP"},{value:"standard",label:"Standard"},{value:"inactive",label:"Inactive"},{value:"prospect",label:"Prospect"}
        ]} />
        <Field label="Client Since" value={c.clientSince} fieldKey="clientSince" type="date" />
        <Select label="Referral Source" fieldKey="referralSource" value={c.referralSource} options={referralSources.map(r => ({value:r,label:r}))} />
      </div>
      <div className="detail-col">
        <h4 className="section-heading">Relationship</h4>
        <Field label="Relationship Partner" value={c.relationshipPartner} fieldKey="relationshipPartner" />
        <Field label="Originating Attorney" value={c.originatingAttorney} fieldKey="originatingAttorney" />
        <div className="client-field">
          <label style={{ display: "grid", gap: "4px", color: "var(--muted)", fontSize: "0.8rem", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.04em" }}>
            Nature of Business / Legal Mandate
            {ro
              ? <span style={{ color: "var(--ink)", fontSize: "0.9375rem", fontWeight: 400, textTransform: "none", letterSpacing: 0 }}>{c.natureOfBusiness || "—"}</span>
              : <select value={c.natureOfBusiness} onChange={e => setField("natureOfBusiness", e.target.value)}>
                  <option value="">— select —</option>
                  {activityTypes.map(a => <option key={a} value={a}>{a}</option>)}
                </select>
            }
          </label>
        </div>
      </div>
    </div>
  );

  if (tab === "identity") return (
    <div className="detail-section-grid">
      {!isEntity ? (
        <>
          <div className="detail-col">
            <h4 className="section-heading">Personal Details</h4>
            <Field label="First Name" value={c.firstName} fieldKey="firstName" />
            <Field label="Last Name" value={c.lastName} fieldKey="lastName" />
            <Field label="SA Identity Number (13 digits)" value={c.saIdNumber} fieldKey="saIdNumber" />
            <Field label="Date of Birth" value={c.dateOfBirth} fieldKey="dateOfBirth" type="date" />
            <Select label="Gender" fieldKey="gender" value={c.gender} options={[
              {value:"male",label:"Male"},{value:"female",label:"Female"},{value:"non_binary",label:"Non-binary"},{value:"prefer_not_to_say",label:"Prefer not to say"}
            ]} />
            <Field label="Nationality / Citizenship" value={c.nationality} fieldKey="nationality" />
          </div>
          <div className="detail-col">
            <h4 className="section-heading">Additional Identity</h4>
            <Field label="Passport Number" value={c.passportNumber} fieldKey="passportNumber" />
            <Field label="Passport Country" value={c.passportCountry} fieldKey="passportCountry" />
            <Field label="SARS Income Tax Reference" value={c.incomeTaxRef} fieldKey="incomeTaxRef" />
          </div>
        </>
      ) : (
        <>
          <div className="detail-col">
            <h4 className="section-heading">Entity Details</h4>
            <Select label="Entity Type" fieldKey="clientType" value={c.clientType} options={clientTypes.filter(t => t.value !== "natural_person")} />
            <Field label="Registered Name" value={c.registeredName} fieldKey="registeredName" />
            <Field label="Trading Name" value={c.tradingName} fieldKey="tradingName" />
            <Field label="Registration Number (CIPC)" value={c.registrationNumber} fieldKey="registrationNumber" />
            <Field label="Registration Date" value={c.registrationDate} fieldKey="registrationDate" type="date" />
          </div>
          <div className="detail-col">
            <h4 className="section-heading">Tax & VAT</h4>
            <Field label="VAT Registration Number" value={c.vatNumber} fieldKey="vatNumber" />
            <Field label="SARS Tax Reference" value={c.incomeTaxRef} fieldKey="incomeTaxRef" />
          </div>
        </>
      )}
    </div>
  );

  if (tab === "contact") return (
    <div className="detail-section-grid">
      <div className="detail-col">
        <h4 className="section-heading">Contact Details</h4>
        <Field label="Email (Primary)" value={c.email} fieldKey="email" type="email" />
        <Field label="Email (Alternate)" value={c.emailAlt} fieldKey="emailAlt" type="email" />
        <Field label="Mobile (+27)" value={c.mobile} fieldKey="mobile" />
        <Field label="Landline" value={c.phoneLandline} fieldKey="phoneLandline" />
        <Field label="WhatsApp Number" value={c.whatsappNumber} fieldKey="whatsappNumber" />
        <Select label="Preferred Contact Method" fieldKey="preferredContact" value={c.preferredContact} options={[
          {value:"email",label:"Email"},{value:"mobile",label:"Mobile"},{value:"whatsapp",label:"WhatsApp"},{value:"phone",label:"Landline"}
        ]} />
      </div>
      <div className="detail-col">
        <h4 className="section-heading">Physical / Residential Address</h4>
        <Field label="Address Line 1" value={c.addressLine1} fieldKey="addressLine1" />
        <Field label="Address Line 2" value={c.addressLine2} fieldKey="addressLine2" />
        <Field label="Suburb" value={c.suburb} fieldKey="suburb" />
        <Field label="City" value={c.city} fieldKey="city" />
        <Select label="Province" fieldKey="province" value={c.province} options={saProvinces.map(p => ({value:p,label:p}))} />
        <Field label="Postal Code" value={c.postalCode} fieldKey="postalCode" />
        <Field label="Country" value={c.country} fieldKey="country" />
        {!ro && (
          <label style={{ display:"flex", alignItems:"center", gap:"0.5rem", marginTop:"0.75rem", cursor:"pointer", fontSize:"0.875rem" }}>
            <input type="checkbox" checked={c.postalSameAsPhysical} onChange={e => setField("postalSameAsPhysical", e.target.checked)} style={{width:16,height:16}} />
            Postal address same as physical
          </label>
        )}
        {!c.postalSameAsPhysical && (
          <>
            <h4 className="section-heading" style={{marginTop:"1rem"}}>Postal Address</h4>
            <Field label="Postal Line 1" value={c.postalLine1} fieldKey="postalLine1" />
            <Field label="Postal Suburb" value={c.postalSuburb} fieldKey="postalSuburb" />
            <Field label="Postal City" value={c.postalCity} fieldKey="postalCity" />
            <Field label="Postal Code" value={c.postalCodePost} fieldKey="postalCodePost" />
          </>
        )}
        {ro && c.postalSameAsPhysical && <p style={{fontSize:"0.85rem",color:"var(--muted)",marginTop:"0.5rem"}}>Postal address same as physical.</p>}
      </div>
    </div>
  );

  if (tab === "fica") return (
    <div className="detail-section-grid">
      <div className="detail-col">
        <h4 className="section-heading">FICA Status (§21 FIC Act)</h4>
        <Select label="FICA Status" fieldKey="ficaStatus" value={c.ficaStatus} options={[
          {value:"pending",label:"Pending"},{value:"compliant",label:"Compliant"},{value:"non_compliant",label:"Non-Compliant"},{value:"expired",label:"Expired"},{value:"exempt",label:"Exempt"}
        ]} />
        <Field label="FICA Verified Date" value={c.ficaVerifiedAt?.slice(0,10)||""} fieldKey="ficaVerifiedAt" type="date" />
        <Field label="FICA Expiry Date" value={c.ficaExpiresAt?.slice(0,10)||""} fieldKey="ficaExpiresAt" type="date" />
        <Select label="Risk Rating" fieldKey="riskRating" value={c.riskRating} options={[
          {value:"unrated",label:"Unrated"},{value:"low",label:"Low Risk"},{value:"medium",label:"Medium Risk"},{value:"high",label:"High Risk"},{value:"pep",label:"PEP — Politically Exposed Person"}
        ]} />
        {!ro
          ? <label style={{display:"flex",alignItems:"center",gap:"0.5rem",marginTop:"0.5rem",cursor:"pointer",fontSize:"0.875rem"}}>
              <input type="checkbox" checked={c.isPep} onChange={e => setField("isPep", e.target.checked)} style={{width:16,height:16}} />
              Politically Exposed Person (PEP)
            </label>
          : c.isPep && <p style={{color:"var(--rose)",fontWeight:700,fontSize:"0.875rem"}}>⚠ PEP declared</p>
        }
        {(c.isPep || !ro) && <Field label="PEP Details" value={c.pepDetails} fieldKey="pepDetails" />}
        <Field label="Sanctions Last Checked" value={c.sanctionsCheckedAt?.slice(0,10)||""} fieldKey="sanctionsCheckedAt" type="date" />
        {!ro
          ? <Select label="Sanctions Clear" fieldKey="sanctionsClear" value={String(c.sanctionsClear??"")} options={[{value:"true",label:"Clear"},{value:"false",label:"Match found"}]} />
          : <div className="client-field"><label style={{display:"grid",gap:4,color:"var(--muted)",fontSize:"0.8rem",fontWeight:600,textTransform:"uppercase",letterSpacing:"0.04em"}}>Sanctions<span style={{color:"var(--ink)",fontSize:"0.9375rem",fontWeight:400,textTransform:"none",letterSpacing:0}}>{c.sanctionsClear===true?"Clear ✓":c.sanctionsClear===false?"⚠ Match found":"—"}</span></label></div>
        }
      </div>
      <div className="detail-col">
        <h4 className="section-heading">Source of Funds &amp; Wealth</h4>
        <div className="client-field"><label style={{display:"grid",gap:4,color:"var(--muted)",fontSize:"0.8rem",fontWeight:600,textTransform:"uppercase",letterSpacing:"0.04em"}}>Source of Funds{ro?<span style={{color:"var(--ink)",fontSize:"0.9375rem",fontWeight:400,textTransform:"none",letterSpacing:0}}>{c.sourceOfFunds||"—"}</span>:<textarea rows={2} style={{minHeight:"unset"}} value={c.sourceOfFunds} onChange={e=>setField("sourceOfFunds",e.target.value)}/>}</label></div>
        <div className="client-field"><label style={{display:"grid",gap:4,color:"var(--muted)",fontSize:"0.8rem",fontWeight:600,textTransform:"uppercase",letterSpacing:"0.04em"}}>Source of Wealth{ro?<span style={{color:"var(--ink)",fontSize:"0.9375rem",fontWeight:400,textTransform:"none",letterSpacing:0}}>{c.sourceOfWealth||"—"}</span>:<textarea rows={2} style={{minHeight:"unset"}} value={c.sourceOfWealth} onChange={e=>setField("sourceOfWealth",e.target.value)}/>}</label></div>
        <h4 className="section-heading" style={{marginTop:"1rem"}}>Conflict of Interest Check</h4>
        {!ro
          ? <label style={{display:"flex",alignItems:"center",gap:"0.5rem",cursor:"pointer",fontSize:"0.875rem"}}>
              <input type="checkbox" checked={c.conflictsChecked} onChange={e=>setField("conflictsChecked",e.target.checked)} style={{width:16,height:16}} />
              Conflict check completed
            </label>
          : <p style={{fontSize:"0.875rem",color:c.conflictsChecked?"var(--green)":"var(--rose)",fontWeight:700}}>{c.conflictsChecked?"✓ Completed":"⚠ Not yet completed"}{c.conflictsCheckedBy?` — ${c.conflictsCheckedBy}`:""}{c.conflictsCheckedAt?` on ${fmtDate(c.conflictsCheckedAt)}`:""}</p>
        }
        {!ro && <Field label="Checked By" value={c.conflictsCheckedBy} fieldKey="conflictsCheckedBy" />}
        {!ro && <Field label="Date Checked" value={c.conflictsCheckedAt?.slice(0,10)||""} fieldKey="conflictsCheckedAt" type="date" />}
        <div className="client-field"><label style={{display:"grid",gap:4,color:"var(--muted)",fontSize:"0.8rem",fontWeight:600,textTransform:"uppercase",letterSpacing:"0.04em"}}>Conflict Notes{ro?<span style={{color:"var(--ink)",fontSize:"0.9375rem",fontWeight:400,textTransform:"none",letterSpacing:0}}>{c.conflictsNotes||"—"}</span>:<textarea rows={2} style={{minHeight:"unset"}} value={c.conflictsNotes} onChange={e=>setField("conflictsNotes",e.target.value)}/>}</label></div>
      </div>
    </div>
  );

  if (tab === "billing") return (
    <div className="detail-section-grid">
      <div className="detail-col">
        <h4 className="section-heading">Billing Defaults</h4>
        <div className="client-field"><label style={{display:"grid",gap:4,color:"var(--muted)",fontSize:"0.8rem",fontWeight:600,textTransform:"uppercase",letterSpacing:"0.04em"}}>Default Hourly Rate (ZAR){ro?<span style={{color:"var(--ink)",fontSize:"0.9375rem",fontWeight:400,textTransform:"none",letterSpacing:0}}>R {((c.defaultRateCents||0)/100).toFixed(2)}/hr</span>:<input type="number" min="0" step="50" value={(c.defaultRateCents||0)/100} onChange={e=>setField("defaultRateCents",Math.round(parseFloat(e.target.value||"0")*100))}/>}</label></div>
        <Field label="Payment Terms (days)" value={c.paymentTermsDays} fieldKey="paymentTermsDays" type="number" />
        <div className="client-field"><label style={{display:"grid",gap:4,color:"var(--muted)",fontSize:"0.8rem",fontWeight:600,textTransform:"uppercase",letterSpacing:"0.04em"}}>Credit Limit (ZAR){ro?<span style={{color:"var(--ink)",fontSize:"0.9375rem",fontWeight:400,textTransform:"none",letterSpacing:0}}>{c.creditLimitCents?`R ${(c.creditLimitCents/100).toFixed(2)}`:"No limit set"}</span>:<input type="number" min="0" step="100" value={(c.creditLimitCents||0)/100} onChange={e=>setField("creditLimitCents",Math.round(parseFloat(e.target.value||"0")*100))}/>}</label></div>
        <Field label="Billing Email (if different)" value={c.billingEmail} fieldKey="billingEmail" type="email" />
      </div>
      <div className="detail-col">
        <h4 className="section-heading">Client Portal</h4>
        <Field label="Portal Login Email" value={c.portalEmail} fieldKey="portalEmail" type="email" />
        {!ro
          ? <label style={{display:"flex",alignItems:"center",gap:"0.5rem",marginTop:"0.5rem",cursor:"pointer",fontSize:"0.875rem"}}>
              <input type="checkbox" checked={c.portalActive} onChange={e=>setField("portalActive",e.target.checked)} style={{width:16,height:16}} />
              Portal access active
            </label>
          : <p style={{fontSize:"0.875rem",color:c.portalActive?"var(--green)":"var(--muted)"}}>{c.portalActive?"✓ Portal active":"Portal not active"}</p>
        }
      </div>
    </div>
  );

  if (tab === "notes") return (
    <div style={{padding:"1rem"}}>
      <h4 className="section-heading">Internal Notes</h4>
      <p style={{fontSize:"0.8rem",color:"var(--muted)",marginBottom:"0.75rem"}}>These notes are internal and never shared with the client.</p>
      {ro
        ? <div style={{whiteSpace:"pre-wrap",fontSize:"0.9375rem",lineHeight:1.6,color:c.internalNotes?"var(--ink)":"var(--muted)"}}>{c.internalNotes||"No notes."}</div>
        : <textarea rows={10} style={{width:"100%"}} value={c.internalNotes||""} onChange={e=>setField("internalNotes",e.target.value)} placeholder="Add internal notes about this client…"/>
      }
    </div>
  );

  return null;
}

// ─── CreateClientModal ────────────────────────────────────────────────────────

const CREATE_STEPS = ["Basic Info", "Identity", "Contact", "FICA"];

function CreateClientModal({ step, setStep, draft, setField, creating, onSubmit, onClose, clientTypes, saProvinces, activityTypes, referralSources }: {
  step: number; setStep: (n: number) => void;
  draft: Partial<Client>; setField: (key: keyof Client, value: unknown) => void;
  creating: boolean; onSubmit: () => void; onClose: () => void;
  clientTypes: { value: ClientType; label: string }[];
  saProvinces: string[]; activityTypes: string[]; referralSources: string[];
}) {
  const isEntity = draft.clientType !== "natural_person";

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 640, maxHeight: "90vh", display: "flex", flexDirection: "column", overflowY: "auto" }} onClick={e => e.stopPropagation()}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
          <div>
            <h3 style={{ margin: 0, fontFamily: "var(--font-serif)", fontSize: "1.4rem" }}>New Client</h3>
            <p style={{ margin: "4px 0 0", color: "var(--muted)", fontSize: "0.85rem" }}>{CREATE_STEPS[step]} — Step {step + 1} of {CREATE_STEPS.length}</p>
          </div>
          <button className="ghost small" onClick={onClose}>✕</button>
        </div>

        {/* Progress bar */}
        <div style={{ display: "flex", gap: "0.35rem", marginBottom: "1.25rem" }}>
          {CREATE_STEPS.map((_, i) => (
            <div key={i} style={{ flex: 1, height: 4, borderRadius: 2, background: i <= step ? "var(--green)" : "var(--line)", transition: "background 0.2s" }} />
          ))}
        </div>

        <div style={{ display: "grid", gap: "0.9rem", flex: 1 }}>

          {/* ── Step 0: Basic Info ── */}
          {step === 0 && (<>
            <label>Client type *
              <select value={draft.clientType} onChange={e => setField("clientType", e.target.value)}>
                {clientTypes.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </label>
            {!isEntity ? (
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem" }}>
                <label>First name *<input type="text" value={draft.firstName||""} onChange={e => setField("firstName", e.target.value)} /></label>
                <label>Last name *<input type="text" value={draft.lastName||""} onChange={e => setField("lastName", e.target.value)} /></label>
              </div>
            ) : (
              <label>Registered name *<input type="text" value={draft.registeredName||""} onChange={e => { setField("registeredName", e.target.value); setField("fullName", e.target.value); }} /></label>
            )}
            <label>Full / display name *<input type="text" value={draft.fullName||""} onChange={e => setField("fullName", e.target.value)} /></label>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem" }}>
              <label>Relationship partner<input type="text" value={draft.relationshipPartner||""} onChange={e => setField("relationshipPartner", e.target.value)} /></label>
              <label>Client since<input type="date" value={draft.clientSince||""} onChange={e => setField("clientSince", e.target.value)} /></label>
            </div>
            <label>Nature of legal mandate
              <select value={draft.natureOfBusiness||""} onChange={e => setField("natureOfBusiness", e.target.value)}>
                <option value="">— select —</option>
                {activityTypes.map(a => <option key={a} value={a}>{a}</option>)}
              </select>
            </label>
            <label>Referral source
              <select value={draft.referralSource||""} onChange={e => setField("referralSource", e.target.value)}>
                <option value="">— select —</option>
                {referralSources.map(r => <option key={r} value={r}>{r}</option>)}
              </select>
            </label>
          </>)}

          {/* ── Step 1: Identity ── */}
          {step === 1 && !isEntity && (<>
            <label>SA Identity Number (13 digits)
              <input type="text" maxLength={13} value={draft.saIdNumber||""} onChange={e => setField("saIdNumber", e.target.value)} placeholder="8001015009087" />
              {(draft.saIdNumber||"").length === 13 && <small style={{ color: "var(--green)", marginTop: 2 }}>✓ DOB and gender auto-filled from ID</small>}
            </label>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem" }}>
              <label>Date of birth<input type="date" value={draft.dateOfBirth||""} onChange={e => setField("dateOfBirth", e.target.value)} /></label>
              <label>Gender
                <select value={draft.gender||""} onChange={e => setField("gender", e.target.value)}>
                  <option value="">— select —</option>
                  <option value="male">Male</option><option value="female">Female</option>
                  <option value="non_binary">Non-binary</option><option value="prefer_not_to_say">Prefer not to say</option>
                </select>
              </label>
            </div>
            <label>Nationality / Citizenship<input type="text" value={draft.nationality||"South African"} onChange={e => setField("nationality", e.target.value)} /></label>
            <label>SARS Income Tax Reference<input type="text" value={draft.incomeTaxRef||""} onChange={e => setField("incomeTaxRef", e.target.value)} placeholder="e.g. 1234567890" /></label>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem" }}>
              <label>Passport number<input type="text" value={draft.passportNumber||""} onChange={e => setField("passportNumber", e.target.value)} /></label>
              <label>Passport country<input type="text" value={draft.passportCountry||""} onChange={e => setField("passportCountry", e.target.value)} /></label>
            </div>
          </>)}
          {step === 1 && isEntity && (<>
            <label>CIPC Registration number<input type="text" value={draft.registrationNumber||""} onChange={e => setField("registrationNumber", e.target.value)} placeholder="e.g. 2023/123456/07" /></label>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem" }}>
              <label>Registration date<input type="date" value={draft.registrationDate||""} onChange={e => setField("registrationDate", e.target.value)} /></label>
              <label>VAT number<input type="text" value={draft.vatNumber||""} onChange={e => setField("vatNumber", e.target.value)} /></label>
            </div>
            <label>Trading name (if different)<input type="text" value={draft.tradingName||""} onChange={e => setField("tradingName", e.target.value)} /></label>
            <label>SARS Tax Reference<input type="text" value={draft.incomeTaxRef||""} onChange={e => setField("incomeTaxRef", e.target.value)} /></label>
          </>)}

          {/* ── Step 2: Contact ── */}
          {step === 2 && (<>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem" }}>
              <label>Email (primary)<input type="email" value={draft.email||""} onChange={e => setField("email", e.target.value)} /></label>
              <label>Mobile (+27)<input type="tel" value={draft.mobile||""} onChange={e => setField("mobile", e.target.value)} /></label>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem" }}>
              <label>Landline<input type="tel" value={draft.phoneLandline||""} onChange={e => setField("phoneLandline", e.target.value)} /></label>
              <label>WhatsApp<input type="tel" value={draft.whatsappNumber||""} onChange={e => setField("whatsappNumber", e.target.value)} /></label>
            </div>
            <label>Address line 1<input type="text" value={draft.addressLine1||""} onChange={e => setField("addressLine1", e.target.value)} /></label>
            <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: "0.75rem" }}>
              <label>Suburb<input type="text" value={draft.suburb||""} onChange={e => setField("suburb", e.target.value)} /></label>
              <label>Postal code<input type="text" value={draft.postalCode||""} onChange={e => setField("postalCode", e.target.value)} /></label>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem" }}>
              <label>City<input type="text" value={draft.city||""} onChange={e => setField("city", e.target.value)} /></label>
              <label>Province
                <select value={draft.province||""} onChange={e => setField("province", e.target.value)}>
                  <option value="">— select —</option>
                  {saProvinces.map(p => <option key={p} value={p}>{p}</option>)}
                </select>
              </label>
            </div>
          </>)}

          {/* ── Step 3: FICA ── */}
          {step === 3 && (<>
            <label>FICA Status
              <select value={draft.ficaStatus||"pending"} onChange={e => setField("ficaStatus", e.target.value)}>
                <option value="pending">Pending — documents not yet received</option>
                <option value="compliant">Compliant — verified</option>
                <option value="non_compliant">Non-Compliant</option>
                <option value="expired">Expired — reverification required</option>
                <option value="exempt">Exempt</option>
              </select>
            </label>
            <label>Risk Rating
              <select value={draft.riskRating||"unrated"} onChange={e => setField("riskRating", e.target.value)}>
                <option value="unrated">Unrated</option>
                <option value="low">Low Risk</option>
                <option value="medium">Medium Risk</option>
                <option value="high">High Risk</option>
                <option value="pep">PEP — Politically Exposed Person</option>
              </select>
            </label>
            <label style={{ display: "flex", alignItems: "center", gap: "0.5rem", cursor: "pointer", fontWeight: 400 }}>
              <input type="checkbox" checked={draft.isPep||false} onChange={e => setField("isPep", e.target.checked)} style={{width:16,height:16}} />
              Politically Exposed Person (PEP)
            </label>
            <label style={{ display: "flex", alignItems: "center", gap: "0.5rem", cursor: "pointer", fontWeight: 400 }}>
              <input type="checkbox" checked={draft.conflictsChecked||false} onChange={e => setField("conflictsChecked", e.target.checked)} style={{width:16,height:16}} />
              Conflict of interest check completed before accepting mandate
            </label>
            <label>Source of funds
              <textarea rows={2} style={{minHeight:"unset"}} value={draft.sourceOfFunds||""} onChange={e => setField("sourceOfFunds", e.target.value)} placeholder="Salary, business income, property sale, inheritance…" />
            </label>
          </>)}
        </div>

        {/* Footer */}
        <div style={{ display: "flex", justifyContent: "space-between", paddingTop: "1rem", marginTop: "0.5rem", borderTop: "1px solid var(--line)" }}>
          <button className="ghost" onClick={step > 0 ? () => setStep(step - 1) : onClose}>{step > 0 ? "← Back" : "Cancel"}</button>
          <div style={{ display: "flex", gap: "0.5rem" }}>
            {step < CREATE_STEPS.length - 1 && <button className="ghost small" onClick={() => setStep(step + 1)}>Skip</button>}
            {step < CREATE_STEPS.length - 1
              ? <button className="primary" onClick={() => setStep(step + 1)}>Next →</button>
              : <button className="primary" disabled={creating} onClick={onSubmit}>{creating ? "Creating…" : "Add Client"}</button>
            }
          </div>
        </div>
      </div>
    </div>
  );
}
