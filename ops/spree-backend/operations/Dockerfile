# Reuse the already-built, guarded backend, including its exact Rails/S3 config.
FROM vcr.vercel.com/bison-tcg/bisontcg-spree/dockerfile@sha256:2f82d22c203457a8bbfe113deb16d4fe592a02def00e2e0ed2bc85fe2bd729e4
COPY --chown=1000:1000 --chmod=644 initialize.sh /rails/initialize.sh
COPY --chown=1000:1000 --chmod=644 configure-store.sh configure-store.rb /rails/
COPY --chown=1000:1000 --chmod=644 catalog-plan.rb catalog-plan.test.rb import-catalog.rb import-catalog.sh worker.sh /rails/
COPY --chown=1000:1000 --chmod=644 catalog-visibility.test.rb /rails/
COPY --chown=1000:1000 --chmod=644 publish-catalog.rb publish-catalog.sh /rails/
COPY --chown=1000:1000 --chmod=644 media-source.rb media-source.test.rb media-transform.test.rb import-media.rb import-media.sh /rails/
# The pinned starter refers to a scope absent from its locked Solid Cable 4.0.2.
RUN ruby -e 'p="config/recurring.yml"; s=File.read(p); old="SolidCable::Message.prunable"; abort "Unexpected cable housekeeping configuration" unless s.scan(old).size == 1; File.write(p, s.sub(old, "SolidCable::Message.trimmable"))'
RUN sh -n /rails/initialize.sh && sh -n /rails/configure-store.sh && ruby -c /rails/configure-store.rb
RUN ruby /rails/catalog-plan.test.rb && ruby -c /rails/import-catalog.rb && sh -n /rails/import-catalog.sh && sh -n /rails/worker.sh
RUN ruby /rails/catalog-visibility.test.rb
RUN ruby -c /rails/publish-catalog.rb && sh -n /rails/publish-catalog.sh
RUN ruby /rails/media-source.test.rb && ruby -c /rails/import-media.rb && sh -n /rails/import-media.sh
RUN bundle exec ruby /rails/media-transform.test.rb
ENTRYPOINT ["/bin/sh", "/rails/initialize.sh"]
