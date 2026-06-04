require("dotenv").config();

const crypto = require("crypto");
const express = require("express");
const cors = require("cors");
const bcrypt = require("bcryptjs");
const { pool } = require("./db");
const { authMiddleware, signToken } = require("./auth");
const { sendTransactionalEmail } = require("./mailer");

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
    logoDataUrl: row.logo_data_url || "",
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
    const result = await pool.query(
      `insert into tenant_profiles
        (tenant_id, trading_name, practice_type, address_line_1, address_line_2, city, province, postal_code,
         phone, website, lpc_registration_number, company_registration_number, vat_number, conveyancer_count,
         senior_attorney_count, junior_attorney_count, candidate_attorney_count, legal_secretary_count,
         logo_data_url, onboarding_completed, onboarding_step)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21)
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
        profile.logoDataUrl || "",
        Boolean(profile.onboardingCompleted),
        Number(profile.onboardingStep || 1)
      ]
    );

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
  const { name, scope, sourceType, documentCount, sourceUrl, fileName, mimeType, extractedText } = req.body;

  if (!name || !scope || !sourceType) {
    return res.status(400).json({ error: "Source name, scope and source type are required." });
  }

  const tenantId = scope === "Tenant private" ? req.user.tenantId : null;

  if (scope === "Tenant private" && !tenantId) {
    return res.status(403).json({ error: "Tenant private sources require tenant context." });
  }

  try {
    const summary = extractedText
      ? String(extractedText).replace(/\s+/g, " ").slice(0, 900)
      : sourceUrl
        ? `Web source queued for server-side retrieval and legal relevance extraction: ${sourceUrl}`
        : "Source queued for document extraction.";

    const source = await pool.query(
      `insert into rag_sources
        (tenant_id, name, scope, source_type, status, document_count, source_url, original_file_name, mime_type,
         extraction_summary, metadata, created_by)
       values ($1, $2, $3, $4, 'Queued', $5, $6, $7, $8, $9, $10, $11)
       returning *`,
      [
        tenantId,
        name,
        scope,
        sourceType,
        Number(documentCount || 1),
        sourceUrl || null,
        fileName || null,
        mimeType || null,
        summary,
        { sourceUrl: sourceUrl || null, fileName: fileName || null },
        req.user.sub
      ]
    );

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

app.use((error, _req, res, _next) => {
  console.error(error);
  res.status(500).json({ error: "Server error." });
});

app.listen(port, () => {
  console.log(`LawPath API listening on port ${port}`);
});
