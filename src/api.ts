import type { AccountingConnection, AccountingExportRecord, AccountingProvider, AgentReferral, AiAgentKey, AnalyticsSnapshot, ApiProviderSettings, Appointment, AssistantTrainingSettings, AuthUser, CipcSearchResult, Client, ContractDraft, ConveyancingMatter, ConveyancingStage, CourtDate, CostOrder, DocumentAnalysis, EstateAgent, FicaClient, Invoice, InvoicePayment, LegalCorpusDocument, LegalCorpusSource, LitigationDeadline, LitigationMatter, Matter, PopiaBreachIncident, PopiaDsrRequest, PopiaProcessingRecord, RagSource, ResearchQuery, SignatureRequest, SignatureSignatory, SmtpSettings, TenantEmailSettings, TenantProfile, TimeEntry, TrustReconciliation, TrustTransaction, WhatsAppContact, WhatsAppMessage, WhatsAppTemplate, WorkTask } from "./types";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "";
const TOKEN_KEY = "lawpath.auth.token";

type AuthResponse = {
  token: string;
  user: AuthUser;
};

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = localStorage.getItem(TOKEN_KEY);
  const headers = new Headers(options.headers);
  headers.set("Content-Type", "application/json");

  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers
  });

  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(payload.error || "Request failed.");
  }

  return payload as T;
}

