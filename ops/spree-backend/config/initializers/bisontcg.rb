# Durable objects live in private Supabase Storage, never the container disk.
Rails.application.config.active_storage.service = :supabase

# Vercel supplies the current deployment hostname. An explicit RAILS_HOST takes
# precedence after a stable admin domain is connected.
public_host = ENV['RAILS_HOST'].presence || ENV['VERCEL_URL'].presence
if public_host
  Rails.application.routes.default_url_options.merge!(host: public_host, protocol: 'https')
  Rails.application.config.action_mailer.default_url_options = { host: public_host, protocol: 'https' }
end

# Preview does not emit transactional messages while reconstruction is verified.
Rails.application.config.action_mailer.perform_deliveries = false

# A separate durable job processor is required before production cutover.
# Do not turn on in-Puma workers in this scale-to-zero web service.
abort 'Unexpected in-Puma job worker' unless ENV['SOLID_QUEUE_IN_PUMA'] == 'false'
