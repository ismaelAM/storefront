# BISON3 Madrid y logo horizontal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans. El propietario pide ejecución autónoma sin preguntas rutinarias; detener únicamente acciones que requieran acceso no disponible o confirmación de seguridad.

**Goal:** Envío local de Madrid a 0 € para cuentas BISON3 aprobadas; después, logo horizontal exclusivamente en el encabezado de la tienda.

**Architecture:** Spree debe calcular y guardar el descuento del envío, sus impuestos y el total cobrable. La elegibilidad debe comprobarse en el servidor de Spree y recalcularse al cambiar cuenta, dirección o método; el storefront presenta el resultado nativo.

**Tech Stack:** Servidor Spree (versión instalada por confirmar), Next.js, Supabase devir-sync, pruebas del backend y Vitest.

**Spec:** Solicitudes del propietario en esta conversación y `SHIPPING.md`, sección «Entrega local Madrid».

## Estado comprobado el 10/10/2026

**Bloqueado; envío BISON3 gratis NO activado.** La promoción preparada `promo_V0dXmZF31w` sigue inactiva. No se cambiaron permisos, claves, membresías, tarifas ni código de producción durante esta investigación.

- El método local es `dm_VeVXmZF31w`, Madrid Zone `4790`, tarifa base 4,99 €. Las tarifas de Correos son independientes.
- BISON3 se concede tras aprobación, mediante la PriceList `pl_NJzXvxTk8u` y su `user_rule`. Escribir BISON3 como invitado o tener una solicitud pendiente no concede el beneficio.
- La pantalla de promociones disponible no ofrece una preferencia de método en FreeShipping ni una regla de provincia/método. Una promoción FreeShipping general con usuarios BISON3 también descontaría Correos.
- La clave existente «BisonTCG Logística Correos» tiene `read_orders`, `read_fulfillments`, `write_fulfillments`; no `write_orders`. No se creó ni amplió ninguna credencial.
- El controlador Admin actual publicado por Spree permite actualizar tracking, tracking_carrier, selected_delivery_rate_id y stock_location_id; no permite escribir cost en un envío pendiente. Crear un envío ya enviado con cost no sirve para establecer un precio de checkout y no debe usarse como atajo.
- Las fuentes oficiales 5.4/5.5 de FreeShipping descuentan todos los shipments del pedido; la fuente principal actual descuenta fulfillments, también sin restricción de método. La versión exacta alojada debe comprobarse antes de escribir una extensión: no intercambiar estos modelos.
- Los repositorios disponibles en la conexión de ismaelAM son `storefront` y `github-slideshow`. No hay un repositorio conectado del servidor Spree. `bisontcg.spree.sh` es el backend alojado; editar este repositorio Next.js no instala clases Ruby allí.

**Acceso que falta:** código/despliegue del backend de BisonTCG o soporte del alojamiento para instalar una acción de promoción limitada al método local. Dar `write_orders` a otra clave no añade esa capacidad y, por sí solo, no resuelve el bloqueo.

## Fuentes técnicas contrastadas

- Spree 5.5 FreeShipping: https://github.com/spree/spree/blob/v5.5.0/spree/core/app/models/spree/promotion/actions/free_shipping.rb
- Spree actual FreeShipping: https://github.com/spree/spree/blob/main/spree/core/app/models/spree/promotion/actions/free_shipping.rb
- Spree actual controlador Admin de fulfillments: https://github.com/spree/spree/blob/main/spree/api/app/controllers/spree/api/v3/admin/orders/fulfillments_controller.rb
- Promociones personalizadas: https://spreecommerce.org/docs/developer/how-to/custom-promotion

Estas fuentes muestran interfaces publicadas, no acreditan por sí solas la versión del servicio alojado.

## Global Constraints

