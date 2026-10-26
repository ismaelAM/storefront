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
puts 'Payment setup tests passed (credential boundaries, narrow scopes and native webhook events).'
