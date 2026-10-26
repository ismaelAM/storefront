require_relative './payment-setup'
def check(value); raise 'Payment setup assertion failed' unless value; end
valid = { 'secret_key' => 'sk_live_example', 'publishable_key' => 'pk_live_example' }
check(PaymentSetup.valid_credentials?(valid))
check(!PaymentSetup.valid_credentials?(valid.merge('secret_key' => 'sk_test_example')))
check(!PaymentSetup.valid_credentials?(valid.merge('publishable_key' => 'pk_test_example')))
check(!PaymentSetup.valid_credentials?(valid.merge('secret_key' => "sk_live_example\n")))
check(!PaymentSetup.valid_credentials?(valid.merge('destination' => 'https://other.example')))
check(!PaymentSetup.valid_credentials?([]))
check(!PaymentSetup.manual_review_required?(50_000, 'EUR'))
check(PaymentSetup.manual_review_required?(50_001, 'EUR'))
check(!PaymentSetup.manual_review_required?(50_001, 'USD'))
check(PaymentSetup::SCOPES.sort == %w[read_settings write_orders write_payments])
check(PaymentSetup::WEBHOOK_EVENTS.include?('payment_intent.amount_capturable_updated'))
check(PaymentSetup::WEBHOOK_EVENTS.none? { |event| event.start_with?('charge.') })

class FakePublicPaymentController
  attr_accessor :candidate, :continued
  def params; { payment_method_id: 'pm_internal' }; end
  def current_store; self; end
  def payment_methods; self; end
  def find_by_prefix_id!(_); candidate; end
  def render_error(**attributes); attributes; end
  def create; self.continued = true; :created; end
  prepend PaymentSetup::StorePaymentVisibility
end
MethodVisibility = Struct.new(:active, :visible) do
  def active?; active; end
  def available_on_front_end?; visible; end
end
[[true, false], [false, true], [false, false]].each do |active, visible|
  controller = FakePublicPaymentController.new
  controller.candidate = MethodVisibility.new(active, visible)
  check(controller.create[:code] == 'payment_method_unavailable')
  check(!controller.continued)
end
controller = FakePublicPaymentController.new
controller.candidate = MethodVisibility.new(true, true)
check(controller.create == :created && controller.continued)

# Boundary fake only: production uses native Spree::Money. Assert that a
# caller-selected partial amount cannot evade review of the actual cart due.
module Spree
  module Core; class GatewayError < StandardError; end; end
  class Money
    def initialize(amount, currency:); @cents = (Float(amount) * 100).round; end
    def cents; @cents; end
  end
end
OrderAmount = Struct.new(:total_minus_store_credits, :currency)
check(PaymentSetup.native_order_amount!(OrderAmount.new('500.00', 'EUR'), nil) == '500.00')
[['501.00', nil], ['501.00', '1.00'], ['50.00', '1.00']].each do |due, supplied|
  begin
    PaymentSetup.native_order_amount!(OrderAmount.new(due, 'EUR'), supplied)
    raise 'Unsafe native amount accepted'
  rescue Spree::Core::GatewayError
  end
end
puts 'Payment setup tests passed (credential boundaries, narrow scopes and native webhook events).'
