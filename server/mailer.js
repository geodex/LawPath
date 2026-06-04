const nodemailer = require("nodemailer");

function smtpPort() {
  return Number(process.env.SMTP_PORT || 587);
}

function smtpSecure() {
  if (process.env.SMTP_SECURE) {
    return process.env.SMTP_SECURE === "true";
  }

  return smtpPort() === 465;
}

function requireSmtpConfig(settings = {}) {
  const values = {
    SMTP_HOST: settings.host || process.env.SMTP_HOST,
    SMTP_USERNAME: settings.username || process.env.SMTP_USERNAME,
    SMTP_PASSWORD: settings.password || process.env.SMTP_PASSWORD
  };
  const missing = Object.entries(values).filter(([, value]) => !value).map(([key]) => key);

  if (missing.length) {
    throw new Error(`SMTP is not configured. Missing ${missing.join(", ")}.`);
  }
}

function createTransporter(settings = {}) {
  requireSmtpConfig(settings);
  const port = Number(settings.port || smtpPort());
  const secure = settings.encryption === "SSL" || settings.secure === true || (!settings.encryption && smtpSecure());

  return nodemailer.createTransport({
    host: settings.host || process.env.SMTP_HOST,
    port,
    secure,
    auth: {
      user: settings.username || process.env.SMTP_USERNAME,
      pass: settings.password || process.env.SMTP_PASSWORD
    }
  });
}

async function sendTransactionalEmail({ to, subject, text, html, tenantFromName, tenantFromEmail, replyTo, smtpSettings }) {
  const transporter = createTransporter(smtpSettings);
  const platformFromEmail = process.env.SMTP_FROM_EMAIL || smtpSettings?.username || process.env.SMTP_USERNAME;
  const safeFromName = tenantFromName || process.env.SMTP_FROM_NAME || "LawPath SA";

  return transporter.sendMail({
    from: `${safeFromName} <${platformFromEmail}>`,
    to,
    replyTo: replyTo || tenantFromEmail || platformFromEmail,
    subject,
    text,
    html,
    envelope: {
      from: platformFromEmail,
      to
    }
  });
}

module.exports = { sendTransactionalEmail };