export function saveToken(token: string) {
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken() {
  localStorage.removeItem(TOKEN_KEY);
}

export async function registerTenant(input: { fullName: string; companyName: string; email: string; password: string }) {
  const response = await request<AuthResponse>("/api/auth/register", {
    method: "POST",
    body: JSON.stringify(input)
  });
  saveToken(response.token);
  return response.user;
}

export async function login(input: { email: string; password: string }) {
  const response = await request<AuthResponse>("/api/auth/login", {
    method: "POST",
    body: JSON.stringify(input)
  });
  saveToken(response.token);
  return response.user;
}

export async function forgotPassword(email: string) {
  return request<{ ok: boolean; message: string }>("/api/auth/forgot-password", {
    method: "POST",
    body: JSON.stringify({ email })
  });
}

export async function getCurrentUser() {
  return request<{ user: AuthUser }>("/api/me");
}

export async function getBootstrapSettings() {
  return request<{
    tenantProfile: TenantProfile | null;
    emailIdentity: TenantEmailIdentityResponse["emailIdentity"];
    smtpSettings: SmtpSettings | null;
    apiSettings: ApiProviderSettings | null;
    assistantTraining: AssistantTrainingSettings | null;
    ragSources: RagSource[];
  }>("/api/bootstrap");
}

type TenantEmailIdentityResponse = {
  emailIdentity: {
    from_name: string;
    from_email: string;
    reply_to: string;
    portal_signature: string;
    verified_domain: string | null;
    is_domain_verified: boolean;
  } | null;
};

export async function saveTenantEmailIdentity(settings: TenantEmailSettings) {
  const response = await request<TenantEmailIdentityResponse>("/api/tenant/email-identity", {
    method: "PUT",
    body: JSON.stringify({
      fromName: settings.fromName,
      fromEmail: settings.fromEmail,
      replyTo: settings.replyTo,
      portalSignature: settings.portalSignature,
      verifiedDomain: settings.tenantDomain
    })
  });

  return response.emailIdentity;
}

export async function saveTenantProfile(profile: TenantProfile) {
  return request<{ tenantProfile: TenantProfile }>("/api/tenant/profile", {
    method: "PUT",
    body: JSON.stringify(profile)
  });
}

export async function confirmFfcVerification(ffcNumber: string) {
  return request<{ status: "valid"; verifiedAt: string }>("/api/tenant-profile/confirm-ffc", {
    method: "POST",
    body: JSON.stringify({ ffcNumber })
  });
}

export async function savePlatformSmtpSettings(settings: SmtpSettings) {
  return request<{ smtpSettings: SmtpSettings }>("/api/platform/smtp-settings", {
    method: "PUT",
    body: JSON.stringify(settings)
  });
}

export async function savePlatformApiSettings(settings: ApiProviderSettings) {
  return request<{ apiSettings: ApiProviderSettings }>("/api/platform/api-settings", {
    method: "PUT",
    body: JSON.stringify(settings)
  });
}

export async function saveAssistantTraining(settings: AssistantTrainingSettings) {
  return request<{ assistantTraining: AssistantTrainingSettings }>("/api/platform/assistant-training", {
    method: "PUT",
    body: JSON.stringify(settings)
  });
}

export async function queueRagSource(input: {
  name: string;
  scope: RagSource["scope"];
  sourceType: RagSource["sourceType"];
  documentCount: number;
  sourceUrl?: string;
  fileName?: string;
  mimeType?: string;
  fileDataUrl?: string;
  extractedText?: string;
}) {
  return request<{ source: RagSource }>("/api/rag/sources", {
    method: "POST",
    body: JSON.stringify(input)
  });
}

export async function deleteRagSource(id: string) {
  return request<{ ok: boolean }>(`/api/rag/sources/${id}`, { method: "DELETE" });
}

export async function sendTestEmail(input: {
  recipientEmail: string;
  tenantFromName: string;
  tenantFromEmail: string;
  replyTo: string;
}) {
  return request<{ ok: boolean; messageId: string | null }>("/api/email/test", {
    method: "POST",
    body: JSON.stringify(input)
  });
}

export async function sendAiChat(input: { message: string; agentKey: AiAgentKey; conversationId?: string | null }) {
  return request<{
    conversationId: string;
    agentKey: AiAgentKey;
    answer: string;
    contextSummary: string;
    model: string;
    provider: string;
  }>("/api/ai/chat", {
    method: "POST",
    body: JSON.stringify(input)
  });
}

// ─── TRUST ACCOUNT ───────────────────────────────────────────────────────────

export async function getTrustLedger() {
  return request<{ transactions: TrustTransaction[]; balanceCents: number }>("/api/trust/ledger");
}

export async function createTrustTransaction(input: Omit<TrustTransaction, "id" | "runningBalanceCents" | "reconciled">) {
  return request<{ transaction: TrustTransaction }>("/api/trust/transactions", {
    method: "POST",
    body: JSON.stringify(input)
  });
}

export async function getTrustReconciliations() {
  return request<{ reconciliations: TrustReconciliation[] }>("/api/trust/reconciliations");
}

export async function saveTrustReconciliation(input: Omit<TrustReconciliation, "id">) {
  return request<{ reconciliation: TrustReconciliation }>("/api/trust/reconciliations", {
    method: "POST",
    body: JSON.stringify(input)
  });
}

// ─── FICA / KYC ──────────────────────────────────────────────────────────────

export async function getFicaClients() {
  return request<{ clients: FicaClient[] }>("/api/fica/clients");
}

export async function createFicaClient(input: Omit<FicaClient, "id" | "documents">) {
  return request<{ client: FicaClient }>("/api/fica/clients", {
    method: "POST",
    body: JSON.stringify(input)
  });
}

export async function updateFicaClient(id: string, input: Partial<FicaClient>) {
  return request<{ client: FicaClient }>(`/api/fica/clients/${id}`, {
    method: "PUT",
    body: JSON.stringify(input)
  });
}

// ─── TIME RECORDING ───────────────────────────────────────────────────────────

export async function getTimeEntries() {
  return request<{ entries: TimeEntry[]; wipCents: number }>("/api/time/entries");
}

export async function createTimeEntry(input: Omit<TimeEntry, "id">) {
  return request<{ entry: TimeEntry }>("/api/time/entries", {
    method: "POST",
    body: JSON.stringify(input)
  });
}

export async function updateTimeEntryStatus(id: string, status: TimeEntry["status"]) {
  return request<{ entry: TimeEntry }>(`/api/time/entries/${id}/status`, {
    method: "PUT",
    body: JSON.stringify({ status })
  });
}

export type SuggestedTimeEntry = {
  matterRef: string;
  clientName: string;
  activityType: TimeEntry["activityType"];
  description: string;
  durationMinutes: number;
  confidence: "low" | "medium" | "high";
  isEstimate: true;
  feeEarnerName: string;
};

export async function suggestTimeEntries(date: string) {
  return request<{
    date: string;
    entries: SuggestedTimeEntry[];
    signalCount: number;
    message?: string;
    generatedBy?: { provider: string; model: string };
    disclaimer?: string;
  }>(`/api/time/suggest?date=${encodeURIComponent(date)}`);
}

// ─── POPIA ────────────────────────────────────────────────────────────────────

export async function getPopiaRecords() {
  return request<{
    processingRecords: PopiaProcessingRecord[];
    dsrRequests: PopiaDsrRequest[];
    breachIncidents: PopiaBreachIncident[];
  }>("/api/popia/records");
}

export async function createPopiaProcessingRecord(input: Omit<PopiaProcessingRecord, "id">) {
  return request<{ record: PopiaProcessingRecord }>("/api/popia/processing", {
    method: "POST",
    body: JSON.stringify(input)
  });
}

export async function createPopiaDsrRequest(input: Omit<PopiaDsrRequest, "id" | "dueAt" | "completedAt">) {
  return request<{ request: PopiaDsrRequest }>("/api/popia/dsr", {
    method: "POST",
    body: JSON.stringify(input)
  });
}

export async function updatePopiaDsrStatus(id: string, status: PopiaDsrRequest["status"], responseNotes?: string) {
  return request<{ request: PopiaDsrRequest }>(`/api/popia/dsr/${id}/status`, {
    method: "PUT",
    body: JSON.stringify({ status, responseNotes })
  });
}

export async function createPopiaBreachIncident(input: Omit<PopiaBreachIncident, "id">) {
  return request<{ incident: PopiaBreachIncident }>("/api/popia/breach", {
    method: "POST",
    body: JSON.stringify(input)
  });
}

// ─── CONVEYANCING PIPELINE ───────────────────────────────────────────────────

export async function getConveyancingMatters() {
  return request<{ matters: ConveyancingMatter[] }>("/api/conveyancing/matters");
}

export async function createConveyancingMatter(input: Omit<ConveyancingMatter, "id" | "stages">) {
  return request<{ matter: ConveyancingMatter }>("/api/conveyancing/matters", { method: "POST", body: JSON.stringify(input) });
}

export async function advanceConveyancingStage(id: string, stage: ConveyancingStage, notes?: string) {
  return request<{ matter: ConveyancingMatter }>(`/api/conveyancing/matters/${id}/stage`, { method: "PUT", body: JSON.stringify({ stage, notes }) });
}

export async function updateConveyancingClearances(id: string, input: Partial<ConveyancingMatter>) {
  return request<{ matter: ConveyancingMatter }>(`/api/conveyancing/matters/${id}/clearances`, { method: "PUT", body: JSON.stringify(input) });
}

// ─── LITIGATION PIPELINE ─────────────────────────────────────────────────────

export async function getLitigationMatters() {
  return request<{ matters: LitigationMatter[] }>("/api/litigation/matters");
}

export async function createLitigationMatter(input: Omit<LitigationMatter, "id" | "deadlines" | "courtDates" | "costOrders">) {
  return request<{ matter: LitigationMatter }>("/api/litigation/matters", { method: "POST", body: JSON.stringify(input) });
}

export async function updateLitigationActingFor(matterId: string, actingFor: "plaintiff" | "defendant") {
  return request<{ matter: LitigationMatter }>(`/api/litigation/matters/${matterId}/acting-for`, { method: "PUT", body: JSON.stringify({ actingFor }) });
}

export async function updateConveyancingActingFor(matterId: string, actingFor: "seller" | "buyer" | "bank") {
  return request<{ matter: ConveyancingMatter }>(`/api/conveyancing/matters/${matterId}/acting-for`, { method: "PUT", body: JSON.stringify({ actingFor }) });
}

export async function updateLitigationPrescription(matterId: string, input: {
  causeOfActionDate: string;
  prescriptionPeriodYears: number;
  prescriptionDate?: string;
  prescriptionInterrupted: boolean;
  prescriptionNote: string;
}) {
  return request<{ matter: LitigationMatter }>(`/api/litigation/matters/${matterId}/prescription`, { method: "PUT", body: JSON.stringify(input) });
}

export async function updateConveyancingDots(matterId: string, input: { dotsBarcode: string; dotsDeedsOffice: string }) {
  return request<{ matter: ConveyancingMatter }>(`/api/conveyancing/matters/${matterId}/dots`, { method: "PUT", body: JSON.stringify(input) });
}

export async function pollConveyancingDots(matterId: string) {
  return request<{ matter: ConveyancingMatter; poll: { polled: boolean; changed: boolean; status?: string; previous?: string | null; error?: string } }>(
    `/api/conveyancing/matters/${matterId}/dots/poll`, { method: "POST", body: "{}" });
}

export async function ackConveyancingDots(matterId: string) {
  return request<{ matter: ConveyancingMatter }>(`/api/conveyancing/matters/${matterId}/dots/ack`, { method: "POST", body: "{}" });
}

export async function createLitigationDeadline(matterId: string, input: Omit<LitigationDeadline, "id">) {
  return request<{ deadline: LitigationDeadline }>(`/api/litigation/matters/${matterId}/deadlines`, { method: "POST", body: JSON.stringify(input) });
}

export async function completeLitigationDeadline(matterId: string, deadlineId: string) {
  return request<{ deadline: LitigationDeadline }>(`/api/litigation/matters/${matterId}/deadlines/${deadlineId}/complete`, { method: "PUT" });
}

export async function createCourtDate(matterId: string, input: Omit<CourtDate, "id">) {
  return request<{ courtDate: CourtDate }>(`/api/litigation/matters/${matterId}/court-dates`, { method: "POST", body: JSON.stringify(input) });
}

export async function createCostOrder(matterId: string, input: Omit<CostOrder, "id">) {
  return request<{ costOrder: CostOrder }>(`/api/litigation/matters/${matterId}/cost-orders`, { method: "POST", body: JSON.stringify(input) });
}

// ─── WHATSAPP ─────────────────────────────────────────────────────────────────

export async function getWhatsAppData() {
  return request<{ contacts: WhatsAppContact[]; messages: WhatsAppMessage[]; templates: WhatsAppTemplate[] }>("/api/whatsapp/data");
}

export async function sendWhatsAppMessage(input: { contactId: string; messageBody: string; templateId?: string; matterRef?: string }) {
  return request<{ message: WhatsAppMessage }>("/api/whatsapp/send", { method: "POST", body: JSON.stringify(input) });
}

export async function createWhatsAppContact(input: Omit<WhatsAppContact, "id">) {
  return request<{ contact: WhatsAppContact }>("/api/whatsapp/contacts", { method: "POST", body: JSON.stringify(input) });
}

// ─── CIPC ─────────────────────────────────────────────────────────────────────

export async function searchCipc(query: string) {
  return request<{ results: CipcSearchResult[]; cached?: boolean; note?: string }>(`/api/cipc/search?q=${encodeURIComponent(query)}`);
}

// ─── DOCUMENT INTELLIGENCE ───────────────────────────────────────────────────

export async function getDocumentAnalyses() {
  return request<{ analyses: DocumentAnalysis[] }>("/api/documents/analyses");
}

export async function submitDocumentForAnalysis(input: { fileName: string; fileDataUrl: string; matterRef?: string }) {
  return request<{ analysis: DocumentAnalysis }>("/api/documents/analyse", { method: "POST", body: JSON.stringify(input) });
}

export async function deleteDocumentAnalysis(id: string) {
  return request<{ ok: true }>(`/api/documents/analyses/${id}`, { method: "DELETE" });
}

// ─── ACCOUNTING ───────────────────────────────────────────────────────────────

export async function getAccountingData() {
  return request<{ connections: AccountingConnection[]; exportLog: AccountingExportRecord[] }>("/api/accounting/data");
}

export async function saveAccountingConnection(input: { provider: AccountingProvider; connected?: boolean; apiKey?: string; companyId?: string }) {
  return request<{ connection: AccountingConnection }>("/api/accounting/connections", { method: "POST", body: JSON.stringify(input) });
}

export async function triggerAccountingExport(provider: AccountingProvider, exportType: AccountingExportRecord["exportType"]) {
  return request<{ exportRecord: AccountingExportRecord }>("/api/accounting/export", { method: "POST", body: JSON.stringify({ provider, exportType }) });
}

// ─── INVOICES & BILLING ───────────────────────────────────────────────────────

export async function getInvoices(params?: { status?: string; limit?: number; offset?: number }) {
  const qs = new URLSearchParams();
  if (params?.status) qs.set("status", params.status);
  if (params?.limit)  qs.set("limit",  String(params.limit));
  if (params?.offset) qs.set("offset", String(params.offset));
  return request<{ invoices: Invoice[]; total: number }>(`/api/invoices?${qs}`);
}

export async function createInvoice(data: {
  entryIds: string[];
  clientName: string;
  clientEmail?: string;
  matterRef?: string;
  dueAt?: string;
  notes?: string;
  terms?: string;
  paymentRef?: string;
}) {
  return request<{ invoice: Invoice }>("/api/invoices", { method: "POST", body: JSON.stringify(data) });
}

export async function getInvoice(id: string) {
  return request<{ invoice: Invoice }>(`/api/invoices/${id}`);
}

export async function updateInvoice(id: string, data: { status?: string; notes?: string; terms?: string; dueAt?: string; paymentRef?: string }) {
  return request<{ invoice: Invoice }>(`/api/invoices/${id}`, { method: "PATCH", body: JSON.stringify(data) });
}

export async function recordInvoicePayment(invoiceId: string, data: {
  amountCents: number;
  paymentDate?: string;
  paymentMethod?: InvoicePayment["paymentMethod"];
  reference?: string;
  notes?: string;
}) {
  return request<{ invoice: Invoice }>(`/api/invoices/${invoiceId}/payments`, { method: "POST", body: JSON.stringify(data) });
}

export async function downloadDocumentPdf(title: string, body: string, filename: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const token = localStorage.getItem(TOKEN_KEY);
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (token) headers["Authorization"] = `Bearer ${token}`;

    const response = await fetch(`${API_BASE_URL}/api/documents/pdf`, {
      method: "POST",
      headers,
      body: JSON.stringify({ title, body }),
    });
    if (!response.ok) return { ok: false, error: "Server error" };

    const blob = await response.blob();
    const objectUrl = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = objectUrl;
    anchor.download = `${filename}.pdf`;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    URL.revokeObjectURL(objectUrl);
    return { ok: true };
  } catch {
    return { ok: false, error: "Download failed" };
  }
}

