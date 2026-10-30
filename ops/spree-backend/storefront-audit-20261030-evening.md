# Revisión de tienda y ofertas —30/10/2026

## Cambios solicitados

- Tarkir Dragonstorm, caja de30 sobres en español, SKU5010996290557: seis unidades ya migradas. Base153,95→139,99€. Se conservaron cantidades y mapping canónico; se corrigió el título cortado. Dos tarifas anteriores de144,99€ se retiraron mediante borrado recuperable de Spree. Ahora physical_only, sin backorder ni preventa.
- Oferta rotativa: doce productos, tres por categoría. Se incluyen variantes canónicas con stock propio real aunque no exista proveedor ni baseline automático. Los PVP manuales solo entran por la autorización exacta de stock propio, en familias con descuento expresamente limitado.
- Máximo3% en precons Commander y10€ en cajas MTG/coleccionista/Yugioh, también los sábados. Base EUR real, sin descuentos acumulados, redondeo al céntimo hacia arriba. Se conserva el suelo de contribución si hay coste conocido; un coste nativo en otra moneda no se interpreta como EUR.
- No se fuerza otra publicación de Instagram: la del30/10 ya estaba publicada. Su snapshot histórico se conserva; la tarifa de Tarkir más cara ya no puede prevalecer sobre139,99€.

## Evidencia

- Antes de modificar: Edge devir-sync v158 coincidía exactamente con sus diez archivos de repositorio. Rama específica basada en8f31460; no merge a main.
- Baseline1084 pruebas; suite final1094 pruebas/109 archivos y TypeScript pasan. Regresiones nuevas observadas fallar antes del cambio. Biome de archivos aplicables y diff check pasan.
- Revisión independiente: sin incidencias Critical/Important. Nota menor pendiente: fixtures explícitas para unidades reservadas, cambio posterior del precio autorizado y decisión canónica de revisión.
- Se leyeron seis productos/variantes reales desde Admin, y se ejecutó su rotación local sin red ni escrituras externas. Los tres puestos TCG quedaron ocupados por stock físico. Ejemplos calculados: Lorwyn139,99→129,99€; Science39,99→38,80€; Mutant109,99→106,70€; Hail/Scrappy59,99→58,20€. Son simulaciones, no promociones publicadas. Tarkir quedó fuera por el suelo de contribución, conservando su base139,99€.
- Navegador público: Tarkir139,99€, imagen correcta, búsqueda correcta y carrito con una unidad/subtotal139,99€. Se retiró la unidad de prueba y el carrito quedó vacío. No se pagó ni se envió ningún pedido.
- Portada y tarjetas con imágenes comprobadas. La caché de catálogo se revalida a30s y expira a120s; una portada previamente abierta conservaba temporalmente el dato anterior.

## Pendientes encontrados

-2364 registros activos, cero sin imagen principal;772 carecen de PVP base EUR positivo. Los772 conservan mapping canónico, ninguno tiene baseline automático.770 retienen costes históricos de TCGFactory y dos no tienen oferta seleccionada. Las770 referencias de proveedor están caducadas:612 preventas y158 disponibles en el último dato, cero frescas. No se copian costes históricos a un PVP nuevo ni se inventan precios.
- Esos registros sin PVP conservaban770 flags de backorder y613 de preventa, sin stock propio. Se han desactivado esos indicadores en lotes limitados, comprobando antes de cada escritura que siguen sin precio EUR y sin unidades físicas. Cero flags de backorder/preventa en las772 variantes después de la operación. Se guardaron los valores previos en metadata de auditoría; no se modificaron cantidades, pedidos, precios ni mappings. El modo canónico supplier_or_physical se conserva para que un refresco futuro con PVP y aprovisionamiento válidos pueda restablecer su venta.
- Los registros de frontend muestran errores500 de Spree en fichas y sitemap, con ejemplos recientes el30/10. Algunas referencias afectadas sí tienen PVP base; no se atribuye el error a los772 registros sin precio. El conector devuelve403 al consultar logs del backend y404 para su deployment histórico; no se considera esto ausencia de errores ni prueba de caída de la tienda. No hay CLI autenticada disponible. El diagnóstico interno del backend queda pendiente.
- No se acredita una compra pagada, envío/recogida, correo transaccional ni la selección efectiva del día siguiente. La suficiencia de doce ofertas sigue dependiendo de que haya tres candidatos seguros por categoría.

## Publicación

Solo es necesario actualizar la Edge Function compartida de catálogo; frontend y backend Rails no requieren un nuevo build para esta corrección. La rama deshabilita previews automáticos para evitar launches duplicados. Se conservan cron, locks, checkpoints, workers apagados y credenciales existentes.

Edge Function publicada: devir-sync v159, bundle1814fe2261ab8aa7e10cff50fcfaec4c523dc6a010ef28c66dbeb7aabdf32711. Se descargaron sus diez archivos y coinciden con el código local verificado. Se mantuvo verify_jwt=false y la autenticación propia existente, sin cambios de credenciales ni permisos.

Retoque visual pendiente: la categoría MTG muestra dos filtros llamados idioma, procedentes de tipos de opción distintos. No se fusionan por etiqueta porque podría cambiar qué idiomas/productos selecciona el filtro. La categoría carga, tiene scroll infinito y muestra25 productos; la búsqueda de Tarkir muestra139,99€.
