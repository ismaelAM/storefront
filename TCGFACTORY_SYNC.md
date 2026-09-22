# Integración de TcgFactory

Este documento separa lo comprobado en TcgFactory del contrato interno del
repositorio. Es la referencia antes de modificar su adaptador.

## Estado actual

- El proveedor y el adaptador tienen el código estable `tcgfactory`.
- El contrato de entrada es `tcgfactory_b2b_bridge_v1`.
- El transformador está en
  `supabase/functions/_shared/tcgfactory-adapter.ts`.
- El registro versionado está en
  `config/catalog-suppliers/tcgfactory.json` y permanece deshabilitado hasta
  validar un feed B2B real.
- La cuenta y la contraseña se leen exclusivamente de los secretos
  `TCGFACTORY_B2B_EMAIL` y `TCGFACTORY_B2B_PASSWORD`.
- La autenticación web profesional está implementada en el worker y valida que
  la sesión haya quedado iniciada antes de leer precios B2B. El HTML autenticado
  sigue tratándose como transporte frágil: cualquier cambio del proveedor debe
  validarse antes de completar un run.
- La ingesta genérica, deduplicación, selección de coste y escritura en Spree
  son las descritas en `CATALOG_SOURCING.md`.

No habilitar el proveedor sólo porque el parser compile. Primero hay que validar
precio, IVA, stock, paginación y variantes con datos reales de la cuenta.

## Hechos verificados

Comprobados el 21 de septiembre de 2026 en páginas públicas oficiales:

- TcgFactory se presenta como distribuidor mayorista y sus fichas indican
  «Solo tiendas y distribuidores».
- Existe alta e inicio de sesión de cliente profesional.
- Una ficha puede exponer nombre, referencia, EAN, estado como `Preventa`, fecha
  estimada, imágenes y atributos de variante.
- La navegación pública usa rutas y HTML propios de una tienda PrestaShop, pero
  eso es un detalle de implementación, no un contrato estable.
- No se encontró documentación pública estable de API ni un esquema público de
  CSV/JSON B2B.
- El coste profesional no se puede inferir de forma fiable sin una sesión o
  exportación autorizada.

Referencias oficiales:

