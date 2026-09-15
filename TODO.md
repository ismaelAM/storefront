# Pendientes del storefront

Rama de trabajo: `puck_editor`

Este archivo es el registro vivo de pendientes, comprobaciones y tareas futuras. Tras cada edición relevante del proyecto, actualizaré este documento con lo hecho y cualquier comprobación nueva que haya quedado pendiente.

## Prioridad alta

- [ ] Verificar un nuevo deployment Preview de Vercel cuando se levante el bloqueo de builds del plan Hobby. No crear deployments innecesarios mientras siga activo `upgradeToPro=build-rate-limit`.
- [ ] Verificar la conexión real del storefront con Spree en Vercel: `SPREE_API_URL` + `SPREE_PUBLISHABLE_KEY`, sin exponer claves.
- [ ] Hospedar Spree en producción fuera del Sandbox y dejar configurados sus mercados, catálogo, stock, pagos, impuestos y envíos.
- [ ] Configurar correctamente los métodos de pago por región/Market desde Spree, evitando mapas de países hardcodeados en Next.js.
- [ ] Terminar la integración de Stripe de forma real con el checkout de Spree. La ruta `/api/create-checkout-session` actual es un endpoint mínimo separado, con placeholders de Price ID, y no debe considerarse una integración terminada.
- [ ] Decidir y documentar la estrategia definitiva de Stripe: mantener Payment Sessions/provider de Spree o conectar Checkout Sessions a los artículos/variantes reales del carrito de Spree.
- [ ] Validar en Vercel el SEO técnico añadido: canonical, hreflang y rutas por idioma/Market.

## Idiomas y traducciones

- [x] Inglés habilitado en el Market `Spain` de Spree y comprobado que la ruta inglesa funciona.
- [x] `en` ya existía en el frontend.
- [x] Francés (`fr`) ya existía en el frontend y se añadió como idioma soportado en Spree.
- [x] Portugués (`pt`) añadido al registro de idiomas del frontend.
- [x] Traducciones de interfaz de `pt` añadidas en portugués de Portugal.
- [ ] Comprobar `/es/pt` en un Preview de Vercel cuando haya builds disponibles.
- [ ] Traducir en Spree nombres, descripciones y categorías de productos a `en`, `pt` y `fr`.
- [ ] Revisar traducciones del catálogo completo y mantener terminología consistente en ES/EN/PT/FR.
- [ ] Confirmar en Spree qué locales están realmente habilitados por cada Market antes de activar nuevos países.

## Catálogo y Spree

- [ ] Confirmar que los productos que aparecen en la web proceden directamente del catálogo de Spree y que no existe un catálogo manual paralelo.
- [ ] Confirmar sincronización/lectura en tiempo real desde Spree para productos, categorías, variantes, precios e inventario.
- [ ] Configurar correctamente Markets de Europa en la futura instancia de producción de Spree.
- [ ] Definir países por Market y revisar moneda, locale, pagos, impuestos y envío por región.

## Storefront / UI

- [ ] Revisar selectores y filtros del ProductGrid de Puck, especialmente filtro por categoría/variante y colores, que todavía no se han verificado completamente.
- [ ] Mantener Puck como capa editorial y Spree como fuente de verdad del catálogo.
- [ ] No reintroducir Carousel, FeaturedProductsHome, ProductShowcase, Cart ni Sidebar como componentes dedicados salvo petición explícita.
- [ ] Mantener el menú móvil mostrando categorías/subcategorías reales de Spree.
- [x] Implementada base de canonical y `hreflang` dinámicos según el Market y sus idiomas soportados.
- [ ] Revisar SEO/hreflang para ES/EN/PT/FR en una Preview real.
- [ ] Revisar datos estructurados de productos/variantes y cobertura de Merchant Listings.
- [ ] Configurar y revisar presencia en Google Business Profile/Maps cuando la marca, dominio y datos de contacto estén definitivos.

## Historial reciente / comprobaciones

### Stripe
- [x] Conexión de Stripe Dashboard realizada y cuenta Live `BisonTCG` conectada mediante el conector; no exponer claves.
- [x] Analizado el repositorio y no se encontró `stripe.checkout.sessions.create(...)`: se siguió el escenario B del encargo de Stripe.
- [x] Añadido `src/app/api/create-checkout-session/route.ts` con los parámetros requeridos y placeholders explícitos para Price ID, success URL y cancel URL.
- [x] Añadido `STRIPE_SECRET_KEY` a `.env.example` y `.env.local.example`.
- [x] Creado `STRIPE_INTEGRATION_TODO.md` como documentación específica de Stripe.
- [ ] Sustituir placeholder `price_...` por Price IDs reales cuando los productos de Stripe estén vinculados a Spree.
- [ ] No considerar terminada la integración hasta probar carrito → pago → pedido real de Spree.
- [ ] Configurar métodos de pago de Stripe según región una vez estén definidos los Markets reales.

### Vercel
- [x] Identificado proyecto Vercel `storefront` y rama de trabajo `puck_editor`.
- [x] Identificados deployments READY anteriores y deployment ERROR más reciente por error de build de `RealProductShowcase`.
- [x] Corregidos los defaults de `RealProductShowcase` para resolver el error de TypeScript de Vercel.
- [ ] Reintentar/verificar Preview solo cuando el rate limit de Hobby permita builds.
- [ ] No fusionar la PR temporal `#1` de `puck_editor` a `main`; es solo para verificación y no debe eliminar la regla de trabajar únicamente en `puck_editor`.

### Puck
- [x] Restaurado/ajustado el editor Puck según las últimas decisiones del proyecto.
- [x] Mantener Products como parte del flujo editorial sin inventar productos manualmente.
- [ ] Revisar filtros/selectores y colores de productos en ProductGrid.
- [ ] Seguir respetando props de `RealProductShowcase` si vuelve a editarse.

### Regiones e idiomas
- [x] Confirmado que la web ya tenía infraestructura de locales y negociación de idioma.
- [x] Confirmado que el Market de Spain puede ofrecer `en` y que `/es/en` funciona.
- [x] Añadidos `pt` y traducciones PT-PT en `puck_editor`.
- [ ] Verificar comportamiento real de `/es/pt` cuando exista un Preview nuevo.
- [ ] Revisar que el selector Región e idioma muestre únicamente idiomas habilitados por el Market.

### SEO
- [x] Auditado el estado existente de `sitemap.ts`, `robots.ts`, metadata y JSON-LD.
- [x] Confirmado que el sitemap ya incluye URLs de productos y categorías por Market/idioma.
- [x] Confirmado que `robots.ts` enlaza los sitemaps generados dinámicamente.
- [x] Añadidos canonical y `hreflang` dinámicos al metadata del storefront según los idiomas soportados por el Market.
- [ ] Validar en Preview real que los `link rel="canonical"` y `link rel="alternate"` apuntan a URLs válidas.
- [ ] Validar JSON-LD de Product en páginas de producto con datos reales de Spree.
- [ ] Añadir/validar Google Search Console y envío del sitemap cuando el dominio definitivo esté activo.

## Regla de mantenimiento

Después de cada edición relevante:

1. Añadir aquí qué se cambió.
2. Añadir cualquier comprobación nueva que quede pendiente.
3. Mantener el estado real: no marcar como hecho algo que no haya sido verificado.
4. Trabajar únicamente sobre `puck_editor` salvo petición explícita de usar otra rama.
5. No afirmar que Vercel está desplegado o listo si no existe un deployment verificable en estado READY.
