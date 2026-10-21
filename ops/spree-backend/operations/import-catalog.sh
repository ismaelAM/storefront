#!/bin/sh
set -eu
ruby ./target.rb
./bin/rails runner ./target.rb
./bin/rails runner ./import-catalog.rb
printf '%s\n' 'Catalog recovery complete; scale import_catalog to zero.'
exec sleep infinity
