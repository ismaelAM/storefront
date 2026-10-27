require_relative './shipping-setup'

def check(value, label)
  raise "Shipping assertion failed: #{label}" unless value
end

def rejects(label)
  yield
  raise "Shipping accepted unsafe configuration: #{label}"
rescue ShippingSetup::Error
end

# Missing/duplicated reference data must fail before a zone is created.
StateReference = Struct.new(:id, :abbr)
abbreviations = %w[A AB AL AV B BA BI BU C CA CC CE CO CR CS CU GC GI GR GU H HU J L LE LO LU M MA ML MU NA O OR P PM PO S SA SE SG SO SS T TE TF TO V VA VI Z ZA]
states = abbreviations.each_with_index.map { |abbr, i| StateReference.new(i + 1, abbr) }
zones = ShippingSetup.zone_state_ids!(states)
check(zones.fetch('peninsula').length == 47, '47 mainland provinces')
check(zones.fetch('madrid') == [states.find { |state| state.abbr == 'M' }.id], 'Madrid only')
check(zones.fetch('baleares') == [states.find { |state| state.abbr == 'PM' }.id], 'Balearic only')
check(zones.fetch('canarias').sort == states.select { |state| %w[GC TF].include?(state.abbr) }.map(&:id).sort, 'Canary provinces')
%w[PM GC TF CE ML].each do |abbr|
  check(!zones.fetch('peninsula').include?(states.find { |state| state.abbr == abbr }.id), "exclude #{abbr}")
end
rejects('missing province') { ShippingSetup.zone_state_ids!(states.drop(1)) }
rejects('duplicate abbreviation') { ShippingSetup.zone_state_ids!(states[0...-1] + [states.first]) }
rejects('unexpected province') { ShippingSetup.zone_state_ids!(states[0...-1] + [StateReference.new(99, 'XX')]) }

specs = ShippingSetup.method_specs
check(specs.length == 22 && specs.map { |spec| spec.fetch(:code) }.uniq.length == 22, '22 stable identifiers')
expected = {
  'peninsula' => %w[13.65 17.10 22.95 27.81 33.65 39.01 44.25],
  'baleares' => %w[15.40 21.80 34.90 46.50 58.46 70.25 83.09],
  'canarias' => %w[21.30 30.70 38.40 49.10 66.75 86.85 107.00]
}
expected.each do |zone, amounts|
  check(specs.select { |spec| spec[:zone] == zone }.map { |spec| spec[:amount] } == amounts, "published #{zone} prices")
end
madrid = specs.find { |spec| spec[:zone] == 'madrid' }
check(madrid[:amount] == '4.99' && madrid[:minimum_weight].nil? && madrid[:maximum_weight].nil?, 'Madrid fixed price without invented weight limits')

# Existing matching models are accepted without writes, and changed ones fail.
# No Rails/DB dependency is required by this test; native persistence is exercised
# by the authenticated restore operation and its postconditions.
CalculatorRecord = Struct.new(:type, :preferences, :deleted_at)
MethodRecord = Struct.new(:code, :name, :admin_name, :display_on, :tax_category_id,
  :tracking_url, :estimated_transit_business_days_min, :estimated_transit_business_days_max,
  :private_metadata, :deleted_at, :calculator, :zone_ids, :shipping_category_ids)
spec = specs.first
record = MethodRecord.new(spec[:code], spec[:name], spec[:code], 'both', nil, nil,
  spec[:days_min], spec[:days_max], { 'bison_shipping_setup' => ShippingSetup::VERSION }, nil,
  CalculatorRecord.new('Spree::Calculator::Shipping::FlatRate', ShippingSetup.calculator_preferences(spec), nil),
  [7], [1, 2, 3])
2.times { ShippingSetup.validate_method!(record, spec, 7, [1, 2, 3]) }
record.zone_ids = [7, 8]
rejects('Madrid or other extra coverage') { ShippingSetup.validate_method!(record, spec, 7, [1, 2, 3]) }
record.zone_ids = [7]
record.tax_category_id = 1
rejects('double VAT') { ShippingSetup.validate_method!(record, spec, 7, [1, 2, 3]) }
record.tax_category_id = nil
record.calculator.preferences = record.calculator.preferences.merge(amount: '0')
rejects('changed existing price') { ShippingSetup.validate_method!(record, spec, 7, [1, 2, 3]) }
record.calculator.preferences = ShippingSetup.calculator_preferences(spec)
record.shipping_category_ids = [1, 2, 3, 4]
rejects('unexpected shipping category') { ShippingSetup.validate_method!(record, spec, 7, [1, 2, 3]) }

# Exercise the pinned native FlatRate code, with only its preference DSL and
# Rails present? dependency replaced. No band logic is reimplemented here.
module Spree
  class ShippingCalculator
    def self.preference(name, *_arguments, **_options)
      attr_accessor "preferred_#{name}"
    end
  end
  class Calculator
    module Shipping; end
  end
end
def require_dependency(_path); end
class Object
  def present?; !nil?; end
end
native_source = if defined?(NATIVE_FLAT_RATE_SOURCE)
  NATIVE_FLAT_RATE_SOURCE
else
  require 'bundler/setup' unless ENV['SPREE_FLAT_RATE_SOURCE']
  source_path = ENV['SPREE_FLAT_RATE_SOURCE'] || Gem::Specification.find_all_by_name('spree_core').first&.full_gem_path&.then do |root|
    File.join(root, 'app/models/spree/calculator/shipping/flat_rate.rb')
  end
  raise 'Set SPREE_FLAT_RATE_SOURCE to the pinned Spree 5.6.1 FlatRate source' unless source_path
  File.read(source_path)
