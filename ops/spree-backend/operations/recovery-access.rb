module RecoveryAccess
  NAME = 'BisonTCG supplier integration'.freeze
  VAULT_NAME = 'spree_owned_bot_20261026'.freeze
  SCOPES = %w[write_products write_stock write_categories write_settings].freeze

  # Called with SQL logging disabled. Token values are bound parameters and
  # never printed. Both the official model and private handoff commit together.
  def self.provision!(store, connection)
    raise ArgumentError, 'Unexpected integration store' unless store.code == 'bisontcg'
    raise ArgumentError, 'Integration recovery already running' unless connection.select_value('SELECT pg_try_advisory_lock(20261026, 1)')
    begin
      connection.transaction do
        keys = store.api_keys.active.secret.where(name: NAME)
        raise ArgumentError, 'Duplicate integration keys' if keys.count > 1
        token = connection.select_value("SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name='#{VAULT_NAME}'")
        key = keys.first
        if key
          valid = key.store_id == store.id && key.scopes.sort == SCOPES.sort &&
            !token.nil? && Spree::ApiKey.find_by_secret_token(token) == key
          raise ArgumentError, 'Existing integration handoff cannot be verified' unless valid
        else
          raise ArgumentError, 'Orphaned integration handoff' unless token.nil?
          key = store.api_keys.create!(name: NAME, key_type: 'secret', scopes: SCOPES)
          token = key.plaintext_token
          raise ArgumentError, 'Integration token was not issued' unless token&.start_with?('sk_')
          binds = [token, VAULT_NAME, 'Scoped supplier key; private migration handoff'].map.with_index do |value, index|
            ActiveRecord::Relation::QueryAttribute.new("handoff_#{index}", value, ActiveRecord::Type::String.new)
          end
          connection.exec_query('SELECT vault.create_secret($1, $2, $3)', 'Private integration handoff', binds)
        end
      end
    ensure
      connection.execute('SELECT pg_advisory_unlock(20261026, 1)')
    end
    true
  end
end
