# Sincronizador B2B de Devir

Este flujo es de **solo lectura** y prepara la importación del catálogo profesional de Devir hacia BisonTCG. La primera fase no modifica Spree: descubre productos desde las categorías de Devir y extrae SKU, precio profesional y disponibilidad para producir un JSON local.

## 1. Guardar la sesión B2B una vez

Con acceso a tu cuenta profesional de Devir:

```bash
pnpm devir:login
```

Se abre un navegador Playwright. Inicia sesión manualmente y pulsa Enter en la terminal cuando hayas terminado. El proceso conserva el perfil completo del navegador en `.secrets/devir-b2b-profile/` y también guarda `.secrets/devir-b2b-state.json`; ambos están excluidos de Git.

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

Reutiliza el mismo perfil persistente de Playwright, comprueba primero que la sesión B2B siga autenticada y después recorre las páginas `?p=2`, `?p=3`, etc., descubre los enlaces de producto y visita cada producto usando la sesión B2B guardada.

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

## Fase siguiente

Cuando el JSON esté validado con productos reales, la siguiente fase será convertirlo a un importador de Spree usando SKU como clave de enlace y aplicar las reglas de precio/estado de BisonTCG. Esa fase todavía no está activada en este commit para evitar modificar el catálogo real antes de validar la extracción.
