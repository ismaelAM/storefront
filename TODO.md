# Pendientes del storefront

Rama de trabajo: `puck_editor`

Este archivo es el registro vivo de pendientes, comprobaciones y tareas futuras. Tras cada edición relevante del proyecto, actualizaré este documento con lo hecho y cualquier comprobación nueva que haya quedado pendiente.

## Prioridad alta

- [ ] Verificar el nuevo Preview de Vercel tras los últimos cambios de UI/navegación/apariencia y seguridad.
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
- [ ] Confirmar si `fr` y `pt` están realmente disponibles en el Market/runtime; en el Preview anterior el selector de header/footer solo mostraba `EN` y `ES`.
- [ ] Traducir en Spree nombres, descripciones y categorías de productos a `en`, `pt` y `fr`.
- [ ] Revisar traducciones del catálogo completo y mantener terminología consistente en ES/EN/PT/FR.
- [ ] Confirmar en Spree qué locales están realmente habilitados por cada Market antes de activar nuevos países.

## Catálogo y Spree

- [x] En la revisión manual del Preview, el catálogo se ve correcto.
- [ ] Confirmar que los productos que aparecen en la web proceden directamente del catálogo de Spree y que no existe un catálogo manual paralelo.
- [ ] Confirmar sincronización/lectura en tiempo real desde Spree para productos, categorías, variantes, precios e inventario.
- [ ] Configurar correctamente Markets de Europa en la futura instancia de producción de Spree.
- [ ] Definir países por Market y revisar moneda, locale, pagos, impuestos y envío por región.
- [x] Añadida primera prueba de concepto para leer el catálogo B2B de Devir con una sesión de cliente, descubriendo productos desde categorías paginadas.
- [x] El lector B2B de Devir extrae SKU, precio final/máximo, disponibilidad y fecha de lanzamiento sin modificar Spree.
- [x] Validar la prueba de concepto contra 5 productos reales de Devir, incluyendo Yu-Gi-Oh! y Magic: The Gathering.
- [x] Preparado el importador Devir → Spree en modo dry-run, resolviendo variantes por SKU sin escribir cambios.
- [ ] Añadir las reglas de auto-precio BisonTCG al importador antes de escribir precios en Spree (el dry-run todavía no modifica precios).
- [ ] Definir proveedores múltiples y prioridad de abastecimiento cuando un producto no esté disponible en un distribuidor.

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

- [x] Puck comprobado manualmente en el Preview anterior y funciona correctamente.
- [x] Eliminada la pestaña/pantalla dedicada de edición de Productos.
- [x] Eliminadas las rutas de edición por producto individual para evitar gestionar el display producto a producto.
- [x] Añadida opción global `Color principal` dentro de Apariencia.
- [x] El `Color principal` se aplica como variable global `--primary` al storefront.
- [x] Corregido el fallback de navegación para que una configuración editorial antigua/vacía no oculte las categorías reales de Spree.
- [x] Refactorizadas utilidades compartidas de Puck para enlaces, grids, proporciones y radios; mejorados hero, tarjetas y bloques de producto para móvil.
- [ ] Verificar en el nuevo Preview que el desplegable/menú de productos muestra categorías y subcategorías reales de Spree.
- [ ] Mantener Puck como capa editorial y Spree como fuente de verdad del catálogo.
- [ ] No reintroducir Carousel, FeaturedProductsHome, ProductShowcase, Cart ni Sidebar como componentes dedicados salvo petición explícita.
- [ ] Mantener el menú móvil mostrando categorías/subcategorías reales de Spree.
- [x] Implementada base de canonical y `hreflang` dinámicos según el Market y sus idiomas soportados.
- [ ] Revisar SEO/hreflang para ES/EN/PT/FR en un Preview real.
- [x] Añadido JSON-LD `CollectionPage` a las páginas de categorías.
- [ ] Revisar datos estructurados de productos/variantes y cobertura de Merchant Listings.
- [ ] Configurar/revisar Google Business Profile/Maps solo si en el futuro tiene sentido para un negocio físico; actualmente no es prioritario para la tienda online.

## Historial reciente / comprobaciones

### Seguridad Puck
- [x] Añadida autenticación de administrador basada en secreto de entorno para todo el árbol de rutas `/editor`.
- [x] Añadida cookie `HttpOnly` de sesión de editor con expiración y protección `SameSite`/`Secure` en producción.
- [x] El guardado de la home comprueba autenticación en servidor antes de tocar Supabase con la service role key.
- [x] Corregido el error de TypeScript en la Server Action de login para que el build pueda superar esa comprobación de tipos.
- [ ] Configurar el valor real de `PUCK_EDITOR_PASSWORD` en Vercel; no guardarlo en GitHub ni compartirlo por chat.
- [ ] Validar acceso autorizado y rechazo de acceso/guardado no autenticado en un Preview `READY`.

