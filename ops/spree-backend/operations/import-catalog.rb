# Reconstruct drafts only from the private, verified canonical checkpoint.
load './target.rb'
require_relative './catalog-plan'

class RecoverySource < ActiveRecord::Base
  self.table_name = 'spree_recovery.source_records'
  self.primary_key = [:source_table, :source_id]
end
class RecoveryMapping < ActiveRecord::Base
  self.table_name = 'spree_recovery.destination_mappings'
  self.primary_key = [:source_table, :source_id]
end

def recovery_metadata(payload)
  { 'recovery_source' => payload.slice('id', 'canonical_key', 'brand', 'category_key',
      'requires_review', 'review_decision', 'review_note', 'approved_review_fingerprint',
      'option_values', 'fulfillment_mode', 'last_auto_price'),
    'recovery_state' => 'draft_requires_commercial_verification' }
end

def mapped_record(table, source, model)
  mapping = RecoveryMapping.find_by(source_table: table, source_id: source.fetch('id'))
  return unless mapping
  record = model.find_by_prefix_id!(mapping.destination_id)
  raise 'Recovery mapping ownership mismatch' unless record.metadata.dig('recovery_source', 'id') == source.fetch('id')
  record
end

def record_mapping(table, source, record)
  RecoveryMapping.create!(source_table: table, source_id: source.fetch('id'),
    destination_id: record.prefixed_id, verified_at: Time.current)
end

def verify_variant!(variant, source, product)
  raise 'Recovery variant identity mismatch' unless variant.product_id == product.id && variant.sku == source.fetch('canonical_sku') && variant.track_inventory?
  actual_options = variant.option_values.includes(:option_type).to_h { |value| [value.option_type.presentation, value.presentation] }
  raise 'Recovery options mismatch' unless actual_options == source.fetch('option_values')
  prices = variant.prices.base_prices.where(currency: 'EUR').to_a
  expected = source['last_auto_price']
  raise 'Recovery price mismatch' unless expected ? (prices.size == 1 && prices.first.amount == BigDecimal(expected.to_s)) : prices.empty?
  raise 'Recovered variant unexpectedly has sellable stock' if variant.stock_items.any? { |s| s.count_on_hand.to_i != 0 || s.backorderable? }
end

ActiveRecord::Base.connection_pool.with_connection do |connection|
  locked = connection.select_value('SELECT pg_try_advisory_lock(20261020, 5015)')
  raise 'Another catalog recovery is running' unless locked
  begin
    store = Spree::Store.find_by!(code: 'bisontcg')
    raise 'Unexpected store configuration' unless store.default_currency == 'EUR' && store.default_locale == 'es' && Spree::Store.count == 1
    products = RecoverySource.where(source_table: 'catalog_products').order(:source_id).pluck(:payload)
    variants = RecoverySource.where(source_table: 'catalog_variants').order(:source_id).pluck(:payload)
    raise 'Unexpected recovery checkpoint size' unless products.size == 5000 && variants.size == 5015
    RecoveryCatalog.validate!(products, variants)
    by_product = variants.group_by { |v| v.fetch('product_id') }
    pending = []
    Spree::Current.set(store: store, content_locale: store.default_locale) do
      Spree::Events.disable do
        I18n.with_locale(:es) do
          products.each_with_index do |source, index|
            ActiveRecord::Base.transaction do
              product = mapped_record('catalog_products', source, Spree::Product)
              unless product
                product = Spree::Product.create!(store: store, name: source.fetch('name'),
                  slug: "recovery-#{source.fetch('id')}", status: 'draft',
                  shipping_category: store.default_shipping_category,
                  metadata: recovery_metadata(source))
                record_mapping('catalog_products', source, product)
              end
              raise 'Recovery product is no longer an unpublished draft' unless product.store_id == store.id && product.status == 'draft' && product.product_publications.empty?
              source_variants = by_product.fetch(source.fetch('id'), [])
              if RecoveryCatalog.ambiguous?(source_variants)
                pending << source.fetch('id')
                product.update!(metadata: product.metadata.merge('recovery_pending_variant_ids' => source_variants.map { |v| v.fetch('id') }))
                next
              end
              source_variants.each do |v|
                variant = mapped_record('catalog_variants', v, Spree::Variant)
                if variant
                  verify_variant!(variant, v, product)
                  next
                end
                values = v.fetch('option_values').sort.map do |key, label|
                  type = Spree::OptionType.find_or_create_by!(name: RecoveryCatalog.option_name(key)) do |t|
                    t.presentation = key
                    t.kind = 'dropdown'
                  end
                  product.option_types << type unless product.option_types.exists?(id: type.id)
                  type.option_values.find_or_create_by!(name: RecoveryCatalog.option_name(label)) { |value| value.presentation = label }
                end
                variant = values.empty? ? product.master : product.variants.build(option_values: values)
                variant.assign_attributes(sku: v.fetch('canonical_sku'), track_inventory: true, metadata: recovery_metadata(v))
                variant.save!
                if v['last_auto_price']
                  variant.set_price('EUR', BigDecimal(v.fetch('last_auto_price').to_s))
                end
                verify_variant!(variant, v, product)
                record_mapping('catalog_variants', v, variant)
              end
            end
            puts "Recovered #{index + 1}/#{products.size} draft products" if (index + 1) % 100 == 0
          end
        end
      end
    end
    expected_variants = variants.reject { |v| pending.include?(v.fetch('product_id')) }.size
    raise 'Product mapping reconciliation failed' unless RecoveryMapping.where(source_table: 'catalog_products').count == products.size
    raise 'Variant mapping reconciliation failed' unless RecoveryMapping.where(source_table: 'catalog_variants').count == expected_variants
    puts "Catalog verified: #{products.size} draft products, #{expected_variants} canonical variants; #{pending.size} ambiguous families remain in private staging."
  ensure
    connection.execute('SELECT pg_advisory_unlock(20261020, 5015)')
  end
end