- [TcgFactory](https://tcgfactory.com/)
- [Cuenta de cliente](https://tcgfactory.com/es/mi-cuenta)
- [Alta como cliente](https://portaltcgfactory.com/faq/como-darme-de-alta-como-cliente/)
- [Aplicación de TcgFactory](https://portaltcgfactory.com/faq/descargar-la-app-tcg-factory/)

La ausencia de una API pública encontrada no demuestra que no exista una API
privada o un feed para clientes. Hay que solicitar a TcgFactory el canal oficial
antes de automatizar navegación autenticada.

## Límite de responsabilidad

La integración se divide en dos piezas:

1. **Transporte B2B:** inicia sesión o descarga el feed autorizado, pagina todo
   el catálogo y produce JSON con el contrato de esta página.
2. **Adaptador puro:** valida ese JSON y lo transforma a
   `SupplierCatalogItem`. No inicia sesión, no conoce Spree y no decide qué
   proveedor gana.

No introducir selectores CSS, cookies, tokens o credenciales dentro del
adaptador. Si TcgFactory proporciona una API, CSV o SFTP, sustituir sólo el
transporte; el contrato canónico y la lógica multidistribuidor no cambian.

## Contrato del bridge v1

Los nombres siguientes son un contrato de este repositorio. No se afirma que
sean los nombres de columnas de una exportación oficial de TcgFactory.

```json
{
  "externalProductId": "product-42",
  "externalVariantId": "variant-42-black",
  "reference": "REF-PROVEEDOR-42-BLACK",
  "productName": "Fundas Standard Matte",
  "variantName": "Negro · 100 fundas",
  "ean": "5706569110024",
  "sourceUrl": "https://tcgfactory.com/es/distribucion/producto.html",
  "categoryKey": "accesorios-fundas-standard",
  "groupKey": "fundas-standard-matte",
  "manufacturer": "Fabricante",
  "manufacturerSku": "FAB-42-BLACK",
  "options": {
    "color": "Negro",
    "cantidad": 100,
    "tamano": "Standard",
    "idioma": "Español"
  },
  "purchasePriceNet": 7.5,
  "shippingCostNet": 0.25,
  "currency": "EUR",
  "availability": "Preventa",
  "stockQuantity": 0,
  "releaseDate": null,
  "imageUrls": ["https://tcgfactory.com/img/example.jpg"]
}
```

Reglas importantes:

| Campo | Regla |
| --- | --- |
| `externalVariantId` | Obligatorio y estable por variante. No usar la posición en una página. |
| `reference` | SKU de compra de TcgFactory; su unicidad sólo pertenece a TcgFactory. |
| `ean` | Identidad global preferida cuando el EAN/GTIN es válido. |
| `productName` | Familia canónica. No debe incluir atributos que pertenecen a `options`. |
| `options` | Idioma, edición, color, tamaño, cantidad u otra dimensión real. No deducirlas silenciosamente del título. |
| `purchasePriceNet` | Coste profesional neto, no PVP ni precio público. |
| `purchasePriceGross` | Alternativa a `purchasePriceNet`; exige `taxRate` o `normalizedCost`. Nunca enviar ambos precios. |
| `shippingCostNet` | Transporte atribuible por unidad, neto. Cero sólo si esa es la regla comercial comprobada. |
| `normalizedCost` | Coste neto puesto en almacén cuando se conoce mejor que la suma simple. |
| `availability` | Texto original del proveedor. El adaptador conserva ese texto en metadata y lo normaliza. |
| `sourceUrl` | URL HTTPS de `tcgfactory.com`, sin credenciales ni fragmentos. |

Un fichero puede ser un array o un objeto `{ "items": [...] }`. Los decimales
pueden llegar como número o como texto con punto/coma; moneda e impuestos deben
seguir siendo explícitos.


## Calidad de imágenes y pedido mínimo

Las imágenes de TcgFactory se filtran con una regla estricta: el nombre del
fichero debe corresponder al slug de la ficha actual. Esto evita importar
banners, imágenes CMS, logos de fabricante, categorías y recomendaciones
laterales. El comparador normaliza guiones iniciales heredados en algunas URLs
de producto, pero no relaja la pertenencia de la imagen a la ficha. Si la misma
foto aparece en varias resoluciones, se conserva la mejor disponible.

La reparación de galerías existentes se ejecuta con
`repair-tcgfactory-images` y usa `dryRun: true` por defecto. El reparador
identifica el discovery por `source_url` (no por SKU, porque TcgFactory puede
reutilizar referencias genéricas) y reconoce como contaminación conocida los
assets de navegación/CMS observados en producción: `juego-cartas`,
`juego-de-mesa`, `accesorios`, `merchandising`, `marcas`,
`nuestros-productos`, `ofertas`, `contacto`, `compra` y `envio`,
además de nombres puramente numéricos. El dry-run debe revisarse antes de
permitir borrados; las imágenes subidas manualmente quedan protegidas y no deben
eliminarse por no coincidir con el origen del proveedor.

El pedido mínimo por SKU sólo se acepta cuando el proveedor lo expone de forma
explícita o cuando existe un override documentado en
`catalog_suppliers.config.minimumOrder.quantityBySku`. No se deduce nunca a
partir de textos como «pack de 100 fundas», porque eso describe el contenido del
producto y no el mínimo de compra.

Cuando TcgFactory exige un MOQ alto, el PVP gestionado puede incorporar una
cobertura parcial del riesgo de inventario. La política por defecto se aplica
sólo a MOQ >= 4: cubre el 8% del coste de las unidades adicionales obligatorias
y limita el recargo al 30% del coste unitario. Los precios editados manualmente
siguen protegidos y no se sobrescriben por este proceso.


Antes de aplicar reparaciones sobre catálogo existente, ejecutar siempre los
modos de inspección:

- `repair-tcgfactory-images` con `dryRun: true`.
- `tcgfactory-backfill-minimum-orders` con `dryRun: true`.

Revisar la lista de SKUs/medios detectados y sólo después repetir la operación
con `dryRun: false`. El backfill de MOQ únicamente persiste mínimos explícitos
u overrides configurados; no altera precios por sí solo. El repricing se ejecuta
por separado y sigue respetando overrides manuales.


## Disponibilidad

El adaptador aplica este mapa conservador:

| Texto de origen | Estado interno |
| --- | --- |
| `Disponible`, `En stock` | `available` |
| `Preventa`, `Reserva` | `preorder` |
| `Agotado`, `Sin stock`, `No disponible`, `Descatalogado` | `unavailable` |
| Cualquier texto nuevo | `unknown` |

Un artículo `available` con `stockQuantity: 0` pasa a `unavailable`. Una
preventa puede tener stock cero. Un estado desconocido nunca compite como oferta
elegible; añadir primero una prueba y después ampliar el mapa.

## Flujo de validación e ingesta

Validar localmente no requiere credenciales del worker y no imprime costes:

```bash
pnpm catalog:sourcing validate-tcgfactory .local/tcgfactory-feed.json
```

Registrar el proveedor una vez. El JSON versionado está deshabilitado a
propósito; crear una copia local con `enabled: true` sólo cuando las pruebas B2B
hayan terminado:

```bash
cp config/catalog-suppliers/tcgfactory.json .local/tcgfactory.json
pnpm catalog:sourcing register .local/tcgfactory.json
```

Ingerir un crawl completo con un `runId` único. La CLI divide automáticamente
en lotes de 100:

```bash
pnpm catalog:sourcing ingest-tcgfactory \
  .local/tcgfactory-feed.json \
  tcgfactory-20260921-1200
```

Cerrar el run únicamente después de confirmar que autenticación, paginación y
descarga finalizaron sin errores:

```bash
pnpm catalog:sourcing complete tcgfactory tcgfactory-20260921-1200
pnpm catalog:sourcing status
```

No cerrar un feed parcial: dos runs completos consecutivos sin una oferta la
desactivan. La procedencia elegida debe verificarse en
`catalog_selected_supply` y en el custom field privado de Spree.

## Credenciales y seguridad

- El campo de cuenta observado en el formulario oficial es un email. El código
  usa `TCGFACTORY_B2B_EMAIL`; no renombrarlo a un identificador genérico sin
  comprobar antes que el proveedor haya cambiado el login.
- No guardar usuario, contraseña, cookies, tokens, cabeceras ni respuestas
  autenticadas en Git, fixtures, logs o `catalog_suppliers.config`.
- En producción, guardar los secretos en Supabase Edge Function Secrets/Vault o
  variables cifradas de Vercel, según dónde se ejecute el transporte.
- No prefijar secretos con `NEXT_PUBLIC_`.
- Usar una cuenta técnica con el mínimo acceso y rotación independiente cuando
  TcgFactory lo permita.
- Respetar condiciones de uso, límites de petición y canal de integración
  autorizado por el proveedor.
- Sanitizar cualquier fixture real: eliminar cookies, datos personales, precios
  contractuales innecesarios y URLs firmadas.

El secreto debe existir en el backend que ejecute el transporte. Si se ejecuta
en Supabase, seguir la guía oficial de
[Edge Function Secrets](https://supabase.com/docs/guides/functions/secrets) y
configurarlo desde **Edge Functions > Secrets** o con un fichero local ignorado
por Git:

```dotenv
TCGFACTORY_B2B_EMAIL=cuenta-profesional@example.com
TCGFACTORY_B2B_PASSWORD=valor-real
```

```bash
supabase secrets set --env-file .local/tcgfactory.secrets.env
```

Si el transporte termina ejecutándose en Vercel, seguir la guía de
[variables de entorno](https://vercel.com/docs/environment-variables) y añadir
los mismos nombres con `vercel env add` para Production y Preview cuando
proceda. El comando solicita el valor de forma interactiva; no poner la
contraseña como argumento. No es necesario duplicar secretos entre Supabase y
Vercel si sólo uno ejecuta el transporte.

El helper `requireTcgFactoryCredentials` valida la presencia de ambos secretos
y no incluye sus valores en los errores. El transporte debe llamarlo al inicio
y detener todo el run si falta uno, falla el login o la respuesta sigue
mostrando el formulario de acceso. En esos casos nunca debe invocar `complete`.

## Protocolo para futuras IAs

Antes de implementar el transporte autenticado:

1. Leer completos `AGENTS.md`, `CATALOG_SOURCING.md`, este documento, el
   adaptador y la CLI.
2. Confirmar el canal oficial con TcgFactory: API, CSV, SFTP o portal. No asumir
   que el HTML o una ruta interna de PrestaShop es estable.
3. Obtener una muestra sanitizada con al menos: producto simple, dos variantes,
   EAN ausente, preventa, agotado, precio neto/bruto y más de una página.
4. Documentar en una tabla cada campo real de origen y su campo bridge; marcar
   qué valores son inferidos.
5. Mantener las dimensiones de variante explícitas. Si el origen no aporta una
   familia fiable, no agrupar por similitud de títulos.
6. Añadir pruebas de parser, paginación, expiración de sesión, IVA, stock cero y
   reintentos antes de habilitar el proveedor.
7. Ejecutar primero un lote pequeño contra staging y comprobar un match por EAN,
   otro por opciones y un no-match enviado a revisión.
8. Habilitar el proveedor sólo cuando el coste sea comparable y la procedencia
   de Spree apunte al SKU correcto.

Si cambia la web pública, actualizar la sección «Hechos verificados», no el
contrato por reflejo. El contrato sólo debe versionarse (`v2`, etc.) cuando el
cambio semántico no sea compatible.
