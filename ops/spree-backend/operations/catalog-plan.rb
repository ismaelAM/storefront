require 'digest'
require 'bigdecimal'

module RecoveryCatalog
  def self.validate!(products, variants)
    ids = products.map { |p| p.fetch('id') }
    raise ArgumentError, 'Duplicate products' unless ids.uniq.size == ids.size
    raise ArgumentError, 'Missing product name' unless products.all? { |p| p['name'].is_a?(String) && !p['name'].strip.empty? }
    variant_ids = variants.map { |v| v.fetch('id') }
    skus = variants.map { |v| v.fetch('canonical_sku').strip.downcase }
    raise ArgumentError, 'Duplicate variant identity' unless variant_ids.uniq.size == variant_ids.size && skus.uniq.size == skus.size && skus.none?(&:empty?)
    variants.each do |v|
      raise ArgumentError, 'Orphan variant' unless ids.include?(v.fetch('product_id'))
      options = v.fetch('option_values')
      raise ArgumentError, 'Invalid options' unless options.is_a?(Hash) && options.all? { |k, val| k.is_a?(String) && !k.strip.empty? && val.is_a?(String) && !val.strip.empty? }
      price = v['last_auto_price']
      raise ArgumentError, 'Invalid previous automatic price' if price && (!BigDecimal(price.to_s).finite? || BigDecimal(price.to_s) <= 0)
    end
    true
  end

  def self.ambiguous?(variants)
    empty = variants.count { |v| v.fetch('option_values').empty? }
    empty > 1 || (empty == 1 && variants.size > 1)
  end

  # Keep exact labels separate even when transliteration or case would collide.
  def self.option_name(value)
    "recovery-#{Digest::SHA256.hexdigest(value)}"
  end
end
