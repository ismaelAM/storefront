import { getStoreName } from "@/lib/store";

export interface LocalLegalPolicy {
  id: string;
  name: string;
  slug: string;
  body: string | null;
  body_html: string | null;
  local: true;
}

const LAST_UPDATED = "21 de septiembre de 2026";

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

      <h2>Dirección incorrecta o entrega fallida</h2>
      <p>Revisa bien la dirección antes de confirmar el pedido. Si el transportista no puede entregar por una dirección incorrecta facilitada por el cliente o por no atender los intentos de entrega, podremos cobrar el coste razonable de un nuevo envío, informándolo antes.</p>
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
      <p>Si quieres devolver un pedido o ha llegado con algún problema, escríbenos a <strong>${contactEmail()}</strong> con el número de pedido. Intentaremos resolverlo de la forma más sencilla posible.</p>

      <h2>Devoluciones por cambio de opinión</h2>
      <p>En compras online, el consumidor dispone con carácter general de <strong>14 días naturales</strong> desde la recepción para comunicar que desiste de la compra, sin necesidad de dar un motivo.</p>
      <p>Después de avisarnos, los artículos deben enviarse de vuelta sin demora indebida y dentro del plazo legal. En un desistimiento voluntario, el coste directo de la devolución corre a cargo del cliente salvo que indiquemos expresamente lo contrario.</p>
      <p>Reembolsaremos las cantidades que correspondan por ley utilizando, salvo acuerdo distinto, el mismo medio de pago empleado en la compra. Podemos esperar a recibir los bienes o a que nos facilites una prueba de envío antes de efectuar el reembolso.</p>

      <h2>TCG, sobres, cajas y otros productos precintados</h2>
      <p>En los productos coleccionables el precinto forma parte importante de su estado y de su valor. Si vas a ejercer el desistimiento, lo recomendable es devolverlos cerrados, completos y sin manipular.</p>
      <p>Abrir una caja, un sobre, un display u otro producto sellado puede reducir de forma muy importante su valor comercial. Si la manipulación realizada va más allá de lo necesario para comprobar el producto, podremos tener en cuenta esa pérdida de valor al tramitar el desistimiento, en los términos permitidos por la normativa de consumo.</p>
      <p>La apertura de un TCG no convierte por sí sola en defecto el contenido aleatorio del producto. No podemos garantizar cartas concretas, ratios de aparición, valor de mercado, posibilidades de reventa, una determinada nota de grading ni resultados que el fabricante no haya prometido expresamente.</p>

      <h2>Producto equivocado, dañado o con un defecto real</h2>
      <p>Si te enviamos otro producto, llega dañado por una incidencia atribuible a la preparación o al transporte que gestionamos, o existe una falta de conformidad, los gastos necesarios para resolverlo no corren por tu cuenta.</p>
      <p>En un producto coleccionable valoraremos el problema según lo que se vendió y anunció: edición, idioma, contenido declarado, estado del precinto y demás características objetivas. Las variaciones normales de fabricación o el resultado aleatorio propio de un sobre no se consideran, por sí solos, una falta de conformidad.</p>

      <h2>Garantía legal</h2>
      <p>Los bienes nuevos vendidos a consumidores están sujetos al régimen legal de conformidad vigente en España. Con carácter general, el vendedor responde de las faltas de conformidad que ya existieran al entregar el bien y se manifiesten dentro del plazo legal de <strong>tres años desde la entrega</strong>.</p>
      <p>Esto también se aplica a un TCG vendido como producto nuevo y sellado, pero la garantía cubre defectos o incumplimientos respecto de lo contratado; no funciona como un seguro sobre el contenido aleatorio, el valor futuro del producto o el estado que pueda adquirir después de abrirlo, usarlo, almacenarlo o manipularlo.</p>
      <p>Salvo que se indique expresamente en la ficha de un producto, no ofrecemos una garantía comercial adicional distinta de los derechos que reconoce la ley.</p>

      <h2>Excepciones al desistimiento</h2>
      <p>Aplicaremos únicamente las excepciones previstas por la ley. Entre ellas están, por ejemplo, determinados productos personalizados, bienes que se deterioran rápidamente, productos precintados que no puedan devolverse por razones de salud o higiene después de abrirse y determinados contenidos o soportes precintados cuando la norma así lo establece.</p>
      <p>No tratamos automáticamente un juego de mesa, un manga o un TCG como excluido del desistimiento por el simple hecho de venir precintado. Sí podremos valorar la depreciación producida por una apertura o manipulación que exceda de lo necesario para examinar el artículo.</p>

      <h2>Cómo avisarnos</h2>
      <p>No necesitas un formulario especial. Basta con escribir a <strong>${contactEmail()}</strong> indicando que quieres devolver el pedido o explicando la incidencia, junto con el número de pedido.</p>
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

      <h2>Sobre estas condiciones</h2>
      <p>Estas condiciones se aplican a las compras realizadas en ${legalIdentity().tradeName}. Queremos que se entiendan sin necesidad de traducir lenguaje jurídico: el producto, el precio, la disponibilidad, el envío y el pago que ves antes de confirmar el pedido forman parte de la compra.</p>

      <h2>Cómo se hace un pedido</h2>
      <p>Añades los productos al carrito, revisas cantidades, dirección, método de envío y forma de pago y, antes de confirmar, puedes corregir cualquier dato. El pedido se envía cuando pulsas el botón final que indica claramente que existe una obligación de pago.</p>
      <p>Después recibirás una confirmación por correo electrónico u otro soporte duradero. Conservaremos la información del pedido durante el tiempo necesario para gestionarlo y cumplir nuestras obligaciones legales.</p>

      <h2>Precios</h2>
      <p>Los precios mostrados al consumidor incluyen los impuestos que correspondan. Los gastos de envío y cualquier otro coste aplicable se muestran antes de pagar. No añadimos servicios opcionales mediante casillas premarcadas.</p>

      <h2>Disponibilidad</h2>
      <p>La disponibilidad que aparece en la tienda es la referencia para saber si un producto puede comprarse en ese momento. Algunos artículos pueden tener un plazo de preparación distinto, que se indicará cuando sea relevante.</p>
      <p>Si después de comprar se produce una incidencia de disponibilidad y no podemos servir un artículo, te avisaremos y devolveremos las cantidades correspondientes cuando proceda. No sustituiremos un producto por otro sin tu consentimiento.</p>

      <h2>Errores evidentes</h2>
      <p>Si hay un error técnico manifiesto en un precio, una descripción o una disponibilidad, lo revisaremos antes de enviar una prestación distinta de la razonablemente contratada. Si el error afecta al pedido, contactaremos contigo y respetaremos los derechos que te correspondan como consumidor.</p>

      <h2>Pago y seguridad</h2>
      <p>Los métodos de pago disponibles aparecen durante el checkout. Algunas operaciones pueden pasar controles antifraude o de seguridad. Estos controles se utilizarán solo en la medida necesaria para proteger la operación.</p>

      <h2>Envíos, devoluciones y garantía</h2>
      <p>Las condiciones prácticas están explicadas en nuestras páginas de Envíos y Devoluciones y garantía. En cualquier caso, prevalecen los derechos de consumo que sean legalmente irrenunciables.</p>
      <p>En especial, vender un artículo coleccionable o TCG precintado no elimina la garantía legal por una falta de conformidad real. Al mismo tiempo, esa garantía no cubre resultados aleatorios, expectativas de valor, grading, desgaste o daños posteriores derivados de la apertura, uso o conservación del producto.</p>

      <h2>Cuenta de cliente</h2>
      <p>Si creas una cuenta, procura que los datos sean correctos y protege tus credenciales. Podemos bloquear temporalmente una cuenta cuando existan indicios razonables de fraude o un problema de seguridad, procurando no afectar más de lo necesario a pedidos ya realizados.</p>

      <h2>Marcas, imágenes y contenidos</h2>
      <p>Las marcas, ilustraciones, fotografías y materiales de fabricantes y editoriales pertenecen a sus respectivos titulares. Los contenidos propios de la web también están protegidos por la normativa de propiedad intelectual.</p>

      <h2>Contacto y reclamaciones</h2>
      <p>Para cualquier consulta o reclamación puedes escribir a <strong>${contactEmail()}</strong>. Indicar el número de pedido nos ayuda a localizar el caso más rápido.</p>

      <h2>Ley aplicable</h2>
      <p>Estas condiciones se interpretan conforme a la legislación española, sin privar a un consumidor de la protección imperativa que le corresponda por su lugar de residencia. Los conflictos se resolverán ante los órganos que sean competentes conforme a la normativa aplicable.</p>
    `,
  }),
};

export function getSpanishLegalPolicy(slug: string): LocalLegalPolicy | null {
  return policies[slug]?.() ?? null;
}
