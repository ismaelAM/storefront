# Sincronizador B2B de Devir

Este flujo es de **solo lectura** y prepara la importación del catálogo profesional de Devir hacia BisonTCG. La primera fase no modifica Spree: descubre productos desde las categorías de Devir y extrae SKU, precio profesional y disponibilidad para producir un JSON local.

## 1. Guardar la sesión B2B una vez

Con acceso a tu cuenta profesional de Devir:

```bash
pnpm devir:login
```

Se abre un navegador Playwright. Inicia sesión manualmente y pulsa Enter en la terminal cuando hayas terminado. El proceso conserva el perfil completo del navegador en `.secrets/devir-b2b-profile/` y además guarda `.secrets/devir-b2b-state.json`; ambos están excluidos de Git.

El script comprueba que `/customer/account/` ya no redirija al formulario de login antes de considerar válida la sesión.

No se guardan usuario ni contraseña en el proyecto.

## 2. Escanear el catálogo

```bash
pnpm devir:scan
```

Por defecto empieza en:

```text
https://b2bdevir.es/juegos-de-cartas-coleccionables
```

Reutiliza el mismo perfil persistente de Playwright que se usó durante el login, comprueba primero que la sesión B2B siga autenticada y después recorre las páginas `?p=2`, `?p=3`, etc., descubre los enlaces de producto y visita cada producto usando esa sesión.

El resultado se escribe en:

```text
.local/devir-b2b-catalog.json
```

También se pueden configurar varias categorías:

```bash
DEVIR_B2B_CATEGORIES="https://b2bdevir.es/juegos-de-cartas-coleccionables/magic,https://b2bdevir.es/juegos-de-cartas-coleccionables/yu-gi-oh" pnpm devir:scan
```

Para hacer una prueba pequeña:

```bash
DEVIR_B2B_MAX_PRODUCTS=5 pnpm devir:scan
```

## Datos que captura

El lector busca la estructura real observada en el B2B de Devir:

- SKU mediante `itemprop="sku"`.
- Precio mediante `data-price-amount` y `data-price-type="finalPrice"`.
- Precio mínimo/máximo si Devir los expone en esa página; cuando existe un máximo, `purchasePrice` usa el máximo.
- Disponibilidad mediante `.product-info-stock-sku .stock` y sus clases `available` / `unavailable`.
- Texto de estado (`Disponible`, `Pre reserva`, `No está disponible`, etc.).
- Fecha de lanzamiento cuando aparece.
- ID de producto Magento cuando está disponible.

## Estados normalizados

```text
Disponible       -> available
Pre reserva      -> preorder
No está disponible / agotado -> unavailable
Cualquier otro  -> unknown
```

## Automatización responsable

El lector usa una sesión normal de Playwright, mantiene una cadencia deliberadamente baja y no intenta saltarse CAPTCHA, WAF, rate limits, fingerprinting ni otras medidas de protección. Si Devir exige una interacción adicional, el proceso debe detenerse y esa condición se debe resolver por una vía permitida.

## Dry-run contra Spree

Una vez generado `.local/devir-b2b-catalog.json`, se puede comprobar la correspondencia por SKU contra el catálogo real de Spree sin modificar ningún dato:

```bash
pnpm devir:import:dry-run
```

Requiere en el entorno local:

```text
SPREE_API_URL=https://...
SPREE_ADMIN_API_KEY=...
```

La secret key es solo de servidor y debe tener como mínimo permiso `read_products`. Nunca se guarda en Git ni en el JSON de Devir. El dry-run lista los productos de Admin API y consulta sus variantes por `/api/v3/admin/products/{product_id}/variants`, de modo que también puede resolver correctamente el SKU de la variante master de productos simples.

El resultado distingue:

- `MATCH`: el SKU ya existe en Spree y se compara el PVP actual con el PVP propuesto.
- `CREATE-DRAFT`: el SKU no existe y el plan propone crear el producto como borrador. El dry-run no lo crea realmente.

Además guarda un plan local en:

```text
.local/devir-b2b-import-plan.json
```

### Regla de auto-precio

Por defecto el precio profesional de Devir se trata como coste **sin IVA** y se calcula:

```text
coste_con_IVA = purchasePrice × (1 + 0.21)
PVP_mínimo    = coste_con_IVA / (1 - 0.25)
PVP_propuesto = siguiente precio terminado en .99 que no quede por debajo del PVP_mínimo
```

Esto equivale a IVA del 21% y margen bruto objetivo del 25%. La regla es configurable sin cambiar código:

```bash
DEVIR_PRICE_VAT_RATE=0.21
DEVIR_PRICE_TARGET_MARGIN=0.25
DEVIR_PRICE_COST_INCLUDES_VAT=false
DEVIR_PRICE_CURRENCY=EUR
```

Si la cuenta o factura de Devir confirma que el precio profesional ya incluye IVA, usar `DEVIR_PRICE_COST_INCLUDES_VAT=true` para no sumarlo dos veces.

El dry-run no ejecuta `POST`, `PATCH` ni `DELETE`. Solo escribe el plan en `.local/`, que está fuera de Git.

## Fase siguiente

Validar el plan con productos reales y confirmar el tratamiento de IVA del coste Devir. Solo después se habilitará un modo de escritura con una secret key que tenga `write_products`; los productos nuevos seguirán entrando inicialmente como `draft` hasta que stock/preventa estén mapeados de forma segura.
