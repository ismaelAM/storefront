#!/bin/sh
set -eu
# The 1 GiB recovery daemon cannot run three image transforms concurrently.
export JOB_THREADS=1 JOB_CONCURRENCY=1 SPREE_RUNTIME_ROLE=worker
ruby ./target.rb
# One Rails process instead of a supervisor plus separate forked children.
# Jobs remain durable in Postgres; async here describes the supervisor topology.
exec ./bin/jobs --mode async
