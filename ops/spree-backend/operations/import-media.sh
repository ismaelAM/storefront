#!/bin/sh
set -eu
ruby ./target.rb
./bin/rails runner ./target.rb
./bin/rails runner ./import-media.rb "${1:-10}"
printf '%s\n' 'Primary media batch verified; scale import_media to zero.'
exec sleep infinity
