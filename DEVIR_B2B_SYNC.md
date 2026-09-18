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

## Hyper sync: catálogo completo visible de Devir

El modo normal sigue limitado a las categorías configuradas para no hacer un rastreo masivo innecesario. Para una carga integral existe el modo **hyper**:

```bash
pnpm devir:hyper:once
```

Hace en una sola ejecución:

```text
navegación autenticada de Devir
→ descubre categorías visibles
→ pagina cada categoría
→ deduplica URLs
→ lee fichas
→ deduplica por SKU
→ guarda catálogo/checkpoints
→ dry-run
→ crea/actualiza drafts en Spree
```

Los productos de categorías sin regla comercial conocida también pueden entrar como `draft`, pero quedan en `REVIEW_REQUIRED` y usan el fallback únicamente como referencia hasta que se configure su categoría/margen.

El modo hyper usa por defecto hasta 200 páginas por categoría, mantiene el delay responsable entre peticiones y guarda un checkpoint cada 25 fichas en:

```text
.local/devir-b2b-catalog.checkpoint.json
```

Si una pasada se interrumpe, se puede recuperar la lectura de fichas ya guardadas:

```bash
pnpm devir:hyper:resume
```

Después se puede continuar manualmente con dry-run + sync, o repetir directamente `pnpm devir:hyper:once`.

Para repetir la carga completa cada 6 horas mientras el proceso permanezca vivo:

```bash
pnpm devir:hyper:watch
```

Esto **no es un scheduler 24/7**: si Codespaces duerme, se apaga o el proceso termina, deja de ejecutarse. El worker persistente sigue siendo necesario para garantizar la cadencia permanentemente.


## Cloud sync 24/7 con Supabase

La sincronización definitiva ya no depende de que Codespaces permanezca abierto. El proyecto Supabase `Bisontcg store data` mantiene:

- configuración privada y sesión B2B;
- cola de páginas/categorías/productos;
- catálogo Devir observado;
- ciclos, errores y checkpoints;
- lock distribuido para impedir ejecuciones solapadas;
- Supabase Cron, que despierta el worker cada minuto.

El worker es una Supabase Edge Function incremental. El tick de cada minuto **no significa escanear Devir cada minuto**: inicia un nuevo ciclo solo cuando han pasado 6 horas desde el ciclo anterior. Mientras un catálogo completo está en curso, cada tick procesa un lote pequeño y continúa desde Postgres.

La infraestructura cloud se crea desactivada hasta que se hace un bootstrap desde una sesión B2B autenticada. Una sola vez:

```bash
pnpm devir:cloud:bootstrap
```

Este comando lee `.secrets/devir-b2b-state.json` y la Secret API Key de Spree ya cargada en `.env.local`. **No necesita `SUPABASE_URL` ni `SUPABASE_SERVICE_ROLE_KEY` en Codespaces**: envía la sesión al worker cloud, que primero valida la `sk_...` contra Spree y solo entonces guarda la configuración privada en Supabase. No imprime las credenciales. Después el Codespace puede cerrarse.

Estado:

```bash
pnpm devir:cloud:status
```

Forzar un nuevo ciclo cuando no haya otro activo:

```bash
pnpm devir:cloud:run-now
```

Pausar/reanudar:

```bash
pnpm devir:cloud:disable
pnpm devir:cloud:enable
```

### Login automático real

Las credenciales B2B no se guardan en Git ni en Vercel. Como el worker vive en Supabase, se almacenan en **Supabase Vault** y solo la Edge Function con service role puede leerlas.

Una sola vez:

```bash
pnpm devir:cloud:credentials
```

El comando pide usuario/email y contraseña; la contraseña no se muestra en pantalla. También acepta `DEVIR_B2B_USERNAME` y `DEVIR_B2B_PASSWORD` si prefieres inyectarlos temporalmente desde un entorno seguro.

Cuando Devir invalida las cookies, el worker:

```text
detecta pantalla de login
→ recupera usuario/contraseña desde Vault
→ obtiene form_key de Magento
→ POST /customer/account/loginPost/
→ valida /customer/account/
→ guarda las cookies nuevas
→ reintenta la petición original una sola vez
```

Si Devir rechazase las credenciales, CAPTCHA o una autenticación adicional, el worker marca `LOGIN_FAILED`/error y no intenta saltarse esa protección.

### Venta sin stock cuando Devir dispone del producto

Spree sigue siendo la fuente de verdad del **stock físico propio**. La Cloud Sync no inventa unidades ni cambia `count_on_hand`.

En cambio sincroniza el flag nativo `backorderable` del StockItem:

```text
Devir available   → backorderable = true
Devir unavailable → backorderable = false
Devir preorder    → no cambia el flag
Devir unknown     → no cambia el flag
```

Así, si tu stock local está a 0 pero Devir marca el SKU como disponible, Spree puede seguir aceptando venta bajo pedido. Si Devir pasa a no disponible, se desactiva esa posibilidad sin tocar las unidades físicas.

