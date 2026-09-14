# Storefront + Puck — Handoff para Claude Code

## 0. Objetivo de este handoff

Este archivo es el contexto operativo del proyecto para continuar el trabajo con Claude Code sin repetir experimentos ni romper partes que ya funcionan.

**Regla principal:** antes de modificar cualquier archivo, inspecciona el estado actual del repositorio y lee los archivos relevantes completos. No reconstruyas archivos de memoria si puedes leerlos del repositorio.

---

## 1. Repositorio y rama

Repositorio GitHub:

`https://github.com/ismaelAM/storefront`

Proyecto Vercel:

`bison-tcg/storefront`

Rama de trabajo:

`puck_editor`

**PROHIBIDO:** hacer push a `main`, hacer merge a `main`, cambiar Production Branch o alterar producción sin autorización expresa.

Production Branch de Vercel debe continuar siendo `main`.

La rama `puck_editor` genera Preview Deployments de Vercel.

Preview conocido:

`https://storefront-git-puckeditor-bison-tcg.vercel.app/`

Ruta del editor:

`/us/es/editor`

---

## 2. Estado funcional confirmado

### Puck

- Puck funciona en Vercel Preview.
- El editor carga correctamente.
- El editor está dentro del `(storefront)` layout para heredar la carcasa de la tienda.
- Los productos reales de Spree aparecen dentro de Puck.
- Al hacer clic en un producto desde Puck se abre la página individual real de Spree.
- No queremos gestionar variantes/carrito desde la tarjeta Puck.

### Página individual de producto

La ruta oficial de producto funciona como:

`/[country]/[locale]/products/[slug]`

Y utiliza `ProductDetails` de Spree.

Debe mantenerse intacta.

La página individual ya proporciona:

- variantes
- cantidad
- stock/purchasability
- precio
- Añadir al carrito
- CartContext
- CartDrawer

**No duplicar esta lógica dentro de Puck.**

### Header / Footer

El Header y Footer reales de Spree son proporcionados por:

`src/app/[country]/[locale]/(storefront)/layout.tsx`

La ruta del editor se movió dentro de `(storefront)` precisamente para heredar esta carcasa.

El layout ya contiene el Header, Footer y el contexto de carrito del storefront.

El Header actual está bien y no debe rehacerse sin necesidad.

---

## 3. Arquitectura deseada

La arquitectura final debe ser aproximadamente:

```text
StorefrontLayout
├── Header real de Spree
├── navegación real de Spree
├── CartProvider / CartDrawer
├── contenido de página renderizado con Puck
└── Footer real de Spree
```

Puck controla composición y presentación.

Spree sigue siendo la fuente de verdad para:

- productos
- categorías
- precios
- inventario
- variantes
- carrito
- checkout

---

## 4. Home actual de Spree

Actualmente `src/app/[country]/[locale]/(storefront)/page.tsx` era originalmente:

```tsx
export default async function HomePage({ params }: HomePageProps) {
  const { country, locale } = await params;
  const basePath = `/${country}/${locale}`;
  const currency = await resolveCurrency(country);

  return (
    <div>
      <HeroSection basePath={basePath} locale={locale} />
      <FeaturedProductsSection
        basePath={basePath}
        locale={locale}
        country={country}
        currency={currency}
      />
      <WholesaleSection basePath={basePath} locale={locale} />
    </div>
  );
}
```

La Home real está formada por estas secciones:

1. `src/components/home/HeroSection.tsx`
2. `src/components/home/FeaturedProductsSection.tsx`
3. `src/components/home/WholesaleSection.tsx`

Estas deben considerarse la referencia visual y funcional de la Home.

### HeroSection real

Usa `next-intl`, `getStoreName()`, `Button` y tres botones:

- Shop Now → `${basePath}/products`
- GitHub → enlace externo
- Quickstart → enlace externo

La altura real incluye `min-h-[823px]` en móvil y adapta en desktop.

### FeaturedProductsSection real

Usa `getTranslations()` con namespace `home` y renderiza `FeaturedProducts` dentro de `Suspense`.

Incluye:

- título `featuredProducts`
- enlace `viewAll`
- grid/carrusel real de productos

### WholesaleSection real

Usa `isWholesaleEnabled()`.

Tiene:

- badge
- title
- description
- CTA primaria
- CTA secundaria
- tres beneficios

Los textos vienen de `next-intl` namespace `home`.

---

