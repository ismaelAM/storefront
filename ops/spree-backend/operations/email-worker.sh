#!/bin/sh
set -eu
# Starts only when deliberately deployed/scaled. Keep daemon instances at zero
# in Git: an always-running 1 GiB service has a continuous memory cost.
export JOB_THREADS=1 JOB_CONCURRENCY=1 SPREE_RUNTIME_ROLE=worker
ruby ./target.rb
# Solid Queue 1.5.0 CLI: async shares one Rails boot; no recurring scheduler.
exec ./bin/jobs --mode async --skip-recurring --config-file ./config/queue-mail.yml