- Beneficio únicamente para cuentas BISON3 aprobadas y método local `dm_VeVXmZF31w`.
- Invitados, pendientes y revocados pagan 4,99 € por ese método.
- Correos conserva su tarifa, también para BISON3 y también dentro de Madrid.
- La Zone nativa decide la disponibilidad; no comprobar Madrid por texto de ciudad en Next.js.
- No confiar en metadata del carrito editable por el cliente para acreditar aprobación.
- No activar FreeShipping general, crear un método gratuito públicamente seleccionable ni mostrar un cero distinto del importe real de Spree.
- El logo horizontal se publica en el encabezado solo DESPUÉS de verificar este envío gratuito; el logo del checkout se conserva.
- No compras, mensajes, aceptación de términos ni ampliación de credenciales durante pruebas.

## Review Focus

- Cambio de Madrid local a Correos: eliminar el descuento local anterior.
- Cambio de Madrid a otra provincia: método local ausente y Correos con tarifa normal.
- Revocación/cambio de cuenta: recalcular; ningún descuento anterior puede persistir.
- Varios envíos: descontar únicamente cada envío realmente servido por el método local elegible.
- Recalcular y cobrar: total nativo, impuestos y amount_due deben coincidir con el importe del pago.

## Task 1: Promoción en el backend

**Condición previa bloqueante:** obtener acceso al código/despliegue del backend o una instalación equivalente del proveedor del alojamiento; confirmar su versión y modelos reales. No generar Ruby suponiendo una versión.

**Archivos del backend a crear tras confirmar su estructura:** `app/models/spree/promotion/actions/bison_madrid_free_shipping.rb`, regla de elegibilidad equivalente y registro en el inicializador Spree existente; pruebas en el directorio de pruebas nativo del backend. Estos archivos pertenecen al backend, no a este storefront.

- [ ] Escribir regresiones de la matriz inferior con modelos y ciclo de recálculo reales de la versión instalada; verificar que fallan antes del cambio.
- [ ] Implementar una acción nativa que compute el negativo del coste exclusivamente para el método local permitido. Fuera de ese método debe retirar su descuento anterior, no dejarlo congelado.
- [ ] Comprobar aprobación vigente en el servidor. Reutilizar la membresía nativa de BISON3 manteniendo sincronizadas aprobación/revocación; no copiar la lista actual de dos usuarios como configuración fija.
- [ ] Instalar/registrar la extensión y configurar la promoción preparada sin código público compartido que permita eludir la elegibilidad de cuenta.
- [ ] Verificar regresiones nativas y la siguiente matriz con carritos sin pagar; activar solo cuando pasen.

| Cuenta | Destino / método | Resultado esperado |
| --- | --- | --- |
| Invitado / pendiente / revocado | Madrid local | 4,99 € |
| BISON3 aprobado | Madrid local | 0 € |
| BISON3 aprobado | Madrid Correos | Tarifa normal de Correos |
| BISON3 aprobado | Otra provincia | Local no disponible; Correos normal |
| Aprobado → revocado, mismo carrito | Madrid local | Vuelve a 4,99 € |
| Local gratis → Correos, mismo carrito | Madrid | Correos normal, sin descuento local residual |

## Task 2: Logo, condicionado al Task 1

**Asset preparado:** `assets/pending/bison-header-horizontal.png`, copia exacta de la imagen enviada por el propietario. SHA-256 `0794786efae46eefda4f8730ef3e2dc9c5e9a0e64efe2f186ae5739c44af5e7f`. Está fuera de `public` y no está referenciado por ningún componente.

**Archivos:** mover el asset a `public/bison-header-horizontal.png`; modificar solo `src/components/layout/Header.tsx` para renderizarlo. Conservar `src/components/layout/StoreLogo.tsx` y su uso en `src/app/[country]/[locale]/(checkout)/layout.tsx`.

- [x] Localizar, revisar y conservar la imagen original sin editarla.
- [ ] Después de Task 1 verificado, añadir la imagen con Next/Image, texto alternativo BisonTCG y dimensiones adaptadas al encabezado móvil/escritorio.
- [ ] Ejecutar `pnpm exec tsc --noEmit`; revisar el diff y comprobar visualmente encabezado móvil/escritorio y checkout sin cambio de logo.
- [ ] Publicar mediante PR revisada, comprobar CI y deployment exacto, guardar evidencia pública de envío gratuito y logo. Una prueba local o una PR no acreditan que esté activo en producción.
