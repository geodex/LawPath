require("dotenv").config();

const crypto = require("crypto");
const express = require("express");
const cors = require("cors");
const waSession = require("./whatsapp-session");
const bcrypt = require("bcryptjs");
const { pool } = require("./db");
const { authMiddleware, signToken } = require("./auth");
const { sendTransactionalEmail } = require("./mailer");
const { configuredBucketName, safeObjectPart, uploadDataUrl, uploadText, downloadText } = require("./gcs");
const verifynow  = require("./verifynow");
const lightstone = require("./lightstone");

const app = express();
const port = Number(process.env.PORT || 3001);

app.use(cors({
  origin: process.env.CORS_ORIGIN ? process.env.CORS_ORIGIN.split(",") : true,
  credentials: true
}));
app.use(express.json({ limit: "12mb" }));

function slugify(value) {
  return value
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 72) || `tenant-${Date.now()}`;
}

async function uniqueTenantSlug(client, companyName) {
  const base = slugify(companyName);
  let slug = base;
  let suffix = 2;

  while (true) {
    const existing = await client.query("select id from tenants where slug = $1", [slug]);
    if (!existing.rowCount) return slug;
    slug = `${base}-${suffix}`;
    suffix += 1;
  }
}

function publicUser(row) {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    fullName: row.full_name,
    email: row.email,
    role: row.role,
    companyName: row.company_name || "LawPath Platform",
    tenantSlug: row.slug
  };
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function requirePlatformSuperAdmin(req, res) {
  if (req.user.role !== "platform_super_admin") {
    res.status(403).json({ error: "Platform super admin access is required." });
    return false;
  }
  return true;
}

function exposeError(error, statusCode = 500, message = "") {
  if (message) error.message = message;
  error.statusCode = statusCode;
  error.expose = true;
  return error;
}

function isMissingDatabaseObject(error) {
  return error?.code === "42703" || error?.code === "42P01";
}

function explainSettingsDatabaseError(error) {
  if (!isMissingDatabaseObject(error)) return null;
  return "Database schema is missing a LawPath settings table or column. Pull the latest code and run migrations, including db/migrations/005_google_cloud_storage.sql.";
}

const DEFAULT_INVOICE_HEADER_FIELDS = ["address", "phone", "website", "vatNumber", "lpcNumber"];
const VALID_INVOICE_HEADER_FIELDS = new Set(DEFAULT_INVOICE_HEADER_FIELDS);

function parseInvoiceHeaderFields(raw) {
  try {
    const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
    if (Array.isArray(parsed) && parsed.length > 0 && parsed.every(f => VALID_INVOICE_HEADER_FIELDS.has(f))) {
      return parsed;
    }
  } catch (_) {}
  return DEFAULT_INVOICE_HEADER_FIELDS;
}

function tenantProfileFromRow(row) {
  if (!row) return null;
  return {
    tradingName: row.trading_name || "",
    practiceType: row.practice_type || "",
    addressLine1: row.address_line_1 || "",
    addressLine2: row.address_line_2 || "",
    city: row.city || "",
    province: row.province || "",
    postalCode: row.postal_code || "",
    phone: row.phone || "",
    website: row.website || "",
    lpcRegistrationNumber: row.lpc_registration_number || "",
    companyRegistrationNumber: row.company_registration_number || "",
    vatNumber: row.vat_number || "",
    conveyancerCount: Number(row.conveyancer_count || 0),
    seniorAttorneyCount: Number(row.senior_attorney_count || 0),
    juniorAttorneyCount: Number(row.junior_attorney_count || 0),
    candidateAttorneyCount: Number(row.candidate_attorney_count || 0),
    legalSecretaryCount: Number(row.legal_secretary_count || 0),
    logoDataUrl: row.logo_public_url || row.logo_data_url || "",
    logoStorageUri: row.logo_storage_uri || "",
    logoPublicUrl: row.logo_public_url || "",
    onboardingCompleted: Boolean(row.onboarding_completed),
    onboardingStep: Number(row.onboarding_step || 1),
    invoiceHeaderFields: parseInvoiceHeaderFields(row.invoice_header_fields)
  };
}

function smtpFromRow(row) {
  if (!row) return null;
  return {
    providerName: row.provider_name || "LawPath SMTP",
    host: row.host || "",
    port: Number(row.port || 587),
    username: row.username || "",
    password: row.password_secret_ref || "",
    encryption: row.encryption || "TLS",
    bounceEmail: row.bounce_email || "",
    transactionalEnabled: Boolean(row.transactional_enabled),
    systemEnabled: Boolean(row.system_enabled),
    testRecipient: row.test_recipient || ""
  };
}

function apiSettingsFromRows(rows) {
  if (!rows.length) return null;
  const byProvider = Object.fromEntries(rows.map((row) => [row.provider, row]));
  return {
    exchangeRatesApiKey: byProvider.exchangerates?.api_key_secret_ref || "",
    exchangeRatesBaseCurrency: byProvider.exchangerates?.base_currency || "ZAR",
    openAiApiKey: byProvider.openai?.api_key_secret_ref || "",
    openAiModel: byProvider.openai?.default_model || "gpt-5.2",
    geminiApiKey: byProvider.gemini?.api_key_secret_ref || "",
    geminiModel: byProvider.gemini?.default_model || "gemini-3.5-flash",
    grokApiKey: byProvider.grok?.api_key_secret_ref || "",
    grokModel: byProvider.grok?.default_model || "grok-4",
    verifyNowApiKey: byProvider.verifynow?.api_key_secret_ref || "",
    lightstoneApiKey: byProvider.lightstone?.api_key_secret_ref || ""
  };
}

function assistantFromRow(row) {
  if (!row) return null;
  return {
    defaultAssistant: row.name,
    retrievalMode: row.retrieval_mode,
    chunkSize: Number(row.chunk_size),
    topK: Number(row.top_k),
    requireCitations: Boolean(row.require_citations),
    allowTenantPrivateSources: Boolean(row.allow_tenant_private_sources),
    systemInstructions: row.system_instructions
  };
}

function ragSourceFromRow(row) {
  return {
    id: row.id,
    name: row.name,
    scope: row.scope,
    sourceType: row.source_type,
    status: row.status,
    documentCount: Number(row.document_count || 0),
    lastIndexed: row.last_indexed_at ? new Date(row.last_indexed_at).toISOString().slice(0, 10) : "Pending"
  };
}

const agentProfiles = {
  general: {
    title: "General legal suite assistant",
    instruction: "Help the user navigate LawPath, prioritise work and explain next actions. Keep legal-risk warnings concise."
  },
  drafting: {
    title: "Document drafting assistant",
    instruction: "Help draft, review and improve South African legal documents. Ask for missing parties, dates, money terms and attorney-review risks."
  },
  research: {
    title: "Legal research assistant",
    instruction: "Help research South African legal issues using tenant research items, RAG sources, case-law bundles and cited source summaries."
  },
  secretary: {
    title: "Legal secretary assistant",
    instruction: "Help convert instructions into tasks, reminders, filing checklists, client updates and attorney follow-ups."
  },
  billing: {
    title: "Billing assistant",
    instruction: "Help with billing workflow, payment follow-ups, invoice summaries and matter-level recoverability."
  },
  portal: {
    title: "Client portal assistant",
    instruction: "Help produce client-safe progress updates without exposing confidential internal notes or legal advice beyond approved summaries."
  },
  settings: {
    title: "Platform configuration assistant",
    instruction: "Help super admins and tenant admins configure email, AI providers, RAG training and tenant branding."
  }
};

function trimForContext(value, max = 900) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, max);
}

function htmlToText(html) {
  return String(html || "")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}

async function fetchWebSourceText(sourceUrl) {
  const url = new URL(sourceUrl);
  if (!["https:", "http:"].includes(url.protocol)) {
    throw new Error("Only http and https web sources can be indexed.");
  }

  const response = await fetch(url, {
    headers: {
      "User-Agent": "LawPath-SA-RAG-Indexer/1.0"
    }
  });

  if (!response.ok) {
    throw new Error(`Could not fetch web source. HTTP ${response.status}.`);
  }

  const contentType = response.headers.get("content-type") || "text/plain";
  const text = await response.text();
  const extracted = contentType.includes("html") ? htmlToText(text) : text;

  return {
    contentType,
    rawText: text.slice(0, 1_500_000),
    extractedText: extracted.slice(0, 1_500_000)
  };
}

async function buildTenantAiContext(req, agentKey) {
  const tenantId = req.user.tenantId;
  const [profile, matters, research, ragSources, tasks, invoices] = await Promise.all([
    tenantId ? pool.query("select * from tenant_profiles where tenant_id = $1", [tenantId]) : Promise.resolve({ rows: [] }),
    tenantId ? pool.query("select matter_number, title, client_name, matter_type, stage, progress, next_step, risk from matters where tenant_id = $1 order by updated_at desc limit 8", [tenantId]) : Promise.resolve({ rows: [] }),
    tenantId ? pool.query("select title, court_or_source, decision_year, tags, summary, source_url from research_items where tenant_id = $1 order by updated_at desc limit 8", [tenantId]) : Promise.resolve({ rows: [] }),
    pool.query(
      `select name, scope, source_type, status, document_count, source_url, extraction_summary
       from rag_sources
       where tenant_id is null or tenant_id = $1
       order by updated_at desc
       limit 10`,
      [tenantId]
    ),
    tenantId ? pool.query("select title, owner_label, due_at, priority, done from work_tasks where tenant_id = $1 order by created_at desc limit 8", [tenantId]) : Promise.resolve({ rows: [] }),
    tenantId ? pool.query("select invoice_number, client_name, amount_cents, paid_cents, currency, status from invoices where tenant_id = $1 order by created_at desc limit 8", [tenantId]) : Promise.resolve({ rows: [] })
  ]);

  return {
    agent: agentProfiles[agentKey] || agentProfiles.general,
    tenantProfile: tenantProfileFromRow(profile.rows[0]),
    matters: matters.rows,
    research: research.rows,
    ragSources: ragSources.rows.map((row) => ({
      ...row,
      extraction_summary: trimForContext(row.extraction_summary, 600)
    })),
    tasks: tasks.rows,
    invoices: invoices.rows
  };
}

function buildContextSummary(context) {
  return [
    context.tenantProfile ? `Firm: ${context.tenantProfile.tradingName || "unnamed firm"}; practice type: ${context.tenantProfile.practiceType || "not set"}.` : "No tenant profile loaded.",
    `Matters: ${context.matters.length}. Research items: ${context.research.length}. RAG sources: ${context.ragSources.length}. Tasks: ${context.tasks.length}. Invoices: ${context.invoices.length}.`
  ].join(" ");
}

async function getOpenAiSettings() {
  const result = await pool.query("select * from platform_api_provider_settings where provider = 'openai' and active = true limit 1");
  const row = result.rows[0];
  return {
    apiKey: row?.api_key_secret_ref || process.env.OPENAI_API_KEY || "",
    model: row?.default_model || process.env.OPENAI_MODEL || "gpt-4.1-mini"
  };
}

async function callOpenAiAssistant({ message, agentKey, context }) {
  const { apiKey, model } = await getOpenAiSettings();

  if (!apiKey) {
    return {
      provider: "local",
      model: "fallback",
      content: [
        `${context.agent.title} is ready, but no OpenAI API key is configured yet.`,
        "",
        "I can still show the tenant context I would use:",
        buildContextSummary(context),
        "",
        `Next step: configure the OpenAI key under Settings, then ask again: "${message}".`
      ].join("\n")
    };
  }

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model,
      input: [
        {
          role: "system",
          content: [
            "You are LawPath SA, an AI-native legal practice assistant for South African law firms.",
            "Use only the tenant-scoped context supplied. Do not invent database facts. Keep attorney review requirements explicit.",
            context.agent.instruction,
            `Current agent key: ${agentKey}.`
          ].join("\n")
        },
        {
          role: "user",
          content: [
            "Tenant-scoped context JSON:",
            JSON.stringify(context).slice(0, 18000),
            "",
            "User request:",
            message
          ].join("\n")
        }
      ]
    })
  });

  const payload = await response.json();

  if (!response.ok) {
    throw new Error(payload.error?.message || "OpenAI request failed.");
  }

  const content = payload.output_text || payload.output?.flatMap((item) => item.content || []).map((part) => part.text || "").join("\n") || "No assistant response returned.";

  return {
    provider: "openai",
    model,
    content,
    usage: payload.usage
  };
}

app.get("/api/health", async (_req, res) => {
  const result = await pool.query("select now() as server_time");
  res.json({ ok: true, database: "connected", serverTime: result.rows[0].server_time });
});

app.post("/api/auth/register", async (req, res, next) => {
  const { fullName, companyName, email, password } = req.body;

  if (!fullName || !companyName || !email || !password) {
    return res.status(400).json({ error: "Full name, company name, email and password are required." });
  }

  const client = await pool.connect();

  try {
    await client.query("begin");

    const existingUser = await client.query("select id from users where email = $1", [email.toLowerCase()]);
    if (existingUser.rowCount) {
      await client.query("rollback");
      return res.status(409).json({ error: "An account already exists for this email address." });
    }

    const domain = String(email).includes("@") ? String(email).split("@")[1].toLowerCase() : null;
    const slug = await uniqueTenantSlug(client, companyName);
    const tenant = await client.query(
      `insert into tenants (company_name, slug, primary_domain)
       values ($1, $2, $3)
       returning id, company_name, slug`,
      [companyName, slug, domain]
    );

    const passwordHash = await bcrypt.hash(password, 12);
    const user = await client.query(
      `insert into users (tenant_id, full_name, email, password_hash, role, status)
       values ($1, $2, $3, $4, 'tenant_admin', 'active')
       returning id, tenant_id, full_name, email, role`,
      [tenant.rows[0].id, fullName, email.toLowerCase(), passwordHash]
    );

    await client.query(
      `insert into tenant_email_identities
        (tenant_id, from_name, from_email, reply_to, portal_signature, verified_domain, is_domain_verified)
       values ($1, $2, $3, $4, $5, $6, false)`,
      [tenant.rows[0].id, companyName, email.toLowerCase(), email.toLowerCase(), `${companyName} Legal Team`, domain]
    );

    await client.query(
      `insert into tenant_profiles (tenant_id, trading_name, website, onboarding_completed)
       values ($1, $2, $3, false)`,
      [tenant.rows[0].id, companyName, domain ? `https://${domain}` : ""]
    );

    await client.query(
      `insert into activity_log (tenant_id, actor_user_id, entity_type, entity_id, action, details)
       values ($1, $2, 'tenant', $1, 'tenant_registered', $3)`,
      [tenant.rows[0].id, user.rows[0].id, { companyName, email: email.toLowerCase() }]
    );

    await client.query("commit");

    const mergedUser = { ...user.rows[0], company_name: tenant.rows[0].company_name, slug: tenant.rows[0].slug };
    res.status(201).json({ token: signToken(mergedUser), user: publicUser(mergedUser) });
  } catch (error) {
    await client.query("rollback");
    next(error);
  } finally {
    client.release();
  }
});

app.post("/api/auth/login", async (req, res, next) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: "Email and password are required." });
  }

  try {
    const result = await pool.query(
      `select users.id, users.tenant_id, users.full_name, users.email, users.password_hash, users.role,
              tenants.company_name, tenants.slug
       from users
       left join tenants on tenants.id = users.tenant_id
       where users.email = $1 and users.status = 'active'`,
      [email.toLowerCase()]
    );

    const user = result.rows[0];
    if (!user || !(await bcrypt.compare(password, user.password_hash))) {
      return res.status(401).json({ error: "Invalid email or password." });
    }

    await pool.query("update users set last_login_at = now() where id = $1", [user.id]);
    res.json({ token: signToken(user), user: publicUser(user) });
  } catch (error) {
    const message = explainSettingsDatabaseError(error);
    if (message) return next(exposeError(error, 500, message));
    next(error);
  }
});

app.post("/api/auth/forgot-password", async (req, res, next) => {
  const { email } = req.body;

  if (!email) {
    return res.status(400).json({ error: "Email is required." });
  }

  try {
    const user = await pool.query("select id from users where email = $1", [email.toLowerCase()]);

    if (user.rowCount) {
      const rawToken = crypto.randomBytes(32).toString("hex");
      const tokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");

      await pool.query(
        `insert into password_reset_tokens (user_id, token_hash, expires_at)
         values ($1, $2, now() + interval '1 hour')`,
        [user.rows[0].id, tokenHash]
      );

      // Email sending will be wired to platform SMTP settings next.
      console.info(`Password reset token generated for ${email}. Token prefix: ${rawToken.slice(0, 8)}`);
    }

    res.json({ ok: true, message: "If the account exists, password reset instructions have been queued." });
  } catch (error) {
    next(error);
  }
});

app.get("/api/me", authMiddleware, async (req, res, next) => {
  try {
    const result = await pool.query(
      `select users.id, users.tenant_id, users.full_name, users.email, users.role,
              tenants.company_name, tenants.slug
       from users
       left join tenants on tenants.id = users.tenant_id
       where users.id = $1`,
      [req.user.sub]
    );

    if (!result.rowCount) {
      return res.status(404).json({ error: "User not found." });
    }

    res.json({ user: publicUser(result.rows[0]) });
  } catch (error) {
    next(error);
  }
});

app.get("/api/bootstrap", authMiddleware, async (req, res, next) => {
  try {
    const [
      profile,
      emailIdentity,
      smtp,
      apiSettings,
      assistant,
      ragSources
    ] = await Promise.all([
      req.user.tenantId
        ? pool.query("select * from tenant_profiles where tenant_id = $1", [req.user.tenantId])
        : Promise.resolve({ rows: [] }),
      req.user.tenantId
        ? pool.query(`select from_name, from_email, reply_to, portal_signature, verified_domain, is_domain_verified from tenant_email_identities where tenant_id = $1`, [req.user.tenantId])
        : Promise.resolve({ rows: [] }),
      pool.query("select * from platform_smtp_settings where active = true order by updated_at desc limit 1"),
      pool.query("select * from platform_api_provider_settings where active = true"),
      pool.query("select * from assistant_profiles where active = true order by updated_at desc limit 1"),
      pool.query(
        `select * from rag_sources
         where tenant_id is null or tenant_id = $1
         order by created_at desc
         limit 30`,
        [req.user.tenantId]
      )
    ]);

    res.json({
      tenantProfile: tenantProfileFromRow(profile.rows[0]),
      emailIdentity: emailIdentity.rows[0] || null,
      smtpSettings: smtpFromRow(smtp.rows[0]),
      apiSettings: apiSettingsFromRows(apiSettings.rows),
      assistantTraining: assistantFromRow(assistant.rows[0]),
      ragSources: ragSources.rows.map(ragSourceFromRow)
    });
  } catch (error) {
    next(error);
  }
});

app.put("/api/tenant/profile", authMiddleware, async (req, res, next) => {
  if (!req.user.tenantId) {
    return res.status(403).json({ error: "Tenant context is required." });
  }

  const profile = req.body;

  try {
    let logoStorageUri = profile.logoStorageUri || "";
    let logoPublicUrl = profile.logoPublicUrl || "";

    if (profile.logoDataUrl && String(profile.logoDataUrl).startsWith("data:")) {
      const uploadedLogo = await uploadDataUrl({
        dataUrl: profile.logoDataUrl,
        prefix: `tenants/${req.user.tenantId}/media/logos`,
        fileName: "firm-logo",
        metadata: {
          ownerType: "tenant_logo",
          tenantId: req.user.tenantId
        }
      });
      logoStorageUri = uploadedLogo.gcsUri;
      logoPublicUrl = uploadedLogo.publicUrl;
    }

    const invoiceHeaderFields = Array.isArray(profile.invoiceHeaderFields) && profile.invoiceHeaderFields.length > 0
      ? JSON.stringify(profile.invoiceHeaderFields.filter(f => VALID_INVOICE_HEADER_FIELDS.has(f)))
      : JSON.stringify(DEFAULT_INVOICE_HEADER_FIELDS);

    const result = await pool.query(
      `insert into tenant_profiles
        (tenant_id, trading_name, practice_type, address_line_1, address_line_2, city, province, postal_code,
         phone, website, lpc_registration_number, company_registration_number, vat_number, conveyancer_count,
         senior_attorney_count, junior_attorney_count, candidate_attorney_count, legal_secretary_count,
         logo_data_url, logo_storage_uri, logo_public_url, onboarding_completed, onboarding_step,
         invoice_header_fields)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24)
       on conflict (tenant_id) do update set
        trading_name = excluded.trading_name,
        practice_type = excluded.practice_type,
        address_line_1 = excluded.address_line_1,
        address_line_2 = excluded.address_line_2,
        city = excluded.city,
        province = excluded.province,
        postal_code = excluded.postal_code,
        phone = excluded.phone,
        website = excluded.website,
        lpc_registration_number = excluded.lpc_registration_number,
        company_registration_number = excluded.company_registration_number,
        vat_number = excluded.vat_number,
        conveyancer_count = excluded.conveyancer_count,
        senior_attorney_count = excluded.senior_attorney_count,
        junior_attorney_count = excluded.junior_attorney_count,
        candidate_attorney_count = excluded.candidate_attorney_count,
        legal_secretary_count = excluded.legal_secretary_count,
        logo_data_url = excluded.logo_data_url,
        logo_storage_uri = excluded.logo_storage_uri,
        logo_public_url = excluded.logo_public_url,
        onboarding_completed = excluded.onboarding_completed,
        onboarding_step = excluded.onboarding_step,
        invoice_header_fields = excluded.invoice_header_fields,
        updated_at = now()
       returning *`,
      [
        req.user.tenantId,
        profile.tradingName || "",
        profile.practiceType || "",
        profile.addressLine1 || "",
        profile.addressLine2 || "",
        profile.city || "",
        profile.province || "",
        profile.postalCode || "",
        profile.phone || "",
        profile.website || "",
        profile.lpcRegistrationNumber || "",
        profile.companyRegistrationNumber || "",
        profile.vatNumber || "",
        Number(profile.conveyancerCount || 0),
        Number(profile.seniorAttorneyCount || 0),
        Number(profile.juniorAttorneyCount || 0),
        Number(profile.candidateAttorneyCount || 0),
        Number(profile.legalSecretaryCount || 0),
        logoPublicUrl || "",
        logoStorageUri,
        logoPublicUrl,
        Boolean(profile.onboardingCompleted),
        Number(profile.onboardingStep || 1),
        invoiceHeaderFields
      ]
    );

    if (logoStorageUri) {
      const parsedLogo = logoStorageUri.match(/^gs:\/\/([^/]+)\/(.+)$/);
      const logoBucket = parsedLogo?.[1] || configuredBucketName();
      const objectName = parsedLogo?.[2] || logoStorageUri.replace(`gs://${logoBucket}/`, "");
      await pool.query(
        `insert into storage_objects
          (tenant_id, owner_type, owner_id, bucket, object_name, gcs_uri, public_url, content_type, metadata, created_by)
         values ($1, 'tenant_logo', $1, $2, $3, $4, $5, $6, $7, $8)
         on conflict (bucket, object_name) do nothing`,
        [
          req.user.tenantId,
          logoBucket,
          objectName,
          logoStorageUri,
          logoPublicUrl,
          "image/*",
          { source: "tenant_onboarding" },
          req.user.sub
        ]
      );
    }

    await pool.query(
      `insert into activity_log (tenant_id, actor_user_id, entity_type, entity_id, action, details)
       values ($1, $2, 'tenant_profile', $1, 'updated', $3)`,
      [req.user.tenantId, req.user.sub, { tradingName: profile.tradingName, practiceType: profile.practiceType }]
    );

    res.json({ tenantProfile: tenantProfileFromRow(result.rows[0]) });
  } catch (error) {
    next(error);
  }
});

app.get("/api/tenant/email-identity", authMiddleware, async (req, res, next) => {
  try {
    const result = await pool.query(
      `select from_name, from_email, reply_to, portal_signature, verified_domain, is_domain_verified
       from tenant_email_identities
       where tenant_id = $1`,
      [req.user.tenantId]
    );

    res.json({ emailIdentity: result.rows[0] || null });
  } catch (error) {
    next(error);
  }
});

app.put("/api/tenant/email-identity", authMiddleware, async (req, res, next) => {
  const { fromName, fromEmail, replyTo, portalSignature, verifiedDomain } = req.body;

  if (!req.user.tenantId) {
    return res.status(403).json({ error: "Tenant context is required." });
  }

  if (!fromName || !fromEmail || !replyTo) {
    return res.status(400).json({ error: "From name, from email and reply-to are required." });
  }

  try {
    const result = await pool.query(
      `insert into tenant_email_identities
        (tenant_id, from_name, from_email, reply_to, portal_signature, verified_domain, is_domain_verified)
       values ($1, $2, $3, $4, $5, $6, false)
       on conflict (tenant_id) do update set
        from_name = excluded.from_name,
        from_email = excluded.from_email,
        reply_to = excluded.reply_to,
        portal_signature = excluded.portal_signature,
        verified_domain = excluded.verified_domain,
        updated_at = now()
       returning from_name, from_email, reply_to, portal_signature, verified_domain, is_domain_verified`,
      [req.user.tenantId, fromName, fromEmail.toLowerCase(), replyTo.toLowerCase(), portalSignature || "", verifiedDomain || null]
    );

    await pool.query(
      `insert into activity_log (tenant_id, actor_user_id, entity_type, entity_id, action, details)
       values ($1, $2, 'tenant_email_identity', $1, 'updated', $3)`,
      [req.user.tenantId, req.user.sub, { fromName, fromEmail, replyTo }]
    );

    res.json({ emailIdentity: result.rows[0] });
  } catch (error) {
    next(error);
  }
});