## 5. Datos de productos Spree

`src/lib/data/products.ts` tiene la API correcta de acceso.

Existe:

```tsx
export async function getProducts(
  params?: ProductListParams,
  surface: Surface = DEFAULT_SURFACE,
) {
  const options = await getLocaleOptions();
  const userToken = await getAccessToken();
  return cachedListProducts(params, options, surface, userToken);
}
```

`src/lib/data/cached.ts` contiene `PRODUCT_CARD_FIELDS` con al menos:

```tsx
[
  "id",
  "name",
  "slug",
  "thumbnail_url",
  "purchasable",
  "default_variant_id",
  "price",
  "original_price",
  "categories",
]
```

Para el grid Puck, `default_variant_id` ya existe y llega desde Spree.

---

## 6. Categorías Spree

`src/lib/data/categories.ts` es la fuente correcta.

Contiene:

- `getCategories()`
- `cachedGetCategory()`
- `getCategory()`
- `getCategoryProducts()`

La función importante para páginas de categoría es:

```tsx
export async function getCategoryProducts(
  categoryId: string,
  params?: ProductListParams,
) {
  const options = await getLocaleOptions();
  const userToken = await getAccessToken();
  return cachedListCategoryProducts(categoryId, params, options, userToken);
}
```

La consulta a productos de categoría utiliza `in_category: categoryId`.

**No duplicar categorías dentro de Puck como una segunda fuente de verdad.**

---

## 7. Storefront layout real

Archivo:

`src/app/[country]/[locale]/(storefront)/layout.tsx`

El layout actual proporciona:

- `Header`
- `HeaderMobileMenu`
- navegación de categorías
- `Footer`
- categorías para Footer

Y el layout superior de `[country]/[locale]` proporciona el contexto del carrito.

La navegación actual obtiene categorías con `getCategories()` y las presenta mediante `HeaderMobileMenu` y `FooterCategoryLinks`.

No rehacer esta navegación. La futura personalización debe conservar la navegación real de Spree y hacer configurable solo lo necesario.

---

## 8. Puck actual

Versión conocida:

`@puckeditor/core 0.23.0`

Archivo principal:

`src/puck/config.tsx`

Componentes actuales del config:

- HeroHome
- Text
- Image
- Carousel
- Banner
- ProductGrid
- FeaturedProductsHome
- WholesaleHome
- ProductShowcase
- Section
- Spacer

Hubo un error histórico donde se pegó accidentalmente el contenido de `PuckProductGrid.tsx` dentro de `config.tsx`, causando cientos de errores. **No repetir eso.**

Actualmente `config.tsx` debe contener solamente configuración de Puck y sus imports.

---

## 9. Componentes Puck actuales

### `src/components/puck/ProductCard.tsx`

Es una tarjeta propia de Puck.

**Importante:** actualmente debe comportarse como enlace a la página individual de Spree, no como mini-carrito.

El objetivo es:

```text
click en tarjeta
→ /[country]/[locale]/products/[slug]
→ ProductDetails oficial de Spree
```

No añadir lógica de variantes/carrito aquí.

### `src/components/puck/PuckProductGrid.tsx`

Muestra productos reales obtenidos desde `PuckProductsContext`.

Debe construir enlaces usando:

```tsx
const productUrl = product.slug
  ? `${basePath}/products/${product.slug}`
  : `${basePath}/products`;
```

No debe duplicar la lógica de compra.

### `src/components/puck/PuckProductsContext.tsx`

Existe actualmente y proporciona:

```ts
products: Product[]
basePath: string
```

Exports:

- `PuckProductsProvider`
- `usePuckProducts`

Se utiliza para pasar los productos obtenidos en server-side a los componentes cliente de Puck.

---

## 10. Editor Puck

La ruta actual debe estar dentro de:

`src/app/[country]/[locale]/(storefront)/editor/`

Para heredar Header/Footer.

El editor tiene un Client Component porque `Puck` debe ejecutarse en cliente en esta instalación/version.

**No importar `<Puck>` directamente desde un Server Component.**

La versión previa estable de `page.tsx` era un Client Component sencillo con:

```tsx
"use client";

import { Puck } from "@puckeditor/core";
import { config } from "@/puck/config";

export default function EditorPage() {
  return (
    <Puck
      config={config}
      data={{
        content: [],
        root: {},
      }}
    />
  );
}
```

Después se añadió carga server-side de productos mediante `EditorClient` + `PuckProductsProvider`.

