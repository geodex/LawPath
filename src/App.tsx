import {
  Archive,
  ArrowRight,
  BookOpenCheck,
  Building2,
  CalendarDays,
  CheckCircle2,
  CircleDollarSign,
  Clock3,
  FilePenLine,
  Home,
  KeyRound,
  LibraryBig,
  LockKeyhole,
  LogIn,
  Mail,
  Plus,
  Search,
  Send,
  ServerCog,
  Settings,
  ShieldCheck,
  Sparkles,
  Split,
  UserPlus,
  UsersRound,
  X
} from "lucide-react";
import { FormEvent, useMemo, useState } from "react";
import { clearToken, forgotPassword, getCurrentUser, login, registerTenant, saveTenantEmailIdentity, sendTestEmail } from "./api";
import { appointments as appointmentSeed, contracts as contractSeed, invoices as invoiceSeed, matters as matterSeed, research as researchSeed, tasks as taskSeed } from "./data";
import type { ApiProviderSettings, Appointment, AssistantTrainingSettings, AuthUser, ContractDraft, Invoice, Matter, NavItem, RagSource, ResearchItem, SmtpSettings, TenantEmailSettings, ViewKey, WorkTask } from "./types";

const nav: NavItem[] = [
  { key: "overview", label: "Overview", icon: Home },
  { key: "drafting", label: "Contracts", icon: FilePenLine },
  { key: "research", label: "Research", icon: Search },
  { key: "secretary", label: "Secretary", icon: Archive },
  { key: "billing", label: "Billing", icon: CircleDollarSign },
  { key: "booking", label: "Bookings", icon: CalendarDays },
  { key: "portal", label: "Portal", icon: UsersRound },
  { key: "settings", label: "Settings", icon: Settings }
];

const money = (value: number) => new Intl.NumberFormat("en-ZA", { style: "currency", currency: "ZAR", maximumFractionDigits: 0 }).format(value);
const today = () => new Date().toISOString().slice(0, 10);
const uid = (prefix: string) => `${prefix}-${Math.random().toString(36).slice(2, 7).toUpperCase()}`;
type Toast = { id: string; type: "success" | "error" | "info"; title: string; message: string };

