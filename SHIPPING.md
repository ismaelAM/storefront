# Envíos BisonTCG

## Fuente de verdad

Spree sigue siendo la fuente de verdad para zonas, métodos de entrega, tarifas,
pedidos, fulfillments, estados y tracking. El storefront no decide por código
si una dirección pertenece a Madrid ni mantiene una base logística paralela.

## Cobro automático en Spree — 10/10/2026

Se configuraron **21 métodos nativos FlatRate**: siete tramos de peso para cada
Zone existente de Península (`5621`), Baleares (`5623`) y Canarias (`5622`).
Nombre público único: **Correos**. Nombre interno y código
`correos-2026-{peninsula|baleares|canarias}-{1|5|10|15|20|25|30}kg`
identifican zona/tramo sin mostrarlos al cliente. Spree calcula la tarifa al
guardar la dirección y recalcula al cambiar las cantidades del carrito.

| Peso nativo del shipment (kg) | Península (€) | Baleares (€) | Canarias (€) |
| --- | ---: | ---: | ---: |
| >0–1 | 13,65 | 15,40 | 21,30 |
| >1–5 | 17,10 | 21,80 | 30,70 |
| >5–10 | 22,95 | 34,90 | 38,40 |
| >10–15 | 27,81 | 46,50 | 49,10 |
| >15–20 | 33,65 | 58,46 | 66,75 |
| >20–25 | 39,01 | 70,25 | 86,85 |
| >25–30 | 44,25 | 83,09 | 107,00 |

Importes finales publicados Paq Estándar 2026, EUR, origen peninsular. Categorías
físicas Default (`1072`) y Predeterminado (`1235`), Digital excluida. Categoría
fiscal del método conservada en Ninguno para no añadir de nuevo IVA a importes
finales. Límites mínimo exclusivo y máximo inclusivo. Plazos conservados:
Península 4–7 días hábiles; islas 7–14. Son gastos comerciales del checkout,
no una cotización contractual obtenida de la API de Correos.

La regla antigua `dm_Q8V2A48cIW` conserva su tarifa para Portugal solamente.
Las reglas antiguas Canarias `dm_86ZBR0I7fE` y Baleares `dm_oD27lrKdXj`
(esta última cobraba 0 %) quedan solo en back-office, sin borrar registros.
Entrega en Madrid `dm_VeVXmZF31w`, Zone Madrid, se conserva; tarifa actual
**4,99 €** desde el cambio del 10/10 descrito abajo.
No se amplió cobertura a Ceuta/Melilla ni otros destinos.

**Límites:** FlatRate usa peso registrado en Spree, no dimensiones del paquete
embalado. `shippingDefaults` del worker guarda pesos/dimensiones por perfil de
categoría; son estimaciones, no pesajes certificados. Comprobar peso real,
volumen y embalaje al preparar pedidos; la calculadora interna siguiente sí
admite las medidas finales. Un shipment de peso cero o superior a 30 kg no
recibe estos tramos: requiere corregir datos o dividirlo en Spree. No inventar
pesos ni introducir recargos calculados por Next.js fuera de Spree.

**Mantenimiento anual:** revisar las 21 tarifas nativas antes de 2027. Spree no
caduca automáticamente estas preferencias; el bloqueo anual del estimador
interno no desactiva los métodos nativos. Para cobro exacto por volumen haría
falta un calculador de backend y datos fiables de embalaje; los seis calculadores
registrados en esta instancia no ofrecen ese servicio.

Validación en checkout público, con carrito/direcciones ficticios y sin compra:
un Catan Duelo recibe 17,10 € a Lugo, 21,80 € a Baleares y 30,70 € a Las Palmas;
Madrid ofrece entrega local 5 € y Correos 17,10 €. Cuatro unidades a Lugo
recalculan automáticamente a Correos 22,95 €, total 110,55 €. Solo hay una
opción Correos elegible por destino/peso; el nombre interno no aparece.

## Calculadora interna de tarifa publicada 2026

