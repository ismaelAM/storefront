# Envíos BisonTCG

## Fuente de verdad

Spree sigue siendo la fuente de verdad para zonas, métodos de entrega, tarifas,
pedidos, fulfillments, estados y tracking. El storefront no decide por código
si una dirección pertenece a Madrid ni mantiene una base logística paralela.

## Entrega local Madrid

Método previsto: **Entrega local BisonTCG — Madrid**  
Código recomendado: `BISON_LOCAL_MADRID`.

La Zone, la Shipping Category, la tarifa y el plazo deben configurarse en
Spree. Si el método aparece para una dirección fuera de Madrid, se corrige la
Zone/método de Spree; no se añade un `if city === "Madrid"` al storefront.

## Operaciones de fulfillment en el backend

El storefront incorpora una capa server-only en
`src/lib/shipping/spree-fulfillment.ts` y una ruta interna protegida en
`/api/internal/shipping`.

La ruta exige:

```http
Authorization: Bearer <SHIPPING_OPERATIONS_TOKEN>
```

No expone credenciales al navegador y solo admite acciones enumeradas. Soporta:

- listar fulfillments de un pedido;
- guardar o corregir tracking y carrier;
- marcar un fulfillment como enviado usando el workflow nativo de Spree;
- marcarlo como entregado usando el workflow nativo de Spree.

Las escrituras usan la Admin API de Spree. La Secret API Key se obtiene de
`SPREE_ADMIN_API_KEY` o, por compatibilidad, de
`DEVIR_B2B_SPREE_ADMIN_API_KEY`.

## Correos

La integración server-only está en `src/lib/shipping/correos.ts`. Se han
modelado las APIs cuya especificación se había validado:

- **Trackpub**: consulta de tracking;
- **Labels**: generación de etiquetas;
- **Requests**: solicitudes de recogida;
- **BoxEntry**: registro de cajas/pallets;
- **Preregister**: permanece desactivada por defecto porque figura como
  deprecada y no debe asumirse como API válida para nuevos envíos.

El cliente aplica por API la combinación correspondiente de Bearer de Correos
ID, Client ID/Client Secret y subscription key, rechaza endpoints no HTTPS,
impide rutas que escapen del host configurado y no incluye respuestas privadas
del proveedor en los errores.

### Correos ID

No se ha inventado un flujo OAuth. Mientras Correos no facilite/valide el
mecanismo de emisión y renovación para la cuenta contratada, las operaciones
que necesitan Bearer usan `CORREOS_ID_ACCESS_TOKEN`. Si el proveedor devuelve
401, la operación falla de forma segura y obliga a renovar ese token; no intenta
un grant desconocido.

## Ruta interna

`GET /api/internal/shipping` devuelve únicamente estado de configuración
(no secretos).

`POST /api/internal/shipping` admite:

- `spree-list-fulfillments`
- `spree-save-tracking`
- `spree-fulfill`
- `spree-mark-delivered`
- `correos-track`
- `correos-labels`
- `correos-pickup`
- `correos-box-entry`

Esta API es de back-office. No debe llamarse directamente desde componentes
públicos ni usar el token en código cliente.

## Flujo operativo disponible ya

Sin acceso completo a las APIs de Correos se puede trabajar sin cambiar el
modelo comercial:

1. El pedido y su método de entrega se crean en Spree.
2. El envío se tramita manualmente en Mi Oficina de Correos.
3. Se guarda el tracking en el fulfillment de Spree.
4. Se marca el fulfillment como enviado.
5. El storefront sigue leyendo estado/tracking de Spree.
6. Cuando las credenciales de Correos estén activas, tracking, etiquetas y
   recogidas se pueden ejecutar con la misma capa sin cambiar el checkout.

## Lo que falta para automatización completa de Correos

- contrato/acceso API de transporte activo;
- endpoints y credenciales definitivos en Vercel;
- mecanismo oficial de emisión/renovación del token de Correos ID;
- confirmar con Correos la alternativa soportada a `Preregister` para crear
  o prerregistrar envíos nuevos;
- prueba real controlada de etiqueta, tracking y recogida.

Hasta entonces no se debe fingir que un envío ha sido creado en Correos solo
porque Spree tenga un fulfillment.

## Variables privadas

```text
SHIPPING_OPERATIONS_TOKEN
SPREE_ADMIN_API_KEY
CORREOS_CLIENT_ID
CORREOS_CLIENT_SECRET
CORREOS_ID_ACCESS_TOKEN
CORREOS_LABELS_BASE_URL
CORREOS_TRACKPUB_BASE_URL
CORREOS_REQUESTS_BASE_URL
CORREOS_REQUESTS_SUBSCRIPTION_KEY
CORREOS_BOXENTRY_BASE_URL
CORREOS_PREREGISTER_BASE_URL
CORREOS_ALLOW_DEPRECATED_PREREGISTER
```

Ninguna credencial de Correos o Spree debe llevar prefijo `NEXT_PUBLIC_`.

## Validación pendiente en producción

- [ ] Corregir/confirmar la Zone exclusiva de Madrid en Spree.
- [ ] Probar una dirección de Madrid y otra fuera de Madrid.
- [ ] Confirmar un fulfillment real en un pedido.
- [ ] Guardar un tracking real y comprobarlo en Spree/storefront.
- [ ] Marcar un envío real como enviado.
- [ ] Cuando Correos entregue credenciales, probar Trackpub/Labels/Requests
      contra un envío controlado.
