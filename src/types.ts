import type { LucideIcon } from "lucide-react";

export type ViewKey =
  | "overview" | "drafting" | "research" | "secretary" | "billing"
  | "booking" | "portal" | "training-guide" | "settings"
  | "trust" | "fica" | "time" | "popia"
  | "conveyancing" | "litigation" | "whatsapp" | "cipc" | "documents" | "accounting";

export type Matter = {
  id: string;
  title: string;
  client: string;
  matterType: string;
  role: string;
  property: string;
  estateAgent: string;
  stage: string;
  progress: number;
  nextStep: string;
  due: string;
  portalAccess: boolean;
  risk: "Low" | "Medium" | "High";
};

export type ContractDraft = {
  id: string;
  name: string;
  category: string;
  partyA: string;
  partyB: string;
  status: string;
  updated: string;
  body: string;
};

export type ResearchItem = {
  id: string;
  title: string;
  court: string;
  year: string;
  tags: string[];
  summary: string;
};

export type WorkTask = {
  id: string;
  title: string;
  owner: string;
  due: string;
  done: boolean;
  priority: "Normal" | "Urgent";
};

export type Invoice = {
  id: string;
  client: string;
  matter: string;
  amount: number;
  paid: number;
  status: "Draft" | "Part-paid" | "Paid" | "Overdue";
};

export type Appointment = {
  id: string;
  title: string;
  person: string;
  time: string;
  mode: "Office" | "Teams" | "Phone" | "Deeds office";
};

export type SmtpSettings = {
  providerName: string;
  host: string;
  port: number;
  username: string;
  password: string;
  encryption: "TLS" | "SSL" | "None";
  bounceEmail: string;
  transactionalEnabled: boolean;
  systemEnabled: boolean;
  testRecipient: string;
};

export type TenantEmailSettings = {
  tenantName: string;
  tenantDomain: string;
  fromName: string;
  fromEmail: string;
  replyTo: string;
  portalSignature: string;
  verifiedDomain: boolean;
};

export type TenantProfile = {
  tradingName: string;
  practiceType: string;
  addressLine1: string;
  addressLine2: string;
  city: string;
  province: string;
  postalCode: string;
  phone: string;
  website: string;
  lpcRegistrationNumber: string;
  companyRegistrationNumber: string;
  vatNumber: string;
  conveyancerCount: number;
  seniorAttorneyCount: number;
  juniorAttorneyCount: number;
  candidateAttorneyCount: number;
  legalSecretaryCount: number;
  logoDataUrl: string;
  logoStorageUri: string;
  logoPublicUrl: string;
  onboardingCompleted: boolean;
  onboardingStep: number;
};

export type ApiProviderSettings = {
  exchangeRatesApiKey: string;
  exchangeRatesBaseCurrency: "ZAR" | "USD" | "EUR" | "GBP";
  openAiApiKey: string;
  openAiModel: string;
  geminiApiKey: string;
  geminiModel: "gemini-3.1-pro" | "gemini-3.5-flash" | "gemini-3.5-flash-lite";
  grokApiKey: string;
  grokModel: string;
};

export type RagSource = {
  id: string;
  name: string;
  scope: "Platform" | "Tenant template" | "Tenant private";
  sourceType: "Case law" | "Contract bank" | "Practice manual" | "Legislation" | "Firm precedent" | "Website" | "Document upload";
  status: "Indexed" | "Queued" | "Needs review" | "Failed";
  documentCount: number;
  lastIndexed: string;
};

export type AssistantTrainingSettings = {
  defaultAssistant: string;
  retrievalMode: "Strict sources only" | "Balanced" | "Broad discovery";
  chunkSize: number;
  topK: number;
  requireCitations: boolean;
  allowTenantPrivateSources: boolean;
  systemInstructions: string;
};

export type AuthUser = {
  id: string;
  tenantId: string | null;
  fullName: string;
  email: string;
  companyName: string;
  role: "platform_super_admin" | "tenant_admin" | "attorney" | "candidate_attorney" | "legal_secretary" | "billing_admin" | "client_portal_user";
  tenantSlug?: string;
};

export type AiAgentKey = "general" | "drafting" | "research" | "secretary" | "billing" | "portal" | "settings";

export type AiChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
};

export type NavItem = {
  key: ViewKey;
  label: string;
  icon: LucideIcon;
};