export async function getInvoicePdfUrl(id: string) {
  return request<{ url: string } | null>(`/api/invoices/${id}/pdf`);
}

export async function downloadInvoicePdf(id: string, filename: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const token = localStorage.getItem(TOKEN_KEY);
    const headers: Record<string, string> = {};
    if (token) headers["Authorization"] = `Bearer ${token}`;

    const response = await fetch(`${API_BASE_URL}/api/invoices/${id}/pdf`, { headers });
    if (!response.ok) return { ok: false, error: "Server error" };

    const contentType = response.headers.get("content-type") ?? "";
    let blob: Blob;

    if (contentType.includes("application/pdf")) {
      blob = await response.blob();
    } else {
      const data = await response.json() as { url?: string };
      if (!data.url) return { ok: false, error: "No PDF URL returned" };
      const pdfRes = await fetch(data.url);
      if (!pdfRes.ok) return { ok: false, error: "Could not fetch PDF from storage" };
      blob = await pdfRes.blob();
    }

    const objectUrl = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = objectUrl;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    URL.revokeObjectURL(objectUrl);
    return { ok: true };
  } catch {
    return { ok: false, error: "Download failed" };
  }
}

export async function sendInvoiceByEmail(id: string, data: { toEmail: string; toName?: string; message?: string }) {
  return request<{ invoice: Invoice }>(`/api/invoices/${id}/send`, { method: "POST", body: JSON.stringify(data) });
}

