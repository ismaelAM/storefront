# Expose verified catalog for browsing using Spree's own models and channel API.
# This operation never grants an admin role or creates a secret API key.
load './target.rb'
require_relative './catalog-plan'

class RecoveryListingSource < ActiveRecord::Base
  self.table_name = 'spree_recovery.source_records'
end
class RecoveryListingMapping < ActiveRecord::Base
  self.table_name = 'spree_recovery.destination_mappings'
end

def listing_record(table, source, model)
  mapping = RecoveryListingMapping.find_by!(source_table: table, source_id: source.fetch('id'))
  record = model.find_by_prefix_id!(mapping.destination_id)
  raise 'Recovery listing ownership mismatch' unless record.metadata.dig('recovery_source', 'id') == source.fetch('id')
  record
end

def verify_listing_not_purchasable!(product)
  variants = product.variants_including_master.to_a
  raise 'Inventory tracking must remain enabled' unless Spree::Config[:track_inventory_levels] && variants.all?(&:track_inventory?)
  raise 'Recovery listing has a preorder enabled' if variants.any?(&:preorderable?)
  raise 'Listing accidentally became purchasable' if product.reload.purchasable?
end

ActiveRecord::Base.connection_pool.with_connection do |connection|
  raise 'Another catalog listing operation is running' unless connection.select_value('SELECT pg_try_advisory_lock(20261022, 2315)')
  begin
    store = Spree::Store.find_by!(code: 'bisontcg')
    raise 'Unexpected listing store' unless Spree::Store.count == 1 && store.default_currency == 'EUR' && store.default_locale == 'es'
    channel = store.default_channel
    raise 'Unexpected listing channel' unless channel&.active? && !channel.storefront_login_required? && !channel.storefront_prices_hidden?
    raise 'Recovery has received inventory; review publication before proceeding' if Spree::StockItem.where('count_on_hand <> 0 OR backorderable = TRUE').exists?
    products = RecoveryListingSource.where(source_table: 'catalog_products').order(:source_id).pluck(:payload)
    variants = RecoveryListingSource.where(source_table: 'catalog_variants').order(:source_id).pluck(:payload)
    raise 'Unexpected listing checkpoint' unless products.size == 5000 && variants.size == 5015
    RecoveryCatalog.validate!(products, variants)
    by_product = variants.group_by { |v| v.fetch('product_id') }
    selected = products.select { |p| RecoveryCatalog.listable?(p, by_product.fetch(p.fetch('id'), [])) }
    raise 'Listing plan differs from verified checkpoint' unless selected.size == 2315
    listed_ids = []
    Spree::Current.set(store: store, channel: channel, currency: 'EUR', content_locale: 'es') do
      Spree::Events.disable do
        I18n.with_locale(:es) do
          selected.each_with_index do |source, index|
            Spree::Product.transaction do
              product = listing_record('catalog_products', source, Spree::Product)
              raise 'Unexpected listing product store' unless product.store_id == store.id
              state = product.metadata['recovery_state']
              fresh = product.draft? && state == 'draft_requires_commercial_verification' && product.product_publications.empty?
              repeated = product.active? && state == 'catalog_visible_stock_unverified' && product.product_publications.count == 1 && product.product_publications.first.channel_id == channel.id
              raise 'Product was changed outside catalog recovery' unless fresh || repeated
              variant_ids = []
              by_product.fetch(source.fetch('id')).each do |v|
                variant = listing_record('catalog_variants', v, Spree::Variant)
                variant_ids << variant.id
                raise 'Listing variant identity changed' unless variant.product_id == product.id && variant.sku == v.fetch('canonical_sku') && variant.track_inventory?
                options = variant.option_values.includes(:option_type).to_h { |value| [value.option_type.presentation, value.presentation] }
                raise 'Listing variant options changed' unless options == v.fetch('option_values')
                prices = variant.prices.base_prices.where(currency: 'EUR').to_a
                raise 'Listing price changed' unless prices.size == 1 && prices.first.amount == BigDecimal(v.fetch('last_auto_price').to_s)
              end
              raise 'Unmapped variant on recovery listing' unless product.variants_including_master.pluck(:id).sort == (variant_ids + [product.master.id]).uniq.sort
              verify_listing_not_purchasable!(product)
              listed_ids << product.id
              next if repeated
              product.activate!
              product.update!(metadata: product.metadata.merge('recovery_state' => 'catalog_visible_stock_unverified'))
              channel.add_products([product.id])
              verify_listing_not_purchasable!(product)
            end
            puts "Catalog listing verified: #{index + 1}/#{selected.size}" if (index + 1) % 100 == 0
          end
          store.products.where(id: listed_ids).find_each { |product| verify_listing_not_purchasable!(product) }
        end
      end
    end
    keys = store.api_keys.active.publishable.where(name: 'BisonTCG recovered storefront')
    raise 'Duplicate recovered storefront keys' if keys.count > 1
    key = keys.first || store.api_keys.create!(name: 'BisonTCG recovered storefront', key_type: 'publishable', channel: channel)
    raise 'Unexpected storefront key binding' unless key.channel_id == channel.id
    raise 'Listing reconciliation failed' unless channel.publications.published.count == selected.size && store.products.where(status: 'active').count == selected.size
    raise 'Recovery stock changed' if Spree::StockItem.where('count_on_hand <> 0 OR backorderable = TRUE').exists?
    puts "Catalog ready for browsing: #{selected.size} products, no purchasable stock; publishable key #{key.prefixed_id}."
  ensure
    connection.execute('SELECT pg_advisory_unlock(20261022, 2315)')
  end
end
