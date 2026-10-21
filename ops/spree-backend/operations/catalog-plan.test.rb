require_relative './catalog-plan'

def check(value)
  raise 'Catalog planning assertion failed' unless value
end

def rejects
  begin
    yield
  rescue ArgumentError
    return
  end
  raise 'Invalid recovery input was accepted'
end

p = { 'id' => 'p', 'name' => 'Family' }
v = { 'id' => 'v', 'product_id' => 'p', 'canonical_sku' => 'SKU', 'option_values' => { 'idioma' => 'Español' }, 'last_auto_price' => '12.34' }
check(RecoveryCatalog.validate!([p], [v]))
rejects { RecoveryCatalog.validate!([p], [v, v.merge('id' => 'other', 'canonical_sku' => 'sku')]) }
rejects { RecoveryCatalog.validate!([p], [v.merge('product_id' => 'missing')]) }
rejects { RecoveryCatalog.validate!([p], [v.merge('option_values' => { 'idioma' => '' })]) }
rejects { RecoveryCatalog.validate!([p], [v.merge('last_auto_price' => '-1')]) }
check(!RecoveryCatalog.ambiguous?([v]))
check(RecoveryCatalog.ambiguous?([v, v.merge('id' => 'other', 'option_values' => {})]))
check(RecoveryCatalog.ambiguous?([v.merge('option_values' => {}), v.merge('id' => 'other', 'option_values' => {})]))
check(RecoveryCatalog.option_name('Español') != RecoveryCatalog.option_name('Espanol'))
check(RecoveryCatalog.option_name('Rojo') != RecoveryCatalog.option_name('rojo'))
check(RecoveryCatalog.option_name('Español') == RecoveryCatalog.option_name('Español'))
puts 'Catalog planning tests passed (11 checks).'
