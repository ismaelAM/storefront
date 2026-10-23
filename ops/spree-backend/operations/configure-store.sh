#!/bin/sh
set -eu
ruby ./target.rb
./bin/rails runner ./target.rb
./bin/rails runner ./configure-store.rb
printf '%s\n' 'BisonTCG store configuration complete; scale configure_store to zero.'
exec sleep infinity