### Imágenes automáticas

La Edge Function extrae la imagen Open Graph y la galería Magento cuando están disponibles. Para un producto de Spree sin medios existentes, envía las URLs al Admin API de Spree, que las copia a su propio almacenamiento mediante su flujo nativo `SaveFromUrl`.

Protecciones:

- no hotlinkea imágenes en el storefront;
- no sustituye ni borra medios si el producto ya tiene imágenes en Spree;
- máximo 12 imágenes por ficha;
- omite placeholders/logos;
- conserva el orden descubierto;
- usa el nombre del producto como `alt`;
- un fallo de imagen no invalida el resto del producto.

### Seguridad cloud

- Las tablas `devir_sync_*` tienen RLS y no conceden acceso a `anon` ni `authenticated`.
- Los ticks automáticos del worker solo aceptan el token privado guardado en Supabase Vault.
- Los comandos de operador (`bootstrap/status/enable/disable/run-now`) requieren una Secret API Key de Spree válida; el bootstrap la valida contra la propia Admin API antes de guardar la sesión.
- La Secret API Key de Spree y la sesión B2B no se incluyen en Git ni se muestran en logs.
- El worker nunca activa productos: crea nuevos productos como `draft` y mantiene `REVIEW_REQUIRED` para categorías/márgenes ambiguos y packs.
- Los PVP manuales y los productos activos quedan protegidos frente a sobrescritura automática.

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

## Spree como centro de revisión comercial

El flujo de escritura ya no publica productos directamente. Los nuevos artículos Devir se crean en Spree con `status: draft`, por lo que permanecen ocultos al Store API hasta que un operador los active.

La Secret API Key usada por el importador necesita:

- `write_products` para crear/actualizar borradores, variantes, coste y PVP.
- `write_settings` para crear los campos internos de Devir/Pricing.
- acceso de lectura a productos/categorías incluido en esos permisos.

Primera preparación:

```bash
pnpm devir:spree:setup
pnpm devir:spree:categories
```

Los campos creados son internos de Admin (`storefront_visible: false`). En producto se guarda SKU proveedor, estado/motivos de revisión, última sincronización, margen aplicado/efectivo, IVA y si el PVP se ha editado manualmente. En categorías se crea `Pricing · Margen objetivo`.

Para configurar margen por categoría desde la terminal:

```bash
pnpm devir:spree:margin tcg/mtg 25%
pnpm devir:spree:margin tcg/yugioh 25%
```

Los valores anteriores son solo ejemplos de formato: `25%`, `25` y `0.25` significan lo mismo: margen objetivo del 25%. Usa tus porcentajes comerciales reales.

También puedes definir una excepción para un SKU concreto:

```bash
pnpm devir:spree:margin-product SKU 25%
```

Prioridad de precio:

```text
PVP manual del operador
→ margen manual de la decisión local
→ margen override del producto en Spree
→ margen de categoría en Spree
→ margen local de respaldo
→ fallback de referencia
```

El dry-run sigue siendo seguro y no escribe:

```bash
pnpm devir:import:dry-run
```

Para materializar el plan como borradores ocultos:

```bash
pnpm devir:spree:sync
```

Calidad de vida y protecciones:

- Los productos nuevos siempre nacen como `draft`.
- Un `REVIEW_REQUIRED` se guarda igualmente en Spree para revisarlo cerca del catálogo, pero sigue oculto.
- `cost_price` guarda el coste del proveedor y `price` el PVP propuesto.
- Si cambias el PVP manualmente en Spree, la siguiente sincronización lo detecta y lo preserva; solo actualiza coste/metadatos y recalcula el margen efectivo.
- Los productos `active` no reciben cambios automáticos de PVP salvo que se configure explícitamente `DEVIR_B2B_UPDATE_ACTIVE=true`.
- Un pack aprobado con `mode: "split"` se archiva cuando todos sus hijos ya existen/sincronizaron.
- Ningún proceso de 6 horas activa productos automáticamente.

Resumen del estado Devir en Spree:

```bash
pnpm devir:spree:status
```

Activación explícita, solo si no quedan motivos de revisión:

```bash
pnpm devir:spree:activate SKU
```

El sincronizador continuo ahora hace `scan → dry-run → sync a drafts` cada 6 horas:

```bash
pnpm devir:sync:watch
```

Este watcher local se conserva como herramienta de diagnóstico. Para operación normal 24/7 usa la Cloud Sync de Supabase.

`.local` se conserva como caché/auditoría y decisiones de splits; Spree pasa a ser el centro de revisión comercial del producto, coste, PVP, margen y estado visible/oculto.

## Fase siguiente

Ejecutar `pnpm devir:cloud:bootstrap`, observar el primer ciclo con `pnpm devir:cloud:status` y validar una muestra de drafts/imágenes en Spree.
