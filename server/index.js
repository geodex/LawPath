require("dotenv").config();

const crypto = require("crypto");
const express = require("express");
const cors = require("cors");
const bcrypt = require("bcryptjs");
const { pool } = require("./db");
const { authMiddleware, signToken } = require("./auth");
const { sendTransactionalEmail } = require("./mailer");
const { configuredBucketName, safeObjectPart, uploadDataUrl, uploadText } = require("./gcs");

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
    onboardingStep: Number(row.onboarding_step || 1)
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
    grokModel: byProvider.grok?.default_model || "grok-4"
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

    const result = await pool.query(
      `insert into tenant_profiles
        (tenant_id, trading_name, practice_type, address_line_1, address_line_2, city, province, postal_code,
         phone, website, lpc_registration_number, company_registration_number, vat_number, conveyancer_count,
         senior_attorney_count, junior_attorney_count, candidate_attorney_count, legal_secretary_count,
         logo_data_url, logo_storage_uri, logo_public_url, onboarding_completed, onboarding_step)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23)
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
        Number(profile.onboardingStep || 1)
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
    ["grok", settings.grokApiKey || "", settings.grokModel || "grok-4", null]
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
  const { name, scope, sourceType, documentCount, sourceUrl, fileName, mimeType, extractedText, fileDataUrl } = req.body;

  if (!name || !scope || !sourceType) {
    return res.status(400).json({ error: "Source name, scope and source type are required." });
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
      `insert into popia_dsr_requests (tenant_id, request_type, requestor_name, requestor_email, description)
       values ($1,$2,$3,$4,$5) returning *`,
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

// ─── WHATSAPP ─────────────────────────────────────────────────────────────────

const DEFAULT_WA_TEMPLATES = [
  { name: "Transfer lodged", category: "transfer_update", body: "Good day {{client_name}}, your transfer ({{matter_ref}}) has been lodged at the Deeds Office. Registration is expected within 8-10 working days.", variables: ["client_name", "matter_ref"] },
  { name: "Transfer registered", category: "transfer_update", body: "Congratulations {{client_name}}! Your property transfer ({{matter_ref}}) has been registered. The title deed will be forwarded in due course.", variables: ["client_name", "matter_ref"] },
  { name: "FICA documents required", category: "fica_request", body: "Dear {{client_name}}, we still require FICA documents for matter {{matter_ref}}: {{documents_required}}. Please forward at your earliest convenience.", variables: ["client_name", "matter_ref", "documents_required"] },
  { name: "Appointment reminder", category: "appointment_reminder", body: "Dear {{client_name}}, reminder of your appointment on {{date}} at {{time}}. Please reply to confirm.", variables: ["client_name", "date", "time"] },
  { name: "Payment reminder", category: "payment_reminder", body: "Dear {{client_name}}, invoice {{invoice_number}} for R {{amount}} is outstanding. Please arrange payment.", variables: ["client_name", "invoice_number", "amount"] }
];

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

app.post("/api/whatsapp/send", authMiddleware, async (req, res, next) => {
  if (!req.user.tenantId) return res.status(403).json({ error: "Tenant context required." });
  const { contactId, messageBody, templateId, matterRef } = req.body;
  if (!contactId || !messageBody) return res.status(400).json({ error: "Contact and message body are required." });
  try {
    const result = await pool.query(
      "insert into whatsapp_messages (tenant_id, contact_id, matter_ref, direction, message_body, template_id, status, created_by) values ($1,$2,$3,'outbound',$4,$5,'sent',$6) returning *",
      [req.user.tenantId, contactId, matterRef || null, messageBody, templateId || null, req.user.sub]
    );
    const contact = await pool.query("select client_name, phone_number from whatsapp_contacts where id = $1", [contactId]);
    const row = { ...result.rows[0], client_name: contact.rows[0]?.client_name || "", phone_number: contact.rows[0]?.phone_number || "" };
    res.status(201).json({ message: waMessageFromRow(row) });
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
    if (apiKey) {
      (async () => {
        try {
          await pool.query("update document_analyses set analysis_status='Analysing' where id=$1", [analysis.id]);
          const prompt = `Analyse this South African legal document and return ONLY valid JSON with these fields: documentType (string), parties (string array), keyDates (array of {label,date}), obligations (string array of obligations), riskFlags (string array of risks), saLawFlags (string array of SA-specific flags like voetstoots, CPA, NCA, POPIA), summary (2-3 sentence plain English summary). Document name: ${fileName}. Content: ${fileDataUrl ? "See attached" : "Analyse by filename only."}`;
          const aiRes = await fetch("https://api.openai.com/v1/responses", { method: "POST", headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" }, body: JSON.stringify({ model, input: [{ role: "user", content: prompt }] }) });
          const payload = await aiRes.json();
          const text = payload.output_text || payload.output?.flatMap(i => i.content || []).map(p => p.text || "").join("") || "{}";
          const jsonMatch = text.match(/\{[\s\S]*\}/);
          const parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : {};
          await pool.query("update document_analyses set analysis_status='Complete', document_type=$2, parties=$3, key_dates=$4, obligations=$5, risk_flags=$6, sa_law_flags=$7, summary=$8, ai_model=$9, analysed_at=now() where id=$1", [analysis.id, parsed.documentType || "Unknown", parsed.parties || [], JSON.stringify(parsed.keyDates || []), parsed.obligations || [], parsed.riskFlags || [], parsed.saLawFlags || [], parsed.summary || "", model]);
        } catch (e) {
          await pool.query("update document_analyses set analysis_status='Failed' where id=$1", [analysis.id]);
        }
      })();
    } else {
      await pool.query("update document_analyses set analysis_status='Failed', summary='No OpenAI API key configured. Add one under Settings.' where id=$1", [analysis.id]);
    }
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
