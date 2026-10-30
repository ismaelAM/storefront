require Rails.root.join('api-key-usage')

Rails.application.config.to_prepare do
  authentication = Spree::Api::V3::ApiKeyAuthentication
  authentication.prepend(BisonApiKeyUsage) unless authentication < BisonApiKeyUsage
end
