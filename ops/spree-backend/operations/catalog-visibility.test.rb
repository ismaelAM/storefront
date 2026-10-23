require_relative './catalog-plan'

def check(value)
  raise 'Unsafe recovered catalog visibility decision' unless value
end

p = { 'id' => 'p', 'name' => 'Family', 'requires_review' => false, 'review_decision' => 'pending' }
v = { 'id' => 'v', 'product_id' => 'p', 'canonical_sku' => 'SKU',
      'option_values' => { 'Idioma' => 'Español' }, 'requires_review' => false,
      'fulfillment_mode' => 'supplier_or_physical', 'last_auto_price' => '12.34' }
check(RecoveryCatalog.listable?(p, [v]))
check(!RecoveryCatalog.listable?(p.merge('requires_review' => true), [v]))
check(!RecoveryCatalog.listable?(p.merge('review_decision' => 'rejected'), [v]))
check(!RecoveryCatalog.listable?(p.reject { |k, _| k == 'requires_review' }, [v]))
check(!RecoveryCatalog.listable?(p, []))
check(!RecoveryCatalog.listable?(p, [v.merge('requires_review' => true)]))
check(!RecoveryCatalog.listable?(p, [v.merge('product_id' => 'other')]))
%w[physical_only disabled].each do |mode|
  check(!RecoveryCatalog.listable?(p, [v.merge('fulfillment_mode' => mode)]))
end
[nil, '0', '-1', 'NaN', 'Infinity', 'not-a-price'].each do |price|
  check(!RecoveryCatalog.listable?(p, [v.merge('last_auto_price' => price)]))
end
check(!RecoveryCatalog.listable?(p, [v, v.merge('id' => 'v2', 'last_auto_price' => nil)]))
check(!RecoveryCatalog.listable?(p, [v, v.merge('id' => 'v2', 'option_values' => {})]))
puts 'Catalog visibility tests passed (17 checks); listing never changes inventory.'
