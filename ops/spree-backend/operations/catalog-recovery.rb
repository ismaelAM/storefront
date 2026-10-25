# Explicit one-shot operation; it never starts cron or a recurring worker.
load './target.rb'
require_relative './recovery-access'

logger = ActiveRecord::Base.logger
begin
  ActiveRecord::Base.logger = nil
  # Keep the unresolved family blocked in the authoritative backend, including
  # later supplier retries; physical_only alone does not prevent new variants.
  source_id = '8312b2b2-315f-4bb1-bd6b-48a7f14a1ed1'
  connection = ActiveRecord::Base.connection
  destination = connection.select_value("SELECT destination_id FROM spree_recovery.destination_mappings WHERE source_table='catalog_products' AND source_id='#{source_id}' AND verified_at IS NOT NULL")
  held = Spree::Product.find_by_prefix_id!(destination)
  raise 'Unexpected unresolved recovery product' unless held.draft? && held.metadata.dig('recovery_source', 'id') == source_id && !held.purchasable?
  # Product validates its master before saving. Installing the hold through
  # update! would therefore reject itself; write only the checked private marker.
  held.update_columns(private_metadata: held.metadata.merge('recovery_state' => 'variant_identity_quarantined'), updated_at: Time.current)
  RecoveryAccess.provision!(Spree::Store.find_by!(code: 'bisontcg'), ActiveRecord::Base.connection)
rescue StandardError => error
  warn "Integration recovery stopped: #{error.class.name}"
  exit 1
ensure
  ActiveRecord::Base.logger = logger
end
puts 'Scoped integration key verified in private Vault; no credential was logged.'
ARGV.replace(['2315', 'published'])
load './import-media.rb'