end
eval(native_source, TOPLEVEL_BINDING, 'native_spree_flat_rate.rb')
PackageWeight = Struct.new(:weight, :item_total)
expected.each_key do |zone|
  calculators = specs.select { |candidate| candidate[:zone] == zone }.map do |candidate|
    calculator = Spree::Calculator::Shipping::FlatRate.new
    ShippingSetup.calculator_preferences(candidate).each { |key, value| calculator.public_send("preferred_#{key}=", value) }
    calculator
  end
  [0, 1, 5, 10, 15, 20, 25, 30].each_with_index do |weight, index|
    eligible = calculators.filter_map { |calculator| calculator.compute_package(PackageWeight.new(weight, 10)) }
    check(eligible == (index.zero? ? [] : [expected.fetch(zone).fetch(index - 1)]), "#{zone} inclusive upper boundary #{weight}")
  end
  [0.001, 1.001, 5.001, 10.001, 15.001, 20.001, 25.001].each_with_index do |weight, index|
    eligible = calculators.filter_map { |calculator| calculator.compute_package(PackageWeight.new(weight, 10)) }
    check(eligible == [expected.fetch(zone).fetch(index)], "#{zone} exclusive lower boundary #{weight}")
  end
  check(calculators.none? { |calculator| calculator.compute_package(PackageWeight.new(30.001, 10)) }, "#{zone} rejects over 30 kg")
end
local = Spree::Calculator::Shipping::FlatRate.new
ShippingSetup.calculator_preferences(madrid).each { |key, value| local.public_send("preferred_#{key}=", value) }
check(local.compute_package(PackageWeight.new(0, 10)) == '4.99', 'native Madrid fixed fee does not require invented weight')

# A complete existing installation must be a no-write operation on every rerun.
# These boundary doubles deliberately have no create/save/update implementations.
class ReferenceRows < Array
  def pluck(*keys); map { |row| keys.length == 1 ? row.public_send(keys.first) : keys.map { |key| row.public_send(key) } }; end
  def exists?; !empty?; end
end
ZoneMemberReference = Struct.new(:zoneable_type, :zoneable_id)
ZoneRecord = Struct.new(:id, :name, :kind, :default_tax, :description, :zone_members, :tax_rates)
CountryReference = Struct.new(:id, :states)
CategoryReference = Struct.new(:id, :name)
StoreReference = Struct.new(:id, :default_currency, :preferred_weight_unit)
module ActiveRecord
  class Base
    def self.transaction; yield; end
    def self.connection; self; end
    def self.select_value(sql); sql.include?('current_schema') ? 'spree' : true; end
  end
end
module PaymentSetup
  def self.store!; Spree::Store.current; end
end
module Spree
  class Store
    class << self; attr_accessor :current, :store_count; end
    def self.unscoped; self; end
    def self.count; store_count; end
  end
  class Country
    class << self; attr_accessor :records; end
    def self.where(**_attributes); records; end
  end
  class ShippingCategory
    class << self; attr_accessor :records; end
    def self.where(**_attributes); self; end
    def self.order(*_fields); records; end
  end
  class Zone
    class << self; attr_accessor :records; end
    def self.all; records; end
    def self.count; records.length; end
  end
  class ShippingMethod
    class << self; attr_accessor :records; end
    def self.unscoped; self; end
    def self.to_a; records; end
    def self.count; records.length; end
  end
end
Spree::Store.current = StoreReference.new(4, 'EUR', 'kg')
Spree::Store.store_count = 1
Spree::Country.records = [CountryReference.new(67, states)]
Spree::ShippingCategory.records = [[1, 'Default'], [2, 'Predeterminado'], [3, 'Predeterminado']].map { |attributes| CategoryReference.new(*attributes) }
Spree::Zone.records = ShippingSetup::ZONE_NAMES.each_with_index.map do |(key, name), index|
  members = ReferenceRows.new(zones.fetch(key).map { |id| ZoneMemberReference.new('Spree::State', id) })
  ZoneRecord.new(index + 1, name, 'state', false, "#{ShippingSetup::VERSION}: #{key}", members, ReferenceRows.new)
end
Spree::ShippingMethod.records = specs.map do |candidate|
  zone = Spree::Zone.records.find { |zone_record| zone_record.name == ShippingSetup::ZONE_NAMES.fetch(candidate[:zone]) }
  MethodRecord.new(candidate[:code], candidate[:name], candidate[:code], 'both', nil, nil,
    candidate[:days_min], candidate[:days_max], { 'bison_shipping_setup' => ShippingSetup::VERSION }, nil,
    CalculatorRecord.new('Spree::Calculator::Shipping::FlatRate', ShippingSetup.calculator_preferences(candidate), nil),
    [zone.id], [1, 2, 3])
end
2.times do
  result = ShippingSetup.restore!
  check(result == { restored: true, shipping_methods: 22, zones: 4, created_shipping_methods: 0, created_zones: 0 }, 'idempotent restore performs no writes')
end
Spree::Store.store_count = 2
rejects('another store') { ShippingSetup.restore! }
Spree::Store.store_count = 1
Spree::Store.current.id = 99
rejects('unexpected store identity') { ShippingSetup.restore! }
Spree::Store.current.id = 4
Spree::ShippingMethod.records << Spree::ShippingMethod.records.first
rejects('duplicate method') { ShippingSetup.restore! }
Spree::ShippingMethod.records.pop
Spree::Zone.records.first.zone_members << ZoneMemberReference.new('Spree::Country', 67)
rejects('country-wide zone leaks Madrid or island coverage') { ShippingSetup.restore! }

puts 'Shipping setup tests passed (native weight boundaries, 22 published rates, exact provinces, no-write reruns and conflict rejection).'
