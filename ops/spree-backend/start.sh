#!/bin/sh
set -eu
: "${DATABASE_URL:?DATABASE_URL is required}"
: "${SECRET_KEY_BASE:?SECRET_KEY_BASE is required}"
: "${SUPABASE_S3_ACCESS_KEY_ID:?SUPABASE_S3_ACCESS_KEY_ID is required}"
: "${SUPABASE_S3_SECRET_ACCESS_KEY:?SUPABASE_S3_SECRET_ACCESS_KEY is required}"
ruby ./target.rb
# Effective configuration and pending migrations are checked by runtime_guard.rb
# inside this same Rails boot, before the server can accept requests.
export SPREE_RUNTIME_ROLE=web
exec ./bin/rails server -b 0.0.0.0 -p "${PORT:-3000}"