export function App() {
  const [authMode, setAuthMode] = useState<"landing" | "login" | "register" | "forgot">("landing");
  const [authUser, setAuthUser] = useState<AuthUser | null>(null);
  const [authMessage, setAuthMessage] = useState("Start with the demo workspace or register a firm account.");
  const [authBusy, setAuthBusy] = useState(false);
  const [activeView, setActiveView] = useState<ViewKey>("overview");
  const [portalMode, setPortalMode] = useState<"lawyer" | "client">("lawyer");
  const [matters, setMatters] = useState<Matter[]>(matterSeed);
  const [contracts, setContracts] = useState<ContractDraft[]>(contractSeed);
  const [research, setResearch] = useState<ResearchItem[]>(researchSeed);
  const [tasks, setTasks] = useState<WorkTask[]>(taskSeed);
  const [invoices, setInvoices] = useState<Invoice[]>(invoiceSeed);
  const [appointments, setAppointments] = useState<Appointment[]>(appointmentSeed);
  const [smtpSettings, setSmtpSettings] = useState<SmtpSettings>({
    providerName: "LawPath SMTP",
    host: "smtp.yourfirm.co.za",
    port: 587,
    username: "notifications@yourfirm.co.za",
    password: "",
    encryption: "TLS",
    bounceEmail: "bounces@yourfirm.co.za",
    transactionalEnabled: true,
    systemEnabled: true,
    testRecipient: "admin@yourfirm.co.za"
  });
  const [tenantEmailSettings, setTenantEmailSettings] = useState<TenantEmailSettings>({
    tenantName: "Mokoena & Partners Inc.",
    tenantDomain: "mokoenalaw.co.za",
    fromName: "Mokoena & Partners Conveyancing",
    fromEmail: "transfers@mokoenalaw.co.za",
    replyTo: "transfers@mokoenalaw.co.za",
    portalSignature: "Mokoena & Partners Inc. Conveyancing Department",
    verifiedDomain: true
  });
  const [apiSettings, setApiSettings] = useState<ApiProviderSettings>({
    exchangeRatesApiKey: "",
    exchangeRatesBaseCurrency: "ZAR",
    openAiApiKey: "",
    openAiModel: "gpt-5.2",
    geminiApiKey: "",
    geminiModel: "gemini-3.5-flash",
    grokApiKey: "",
    grokModel: "grok-4"
  });
  const [ragSources, setRagSources] = useState<RagSource[]>([
    { id: "RAG-001", name: "South African conveyancing authorities", scope: "Platform", sourceType: "Case law", status: "Indexed", documentCount: 1280, lastIndexed: "2026-06-04" },
    { id: "RAG-002", name: "Commercial contract clause bank", scope: "Platform", sourceType: "Contract bank", status: "Indexed", documentCount: 342, lastIndexed: "2026-06-02" },
    { id: "RAG-003", name: "Tenant precedent template pack", scope: "Tenant template", sourceType: "Firm precedent", status: "Queued", documentCount: 0, lastIndexed: "Pending" }
  ]);
  const [assistantTraining, setAssistantTraining] = useState<AssistantTrainingSettings>({
    defaultAssistant: "LawPath Legal Assistant",
    retrievalMode: "Balanced",
    chunkSize: 1200,
    topK: 8,
    requireCitations: true,
    allowTenantPrivateSources: true,
    systemInstructions: "Use South African legal context, cite retrieved sources, flag uncertainty, and require attorney review before client-facing legal advice is sent."
  });
  const [emailStatus, setEmailStatus] = useState("SMTP settings not tested in this session.");
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [activity, setActivity] = useState<string[]>([
    "Portal access granted for estate agent on M-1048",
    "Draft shareholder agreement updated",
    "Invoice INV-2409 payment captured",
    "Case-law bundle indexed for conveyancing delays"
  ]);

  const pageTitle = nav.find((item) => item.key === activeView)?.label ?? "Overview";
  const isPlatformSuperAdmin = authUser?.role === "platform_super_admin";

  function log(message: string) {
    setActivity((items) => [message, ...items].slice(0, 8));
  }

  function showToast(type: Toast["type"], title: string, message: string) {
    const id = uid("TOAST");
    setToasts((items) => [{ id, type, title, message }, ...items].slice(0, 4));
    window.setTimeout(() => {
      setToasts((items) => items.filter((toast) => toast.id !== id));
    }, 5200);
  }

  function dismissToast(id: string) {
    setToasts((items) => items.filter((toast) => toast.id !== id));
  }

  async function handleLogin(email: string, password: string) {
    setAuthBusy(true);
    try {
      const user = await login({ email, password });
      setAuthUser(user);
      setAuthMessage("Logged in to the tenant workspace.");
      showToast("success", "Logged in", `Welcome back, ${user.fullName}.`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Login failed.";
      setAuthMessage(message);
      showToast("error", "Login failed", message);
    } finally {
      setAuthBusy(false);
    }
  }

  async function handleRegister(fullName: string, email: string, companyName: string, password: string) {
    setAuthBusy(true);
    const domain = email.includes("@") ? email.split("@")[1] : "yourfirm.co.za";
    try {
      const user = await registerTenant({ fullName, email, companyName, password });
      setTenantEmailSettings((current) => ({
        ...current,
        tenantName: companyName,
        tenantDomain: domain,
        fromName: companyName,
        fromEmail: email,
        replyTo: email,
        portalSignature: `${companyName} Legal Team`,
        verifiedDomain: false
      }));
      setAuthUser(user);
      setAuthMessage(`${companyName} tenant workspace created.`);
      showToast("success", "Tenant created", `${companyName} is ready.`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Registration failed.";
      setAuthMessage(message);
      showToast("error", "Registration failed", message);
    } finally {
      setAuthBusy(false);
    }
  }

  async function handleForgotPassword(email: string) {
    setAuthBusy(true);
    try {
      const response = await forgotPassword(email);
      setAuthMessage(response.message);
      setAuthMode("login");
      showToast("info", "Reset requested", response.message);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Password reset request failed.";
      setAuthMessage(message);
      showToast("error", "Reset failed", message);
    } finally {
      setAuthBusy(false);
    }
  }

  async function handleResumeSession() {
    setAuthBusy(true);
    try {
      const response = await getCurrentUser();
      setAuthUser(response.user);
      setAuthMessage("Session restored.");
      showToast("success", "Session restored", `Signed in as ${response.user.fullName}.`);
    } catch (error) {
      clearToken();
      setAuthMessage("Please login or register to continue.");
      showToast("info", "Login required", "Please login or register to continue.");
    } finally {
      setAuthBusy(false);
    }
  }

  function handleSignOut() {
    clearToken();
    setAuthUser(null);
    setAuthMode("login");
    setAuthMessage("Signed out.");
  }

  if (!authUser) {
    return (
      <>
        <MarketingAuth
          mode={authMode}
          setMode={setAuthMode}
          message={authMessage}
          onLogin={handleLogin}
          onRegister={handleRegister}
          onForgotPassword={handleForgotPassword}
          onResumeSession={handleResumeSession}
          busy={authBusy}
        />
        <ToastStack toasts={toasts} dismissToast={dismissToast} />
      </>
    );
  }

  return (
    <div className="app-shell">
      <Sidebar activeView={activeView} setActiveView={setActiveView} />
      <main className="main">
        <header className="topbar">
          <div>
            <p className="eyebrow">South African legal workspace</p>
            <h1>{pageTitle}</h1>
          </div>
          <div className="top-actions">
            <span className="tenant-chip"><Building2 size={16} /> {authUser.companyName}</span>
            <button className="ghost" onClick={() => setActiveView("research")}>
              <BookOpenCheck size={18} /> Research pack
            </button>
            <button className="primary" onClick={() => setActiveView("drafting")}>
              <Plus size={18} /> New draft
            </button>
            <button className="ghost" onClick={handleSignOut}>
              <LogIn size={18} /> Sign out
            </button>
          </div>
        </header>

        {activeView === "overview" && <Overview matters={matters} tasks={tasks} invoices={invoices} research={research} activity={activity} setActiveView={setActiveView} />}
        {activeView === "drafting" && <Drafting contracts={contracts} setContracts={setContracts} log={log} />}
        {activeView === "research" && <ResearchDesk research={research} setResearch={setResearch} log={log} />}
        {activeView === "secretary" && <Secretary tasks={tasks} setTasks={setTasks} log={log} />}
        {activeView === "billing" && <Billing invoices={invoices} setInvoices={setInvoices} log={log} />}
        {activeView === "booking" && <Booking appointments={appointments} setAppointments={setAppointments} log={log} />}
        {activeView === "portal" && <Portal matters={matters} setMatters={setMatters} portalMode={portalMode} setPortalMode={setPortalMode} log={log} />}
        {activeView === "settings" && (
          <AdminSettings
            settings={smtpSettings}
            setSettings={setSmtpSettings}
            tenantEmailSettings={tenantEmailSettings}
            setTenantEmailSettings={setTenantEmailSettings}
            apiSettings={apiSettings}
            setApiSettings={setApiSettings}
            ragSources={ragSources}
            setRagSources={setRagSources}
            assistantTraining={assistantTraining}
            setAssistantTraining={setAssistantTraining}
            emailStatus={emailStatus}
            setEmailStatus={setEmailStatus}
            showToast={showToast}
            log={log}
            isPlatformSuperAdmin={isPlatformSuperAdmin}
          />
        )}
      </main>
      <ToastStack toasts={toasts} dismissToast={dismissToast} />
    </div>
  );
}

function MarketingAuth({
  mode,
  setMode,
  message,
  onLogin,
  onRegister,
  onForgotPassword,
  onResumeSession,
  busy
}: {
  mode: "landing" | "login" | "register" | "forgot";
  setMode: (mode: "landing" | "login" | "register" | "forgot") => void;
  message: string;
  onLogin: (email: string, password: string) => Promise<void>;
  onRegister: (fullName: string, email: string, companyName: string, password: string) => Promise<void>;
  onForgotPassword: (email: string) => Promise<void>;
  onResumeSession: () => Promise<void>;
  busy: boolean;
}) {
  return (
    <main className="public-page">
      <nav className="public-nav">
        <div className="brand public-brand">
          <div className="brand-mark">LP</div>
          <div>
            <strong>LawPath SA</strong>
            <span>AI practice platform</span>
          </div>
        </div>
        <div className="public-actions">
          <button className="ghost" onClick={() => setMode("login")}><LogIn size={18} /> Login</button>
          <button className="primary" onClick={() => setMode("register")}><UserPlus size={18} /> Register</button>
        </div>
      </nav>

      <section className="public-hero">
        <div className="public-copy">
          <p className="eyebrow">SaaS for South African law firms</p>
          <h1>Run conveyancing, research, drafting, billing and client portals from one tenant-safe workspace.</h1>
          <p>LawPath SA gives each firm its own secure company workspace while platform super admins manage shared AI, email infrastructure and model routing centrally.</p>
          <div className="hero-ctas">
            <button className="primary" onClick={() => setMode("register")}><ArrowRight size={18} /> Start firm account</button>
            <button className="ghost" onClick={() => setMode("login")}><LogIn size={18} /> Login to workspace</button>
          </div>
          <div className="public-proof">
            <span>Multi-tenant data isolation</span>
            <span>Tenant-branded portal emails</span>
            <span>Super-admin AI controls</span>
          </div>
        </div>
        <AuthPanel mode={mode} setMode={setMode} message={message} onLogin={onLogin} onRegister={onRegister} onForgotPassword={onForgotPassword} onResumeSession={onResumeSession} busy={busy} />
      </section>

      <section className="sales-grid">
        <SalesCard icon={FilePenLine} title="Draft legal contracts" text="Generate matter-linked first drafts, review clauses and keep attorney approval in the loop." />
        <SalesCard icon={Search} title="Research at scale" text="Index large case-law bundles, summarize issues and connect authorities to active matters." />
        <SalesCard icon={UsersRound} title="Client portals" text="Invite clients or estate agents to view conveyancing progress without exposing firm data." />
        <SalesCard icon={CircleDollarSign} title="Practice operations" text="Manage invoices, bookings, legal secretary tasks and tenant-branded communications." />
      </section>
    </main>
  );
}

function AuthPanel({
  mode,
  setMode,
  message,
  onLogin,
  onRegister,
  onForgotPassword,
  onResumeSession,
  busy
}: {
  mode: "landing" | "login" | "register" | "forgot";
  setMode: (mode: "landing" | "login" | "register" | "forgot") => void;
  message: string;
  onLogin: (email: string, password: string) => Promise<void>;
  onRegister: (fullName: string, email: string, companyName: string, password: string) => Promise<void>;
  onForgotPassword: (email: string) => Promise<void>;
  onResumeSession: () => Promise<void>;
  busy: boolean;
}) {
  const visibleMode = mode === "landing" ? "register" : mode;

  async function submitLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    await onLogin(String(form.get("email")), String(form.get("password")));
  }

  async function submitRegister(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    await onRegister(String(form.get("fullName")), String(form.get("email")), String(form.get("companyName")), String(form.get("password")));
  }

  async function submitForgot(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    await onForgotPassword(String(form.get("email")));
  }

  return (
    <aside className="auth-card">
      <div className="auth-tabs">
        <button className={visibleMode === "register" ? "active" : ""} onClick={() => setMode("register")}>Register</button>
        <button className={visibleMode === "login" ? "active" : ""} onClick={() => setMode("login")}>Login</button>
      </div>
      <p className="auth-message">{message}</p>

      {visibleMode === "register" && (
        <form className="form" onSubmit={submitRegister}>
          <label>Lawyer name<input name="fullName" defaultValue="Thandi Mokoena" required /></label>
          <label>Company name<input name="companyName" defaultValue="Mokoena & Partners Inc." required /></label>
          <label>Work email<input name="email" type="email" defaultValue="thandi@mokoenalaw.co.za" required /></label>
          <label>Password<input name="password" type="password" defaultValue="Password123!" required /></label>
          <button className="primary" type="submit" disabled={busy}><UserPlus size={18} /> {busy ? "Creating..." : "Create tenant workspace"}</button>
          <button className="link-button" type="button" onClick={() => setMode("login")}>Already have an account?</button>
          <button className="link-button" type="button" onClick={onResumeSession}>Resume saved session</button>
        </form>
      )}

      {visibleMode === "login" && (
        <form className="form" onSubmit={submitLogin}>
          <label>Email<input name="email" type="email" defaultValue="thandi@mokoenalaw.co.za" required /></label>
          <label>Password<input name="password" type="password" defaultValue="Password123!" required /></label>
          <button className="primary" type="submit" disabled={busy}><LogIn size={18} /> {busy ? "Logging in..." : "Login"}</button>
          <button className="link-button" type="button" onClick={() => setMode("forgot")}>Forgot password?</button>
          <button className="link-button" type="button" onClick={onResumeSession}>Resume saved session</button>
        </form>
      )}

      {visibleMode === "forgot" && (
        <form className="form" onSubmit={submitForgot}>
          <label>Account email<input name="email" type="email" defaultValue="thandi@mokoenalaw.co.za" required /></label>
          <button className="primary" type="submit" disabled={busy}><Mail size={18} /> {busy ? "Processing..." : "Send reset link"}</button>
          <button className="link-button" type="button" onClick={() => setMode("login")}>Back to login</button>
        </form>
      )}
    </aside>
  );
}

function SalesCard({ icon: Icon, title, text }: { icon: typeof FilePenLine; title: string; text: string }) {
  return (
    <article className="sales-card">
      <Icon size={22} />
      <strong>{title}</strong>
      <p>{text}</p>
    </article>
  );
}

function Sidebar({ activeView, setActiveView }: { activeView: ViewKey; setActiveView: (view: ViewKey) => void }) {
  return (
    <aside className="sidebar">
      <div className="brand">
        <div className="brand-mark">LP</div>
        <div>
          <strong>LawPath SA</strong>
          <span>Legal practice platform</span>
        </div>
      </div>
      <nav className="nav" aria-label="Main navigation">
        {nav.map((item) => {
          const Icon = item.icon;
          return (
            <button key={item.key} className={activeView === item.key ? "active" : ""} onClick={() => setActiveView(item.key)}>
              <Icon size={18} />
              <span>{item.label}</span>
            </button>
          );
        })}
      </nav>
      <div className="sidebar-card">
        <span>Portal token</span>
        <strong>LP-TRANSFER-8842</strong>
        <small>Share controlled matter progress with clients or estate agents.</small>
      </div>
    </aside>
  );
}

function Overview({
  matters,
  tasks,
  invoices,
  research,
  activity,
  setActiveView
}: {
  matters: Matter[];
  tasks: WorkTask[];
  invoices: Invoice[];
  research: ResearchItem[];
  activity: string[];
  setActiveView: (view: ViewKey) => void;
}) {
  const outstanding = invoices.reduce((sum, invoice) => sum + invoice.amount - invoice.paid, 0);
  const avgProgress = Math.round(matters.reduce((sum, matter) => sum + matter.progress, 0) / matters.length);

  return (
    <>
      <section className="hero">
        <div className="hero-copy">
          <p className="eyebrow">For conveyancers, firms and boutique practices</p>
          <h2>One command centre for drafting, research, client updates and practice admin.</h2>
          <p>Contract automation, case-law indexing, legal secretary workflows, billing, consultation booking and matter-specific client portals in one responsive workspace.</p>
        </div>
        <div className="hero-panel">
          <span>Today</span>
          <strong>{tasks.filter((task) => !task.done).length} open tasks</strong>
          <small>{matters.filter((matter) => matter.risk !== "Low").length} matters need attorney attention</small>
        </div>
      </section>

      <section className="metrics">
        <Metric label="Active matters" value={matters.length.toString()} help="Conveyancing, commercial and estates" />
        <Metric label="Average progress" value={`${avgProgress}%`} help="Client-visible milestones" />
        <Metric label="Recoverable fees" value={money(outstanding)} help="Unpaid balances" />
        <Metric label="Indexed research" value={research.length.toString()} help="Authority bundles and notes" />
      </section>

      <section className="split">
        <Panel title="Live matters" action={<button className="small" onClick={() => setActiveView("portal")}>Open portal</button>}>
          <div className="matter-list">{matters.map((matter) => <MatterCard key={matter.id} matter={matter} />)}</div>
        </Panel>
        <Panel title="Practice activity" badge="Live workspace">
          <div className="timeline">{activity.map((item) => <div key={item}><span /><p>{item}</p></div>)}</div>
        </Panel>
      </section>

      <section className="capability-grid">
        <Capability icon={Sparkles} title="AI legal drafting" text="Generate matter-linked first drafts with compliance prompts, clause libraries and attorney review gates." />
        <Capability icon={Search} title="Research intelligence" text="Index large case-law bundles, tag authorities, and build research packs around South African legal issues." />
        <Capability icon={ShieldCheck} title="Client portals" text="Expose only approved conveyancing milestones, document requests and progress updates to clients or agents." />
      </section>
    </>
  );
}

function Drafting({ contracts, setContracts, log }: { contracts: ContractDraft[]; setContracts: React.Dispatch<React.SetStateAction<ContractDraft[]>>; log: (message: string) => void }) {
  const [preview, setPreview] = useState(contracts[0]?.body ?? "");
  const [fullPreviewOpen, setFullPreviewOpen] = useState(false);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const template = String(form.get("template"));
    const partyA = String(form.get("partyA"));
    const partyB = String(form.get("partyB"));
    const instructions = String(form.get("instructions"));
    const body = buildContractBody(template, partyA, partyB, instructions);
    setPreview(body);
    setContracts((items) => [{ id: uid("C"), name: template, category: "Generated", partyA, partyB, status: "Generated", updated: today(), body }, ...items]);
    log(`Generated ${template} for ${partyA}`);
  }

  return (
    <>
      <section className="grid-two">
        <Panel title="Contract writer" badge="AI-ready workflow">
          <form className="form" onSubmit={submit}>
            <label>Template
              <select name="template">
                <option>Residential offer to purchase</option>
                <option>Shareholder agreement</option>
                <option>Lease agreement</option>
                <option>Employment contract</option>
                <option>Sale of business agreement</option>
                <option>Antenuptial contract intake</option>
              </select>
            </label>
            <label>Party A<input name="partyA" defaultValue="Client name" /></label>
            <label>Party B<input name="partyB" defaultValue="Counterparty name" /></label>
            <label>Key instructions<textarea name="instructions" defaultValue="Include South African jurisdiction, plain-English client summary, POPIA consent, FICA onboarding checklist and signature blocks." /></label>
            <button className="primary" type="submit"><FilePenLine size={18} /> Generate draft</button>
          </form>
        </Panel>
        <Panel
          title="Draft preview"
          action={
            <div className="preview-actions">
              <button className="small" onClick={() => setFullPreviewOpen(true)}>Open full preview</button>
              <button className="small" onClick={() => navigator.clipboard.writeText(preview)}>Copy</button>
            </div>
          }
        >
          <pre className="draft-output">{preview}</pre>
        </Panel>
      </section>
      <Panel title="Contract register" badge={`${contracts.length} drafts`}>
        <div className="table">{contracts.map((contract) => <TableRow key={contract.id} cells={[contract.name, contract.partyA, contract.status, contract.updated]} />)}</div>
      </Panel>
      {fullPreviewOpen && <DocumentPreviewModal body={preview} onClose={() => setFullPreviewOpen(false)} />}
    </>
  );
}

