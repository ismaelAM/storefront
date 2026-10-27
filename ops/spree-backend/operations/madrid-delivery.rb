require 'json'
require 'net/http'
require 'uri'

# Keep the benefit in the native shipping calculator. Identity comes from the
# authenticated order owner; an address email or a public coupon grants nothing.
module BisonMadridDelivery
  URL = 'https://ikglqbjlbkbaronbiryl.supabase.co/functions/v1/devir-sync'.freeze

  def self.eligible?(user)
    return false unless user&.persisted?
    customer_id = user.prefixed_id.to_s
    email = user.email.to_s.strip.downcase
    return false unless customer_id.match?(/\A[a-z]+_[a-zA-Z0-9]+\z/) && !email.empty? && email.bytesize <= 320
    key = ActiveRecord::Base.connection.select_value(
      "SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name='spree_owned_bot_20261026'")
    return false unless key.is_a?(String) && !key.empty?
    uri = URI(URL)
    request = Net::HTTP::Post.new(uri)
    request['Content-Type'] = 'application/json'
    request['x-spree-admin-key'] = key
    request.body = JSON.generate(action: 'special-pricing-shipping-eligibility', customerId: customer_id, email: email)
    response = Net::HTTP.start(uri.host, uri.port, use_ssl: true, open_timeout: 3, read_timeout: 3, write_timeout: 3) do |http|
      http.max_retries = 0
      http.request(request)
    end
    return false unless response.code == '200' && response.body.to_s.bytesize <= 1024
    result = JSON.parse(response.body)
    result.is_a?(Hash) && result['ok'] == true && result['eligible'] == true
  rescue StandardError
    # No positive caching: revocation takes effect on the next quote. Provider
    # failure leaves the documented native tariff, never free shipping.
    false
  end

  module Calculator
    def compute_package(package)
      amount = super
      return amount if amount.nil?
      method = calculable
      return amount unless method.is_a?(Spree::ShippingMethod) &&
        method.code == 'entrega-madrid-2026' &&
        method.private_metadata['bison_shipping_setup'] == 'bison-shipping-2026-v1'
      order = package.order
      if order&.completed?
        # Native OrderUpdater can refresh rates after completion. Preserve the
        # amount agreed for this shipment even if membership changes later.
        shipment = package.contents.first&.inventory_unit&.shipment
        return shipment.cost if shipment && shipment.order == order && shipment.shipping_method == method
        return amount
      end
      address = order&.ship_address
      return amount unless order&.store_id == 4 && address&.country&.iso == 'ES' && address&.state&.abbr == 'M'
      BisonMadridDelivery.eligible?(order.user) ? 0 : amount
    end
  end
end
