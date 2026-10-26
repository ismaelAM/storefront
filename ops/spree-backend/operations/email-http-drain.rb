require 'digest'
require 'json'
require 'openssl'
require 'securerandom'
require 'socket'
require_relative './email-activation'

# Uses the pinned Solid Queue 1.5.0 claim/perform/deregister lifecycle. It never
# accepts queue names, job IDs, recipients or payloads from an HTTP caller.
module EmailHttpDrain
  class Error < StandardError; end
  class RetryExhausted < StandardError; end
  PROCESS_PREFIX = 'bisontcg-email-http-'.freeze
  AUTH_CONTEXT = 'bison-email-http-v1'.freeze
  MAX_ATTEMPTS = 3
  START_BUDGET_SECONDS = 25
  PATH = '/internal/bison-email/drain'.freeze
  ACTIVATE_PATH = '/internal/bison-email/activate'.freeze

  def self.bearer(secret)
    OpenSSL::HMAC.hexdigest('SHA256', secret, AUTH_CONTEXT)
  end

  def self.authorized?(header, secret)
    return false unless header.is_a?(String) && header.match?(/\ABearer [0-9a-f]{64}\z/)
    supplied = header.delete_prefix('Bearer ')
    OpenSSL.fixed_length_secure_compare(Digest::SHA256.digest(supplied), Digest::SHA256.digest(bearer(secret)))
  end

  def self.run(repository:, clock: -> { ::Process.clock_gettime(::Process::CLOCK_MONOTONIC) })
    started = clock.call
    repository.with_lock do
      begin
        repository.recover_own_stale_processes!
        repository.dispatch_due!
        repository.enqueue_due_retry!
        # Native webhook HTTP has 30s open + 30s read timeouts. Do not start a
        # job after spending 25s on setup; one job is the maximum per request.
        next 0 if clock.call - started >= START_BUDGET_SECONDS
        repository.register!
        execution = repository.claim_one!
        next 0 unless execution
        if repository.delivery_claim?(execution) && !repository.reserve_attempt!(execution)
          repository.finish_without_sending!(execution)
        else
          repository.perform!(execution)
        end
        1
      ensure
        repository.deregister!
      end
    end || 0
  end

  def self.with_private_logging
    # ActiveJob logs arguments at INFO, including credential-bearing reset
    # payloads. Thread-local silence avoids changing other requests' loggers.
    EmailActivation.with_private_logging { yield }
  end

  def self.private_secret!
    rows = ActiveRecord::Base.connection.select_values(
      "SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name='#{EmailActivation::VAULT_NAME}'")
    unless rows.length == 1 && rows.first.is_a?(String) && rows.first.bytesize.between?(32, 512) && !rows.first.match?(/[[:space:]]/)
      raise Error, 'Private email configuration is unavailable'
    end
    rows.first
  end

  def self.validate_target!
    load Rails.root.join('target.rb')
    raise Error, 'Unexpected email processing project' unless ENV['TARGET_SUPABASE_PROJECT_REF'] == EmailActivation::OWNED_PROJECT
  end

  class Endpoint
    def self.call(env)
      return response(405, error: 'Method not allowed') unless env['REQUEST_METHOD'] == 'POST'
      return response(401, error: 'Unauthorized') unless env['HTTP_AUTHORIZATION'].to_s.match?(/\ABearer [0-9a-f]{64}\z/)
      EmailHttpDrain.with_private_logging do
        EmailHttpDrain.validate_target!
        secret = EmailHttpDrain.private_secret!
        unless EmailHttpDrain.authorized?(env['HTTP_AUTHORIZATION'], secret)
          return response(401, error: 'Unauthorized')
        end
        # The endpoint has no caller-selectable work or configuration.
        body = env.fetch('rack.input').read(3)
        return response(400, error: 'Unexpected request body') unless body == '{}'
        response(200, work(secret))
      end
    rescue StandardError
      # Never include exception messages, SQL, payloads, tokens or recipients.
      response(503, error: 'Email processing unavailable')
    end

    def self.response(status, value)
      [status, { 'content-type' => 'application/json', 'cache-control' => 'no-store' }, [JSON.generate(value)]]
    end

    def self.work(secret)
      { processed: EmailHttpDrain.run(repository: Repository.new(secret: secret)) }
    end
  end

  class ActivationEndpoint < Endpoint
    def self.work(secret)
      EmailActivation.run!(secret: secret)
      { activated: true }
    end
  end

  class Repository
    def initialize(secret:)
      raise Error, 'Unexpected stores' unless Spree::Store.count == 1
      @store = Spree::Store.find_by!(code: 'bisontcg')
      endpoints = @store.webhook_endpoints.to_a
      own = endpoints.select { |endpoint| endpoint.name == EmailActivation::NAME && endpoint.url == EmailActivation::URL }
      raise Error, 'Duplicate owned endpoints' if own.length > 1
      @endpoint = own.first
      if endpoints.any? { |endpoint| endpoint.url == EmailActivation::URL && endpoint != @endpoint }
        raise Error, 'Duplicate storefront destination'
      end
      @mail_ready = @endpoint && Rails.application.config.action_mailer.perform_deliveries == false &&
        @store.preferred_send_consumer_transactional_emails == false && Spree::Api::Config.webhooks_enabled &&
        @endpoint.active && @endpoint.disabled_at.nil? &&
        @endpoint.subscriptions.sort == EmailActivation::EVENTS.sort &&
        OpenSSL.fixed_length_secure_compare(Digest::SHA256.digest(@endpoint.secret_key.to_s), Digest::SHA256.digest(secret))
      @mail_ready = !!@mail_ready
      @process = nil
    end

    def with_lock
      SolidQueue::Record.connection_pool.with_connection do |connection|
        locked = connection.select_value('SELECT pg_try_advisory_lock(20261026, 3)')
        next 0 unless locked
        begin
          yield
        ensure
          connection.select_value('SELECT pg_advisory_unlock(20261026, 3)')
        end
      end
    end

    def recover_own_stale_processes!
      # Native Process.prune FAILS claims. Deregister only our expired leases:
      # its native after_destroy callback RELEASES claims back to ready instead.
      SolidQueue::Process.where(kind: 'Worker').where('name LIKE ?', "#{PROCESS_PREFIX}%")
        .where('last_heartbeat_at < ?', Time.current - 600).limit(10).each(&:deregister)
    end

    def eligible_jobs
      # Native jobs only, with exact class, queue, event, store and activation
      # cutoff. No Ruby deserialization occurs until native Claim#perform.
      SolidQueue::Job.where(finished_at: nil).where(<<~SQL, @mail_ready, EmailActivation::EVENTS, @store.id.to_s, @endpoint&.created_at, @endpoint&.id, EmailActivation::EVENTS, @endpoint&.created_at, @store.id)
        (? AND ((queue_name='spree_events' AND class_name='Spree::Events::SubscriberJob'
          AND arguments::jsonb->'arguments'->>0='Spree::WebhookEventSubscriber'
          AND arguments::jsonb->'arguments'->1->>'name' IN (?)
          AND arguments::jsonb->'arguments'->1->>'store_id'=? AND created_at>=?)
        OR (queue_name='spree_webhooks' AND class_name='Spree::WebhookDeliveryJob'
          AND arguments::jsonb->'arguments'->>0 IN
            (SELECT id::text FROM spree_webhook_deliveries
             WHERE webhook_endpoint_id=? AND event_name IN (?) AND created_at>=?))))
        OR (class_name='Spree::Payments::HandleWebhookJob'
          AND arguments::jsonb->'arguments'->0->>'action' IN ('captured','authorized','failed')
          AND EXISTS (SELECT 1 FROM spree_payment_sessions ps
            JOIN spree_payment_methods pm ON pm.id=ps.payment_method_id
            WHERE pm.store_id=? AND pm.type='SpreeStripe::Gateway' AND pm.name='Stripe BisonTCG'
              AND pm.active AND pm.deleted_at IS NULL
              AND ps.id::text=solid_queue_jobs.arguments::jsonb->'arguments'->0->>'payment_session_id'
              AND pm.id::text=solid_queue_jobs.arguments::jsonb->'arguments'->0->>'payment_method_id'
              AND solid_queue_jobs.created_at>=pm.created_at))
      SQL
    end

    def dispatch_due!
      SolidQueue::ScheduledExecution.where(job_id: eligible_jobs.select(:id)).scoping do
        SolidQueue::ScheduledExecution.dispatch_next_batch(1)
      end
    end

    def enqueue_due_retry!
      return unless @mail_ready
      # Reset credentials are absent from persisted delivery payloads; only a
      # fresh customer reset request can safely recreate them. Retrying a native
      # scheduled reset job is allowed because it still holds payload_secrets.
      delivery = @endpoint.webhook_deliveries.where(event_name: EmailActivation::EVENTS - ['customer.password_reset_requested'])
        .where(success: false).where('spree_webhook_deliveries.created_at >= ?', @endpoint.created_at)
        .joins('INNER JOIN bison_email_delivery_attempts AS attempts ON attempts.delivery_id=spree_webhook_deliveries.id')
        .where('attempts.attempts < ? AND attempts.next_attempt_at <= ? AND spree_webhook_deliveries.delivered_at >= attempts.last_attempt_at', MAX_ATTEMPTS, Time.current)
        .where(<<~SQL).order('attempts.next_attempt_at ASC').first
          NOT EXISTS (SELECT 1 FROM solid_queue_jobs j WHERE j.finished_at IS NULL
            AND j.class_name='Spree::WebhookDeliveryJob' AND j.queue_name='spree_webhooks'
            AND j.arguments::jsonb->'arguments'->>0=spree_webhook_deliveries.id::text)
        SQL
      Spree::WebhookDeliveryJob.perform_later(delivery.id) if delivery
    end

    def register!
      @process = SolidQueue::Process.register(kind: 'Worker',
        name: "#{PROCESS_PREFIX}#{SecureRandom.hex(12)}", pid: ::Process.pid,
        hostname: Socket.gethostname, metadata: { queues: "spree_events,spree_webhooks,#{Spree.queues.payment_webhooks}", thread_pool_size: 1 })
    end

    def claim_one!
      SolidQueue::ReadyExecution.where(job_id: eligible_jobs.select(:id)).scoping do
        SolidQueue::ReadyExecution.claim([Spree.queues.payment_webhooks, 'spree_webhooks', 'spree_events'], 1, @process.id).first
      end
    end

    def delivery_claim?(execution)
      execution.job.class_name == 'Spree::WebhookDeliveryJob'
    end

    def reserve_attempt!(execution)
      arguments = execution.job.arguments
      arguments = JSON.parse(arguments) if arguments.is_a?(String)
      id = arguments.fetch('arguments').first.to_s
      raise Error, 'Unexpected native delivery ID' unless id.match?(/\A[1-9][0-9]*\z/)
      delivery = @endpoint.webhook_deliveries.find_by(id: id)
      return false unless delivery && delivery.success != true && EmailActivation::EVENTS.include?(delivery.event_name)
      connection = ActiveRecord::Base.connection
      # IDs are native positive integers, never caller input or payload secrets.
      connection.execute("INSERT INTO bison_email_delivery_attempts (delivery_id) VALUES (#{delivery.id}) ON CONFLICT (delivery_id) DO NOTHING")
      attempt = connection.select_value(<<~SQL)
        UPDATE bison_email_delivery_attempts
        SET attempts=attempts+1, last_attempt_at=CURRENT_TIMESTAMP,
          next_attempt_at=CURRENT_TIMESTAMP + (attempts+1) * INTERVAL '2 minutes'
        WHERE delivery_id=#{delivery.id} AND attempts<#{MAX_ATTEMPTS}
        RETURNING attempts
      SQL
      !attempt.nil?
    end

    def finish_without_sending!(execution)
      # Public native finalization records the policy stop and destroys the
      # claim; a future ordinary worker cannot accidentally resend this job.
      execution.failed_with(RetryExhausted.new('Email attempt limit reached or delivery already completed'))
    end

    def perform!(execution)
      execution.perform
    end

    def deregister!
      @process.deregister if @process&.persisted?
      @process = nil
    end
  end
end