export async function syncInvoiceToAccounting(id: string, provider: string) {
  return request<{ invoice: Invoice }>(`/api/invoices/${id}/accounting`, { method: "POST", body: JSON.stringify({ provider }) });
}

// ─── TODAY / MORNING BRIEF ────────────────────────────────────────────────────

export async function getTodayBrief() {
  return request<import("./types").TodayBrief>("/api/today");
}

// ─── LEGAL RESEARCH DATABASE ──────────────────────────────────────────────────

export async function getLegalCorpus() {
  return request<{ sources: LegalCorpusSource[]; recentDocuments: LegalCorpusDocument[]; recentQueries: ResearchQuery[] }>("/api/research-db/corpus");
}

export async function searchLegalCorpus(query: string) {
  return request<{
    documents: LegalCorpusDocument[];
    aiSummary: string;
    citations: ResearchQuery["citations"];
    queryExpansion: string | null;
    aiRanked: boolean;
    stage: string;
    corpusSize: number | null;
  }>("/api/research-db/search", { method: "POST", body: JSON.stringify({ query }) });
}

export async function indexCorpusSource(sourceId: string) {
  return request<{ source: LegalCorpusSource }>(`/api/research-db/sources/${sourceId}/index`, { method: "POST" });
}

export async function getCorpusDocumentText(docId: string) {
  return request<{ title: string; citation: string; text: string; source: "gcs" | "snippet" | "none"; sourceUrl?: string }>(`/api/research-db/documents/${docId}/text`);
}

