require Rails.root.join('shipping-setup')

class BisonShippingRestoreEndpoint < EmailHttpDrain::Endpoint
  def self.work(_secret)
    ShippingSetup.restore!
  end
end

Rails.application.routes.prepend do
  post '/internal/bison-shipping/restore', to: BisonShippingRestoreEndpoint
end
