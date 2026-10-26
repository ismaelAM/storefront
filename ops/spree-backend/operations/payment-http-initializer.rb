require Rails.root.join('payment-setup')
Rails.application.config.to_prepare do
  if defined?(SpreeStripe::Gateway) && !(SpreeStripe::Gateway < PaymentSetup::NativeWebhookUrl)
    SpreeStripe::Gateway.prepend(PaymentSetup::NativeWebhookUrl)
  end
end

class BisonPaymentPrepareEndpoint < EmailHttpDrain::Endpoint
  def self.work(_secret)
    PaymentSetup.prepare!
  end
end

class BisonPaymentConnectEndpoint < EmailHttpDrain::Endpoint
  def self.call(env)
    return response(405, error: 'Method not allowed') unless env['REQUEST_METHOD'] == 'POST'
    return response(401, error: 'Unauthorized') unless env['HTTP_AUTHORIZATION'].to_s.match?(/\ABearer [0-9a-f]{64}\z/)
    EmailActivation.with_private_logging do
      EmailHttpDrain.validate_target!
      secret = EmailHttpDrain.private_secret!
      return response(401, error: 'Unauthorized') unless EmailHttpDrain.authorized?(env['HTTP_AUTHORIZATION'], secret)
      raw = env.fetch('rack.input').read(8193)
      return response(400, error: 'Invalid configuration') if raw.bytesize > 8192
      credentials = JSON.parse(raw)
      return response(400, error: 'Invalid configuration') unless PaymentSetup.valid_credentials?(credentials)
      response(200, PaymentSetup.connect!(credentials))
    end
  rescue StandardError
    response(503, error: 'Payment connection unavailable')
  end
end

Rails.application.routes.prepend do
  post '/internal/bison-payment/prepare', to: BisonPaymentPrepareEndpoint
  post '/internal/bison-payment/connect', to: BisonPaymentConnectEndpoint
end
