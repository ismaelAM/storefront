#!/bin/sh
set -eu
ruby ./target.rb
# Catch failures so the platform cannot restart a partially failed recovery in
# an expensive loop. Remain idle only until the operator scales this to zero.
if ./bin/rails runner ./catalog-recovery.rb; then
  printf '%s\n' 'Catalog recovery finished; scale catalog_recovery to zero.'
else
  printf '%s\n' 'Catalog recovery stopped; inspect sanitized results and scale to zero.'
fi
exec sleep infinity
