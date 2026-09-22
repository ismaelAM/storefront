# Pendientes del storefront

Rama principal: `main`

Este archivo es el registro vivo de pendientes, comprobaciones y tareas futuras. Tras cada edición relevante del proyecto, actualizaré este documento con lo hecho y cualquier comprobación nueva que haya quedado pendiente.

## Prioridad alta

- [ ] Verificar el nuevo Preview de Vercel tras los últimos cambios de UI/navegación/apariencia y seguridad.
- [ ] **Seguridad Puck:** configurar `PUCK_EDITOR_PASSWORD` como secreto en Vercel y comprobar que `/editor` y sus subrutas solo son accesibles con la contraseña de administrador.
- [ ] **Seguridad Puck:** validar que el Server Action de guardado rechaza peticiones no autenticadas aunque se invoque directamente.
- [ ] Verificar la conexión real del storefront con Spree en Vercel: `SPREE_API_URL` + `SPREE_PUBLISHABLE_KEY`, sin exponer claves.
- [ ] Hospedar Spree en producción fuera del Sandbox y dejar configurados sus mercados, catálogo, stock, pagos, impuestos y envíos.
- [ ] Configurar correctamente los métodos de pago por región/Market desde Spree, evitando mapas de países hardcodeados en Next.js.
- [ ] Configurar en Vercel `STRIPE_SECRET_KEY=sk_live_...`, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_live_...` y `STRIPE_WEBHOOK_SECRET=whsec_...`; el conector de Vercel disponible no permite escribir env vars desde este chat.
- [ ] Registrar en Stripe el webhook live `/api/payments/stripe/webhook` para `payment_intent.succeeded` y hacer una compra real de importe pequeño controlado.
- [x] Stripe Live integrado directamente con PaymentIntents + Payment Element porque el Spree alojado no admite las claves live; Spree sigue controlando pedido/stock/envío y recibe un pago externo reconciliado sin segundo cargo.
- [x] Estrategia Stripe definitiva: Stripe Live cobra directamente en el storefront; un método interno oculto `Stripe Live External` registra el cobro ya confirmado en Spree y completa el pedido.
- [ ] Validar en Vercel el SEO técnico añadido: canonical, hreflang, JSON-LD y rutas por idioma/Market.
- [ ] Corregir y probar la configuración del método de envío propio para Madrid en Spree.

## Transporte externo

- [x] UPS descartado tras respuesta negativa del proveedor.
- [x] Investigadas y modeladas las APIs vigentes de Correos: Preregister, Labels, Trackpub y Requests; BoxEntry queda fuera del flujo por estar deprecada.
- [x] Añadido cliente Correos server-only con autenticación específica por API, validación HTTPS, protección contra escape de endpoints y errores sin payloads privados.
- [x] Añadido puente server-only a los fulfillments nativos de Spree para listar envíos, guardar tracking, marcar enviado y marcar entregado.
- [x] Añadida ruta interna protegida `/api/internal/shipping` para operaciones de back-office; no expone secretos al navegador.
- [x] Preregister está activo para crear/prerregistrar envíos mediante `POST /delivery`; BoxEntry se ha retirado del flujo operativo.
- [ ] Confirmar que el contrato de transporte de Correos está firmado y vinculado al mismo Correos ID.
- [ ] Configurar en Vercel `SHIPPING_OPERATIONS_TOKEN` y las variables `CORREOS_*` emitidas por Correos.
- [ ] Obtener/validar el mecanismo oficial de emisión y renovación del Bearer de Correos ID; hasta entonces se admite `CORREOS_ID_ACCESS_TOKEN` y se falla de forma segura al caducar.
- [ ] Confirmar con Correos el procedimiento de prueba/sandbox o una operación controlada sin cargos.
- [ ] Ejecutar una prueba controlada real de tracking, etiqueta y recogida.
- [ ] Si el acceso API no está disponible, seguir usando Mi Oficina de Correos y guardar tracking/estado en Spree; no crear una base logística paralela.

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
- [x] Añadido motor de precio por categoría con fallback del 25% solo como referencia; los márgenes de MTG/Yu-Gi-Oh!/juegos de mesa/accesorios quedan pendientes de decisión comercial real.
- [ ] Confirmar con una factura/panel de Devir si `purchasePrice` se muestra sin IVA; el dry-run asume por defecto coste sin IVA y permite cambiarlo con `DEVIR_PRICE_COST_INCLUDES_VAT=true`.
- [ ] Definir los márgenes reales por categoría en `.local/devir-pricing-rules.json` y validar el plan antes de habilitar escrituras `write_products`.
- [x] Añadida cola `AUTO` / `REVIEW_REQUIRED` / `APPROVED` y decisiones persistidas localmente para que el operador controle excepciones.
- [x] Añadido soporte de packs divididos manualmente en productos hijos, validando que el coste asignado cuadre con el total de Devir.
- [x] Añadido `pnpm devir:sync:watch`: scan + dry-run cada 6 horas mientras el proceso/Codespace esté activo; si caduca la sesión se detiene y requiere `pnpm devir:login`.
- [x] Añadida sincronización Devir → Spree que crea productos nuevos como `draft` ocultos y guarda coste/PVP en la variante.
- [x] Spree gestiona márgenes objetivo mediante campos internos de categoría y overrides por producto; el JSON local queda como respaldo técnico.
- [x] Los comandos de margen aceptan formato decimal o porcentaje (`0.25`, `25`, `25%`) para evitar errores de entrada.
- [x] Añadidos campos internos de revisión, origen Devir, margen aplicado/efectivo, IVA y última sincronización.
- [x] Protegidos los PVP editados manualmente en Spree frente a sobrescritura en sincronizaciones posteriores.
- [x] Añadido comando de activación por SKU que rechaza productos con `REVIEW_REQUIRED`.
- [x] El ciclo de 6 horas ahora ejecuta scan → dry-run → sync a drafts y nunca activa productos automáticamente.
- [x] Añadido modo `devir:hyper:once` para descubrir categorías desde la navegación autenticada y sincronizar el catálogo completo visible de Devir a drafts.
- [x] Añadidos checkpoint/resume, deduplicado por URL/SKU y hasta 200 páginas por categoría en modo hyper.
- [x] Añadido `devir:hyper:watch` para repetir el catálogo completo cada 6 horas mientras el proceso/Codespace siga activo.
- [ ] Validar la primera pasada `pnpm devir:hyper:once` y revisar cuántas categorías/SKUs descubre realmente la cuenta B2B.
- [x] Cloud Sync en Supabase: tablas privadas con RLS, cola/checkpoints, locks, Edge Function y Cron autenticado mediante Vault.
- [x] El worker cloud procesa productos en paralelo con el descubrimiento de categorías para que los drafts aparezcan durante el barrido, no solo al final.
- [x] Excluido `supabase/functions/**` del typecheck de Next/Vercel: el source Deno se valida/despliega en Supabase, no con TypeScript del storefront.
- [x] Añadida importación automática de imágenes Devir a Spree cuando el producto todavía no tiene galería.
- [x] Corregido el typecheck del modo hyper en el narrowing de URLs de categoría.
- [ ] Ejecutar una vez `pnpm devir:cloud:bootstrap` para subir sesión B2B + clave Spree de forma privada y activar el primer ciclo cloud. El bootstrap ya no requiere credenciales Supabase locales y valida la `sk_...` directamente contra Spree.
- [ ] Validar el primer ciclo cloud completo y una muestra de imágenes copiadas a Spree.
- [x] El cliente Spree ignora placeholders de Vercel como `[SENSITIVE]` y usa `https://bisontcg.spree.sh` como fallback seguro para la URL pública.
- [x] El dry-run Devir usa el mismo cliente Admin API seguro que la sincronización, evitando URLs `[SENSITIVE]` y lógica de credenciales duplicada.
- [ ] Confirmar que la Secret API Key real tiene `write_products` y `write_settings`, ejecutar `pnpm devir:spree:setup` y verificar la primera carga real de drafts.
- [ ] Verificar en Store API/Preview que los productos `draft` de Devir no son visibles hasta activarlos.
- [x] Los scripts Devir cargan `.env.local` automáticamente y priorizan `DEVIR_B2B_SPREE_API_URL` / `DEVIR_B2B_SPREE_ADMIN_API_KEY` traídas desde Vercel, manteniendo compatibilidad con los nombres antiguos.
- [x] Movido el ciclo de 6 horas a Supabase Cron + Edge Function incremental; ya no depende de Codespaces para operar 24/7.
- [x] Añadido almacenamiento de usuario/contraseña Devir en Supabase Vault para reautenticación automática cuando caduquen las cookies.
- [x] Añadido login Magento automático con `form_key`, validación posterior de cuenta y renovación de cookies; no intenta saltarse CAPTCHA/MFA.
- [x] El comando `devir:cloud:credentials` valida credenciales inmediatamente contra Devir antes de confirmarlas y el worker maneja correctamente múltiples `Set-Cookie` de Magento.
- [x] Disponibilidad Devir sincronizada con `StockItem.backorderable`: disponible permite venta sin stock, no disponible la bloquea, sin alterar `count_on_hand`.
- [ ] Definir proveedores múltiples y prioridad de abastecimiento cuando un producto no esté disponible en un distribuidor.

## Envíos

- [ ] Crear/corregir la Zone exclusiva para Madrid en Spree.
- [ ] Crear o validar el método `Entrega local BisonTCG — Madrid` con código `BISON_LOCAL_MADRID`.
- [ ] Asociar el método a la Shipping Category física correspondiente.
- [ ] Definir tarifa fija y tiempo estimado de entrega.
- [ ] **Bug confirmado:** el método/opción de Madrid aparece también para una dirección de Lugo. La corrección pertenece a la Zone/método de Spree, no a una condición hardcodeada en Next.js.
- [ ] Probar que Madrid ofrece el método local y que fuera de Madrid no aparece.
- [ ] Confirmar que un pedido real genera correctamente su fulfillment en Spree.
- [x] Implementada lógica de back-office para guardar tracking, marcar enviado y marcar entregado sobre el fulfillment nativo de Spree.
- [x] Implementadas operaciones Correos para Preregister, Labels, Trackpub y Requests con la autenticación vigente; eliminada BoxEntry del flujo operativo.
- [ ] Configurar secretos de producción y hacer una prueba real controlada.
- [ ] Configurar una Secret API Key de Spree específica para logística con permisos de lectura/escritura de pedidos/fulfillments; la clave de catálogo devuelve 403 al intentar leer pedidos, como debe por separación de privilegios.
- [ ] Verificar en producción un pedido real con fulfillment `pending` → `shipped` → `delivered` y tracking visible en la cuenta del cliente.
- [x] Mostrar al cliente el estado/tracking del fulfillment: historial/detalle y confirmación de pedido enseñan estado traducido, número de tracking aunque no exista `tracking_url`, y enlace cuando Spree aporta URL.

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
- [x] Migrada la configuración `pnpm.overrides` / `pnpm.onlyBuiltDependencies` a `pnpm-workspace.yaml` para pnpm 10.33+, evitando que se ignore durante instalaciones.
- [x] Corregida la rama Stripe Live inalcanzable que bloqueaba el typecheck del checkout (`TS2367`).
- [x] Corregidos los valores booleanos de `allowBuilds` para que pnpm ejecute las dependencias nativas aprobadas sin terminar con `ERR_PNPM_IGNORED_BUILDS`.
- [x] Actualizadas las pruebas del layout temático y de confirmación Stripe Live; la suite completa vuelve a pasar.
- [ ] Verificar un nuevo deployment después de la corrección de seguridad y los últimos cambios.
- [ ] No fusionar la PR temporal `#1` de `puck_editor` a `main`; es solo para verificación y no debe eliminar la regla de trabajar únicamente en `puck_editor`.

### Puck
- [x] Restaurado/ajustado el editor Puck según las últimas decisiones del proyecto.
- [x] Mantener Products como bloques reales dentro de la composición de Puck, sin editor dedicado de productos.
- [x] Eliminado el flujo de edición de productos por separado.
- [x] Añadido color global desde Apariencia.
- [x] Añadida paleta semántica global (principal/secundario/superficies/textos/bordes), contraste visible en Apariencia y selector de tokens reutilizables en los campos de color de Puck sin romper hexadecimales existentes.
- [x] Añadidas utilidades Puck compartidas y mejoras responsive en hero, grids, tarjetas y showcase de producto.
- [ ] Verificar que el color global se refleja correctamente en los elementos que usan `primary`.
- [x] Preparado lector inicial de catálogo B2B de Devir con sesión persistida fuera de Git y salida JSON local.
- [x] Normalizados precios Devir que llegan como euros enteros o céntimos codificados sin separador (p. ej. `12412` → `124.12`).
- [x] Preparado dry-run de importación contra la Admin API de Spree; ahora consulta variantes por producto, propone `MATCH`/`CREATE-DRAFT`, calcula PVP y guarda un plan local sin realizar escrituras.
- [x] Revisada la autenticación B2B de Devir: el chequeo de sesión ahora prioriza señales de sesión reales (logout/customer section) antes de considerar la mera presencia del formulario de login, evitando falsos negativos de Magento.
- [x] Comprobado el fallo actual de `pnpm devir:login`: no llega a abrir Devir ni a intentar autenticar porque Codespaces no tiene servidor X/DISPLAY y el script solicita `headless: false`.
- [x] Corregido `pnpm devir:login` para que, cuando Codespaces no tenga DISPLAY, abra el navegador Devir en modo headless y exponga una interfaz web temporal para que el login se haga manualmente desde el navegador del Codespace; la sesión se guarda únicamente tras validar la autenticación.
- [x] Corregida la apertura del puerto 8787 desde Codespaces: si GitHub abre la raíz sin el token temporal, el servidor redirige automáticamente a la URL autenticada en lugar de responder `Not found`; las rutas de control siguen exigiendo token.
- [x] Ejecutado `pnpm devir:login`; login real completado y sesión persistente guardada fuera de Git.
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
- [ ] Integrar Correos API después de estabilizar el método local y obtener contrato/credenciales.


### Catálogo / revisión humana / correo transaccional — 22 Sep 2026
- [x] Corregido el falso 404 de productos causado por `expand=categories` devolviendo HTTP 500 en Spree; las PDP ya no solicitan esa expansión en la carga principal.
- [x] Los errores de Spree distintos de 404 ya no se convierten silenciosamente en `notFound()` en producto/metadata.
- [x] Scene Box y Theme Deck detectados como packs de proveedor y bloqueados para revisión manual; conservan el coste completo del pack y no se publican automáticamente.
- [x] Los productos que requieren intervención humana quedan en `draft`, fuera del canal público y marcados con `REVISION-HUMANA`.
- [x] Añadido tag administrativo `NECESITA-TU-AYUDA` para filtrar rápidamente productos que requieren decisión manual.
- [x] Añadidos campos internos `Catálogo · Necesita tu ayuda` y `Catálogo · Motivo de revisión` con explicaciones legibles en español.
- [x] Backfill completado: 97/97 productos actualmente en revisión tienen el nuevo marcador administrativo.
- [x] Los 8 Scene Box / Theme Deck actuales están incluidos en ese backfill y siguen ocultos.
- [x] Añadido transporte Gmail API para los correos transaccionales existentes de Spree (confirmación, cancelación, envío y reset de contraseña), usando OAuth2 y refresh token; no depende de ChatGPT.
- [x] Configuradas en Vercel las variables `EMAIL_PROVIDER`, `EMAIL_FROM`, `GMAIL_CLIENT_ID`, `GMAIL_CLIENT_SECRET` y `GMAIL_REFRESH_TOKEN`.
- [ ] Reintento de deploy de `main` disparado el 22 Sep 2026 tras la ventana de `build-rate-limit`; verificar que el nuevo deployment llegue a `READY`.
- [ ] Verificar Gmail en producción con una solicitud real de restablecimiento de contraseña y confirmar que el mensaje llega desde la cuenta configurada.
- [ ] Revalidar una muestra de PDP problemáticas en producción tras desplegar el fix de `categories` y revisar latencia/logs.

## Regla de mantenimiento

Después de cada edición relevante:
