import type { LucideIcon } from "lucide-react";



export type Matter = {
  /** Human matter number, e.g. "M-123456". */
  id: string;
  /** Spine PK — use this to open the Matter File. */
  uuid: string;
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
  invoiceNumber: string;
  clientName: string;
  clientEmail: string;
  matterRef: string;
  subtotalCents: number;
  vatCents: number;
  amountCents: number;
  paidCents: number;
  currency: string;
  status: "Draft" | "Sent" | "Part-paid" | "Paid" | "Overdue" | "Void";
  issuedAt: string;
  dueAt: string;
  notes: string;
  terms: string;
  paymentRef: string;
  sentAt: string;
  pdfGcsUri: string;
  accountingSyncedAt: string;
  accountingProvider: string;
  createdAt: string;
  lineItems: InvoiceLineItem[];
  payments: InvoicePayment[];
};

export type InvoiceLineItem = {
  id: string;
  invoiceId: string;
  timeEntryId: string | null;
  description: string;
  activityType: string;
  feeEarnerName: string;
  entryDate: string;
  durationMinutes: number;
  rateCents: number;
  amountCents: number;
  vatCents: number;
  isDisbursement: boolean;
  sortOrder: number;
};

export type InvoicePayment = {
  id: string;
  invoiceId: string;
  amountCents: number;
  paymentDate: string;
  paymentMethod: "EFT" | "Cash" | "Card" | "Cheque" | "Trust transfer" | "Other";
  reference: string;
  notes: string;
  createdAt: string;
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

export type InvoiceHeaderField = "address" | "phone" | "website" | "vatNumber" | "lpcNumber";

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
  invoiceHeaderFields: InvoiceHeaderField[];
  ffcNumber?: string;
  ffcYear?: number | null;
  ffcVerifiedAt?: string | null;
  ffcVerificationStatus?: "valid" | "invalid" | "unknown" | "pending" | null;
};


export type AiFeature = "ai-chat" | "document-intelligence" | "research-summaries";

export type ApiProviderSettings = {
  exchangeRatesApiKey: string;
  exchangeRatesBaseCurrency: "ZAR" | "USD" | "EUR" | "GBP";
  openAiApiKey: string;
  openAiModel: string;
  openAiFeatures: AiFeature[];
  geminiApiKey: string;
  geminiModel: string;
  geminiFeatures: AiFeature[];
  grokApiKey: string;
  grokModel: string;
  grokFeatures: AiFeature[];
  verifyNowApiKey: string;
  lightstoneApiKey: string;
  searchworksUsername: string;
  searchworksPassword: string;
};

export type VerifyNowUsageTotals = {
  total_calls: string;
  total_credits: string;
  credits_30d: string;
  credits_7d: string;
  credits_today: string;
  error_calls: string;
  avg_latency_ms: string | null;
};

export type VerifyNowServiceStat = {
  service: string;
  calls: string;
  credits: string;
  errors: string;
};

export type VerifyNowTenantStat = {
  tenant_id: string | null;
  tenant_name: string | null;
  calls: string;
  credits: string;
};

export type VerifyNowLogEntry = {
  id: string;
  tenant_id: string | null;
  tenant_name: string | null;
  user_id: string | null;
  service: string;
  request_id: string | null;
  credits_spent: string;
  latency_ms: number | null;
  status: "success" | "error";
  error_code: string | null;
  input_ref: string | null;
  created_at: string;
};

export type TenantOverviewRow = {
  id: string;
  company_name: string;
  slug: string;
  plan: string | null;
  plan_status: string | null;
  trial_ends_at: string | null;
  created_at: string;
  status: string;
  user_count: number;
  matter_count: number;
  ai_calls_30d: number;
  ai_errors_30d: number;
  ai_chars_30d: number | string;
  ai_calls_total: number;
  lightstone_calls_30d: number;
  lightstone_errors_30d: number;
  verifynow_calls_30d: number;
  verifynow_credits_30d: number;
  verifynow_errors_30d: number;
  searchworks_calls_30d: number;
  searchworks_credits_30d: number;
  searchworks_errors_30d: number;
  last_activity_at: string | null;
};

export type TenantsOverviewTotals = {
  tenant_count: number;
  active_tenants: number;
  trial_tenants: number;
  ai_calls_30d: number;
  lightstone_calls_30d: number;
  verifynow_calls_30d: number;
  searchworks_calls_30d: number;
};

