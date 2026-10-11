# Ofertas diarias y publicaciones

Panel privado: https://www.bisontcg.com/ops/offers. Usa la misma clave de operaciones que `/ops/shipping`; la sesión dura ocho horas. Permite descargar cuatro JPEG de 1080×1350 y copiar el texto del día. No utiliza IA.

## Selección

Spree aplica las rebajas reales. Objetivo: doce productos, tres de TCG, tres juegos de mesa/rol, tres accesorios y tres merchandising. Los sábados mantienen sus descuentos especiales con el mismo reparto. Se conserva la prioridad del stock físico y la protección de márgenes/precios manuales; libros y manga permanecen excluidos. Las categorías sin suficientes ofertas válidas quedan incompletas.

La rotación usa el día de Madrid y tiene prioridad sobre los rastreos largos de proveedores. La preparación social vuelve a comprobar variante, precio público, lista diaria, etiquetas, disponibilidad y fecha. No muestra costes de compra ni descuentos personales. Si la oferta cambia, no publica el precio antiguo.

## Horario

`vercel.json` programa `/api/cron/offers` cada día a las 08:00 UTC: 10:00 en verano y 09:00 en invierno en Madrid. En Hobby puede ejecutarse dentro de esa hora. `CRON_SECRET` protege la llamada; la credencial está solo en producción. Si falta conectar Instagram, prepara imágenes para descarga. Un reparto incompleto impide el carrusel automático, aunque se puedan descargar categorías disponibles desde el panel.

Las imágenes públicas de publicación se guardan en el bucket `daily-offers` con fecha y hash inmutable. Solo contienen catálogo público. La tabla `social_offer_publications` y sus checkpoints son privados y solo el servidor puede escribirlos. Cada cuenta publica como máximo una vez al día. Ante una respuesta ambigua se bloquean reenvíos; primero debe comprobarse Instagram.

## Conectar Instagram una vez

**Pendiente y aplazado por el propietario el 11/10/2026:** conectar la cuenta `@bisonTCG` después de terminar de listar la tienda en Google. Hasta retomar esta tarea, mantener la preparación de imágenes y las descargas manuales sin activar publicaciones automáticas. Registro de pendientes en [TODO.md](TODO.md).

La cuenta debe ser profesional. La integración implementada utiliza Instagram Login. Tras autorizar la aplicación de Meta y comprobar su versión/contrato de publicación, configurar **solo en producción** `INSTAGRAM_ACCOUNT_ID`, `INSTAGRAM_ACCESS_TOKEN` y `INSTAGRAM_API_VERSION`; nunca con prefijo `NEXT_PUBLIC_`. Mantener/renovar el token según las condiciones de Meta. Detalles y fuentes primarias en [docs/social-instagram-api.md](docs/social-instagram-api.md).

Sin estas credenciales, el botón de publicación está desactivado y no se envía nada a Instagram. No se ha conectado ni publicado en una cuenta de Instagram durante la implementación.

## Recuperación

Una preparación fallida antes del envío puede reintentarse con el mismo snapshot y containers. Cambiar contenido o containers caducados requiere una revisión privada y reiniciar únicamente una preparación que nunca llegó a intentar publicar. No borrar `publishAttempted` para forzar un reenvío. Las descargas del panel consultan los precios actuales independientemente de estos registros.
