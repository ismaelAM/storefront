# Reuse the already-built, guarded backend, including its exact Rails/S3 config.
FROM vcr.vercel.com/bison-tcg/bisontcg-spree/dockerfile@sha256:2f82d22c203457a8bbfe113deb16d4fe592a02def00e2e0ed2bc85fe2bd729e4
COPY --chown=1000:1000 --chmod=644 initialize.sh /rails/initialize.sh
COPY --chown=1000:1000 --chmod=644 configure-store.sh configure-store.rb /rails/
RUN sh -n /rails/initialize.sh && sh -n /rails/configure-store.sh && ruby -c /rails/configure-store.rb
ENTRYPOINT ["/bin/sh", "/rails/initialize.sh"]