export type PlatformPricingConfig = {
  vatRate: number;     // 0.15 = 15%
  markupRate: number;  // 0.30 = 30%
  updatedAt?: string | null;
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
  /**
   * Citation verification for an assistant answer. Every case citation in the
   * text is checked against the firm's corpus; unverified ones must be shown as
   * such. An LLM cannot be trusted to recall SA citations.
   */
  grounding?: {
    sourcesUsed: number;
    sources: { tag: string; title: string; citation: string | null; court: string | null; year: number | null; sourceUrl: string | null }[];
    citations: { citation: string; verified: boolean; title: string | null; court: string | null; year: number | null; sourceUrl: string | null }[];
    unverifiedCount: number;
  } | null;
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
  /** Which side this firm represents. "" = not yet stated by an attorney. */
  actingFor: "" | "seller" | "buyer" | "bank";
  ficaStatus: "Pending" | "In Progress" | "Compliant";
  ratesClearanceStatus: "Not requested" | "Requested" | "Received" | "Expired";
  levyClearanceStatus: "Not requested" | "Requested" | "Received" | "Expired";
  ratesClearanceExpiry: string;
  levyClearanceExpiry: string;
  stages: ConveyancingStageRecord[];
  targetRegistrationDate: string;
  dotsBarcode: string;
  dotsDeedsOffice: string;
  dotsLastStatus: string;
  dotsLastPolledAt: string;
  dotsStatusChangedAt: string;
  dotsDraftMessage: string;
  dotsAckAt: string;
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
  /** Which side this firm represents. "" = not yet stated by an attorney. */
  actingFor: "" | "plaintiff" | "defendant";
  currentStage: string;
  claimAmountCents: number;
  costsRecoveredCents: number;
  status: "Active" | "Settled" | "Abandoned" | "Judgment" | "Struck off";
  serviceDate: string;
  causeOfActionDate: string;
  prescriptionPeriodYears: number;
  prescriptionDate: string;
  prescriptionInterrupted: boolean;
  prescriptionNote: string;
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
  /** Matter spine link. "" / null when the document is not yet filed. */
  matterId: string | null;
  matterRef: string;
  filedAt: string;
  /** How it came to be filed — 'auto' is an inference a human should sanity-check. */
  filingSource: "" | "upload" | "auto" | "manual";
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

// ─── TIER 3: SA LEGAL RESEARCH DATABASE ──────────────────────────────────────

export type TodayItem = {
  id: string;
  category: string;
  severity: "critical" | "warning" | "info";
  icon: string;
  view: ViewKey;
  title: string;
  detail: string;
  dueDate: string | null;
  daysUntil: number | null;
  dueLabel: string;
};

export type TodayBrief = {
  items: TodayItem[];
  counts: { critical: number; warning: number; info: number; total: number };
  brief: string | null;
  generatedAt: string;
};

export type ViewKey =
  | "today" | "overview" | "matter-file" | "approvals" | "clients" | "drafting" | "research" | "secretary" | "billing"
  | "booking" | "portal" | "training-guide" | "settings"
  | "trust" | "fica" | "time" | "popia"
  | "conveyancing" | "litigation" | "conflicts" | "whatsapp" | "cipc" | "documents" | "accounting"
  | "research-db" | "esignature" | "agents" | "analytics"
  | "staff" | "billing-portal" | "ai-library" | "super-tenants";

// ─── CRM: CLIENTS ─────────────────────────────────────────────────────────────

export type ClientType = 'natural_person' | 'company' | 'close_corporation' | 'trust' | 'partnership' | 'non_profit' | 'sole_proprietor' | 'other_entity';
export type ClientCategory = 'vip' | 'standard' | 'inactive' | 'prospect';
export type FicaStatus = 'pending' | 'compliant' | 'non_compliant' | 'expired' | 'exempt';
export type RiskRating = 'low' | 'medium' | 'high' | 'pep' | 'unrated';

export type Client = {
  id: string;
  tenantId: string;

  // Classification
  clientType: ClientType;
  clientCategory: ClientCategory;

  // Natural person identity
  firstName: string;
  lastName: string;
  fullName: string;
  saIdNumber: string;
  passportNumber: string;
  passportCountry: string;
  dateOfBirth: string;
  gender: 'male' | 'female' | 'non_binary' | 'prefer_not_to_say' | '';
  nationality: string;
  incomeTaxRef: string;

  // Entity fields
  registeredName: string;
  tradingName: string;
  registrationNumber: string;
  registrationDate: string;
  vatNumber: string;

  // Contact
  email: string;
  emailAlt: string;
  mobile: string;
  phoneLandline: string;
  whatsappNumber: string;
  preferredContact: 'email' | 'mobile' | 'whatsapp' | 'phone';

  // Physical address
  addressLine1: string;
  addressLine2: string;
  suburb: string;
  city: string;
  province: string;
  postalCode: string;
  country: string;

  // Postal address
  postalSameAsPhysical: boolean;
  postalLine1: string;
  postalLine2: string;
  postalSuburb: string;
  postalCity: string;
  postalProvince: string;
  postalCodePost: string;

  // FICA / KYC
  ficaStatus: FicaStatus;
  ficaVerifiedAt: string;
  ficaExpiresAt: string;
  riskRating: RiskRating;
  isPep: boolean;
  pepDetails: string;
  sanctionsCheckedAt: string;
  sanctionsClear: boolean | null;
  sourceOfFunds: string;
  sourceOfWealth: string;
  natureOfBusiness: string;

  // Conflict of interest
  conflictsChecked: boolean;
  conflictsCheckedAt: string;
  conflictsCheckedBy: string;
  conflictsNotes: string;

  // Billing defaults
  defaultRateCents: number;
  billingEmail: string;
  paymentTermsDays: number;
  creditLimitCents: number;

  // Relationship management
  relationshipPartner: string;
  originatingAttorney: string;
  clientSince: string;
  referralSource: string;
  tags: string[];

  // Portal
  portalEmail: string;
  portalActive: boolean;

  // Notes
  internalNotes: string;

  archivedAt: string;
  createdAt: string;
  updatedAt: string;
};

export type LegalCorpusSource = {
  id: string;
  sourceName: string;
  sourceType: "case_law" | "legislation" | "gazette" | "lpc_rules" | "practice_directive" | "regulation" | "constitution";
  courtOrBody: string;
  indexStatus: "pending" | "indexing" | "indexed" | "failed" | "update_available";
  documentCount: number;
  lastIndexedAt: string;
  isPlatformCorpus: boolean;
};

export type LegalCorpusDocument = {
  id: string;
  sourceId: string;
  title: string;
  citation: string;
  court: string;
  decisionDate: string;
  summary: string;
  sourceUrl: string;
  gcsUri: string;
  tags: string[];
  year: number;
  // Populated by the AI rerank step; explains why this result matched.
  relevanceReason?: string | null;
};

export type ResearchQuery = {
  id: string;
  queryText: string;
  resultsCount: number;
  aiSummary: string;
  citations: { title: string; citation: string; url: string }[];
  createdAt: string;
};

// ─── TIER 3: E-SIGNATURE ─────────────────────────────────────────────────────

export type SignatureRequest = {
  id: string;
  documentTitle: string;
  documentType: string;
  matterRef: string;
  documentBody: string;
  status: "draft" | "sent" | "partially_signed" | "completed" | "expired" | "cancelled";
  expiresAt: string;
  completedAt: string;
  signatories: SignatureSignatory[];
  auditEvents: SignatureAuditEvent[];
};

export type SignatureSignatory = {
  id: string;
  signatoryName: string;
  signatoryEmail: string;
  signatoryIdNumber: string;
  role: string;
  orderPosition: number;
  status: "pending" | "otp_sent" | "signed" | "declined";
  signedAt: string;
  signatureMethod: "drawn" | "typed" | "uploaded" | "";
};

export type SignatureAuditEvent = {
  id: string;
  eventType: string;
  description: string;
  ipAddress: string;
  createdAt: string;
};

// ─── TIER 3: AGENT NETWORK ───────────────────────────────────────────────────

export type EstateAgent = {
  id: string;
  agentName: string;
  agencyName: string;
  email: string;
  phone: string;
  ffcNumber: string;
  ppraRegistration: string;
  areaOfOperation: string;
  status: "active" | "inactive" | "blacklisted";
  commissionRate: number;
  portalAccess: boolean;
  portalToken: string;
  totalReferrals: number;
  totalCommissionCents: number;
};

export type AgentReferral = {
  id: string;
  agentId: string;
  agentName: string;
  matterRef: string;
  propertyDescription: string;
  buyerName: string;
  sellerName: string;
  purchasePriceCents: number;
  commissionCents: number;
  commissionStatus: "pending" | "approved" | "paid" | "disputed";
  referralDate: string;
  paidDate: string;
};

// ─── TIER 3: PRACTICE ANALYTICS ──────────────────────────────────────────────

export type FeeEarnerStat = {
  name: string;
  wipCents: number;
  billedCents: number;
  collectedCents: number;
  realisationRate: number;
  collectionRate: number;
  matterCount: number;
};

export type MatterTypeStat = {
  matterType: string;
  count: number;
  avgCycleTimeDays: number;
  totalFeeCents: number;
};

export type AnalyticsSnapshot = {
  id: string;
  periodMonth: string;
  totalMattersActive: number;
  totalMattersClosed: number;
  wipTotalCents: number;
  billedTotalCents: number;
  collectedTotalCents: number;
  writtenOffCents: number;
  trustBalanceCents: number;
  debtors30Cents: number;
  debtors60Cents: number;
  debtors90Cents: number;
  debtors120PlusCents: number;
  realisationRate: number;
  collectionRate: number;
  feeEarnerStats: FeeEarnerStat[];
  matterTypeStats: MatterTypeStat[];
};
