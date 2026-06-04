# Database Migrations

This folder contains PostgreSQL migrations for the future Ubuntu 22.04 / Virtualmin / PostgreSQL deployment.

## Apply Initial Schema

On the server:

```bash
createdb lawpath
psql -d lawpath -f db/migrations/001_initial_saas_schema.sql
```

If the database user is separate:

```bash
psql "postgresql://lawpath_app@127.0.0.1:5432/lawpath" -f db/migrations/001_initial_saas_schema.sql
```

## Migration Rules

- Add new migrations as numbered files, for example `002_add_documents.sql`.
- Do not edit an already-applied migration in production. Add a new migration instead.
- Every tenant-owned table must include `tenant_id uuid not null`.
- Platform-only secrets must not be tenant-scoped or tenant-readable.
- Store secret references in PostgreSQL, not raw API keys/passwords. The actual secret should live in server-side encrypted storage or the server environment.

## Current Schema Covers

- tenants and users
- password reset tokens
- tenant sender identity
- super-admin SMTP transport settings
- super-admin API provider settings
- matters
- contract drafts
- legal research items
- secretary tasks
- invoices
- appointments
- portal invites
- email delivery events
- activity audit log
- AI assistant profiles
- RAG knowledge sources, documents, chunks and indexing jobs

## Notes For RAG Embeddings

`002_ai_training_rag.sql` uses a portable `double precision[]` embedding column so the schema can be applied on a standard PostgreSQL install. For production-grade vector search, we can later add `pgvector` and migrate this to a `vector(...)` column with approximate nearest-neighbour indexes.
