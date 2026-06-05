import type { AiAgentKey, ApiProviderSettings, AssistantTrainingSettings, AuthUser, FicaClient, PopiaBreachIncident, PopiaDsrRequest, PopiaProcessingRecord, RagSource, SmtpSettings, TenantEmailSettings, TenantProfile, TimeEntry, TrustReconciliation, TrustTransaction } from "./types";

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
