# LawPath SA Deployment Notes

This project is a Vite React frontend that builds into static files under `dist/`. That makes it easy to move from this Windows workspace to Ubuntu 22.04 with Virtualmin Pro and Apache.

## Local Build

```powershell
npm.cmd install
npm.cmd run build
```

The deployable output is:

```text
dist/
```

## Ubuntu 22.04 / Virtualmin / Apache

1. Upload the project to the server, for example:

   ```bash
   /home/YOUR_DOMAIN/public_html/lawpath
   ```

2. Install Node.js LTS on the server if you want to build on Ubuntu. If you build locally, you only need to upload `dist/`.

3. From the project folder on the server:

   ```bash
   npm ci
   npm run build
   ```

4. Point the Virtualmin website document root to the built files:

   ```text
   /home/YOUR_DOMAIN/public_html/lawpath/dist
   ```

5. Ensure Apache allows `.htaccess` overrides for the site so SPA routes can fall back to `index.html`.

   The project includes:

   ```text
   public/.htaccess
   ```

   Vite copies it into `dist/.htaccess` during build.

## Backend API

The app now includes a Node API in:

```text
server/
```

Create a server-side `.env` file on Ubuntu. Do not commit it:

```bash
cd /home2/app/LawPath
cp .env.example .env
nano .env
```

For `lawpath.co.za`, use the template at:

```text
deploy/lawpath.co.za.env.example
```

Copy it to the live server:

```bash
cp deploy/lawpath.co.za.env.example .env
nano .env
```

Set at least:

```bash
PORT=3069
NODE_ENV=production
DATABASE_URL=postgresql://lawpath:YOUR_PASSWORD@127.0.0.1:5432/lawpath
SESSION_SECRET=replace_with_a_long_random_value
JWT_EXPIRES_IN=7d
CORS_ORIGIN=https://lawpath.co.za
```

Start the API manually for a smoke test:

```bash
npm run start:api
```

Then check:

```bash
curl http://127.0.0.1:3069/api/health
```

Create the first platform super admin:

```bash
cd /home2/lawpath/app/LawPath
SUPER_ADMIN_NAME="Your Name" \
SUPER_ADMIN_EMAIL="you@lawpath.co.za" \
SUPER_ADMIN_PASSWORD="a-long-secure-password" \
npm run create-super-admin
```

For production, run the API under PM2, and configure Apache to proxy `/api` to `http://127.0.0.1:3069`.

### PM2 Process Manager

The repo includes:

```text
ecosystem.config.cjs
```

It runs the API as `lawpath-api` from:

```text
/home2/lawpath/app/LawPath
```

on port:

```text
3069
```

Install PM2 globally on the server:

```bash
npm install -g pm2
```

Start the API:

```bash
cd /home2/lawpath/app/LawPath
mkdir -p logs
pm2 start ecosystem.config.cjs
pm2 status
```

Save the process list:

```bash
pm2 save
```

Enable startup after reboot:

```bash
pm2 startup
```

PM2 will print a command beginning with `sudo env ...`. Copy and run that printed command, then run:

```bash
pm2 save
```

Useful commands:

```bash
pm2 logs lawpath-api
pm2 restart lawpath-api
pm2 stop lawpath-api
pm2 delete lawpath-api
```

Example Apache proxy rules inside the VirtualHost:

```apache
ProxyPreserveHost On
ProxyPass /api http://127.0.0.1:3069/api
ProxyPassReverse /api http://127.0.0.1:3069/api
```

Ensure these Apache modules are enabled:

```bash
sudo a2enmod proxy proxy_http rewrite headers
sudo systemctl reload apache2
```

## Important SaaS Rule

Do not put secrets in the Vite frontend. Anything prefixed with `VITE_` is visible in the browser.

Keep these only in the future backend environment:

- PostgreSQL connection string
- SMTP credentials
- OpenAI API key
- Gemini API key
- Grok API key
- ExchangeRates API key
- Session/JWT secrets

## PostgreSQL Direction

For the SaaS backend, use tenant-aware tables from the start. Every tenant-owned table should include:

```sql
tenant_id uuid not null
```

Future backend services should always scope reads and writes by the authenticated user tenant. Super-admin tables for platform AI keys and SMTP infrastructure should not be tenant-readable.

Suggested separation:

- `platform_settings`: super-admin only, SMTP transport and AI provider credentials.
- `tenants`: law firm/company records.
- `tenant_email_identities`: tenant-controlled from name, from email, reply-to and portal signature.
- `users`: tenant users.
- `matters`, `contracts`, `invoices`, `appointments`, `portal_invites`: tenant-scoped data.

The initial schema is prepared at:

```text
db/migrations/001_initial_saas_schema.sql
```

Apply it on the Ubuntu server with:

```bash
createdb lawpath
psql -d lawpath -f db/migrations/001_initial_saas_schema.sql
```

## Recommended Deployment Flow

The repo includes a deployment helper:

```bash
deploy.sh
```

Because the first two migrations were applied manually before migration tracking existed, run this once on the server:

```bash
cd /home2/lawpath/app/LawPath
bash deploy.sh --baseline
```

For each release after that:

```bash
cd /home2/lawpath/app/LawPath
bash deploy.sh
```

Then confirm Apache serves:

```text
https://your-domain.co.za/
```

## Current State

The current app uses mocked frontend state for auth, settings and workspace data. That is expected at this stage. Before production, add a backend API for:

- login, registration and forgot password
- tenant creation
- PostgreSQL persistence
- SMTP sending
- super-admin secret storage
- tenant authorization checks
