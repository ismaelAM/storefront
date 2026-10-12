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

## Alta en Search Console: pendiente

El 12/10/2026 no se pudo acceder a Search Console desde el navegador remoto: las dos navegaciones acabaron en timeout antes de devolver una página. **No se ha creado ni verificado una propiedad, enviado un sitemap ni solicitado indexación en Google.** El acceso existente de Gmail no equivale a acceso a Search Console.

Para completar el alta:

1. Acceder a Google Search Console con la cuenta propietaria de la tienda y añadir una propiedad de **prefijo de URL** para `https://www.bisontcg.com/`.
2. Elegir la verificación por etiqueta HTML. El valor `content` de la etiqueta `google-site-verification` es un token público de verificación de la web.
3. Configurar ese valor exacto en `GOOGLE_SITE_VERIFICATION` en Vercel y desplegar. El código ya incluye la etiqueta cuando existe un valor configurado; nunca se publica un token ficticio.
4. Comprobar la etiqueta pública y pulsar Verificar en Search Console.
5. En Sitemaps, enviar `https://www.bisontcg.com/sitemap/0.xml`. Si el catálogo crece, `robots.txt` enumera los demás archivos válidos. La ruta actual no es `/sitemap.xml`.
6. Inspeccionar la home y una categoría/producto representativos, solicitar indexación y observar errores/cobertura. La solicitud y el sitemap no garantizan indexación inmediata.

La propiedad de dominio completa es una alternativa con verificación DNS. No modificar DNS ni añadir un registro de Google sin el valor exacto emitido para la cuenta propietaria.

## Límites y mejoras posteriores

- La raíz `/` conserva la negociación y redirección existente hacia la home localizada. Aunque WebSite ahora declara el origen correcto, el requisito estricto de Google para controlar el nombre del sitio exige markup en la URI raíz; no se ha rediseñado el enrutamiento para ello.
- ProductGroup completo requiere URLs que seleccionen realmente cada variante; ahora se describe la oferta inicial visible, sin fingir esos enlaces.
- Costes/plazos de envío y condiciones detalladas de devolución no se fijan en el schema: el checkout y las políticas públicas son la referencia real. El enlace a la política de devoluciones sí está disponible.
- Registrar una ficha en Maps o activar Merchant Center son tareas distintas del alta del sitio en Search Console.

Fuentes primarias: [sitemaps](https://developers.google.com/search/docs/crawling-indexing/sitemaps/build-sitemap), [productos](https://developers.google.com/search/docs/appearance/structured-data/merchant-listing), [organización](https://developers.google.com/search/docs/appearance/structured-data/organization), [devoluciones](https://developers.google.com/search/docs/appearance/structured-data/return-policy), [nombre del sitio](https://developers.google.com/search/docs/appearance/site-names) y [verificación de propiedad](https://support.google.com/webmasters/answer/9008080).
