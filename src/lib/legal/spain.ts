import { getStoreName } from "@/lib/store";

export interface LocalLegalPolicy {
  id: string;
  name: string;
  slug: string;
  body: string | null;
  body_html: string | null;
  local: true;
}

const LAST_UPDATED = "23 de septiembre de 2026";

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function configured(name: string): string | null {
  const value = process.env[name]?.trim();
  return value ? escapeHtml(value) : null;
}

function legalIdentity() {
  const tradeName = escapeHtml(getStoreName());
  const businessName = configured("LEGAL_BUSINESS_NAME") ?? tradeName;
  const taxId = configured("LEGAL_TAX_ID");
  const address = configured("LEGAL_REGISTERED_ADDRESS");
  const register = configured("LEGAL_REGISTER_INFO");
  const phone = configured("LEGAL_CONTACT_PHONE");
  const email =
    configured("LEGAL_CONTACT_EMAIL") ?? configured("STORE_SUPPORT_EMAIL");

  return {
    tradeName,
    businessName,
    taxId,
    address,
    register,
    phone,
    email,
  };
}

function identityHtml(): string {
  const identity = legalIdentity();

  return `
    <section>
      <h2>Quién está detrás de la tienda</h2>
      <p><strong>${identity.tradeName}</strong> es el nombre comercial utilizado en esta web.</p>
      <ul>
        <li><strong>Titular:</strong> ${identity.businessName}</li>
        ${identity.taxId ? `<li><strong>NIF/CIF:</strong> ${identity.taxId}</li>` : ""}
        ${identity.address ? `<li><strong>Domicilio:</strong> ${identity.address}</li>` : ""}
        ${identity.register ? `<li><strong>Datos registrales:</strong> ${identity.register}</li>` : ""}
        ${identity.email ? `<li><strong>Email:</strong> ${identity.email}</li>` : ""}
        ${identity.phone ? `<li><strong>Teléfono:</strong> ${identity.phone}</li>` : ""}
      </ul>
    </section>
  `;
}

function contactEmail(): string {
  return legalIdentity().email ?? "el canal de contacto indicado en la tienda";
}

