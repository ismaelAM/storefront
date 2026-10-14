import { loadLocalEnv } from "./load-local-env";
import { ensureOrderCompletionField } from "../src/lib/shipping/order-completion";

loadLocalEnv();

// Idempotent configuration only. Does not edit any order, shipment or payment.
ensureOrderCompletionField().then(definition => {
  console.log(`Control de Spree verificado: Pedido completado (${definition.id})`);
}).catch(error => {
  console.error(error instanceof Error ? error.message : "No se pudo preparar Pedido completado en Spree");
  process.exitCode = 1;
});
