#!/bin/sh
set -eu
# This is an explicitly deployed operation, never the HTTP entrypoint.
ruby ./target.rb
./bin/rails runner ./target.rb
./bin/rails db:migrate
printf '%s\n' 'Spree schema initialization complete; scale initialize to zero.'
# Vercel restarts exited daemons. Remain idle until the operator stops this one.
exec sleep infinity
