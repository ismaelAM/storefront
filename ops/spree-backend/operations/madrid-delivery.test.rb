# Exercise the pinned native FlatRate implementation, replacing persistence and
# the external approval HTTP transport only. No native records are created.
require 'json'
require 'uri'
begin
  require 'net/http'
rescue LoadError
  raise unless RUBY_PLATFORM.include?('wasi')
  # WASI has no sockets. Replace only the external HTTP transport.
  $LOADED_FEATURES << 'net/http.rb'
  module Net
    class HTTP
      class Post
        attr_accessor :body
        def initialize(*) = @headers = {}
        def []=(key, value)
          @headers[key.downcase] = value
        end
        def [](key) = @headers[key.downcase]
      end
    end
  end
end

class Object
  def present? = !nil? && self != ''
end
def require_dependency(*) = nil
module Spree
  class Calculator
    module Shipping; end
  end
  class ShippingCalculator
    attr_accessor :calculable
    def self.preference(name, *, **)
      attr_accessor "preferred_#{name}"
    end
  end
end
native_path = ENV['SPREE_FLAT_RATE_SOURCE'] || File.join(Gem::Specification.find_by_name('spree_core').full_gem_path, 'app/models/spree/calculator/shipping/flat_rate.rb')
load native_path

module ActiveRecord
  class Base
    def self.connection = self
    def self.select_value(*) = 'fixture-private-key'
  end
end
class Net::HTTP
  class << self
    attr_accessor :fixture_response, :fixture_error, :last_request, :max_retries
    def start(host, port, **options)
      raise 'Unexpected approval destination' unless host == 'ikglqbjlbkbaronbiryl.supabase.co' && port == 443 && options[:use_ssl] && options[:open_timeout] <= 3 && options[:read_timeout] <= 3
      raise fixture_error if fixture_error
      yield self
    end
    def request(req)
      self.last_request = req
      raise 'Unexpected approval credential' unless req['x-spree-admin-key'] == 'fixture-private-key'
      raise 'Unexpected approval action' unless JSON.parse(req.body)['action'] == 'special-pricing-shipping-eligibility'
      Struct.new(:code, :body).new(*fixture_response)
    end
  end
end

production = File.join(__dir__, 'madrid-delivery.rb')
require production if File.exist?(production)
Spree::Calculator::Shipping::FlatRate.prepend(BisonMadridDelivery::Calculator) if defined?(BisonMadridDelivery)
User = Struct.new(:prefixed_id, :email) do
  def persisted? = true
end
Address = Struct.new(:country, :state)
Order = Struct.new(:user, :ship_address, :store_id, :completed) do
  def completed? = completed == true
end
Package = Struct.new(:order, :weight, :item_total, :contents)
Spree::ShippingMethod = Struct.new(:code, :private_metadata)
def check(value, label)
  raise "Madrid delivery assertion failed: #{label}" unless value
end
def quote(user: User.new('cus_test', 'owner@example.test'), country: 'ES', state: 'M', code: 'entrega-madrid-2026', store: 4, weight: 1, completed: false, previous_cost: nil)
  calculator = Spree::Calculator::Shipping::FlatRate.new
  calculator.preferred_amount = 4.99
  calculator.preferred_currency = 'EUR'
  calculator.calculable = Spree::ShippingMethod.new(code, { 'bison_shipping_setup' => 'bison-shipping-2026-v1' })
  address = Address.new(Struct.new(:iso).new(country), Struct.new(:abbr).new(state))
  order = Order.new(user, address, store, completed)
  shipment = Struct.new(:order, :shipping_method, :cost).new(order, calculator.calculable, previous_cost)
  item = Struct.new(:inventory_unit).new(Struct.new(:shipment).new(shipment))
  calculator.compute_package(Package.new(order, weight, 100, [item]))
end
Net::HTTP.fixture_response = ['200', '{"ok":true,"eligible":true}']
check(quote == 0, 'approved account receives free local Madrid delivery')
check(JSON.parse(Net::HTTP.last_request.body).slice('customerId', 'email') == { 'customerId' => 'cus_test', 'email' => 'owner@example.test' }, 'uses authenticated account identity')
check(quote(user: nil) == 4.99, 'guest receives ordinary tariff')
check(quote(state: 'B') == 4.99, 'other province never receives benefit')
check(quote(country: 'PT') == 4.99, 'other country never receives benefit')
check(quote(code: 'correos-2026-peninsula-1kg') == 4.99, 'Correos retains native price even in Madrid')
check(quote(store: 5) == 4.99, 'other store excluded')
Net::HTTP.fixture_response = ['200', '{"ok":true,"eligible":false}']
check(quote == 4.99, 'pending or revoked approval immediately restores tariff')
check(quote(completed: true, previous_cost: 0) == 0, 'revocation never changes a completed free shipment')
Net::HTTP.fixture_response = ['200', '{"ok":true,"eligible":true}']
check(quote(completed: true, previous_cost: 4.99) == 4.99, 'later approval never reprices a completed paid shipment')
Net::HTTP.fixture_response = ['200', '{"ok":true,"eligible":"true"}']
check(quote == 4.99, 'malformed approval does not grant benefit')
Net::HTTP.fixture_response = ['401', '{"ok":true,"eligible":true}']
check(quote == 4.99, 'authentication failure preserves tariff')
Net::HTTP.fixture_error = IOError.new('offline')
check(quote == 4.99, 'network failure preserves tariff')
puts 'Madrid delivery tests passed'