app.put("/api/platform/smtp-settings", authMiddleware, async (req, res, next) => {
  if (!requirePlatformSuperAdmin(req, res)) return;

  const settings = req.body;

  try {
    await pool.query("update platform_smtp_settings set active = false where active = true");
    const result = await pool.query(
      `insert into platform_smtp_settings
        (provider_name, host, port, username, password_secret_ref, encryption, bounce_email,
         transactional_enabled, system_enabled, test_recipient, active, created_by)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, true, $11)
       returning *`,
      [
        settings.providerName || "LawPath SMTP",
        settings.host || "",
        Number(settings.port || 587),
        settings.username || "",
        settings.password || "",
        settings.encryption || "TLS",
        settings.bounceEmail || "",
        Boolean(settings.transactionalEnabled),
        Boolean(settings.systemEnabled),
        settings.testRecipient || "",
        req.user.sub
      ]
    );

    res.json({ smtpSettings: smtpFromRow(result.rows[0]) });
  } catch (error) {
    next(error);
  }
});

app.put("/api/platform/api-settings", authMiddleware, async (req, res, next) => {
  if (!requirePlatformSuperAdmin(req, res)) return;

  const settings = req.body;
  const providers = [
    ["exchangerates", settings.exchangeRatesApiKey || "", null, settings.exchangeRatesBaseCurrency || "ZAR"],
    ["openai", settings.openAiApiKey || "", settings.openAiModel || "gpt-5.2", null],
    ["gemini", settings.geminiApiKey || "", settings.geminiModel || "gemini-3.5-flash", null],
    ["grok", settings.grokApiKey || "", settings.grokModel || "grok-4", null],
    ["verifynow",    settings.verifyNowApiKey    || "", null, null],
    ["lightstone",   settings.lightstoneApiKey   || "", null, null]
  ];

  try {
    for (const provider of providers) {
      await pool.query(
        `insert into platform_api_provider_settings
          (provider, api_key_secret_ref, default_model, base_currency, active, created_by)
         values ($1, $2, $3, $4, true, $5)
         on conflict (provider) do update set
          api_key_secret_ref = excluded.api_key_secret_ref,
          default_model = excluded.default_model,
          base_currency = excluded.base_currency,
          active = true,
          created_by = excluded.created_by,
          updated_at = now()`,
        [...provider, req.user.sub]
      );
    }

    const result = await pool.query("select * from platform_api_provider_settings where active = true");
    res.json({ apiSettings: apiSettingsFromRows(result.rows) });
  } catch (error) {
    next(error);
  }
});

app.put("/api/platform/assistant-training", authMiddleware, async (req, res, next) => {
  if (!requirePlatformSuperAdmin(req, res)) return;

  const settings = req.body;

  try {
    await pool.query("update assistant_profiles set active = false where active = true");
    const result = await pool.query(
      `insert into assistant_profiles
        (name, retrieval_mode, chunk_size, top_k, require_citations, allow_tenant_private_sources, system_instructions, active, created_by)
       values ($1, $2, $3, $4, $5, $6, $7, true, $8)
       returning *`,
      [
        settings.defaultAssistant || "LawPath Legal Assistant",
        settings.retrievalMode || "Balanced",
        Number(settings.chunkSize || 1200),
        Number(settings.topK || 8),
        Boolean(settings.requireCitations),
        Boolean(settings.allowTenantPrivateSources),
        settings.systemInstructions || "",
        req.user.sub
      ]
    );

    res.json({ assistantTraining: assistantFromRow(result.rows[0]) });
  } catch (error) {
    next(error);
  }
});

app.post("/api/rag/sources", authMiddleware, async (req, res, next) => {
  const { name, sourceType, documentCount, sourceUrl, fileName, mimeType, extractedText, fileDataUrl } = req.body;
  let { scope } = req.body;

  if (!name || !scope || !sourceType) {
    return res.status(400).json({ error: "Source name, scope and source type are required." });
  }

  // Non-super-admin uploads are forced to the tenant-private scope. This
  // is the security boundary that keeps a firm's training material out of
  // any other tenant's retrieval namespace, regardless of what the client
  // tries to send.
  const isPlatformSuperAdmin = req.user.role === "platform_super_admin";
  if (!isPlatformSuperAdmin) {
    if (!req.user.tenantId) {
      return res.status(403).json({ error: "Tenant context required." });
    }
    scope = "Tenant private";
  }

  const tenantId = scope === "Tenant private" ? req.user.tenantId : null;

  if (scope === "Tenant private" && !tenantId) {
    return res.status(403).json({ error: "Tenant private sources require tenant context." });
  }

  try {
    const sourcePrefix = `ai-training/${tenantId || "platform"}/${safeObjectPart(scope)}/${safeObjectPart(sourceType)}`;
    let uploaded = null;
    let extracted = extractedText || "";
    let storedFileName = fileName || "";
    let storedMimeType = mimeType || "";

    if (fileDataUrl) {
      uploaded = await uploadDataUrl({
        dataUrl: fileDataUrl,
        prefix: sourcePrefix,
        fileName: fileName || name,
        metadata: {
          ownerType: "rag_source",
          tenantId: tenantId || "",
          sourceType,
          geminiReady: "true"
        }
      });
      storedFileName = fileName || name;
      storedMimeType = uploaded.contentType;
    } else if (sourceUrl) {
      const web = await fetchWebSourceText(sourceUrl);
      extracted = web.extractedText;
      storedMimeType = "text/plain";
      storedFileName = `${safeObjectPart(name)}-web-extract.txt`;
      uploaded = await uploadText({
        text: web.extractedText,
        prefix: sourcePrefix,
        fileName: storedFileName,
        contentType: "text/plain",
        metadata: {
          ownerType: "rag_source",
          tenantId: tenantId || "",
          sourceType,
          sourceUrl,
          originalContentType: web.contentType,
          geminiReady: "true"
        }
      });
    } else if (extracted) {
      storedMimeType = "text/plain";
      storedFileName = `${safeObjectPart(name)}-training-notes.txt`;
      uploaded = await uploadText({
        text: extracted,
        prefix: sourcePrefix,
        fileName: storedFileName,
        contentType: "text/plain",
        metadata: {
          ownerType: "rag_source",
          tenantId: tenantId || "",
          sourceType,
          geminiReady: "true"
        }
      });
    }

    const summary = extracted
      ? String(extracted).replace(/\s+/g, " ").slice(0, 900)
      : uploaded
        ? `Source stored in Google Cloud Storage for Gemini/RAG processing: ${uploaded.gcsUri}`
        : "Source queued; no file or URL payload was supplied.";

    const source = await pool.query(
      `insert into rag_sources
       (tenant_id, name, scope, source_type, status, document_count, source_url, original_file_name, mime_type,
         extraction_summary, metadata, gcs_bucket, gcs_prefix, storage_uri, gemini_file_uri, created_by)
       values ($1, $2, $3, $4, 'Queued', $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
       returning *`,
      [
        tenantId,
        name,
        scope,
        sourceType,
        Number(documentCount || 1),
        sourceUrl || null,
        storedFileName || null,
        storedMimeType || null,
        summary,
        { sourceUrl: sourceUrl || null, fileName: storedFileName || null, storage: uploaded?.gcsUri || null },
        uploaded?.bucket || null,
        uploaded ? sourcePrefix : null,
        uploaded?.gcsUri || null,
        uploaded?.gcsUri || null,
        req.user.sub
      ]
    );

    if (uploaded) {
      const document = await pool.query(
        `insert into rag_documents
          (rag_source_id, tenant_id, title, source_uri, content_hash, status, metadata, gcs_uri, public_url, byte_size)
         values ($1, $2, $3, $4, $5, 'Queued', $6, $7, $8, $9)
         returning id`,
        [
          source.rows[0].id,
          tenantId,
          storedFileName || name,
          sourceUrl || uploaded.gcsUri,
          crypto.createHash("sha256").update(uploaded.gcsUri).digest("hex"),
          { sourceType, mimeType: storedMimeType, geminiFileUri: uploaded.gcsUri },
          uploaded.gcsUri,
          uploaded.publicUrl,
          uploaded.byteSize
        ]
      );

      await pool.query(
        `insert into storage_objects
          (tenant_id, owner_type, owner_id, bucket, object_name, gcs_uri, public_url, content_type, byte_size, metadata, created_by)
         values ($1, 'rag_document', $2, $3, $4, $5, $6, $7, $8, $9, $10)
         on conflict (bucket, object_name) do nothing`,
        [
          tenantId,
          document.rows[0].id,
          uploaded.bucket,
          uploaded.objectName,
          uploaded.gcsUri,
          uploaded.publicUrl,
          uploaded.contentType,
          uploaded.byteSize,
          { sourceId: source.rows[0].id, sourceType, geminiFileUri: uploaded.gcsUri },
          req.user.sub
        ]
      );
    }

    await pool.query(
      `insert into rag_index_jobs (rag_source_id, status, documents_seen, documents_indexed, created_by)
       values ($1, 'Queued', $2, 0, $3)`,
      [source.rows[0].id, Number(documentCount || 1), req.user.sub]
    );

    res.status(201).json({ source: ragSourceFromRow(source.rows[0]) });
  } catch (error) {
    next(error);
  }
});

