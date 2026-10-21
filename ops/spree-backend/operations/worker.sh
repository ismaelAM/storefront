#!/bin/sh
set -eu
ruby ./target.rb
./bin/rails runner ./target.rb
./bin/rails db:abort_if_pending_migrations
exec ./bin/jobs