**No asumir que el archivo actual coincide exactamente con estos ejemplos: LEERLO ANTES.**

---

## 11. Problemas que YA fueron descartados

### No usar una API `/api/puck/products` como solución principal

Se creó experimentalmente:

`src/app/api/puck/products/route.ts`

y:

`src/lib/data/puck-products.ts`

La llamada llegó a quedarse colgada en Codespaces. Esos experimentos se descartaron.

### No intentar que un Client Component llame directamente a `getProducts()`

`getProducts()` es server-side.

La solución actual usa un Server Component para obtener productos y los pasa mediante `PuckProductsProvider`.

### No usar archivos JSON como persistencia definitiva en Vercel sin entender las consecuencias

El filesystem de las funciones de Vercel no debe tratarse como almacenamiento persistente.

La persistencia de Puck sigue pendiente.

### No asumir que Codespaces tiene las mismas variables que Vercel

Codespaces inicialmente no tenía:

- `SPREE_API_URL`
- `SPREE_PUBLISHABLE_KEY`

Vercel Production sí las tiene.

`vercel env pull .env.local --environment=production` escribió `[SENSITIVE]` para secretos, así que Codespaces no debe considerarse el entorno de prueba fiable para Spree.

El Preview de Vercel sí es el entorno de validación importante.

---

## 12. Vercel / entorno

El proyecto Vercel correcto es:

`bison-tcg/storefront`

El Preview de `puck_editor` funciona.

Los deployments de la rama `puck_editor` deben probarse en Vercel.

No cambiar `main`.

No pedir al usuario credenciales ni claves. Nunca imprimir secretos.

---

## 13. Objetivo funcional final

La tienda debe convertirse progresivamente en un CMS visual con Puck, sin duplicar la lógica de comercio de Spree.

### Home

```text
Header Spree
↓
Puck
  Hero editable
  Featured Products reales
  Wholesale editable
  otros bloques
↓
Footer Spree
```

### Categoría

```text
Header Spree
↓
Puck
  Hero
  Texto
  ProductGrid de categoría real
  Banner
↓
Footer Spree
```

### Producto

```text
Header Spree
↓
Puck
  contenido editorial configurable
  ProductDetails ORIGINAL DE SPREE
  contenido adicional
↓
Footer Spree
```

El producto actual debe llegar al bloque de producto mediante la ruta/slug/contexto, no copiando sus datos en Puck.

---

## 14. Persistencia pendiente

Este es uno de los siguientes grandes objetivos.

Actualmente el editor puede mostrar contenido inicial, pero **no existe todavía un sistema real de `onPublish`/persistencia conectado al sitio público**.

La meta es:

```text
Puck Editor
↓ Publish
persistencia
↓
Data Puck guardada
↓
public page
↓
<Render config={config} data={data} />
```

La Home pública y el Editor deben utilizar el MISMO `Data`, no dos objetos separados.

No seguir usando `homeData` fijo en dos sitios como arquitectura definitiva.

---

## 15. Meta futura de navegación

El usuario quiere poder editar:

- orden de páginas
- menú lateral
- nombres de entradas
- visibilidad
- destino de las entradas

Pero la navegación de categorías sigue viniendo de Spree.

La solución debe evitar dos fuentes de verdad.

Preferencia:

```text
Spree
→ catálogo/categorías reales

Puck/CMS
→ presentación, estructura editorial y orden configurable
```

---

## 16. Meta futura de Header

El Header actual de Spree es bueno y debe conservarse como base.

En el futuro se puede convertir parte de su apariencia en configurable:

- fondo
- colores
- logo
- tipografía
- espaciado
- navegación

pero **sin sustituir el `CartButton` real ni su lógica**.

No priorizar esto hasta que persistencia + Home real + categorías + producto estén sólidos.

---

## 17. Orden recomendado de trabajo

1. Consolidar Home real en Puck.
2. Hacer que Editor y página pública utilicen el mismo Data.
3. Implementar persistencia/publicación de Puck.
4. Plantilla de categoría con productos reales de esa categoría.
5. Plantilla de producto con `ProductDetails` original de Spree.
6. Hacer editable la navegación/menú sin duplicar categorías.
7. Configuración visual del Header.
8. Versionado/publicación final.

---

## 18. DIRECTIVAS OBLIGATORIAS PARA CLAUDE CODE

Antes de responder o editar:

