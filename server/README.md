# LawPath API

Node/Express API for the LawPath SaaS backend.

## Current Endpoints

- `GET /api/health`
- `POST /api/auth/register`
- `POST /api/auth/login`
- `POST /api/auth/forgot-password`
- `GET /api/me`
- `GET /api/tenant/email-identity`
- `PUT /api/tenant/email-identity`
- `POST /api/email/test`

## Environment

Required:

```bash
DATABASE_URL=postgresql://lawpath:password@127.0.0.1:5432/lawpath
SESSION_SECRET=long_random_secret
```

Optional:

```bash
PORT=3001
JWT_EXPIRES_IN=7d
CORS_ORIGIN=https://your-domain.co.za
DATABASE_SSL=false
SMTP_HOST=smtp.example.co.za
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USERNAME=notifications@example.co.za
SMTP_PASSWORD=change_me
SMTP_FROM_EMAIL=notifications@example.co.za
SMTP_FROM_NAME=LawPath SA
```

## Run

```bash
npm run start:api
```

## Create First Super Admin

Set environment variables in the shell, then run:

```bash
SUPER_ADMIN_NAME="Your Name" \
SUPER_ADMIN_EMAIL="you@lawpath.co.za" \
SUPER_ADMIN_PASSWORD="a-long-secure-password" \
npm run create-super-admin
```

This creates or updates a `platform_super_admin` user with no tenant.

## Notes

Registration creates:

- a tenant
- a tenant admin user
- tenant email identity
- activity log entry

Forgot password currently creates a reset token record. Test email delivery uses the SMTP environment variables above, records the result in `email_events`, and applies the tenant sender identity as the display name/reply-to while the authorised LawPath SMTP address remains the actual envelope sender.
