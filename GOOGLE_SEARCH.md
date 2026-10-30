# Google y SEO de BisonTCG

Dominio público preferido: **https://www.bisontcg.com**. El dominio sin `www` redirige a este destino; canonical, hreflang, Open Graph y sitemap deben usar el destino final.

## Preparación de la web

- Títulos de página con la marca BisonTCG, descripción de tienda y descripciones localizadas de categorías.
- Imagen de marca para compartir enlaces, 1200×630; favicon e iconos con el logo real. Se regeneran sin IA con `node scripts/render-brand-assets.mjs`, desde `public/bison-brand-logo.webp` y la fuente Geist con licencia OFL.
- Metadatos de producto y Offer con precio y disponibilidad de la variante inicial que muestra Spree. No se inventan valoraciones, identificadores, fechas de descuento ni promesas de envío. GTIN/EAN solo proceden de campos explícitos validados; ISBN validado utiliza los tipos Product y Book.
- OnlineStore con logo resuelto por el mismo mecanismo de la tienda, contacto configurado y enlace real a la política de devoluciones. WebSite usa la URL del origen.
- Sitemap con categorías públicas de nivel superior y productos. Las traducciones que Spree sustituye por el contenido de otro idioma no se anuncian como páginas canónicas distintas. Se comparan los mismos campos traducidos que en los metadatos, por ID estable y Market.
- Carrito, cuenta y todo el grupo de checkout tienen noindex. Se permite leer esa directiva a los rastreadores; los controles de acceso a información privada siguen en servidor.

Los cambios de código y configuración pública están desplegados en producción mediante [PR86](https://github.com/ismaelAM/storefront/pull/86), main `808d5254f6eab801dfd4b3cd487b2b397372ea2b`, deployment READY `dpl_FB5SLqTY6v6gtPxrvrpmMwquGbAX`. CI verde: 812 pruebas/80 archivos, TypeScript, lint, paridad y regresiones de bots/PPR con Turbopack y Webpack. Checkout E2E se saltó por falta de claves de prueba; no hubo compra real.

Comprobación pública Googlebot: home, categoría, producto, carrito, robots, imagen/iconos y sitemap devolvieron 200; canonical al dominio final, marca y noindex privados correctos. Sitemap 2321 URLs únicas, siete categorías principales y sin producto inglés duplicado. Home y política de devoluciones también 200 con InspectionTool. La generación del sitemap tarda 75 s en primera lectura y 53 s en segunda: optimización pendiente, aunque ambas respuestas fueron válidas. Los índices comparativos se cachean en bloques de hasta 10.000 recursos y guardia de tamaño 1,9 MB.

## Search Console: comprobado el 30/10/2026

La propiedad de prefijo `https://www.bisontcg.com/` ya existía y se comprobó con la cuenta propietaria. No fue necesario crear otra propiedad, cambiar DNS ni configurar un nuevo token de verificación.

- Sitemap `/sitemap/0.xml`: enviado el **13/10**, última lectura **26/10**, estado **Correcto**, 2378 URLs descubiertas.
- Informe de indexación, actualizado el **23/10**: **325 páginas indexadas y 43 excluidas**. Es información de Google con retraso, no una lectura en tiempo real.
- Exclusiones: 36 alternativas con canonical correcto, cuatro con otro error 4xx, dos noindex y una duplicada sin canonical seleccionada por el usuario. Cero errores 5xx en ese informe.
- Las cuatro muestras 4xx históricas son `/es/es/c/juegos-de-mesa`, `/es/es/c/rol/rol-otros`, `/es/en` y `/`. Revisar su respuesta actual antes de pedir validación; una categoría retirada puede conservar un 404 correcto.

Las alternativas con canonical y las páginas privadas noindex pueden ser exclusiones deliberadas. No retirar estas protecciones para aumentar el contador. Search Console no acredita una cuenta activa de Merchant Center ni garantiza indexación inmediata.

## Límites y mejoras posteriores

- La raíz `/` conserva la negociación y redirección existente hacia la home localizada. Aunque WebSite ahora declara el origen correcto, el requisito estricto de Google para controlar el nombre del sitio exige markup en la URI raíz; no se ha rediseñado el enrutamiento para ello.
- ProductGroup completo requiere URLs que seleccionen realmente cada variante; ahora se describe la oferta inicial visible, sin fingir esos enlaces.
- Costes/plazos de envío y condiciones detalladas de devolución no se fijan en el schema: el checkout y las políticas públicas son la referencia real. El enlace a la política de devoluciones sí está disponible.
- Registrar una ficha en Maps o activar Merchant Center son tareas distintas del alta del sitio en Search Console.

Fuentes primarias: [sitemaps](https://developers.google.com/search/docs/crawling-indexing/sitemaps/build-sitemap), [productos](https://developers.google.com/search/docs/appearance/structured-data/merchant-listing), [organización](https://developers.google.com/search/docs/appearance/structured-data/organization), [devoluciones](https://developers.google.com/search/docs/appearance/structured-data/return-policy), [nombre del sitio](https://developers.google.com/search/docs/appearance/site-names) y [verificación de propiedad](https://support.google.com/webmasters/answer/9008080).
