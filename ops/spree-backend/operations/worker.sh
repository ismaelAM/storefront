#!/bin/sh
set -eu
# The 1 GiB recovery daemon cannot run three image transforms concurrently.
export JOB_THREADS=1 JOB_CONCURRENCY=1
ruby ./target.rb
./bin/rails runner ./target.rb
./bin/rails db:abort_if_pending_migrations
exec ./bin/jobs
