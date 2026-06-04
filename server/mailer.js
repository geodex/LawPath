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

function requireSmtpConfig() {
  const missing = ["SMTP_HOST", "SMTP_USERNAME", "SMTP_PASSWORD"].filter((key) => !process.env[key]);

  if (missing.length) {
    throw new Error(`SMTP is not configured. Missing ${missing.join(", ")}.`);
  }
}

function createTransporter() {
  requireSmtpConfig();

  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: smtpPort(),
    secure: smtpSecure(),
    auth: {
      user: process.env.SMTP_USERNAME,
      pass: process.env.SMTP_PASSWORD
    }
  });
}

async function sendTransactionalEmail({ to, subject, text, html, tenantFromName, tenantFromEmail, replyTo }) {
  const transporter = createTransporter();
  const platformFromEmail = process.env.SMTP_FROM_EMAIL || process.env.SMTP_USERNAME;
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