Disponible únicamente en el panel autenticado `/ops/shipping`. La página pública
`/{country}/{locale}/shipping-estimate` y su enlace del pie se retiraron a petición
del propietario. Traducciones ES/EN/FR/PT/DE/PL conservadas para operaciones.
`POST /api/shipping/estimate` recibe únicamente código postal, peso real en kg y
largo/ancho/alto en cm; exige la sesión de operaciones existente y calcula localmente,
sin credenciales de Correos ni llamadas de
escritura a Correos. Responde con céntimos netos, impuestos y total, peso
volumétrico/facturable y zona. No recibe datos de pedidos ni direcciones completas.

Fuente: [tarifas oficiales Correos 2026, páginas 10–11](https://www.correos.es/content/dam/correos/documentos/atc/tarifas/2026/Tarifas_Correos_2026_Peninsula_y_Baleares.pdf),
Paq Estándar a domicilio/oficina con origen peninsular. El código postal español
selecciona Península, Baleares, Canarias o Ceuta/Melilla. El peso facturable es
el mayor entre peso real y volumen en cm³ / 6000. Se usan los importes publicados
exactos, incluido su tratamiento de IVA; por encima de 30 kg volumétricos se
aplica cada kg adicional iniciado. Peso real máximo: 30 kg.

Ejemplos peninsulares: paquete 20×15×10 cm y 1 kg → **13,65 €**; paquete
60×40×30 cm y 0,5 kg → 12 kg volumétricos → **27,81 €**. Los límites estándar
son 120 cm por lado y 240 cm sumados; cara mínima de etiqueta 14,5×10 cm.
Se rechazan tamaños extra en vez de omitir sus recargos. La aritmética absorbe
solo ruido de precisión de máquina en límites, sin redondear excesos reales.

Es una **estimación interna de tarifa publicada**, no una cotización API ni tarifa de contrato.
No incluye embalaje, servicios adicionales ni trámites aduaneros. Requiere
medidas/peso del paquete ya preparado, no estimaciones inventadas por producto.
El cálculo se bloquea fuera de 2026 para no seguir ofreciendo una tarifa caducada.

El estimador interno no escribe gastos del checkout. Los métodos nativos de
Spree descritos arriba realizan el cobro automático. Se accedió al administrador
de BisonTCG mediante autenticación segura del propietario; no se crearon envíos,
etiquetas o recogidas facturables ni se modificaron credenciales.

Estado de credenciales observado el 10/10/2026: Vercel tiene client ID, las
cuatro URL base y token de operaciones; faltan `CORREOS_CLIENT_SECRET` y
`CORREOS_ID_ACCESS_TOKEN`. Se comprobaron nombres/configuración, sin exponer
valores secretos. La documentación pública enumera Preregister, Labels,
Trackpub y Requests; no se encontró un servicio de cotización aplicable.

## Entrega local Madrid

Método real: **Entrega en Madrid**, `dm_VeVXmZF31w`, Zone Madrid `4790`,
FlatRate EUR **4,99 €**, categorías físicas Default y Predeterminado.
Guardado y releído en el administrador el 10/10/2026. Correos no se modificó.

**BISON3 gratis solo para este método: pendiente.** BISON3 corresponde a
cuentas aprobadas en `special_pricing_requests`; su lista de precios nativa
`pl_NJzXvxTk8u` utiliza `user_rule`, no un cupón público ni un grupo de clientes.
La acción FreeShipping instalada no admite seleccionar métodos de entrega y
descuenta todos los envíos del pedido. Las reglas instaladas no incluyen
provincia/Zone ni método de envío. Activarla para usuarios BISON3 regalaría
también Correos fuera de Madrid, contrario a la instrucción del propietario.

Promoción preparada `promo_V0dXmZF31w` **inactiva**, inicio 01/01/2099,
sin acciones ni reglas. No concede descuentos. Antes de activarla se necesita
una implementación de backend que limite el beneficio al método local y use
las aprobaciones/revocaciones BISON3 vigentes; probar invitados, pendientes,
aprobados, revocados, Madrid local, Madrid Correos y otra provincia. No fingir
un cero en Next.js ni aceptar un código que el cliente pueda usar en otro destino.

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
