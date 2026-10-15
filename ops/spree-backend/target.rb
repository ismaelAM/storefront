require 'uri'
ref = ENV.fetch('TARGET_SUPABASE_PROJECT_REF')
abort 'Invalid target project' unless ref.match?(/\A[a-z]{20}\z/) && ref != 'ikglqbjlbkbaronbiryl'

def valid_target?(host, port, user, database, tls, ref)
  direct = host == "db.#{ref}.supabase.co"
  pooler = host&.end_with?('.pooler.supabase.com') && user == "postgres.#{ref}"
  (direct || pooler) && port.to_i == 5432 && database == 'postgres' && ['require', 'verify-full'].include?(tls)
end

begin
  url = URI.parse(ENV.fetch('DATABASE_URL'))
  options = URI.decode_www_form(url.query.to_s)
  keys = options.map(&:first)
  allowed = keys.uniq.length == keys.length && (keys - ['sslmode', 'connect_timeout']).empty?
  values = options.to_h
  allowed &&= !values.key?('connect_timeout') || values['connect_timeout'].match?(/\A[1-9][0-9]*\z/)
  user = URI.decode_www_form_component(url.user.to_s)
  database = URI.decode_www_form_component(url.path.to_s.sub(/\A\//, ''))
  valid = ['postgres', 'postgresql'].include?(url.scheme) && url.fragment.nil? && allowed
  valid &&= valid_target?(url.host, url.port || 5432, user, database, values['sslmode'], ref)
  abort 'Unexpected database target or TLS configuration' unless valid

  # A second invocation through rails runner also validates resolved database.yml.
  # Read configuration only: do not open a database connection here.
  if defined?(ActiveRecord::Base)
    config = ActiveRecord::Base.connection_db_config.configuration_hash.transform_keys(&:to_s)
    valid = valid_target?(config['host'], config['port'] || 5432, config['username'], config['database'], config['sslmode'], ref)
    abort 'Unexpected effective database target or TLS configuration' unless valid
  end
rescue URI::InvalidURIError, ArgumentError, KeyError
  abort 'Invalid database connection configuration'
end