### Vercel
- [x] Vercel tuvo deployments `READY` antes de la capa de seguridad.
- [x] Identificado el fallo del último deployment de seguridad: TypeScript rechazaba `form action={login}` porque la Server Action devolvía un objeto en lugar de `void`/`Promise<void>`.
- [x] Corregido ese fallo en el commit posterior de `puck_editor`.
- [x] Corregido el fallo posterior de TypeScript en `scripts/devir-b2b-login.ts`: `stdin` devuelve un Buffer y ahora se convierte explícitamente a texto antes de aplicar `trim()`.
- [x] Corregido el typecheck del dry-run Devir → Spree fijando la Admin API key como `string` validado antes de construir los headers de `fetch`.
- [ ] Verificar un nuevo deployment después de la corrección de seguridad y los últimos cambios.
- [ ] No fusionar la PR temporal `#1` de `puck_editor` a `main`; es solo para verificación y no debe eliminar la regla de trabajar únicamente en `puck_editor`.

### Puck
- [x] Restaurado/ajustado el editor Puck según las últimas decisiones del proyecto.
- [x] Mantener Products como bloques reales dentro de la composición de Puck, sin editor dedicado de productos.
- [x] Eliminado el flujo de edición de productos por separado.
- [x] Añadido color global desde Apariencia.
- [x] Añadidas utilidades Puck compartidas y mejoras responsive en hero, grids, tarjetas y showcase de producto.
- [ ] Verificar que el color global se refleja correctamente en los elementos que usan `primary`.
- [x] Preparado lector inicial de catálogo B2B de Devir con sesión persistida fuera de Git y salida JSON local.
- [x] Normalizados precios Devir que llegan como euros enteros o céntimos codificados sin separador (p. ej. `12412` → `124.12`).
- [x] Preparado dry-run de importación contra la Admin API de Spree; no realiza escrituras.
- [x] Revisada la autenticación B2B de Devir: el chequeo de sesión ahora prioriza señales de sesión reales (logout/customer section) antes de considerar la mera presencia del formulario de login, evitando falsos negativos de Magento.
- [x] Comprobado el fallo actual de `pnpm devir:login`: no llega a abrir Devir ni a intentar autenticar porque Codespaces no tiene servidor X/DISPLAY y el script solicita `headless: false`.
- [x] Corregido `pnpm devir:login` para que, cuando Codespaces no tenga DISPLAY, abra el navegador Devir en modo headless y exponga una interfaz web temporal para que el login se haga manualmente desde el navegador del Codespace; la sesión se guarda únicamente tras validar la autenticación.
- [x] Corregida la apertura del puerto 8787 desde Codespaces: si GitHub abre la raíz sin el token temporal, el servidor redirige automáticamente a la URL autenticada en lugar de responder `Not found`; las rutas de control siguen exigiendo token.
- [ ] Ejecutar `pnpm devir:login`, completar el login real de Devir desde la interfaz web y comprobar que la sesión queda guardada.
- [x] Ejecutado `DEVIR_B2B_MAX_PRODUCTS=5 pnpm devir:scan` y validados varios productos reales antes de preparar la importación.

### Regiones e idiomas
- [x] Confirmado que la web ya tenía infraestructura de locales y negociación de idioma.
- [x] Confirmado que el Market de Spain puede ofrecer `en` y que `/es/en` funciona.
- [x] Añadidos `pt` y traducciones PT-PT en `puck_editor`.
- [x] En Preview anterior, header/footer funcionaban con selector de idiomas.
- [ ] El selector visible depende de los locales realmente devueltos por el Market de Spree; ahora mismo solo se han verificado `EN` y `ES` en runtime.
- [ ] Verificar comportamiento real de `/es/pt` y `/es/fr` cuando esos locales estén habilitados en el Market.

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
- [x] Homogeneizada la selección visual del método de envío con el color global `--primary` del storefront.
- [ ] Corregir en Spree la Zone/método para que Madrid no aparezca en Lugo.
- [ ] Probar checkout, Shipment y estado de entrega con una dirección de Madrid.
- [ ] Probar que una dirección fuera de Madrid no recibe la opción local.
- [ ] Integrar UPS después de estabilizar el método local.

## Regla de mantenimiento

Después de cada edición relevante:
