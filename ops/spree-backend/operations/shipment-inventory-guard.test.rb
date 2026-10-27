source_path = ENV['SPREE_SHIPMENT_SOURCE'] || File.join(Gem::Specification.find_by_name('spree_core').full_gem_path, 'app/models/spree/shipment.rb')
source = File.read(source_path)

# Run the pinned native callbacks, replacing only their persistence boundary.
# This reproduces both the on-hand and backordered phantom restock paths.
class ShipmentInventoryFixture
  Order = Struct.new(:completed, :complete) do
    def completed? = completed
    def complete? = complete
  end
  attr_accessor :order
  attr_reader :restocks, :unstocks

  def initialize(completed:, complete: false)
    @order = Order.new(completed, complete)
    @restocks = []
    @unstocks = []
  end

  def manifest = [:on_hand, :backordered]
  def manifest_restock(item) = @restocks << item
  def manifest_unstock(item) = @unstocks << item
end

%w[after_cancel after_resume].each do |name|
  callback = source.match(/^    def #{name}\n.*?^    end$/m)&.[](0)
  raise "Missing native callback #{name}" unless callback
  ShipmentInventoryFixture.class_eval(callback, source_path)
end

guard_path = File.join(__dir__, 'shipment-inventory-guard.rb')
require guard_path if File.exist?(guard_path)
ShipmentInventoryFixture.prepend(BisonShipmentInventoryGuard) if defined?(BisonShipmentInventoryGuard)

def check(value, label)
  raise "Shipment inventory assertion failed: #{label}" unless value
end

cart = ShipmentInventoryFixture.new(completed: false)
2.times { cart.after_cancel; cart.after_resume }
check(cart.restocks.empty? && cart.unstocks.empty?, 'abandoned checkout must never change stock')

placed = ShipmentInventoryFixture.new(completed: true)
placed.after_cancel
check(placed.restocks == [:on_hand, :backordered], 'completed cancellation preserves native restocking')
placed.after_resume
check(placed.unstocks == [:on_hand, :backordered], 'completed resumption preserves native deduction')

# Order#finalize! invokes Shipment#finalize! before touching completed_at.
# Its state is already complete, so the first real stock deduction must run.
finalizing = ShipmentInventoryFixture.new(completed: false, complete: true)
finalizing.after_resume
check(finalizing.unstocks == [:on_hand, :backordered], 'finalization still deducts stock before completed_at')
puts 'Shipment inventory guard tests passed'