function buildContractBody(template: string, partyA: string, partyB: string, instructions: string) {
  const commonHeader = [
    template.toUpperCase(),
    "",
    "IMPORTANT ATTORNEY REVIEW NOTE",
    "This document is a comprehensive working draft generated from the available instructions. It must be reviewed, completed and approved by a qualified South African legal practitioner before signature or client release.",
    "",
    `Party A: ${partyA}`,
    `Party B: ${partyB}`,
    "Governing law: Republic of South Africa",
    "",
    "Drafting instructions captured:",
    instructions,
    "",
    "------------------------------------------------------------",
    ""
  ].join("\n");

  if (template === "Residential offer to purchase") {
    return commonHeader + [
      "OFFER TO PURCHASE IMMOVABLE PROPERTY",
      "",
      "1. PARTIES",
      `1.1 The Seller is ${partyA}, identity/registration number [insert], of [insert address].`,
      `1.2 The Purchaser is ${partyB}, identity/registration number [insert], of [insert address].`,
      "1.3 Where a party signs through a representative, the signatory warrants that proper authority exists and undertakes to provide proof of authority on request.",
      "",
      "2. PROPERTY",
      "2.1 The Seller offers to sell and the Purchaser offers to purchase the immovable property described as [erf/unit number, township/scheme, title deed number].",
      "2.2 The street address is [insert property address], together with all permanent fixtures and improvements, unless expressly excluded in this agreement.",
      "2.3 The parties acknowledge that the property description in the title deed and deeds office records will prevail if there is a conflict with the street address.",
      "",
      "3. PURCHASE PRICE AND PAYMENT",
      "3.1 The purchase price is R[insert amount].",
      "3.2 The Purchaser shall pay a deposit of R[insert amount] to the conveyancer's trust account within [insert] business days after acceptance.",
      "3.3 The balance of the purchase price shall be secured by an acceptable bank guarantee or other security approved by the Seller within [insert] days after fulfilment or waiver of all suspensive conditions.",
      "3.4 Interest earned on trust funds shall accrue to [Seller/Purchaser] unless otherwise required by law or agreed in writing.",
      "",
      "4. SUSPENSIVE CONDITIONS",
      "4.1 This agreement is subject to the Purchaser obtaining written bond approval for not less than R[insert amount] by [insert date].",
      "4.2 If applicable, this agreement is subject to the sale of the Purchaser's existing property at [insert address] by [insert date].",
      "4.3 A party benefiting from a suspensive condition may waive that condition in writing before the fulfilment date, provided the waiver is lawful and does not prejudice the other party.",
      "4.4 If a suspensive condition is not fulfilled or waived by the due date, this agreement shall lapse and the parties shall be restored as far as possible to their prior positions.",
      "",
      "5. TRANSFER, CONVEYANCER AND COSTS",
      "5.1 Transfer shall be attended to by the conveyancer appointed by [Seller/Purchaser].",
      "5.2 The Purchaser shall pay transfer costs, transfer duty, deeds office fees and conveyancer charges on demand, unless otherwise recorded.",
      "5.3 The Seller shall sign all documents and provide all FICA, rates, levy and compliance documentation reasonably required for transfer.",
      "",
      "6. RATES, LEVIES AND MUNICIPAL CLEARANCE",
      "6.1 The Seller shall remain liable for rates, taxes, levies and utilities up to the date of registration of transfer unless occupational rent applies.",
      "6.2 The Seller shall co-operate in obtaining municipal clearance figures, levy clearance figures and any body corporate or homeowners association certificates required for transfer.",
      "",
      "7. OCCUPATION AND OCCUPATIONAL RENT",
      "7.1 Occupation shall be given on [date/on registration].",
      "7.2 If occupation occurs before registration, the occupying party shall pay occupational rent of R[insert amount] per month, payable monthly in advance.",
      "7.3 Risk in and benefit of the property shall pass on registration unless the parties expressly agree otherwise.",
      "",
      "8. VOETSTOOTS, CONDITION AND DISCLOSURES",
      "8.1 The property is sold voetstoots, subject to all title deed conditions, servitudes, zoning restrictions and municipal requirements.",
      "8.2 The Seller warrants that the Seller has disclosed all known latent defects and all material facts that may affect the Purchaser's decision to purchase.",
      "8.3 The Purchaser acknowledges having inspected the property or having had a reasonable opportunity to do so.",
      "",
      "9. COMPLIANCE CERTIFICATES",
      "9.1 The Seller shall provide electrical, electric fence, gas, beetle, plumbing or other compliance certificates required by law, municipal rule or local practice.",
      "9.2 The cost and timing of repairs required for compliance shall be allocated as follows: [insert allocation].",
      "",
      "10. ESTATE AGENT AND COMMISSION",
      "10.1 The estate agent is [insert agency/agent].",
      "10.2 Commission of R[insert amount] or [insert percentage] plus VAT, if applicable, shall be payable by [Seller/Purchaser] on registration or as otherwise agreed.",
      "",
      "11. FICA, POPIA AND CLIENT INFORMATION",
      "11.1 Each party shall provide documents required under FICA and related anti-money-laundering laws.",
      "11.2 Each party consents to the processing of personal information for purposes of this transaction, transfer, compliance checks, communication and record keeping.",
      "11.3 Personal information shall be processed only for lawful purposes and shared only with persons reasonably involved in the transaction.",
      "",
      "12. BREACH",
      "12.1 If a party breaches this agreement and fails to remedy the breach within [7] days after written notice, the aggrieved party may claim specific performance or cancel and claim damages.",
      "12.2 Legal costs incurred in enforcing this agreement may be recovered on the scale permitted by law or as ordered by a court.",
      "",
      "13. DOMICILIUM AND NOTICES",
      "13.1 The parties choose the addresses set out above as their domicilium citandi et executandi for notices and legal process.",
      "13.2 Notices may also be sent by email to [insert email addresses], provided that formal service requirements remain governed by applicable law.",
      "",
      "14. WHOLE AGREEMENT",
      "14.1 This agreement contains the entire agreement between the parties.",
      "14.2 No amendment, cancellation or waiver shall be valid unless recorded in writing and signed by both parties.",
      "",
      "15. JURISDICTION AND DISPUTE RESOLUTION",
      "15.1 This agreement is governed by South African law.",
      "15.2 The parties consent to the jurisdiction of the competent South African courts, subject to any statutory limits and the nature of the dispute.",
      "",
      "16. SIGNATURE",
      "Signed by the Seller at __________________ on __________________.",
      "Signature: __________________",
      "",
      "Signed by the Purchaser at __________________ on __________________.",
      "Signature: __________________",
      "",
      "ANNEXURES",
      "A. Property disclosure form",
      "B. Fixtures and exclusions schedule",
      "C. FICA checklist",
      "D. Compliance certificate schedule"
    ].join("\n");
  }

  if (template === "Shareholder agreement") {
    return commonHeader + [
      "SHAREHOLDERS AGREEMENT",
      "",
      "1. PARTIES AND COMPANY",
      `1.1 The shareholders are ${partyA}, ${partyB} and any additional shareholders listed in Schedule 1.`,
      "1.2 The company is [insert company name] (Registration number [insert]), a private company incorporated in South Africa.",
      "1.3 This agreement regulates the relationship between the shareholders and their rights and obligations in relation to the company.",
      "",
      "2. DEFINITIONS AND INTERPRETATION",
      "2.1 In this agreement, defined terms include Act, Board, Business Day, Shares, Reserved Matters, Transfer Notice, Fair Market Value and Confidential Information.",
      "2.2 References to the Companies Act mean the Companies Act 71 of 2008 and its regulations, as amended.",
      "2.3 If this agreement conflicts with the memorandum of incorporation, the parties shall procure that the constitutional documents are amended as far as legally permissible.",
      "",
      "3. BUSINESS OF THE COMPANY",
      "3.1 The business of the company is [insert business description].",
      "3.2 The company shall not materially change its business without approval under the reserved matters provisions.",
      "",
      "4. SHARE CAPITAL AND OWNERSHIP",
      "4.1 The issued shares and percentage holdings are recorded in Schedule 1.",
      "4.2 No shares or securities may be issued except in accordance with this agreement, the MOI and the Companies Act.",
      "4.3 Share certificates or uncertificated securities records shall be updated promptly after any lawful transfer.",
      "",
      "5. FUNDING AND SHAREHOLDER LOANS",
      "5.1 Initial funding obligations are recorded in Schedule 2.",
      "5.2 Any shareholder loan shall be recorded in writing, including amount, interest, repayment terms and ranking.",
      "5.3 No shareholder shall be obliged to provide further funding unless expressly agreed.",
      "",
      "6. BOARD, MANAGEMENT AND VOTING",
      "6.1 The board shall consist of [insert number] directors.",
      "6.2 Each shareholder holding at least [insert percentage] may appoint [insert number] director(s).",
      "6.3 Board meetings shall be held at least [monthly/quarterly], with reasonable notice and an agenda.",
      "6.4 A quorum shall require [insert] directors, including at least one director appointed by each major shareholder unless waived.",
      "",
      "7. RESERVED MATTERS",
      "7.1 The company shall not undertake any reserved matter without the required shareholder approval.",
      "7.2 Reserved matters include issuing shares, changing the business, incurring debt above R[insert], selling material assets, approving budgets, appointing auditors, entering related-party transactions, declaring dividends, changing senior management and commencing litigation above R[insert].",
      "7.3 Approval threshold for reserved matters: [unanimous consent / 75 percent / specified shareholders].",
      "",
      "8. TRANSFER OF SHARES",
      "8.1 No shareholder may transfer shares except as permitted by this agreement.",
      "8.2 A selling shareholder must first offer shares to existing shareholders by written transfer notice.",
      "8.3 Existing shareholders shall have pre-emptive rights to purchase pro rata or as otherwise agreed.",
      "8.4 Transfers to permitted transferees may be allowed if the transferee signs a deed of adherence.",
      "",
      "9. TAG-ALONG AND DRAG-ALONG",
      "9.1 If a majority shareholder proposes to sell shares to a third party, minority shareholders shall have tag-along rights on equivalent terms.",
      "9.2 If shareholders holding at least [insert percentage] accept a bona fide third-party offer, they may require remaining shareholders to sell on the same terms, subject to fair process protections.",
      "",
      "10. DEADLOCK",
      "10.1 A deadlock occurs when a reserved matter cannot be approved after [insert number] properly convened meetings.",
      "10.2 Deadlock shall first be escalated to senior representatives for good-faith negotiation.",
      "10.3 If unresolved, the parties may use mediation, expert determination, Russian/Texas shoot-out, buy-sell procedure or another mechanism selected in Schedule 3.",
      "",
      "11. DIVIDENDS AND DISTRIBUTIONS",
      "11.1 Dividend policy shall be determined by the board subject to solvency, liquidity and the Companies Act.",
      "11.2 Unless otherwise agreed, dividends shall be paid pro rata to shareholding.",
      "",
      "12. WARRANTIES",
      "12.1 Each shareholder warrants capacity, authority, lawful ownership of shares and absence of undisclosed encumbrances.",
      "12.2 Founders warrant that disclosed information about the company is accurate in all material respects, subject to Schedule 4 disclosures.",
      "",
      "13. RESTRAINT, CONFIDENTIALITY AND IP",
      "13.1 Shareholders shall keep company confidential information confidential and use it only for company purposes.",
      "13.2 Intellectual property created for the company shall belong to the company unless otherwise agreed in writing.",
      "13.3 Restraint undertakings shall be reasonable in duration, territory and activity and must be reviewed for enforceability.",
      "",
      "14. DEFAULT AND COMPULSORY TRANSFER",
      "14.1 Default events include material breach, insolvency, fraud, prohibited transfer, death, incapacity or ceasing employment where applicable.",
      "14.2 On default, non-defaulting shareholders may have rights to purchase the defaulting shareholder's shares at fair market value or a discounted value, subject to legal review.",
      "",
      "15. VALUATION",
      "15.1 Fair market value shall be determined by agreement or by an independent expert appointed by [SAICA/other body].",
      "15.2 The expert shall act as expert and not arbitrator unless otherwise stated.",
      "",
      "16. DISPUTE RESOLUTION",
      "16.1 The parties shall first attempt good-faith negotiation.",
      "16.2 If unresolved, disputes may be referred to mediation and then arbitration or court proceedings as selected in Schedule 5.",
      "",
      "17. NOTICES",
      "17.1 Notices shall be delivered to the domicilium and email addresses listed in Schedule 6.",
      "17.2 A party may change its notice details by written notice to the others.",
      "",
      "18. GENERAL",
      "18.1 This agreement is the entire agreement between the parties on its subject matter.",
      "18.2 Amendments must be in writing and signed by all parties.",
      "18.3 This agreement is governed by South African law.",
      "",
      "19. SIGNATURE",
      "Signed at __________________ on __________________.",
      "Shareholder signature: __________________",
      "",
      "SCHEDULES",
      "1. Shareholding table",
      "2. Funding and shareholder loans",
      "3. Deadlock mechanism",
      "4. Disclosures",
      "5. Dispute resolution election",
      "6. Domicilium and email details"
    ].join("\n");
  }

  return commonHeader + [
    `${template.toUpperCase()} - COMPREHENSIVE STRUCTURE`,
    "",
    "1. PARTIES",
    `1.1 The parties are ${partyA} and ${partyB}.`,
    "1.2 Each party warrants that it has legal capacity and authority to enter into this agreement.",
    "",
    "2. BACKGROUND",
    "2.1 The background and commercial purpose of this agreement are recorded here.",
    "2.2 The parties intend this agreement to be legally binding under South African law.",
    "",
    "3. DEFINITIONS",
    "3.1 Defined terms must be inserted for all recurring legal and commercial concepts.",
    "",
    "4. OPERATIVE TERMS",
    "4.1 Insert the main rights, duties, deliverables, payment terms, time periods and conditions.",
    "4.2 Include any industry-specific or transaction-specific obligations.",
    "",
    "5. WARRANTIES AND UNDERTAKINGS",
    "5.1 Each party gives standard warranties on authority, accuracy of information and compliance with law.",
    "5.2 Add specific warranties required by the transaction.",
    "",
    "6. CONFIDENTIALITY AND POPIA",
    "6.1 Confidential information must be protected and used only for agreement purposes.",
    "6.2 Personal information must be processed lawfully and only for necessary purposes.",
    "",
    "7. BREACH AND TERMINATION",
    "7.1 A party in breach must remedy breach within the agreed notice period.",
    "7.2 If breach is not remedied, the innocent party may claim specific performance, cancel and/or claim damages.",
    "",
    "8. DISPUTE RESOLUTION",
    "8.1 The parties shall first attempt negotiation, then mediation or court/arbitration as selected.",
    "",
    "9. NOTICES AND DOMICILIUM",
    "9.1 Notices and service addresses must be completed for all parties.",
    "",
    "10. GENERAL",
    "10.1 Whole agreement, variation, waiver, severability, costs and governing law clauses must be included.",
    "",
    "11. SIGNATURE",
    "Signed at __________________ on __________________.",
    "Signature: __________________",
    "",
    "SCHEDULES",
    "A. Commercial terms",
    "B. Compliance checklist",
    "C. Supporting documents"
  ].join("\n");
}

