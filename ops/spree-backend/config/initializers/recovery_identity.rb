module RecoveryVariantIdentity
  def self.included(model)
    model.validate :recovered_variant_identity_is_resolved
  end
  def recovered_variant_identity_is_resolved
    if product&.metadata&.fetch('recovery_state', nil) == 'variant_identity_quarantined'
      errors.add(:base, 'Recovered variant identity requires review')
    end
  end
end
module RecoveryProductIdentity
  def self.included(model)
    model.validate :recovered_product_identity_is_resolved
  end
  def recovered_product_identity_is_resolved
    if metadata['recovery_state'] == 'variant_identity_quarantined' && status != 'draft'
      errors.add(:base, 'Recovered product identity requires review')
    end
  end
end
Rails.application.config.to_prepare do
  Spree::Variant.include(RecoveryVariantIdentity) unless Spree::Variant < RecoveryVariantIdentity
  Spree::Product.include(RecoveryProductIdentity) unless Spree::Product < RecoveryProductIdentity
end
