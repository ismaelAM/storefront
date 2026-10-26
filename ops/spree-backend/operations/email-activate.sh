#!/bin/sh
set -eu
ruby ./target.rb
# Do not let a failed one-shot operation become an automatic restart loop.
if ./bin/rails runner ./email-activate.rb; then
  printf '%s\n' 'Email endpoint activation finished; scale email_activate to zero.'
else
  printf '%s\n' 'Email endpoint activation stopped; inspect sanitized results and scale email_activate to zero.'
fi
exec sleep infinity
