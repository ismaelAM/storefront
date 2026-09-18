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

## Cadencia recomendada: cada 6 horas

Para mantener el catálogo actualizado mientras el proceso siga activo:

```bash
pnpm devir:sync:watch
```

Ejecuta un scan inmediatamente y después repite lectura + dry-run cada 6 horas. La frecuencia se puede cambiar con `DEVIR_SYNC_INTERVAL_HOURS`. Si Devir invalida la sesión, el bucle **se detiene** y pide intervención humana; nunca intenta iniciar sesión automáticamente.

Para una sola ejecución completa:

```bash
pnpm devir:sync:once
```

El watcher también carga automáticamente `.env.local`. Este watcher no convierte Codespaces en un scheduler de producción: si el Codespace duerme o se apaga, no hay ejecuciones. Cuando el flujo esté estabilizado se moverá a un worker con almacenamiento persistente para la sesión, manteniendo la misma cadencia de 6 horas.

## Dry-run contra Spree

Una vez generado `.local/devir-b2b-catalog.json`, se puede preparar el plan contra Spree sin modificar datos:

```bash
pnpm devir:import:dry-run
```

La URL de Spree puede seguir usando la variable que ya existía:

```text
SPREE_API_URL=https://bisontcg.spree.sh
```

Para la clave Admin del importador se usa preferentemente:

```text
DEVIR_B2B_SPREE_ADMIN_API_KEY=sk_...
```

Como el proyecto ya está vinculado a Vercel, descárgalas al Codespace con:

```bash
vercel env pull .env.local
```

`.env.local` está ignorado por Git y los scripts Devir lo cargan automáticamente al arrancar. Se mantiene compatibilidad con `SPREE_ADMIN_API_KEY` y también con `DEVIR_B2B_SPREE_API_URL`, pero no necesitas duplicar `SPREE_API_URL` si ya la tienes configurada.

La secret key debe tener como mínimo `read_products`. El dry-run solo usa `GET` contra Spree y produce estados:

- `AUTO`: producto normal con información suficiente para generar propuesta.
- `REVIEW_REQUIRED`: hace falta una decisión del operador.
- `APPROVED`: la decisión manual ya está validada.

El plan conserva además la acción propuesta: `CREATE-DRAFT`, `UPDATE` o `SKIP`.

Los artefactos locales son:

```text
.local/devir-b2b-import-plan.json
.local/devir-b2b-review-queue.json
.local/devir-b2b-operator-decisions.json
.local/devir-pricing-rules.json
```

Todos están excluidos de Git.

## Operador humano y packs

Los packs que parecen contener varios productos distintos (por ejemplo una caja de varios Commander Decks) se marcan automáticamente como `REVIEW_REQUIRED`. No se reparte el coste a partes iguales.

Prepara o actualiza el fichero de decisiones con:

```bash
pnpm devir:review
```

Para un pack, usa `mode: "split"` y rellena `children` con SKU, nombre y `allocatedCost` de cada producto vendible. El importador exige que la suma de los costes asignados coincida con el coste total de Devir. Cada hijo puede tener su categoría, margen o PVP manual.

`approved: true` aprueba la propuesta, pero este flujo todavía **no escribe en Spree**.

## Reglas de precio por categoría

La configuración comercial real vive en:

```text
.local/devir-pricing-rules.json
```

La primera ejecución copia una plantilla pública desde:

```text
config/devir-pricing-rules.example.json
```

La plantilla contiene IVA, moneda, margen fallback y categorías como MTG, Yu-Gi-Oh!, juegos de mesa y accesorios. Los márgenes específicos están inicialmente a `null`: deben ser decisiones comerciales reales y el fichero con tus porcentajes queda fuera de Git.

Mientras una categoría no tenga margen, el 25% se usa solo como **referencia de cálculo** y el producto queda en `REVIEW_REQUIRED`. Una vez definido `targetMargin` para esa categoría, los siguientes productos compatibles pueden pasar a `AUTO`.

Orden de prioridad:

```text
PVP manual del operador
→ margen manual del SKU
→ margen de categoría
→ fallback de referencia
```

Por defecto el coste Devir se trata como coste sin IVA:

```text
coste_con_IVA = purchasePrice × (1 + 0.21)
PVP_mínimo    = coste_con_IVA / (1 - margen)
PVP_propuesto = siguiente precio terminado en .99
```

Se mantienen los overrides de entorno `DEVIR_PRICE_VAT_RATE`, `DEVIR_PRICE_TARGET_MARGIN`, `DEVIR_PRICE_COST_INCLUDES_VAT` y `DEVIR_PRICE_CURRENCY`.

## Fase siguiente

Validar tus márgenes reales por categoría y varios casos de split. Solo después se habilitará un modo de escritura con `write_products`; Spree seguirá siendo la fuente de verdad y ningún `REVIEW_REQUIRED` podrá escribirse automáticamente.
