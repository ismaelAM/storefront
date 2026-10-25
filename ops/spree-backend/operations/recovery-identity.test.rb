module Rails
  def self.application; self; end
  def self.config; self; end
  def self.to_prepare; yield; end
end
module Spree
  class Variant
    def self.validate(name); @validation = name; end
    def self.validation; @validation; end
    attr_accessor :product, :errors
  end
  class Product
    def self.validate(name); @validation = name; end
    def self.validation; @validation; end
    attr_accessor :metadata, :status, :errors
  end
end
initializer = File.expand_path('../config/initializers/recovery_identity.rb', __dir__)
initializer = File.expand_path('config/initializers/recovery_identity.rb', __dir__) unless File.file?(initializer)
load initializer
class Errors
  attr_reader :messages
  def initialize; @messages = []; end
  def add(*message); @messages << message; end
end
product = Spree::Product.new
product.metadata = {'recovery_state' => 'variant_identity_quarantined'}
product.status = 'draft'
product.errors = Errors.new
product.send(Spree::Product.validation)
raise 'Draft hold rejected' unless product.errors.messages.empty?
product.status = 'active'
product.send(Spree::Product.validation)
raise 'Unresolved identity published' if product.errors.messages.empty?
variant = Spree::Variant.new
variant.product = product
variant.errors = Errors.new
variant.send(Spree::Variant.validation)
raise 'Unresolved variant written' if variant.errors.messages.empty?
product.metadata = {'recovery_state' => 'catalog_visible_stock_unverified'}
product.errors = Errors.new
variant.errors = Errors.new
product.send(Spree::Product.validation)
variant.send(Spree::Variant.validation)
raise 'Ordinary recovered catalog blocked' unless product.errors.messages.empty? && variant.errors.messages.empty?
puts 'Unresolved recovery identity remains draft and rejects variant writes.'