1. Leer archivos relevantes completos.
2. Ejecutar `git status` antes de una operación de Git.
3. No modificar más archivos de los necesarios.
4. No crear archivos provisionales si una pieza existente puede reutilizarse.
5. No repetir experimentos ya descartados.
6. No asumir APIs de Spree/Puck: inspeccionar el código instalado y los archivos existentes.
7. Antes de cambios grandes, explicar brevemente la arquitectura y el conjunto exacto de archivos que se modificarán.
8. Para cambios de código, editar directamente y después ejecutar typecheck.
9. Usar `pnpm exec tsc --noEmit` después de cambios TypeScript relevantes.
10. No hacer commit/push automáticamente salvo que el usuario lo pida explícitamente.
11. Push solo a `puck_editor` salvo autorización explícita.
12. No tocar `main`.
13. Nunca imprimir ni pedir secretos.
14. Validar despliegues importantes en Vercel Preview.
15. Mantener compatibilidad con Next.js 16 + Puck 0.23 + Spree SDK existente.
16. Cuando el usuario indique que algo ya funciona, tratarlo como una restricción de diseño y no reescribirlo sin motivo.
17. Si una modificación rompe TypeScript, parar y corregir antes de continuar.
18. Nunca sustituir la página de producto oficial de Spree por una copia propia si la funcionalidad original ya existe.
19. Nunca implementar un carrito paralelo.
20. No convertir productos de Spree en datos estáticos dentro de Puck.

---

## 19. PROTOCOLO DE INVESTIGACIÓN ANTES DE EDITAR

Para cualquier tarea nueva:

### Paso A — Estado Git

```bash
git status
```

### Paso B — localizar archivos relevantes

Usar `find`, `grep`, `rg` o lectura directa.

### Paso C — leer archivos completos

Leer los archivos que realmente implementan la funcionalidad.

### Paso D — plan mínimo

Identificar:

- qué ya funciona
- qué falta
- qué archivo es responsable
- qué archivos deben cambiar

### Paso E — modificación pequeña

Cambiar solo lo necesario.

### Paso F — validación

```bash
pnpm exec tsc --noEmit
```

y cuando proceda pruebas/build.

### Paso G — Vercel

Para funcionalidad que depende de Spree/configuración, validar en el Preview de `puck_editor`.

---

## 20. PRIMERA TAREA AL RETOMAR EL PROYECTO

Antes de cambiar nada:

```bash
git status
```

y revisar:

```bash
find src/app/[country]/[locale]/(storefront)/editor -maxdepth 2 -type f -print
find src/components/puck -maxdepth 2 -type f -print
find src/puck -maxdepth 2 -type f -print
```

Después leer:

- `src/app/[country]/[locale]/(storefront)/editor/page.tsx`
- `src/app/[country]/[locale]/(storefront)/editor/EditorClient.tsx` si existe
- `src/components/puck/PuckProductsContext.tsx`
- `src/components/puck/PuckProductGrid.tsx`
- `src/components/puck/ProductCard.tsx`
- `src/puck/config.tsx`
- `src/app/[country]/[locale]/(storefront)/page.tsx`
- `src/app/[country]/[locale]/(storefront)/layout.tsx`
- `src/components/home/HeroSection.tsx`
- `src/components/home/FeaturedProductsSection.tsx`
- `src/components/home/WholesaleSection.tsx`

Solo después de leerlos decidir el siguiente cambio.

### PRIORIDAD INMEDIATA

La prioridad es conseguir que el editor Puck represente la Home REAL y que el contenido editado se convierta en el mismo contenido que ve el visitante.

No volver a crear una Home genérica con Hero + ProductGrid + Banner que no coincide con la tienda real.

La estructura real de la Home debe conservar los textos/traducciones y comportamiento actuales hasta que el usuario decida modificarlos desde Puck.

---

## 21. Estilo de colaboración

El usuario quiere instrucciones concretas y cambios listos para aplicar.

Evitar largas cadenas de pruebas innecesarias.

Preferir:

- inspección
- diagnóstico
- cambio pequeño
- typecheck
- commit/push solo cuando esté validado

Cuando haya un error, identificar la causa raíz antes de proponer más modificaciones.

Si una propuesta implica arquitectura nueva, explicar primero por qué es necesaria y qué archivos afectará.

No afirmar que algo funciona hasta haberlo comprobado mediante código, typecheck o Preview cuando corresponda.
