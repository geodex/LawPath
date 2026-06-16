# LawPath SA — Replit Agent Notes

This is a production SaaS for South African law firms, actively maintained by both
the project owner working with Claude Code and Replit Agent on the same repository.
**Read `docs/memory/MEMORY.md` and the files it links to before making changes** —
they contain project history, architecture decisions, and pitfalls already hit in
production. Treat them as current context, not optional background reading.

## Critical things to know before touching this repo

1. **Two agents share this repo.** Claude Code sessions and Replit Agent sessions
   both commit directly to `main` and deploy to the same production server. Avoid
   committing large unrelated scaffolding (UI mockup sandboxes, skill/config files,
   experimental directories) into the main tree without flagging it — it bloats pulls
   and has already caused confusion during deploys. If you generate exploratory or
   sandboxed work, keep it out of commits to `main` unless it's actually shipping.

2. **Never let `npm install`/`npm ci` bake Replit-internal proxy URLs into
   `package-lock.json`.** Replit's sandboxed npm registry sometimes resolves package
   tarballs through `http://package-firewall.replit.local/npm/...`, an internal proxy
   host that does NOT resolve outside Replit's network. If that URL appears in
   `"resolved"` fields in `package-lock.json`, the production server's `npm ci` will
   fail with `ENOTFOUND` (looks like an indefinite hang due to npm's retry/backoff).
   Before committing a `package-lock.json` change, grep it for
   `package-firewall.replit.local` and replace with `https://registry.npmjs.org/` if
   found (same package/version/integrity, just a different host).

3. **This project targets React 19.** `useRef<T>(null)` returns
   `RefObject<T | null>`, not `RefObject<T>` — component prop types for refs must
   include `| null`. Run `npx tsc --noEmit` locally before committing any component
   changes; the production build (`npm run build`) runs `tsc --noEmit && vite build`
   and will fail the deploy on any type error.

4. **`whatsapp-web.js` pulls in `puppeteer`**, whose postinstall downloads a Chromium
   binary. It's lazy-required in `server/whatsapp-session.js` (wrapped in try/catch),
   so the app boots fine without it. Set `PUPPETEER_SKIP_DOWNLOAD=true` before
   `npm install`/`npm ci` unless you specifically need the WhatsApp QR-session feature
   working locally.

5. **DB migrations live in `db/migrations/*.sql`**, run in order via
   `psql -v ON_ERROR_STOP=1` against a `schema_migrations` checksum table on deploy.
   Don't edit an already-applied migration file — add a new one.

## Where to look for more context

- `docs/memory/MEMORY.md` — index of all memory docs
- `docs/memory/project_overview.md` — stack, deploy process, migration status, outstanding work
- `docs/memory/memory(L3).md` — most recent detailed session log (Lightstone API
  integration, two production deploy breaks and their root causes/fixes)
- `deploy.sh` (repo root) — the actual production deploy pipeline
- `.replit` — Replit workspace/run configuration (ports, workflows, postMerge hook)
