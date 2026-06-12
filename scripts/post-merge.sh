#!/bin/bash
set -e

# Install dependencies
npm install --no-audit --no-fund

# Run database migrations (idempotent - uses IF NOT EXISTS / CREATE OR REPLACE)
echo "Running database migrations..."
for f in db/migrations/*.sql; do
  echo "  Applying $f..."
  PGPASSWORD=$PGPASSWORD psql -h $PGHOST -p $PGPORT -U $PGUSER -d $PGDATABASE -f "$f" 2>&1 || true
done

echo "Post-merge setup complete."