// ─── LIGHTSTONE PROPERTY API ─────────────────────────────────────────────────

export interface LightstoneAddress {
  id: number;
  description: string;
  name: string;
  propertyId: number;
  deedsOfficeId: number;
  addressString: string;
  streetNumber: string;
  streetId: number;
  streetName: string;
  streetType: string;
  estateId: number;
  estateName: string;
  schemeName: string;
  schemeGroupId: number;
  suburbId: number;
  suburbName: string;
  townId: number;
  townName: string;
  municipalityId: number;
  municipalityName: string;
  districtCouncilId: number;
  districtCouncilName: string;
  postCode: string;
  provinceId: number;
  provinceName: string;
  countryId: number;
  countryName: string;
  relevanceScore: number;
}

export interface LightstoneSectionalUnit {
  id?: number;
  unitNumber?: string;
  schemeGroupId?: number;
  schemeName?: string;
  addressString?: string;
  suburbName?: string;
  [key: string]: unknown; // Lightstone may return additional fields
}

/** Owner record returned by GET /lspdata/v1/property/{id}/owners */
export interface LightstoneOwner {
  fullName?: string;
  firstName?: string;
  lastName?: string;
  idNumber?: string;
  entityName?: string;           // for companies/trusts
  registrationNumber?: string;
  ownerType?: string;            // 'Natural Person' | 'Legal Entity' | 'Trust' etc.
  ownershipPercentage?: number;
  purchasePrice?: number;
  purchaseDate?: string;
  [key: string]: unknown;
}

/** Legal / title deed record */
export interface LightstoneLegal {
  titleDeedNumber?: string;
  deedType?: string;
  registrationDate?: string;
  purchasePrice?: number;
  bondHolder?: string;
  bondAmount?: number;
  bondRegistrationDate?: string;
  bondCancelledDate?: string;
  [key: string]: unknown;
}

/** Municipal data */
export interface LightstoneMunicipal {
  municipalityName?: string;
  accountNumber?: string;
  municipalValue?: number;
  municipalValueDate?: string;
  monthlyRates?: number;
  [key: string]: unknown;
}

