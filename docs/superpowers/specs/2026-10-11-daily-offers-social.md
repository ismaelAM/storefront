# Ofertas diarias e Instagram

El propietario autoriza implementación, revisión y publicación sin preguntas rutinarias. Esa autorización sustituye la pausa de aprobación de diseño; no autoriza crear accesos nuevos a cuentas ni compras.

Spree conserva precios y disponibilidad. La rotación existente pasa a doce ofertas: tres TCG, tres juegos de mesa/rol, tres accesorios y tres merchandising. No se incluyen libros/manga ni productos sin categoría identificada. Una categoría insuficiente queda incompleta. Se mantienen márgenes, precios manuales, stock físico y descuentos especiales del sábado.

Se generan cuatro JPEG de 1080×1350, con tres productos por categoría, usando imágenes y precios públicos actuales de las variantes seleccionadas. Plantilla fija BisonTCG sin IA. Las imágenes y texto se descargan desde `/ops/offers`, protegida con la sesión operativa existente. Ningún coste de proveedor, descuento de cuenta o secreto aparece en las imágenes.

El cliente Instagram utiliza permisos de publicación de una cuenta profesional, configuración privada y checkpoints persistentes. Una publicación diaria por cuenta: una respuesta ambigua bloquea reenvíos automáticos. No existen credenciales Instagram en Vercel; la descarga funciona independientemente y no se afirma publicación real.

Un cron diario de Vercel a las 08:00 UTC prepara imágenes y publica únicamente si Instagram está configurado. Se genera una credencial privada dedicada al cron, sin ampliar permisos de cuentas. El horario es 10:00 en verano y 09:00 en invierno en Madrid; la entrega Hobby puede ocurrir dentro de esa hora. Se documenta la conexión pendiente.
