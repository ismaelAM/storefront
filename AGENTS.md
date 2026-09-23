# AGENTS.md — Storefront Spree + Puck

## 1. Misión del proyecto

Este repositorio es un storefront de Spree Commerce basado en Next.js.

Estamos integrando Puck como editor visual.

Objetivo final:

- Mantener Spree como fuente de verdad para catálogo, productos, variantes, precios, stock, categorías y carrito.
- Usar Puck para editar visualmente la composición y presentación de las páginas.
- Mantener el Header, Footer, CartProvider, CartDrawer y lógica comercial de Spree.
- Permitir editar Home, páginas de categorías, navegación y plantillas/páginas de producto mediante Puck.
- Evitar duplicar lógica de negocio.
- Evitar rehacer componentes existentes de Spree cuando ya resuelven correctamente el problema.

## 2. Git: regla crítica

La rama principal del proyecto es:

`main`

`puck_editor` fue una rama temporal usada para integrar Puck. **No es la rama de trabajo por defecto** y no debe reutilizarse para cambios nuevos salvo petición expresa.

Antes de modificar archivos:

```bash
git status
git branch --show-current
```

No asumir una rama de trabajo fija. Para cada tarea:

- comprobar primero la rama y el estado actual;
- usar una rama específica de la tarea cuando el cambio requiera aislamiento o revisión;
- no reutilizar ramas históricas por su nombre;
- no hacer merge a `main` automáticamente;
- si el usuario pide explícitamente un cambio directo en `main`, comprobar el diff y validar antes de escribir.

Antes de hacer commit:

```bash
git diff
git status
```

Después de un cambio:

```bash
pnpm exec tsc --noEmit
```

No asumir que algo está desplegado. Los cambios solo llegan a Vercel después del commit/push correspondiente y del deployment asociado.

3. Regla de oro: leer antes de editar

ANTES de modificar cualquier archivo:

Localizar el archivo real.
Leer el archivo completo.
Buscar sus referencias/usos.
Entender qué componente lo consume.
Comprobar si ya existe una implementación equivalente.
Explicar brevemente la causa del problema.
Cambiar el mínimo código necesario.

NO reconstruir archivos de memoria.

NO reemplazar archivos completos si un cambio pequeño es suficiente.

NO eliminar archivos sin comprobar primero sus imports y referencias.

NO crear una segunda implementación de una funcionalidad que Spree ya proporciona.

4. Spree es la fuente de verdad

Nunca duplicar dentro de Puck:

precios
stock
variantes
IDs de variantes
lógica de carrito
lógica de checkout
disponibilidad
catálogo
categorías

Los productos proceden de Spree.

Las páginas de producto existentes de Spree deben mantenerse.

La lógica de compra existente debe reutilizarse.

5. ProductDetails es oficial

La página de producto existente utiliza:

ProductDetails

Ese componente contiene la lógica de variantes, cantidades y carrito.

En particular, la determinación de la variante utiliza:

const variantId =
  selectedVariant?.id ||
  product.default_variant?.id ||
  product.default_variant_id;

y el carrito utiliza:

const { addItem } = useCart();

No recrear estas funciones dentro de Puck.

6. CartContext es el carrito real

El carrito está gestionado por el storefront original.

El árbol del storefront ya incluye:

AuthProvider
  CartProvider
    children
    CartDrawer
    Toaster

No crear otro carrito.

No crear otro CartContext.

No crear una API alternativa para añadir productos al carrito salvo que una evidencia técnica concreta demuestre que es necesaria.

7. ProductCard: existen DOS componentes

NO confundirlos.

Oficial de Spree
src/components/products/ProductCard.tsx

Usa productos reales de Spree.

Puck
src/components/puck/ProductCard.tsx

Es la tarjeta utilizada por Puck.

Actualmente la intención es que la tarjeta de Puck NO tenga un botón independiente de carrito.

La tarjeta completa debe enlazar a:

/{country}/{locale}/products/{slug}

La página individual de Spree se encarga de:

variantes
cantidades
stock
precio
añadir al carrito
8. ProductGrid de Puck

Archivo:

src/components/puck/PuckProductGrid.tsx

El ProductGrid de Puck debe mostrar productos reales de Spree.

El producto real proporciona:

id
name
slug
thumbnail_url
price
original_price
default_variant_id

La URL de producto se construye usando el slug.

No crear listas manuales de productos para producción.

No guardar precio/stock/variant ID dentro de los datos de Puck como fuente de verdad.

9. PuckProductsContext

Archivo:

src/components/puck/PuckProductsContext.tsx

Actualmente proporciona:

products
basePath

y exporta:

PuckProductsProvider
usePuckProducts

El contexto sirve para pasar productos reales obtenidos en servidor a componentes Puck cliente.

No convertir getProducts() en una llamada directa desde un Client Component.

10. Obtención de productos

Archivo principal:

src/lib/data/products.ts

Existe:

getProducts(...)

que obtiene las opciones de locale y token y delega en las funciones cacheadas.

Existe también:

src/lib/data/cached.ts

con:

PRODUCT_CARD_FIELDS

que incluye:

id
name
slug
thumbnail_url
purchasable
default_variant_id
price
original_price
categories

Usar estos mecanismos existentes antes de crear nuevos fetchers.

11. Categorías

Archivo:

src/lib/data/categories.ts

Ya existe:

getCategories(...)
getCategory(...)
getCategoryProducts(...)

Las categorías reales vienen de Spree.

No crear una segunda base de categorías para Puck.

Una futura página de categoría Puck debe utilizar la categoría real de Spree y obtener sus productos mediante la lógica existente.

12. Página individual de producto

Ruta actual:

src/app/[country]/[locale]/(storefront)/products/[slug]/page.tsx

Esta página ya funciona y debe mantenerse.

Actualmente hace aproximadamente:

getCachedProduct(slug, PRODUCT_PAGE_EXPAND)
↓
ProductDetails

También mantiene:

breadcrumbs
SEO
canonical URL
categorías
variantes
carrito

NO sustituir ProductDetails por una implementación propia.

La futura integración de Puck para productos debe envolver/componer alrededor de la lógica oficial de Spree, no reemplazarla.

13. Storefront Layout

Archivo:

src/app/[country]/[locale]/(storefront)/layout.tsx

Este layout proporciona:

Header
navegación
main
Footer

El Header existente ya es válido.

No duplicar el Header dentro de Puck.

No crear otro CartProvider.

No crear otro CartDrawer.

La ruta del editor fue colocada deliberadamente dentro de:

(country)/(storefront)

para heredar la misma carcasa de la tienda.

14. Header

El Header actual tiene:

poca información superior
navegación
menú lateral/móvil
carrito

Queremos mantener su lógica.

A futuro se puede hacer configurable visualmente mediante Puck:

colores
logo
tipografía
espaciado
navegación
apariencia del botón de carrito

Pero la lógica del carrito y navegación debe seguir perteneciendo al storefront.

15. Navegación

Actualmente la navegación de categorías está en:

StorefrontLayout

y utiliza:

HeaderMobileMenu
FooterCategoryLinks
getCategories()

No duplicar categorías para crear una navegación paralela.

Objetivo futuro:

Permitir editar desde una interfaz visual:

orden
nombre mostrado
visibilidad
destino
estructura del menú

pero seguir utilizando las categorías reales de Spree.

16. Puck

Versión actual:

@puckeditor/core 0.23.0

Hay que respetar la API de esta versión.

Archivo principal:

src/puck/config.tsx

Actualmente existen componentes Puck como:

Text
Image
Carousel
Banner
ProductGrid
ProductShowcase
Section
Spacer

Y se están incorporando bloques específicos de Home.

17. Puck editor

Ruta:

src/app/[country]/[locale]/(storefront)/editor/

La URL pública del editor es:

/{country}/{locale}/editor

El editor debe heredar:

Header
CartProvider
CartDrawer
Footer

Puck se ejecuta en Client Components.

No importar Puck de forma que Next.js lo trate como Server Component.

18. Editor y página pública deben compartir datos

MUY IMPORTANTE:

NO crear una Home ficticia distinta de la Home pública.

No dejar indefinidamente:

data={{
  content: [],
  root: {},
}}

ni dos objetos independientes como:

initialHomeData
homeData

como fuentes paralelas.

Objetivo:

Puck Data
   ↓
guardar
   ↓
Editor carga ese Data
   ↓
Render carga ese mismo Data

El editor y la página pública deben utilizar la misma representación de página.

19. Persistencia

Actualmente NO existe todavía persistencia real de Puck.

No inventar una base de datos inmediatamente.

Antes de implementar persistencia:

decidir dónde se guardará el Data de Puck;
determinar si Git/Vercel es suficiente para la fase actual;
evitar almacenamiento temporal que no sobreviva a despliegues;
no prometer que escribir archivos dentro de un deployment Vercel es persistencia permanente.

La persistencia debe diseñarse antes de convertir Puck en la fuente de verdad pública.