function DocumentPreviewModal({ body, onClose }: { body: string; onClose: () => void }) {
  return (
    <div className="document-modal" role="dialog" aria-modal="true" aria-label="Full document preview">
      <div className="document-modal-bar">
        <div>
          <p className="eyebrow">Full document preview</p>
          <strong>Draft legal document</strong>
        </div>
        <div className="preview-actions">
          <button className="small" onClick={() => navigator.clipboard.writeText(body)}>Copy</button>
          <button className="small" onClick={() => window.print()}>Print</button>
          <button className="small" onClick={onClose}><X size={16} /> Close</button>
        </div>
      </div>
      <div className="document-scroll">
        <article className="document-page">
          <pre>{body}</pre>
        </article>
      </div>
    </div>
  );
}

function ResearchDesk({ research, setResearch, log }: { research: ResearchItem[]; setResearch: React.Dispatch<React.SetStateAction<ResearchItem[]>>; log: (message: string) => void }) {
  const [query, setQuery] = useState("");
  const results = useMemo(() => {
    const term = query.toLowerCase();
    return research.filter((item) => [item.title, item.court, item.year, item.tags.join(" "), item.summary].join(" ").toLowerCase().includes(term));
  }, [query, research]);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const title = String(form.get("title"));
    const item: ResearchItem = {
      id: uid("R"),
      title,
      court: String(form.get("court")),
      year: new Date().getFullYear().toString(),
      tags: String(form.get("tags")).split(",").map((tag) => tag.trim()).filter(Boolean),
      summary: String(form.get("summary"))
    };
    setResearch((items) => [item, ...items]);
    log(`Indexed research bundle: ${title}`);
  }

  return (
    <section className="grid-two">
      <Panel title="Case-law ingestion" badge="Bulk-ready">
        <form className="form" onSubmit={submit}>
          <label>Bundle title<input name="title" defaultValue="New authority bundle" /></label>
          <label>Court or source<input name="court" defaultValue="High Court / SCA / Constitutional Court" /></label>
          <label>Tags<input name="tags" defaultValue="conveyancing, mandate, damages" /></label>
          <label>Research note<textarea name="summary" defaultValue="Paste a large judgment bundle here. The app indexes the text for quick searching, tagging and matter notes." /></label>
          <button className="primary" type="submit"><Archive size={18} /> Index research</button>
        </form>
      </Panel>
      <Panel title="Research search" badge="Local index">
        <label className="searchbox"><Search size={18} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search authorities, tags or notes" /></label>
        <div className="results">{results.map((item) => <article className="result" key={item.id}><strong>{item.title}</strong><span>{item.court} - {item.year}</span><p>{item.summary}</p><small>{item.tags.join(" / ")}</small></article>)}</div>
      </Panel>
    </section>
  );
}