/** Land / extent data */
export interface LightstoneLand {
  erfNumber?: string;
  extent?: number;              // m²
  landUse?: string;
  zoning?: string;
  [key: string]: unknown;
}

/** Full property detail bundle (parallel fetch of all sections) */
export interface LightstonePropertyBundle {
  address: Record<string, unknown> | null;
  owners:  LightstoneOwner[] | null;
  legal:   LightstoneLegal | null;
  municipal: LightstoneMunicipal | null;
  land:    LightstoneLand | null;
}

export async function searchLightstoneAddress(q: string) {
  return request<{ searchIdentifier: string | null; results: LightstoneAddress[] }>(
    `/api/lightstone/address?q=${encodeURIComponent(q)}`
  );
}

export async function getLightstoneSectionalUnits(addressId: number, maxrows = 20) {
  return request<{ units: LightstoneSectionalUnit[] }>(
    `/api/lightstone/sectional/${addressId}?maxrows=${maxrows}`
  );
}

/** Fetch owners + legal + municipal + land + address in one call */
export async function getLightstonePropertyBundle(propertyId: number, addressId?: number) {
  const qs = addressId ? `?addressId=${addressId}` : "";
  return request<LightstonePropertyBundle>(`/api/lightstone/property/${propertyId}${qs}`);
}

// ─── VERIFYNOW SA ─────────────────────────────────────────────────────────────

/** Tenant-facing proxy — call any VerifyNow service.
 *  @param service  e.g. "verify", "aml-pep", "bank-account-verification", "cipc/company"
 *  @param body     Service-specific request payload */
export async function callVerifyNow(service: string, body: Record<string, unknown>) {
  return request<{ data: Record<string, unknown>; metadata: { credits_spent: number; request_id: string } }>(
    `/api/verifynow/${service}`,
    { method: "POST", body: JSON.stringify(body) }
  );
}

export async function getVerifyNowUsage() {
  return request<{
    totals: import("./types").VerifyNowUsageTotals;
    byService: import("./types").VerifyNowServiceStat[];
    byTenant: import("./types").VerifyNowTenantStat[];
    recentLog: import("./types").VerifyNowLogEntry[];
  }>("/api/admin/verifynow/usage");
}

export async function getTenantsOverview() {
  return request<{
    tenants: import("./types").TenantOverviewRow[];
    totals: import("./types").TenantsOverviewTotals;
    pricing: import("./types").PlatformPricingConfig;
  }>("/api/admin/tenants/overview");
}

export async function getPricingConfig() {
  return request<import("./types").PlatformPricingConfig>("/api/platform/pricing-config");
}

export async function savePricingConfig(config: { vatRate: number; markupRate: number }) {
  return request<import("./types").PlatformPricingConfig>("/api/platform/pricing-config", {
    method: "PUT",
    body: JSON.stringify(config)
  });
}

export async function searchworksCall<T = unknown>(service: string, body: unknown) {
  return request<T>(`/api/searchworks/${service}`, {
    method: "POST",
    body: JSON.stringify(body || {})
  });
}

export async function getSearchworksUsage() {
  return request<{
    totals: {
      total_calls: number;
      total_credits: number;
      credits_30d: number;
      credits_7d: number;
      credits_today: number;
      error_calls: number;
      avg_latency_ms: number | null;
    };
    byService: { service: string; calls: number; credits: number; errors: number }[];
    byTenant: { tenant_id: string; tenant_name: string | null; calls: number; credits: number }[];
    recentLog: {
      id: number;
      tenant_id: string | null;
      tenant_name: string | null;
      service: string;
      input_ref: string | null;
      credits_spent: number;
      latency_ms: number | null;
      status: "success" | "error";
      error_code: string | null;
      result_count: number | null;
      created_at: string;
    }[];
  }>("/api/admin/searchworks/usage");
}

export async function getVerifyNowLog(params?: { limit?: number; offset?: number; service?: string }) {
  const qs = new URLSearchParams();
  if (params?.limit)   qs.set("limit",   String(params.limit));
  if (params?.offset)  qs.set("offset",  String(params.offset));
  if (params?.service) qs.set("service", params.service);
  return request<{
    log: import("./types").VerifyNowLogEntry[];
    total: number;
    limit: number;
    offset: number;
  }>(`/api/admin/verifynow/usage/log?${qs}`);
}

// ─── E-SIGNATURE ─────────────────────────────────────────────────────────────

export async function getSignatureRequests() {
  return request<{ requests: SignatureRequest[] }>("/api/esignature/requests");
}

export async function createSignatureRequest(input: { documentTitle: string; documentType: string; matterRef?: string; documentBody?: string; signatories: Omit<SignatureSignatory, "id" | "status" | "signedAt" | "signatureMethod">[] }) {
  return request<{ request: SignatureRequest }>("/api/esignature/requests", { method: "POST", body: JSON.stringify(input) });
}

