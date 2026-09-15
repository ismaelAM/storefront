# Pendientes del storefront

Rama de trabajo: `puck_editor`

Este archivo es el registro vivo de pendientes, comprobaciones y tareas futuras. Tras cada edición relevante del proyecto, actualizaré este documento con lo hecho y cualquier comprobación nueva que haya quedado pendiente.

## Prioridad alta

- [ ] Verificar el nuevo Preview de Vercel tras los últimos cambios de UI/navegación y apariencia.
- [ ] **Seguridad Puck:** configurar `PUCK_EDITOR_PASSWORD` como secreto en Vercel y comprobar que `/editor` y sus subrutas solo son accesibles con la contraseña de administrador.
- [ ] **Seguridad Puck:** validar que el Server Action de guardado rechaza peticiones no autenticadas aunque se invoque directamente.
- [ ] Verificar la conexión real del storefront con Spree en Vercel: `SPREE_API_URL` + `SPREE_PUBLISHABLE_KEY`, sin exponer claves.
- [ ] Hospedar Spree en producción fuera del Sandbox y dejar configurados sus mercados, catálogo, stock, pagos, impuestos y envíos.
- [ ] Configurar correctamente los métodos de pago por región/Market desde Spree, evitando mapas de países hardcodeados en Next.js.
- [ ] Terminar la integración de Stripe de forma real con el checkout de Spree. La ruta `/api/create-checkout-session` actual es un endpoint mínimo separado, con placeholders de Price ID, y no debe considerarse una integración terminada.
- [ ] Decidir y documentar la estrategia definitiva de Stripe: mantener Payment Sessions/provider de Spree o conectar Checkout Sessions a los artículos/variantes reales del carrito de Spree.
- [ ] Validar en Vercel el SEO técnico añadido: canonical, hreflang, JSON-LD y rutas por idioma/Market.
- [ ] Corregir y probar la configuración del método de envío propio para Madrid en Spree.

## UPS

- [x] Creada cuenta UPS para la futura integración de BisonTCG.
- [x] Creada/avanzada la aplicación de UPS orientada a integrar la tecnología de UPS en el propio negocio, no a representar múltiples usuarios.
- [x] Seleccionadas las APIs iniciales `Shipping` y `Tracking`.
- [x] Enviado formulario de soporte a UPS para verificar la información de la cuenta y habilitar el acceso necesario a las credenciales de API.
- [ ] Esperar respuesta de soporte de UPS (indican hasta 1 día laborable).
- [ ] Obtener/confirmar Client ID y Client Secret OAuth de la aplicación sin compartir el secreto por chat.
- [ ] Configurar las credenciales como secretos del entorno cuando corresponda.
- [ ] Integrar UPS con el flujo real de envíos de Spree: crear envío/etiqueta y guardar tracking en Spree.
- [ ] Mostrar al cliente el tracking UPS mediante los datos nativos del Shipment de Spree.

## Idiomas y traducciones

- [x] Inglés habilitado en el Market `Spain` de Spree y comprobado que la ruta inglesa funciona.
- [x] `en` ya existía en el frontend.
- [x] Francés (`fr`) ya existía en el frontend y se añadió como idioma soportado en Spree.
- [x] Portugués (`pt`) añadido al registro de idiomas del frontend.
- [x] Traducciones de interfaz de `pt` añadidas en portugués de Portugal.
- [ ] Comprobar `/es/pt` en el Preview actual.
- [ ] Confirmar si `fr` y `pt` están realmente disponibles en el Market/runtime; en el Preview actual el selector de header/footer solo muestra `EN` y `ES`.
- [ ] Traducir en Spree nombres, descripciones y categorías de productos a `en`, `pt` y `fr`.
- [ ] Revisar traducciones del catálogo completo y mantener terminología consistente en ES/EN/PT/FR.
- [ ] Confirmar en Spree qué locales están realmente habilitados por cada Market antes de activar nuevos países.

## Catálogo y Spree

- [x] En la revisión manual del Preview, el catálogo se ve correcto.
- [ ] Confirmar que los productos que aparecen en la web proceden directamente del catálogo de Spree y que no existe un catálogo manual paralelo.
- [ ] Confirmar sincronización/lectura en tiempo real desde Spree para productos, categorías, variantes, precios e inventario.
- [ ] Configurar correctamente Markets de Europa en la futura instancia de producción de Spree.
- [ ] Definir países por Market y revisar moneda, locale, pagos, impuestos y envío por región.

## Envíos

- [ ] Crear Zone exclusiva para Madrid en Spree.
- [ ] Crear método `Entrega local BisonTCG — Madrid` con código `BISON_LOCAL_MADRID`.
- [ ] Asociar el método a la Shipping Category física correspondiente.
- [ ] Definir tarifa fija y tiempo estimado de entrega.
- [ ] **Bug confirmado:** el método/opción de Madrid aparece también para una dirección de Lugo. El código del storefront no contiene lógica de ciudad Madrid; la corrección debe hacerse en la Zone/método de envío de Spree, no hardcodeando provincias en Next.js.
- [ ] Probar que Madrid ofrece el método local y que fuera de Madrid no aparece.
- [ ] Confirmar que el pedido genera correctamente su Shipment en Spree.
- [ ] Mostrar al cliente el estado del Shipment mediante los datos nativos de Spree.
- [ ] Añadir UPS como segundo método en una fase posterior, con API y tracking automático.

## Storefront / UI