function Secretary({ tasks, setTasks, log }: { tasks: WorkTask[]; setTasks: React.Dispatch<React.SetStateAction<WorkTask[]>>; log: (message: string) => void }) {
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const title = String(form.get("title"));
    setTasks((items) => [{ id: uid("T"), title, owner: String(form.get("owner")), due: String(form.get("due")), done: false, priority: String(form.get("priority")) as WorkTask["priority"] }, ...items]);
    log(`Added secretary task: ${title}`);
  }

  return (
    <section className="grid-two">
      <Panel title="Legal secretary desk" badge="Workflow capture">
        <form className="form" onSubmit={submit}>
          <label>Task<input name="title" defaultValue="Prepare client update letter" /></label>
          <label>Owner<select name="owner"><option>Legal secretary</option><option>Candidate attorney</option><option>Attorney</option><option>Conveyancer</option></select></label>
          <label>Priority<select name="priority"><option>Normal</option><option>Urgent</option></select></label>
          <label>Due date<input name="due" defaultValue="Tomorrow" /></label>
          <button className="primary" type="submit"><Plus size={18} /> Add task</button>
        </form>
      </Panel>
      <Panel title="Task queue" badge={`${tasks.filter((task) => !task.done).length} open`}>
        <div className="tasks">{tasks.map((task) => <button className={`task ${task.done ? "done" : ""}`} key={task.id} onClick={() => setTasks((items) => items.map((item) => item.id === task.id ? { ...item, done: !item.done } : item))}><CheckCircle2 size={18} /><span>{task.title}<small>{task.owner} - {task.due} - {task.priority}</small></span></button>)}</div>
      </Panel>
    </section>
  );
}

function Billing({ invoices, setInvoices, log }: { invoices: Invoice[]; setInvoices: React.Dispatch<React.SetStateAction<Invoice[]>>; log: (message: string) => void }) {
  const total = invoices.reduce((sum, invoice) => sum + invoice.amount, 0);
  const paid = invoices.reduce((sum, invoice) => sum + invoice.paid, 0);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const client = String(form.get("client"));
    setInvoices((items) => [{ id: uid("INV"), client, matter: String(form.get("matter")), amount: Number(form.get("amount")), paid: 0, status: "Draft" }, ...items]);
    log(`Created draft invoice for ${client}`);
  }

  return (
    <>
      <section className="metrics">
        <Metric label="Fees billed" value={money(total)} help="All active invoices" />
        <Metric label="Collected" value={money(paid)} help="Payments captured" />
        <Metric label="Outstanding" value={money(total - paid)} help="Follow-up required" />
      </section>
      <section className="grid-two">
        <Panel title="Create invoice" badge="VAT-aware fields">
          <form className="form" onSubmit={submit}>
            <label>Client<input name="client" defaultValue="New client" /></label>
            <label>Matter<input name="matter" defaultValue="M-1051" /></label>
            <label>Amount in rand<input name="amount" type="number" defaultValue="12500" /></label>
            <button className="primary" type="submit"><CircleDollarSign size={18} /> Add invoice</button>
          </form>
        </Panel>
        <Panel title="Billing register" badge={`${invoices.length} invoices`}>
          <div className="table">{invoices.map((invoice) => <TableRow key={invoice.id} cells={[invoice.id, invoice.client, money(invoice.amount), invoice.status]} />)}</div>
        </Panel>
      </section>
    </>
  );
}

