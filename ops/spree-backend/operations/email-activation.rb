require 'json'
require 'logger'
require 'net/http'
require 'openssl'
require 'securerandom'
require 'time'
require 'uri'

module EmailActivation
  class Error < StandardError; end

  NAME = 'BisonTCG storefront transactional email'.freeze
  URL = 'https://www.bisontcg.com/api/webhooks/spree'.freeze
  VAULT_NAME = 'spree_storefront_webhook_secret_20261026'.freeze
  OWNED_PROJECT = 'dtrospakebdiqihhcrub'.freeze
  EVENTS = %w[order.completed order.canceled order.shipped customer.password_reset_requested].freeze

  # Shared by the explicit one-shot runner and authenticated activation route.
  # No caller chooses store, URL, subscriptions or secret source.
  def self.run!(secret: nil)
    with_private_logging { run_private!(secret: secret) }
  end

  def self.with_private_logging(&work)
    loggers = [Rails.logger, ActiveRecord::Base.logger]
    loggers << SolidQueue::Record.logger if defined?(SolidQueue::Record)
    loggers << ActiveJob::Base.logger if defined?(ActiveJob::Base)
    silence_loggers(loggers.compact.uniq, &work)
  end

  def self.silence_loggers(loggers, &work)
    return work.call if loggers.empty?
    loggers.first.silence(Logger::UNKNOWN + 1) { silence_loggers(loggers.drop(1), &work) }
  end

  def self.run_private!(secret: nil)
    load Rails.root.join('target.rb')
    raise Error, 'Unexpected email activation project' unless ENV['TARGET_SUPABASE_PROJECT_REF'] == OWNED_PROJECT
    ActiveRecord::Migration.check_all_pending!
    endpoint = nil
    ActiveRecord::Base.transaction do
      connection = ActiveRecord::Base.connection
      raise Error, 'Email activation is already running' unless connection.select_value('SELECT pg_try_advisory_xact_lock(20261026, 2)')
      raise Error, 'Unexpected stores in owned database' unless Spree::Store.count == 1
      store = Spree::Store.find_by!(code: 'bisontcg')
      unless secret
        secrets = connection.select_values("SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name='#{VAULT_NAME}'")
        raise Error, 'Expected one private webhook secret' unless secrets.length == 1
        secret = secrets.first
      end
      endpoints = store.webhook_endpoints.lock.to_a
      pending_email_events = connection.select_value(<<~SQL).to_i
        SELECT count(*) FROM solid_queue_jobs
        WHERE finished_at IS NULL AND class_name='Spree::Events::SubscriberJob'
          AND arguments::jsonb->'arguments'->>0='Spree::WebhookEventSubscriber'
          AND arguments::jsonb->'arguments'->1->>'name' IN
            ('order.completed','order.canceled','order.shipped','customer.password_reset_requested')
      SQL
      Spree::Events.disable do
        endpoint = activate!(store: store, endpoints: endpoints, secret: secret,
          native_mail_enabled: Rails.application.config.action_mailer.perform_deliveries,
          consumer_mail_enabled: store.preferred_send_consumer_transactional_emails,
          webhooks_enabled: Spree::Api::Config.webhooks_enabled,
          pending_email_events: pending_email_events)
      end
    end
    endpoint
  end

  def self.activate!(store:, endpoints:, secret:, native_mail_enabled:,
    consumer_mail_enabled:, webhooks_enabled:, pending_email_events: 0,
    probe: method(:probe!))
    raise Error, 'Unexpected email store' unless store.code == 'bisontcg'
    raise Error, 'Native Rails delivery must remain disabled' unless native_mail_enabled == false
    raise Error, 'Native consumer mail must remain disabled' unless consumer_mail_enabled == false
    raise Error, 'Spree outbound webhooks are disabled' unless webhooks_enabled == true
    unless secret.is_a?(String) && secret.bytesize.between?(32, 512) && !secret.match?(/[[:space:]]/)
      raise Error, 'Missing or invalid private webhook secret'
    end

    owned = endpoints.select { |endpoint| endpoint.name == NAME }
    raise Error, 'Duplicate owned email endpoints' if owned.length > 1
    if endpoints.any? { |endpoint| endpoint.url == URL && endpoint.name != NAME }
      raise Error, 'Storefront webhook URL already belongs to another endpoint'
    end
    endpoint = owned.first
    raise Error, 'Owned email endpoint has unexpected URL' if endpoint && endpoint.url != URL
    if (!endpoint || !endpoint.active) && pending_email_events != 0
      raise Error, 'Pending historical transactional events require review before first enable'
    end

    # A signed webhook.test must prove the new frontend deployment is ready.
    # This event deliberately has no person/recipient and no email handler.
    probe.call(secret)

    endpoint ||= store.webhook_endpoints.build(name: NAME, url: URL)
    endpoint.assign_attributes(active: true, subscriptions: EVENTS.dup,
      secret_key: secret, disabled_at: nil, disabled_reason: nil)
    endpoint.save!
    endpoint
  end

  def self.probe!(secret, requester: method(:request_probe))
    timestamp = Time.now.to_i.to_s
    body = JSON.generate(id: SecureRandom.uuid, name: 'webhook.test',
      created_at: Time.now.utc.iso8601,
      data: { message: 'Email activation signing check; no email is sent.' },
      metadata: { purpose: 'email_activation' })
    request = Net::HTTP::Post.new(URI(URL))
    request['Content-Type'] = 'application/json'
    request['X-Spree-Webhook-Event'] = 'webhook.test'
    request['X-Spree-Webhook-Timestamp'] = timestamp
    request['X-Spree-Webhook-Signature'] = OpenSSL::HMAC.hexdigest('SHA256', secret, "#{timestamp}.#{body}")
    request.body = body
    response = requester.call(request)
    raise Error, 'Frontend signing check did not return HTTP 200' unless response.code.to_s == '200'
    result = JSON.parse(response.body.to_s)
    unless result.is_a?(Hash) && result['received'] == true && result['handled'] == false
      raise Error, 'Frontend signing check returned an unexpected result'
    end
    true
  rescue JSON::ParserError
    raise Error, 'Frontend signing check returned invalid JSON'
  rescue Error
    raise
  rescue StandardError
    # Never propagate response bodies, tokens, headers or exception messages.
    raise Error, 'Frontend signing check failed'
  end

  def self.request_probe(request)
    uri = URI(URL)
    Net::HTTP.start(uri.host, uri.port, use_ssl: true,
      verify_mode: OpenSSL::SSL::VERIFY_PEER, open_timeout: 5,
      read_timeout: 20, write_timeout: 5) { |http| http.request(request) }
  end
end
