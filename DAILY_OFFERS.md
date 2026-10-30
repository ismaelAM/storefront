# Ofertas diarias y publicaciones

Panel privado: https://www.bisontcg.com/ops/offers. Usa la misma clave de operaciones que `/ops/shipping`; la sesión dura ocho horas. Permite descargar cuatro JPEG de 1080×1350 y copiar el texto del día. No utiliza IA.

## Selección

Spree aplica las rebajas reales. Objetivo: doce productos, tres de TCG, tres juegos de mesa/rol, tres accesorios y tres merchandising. Los sábados mantienen sus descuentos especiales con el mismo reparto. Se conserva la prioridad del stock físico y la protección de márgenes/precios manuales; libros y manga permanecen excluidos. Las categorías sin suficientes ofertas válidas quedan incompletas.

La rotación usa el día de Madrid y tiene prioridad sobre los rastreos largos de proveedores. La preparación social vuelve a comprobar variante, precio público, lista diaria, etiquetas, disponibilidad y fecha. No muestra costes de compra ni descuentos personales. Si la oferta cambia, no publica el precio antiguo.

## Horario

`vercel.json` programa `/api/cron/offers` cada día a las 04:00 UTC: 06:00 en verano y 05:00 en invierno en Madrid. En Hobby puede ejecutarse dentro de esa hora; se deja margen para preparar las imágenes antes del correo de las 08:00. `CRON_SECRET` protege la llamada; la credencial está solo en producción. Si falta conectar Instagram, prepara imágenes para descarga. Un reparto incompleto impide el carrusel automático, aunque se puedan descargar categorías disponibles desde el panel.

El propietario ha autorizado el correo con las cuatro imágenes a `ayuda@bisontcg.com`. Una automatización de ChatGPT usa Gmail y consultas de solo lectura a Supabase, a las **08:00 Europe/Madrid**, desde el 13/10/2026. Adjunta las imágenes del día y sus enlaces; comprueba los correos enviados para evitar duplicados. Si faltan imágenes actuales, informa del fallo sin enviar fotos de otro día. Instagram quedó conectado el 30/10/2026. El registro privado confirma la publicación automática del carrusel del 30/10 a las **05:01 Madrid**, con media ID `17980210826918766`. No se lanzó una publicación de prueba adicional.

Las imágenes públicas de publicación se guardan en el bucket `daily-offers` con fecha y hash inmutable. Solo contienen catálogo público. La tabla `social_offer_publications` y sus checkpoints son privados y solo el servidor puede escribirlos. Cada cuenta publica como máximo una vez al día. Ante una respuesta ambigua se bloquean reenvíos; primero debe comprobarse Instagram.

## Conectar Instagram una vez

La cuenta debe ser profesional. La integración implementada utiliza Instagram Login. Tras autorizar la aplicación de Meta y comprobar su versión/contrato de publicación, configurar **solo en producción** `INSTAGRAM_ACCOUNT_ID`, `INSTAGRAM_ACCESS_TOKEN` y `INSTAGRAM_API_VERSION`; nunca con prefijo `NEXT_PUBLIC_`. Mantener/renovar el token según las condiciones de Meta. Detalles y fuentes primarias en [docs/social-instagram-api.md](docs/social-instagram-api.md).

Configuración comprobada el 30/10/2026: perfil `bisontcg`, Instagram Login, API `v26.0`, permisos básicos y de publicación; las tres variables se guardaron únicamente en producción. El token actual caduca el **29/12/2026 a las 00:51 Madrid**: renovar antes de esa fecha. No hay renovación automática implementada.

El código revisado añade al panel «Comprobar conexión con Instagram», una consulta de identidad sin publicar, y verifica la cuenta antes de preparar/publicar. Una consulta de identidad correcta no acredita por sí sola el permiso de publicación. Sin credenciales válidas no se publica.

## Recuperación

Una preparación fallida antes del envío puede reintentarse con el mismo snapshot y containers. Cambiar contenido o containers caducados requiere una revisión privada y reiniciar únicamente una preparación que nunca llegó a intentar publicar. No borrar `publishAttempted` para forzar un reenvío. Las descargas del panel consultan los precios actuales independientemente de estos registros.