function Booking({ appointments, setAppointments, log }: { appointments: Appointment[]; setAppointments: React.Dispatch<React.SetStateAction<Appointment[]>>; log: (message: string) => void }) {
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const title = String(form.get("title"));
    setAppointments((items) => [{ id: uid("A"), title, person: String(form.get("person")), time: String(form.get("time")) || "Unscheduled", mode: String(form.get("mode")) as Appointment["mode"] }, ...items]);
    log(`Booked appointment: ${title}`);
  }

  return (
    <section className="grid-two">
      <Panel title="Appointment booking" badge="Client-ready slots">
        <form className="form" onSubmit={submit}>
          <label>Meeting title<input name="title" defaultValue="Consultation" /></label>
          <label>Person<input name="person" defaultValue="Client name" /></label>
          <label>Date and time<input name="time" type="datetime-local" /></label>
          <label>Mode<select name="mode"><option>Office</option><option>Teams</option><option>Phone</option><option>Deeds office</option></select></label>
          <button className="primary" type="submit"><CalendarDays size={18} /> Book appointment</button>
        </form>
      </Panel>
      <Panel title="Calendar" badge={`${appointments.length} bookings`}>
        <div className="appointments">{appointments.map((appointment) => <article className="appointment" key={appointment.id}><div><Clock3 size={18} /><strong>{appointment.title}</strong></div><span>{appointment.person}</span><small>{appointment.time} - {appointment.mode}</small></article>)}</div>
      </Panel>
    </section>
  );
}

function Portal({ matters, setMatters, portalMode, setPortalMode, log }: { matters: Matter[]; setMatters: React.Dispatch<React.SetStateAction<Matter[]>>; portalMode: "lawyer" | "client"; setPortalMode: (mode: "lawyer" | "client") => void; log: (message: string) => void }) {
  const visibleMatters = matters.filter((matter) => matter.portalAccess);

  function toggleAccess(id: string) {
    setMatters((items) => items.map((item) => item.id === id ? { ...item, portalAccess: !item.portalAccess } : item));
    const matter = matters.find((item) => item.id === id);
    if (matter) log(`${matter.portalAccess ? "Revoked" : "Granted"} portal access for ${matter.id}`);
  }

  return (
    <>
      <section className="portal-switch">
        <button className={portalMode === "lawyer" ? "active" : ""} onClick={() => setPortalMode("lawyer")}><LockKeyhole size={18} /> Lawyer view</button>
        <button className={portalMode === "client" ? "active" : ""} onClick={() => setPortalMode("client")}><UsersRound size={18} /> Client / estate agent view</button>
      </section>
      {portalMode === "lawyer" ? (
        <Panel title="Portal access control" badge="Matter-limited sharing">
          <div className="table">{matters.map((matter) => <div className="row" key={matter.id}><span>{matter.id}</span><span>{matter.client}</span><span>{matter.matterType}</span><button className="small" onClick={() => toggleAccess(matter.id)}>{matter.portalAccess ? "Revoke" : "Grant"}</button></div>)}</div>
        </Panel>
      ) : (
        <section className="client-portal">
          <div className="client-head">
            <div>
              <p className="eyebrow">Secure client portal</p>
              <h2>Conveyancing progress</h2>
              <p>Token LP-TRANSFER-8842 shows only approved matters, milestones and next steps.</p>
            </div>
          </div>
          <div className="matter-list">{visibleMatters.map((matter) => <MatterCard key={matter.id} matter={matter} client />)}</div>
        </section>
      )}
    </>
  );
}

