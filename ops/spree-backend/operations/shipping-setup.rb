# Fixed restoration of the documented 2026 checkout tariffs. No caller-selected
# values, carrier API calls, product updates, stock changes or inferred weights.
module ShippingSetup
  class Error < StandardError; end
  VERSION = 'bison-shipping-2026-v1'.freeze
  STATE_ABBREVIATIONS = %w[A AB AL AV B BA BI BU C CA CC CE CO CR CS CU GC GI GR GU H HU J L LE LO LU M MA ML MU NA O OR P PM PO S SA SE SG SO SS T TE TF TO V VA VI Z ZA].freeze
  ZONE_NAMES = {
    'peninsula' => 'Península', 'baleares' => 'Baleares',
    'canarias' => 'Canarias', 'madrid' => 'Madrid'
  }.freeze
  PRICES = {
    'peninsula' => %w[13.65 17.10 22.95 27.81 33.65 39.01 44.25].freeze,
    'baleares' => %w[15.40 21.80 34.90 46.50 58.46 70.25 83.09].freeze,
    'canarias' => %w[21.30 30.70 38.40 49.10 66.75 86.85 107.00].freeze
  }.freeze

  def self.zone_state_ids!(states)
    unless states.length == 52 && states.map(&:abbr).sort == STATE_ABBREVIATIONS.sort && states.map(&:id).uniq.length == 52
      raise Error, 'Unexpected Spanish state reference data'
    end
    by_abbr = states.to_h { |state| [state.abbr, state.id] }
    {
      'peninsula' => states.reject { |state| %w[PM GC TF CE ML].include?(state.abbr) }.map(&:id).sort,
      'baleares' => [by_abbr.fetch('PM')],
      'canarias' => %w[GC TF].map { |abbr| by_abbr.fetch(abbr) }.sort,
      'madrid' => [by_abbr.fetch('M')]
    }
  end

  def self.method_specs
    upper = [1, 5, 10, 15, 20, 25, 30]
    specs = PRICES.flat_map do |zone, prices|
      upper.each_with_index.map do |weight, index|
        { code: "correos-2026-#{zone}-#{weight}kg", name: 'Correos', zone: zone,
          amount: prices.fetch(index), minimum_weight: index.zero? ? 0 : upper.fetch(index - 1),
          maximum_weight: weight, days_min: zone == 'peninsula' ? 4 : 7,
          days_max: zone == 'peninsula' ? 7 : 14 }
      end
    end
    specs + [{ code: 'entrega-madrid-2026', name: 'Entrega en Madrid', zone: 'madrid',
      amount: '4.99', minimum_weight: nil, maximum_weight: nil, days_min: nil, days_max: nil }]
  end

  def self.calculator_preferences(spec)
    { amount: spec.fetch(:amount), currency: 'EUR', minimum_item_total: nil, maximum_item_total: nil,
      minimum_weight: spec.fetch(:minimum_weight), maximum_weight: spec.fetch(:maximum_weight) }
  end

  def self.preferences_match?(actual, expected)
    values = actual.transform_keys(&:to_sym)
    return false unless values.keys.sort == expected.keys.sort
    expected.all? do |key, value|
      if value.nil? || key == :currency
        values[key] == value
      else
        !values[key].nil? && Rational(values[key].to_s) == Rational(value.to_s)
      end
    end
  rescue ArgumentError, TypeError, ZeroDivisionError
    false
  end

  def self.validate_method!(method, spec, zone_id, category_ids)
    fields = { code: spec.fetch(:code), name: spec.fetch(:name), admin_name: spec.fetch(:code),
      display_on: 'both', tax_category_id: nil, tracking_url: nil, deleted_at: nil,
      estimated_transit_business_days_min: spec.fetch(:days_min),
      estimated_transit_business_days_max: spec.fetch(:days_max),
      private_metadata: { 'bison_shipping_setup' => VERSION } }
    unless fields.all? { |key, value| method.public_send(key) == value } &&
      method.zone_ids.sort == [zone_id] && method.shipping_category_ids.sort == category_ids.sort
      raise Error, 'Existing shipping method differs from fixed configuration'
    end
    calculator = method.calculator
    unless calculator && calculator.type == 'Spree::Calculator::Shipping::FlatRate' && calculator.deleted_at.nil? &&
      preferences_match?(calculator.preferences, calculator_preferences(spec))
      raise Error, 'Existing shipping calculator differs from fixed configuration'
    end
    true
  end

  def self.validate_zone!(zone, key, state_ids)
    members = zone.zone_members.pluck(:zoneable_type, :zoneable_id).sort
    expected = state_ids.map { |id| ['Spree::State', id] }.sort
    unless zone.name == ZONE_NAMES.fetch(key) && zone.kind == 'state' && zone.default_tax == false &&
      zone.description == "#{VERSION}: #{key}" && members == expected && !zone.tax_rates.exists?
      raise Error, 'Existing shipping zone differs from fixed configuration'
    end
    true
  end

  def self.restore!
    # ShippingMethod and Zone are global native models in Spree 5.6.1.
    # Require the owned singleton store before considering any global writes.
    store = PaymentSetup.store!
    unless store.id == 4 && Spree::Store.unscoped.count == 1 && store.default_currency == 'EUR' && store.preferred_weight_unit == 'kg'
      raise Error, 'Unexpected store or shipment units'
    end
    ActiveRecord::Base.transaction do
      connection = ActiveRecord::Base.connection
      raise Error, 'Unexpected shipping schema' unless connection.select_value('SELECT current_schema()') == 'spree'
      raise Error, 'Shipping restoration is busy' unless connection.select_value('SELECT pg_try_advisory_xact_lock(20261027, 4)')
      countries = Spree::Country.where(iso: 'ES').to_a
      raise Error, 'Unexpected Spanish country reference data' unless countries.length == 1 && countries.first.id == 67
      state_ids = zone_state_ids!(countries.first.states.to_a)
      categories = Spree::ShippingCategory.where(id: [1, 2, 3]).order(:id).to_a
      unless categories.map { |category| [category.id, category.name] } == [[1, 'Default'], [2, 'Predeterminado'], [3, 'Predeterminado']]
        raise Error, 'Unexpected physical shipping categories'
      end
      category_ids = categories.map(&:id)
      specs = method_specs
      methods = Spree::ShippingMethod.unscoped.to_a
      zones = Spree::Zone.all.to_a
      unless methods.map(&:code).uniq.length == methods.length && (methods.map(&:code) - specs.map { |spec| spec.fetch(:code) }).empty?
        raise Error, 'Unexpected or duplicate shipping methods'
      end
      unless zones.map(&:name).uniq.length == zones.length && (zones.map(&:name) - ZONE_NAMES.values).empty?
        raise Error, 'Unexpected or duplicate shipping zones'
      end

      # Preflight all existing rows before creating anything. A changed existing
      # tariff is never silently overwritten; the transaction also covers all
      # new native models, join records and calculator preferences.
      zone_by_key = ZONE_NAMES.to_h do |key, name|
        zone = zones.find { |candidate| candidate.name == name }
        validate_zone!(zone, key, state_ids.fetch(key)) if zone
        [key, zone]
      end
      methods.each do |method|
        spec = specs.find { |candidate| candidate.fetch(:code) == method.code }
        zone = zone_by_key.fetch(spec.fetch(:zone))
        raise Error, 'Existing shipping method has no expected zone' unless zone
        validate_method!(method, spec, zone.id, category_ids)
      end

      created_zones = 0
      zone_by_key.each do |key, zone|
        next if zone
        zone = Spree::Zone.create!(name: ZONE_NAMES.fetch(key), kind: 'state', default_tax: false,
          description: "#{VERSION}: #{key}")
        zone.state_ids = state_ids.fetch(key)
        zone.reload
        validate_zone!(zone, key, state_ids.fetch(key))
        zone_by_key[key] = zone
        created_zones += 1
      end
      created_methods = 0
      specs.each do |spec|
        next if methods.any? { |method| method.code == spec.fetch(:code) }
        zone = zone_by_key.fetch(spec.fetch(:zone))
        calculator = Spree::Calculator::Shipping::FlatRate.new
        calculator_preferences(spec).each { |key, value| calculator.public_send("preferred_#{key}=", value) }
        method = Spree::ShippingMethod.new(name: spec.fetch(:name), code: spec.fetch(:code),
          admin_name: spec.fetch(:code), display_on: 'both', tax_category: nil,
          estimated_transit_business_days_min: spec.fetch(:days_min),
          estimated_transit_business_days_max: spec.fetch(:days_max),
          private_metadata: { 'bison_shipping_setup' => VERSION })
        method.shipping_categories = categories
        method.zones = [zone]
        method.calculator = calculator
        method.save!
        validate_method!(method.reload, spec, zone.id, category_ids)
        created_methods += 1
      end
      unless Spree::ShippingMethod.unscoped.count == 22 && Spree::Zone.count == 4
        raise Error, 'Unexpected restored shipping counts'
      end
      { restored: true, shipping_methods: 22, zones: 4,
        created_shipping_methods: created_methods, created_zones: created_zones }
    end
  end
end
