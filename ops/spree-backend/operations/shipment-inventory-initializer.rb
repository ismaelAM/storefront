require Rails.root.join('shipment-inventory-guard')

Rails.application.config.to_prepare do
  Spree::Shipment.prepend(BisonShipmentInventoryGuard) unless Spree::Shipment < BisonShipmentInventoryGuard
end