function AdminSettings({
  settings,
  setSettings,
  tenantEmailSettings,
  setTenantEmailSettings,
  apiSettings,
  setApiSettings,
  ragSources,
  setRagSources,
  assistantTraining,
  setAssistantTraining,
  emailStatus,
  setEmailStatus,
  showToast,
  log,
  isPlatformSuperAdmin
}: {
  settings: SmtpSettings;
  setSettings: React.Dispatch<React.SetStateAction<SmtpSettings>>;
  tenantEmailSettings: TenantEmailSettings;
  setTenantEmailSettings: React.Dispatch<React.SetStateAction<TenantEmailSettings>>;
  apiSettings: ApiProviderSettings;
  setApiSettings: React.Dispatch<React.SetStateAction<ApiProviderSettings>>;
  ragSources: RagSource[];
  setRagSources: React.Dispatch<React.SetStateAction<RagSource[]>>;
  assistantTraining: AssistantTrainingSettings;
  setAssistantTraining: React.Dispatch<React.SetStateAction<AssistantTrainingSettings>>;
  emailStatus: string;
  setEmailStatus: (status: string) => void;
  showToast: (type: Toast["type"], title: string, message: string) => void;
  log: (message: string) => void;
  isPlatformSuperAdmin: boolean;
}) {
  const [savedAt, setSavedAt] = useState("Not saved yet");
  const [apiSavedAt, setApiSavedAt] = useState("Not saved yet");
  const [settingsBusy, setSettingsBusy] = useState<null | "smtp" | "tenant" | "test" | "api" | "training" | "rag">(null);

  function update<K extends keyof SmtpSettings>(key: K, value: SmtpSettings[K]) {
    setSettings((current) => ({ ...current, [key]: value }));
  }

  function updateTenantEmail<K extends keyof TenantEmailSettings>(key: K, value: TenantEmailSettings[K]) {
    setTenantEmailSettings((current) => ({ ...current, [key]: value }));
  }

  function updateApi<K extends keyof ApiProviderSettings>(key: K, value: ApiProviderSettings[K]) {
    setApiSettings((current) => ({ ...current, [key]: value }));
  }

  function updateTraining<K extends keyof AssistantTrainingSettings>(key: K, value: AssistantTrainingSettings[K]) {
    setAssistantTraining((current) => ({ ...current, [key]: value }));
  }

  function saveSettings(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSettingsBusy("smtp");
    const stamp = new Date().toLocaleString("en-ZA", { dateStyle: "medium", timeStyle: "short" });
    setSavedAt(stamp);
    setEmailStatus(`Platform SMTP transport saved for ${settings.host}:${settings.port}.`);
    log(`Super admin saved platform SMTP transport for ${settings.providerName}`);
    showToast("info", "SMTP noted", "SMTP credentials are saved in the server .env file for secure delivery.");
    setSettingsBusy(null);
  }

  async function saveTenantEmailSettings(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSettingsBusy("tenant");
    try {
      await saveTenantEmailIdentity(tenantEmailSettings);
      const stamp = new Date().toLocaleString("en-ZA", { dateStyle: "medium", timeStyle: "short" });
      setSavedAt(stamp);
      setEmailStatus(`${tenantEmailSettings.tenantName} sender identity saved. Mail still routes through the platform SMTP server.`);
      log(`Tenant sender identity saved for ${tenantEmailSettings.tenantName}`);
      showToast("success", "Sender saved", `${tenantEmailSettings.tenantName} email identity is updated.`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Tenant sender identity could not be saved.";
      setEmailStatus(message);
      showToast("error", "Sender not saved", message);
    } finally {
      setSettingsBusy(null);
    }
  }

  async function testEmail() {
    const missing = [
      ["tenant from email", tenantEmailSettings.fromEmail],
      ["test recipient", settings.testRecipient]
    ].filter(([, value]) => !String(value).trim());

    if (missing.length) {
      const message = `Test blocked: add ${missing.map(([label]) => label).join(", ")}.`;
      setEmailStatus(message);
      showToast("error", "Test blocked", message);
      return;
    }

    setSettingsBusy("test");
    setEmailStatus(`Sending test email to ${settings.testRecipient} using the platform SMTP transport...`);
    showToast("info", "Sending test", `Trying delivery to ${settings.testRecipient}.`);

    try {
      const response = await sendTestEmail({
        recipientEmail: settings.testRecipient,
        tenantFromName: tenantEmailSettings.fromName,
        tenantFromEmail: tenantEmailSettings.fromEmail,
        replyTo: tenantEmailSettings.replyTo
      });
      const message = response.messageId
        ? `Test email sent to ${settings.testRecipient}. Provider message ID: ${response.messageId}.`
        : `Test email sent to ${settings.testRecipient}.`;
      setEmailStatus(message);
      log(`Admin sent SMTP test email to ${settings.testRecipient}`);
      showToast("success", "Test email sent", "Check the recipient inbox and spam folder.");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Test email could not be delivered.";
      setEmailStatus(message);
      log(`SMTP test email failed for ${settings.testRecipient}`);
      showToast("error", "Test email failed", message);
    } finally {
      setSettingsBusy(null);
    }
  }

  function saveApiSettings(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSettingsBusy("api");
    const stamp = new Date().toLocaleString("en-ZA", { dateStyle: "medium", timeStyle: "short" });
    setApiSavedAt(stamp);
    log("Admin saved API provider keys and model selections");
    showToast("info", "API settings noted", "Provider keys should be stored in the server .env file before production use.");
    setSettingsBusy(null);
  }

  function addRagSource(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSettingsBusy("rag");
    const form = new FormData(event.currentTarget);
    const source: RagSource = {
      id: uid("RAG"),
      name: String(form.get("name")),
      scope: String(form.get("scope")) as RagSource["scope"],
      sourceType: String(form.get("sourceType")) as RagSource["sourceType"],
      status: "Queued",
      documentCount: Number(form.get("documentCount") || 0),
      lastIndexed: "Pending"
    };
    setRagSources((items) => [source, ...items]);
    log(`Super admin queued RAG source: ${source.name}`);
    showToast("success", "Source queued", `${source.name} has been added to the indexing queue.`);
    setSettingsBusy(null);
  }

  function saveTrainingSettings(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSettingsBusy("training");
    log(`Super admin saved AI training profile: ${assistantTraining.defaultAssistant}`);
    showToast("success", "Training profile saved", `${assistantTraining.defaultAssistant} settings are updated.`);
    setSettingsBusy(null);
  }

  const configuredProviders = [
    apiSettings.exchangeRatesApiKey,
    apiSettings.openAiApiKey,
    apiSettings.geminiApiKey,
    apiSettings.grokApiKey
  ].filter(Boolean).length;

  return (
    <>
      <section className="settings-hero">
        <div>
          <p className="eyebrow">SaaS administration</p>
          <h2>{isPlatformSuperAdmin ? "Platform super admin settings" : "Tenant settings"}</h2>
          <p>Super admins control shared infrastructure and AI credentials. Tenant admins control only their company sender identity, so portal invitations show the firm while still being delivered through the LawPath mail server.</p>
        </div>
        <div className="status-card">
          <Split size={22} />
          <strong>Multi-tenant isolation</strong>
          <small>{emailStatus}</small>
        </div>
      </section>

      <section className="settings-grid">
        <Panel title="Platform SMTP transport" badge="Super admin only">
          <form className="form" onSubmit={saveSettings}>
            <label>Provider name<input value={settings.providerName} onChange={(event) => update("providerName", event.target.value)} /></label>
            <div className="form-row">
              <label>SMTP host<input value={settings.host} onChange={(event) => update("host", event.target.value)} placeholder="smtp.example.co.za" /></label>
              <label>Port<input type="number" value={settings.port} onChange={(event) => update("port", Number(event.target.value))} /></label>
            </div>
            <div className="form-row">
              <label>Encryption
                <select value={settings.encryption} onChange={(event) => update("encryption", event.target.value as SmtpSettings["encryption"])}>
                  <option>TLS</option>
                  <option>SSL</option>
                  <option>None</option>
                </select>
              </label>
              <label>Username<input value={settings.username} onChange={(event) => update("username", event.target.value)} /></label>
            </div>
            <label>Password or app token<input type="password" value={settings.password} onChange={(event) => update("password", event.target.value)} placeholder="Stored securely on the backend later" /></label>
            <label>Bounce handling email<input type="email" value={settings.bounceEmail} onChange={(event) => update("bounceEmail", event.target.value)} /></label>
            <button className="primary" type="submit" disabled={settingsBusy === "smtp"}><ServerCog size={18} /> {settingsBusy === "smtp" ? "Saving..." : "Save SMTP settings"}</button>
          </form>
        </Panel>

        <Panel title="Tenant sender identity" badge="Tenant admin">
          <form className="form" onSubmit={saveTenantEmailSettings}>
            <label>Company name<input value={tenantEmailSettings.tenantName} onChange={(event) => updateTenantEmail("tenantName", event.target.value)} /></label>
            <label>Verified domain<input value={tenantEmailSettings.tenantDomain} onChange={(event) => updateTenantEmail("tenantDomain", event.target.value)} /></label>
            <label>From name<input value={tenantEmailSettings.fromName} onChange={(event) => updateTenantEmail("fromName", event.target.value)} /></label>
            <label>From email<input type="email" value={tenantEmailSettings.fromEmail} onChange={(event) => updateTenantEmail("fromEmail", event.target.value)} /></label>
            <label>Reply-to email<input type="email" value={tenantEmailSettings.replyTo} onChange={(event) => updateTenantEmail("replyTo", event.target.value)} /></label>
            <label>Portal email signature<textarea value={tenantEmailSettings.portalSignature} onChange={(event) => updateTenantEmail("portalSignature", event.target.value)} /></label>
            <div className="switch-list">
              <label className="switch-row"><input type="checkbox" checked={settings.transactionalEnabled} onChange={(event) => update("transactionalEnabled", event.target.checked)} /> Transactional emails</label>
              <label className="switch-row"><input type="checkbox" checked={settings.systemEnabled} onChange={(event) => update("systemEnabled", event.target.checked)} /> System/admin emails</label>
              <label className="switch-row"><input type="checkbox" checked={tenantEmailSettings.verifiedDomain} onChange={(event) => updateTenantEmail("verifiedDomain", event.target.checked)} /> Domain verified for sender display</label>
            </div>
            <button className="primary" type="submit" disabled={settingsBusy === "tenant"}><Mail size={18} /> {settingsBusy === "tenant" ? "Saving..." : "Save tenant identity"}</button>
          </form>
        </Panel>
      </section>

      <section className="settings-grid">
        <Panel title="Send test email" action={<button className="small" onClick={testEmail} disabled={settingsBusy === "test"}><Send size={16} /> {settingsBusy === "test" ? "Sending..." : "Send test"}</button>}>
          <div className="form">
            <label>Test recipient<input type="email" value={settings.testRecipient} onChange={(event) => update("testRecipient", event.target.value)} /></label>
            <div className="email-preview">
              <strong>Preview</strong>
              <p>Subject: LawPath SA email delivery test</p>
              <small>From {tenantEmailSettings.fromName} &lt;{tenantEmailSettings.fromEmail || "not configured"}&gt; via platform SMTP {settings.host || "missing SMTP host"}</small>
            </div>
          </div>
        </Panel>

        <Panel title="Delivery events" badge="Tenant branded">
          <div className="delivery-list">
            <DeliveryItem title="Portal invitations" text="Client and estate-agent access links for conveyancing matters." enabled={settings.transactionalEnabled} />
            <DeliveryItem title="Appointment reminders" text="Consultation confirmations, reschedules and no-show follow-ups." enabled={settings.transactionalEnabled} />
            <DeliveryItem title="Billing notices" text="Draft invoice approvals, sent invoices and payment reminders." enabled={settings.transactionalEnabled} />
            <DeliveryItem title="System alerts" text="Admin security notices, failed login alerts and daily workflow summaries." enabled={settings.systemEnabled} />
          </div>
          <p className="settings-note">Last saved: {savedAt}</p>
        </Panel>
      </section>

      <section className="scope-grid">
        <article className="scope-card">
          <ShieldCheck size={20} />
          <strong>Platform Super Admin</strong>
          <p>Controls SMTP host, credentials, bounce handling, AI provider keys, exchange-rate API keys and global model routing. Tenants never see these secrets.</p>
        </article>
        <article className="scope-card">
          <UsersRound size={20} />
          <strong>Tenant Admin</strong>
          <p>Controls company name, sender display name, from email, reply-to address and portal email signature for only their tenant.</p>
        </article>
        <article className="scope-card">
          <Mail size={20} />
          <strong>Outbound routing</strong>
          <p>Portal links appear to clients as tenant-branded email, but delivery is sent through the shared LawPath SMTP transport with tenant metadata applied.</p>
        </article>
      </section>

      <section className="integrations-shell">
        <div className="panel-head">
          <div>
            <p className="eyebrow">Super admin only</p>
            <h3>API keys and model routing</h3>
          </div>
          <span className="pill">{configuredProviders} providers configured</span>
        </div>
        <form className="integrations-grid" onSubmit={saveApiSettings}>
          <article className="integration-card">
            <div className="integration-head">
              <KeyRound size={20} />
              <div>
                <strong>ExchangeRates.com</strong>
                <span>Currency conversion for invoices, trust balances and cross-border estimates.</span>
              </div>
            </div>
            <label>API key<input type="password" value={apiSettings.exchangeRatesApiKey} onChange={(event) => updateApi("exchangeRatesApiKey", event.target.value)} placeholder="exr_..." /></label>
            <label>Base currency
              <select value={apiSettings.exchangeRatesBaseCurrency} onChange={(event) => updateApi("exchangeRatesBaseCurrency", event.target.value as ApiProviderSettings["exchangeRatesBaseCurrency"])}>
                <option>ZAR</option>
                <option>USD</option>
                <option>EUR</option>
                <option>GBP</option>
              </select>
            </label>
          </article>

          <article className="integration-card">
            <div className="integration-head">
              <Sparkles size={20} />
              <div>
                <strong>OpenAI</strong>
                <span>Contract drafting, research summaries and legal secretary automations.</span>
              </div>
            </div>
            <label>API key<input type="password" value={apiSettings.openAiApiKey} onChange={(event) => updateApi("openAiApiKey", event.target.value)} placeholder="sk-..." /></label>
            <label>Model
              <select value={apiSettings.openAiModel} onChange={(event) => updateApi("openAiModel", event.target.value)}>
                <option value="gpt-5.2">GPT-5.2</option>
                <option value="gpt-5.1-mini">GPT-5.1 mini</option>
                <option value="gpt-4.1">GPT-4.1</option>
                <option value="o3">o3</option>
              </select>
            </label>
          </article>

          <article className="integration-card">
            <div className="integration-head">
              <Sparkles size={20} />
              <div>
                <strong>Google Gemini</strong>
                <span>Alternative drafting, matter analysis and client-update generation.</span>
              </div>
            </div>
            <label>API key<input type="password" value={apiSettings.geminiApiKey} onChange={(event) => updateApi("geminiApiKey", event.target.value)} placeholder="AIza..." /></label>
            <label>Model
              <select value={apiSettings.geminiModel} onChange={(event) => updateApi("geminiModel", event.target.value as ApiProviderSettings["geminiModel"])}>
                <option value="gemini-3.1-pro">Gemini 3.1 Pro</option>
                <option value="gemini-3.5-flash">Gemini 3.5 Flash</option>
                <option value="gemini-3.5-flash-lite">Gemini 3.5 Flash Lite</option>
              </select>
            </label>
          </article>

          <article className="integration-card">
            <div className="integration-head">
              <Sparkles size={20} />
              <div>
                <strong>xAI Grok</strong>
                <span>Optional model route for drafting support and research cross-checking.</span>
              </div>
            </div>
            <label>API key<input type="password" value={apiSettings.grokApiKey} onChange={(event) => updateApi("grokApiKey", event.target.value)} placeholder="xai-..." /></label>
            <label>Model
              <select value={apiSettings.grokModel} onChange={(event) => updateApi("grokModel", event.target.value)}>
                <option value="grok-4">Grok 4</option>
                <option value="grok-3">Grok 3</option>
                <option value="grok-3-mini">Grok 3 mini</option>
                <option value="grok-2-vision">Grok 2 vision</option>
              </select>
            </label>
          </article>

          <div className="integration-actions">
            <span>Last saved: {apiSavedAt}</span>
            <button className="primary" type="submit" disabled={settingsBusy === "api"}><ServerCog size={18} /> {settingsBusy === "api" ? "Saving..." : "Save API settings"}</button>
          </div>
        </form>
      </section>

      <section className="rag-shell">
        <div className="panel-head">
          <div>
            <p className="eyebrow">Super admin only</p>
            <h3>AI training and retrieval augmented generation</h3>
          </div>
          <span className="pill">{ragSources.filter((source) => source.status === "Indexed").length} indexed sources</span>
        </div>

        <section className="settings-grid">
          <Panel title="Assistant retrieval policy" badge="RAG controls">
            <form className="form" onSubmit={saveTrainingSettings}>
              <label>Default assistant name<input value={assistantTraining.defaultAssistant} onChange={(event) => updateTraining("defaultAssistant", event.target.value)} /></label>
              <div className="form-row">
                <label>Retrieval mode
                  <select value={assistantTraining.retrievalMode} onChange={(event) => updateTraining("retrievalMode", event.target.value as AssistantTrainingSettings["retrievalMode"])}>
                    <option>Strict sources only</option>
                    <option>Balanced</option>
                    <option>Broad discovery</option>
                  </select>
                </label>
                <label>Top K results<input type="number" min="1" max="20" value={assistantTraining.topK} onChange={(event) => updateTraining("topK", Number(event.target.value))} /></label>
              </div>
              <div className="form-row">
                <label>Chunk size<input type="number" min="300" max="3000" value={assistantTraining.chunkSize} onChange={(event) => updateTraining("chunkSize", Number(event.target.value))} /></label>
                <label>Private tenant sources
                  <select value={assistantTraining.allowTenantPrivateSources ? "Enabled" : "Disabled"} onChange={(event) => updateTraining("allowTenantPrivateSources", event.target.value === "Enabled")}>
                    <option>Enabled</option>
                    <option>Disabled</option>
                  </select>
                </label>
              </div>
              <label className="switch-row"><input type="checkbox" checked={assistantTraining.requireCitations} onChange={(event) => updateTraining("requireCitations", event.target.checked)} /> Require citations from retrieved sources</label>
              <label>Assistant system instructions<textarea value={assistantTraining.systemInstructions} onChange={(event) => updateTraining("systemInstructions", event.target.value)} /></label>
              <button className="primary" type="submit" disabled={settingsBusy === "training"}><LibraryBig size={18} /> {settingsBusy === "training" ? "Saving..." : "Save training profile"}</button>
            </form>
          </Panel>

          <Panel title="Add knowledge source" badge="Index queue">
            <form className="form" onSubmit={addRagSource}>
              <label>Source name<input name="name" defaultValue="New South African legal source" /></label>
              <label>Source type
                <select name="sourceType">
                  <option>Case law</option>
                  <option>Contract bank</option>
                  <option>Practice manual</option>
                  <option>Legislation</option>
                  <option>Firm precedent</option>
                </select>
              </label>
              <label>Scope
                <select name="scope">
                  <option>Platform</option>
                  <option>Tenant template</option>
                </select>
              </label>
              <label>Estimated documents<input name="documentCount" type="number" defaultValue="0" /></label>
              <button className="primary" type="submit" disabled={settingsBusy === "rag"}><Plus size={18} /> {settingsBusy === "rag" ? "Queueing..." : "Queue source"}</button>
            </form>
          </Panel>
        </section>

        <div className="rag-source-list">
          {ragSources.map((source) => (
            <article className="rag-source" key={source.id}>
              <div>
                <strong>{source.name}</strong>
                <span>{source.sourceType} - {source.scope}</span>
              </div>
              <span className={`rag-status rag-${source.status.toLowerCase().replace(" ", "-")}`}>{source.status}</span>
              <span>{source.documentCount.toLocaleString("en-ZA")} docs</span>
              <small>Last indexed: {source.lastIndexed}</small>
            </article>
          ))}
        </div>
      </section>
    </>
  );
}

function DeliveryItem({ title, text, enabled }: { title: string; text: string; enabled: boolean }) {
  return (
    <article className="delivery-item">
      <span className={enabled ? "delivery-dot enabled" : "delivery-dot"} />
      <div>
        <strong>{title}</strong>
        <p>{text}</p>
      </div>
    </article>
  );
}

function ToastStack({ toasts, dismissToast }: { toasts: Toast[]; dismissToast: (id: string) => void }) {
  return (
    <div className="toast-stack" role="status" aria-live="polite">
      {toasts.map((toast) => (
        <article className={`toast toast-${toast.type}`} key={toast.id}>
          <div className="toast-icon">
            {toast.type === "success" ? <CheckCircle2 size={18} /> : toast.type === "error" ? <X size={18} /> : <Clock3 size={18} />}
          </div>
          <div>
            <strong>{toast.title}</strong>
            <p>{toast.message}</p>
          </div>
          <button className="toast-close" onClick={() => dismissToast(toast.id)} aria-label="Dismiss notification">
            <X size={16} />
          </button>
        </article>
      ))}
    </div>
  );
}

function Metric({ label, value, help }: { label: string; value: string; help: string }) {
  return <div className="metric"><span>{label}</span><strong>{value}</strong><small>{help}</small></div>;
}

function Panel({ title, badge, action, children }: { title: string; badge?: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="panel">
      <div className="panel-head">
        <h3>{title}</h3>
        {action ?? (badge ? <span className="pill">{badge}</span> : null)}
      </div>
      {children}
    </section>
  );
}

function MatterCard({ matter, client = false }: { matter: Matter; client?: boolean }) {
  return (
    <article className={`matter ${client ? "client" : ""}`}>
      <div className="matter-title">
        <div>
          <strong>{matter.title}</strong>
          <span>{client ? matter.property : `${matter.client} - ${matter.matterType}`}</span>
        </div>
        {!client && <span className={`risk risk-${matter.risk.toLowerCase()}`}>{matter.risk}</span>}
      </div>
      <div className="progress"><i style={{ width: `${matter.progress}%` }} /></div>
      <p>{matter.stage}: {matter.nextStep}</p>
      <small>Due {matter.due}</small>
    </article>
  );
}

function TableRow({ cells }: { cells: React.ReactNode[] }) {
  return <div className="row">{cells.map((cell, index) => <span key={`${index}-${String(cell)}`}>{cell}</span>)}</div>;
}

function Capability({ icon: Icon, title, text }: { icon: typeof Sparkles; title: string; text: string }) {
  return <article className="capability"><Icon size={22} /><strong>{title}</strong><p>{text}</p></article>;
}
