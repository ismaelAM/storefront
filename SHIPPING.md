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

La integración server-only está en `src/lib/shipping/correos.ts`. El flujo
operativo usa las APIs vigentes verificadas en el portal de Correos:

- **Preregister**: validación y prerregistro/creación del envío; la creación se
  realiza con `POST /delivery`;
- **Labels**: generación de etiquetas;
- **Trackpub**: consulta de tracking;
- **Requests**: creación y gestión de solicitudes de recogida.

**BoxEntry no forma parte del flujo operativo**: es la API deprecada y no se
usa como sustituto de Preregister.

La autenticación se aplica por API según el contrato vigente:

- Preregister y Labels: `Authorization: Bearer <Correos ID token>`;
- Trackpub y Requests: Bearer más `client_id` y `client_secret`;
- Requests no usa una subscription key en el contrato actual.

Todos los endpoints configurados deben ser HTTPS. El cliente impide rutas que
escapen del host/base configurado y no incluye respuestas privadas del
proveedor en los errores.

### Correos ID

No se inventa un grant OAuth. La ficha pública confirma Correos ID, token y
OAuth 2.0, pero la emisión/renovación concreta de esta cuenta depende de la
documentación contractual. Hasta recibir esa información de soporte, las
operaciones que necesitan Bearer usan `CORREOS_ID_ACCESS_TOKEN`. Si Correos
devuelve 401, la operación falla de forma segura y obliga a renovar el token;
no intenta un grant no documentado.

## Ruta interna

`GET /api/internal/shipping` devuelve únicamente estado de configuración
(no secretos).

`POST /api/internal/shipping` admite:

- `spree-list-fulfillments`
- `spree-save-tracking`
- `spree-fulfill`
- `spree-mark-delivered`
- `correos-preregister`
- `correos-track`
- `correos-labels`
- `correos-pickup`

Esta API es de back-office. No debe llamarse directamente desde componentes
públicos ni usar el token en código cliente.

## Flujo operativo disponible ya

Spree continúa siendo la fuente de verdad del fulfillment. Cuando el Bearer de
Correos ID sea utilizable, la secuencia técnica disponible es:

1. El pedido y su método de entrega se crean en Spree.
2. Preregister valida/prerregistra el envío con `POST /delivery`.
3. Labels genera la etiqueta para el código de envío creado.
4. Se guarda el tracking en el fulfillment de Spree.
5. Trackpub consulta el estado cuando sea necesario.
6. Requests crea una recogida solo cuando la operativa lo requiera.
7. Spree marca el fulfillment como enviado/entregado y el storefront muestra
   ese estado al cliente.

Crear un envío, una etiqueta o una recogida puede producir un efecto externo o
facturable. La ruta interna no ejecuta ninguna de esas operaciones por sí sola:
cada llamada debe iniciarse de forma explícita por el operador.

Si el Bearer de Correos ID no está disponible o ha caducado, se mantiene la
operativa manual en Mi Oficina de Correos y se guarda tracking/estado en Spree.

## Lo que falta para automatización completa de Correos

- recibir de Correos la documentación contractual de emisión/renovación del
  Bearer de Correos ID (endpoint, grant y scopes aplicables);
- confirmar el modo de prueba/sandbox o procedimiento controlado sin cargos;
- validar Preregister, Labels, Trackpub y Requests con datos de prueba o una
  operación real expresamente autorizada;
- comprobar el ciclo completo contra un fulfillment real de Spree.

## Variables privadas

```text
SHIPPING_OPERATIONS_TOKEN
SPREE_ADMIN_API_KEY
CORREOS_CLIENT_ID
CORREOS_CLIENT_SECRET
CORREOS_ID_ACCESS_TOKEN
CORREOS_PREREGISTER_BASE_URL
CORREOS_LABELS_BASE_URL
CORREOS_TRACKPUB_BASE_URL
CORREOS_REQUESTS_BASE_URL
```

Ninguna credencial de Correos o Spree debe llevar prefijo `NEXT_PUBLIC_`.

## Validación pendiente en producción

- [ ] Corregir/confirmar la Zone exclusiva de Madrid en Spree.
- [ ] Probar una dirección de Madrid y otra fuera de Madrid.
- [ ] Confirmar un fulfillment real en un pedido.
- [ ] Guardar un tracking real y comprobarlo en Spree/storefront.
- [ ] Marcar un envío real como enviado.
- [ ] Cuando el Bearer de Correos ID esté disponible, probar
      Preregister/Labels/Trackpub/Requests contra un envío controlado y
      expresamente autorizado.
