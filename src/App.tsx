import {
  AlertTriangle,
  Archive,
  ArrowRight,
  BadgeCheck,
  BookOpenCheck,
  Building2,
  CalendarDays,
  CheckCircle2,
  CircleDollarSign,
  Clock,
  Clock3,
  FilePenLine,
  Home,
  KeyRound,
  LibraryBig,
  LockKeyhole,
  LogIn,
  Mail,
  Pause,
  Play,
  Plus,
  Scale,
  Search,
  Send,
  ServerCog,
  Settings,
  Shield,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Split,
  Timer,
  UserCheck,
  UserPlus,
  TrendingUp,
  Users,
  UsersRound,
  Vault,
  X
} from "lucide-react";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { clearToken, createFicaClient, createPopiaBreachIncident, createPopiaDsrRequest, createPopiaProcessingRecord, createTimeEntry, createTrustTransaction, forgotPassword, getBootstrapSettings, getCurrentUser, getFicaClients, getPopiaRecords, getTimeEntries, getTrustLedger, getVerifyNowUsage, login, queueRagSource, registerTenant, saveAssistantTraining, savePlatformApiSettings, savePlatformSmtpSettings, saveTenantEmailIdentity, saveTenantProfile, sendAiChat, sendTestEmail, updateFicaClient, updatePopiaDsrStatus, updateTimeEntryStatus } from "./api";
import { appointments as appointmentSeed, contracts as contractSeed, invoices as invoiceSeed, matters as matterSeed, research as researchSeed, tasks as taskSeed } from "./data";
import type { AccountingConnection, AccountingExportRecord, AgentReferral, AiAgentKey, AiChatMessage, AnalyticsSnapshot, ApiProviderSettings, Appointment, AssistantTrainingSettings, AuthUser, ContractDraft, ConveyancingMatter, DocumentAnalysis, EstateAgent, FicaClient, Invoice, LegalCorpusDocument, LegalCorpusSource, LitigationMatter, Matter, NavItem, PopiaBreachIncident, PopiaDsrRequest, PopiaProcessingRecord, RagSource, ResearchItem, ResearchQuery, SignatureRequest, SmtpSettings, TenantEmailSettings, TenantProfile, TimeEntry, TrustReconciliation, TrustTransaction, ViewKey, WhatsAppContact, WhatsAppMessage, WhatsAppTemplate, WorkTask } from "./types";
import { FicaKyc } from "./FicaKyc";
import { PopiaCompliance } from "./PopiaCompliance";
import { TimeRecording } from "./TimeRecording";
import { TrustAccount } from "./TrustAccount";
import { ConveyancingPipeline } from "./ConveyancingPipeline";
import { LitigationPipeline } from "./LitigationPipeline";
import { WhatsAppComms } from "./WhatsAppComms";
import { CipcSearch } from "./CipcSearch";
import { DocumentIntelligence } from "./DocumentIntelligence";
import { AccountingSync } from "./AccountingSync";
import { LegalResearchDB } from "./LegalResearchDB";
import { ESignature } from "./ESignature";
import { AgentNetwork } from "./AgentNetwork";
import { PracticeAnalytics } from "./PracticeAnalytics";
import { StaffManagement } from "./StaffManagement";
import { Clients } from "./Clients";
import { StripeBilling } from "./StripeBilling";
import { Billing } from "./Billing";
import { VerifyNowMonitor } from "./VerifyNowMonitor";

const nav: NavItem[] = [
  { key: "overview",  label: "Overview", icon: Home },
  { key: "clients",   label: "Clients",  icon: Users },
  { key: "drafting",  label: "Contracts", icon: FilePenLine },
  { key: "research", label: "Research", icon: Search },
  { key: "secretary", label: "Secretary", icon: Archive },
  { key: "billing", label: "Billing", icon: CircleDollarSign },
  { key: "conveyancing", label: "Conveyancing", icon: Home },
  { key: "litigation", label: "Litigation", icon: Scale },
  { key: "trust", label: "Trust Account", icon: Vault },
  { key: "time", label: "Time & WIP", icon: Timer },
  { key: "fica", label: "FICA / KYC", icon: UserCheck },
  { key: "popia", label: "POPIA", icon: ShieldAlert },
  { key: "whatsapp", label: "WhatsApp", icon: Users },
  { key: "cipc", label: "CIPC Search", icon: Search },
  { key: "documents", label: "Doc Intelligence", icon: BadgeCheck },
  { key: "accounting", label: "Accounting", icon: CircleDollarSign },
  { key: "research-db", label: "SA Case Law", icon: LibraryBig },
  { key: "esignature", label: "e-Signature", icon: LockKeyhole },
  { key: "agents", label: "Agent Network", icon: UsersRound },
  { key: "analytics", label: "Analytics", icon: TrendingUp },
  { key: "staff", label: "Staff", icon: Users },
  { key: "billing-portal", label: "Billing", icon: CircleDollarSign },
  { key: "booking", label: "Bookings", icon: CalendarDays },
  { key: "portal", label: "Portal", icon: UsersRound },
  { key: "training-guide", label: "AI Training Guide", icon: LibraryBig },
  { key: "settings", label: "Settings", icon: Settings }
];

const viewAgentMap: Record<ViewKey, AiAgentKey> = {
  overview: "general",
  clients: "general",
  drafting: "drafting",
  research: "research",
  secretary: "secretary",
  billing: "billing",
  trust: "billing",
  time: "billing",
  fica: "general",
  popia: "general",
  conveyancing: "drafting",
  litigation: "research",
  whatsapp: "secretary",
  cipc: "general",
  documents: "drafting",
  accounting: "billing",
  "research-db": "research",
  esignature: "drafting",
  agents: "portal",
  analytics: "billing",
  staff: "general",
  "billing-portal": "billing",
  booking: "secretary",
  portal: "portal",
  "training-guide": "research",
  settings: "settings"
};

const aiAgentLabels: Record<AiAgentKey, string> = {
  general: "General Assistant",
  drafting: "Drafting Agent",
  research: "Research Agent",
  secretary: "Secretary Agent",
  billing: "Billing Agent",
  portal: "Portal Agent",
  settings: "Settings Agent"
};

const money = (value: number) => new Intl.NumberFormat("en-ZA", { style: "currency", currency: "ZAR", maximumFractionDigits: 0 }).format(value);
const today = () => new Date().toISOString().slice(0, 10);
const uid = (prefix: string) => `${prefix}-${Math.random().toString(36).slice(2, 7).toUpperCase()}`;
const maxKnowledgeUploadBytes = 8 * 1024 * 1024;
type Toast = { id: string; type: "success" | "error" | "info"; title: string; message: string };

const defaultSmtpSettings = (): SmtpSettings => ({
  providerName: "LawPath SMTP",
  host: "",
  port: 587,
  username: "",
  password: "",
  encryption: "TLS",
  bounceEmail: "",
  transactionalEnabled: true,
  systemEnabled: true,
  testRecipient: ""
});

const defaultTenantEmailSettings = (): TenantEmailSettings => ({
  tenantName: "",
  tenantDomain: "",
  fromName: "",
  fromEmail: "",
  replyTo: "",
  portalSignature: "",
  verifiedDomain: false
});

const defaultTenantProfile = (companyName = ""): TenantProfile => ({
  tradingName: companyName,
  practiceType: "",
  addressLine1: "",
  addressLine2: "",
  city: "",
  province: "",
  postalCode: "",
  phone: "",
  website: "",
  lpcRegistrationNumber: "",
  companyRegistrationNumber: "",
  vatNumber: "",
  conveyancerCount: 0,
  seniorAttorneyCount: 0,
  juniorAttorneyCount: 0,
  candidateAttorneyCount: 0,
  legalSecretaryCount: 0,
  logoDataUrl: "",
  logoStorageUri: "",
  logoPublicUrl: "",
  onboardingCompleted: false,
  onboardingStep: 1
});

function fileToDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error || new Error("Could not read file."));
    reader.readAsDataURL(file);
  });
}

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
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [appointments, setAppointments] = useState<Appointment[]>(appointmentSeed);
  const [smtpSettings, setSmtpSettings] = useState<SmtpSettings>(defaultSmtpSettings);
  const [tenantEmailSettings, setTenantEmailSettings] = useState<TenantEmailSettings>(defaultTenantEmailSettings);
  const [tenantProfile, setTenantProfile] = useState<TenantProfile>(defaultTenantProfile);
  const [pendingBillIds, setPendingBillIds] = useState<string[]>([]);
  const [apiSettings, setApiSettings] = useState<ApiProviderSettings>({
    exchangeRatesApiKey: "",
    exchangeRatesBaseCurrency: "ZAR",
    openAiApiKey: "",
    openAiModel: "gpt-5.2",
    geminiApiKey: "",
    geminiModel: "gemini-3.5-flash",
    grokApiKey: "",
    grokModel: "grok-4",
    verifyNowApiKey: ""
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
  // ─── Tier 2 state ──────────────────────────────────────────────────────────
  const [conveyancingMatters, setConveyancingMatters] = useState<ConveyancingMatter[]>([
    { id: "CM-001", matterRef: "M-1048/T", matterType: "transfer", sellerName: "Thabo Dlamini", buyerName: "Nomsa Sithole", propertyDescription: "Erf 1204, Sandton, Gauteng", erfNumber: "Erf 1204", purchasePriceCents: 250000000, transferDutyCents: 16155000, conveyancingFeeCents: 3750000, vatOnFeeCents: 562500, estateAgent: "Pam Golding Properties", bondBank: "FNB", currentStage: "sars_transfer_duty", ficaStatus: "Compliant", ratesClearanceStatus: "Requested", levyClearanceStatus: "Not requested", ratesClearanceExpiry: "", levyClearanceExpiry: "", targetRegistrationDate: "2026-07-15", notes: "Linked sale — buyer must sell Midrand property.", stages: [] }
  ]);
  const [litigationMatters, setLitigationMatters] = useState<LitigationMatter[]>([
    { id: "LM-001", matterRef: "LIT-2026-001", caseNumber: "12345/2026", court: "Gauteng High Court, Johannesburg", courtDivision: "Commercial", plaintiff: "ABC Construction (Pty) Ltd", defendant: "XYZ Developers CC", matterType: "opposed_motion", currentStage: "pleadings", claimAmountCents: 85000000, costsRecoveredCents: 0, status: "Active", serviceDate: "2026-05-01", notes: "Opposed motion for payment of outstanding construction contract amount.", deadlines: [{ id: "DL-001", description: "Deliver answering affidavit", ruleReference: "Rule 6(5)(d)", dueDate: "2026-06-18", daysFromService: 48, completed: false, priority: "Urgent" }, { id: "DL-002", description: "Deliver replying affidavit", ruleReference: "Rule 6(5)(e)", dueDate: "2026-07-02", daysFromService: 62, completed: false, priority: "Normal" }], courtDates: [{ id: "CD-001", courtDate: "2026-08-14", courtTime: "10:00", court: "Gauteng High Court, Johannesburg", purpose: "Hearing of opposed application", rollType: "Opposed", outcome: "", postponedTo: "" }], costOrders: [] }
  ]);
  const [waContacts, setWaContacts] = useState<WhatsAppContact[]>([
    { id: "WC-001", clientName: "Thabo Dlamini", phoneNumber: "+27821234567", matterRef: "M-1048/T", optIn: true, optInDate: "2026-05-10T09:00:00Z" }
  ]);
  const [waMessages, setWaMessages] = useState<WhatsAppMessage[]>([
    { id: "WM-001", contactId: "WC-001", clientName: "Thabo Dlamini", phoneNumber: "+27821234567", matterRef: "M-1048/T", direction: "outbound", messageBody: "Good day Thabo, your transfer (M-1048/T) has been lodged at the Deeds Office. Registration is expected within 8-10 working days.", templateId: "transfer_lodged", status: "read", sentAt: "2026-06-04T11:30:00Z" },
    { id: "WM-002", contactId: "WC-001", clientName: "Thabo Dlamini", phoneNumber: "+27821234567", matterRef: "M-1048/T", direction: "inbound", messageBody: "Thank you! Appreciate the update.", templateId: "", status: "read", sentAt: "2026-06-04T11:45:00Z" }
  ]);
  const [waTemplates, setWaTemplates] = useState<WhatsAppTemplate[]>([
    { id: "WT-001", name: "Transfer lodged", category: "transfer_update", body: "Good day {{client_name}}, your transfer ({{matter_ref}}) has been lodged at the Deeds Office. Registration is expected within 8-10 working days.", variables: ["client_name", "matter_ref"] },
    { id: "WT-002", name: "FICA documents required", category: "fica_request", body: "Dear {{client_name}}, we still require FICA documents for matter {{matter_ref}}: {{documents_required}}.", variables: ["client_name", "matter_ref", "documents_required"] },
    { id: "WT-003", name: "Appointment reminder", category: "appointment_reminder", body: "Dear {{client_name}}, reminder of your appointment on {{date}} at {{time}}. Please reply to confirm.", variables: ["client_name", "date", "time"] }
  ]);
  const [documentAnalyses, setDocumentAnalyses] = useState<DocumentAnalysis[]>([]);
  const [accountingConnections, setAccountingConnections] = useState<AccountingConnection[]>([
    { id: "AC-001", provider: "sage_pastel", connected: false, lastSyncAt: "", syncStatus: "idle", errorMessage: "" },
    { id: "AC-002", provider: "xero", connected: false, lastSyncAt: "", syncStatus: "idle", errorMessage: "" },
    { id: "AC-003", provider: "quickbooks", connected: false, lastSyncAt: "", syncStatus: "idle", errorMessage: "" },
    { id: "AC-004", provider: "csv_export", connected: true, lastSyncAt: "", syncStatus: "idle", errorMessage: "" }
  ]);
  const [accountingExportLog, setAccountingExportLog] = useState<AccountingExportRecord[]>([]);

  // ─── Tier 3 state ──────────────────────────────────────────────────────────
  const [corpusSources, setCorpusSources] = useState<LegalCorpusSource[]>([
    { id: "CS-001", sourceName: "SAFLII — Southern African Legal Information Institute", sourceType: "case_law", courtOrBody: "All SA Courts", indexStatus: "indexed", documentCount: 184220, lastIndexedAt: "2026-06-04T02:00:00Z", isPlatformCorpus: true },
    { id: "CS-002", sourceName: "South African Constitution, 1996", sourceType: "constitution", courtOrBody: "Parliament", indexStatus: "indexed", documentCount: 1, lastIndexedAt: "2026-01-01T00:00:00Z", isPlatformCorpus: true },
    { id: "CS-003", sourceName: "Government Gazette — Acts of Parliament", sourceType: "legislation", courtOrBody: "Government Printer", indexStatus: "indexed", documentCount: 4812, lastIndexedAt: "2026-06-01T03:00:00Z", isPlatformCorpus: true },
    { id: "CS-004", sourceName: "Legal Practice Council Rules & Directives", sourceType: "lpc_rules", courtOrBody: "Legal Practice Council", indexStatus: "indexed", documentCount: 48, lastIndexedAt: "2026-05-15T08:00:00Z", isPlatformCorpus: true },
    { id: "CS-005", sourceName: "Tenant Firm Precedents", sourceType: "legislation", courtOrBody: "", indexStatus: "pending", documentCount: 0, lastIndexedAt: "", isPlatformCorpus: false }
  ]);
  const [corpusDocuments, setCorpusDocuments] = useState<LegalCorpusDocument[]>([
    { id: "CD-001", sourceId: "CS-001", title: "Barkhuizen v Napier 2007 (5) SA 323 (CC)", citation: "[2007] ZACC 5", court: "Constitutional Court", decisionDate: "2007-04-04", summary: "The Constitutional Court held that contractual clauses that oust the jurisdiction of courts or limit access to courts must be tested against the Constitution.", sourceUrl: "http://www.saflii.org/za/cases/ZACC/2007/5.html", gcsUri: "", tags: ["contract law", "constitutional", "access to courts"], year: 2007 },
    { id: "CD-002", sourceId: "CS-001", title: "Everfresh Market Virginia (Pty) Ltd v Shoprite Checkers (Pty) Ltd 2012 (1) SA 256 (CC)", citation: "[2011] ZACC 30", court: "Constitutional Court", decisionDate: "2011-11-17", summary: "The duty to negotiate in good faith in the context of lease renewals, and the interface between constitutional values and the law of contract.", sourceUrl: "http://www.saflii.org/za/cases/ZACC/2011/30.html", gcsUri: "", tags: ["contract law", "good faith", "lease"], year: 2011 },
    { id: "CD-003", sourceId: "CS-001", title: "National Credit Regulator v Opperman 2013 (2) SA 1 (CC)", citation: "[2012] ZACC 29", court: "Constitutional Court", decisionDate: "2012-12-03", summary: "The National Credit Act and the right to equality — whether prescription runs during a credit agreement dispute.", sourceUrl: "http://www.saflii.org/za/cases/ZACC/2012/29.html", gcsUri: "", tags: ["NCA", "credit agreement", "prescription"], year: 2012 }
  ]);
  const [researchQueries, setResearchQueries] = useState<ResearchQuery[]>([]);
  const [signatureRequests, setSignatureRequests] = useState<SignatureRequest[]>([
    { id: "SR-001", documentTitle: "Offer to Purchase — Erf 1204 Sandton", documentType: "contract", matterRef: "M-1048/T", documentBody: "", status: "partially_signed", expiresAt: "2026-07-05T00:00:00Z", completedAt: "", signatories: [{ id: "SS-001", signatoryName: "Thabo Dlamini", signatoryEmail: "thabo@example.co.za", signatoryIdNumber: "8201015009087", role: "Seller", orderPosition: 1, status: "signed", signedAt: "2026-06-03T10:22:00Z", signatureMethod: "drawn" }, { id: "SS-002", signatoryName: "Nomsa Sithole", signatoryEmail: "nomsa@example.co.za", signatoryIdNumber: "8505125009083", role: "Buyer", orderPosition: 2, status: "pending", signedAt: "", signatureMethod: "" }], auditEvents: [{ id: "AE-001", eventType: "request_created", description: "Signature request created", ipAddress: "102.0.0.1", createdAt: "2026-06-03T09:00:00Z" }, { id: "AE-002", eventType: "otp_sent", description: "OTP sent to thabo@example.co.za", ipAddress: "102.0.0.1", createdAt: "2026-06-03T10:00:00Z" }, { id: "AE-003", eventType: "signed", description: "Thabo Dlamini signed using drawn signature", ipAddress: "102.0.0.1", createdAt: "2026-06-03T10:22:00Z" }] }
  ]);
  const [estateAgents, setEstateAgents] = useState<EstateAgent[]>([
    { id: "EA-001", agentName: "Sandra Meyer", agencyName: "Pam Golding Properties", email: "sandra.meyer@pamgolding.co.za", phone: "+27824567890", ffcNumber: "FFC-123456", ppraRegistration: "PPRA-987654", areaOfOperation: "Sandton, Fourways, Midrand", status: "active", commissionRate: 0.05, portalAccess: true, portalToken: "LP-AGENT-7721", totalReferrals: 14, totalCommissionCents: 42500000 },
    { id: "EA-002", agentName: "Johan van der Berg", agencyName: "RE/MAX Coastal", email: "johan@remax.co.za", phone: "+27836543210", ffcNumber: "FFC-654321", ppraRegistration: "PPRA-123789", areaOfOperation: "Cape Town Atlantic Seaboard, Sea Point", status: "active", commissionRate: 0.05, portalAccess: false, portalToken: "", totalReferrals: 7, totalCommissionCents: 18750000 }
  ]);
  const [agentReferrals, setAgentReferrals] = useState<AgentReferral[]>([
    { id: "AR-001", agentId: "EA-001", agentName: "Sandra Meyer", matterRef: "M-1048/T", propertyDescription: "Erf 1204, Sandton", buyerName: "Nomsa Sithole", sellerName: "Thabo Dlamini", purchasePriceCents: 250000000, commissionCents: 12500000, commissionStatus: "pending", referralDate: "2026-05-20", paidDate: "" },
    { id: "AR-002", agentId: "EA-001", agentName: "Sandra Meyer", matterRef: "M-2201", propertyDescription: "Unit 3B, Somerset West", buyerName: "Zanele Khumalo", sellerName: "Pierre du Toit", purchasePriceCents: 185000000, commissionCents: 9250000, commissionStatus: "approved", referralDate: "2026-04-15", paidDate: "" }
  ]);
  const [analyticsData, setAnalyticsData] = useState<AnalyticsSnapshot | null>({
    id: "AN-001", periodMonth: "2026-06",
    totalMattersActive: 12, totalMattersClosed: 4,
    wipTotalCents: 184500000, billedTotalCents: 92300000, collectedTotalCents: 78600000, writtenOffCents: 3200000,
    trustBalanceCents: 295000000,
    debtors30Cents: 38500000, debtors60Cents: 18200000, debtors90Cents: 9100000, debtors120PlusCents: 4800000,
    realisationRate: 0.82, collectionRate: 0.91,
    feeEarnerStats: [
      { name: "T. Mokoena", wipCents: 95000000, billedCents: 48000000, collectedCents: 42000000, realisationRate: 0.84, collectionRate: 0.89, matterCount: 7 },
      { name: "A. Sithole", wipCents: 56000000, billedCents: 29000000, collectedCents: 24000000, realisationRate: 0.79, collectionRate: 0.93, matterCount: 4 },
      { name: "N. Khumalo", wipCents: 33500000, billedCents: 15300000, collectedCents: 12600000, realisationRate: 0.76, collectionRate: 0.87, matterCount: 1 }
    ],
    matterTypeStats: [
      { matterType: "Conveyancing", count: 8, avgCycleTimeDays: 62, totalFeeCents: 95000000 },
      { matterType: "Litigation", count: 3, avgCycleTimeDays: 180, totalFeeCents: 48000000 },
      { matterType: "Commercial", count: 1, avgCycleTimeDays: 45, totalFeeCents: 18500000 }
    ]
  });

  // ─── Tier 1 state ──────────────────────────────────────────────────────────
  const [trustTransactions, setTrustTransactions] = useState<TrustTransaction[]>([
    { id: "TT-001", clientName: "Dlamini, T", description: "Transfer deposit received – Erf 1204 Sandton", reference: "M-1048/DEP", entryType: "receipt", amountCents: 25000000, runningBalanceCents: 25000000, valueDate: "2026-06-02", reconciled: false },
    { id: "TT-002", clientName: "Mokoena & Partners", description: "SARS Transfer Duty payment – M-1048", reference: "M-1048/SARS", entryType: "payment", amountCents: 3750000, runningBalanceCents: 21250000, valueDate: "2026-06-04", reconciled: false },
    { id: "TT-003", clientName: "Sithole, N", description: "Bond registration deposit – Unit 3B Somerset West", reference: "M-2201/BOND", entryType: "receipt", amountCents: 8500000, runningBalanceCents: 29750000, valueDate: "2026-06-05", reconciled: false }
  ]);
  const [trustBalanceCents, setTrustBalanceCents] = useState(29750000);
  const [trustReconciliations, setTrustReconciliations] = useState<TrustReconciliation[]>([
    { id: "TR-001", periodMonth: "2026-05", bankStatementBalanceCents: 18200000, ledgerBalanceCents: 18200000, clientCreditTotalCents: 18200000, status: "Submitted" }
  ]);

  const [ficaClients, setFicaClients] = useState<FicaClient[]>([
    {
      id: "FC-001", clientName: "Thabo Dlamini", clientType: "natural_person", idNumber: "8201015009087",
      riskRating: "Low", ficaStatus: "Compliant", ficaExpiryDate: "2027-06-01", sourceOfFunds: "Employment income",
      sanctionsChecked: true,
      documents: [
        { id: "FD-001", documentType: "identity", documentName: "Certified ID / Passport copy", status: "Verified", expiryDate: "" },
        { id: "FD-002", documentType: "proof_of_address", documentName: "Proof of residence (not older than 3 months)", status: "Verified", expiryDate: "2026-09-01" },
        { id: "FD-003", documentType: "source_of_funds", documentName: "Source of funds declaration", status: "Verified", expiryDate: "" }
      ]
    },
    {
      id: "FC-002", clientName: "Sithole Investments (Pty) Ltd", clientType: "legal_entity", idNumber: "",
      riskRating: "Medium", ficaStatus: "In Progress", ficaExpiryDate: "", sourceOfFunds: "Business operations",
      sanctionsChecked: false,
      documents: [
        { id: "FD-004", documentType: "cipc_cert", documentName: "CIPC registration certificate", status: "Uploaded", expiryDate: "" },
        { id: "FD-005", documentType: "moi", documentName: "Memorandum of Incorporation", status: "Required", expiryDate: "" },
        { id: "FD-006", documentType: "directors", documentName: "Certified ID copies of all directors/members", status: "Required", expiryDate: "" }
      ]
    }
  ]);

  const [timeEntries, setTimeEntries] = useState<TimeEntry[]>([
    { id: "TE-001", clientName: "Dlamini, T", matterRef: "M-1048", feeEarnerName: "T. Mokoena", entryDate: "2026-06-05", activityType: "professional_fee", description: "Reviewing title deed and preparing transfer documents", durationMinutes: 90, rateCents: 350000, amountCents: 525000, vatAmountCents: 78750, status: "WIP", isDisbursement: false },
    { id: "TE-002", clientName: "Dlamini, T", matterRef: "M-1048", feeEarnerName: "T. Mokoena", entryDate: "2026-06-04", activityType: "correspondence", description: "Correspondence with estate agent re: suspensive conditions", durationMinutes: 30, rateCents: 350000, amountCents: 175000, vatAmountCents: 26250, status: "WIP", isDisbursement: false },
    { id: "TE-003", clientName: "Dlamini, T", matterRef: "M-1048", feeEarnerName: "T. Mokoena", entryDate: "2026-06-03", activityType: "disbursement", description: "Deeds Office search fee", durationMinutes: 0, rateCents: 0, amountCents: 18000, vatAmountCents: 2700, status: "WIP", isDisbursement: true },
    { id: "TE-004", clientName: "Sithole, N", matterRef: "M-2201", feeEarnerName: "A. Sithole", entryDate: "2026-06-02", activityType: "drafting", description: "Drafting bond cancellation documents and instructions to bank", durationMinutes: 60, rateCents: 320000, amountCents: 320000, vatAmountCents: 48000, status: "WIP", isDisbursement: false }
  ]);
  const [timeWipCents, setTimeWipCents] = useState(1038000);

  const [popiaProcessingRecords, setPopiaProcessingRecords] = useState<PopiaProcessingRecord[]>([
    { id: "PR-001", processingActivity: "Client onboarding and FICA verification", purpose: "Compliance with FICA and POCA obligations", legalBasis: "Legal obligation (FICA Act 38 of 2001)", dataSubjects: ["Clients", "Beneficial owners"], personalInfoTypes: ["Identity numbers", "Addresses", "Financial information"], retentionPeriod: "5 years after matter close", thirdPartyRecipients: "FIC (if suspicious transaction report filed)", crossBorderTransfer: false, reviewDate: "2027-01-01", active: true },
    { id: "PR-002", processingActivity: "Matter and legal correspondence files", purpose: "Delivery of legal services under mandate", legalBasis: "Contract (mandate agreement)", dataSubjects: ["Clients", "Opposing parties", "Witnesses"], personalInfoTypes: ["Identity numbers", "Addresses", "Financial information", "Legal correspondence"], retentionPeriod: "7 years after matter close", thirdPartyRecipients: "Courts, SARS, Deeds Registry, Sheriff", crossBorderTransfer: false, reviewDate: "2027-01-01", active: true }
  ]);
  const [popiaDsrRequests, setPopiaDsrRequests] = useState<PopiaDsrRequest[]>([
    { id: "DSR-001", requestType: "Access", requestorName: "Thabo Dlamini", requestorEmail: "thabo@example.co.za", description: "Request for copy of all personal information held on file for M-1048", status: "In Progress", receivedAt: "2026-05-28T09:00:00Z", dueAt: "2026-06-27T09:00:00Z", completedAt: "", responseNotes: "" }
  ]);
  const [popiaBreachIncidents, setPopiaBreachIncidents] = useState<PopiaBreachIncident[]>([]);

  const [emailStatus, setEmailStatus] = useState("SMTP settings not tested in this session.");
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [assistantOpen, setAssistantOpen] = useState(false);
  const [aiMessages, setAiMessages] = useState<AiChatMessage[]>([
    { id: uid("AI"), role: "assistant", content: "Ask me to draft, research, summarise a matter, prepare a client update, or explain what to do next. I use tenant-scoped context and never cross into another firm." }
  ]);
  const [aiConversationId, setAiConversationId] = useState<string | null>(null);
  const [aiBusy, setAiBusy] = useState(false);
  const [aiContextSummary, setAiContextSummary] = useState("Tenant context will appear after the first AI response.");
  const [activity, setActivity] = useState<string[]>([
    "Portal access granted for estate agent on M-1048",
    "Draft shareholder agreement updated",
    "Invoice INV-2409 payment captured",
    "Case-law bundle indexed for conveyancing delays"
  ]);

  const pageTitle = nav.find((item) => item.key === activeView)?.label ?? "Overview";
  const isPlatformSuperAdmin = authUser?.role === "platform_super_admin";
  const hasTenantContext = Boolean(authUser?.tenantId);
  const activeAgent = viewAgentMap[activeView];

  useEffect(() => {
    if (!authUser) return;

    loadWorkspaceSettings(authUser);
  }, [authUser?.id]);

  async function loadWorkspaceSettings(user: AuthUser) {
    try {
      const bootstrap = await getBootstrapSettings();
      if (bootstrap.tenantProfile) {
        setTenantProfile(bootstrap.tenantProfile);
      } else {
        setTenantProfile(defaultTenantProfile(user.companyName));
      }
      if (bootstrap.emailIdentity) {
        setTenantEmailSettings({
          tenantName: user.companyName,
          tenantDomain: bootstrap.emailIdentity.verified_domain || "",
          fromName: bootstrap.emailIdentity.from_name,
          fromEmail: bootstrap.emailIdentity.from_email,
          replyTo: bootstrap.emailIdentity.reply_to,
          portalSignature: bootstrap.emailIdentity.portal_signature || "",
          verifiedDomain: bootstrap.emailIdentity.is_domain_verified
        });
      }
      if (bootstrap.smtpSettings) setSmtpSettings(bootstrap.smtpSettings);
      if (bootstrap.apiSettings) setApiSettings(bootstrap.apiSettings);
      if (bootstrap.assistantTraining) setAssistantTraining(bootstrap.assistantTraining);
      if (bootstrap.ragSources.length) setRagSources(bootstrap.ragSources);
    } catch (error) {
      showToast("error", "Settings not loaded", error instanceof Error ? error.message : "Could not load saved workspace settings.");
    }
  }

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
      setTenantProfile(defaultTenantProfile(companyName));
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

  async function askAi(message: string, agentKey: AiAgentKey = activeAgent) {
    const cleaned = message.trim();
    if (!cleaned) return;

    setAssistantOpen(true);
    setAiBusy(true);
    setAiMessages((items) => [...items, { id: uid("AI"), role: "user", content: cleaned }]);

    try {
      const response = await sendAiChat({ message: cleaned, agentKey, conversationId: aiConversationId });
      setAiConversationId(response.conversationId);
      setAiContextSummary(response.contextSummary);
      setAiMessages((items) => [...items, { id: uid("AI"), role: "assistant", content: response.answer }]);
      log(`${aiAgentLabels[agentKey]} answered using ${response.provider}/${response.model}`);
    } catch (error) {
      const messageText = error instanceof Error ? error.message : "The AI assistant could not respond.";
      setAiMessages((items) => [...items, { id: uid("AI"), role: "assistant", content: messageText }]);
      showToast("error", "AI request failed", messageText);
    } finally {
      setAiBusy(false);
    }
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
        {activeView === "drafting" && <Drafting contracts={contracts} setContracts={setContracts} log={log} tenantProfile={tenantProfile} />}
        {activeView === "research" && <ResearchDesk research={research} setResearch={setResearch} log={log} showToast={showToast} />}
        {activeView === "clients" && <Clients showToast={showToast} log={log} />}
        {activeView === "secretary" && <Secretary tasks={tasks} setTasks={setTasks} log={log} />}
        {activeView === "billing" && (
          <Billing
            entries={timeEntries}
            setEntries={setTimeEntries}
            pendingWipIds={pendingBillIds}
            onClearPendingWip={() => setPendingBillIds([])}
            tenantProfile={tenantProfile}
            log={log}
            showToast={showToast}
          />
        )}
        {activeView === "conveyancing" && (
          <ConveyancingPipeline
            matters={conveyancingMatters}
            setMatters={setConveyancingMatters}
            log={log}
            showToast={showToast}
          />
        )}
        {activeView === "litigation" && (
          <LitigationPipeline
            matters={litigationMatters}
            setMatters={setLitigationMatters}
            log={log}
            showToast={showToast}
          />
        )}
        {activeView === "whatsapp" && (
          <WhatsAppComms
            contacts={waContacts}
            setContacts={setWaContacts}
            messages={waMessages}
            setMessages={setWaMessages}
            templates={waTemplates}
            log={log}
            showToast={showToast}
          />
        )}
        {activeView === "cipc" && (
          <CipcSearch log={log} showToast={showToast} />
        )}
        {activeView === "documents" && (
          <DocumentIntelligence
            analyses={documentAnalyses}
            setAnalyses={setDocumentAnalyses}
            log={log}
            showToast={showToast}
          />
        )}
        {activeView === "accounting" && (
          <AccountingSync
            connections={accountingConnections}
            setConnections={setAccountingConnections}
            exportLog={accountingExportLog}
            setExportLog={setAccountingExportLog}
            log={log}
            showToast={showToast}
          />
        )}
        {activeView === "trust" && (
          <TrustAccount
            transactions={trustTransactions}
            setTransactions={setTrustTransactions}
            balanceCents={trustBalanceCents}
            setBalanceCents={setTrustBalanceCents}
            reconciliations={trustReconciliations}
            setReconciliations={setTrustReconciliations}
            log={log}
            showToast={showToast}
          />
        )}
        {activeView === "time" && (
          <TimeRecording
            entries={timeEntries}
            setEntries={setTimeEntries}
            wipCents={timeWipCents}
            setWipCents={setTimeWipCents}
            log={log}
            showToast={showToast}
            onGenerateInvoice={(ids) => {
              setPendingBillIds(ids);
              setActiveView("billing" as ViewKey);
            }}
          />
        )}
        {activeView === "fica" && (
          <FicaKyc
            clients={ficaClients}
            setClients={setFicaClients}
            log={log}
            showToast={showToast}
          />
        )}
        {activeView === "popia" && (
          <PopiaCompliance
            processingRecords={popiaProcessingRecords}
            setProcessingRecords={setPopiaProcessingRecords}
            dsrRequests={popiaDsrRequests}
            setDsrRequests={setPopiaDsrRequests}
            breachIncidents={popiaBreachIncidents}
            setBreachIncidents={setPopiaBreachIncidents}
            log={log}
            showToast={showToast}
          />
        )}
        {activeView === "research-db" && (
          <LegalResearchDB
            sources={corpusSources}
            setSources={setCorpusSources}
            documents={corpusDocuments}
            setDocuments={setCorpusDocuments}
            queries={researchQueries}
            setQueries={setResearchQueries}
            log={log}
            showToast={showToast}
          />
        )}
        {activeView === "esignature" && (
          <ESignature
            requests={signatureRequests}
            setRequests={setSignatureRequests}
            log={log}
            showToast={showToast}
          />
        )}
        {activeView === "agents" && (
          <AgentNetwork
            agents={estateAgents}
            setAgents={setEstateAgents}
            referrals={agentReferrals}
            setReferrals={setAgentReferrals}
            log={log}
            showToast={showToast}
          />
        )}
        {activeView === "analytics" && (
          <PracticeAnalytics
            snapshot={analyticsData}
            setSnapshot={setAnalyticsData}
            log={log}
            showToast={showToast}
          />
        )}
        {activeView === "staff" && (
          <StaffManagement
            tenantId={authUser.tenantId || ""}
            currentUserId={authUser.id}
            currentUserRole={authUser.role}
            showToast={showToast}
          />
        )}
        {activeView === "billing-portal" && (
          <StripeBilling showToast={showToast} />
        )}
        {activeView === "booking" && <Booking appointments={appointments} setAppointments={setAppointments} log={log} />}
        {activeView === "portal" && <Portal matters={matters} setMatters={setMatters} portalMode={portalMode} setPortalMode={setPortalMode} log={log} />}
        {activeView === "training-guide" && <AITrainingGuide setActiveView={setActiveView} />}
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
            hasTenantContext={hasTenantContext}
          />
        )}
      </main>
      <AIAssistantPanel
        open={assistantOpen}
        setOpen={setAssistantOpen}
        activeAgent={activeAgent}
        messages={aiMessages}
        busy={aiBusy}
        contextSummary={aiContextSummary}
        askAi={askAi}
      />
      {authUser.tenantId && !tenantProfile.onboardingCompleted && (
        <OnboardingFlow
          profile={tenantProfile}
          setProfile={setTenantProfile}
          showToast={showToast}
          companyName={authUser.companyName}
        />
      )}
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

function OnboardingFlow({
  profile,
  setProfile,
  showToast,
  companyName
}: {
  profile: TenantProfile;
  setProfile: React.Dispatch<React.SetStateAction<TenantProfile>>;
  showToast: (type: Toast["type"], title: string, message: string) => void;
  companyName: string;
}) {
  const [step, setStep] = useState(profile.onboardingStep || 1);
  const [saving, setSaving] = useState(false);

  function update<K extends keyof TenantProfile>(key: K, value: TenantProfile[K]) {
    setProfile((current) => ({ ...current, [key]: value, onboardingStep: step }));
  }

  async function handleLogo(file: File | undefined) {
    if (!file) return;
    if (file.size > 800_000) {
      showToast("error", "Logo too large", "Use a logo smaller than 800 KB for document generation.");
      return;
    }

    const reader = new FileReader();
    reader.onload = () => update("logoDataUrl", String(reader.result));
    reader.readAsDataURL(file);
  }

  async function persist(nextStep: number, completed = false) {
    setSaving(true);
    try {
      const payload = {
        ...profile,
        tradingName: profile.tradingName || companyName,
        onboardingStep: nextStep,
        onboardingCompleted: completed
      };
      const response = await saveTenantProfile(payload);
      setProfile(response.tenantProfile);
      setStep(nextStep);
      showToast("success", completed ? "Onboarding complete" : "Onboarding saved", completed ? "Your firm profile will now be used on generated documents." : "Progress saved.");
    } catch (error) {
      showToast("error", "Onboarding not saved", error instanceof Error ? error.message : "Could not save onboarding.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="onboarding-backdrop" role="dialog" aria-modal="true" aria-label="Firm onboarding">
      <section className="onboarding-panel">
        <div className="onboarding-head">
          <div>
            <p className="eyebrow">Firm onboarding</p>
            <h2>Set up your LawPath workspace</h2>
            <p>These details customise tenant branding, generated documents, team workflows, billing communications and legal assistant context.</p>
          </div>
          <span className="pill">Step {step} of 3</span>
        </div>

        {step === 1 && (
          <div className="onboarding-grid">
            <label>Trading / practice name<input value={profile.tradingName} onChange={(event) => update("tradingName", event.target.value)} placeholder="Your law firm name" /></label>
            <label>Practice type
              <select value={profile.practiceType} onChange={(event) => update("practiceType", event.target.value)}>
                <option value="">Select practice type</option>
                <option>Conveyancing practice</option>
                <option>Commercial law firm</option>
                <option>Litigation practice</option>
                <option>Estates and trusts practice</option>
                <option>Full-service law firm</option>
              </select>
            </label>
            <label>Address line 1<input value={profile.addressLine1} onChange={(event) => update("addressLine1", event.target.value)} placeholder="Street address" /></label>
            <label>Address line 2<input value={profile.addressLine2} onChange={(event) => update("addressLine2", event.target.value)} placeholder="Building, suite or floor" /></label>
            <label>City<input value={profile.city} onChange={(event) => update("city", event.target.value)} placeholder="City" /></label>
            <label>Province<input value={profile.province} onChange={(event) => update("province", event.target.value)} placeholder="Province" /></label>
            <label>Postal code<input value={profile.postalCode} onChange={(event) => update("postalCode", event.target.value)} placeholder="Postal code" /></label>
            <label>Phone<input value={profile.phone} onChange={(event) => update("phone", event.target.value)} placeholder="Office phone" /></label>
            <label>Website<input value={profile.website} onChange={(event) => update("website", event.target.value)} placeholder="https://yourfirm.co.za" /></label>
          </div>
        )}

        {step === 2 && (
          <div className="onboarding-grid">
            <label>LPC practice / firm number<input value={profile.lpcRegistrationNumber} onChange={(event) => update("lpcRegistrationNumber", event.target.value)} placeholder="Legal Practice Council registration" /></label>
            <label>Company registration number<input value={profile.companyRegistrationNumber} onChange={(event) => update("companyRegistrationNumber", event.target.value)} placeholder="If incorporated" /></label>
            <label>VAT number<input value={profile.vatNumber} onChange={(event) => update("vatNumber", event.target.value)} placeholder="If VAT registered" /></label>
            <label>Conveyancers<input type="number" min="0" value={profile.conveyancerCount} onChange={(event) => update("conveyancerCount", Number(event.target.value))} /></label>
            <label>Senior attorneys<input type="number" min="0" value={profile.seniorAttorneyCount} onChange={(event) => update("seniorAttorneyCount", Number(event.target.value))} /></label>
            <label>Junior attorneys<input type="number" min="0" value={profile.juniorAttorneyCount} onChange={(event) => update("juniorAttorneyCount", Number(event.target.value))} /></label>
            <label>Candidate attorneys<input type="number" min="0" value={profile.candidateAttorneyCount} onChange={(event) => update("candidateAttorneyCount", Number(event.target.value))} /></label>
            <label>Legal secretaries<input type="number" min="0" value={profile.legalSecretaryCount} onChange={(event) => update("legalSecretaryCount", Number(event.target.value))} /></label>
          </div>
        )}

        {step === 3 && (
          <div className="brand-upload">
            <div className="logo-preview">{profile.logoDataUrl ? <img src={profile.logoDataUrl} alt="Tenant logo preview" /> : <Building2 size={36} />}</div>
            <div>
              <label>Firm logo<input type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => handleLogo(event.target.files?.[0])} /></label>
              <p>Logo, address and phone number will appear on generated contracts, briefs and client-facing drafts.</p>
            </div>
          </div>
        )}

        <div className="onboarding-actions">
          <button className="ghost" disabled={saving || step === 1} onClick={() => setStep((current) => Math.max(1, current - 1))}>Back</button>
          {step < 3 ? (
            <button className="primary" disabled={saving} onClick={() => persist(step + 1)}>{saving ? "Saving..." : "Save and continue"}</button>
          ) : (
            <button className="primary" disabled={saving} onClick={() => persist(3, true)}>{saving ? "Saving..." : "Finish setup"}</button>
          )}
        </div>
      </section>
    </div>
  );
}

function AIAssistantPanel({
  open,
  setOpen,
  activeAgent,
  messages,
  busy,
  contextSummary,
  askAi
}: {
  open: boolean;
  setOpen: (open: boolean) => void;
  activeAgent: AiAgentKey;
  messages: AiChatMessage[];
  busy: boolean;
  contextSummary: string;
  askAi: (message: string, agentKey?: AiAgentKey) => Promise<void>;
}) {
  const [draft, setDraft] = useState("");
  const quickPrompts: Record<AiAgentKey, string[]> = {
    general: ["What should I focus on today?", "Summarise this firm's current workload."],
    drafting: ["Review the current document intake for missing fields.", "Draft a clause checklist for this document."],
    research: ["Find the key legal issues in my latest research sources.", "Prepare a research plan with citations required."],
    secretary: ["Turn open work into a secretary task list.", "Draft a professional client update."],
    billing: ["Summarise billing follow-ups and payment risks.", "Draft a polite payment reminder."],
    portal: ["Create a client-safe conveyancing progress update.", "Explain what portal data should be hidden."],
    settings: ["Check what is missing from AI and email setup.", "Explain how to train the AI safely."]
  };

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const message = draft;
    setDraft("");
    await askAi(message, activeAgent);
  }

  return (
    <>
      <button className="ai-launcher" onClick={() => setOpen(!open)}>
        <Sparkles size={18} /> {aiAgentLabels[activeAgent]}
      </button>
      {open && (
        <aside className="ai-panel">
          <div className="ai-panel-head">
            <div>
              <p className="eyebrow">AI native workspace</p>
              <strong>{aiAgentLabels[activeAgent]}</strong>
            </div>
            <button className="small" onClick={() => setOpen(false)}><X size={16} /></button>
          </div>
          <div className="ai-context">
            <ShieldCheck size={16} />
            <span>{contextSummary}</span>
          </div>
          <div className="ai-quick">
            {quickPrompts[activeAgent].map((prompt) => (
              <button className="small" key={prompt} disabled={busy} onClick={() => askAi(prompt, activeAgent)}>{prompt}</button>
            ))}
          </div>
          <div className="ai-messages">
            {messages.map((message) => (
              <article className={`ai-message ${message.role}`} key={message.id}>
                <span>{message.role === "user" ? "You" : "LawPath AI"}</span>
                <p>{message.content}</p>
              </article>
            ))}
            {busy && <article className="ai-message assistant"><span>LawPath AI</span><p>Thinking with tenant context...</p></article>}
          </div>
          <form className="ai-input" onSubmit={submit}>
            <textarea value={draft} onChange={(event) => setDraft(event.target.value)} placeholder={`Ask the ${aiAgentLabels[activeAgent].toLowerCase()}...`} />
            <button className="primary" type="submit" disabled={busy || !draft.trim()}><Send size={18} /> Send</button>
          </form>
        </aside>
      )}
    </>
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
      <div className="auth-card-brand">
        <div className="brand-mark">LP</div>
        <div className="auth-card-brand-text">
          <strong>LawPath SA</strong>
          <span>South African legal practice platform</span>
        </div>
      </div>
      <div className="auth-card-body">
      <div className="auth-tabs">
        <button className={visibleMode === "register" ? "active" : ""} onClick={() => setMode("register")}>Register</button>
        <button className={visibleMode === "login" ? "active" : ""} onClick={() => setMode("login")}>Login</button>
      </div>
      <p className="auth-message">{message}</p>

      {visibleMode === "register" && (
        <form className="form" onSubmit={submitRegister}>
          <label>Lawyer name<input name="fullName" placeholder="e.g. Thandi Mokoena" required /></label>
          <label>Practice / firm name<input name="companyName" placeholder="e.g. Mokoena &amp; Partners Inc." required /></label>
          <label>Work email<input name="email" type="email" placeholder="you@yourfirm.co.za" required /></label>
          <label>Password<input name="password" type="password" placeholder="Minimum 8 characters" required /></label>
          <button className="primary" type="submit" disabled={busy}><UserPlus size={18} /> {busy ? "Creating..." : "Create tenant workspace"}</button>
          <button className="link-button" type="button" onClick={() => setMode("login")}>Already have an account?</button>
          <button className="link-button" type="button" onClick={onResumeSession}>Resume saved session</button>
        </form>
      )}

      {visibleMode === "login" && (
        <form className="form" onSubmit={submitLogin}>
          <label>Email<input name="email" type="email" placeholder="you@yourfirm.co.za" required /></label>
          <label>Password<input name="password" type="password" placeholder="Your password" required /></label>
          <button className="primary" type="submit" disabled={busy}><LogIn size={18} /> {busy ? "Logging in..." : "Login"}</button>
          <button className="link-button" type="button" onClick={() => setMode("forgot")}>Forgot password?</button>
          <button className="link-button" type="button" onClick={onResumeSession}>Resume saved session</button>
        </form>
      )}

      {visibleMode === "forgot" && (
        <form className="form" onSubmit={submitForgot}>
          <label>Account email<input name="email" type="email" placeholder="you@yourfirm.co.za" required /></label>
          <button className="primary" type="submit" disabled={busy}><Mail size={18} /> {busy ? "Processing..." : "Send reset link"}</button>
          <button className="link-button" type="button" onClick={() => setMode("login")}>Back to login</button>
        </form>
      )}
      </div>
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
  const outstanding = invoices.reduce((sum, invoice) => sum + invoice.amountCents - invoice.paidCents, 0);
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

function Drafting({
  contracts,
  setContracts,
  log,
  tenantProfile
}: {
  contracts: ContractDraft[];
  setContracts: React.Dispatch<React.SetStateAction<ContractDraft[]>>;
  log: (message: string) => void;
  tenantProfile: TenantProfile;
}) {
  const [preview, setPreview] = useState(contracts[0]?.body ?? "");
  const [fullPreviewOpen, setFullPreviewOpen] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState("Residential offer to purchase");

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const template = String(form.get("template"));
    const draft = buildDocumentDraft(template, form, tenantProfile);
    const { partyA, partyB, category, body } = draft;
    setPreview(body);
    setContracts((items) => [{ id: uid("C"), name: template, category, partyA, partyB, status: "Generated", updated: today(), body }, ...items]);
    log(`Generated ${template} for ${partyA}`);
  }

  return (
    <>
      <section className="grid-two">
        <Panel title="Contract writer" badge="AI-ready workflow">
          <form className="form" onSubmit={submit}>
            <label>Template
              <select name="template" value={selectedTemplate} onChange={(event) => setSelectedTemplate(event.target.value)}>
                <option>Residential offer to purchase</option>
                <option>Shareholder agreement</option>
                <option>Lease agreement</option>
                <option>Employment contract</option>
                <option>Sale of business agreement</option>
                <option>Antenuptial contract intake</option>
              </select>
            </label>
            <DocumentIntakeFields template={selectedTemplate} />
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
      {fullPreviewOpen && <DocumentPreviewModal body={preview} tenantProfile={tenantProfile} onClose={() => setFullPreviewOpen(false)} />}
    </>
  );
}

function DocumentIntakeFields({ template }: { template: string }) {
  if (template === "Residential offer to purchase") {
    return (
      <section className="intake-stack">
        <div className="intake-section">
          <h4>Parties</h4>
          <div className="form-row equal">
            <label>Seller full name<input name="sellerName" placeholder="Seller full legal name" /></label>
            <label>Seller ID / registration<input name="sellerId" placeholder="ID or registration number" /></label>
          </div>
          <label>Seller address<input name="sellerAddress" placeholder="Seller domicilium address" /></label>
          <div className="form-row equal">
            <label>Buyer full name<input name="buyerName" placeholder="Buyer full legal name" /></label>
            <label>Buyer ID / registration<input name="buyerId" placeholder="ID or registration number" /></label>
          </div>
          <label>Buyer address<input name="buyerAddress" placeholder="Buyer domicilium address" /></label>
        </div>

        <div className="intake-section">
          <h4>Property and price</h4>
          <label>Property address<input name="propertyAddress" placeholder="Street address of property" /></label>
          <div className="form-row equal">
            <label>Legal description<input name="propertyDescription" placeholder="Erf/unit/title deed description" /></label>
            <label>Offer / selling price<input name="purchasePrice" placeholder="R [amount]" /></label>
          </div>
          <div className="form-row equal">
            <label>Deposit<input name="deposit" placeholder="R [amount]" /></label>
            <label>Bond amount required<input name="bondAmount" placeholder="R [amount]" /></label>
          </div>
        </div>

        <div className="intake-section">
          <h4>Estate agent and conveyancers</h4>
          <div className="form-row equal">
            <label>Estate agency<input name="estateAgency" placeholder="Estate agency name" /></label>
            <label>Agent name<input name="estateAgentName" placeholder="Estate agent name" /></label>
          </div>
          <div className="form-row equal">
            <label>Agent email<input name="estateAgentEmail" placeholder="agent@example.co.za" /></label>
            <label>Commission<input name="agentCommission" placeholder="Commission amount/percentage and payer" /></label>
          </div>
          <div className="form-row equal">
            <label>Transferring attorney / conveyancer<input name="conveyancerName" placeholder="Conveyancer firm/name" /></label>
            <label>Conveyancer email<input name="conveyancerEmail" placeholder="transfers@example.co.za" /></label>
          </div>
        </div>

        <div className="intake-section">
          <h4>Linked sale and timelines</h4>
          <label className="switch-row"><input name="linkedSale" type="checkbox" defaultChecked /> Buyer must sell another property before this offer proceeds</label>
          <label>Linked property address<input name="linkedPropertyAddress" placeholder="Address of buyer's linked sale property" /></label>
          <div className="form-row equal">
            <label>Offer acceptance deadline<input name="acceptanceDeadline" type="date" /></label>
            <label>Bond approval deadline<input name="bondDeadline" type="date" /></label>
          </div>
          <div className="form-row equal">
            <label>Linked sale deadline<input name="linkedSaleDeadline" type="date" /></label>
            <label>Target transfer date<input name="transferTargetDate" type="date" /></label>
          </div>
          <div className="form-row equal">
            <label>Occupation date<input name="occupationDate" type="date" /></label>
            <label>Occupational rent<input name="occupationalRent" placeholder="R [amount] per month" /></label>
          </div>
        </div>
      </section>
    );
  }

  if (template === "Shareholder agreement") {
    return (
      <section className="intake-stack">
        <div className="intake-section">
          <h4>Company and shareholders</h4>
          <div className="form-row equal">
            <label>Company name<input name="companyName" defaultValue="Ndlovu Holdings (Pty) Ltd" /></label>
            <label>Registration number<input name="companyRegistration" defaultValue="2024/123456/07" /></label>
          </div>
          <div className="form-row equal">
            <label>Shareholder 1<input name="shareholderOne" defaultValue="Sipho Ndlovu" /></label>
            <label>Shareholder 2<input name="shareholderTwo" defaultValue="Aisha Patel" /></label>
          </div>
          <label>Shareholding table<textarea name="shareholdingTable" defaultValue="Sipho Ndlovu - 60 ordinary shares - 60%; Aisha Patel - 40 ordinary shares - 40%." /></label>
        </div>
        <div className="intake-section">
          <h4>Governance and controls</h4>
          <label>Business of the company<input name="businessDescription" defaultValue="Legal technology services and related consulting." /></label>
          <div className="form-row equal">
            <label>Board composition<input name="boardComposition" defaultValue="3 directors, with each major shareholder appointing one director." /></label>
            <label>Reserved matter threshold<input name="reservedThreshold" defaultValue="75% shareholder approval" /></label>
          </div>
          <label>Reserved matters<textarea name="reservedMatters" defaultValue="Issuing shares, changing the business, borrowing above R500 000, selling material assets, appointing auditors, approving annual budgets and entering related-party transactions." /></label>
        </div>
        <div className="intake-section">
          <h4>Transfers, deadlock and exit</h4>
          <div className="form-row equal">
            <label>Funding / shareholder loans<input name="fundingTerms" defaultValue="Initial shareholder loans pro rata to shareholding, interest-free unless agreed in writing." /></label>
            <label>Valuation method<input name="valuationMethod" defaultValue="Independent CA(SA) valuation using fair market value." /></label>
          </div>
          <div className="form-row equal">
            <label>Deadlock mechanism<input name="deadlockMechanism" defaultValue="Escalation, mediation, then buy-sell procedure." /></label>
            <label>Restraint period<input name="restraintPeriod" defaultValue="24 months in South Africa, subject to attorney review." /></label>
          </div>
          <label>Dispute resolution<input name="disputeResolution" defaultValue="Negotiation, mediation, then arbitration in Johannesburg." /></label>
        </div>
      </section>
    );
  }

  if (template === "Lease agreement") {
    return (
      <section className="intake-stack">
        <div className="intake-section">
          <h4>Parties and premises</h4>
          <div className="form-row equal">
            <label>Landlord<input name="landlordName" defaultValue="Protea Property Holdings (Pty) Ltd" /></label>
            <label>Tenant<input name="tenantName" defaultValue="Ubuntu Legal Services Inc." /></label>
          </div>
          <label>Premises address<input name="leasePremises" defaultValue="Suite 4, 18 Loop Street, Cape Town" /></label>
          <label>Permitted use<input name="permittedUse" defaultValue="Professional legal offices and administrative support services." /></label>
        </div>
        <div className="intake-section">
          <h4>Term and money</h4>
          <div className="form-row equal">
            <label>Lease start<input name="leaseStart" type="date" defaultValue="2026-07-01" /></label>
            <label>Lease end<input name="leaseEnd" type="date" defaultValue="2029-06-30" /></label>
          </div>
          <div className="form-row equal">
            <label>Monthly rental<input name="monthlyRental" defaultValue="R 38 000 plus VAT" /></label>
            <label>Deposit<input name="leaseDeposit" defaultValue="R 76 000" /></label>
          </div>
          <div className="form-row equal">
            <label>Annual escalation<input name="rentalEscalation" defaultValue="7% per annum" /></label>
            <label>Utilities and operating costs<input name="utilities" defaultValue="Tenant pays electricity, water, refuse, parking and proportionate operating costs." /></label>
          </div>
        </div>
        <div className="intake-section">
          <h4>Controls and exit</h4>
          <div className="form-row equal">
            <label>Renewal option<input name="renewalOption" defaultValue="One renewal period of 3 years on terms agreed 90 days before expiry." /></label>
            <label>Notice period<input name="leaseNotice" defaultValue="20 business days for breach notices." /></label>
          </div>
          <label>Special conditions<textarea name="leaseSpecialConditions" defaultValue="Tenant may install ordinary office signage subject to landlord approval and municipal rules." /></label>
        </div>
      </section>
    );
  }

  if (template === "Employment contract") {
    return (
      <section className="intake-stack">
        <div className="intake-section">
          <h4>Employer and employee</h4>
          <div className="form-row equal">
            <label>Employer<input name="employerName" defaultValue="LawPath SA (Pty) Ltd" /></label>
            <label>Employee<input name="employeeName" defaultValue="Nomsa Khumalo" /></label>
          </div>
          <div className="form-row equal">
            <label>Position<input name="positionTitle" defaultValue="Legal Operations Manager" /></label>
            <label>Work location<input name="workLocation" defaultValue="Hybrid, Johannesburg office and remote work" /></label>
          </div>
        </div>
        <div className="intake-section">
          <h4>Pay and working terms</h4>
          <div className="form-row equal">
            <label>Start date<input name="employmentStart" type="date" defaultValue="2026-07-01" /></label>
            <label>Probation<input name="probationPeriod" defaultValue="3 months" /></label>
          </div>
          <div className="form-row equal">
            <label>Remuneration<input name="remuneration" defaultValue="R 65 000 cost to company per month" /></label>
            <label>Working hours<input name="workingHours" defaultValue="08:30 to 17:00, Monday to Friday" /></label>
          </div>
          <label>Benefits<input name="benefits" defaultValue="Group risk benefits, paid annual leave and approved professional training." /></label>
        </div>
        <div className="intake-section">
          <h4>Risk clauses</h4>
          <div className="form-row equal">
            <label>Notice period<input name="employmentNotice" defaultValue="One calendar month after probation" /></label>
            <label>Restraint / non-solicit<input name="employmentRestraint" defaultValue="12 month client and employee non-solicitation, subject to attorney review." /></label>
          </div>
          <label>Confidentiality and IP<textarea name="employmentConfidentiality" defaultValue="Employee must protect confidential information, return company property and assign work product and intellectual property created in the course and scope of employment." /></label>
        </div>
      </section>
    );
  }

  if (template === "Sale of business agreement") {
    return (
      <section className="intake-stack">
        <div className="intake-section">
          <h4>Parties and business</h4>
          <div className="form-row equal">
            <label>Seller<input name="businessSeller" defaultValue="Kopano Consulting (Pty) Ltd" /></label>
            <label>Purchaser<input name="businessBuyer" defaultValue="Mabena Growth Partners (Pty) Ltd" /></label>
          </div>
          <label>Business being sold<input name="businessDescription" defaultValue="The seller's accounting and payroll services business operated from Rosebank, Johannesburg." /></label>
          <label>Effective date<input name="effectiveDate" type="date" defaultValue="2026-08-01" /></label>
        </div>
        <div className="intake-section">
          <h4>Assets, price and staff</h4>
          <div className="form-row equal">
            <label>Purchase price<input name="businessPurchasePrice" defaultValue="R 4 500 000" /></label>
            <label>Deposit<input name="businessDeposit" defaultValue="R 450 000" /></label>
          </div>
          <label>Assets included<textarea name="assetsIncluded" defaultValue="Goodwill, customer contracts, equipment, software licences capable of transfer, trading name and business records." /></label>
          <label>Excluded assets<textarea name="assetsExcluded" defaultValue="Seller bank accounts, tax refunds, pre-effective-date debtors and personal vehicles." /></label>
          <label>Employees transferring<input name="employeesTransferring" defaultValue="8 employees, subject to section 197 review and consultation." /></label>
        </div>
        <div className="intake-section">
          <h4>Conditions and protections</h4>
          <div className="form-row equal">
            <label>Due diligence deadline<input name="dueDiligenceDeadline" type="date" defaultValue="2026-07-15" /></label>
            <label>Restraint period<input name="businessRestraint" defaultValue="24 months within Gauteng" /></label>
          </div>
          <label>Warranties and special conditions<textarea name="businessWarranties" defaultValue="Seller warrants accuracy of financial records, ownership of assets, no undisclosed material liabilities and no threatened major customer termination." /></label>
        </div>
      </section>
    );
  }

  return (
    <section className="intake-stack">
      <div className="intake-section">
        <h4>Intended spouses</h4>
        <div className="form-row equal">
          <label>First intended spouse<input name="spouseOne" defaultValue="Michael Botha" /></label>
          <label>Second intended spouse<input name="spouseTwo" defaultValue="Zanele Maseko" /></label>
        </div>
        <div className="form-row equal">
          <label>Marriage date<input name="marriageDate" type="date" defaultValue="2026-09-12" /></label>
          <label>Marriage location<input name="marriageLocation" defaultValue="Pretoria, Gauteng" /></label>
        </div>
      </div>
      <div className="intake-section">
        <h4>Marital property system</h4>
        <label>Chosen regime
          <select name="maritalRegime" defaultValue="Out of community of property with accrual">
            <option>Out of community of property with accrual</option>
            <option>Out of community of property without accrual</option>
          </select>
        </label>
        <div className="form-row equal">
          <label>Spouse 1 commencement value<input name="spouseOneCommencement" defaultValue="R 250 000" /></label>
          <label>Spouse 2 commencement value<input name="spouseTwoCommencement" defaultValue="R 180 000" /></label>
        </div>
        <label>Excluded assets<textarea name="excludedAssets" defaultValue="Inherited property, pre-marriage retirement interests, family trust distributions and listed personal assets are to be considered for exclusion." /></label>
      </div>
      <div className="intake-section">
        <h4>Notary and registration</h4>
        <div className="form-row equal">
          <label>Notary<input name="notaryName" defaultValue="Mokoena & Partners Notaries" /></label>
          <label>Registration deadline<input name="registrationDeadline" type="date" defaultValue="2026-12-12" /></label>
        </div>
        <label>Special instructions<textarea name="ancSpecialInstructions" defaultValue="Confirm both parties received independent explanation of accrual consequences before signature." /></label>
      </div>
    </section>
  );
}

function formText(form: FormData, key: string, fallback = "[insert]") {
  const value = String(form.get(key) || "").trim();
  return value || fallback;
}

function buildDocumentDraft(template: string, form: FormData, tenantProfile: TenantProfile) {
  if (template === "Residential offer to purchase") {
    return {
      partyA: formText(form, "sellerName"),
      partyB: formText(form, "buyerName"),
      category: "Conveyancing",
      body: buildOfferToPurchaseBody(form, tenantProfile)
    };
  }

  if (template === "Shareholder agreement") {
    return {
      partyA: formText(form, "shareholderOne"),
      partyB: formText(form, "shareholderTwo"),
      category: "Commercial",
      body: buildShareholderAgreementBody(form, tenantProfile)
    };
  }

  if (template === "Lease agreement") {
    return {
      partyA: formText(form, "landlordName"),
      partyB: formText(form, "tenantName"),
      category: "Property",
      body: buildLeaseAgreementBody(form, tenantProfile)
    };
  }

  if (template === "Employment contract") {
    return {
      partyA: formText(form, "employerName"),
      partyB: formText(form, "employeeName"),
      category: "Employment",
      body: buildEmploymentContractBody(form, tenantProfile)
    };
  }

  if (template === "Sale of business agreement") {
    return {
      partyA: formText(form, "businessSeller"),
      partyB: formText(form, "businessBuyer"),
      category: "Commercial",
      body: buildSaleOfBusinessBody(form, tenantProfile)
    };
  }

  return {
    partyA: formText(form, "spouseOne"),
    partyB: formText(form, "spouseTwo"),
    category: "Family",
    body: buildAntenuptialContractIntakeBody(form, tenantProfile)
  };
}

function tenantLetterhead(profile: TenantProfile) {
  const address = [profile.addressLine1, profile.addressLine2, profile.city, profile.province, profile.postalCode].filter(Boolean).join(", ");
  const contacts = [profile.phone, profile.website, profile.lpcRegistrationNumber ? `LPC: ${profile.lpcRegistrationNumber}` : ""].filter(Boolean).join(" | ");
  return [
    profile.logoDataUrl ? "[Tenant logo attached to document header]" : "",
    profile.tradingName || "Tenant firm name",
    address,
    contacts,
    ""
  ].filter((line) => line !== "").join("\n");
}

function documentFooter(profile: TenantProfile) {
  const address = [profile.addressLine1, profile.addressLine2, profile.city, profile.province, profile.postalCode].filter(Boolean).join(", ");
  return [
    "",
    "------------------------------------------------------------",
    `Document footer: ${profile.tradingName || "Tenant firm"}${address ? ` | ${address}` : ""}${profile.phone ? ` | ${profile.phone}` : ""}`,
    "Generated by LawPath SA. Attorney review required before release."
  ].join("\n");
}

function documentHeader(title: string, lines: string[], instructions: string, profile: TenantProfile) {
  return [
    tenantLetterhead(profile),
    title.toUpperCase(),
    "",
    "IMPORTANT ATTORNEY REVIEW NOTE",
    "This document is a comprehensive working draft generated from the available instructions. It must be reviewed, completed and approved by a qualified South African legal practitioner before signature or client release.",
    "",
    ...lines,
    "Governing law: Republic of South Africa",
    "",
    "Drafting instructions captured:",
    instructions,
    "",
    "------------------------------------------------------------",
    ""
  ].join("\n");
}

function buildOfferToPurchaseBody(form: FormData, tenantProfile: TenantProfile) {
  const sellerName = formText(form, "sellerName");
  const sellerId = formText(form, "sellerId");
  const sellerAddress = formText(form, "sellerAddress");
  const buyerName = formText(form, "buyerName");
  const buyerId = formText(form, "buyerId");
  const buyerAddress = formText(form, "buyerAddress");
  const propertyAddress = formText(form, "propertyAddress");
  const propertyDescription = formText(form, "propertyDescription");
  const purchasePrice = formText(form, "purchasePrice");
  const deposit = formText(form, "deposit");
  const bondAmount = formText(form, "bondAmount");
  const estateAgency = formText(form, "estateAgency");
  const estateAgentName = formText(form, "estateAgentName");
  const estateAgentEmail = formText(form, "estateAgentEmail");
  const agentCommission = formText(form, "agentCommission");
  const conveyancerName = formText(form, "conveyancerName");
  const conveyancerEmail = formText(form, "conveyancerEmail");
  const linkedSale = form.get("linkedSale") === "on";
  const linkedPropertyAddress = formText(form, "linkedPropertyAddress", "not applicable");
  const acceptanceDeadline = formText(form, "acceptanceDeadline");
  const bondDeadline = formText(form, "bondDeadline");
  const linkedSaleDeadline = formText(form, "linkedSaleDeadline", "not applicable");
  const transferTargetDate = formText(form, "transferTargetDate");
  const occupationDate = formText(form, "occupationDate");
  const occupationalRent = formText(form, "occupationalRent");
  const instructions = formText(form, "instructions", "No additional instructions captured.");

  return [
    tenantLetterhead(tenantProfile),
    "RESIDENTIAL OFFER TO PURCHASE",
    "",
    "IMPORTANT ATTORNEY REVIEW NOTE",
    "This document is a comprehensive working draft generated from the available instructions. It must be reviewed, completed and approved by a qualified South African legal practitioner before signature or client release.",
    "",
    "TRANSACTION SUMMARY",
    `Seller: ${sellerName} (${sellerId})`,
    `Purchaser: ${buyerName} (${buyerId})`,
    `Property: ${propertyAddress}`,
    `Legal description: ${propertyDescription}`,
    `Purchase price: ${purchasePrice}`,
    `Estate agent: ${estateAgentName}, ${estateAgency}`,
    `Conveyancer: ${conveyancerName}`,
    `Linked sale condition: ${linkedSale ? `Yes - purchaser's property at ${linkedPropertyAddress}` : "No"}`,
    `Target transfer date: ${transferTargetDate}`,
    "",
    "Drafting instructions captured:",
    instructions,
    "",
    "------------------------------------------------------------",
    "",
    "OFFER TO PURCHASE IMMOVABLE PROPERTY",
    "",
    "1. PARTIES",
    `1.1 The Seller is ${sellerName}, identity/registration number ${sellerId}, of ${sellerAddress}.`,
    `1.2 The Purchaser is ${buyerName}, identity/registration number ${buyerId}, of ${buyerAddress}.`,
    "1.3 A party signing through a representative warrants that the representative has proper authority and shall provide written proof of authority on request.",
    "1.4 The Seller and Purchaser are collectively referred to as the parties.",
    "",
    "2. OFFER AND ACCEPTANCE",
    `2.1 The Purchaser offers to purchase the property from the Seller for ${purchasePrice}, subject to the terms and conditions of this agreement.`,
    `2.2 This offer shall remain open for acceptance by the Seller until ${acceptanceDeadline}, unless withdrawn earlier in writing before acceptance where legally permissible.`,
    "2.3 Acceptance shall occur when the Seller signs this agreement and communicates acceptance to the Purchaser or the estate agent.",
    "2.4 Once accepted, this agreement is binding, subject to the fulfilment or waiver of any suspensive conditions recorded below.",
    "",
    "3. PROPERTY",
    `3.1 The property is situated at ${propertyAddress}.`,
    `3.2 The legal description is ${propertyDescription}, together with all permanent fixtures and improvements unless excluded in writing.`,
    "3.3 If there is a conflict between the street address and deeds office description, the deeds office and title deed description shall prevail.",
    "3.4 The sale includes all keys, remote controls, approved building plans in the Seller's possession, and fixtures normally forming part of the property unless listed as exclusions.",
    "",
    "4. PURCHASE PRICE AND PAYMENT",
    `4.1 The purchase price is ${purchasePrice}.`,
    `4.2 The Purchaser shall pay a deposit of ${deposit} into the conveyancer's trust account within 5 business days after acceptance or such other date agreed in writing.`,
    `4.3 The balance of the purchase price shall be secured by an acceptable bank guarantee or other security approved by the Seller for approximately ${bondAmount}, within the period required by this agreement.`,
    "4.4 All funds paid to the conveyancer shall be held in trust pending registration of transfer or lawful cancellation.",
    "4.5 Interest on trust monies shall accrue as directed in the conveyancer's investment mandate, subject to applicable law and professional rules.",
    "",
    "5. SUSPENSIVE CONDITIONS",
    `5.1 This agreement is subject to the Purchaser obtaining written bond approval for not less than ${bondAmount} by ${bondDeadline}.`,
    linkedSale
      ? `5.2 This agreement is further subject to the Purchaser concluding a binding sale agreement for the Purchaser's property at ${linkedPropertyAddress} by ${linkedSaleDeadline}, on terms reasonably acceptable to the Purchaser.`
      : "5.2 No linked-sale suspensive condition has been selected for this transaction.",
    "5.3 The party benefiting from a suspensive condition may waive that condition in writing before the due date, provided the waiver is lawful and does not prejudice the other party.",
    "5.4 If a suspensive condition is not fulfilled or waived by the due date, this agreement shall lapse and the parties shall be restored as far as reasonably possible to their prior positions.",
    "",
    "6. TRANSFER AND CONVEYANCER",
    `6.1 Transfer shall be attended to by ${conveyancerName}, email ${conveyancerEmail}, unless the parties agree otherwise in writing.`,
    "6.2 The Purchaser shall pay transfer costs, transfer duty, deeds office fees and conveyancer charges on demand, unless a different allocation is recorded in this agreement.",
    "6.3 The Seller shall sign all documents and provide all FICA, rates, levy, compliance and title documentation reasonably required for transfer.",
    `6.4 The parties record ${transferTargetDate} as the target transfer date. This date is a planning target and may move according to bond, municipal, deeds office, compliance and linked-sale requirements.`,
    "",
    "7. RATES, LEVIES AND MUNICIPAL CLEARANCE",
    "7.1 The Seller remains responsible for rates, taxes, levies, utilities and municipal charges up to registration of transfer unless occupational rent or another written arrangement applies.",
    "7.2 The Seller shall co-operate in obtaining municipal clearance figures, levy clearance figures, homeowners association certificates and other approvals required for transfer.",
    "7.3 Any pro rata adjustments shall be calculated by the conveyancer on registration unless the parties agree otherwise.",
    "",
    "8. OCCUPATION, POSSESSION AND RISK",
    `8.1 Occupation shall be given on ${occupationDate}, subject to the transfer timeline and any occupational rent arrangement.`,
    `8.2 If occupation occurs before registration, the occupying party shall pay occupational rent of ${occupationalRent}, monthly in advance.`,
    "8.3 Risk in and benefit of the property shall pass on registration unless the parties expressly agree otherwise.",
    "8.4 The occupying party shall keep the property in reasonable condition and shall not make structural alterations before registration without written consent.",
    "",
    "9. VOETSTOOTS, CONDITION AND DISCLOSURES",
    "9.1 The property is sold voetstoots, subject to all title deed conditions, servitudes, zoning restrictions and municipal requirements.",
    "9.2 The Seller warrants that all known latent defects and material facts that may affect the Purchaser's decision have been disclosed in writing.",
    "9.3 The Purchaser acknowledges having inspected the property or having had a reasonable opportunity to do so.",
    "9.4 The parties should attach a signed property condition disclosure form as an annexure.",
    "",
    "10. COMPLIANCE CERTIFICATES",
    "10.1 The Seller shall provide electrical, electric fence, gas, beetle, plumbing or other compliance certificates required by law, municipal rule, sectional title rule or local conveyancing practice.",
    "10.2 Unless otherwise agreed, the Seller shall bear the cost of obtaining required certificates and making repairs required to obtain those certificates.",
    "10.3 The Purchaser shall not unreasonably delay any inspection required for compliance certification.",
    "",
    "11. ESTATE AGENT AND COMMISSION",
    `11.1 The estate agency is ${estateAgency}, represented by ${estateAgentName}, email ${estateAgentEmail}.`,
    `11.2 Commission is recorded as ${agentCommission}.`,
    "11.3 Unless otherwise recorded, commission is payable on registration of transfer and may be paid from the proceeds of the sale through the conveyancer.",
    "11.4 The Seller warrants that no other agent has an undisclosed commission claim arising from this transaction, except as disclosed in writing.",
    "",
    "12. FICA, POPIA AND CLIENT INFORMATION",
    "12.1 Each party shall provide documents required under FICA and related anti-money-laundering laws.",
    "12.2 Each party consents to the processing of personal information for purposes of this transaction, transfer, compliance checks, communication, record keeping and reporting obligations.",
    "12.3 Personal information shall be processed only for lawful purposes and shared only with persons reasonably involved in the transaction, including the conveyancer, estate agent, bond originator, bank, municipality, body corporate, homeowners association and deeds office.",
    "",
    "13. BREACH",
    "13.1 If a party breaches this agreement and fails to remedy the breach within 7 days after written notice, the aggrieved party may claim specific performance or cancel and claim damages.",
    "13.2 If the Purchaser fails to pay amounts due or provide required guarantees, the Seller may exercise the remedies in this clause after proper notice.",
    "13.3 Legal costs incurred in enforcing this agreement may be recovered on the scale permitted by law or as ordered by a competent court.",
    "",
    "14. DOMICILIUM AND NOTICES",
    `14.1 The Seller chooses ${sellerAddress} as domicilium for notices and legal process.`,
    `14.2 The Purchaser chooses ${buyerAddress} as domicilium for notices and legal process.`,
    "14.3 Notices may also be sent by email where email details are provided, provided that formal service requirements remain governed by applicable law.",
    "",
    "15. WHOLE AGREEMENT",
    "15.1 This agreement contains the entire agreement between the parties regarding the sale of the property.",
    "15.2 No amendment, cancellation or waiver shall be valid unless recorded in writing and signed by both parties.",
    "15.3 If any clause is unenforceable, the remaining clauses shall continue to operate as far as legally possible.",
    "",
    "16. JURISDICTION AND DISPUTE RESOLUTION",
    "16.1 This agreement is governed by South African law.",
    "16.2 The parties consent to the jurisdiction of the competent South African courts, subject to any statutory limits and the nature of the dispute.",
    "16.3 The parties may attempt good-faith negotiation or mediation before litigation where appropriate.",
    "",
    "17. SIGNATURE",
    `Signed by the Seller, ${sellerName}, at __________________ on __________________.`,
    "Seller signature: __________________",
    "",
    `Signed by the Purchaser, ${buyerName}, at __________________ on __________________.`,
    "Purchaser signature: __________________",
    "",
    "ANNEXURES",
    "A. Property condition disclosure form",
    "B. Fixtures, fittings and exclusions schedule",
    "C. FICA checklist",
    "D. Compliance certificate schedule",
    "E. Linked-sale proof and timeline schedule",
    "F. Estate agent mandate or commission confirmation"
  ].join("\n") + documentFooter(tenantProfile);
}

function buildShareholderAgreementBody(form: FormData, tenantProfile: TenantProfile) {
  const companyName = formText(form, "companyName");
  const companyRegistration = formText(form, "companyRegistration");
  const shareholderOne = formText(form, "shareholderOne");
  const shareholderTwo = formText(form, "shareholderTwo");
  const shareholdingTable = formText(form, "shareholdingTable");
  const businessDescription = formText(form, "businessDescription");
  const boardComposition = formText(form, "boardComposition");
  const reservedThreshold = formText(form, "reservedThreshold");
  const reservedMatters = formText(form, "reservedMatters");
  const fundingTerms = formText(form, "fundingTerms");
  const valuationMethod = formText(form, "valuationMethod");
  const deadlockMechanism = formText(form, "deadlockMechanism");
  const restraintPeriod = formText(form, "restraintPeriod");
  const disputeResolution = formText(form, "disputeResolution");
  const instructions = formText(form, "instructions", "No additional instructions captured.");

  return documentHeader("Shareholders Agreement", [
    `Company: ${companyName} (${companyRegistration})`,
    `Shareholders: ${shareholderOne}; ${shareholderTwo}`,
    `Business: ${businessDescription}`
  ], instructions, tenantProfile) + [
    "1. PARTIES AND COMPANY",
    `1.1 The company is ${companyName}, registration number ${companyRegistration}, a private company incorporated in South Africa.`,
    `1.2 The initial shareholders are ${shareholderOne} and ${shareholderTwo}, together with any further shareholder who signs a deed of adherence.`,
    "1.3 The parties agree to regulate their relationship as shareholders and their participation in the company through this agreement, the Companies Act and the company's MOI.",
    "",
    "2. SHARE CAPITAL AND OWNERSHIP",
    `2.1 The initial shareholding is recorded as follows: ${shareholdingTable}`,
    "2.2 No shares, options or convertible securities may be issued unless approved under the reserved matters clause.",
    "2.3 The company secretary or authorised officer shall keep the securities register aligned with this agreement and the Companies Act.",
    "",
    "3. BUSINESS OF THE COMPANY",
    `3.1 The business of the company is ${businessDescription}.`,
    "3.2 The company may not materially change its business, dispose of a material undertaking or enter a new line of business without the required reserved matter approval.",
    "",
    "4. BOARD, MANAGEMENT AND VOTING",
    `4.1 The board composition shall be: ${boardComposition}.`,
    "4.2 Directors shall act in the best interests of the company and comply with fiduciary duties under South African law.",
    "4.3 Board meetings require reasonable notice, an agenda and proper minutes.",
    `4.4 Reserved matters require ${reservedThreshold}.`,
    `4.5 Reserved matters include: ${reservedMatters}.`,
    "",
    "5. FUNDING AND SHAREHOLDER LOANS",
    `5.1 Funding arrangements are: ${fundingTerms}.`,
    "5.2 Any shareholder loan must be recorded in writing, including amount, interest, repayment terms, ranking and whether subordination is required.",
    "5.3 No shareholder is obliged to provide further funding unless expressly agreed in writing.",
    "",
    "6. TRANSFER OF SHARES",
    "6.1 A shareholder may not transfer, pledge or otherwise encumber shares except as permitted by this agreement.",
    "6.2 A selling shareholder must first give a transfer notice to the other shareholders, who shall have pre-emptive rights on the same terms.",
    "6.3 Any transferee must sign a deed of adherence before becoming registered as shareholder.",
    "",
    "7. TAG-ALONG, DRAG-ALONG AND EXIT",
    "7.1 If a majority shareholder receives a bona fide third-party offer, minority shareholders shall have tag-along rights on equivalent terms.",
    "7.2 Drag-along rights may apply if the required majority approves a sale, subject to fair process and equivalent terms for all affected shareholders.",
    `7.3 Fair value or fair market value shall be determined by ${valuationMethod}.`,
    "",
    "8. DEADLOCK",
    `8.1 A deadlock shall be handled through ${deadlockMechanism}.`,
    "8.2 Until the deadlock is resolved, the company must continue ordinary-course business and avoid prejudicing assets, staff, clients or statutory compliance.",
    "",
    "9. RESTRAINT, CONFIDENTIALITY AND IP",
    `9.1 Restraint and non-solicitation undertakings shall apply for ${restraintPeriod}, subject to enforceability review.`,
    "9.2 Shareholders must protect confidential information and may use it only for company purposes.",
    "9.3 Intellectual property created for the company or using company resources shall belong to the company unless otherwise agreed.",
    "",
    "10. DEFAULT",
    "10.1 Default events include material breach, fraud, insolvency, prohibited transfer, loss of capacity, death or ceasing employment where founder-employment terms apply.",
    "10.2 Non-defaulting shareholders may require a compulsory transfer mechanism, valuation or other remedy selected by the attorney.",
    "",
    "11. DISPUTE RESOLUTION",
    `11.1 Disputes shall be handled by ${disputeResolution}.`,
    "11.2 Urgent interdictory relief may still be sought from a competent South African court.",
    "",
    "12. SIGNATURE",
    `Signed by ${shareholderOne}: __________________`,
    `Signed by ${shareholderTwo}: __________________`,
    "",
    "SCHEDULES",
    "1. Shareholding table",
    "2. Reserved matters",
    "3. Funding and loan terms",
    "4. Transfer notice form",
    "5. Deed of adherence"
  ].join("\n") + documentFooter(tenantProfile);
}

function buildLeaseAgreementBody(form: FormData, tenantProfile: TenantProfile) {
  const landlordName = formText(form, "landlordName");
  const tenantName = formText(form, "tenantName");
  const leasePremises = formText(form, "leasePremises");
  const permittedUse = formText(form, "permittedUse");
  const leaseStart = formText(form, "leaseStart");
  const leaseEnd = formText(form, "leaseEnd");
  const monthlyRental = formText(form, "monthlyRental");
  const leaseDeposit = formText(form, "leaseDeposit");
  const rentalEscalation = formText(form, "rentalEscalation");
  const utilities = formText(form, "utilities");
  const renewalOption = formText(form, "renewalOption");
  const leaseNotice = formText(form, "leaseNotice");
  const leaseSpecialConditions = formText(form, "leaseSpecialConditions");
  const instructions = formText(form, "instructions", "No additional instructions captured.");

  return documentHeader("Lease Agreement", [
    `Landlord: ${landlordName}`,
    `Tenant: ${tenantName}`,
    `Premises: ${leasePremises}`,
    `Term: ${leaseStart} to ${leaseEnd}`
  ], instructions, tenantProfile) + [
    "1. PARTIES AND PREMISES",
    `1.1 The Landlord is ${landlordName}.`,
    `1.2 The Tenant is ${tenantName}.`,
    `1.3 The leased premises are ${leasePremises}.`,
    `1.4 The premises may be used only for ${permittedUse}, unless the Landlord gives prior written consent.`,
    "",
    "2. TERM",
    `2.1 The lease starts on ${leaseStart} and ends on ${leaseEnd}.`,
    "2.2 The Tenant shall not occupy before the commencement date unless the Landlord gives written permission.",
    `2.3 Renewal option: ${renewalOption}.`,
    "",
    "3. RENTAL, DEPOSIT AND CHARGES",
    `3.1 Monthly rental is ${monthlyRental}, payable monthly in advance on or before the first business day of each month.`,
    `3.2 The Tenant shall pay a deposit of ${leaseDeposit}, to be held as security for obligations under this lease.`,
    `3.3 Rental escalation shall be ${rentalEscalation}.`,
    `3.4 Utilities and operating costs: ${utilities}.`,
    "3.5 Late payments shall bear interest at the rate permitted by law or the rate agreed by the parties, subject to attorney review.",
    "",
    "4. CONDITION, MAINTENANCE AND ALTERATIONS",
    "4.1 The Tenant acknowledges receipt of the premises in the condition recorded in the incoming inspection schedule.",
    "4.2 The Tenant must keep the premises clean, safe and in good order, fair wear and tear excepted.",
    "4.3 No structural alterations, signage or installations may be made without prior written approval and required municipal or body corporate approvals.",
    "",
    "5. COMPLIANCE AND CONDUCT",
    "5.1 The Tenant must comply with applicable laws, building rules, health and safety requirements, fire regulations and municipal by-laws.",
    "5.2 The Tenant may not cause nuisance, overload services, store hazardous goods or use the premises for unlawful purposes.",
    "",
    "6. BREACH AND CANCELLATION",
    `6.1 Breach notices require ${leaseNotice}, unless a shorter period is permitted by law for urgent or repeated breach.`,
    "6.2 If the breach is not remedied, the aggrieved party may claim specific performance, cancel the lease, claim damages and recover legal costs where permitted.",
    "",
    "7. SPECIAL CONDITIONS",
    `7.1 ${leaseSpecialConditions}`,
    "",
    "8. POPIA AND FICA",
    "8.1 Each party consents to processing of personal information for lease administration, compliance, billing and enforcement.",
    "8.2 Each party shall provide FICA and authority documents reasonably required by the other party.",
    "",
    "9. SIGNATURE",
    `Landlord signature for ${landlordName}: __________________`,
    `Tenant signature for ${tenantName}: __________________`,
    "",
    "ANNEXURES",
    "A. Premises plan",
    "B. Incoming inspection",
    "C. Building rules",
    "D. Deposit and charge schedule"
  ].join("\n") + documentFooter(tenantProfile);
}

function buildEmploymentContractBody(form: FormData, tenantProfile: TenantProfile) {
  const employerName = formText(form, "employerName");
  const employeeName = formText(form, "employeeName");
  const positionTitle = formText(form, "positionTitle");
  const workLocation = formText(form, "workLocation");
  const employmentStart = formText(form, "employmentStart");
  const probationPeriod = formText(form, "probationPeriod");
  const remuneration = formText(form, "remuneration");
  const workingHours = formText(form, "workingHours");
  const benefits = formText(form, "benefits");
  const employmentNotice = formText(form, "employmentNotice");
  const employmentRestraint = formText(form, "employmentRestraint");
  const employmentConfidentiality = formText(form, "employmentConfidentiality");
  const instructions = formText(form, "instructions", "No additional instructions captured.");

  return documentHeader("Employment Contract", [
    `Employer: ${employerName}`,
    `Employee: ${employeeName}`,
    `Position: ${positionTitle}`,
    `Start date: ${employmentStart}`
  ], instructions, tenantProfile) + [
    "1. APPOINTMENT",
    `1.1 ${employerName} appoints ${employeeName} as ${positionTitle}.`,
    `1.2 Employment commences on ${employmentStart}.`,
    `1.3 The primary work location is ${workLocation}, subject to reasonable operational requirements.`,
    "",
    "2. DUTIES AND POLICIES",
    "2.1 The Employee shall perform all duties reasonably associated with the position and any lawful instruction given by the Employer.",
    "2.2 The Employee shall comply with workplace policies, confidentiality rules, technology policies, client-care standards and professional conduct requirements.",
    "",
    "3. PROBATION AND PERFORMANCE",
    `3.1 The probation period is ${probationPeriod}.`,
    "3.2 During probation, performance, conduct, suitability and operational fit may be assessed through reasonable process.",
    "3.3 Confirmation after probation does not remove the Employer's rights under labour law, workplace discipline or operational requirements.",
    "",
    "4. REMUNERATION, BENEFITS AND HOURS",
    `4.1 Remuneration is ${remuneration}.`,
    `4.2 Working hours are ${workingHours}.`,
    `4.3 Benefits are ${benefits}.`,
    "4.4 Statutory deductions, tax, leave accrual and benefits administration shall be handled according to applicable South African law and employer policy.",
    "",
    "5. LEAVE",
    "5.1 Annual leave, sick leave, family responsibility leave and other statutory leave shall be granted according to the Basic Conditions of Employment Act and employer policy.",
    "5.2 Leave must be applied for and approved in advance except where impractical due to illness or emergency.",
    "",
    "6. CONFIDENTIALITY, IP AND DATA",
    `6.1 ${employmentConfidentiality}`,
    "6.2 The Employee shall comply with POPIA and protect client, employee and business information.",
    "6.3 Work product, documents, templates, software, processes and inventions created in the course and scope of employment shall belong to the Employer unless otherwise agreed.",
    "",
    "7. RESTRAINT AND NON-SOLICITATION",
    `7.1 ${employmentRestraint}`,
    "7.2 The enforceability of any restraint depends on reasonableness, protectable interests, scope, duration and territory and must be reviewed before enforcement.",
    "",
    "8. TERMINATION",
    `8.1 Notice period: ${employmentNotice}.`,
    "8.2 Termination must comply with South African labour law, fair procedure and any applicable disciplinary or incapacity process.",
    "8.3 On termination, the Employee must return property, passwords, records, client files and confidential information.",
    "",
    "9. SIGNATURE",
    `For the Employer, ${employerName}: __________________`,
    `Employee, ${employeeName}: __________________`
  ].join("\n") + documentFooter(tenantProfile);
}

function buildSaleOfBusinessBody(form: FormData, tenantProfile: TenantProfile) {
  const businessSeller = formText(form, "businessSeller");
  const businessBuyer = formText(form, "businessBuyer");
  const businessDescription = formText(form, "businessDescription");
  const effectiveDate = formText(form, "effectiveDate");
  const businessPurchasePrice = formText(form, "businessPurchasePrice");
  const businessDeposit = formText(form, "businessDeposit");
  const assetsIncluded = formText(form, "assetsIncluded");
  const assetsExcluded = formText(form, "assetsExcluded");
  const employeesTransferring = formText(form, "employeesTransferring");
  const dueDiligenceDeadline = formText(form, "dueDiligenceDeadline");
  const businessRestraint = formText(form, "businessRestraint");
  const businessWarranties = formText(form, "businessWarranties");
  const instructions = formText(form, "instructions", "No additional instructions captured.");

  return documentHeader("Sale of Business Agreement", [
    `Seller: ${businessSeller}`,
    `Purchaser: ${businessBuyer}`,
    `Business: ${businessDescription}`,
    `Effective date: ${effectiveDate}`,
    `Purchase price: ${businessPurchasePrice}`
  ], instructions, tenantProfile) + [
    "1. SALE",
    `1.1 The Seller sells and the Purchaser purchases the business described as ${businessDescription}.`,
    `1.2 The effective date is ${effectiveDate}, subject to fulfilment or waiver of suspensive conditions.`,
    "1.3 The sale is a sale of business assets and goodwill unless expressly structured otherwise by the attorney.",
    "",
    "2. PURCHASE PRICE AND PAYMENT",
    `2.1 The purchase price is ${businessPurchasePrice}.`,
    `2.2 The Purchaser shall pay a deposit of ${businessDeposit} into the nominated trust or business account on signature or as otherwise agreed.`,
    "2.3 The balance shall be paid on closing against delivery of the assets, records and completion deliverables.",
    "",
    "3. ASSETS INCLUDED AND EXCLUDED",
    `3.1 Included assets: ${assetsIncluded}.`,
    `3.2 Excluded assets: ${assetsExcluded}.`,
    "3.3 Risk and benefit in the included assets shall pass on the effective date or closing date selected by the attorney.",
    "",
    "4. DUE DILIGENCE AND CONDITIONS",
    `4.1 Due diligence must be completed by ${dueDiligenceDeadline}.`,
    "4.2 The Purchaser may review financial records, contracts, employee information, licences, tax records, customer information and material liabilities.",
    "4.3 Any regulatory approvals, landlord consents, customer novations or supplier consents must be listed as suspensive conditions where required.",
    "",
    "5. EMPLOYEES",
    `5.1 Employees transferring or affected: ${employeesTransferring}.`,
    "5.2 The parties must obtain labour-law advice on whether section 197 of the Labour Relations Act applies.",
    "5.3 Employee consultation, accrued leave, benefits, restraint arrangements and payroll transition must be handled before closing.",
    "",
    "6. WARRANTIES",
    `6.1 ${businessWarranties}`,
    "6.2 The Seller warrants that it has authority to sell the business and that no undisclosed encumbrances affect the included assets, except as disclosed.",
    "6.3 Warranty claims shall be subject to agreed notice periods, thresholds, caps and exclusions.",
    "",
    "7. RESTRAINT AND CONFIDENTIALITY",
    `7.1 Restraint: ${businessRestraint}.`,
    "7.2 The Seller shall not solicit transferred clients, customers or employees except as permitted in writing.",
    "7.3 Both parties must protect confidential business information and personal information processed during the transaction.",
    "",
    "8. CLOSING DELIVERABLES",
    "8.1 Closing deliverables include asset handover, customer list, supplier records, licences capable of transfer, employee records, passwords, keys, accounting records and signed transfer documents.",
    "8.2 The parties shall sign all documents reasonably required to implement the transaction.",
    "",
    "9. BREACH AND DISPUTES",
    "9.1 A party in breach shall have 7 days to remedy breach after written notice unless urgency requires immediate relief.",
    "9.2 Disputes shall be handled by negotiation, mediation and competent South African courts unless arbitration is selected.",
    "",
    "10. SIGNATURE",
    `For the Seller, ${businessSeller}: __________________`,
    `For the Purchaser, ${businessBuyer}: __________________`
  ].join("\n") + documentFooter(tenantProfile);
}

function buildAntenuptialContractIntakeBody(form: FormData, tenantProfile: TenantProfile) {
  const spouseOne = formText(form, "spouseOne");
  const spouseTwo = formText(form, "spouseTwo");
  const marriageDate = formText(form, "marriageDate");
  const marriageLocation = formText(form, "marriageLocation");
  const maritalRegime = formText(form, "maritalRegime");
  const spouseOneCommencement = formText(form, "spouseOneCommencement");
  const spouseTwoCommencement = formText(form, "spouseTwoCommencement");
  const excludedAssets = formText(form, "excludedAssets");
  const notaryName = formText(form, "notaryName");
  const registrationDeadline = formText(form, "registrationDeadline");
  const ancSpecialInstructions = formText(form, "ancSpecialInstructions");
  const instructions = formText(form, "instructions", "No additional instructions captured.");

  return documentHeader("Antenuptial Contract Intake", [
    `Intended spouses: ${spouseOne}; ${spouseTwo}`,
    `Marriage date and place: ${marriageDate}, ${marriageLocation}`,
    `Selected regime: ${maritalRegime}`,
    `Notary: ${notaryName}`
  ], instructions, tenantProfile) + [
    "1. INTAKE PURPOSE",
    `1.1 This intake records instructions for an antenuptial contract between ${spouseOne} and ${spouseTwo}.`,
    `1.2 The intended marriage is scheduled for ${marriageDate} at ${marriageLocation}.`,
    "1.3 This intake must be converted into a notarial antenuptial contract and registered in the deeds registry within the legally required period.",
    "",
    "2. SELECTED MARITAL PROPERTY SYSTEM",
    `2.1 The selected regime is: ${maritalRegime}.`,
    "2.2 The notary must explain the legal consequences of the chosen regime, including accrual, excluded assets, commencement values, debts and estate planning implications.",
    "",
    "3. COMMENCEMENT VALUES",
    `3.1 ${spouseOne} commencement value: ${spouseOneCommencement}.`,
    `3.2 ${spouseTwo} commencement value: ${spouseTwoCommencement}.`,
    "3.3 Supporting schedules of assets, liabilities and valuations should be attached and signed.",
    "",
    "4. EXCLUDED ASSETS",
    `4.1 Proposed excluded assets: ${excludedAssets}.`,
    "4.2 Exclusions must be described clearly enough to avoid later dispute and should be reviewed against the Matrimonial Property Act and current practice.",
    "",
    "5. NOTARY, EXECUTION AND REGISTRATION",
    `5.1 The appointed notary is ${notaryName}.`,
    `5.2 The target registration deadline is ${registrationDeadline}.`,
    "5.3 The parties must sign before a notary before marriage unless a court-authorised postnuptial process is followed.",
    "",
    "6. SPECIAL INSTRUCTIONS",
    `6.1 ${ancSpecialInstructions}`,
    "",
    "7. DOCUMENTS TO COLLECT",
    "7.1 Identity documents, proof of address, marriage officer details, asset schedules, liability schedules, valuation support and any trust or inheritance documents.",
    "",
    "8. ATTORNEY AND NOTARY CHECKLIST",
    "8.1 Confirm capacity, independent consent, absence of duress and clear explanation of accrual consequences.",
    "8.2 Confirm POPIA consent and FICA documents.",
    "8.3 Prepare the notarial deed, arrange signature, lodge for registration and provide registered copies to the parties.",
    "",
    "9. CLIENT ACKNOWLEDGEMENT",
    `Acknowledged by ${spouseOne}: __________________`,
    `Acknowledged by ${spouseTwo}: __________________`
  ].join("\n") + documentFooter(tenantProfile);
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

function DocumentPreviewModal({ body, tenantProfile, onClose }: { body: string; tenantProfile: TenantProfile; onClose: () => void }) {
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
          {tenantProfile.logoDataUrl && <img className="document-logo" src={tenantProfile.logoDataUrl} alt={`${tenantProfile.tradingName || "Tenant"} logo`} />}
          <pre>{body}</pre>
        </article>
      </div>
    </div>
  );
}

function ResearchDesk({
  research,
  setResearch,
  log,
  showToast
}: {
  research: ResearchItem[];
  setResearch: React.Dispatch<React.SetStateAction<ResearchItem[]>>;
  log: (message: string) => void;
  showToast: (type: Toast["type"], title: string, message: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [indexingBusy, setIndexingBusy] = useState(false);
  const [indexingStatus, setIndexingStatus] = useState("No indexing job running.");
  const results = useMemo(() => {
    const term = query.toLowerCase();
    return research.filter((item) => [item.title, item.court, item.year, item.tags.join(" "), item.summary].join(" ").toLowerCase().includes(term));
  }, [query, research]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const title = String(form.get("title") || "").trim();
    const sourceType = String(form.get("sourceType") || "Document bundle");
    const sourceUrl = String(form.get("sourceUrl") || "").trim();
    const court = String(form.get("court") || "").trim();
    const tags = String(form.get("tags")).split(",").map((tag) => tag.trim()).filter(Boolean);
    const summary = String(form.get("summary") || "").trim();

    if (!title) {
      const message = "Add a bundle title before indexing research.";
      setIndexingStatus(message);
      showToast("error", "Indexing blocked", message);
      return;
    }

    if (sourceType === "Website URL" && !sourceUrl) {
      const message = "Add the website URL you want LawPath to index.";
      setIndexingStatus(message);
      showToast("error", "Web source missing", message);
      return;
    }

    setIndexingBusy(true);
    setIndexingStatus(`Indexing queued for ${title}... extracting text, tags and source metadata.`);
    showToast("info", "Indexing queued", `${title} has been sent to the research index.`);

    await new Promise((resolve) => window.setTimeout(resolve, 900));

    const sourceLine = sourceUrl ? ` Source URL: ${sourceUrl}.` : "";
    const item: ResearchItem = {
      id: uid("R"),
      title,
      court: court || sourceType,
      year: new Date().getFullYear().toString(),
      tags: tags.length ? tags : [sourceType.toLowerCase()],
      summary: `${summary || "Research source indexed for search and matter notes."}${sourceLine}`
    };
    setResearch((items) => [item, ...items]);
    setIndexingStatus(`Indexed ${title}. ${item.tags.length} tags captured and ${sourceUrl ? "web source metadata" : "source metadata"} attached.`);
    log(`Indexed research bundle: ${title}`);
    showToast("success", "Research indexed", `${title} is now searchable in the local research index.`);
    setIndexingBusy(false);
  }

  return (
    <section className="grid-two">
      <Panel title="Case-law ingestion" badge="Bulk-ready">
        <form className="form" onSubmit={submit}>
          <label>Bundle title<input name="title" defaultValue="New authority bundle" /></label>
          <label>Source type
            <select name="sourceType" defaultValue="Website URL">
              <option>Website URL</option>
              <option>Case law bundle</option>
              <option>Legislation</option>
              <option>Practice manual</option>
              <option>Firm precedent</option>
              <option>Document bundle</option>
            </select>
          </label>
          <label>Web source URL<input name="sourceUrl" type="url" placeholder="https://www.saflii.org/..." /></label>
          <label>Court or source<input name="court" defaultValue="High Court / SCA / Constitutional Court" /></label>
          <label>Tags<input name="tags" defaultValue="conveyancing, mandate, damages" /></label>
          <label>Research note<textarea name="summary" defaultValue="Paste a large judgment bundle here. The app indexes the text for quick searching, tagging and matter notes." /></label>
          <div className="indexing-status">
            <Clock3 size={18} />
            <span>{indexingStatus}</span>
          </div>
          <button className="primary" type="submit" disabled={indexingBusy}><Archive size={18} /> {indexingBusy ? "Indexing..." : "Index research"}</button>
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

function AITrainingGuide({ setActiveView }: { setActiveView: (view: ViewKey) => void }) {
  return (
    <>
      <section className="training-hero">
        <div>
          <p className="eyebrow">Super admin playbook</p>
          <h2>Train LawPath AI with legal sources the right way.</h2>
          <p>Use this page as the operational checklist for building a retrieval augmented generation library from South African legal documents, websites, case law, legislation, practice notes and firm precedents.</p>
        </div>
        <div className="training-actions">
          <button className="primary" onClick={() => setActiveView("settings")}><LibraryBig size={18} /> Open RAG settings</button>
          <button className="ghost" onClick={() => setActiveView("research")}><Search size={18} /> Review research</button>
        </div>
      </section>

      <section className="training-grid">
        <article className="training-card">
          <span>1</span>
          <h3>Collect approved sources</h3>
          <p>Upload or connect only materials your platform or tenant is allowed to use: court judgments, legislation, practice manuals, firm precedents, clause banks, checklists, templates, client-facing guides and public legal websites.</p>
        </article>
        <article className="training-card">
          <span>2</span>
          <h3>Classify the scope</h3>
          <p>Mark every source as platform-wide, tenant template, or tenant-private. Platform sources can assist all firms. Tenant-private sources must only be retrieved inside that tenant workspace.</p>
        </article>
        <article className="training-card">
          <span>3</span>
          <h3>Clean and structure</h3>
          <p>Remove duplicates, bad OCR text, signatures, irrelevant email chains and outdated drafts. Add titles, jurisdiction, court, date, matter type, document type and practice area before indexing.</p>
        </article>
        <article className="training-card">
          <span>4</span>
          <h3>Index for retrieval</h3>
          <p>Chunk long documents into searchable passages, generate embeddings, store source metadata and require citations so attorneys can see which authority or precedent informed an answer.</p>
        </article>
      </section>

      <section className="training-layout">
        <Panel title="Recommended source types" badge="Knowledge base">
          <div className="source-checklist">
            <TrainingChecklistItem title="Case law" text="Judgments, law reports, court summaries and authority bundles tagged by court, date, topic and legal principle." />
            <TrainingChecklistItem title="Legislation and regulations" text="Acts, regulations, municipal rules, deeds office guidance, FICA and POPIA material with effective dates." />
            <TrainingChecklistItem title="Firm precedents" text="Approved contracts, letters, pleadings, checklists and internal drafting notes. Remove client secrets unless tenant-private." />
            <TrainingChecklistItem title="Websites" text="Public legal resources, regulator pages and practice updates captured with URL, access date, publisher and reliability notes." />
            <TrainingChecklistItem title="Matter learnings" text="Post-matter checklists, common conveyancing delays, billing notes and secretary workflows approved for reuse." />
          </div>
        </Panel>

        <Panel title="Quality rules before training" badge="Attorney review">
          <div className="quality-list">
            <div><CheckCircle2 size={18} /><p>Confirm copyright, licensing and permission to use each source for AI retrieval.</p></div>
            <div><CheckCircle2 size={18} /><p>Separate tenant-private material from platform-wide material before indexing.</p></div>
            <div><CheckCircle2 size={18} /><p>Redact personal information unless it is needed and lawful for that tenant workflow.</p></div>
            <div><CheckCircle2 size={18} /><p>Tag outdated sources so the AI can warn attorneys instead of treating them as current law.</p></div>
            <div><CheckCircle2 size={18} /><p>Test answers against known legal questions and require citations in research outputs.</p></div>
          </div>
        </Panel>
      </section>

      <section className="training-layout">
        <Panel title="Suggested ingestion workflow" badge="Operational">
          <ol className="training-steps">
            <li>Create a source record in Settings and choose Platform or Tenant template scope.</li>
            <li>Upload files or add a website URL with publisher, date accessed and practice area metadata.</li>
            <li>Run extraction and OCR where needed, then review rejected pages and low-confidence text.</li>
            <li>Approve chunking rules, retrieval mode, citation requirement and tenant access rules.</li>
            <li>Run a test prompt pack before making the source available to drafting, research or secretary assistants.</li>
          </ol>
        </Panel>

        <Panel title="Prompt tests to run" badge="Validation">
          <div className="prompt-tests">
            <blockquote>Draft a residential offer to purchase with a linked-sale suspensive condition and cite the precedent clauses used.</blockquote>
            <blockquote>Summarise the latest authority bundle on conveyancing delay and identify attorney-review risks.</blockquote>
            <blockquote>Create a client portal update for a delayed rates clearance certificate without giving legal advice.</blockquote>
          </div>
        </Panel>
      </section>
    </>
  );
}

function TrainingChecklistItem({ title, text }: { title: string; text: string }) {
  return (
    <article>
      <strong>{title}</strong>
      <p>{text}</p>
    </article>
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
  isPlatformSuperAdmin,
  hasTenantContext
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
  hasTenantContext: boolean;
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

  async function saveSettings(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSettingsBusy("smtp");
    try {
      const response = await savePlatformSmtpSettings(settings);
      setSettings(response.smtpSettings);
      const stamp = new Date().toLocaleString("en-ZA", { dateStyle: "medium", timeStyle: "short" });
      setSavedAt(stamp);
      setEmailStatus(`Platform SMTP transport saved for ${settings.host}:${settings.port}.`);
      log(`Super admin saved platform SMTP transport for ${settings.providerName}`);
      showToast("success", "SMTP saved", "SMTP settings are persisted in the database.");
    } catch (error) {
      showToast("error", "SMTP not saved", error instanceof Error ? error.message : "Could not save SMTP settings.");
    } finally {
      setSettingsBusy(null);
    }
  }

  async function saveTenantEmailSettings(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!hasTenantContext) {
      const message = "Tenant sender identity can only be saved while logged in as a tenant admin for a law firm. Your platform super-admin account is not attached to a tenant.";
      setEmailStatus(message);
      showToast("info", "Tenant account required", message);
      return;
    }
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

  async function saveApiSettings(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSettingsBusy("api");
    try {
      const response = await savePlatformApiSettings(apiSettings);
      if (response.apiSettings) setApiSettings(response.apiSettings);
      const stamp = new Date().toLocaleString("en-ZA", { dateStyle: "medium", timeStyle: "short" });
      setApiSavedAt(stamp);
      log("Admin saved API provider keys and model selections");
      showToast("success", "API settings saved", "Provider keys and model routing are persisted.");
    } catch (error) {
      showToast("error", "API settings not saved", error instanceof Error ? error.message : "Could not save API settings.");
    } finally {
      setSettingsBusy(null);
    }
  }

  async function addRagSource(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const name = String(form.get("name") || "").trim();
    const sourceUrl = String(form.get("sourceUrl") || "").trim();
    const file = form.get("sourceFile") as File | null;
    const hasFile = Boolean(file && file.size);

    if (!name) {
      showToast("error", "Source name required", "Add a short name for the legal source before queueing it.");
      return;
    }

    if (!hasFile && !sourceUrl) {
      showToast("error", "Source content required", "Add a website URL or upload a document so the AI has material to store and index.");
      return;
    }

    if (file && file.size > maxKnowledgeUploadBytes) {
      showToast("error", "File too large", "Upload files smaller than 8 MB for now. Larger legal bundles should be split or uploaded through the server-side bulk import flow.");
      return;
    }

    setSettingsBusy("rag");
    const fileDataUrl = hasFile ? await fileToDataUrl(file as File) : "";
    const extractedText = file && file.size ? await file.text().catch(() => "") : "";
    try {
      const response = await queueRagSource({
        name,
        scope: String(form.get("scope")) as RagSource["scope"],
        sourceType: String(form.get("sourceType")) as RagSource["sourceType"],
        documentCount: Number(form.get("documentCount") || 1),
        sourceUrl,
        fileName: file?.name || "",
        mimeType: file?.type || "",
        fileDataUrl,
        extractedText
      });
      setRagSources((items) => [response.source, ...items]);
      log(`Super admin queued RAG source: ${response.source.name}`);
      showToast("success", "Source queued", `${response.source.name} has been stored in Google Cloud Storage and queued for indexing.`);
    } catch (error) {
      showToast("error", "Source not queued", error instanceof Error ? error.message : "Could not queue knowledge source.");
    } finally {
      setSettingsBusy(null);
    }
  }

  async function saveTrainingSettings(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSettingsBusy("training");
    try {
      const response = await saveAssistantTraining(assistantTraining);
      setAssistantTraining(response.assistantTraining);
      log(`Super admin saved AI training profile: ${assistantTraining.defaultAssistant}`);
      showToast("success", "Training profile saved", `${assistantTraining.defaultAssistant} settings are persisted.`);
    } catch (error) {
      showToast("error", "Training not saved", error instanceof Error ? error.message : "Could not save training profile.");
    } finally {
      setSettingsBusy(null);
    }
  }

  const configuredProviders = [
    apiSettings.exchangeRatesApiKey,
    apiSettings.openAiApiKey,
    apiSettings.geminiApiKey,
    apiSettings.grokApiKey,
    apiSettings.verifyNowApiKey
  ].filter(Boolean).length;
  const tenantIdentityDisabled = !hasTenantContext;

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
            {tenantIdentityDisabled ? <p className="settings-warning">Log in as a tenant admin to edit the law firm sender identity. Platform super admins manage shared infrastructure only.</p> : null}
            <label>Company name<input value={tenantEmailSettings.tenantName} disabled={tenantIdentityDisabled} onChange={(event) => updateTenantEmail("tenantName", event.target.value)} /></label>
            <label>Verified domain<input value={tenantEmailSettings.tenantDomain} disabled={tenantIdentityDisabled} onChange={(event) => updateTenantEmail("tenantDomain", event.target.value)} /></label>
            <label>From name<input value={tenantEmailSettings.fromName} disabled={tenantIdentityDisabled} onChange={(event) => updateTenantEmail("fromName", event.target.value)} /></label>
            <label>From email<input type="email" value={tenantEmailSettings.fromEmail} disabled={tenantIdentityDisabled} onChange={(event) => updateTenantEmail("fromEmail", event.target.value)} /></label>
            <label>Reply-to email<input type="email" value={tenantEmailSettings.replyTo} disabled={tenantIdentityDisabled} onChange={(event) => updateTenantEmail("replyTo", event.target.value)} /></label>
            <label>Portal email signature<textarea value={tenantEmailSettings.portalSignature} disabled={tenantIdentityDisabled} onChange={(event) => updateTenantEmail("portalSignature", event.target.value)} /></label>
            <div className="switch-list">
              <label className="switch-row"><input type="checkbox" checked={settings.transactionalEnabled} onChange={(event) => update("transactionalEnabled", event.target.checked)} /> Transactional emails</label>
              <label className="switch-row"><input type="checkbox" checked={settings.systemEnabled} onChange={(event) => update("systemEnabled", event.target.checked)} /> System/admin emails</label>
              <label className="switch-row"><input type="checkbox" checked={tenantEmailSettings.verifiedDomain} disabled={tenantIdentityDisabled} onChange={(event) => updateTenantEmail("verifiedDomain", event.target.checked)} /> Domain verified for sender display</label>
            </div>
            <button className="primary" type="submit" disabled={settingsBusy === "tenant" || tenantIdentityDisabled}><Mail size={18} /> {settingsBusy === "tenant" ? "Saving..." : "Save tenant identity"}</button>
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

          <article className="integration-card" style={{ gridColumn: "1 / -1" }}>
            <div className="integration-head">
              <Shield size={20} />
              <div>
                <strong>VerifyNow SA</strong>
                <span>SA identity verification, AML/PEP screening, CIPC lookups, bank account verification and vehicle checks. <a href="https://www.verifynow.co.za/api-docs" target="_blank" rel="noreferrer" style={{ color: "var(--green)" }}>API docs ↗</a></span>
              </div>
            </div>
            <label>API key
              <input type="password" value={apiSettings.verifyNowApiKey} onChange={(event) => updateApi("verifyNowApiKey", event.target.value)} placeholder="vn_live_..." />
            </label>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 8, marginTop: 4 }}>
              {["ID Verify", "AML / PEP", "CIPC Company", "CIPC Director", "Consumer Trace", "Bank Account", "Face Match", "Number Plate", "VIN Decode"].map(s => (
                <span key={s} style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "5px 10px", borderRadius: 6, background: "var(--green-light)", color: "var(--green)", fontSize: "0.8rem", fontWeight: 600 }}>
                  <CheckCircle2 size={12} />{s}
                </span>
              ))}
            </div>
            <p style={{ margin: "8px 0 0", fontSize: "0.82rem", color: "var(--muted)" }}>
              Credits are billed per check by VerifyNow. Usage is tracked in the monitoring panel below — no dedicated balance endpoint exists on their platform.
            </p>
          </article>

          <div className="integration-actions">
            <span>Last saved: {apiSavedAt}</span>
            <button className="primary" type="submit" disabled={settingsBusy === "api"}><ServerCog size={18} /> {settingsBusy === "api" ? "Saving..." : "Save API settings"}</button>
          </div>
        </form>
      </section>

      {/* WhatsApp Business API settings */}
      <section className="settings-grid">
        <Panel title="WhatsApp Business (Meta Cloud API)" badge="Super admin only">
          <form className="form" onSubmit={async (e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            try {
              await fetch("/api/platform/whatsapp-settings", {
                method: "PUT",
                headers: { "Content-Type": "application/json", "Authorization": `Bearer ${localStorage.getItem("lawpath.auth.token")}` },
                body: JSON.stringify({ provider: "meta_cloud_api", apiKey: f.get("waApiKey"), phoneNumberId: f.get("waPhoneNumberId"), webhookVerifyToken: f.get("waVerifyToken") })
              });
              showToast("success", "WhatsApp settings saved", "Meta Cloud API credentials saved.");
              log("WhatsApp API credentials updated");
            } catch { showToast("error", "Save failed", "Could not save WhatsApp settings."); }
          }}>
            <p style={{ fontSize: "0.87rem", color: "var(--muted)", margin: 0 }}>
              Setup: Meta Business App → WhatsApp product → System User token.
              Register webhook: <code>/api/webhooks/whatsapp</code> (events: messages, message_status_updates).
            </p>
            <label>System User Access Token<input name="waApiKey" type="password" placeholder="EAA..." /></label>
            <label>Phone Number ID<input name="waPhoneNumberId" placeholder="From WhatsApp → Getting Started" /></label>
            <label>Webhook verify token<input name="waVerifyToken" defaultValue="lawpath-whatsapp-verify" /></label>
            <button className="primary" type="submit"><Send size={18} /> Save WhatsApp settings</button>
          </form>
        </Panel>

        <Panel title="Property search providers" badge="Super admin only">
          <div className="form">
            <p style={{ fontSize: "0.87rem", color: "var(--muted)", margin: "0 0 12px" }}>
              Configure API keys for live Deeds Office property data. Without keys, searches return realistic simulation data.
            </p>
            <div style={{ padding: "12px 14px", background: "var(--paper)", border: "1px solid var(--line)", borderRadius: 8, marginBottom: 10 }}>
              <strong style={{ fontSize: "0.9rem" }}>Windeed</strong>
              <p style={{ margin: "4px 0 0", fontSize: "0.83rem", color: "var(--muted)" }}>windeed.co.za — Primary SA Deeds Office data. Set <code>WINDEED_API_KEY</code> in .env.</p>
            </div>
            <div style={{ padding: "12px 14px", background: "var(--paper)", border: "1px solid var(--line)", borderRadius: 8 }}>
              <strong style={{ fontSize: "0.9rem" }}>Lightstone</strong>
              <p style={{ margin: "4px 0 0", fontSize: "0.83rem", color: "var(--muted)" }}>lightstone.co.za — Alternative property intelligence. Set <code>LIGHTSTONE_API_KEY</code> in .env.</p>
            </div>
            <p style={{ fontSize: "0.8rem", color: "var(--muted)", marginTop: 12 }}>Both providers require a commercial subscription. API credentials are set in <code>.env</code> and take effect on API restart.</p>
          </div>
        </Panel>
      </section>

      {/* VerifyNow Usage Monitoring */}
      <VerifyNowMonitor showToast={showToast} />

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
                  <option>Website</option>
                  <option>Document upload</option>
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
                  <option>Tenant private</option>
                </select>
              </label>
              <label>Website URL<input name="sourceUrl" type="url" placeholder="https://www.saflii.org/..." /></label>
              <label>Upload document<input name="sourceFile" type="file" accept=".txt,.md,.csv,.html,.htm,.pdf,.doc,.docx" /></label>
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