// ─── TIER 1: TRUST ACCOUNT ───────────────────────────────────────────────────

export type TrustTransaction = {
  id: string;
  clientName: string;
  description: string;
  reference: string;
  entryType: "receipt" | "payment" | "transfer_in" | "transfer_out" | "adjustment";
  amountCents: number;
  runningBalanceCents: number;
  valueDate: string;
  reconciled: boolean;
};

export type TrustReconciliation = {
  id: string;
  periodMonth: string;
  bankStatementBalanceCents: number;
  ledgerBalanceCents: number;
  clientCreditTotalCents: number;
  status: "Draft" | "Submitted" | "LPC Approved";
};

// ─── TIER 1: FICA / KYC ──────────────────────────────────────────────────────

export type FicaClient = {
  id: string;
  clientName: string;
  clientType: "natural_person" | "legal_entity" | "trust";
  idNumber: string;
  riskRating: "Low" | "Medium" | "High" | "PEP";
  ficaStatus: "Pending" | "In Progress" | "Compliant" | "Expired" | "Rejected";
  ficaExpiryDate: string;
  sourceOfFunds: string;
  sanctionsChecked: boolean;
  documents: FicaDocument[];
};

export type FicaDocument = {
  id: string;
  documentType: string;
  documentName: string;
  status: "Required" | "Uploaded" | "Verified" | "Expired" | "Rejected";
  expiryDate: string;
};

// ─── TIER 1: TIME RECORDING ───────────────────────────────────────────────────

export type TimeEntry = {
  id: string;
  clientName: string;
  matterRef: string;
  feeEarnerName: string;
  entryDate: string;
  activityType:
    | "professional_fee" | "attendance" | "consultation" | "research"
    | "drafting" | "court_appearance" | "correspondence" | "telephone"
    | "travel" | "disbursement" | "disbursement_recovery";
  description: string;
  durationMinutes: number;
  rateCents: number;
  amountCents: number;
  vatAmountCents: number;
  status: "WIP" | "Billed" | "Written off" | "On hold";
  isDisbursement: boolean;
};

// ─── TIER 1: POPIA ────────────────────────────────────────────────────────────

export type PopiaProcessingRecord = {
  id: string;
  processingActivity: string;
  purpose: string;
  legalBasis: string;
  dataSubjects: string[];
  personalInfoTypes: string[];
  retentionPeriod: string;
  thirdPartyRecipients: string;
  crossBorderTransfer: boolean;
  reviewDate: string;
  active: boolean;
};

export type PopiaDsrRequest = {
  id: string;
  requestType: "Access" | "Correction" | "Deletion" | "Objection" | "Portability";
  requestorName: string;
  requestorEmail: string;
  description: string;
  status: "Received" | "In Progress" | "Completed" | "Denied" | "Escalated";
  receivedAt: string;
  dueAt: string;
  completedAt: string;
  responseNotes: string;
};

export type PopiaBreachIncident = {
  id: string;
  incidentDate: string;
  description: string;
  dataSubjectsAffected: number;
  severity: "Low" | "Medium" | "High" | "Critical";
  status: "Open" | "Under investigation" | "Regulator notified" | "Closed";
  regulatorNotified: boolean;
  remediationSteps: string;
};

// ─── TIER 2: CONVEYANCING PIPELINE ───────────────────────────────────────────

export type ConveyancingStage =
  | "instruction_received" | "fica_verification" | "bond_cancellation_instructions"
  | "draft_deeds" | "sars_transfer_duty" | "rates_clearance" | "levy_clearance"
  | "deeds_lodgement" | "deeds_registration" | "completed";

export type ConveyancingStageRecord = {
  stage: ConveyancingStage;
  label: string;
  status: "pending" | "in_progress" | "completed" | "blocked";
  completedAt: string;
  notes: string;
};

export type ConveyancingMatter = {
  id: string;
  matterRef: string;
  matterType: "transfer" | "bond_registration" | "bond_cancellation" | "sectional_title" | "notarial_bond";
  sellerName: string;
  buyerName: string;
  propertyDescription: string;
  erfNumber: string;
  purchasePriceCents: number;
  transferDutyCents: number;
  conveyancingFeeCents: number;
  vatOnFeeCents: number;
  estateAgent: string;
  bondBank: string;
  currentStage: ConveyancingStage;
  ficaStatus: "Pending" | "In Progress" | "Compliant";
  ratesClearanceStatus: "Not requested" | "Requested" | "Received" | "Expired";
  levyClearanceStatus: "Not requested" | "Requested" | "Received" | "Expired";
  ratesClearanceExpiry: string;
  levyClearanceExpiry: string;
  stages: ConveyancingStageRecord[];
  targetRegistrationDate: string;
  notes: string;
};

