# Only business configuration. No accounts, credentials, demo products or payments.
load './target.rb'
Spree::Current.set(content_locale: 'es') do
  Spree::Events.disable do
    ActiveRecord::Base.transaction do
      store = Spree::Store.find_by(code: 'bisontcg')
      raise 'Unexpected stores in the new database' unless Spree::Store.count == (store ? 1 : 0)
      unless store
        # Countries/states are reference data only; do not seed commercial defaults.
        Spree::Seeds::Countries.call
        country = Spree::Country.find_by!(iso: 'ES')
        I18n.with_locale(:es) do
          store = Spree::Store.new(
            name: 'BisonTCG', code: 'bisontcg', url: 'www.bisontcg.com',
            mail_from_address: 'no-reply@bisontcg.com', default: true,
            # Keep the supported legacy defaults until real shipping coverage is configured.
            # default_country_iso would create a Market and reject its uncovered country.
            default_country: country, default_currency: 'EUR', default_locale: 'es',
            supported_currencies: 'EUR', supported_locales: 'es,en'
          )
          store.preferred_admin_locale = 'es'
          store.preferred_timezone = 'Europe/Madrid'
          store.preferred_weight_unit = 'kg'
          store.preferred_unit_system = 'metric'
          store.preferred_send_consumer_transactional_emails = false
          store.preferred_storefront_url = 'https://www.bisontcg.com'
          store.save!
        end
      end
      if store.read_attribute(:name).blank?
        I18n.with_locale(:es) { store.update!(name: 'BisonTCG') }
      end
      Spree::Seeds::Roles.call
      Spree::Seeds::States.call
      store.default_shipping_category
      store.default_stock_location
      store.allowed_origins.find_or_create_by!(origin: 'https://www.bisontcg.com')
      store.reload
      raise 'Store content name was not persisted' if store.read_attribute(:name).blank?
      raise 'Market setup is pending real shipping coverage' unless store.markets.empty?
      raise 'Unexpected default store configuration' unless store.default? && store.default_currency == 'EUR' && store.default_country.iso == 'ES' && store.default_locale == 'es'
      raise 'Store has no default channel' unless store.default_channel
      puts "BisonTCG configuration verified: #{store.id}, ES, EUR, es"
    end
  end
end