const policies: Record<string, () => LocalLegalPolicy> = {
  "shipping-policy": () => ({
    id: "local-es-shipping-policy",
    name: "Envíos",
    slug: "shipping-policy",
    body: null,
    local: true,
    body_html: `
      <p><strong>Actualizado el ${LAST_UPDATED}</strong></p>
      <p>Aquí explicamos cómo preparamos y enviamos los pedidos de ${legalIdentity().tradeName}. Si en el checkout aparece un plazo o una condición más concreta para tu pedido, esa es la referencia que debes tener en cuenta.</p>

      <h2>Preparación del pedido</h2>
      <p>El plazo de preparación puede variar según el producto. Cuando un artículo necesite más tiempo, mostraremos la información disponible en su ficha, durante la compra o en la confirmación del pedido.</p>
      <p>En preventas y reservas mostramos la mejor fecha disponible en ese momento. Las fechas de lanzamiento pueden cambiar. Si el cambio es importante, te avisaremos para que puedas decidir si mantienes o cancelas la parte afectada del pedido.</p>

      <h2>Entrega</h2>
      <p>Salvo que se indique otra cosa antes de comprar —por ejemplo, en una preventa—, los pedidos se entregarán sin demora indebida y dentro del plazo legal máximo aplicable.</p>
      <p>Si un pedido mezcla artículos con plazos distintos, podremos esperar a tenerlo completo o hacer envíos separados cuando tenga sentido y no suponga un coste extra no aceptado por ti.</p>

      <h2>Gastos de envío</h2>
      <p>Verás el coste antes de pagar. Depende del destino, peso, volumen y método de transporte. No añadimos después gastos que no se hayan mostrado durante la compra.</p>

      <h2>Problemas con la entrega</h2>
      <p>Si el paquete llega golpeado, falta algo o has recibido un artículo distinto, escríbenos cuanto antes a <strong>${contactEmail()}</strong>. Si puedes, adjunta fotos del embalaje y del producto: suelen acelerar bastante la gestión.</p>
      <p>No condicionamos tus derechos a avisar en 24 o 48 horas. Cuando el problema sea responsabilidad nuestra o exista una falta de conformidad, asumiremos los costes que legalmente correspondan.</p>

      <h2>Dirección incorrecta, rechazo o entrega fallida</h2>
      <p>Revisa bien la dirección antes de confirmar el pedido. Si el transportista no puede entregar por una dirección incorrecta facilitada por el cliente, por ausencia reiterada o por no atender los avisos razonables de entrega, podremos exigir el coste directo y acreditado de un nuevo envío si quieres que volvamos a expedir el pedido.</p>
      <p>El rechazo del paquete o la falta de recogida no equivalen, por sí solos, a una declaración inequívoca de desistimiento. Si el paquete vuelve a nosotros y quieres desistir, comunícanoslo expresamente. En ese caso aplicaremos las reglas de desistimiento y, cuando proceda, los costes directos de devolución que legalmente correspondan.</p>
    `,
  }),

  "returns-policy": () => ({
    id: "local-es-returns-policy",
    name: "Devoluciones y garantía",
    slug: "returns-policy",
    body: null,
    local: true,
    body_html: `
      <p><strong>Actualizado el ${LAST_UPDATED}</strong></p>
      <p>Si quieres devolver un pedido o ha llegado con algún problema, escríbenos a <strong>${contactEmail()}</strong> con el número de pedido.</p>

      <h2>Derecho legal de desistimiento: 14 días</h2>
      <p>En las compras online realizadas por consumidores existe, con carácter general, un plazo de <strong>14 días naturales</strong> para comunicar el desistimiento sin necesidad de indicar un motivo. En la venta de bienes, el plazo empieza normalmente cuando tú o un tercero indicado por ti adquiere la posesión material del pedido, con las reglas especiales que legalmente correspondan cuando haya varios bienes o entregas.</p>
      <p>Para ejercerlo basta con enviarnos, antes de que venza el plazo, una declaración inequívoca de que deseas desistir. Puedes escribir a <strong>${contactEmail()}</strong> o utilizar cualquier función de desistimiento online que tengamos habilitada en la tienda.</p>
      <p>Después de comunicarnos el desistimiento, debes devolver los bienes sin demora indebida y, en todo caso, dentro de los <strong>14 días naturales</strong> siguientes.</p>

      <h2>Coste de la devolución</h2>
      <p>En un desistimiento por cambio de opinión, el <strong>coste directo de devolver los bienes corre a cargo del cliente</strong>. Si te ofrecemos de forma opcional una etiqueta o servicio de devolución prepagado y decides utilizarlo, podremos descontar de la cantidad a reembolsar su coste directo previamente informado. Esta regla no se aplica cuando la devolución se deba a un producto incorrecto, una falta de conformidad o una incidencia de la que legalmente debamos hacernos cargo.</p>
      <p>No cobramos gastos de gestión, reposición ni penalizaciones por ejercer el derecho legal de desistimiento.</p>

      <h2>Importe y forma del reembolso</h2>
      <p>Reembolsaremos las cantidades que legalmente correspondan utilizando el mismo medio de pago empleado en la compra, salvo que acuerdes expresamente otro medio que no te genere gastos.</p>
      <p>El reembolso incluye, cuando proceda, el coste de la modalidad de entrega ordinaria menos costosa que ofreciéramos al realizar la compra. Si elegiste expresamente un método de entrega más caro —por ejemplo, urgente o premium—, no estamos obligados a devolver la diferencia respecto del envío ordinario más económico.</p>
      <p>Podremos retener el reembolso hasta haber recibido los bienes o hasta que nos facilites una prueba suficiente de su devolución, según qué ocurra primero.</p>

      <h2>Estado del producto y disminución de valor</h2>
      <p>Puedes examinar el producto del modo razonablemente necesario para comprobar su naturaleza, características y funcionamiento. Si lo manipulas más allá de lo necesario y esa manipulación causa una disminución real de valor, podrás ser responsable de dicha pérdida de valor.</p>
      <p>La disminución se valorará de forma individual y atendiendo al estado real del artículo; no aplicamos automáticamente un porcentaje fijo. La falta de accesorios, componentes, manuales, regalos incluidos o embalajes que formen parte del valor comercial del producto podrá tenerse en cuenta únicamente en la medida en que produzca una depreciación real.</p>

      <h2>TCG, sobres, cajas, displays y otros coleccionables precintados</h2>
      <p>En determinados productos coleccionables —especialmente sobres, cajas, displays y productos TCG de contenido aleatorio— la condición de <strong>nuevo, íntegro y sellado</strong> constituye una característica esencial del producto y de su valor comercial. El precinto permite acreditar que el contenido permanece en la condición original suministrada por el fabricante o distribuidor. Una vez roto, ya no podemos verificar de forma fiable que el contenido permanezca íntegro, completo y sin selección, sustitución o manipulación, por lo que el artículo deja de ser comercializable por nosotros como el mismo producto nuevo y sellado.</p>
      <p>Abrir ese tipo de producto excede normalmente de la manipulación necesaria para comprobar externamente su naturaleza y características. Cuando la apertura o manipulación produzca una pérdida objetiva de valor, el consumidor responderá de esa disminución en los términos legalmente previstos. <strong>Si la pérdida de valor es total y acreditable porque el artículo abierto carece de un mercado razonable de reventa para nosotros como el producto originalmente contratado, la depreciación podrá alcanzar el 100 % del valor del artículo y, por tanto, el importe a reembolsar por ese artículo podrá ser de 0 €.</strong> No se trata de una penalización fija: se atenderá al tipo de producto, su estado y la pérdida de valor efectivamente producida.</p>
      <p>La apertura de un TCG no convierte por sí sola en defecto su contenido aleatorio. Salvo que la ficha del producto prometa expresamente otra cosa, no garantizamos cartas concretas, ratios de aparición, valor de mercado, posibilidades de reventa, una determinada calificación de grading ni resultados aleatorios del contenido.</p>

      <h2>Devoluciones voluntarias después del plazo legal</h2>
      <p>Salvo que una promoción o ficha de producto indique expresamente lo contrario, <strong>no ofrecemos un derecho contractual general de devolución por cambio de opinión una vez finalizado el plazo legal de desistimiento</strong>.</p>
      <p>Si excepcionalmente aceptamos una devolución fuera de ese plazo, podremos fijar para esa devolución voluntaria condiciones específicas —por ejemplo, crédito en tienda—. Esas concesiones comerciales no reducen ni sustituyen los derechos legales que correspondan al consumidor.</p>

      <h2>Producto equivocado, dañado o con falta de conformidad</h2>
      <p>Si te enviamos un producto distinto, llega dañado por una incidencia atribuible a la preparación o al transporte que gestionamos, o existe una falta de conformidad, los gastos necesarios para aplicar la solución legal que corresponda no corren por tu cuenta.</p>
      <p>En un producto coleccionable valoraremos la conformidad según lo que efectivamente se anunció y contrató: edición, idioma, contenido declarado, estado, precinto y demás características objetivas. Las variaciones normales de fabricación o el resultado aleatorio propio del producto no constituyen por sí solos una falta de conformidad.</p>

      <h2>Garantía legal</h2>
      <p>Los bienes nuevos vendidos a consumidores están sujetos al régimen legal de conformidad vigente en España. Con carácter general, el vendedor responde de las faltas de conformidad que se manifiesten dentro del plazo legal de <strong>tres años desde la entrega</strong>.</p>
      <p>La garantía cubre defectos o incumplimientos respecto de lo contratado; no funciona como un seguro sobre el contenido aleatorio de un producto, su valor futuro, una futura nota de grading ni daños o desgaste producidos después por apertura, uso, conservación o manipulación.</p>
      <p>Salvo que se indique expresamente en la ficha de un producto, no ofrecemos una garantía comercial adicional distinta de los derechos que reconoce la ley.</p>

      <h2>Excepciones al desistimiento</h2>
      <p>Solo aplicaremos las excepciones legalmente previstas. Entre ellas pueden encontrarse determinados bienes confeccionados conforme a las especificaciones del consumidor o claramente personalizados, bienes que puedan deteriorarse o caducar con rapidez y determinados bienes precintados que, por razones de salud o higiene, no sean aptos para ser devueltos después de haber sido desprecintados.</p>
      <p>No consideramos automáticamente excluido del desistimiento un juego de mesa, manga, TCG u otro artículo por el simple hecho de venir precintado. Cuando no exista una excepción legal, lo que podrá valorarse es la disminución real de valor causada por una manipulación superior a la necesaria para examinar el artículo.</p>

      <h2>Modelo de comunicación de desistimiento</h2>
      <p>No es obligatorio utilizar este modelo, pero puedes copiarlo y enviarlo a <strong>${contactEmail()}</strong>:</p>
      <blockquote>
        <p>A la atención de <strong>${legalIdentity().businessName}</strong>${legalIdentity().address ? `, ${legalIdentity().address}` : ""}.</p>
        <p>Por la presente comunico que desisto del contrato de venta relativo al siguiente bien o pedido: [producto / número de pedido].</p>
        <p>Pedido el / recibido el: [fecha].</p>
        <p>Nombre del consumidor: [nombre].</p>
        <p>Domicilio del consumidor: [domicilio].</p>
        <p>Fecha: [fecha].</p>
      </blockquote>
    `,
  }),

  "privacy-policy": () => ({
    id: "local-es-privacy-policy",
    name: "Privacidad",
    slug: "privacy-policy",
    body: null,
    local: true,
    body_html: `
      <p><strong>Actualizado el ${LAST_UPDATED}</strong></p>
      ${identityHtml()}

      <h2>Qué datos usamos</h2>
      <p>Para poder vender y enviar pedidos necesitamos algunos datos básicos: nombre, datos de contacto, direcciones, información del pedido y las comunicaciones que mantengas con atención al cliente. También tratamos la información técnica necesaria para mantener la web segura y funcionando correctamente.</p>
      <p>Los datos completos de tarjeta los gestiona el proveedor de pagos mediante su propia infraestructura. No necesitamos almacenarlos en la tienda para procesar un pago normal.</p>

      <h2>Para qué los usamos</h2>
      <p>Usamos tus datos para gestionar compras, cobros, facturas, entregas, devoluciones, cuentas de cliente y soporte. También podemos tratarlos cuando sea necesario para cumplir obligaciones fiscales o legales, prevenir fraude y defender reclamaciones.</p>
      <p>Las comunicaciones comerciales o las cookies no necesarias se basarán en consentimiento cuando la ley lo exija. Puedes retirarlo en cualquier momento.</p>

      <h2>Con quién se comparten</h2>
      <p>Solo damos acceso a los datos cuando hace falta para prestar el servicio o cumplir una obligación: alojamiento e infraestructura, plataforma de comercio electrónico, pagos, transporte, correo transaccional, soporte, prevención de fraude y, cuando corresponda, herramientas de analítica.</p>
      <p>Si un proveedor trata datos fuera del Espacio Económico Europeo, utilizaremos las garantías previstas por la normativa aplicable.</p>

      <h2>Cuánto tiempo los guardamos</h2>
      <p>Conservamos la información durante el tiempo necesario para gestionar la relación contigo y, después, durante los plazos que puedan exigir las obligaciones fiscales, contables, de consumo o la defensa de posibles reclamaciones.</p>

      <h2>Tus derechos</h2>
      <p>Puedes solicitar acceso, rectificación, supresión, oposición, limitación o portabilidad cuando correspondan, y retirar un consentimiento que hayas dado. Para hacerlo, escribe a <strong>${contactEmail()}</strong>.</p>
      <p>Si consideras que tus datos no se están tratando correctamente, también puedes reclamar ante la Agencia Española de Protección de Datos.</p>

      <h2>Cookies</h2>
      <p>Utilizamos las tecnologías necesarias para funciones como sesión, carrito, seguridad o preferencias básicas. Las cookies de analítica, personalización o publicidad que necesiten consentimiento permanecerán desactivadas hasta que las aceptes.</p>
      <p>Cuando aparezca el panel de consentimiento, podrás aceptar o rechazar las cookies no necesarias y cambiar después tu decisión desde las preferencias disponibles en la web.</p>
    `,
  }),

  "terms-of-service": () => ({
    id: "local-es-terms-of-service",
    name: "Aviso legal y condiciones de compra",
    slug: "terms-of-service",
    body: null,
    local: true,
    body_html: `
      <p><strong>Actualizado el ${LAST_UPDATED}</strong></p>
      ${identityHtml()}

      <h2>Ámbito de estas condiciones</h2>
      <p>Estas condiciones se aplican a las compras realizadas por consumidores en ${legalIdentity().tradeName}. El producto, el precio, la disponibilidad, el envío y las demás condiciones concretas que se muestran antes de confirmar el pedido forman parte del contrato.</p>
      <p>Los derechos reconocidos por la normativa de consumo son irrenunciables cuando resulten aplicables. Cualquier ventaja comercial adicional que podamos ofrecer se interpreta como una mejora voluntaria y no como una reducción de esos derechos.</p>

      <h2>Cómo se realiza un pedido</h2>
      <p>Añades los productos al carrito, revisas cantidades, dirección, método de envío y forma de pago y, antes de confirmar, puedes corregir los datos. El pedido se envía cuando pulsas el botón final que indica claramente que existe una obligación de pago.</p>
      <p>Después recibirás una confirmación por correo electrónico u otro soporte duradero. Conservaremos la información del pedido durante el tiempo necesario para gestionarlo y cumplir nuestras obligaciones legales.</p>

      <h2>Precios, promociones y gastos</h2>
      <p>Los precios mostrados al consumidor incluyen los impuestos que correspondan. Los gastos de envío y cualquier otro coste aplicable se muestran antes de pagar. No añadimos servicios opcionales mediante casillas premarcadas.</p>
      <p>Las promociones, cupones y descuentos estarán sujetos a las condiciones que se indiquen en cada caso. No serán acumulables cuando se informe expresamente de ello antes de la compra.</p>

      <h2>Disponibilidad y límites de compra</h2>
      <p>La disponibilidad que aparece en la tienda es la referencia para saber si un producto puede comprarse en ese momento. Algunos artículos pueden tener un plazo de preparación distinto, que se indicará cuando sea relevante.</p>
      <p>Cuando una ficha, promoción o lanzamiento establezca un límite de unidades por cliente, cuenta, domicilio o pedido, podremos cancelar y reembolsar las unidades que excedan del límite o los pedidos que, de forma razonablemente acreditada, se hayan realizado para eludirlo.</p>
      <p>Si después de comprar se produce una incidencia real de disponibilidad y no podemos servir un artículo, te informaremos y devolveremos las cantidades correspondientes sin demora indebida cuando proceda. No sustituiremos un producto por otro sin tu consentimiento.</p>

      <h2>Preventas y fechas de lanzamiento</h2>
      <p>Las fechas comunicadas por fabricantes, editoriales o distribuidores en preventas son estimaciones salvo que indiquemos expresamente que una fecha concreta constituye un compromiso de entrega. Esas fechas pueden cambiar por decisiones o incidencias de terceros.</p>
      <p>Si un cambio afecta de forma relevante al plazo de entrega, te informaremos y respetaremos los derechos de cancelación o resolución que legalmente correspondan. Una modificación razonable de la fecha estimada de lanzamiento no altera por sí sola las características del producto reservado.</p>

      <h2>Errores manifiestos</h2>
      <p>Tomamos medidas razonables para evitar errores de precio, descripción o disponibilidad. Si detectamos un error material y manifiesto que razonablemente resulte reconocible como tal, te contactaremos para aclararlo y, cuando la normativa lo permita, ofrecer la corrección o cancelar la parte afectada con reembolso íntegro de las cantidades cobradas. Esta cláusula no nos permite modificar unilateralmente una compra válida ni excluir derechos legales.</p>

      <h2>Pago, autorización y prevención del fraude</h2>
      <p>Los métodos de pago disponibles aparecen durante el checkout. Podemos realizar comprobaciones razonables de seguridad y prevención del fraude y, cuando exista un indicio objetivo de uso no autorizado o fraude, suspender la tramitación mientras verificamos la operación o cancelar el pedido con devolución de las cantidades cobradas cuando corresponda.</p>

      <h2>Envíos y riesgo</h2>
      <p>Los plazos, métodos y costes de entrega se detallan en la política de Envíos y en el checkout. Cuando decidamos dividir un pedido en varios envíos por razones operativas, no te cobraremos gastos adicionales que no hayas aceptado.</p>
      <p>El rechazo del paquete o la falta de recogida no constituyen por sí solos una declaración de desistimiento. Si deseas desistir, debes comunicárnoslo de forma inequívoca.</p>

      <h2>Desistimiento, devoluciones y coste de retorno</h2>
      <p>El derecho legal de desistimiento y sus excepciones se explican en nuestra política de Devoluciones y garantía. En un desistimiento por cambio de opinión, y siempre que te hayamos informado previamente, <strong>el coste directo de devolver los bienes corre a cargo del consumidor</strong>.</p>
      <p>Cuando proceda el reembolso de los gastos de entrega iniciales, la ley no obliga a devolver el sobrecoste de una modalidad de entrega más cara que la modalidad ordinaria menos costosa ofrecida. También podremos retener el reembolso hasta recibir los bienes o una prueba suficiente de su devolución, según proceda legalmente.</p>
      <p>Salvo oferta expresa en contrario, no existe un derecho comercial adicional de devolución por cambio de opinión una vez vencido el plazo legal. Las devoluciones voluntarias que aceptemos excepcionalmente podrán quedar sujetas a condiciones específicas, incluido crédito en tienda, sin afectar a derechos legales.</p>

      <h2>Productos coleccionables y contenido aleatorio</h2>
      <p>En TCG y otros coleccionables, edición, idioma, condición, contenido declarado y estado del precinto forman parte de las características objetivas de la compra cuando así se anuncien. El contenido aleatorio de sobres, cajas o productos similares no garantiza cartas, ratios, valor de mercado, reventa o grading concretos salvo promesa expresa.</p>
      <p>En productos cuyo valor comercial depende de permanecer nuevos, íntegros y sellados, el precinto aporta una garantía comercial objetiva de procedencia e integridad. Una vez abierto, no podemos verificar de forma fiable que el contenido aleatorio siga completo y sin selección, sustitución o manipulación, ni ofrecerlo de nuevo como el mismo producto sellado. Si esa pérdida objetiva de comerciabilidad determina una depreciación total y acreditable, <strong>la responsabilidad por disminución de valor podrá alcanzar el 100 % del precio de ese artículo</strong>. El cálculo atenderá al producto y estado concretos y no funcionará como una penalización fija.</p>

      <h2>Garantía legal</h2>
      <p>Los bienes vendidos a consumidores quedan sujetos al régimen legal de conformidad vigente. En productos nuevos, el plazo general de responsabilidad por faltas de conformidad es de <strong>tres años desde la entrega</strong>. Las soluciones y su orden de aplicación serán las previstas por la normativa vigente.</p>
      <p>La garantía no cubre, por sí sola, expectativas subjetivas, fluctuaciones del valor de mercado, resultados aleatorios, grading futuro ni daños posteriores derivados de una conservación, apertura o uso inadecuados.</p>

      <h2>Cuenta de cliente</h2>
      <p>Si creas una cuenta, procura que los datos sean correctos y protege tus credenciales. Podemos bloquear temporalmente una cuenta cuando existan indicios razonables de fraude o un problema de seguridad, procurando no afectar más de lo necesario a pedidos ya realizados ni a derechos legales.</p>

      <h2>Marcas, imágenes y contenidos</h2>
      <p>Las marcas, ilustraciones, fotografías y materiales de fabricantes y editoriales pertenecen a sus respectivos titulares. Los contenidos propios de la web también están protegidos por la normativa de propiedad intelectual.</p>

      <h2>Contacto y reclamaciones</h2>
      <p>Para cualquier consulta, desistimiento o reclamación puedes escribir a <strong>${contactEmail()}</strong>. Indicar el número de pedido nos ayuda a localizar el caso más rápido.</p>

      <h2>Ley aplicable</h2>
      <p>Estas condiciones se interpretan conforme a la legislación española, sin privar a un consumidor de la protección imperativa que le corresponda por su lugar de residencia. Los conflictos se resolverán ante los órganos que sean competentes conforme a la normativa aplicable.</p>
    `,
  }),
};

export function getSpanishLegalPolicy(
  slug: string,
): LocalLegalPolicy | null {
  return policies[slug]?.() ?? null;
}