export async function sendSignatureOtp(requestId: string, signatoryId: string) {
  return request<{ ok: boolean }>(`/api/esignature/requests/${requestId}/signatories/${signatoryId}/send-otp`, { method: "POST" });
}

export async function submitSignature(requestId: string, signatoryId: string, input: { otp: string; signatureDataUri: string; signatureMethod: "drawn" | "typed" | "uploaded" }) {
  return request<{ signatory: SignatureSignatory }>(`/api/esignature/requests/${requestId}/signatories/${signatoryId}/sign`, { method: "POST", body: JSON.stringify(input) });
}

// ─── AGENT NETWORK ────────────────────────────────────────────────────────────

export async function getAgentNetwork() {
  return request<{ agents: EstateAgent[]; referrals: AgentReferral[] }>("/api/agents/network");
}

export async function createEstateAgent(input: Omit<EstateAgent, "id" | "portalToken" | "totalReferrals" | "totalCommissionCents">) {
  return request<{ agent: EstateAgent }>("/api/agents", { method: "POST", body: JSON.stringify(input) });
}

export async function createAgentReferral(agentId: string, input: Omit<AgentReferral, "id" | "agentId" | "agentName">) {
  return request<{ referral: AgentReferral }>(`/api/agents/${agentId}/referrals`, { method: "POST", body: JSON.stringify(input) });
}

export async function updateReferralCommission(referralId: string, status: AgentReferral["commissionStatus"]) {
  return request<{ referral: AgentReferral }>(`/api/agents/referrals/${referralId}/commission`, { method: "PUT", body: JSON.stringify({ status }) });
}

// ─── PRACTICE ANALYTICS ───────────────────────────────────────────────────────

export async function getAnalytics() {
  return request<{ snapshots: AnalyticsSnapshot[]; current: AnalyticsSnapshot | null }>("/api/analytics/dashboard");
}

export async function generateAnalyticsSnapshot() {
  return request<{ snapshot: AnalyticsSnapshot }>("/api/analytics/snapshot", { method: "POST" });
}

// ─── CLIENTS (CRM) ────────────────────────────────────────────────────────────

export async function getClients(params?: { search?: string; category?: string; ficaStatus?: string; clientType?: string; limit?: number; offset?: number }) {
  const qs = new URLSearchParams();
  if (params?.search)     qs.set("search",     params.search);
  if (params?.category)   qs.set("category",   params.category);
  if (params?.ficaStatus) qs.set("ficaStatus",  params.ficaStatus);
  if (params?.clientType) qs.set("clientType",  params.clientType);
  if (params?.limit)      qs.set("limit",       String(params.limit));
  if (params?.offset)     qs.set("offset",      String(params.offset ?? 0));
  return request<{ clients: Client[]; total: number }>(`/api/clients?${qs}`);
}

export async function getClient(id: string) {
  return request<{ client: Client }>(`/api/clients/${id}`);
}

export async function createClient(data: Partial<Client>) {
  return request<{ client: Client }>("/api/clients", { method: "POST", body: JSON.stringify(data) });
}

export async function updateClient(id: string, data: Partial<Client>) {
  return request<{ client: Client }>(`/api/clients/${id}`, { method: "PATCH", body: JSON.stringify(data) });
}

export async function archiveClient(id: string) {
  return request<{ client: Client }>(`/api/clients/${id}/archive`, { method: "POST" });
}

// ─── MATTERS / CONTRACTS / TASKS / APPOINTMENTS / ACTIVITY / STAFF ───────────

export async function getMatters() {
  return request<{ matters: Matter[] }>("/api/matters");
}

export type ApprovalRequest = {
  id: string;
  matterId: string | null;
  kind: "invoice" | "document" | "trust_payment" | "client_message" | "time_entry" | "other";
  title: string;
  summary: string;
  payload: Record<string, unknown>;
  entityType: string;
  entityId: string | null;
  amountCents: number | null;
  status: "pending" | "approved" | "rejected" | "withdrawn" | "actioned";
  origin: "human" | "ai";
  requestedBy: string | null;
  requestedByName: string;
  requestedAt: string;
  decidedBy: string | null;
  decidedByName: string;
  decidedAt: string;
  decisionNote: string;
  actionedAt: string;
};

export async function getApprovals(status = "pending") {
  return request<{ approvals: ApprovalRequest[]; canApprove: boolean }>(`/api/approvals?status=${encodeURIComponent(status)}`);
}

export async function decideApproval(id: string, decision: "approved" | "rejected", note?: string) {
  return request<{ approval: ApprovalRequest }>(`/api/approvals/${id}/decide`, {
    method: "POST", body: JSON.stringify({ decision, note })
  });
}

