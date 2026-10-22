#!/bin/sh
set -eu
ruby ./target.rb
./bin/rails runner ./target.rb
./bin/rails db:abort_if_pending_migrations
./bin/rails runner ./publish-catalog.rb
printf '%s\n' 'Recovered catalog listing verified; scale publish_catalog to zero.'
exec sleep infinity
