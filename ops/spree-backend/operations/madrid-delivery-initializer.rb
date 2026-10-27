require Rails.root.join('madrid-delivery')

Rails.application.config.to_prepare do
  calculator = Spree::Calculator::Shipping::FlatRate
  calculator.prepend(BisonMadridDelivery::Calculator) unless calculator < BisonMadridDelivery::Calculator
end