20. Home actual

La Home existente está en:

src/app/[country]/[locale]/(storefront)/page.tsx

Las secciones originales son:

HeroSection
FeaturedProductsSection
WholesaleSection

Los archivos originales son:

src/components/home/HeroSection.tsx
src/components/home/FeaturedProductsSection.tsx
src/components/home/WholesaleSection.tsx

Estas secciones utilizan next-intl y traducciones existentes.

No reemplazar sus textos por valores inventados.

La futura Home Puck debe reproducir la Home existente antes de introducir cambios de diseño.

21. Home Puck

Se han creado bloques específicos:

src/puck/HomeHeroBlock.tsx
src/puck/HomeFeaturedProductsBlock.tsx
src/puck/HomeWholesaleBlock.tsx

Estos deben representar la estructura real de la Home.

No convertir la Home en:

Hero genérico
ProductGrid genérico
Banner genérico

si eso cambia la estructura real existente.

22. Objetivo de páginas

La arquitectura futura debe permitir:

Home
Categorías
Productos
Páginas adicionales

El mismo sistema de Puck debe poder reutilizarse.

Ejemplo conceptual:

Home
├── Hero
├── Featured Products
└── Wholesale

Categoría
├── Hero opcional
├── Texto
└── productos de la categoría

Producto
├── contenido Puck
├── ProductDetails oficial de Spree
└── contenido Puck adicional
23. Plantillas de producto

Una plantilla Puck de producto NO debe copiar manualmente:

precio
stock
variantes
nombre
IDs

Debe recibir el producto actual por contexto/ruta y delegar la compra en:

ProductDetails

Objetivo:

URL producto
↓
producto real de Spree
↓
Plantilla Puck
↓
ProductDetails original
24. Links

Los enlaces internos deben respetar:

/{country}/{locale}

No hardcodear /us/es cuando el componente deba funcionar en otros mercados/idiomas.

Si una prop basePath ya existe, utilizarla.

No cambiar rutas de Spree sin comprobar primero el routing existente.

25. Internacionalización

El proyecto utiliza next-intl.

Los textos existentes de la Home utilizan:

getTranslations({
  locale: locale as Locale,
  namespace: "home",
})

No sustituir traducciones existentes por texto fijo cuando el componente deba seguir siendo internacionalizable.

26. Vercel

La rama de producción es:

main

La rama:

puck_editor

genera Preview Deployments.

No cambiar Production Branch salvo petición explícita.

Preview actual conocido:

https://storefront-git-puckeditor-bison-tcg.vercel.app/

Las variables de Spree existen en el entorno de producción de Vercel.

Codespaces NO debe asumirse como entorno equivalente a producción.

27. Entorno local

Se descubrió que:

SPREE_API_URL
SPREE_PUBLISHABLE_KEY

no estaban originalmente disponibles en Codespaces.

vercel env pull .env.local --environment=production descargó sus nombres, pero Vercel sustituyó secretos por:

[SENSITIVE]

Por tanto:

no pedir ni publicar secretos;
no asumir que Codespaces puede comunicarse con Spree;
validar funcionalidades reales en Preview de Vercel cuando corresponda.
28. Errores que ya ocurrieron y NO repetir
Error 1

Pegar accidentalmente el contenido completo de PuckProductGrid.tsx dentro de config.tsx.

Resultado:
cientos de errores TypeScript.

Prevención:
mantener archivos separados.

Error 2

Importar Puck desde @puckeditor/core en un Server Component.

Resultado:

Export Puck doesn't exist in target module

Prevención:
Puck debe ejecutarse desde Client Component.

Error 3

Intentar hacer fetch server-side de productos directamente desde un Client Component.

Prevención:
obtener productos en servidor y pasarlos a contexto/props.

Error 4

Crear una API experimental:

/api/puck/products

para resolver algo que ya tenía solución en src/lib/data/products.ts.

Prevención:
reutilizar APIs internas existentes.

Error 5

Crear una Home Puck ficticia con textos y bloques inventados.

Prevención:
reproducir primero la Home real existente.

Error 6

Intentar resolver problemas de Codespaces modificando arquitectura de Puck.

Prevención:
distinguir:

error de entorno
error de compilación
error de Puck
error de Spree
Error 7

Eliminar archivos sin comprobar referencias.

Prevención:
buscar imports/referencias antes de eliminar.

29. Workflow obligatorio

Para cada tarea:

Antes
git status
git branch --show-current

Leer los archivos relevantes completos.

Buscar referencias:

