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
```

## Run

```bash
npm run start:api
```

## Notes

Registration creates:

- a tenant
- a tenant admin user
- tenant email identity
- activity log entry

Forgot password currently creates a reset token record. SMTP sending will be connected to `platform_smtp_settings` in a later backend step.