export async function withdrawApproval(id: string) {
  return request<{ approval: ApprovalRequest }>(`/api/approvals/${id}/withdraw`, { method: "POST", body: "{}" });
}

export type ConflictHit = {
  searchedName: string;
  searchedSide: "client" | "opposing";
  severity: "critical" | "warning" | "info";
  source: "matter" | "litigation" | "conveyancing" | "fica" | "client";
  ref: string;
  matterId: string | null;
  matchedName: string;
  matchedRole: string;
  wasOurClient: boolean | null;
  detail: string;
};

export type ConflictResult = {
  checked: { name: string; side: "client" | "opposing" }[];
  hits: ConflictHit[];
  counts: { critical: number; warning: number; info: number };
  clear: boolean;
  checkedAt: string;
  disclaimer: string;
};

export async function checkConflicts(input: { clientName?: string; opposingParties?: string[] }) {
  return request<ConflictResult>("/api/conflicts/check", { method: "POST", body: JSON.stringify(input) });
}

export type MatterSuggestion = {
  matterId: string;
  ref: string;
  label: string;
  matchedParties: string[];
  score: number;
};

export async function getDocumentMatterSuggestions(documentId: string) {
  return request<{ suggestions: MatterSuggestion[] }>(`/api/documents/${documentId}/matter-suggestions`);
}

export async function fileDocumentToMatter(documentId: string, matterId: string | null) {
  return request<{ analysis: DocumentAnalysis }>(`/api/documents/${documentId}/matter`, {
    method: "PUT", body: JSON.stringify({ matterId })
  });
}

export type MatterDiaryEntry = {
  id: string;
  matterId: string;
  description: string;
  dueDate: string;
  note: string;
  source: "manual" | "document" | "ai" | "rule_engine";
  sourceDocumentId: string | null;
  completed: boolean;
  completedAt: string;
  createdAt: string;
};

export type MatterFile = {
  matter: Matter;
  litigation: LitigationMatter | null;
  conveyancing: ConveyancingMatter | null;
  money: { wipCents: number; billedCents: number; invoicedCents: number; paidCents: number; trustBalanceCents: number };
  timeEntries: TimeEntry[];
  trustTransactions: TrustTransaction[];
  invoices: Invoice[];
  ficaClients: FicaClient[];
  documents: DocumentAnalysis[];
  correspondence: { id: string; direction: "inbound" | "outbound"; body: string; status: string; sentAt: string }[];
  diary: { deadlines: LitigationDeadline[]; courtDates: CourtDate[]; entries: MatterDiaryEntry[] };
};

export async function getMatterFile(matterUuid: string) {
  return request<MatterFile>(`/api/matters/${matterUuid}/file`);
}

export async function createDiaryEntry(matterUuid: string, input: {
  description: string; dueDate: string; note?: string;
  source?: "manual" | "document" | "ai" | "rule_engine"; sourceDocumentId?: string;
}) {
  return request<{ entry: MatterDiaryEntry }>(`/api/matters/${matterUuid}/diary`, {
    method: "POST", body: JSON.stringify(input)
  });
}

export async function completeDiaryEntry(matterUuid: string, entryId: string) {
  return request<{ entry: MatterDiaryEntry }>(`/api/matters/${matterUuid}/diary/${entryId}/complete`, { method: "PUT", body: "{}" });
}

export async function createMatter(input: Omit<Matter, "id">) {
  return request<{ matter: Matter }>("/api/matters", { method: "POST", body: JSON.stringify(input) });
}

export async function getContracts() {
  return request<{ contracts: ContractDraft[] }>("/api/contracts");
}

export async function createContract(input: Omit<ContractDraft, "id" | "updated">) {
  return request<{ contract: ContractDraft }>("/api/contracts", { method: "POST", body: JSON.stringify(input) });
}

export async function getTasks() {
  return request<{ tasks: WorkTask[] }>("/api/tasks");
}

export async function createTask(input: Omit<WorkTask, "id" | "done">) {
  return request<{ task: WorkTask }>("/api/tasks", { method: "POST", body: JSON.stringify(input) });
}

export async function toggleTaskDone(id: string, done: boolean) {
  return request<{ task: WorkTask }>(`/api/tasks/${id}/done`, { method: "PUT", body: JSON.stringify({ done }) });
}

export async function getAppointments() {
  return request<{ appointments: Appointment[] }>("/api/appointments");
}

export async function createAppointment(input: Omit<Appointment, "id">) {
  return request<{ appointment: Appointment }>("/api/appointments", { method: "POST", body: JSON.stringify(input) });
}

export async function getActivity() {
  return request<{ activity: string[] }>("/api/activity");
}

export async function getStaff() {
  return request<{ staff: any[]; pendingInvites: any[] }>("/api/staff");
}