grep -R "NombreComponente" src

si es necesario.

Durante

Cambiar el mínimo código posible.

No crear nuevas abstracciones si ya existe una adecuada.

Después
pnpm exec tsc --noEmit

Debe quedar en:

0 errors

Después:

git diff
git status

Solo entonces considerar commit.

Deploy

Solo:

git push origin puck_editor

Nunca:

git push origin main
30. Regla contra alucinaciones

Si no se conoce:

una ruta
una firma de función
una prop
un componente
una versión de API
una estructura de datos

NO inventarla.

Leer el archivo real.

Buscar la definición.

Comprobar imports.

Solo después modificar.

Si hay varias posibilidades, explicar cuál se observa en el código actual y elegir la compatible con él.

31. Regla contra cambios destructivos

No sustituir archivos completos por versiones reconstruidas de memoria salvo que el usuario lo solicite expresamente.

Preferir:

parche pequeño
modificación localizada
refactor mínimo

Antes de eliminar cualquier archivo:

grep -R "ArchivoOComponente" src

y comprobar que no quedan referencias.

32. Objetivo de experiencia final

El resultado buscado es:

HEADER SPREE
├── navegación editable
├── menú lateral editable
└── carrito real
        ↓
CONTENIDO PUCK
├── Home
├── Categorías
├── Productos
└── páginas adicionales
        ↓
FOOTER SPREE

Puck controla presentación.

Spree controla comercio.

Nunca invertir esas responsabilidades.

33. Próximo objetivo prioritario

El siguiente objetivo técnico es:

hacer que la Home real sea la fuente de contenido de Puck;
eliminar la duplicación entre homeData e initialHomeData;
introducir persistencia de página;
hacer que Editor y Render utilicen exactamente el mismo Data;
después reutilizar la arquitectura para categorías;
después para plantillas de producto;
después hacer configurable el Header;
finalmente construir navegación/menú editable.

No saltar al punto 6 antes de tener resueltos 1–4.

34. Estilo de trabajo

El usuario prefiere instrucciones concretas y seguras.

No entregar diez cambios simultáneos cuando uno es suficiente.

Para tareas complejas:

indicar qué archivo se va a tocar;
explicar por qué;
proporcionar código completo solo cuando reduzca errores;
comprobar TypeScript;
comprobar Git;
hacer commit;
hacer push a puck_editor;
verificar Preview.

No repetir preguntas cuya respuesta ya aparece en este documento.

35. Catálogo multidistribuidor

Antes de modificar sincronización de proveedores, leer completos:

CATALOG_SOURCING.md
TCGFACTORY_SYNC.md, si el cambio afecta a TcgFactory
supabase/functions/_shared/catalog-sourcing.ts

Spree sigue siendo la fuente de verdad comercial. Supabase conserva ofertas,
identidad canónica y procedencia interna. Cada variante se crea una sola vez;
los distribuidores aportan ofertas a esa variante y no productos paralelos.

No usar el SKU del distribuidor como identidad global. Preferir EAN/GTIN válido,
referencia de fabricante o familia + opciones exactas. Idioma, edición, color,
tamaño y otras dimensiones deben permanecer en options; no agrupar por títulos
parecidos.

La selección compara normalizedCost neto puesto en almacén. No mezclar PVP,
precios públicos, importes con IVA e importes netos. No cerrar un run parcial:
catalog-complete-run sólo se ejecuta cuando autenticación, paginación e ingesta
han terminado correctamente.

36. TcgFactory y secretos

TcgFactory usa:

supplier code: tcgfactory
adapter key: tcgfactory_b2b_bridge_v1
cuenta secreta: TCGFACTORY_B2B_EMAIL
contraseña secreta: TCGFACTORY_B2B_PASSWORD

Nunca guardar los valores de cuenta/contraseña, cookies o respuestas B2B en Git,
fixtures, logs, Puck, Spree ni catalog_suppliers.config. Guardarlos únicamente en
Supabase Edge Function Secrets/Vault o variables cifradas de Vercel, según dónde
corra el transporte.

La configuración versionada de TcgFactory está deshabilitada hasta validar un
feed autenticado. La web pública no es fuente válida de coste de compra. Si no
hay coste B2B inequívoco, el adaptador debe fallar y la oferta no debe competir.

No codificar selectores de PrestaShop ni endpoints privados sin una muestra
autorizada y pruebas. Si se implementa el login, verificar que tras enviarlo ya
no aparece el formulario de acceso; ante fallo o expiración, abortar el run y no
ejecutar catalog-complete-run.
