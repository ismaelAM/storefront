require_relative './email-activation'

# Dependency-free like the existing operations tests; runnable in the pinned
# production image without adding a development-only test-framework gem.
class EmailActivationTest
  def assert(value); raise 'Email activation assertion failed' unless value; end
  def refute(value); assert(!value); end
  def assert_equal(expected, actual); assert(expected == actual); end
  def assert_same(expected, actual); assert(expected.equal?(actual)); end
  def assert_empty(value); assert(value.empty?); end
  def assert_raises(type)
    begin
      yield
    rescue type
      return
    end
    raise 'Expected email activation rejection'
  end
  class Endpoint
    attr_accessor :name, :url, :active, :subscriptions, :secret_key, :disabled_at, :disabled_reason
    attr_reader :saves
    def initialize(attributes = {})
      @saves = 0
      assign_attributes(attributes)
    end
    def assign_attributes(attributes)
      attributes.each { |key, value| public_send("#{key}=", value) }
    end
    def save!; @saves += 1; end
  end
  class Endpoints < Array
    def build(attributes)
      endpoint = Endpoint.new(attributes)
      self << endpoint
      endpoint
    end
  end
  Store = Struct.new(:code, :webhook_endpoints)

  def setup
    @endpoints = Endpoints.new
    @store = Store.new('bisontcg', @endpoints)
    @secret = 's' * 64
    @probes = 0
  end

  def activate(**overrides)
    arguments = { store: @store, endpoints: @endpoints, secret: @secret,
      native_mail_enabled: false, consumer_mail_enabled: false,
      webhooks_enabled: true,
      probe: ->(secret) { assert_equal @secret, secret; @probes += 1 } }
    EmailActivation.activate!(**arguments.merge(overrides))
  end

  def test_creates_only_owned_endpoint_after_successful_probe
    endpoint = activate
    assert_equal 1, @probes
    assert_equal 1, @endpoints.length
    assert_equal EmailActivation::URL, endpoint.url
    assert_equal %w[order.completed order.canceled order.shipped customer.password_reset_requested], endpoint.subscriptions
    assert_equal @secret, endpoint.secret_key
    assert endpoint.active
    assert_equal 1, endpoint.saves
  end

  def test_failed_probe_never_creates_or_enables_endpoint
    assert_raises(EmailActivation::Error) do
      activate(probe: ->(_) { raise EmailActivation::Error, 'Webhook probe failed' })
    end
    assert_empty @endpoints
    inactive = Endpoint.new(name: EmailActivation::NAME, url: EmailActivation::URL, active: false)
    @endpoints << inactive
    assert_raises(EmailActivation::Error) do
      activate(probe: ->(_) { raise EmailActivation::Error, 'Webhook probe failed' })
    end
    refute inactive.active
    assert_equal 0, inactive.saves
  end

  def test_repeat_activation_reuses_owned_endpoint_and_leaves_unrelated_endpoint_untouched
    own = activate
    other = Endpoint.new(name: 'Other integration', url: 'https://other.example/webhook', active: true)
    @endpoints << other
    assert_same own, activate
    assert_equal 2, @endpoints.length
    assert_equal 0, other.saves
    assert_equal 'https://other.example/webhook', other.url
    assert other.active
  end

  def test_wrong_store_duplicate_owner_or_duplicate_destination_is_rejected_before_probe
    @store.code = 'other'
    assert_raises(EmailActivation::Error) { activate }
    @store.code = 'bisontcg'
    @endpoints << Endpoint.new(name: 'Foreign owner', url: EmailActivation::URL)
    assert_raises(EmailActivation::Error) { activate }
    @endpoints.clear
    2.times { @endpoints << Endpoint.new(name: EmailActivation::NAME, url: EmailActivation::URL) }
    assert_raises(EmailActivation::Error) { activate }
    assert_equal 0, @probes
  end

  def test_native_mail_or_disabled_webhooks_and_invalid_secret_are_rejected
    [ { native_mail_enabled: true }, { consumer_mail_enabled: true },
      { webhooks_enabled: false }, { secret: nil }, { secret: '' },
      { secret: "#{@secret}\n" } ].each do |override|
      assert_raises(EmailActivation::Error) { activate(**override) }
    end
    assert_empty @endpoints
    assert_equal 0, @probes
  end

  def test_initial_enable_rejects_existing_transactional_backlog_but_active_repeat_is_safe
    assert_raises(EmailActivation::Error) { activate(pending_email_events: 1) }
    assert_empty @endpoints
    assert_equal 0, @probes
    own = activate
    assert_same own, activate(pending_email_events: 1)
  end

  def test_probe_is_signed_and_contains_no_person_directed_event
    requester = lambda do |request|
      payload = JSON.parse(request.body)
      assert_equal 'webhook.test', payload.fetch('name')
      refute payload.fetch('data').key?('email')
      assert_equal 'webhook.test', request['X-Spree-Webhook-Event']
      expected = OpenSSL::HMAC.hexdigest('SHA256', @secret,
        "#{request['X-Spree-Webhook-Timestamp']}.#{request.body}")
      assert_equal expected, request['X-Spree-Webhook-Signature']
      Struct.new(:code, :body).new('200', '{"received":true,"handled":false}')
    end
    assert EmailActivation.probe!(@secret, requester: requester)
  end

  def test_probe_rejects_auth_failure_redirect_handler_execution_and_malformed_json
    [ ['401', '{}'], ['302', '{}'], ['200', '{"received":true,"handled":true}'],
      ['200', 'not-json'], ['200', '[]'] ].each do |code, body|
      response = Struct.new(:code, :body).new(code, body)
      assert_raises(EmailActivation::Error) do
        EmailActivation.probe!(@secret, requester: ->(_) { response })
      end
    end
  end
end

checks = EmailActivationTest.instance_methods.grep(/^test_/)
checks.each do |name|
  instance = EmailActivationTest.new
  instance.setup
  instance.public_send(name)
end
puts "Email activation behavior tests passed (#{checks.length} scenarios)."