// ─── TIER 2: LITIGATION PIPELINE ─────────────────────────────────────────────

export type LitigationMatter = {
  id: string;
  matterRef: string;
  caseNumber: string;
  court: string;
  courtDivision: string;
  plaintiff: string;
  defendant: string;
  matterType: "opposed_motion" | "unopposed_motion" | "trial" | "urgent_application" | "section_65" | "section_69" | "rule_43" | "default_judgment" | "appeal" | "review";
  currentStage: string;
  claimAmountCents: number;
  costsRecoveredCents: number;
  status: "Active" | "Settled" | "Abandoned" | "Judgment" | "Struck off";
  serviceDate: string;
  deadlines: LitigationDeadline[];
  courtDates: CourtDate[];
  costOrders: CostOrder[];
  notes: string;
};

export type LitigationDeadline = {
  id: string;
  description: string;
  ruleReference: string;
  dueDate: string;
  daysFromService: number;
  completed: boolean;
  priority: "Normal" | "Urgent" | "Critical";
};

export type CourtDate = {
  id: string;
  courtDate: string;
  courtTime: string;
  court: string;
  purpose: string;
  rollType: "Unopposed" | "Opposed" | "Trial" | "Urgent" | "Appeal";
  outcome: string;
  postponedTo: string;
};

export type CostOrder = {
  id: string;
  orderDate: string;
  orderType: "costs" | "costs_in_cause" | "no_order" | "reserved" | "punitive_costs";
  inFavourOf: string;
  amountCents: number;
  scale: string;
  notes: string;
};

// ─── TIER 2: WHATSAPP ─────────────────────────────────────────────────────────

export type WhatsAppContact = {
  id: string;
  clientName: string;
  phoneNumber: string;
  matterRef: string;
  optIn: boolean;
  optInDate: string;
};

export type WhatsAppMessage = {
  id: string;
  contactId: string;
  clientName: string;
  phoneNumber: string;
  matterRef: string;
  direction: "inbound" | "outbound";
  messageBody: string;
  templateId: string;
  status: "queued" | "sent" | "delivered" | "read" | "failed";
  sentAt: string;
};

export type WhatsAppTemplate = {
  id: string;
  name: string;
  category: "transfer_update" | "bond_update" | "appointment_reminder" | "payment_reminder" | "fica_request" | "general";
  body: string;
  variables: string[];
};

// ─── TIER 2: CIPC ─────────────────────────────────────────────────────────────

export type CipcDirector = {
  name: string;
  idNumber: string;
  appointmentDate: string;
  status: "Active" | "Resigned";
};

export type CipcSearchResult = {
  registrationNumber: string;
  companyName: string;
  companyType: string;
  status: "Active" | "Deregistered" | "In liquidation" | "Final deregistration";
  registrationDate: string;
  directors: CipcDirector[];
};

// ─── TIER 2: DOCUMENT INTELLIGENCE ───────────────────────────────────────────

export type DocumentKeyDate = {
  label: string;
  date: string;
};

export type DocumentAnalysis = {
  id: string;
  fileName: string;
  documentType: string;
  analysisStatus: "Queued" | "Analysing" | "Complete" | "Failed";
  parties: string[];
  keyDates: DocumentKeyDate[];
  obligations: string[];
  riskFlags: string[];
  saLawFlags: string[];
  summary: string;
  analysedAt: string;
};

// ─── TIER 2: ACCOUNTING ───────────────────────────────────────────────────────

export type AccountingProvider = "sage_pastel" | "xero" | "quickbooks" | "csv_export";

export type AccountingConnection = {
  id: string;
  provider: AccountingProvider;
  connected: boolean;
  lastSyncAt: string;
  syncStatus: "idle" | "syncing" | "error";
  errorMessage: string;
};

export type AccountingExportRecord = {
  id: string;
  provider: AccountingProvider;
  exportType: "invoice" | "trust_receipt" | "disbursement" | "time_entry" | "full_sync";
  recordCount: number;
  status: "exported" | "failed" | "partial";
  exportedAt: string;
};