// Tenants can only delete their own private RAG sources; platform super
// admins can delete platform-scoped ones too. The FK cascade on
// rag_sources → rag_documents → storage_objects → rag_index_jobs takes
// care of the dependent rows; the underlying GCS objects are left in
// place and can be reaped by an offline sweep job.
app.delete("/api/rag/sources/:id", authMiddleware, async (req, res, next) => {
  const isPlatformSuperAdmin = req.user.role === "platform_super_admin";
  try {
    const row = await pool.query(
      "select id, tenant_id, scope from rag_sources where id = $1",
      [req.params.id]
    );
    if (!row.rowCount) return res.status(404).json({ error: "Source not found." });
    const source = row.rows[0];
    if (!isPlatformSuperAdmin) {
      if (!req.user.tenantId) return res.status(403).json({ error: "Tenant context required." });
      if (source.tenant_id !== req.user.tenantId || source.scope !== "Tenant private") {
        return res.status(403).json({ error: "You can only delete your own private training sources." });
      }
    }
    await pool.query("delete from rag_sources where id = $1", [req.params.id]);
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

app.post("/api/ai/chat", authMiddleware, async (req, res, next) => {
  const { message, agentKey = "general", conversationId } = req.body;

  if (!message || !String(message).trim()) {
    return res.status(400).json({ error: "Message is required." });
  }

  const tenantId = req.user.tenantId || null;
  const client = await pool.connect();

  try {
    await client.query("begin");

    let conversation = null;
    if (conversationId) {
      const existing = await client.query(
        `select * from ai_conversations
         where id = $1 and (tenant_id is not distinct from $2)`,
        [conversationId, tenantId]
      );
      conversation = existing.rows[0] || null;
    }

    if (!conversation) {
      const created = await client.query(
        `insert into ai_conversations (tenant_id, user_id, agent_key, title)
         values ($1, $2, $3, $4)
         returning *`,
        [tenantId, req.user.sub, agentKey, `${agentProfiles[agentKey]?.title || "Assistant"} chat`]
      );
      conversation = created.rows[0];
    }

    await client.query(
      `insert into ai_messages (conversation_id, tenant_id, role, content)
       values ($1, $2, 'user', $3)`,
      [conversation.id, tenantId, message]
    );

    const run = await client.query(
      `insert into ai_agent_runs (tenant_id, user_id, conversation_id, agent_key, status)
       values ($1, $2, $3, $4, 'running')
       returning id`,
      [tenantId, req.user.sub, conversation.id, agentKey]
    );

    await client.query("commit");

    const context = await buildTenantAiContext(req, agentKey);
    const contextSummary = buildContextSummary(context);
    const ai = await callOpenAiAssistant({ message: String(message), agentKey, context });

    await pool.query(
      `insert into ai_messages (conversation_id, tenant_id, role, content, model, context_summary)
       values ($1, $2, 'assistant', $3, $4, $5)`,
      [conversation.id, tenantId, ai.content, ai.model, contextSummary]
    );

    await pool.query(
      `update ai_agent_runs
       set status = 'completed',
           provider = $2,
           model = $3,
           prompt_tokens = $4,
           completion_tokens = $5,
           tools_used = $6,
           completed_at = now()
       where id = $1`,
      [
        run.rows[0].id,
        ai.provider,
        ai.model,
        ai.usage?.input_tokens || null,
        ai.usage?.output_tokens || null,
        ["tenant_context", "rag_sources", "research_items"]
      ]
    );

    await pool.query("update ai_conversations set updated_at = now() where id = $1", [conversation.id]);

    res.json({
      conversationId: conversation.id,
      agentKey,
      answer: ai.content,
      contextSummary,
      model: ai.model,
      provider: ai.provider
    });
  } catch (error) {
    await client.query("rollback").catch(() => undefined);
    next(error);
  } finally {
    client.release();
  }
});

app.post("/api/email/test", authMiddleware, async (req, res, next) => {
  const { recipientEmail, tenantFromName, tenantFromEmail, replyTo } = req.body;

  if (!recipientEmail) {
    return res.status(400).json({ error: "Test recipient email is required." });
  }

  const normalizedRecipient = String(recipientEmail).trim().toLowerCase();
  const normalizedTenantFrom = tenantFromEmail ? String(tenantFromEmail).trim().toLowerCase() : null;
  const normalizedReplyTo = replyTo ? String(replyTo).trim().toLowerCase() : normalizedTenantFrom;
  const eventValues = [
    req.user.tenantId || null,
    normalizedRecipient,
    tenantFromName || "LawPath SA",
    normalizedTenantFrom
  ];

  try {
    const safeTenantFromName = tenantFromName || "LawPath SA";
    const safeReplyTo = normalizedReplyTo || "Not supplied";
    const smtp = await pool.query("select * from platform_smtp_settings where active = true order by updated_at desc limit 1");
    const savedSmtp = smtpFromRow(smtp.rows[0]);
    const info = await sendTransactionalEmail({
      to: normalizedRecipient,
      subject: "LawPath SA email delivery test",
      tenantFromName,
      tenantFromEmail: normalizedTenantFrom,
      replyTo: normalizedReplyTo,
      smtpSettings: savedSmtp,
      text: [
        "This is a LawPath SA email delivery test.",
        "",
        `Tenant display name: ${safeTenantFromName}`,
        `Tenant reply-to: ${safeReplyTo}`,
        "",
        "If you received this message, the platform SMTP transport is working."
      ].join("\n"),
      html: `
        <p>This is a <strong>LawPath SA</strong> email delivery test.</p>
        <p><strong>Tenant display name:</strong> ${escapeHtml(safeTenantFromName)}<br />
        <strong>Tenant reply-to:</strong> ${escapeHtml(safeReplyTo)}</p>
        <p>If you received this message, the platform SMTP transport is working.</p>
      `
    });

    await pool.query(
      `insert into email_events
        (tenant_id, event_type, recipient_email, tenant_from_name, tenant_from_email, status, provider_message_id)
       values ($1, 'test_email', $2, $3, $4, 'sent', $5)`,
      [...eventValues, info.messageId || null]
    );

    res.json({ ok: true, messageId: info.messageId || null });
  } catch (error) {
    await pool.query(
      `insert into email_events
        (tenant_id, event_type, recipient_email, tenant_from_name, tenant_from_email, status, error_message)
       values ($1, 'test_email', $2, $3, $4, 'failed', $5)`,
      [...eventValues, error.message || "Email delivery failed."]
    ).catch((logError) => console.error("Failed to record email event", logError));

    res.status(500).json({ error: error.message || "Email delivery failed." });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// TIER 1: TRUST ACCOUNT
// ─────────────────────────────────────────────────────────────────────────────

function trustTransactionFromRow(row) {
  return {
    id: row.id,
    clientName: row.client_name,
    description: row.description,
    reference: row.reference || "",
    entryType: row.entry_type,
    amountCents: Number(row.amount_cents),
    runningBalanceCents: Number(row.running_balance_cents || 0),
    valueDate: row.value_date ? String(row.value_date).slice(0, 10) : "",
    reconciled: Boolean(row.reconciled)
  };
}

function trustReconFromRow(row) {
  return {
    id: row.id,
    periodMonth: row.period_month,
    bankStatementBalanceCents: Number(row.bank_statement_balance_cents),
    ledgerBalanceCents: Number(row.ledger_balance_cents),
    clientCreditTotalCents: Number(row.client_credit_total_cents),
    status: row.status
  };
}

app.get("/api/trust/ledger", authMiddleware, async (req, res, next) => {
  if (!req.user.tenantId) return res.status(403).json({ error: "Tenant context required." });
  try {
    const [txResult, acctResult] = await Promise.all([
      pool.query(
        `select * from trust_transactions where tenant_id = $1 order by value_date desc, created_at desc limit 80`,
        [req.user.tenantId]
      ),
      pool.query(
        `select coalesce(sum(case when entry_type in ('receipt','transfer_in') then amount_cents else -amount_cents end), 0) as balance
         from trust_transactions where tenant_id = $1`,
        [req.user.tenantId]
      )
    ]);
    res.json({
      transactions: txResult.rows.map(trustTransactionFromRow),
      balanceCents: Number(acctResult.rows[0]?.balance || 0)
    });
  } catch (error) { next(error); }
});

app.post("/api/trust/transactions", authMiddleware, async (req, res, next) => {
  if (!req.user.tenantId) return res.status(403).json({ error: "Tenant context required." });
  const { clientName, description, reference, entryType, amountCents, valueDate } = req.body;
  if (!clientName || !description || !entryType || !amountCents)
    return res.status(400).json({ error: "Client name, description, entry type and amount are required." });
  try {
    const acct = await pool.query(
      `select id from trust_accounts where tenant_id = $1 and active = true limit 1`,
      [req.user.tenantId]
    );
    const accountId = acct.rows[0]?.id;
    if (!accountId) return res.status(400).json({ error: "No active trust account found. Configure one in settings." });

    const result = await pool.query(
      `insert into trust_transactions
        (tenant_id, trust_account_id, client_name, description, reference, entry_type, amount_cents, value_date, created_by)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       returning *`,
      [req.user.tenantId, accountId, clientName, description, reference || null, entryType, Number(amountCents), valueDate || new Date().toISOString().slice(0, 10), req.user.sub]
    );
    await pool.query(
      `insert into activity_log (tenant_id, actor_user_id, entity_type, entity_id, action, details)
       values ($1,$2,'trust_transaction',$3,$4,$5)`,
      [req.user.tenantId, req.user.sub, result.rows[0].id, entryType, { clientName, amountCents }]
    );
    res.status(201).json({ transaction: trustTransactionFromRow(result.rows[0]) });
  } catch (error) { next(error); }
});

app.get("/api/trust/reconciliations", authMiddleware, async (req, res, next) => {
  if (!req.user.tenantId) return res.status(403).json({ error: "Tenant context required." });
  try {
    const result = await pool.query(
      `select r.* from trust_reconciliations r
       join trust_accounts a on a.id = r.trust_account_id
       where a.tenant_id = $1 order by r.period_month desc limit 24`,
      [req.user.tenantId]
    );
    res.json({ reconciliations: result.rows.map(trustReconFromRow) });
  } catch (error) { next(error); }
});

app.post("/api/trust/reconciliations", authMiddleware, async (req, res, next) => {
  if (!req.user.tenantId) return res.status(403).json({ error: "Tenant context required." });
  const { periodMonth, bankStatementBalanceCents, ledgerBalanceCents, clientCreditTotalCents, status, notes } = req.body;
  if (!periodMonth) return res.status(400).json({ error: "Period month is required." });
  try {
    const acct = await pool.query(
      `select id from trust_accounts where tenant_id = $1 and active = true limit 1`,
      [req.user.tenantId]
    );
    const accountId = acct.rows[0]?.id;
    if (!accountId) return res.status(400).json({ error: "No active trust account found." });
    const result = await pool.query(
      `insert into trust_reconciliations
        (tenant_id, trust_account_id, period_month, bank_statement_balance_cents, ledger_balance_cents, client_credit_total_cents, status, notes, reconciled_by, reconciled_at)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9, now())
       on conflict (trust_account_id, period_month) do update set
        bank_statement_balance_cents = excluded.bank_statement_balance_cents,
        ledger_balance_cents = excluded.ledger_balance_cents,
        client_credit_total_cents = excluded.client_credit_total_cents,
        status = excluded.status,
        notes = excluded.notes,
        reconciled_by = excluded.reconciled_by,
        reconciled_at = now()
       returning *`,
      [req.user.tenantId, accountId, periodMonth, Number(bankStatementBalanceCents || 0), Number(ledgerBalanceCents || 0), Number(clientCreditTotalCents || 0), status || "Draft", notes || null, req.user.sub]
    );
    res.status(201).json({ reconciliation: trustReconFromRow(result.rows[0]) });
  } catch (error) { next(error); }
});

// ─────────────────────────────────────────────────────────────────────────────
// TIER 1: FICA / KYC
// ─────────────────────────────────────────────────────────────────────────────

function ficaClientFromRow(row, docs = []) {
  return {
    id: row.id,
    clientName: row.client_name,
    clientType: row.client_type,
    idNumber: row.id_number || "",
    riskRating: row.risk_rating,
    ficaStatus: row.fica_status,
    ficaExpiryDate: row.fica_expiry_date ? String(row.fica_expiry_date).slice(0, 10) : "",
    sourceOfFunds: row.source_of_funds || "",
    sanctionsChecked: Boolean(row.sanctions_checked),
    documents: docs
  };
}

function ficaDocFromRow(row) {
  return {
    id: row.id,
    documentType: row.document_type,
    documentName: row.document_name,
    status: row.status,
    expiryDate: row.expiry_date ? String(row.expiry_date).slice(0, 10) : ""
  };
}

app.get("/api/fica/clients", authMiddleware, async (req, res, next) => {
  if (!req.user.tenantId) return res.status(403).json({ error: "Tenant context required." });
  try {
    const [clients, docs] = await Promise.all([
      pool.query(`select * from fica_clients where tenant_id = $1 order by created_at desc limit 100`, [req.user.tenantId]),
      pool.query(`select * from fica_documents where tenant_id = $1`, [req.user.tenantId])
    ]);
    const docsByClient = {};
    docs.rows.forEach((doc) => {
      if (!docsByClient[doc.fica_client_id]) docsByClient[doc.fica_client_id] = [];
      docsByClient[doc.fica_client_id].push(ficaDocFromRow(doc));
    });
    res.json({ clients: clients.rows.map((row) => ficaClientFromRow(row, docsByClient[row.id] || [])) });
  } catch (error) { next(error); }
});

app.post("/api/fica/clients", authMiddleware, async (req, res, next) => {
  if (!req.user.tenantId) return res.status(403).json({ error: "Tenant context required." });
  const { clientName, clientType, idNumber, riskRating, ficaStatus, sourceOfFunds } = req.body;
  if (!clientName) return res.status(400).json({ error: "Client name is required." });
  try {
    const result = await pool.query(
      `insert into fica_clients (tenant_id, client_name, client_type, id_number, risk_rating, fica_status, source_of_funds, created_by)
       values ($1,$2,$3,$4,$5,$6,$7,$8) returning *`,
      [req.user.tenantId, clientName, clientType || "natural_person", idNumber || null, riskRating || "Low", ficaStatus || "Pending", sourceOfFunds || null, req.user.sub]
    );
    const requiredDocs = buildRequiredFicaDocs(clientType || "natural_person");
    for (const doc of requiredDocs) {
      await pool.query(
        `insert into fica_documents (tenant_id, fica_client_id, document_type, document_name, status) values ($1,$2,$3,$4,'Required')`,
        [req.user.tenantId, result.rows[0].id, doc.type, doc.name]
      );
    }
    const docs = await pool.query(`select * from fica_documents where fica_client_id = $1`, [result.rows[0].id]);
    res.status(201).json({ client: ficaClientFromRow(result.rows[0], docs.rows.map(ficaDocFromRow)) });
  } catch (error) { next(error); }
});

function buildRequiredFicaDocs(clientType) {
  const natural = [
    { type: "identity", name: "Certified ID / Passport copy" },
    { type: "proof_of_address", name: "Proof of residence (not older than 3 months)" },
    { type: "source_of_funds", name: "Source of funds declaration" }
  ];
  const entity = [
    { type: "cipc_cert", name: "CIPC registration certificate" },
    { type: "moi", name: "Memorandum of Incorporation" },
    { type: "directors", name: "Certified ID copies of all directors/members" },
    { type: "proof_of_address", name: "Proof of business address" },
    { type: "source_of_funds", name: "Source of funds declaration" }
  ];
  const trust = [
    { type: "trust_deed", name: "Certified trust deed" },
    { type: "letter_of_authority", name: "Letter of authority (Masters Office)" },
    { type: "trustees_id", name: "Certified ID copies of all trustees" },
    { type: "proof_of_address", name: "Proof of principal address" }
  ];
  return clientType === "legal_entity" ? entity : clientType === "trust" ? trust : natural;
}

app.put("/api/fica/clients/:id", authMiddleware, async (req, res, next) => {
  if (!req.user.tenantId) return res.status(403).json({ error: "Tenant context required." });
  const { riskRating, ficaStatus, sourceOfFunds, sanctionsChecked } = req.body;
  try {
    const result = await pool.query(
      `update fica_clients set
        risk_rating = coalesce($2, risk_rating),
        fica_status = coalesce($3, fica_status),
        source_of_funds = coalesce($4, source_of_funds),
        sanctions_checked = coalesce($5, sanctions_checked),
        sanctions_checked_at = case when $5 = true then now() else sanctions_checked_at end,
        updated_at = now()
       where id = $1 and tenant_id = $6 returning *`,
      [req.params.id, riskRating || null, ficaStatus || null, sourceOfFunds || null, sanctionsChecked !== undefined ? Boolean(sanctionsChecked) : null, req.user.tenantId]
    );
    if (!result.rowCount) return res.status(404).json({ error: "FICA client not found." });
    const docs = await pool.query(`select * from fica_documents where fica_client_id = $1`, [req.params.id]);
    res.json({ client: ficaClientFromRow(result.rows[0], docs.rows.map(ficaDocFromRow)) });
  } catch (error) { next(error); }
});

// ─────────────────────────────────────────────────────────────────────────────
// TIER 1: TIME RECORDING
// ─────────────────────────────────────────────────────────────────────────────

function timeEntryFromRow(row) {
  return {
    id: row.id,
    clientName: row.client_name,
    matterRef: row.matter_ref || "",
    feeEarnerName: row.fee_earner_name,
    entryDate: row.entry_date ? String(row.entry_date).slice(0, 10) : "",
    activityType: row.activity_type,
    description: row.description,
    durationMinutes: Number(row.duration_minutes),
    rateCents: Number(row.rate_cents),
    amountCents: Number(row.amount_cents),
    vatAmountCents: Number(row.vat_amount_cents),
    status: row.status,
    isDisbursement: Boolean(row.is_disbursement)
  };
}

app.get("/api/time/entries", authMiddleware, async (req, res, next) => {
  if (!req.user.tenantId) return res.status(403).json({ error: "Tenant context required." });
  try {
    const [entries, wip] = await Promise.all([
      pool.query(`select * from time_entries where tenant_id = $1 order by entry_date desc, created_at desc limit 200`, [req.user.tenantId]),
      pool.query(`select coalesce(sum(amount_cents),0) as wip from time_entries where tenant_id = $1 and status = 'WIP'`, [req.user.tenantId])
    ]);
    res.json({ entries: entries.rows.map(timeEntryFromRow), wipCents: Number(wip.rows[0]?.wip || 0) });
  } catch (error) { next(error); }
});

app.post("/api/time/entries", authMiddleware, async (req, res, next) => {
  if (!req.user.tenantId) return res.status(403).json({ error: "Tenant context required." });
  const { clientName, matterRef, feeEarnerName, entryDate, activityType, description, durationMinutes, rateCents, amountCents, isDisbursement } = req.body;
  if (!clientName || !description || !feeEarnerName)
    return res.status(400).json({ error: "Client name, description and fee earner are required." });
  const amount = Number(amountCents) || Math.round((Number(durationMinutes) / 60) * Number(rateCents));
  const vat = Math.round(amount * 0.15);
  try {
    const result = await pool.query(
      `insert into time_entries
        (tenant_id, client_name, matter_ref, fee_earner_name, entry_date, activity_type, description,
         duration_minutes, rate_cents, amount_cents, vat_amount_cents, is_disbursement, created_by)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) returning *`,
      [req.user.tenantId, clientName, matterRef || null, feeEarnerName, entryDate || new Date().toISOString().slice(0, 10),
       activityType || "professional_fee", description, Number(durationMinutes || 0),
       Number(rateCents || 0), amount, vat, Boolean(isDisbursement), req.user.sub]
    );
    res.status(201).json({ entry: timeEntryFromRow(result.rows[0]) });
  } catch (error) { next(error); }
});

app.put("/api/time/entries/:id/status", authMiddleware, async (req, res, next) => {
  if (!req.user.tenantId) return res.status(403).json({ error: "Tenant context required." });
  const { status } = req.body;
  const valid = ["WIP", "Billed", "Written off", "On hold"];
  if (!valid.includes(status)) return res.status(400).json({ error: "Invalid status." });
  try {
    const result = await pool.query(
      `update time_entries set status = $2, updated_at = now() where id = $1 and tenant_id = $3 returning *`,
      [req.params.id, status, req.user.tenantId]
    );
    if (!result.rowCount) return res.status(404).json({ error: "Time entry not found." });
    res.json({ entry: timeEntryFromRow(result.rows[0]) });
  } catch (error) { next(error); }
});

// ─────────────────────────────────────────────────────────────────────────────
// TIER 1: POPIA COMPLIANCE
// ─────────────────────────────────────────────────────────────────────────────

function popiaProcessingFromRow(row) {
  return {
    id: row.id,
    processingActivity: row.processing_activity,
    purpose: row.purpose,
    legalBasis: row.legal_basis,
    dataSubjects: row.data_subjects || [],
    personalInfoTypes: row.personal_info_types || [],
    retentionPeriod: row.retention_period,
    thirdPartyRecipients: row.third_party_recipients || "",
    crossBorderTransfer: Boolean(row.cross_border_transfer),
    reviewDate: row.review_date ? String(row.review_date).slice(0, 10) : "",
    active: Boolean(row.active)
  };
}

function popiaDsrFromRow(row) {
  return {
    id: row.id,
    requestType: row.request_type,
    requestorName: row.requestor_name,
    requestorEmail: row.requestor_email,
    description: row.description,
    status: row.status,
    receivedAt: row.received_at,
    dueAt: row.due_at,
    completedAt: row.completed_at || "",
    responseNotes: row.response_notes || ""
  };
}

function popiaBreachFromRow(row) {
  return {
    id: row.id,
    incidentDate: row.incident_date,
    description: row.description,
    dataSubjectsAffected: Number(row.data_subjects_affected),
    severity: row.severity,
    status: row.status,
    regulatorNotified: Boolean(row.regulator_notified),
    remediationSteps: row.remediation_steps || ""
  };
}

app.get("/api/popia/records", authMiddleware, async (req, res, next) => {
  if (!req.user.tenantId) return res.status(403).json({ error: "Tenant context required." });
  try {
    const [proc, dsr, breach] = await Promise.all([
      pool.query(`select * from popia_processing_records where tenant_id = $1 and active = true order by created_at desc`, [req.user.tenantId]),
      pool.query(`select * from popia_dsr_requests where tenant_id = $1 order by received_at desc limit 50`, [req.user.tenantId]),
      pool.query(`select * from popia_breach_incidents where tenant_id = $1 order by incident_date desc limit 20`, [req.user.tenantId])
    ]);
    res.json({
      processingRecords: proc.rows.map(popiaProcessingFromRow),
      dsrRequests: dsr.rows.map(popiaDsrFromRow),
      breachIncidents: breach.rows.map(popiaBreachFromRow)
    });
  } catch (error) { next(error); }
});

app.post("/api/popia/processing", authMiddleware, async (req, res, next) => {
  if (!req.user.tenantId) return res.status(403).json({ error: "Tenant context required." });
  const { processingActivity, purpose, legalBasis, dataSubjects, personalInfoTypes, retentionPeriod, thirdPartyRecipients, crossBorderTransfer, reviewDate } = req.body;
  if (!processingActivity || !purpose || !legalBasis || !retentionPeriod)
    return res.status(400).json({ error: "Activity, purpose, legal basis and retention period are required." });
  try {
    const result = await pool.query(
      `insert into popia_processing_records
        (tenant_id, processing_activity, purpose, legal_basis, data_subjects, personal_info_types, retention_period, third_party_recipients, cross_border_transfer, review_date, created_by)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) returning *`,
      [req.user.tenantId, processingActivity, purpose, legalBasis, dataSubjects || [], personalInfoTypes || [], retentionPeriod,
       thirdPartyRecipients || null, Boolean(crossBorderTransfer), reviewDate || null, req.user.sub]
    );
    res.status(201).json({ record: popiaProcessingFromRow(result.rows[0]) });
  } catch (error) { next(error); }
});

app.post("/api/popia/dsr", authMiddleware, async (req, res, next) => {
  if (!req.user.tenantId) return res.status(403).json({ error: "Tenant context required." });
  const { requestType, requestorName, requestorEmail, description } = req.body;
  if (!requestType || !requestorName || !requestorEmail || !description)
    return res.status(400).json({ error: "Request type, requestor name, email and description are required." });
  try {
    const result = await pool.query(
      `insert into popia_dsr_requests (tenant_id, request_type, requestor_name, requestor_email, description, due_at)
       values ($1,$2,$3,$4,$5, now() + interval '30 days') returning *`,
      [req.user.tenantId, requestType, requestorName, requestorEmail.toLowerCase(), description]
    );
    res.status(201).json({ request: popiaDsrFromRow(result.rows[0]) });
  } catch (error) { next(error); }
});

app.put("/api/popia/dsr/:id/status", authMiddleware, async (req, res, next) => {
  if (!req.user.tenantId) return res.status(403).json({ error: "Tenant context required." });
  const { status, responseNotes } = req.body;
  try {
    const result = await pool.query(
      `update popia_dsr_requests set
        status = $2,
        response_notes = coalesce($3, response_notes),
        completed_at = case when $2 in ('Completed','Denied') then now() else completed_at end,
        updated_at = now()
       where id = $1 and tenant_id = $4 returning *`,
      [req.params.id, status, responseNotes || null, req.user.tenantId]
    );
    if (!result.rowCount) return res.status(404).json({ error: "DSR request not found." });
    res.json({ request: popiaDsrFromRow(result.rows[0]) });
  } catch (error) { next(error); }
});

app.post("/api/popia/breach", authMiddleware, async (req, res, next) => {
  if (!req.user.tenantId) return res.status(403).json({ error: "Tenant context required." });
  const { incidentDate, description, dataSubjectsAffected, personalInfoTypes, severity, remediationSteps } = req.body;
  if (!incidentDate || !description)
    return res.status(400).json({ error: "Incident date and description are required." });
  try {
    const result = await pool.query(
      `insert into popia_breach_incidents
        (tenant_id, incident_date, description, data_subjects_affected, personal_info_types, severity, remediation_steps, reported_by)
       values ($1,$2,$3,$4,$5,$6,$7,$8) returning *`,
      [req.user.tenantId, incidentDate, description, Number(dataSubjectsAffected || 0), personalInfoTypes || [], severity || "Low", remediationSteps || null, req.user.sub]
    );
    res.status(201).json({ incident: popiaBreachFromRow(result.rows[0]) });
  } catch (error) { next(error); }
});

// ─── CONVEYANCING PIPELINE ───────────────────────────────────────────────────

const CONV_STAGES = [
  { stage: "instruction_received", label: "Instruction received" },
  { stage: "fica_verification", label: "FICA verification" },
  { stage: "bond_cancellation_instructions", label: "Bond cancellation instructions" },
  { stage: "draft_deeds", label: "Draft deeds prepared" },
  { stage: "sars_transfer_duty", label: "SARS transfer duty" },
  { stage: "rates_clearance", label: "Rates clearance" },
  { stage: "levy_clearance", label: "Levy clearance" },
  { stage: "deeds_lodgement", label: "Deeds lodgement" },
  { stage: "deeds_registration", label: "Deeds registration" },
  { stage: "completed", label: "Completed" }
];

function buildDefaultStages(currentStage) {
  const currentIdx = CONV_STAGES.findIndex(s => s.stage === currentStage);
  return CONV_STAGES.map((s, i) => ({
    stage: s.stage, label: s.label,
    status: i < currentIdx ? "completed" : i === currentIdx ? "in_progress" : "pending",
    completedAt: "", notes: ""
  }));
}

function convMatterFromRow(row) {
  return {
    id: row.id, matterRef: row.matter_ref, matterType: row.matter_type,
    sellerName: row.seller_name, buyerName: row.buyer_name,
    propertyDescription: row.property_description, erfNumber: row.erf_number || "",
    purchasePriceCents: Number(row.purchase_price_cents),
    transferDutyCents: Number(row.transfer_duty_cents),
    conveyancingFeeCents: Number(row.conveyancing_fee_cents),
    vatOnFeeCents: Number(row.vat_on_fee_cents),
    estateAgent: row.estate_agent || "", bondBank: row.bond_bank || "",
    currentStage: row.current_stage, ficaStatus: row.fica_status,
    ratesClearanceStatus: row.rates_clearance_status,
    levyClearanceStatus: row.levy_clearance_status,
    ratesClearanceExpiry: row.rates_clearance_expiry ? String(row.rates_clearance_expiry).slice(0, 10) : "",
    levyClearanceExpiry: row.levy_clearance_expiry ? String(row.levy_clearance_expiry).slice(0, 10) : "",
    targetRegistrationDate: row.target_registration_date ? String(row.target_registration_date).slice(0, 10) : "",
    notes: row.notes || "",
    stages: buildDefaultStages(row.current_stage)
  };
}

app.get("/api/conveyancing/matters", authMiddleware, async (req, res, next) => {
  if (!req.user.tenantId) return res.status(403).json({ error: "Tenant context required." });
  try {
    const result = await pool.query(
      "select * from conveyancing_matters where tenant_id = $1 order by created_at desc limit 100",
      [req.user.tenantId]
    );
    res.json({ matters: result.rows.map(convMatterFromRow) });
  } catch (error) { next(error); }
});

app.post("/api/conveyancing/matters", authMiddleware, async (req, res, next) => {
  if (!req.user.tenantId) return res.status(403).json({ error: "Tenant context required." });
  const { matterRef, matterType, sellerName, buyerName, propertyDescription, erfNumber,
    purchasePriceCents, transferDutyCents, conveyancingFeeCents, vatOnFeeCents,
    estateAgent, bondBank, targetRegistrationDate, notes } = req.body;
  if (!matterRef || !sellerName || !buyerName || !propertyDescription)
    return res.status(400).json({ error: "Matter ref, seller, buyer and property description are required." });
  try {
    const result = await pool.query(
      `insert into conveyancing_matters
        (tenant_id, matter_ref, matter_type, seller_name, buyer_name, property_description, erf_number,
         purchase_price_cents, transfer_duty_cents, conveyancing_fee_cents, vat_on_fee_cents,
         estate_agent, bond_bank, target_registration_date, notes, created_by)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16) returning *`,
      [req.user.tenantId, matterRef, matterType || "transfer", sellerName, buyerName, propertyDescription,
       erfNumber || null, Number(purchasePriceCents || 0), Number(transferDutyCents || 0),
       Number(conveyancingFeeCents || 0), Number(vatOnFeeCents || 0),
       estateAgent || null, bondBank || null, targetRegistrationDate || null, notes || null, req.user.sub]
    );
    await pool.query(
      "insert into activity_log (tenant_id, actor_user_id, entity_type, entity_id, action, details) values ($1,$2,'conveyancing_matter',$3,'created',$4)",
      [req.user.tenantId, req.user.sub, result.rows[0].id, { matterRef, sellerName, buyerName }]
    );
    res.status(201).json({ matter: convMatterFromRow(result.rows[0]) });
  } catch (error) { next(error); }
});

app.put("/api/conveyancing/matters/:id/stage", authMiddleware, async (req, res, next) => {
  if (!req.user.tenantId) return res.status(403).json({ error: "Tenant context required." });
  const { stage, notes } = req.body;
  if (!stage) return res.status(400).json({ error: "Stage is required." });
  try {
    const result = await pool.query(
      `update conveyancing_matters set current_stage = $2, notes = coalesce($3, notes), updated_at = now()
       where id = $1 and tenant_id = $4 returning *`,
      [req.params.id, stage, notes || null, req.user.tenantId]
    );
    if (!result.rowCount) return res.status(404).json({ error: "Matter not found." });
    await pool.query(
      `insert into conveyancing_stage_records (tenant_id, matter_id, stage, status, notes, completed_by, completed_at)
       values ($1,$2,$3,'completed',$4,$5,now())
       on conflict do nothing`,
      [req.user.tenantId, req.params.id, stage, notes || null, req.user.sub]
    );
    res.json({ matter: convMatterFromRow(result.rows[0]) });
  } catch (error) { next(error); }
});

app.put("/api/conveyancing/matters/:id/clearances", authMiddleware, async (req, res, next) => {
  if (!req.user.tenantId) return res.status(403).json({ error: "Tenant context required." });
  const { ratesClearanceStatus, levyClearanceStatus, ratesClearanceExpiry, levyClearanceExpiry, ficaStatus } = req.body;
  try {
    const result = await pool.query(
      `update conveyancing_matters set
        rates_clearance_status = coalesce($2, rates_clearance_status),
        levy_clearance_status = coalesce($3, levy_clearance_status),
        rates_clearance_expiry = coalesce($4, rates_clearance_expiry),
        levy_clearance_expiry = coalesce($5, levy_clearance_expiry),
        fica_status = coalesce($6, fica_status),
        updated_at = now()
       where id = $1 and tenant_id = $7 returning *`,
      [req.params.id, ratesClearanceStatus || null, levyClearanceStatus || null,
       ratesClearanceExpiry || null, levyClearanceExpiry || null, ficaStatus || null, req.user.tenantId]
    );
    if (!result.rowCount) return res.status(404).json({ error: "Matter not found." });
    res.json({ matter: convMatterFromRow(result.rows[0]) });
  } catch (error) { next(error); }
});

// ─── LITIGATION PIPELINE ─────────────────────────────────────────────────────

function litDeadlineFromRow(row) {
  return { id: row.id, description: row.description, ruleReference: row.rule_reference || "",
    dueDate: row.due_date ? String(row.due_date).slice(0, 10) : "",
    daysFromService: Number(row.days_from_service || 0),
    completed: Boolean(row.completed), priority: row.priority };
}

function courtDateFromRow(row) {
  return { id: row.id, courtDate: row.court_date ? String(row.court_date).slice(0, 10) : "",
    courtTime: row.court_time || "", court: row.court, purpose: row.purpose,
    rollType: row.roll_type, outcome: row.outcome || "",
    postponedTo: row.postponed_to ? String(row.postponed_to).slice(0, 10) : "" };
}

function costOrderFromRow(row) {
  return { id: row.id, orderDate: row.order_date ? String(row.order_date).slice(0, 10) : "",
    orderType: row.order_type, inFavourOf: row.in_favour_of,
    amountCents: Number(row.amount_cents || 0), scale: row.scale || "", notes: row.notes || "" };
}

function litMatterFromRow(row, deadlines, courtDates, costOrders) {
  return {
    id: row.id, matterRef: row.matter_ref, caseNumber: row.case_number || "",
    court: row.court, courtDivision: row.court_division || "",
    plaintiff: row.plaintiff, defendant: row.defendant,
    matterType: row.matter_type, currentStage: row.current_stage,
    claimAmountCents: Number(row.claim_amount_cents || 0),
    costsRecoveredCents: Number(row.costs_recovered_cents || 0),
    status: row.status,
    serviceDate: row.service_date ? String(row.service_date).slice(0, 10) : "",
    notes: row.notes || "",
    deadlines: deadlines || [], courtDates: courtDates || [], costOrders: costOrders || []
  };
}

app.get("/api/litigation/matters", authMiddleware, async (req, res, next) => {
  if (!req.user.tenantId) return res.status(403).json({ error: "Tenant context required." });
  try {
    const [matters, deadlines, courtDates, costOrders] = await Promise.all([
      pool.query("select * from litigation_matters where tenant_id = $1 order by created_at desc limit 100", [req.user.tenantId]),
      pool.query("select * from litigation_deadlines where tenant_id = $1 order by due_date", [req.user.tenantId]),
      pool.query("select * from court_dates where tenant_id = $1 order by court_date", [req.user.tenantId]),
      pool.query("select * from cost_orders where tenant_id = $1 order by order_date desc", [req.user.tenantId])
    ]);
    const result = matters.rows.map(m => litMatterFromRow(m,
      deadlines.rows.filter(d => d.matter_id === m.id).map(litDeadlineFromRow),
      courtDates.rows.filter(d => d.matter_id === m.id).map(courtDateFromRow),
      costOrders.rows.filter(d => d.matter_id === m.id).map(costOrderFromRow)
    ));
    res.json({ matters: result });
  } catch (error) { next(error); }
});

app.post("/api/litigation/matters", authMiddleware, async (req, res, next) => {
  if (!req.user.tenantId) return res.status(403).json({ error: "Tenant context required." });
  const { matterRef, caseNumber, court, courtDivision, plaintiff, defendant, matterType,
    claimAmountCents, serviceDate, notes } = req.body;
  if (!matterRef || !court || !plaintiff || !defendant)
    return res.status(400).json({ error: "Matter ref, court, plaintiff and defendant are required." });
  try {
    const result = await pool.query(
      `insert into litigation_matters
        (tenant_id, matter_ref, case_number, court, court_division, plaintiff, defendant,
         matter_type, claim_amount_cents, service_date, notes, created_by)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) returning *`,
      [req.user.tenantId, matterRef, caseNumber || null, court, courtDivision || null,
       plaintiff, defendant, matterType || "opposed_motion",
       Number(claimAmountCents || 0), serviceDate || null, notes || null, req.user.sub]
    );
    res.status(201).json({ matter: litMatterFromRow(result.rows[0], [], [], []) });
  } catch (error) { next(error); }
});

app.post("/api/litigation/matters/:id/deadlines", authMiddleware, async (req, res, next) => {
  if (!req.user.tenantId) return res.status(403).json({ error: "Tenant context required." });
  const { description, ruleReference, dueDate, daysFromService, priority } = req.body;
  if (!description || !dueDate) return res.status(400).json({ error: "Description and due date are required." });
  try {
    const result = await pool.query(
      `insert into litigation_deadlines (tenant_id, matter_id, description, rule_reference, due_date, days_from_service, priority)
       values ($1,$2,$3,$4,$5,$6,$7) returning *`,
      [req.user.tenantId, req.params.id, description, ruleReference || null,
       dueDate, Number(daysFromService || 0), priority || "Normal"]
    );
    res.status(201).json({ deadline: litDeadlineFromRow(result.rows[0]) });
  } catch (error) { next(error); }
});

app.put("/api/litigation/matters/:id/deadlines/:deadlineId/complete", authMiddleware, async (req, res, next) => {
  if (!req.user.tenantId) return res.status(403).json({ error: "Tenant context required." });
  try {
    const result = await pool.query(
      `update litigation_deadlines set completed = true, completed_at = now(), completed_by = $3
       where id = $1 and tenant_id = $2 returning *`,
      [req.params.deadlineId, req.user.tenantId, req.user.sub]
    );
    if (!result.rowCount) return res.status(404).json({ error: "Deadline not found." });
    res.json({ deadline: litDeadlineFromRow(result.rows[0]) });
  } catch (error) { next(error); }
});

app.post("/api/litigation/matters/:id/court-dates", authMiddleware, async (req, res, next) => {
  if (!req.user.tenantId) return res.status(403).json({ error: "Tenant context required." });
  const { courtDate, courtTime, court, purpose, rollType, outcome, postponedTo } = req.body;
  if (!courtDate || !court || !purpose) return res.status(400).json({ error: "Court date, court and purpose are required." });
  try {
    const result = await pool.query(
      `insert into court_dates (tenant_id, matter_id, court_date, court_time, court, purpose, roll_type, outcome, postponed_to)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9) returning *`,
      [req.user.tenantId, req.params.id, courtDate, courtTime || null, court, purpose,
       rollType || "Unopposed", outcome || null, postponedTo || null]
    );
    res.status(201).json({ courtDate: courtDateFromRow(result.rows[0]) });
  } catch (error) { next(error); }
});

app.post("/api/litigation/matters/:id/cost-orders", authMiddleware, async (req, res, next) => {
  if (!req.user.tenantId) return res.status(403).json({ error: "Tenant context required." });
  const { orderDate, orderType, inFavourOf, amountCents, scale, notes } = req.body;
  if (!orderDate || !orderType || !inFavourOf) return res.status(400).json({ error: "Order date, type and party are required." });
  try {
    const result = await pool.query(
      `insert into cost_orders (tenant_id, matter_id, order_date, order_type, in_favour_of, amount_cents, scale, notes)
       values ($1,$2,$3,$4,$5,$6,$7,$8) returning *`,
      [req.user.tenantId, req.params.id, orderDate, orderType, inFavourOf,
       Number(amountCents || 0), scale || null, notes || null]
    );
    res.status(201).json({ costOrder: costOrderFromRow(result.rows[0]) });
  } catch (error) { next(error); }
});

// ─── MATTERS / CONTRACTS / TASKS / APPOINTMENTS / ACTIVITY ───────────────────

function matterFromRow(r) {
  return {
    id: r.matter_number,
    title: r.title || "",
    client: r.client_name || "",
    matterType: r.matter_type || "",
    role: r.client_role || "",
    property: r.property_address || "",
    estateAgent: r.estate_agent_name || "",
    stage: r.stage || "Intake",
    progress: Number(r.progress || 0),
    nextStep: r.next_step || "",
    due: r.due_date ? new Date(r.due_date).toISOString().slice(0, 10) : "",
    portalAccess: Boolean(r.portal_access_enabled),
    risk: r.risk || "Low"
  };
}

app.get("/api/matters", authMiddleware, async (req, res, next) => {
  if (!req.user.tenantId) return res.status(403).json({ error: "Tenant context required." });
  try {
    const result = await pool.query(
      "select * from matters where tenant_id = $1 order by updated_at desc limit 200",
      [req.user.tenantId]
    );
    res.json({ matters: result.rows.map(matterFromRow) });
  } catch (error) { next(error); }
});

app.post("/api/matters", authMiddleware, async (req, res, next) => {
  if (!req.user.tenantId) return res.status(403).json({ error: "Tenant context required." });
  const { title, client, matterType, role, property, estateAgent, stage, progress, nextStep, due, portalAccess, risk } = req.body;
  if (!title) return res.status(400).json({ error: "Title is required." });
  try {
    const matterNumber = `M-${Math.floor(100000 + Math.random() * 900000)}`;
    const result = await pool.query(
      `insert into matters
        (tenant_id, matter_number, title, client_name, client_role, matter_type, property_address, estate_agent_name,
         stage, progress, next_step, due_date, risk, portal_access_enabled, created_by)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) returning *`,
      [req.user.tenantId, matterNumber, title, client || null, role || null, matterType || null,
       property || null, estateAgent || null, stage || "Intake", Number(progress || 0),
       nextStep || null, due || null, risk || "Low", Boolean(portalAccess), req.user.sub]
    );
    res.status(201).json({ matter: matterFromRow(result.rows[0]) });
  } catch (error) { next(error); }
});

function contractFromRow(r) {
  return {
    id: r.id,
    name: r.name || "",
    category: r.category || "",
    partyA: r.party_a || "",
    partyB: r.party_b || "",
    status: r.status || "Draft",
    updated: r.updated_at ? new Date(r.updated_at).toISOString().slice(0, 10) : "",
    body: r.body || ""
  };
}

app.get("/api/contracts", authMiddleware, async (req, res, next) => {
  if (!req.user.tenantId) return res.status(403).json({ error: "Tenant context required." });
  try {
    const result = await pool.query(
      "select * from contract_drafts where tenant_id = $1 order by updated_at desc limit 200",
      [req.user.tenantId]
    );
    res.json({ contracts: result.rows.map(contractFromRow) });
  } catch (error) { next(error); }
});

app.post("/api/contracts", authMiddleware, async (req, res, next) => {
  if (!req.user.tenantId) return res.status(403).json({ error: "Tenant context required." });
  const { name, category, partyA, partyB, status, body } = req.body;
  if (!name) return res.status(400).json({ error: "Name is required." });
  try {
    const result = await pool.query(
      `insert into contract_drafts (tenant_id, name, category, party_a, party_b, status, body, created_by)
       values ($1,$2,$3,$4,$5,$6,$7,$8) returning *`,
      [req.user.tenantId, name, category || null, partyA || null, partyB || null,
       status || "Draft", body || null, req.user.sub]
    );
    res.status(201).json({ contract: contractFromRow(result.rows[0]) });
  } catch (error) { next(error); }
});

function taskFromRow(r) {
  return {
    id: r.id,
    title: r.title || "",
    owner: r.owner_label || "",
    due: r.due_at ? new Date(r.due_at).toISOString().slice(0, 10) : "",
    done: Boolean(r.done),
    priority: r.priority || "Normal"
  };
}

app.get("/api/tasks", authMiddleware, async (req, res, next) => {
  if (!req.user.tenantId) return res.status(403).json({ error: "Tenant context required." });
  try {
    const result = await pool.query(
      "select * from work_tasks where tenant_id = $1 order by created_at desc limit 200",
      [req.user.tenantId]
    );
    res.json({ tasks: result.rows.map(taskFromRow) });
  } catch (error) { next(error); }
});

app.post("/api/tasks", authMiddleware, async (req, res, next) => {
  if (!req.user.tenantId) return res.status(403).json({ error: "Tenant context required." });
  const { title, owner, due, priority } = req.body;
  if (!title) return res.status(400).json({ error: "Title is required." });
  try {
    const result = await pool.query(
      `insert into work_tasks (tenant_id, title, owner_label, due_at, priority, created_by)
       values ($1,$2,$3,$4,$5,$6) returning *`,
      [req.user.tenantId, title, owner || null, due || null, priority || "Normal", req.user.sub]
    );
    res.status(201).json({ task: taskFromRow(result.rows[0]) });
  } catch (error) { next(error); }
});

app.put("/api/tasks/:id/done", authMiddleware, async (req, res, next) => {
  if (!req.user.tenantId) return res.status(403).json({ error: "Tenant context required." });
  const { done } = req.body;
  try {
    const result = await pool.query(
      `update work_tasks set done = $3, completed_at = case when $3 then now() else null end, updated_at = now()
       where id = $1 and tenant_id = $2 returning *`,
      [req.params.id, req.user.tenantId, Boolean(done)]
    );
    if (!result.rowCount) return res.status(404).json({ error: "Task not found." });
    res.json({ task: taskFromRow(result.rows[0]) });
  } catch (error) { next(error); }
});

function appointmentFromRow(r) {
  return {
    id: r.id,
    title: r.title || "",
    person: r.person_name || "",
    time: r.starts_at ? new Date(r.starts_at).toISOString() : "",
    mode: r.mode || "Office"
  };
}

app.get("/api/appointments", authMiddleware, async (req, res, next) => {
  if (!req.user.tenantId) return res.status(403).json({ error: "Tenant context required." });
  try {
    const result = await pool.query(
      "select * from appointments where tenant_id = $1 order by starts_at desc nulls last limit 200",
      [req.user.tenantId]
    );
    res.json({ appointments: result.rows.map(appointmentFromRow) });
  } catch (error) { next(error); }
});

app.post("/api/appointments", authMiddleware, async (req, res, next) => {
  if (!req.user.tenantId) return res.status(403).json({ error: "Tenant context required." });
  const { title, person, time, mode } = req.body;
  if (!title) return res.status(400).json({ error: "Title is required." });
  try {
    let startsAt = null;
    if (time) {
      const d = new Date(time);
      if (!Number.isNaN(d.getTime())) startsAt = d.toISOString();
    }
    const result = await pool.query(
      `insert into appointments (tenant_id, title, person_name, starts_at, mode, created_by)
       values ($1,$2,$3,$4,$5,$6) returning *`,
      [req.user.tenantId, title, person || null, startsAt, mode || "Office", req.user.sub]
    );
    res.status(201).json({ appointment: appointmentFromRow(result.rows[0]) });
  } catch (error) { next(error); }
});

app.get("/api/activity", authMiddleware, async (req, res, next) => {
  if (!req.user.tenantId) return res.status(403).json({ error: "Tenant context required." });
  try {
    const result = await pool.query(
      `select action, entity_type, created_at from activity_log
       where tenant_id = $1 order by created_at desc limit 20`,
      [req.user.tenantId]
    );
    const activity = result.rows.map(r =>
      r.entity_type ? `${r.action} on ${r.entity_type}` : String(r.action || "")
    );
    res.json({ activity });
  } catch (error) { next(error); }
});

// ─── WHATSAPP ─────────────────────────────────────────────────────────────────

const DEFAULT_WA_TEMPLATES = [
  { name: "Transfer lodged", category: "transfer_update", body: "Good day {{client_name}}, your transfer ({{matter_ref}}) has been lodged at the Deeds Office. Registration is expected within 8-10 working days.", variables: ["client_name", "matter_ref"] },
  { name: "Transfer registered", category: "transfer_update", body: "Congratulations {{client_name}}! Your property transfer ({{matter_ref}}) has been registered. The title deed will be forwarded in due course.", variables: ["client_name", "matter_ref"] },
  { name: "FICA documents required", category: "fica_request", body: "Dear {{client_name}}, we still require FICA documents for matter {{matter_ref}}: {{documents_required}}. Please forward at your earliest convenience.", variables: ["client_name", "matter_ref", "documents_required"] },
  { name: "Appointment reminder", category: "appointment_reminder", body: "Dear {{client_name}}, reminder of your appointment on {{date}} at {{time}}. Please reply to confirm.", variables: ["client_name", "date", "time"] },
  { name: "Payment reminder", category: "payment_reminder", body: "Dear {{client_name}}, invoice {{invoice_number}} for R {{amount}} is outstanding. Please arrange payment.", variables: ["client_name", "invoice_number", "amount"] }
];

// ── WhatsApp Meta Cloud API helpers ──────────────────────────────────────────

async function getWhatsAppSettings() {
  const result = await pool.query(
    "select * from platform_whatsapp_settings where active = true order by updated_at desc limit 1"
  ).catch(() => ({ rows: [] }));
  const row = result.rows[0];
  return {
    provider: row?.provider || null,
    apiKey: row?.api_key || process.env.WHATSAPP_API_KEY || "",
    phoneNumberId: row?.phone_number_id || process.env.WHATSAPP_PHONE_NUMBER_ID || "",
    webhookVerifyToken: row?.webhook_verify_token || process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN || "lawpath-whatsapp-verify",
    configured: Boolean(row?.api_key || process.env.WHATSAPP_API_KEY)
  };
}

// Normalise SA phone numbers to E.164 format (+27...)
function normaliseSAPhone(phone) {
  const digits = String(phone).replace(/\D/g, "");
  if (digits.startsWith("27") && digits.length >= 11) return `+${digits}`;
  if (digits.startsWith("0") && digits.length === 10) return `+27${digits.slice(1)}`;
  if (digits.length >= 9 && !digits.startsWith("27")) return `+27${digits}`;
  return `+${digits}`;
}

async function sendMetaCloudMessage({ apiKey, phoneNumberId, to, messageBody }) {
  const url = `https://graph.facebook.com/v19.0/${phoneNumberId}/messages`;
  const response = await fetch(url, {
    method: "POST",
    headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: normaliseSAPhone(to),
      type: "text",
      text: { preview_url: false, body: messageBody }
    })
  });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error?.message || `Meta API error ${response.status}`);
  return payload;
}

function waContactFromRow(row) {
  return { id: row.id, clientName: row.client_name, phoneNumber: row.phone_number, matterRef: row.matter_ref || "", optIn: Boolean(row.opt_in), optInDate: row.opt_in_date ? new Date(row.opt_in_date).toISOString() : "" };
}

function waMessageFromRow(row) {
  return { id: row.id, contactId: row.contact_id || "", clientName: row.client_name || "", phoneNumber: row.phone_number || "", matterRef: row.matter_ref || "", direction: row.direction, messageBody: row.message_body, templateId: row.template_id || "", status: row.status, sentAt: row.sent_at ? new Date(row.sent_at).toISOString() : "" };
}

function waTemplateFromRow(row) {
  return { id: row.id, name: row.name, category: row.category, body: row.body, variables: row.variables || [] };
}

app.get("/api/whatsapp/data", authMiddleware, async (req, res, next) => {
  if (!req.user.tenantId) return res.status(403).json({ error: "Tenant context required." });
  try {
    let templates = await pool.query("select * from whatsapp_templates where tenant_id = $1 or tenant_id is null order by created_at", [req.user.tenantId]);
    if (!templates.rowCount) {
      for (const t of DEFAULT_WA_TEMPLATES) {
        await pool.query("insert into whatsapp_templates (tenant_id, name, category, body, variables) values ($1,$2,$3,$4,$5) on conflict do nothing", [req.user.tenantId, t.name, t.category, t.body, t.variables]);
      }
      templates = await pool.query("select * from whatsapp_templates where tenant_id = $1", [req.user.tenantId]);
    }
    const [contacts, messages] = await Promise.all([
      pool.query("select * from whatsapp_contacts where tenant_id = $1 order by created_at desc", [req.user.tenantId]),
      pool.query("select m.*, c.client_name, c.phone_number from whatsapp_messages m left join whatsapp_contacts c on c.id = m.contact_id where m.tenant_id = $1 order by m.sent_at desc limit 100", [req.user.tenantId])
    ]);
    res.json({ contacts: contacts.rows.map(waContactFromRow), messages: messages.rows.map(waMessageFromRow), templates: templates.rows.map(waTemplateFromRow) });
  } catch (error) { next(error); }
});

// ── WhatsApp webhook verification (Meta Cloud API challenge-response) ─────────
// Meta sends a GET to verify the webhook. Respond with hub.challenge.
app.get("/api/webhooks/whatsapp", async (req, res) => {
  const { "hub.mode": mode, "hub.verify_token": token, "hub.challenge": challenge } = req.query;
  const waSettings = await getWhatsAppSettings().catch(() => ({ webhookVerifyToken: "" }));
  const verifyToken = waSettings.webhookVerifyToken || process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN || "lawpath-whatsapp-verify";
  if (mode === "subscribe" && token === verifyToken) {
    console.info("[whatsapp webhook] Verification successful");
    return res.status(200).send(challenge);
  }
  console.error("[whatsapp webhook] Verification failed — token mismatch");
  res.status(403).json({ error: "Webhook verification failed." });
});

// ── WhatsApp incoming message webhook (Meta Cloud API) ────────────────────────
app.post("/api/webhooks/whatsapp", async (req, res) => {
  // Always ACK within 20 seconds or Meta will retry and disable the webhook
  res.status(200).json({ status: "ok" });

  try {
    const body = req.body;
    if (body.object !== "whatsapp_business_account") return;

    for (const entry of (body.entry || [])) {
      for (const change of (entry.changes || [])) {
        if (change.field !== "messages") continue;
        const value = change.value || {};
        const messages = value.messages || [];
        const contacts = value.contacts || [];

        for (const msg of messages) {
          if (msg.type !== "text" || !msg.text?.body) continue;
          const from = msg.from; // E.164 without +
          const phoneNumber = `+${from}`;
          const messageBody = msg.text.body;
          const providerMsgId = msg.id;
          const contactName = contacts.find(c => c.wa_id === from)?.profile?.name || "WhatsApp contact";

          // Find or create contact across all tenants that have this phone number
          const existing = await pool.query(
            "select * from whatsapp_contacts where phone_number = $1 limit 1",
            [phoneNumber]
          ).catch(() => ({ rows: [] }));

          let contactId = existing.rows[0]?.id;
          const tenantId = existing.rows[0]?.tenant_id || null;

          if (!contactId && tenantId) {
            const newContact = await pool.query(
              "insert into whatsapp_contacts (tenant_id, client_name, phone_number, opt_in, opt_in_date) values ($1,$2,$3,true,now()) on conflict (tenant_id, phone_number) do update set opt_in=true, opt_in_date=now() returning id",
              [tenantId, contactName, phoneNumber]
            ).catch(() => ({ rows: [] }));
            contactId = newContact.rows[0]?.id;
          }

          if (tenantId) {
            await pool.query(
              "insert into whatsapp_messages (tenant_id, contact_id, direction, message_body, status, provider_msg_id) values ($1,$2,'inbound',$3,'read',$4) on conflict do nothing",
              [tenantId, contactId || null, messageBody, providerMsgId]
            ).catch(err => console.error("[whatsapp inbound] DB error:", err.message));
            console.info(`[whatsapp inbound] ${phoneNumber}: ${messageBody.slice(0, 60)}`);
          }
        }

        // Handle message status updates (delivered, read, failed)
        for (const status of (value.statuses || [])) {
          const newStatus = status.status === "delivered" ? "delivered" : status.status === "read" ? "read" : status.status === "failed" ? "failed" : null;
          if (newStatus && status.id) {
            await pool.query(
              "update whatsapp_messages set status=$2 where provider_msg_id=$1",
              [status.id, newStatus]
            ).catch(() => {});
          }
        }
      }
    }
  } catch (err) {
    console.error("[whatsapp webhook] Processing error:", err.message);
  }
});

// ── GET/PUT platform WhatsApp settings ────────────────────────────────────────
app.get("/api/platform/whatsapp-settings", authMiddleware, async (req, res, next) => {
  if (!requirePlatformSuperAdmin(req, res)) return;
  try {
    const result = await pool.query("select * from platform_whatsapp_settings where active = true order by updated_at desc limit 1");
    const row = result.rows[0];
    res.json({
      provider: row?.provider || "meta_cloud_api",
      apiKey: row?.api_key || "",
      phoneNumberId: row?.phone_number_id || "",
      businessAccountId: row?.business_account_id || "",
      webhookVerifyToken: row?.webhook_verify_token || "lawpath-whatsapp-verify",
      active: Boolean(row?.active),
      configured: Boolean(row?.api_key)
    });
  } catch (error) { next(error); }
});

app.put("/api/platform/whatsapp-settings", authMiddleware, async (req, res, next) => {
  if (!requirePlatformSuperAdmin(req, res)) return;
  const { provider, apiKey, phoneNumberId, businessAccountId, webhookVerifyToken } = req.body;
  try {
    await pool.query("update platform_whatsapp_settings set active = false");
    const result = await pool.query(
      `insert into platform_whatsapp_settings (provider, api_key, phone_number_id, business_account_id, webhook_verify_token, active)
       values ($1,$2,$3,$4,$5,true)
       returning *`,
      [provider || "meta_cloud_api", apiKey || null, phoneNumberId || null, businessAccountId || null, webhookVerifyToken || "lawpath-whatsapp-verify"]
    );
    const row = result.rows[0];
    res.json({ configured: Boolean(row.api_key), provider: row.provider, active: true });
  } catch (error) { next(error); }
});

app.post("/api/whatsapp/send", authMiddleware, async (req, res, next) => {
  if (!req.user.tenantId) return res.status(403).json({ error: "Tenant context required." });
  const { contactId, messageBody, templateId, matterRef } = req.body;
  if (!contactId || !messageBody) return res.status(400).json({ error: "Contact and message body are required." });
  try {
    const contact = await pool.query("select client_name, phone_number from whatsapp_contacts where id = $1", [contactId]);
    const phoneNumber = contact.rows[0]?.phone_number;

    let providerMsgId = null;
    let status = "sent";
    let simulated = false;

    const waSettings = await getWhatsAppSettings();

    // Priority: 1) QR session (whatsapp-web.js)  2) Meta Cloud API  3) Simulation
    const qrStatus = waSession.getSessionStatus(req.user.tenantId);

    if (qrStatus.status === "ready" && phoneNumber) {
      // ── QR session — use connected WhatsApp account ──────────────────────
      try {
        providerMsgId = await waSession.sendMessage(req.user.tenantId, phoneNumber, messageBody);
        status = "sent";
        console.info(`[whatsapp send] QR session → ${phoneNumber}: ${messageBody.slice(0, 60)}`);
      } catch (qrErr) {
        console.error("[whatsapp send] QR session error:", qrErr.message);
        status = "failed";
      }
    } else if (waSettings.configured && waSettings.apiKey && waSettings.phoneNumberId && phoneNumber) {
      // ── Meta Cloud API fallback ───────────────────────────────────────────
      try {
        const metaResult = await sendMetaCloudMessage({
          apiKey: waSettings.apiKey,
          phoneNumberId: waSettings.phoneNumberId,
          to: phoneNumber,
          messageBody
        });
        providerMsgId = metaResult.messages?.[0]?.id || null;
        status = "sent";
        console.info(`[whatsapp send] Meta Cloud API → ${phoneNumber}, msgId: ${providerMsgId}`);
      } catch (apiErr) {
        console.error("[whatsapp send] Meta Cloud API error:", apiErr.message);
        status = "failed";
      }
    } else {
      // ── Simulation mode — no connection active ────────────────────────────
      simulated = true;
      console.info(`[whatsapp send] SIMULATED → ${phoneNumber}: ${messageBody.slice(0, 60)}`);
    }

    const result = await pool.query(
      "insert into whatsapp_messages (tenant_id, contact_id, matter_ref, direction, message_body, template_id, status, provider_msg_id, created_by) values ($1,$2,$3,'outbound',$4,$5,$6,$7,$8) returning *",
      [req.user.tenantId, contactId, matterRef || null, messageBody, templateId || null, status, providerMsgId, req.user.sub]
    );
    const row = { ...result.rows[0], client_name: contact.rows[0]?.client_name || "", phone_number: phoneNumber || "" };
    res.status(201).json({ message: waMessageFromRow(row), simulated, configured: waSettings.configured });
  } catch (error) { next(error); }
});

app.post("/api/whatsapp/contacts", authMiddleware, async (req, res, next) => {
  if (!req.user.tenantId) return res.status(403).json({ error: "Tenant context required." });
  const { clientName, phoneNumber, matterRef, optIn } = req.body;
  if (!clientName || !phoneNumber) return res.status(400).json({ error: "Client name and phone number are required." });
  try {
    const result = await pool.query(
      "insert into whatsapp_contacts (tenant_id, client_name, phone_number, matter_ref, opt_in, opt_in_date) values ($1,$2,$3,$4,$5, case when $5 then now() else null end) on conflict (tenant_id, phone_number) do update set client_name=$2, matter_ref=$4, opt_in=$5, opt_in_date=case when $5 then now() else null end returning *",
      [req.user.tenantId, clientName, phoneNumber, matterRef || null, Boolean(optIn)]
    );
    res.status(201).json({ contact: waContactFromRow(result.rows[0]) });
  } catch (error) { next(error); }
});

// ─── WHATSAPP QR SESSION (whatsapp-web.js) ────────────────────────────────────

app.get("/api/whatsapp/qr-status", authMiddleware, async (req, res, next) => {
  if (!req.user.tenantId) return res.status(403).json({ error: "Tenant context required." });
  try {
    const status = waSession.getSessionStatus(req.user.tenantId);
    res.json(status);
  } catch (error) { next(error); }
});

app.post("/api/whatsapp/connect", authMiddleware, async (req, res, next) => {
  if (!req.user.tenantId) return res.status(403).json({ error: "Tenant context required." });
  const allowedRoles = ["platform_super_admin", "tenant_admin"];
  if (!allowedRoles.includes(req.user.role)) {
    return res.status(403).json({ error: "Only tenant admins can connect WhatsApp." });
  }
  try {
    await waSession.initSession(req.user.tenantId);
    res.json({ ok: true, message: "WhatsApp session initialising. Scan the QR code when it appears." });
  } catch (error) {
    res.status(503).json({ error: error.message });
  }
});

app.post("/api/whatsapp/disconnect", authMiddleware, async (req, res, next) => {
  if (!req.user.tenantId) return res.status(403).json({ error: "Tenant context required." });
  const allowedRoles = ["platform_super_admin", "tenant_admin"];
  if (!allowedRoles.includes(req.user.role)) {
    return res.status(403).json({ error: "Only tenant admins can disconnect WhatsApp." });
  }
  try {
    await waSession.disconnectSession(req.user.tenantId);
    res.json({ ok: true });
  } catch (error) { next(error); }
});

// ─── CIPC SEARCH ─────────────────────────────────────────────────────────────

app.get("/api/cipc/search", authMiddleware, async (req, res, next) => {
  if (!req.user.tenantId) return res.status(403).json({ error: "Tenant context required." });
  const q = String(req.query.q || "").trim();
  if (!q) return res.status(400).json({ error: "Search query is required." });
  try {
    const cached = await pool.query("select * from cipc_search_cache where lower(company_name) like $1 or registration_number = $2 limit 5", [`%${q.toLowerCase()}%`, q]);
    if (cached.rowCount) {
      return res.json({ results: cached.rows.map(r => ({ registrationNumber: r.registration_number, companyName: r.company_name, companyType: r.company_type, status: r.status, registrationDate: r.registration_date ? String(r.registration_date).slice(0,10) : "", directors: r.directors || [] })), cached: true, note: "Results from cache." });
    }
    const year = new Date().getFullYear();
    const regNum = `${year}/${Math.floor(Math.random() * 900000 + 100000)}/07`;
    const simulated = [{ registrationNumber: regNum, companyName: q.toUpperCase().replace(/\b\w/g, l => l) + " (Pty) Ltd", companyType: "Private Company (Pty) Ltd", status: "Active", registrationDate: "2019-03-15", directors: [{ name: "SIMULATED DIRECTOR", idNumber: "800101****083", appointmentDate: "2019-03-15", status: "Active" }] }];
    await pool.query("insert into cipc_search_cache (registration_number, company_name, company_type, status, registration_date, directors, searched_by) values ($1,$2,$3,$4,$5,$6,$7) on conflict (registration_number) do nothing", [regNum, simulated[0].companyName, "Private Company", "Active", "2019-03-15", JSON.stringify(simulated[0].directors), req.user.sub]);
    res.json({ results: simulated, cached: false, note: "Live CIPC API integration requires a registered data provider (e.g. Lightstone, LexisNexis DataSec). Results shown are simulated." });
  } catch (error) { next(error); }
});

// ─── DOCUMENT INTELLIGENCE ───────────────────────────────────────────────────

function docAnalysisFromRow(row) {
  return { id: row.id, fileName: row.file_name, documentType: row.document_type || "", analysisStatus: row.analysis_status, parties: row.parties || [], keyDates: row.key_dates || [], obligations: row.obligations || [], riskFlags: row.risk_flags || [], saLawFlags: row.sa_law_flags || [], summary: row.summary || "", analysedAt: row.analysed_at ? new Date(row.analysed_at).toISOString() : "" };
}

app.get("/api/documents/analyses", authMiddleware, async (req, res, next) => {
  if (!req.user.tenantId) return res.status(403).json({ error: "Tenant context required." });
  try {
    const result = await pool.query("select * from document_analyses where tenant_id = $1 order by created_at desc limit 50", [req.user.tenantId]);
    res.json({ analyses: result.rows.map(docAnalysisFromRow) });
  } catch (error) { next(error); }
});

// Decode a data: URL into { buffer, mimeType }. Returns null for malformed
// or non-base64 inputs. Used by the document analyser to recover the raw
// upload bytes before extraction.
function decodeDataUrl(dataUrl) {
  if (typeof dataUrl !== "string" || !dataUrl.startsWith("data:")) return null;
  const m = dataUrl.match(/^data:([^;,]+);base64,(.+)$/);
  if (!m) return null;
  try {
    return { mimeType: m[1], buffer: Buffer.from(m[2], "base64") };
  } catch {
    return null;
  }
}

// Extract text from common SA legal document uploads. PDF / DOCX text
// extraction would require pdf-parse / mammoth (not installed) — for now
// those return null and the caller falls back to a helpful "unsupported
// format" status instead of producing an empty Complete analysis.
function extractDocumentText(buffer, mimeType, fileName) {
  if (!buffer) return { text: "", reason: "no_buffer" };
  const name = (fileName || "").toLowerCase();
  const mt = (mimeType || "").toLowerCase();
  const isTextLike =
    mt.startsWith("text/") ||
    mt === "application/json" ||
    name.endsWith(".txt") ||
    name.endsWith(".md") ||
    name.endsWith(".csv") ||
    name.endsWith(".html") ||
    name.endsWith(".htm");
  if (isTextLike) {
    let text = buffer.toString("utf8");
    if (mt.includes("html") || name.endsWith(".html") || name.endsWith(".htm")) {
      text = htmlToText(text);
    }
    return { text: text.slice(0, 80_000), reason: "ok" };
  }
  return { text: "", reason: "unsupported_format" };
}

app.post("/api/documents/analyse", authMiddleware, async (req, res, next) => {
  if (!req.user.tenantId) return res.status(403).json({ error: "Tenant context required." });
  const { fileName, fileDataUrl, matterRef } = req.body;
  if (!fileName) return res.status(400).json({ error: "File name is required." });
  try {
    const result = await pool.query(
      "insert into document_analyses (tenant_id, file_name, analysis_status, created_by) values ($1,$2,'Queued',$3) returning *",
      [req.user.tenantId, fileName, req.user.sub]
    );
    const analysis = result.rows[0];
    const { apiKey, model } = await getOpenAiSettings();

    if (!apiKey) {
      await pool.query(
        "update document_analyses set analysis_status='Failed', summary=$2 where id=$1",
        [analysis.id, "No OpenAI API key configured on the platform. Ask your administrator to add one under Settings → API keys."]
      );
      const refreshed = await pool.query("select * from document_analyses where id=$1", [analysis.id]);
      return res.status(201).json({ analysis: docAnalysisFromRow(refreshed.rows[0]) });
    }

    // Decode and extract text up front so we can give the user a useful
    // error before we even spend an AI call on an unanalysable file.
    const decoded = decodeDataUrl(fileDataUrl);
    const { text, reason } = extractDocumentText(decoded?.buffer, decoded?.mimeType, fileName);

    if (reason === "unsupported_format") {
      await pool.query(
        "update document_analyses set analysis_status='Failed', summary=$2 where id=$1",
        [analysis.id, "PDF and DOCX text extraction is not yet enabled on the server. Convert the document to TXT or MD and upload it again."]
      );
      const refreshed = await pool.query("select * from document_analyses where id=$1", [analysis.id]);
      return res.status(201).json({ analysis: docAnalysisFromRow(refreshed.rows[0]) });
    }

    if (!text.trim()) {
      await pool.query(
        "update document_analyses set analysis_status='Failed', summary=$2 where id=$1",
        [analysis.id, "Could not read any text from the uploaded file. Check that the file is not empty and try again."]
      );
      const refreshed = await pool.query("select * from document_analyses where id=$1", [analysis.id]);
      return res.status(201).json({ analysis: docAnalysisFromRow(refreshed.rows[0]) });
    }

    // Fire-and-forget. The frontend will see the new record on its next
    // refresh of the analyses list.
    (async () => {
      try {
        await pool.query("update document_analyses set analysis_status='Analysing' where id=$1", [analysis.id]);
        const prompt = `You are analysing a South African legal document. Return ONLY valid JSON (no prose, no markdown fences) with these exact fields:
- documentType (short string, e.g. "Sale of Land Agreement", "Lease", "Notice of Motion")
- parties (string array of party names)
- keyDates (array of { label: string, date: string } — date in ISO YYYY-MM-DD if possible)
- obligations (string array; each item is one concrete obligation in plain English)
- riskFlags (string array of concerning clauses or risks)
- saLawFlags (string array of SA-specific concerns: voetstoots, CPA cooling-off, NCA compliance, POPIA obligations, FICA, etc.)
- summary (2–3 sentence plain English summary)

Document filename: ${fileName}

Document content:
"""
${text}
"""`;
        const aiRes = await fetch("https://api.openai.com/v1/responses", {
          method: "POST",
          headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
          body: JSON.stringify({ model, input: [{ role: "user", content: prompt }] })
        });
        const payload = await aiRes.json();
        if (!aiRes.ok) {
          const apiMsg = payload?.error?.message || `HTTP ${aiRes.status}`;
          await pool.query(
            "update document_analyses set analysis_status='Failed', summary=$2 where id=$1",
            [analysis.id, `AI request failed: ${apiMsg}. Check the model name (${model}) and API key under Settings → API keys.`]
          );
          return;
        }
        const aiText = payload.output_text || payload.output?.flatMap(i => i.content || []).map(p => p.text || "").join("") || "";
        const jsonMatch = aiText.match(/\{[\s\S]*\}/);
        if (!jsonMatch) {
          await pool.query(
            "update document_analyses set analysis_status='Failed', summary=$2 where id=$1",
            [analysis.id, "AI did not return structured analysis. Try a different model under Settings → API keys, or re-upload the document."]
          );
          return;
        }
        let parsed;
        try { parsed = JSON.parse(jsonMatch[0]); } catch { parsed = {}; }

        const hasContent =
          (parsed.summary && String(parsed.summary).trim()) ||
          (Array.isArray(parsed.parties) && parsed.parties.length > 0) ||
          (Array.isArray(parsed.keyDates) && parsed.keyDates.length > 0) ||
          (Array.isArray(parsed.obligations) && parsed.obligations.length > 0) ||
          (Array.isArray(parsed.riskFlags) && parsed.riskFlags.length > 0) ||
          (Array.isArray(parsed.saLawFlags) && parsed.saLawFlags.length > 0);

        if (!hasContent) {
          await pool.query(
            "update document_analyses set analysis_status='Failed', summary=$2 where id=$1",
            [analysis.id, "AI returned an empty analysis. The document may be too short or unclear for extraction — try uploading a longer text version."]
          );
          return;
        }

        await pool.query(
          "update document_analyses set analysis_status='Complete', document_type=$2, parties=$3, key_dates=$4, obligations=$5, risk_flags=$6, sa_law_flags=$7, summary=$8, ai_model=$9, analysed_at=now() where id=$1",
          [analysis.id, parsed.documentType || "Unknown", parsed.parties || [], JSON.stringify(parsed.keyDates || []), parsed.obligations || [], parsed.riskFlags || [], parsed.saLawFlags || [], parsed.summary || "", model]
        );
      } catch (e) {
        await pool.query(
          "update document_analyses set analysis_status='Failed', summary=$2 where id=$1",
          [analysis.id, `Analysis pipeline error: ${e.message || "Unknown error"}.`]
        );
      }
    })();

    res.status(201).json({ analysis: docAnalysisFromRow(analysis) });
  } catch (error) { next(error); }
});

// ─── ACCOUNTING ───────────────────────────────────────────────────────────────

function acctConnFromRow(row) {
  return { id: row.id, provider: row.provider, connected: Boolean(row.connected), lastSyncAt: row.last_sync_at ? new Date(row.last_sync_at).toISOString() : "", syncStatus: row.sync_status, errorMessage: row.error_message || "" };
}

function acctExportFromRow(row) {
  return { id: row.id, provider: row.provider, exportType: row.export_type, recordCount: Number(row.record_count), status: row.status, exportedAt: row.exported_at ? new Date(row.exported_at).toISOString() : "" };
}

app.get("/api/accounting/data", authMiddleware, async (req, res, next) => {
  if (!req.user.tenantId) return res.status(403).json({ error: "Tenant context required." });
  try {
    for (const provider of ["sage_pastel", "xero", "quickbooks", "csv_export"]) {
      await pool.query("insert into accounting_connections (tenant_id, provider) values ($1,$2) on conflict (tenant_id, provider) do nothing", [req.user.tenantId, provider]);
    }
    const [connections, exportLog] = await Promise.all([
      pool.query("select * from accounting_connections where tenant_id = $1 order by provider", [req.user.tenantId]),
      pool.query("select * from accounting_export_log where tenant_id = $1 order by exported_at desc limit 30", [req.user.tenantId])
    ]);
    res.json({ connections: connections.rows.map(acctConnFromRow), exportLog: exportLog.rows.map(acctExportFromRow) });
  } catch (error) { next(error); }
});

app.post("/api/accounting/connections", authMiddleware, async (req, res, next) => {
  if (!req.user.tenantId) return res.status(403).json({ error: "Tenant context required." });
  const { provider, apiKey, companyId, connected } = req.body;
  if (!provider) return res.status(400).json({ error: "Provider is required." });
  try {
    const result = await pool.query(
      "insert into accounting_connections (tenant_id, provider, api_key, company_id, connected) values ($1,$2,$3,$4,$5) on conflict (tenant_id, provider) do update set api_key=excluded.api_key, company_id=excluded.company_id, connected=excluded.connected, updated_at=now() returning *",
      [req.user.tenantId, provider, apiKey || null, companyId || null, Boolean(connected)]
    );
    res.json({ connection: acctConnFromRow(result.rows[0]) });
  } catch (error) { next(error); }
});

app.post("/api/accounting/export", authMiddleware, async (req, res, next) => {
  if (!req.user.tenantId) return res.status(403).json({ error: "Tenant context required." });
  const { provider, exportType } = req.body;
  if (!provider || !exportType) return res.status(400).json({ error: "Provider and export type are required." });
  try {
    let recordCount = 0;
    if (provider === "csv_export" || exportType) {
      const countQ = exportType === "invoice" ? "select count(*) from invoices where tenant_id=$1" : exportType === "trust_receipt" ? "select count(*) from trust_transactions where tenant_id=$1 and entry_type='receipt'" : exportType === "time_entry" ? "select count(*) from time_entries where tenant_id=$1 and status='WIP'" : "select count(*) from invoices where tenant_id=$1";
      const countRes = await pool.query(countQ, [req.user.tenantId]).catch(() => ({ rows: [{ count: 0 }] }));
      recordCount = Number(countRes.rows[0]?.count || 0);
    }
    const result = await pool.query(
      "insert into accounting_export_log (tenant_id, provider, export_type, record_count, status, exported_by) values ($1,$2,$3,$4,'exported',$5) returning *",
      [req.user.tenantId, provider, exportType, recordCount, req.user.sub]
    );
    res.status(201).json({ exportRecord: acctExportFromRow(result.rows[0]) });
  } catch (error) { next(error); }
});

// ─── SA LEGAL RESEARCH DATABASE ──────────────────────────────────────────────

function corpusSourceFromRow(row) {
  return { id: row.id, sourceName: row.source_name, sourceType: row.source_type, courtOrBody: row.court_or_body || "", indexStatus: row.index_status, documentCount: Number(row.document_count), lastIndexedAt: row.last_indexed_at ? new Date(row.last_indexed_at).toISOString() : "", isPlatformCorpus: Boolean(row.is_platform_corpus) };
}

function corpusDocFromRow(row) {
  return { id: row.id, sourceId: row.source_id, title: row.title, citation: row.citation || "", court: row.court || "", decisionDate: row.decision_date ? String(row.decision_date).slice(0,10) : "", summary: row.summary || "", sourceUrl: row.source_url || "", gcsUri: row.gcs_uri || "", tags: row.tags || [], year: Number(row.year || 0) };
}

const DEFAULT_CORPUS_SOURCES = [
  { sourceName: "SAFLII — Southern African Legal Information Institute", sourceType: "case_law", courtOrBody: "All SA Courts", baseUrl: "https://www.saflii.org", documentCount: 184220, isPlatformCorpus: true },
  { sourceName: "South African Constitution, 1996", sourceType: "constitution", courtOrBody: "Parliament", documentCount: 1, isPlatformCorpus: true },
  { sourceName: "Government Gazette — Acts of Parliament", sourceType: "legislation", courtOrBody: "Government Printer", baseUrl: "https://www.gov.za/documents/acts", documentCount: 4812, isPlatformCorpus: true },
  { sourceName: "Legal Practice Council Rules & Directives", sourceType: "lpc_rules", courtOrBody: "Legal Practice Council", baseUrl: "https://lpc.org.za", documentCount: 48, isPlatformCorpus: true }
];

app.get("/api/research-db/corpus", authMiddleware, async (req, res, next) => {
  if (!req.user.tenantId) return res.status(403).json({ error: "Tenant context required." });
  try {
    let sources = await pool.query("select * from legal_corpus_sources order by document_count desc limit 20");
    if (!sources.rowCount) {
      for (const s of DEFAULT_CORPUS_SOURCES) {
        await pool.query("insert into legal_corpus_sources (source_name, source_type, court_or_body, base_url, document_count, index_status, is_platform_corpus, last_indexed_at) values ($1,$2,$3,$4,$5,'indexed',true,now()) on conflict do nothing", [s.sourceName, s.sourceType, s.courtOrBody, s.baseUrl || null, s.documentCount]);
      }
      sources = await pool.query("select * from legal_corpus_sources order by document_count desc limit 20");
    }
    const [docs, queries] = await Promise.all([
      pool.query("select * from legal_corpus_documents order by indexed_at desc limit 20"),
      pool.query("select * from tenant_research_queries where tenant_id = $1 order by created_at desc limit 10", [req.user.tenantId])
    ]);
    res.json({
      sources: sources.rows.map(corpusSourceFromRow),
      recentDocuments: docs.rows.map(corpusDocFromRow),
      recentQueries: queries.rows.map(r => ({ id: r.id, queryText: r.query_text, resultsCount: Number(r.results_count), aiSummary: r.ai_summary || "", citations: r.citations || [], createdAt: new Date(r.created_at).toISOString() }))
    });
  } catch (error) { next(error); }
});

app.post("/api/research-db/search", authMiddleware, async (req, res, next) => {
  if (!req.user.tenantId) return res.status(403).json({ error: "Tenant context required." });
  const { query } = req.body;
  if (!query) return res.status(400).json({ error: "Query is required." });
  try {
    // Full-text search via generated tsvector; fall back to ILIKE if FTS column missing or no results.
    let docs;
    try {
      docs = await pool.query(
        `select * from legal_corpus_documents
         where content_tsv @@ plainto_tsquery('english', $1)
         order by year desc limit 20`,
        [query]
      );
    } catch {
      docs = { rows: [], rowCount: 0 };
    }
    if (!docs.rowCount) {
      docs = await pool.query(
        `select * from legal_corpus_documents
         where title ilike $1 or summary ilike $1 or citation ilike $1 or full_text_snippet ilike $1
         order by year desc limit 20`,
        [`%${query}%`]
      );
    }
    let aiSummary = `${docs.rowCount} results found in the SA legal corpus for "${query}". Attorney review required before relying on any AI research summary.`;
    const citations = docs.rows.map(d => ({ title: d.title, citation: d.citation || "", url: d.source_url || "" }));
    const { apiKey, model } = await getOpenAiSettings();
    if (apiKey && docs.rowCount > 0) {
      try {
        const res2 = await fetch("https://api.openai.com/v1/responses", { method: "POST", headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" }, body: JSON.stringify({ model, input: [{ role: "user", content: `Summarise the following South African legal research results for the query "${query}" in 2-3 sentences. Cite the most relevant authority. Attorney review required:\n${docs.rows.map(d => `${d.title} ${d.citation}: ${d.summary}`).join("\n")}` }] }) });
        const payload = await res2.json();
        aiSummary = payload.output_text || payload.output?.flatMap(i => i.content || []).map(p => p.text || "").join("") || aiSummary;
      } catch { /* fallback to default summary */ }
    }
    await pool.query("insert into tenant_research_queries (tenant_id, query_text, results_count, ai_summary, citations, created_by) values ($1,$2,$3,$4,$5,$6)", [req.user.tenantId, query, docs.rowCount, aiSummary, JSON.stringify(citations), req.user.sub]);
    res.json({ documents: docs.rows.map(corpusDocFromRow), aiSummary, citations });
  } catch (error) { next(error); }
});

app.get("/api/research-db/documents/:id/text", authMiddleware, async (req, res, next) => {
  if (!req.user.tenantId) return res.status(403).json({ error: "Tenant context required." });
  try {
    const result = await pool.query("select gcs_uri, full_text_snippet, title, citation from legal_corpus_documents where id = $1 limit 1", [req.params.id]);
    if (!result.rowCount) return res.status(404).json({ error: "Document not found." });
    const row = result.rows[0];
    if (row.gcs_uri) {
      const text = await downloadText(row.gcs_uri);
      return res.json({ title: row.title, citation: row.citation || "", text, source: "gcs" });
    }
    if (row.full_text_snippet) {
      return res.json({ title: row.title, citation: row.citation || "", text: row.full_text_snippet, source: "snippet" });
    }
    res.json({ title: row.title, citation: row.citation || "", text: "", source: "none" });
  } catch (error) { next(error); }
});

app.post("/api/research-db/sources/:id/index", authMiddleware, async (req, res, next) => {
  try {
    const result = await pool.query("update legal_corpus_sources set index_status='indexing', updated_at=now() where id=$1 returning *", [req.params.id]);
    if (!result.rowCount) return res.status(404).json({ error: "Source not found." });
    setTimeout(async () => { await pool.query("update legal_corpus_sources set index_status='indexed', last_indexed_at=now() where id=$1", [req.params.id]).catch(() => {}); }, 3000);
    res.json({ source: corpusSourceFromRow(result.rows[0]) });
  } catch (error) { next(error); }
});

// ─── BILLING & INVOICES ──────────────────────────────────────────────────────

function invoiceFromRow(row, lineItems = [], payments = []) {
  return {
    id: row.id,
    invoiceNumber: row.invoice_number,
    clientName: row.client_name,
    clientEmail: row.client_email || "",
    matterRef: row.matter_ref || "",
    subtotalCents: Number(row.subtotal_cents || 0),
    vatCents: Number(row.vat_cents || 0),
    amountCents: Number(row.amount_cents || 0),
    paidCents: Number(row.paid_cents || 0),
    currency: row.currency || "ZAR",
    status: row.status,
    issuedAt: row.issued_at ? String(row.issued_at).slice(0, 10) : "",
    dueAt: row.due_at ? String(row.due_at).slice(0, 10) : "",
    notes: row.notes || "",
    terms: row.terms || "",
    paymentRef: row.payment_ref || "",
    sentAt: row.sent_at ? new Date(row.sent_at).toISOString() : "",
    pdfGcsUri: row.pdf_gcs_uri || "",
    accountingSyncedAt: row.accounting_synced_at ? new Date(row.accounting_synced_at).toISOString() : "",
    accountingProvider: row.accounting_provider || "",
    createdAt: new Date(row.created_at).toISOString(),
    lineItems: lineItems.map(li => ({
      id: li.id, invoiceId: li.invoice_id, timeEntryId: li.time_entry_id || null,
      description: li.description, activityType: li.activity_type || "",
      feeEarnerName: li.fee_earner_name || "", entryDate: li.entry_date ? String(li.entry_date).slice(0, 10) : "",
      durationMinutes: Number(li.duration_minutes || 0), rateCents: Number(li.rate_cents || 0),
      amountCents: Number(li.amount_cents || 0), vatCents: Number(li.vat_cents || 0),
      isDisbursement: Boolean(li.is_disbursement), sortOrder: Number(li.sort_order || 0)
    })),
    payments: payments.map(p => ({
      id: p.id, invoiceId: p.invoice_id, amountCents: Number(p.amount_cents),
      paymentDate: String(p.payment_date).slice(0, 10), paymentMethod: p.payment_method,
      reference: p.reference || "", notes: p.notes || "", createdAt: new Date(p.created_at).toISOString()
    }))
  };
}

async function generateInvoiceNumber(tenantId) {
  const year = new Date().getFullYear();
  const result = await pool.query(
    `select count(*) as cnt from invoices where tenant_id = $1 and invoice_number like $2`,
    [tenantId, `INV-${year}-%`]
  );
  const seq = Number(result.rows[0].cnt) + 1;
  return `INV-${year}-${String(seq).padStart(4, "0")}`;
}

// GET /api/invoices — list invoices for tenant
app.get("/api/invoices", authMiddleware, async (req, res, next) => {
  if (!req.user.tenantId) return res.status(403).json({ error: "Tenant context required." });
  const { status, limit = 50, offset = 0 } = req.query;
  try {
    const where = status ? "and i.status = $2" : "";
    const params = status ? [req.user.tenantId, status] : [req.user.tenantId];
    const invoices = await pool.query(
      `select i.* from invoices i
       where i.tenant_id = $1 ${where}
       order by i.created_at desc
       limit ${Number(limit)} offset ${Number(offset)}`,
      params
    );
    const total = await pool.query(
      `select count(*) from invoices where tenant_id = $1 ${where}`, params
    );
    // Load line items and payments for each invoice
    const ids = invoices.rows.map(r => r.id);
    const [items, pmts] = ids.length ? await Promise.all([
      pool.query("select * from invoice_line_items where invoice_id = any($1) order by sort_order", [ids]),
      pool.query("select * from invoice_payments where invoice_id = any($1) order by payment_date", [ids])
    ]) : [{ rows: [] }, { rows: [] }];

    res.json({
      invoices: invoices.rows.map(r => invoiceFromRow(
        r,
        items.rows.filter(li => li.invoice_id === r.id),
        pmts.rows.filter(p => p.invoice_id === r.id)
      )),
      total: Number(total.rows[0].count)
    });
  } catch (error) { next(error); }
});

// POST /api/invoices — create invoice from WIP time entry IDs
app.post("/api/invoices", authMiddleware, async (req, res, next) => {
  if (!req.user.tenantId) return res.status(403).json({ error: "Tenant context required." });
  const { entryIds = [], clientName, clientEmail, matterRef, dueAt, notes, terms, paymentRef } = req.body;
  if (!clientName) return res.status(400).json({ error: "Client name is required." });
  if (!entryIds.length) return res.status(400).json({ error: "At least one time entry is required." });

  const client = await pool.connect();
  try {
    await client.query("begin");

    // Load the time entries and verify they belong to this tenant and are WIP
    const entries = await client.query(
      `select * from time_entries where id = any($1) and tenant_id = $2 and status = 'WIP'`,
      [entryIds, req.user.tenantId]
    );
    if (!entries.rowCount) return res.status(400).json({ error: "No valid WIP entries found." });

    const subtotalCents = entries.rows.reduce((s, e) => s + Number(e.amount_cents), 0);
    const vatCents = entries.rows.reduce((s, e) => s + Number(e.vat_amount_cents), 0);
    const totalCents = subtotalCents + vatCents;
    const invoiceNumber = await generateInvoiceNumber(req.user.tenantId);
    const today = new Date().toISOString().slice(0, 10);

    const invResult = await client.query(
      `insert into invoices
        (tenant_id, invoice_number, client_name, client_email, matter_ref, subtotal_cents, vat_cents,
         amount_cents, paid_cents, currency, status, issued_at, due_at, notes, terms, payment_ref, created_by)
       values ($1,$2,$3,$4,$5,$6,$7,$8,0,'ZAR','Draft',$9,$10,$11,$12,$13,$14)
       returning *`,
      [
        req.user.tenantId, invoiceNumber, clientName, clientEmail || null, matterRef || null,
        subtotalCents, vatCents, totalCents, today,
        dueAt || null, notes || null,
        terms || "Payment is due within 30 days of invoice date. Interest at 2% per month accrues on overdue amounts.",
        paymentRef || null, req.user.sub
      ]
    );
    const invoiceId = invResult.rows[0].id;

    // Create line items from time entries
    const lineItemRows = [];
    for (let i = 0; i < entries.rows.length; i++) {
      const e = entries.rows[i];
      const liResult = await client.query(
        `insert into invoice_line_items
          (tenant_id, invoice_id, time_entry_id, description, activity_type, fee_earner_name,
           entry_date, duration_minutes, rate_cents, amount_cents, vat_cents, is_disbursement, sort_order)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
         returning *`,
        [
          req.user.tenantId, invoiceId, e.id, e.description, e.activity_type,
          e.fee_earner_name, e.entry_date, e.duration_minutes, e.rate_cents,
          e.amount_cents, e.vat_amount_cents, e.is_disbursement, i
        ]
      );
      lineItemRows.push(liResult.rows[0]);
    }

    // Mark time entries as Billed and link to invoice
    await client.query(
      `update time_entries set status = 'Billed', invoice_id = $1, updated_at = now()
       where id = any($2) and tenant_id = $3`,
      [invoiceId, entryIds, req.user.tenantId]
    );

    await client.query("commit");
    res.status(201).json({ invoice: invoiceFromRow(invResult.rows[0], lineItemRows, []) });
  } catch (error) { await client.query("rollback"); next(error); }
  finally { client.release(); }
});

// GET /api/invoices/:id — get invoice with full line items and payments
app.get("/api/invoices/:id", authMiddleware, async (req, res, next) => {
  if (!req.user.tenantId) return res.status(403).json({ error: "Tenant context required." });
  try {
    const [inv, items, pmts] = await Promise.all([
      pool.query("select * from invoices where id = $1 and tenant_id = $2", [req.params.id, req.user.tenantId]),
      pool.query("select * from invoice_line_items where invoice_id = $1 order by sort_order", [req.params.id]),
      pool.query("select * from invoice_payments where invoice_id = $1 order by payment_date", [req.params.id])
    ]);
    if (!inv.rowCount) return res.status(404).json({ error: "Invoice not found." });
    res.json({ invoice: invoiceFromRow(inv.rows[0], items.rows, pmts.rows) });
  } catch (error) { next(error); }
});

// PATCH /api/invoices/:id — update status, notes, terms, due_at
app.patch("/api/invoices/:id", authMiddleware, async (req, res, next) => {
  if (!req.user.tenantId) return res.status(403).json({ error: "Tenant context required." });
  const { status, notes, terms, dueAt, paymentRef } = req.body;
  const allowedStatuses = ["Draft", "Sent", "Part-paid", "Paid", "Overdue", "Void"];
  if (status && !allowedStatuses.includes(status)) return res.status(400).json({ error: "Invalid status." });
  try {
    const result = await pool.query(
      `update invoices set
         status = coalesce($3, status),
         notes = coalesce($4, notes),
         terms = coalesce($5, terms),
         due_at = coalesce($6, due_at),
         payment_ref = coalesce($7, payment_ref),
         updated_at = now()
       where id = $1 and tenant_id = $2 returning *`,
      [req.params.id, req.user.tenantId, status || null, notes ?? null, terms ?? null, dueAt || null, paymentRef ?? null]
    );
    if (!result.rowCount) return res.status(404).json({ error: "Invoice not found." });
    const [items, pmts] = await Promise.all([
      pool.query("select * from invoice_line_items where invoice_id = $1 order by sort_order", [req.params.id]),
      pool.query("select * from invoice_payments where invoice_id = $1 order by payment_date", [req.params.id])
    ]);
    res.json({ invoice: invoiceFromRow(result.rows[0], items.rows, pmts.rows) });
  } catch (error) { next(error); }
});

// POST /api/invoices/:id/payments — record a payment
app.post("/api/invoices/:id/payments", authMiddleware, async (req, res, next) => {
  if (!req.user.tenantId) return res.status(403).json({ error: "Tenant context required." });
  const { amountCents, paymentDate, paymentMethod = "EFT", reference, notes } = req.body;
  if (!amountCents || amountCents <= 0) return res.status(400).json({ error: "Payment amount must be greater than zero." });
  const client = await pool.connect();
  try {
    await client.query("begin");
    await client.query(
      `insert into invoice_payments (tenant_id, invoice_id, amount_cents, payment_date, payment_method, reference, notes, created_by)
       values ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [req.user.tenantId, req.params.id, amountCents, paymentDate || new Date().toISOString().slice(0, 10), paymentMethod, reference || null, notes || null, req.user.sub]
    );
    // Recalculate paid_cents from all payments
    const total = await client.query(
      "select coalesce(sum(amount_cents),0) as paid from invoice_payments where invoice_id = $1", [req.params.id]
    );
    const paidCents = Number(total.rows[0].paid);
    const inv = await client.query("select amount_cents from invoices where id = $1", [req.params.id]);
    const totalCents = Number(inv.rows[0]?.amount_cents || 0);
    const newStatus = paidCents >= totalCents ? "Paid" : paidCents > 0 ? "Part-paid" : "Sent";
    await client.query(
      "update invoices set paid_cents = $2, status = $3, updated_at = now() where id = $1",
      [req.params.id, paidCents, newStatus]
    );
    await client.query("commit");

    const [updatedInv, items, pmts] = await Promise.all([
      pool.query("select * from invoices where id = $1", [req.params.id]),
      pool.query("select * from invoice_line_items where invoice_id = $1 order by sort_order", [req.params.id]),
      pool.query("select * from invoice_payments where invoice_id = $1 order by payment_date", [req.params.id])
    ]);
    res.json({ invoice: invoiceFromRow(updatedInv.rows[0], items.rows, pmts.rows) });
  } catch (error) { await client.query("rollback"); next(error); }
  finally { client.release(); }
});

// GET /api/invoices/:id/pdf — generate and return a signed PDF URL
app.get("/api/invoices/:id/pdf", authMiddleware, async (req, res, next) => {
  if (!req.user.tenantId) return res.status(403).json({ error: "Tenant context required." });
  try {
    const [inv, items, pmts, profile] = await Promise.all([
      pool.query("select * from invoices where id = $1 and tenant_id = $2", [req.params.id, req.user.tenantId]),
      pool.query("select * from invoice_line_items where invoice_id = $1 order by sort_order", [req.params.id]),
      pool.query("select * from invoice_payments where invoice_id = $1 order by payment_date", [req.params.id]),
      pool.query("select * from tenant_profiles where tenant_id = $1 limit 1", [req.user.tenantId])
    ]);
    if (!inv.rowCount) return res.status(404).json({ error: "Invoice not found." });

    const tp = tenantProfileFromRow(profile.rows[0]) || {};
    const pdfBuffer = await generateInvoicePdf({
      invoice: inv.rows[0], lineItems: items.rows, payments: pmts.rows, tenantProfile: tp
    });

    // Upload to GCS and cache the URI
    let pdfUrl = "";
    try {
      const { uploadBuffer, configuredBucketName } = require("./gcs");
      if (configuredBucketName()) {
        const objectName = `invoices/${req.user.tenantId}/${inv.rows[0].invoice_number}.pdf`;
        const uploaded = await uploadBuffer({ buffer: pdfBuffer, contentType: "application/pdf", objectName, metadata: { tenantId: req.user.tenantId, invoiceId: req.params.id } });
        await pool.query("update invoices set pdf_gcs_uri = $1 where id = $2", [uploaded.gcsUri, req.params.id]);
        pdfUrl = uploaded.publicUrl;
      }
    } catch { /* GCS optional — fall back to inline */ }

    if (pdfUrl) {
      res.json({ url: pdfUrl });
    } else {
      // Stream inline if no GCS
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `attachment; filename="${inv.rows[0].invoice_number}.pdf"`);
      res.send(pdfBuffer);
    }
  } catch (error) { next(error); }
});

// POST /api/invoices/:id/send — email invoice to client
app.post("/api/invoices/:id/send", authMiddleware, async (req, res, next) => {
  if (!req.user.tenantId) return res.status(403).json({ error: "Tenant context required." });
  const { toEmail, toName, message } = req.body;
  if (!toEmail) return res.status(400).json({ error: "Recipient email is required." });
  try {
    const [inv, items, pmts, profile, smtpRow, identityRow] = await Promise.all([
      pool.query("select * from invoices where id = $1 and tenant_id = $2", [req.params.id, req.user.tenantId]),
      pool.query("select * from invoice_line_items where invoice_id = $1 order by sort_order", [req.params.id]),
      pool.query("select * from invoice_payments where invoice_id = $1 order by payment_date", [req.params.id]),
      pool.query("select * from tenant_profiles where tenant_id = $1 limit 1", [req.user.tenantId]),
      pool.query("select * from platform_smtp_settings where active = true order by updated_at desc limit 1"),
      pool.query("select * from tenant_email_identities where tenant_id = $1 limit 1", [req.user.tenantId])
    ]);
    if (!inv.rowCount) return res.status(404).json({ error: "Invoice not found." });

    const tp = tenantProfileFromRow(profile.rows[0]) || {};
    const smtpSettings = smtpFromRow(smtpRow.rows[0]) || undefined;
    const identity = identityRow.rows[0] || null;
    const tenantFromName = identity?.from_name || tp.tradingName || "LawPath SA";
    const tenantFromEmail = identity?.from_email || null;
    const replyTo = identity?.reply_to || tenantFromEmail || null;

    const pdfBuffer = await generateInvoicePdf({ invoice: inv.rows[0], lineItems: items.rows, payments: pmts.rows, tenantProfile: tp });
    const money = (cents) => `R ${(Number(cents || 0) / 100).toLocaleString("en-ZA", { minimumFractionDigits: 2 })}`;
    const { sendTransactionalEmail } = require("./mailer");
    await sendTransactionalEmail({
      to: toEmail,
      subject: `Invoice ${inv.rows[0].invoice_number} from ${tenantFromName}`,
      tenantFromName,
      tenantFromEmail,
      replyTo,
      smtpSettings,
      html: `<p>Dear ${escapeHtml(toName || inv.rows[0].client_name)},</p>
             ${message ? `<p>${escapeHtml(message)}</p>` : ""}
             <p>Please find attached invoice <strong>${escapeHtml(inv.rows[0].invoice_number)}</strong> for <strong>${money(inv.rows[0].amount_cents)}</strong>.</p>
             <p>Payment is due by ${inv.rows[0].due_at ? new Date(inv.rows[0].due_at).toLocaleDateString("en-ZA") : "30 days"}.</p>
             <p>Regards,<br/>${escapeHtml(tenantFromName)}</p>`,
      attachments: [{ filename: `${inv.rows[0].invoice_number}.pdf`, content: pdfBuffer, contentType: "application/pdf" }]
    });
    await pool.query(
      "update invoices set sent_at = now(), status = case when status = 'Draft' then 'Sent' else status end, updated_at = now() where id = $1",
      [req.params.id]
    );
    const updated = await pool.query("select * from invoices where id = $1", [req.params.id]);
    res.json({ invoice: invoiceFromRow(updated.rows[0], items.rows, pmts.rows) });
  } catch (error) { next(error); }
});

// POST /api/invoices/:id/accounting — mark as synced to accounting
app.post("/api/invoices/:id/accounting", authMiddleware, async (req, res, next) => {
  if (!req.user.tenantId) return res.status(403).json({ error: "Tenant context required." });
  const { provider = "manual" } = req.body;
  try {
    const result = await pool.query(
      "update invoices set accounting_synced_at = now(), accounting_provider = $2, updated_at = now() where id = $1 and tenant_id = $3 returning *",
      [req.params.id, provider, req.user.tenantId]
    );
    if (!result.rowCount) return res.status(404).json({ error: "Invoice not found." });
    const [items, pmts] = await Promise.all([
      pool.query("select * from invoice_line_items where invoice_id = $1 order by sort_order", [req.params.id]),
      pool.query("select * from invoice_payments where invoice_id = $1 order by payment_date", [req.params.id])
    ]);
    res.json({ invoice: invoiceFromRow(result.rows[0], items.rows, pmts.rows) });
  } catch (error) { next(error); }
});

// ─── VERIFYNOW SA ────────────────────────────────────────────────────────────

// Super-admin: usage summary (credit monitoring dashboard)
app.get("/api/admin/verifynow/usage", authMiddleware, async (req, res, next) => {
  if (!requirePlatformSuperAdmin(req, res)) return;
  try {
    const [totals, byService, byTenant, recent] = await Promise.all([
      pool.query(`
        select
          count(*)                                         as total_calls,
          coalesce(sum(credits_spent), 0)                  as total_credits,
          coalesce(sum(credits_spent) filter (where created_at >= now() - interval '30 days'), 0) as credits_30d,
          coalesce(sum(credits_spent) filter (where created_at >= now() - interval '7 days'),  0) as credits_7d,
          coalesce(sum(credits_spent) filter (where created_at >= date_trunc('day', now())),   0) as credits_today,
          count(*) filter (where status = 'error')         as error_calls,
          round(avg(latency_ms))                           as avg_latency_ms
        from verifynow_usage_log`),
      pool.query(`
        select service,
               count(*)                        as calls,
               coalesce(sum(credits_spent), 0) as credits,
               count(*) filter (where status = 'error') as errors
        from verifynow_usage_log
        group by service
        order by credits desc`),
      pool.query(`
        select t.name as tenant_name, v.tenant_id,
               count(*)                        as calls,
               coalesce(sum(v.credits_spent), 0) as credits
        from verifynow_usage_log v
        left join tenants t on t.id = v.tenant_id
        where v.created_at >= now() - interval '30 days'
        group by v.tenant_id, t.name
        order by credits desc
        limit 20`),
      pool.query(`
        select v.*, t.name as tenant_name
        from verifynow_usage_log v
        left join tenants t on t.id = v.tenant_id
        order by v.created_at desc
        limit 50`)
    ]);
    res.json({
      totals: totals.rows[0],
      byService: byService.rows,
      byTenant: byTenant.rows,
      recentLog: recent.rows
    });
  } catch (error) { next(error); }
});

// Super-admin: paginated usage log
app.get("/api/admin/verifynow/usage/log", authMiddleware, async (req, res, next) => {
  if (!requirePlatformSuperAdmin(req, res)) return;
  const limit  = Math.min(Number(req.query.limit  || 100), 500);
  const offset = Number(req.query.offset || 0);
  const service = req.query.service || null;
  try {
    const result = await pool.query(
      `select v.*, t.name as tenant_name
       from verifynow_usage_log v
       left join tenants t on t.id = v.tenant_id
       ${service ? "where v.service = $3" : ""}
       order by v.created_at desc
       limit $1 offset $2`,
      service ? [limit, offset, service] : [limit, offset]
    );
    const total = await pool.query(
      `select count(*) from verifynow_usage_log ${service ? "where service = $1" : ""}`,
      service ? [service] : []
    );
    res.json({ log: result.rows, total: Number(total.rows[0].count), limit, offset });
  } catch (error) { next(error); }
});

// Tenant-facing proxy — any VerifyNow service via POST /api/verifynow/:service
// Validates the service name against the known list to prevent open proxy abuse.
const VERIFYNOW_SERVICES = new Set([
  "verify", "verify-document", "face-match",
  "aml-pep", "consumer-trace", "consumer-trace-lite",
  "cipc/company", "cipc/director",
  "bank-account-verification",
  "number-plate", "vin-decode"
]);

app.post("/api/verifynow/*service", authMiddleware, async (req, res, next) => {
  if (!req.user.tenantId) return res.status(403).json({ error: "Tenant context required." });
  const service = req.params.service;
  if (!VERIFYNOW_SERVICES.has(service)) return res.status(400).json({ error: `Unknown VerifyNow service: ${service}` });
  try {
    const ctx = { tenantId: req.user.tenantId, userId: req.user.sub, inputRef: req.body?.input_ref || null };
    // Route to the matching wrapper method
    const methodMap = {
      "verify":                    verifynow.verifyId,
      "verify-document":           verifynow.verifyDocument,
      "face-match":                verifynow.faceMatch,
      "aml-pep":                   verifynow.amlPep,
      "consumer-trace":            verifynow.consumerTrace,
      "consumer-trace-lite":       verifynow.consumerTraceLite,
      "cipc/company":              verifynow.cipcCompany,
      "cipc/director":             verifynow.cipcDirector,
      "bank-account-verification": verifynow.bankAccountVerification,
      "number-plate":              verifynow.numberPlate,
      "vin-decode":                verifynow.vinDecode
    };
    const result = await methodMap[service](req.body, ctx);
    res.json(result);
  } catch (error) { next(error); }
});

// ─── E-SIGNATURE ─────────────────────────────────────────────────────────────

function sigRequestFromRow(row, signatories = [], auditEvents = []) {
  return { id: row.id, documentTitle: row.document_title, documentType: row.document_type, matterRef: row.matter_ref || "", documentBody: row.document_body || "", status: row.status, expiresAt: row.expires_at ? new Date(row.expires_at).toISOString() : "", completedAt: row.completed_at ? new Date(row.completed_at).toISOString() : "", signatories, auditEvents };
}

function signatoryFromRow(row) {
  return { id: row.id, signatoryName: row.signatory_name, signatoryEmail: row.signatory_email, signatoryIdNumber: row.signatory_id_number || "", role: row.role, orderPosition: Number(row.order_position), status: row.status, signedAt: row.signed_at ? new Date(row.signed_at).toISOString() : "", signatureMethod: row.signature_method || "" };
}

app.get("/api/esignature/requests", authMiddleware, async (req, res, next) => {
  if (!req.user.tenantId) return res.status(403).json({ error: "Tenant context required." });
  try {
    const [requests, sigs, events] = await Promise.all([
      pool.query("select * from signature_requests where tenant_id=$1 order by created_at desc limit 50", [req.user.tenantId]),
      pool.query("select * from signature_signatories where tenant_id=$1 order by order_position", [req.user.tenantId]),
      pool.query("select * from signature_audit_events where tenant_id=$1 order by created_at", [req.user.tenantId])
    ]);
    res.json({ requests: requests.rows.map(r => sigRequestFromRow(r, sigs.rows.filter(s => s.request_id === r.id).map(signatoryFromRow), events.rows.filter(e => e.request_id === r.id).map(e => ({ id: e.id, eventType: e.event_type, description: e.description, ipAddress: e.ip_address || "", createdAt: new Date(e.created_at).toISOString() })))) });
  } catch (error) { next(error); }
});

app.post("/api/esignature/requests", authMiddleware, async (req, res, next) => {
  if (!req.user.tenantId) return res.status(403).json({ error: "Tenant context required." });
  const { documentTitle, documentType, matterRef, documentBody, signatories, expiresAt } = req.body;
  if (!documentTitle || !signatories?.length) return res.status(400).json({ error: "Document title and at least one signatory are required." });
  const client = await pool.connect();
  try {
    await client.query("begin");
    const reqResult = await client.query("insert into signature_requests (tenant_id, document_title, document_type, matter_ref, document_body, status, expires_at, ecta_disclosure_shown, created_by) values ($1,$2,$3,$4,$5,'sent',$6,true,$7) returning *", [req.user.tenantId, documentTitle, documentType || "contract", matterRef || null, documentBody || null, expiresAt || null, req.user.sub]);
    const sigRows = [];
    for (const sig of signatories) {
      const s = await client.query("insert into signature_signatories (tenant_id, request_id, signatory_name, signatory_email, signatory_id_number, role, order_position) values ($1,$2,$3,$4,$5,$6,$7) returning *", [req.user.tenantId, reqResult.rows[0].id, sig.signatoryName, sig.signatoryEmail, sig.signatoryIdNumber || null, sig.role || "signer", Number(sig.orderPosition || 1)]);
      sigRows.push(s.rows[0]);
    }
    await client.query("insert into signature_audit_events (tenant_id, request_id, event_type, description, ip_address) values ($1,$2,'request_created','Signature request created',$3)", [req.user.tenantId, reqResult.rows[0].id, req.headers["x-forwarded-for"] || req.socket.remoteAddress || ""]);
    await client.query("commit");
    res.status(201).json({ request: sigRequestFromRow(reqResult.rows[0], sigRows.map(signatoryFromRow), []) });
  } catch (error) { await client.query("rollback"); next(error); } finally { client.release(); }
});

app.post("/api/esignature/requests/:id/signatories/:sigId/send-otp", authMiddleware, async (req, res, next) => {
  if (!req.user.tenantId) return res.status(403).json({ error: "Tenant context required." });
  try {
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const otpHash = crypto.createHash("sha256").update(otp).digest("hex");
    await pool.query("update signature_signatories set otp_hash=$2, otp_expires_at=now()+interval '15 minutes', status='otp_sent' where id=$1 and tenant_id=$3", [req.params.sigId, otpHash, req.user.tenantId]);
    await pool.query("insert into signature_audit_events (tenant_id, request_id, signatory_id, event_type, description) values ($1,$2,$3,'otp_sent','OTP sent to signatory')", [req.user.tenantId, req.params.id, req.params.sigId]);
    console.info(`[ESignature] OTP for signatory ${req.params.sigId}: ${otp} (dev mode — send via email in production)`);
    res.json({ ok: true });
  } catch (error) { next(error); }
});

app.post("/api/esignature/requests/:id/signatories/:sigId/sign", authMiddleware, async (req, res, next) => {
  if (!req.user.tenantId) return res.status(403).json({ error: "Tenant context required." });
  const { otp, signatureDataUri, signatureMethod } = req.body;
  if (!otp || !signatureDataUri) return res.status(400).json({ error: "OTP and signature are required." });
  try {
    const sig = await pool.query("select * from signature_signatories where id=$1 and tenant_id=$2", [req.params.sigId, req.user.tenantId]);
    if (!sig.rowCount) return res.status(404).json({ error: "Signatory not found." });
    const otpHash = crypto.createHash("sha256").update(otp).digest("hex");
    if (sig.rows[0].otp_hash !== otpHash) return res.status(401).json({ error: "Invalid OTP. Please request a new code." });
    if (new Date(sig.rows[0].otp_expires_at) < new Date()) return res.status(401).json({ error: "OTP has expired. Please request a new code." });
    const ip = req.headers["x-forwarded-for"] || req.socket.remoteAddress || "";
    await pool.query("update signature_signatories set status='signed', otp_verified=true, signed_at=now(), ip_address=$2, user_agent=$3, signature_data_uri=$4, signature_method=$5 where id=$1", [req.params.sigId, ip, req.headers["user-agent"] || "", signatureDataUri, signatureMethod || "drawn"]);
    await pool.query("insert into signature_audit_events (tenant_id, request_id, signatory_id, event_type, description, ip_address) values ($1,$2,$3,'signed',$4,$5)", [req.user.tenantId, req.params.id, req.params.sigId, `Signed using ${signatureMethod || "drawn"} method`, ip]);
    const remaining = await pool.query("select count(*) from signature_signatories where request_id=$1 and status!='signed'", [req.params.id]);
    if (Number(remaining.rows[0].count) === 0) { await pool.query("update signature_requests set status='completed', completed_at=now() where id=$1", [req.params.id]); }
    else { await pool.query("update signature_requests set status='partially_signed' where id=$1 and status='sent'", [req.params.id]); }
    const updated = await pool.query("select * from signature_signatories where id=$1", [req.params.sigId]);
    res.json({ signatory: signatoryFromRow(updated.rows[0]) });
  } catch (error) { next(error); }
});

// ─── AGENT NETWORK ────────────────────────────────────────────────────────────

function agentFromRow(row) {
  return { id: row.id, agentName: row.agent_name, agencyName: row.agency_name, email: row.email, phone: row.phone || "", ffcNumber: row.ffc_number || "", ppraRegistration: row.ppra_registration || "", areaOfOperation: row.area_of_operation || "", status: row.status, commissionRate: Number(row.commission_rate), portalAccess: Boolean(row.portal_access), portalToken: row.portal_token || "", totalReferrals: Number(row.total_referrals), totalCommissionCents: Number(row.total_commission_cents) };
}

function referralFromRow(row) {
  return { id: row.id, agentId: row.agent_id, agentName: row.agent_name || "", matterRef: row.matter_ref, propertyDescription: row.property_description || "", buyerName: row.buyer_name || "", sellerName: row.seller_name || "", purchasePriceCents: Number(row.purchase_price_cents), commissionCents: Number(row.commission_cents), commissionStatus: row.commission_status, referralDate: row.referral_date ? String(row.referral_date).slice(0,10) : "", paidDate: row.paid_date ? String(row.paid_date).slice(0,10) : "" };
}

app.get("/api/agents/network", authMiddleware, async (req, res, next) => {
  if (!req.user.tenantId) return res.status(403).json({ error: "Tenant context required." });
  try {
    const [agents, referrals] = await Promise.all([
      pool.query("select * from estate_agents where tenant_id=$1 order by total_referrals desc", [req.user.tenantId]),
      pool.query("select r.*, a.agent_name from agent_referrals r join estate_agents a on a.id=r.agent_id where r.tenant_id=$1 order by r.created_at desc limit 100", [req.user.tenantId])
    ]);
    res.json({ agents: agents.rows.map(agentFromRow), referrals: referrals.rows.map(referralFromRow) });
  } catch (error) { next(error); }
});

app.post("/api/agents", authMiddleware, async (req, res, next) => {
  if (!req.user.tenantId) return res.status(403).json({ error: "Tenant context required." });
  const { agentName, agencyName, email, phone, ffcNumber, ppraRegistration, areaOfOperation, commissionRate, portalAccess } = req.body;
  if (!agentName || !agencyName || !email) return res.status(400).json({ error: "Agent name, agency and email are required." });
  const portalToken = portalAccess ? `LP-AGENT-${Math.random().toString(36).slice(2,6).toUpperCase()}` : null;
  try {
    const result = await pool.query("insert into estate_agents (tenant_id, agent_name, agency_name, email, phone, ffc_number, ppra_registration, area_of_operation, commission_rate, portal_access, portal_token) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) returning *", [req.user.tenantId, agentName, agencyName, email.toLowerCase(), phone || null, ffcNumber || null, ppraRegistration || null, areaOfOperation || null, Number(commissionRate || 0.05), Boolean(portalAccess), portalToken]);
    res.status(201).json({ agent: agentFromRow(result.rows[0]) });
  } catch (error) { next(error); }
});

app.post("/api/agents/:id/referrals", authMiddleware, async (req, res, next) => {
  if (!req.user.tenantId) return res.status(403).json({ error: "Tenant context required." });
  const { matterRef, propertyDescription, buyerName, sellerName, purchasePriceCents, commissionCents, referralDate } = req.body;
  if (!matterRef) return res.status(400).json({ error: "Matter ref is required." });
  try {
    const result = await pool.query("insert into agent_referrals (tenant_id, agent_id, matter_ref, property_description, buyer_name, seller_name, purchase_price_cents, commission_cents, referral_date) values ($1,$2,$3,$4,$5,$6,$7,$8,$9) returning *", [req.user.tenantId, req.params.id, matterRef, propertyDescription || null, buyerName || null, sellerName || null, Number(purchasePriceCents || 0), Number(commissionCents || 0), referralDate || new Date().toISOString().slice(0,10)]);
    await pool.query("update estate_agents set total_referrals=total_referrals+1, total_commission_cents=total_commission_cents+$2 where id=$1", [req.params.id, Number(commissionCents || 0)]);
    const agent = await pool.query("select agent_name from estate_agents where id=$1", [req.params.id]);
    const row = { ...result.rows[0], agent_name: agent.rows[0]?.agent_name || "" };
    res.status(201).json({ referral: referralFromRow(row) });
  } catch (error) { next(error); }
});

app.put("/api/agents/referrals/:id/commission", authMiddleware, async (req, res, next) => {
  if (!req.user.tenantId) return res.status(403).json({ error: "Tenant context required." });
  const { status } = req.body;
  try {
    const result = await pool.query("update agent_referrals set commission_status=$2, paid_date=case when $2='paid' then current_date else paid_date end where id=$1 and tenant_id=$3 returning *, (select agent_name from estate_agents where id=agent_referrals.agent_id) as agent_name", [req.params.id, status, req.user.tenantId]);
    if (!result.rowCount) return res.status(404).json({ error: "Referral not found." });
    res.json({ referral: referralFromRow(result.rows[0]) });
  } catch (error) { next(error); }
});

// ─── PRACTICE ANALYTICS ───────────────────────────────────────────────────────

function snapshotFromRow(row) {
  return { id: row.id, periodMonth: row.period_month, totalMattersActive: Number(row.total_matters_active), totalMattersClosed: Number(row.total_matters_closed), wipTotalCents: Number(row.wip_total_cents), billedTotalCents: Number(row.billed_total_cents), collectedTotalCents: Number(row.collected_total_cents), writtenOffCents: Number(row.written_off_cents), trustBalanceCents: Number(row.trust_balance_cents), debtors30Cents: Number(row.debtors_30_cents), debtors60Cents: Number(row.debtors_60_cents), debtors90Cents: Number(row.debtors_90_cents), debtors120PlusCents: Number(row.debtors_120_plus_cents), realisationRate: Number(row.realisation_rate || 0), collectionRate: Number(row.collection_rate || 0), feeEarnerStats: row.fee_earner_stats || [], matterTypeStats: row.matter_type_stats || [] };
}

app.get("/api/analytics/dashboard", authMiddleware, async (req, res, next) => {
  if (!req.user.tenantId) return res.status(403).json({ error: "Tenant context required." });
  try {
    const snapshots = await pool.query("select * from analytics_snapshots where tenant_id=$1 order by period_month desc limit 12", [req.user.tenantId]);
    res.json({ snapshots: snapshots.rows.map(snapshotFromRow), current: snapshots.rows[0] ? snapshotFromRow(snapshots.rows[0]) : null });
  } catch (error) { next(error); }
});

app.post("/api/analytics/snapshot", authMiddleware, async (req, res, next) => {
  if (!req.user.tenantId) return res.status(403).json({ error: "Tenant context required." });
  try {
    const month = new Date().toISOString().slice(0,7);
    const [wip, billed, invoices, trust] = await Promise.all([
      pool.query("select coalesce(sum(amount_cents),0) as total from time_entries where tenant_id=$1 and status='WIP'", [req.user.tenantId]),
      pool.query("select coalesce(sum(amount_cents),0) as total from time_entries where tenant_id=$1 and status='Billed'", [req.user.tenantId]),
      pool.query("select coalesce(sum(amount),0) as billed, coalesce(sum(paid),0) as collected from invoices where tenant_id=$1", [req.user.tenantId]).catch(() => ({ rows: [{ billed: 0, collected: 0 }] })),
      pool.query("select coalesce(sum(case when entry_type in ('receipt','transfer_in') then amount_cents else -amount_cents end),0) as balance from trust_transactions where tenant_id=$1", [req.user.tenantId])
    ]);
    const wipCents = Number(wip.rows[0].total);
    const billedCents = Number(billed.rows[0].total);
    const realisationRate = wipCents > 0 ? Math.min(billedCents / wipCents, 1) : 0;
    const collectedCents = Number(invoices.rows[0].collected || 0);
    const billedInvoice = Number(invoices.rows[0].billed || 0);
    const collectionRate = billedInvoice > 0 ? Math.min(collectedCents / billedInvoice, 1) : 0;
    const result = await pool.query("insert into analytics_snapshots (tenant_id, period_month, wip_total_cents, billed_total_cents, collected_total_cents, trust_balance_cents, realisation_rate, collection_rate) values ($1,$2,$3,$4,$5,$6,$7,$8) on conflict (tenant_id, period_month) do update set wip_total_cents=$3, billed_total_cents=$4, collected_total_cents=$5, trust_balance_cents=$6, realisation_rate=$7, collection_rate=$8, created_at=now() returning *", [req.user.tenantId, month, wipCents, billedCents, collectedCents, Number(trust.rows[0].balance), realisationRate, collectionRate]);
    res.status(201).json({ snapshot: snapshotFromRow(result.rows[0]) });
  } catch (error) { next(error); }
});

// ─── PDF GENERATION ───────────────────────────────────────────────────────────

const { generateContractPdf, generateTrustStatementPdf, generateInvoicePdf } = require("./pdf");
const { notifyConveyancingStageAdvance, notifyEsignatureRequest, notifyStaffInvite } = require("./notifications");

app.get("/api/pdf/contract/:contractId", authMiddleware, async (req, res, next) => {
  if (!req.user.tenantId) return res.status(403).json({ error: "Tenant context required." });
  try {
    const profile = await pool.query("select * from tenant_profiles where tenant_id=$1", [req.user.tenantId]);
    const tp = tenantProfileFromRow(profile.rows[0]) || {};
    const contractId = req.params.contractId;
    const contract = await pool.query(
      "select * from contract_drafts where id=$1 and tenant_id=$2",
      [contractId, req.user.tenantId]
    ).catch(() => ({ rows: [] }));

    const c = contract.rows[0];
    const pdfBuffer = await generateContractPdf({
      title: c?.name || "Legal Document",
      body: c?.body || "",
      tenantProfile: tp,
      parties: [c?.party_a, c?.party_b].filter(Boolean),
      matterRef: c?.matter_ref || "",
      documentType: c?.category || "Contract",
      includeReviewWarning: true
    });

    res.set({ "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="${(c?.name || "document").replace(/\s+/g, "-")}.pdf"`, "Content-Length": pdfBuffer.length });
    res.end(pdfBuffer);
  } catch (error) { next(error); }
});

app.post("/api/pdf/custom", authMiddleware, async (req, res, next) => {
  if (!req.user.tenantId) return res.status(403).json({ error: "Tenant context required." });
  const { title, body, matterRef, documentType, parties, signatories } = req.body;
  if (!title || !body) return res.status(400).json({ error: "Title and body are required." });
  try {
    const profile = await pool.query("select * from tenant_profiles where tenant_id=$1", [req.user.tenantId]);
    const tp = tenantProfileFromRow(profile.rows[0]) || {};
    const pdfBuffer = await generateContractPdf({ title, body, tenantProfile: tp, parties: parties || [], signatories: signatories || [], matterRef: matterRef || "", documentType: documentType || "Contract", includeReviewWarning: true });
    res.set({ "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="${title.replace(/\s+/g, "-")}.pdf"`, "Content-Length": pdfBuffer.length });
    res.end(pdfBuffer);
  } catch (error) { next(error); }
});

app.post("/api/documents/pdf", authMiddleware, async (req, res, next) => {
  if (!req.user.tenantId) return res.status(403).json({ error: "Tenant context required." });
  const { title, body, matterRef, documentType } = req.body;
  if (!body) return res.status(400).json({ error: "Body is required." });
  try {
    const profile = await pool.query("select * from tenant_profiles where tenant_id=$1", [req.user.tenantId]);
    const tp = tenantProfileFromRow(profile.rows[0]) || {};
    const docTitle = title || "Legal Document";
    const pdfBuffer = await generateContractPdf({
      title: docTitle,
      body,
      tenantProfile: tp,
      parties: [],
      signatories: [],
      matterRef: matterRef || "",
      documentType: documentType || "Draft Document",
      includeReviewWarning: true
    });
    const safeFilename = docTitle.replace(/[^a-z0-9\-_ ]/gi, "_").replace(/\s+/g, "-");
    res.set({ "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="${safeFilename}.pdf"`, "Content-Length": pdfBuffer.length });
    res.end(pdfBuffer);
  } catch (error) { next(error); }
});

app.get("/api/pdf/trust-statement", authMiddleware, async (req, res, next) => {
  if (!req.user.tenantId) return res.status(403).json({ error: "Tenant context required." });
  const { period } = req.query;
  try {
    const profile = await pool.query("select * from tenant_profiles where tenant_id=$1", [req.user.tenantId]);
    const tp = tenantProfileFromRow(profile.rows[0]) || {};
    const txResult = await pool.query(
      "select * from trust_transactions where tenant_id=$1 order by value_date desc limit 200",
      [req.user.tenantId]
    );
    const balResult = await pool.query(
      "select coalesce(sum(case when entry_type in ('receipt','transfer_in') then amount_cents else -amount_cents end),0) as balance from trust_transactions where tenant_id=$1",
      [req.user.tenantId]
    );
    const transactions = txResult.rows.map(r => ({
      valueDate: r.value_date ? String(r.value_date).slice(0, 10) : "",
      clientName: r.client_name,
      description: r.description,
      entryType: r.entry_type,
      amountCents: Number(r.amount_cents)
    }));
    const pdfBuffer = await generateTrustStatementPdf({ tenantProfile: tp, transactions, periodLabel: period || new Date().toISOString().slice(0, 7), balanceCents: Number(balResult.rows[0]?.balance || 0) });
    res.set({ "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="trust-statement-${period || "current"}.pdf"`, "Content-Length": pdfBuffer.length });
    res.end(pdfBuffer);
  } catch (error) { next(error); }
});

// ─── STAFF MANAGEMENT ─────────────────────────────────────────────────────────

app.get("/api/staff", authMiddleware, async (req, res, next) => {
  if (!req.user.tenantId) return res.status(403).json({ error: "Tenant context required." });
  try {
    const [staff, invites] = await Promise.all([
      pool.query(
        "select id, full_name, email, role, status, job_title, phone, last_login_at, created_at, deactivated_at from users where tenant_id=$1 order by created_at",
        [req.user.tenantId]
      ),
      pool.query(
        "select id, email, full_name, role, status, expires_at, created_at from staff_invites where tenant_id=$1 and status='pending' order by created_at desc",
        [req.user.tenantId]
      )
    ]);
    res.json({
      staff: staff.rows.map(u => ({ id: u.id, fullName: u.full_name, email: u.email, role: u.role, status: u.status, jobTitle: u.job_title || "", phone: u.phone || "", lastLoginAt: u.last_login_at, createdAt: u.created_at, deactivatedAt: u.deactivated_at })),
      pendingInvites: invites.rows.map(i => ({ id: i.id, email: i.email, fullName: i.full_name, role: i.role, status: i.status, expiresAt: i.expires_at, createdAt: i.created_at }))
    });
  } catch (error) { next(error); }
});

app.post("/api/staff/invite", authMiddleware, async (req, res, next) => {
  if (!req.user.tenantId) return res.status(403).json({ error: "Tenant context required." });
  if (!["tenant_admin"].includes(req.user.role) && req.user.role !== "platform_super_admin") return res.status(403).json({ error: "Only tenant admins can invite staff." });
  const { email, fullName, role } = req.body;
  if (!email || !fullName || !role) return res.status(400).json({ error: "Email, full name and role are required." });
  const validRoles = ["tenant_admin", "attorney", "candidate_attorney", "legal_secretary", "billing_admin"];
  if (!validRoles.includes(role)) return res.status(400).json({ error: "Invalid role." });
  try {
    const existing = await pool.query("select id from users where email=$1", [email.toLowerCase()]);
    if (existing.rowCount) return res.status(409).json({ error: "A user with this email already exists." });
    const rawToken = crypto.randomBytes(32).toString("hex");
    const tokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");
    const invite = await pool.query(
      "insert into staff_invites (tenant_id, invited_by, email, full_name, role, token_hash) values ($1,$2,$3,$4,$5,$6) returning *",
      [req.user.tenantId, req.user.sub, email.toLowerCase(), fullName, role, tokenHash]
    );
    const tenant = await pool.query("select company_name from tenants where id=$1", [req.user.tenantId]);
    await notifyStaffInvite({ tenantId: req.user.tenantId, inviteId: invite.rows[0].id, recipientEmail: email.toLowerCase(), recipientName: fullName, firmName: tenant.rows[0]?.company_name || "the firm", role, inviteToken: rawToken, appUrl: process.env.VITE_APP_URL || "" }).catch(err => console.error("Invite email failed:", err.message));
    res.status(201).json({ invite: { id: invite.rows[0].id, email, fullName, role, status: "pending", expiresAt: invite.rows[0].expires_at } });
  } catch (error) { next(error); }
});

app.post("/api/staff/accept-invite", async (req, res, next) => {
  const { token, password } = req.body;
  if (!token || !password) return res.status(400).json({ error: "Token and password are required." });
  const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
  const client = await pool.connect();
  try {
    await client.query("begin");
    const invite = await client.query("select * from staff_invites where token_hash=$1 and status='pending' and expires_at > now()", [tokenHash]);
    if (!invite.rowCount) return res.status(400).json({ error: "Invite not found or expired." });
    const inv = invite.rows[0];
    const passwordHash = await bcrypt.hash(password, 12);
    const user = await client.query(
      "insert into users (tenant_id, full_name, email, password_hash, role, status) values ($1,$2,$3,$4,$5,'active') returning id, tenant_id, full_name, email, role",
      [inv.tenant_id, inv.full_name, inv.email, passwordHash, inv.role]
    );
    await client.query("update staff_invites set status='accepted', accepted_at=now() where id=$1", [inv.id]);
    await client.query("commit");
    const tenant = await pool.query("select company_name, slug from tenants where id=$1", [inv.tenant_id]);
    const merged = { ...user.rows[0], company_name: tenant.rows[0]?.company_name, slug: tenant.rows[0]?.slug };
    res.json({ token: signToken(merged), user: publicUser(merged) });
  } catch (error) { await client.query("rollback"); next(error); } finally { client.release(); }
});

app.put("/api/staff/:userId", authMiddleware, async (req, res, next) => {
  if (!req.user.tenantId) return res.status(403).json({ error: "Tenant context required." });
  if (req.user.role !== "tenant_admin") return res.status(403).json({ error: "Tenant admin only." });
  const { role, status, jobTitle, phone } = req.body;
  try {
    const result = await pool.query(
      `update users set role=coalesce($2,role), status=coalesce($3,status), job_title=coalesce($4,job_title), phone=coalesce($5,phone), deactivated_at=case when $3='inactive' then now() else deactivated_at end, updated_at=now() where id=$1 and tenant_id=$6 returning id, full_name, email, role, status, job_title, phone`,
      [req.params.userId, role||null, status||null, jobTitle||null, phone||null, req.user.tenantId]
    );
    if (!result.rowCount) return res.status(404).json({ error: "Staff member not found." });
    const u = result.rows[0];
    res.json({ staffMember: { id: u.id, fullName: u.full_name, email: u.email, role: u.role, status: u.status, jobTitle: u.job_title||"", phone: u.phone||"" } });
  } catch (error) { next(error); }
});

app.delete("/api/staff/invites/:id", authMiddleware, async (req, res, next) => {
  if (!req.user.tenantId) return res.status(403).json({ error: "Tenant context required." });
  try {
    await pool.query("update staff_invites set status='revoked' where id=$1 and tenant_id=$2", [req.params.id, req.user.tenantId]);
    res.json({ ok: true });
  } catch (error) { next(error); }
});

// ─── WINDEED PROPERTY SEARCH ─────────────────────────────────────────────────

app.get("/api/windeed/search", authMiddleware, async (req, res, next) => {
  if (!req.user.tenantId) return res.status(403).json({ error: "Tenant context required." });
  const { q, type = "erf" } = req.query;
  if (!q) return res.status(400).json({ error: "Search query is required." });
  try {
    const cached = await pool.query("select * from property_search_cache where search_query=$1 and search_type=$2 and cached_at > now()-interval '7 days' limit 1", [String(q), String(type)]);
    if (cached.rowCount) return res.json({ results: cached.rows[0].results, cached: true, note: "Results from cache. Live Windeed integration requires API credentials from windeed.co.za." });

    const windeedApiKey = process.env.WINDEED_API_KEY || "";
    let results = [];
    if (windeedApiKey) {
      try {
        const wRes = await fetch(`https://api.windeed.co.za/v1/property/search?q=${encodeURIComponent(q)}&type=${type}`, { headers: { "Authorization": `Bearer ${windeedApiKey}`, "Accept": "application/json" } });
        if (wRes.ok) results = await wRes.json();
      } catch { /* fall through to simulation */ }
    }

    // Try Lightstone as secondary provider (real API via server/lightstone.js)
    if (!results.length) {
      try {
        const lData = await lightstone.searchAddress(q, { tenantId: req.user.tenantId, userId: req.user.sub });
        if (lData.results.length) {
          // Map Lightstone's rich response to the legacy Windeed shape for this route
          results = lData.results.map(p => ({
            erfNumber: p.addressString || "",
            titleDeedNumber: p.deedsOfficeId ? `Deeds Office ${p.deedsOfficeId}` : "",
            propertyDescription: [p.estateName, p.suburbName, p.municipalityName, p.provinceName].filter(Boolean).join(", "),
            extent: "",
            registeredOwner: "[Use Lightstone property detail for owner data]",
            bondHolder: "",
            purchasePrice: "",
            registrationDate: "",
            municipalValue: "",
            ratesLevied: "",
            // Pass through native fields for frontend upgrade path
            _lightstone: p
          }));
          console.info(`[lightstone] ${results.length} results for "${q}"`);
        }
      } catch (err) { console.error("[lightstone] search failed:", err.message); }
    }

    // Realistic simulation fallback — plausible SA property structure
    if (!results.length) {
      const erfNum = /^\d+$/.test(String(q).trim()) ? String(q).trim() : `${Math.floor(Math.random() * 9000 + 1000)}`;
      const suburb = String(q).includes(",") ? q.split(",")[1].trim() : q;
      const provinces = [
        { name: "Gauteng", cities: ["Sandton", "Randburg", "Midrand", "Centurion"] },
        { name: "Western Cape", cities: ["Cape Town", "Stellenbosch", "Somerset West"] },
        { name: "KwaZulu-Natal", cities: ["Umhlanga", "Ballito", "Durban North"] }
      ];
      const prov = provinces[Math.floor(Math.random() * provinces.length)];
      const city = prov.cities[Math.floor(Math.random() * prov.cities.length)];
      const yr = 2015 + Math.floor(Math.random() * 9);
      const price = Math.floor(Math.random() * 3500000 + 800000);
      const munVal = Math.floor(price * 0.75);
      const banks = ["FIRST NATIONAL BANK LIMITED", "ABSA BANK LIMITED", "STANDARD BANK OF SOUTH AFRICA LIMITED", "NEDBANK LIMITED"];
      results = [{
        erfNumber: `ERF ${erfNum}`,
        titleDeedNumber: `T${Math.floor(Math.random() * 90000 + 10000)}/${yr}`,
        propertyDescription: `ERF ${erfNum}, ${suburb || city}, Province of ${prov.name}`,
        extent: `${Math.floor(Math.random() * 900 + 150)} m²`,
        registeredOwner: "[Live owner data — set WINDEED_API_KEY or LIGHTSTONE_API_KEY in .env]",
        bondHolder: banks[Math.floor(Math.random() * banks.length)],
        purchasePrice: `R ${price.toLocaleString("en-ZA")}`,
        registrationDate: `${yr}-${String(Math.floor(Math.random() * 12 + 1)).padStart(2, "0")}-15`,
        municipalValue: `R ${munVal.toLocaleString("en-ZA")}`,
        ratesLevied: `R ${Math.floor(munVal * 0.0075 / 12).toLocaleString("en-ZA")} per month`
      }];
    }

    const provider = windeedApiKey ? "windeed" : (results.length && results[0]?._lightstone) ? "lightstone" : "simulation";
    await pool.query(
      "insert into property_search_cache (search_query, search_type, result_count, results, provider, searched_by) values ($1,$2,$3,$4,$5,$6) on conflict do nothing",
      [String(q), String(type), results.length, JSON.stringify(results), provider, req.user.sub]
    );
    const note = provider === "windeed" ? "Live data from Windeed (Deeds Office)." :
      provider === "lightstone" ? "Live data from Lightstone." :
      "Simulation mode. Set WINDEED_API_KEY (windeed.co.za) or LIGHTSTONE_API_KEY (lightstone.co.za) in .env for live Deeds Office data.";
    res.json({ results, cached: false, provider, note });
  } catch (error) { next(error); }
});

// ─── LIGHTSTONE PROPERTY API ──────────────────────────────────────────────────

// Address search — GET /api/lightstone/address?q={query}
// Returns native Lightstone PropertyAddressSingleLineResponse[] sorted by relevance.
// No tenantId guard — key is platform-wide; tenantId is only used for usage logging (nullable).
app.get("/api/lightstone/address", authMiddleware, async (req, res, next) => {
  const q = String(req.query.q || "").trim();
  if (!q) return res.status(400).json({ error: "Query parameter 'q' is required." });
  try {
    const ctx = { tenantId: req.user.tenantId || null, userId: req.user.sub };
    const data = await lightstone.searchAddress(q, ctx);
    res.json(data);
  } catch (err) {
    next(err);
  }
});

// Sectional scheme unit lookup — GET /api/lightstone/sectional/:addressId?maxrows=20
// Use the `id` field from a search result where schemeGroupId > 0.
app.get("/api/lightstone/sectional/:addressId", authMiddleware, async (req, res, next) => {
  const addressId = Number(req.params.addressId);
  if (!addressId || isNaN(addressId)) return res.status(400).json({ error: "Valid addressId is required." });
  const maxrows = Math.min(Number(req.query.maxrows || 20), 100);
  try {
    const ctx = { tenantId: req.user.tenantId || null, userId: req.user.sub };
    const data = await lightstone.getSectionalUnits(addressId, maxrows, ctx);
    res.json(data);
  } catch (err) {
    next(err);
  }
});

// Property detail bundle — GET /api/lightstone/property/:propertyId?addressId=…
// Fetches owners + legal + municipal + land + address in parallel (one call from UI).
// propertyId = search result .propertyId; addressId = search result .id (optional).
app.get("/api/lightstone/property/:propertyId", authMiddleware, async (req, res, next) => {
  const propertyId = Number(req.params.propertyId);
  if (!propertyId || isNaN(propertyId)) return res.status(400).json({ error: "Valid propertyId is required." });
  const addressId = req.query.addressId ? Number(req.query.addressId) : null;
  try {
    const ctx = { tenantId: req.user.tenantId || null, userId: req.user.sub };
    const bundle = await lightstone.getPropertyBundle(propertyId, addressId, ctx);
    res.json(bundle);
  } catch (err) { next(err); }
});

// Individual property data endpoints (for granular fetching if needed)
app.get("/api/lightstone/property/:propertyId/owners",    authMiddleware, async (req, res, next) => {
  try { res.json(await lightstone.getPropertyOwners(Number(req.params.propertyId), { tenantId: req.user.tenantId || null, userId: req.user.sub })); } catch (e) { next(e); }
});
app.get("/api/lightstone/property/:propertyId/legal",     authMiddleware, async (req, res, next) => {
  try { res.json(await lightstone.getPropertyLegal(Number(req.params.propertyId), { tenantId: req.user.tenantId || null, userId: req.user.sub })); } catch (e) { next(e); }
});
app.get("/api/lightstone/property/:propertyId/municipal", authMiddleware, async (req, res, next) => {
  try { res.json(await lightstone.getPropertyMunicipal(Number(req.params.propertyId), { tenantId: req.user.tenantId || null, userId: req.user.sub })); } catch (e) { next(e); }
});
app.get("/api/lightstone/property/:propertyId/land",      authMiddleware, async (req, res, next) => {
  try { res.json(await lightstone.getPropertyLand(Number(req.params.propertyId), { tenantId: req.user.tenantId || null, userId: req.user.sub })); } catch (e) { next(e); }
});
app.get("/api/lightstone/property/:propertyId/valuation", authMiddleware, async (req, res, next) => {
  try { res.json(await lightstone.getPropertyValuation(Number(req.params.propertyId), { tenantId: req.user.tenantId || null, userId: req.user.sub })); } catch (e) { next(e); }
});

// Super-admin: Lightstone usage summary
app.get("/api/admin/lightstone/usage", authMiddleware, async (req, res, next) => {
  if (!requirePlatformSuperAdmin(req, res)) return;
  try {
    const [totals, byService, recent] = await Promise.all([
      pool.query(`select count(*) as total_calls, count(*) filter (where status='error') as errors, round(avg(latency_ms)) as avg_latency_ms, coalesce(sum(result_count), 0) as total_results from lightstone_usage_log`),
      pool.query(`select service, count(*) as calls, count(*) filter (where status='error') as errors, round(avg(latency_ms)) as avg_latency_ms from lightstone_usage_log group by service order by calls desc`),
      pool.query(`select l.*, t.name as tenant_name from lightstone_usage_log l left join tenants t on t.id = l.tenant_id order by l.created_at desc limit 50`)
    ]);
    res.json({ totals: totals.rows[0], byService: byService.rows, recentLog: recent.rows });
  } catch (err) { next(err); }
});

// ─── YOCO BILLING (South African payment gateway — ZAR only) ─────────────────
// Pattern replicated from geodex/SpellGameKit Yoco integration.
// Docs: https://developer.yoco.com/online/checkout-flow/

const YOCO_API = "https://payments.yoco.com/v1";
const YOCO_SECRET_KEY = process.env.YOCO_SECRET_KEY || "";

const YOCO_PLANS = {
  solo:     { name: "Solo",     priceCents: 79900,  maxUsers: 1 },
  practice: { name: "Practice", priceCents: 249900, maxUsers: 5 },
  firm:     { name: "Firm",     priceCents: 599900, maxUsers: 999 }
};

app.get("/api/billing/status", authMiddleware, async (req, res, next) => {
  if (!req.user.tenantId) return res.status(403).json({ error: "Tenant context required." });
  try {
    const tenant = await pool.query("select plan, plan_status, trial_ends_at from tenants where id=$1", [req.user.tenantId]);
    const sub = await pool.query("select * from yoco_subscriptions where tenant_id=$1", [req.user.tenantId]).catch(() => ({ rows: [] }));
    res.json({
      plan: tenant.rows[0]?.plan || "trial",
      planStatus: tenant.rows[0]?.plan_status || "trialing",
      trialEndsAt: tenant.rows[0]?.trial_ends_at,
      currentPeriodEnd: sub.rows[0]?.current_period_end || null,
      yocoConfigured: Boolean(YOCO_SECRET_KEY),
      plans: YOCO_PLANS
    });
  } catch (error) { next(error); }
});

app.post("/api/billing/checkout", authMiddleware, async (req, res, next) => {
  if (!req.user.tenantId) return res.status(403).json({ error: "Tenant context required." });
  if (!YOCO_SECRET_KEY) return res.status(503).json({ error: "Yoco is not configured. Set YOCO_SECRET_KEY in .env." });
  const { plan, successUrl, cancelUrl } = req.body;
  const planConfig = YOCO_PLANS[plan];
  if (!planConfig) return res.status(400).json({ error: `Invalid plan: ${plan}. Use solo, practice or firm.` });
  try {
    const baseUrl = process.env.VITE_APP_URL || "https://lawpath.co.za";
    const yocoRes = await fetch(`${YOCO_API}/checkouts`, {
      method: "POST",
      headers: { "Authorization": `Bearer ${YOCO_SECRET_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        amount: planConfig.priceCents,
        currency: "ZAR",
        successUrl: successUrl || `${baseUrl}/?billing=success&plan=${plan}`,
        cancelUrl: cancelUrl || `${baseUrl}/?billing=cancelled`,
        metadata: { tenantId: req.user.tenantId, plan, userId: req.user.sub }
      })
    });
    if (!yocoRes.ok) {
      const err = await yocoRes.text();
      console.error("[yoco checkout] Failed:", err);
      return res.status(502).json({ error: "Yoco checkout creation failed. Check YOCO_SECRET_KEY." });
    }
    const yocoData = await yocoRes.json();
    const now = new Date();
    const periodEnd = new Date(now); periodEnd.setDate(periodEnd.getDate() + 30);
    await pool.query(
      `insert into yoco_subscriptions (tenant_id, yoco_checkout_id, plan, plan_status, current_period_start, current_period_end, monthly_price_cents)
       values ($1,$2,$3,'pending',$4,$5,$6)
       on conflict (tenant_id) do update set yoco_checkout_id=$2, plan=$3, plan_status='pending', current_period_start=$4, current_period_end=$5, monthly_price_cents=$6, updated_at=now()`,
      [req.user.tenantId, yocoData.id, plan, now, periodEnd, planConfig.priceCents]
    );
    res.json({ checkoutUrl: yocoData.redirectUrl, checkoutId: yocoData.id });
  } catch (error) { next(error); }
});

app.post("/api/billing/portal", authMiddleware, async (req, res, next) => {
  // Yoco doesn't have a managed billing portal like Stripe.
  // Direct users to the Yoco merchant dashboard.
  res.json({ portalUrl: "https://payments.yoco.com/", note: "Manage your subscription directly at payments.yoco.com" });
});

app.post("/api/billing/webhook", async (req, res, next) => {
  // Yoco webhook signature verification (HMAC-SHA256)
  // Replicated from geodex/SpellGameKit production implementation.
  const webhookId = req.headers["webhook-id"];
  const webhookTimestamp = req.headers["webhook-timestamp"];
  const webhookSignature = req.headers["webhook-signature"];
  const webhookSecret = process.env.YOCO_WEBHOOK_SECRET || "";

  if (!webhookId || !webhookTimestamp || !webhookSignature) {
    return res.status(400).json({ error: "Missing Yoco webhook headers." });
  }

  // Replay attack prevention — reject events older than 3 minutes
  const timeDiff = Math.abs(Math.floor(Date.now() / 1000) - parseInt(String(webhookTimestamp), 10));
  if (timeDiff > 180) {
    return res.status(400).json({ error: "Webhook timestamp out of range." });
  }

  if (webhookSecret) {
    const rawBody = typeof req.body === "string" ? req.body : JSON.stringify(req.body);
    const signedContent = `${webhookId}.${webhookTimestamp}.${rawBody}`;
    // Yoco secret format: whsec_<base64> — strip the prefix before decoding
    const secretBytes = Buffer.from((String(webhookSecret).split("_")[1] || webhookSecret), "base64");
    const expectedSig = crypto.createHmac("sha256", secretBytes).update(signedContent).digest("base64");
    const providedSig = String(webhookSignature).split(" ")[0]?.split(",")[1] || "";
    const expBuf = Buffer.from(expectedSig);
    const provBuf = Buffer.from(providedSig);
    if (expBuf.length !== provBuf.length || !crypto.timingSafeEqual(expBuf, provBuf)) {
      console.error("[yoco webhook] Signature verification failed");
      return res.status(403).json({ error: "Invalid webhook signature." });
    }
  }

  const event = req.body;
  const webhookIdStr = String(webhookId || `yoco_${Date.now()}`);
  await pool.query(
    "insert into yoco_webhook_events (webhook_id, event_type, raw_payload) values ($1,$2,$3) on conflict (webhook_id) do nothing",
    [webhookIdStr, event.type || "unknown", event]
  ).catch(() => {});

  try {
    const payload = event.payload || {};
    const metadata = payload.metadata || {};
    const checkoutId = metadata.checkoutId || payload.id;
    const tenantId = metadata.tenantId;

    if (event.type === "payment.succeeded") {
      if (tenantId) {
        const plan = metadata.plan || "solo";
        const now = new Date(); const periodEnd = new Date(); periodEnd.setDate(now.getDate() + 30);
        await pool.query("update tenants set plan=$2, plan_status='active' where id=$1", [tenantId, plan]);
        await pool.query(
          "update yoco_subscriptions set plan_status='active', current_period_start=$2, current_period_end=$3, updated_at=now() where tenant_id=$1",
          [tenantId, now, periodEnd]
        );
        console.info(`[yoco] Subscription activated: tenant ${tenantId}, plan ${plan}`);
      } else if (checkoutId) {
        // Look up by checkout ID if tenantId not in metadata
        await pool.query("update yoco_subscriptions set plan_status='active', updated_at=now() where yoco_checkout_id=$1", [checkoutId]);
        const sub = await pool.query("select tenant_id, plan from yoco_subscriptions where yoco_checkout_id=$1", [checkoutId]);
        if (sub.rowCount) await pool.query("update tenants set plan=$2, plan_status='active' where id=$1", [sub.rows[0].tenant_id, sub.rows[0].plan]);
      }
    } else if (event.type === "payment.failed") {
      if (tenantId) {
        await pool.query("update tenants set plan_status='past_due' where id=$1", [tenantId]);
        await pool.query("update yoco_subscriptions set plan_status='past_due', updated_at=now() where tenant_id=$1", [tenantId]);
      } else if (checkoutId) {
        const sub = await pool.query("select tenant_id from yoco_subscriptions where yoco_checkout_id=$1", [checkoutId]);
        if (sub.rowCount) {
          await pool.query("update tenants set plan_status='past_due' where id=$1", [sub.rows[0].tenant_id]);
          await pool.query("update yoco_subscriptions set plan_status='past_due', updated_at=now() where yoco_checkout_id=$1", [checkoutId]);
        }
      }
      console.info("[yoco] Payment failed:", { checkoutId, tenantId, reason: payload.failureReason });
    } else if (event.type === "refund.succeeded") {
      if (tenantId) {
        await pool.query("update tenants set plan_status='cancelled' where id=$1", [tenantId]);
        await pool.query("update yoco_subscriptions set plan_status='cancelled', updated_at=now() where tenant_id=$1", [tenantId]);
      }
      console.info("[yoco] Refund succeeded — subscription cancelled:", { checkoutId, tenantId });
    }

    await pool.query("update yoco_webhook_events set processed=true where webhook_id=$1", [webhookIdStr]).catch(() => {});
  } catch (err) {
    console.error("[yoco webhook] Processing error:", err.message);
    await pool.query("update yoco_webhook_events set error_message=$2 where webhook_id=$1", [webhookIdStr, err.message]).catch(() => {});
  }
  res.status(200).json({ received: true });
});

// Wire notifications into conveyancing stage advance
app.post("/api/conveyancing/matters/:id/stage/notify", authMiddleware, async (req, res, next) => {
  if (!req.user.tenantId) return res.status(403).json({ error: "Tenant context required." });
  const { stageLabel, sellerName, buyerName, matterRef } = req.body;
  try {
    await notifyConveyancingStageAdvance({ tenantId: req.user.tenantId, matterRef, sellerName, buyerName, stage: req.body.stage, stageLabel, attorney: req.user.email });
    res.json({ ok: true });
  } catch (error) { next(error); }
});

// ─── CLIENTS (CRM) ────────────────────────────────────────────────────────────

// camelCase ↔ snake_case helpers
function clientRowToJson(r) {
  if (!r) return null;
  return {
    id: r.id, tenantId: r.tenant_id,
    clientType: r.client_type, clientCategory: r.client_category,
    firstName: r.first_name || "", lastName: r.last_name || "", fullName: r.full_name,
    saIdNumber: r.sa_id_number || "", passportNumber: r.passport_number || "",
    passportCountry: r.passport_country || "", dateOfBirth: r.date_of_birth ? r.date_of_birth.toISOString().slice(0,10) : "",
    gender: r.gender || "", nationality: r.nationality || "South African", incomeTaxRef: r.income_tax_ref || "",
    registeredName: r.registered_name || "", tradingName: r.trading_name || "",
    registrationNumber: r.registration_number || "", registrationDate: r.registration_date ? r.registration_date.toISOString().slice(0,10) : "",
    vatNumber: r.vat_number || "",
    email: r.email || "", emailAlt: r.email_alt || "", mobile: r.mobile || "",
    phoneLandline: r.phone_landline || "", whatsappNumber: r.whatsapp_number || "",
    preferredContact: r.preferred_contact || "email",
    addressLine1: r.address_line1 || "", addressLine2: r.address_line2 || "",
    suburb: r.suburb || "", city: r.city || "", province: r.province || "",
    postalCode: r.postal_code || "", country: r.country || "South Africa",
    postalSameAsPhysical: r.postal_same_as_physical !== false,
    postalLine1: r.postal_line1 || "", postalLine2: r.postal_line2 || "",
    postalSuburb: r.postal_suburb || "", postalCity: r.postal_city || "",
    postalProvince: r.postal_province || "", postalCodePost: r.postal_code_post || "",
    ficaStatus: r.fica_status || "pending", ficaVerifiedAt: r.fica_verified_at || "",
    ficaExpiresAt: r.fica_expires_at || "", riskRating: r.risk_rating || "unrated",
    isPep: r.is_pep || false, pepDetails: r.pep_details || "",
    sanctionsCheckedAt: r.sanctions_checked_at || "", sanctionsClear: r.sanctions_clear,
    sourceOfFunds: r.source_of_funds || "", sourceOfWealth: r.source_of_wealth || "",
    natureOfBusiness: r.nature_of_business || "",
    conflictsChecked: r.conflicts_checked || false, conflictsCheckedAt: r.conflicts_checked_at || "",
    conflictsCheckedBy: r.conflicts_checked_by || "", conflictsNotes: r.conflicts_notes || "",
    defaultRateCents: r.default_rate_cents || 0, billingEmail: r.billing_email || "",
    paymentTermsDays: r.payment_terms_days || 30, creditLimitCents: r.credit_limit_cents || 0,
    relationshipPartner: r.relationship_partner || "", originatingAttorney: r.originating_attorney || "",
    clientSince: r.client_since ? r.client_since.toISOString().slice(0,10) : "",
    referralSource: r.referral_source || "", tags: r.tags || [],
    portalEmail: r.portal_email || "", portalActive: r.portal_active || false,
    internalNotes: r.internal_notes || "",
    archivedAt: r.archived_at || "", createdAt: r.created_at, updatedAt: r.updated_at,
  };
}

app.get("/api/clients", authMiddleware, async (req, res, next) => {
  if (!req.user.tenantId) return res.status(403).json({ error: "Tenant context required." });
  try {
    const { search, category, ficaStatus, clientType, limit = 100, offset = 0 } = req.query;
    const conditions = ["tenant_id=$1", "archived_at is null"];
    const params = [req.user.tenantId];
    if (search) {
      params.push(`%${search}%`);
      conditions.push(`(full_name ilike $${params.length} or email ilike $${params.length} or mobile ilike $${params.length} or registration_number ilike $${params.length})`);
    }
    if (category) { params.push(category); conditions.push(`client_category=$${params.length}`); }
    if (ficaStatus) { params.push(ficaStatus); conditions.push(`fica_status=$${params.length}`); }
    if (clientType) { params.push(clientType); conditions.push(`client_type=$${params.length}`); }
    const where = conditions.join(" and ");
    const rows = await pool.query(
      `select * from clients where ${where} order by full_name asc limit $${params.length+1} offset $${params.length+2}`,
      [...params, parseInt(limit), parseInt(offset)]
    );
    const count = await pool.query(`select count(*) from clients where ${where}`, params);
    res.json({ clients: rows.rows.map(clientRowToJson), total: parseInt(count.rows[0].count) });
  } catch (error) { next(error); }
});

app.get("/api/clients/:id", authMiddleware, async (req, res, next) => {
  if (!req.user.tenantId) return res.status(403).json({ error: "Tenant context required." });
  try {
    const row = await pool.query("select * from clients where id=$1 and tenant_id=$2", [req.params.id, req.user.tenantId]);
    if (!row.rows[0]) return res.status(404).json({ error: "Client not found." });
    res.json({ client: clientRowToJson(row.rows[0]) });
  } catch (error) { next(error); }
});

app.post("/api/clients", authMiddleware, async (req, res, next) => {
  if (!req.user.tenantId) return res.status(403).json({ error: "Tenant context required." });
  try {
    const b = req.body;
    if (!b.fullName?.trim()) return res.status(400).json({ error: "Full name is required." });
    const row = await pool.query(
      `insert into clients (tenant_id,client_type,client_category,first_name,last_name,full_name,
        sa_id_number,passport_number,passport_country,date_of_birth,gender,nationality,income_tax_ref,
        registered_name,trading_name,registration_number,registration_date,vat_number,
        email,email_alt,mobile,phone_landline,whatsapp_number,preferred_contact,
        address_line1,address_line2,suburb,city,province,postal_code,country,
        postal_same_as_physical,postal_line1,postal_line2,postal_suburb,postal_city,postal_province,postal_code_post,
        fica_status,risk_rating,is_pep,pep_details,source_of_funds,source_of_wealth,nature_of_business,
        conflicts_checked,conflicts_notes,default_rate_cents,billing_email,payment_terms_days,credit_limit_cents,
        relationship_partner,originating_attorney,client_since,referral_source,client_category,tags,
        portal_email,portal_active,internal_notes)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,
               $25,$26,$27,$28,$29,$30,$31,$32,$33,$34,$35,$36,$37,$38,$39,$40,$41,$42,$43,$44,$45,
               $46,$47,$48,$49,$50,$51,$52,$53,$54,$55,$56,$57,$58,$59)
       returning *`,
      [req.user.tenantId, b.clientType||'natural_person', b.clientCategory||'standard',
       b.firstName||null, b.lastName||null, b.fullName.trim(),
       b.saIdNumber||null, b.passportNumber||null, b.passportCountry||null,
       b.dateOfBirth||null, b.gender||null, b.nationality||'South African', b.incomeTaxRef||null,
       b.registeredName||null, b.tradingName||null, b.registrationNumber||null, b.registrationDate||null, b.vatNumber||null,
       b.email||null, b.emailAlt||null, b.mobile||null, b.phoneLandline||null, b.whatsappNumber||null, b.preferredContact||'email',
       b.addressLine1||null, b.addressLine2||null, b.suburb||null, b.city||null, b.province||null, b.postalCode||null, b.country||'South Africa',
       b.postalSameAsPhysical !== false, b.postalLine1||null, b.postalLine2||null, b.postalSuburb||null, b.postalCity||null, b.postalProvince||null, b.postalCodePost||null,
       b.ficaStatus||'pending', b.riskRating||'unrated', b.isPep||false, b.pepDetails||null, b.sourceOfFunds||null, b.sourceOfWealth||null, b.natureOfBusiness||null,
       b.conflictsChecked||false, b.conflictsNotes||null, b.defaultRateCents||0, b.billingEmail||null, b.paymentTermsDays||30, b.creditLimitCents||0,
       b.relationshipPartner||null, b.originatingAttorney||null, b.clientSince||null, b.referralSource||null, b.clientCategory||'standard', b.tags||[],
       b.portalEmail||null, b.portalActive||false, b.internalNotes||null]
    );
    res.status(201).json({ client: clientRowToJson(row.rows[0]) });
  } catch (error) { next(error); }
});

app.patch("/api/clients/:id", authMiddleware, async (req, res, next) => {
  if (!req.user.tenantId) return res.status(403).json({ error: "Tenant context required." });
  try {
    const b = req.body;
    const fieldMap = {
      clientType: 'client_type', clientCategory: 'client_category',
      firstName: 'first_name', lastName: 'last_name', fullName: 'full_name',
      saIdNumber: 'sa_id_number', passportNumber: 'passport_number', passportCountry: 'passport_country',
      dateOfBirth: 'date_of_birth', gender: 'gender', nationality: 'nationality', incomeTaxRef: 'income_tax_ref',
      registeredName: 'registered_name', tradingName: 'trading_name', registrationNumber: 'registration_number',
      registrationDate: 'registration_date', vatNumber: 'vat_number',
      email: 'email', emailAlt: 'email_alt', mobile: 'mobile', phoneLandline: 'phone_landline',
      whatsappNumber: 'whatsapp_number', preferredContact: 'preferred_contact',
      addressLine1: 'address_line1', addressLine2: 'address_line2', suburb: 'suburb',
      city: 'city', province: 'province', postalCode: 'postal_code', country: 'country',
      postalSameAsPhysical: 'postal_same_as_physical', postalLine1: 'postal_line1', postalLine2: 'postal_line2',
      postalSuburb: 'postal_suburb', postalCity: 'postal_city', postalProvince: 'postal_province', postalCodePost: 'postal_code_post',
      ficaStatus: 'fica_status', ficaVerifiedAt: 'fica_verified_at', ficaExpiresAt: 'fica_expires_at',
      riskRating: 'risk_rating', isPep: 'is_pep', pepDetails: 'pep_details',
      sanctionsCheckedAt: 'sanctions_checked_at', sanctionsClear: 'sanctions_clear',
      sourceOfFunds: 'source_of_funds', sourceOfWealth: 'source_of_wealth', natureOfBusiness: 'nature_of_business',
      conflictsChecked: 'conflicts_checked', conflictsCheckedAt: 'conflicts_checked_at',
      conflictsCheckedBy: 'conflicts_checked_by', conflictsNotes: 'conflicts_notes',
      defaultRateCents: 'default_rate_cents', billingEmail: 'billing_email',
      paymentTermsDays: 'payment_terms_days', creditLimitCents: 'credit_limit_cents',
      relationshipPartner: 'relationship_partner', originatingAttorney: 'originating_attorney',
      clientSince: 'client_since', referralSource: 'referral_source', tags: 'tags',
      portalEmail: 'portal_email', portalActive: 'portal_active', internalNotes: 'internal_notes',
    };
    const sets = []; const params = [req.params.id, req.user.tenantId];
    for (const [jsKey, dbCol] of Object.entries(fieldMap)) {
      if (b[jsKey] !== undefined) { params.push(b[jsKey]); sets.push(`${dbCol}=$${params.length}`); }
    }
    if (!sets.length) return res.status(400).json({ error: "No fields to update." });
    sets.push("updated_at=now()");
    const row = await pool.query(
      `update clients set ${sets.join(",")} where id=$1 and tenant_id=$2 returning *`, params
    );
    if (!row.rows[0]) return res.status(404).json({ error: "Client not found." });
    res.json({ client: clientRowToJson(row.rows[0]) });
  } catch (error) { next(error); }
});

app.post("/api/clients/:id/archive", authMiddleware, async (req, res, next) => {
  if (!req.user.tenantId) return res.status(403).json({ error: "Tenant context required." });
  try {
    const row = await pool.query(
      "update clients set archived_at=now(), updated_at=now() where id=$1 and tenant_id=$2 returning *",
      [req.params.id, req.user.tenantId]
    );
    if (!row.rows[0]) return res.status(404).json({ error: "Client not found." });
    res.json({ client: clientRowToJson(row.rows[0]) });
  } catch (error) { next(error); }
});

app.use((error, _req, res, _next) => {
  console.error(error);
  const schemaMessage = explainSettingsDatabaseError(error);
  const statusCode = error.statusCode || 500;
  const message = error.expose ? error.message : schemaMessage || "Server error.";
  res.status(statusCode).json({ error: message });
});

app.listen(port, () => {
  console.log(`LawPath API listening on port ${port}`);
});
