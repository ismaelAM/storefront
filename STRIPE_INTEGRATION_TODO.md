# Stripe Checkout — pendientes de integración

## Values to Replace

The following values are placeholders and must be updated before going live.

**Files containing placeholders:**
- [src/app/api/create-checkout-session/route.ts](src/app/api/create-checkout-session/route.ts)
- [.env.example](.env.example)
- [.env.local.example](.env.local.example)

| Field | Current Value | What to Set |
|-------|--------------|-------------|
| `line_items[0].price` | `price_...` | El Stripe Price ID real del producto que se quiera cobrar. Debe corresponder al producto/variante de Spree que se muestre al cliente. |
| `success_url` | `${NEXT_PUBLIC_SITE_URL}/success?session_id={CHECKOUT_SESSION_ID}` | La URL real de la página de éxito del storefront. Mantener `{CHECKOUT_SESSION_ID}`. |
| `cancel_url` | `${NEXT_PUBLIC_SITE_URL}` | La URL real a la que volver cuando el cliente cancele Checkout. |
| `STRIPE_SECRET_KEY` | `sk_test_...` | La clave secreta de Stripe del entorno correspondiente. Nunca debe exponerse al navegador. |
| `NEXT_PUBLIC_SITE_URL` | `https://your-store.com` | El dominio real del storefront. |

### Vínculo Spree → Stripe

Actualmente los productos de Stripe **no están vinculados con los productos/variantes de Spree**. Esta integración deja el Checkout Session preparado, pero no inventa ni adivina esos identificadores.

Antes de usar esta ruta para cobrar productos reales hay que:

1. Crear los productos/precios correspondientes en Stripe.
2. Obtener los `price_...` reales.
3. Definir el vínculo de cada producto/variante de Spree con su Stripe Price ID.
4. Sustituir el placeholder de `line_items` por el Price ID correcto para cada compra.

No se ha añadido una tabla o persistencia nueva para ese vínculo porque el repositorio no tiene todavía un patrón existente específico para almacenar esa relación y esta tarea requiere cambios quirúrgicos.

## Configured Parameters

**Files containing these parameters:**
- [src/app/api/create-checkout-session/route.ts](src/app/api/create-checkout-session/route.ts)

| Parameter | Value |
|-----------|-------|
| `ui_mode` | `hosted_page` |
| `billing_address_collection` | `auto` |
| `phone_number_collection.enabled` | `false` |
| `automatic_tax.enabled` | `false` |
| `allow_promotion_codes` | `false` |
| `submit_type` | `auto` |
| `consent_collection.promotions` | `auto` |
| `saved_payment_method_options.payment_method_save` | `enabled` |
| `integration_identifier` | `hosted_web_0002` |
| `origin_context` | `web` |

`payment_method_collection` no se incluye porque el Checkout Session está configurado en modo `payment`; la tarea especifica incluirlo únicamente para `subscription`.

## Setup and next steps

### Variables de entorno

Añadir al entorno de ejecución:

```text
STRIPE_SECRET_KEY=sk_test_...
NEXT_PUBLIC_SITE_URL=https://your-store.com
```

La clave pública que ya usa el checkout actual se mantiene:

```text
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_...
```

### Dependencias

No se añadió un SDK servidor adicional. El endpoint utiliza directamente la API HTTP de Stripe desde el servidor, evitando una nueva dependencia y dejando que Stripe determine la versión de API mediante su configuración del endpoint.

La librería de Stripe actualmente instalada para el navegador es `@stripe/stripe-js`; el paquete `stripe` de servidor no estaba instalado.

### Estructura nueva

```text
src/
└── app/
    └── api/
        └── create-checkout-session/
            └── route.ts
```

### Cómo funciona

```text
Cliente
  → POST /api/create-checkout-session
  → servidor Next.js
  → Stripe Checkout Sessions API
  → devuelve id + url de Checkout
  → cliente redirige a Stripe Hosted Checkout
```

La ruta es independiente del flujo de pago actual de Spree. El checkout existente de Spree ya utiliza Stripe Payment Element mediante las sesiones de pago de Spree y no se ha modificado en esta tarea.

### Pruebas

Usar Stripe en modo test. La tarjeta de prueba habitual para un pago correcto es:

`4242 4242 4242 4242`

Usar una fecha futura y cualquier CVC/ZIP válido cuando el formulario lo solicite.

### Próximos pasos del proyecto

- Terminar la relación real entre productos/variantes de Spree y Stripe Price IDs.
- Sustituir `price_...`, `success_url` y `cancel_url` por valores reales.
- Conectar la llamada del endpoint con la selección de producto/carrito cuando el vínculo Spree → Stripe esté definido.
- Definir el flujo de fulfillment/order tracking después de un `checkout.session.completed`.
- Mantener Spree como fuente de verdad del catálogo y del pedido.

## Resources

- https://support.stripe.com
- https://docs.stripe.com/mcp
