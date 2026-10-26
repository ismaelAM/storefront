require 'json'
require 'net/http'
require 'openssl'
require 'uri'

# Fixed, idempotent connection of the existing Stripe account. This operation
# never creates, confirms, captures or refunds a payment.
module PaymentSetup
  class Error < StandardError; end
  ACCOUNT_ID = 'acct_1UDiVZHU3Etzdhlg'.freeze
  KEY_NAME = 'BisonTCG Stripe order reconciliation'.freeze
  KEY_VAULT = 'spree_owned_payment_bot_20261026'.freeze
  EXTERNAL_NAME = 'Stripe external reconciliation'.freeze
  GATEWAY_NAME = 'Stripe BisonTCG'.freeze
  SCOPES = %w[write_orders write_payments read_settings].freeze
  WEBHOOK_EVENTS = %w[payment_intent.succeeded payment_intent.amount_capturable_updated payment_intent.payment_failed setup_intent.succeeded].freeze
  BACKEND_ORIGIN = 'https://project-7ck7q.vercel.app'.freeze

  def self.valid_credentials?(value)
    value.is_a?(Hash) && value.keys.sort == %w[publishable_key secret_key] &&
      value['secret_key'].is_a?(String) && value['secret_key'].match?(/\Ask_live_[A-Za-z0-9_]+\z/) &&
      value['publishable_key'].is_a?(String) && value['publishable_key'].match?(/\Apk_live_[A-Za-z0-9_]+\z/)
  end

  def self.manual_review_required?(minor_amount, currency)
    currency.to_s.downcase == 'eur' && minor_amount > 50_000
  end

  def self.guard_native_amount!(amount, currency)
    minor = Spree::Money.new(amount, currency: currency).cents
    if manual_review_required?(minor, currency)
      raise Spree::Core::GatewayError, 'Para pedidos superiores a 500 €, continúa con el pago normal para revisar la autorización.'
    end
  end

  def self.native_order_amount!(order, supplied)
    due = order.total_minus_store_credits
    currency = order.currency
    if supplied && supplied.to_s != '' && Spree::Money.new(supplied, currency: currency).cents != Spree::Money.new(due, currency: currency).cents
      raise Spree::Core::GatewayError, 'El importe no coincide con el carrito.'
    end
    guard_native_amount!(due, currency)
    due
  end

  def self.store!
    EmailHttpDrain.validate_target!
    raise Error, 'Unexpected stores' unless Spree::Store.count == 1
    Spree::Store.find_by!(code: 'bisontcg')
  end

  def self.prepare!
    store = store!
    ActiveRecord::Base.transaction do
      connection = ActiveRecord::Base.connection
      raise Error, 'Payment setup is busy' unless connection.select_value('SELECT pg_try_advisory_xact_lock(20261026, 4)')
      methods = store.payment_methods.where(name: EXTERNAL_NAME).to_a
      raise Error, 'Duplicate reconciliation methods' if methods.length > 1
      external = methods.first
      if external
        raise Error, 'Unexpected reconciliation method' unless external.type == 'Spree::PaymentMethod::Check' && external.display_on == 'back_end'
      else
        external = store.payment_methods.build(type: 'Spree::PaymentMethod::Check', name: EXTERNAL_NAME,
          active: true, display_on: 'back_end', auto_capture: true,
          description: 'Internal ledger for payments already verified in Stripe; never displayed in checkout.')
        external.save!
      end
      keys = store.api_keys.active.secret.where(name: KEY_NAME).to_a
      raise Error, 'Duplicate reconciliation keys' if keys.length > 1
      key = keys.first
      if key
        raise Error, 'Unexpected reconciliation scopes' unless key.scopes.sort == SCOPES.sort
        values = connection.select_values("SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name='#{KEY_VAULT}'")
        raise Error, 'Private reconciliation key unavailable' unless values.length == 1 && Spree::ApiKey.find_by_secret_token(values.first)&.id == key.id
      else
        raise Error, 'Unexpected existing private reconciliation key' if connection.select_value("SELECT count(*) FROM vault.secrets WHERE name='#{KEY_VAULT}'").to_i != 0
        key = store.api_keys.create!(name: KEY_NAME, key_type: 'secret', scopes: SCOPES)
        connection.select_value("SELECT vault.create_secret(#{connection.quote(key.plaintext_token)}, '#{KEY_VAULT}', 'Owned Stripe reconciliation only; do not expose', NULL)")
      end
      { prepared: true, external_payment_method_id: external.prefixed_id }
    end
  end

  def self.connect!(credentials)
    raise Error, 'Invalid live Stripe configuration' unless valid_credentials?(credentials)
    ActiveRecord::Base.connection_pool.with_connection do |connection|
      locked = connection.select_value('SELECT pg_try_advisory_lock(20261026, 5)')
      raise Error, 'Payment connection is busy' unless locked
      begin
        connect_private!(credentials)
      ensure
        connection.select_value('SELECT pg_advisory_unlock(20261026, 5)')
      end
    end
  end

  def self.connect_private!(credentials)
    store = store!
    request = Net::HTTP::Get.new('/v1/account')
    request['Authorization'] = "Bearer #{credentials.fetch('secret_key')}"
    response = Net::HTTP.start('api.stripe.com', 443, use_ssl: true,
      verify_mode: OpenSSL::SSL::VERIFY_PEER, open_timeout: 5, read_timeout: 15, write_timeout: 5) { |http| http.request(request) }
    account = JSON.parse(response.body)
    raise Error, 'Stripe account is not ready' unless response.code == '200' && account['id'] == ACCOUNT_ID && account['charges_enabled'] == true
    prepare!
    gateways = store.payment_methods.where(type: 'SpreeStripe::Gateway').to_a
    raise Error, 'Duplicate Stripe gateways' if gateways.length > 1
    gateway = gateways.first
    if gateway
      raise Error, 'Unexpected existing Stripe gateway' unless gateway.name == GATEWAY_NAME && gateway.preferred_secret_key == credentials['secret_key'] && gateway.preferred_publishable_key == credentials['publishable_key']
    else
      gateway = store.payment_methods.build(type: 'SpreeStripe::Gateway', name: GATEWAY_NAME,
        active: false, display_on: 'both', auto_capture: true)
      gateway.preferred_secret_key = credentials.fetch('secret_key')
      gateway.preferred_publishable_key = credentials.fetch('publishable_key')
      gateway.save!
    end
    expected_url = "#{BACKEND_ORIGIN}/api/v3/webhooks/payments/#{gateway.prefixed_id}"
    raise Error, 'Unexpected native Stripe webhook URL' unless gateway.webhook_url == expected_url
    SpreeStripe::CreateGatewayWebhooks.new.call(payment_method: gateway, events: WEBHOOK_EVENTS)
    raise Error, 'Native Stripe signing key unavailable' unless gateway.webhook_keys.exists?
    gateway.update!(active: true) unless gateway.active
    { connected: true, account_matches: true, native_payment_method_id: gateway.prefixed_id }
  end

  module NativeWebhookUrl
    def create_payment_session(order:, amount: nil, external_data: {})
      if store&.code == 'bisontcg'
        due = PaymentSetup.native_order_amount!(order, amount)
        return super(order: order, amount: due, external_data: external_data)
      end
      super
    end

    def update_payment_session(payment_session:, amount: nil, external_data: {})
      if store&.code == 'bisontcg'
        due = PaymentSetup.native_order_amount!(payment_session.order, amount)
        return super(payment_session: payment_session, amount: due, external_data: external_data)
      end
      super
    end

    def webhook_url
      return super unless store&.code == 'bisontcg'
      "#{PaymentSetup::BACKEND_ORIGIN}/api/v3/webhooks/payments/#{prefixed_id}"
    end
  end

  # Displaying a method only in Admin must also prevent direct Store API use.
  # Native Store controllers otherwise resolve any method belonging to the
  # store, including the Check ledger for payments verified by our server.
  module StorePaymentVisibility
    def create
      method = current_store.payment_methods.find_by_prefix_id!(params[:payment_method_id])
      unless method.active? && method.available_on_front_end?
        return render_error(code: 'payment_method_unavailable',
          message: 'Método de pago no disponible.', status: :unprocessable_content)
      end
      super
    end
  end
end
