# Reuse the already-built, guarded backend, including its exact Rails/S3 config.
FROM vcr.vercel.com/bison-tcg/bisontcg-spree/dockerfile@sha256:2f82d22c203457a8bbfe113deb16d4fe592a02def00e2e0ed2bc85fe2bd729e4
COPY --chown=1000:1000 --chmod=644 initialize.sh /rails/initialize.sh
COPY --chown=1000:1000 --chmod=644 configure-store.sh configure-store.rb /rails/
COPY --chown=1000:1000 --chmod=644 catalog-plan.rb catalog-plan.test.rb import-catalog.rb import-catalog.sh worker.sh /rails/
COPY --chown=1000:1000 --chmod=644 media-source.rb media-source.test.rb import-media.rb import-media.sh /rails/
RUN sh -n /rails/initialize.sh && sh -n /rails/configure-store.sh && ruby -c /rails/configure-store.rb
RUN ruby /rails/catalog-plan.test.rb && ruby -c /rails/import-catalog.rb && sh -n /rails/import-catalog.sh && sh -n /rails/worker.sh
RUN ruby /rails/media-source.test.rb && ruby -c /rails/import-media.rb && sh -n /rails/import-media.sh
ENTRYPOINT ["/bin/sh", "/rails/initialize.sh"]