- [x] Puck comprobado manualmente en el Preview actual y funciona correctamente.
- [x] Eliminada la pestaña/pantalla dedicada de edición de Productos.
- [x] Eliminadas las rutas de edición por producto individual para evitar gestionar el display producto a producto.
- [x] Añadida opción global `Color principal` dentro de Apariencia.
- [x] El `Color principal` se aplica como variable global `--primary` al storefront.
- [x] Corregido el fallback de navegación para que una configuración editorial antigua/vacía no oculte las categorías reales de Spree.
- [ ] Verificar en el nuevo Preview que el desplegable/menú de productos muestra categorías y subcategorías reales de Spree.
- [ ] Mantener Puck como capa editorial y Spree como fuente de verdad del catálogo.
- [ ] No reintroducir Carousel, FeaturedProductsHome, ProductShowcase, Cart ni Sidebar como componentes dedicados salvo petición explícita.
- [ ] Mantener el menú móvil mostrando categorías/subcategorías reales de Spree.
- [x] Implementada base de canonical y `hreflang` dinámicos según el Market y sus idiomas soportados.
- [ ] Revisar SEO/hreflang para ES/EN/PT/FR en un Preview real.
- [x] Añadido JSON-LD `CollectionPage` a las páginas de categorías.
- [ ] Revisar datos estructurados de productos/variantes y cobertura de Merchant Listings.
- [ ] Configurar y revisar presencia en Google Business Profile/Maps solo si en el futuro tiene sentido para un negocio físico; actualmente no es prioritario para la tienda online.

## Historial reciente / comprobaciones

### Seguridad Puck
- [x] Añadida autenticación de administrador basada en secreto de entorno para todo el árbol de rutas `/editor`.
- [x] Añadida cookie `HttpOnly` de sesión de editor con expiración y protección `SameSite`/`Secure` en producción.
- [x] El guardado de la home comprueba autenticación en servidor antes de tocar Supabase con la service role key.
- [ ] Configurar el valor real de `PUCK_EDITOR_PASSWORD` en Vercel; no guardarlo en GitHub ni compartirlo por chat.
- [ ] Validar acceso autorizado y rechazo de acceso/guardado no autenticado en un Preview `READY`.

### Vercel
- [x] Vercel vuelve a construir correctamente el branch `puck_editor`; deployment actual verificado en estado `READY`.
- [x] Preview actual usado para pruebas manuales del catálogo, idiomas y Puck.
- [ ] Verificar nuevo deployment después de los últimos cambios de UI/navegación/apariencia.
- [ ] No fusionar la PR temporal `#1` de `puck_editor` a `main`; es solo para verificación y no debe eliminar la regla de trabajar únicamente en `puck_editor`.

### Puck
- [x] Restaurado/ajustado el editor Puck según las últimas decisiones del proyecto.
- [x] Mantener Products como bloques reales dentro de la composición de Puck, sin editor dedicado de productos.
- [x] Eliminado el flujo de edición de productos por separado.
- [x] Añadido color global desde Apariencia.
- [ ] Verificar que el color global se refleja correctamente en los elementos que usan `primary`.

### Regiones e idiomas
- [x] Confirmado que la web ya tenía infraestructura de locales y negociación de idioma.
- [x] Confirmado que el Market de Spain puede ofrecer `en` y que `/es/en` funciona.
- [x] Añadidos `pt` y traducciones PT-PT en `puck_editor`.
- [x] En Preview actual, header/footer funcionan con selector de idiomas.
- [ ] El selector actual solo muestra `EN` y `ES`: revisar por qué `PT` y `FR` no aparecen en runtime.
- [ ] Verificar comportamiento real de `/es/pt` y `/es/fr`.

### SEO
- [x] Auditado el estado existente de `sitemap.ts`, `robots.ts`, metadata y JSON-LD.
- [x] Confirmado que el sitemap ya incluye URLs de productos y categorías por Market/idioma.
- [x] Confirmado que `robots.ts` enlaza los sitemaps generados dinámicamente.
- [x] Añadidos canonical y `hreflang` dinámicos al metadata del storefront según los idiomas soportados por el Market.
- [x] Añadido JSON-LD `CollectionPage` a páginas de categoría junto a BreadcrumbList.
- [ ] Validar en Preview real que los `link rel="canonical"` y `link rel="alternate"` apuntan a URLs válidas.
- [ ] Validar JSON-LD de Product y CollectionPage en páginas reales con datos de Spree.
- [ ] Añadir/validar Google Search Console y envío del sitemap cuando el dominio definitivo esté activo.

### Envíos
- [x] Diseñada la arquitectura de envío local Madrid con Spree como fuente de verdad.
- [x] Documentado el método `BISON_LOCAL_MADRID` y su separación de una futura integración UPS.
- [x] Documentado que el tracking local puede gestionarse manualmente desde Spree sin API externa.
- [x] Confirmado manualmente en Preview que el checkout muestra métodos de envío procedentes de Spree.
- [ ] Corregir en Spree la Zone/método para que Madrid no aparezca en Lugo.
- [ ] Probar checkout, Shipment y estado de entrega con una dirección de Madrid.
- [ ] Probar que una dirección fuera de Madrid no recibe la opción local.
- [ ] Integrar UPS después de estabilizar el método local.

## Regla de mantenimiento

Después de cada edición relevante:

1. Añadir aquí qué se cambió.
2. Añadir cualquier comprobación nueva que quede pendiente.
3. Mantener el estado real: no marcar como hecho algo que no haya sido verificado.
4. Trabajar únicamente sobre `puck_editor` salvo petición explícita de usar otra rama.
5. No afirmar que Vercel está desplegado o listo si no existe un deployment verificable en estado READY.
