import type { LucideIcon } from "lucide-react";

export type ViewKey = "overview" | "drafting" | "research" | "secretary" | "billing" | "booking" | "portal" | "training-guide" | "settings";

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

export type NavItem = {
  key: ViewKey;
  label: string;
  icon: LucideIcon;
};
