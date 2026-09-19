import { getStoreName } from "@/lib/store";

export interface LocalLegalPolicy {
  id: string;
  name: string;
  slug: string;
  body: string | null;
  body_html: string | null;
  local: true;
}

const LAST_UPDATED = "19 de septiembre de 2026";

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

  const missing = [
    !taxId ? "NIF/CIF" : null,
    !address ? "domicilio" : null,
    !email ? "correo de contacto" : null,
  ].filter(Boolean);

  return {
    tradeName,
    businessName,
    taxId,
    address,
    register,
    phone,
    email,
    missing,
  };
}

function identityHtml(): string {
  const identity = legalIdentity();
  return `
    <section>
      <h2>Identificación del titular</h2>
      <ul>
        <li><strong>Nombre comercial:</strong> ${identity.tradeName}</li>
        <li><strong>Titular / razón social:</strong> ${identity.businessName}</li>
        ${identity.taxId ? `<li><strong>NIF/CIF:</strong> ${identity.taxId}</li>` : ""}
        ${identity.address ? `<li><strong>Domicilio:</strong> ${identity.address}</li>` : ""}
        ${identity.register ? `<li><strong>Datos registrales:</strong> ${identity.register}</li>` : ""}
        ${identity.email ? `<li><strong>Correo electrónico:</strong> ${identity.email}</li>` : ""}
        ${identity.phone ? `<li><strong>Teléfono:</strong> ${identity.phone}</li>` : ""}
      </ul>
      ${
        identity.missing.length > 0
          ? `<p><strong>Importante para el titular de la tienda:</strong> antes de operar comercialmente, completa en la configuración los siguientes datos obligatorios que faltan: ${identity.missing.join(", ")}.</p>`
          : ""
      }
    </section>
  `;
}

function contactEmail(): string {
  return legalIdentity().email ?? "el canal de contacto indicado en la tienda";
}

const policies: Record<string, () => LocalLegalPolicy> = {
  "shipping-policy": () => ({
    id: "local-es-shipping-policy",
    name: "Política de envíos",
    slug: "shipping-policy",
    body: null,
    local: true,
    body_html: `
      <p><strong>Última actualización:</strong> ${LAST_UPDATED}</p>
      <p>Esta política se aplica a los pedidos realizados por consumidores a través de ${legalIdentity().tradeName}. Las condiciones concretas de transporte, precio y plazo que aparezcan en el proceso de compra y en la confirmación del pedido prevalecen cuando sean más favorables para el cliente.</p>

      <h2>1. Preparación y disponibilidad</h2>
      <p>Los productos se preparan según la disponibilidad indicada en su ficha. Cuando un artículo figure como disponible bajo pedido o con preparación ampliada, el plazo mostrado es una estimación de preparación y no significa que el producto esté físicamente en almacén en ese momento.</p>
      <p>En preventas o reservas se mostrará, cuando esté disponible, una fecha estimada de lanzamiento o envío. Si el proveedor modifica de forma relevante esa fecha, informaremos al cliente y, cuando el retraso sea significativo, podrá mantener el pedido o cancelarlo y recibir el reembolso íntegro de las cantidades abonadas correspondientes a los artículos afectados.</p>

      <h2>2. Plazos de entrega</h2>
      <p>La fecha o intervalo de entrega mostrado durante la compra es la referencia aplicable al pedido. Salvo que se haya acordado expresamente otro plazo —por ejemplo, en una preventa—, la entrega se realizará sin demora indebida y, en todo caso, dentro del máximo legal de 30 días naturales desde la celebración del contrato.</p>
      <p>Si un pedido contiene artículos con disponibilidades distintas, podremos realizar envíos parciales cuando ello no suponga un coste adicional no aceptado por el cliente. También podremos esperar a disponer de todos los artículos si así se indicó antes de la compra.</p>

      <h2>3. Gastos de envío</h2>
      <p>Los gastos se calculan antes de confirmar el pedido en función del destino, peso, volumen, método de transporte y promociones aplicables. No se cargará ningún coste de transporte que no haya sido mostrado y aceptado antes de finalizar la compra.</p>

      <h2>4. Dirección y entrega</h2>
      <p>El cliente debe facilitar una dirección completa y correcta. Si un envío no puede entregarse por un error imputable al cliente o por no atender los intentos de entrega, podremos solicitar el coste directo y razonable de un nuevo envío, informándolo previamente. Esto no limita ningún derecho legal del consumidor.</p>
      <p>El riesgo de pérdida o deterioro pasa al consumidor cuando él, o un tercero indicado por él distinto del transportista, adquiere la posesión material del pedido, salvo que el consumidor haya contratado por su cuenta un transportista no ofrecido por la tienda.</p>

      <h2>5. Incidencias de transporte</h2>
      <p>Si el paquete llega dañado, incompleto o no corresponde con lo pedido, contacta con nosotros tan pronto como sea razonablemente posible. No exigimos una comunicación dentro de 24 o 48 horas como condición para conservar los derechos legales del consumidor. Para agilizar la gestión podremos pedir fotografías del embalaje y del producto.</p>
      <p>Cuando la incidencia sea responsabilidad de la tienda o exista falta de conformidad, la solución legal que corresponda —reposición, reparación cuando proceda, reducción del precio o resolución— será sin coste para el consumidor.</p>

      <h2>6. Contacto</h2>
      <p>Para consultas sobre un envío puedes escribir a <strong>${contactEmail()}</strong> indicando el número de pedido.</p>
    `,
  }),

  "returns-policy": () => ({
    id: "local-es-returns-policy",
    name: "Devoluciones, desistimiento y garantías",
    slug: "returns-policy",
    body: null,
    local: true,
    body_html: `
      <p><strong>Última actualización:</strong> ${LAST_UPDATED}</p>
      <p>Queremos que el procedimiento sea claro y previsible. Esta política no limita los derechos irrenunciables reconocidos por la normativa española y de la Unión Europea.</p>

      <h2>1. Derecho de desistimiento: 14 días naturales</h2>
      <p>En las compras a distancia, el consumidor dispone con carácter general de <strong>14 días naturales</strong> para desistir sin necesidad de justificar su decisión. En la venta de bienes, el plazo comienza cuando el consumidor, o un tercero indicado por él distinto del transportista, recibe materialmente el producto; si un pedido se entrega por separado, el cómputo se realiza conforme a las reglas legales aplicables a la última entrega.</p>
      <p>Para ejercer el desistimiento basta una declaración inequívoca enviada antes de que venza el plazo. Puedes escribir a <strong>${contactEmail()}</strong> indicando el número de pedido y los artículos afectados. No es obligatorio usar un formulario concreto.</p>

      <h2>2. Devolución del producto</h2>
      <p>Tras comunicar el desistimiento, el consumidor deberá devolver los bienes sin demora indebida y, como máximo, dentro de los 14 días naturales siguientes. En un desistimiento voluntario, el consumidor asume el coste directo de la devolución, salvo que hayamos ofrecido asumirlo.</p>
      <p>El consumidor puede manipular el producto únicamente en la medida necesaria para comprobar su naturaleza, características y funcionamiento, de forma similar a lo que razonablemente podría hacer en una tienda física. Solo podrá responder de una disminución de valor causada por una manipulación que exceda de esa comprobación.</p>

      <h2>3. Reembolsos</h2>
      <p>Reembolsaremos los pagos que legalmente correspondan, incluidos los gastos de entrega ordinaria iniciales, sin demora indebida y dentro de los 14 días naturales desde que se nos comunique el desistimiento. Si el cliente eligió una modalidad de entrega más cara que la ordinaria menos costosa ofrecida, no estamos obligados a devolver la diferencia adicional.</p>
      <p>El reembolso se realizará por el mismo medio de pago utilizado en la compra, salvo acuerdo expreso distinto que no genere costes para el cliente. En ventas de bienes podremos retener el reembolso hasta recibirlos o hasta que el cliente aporte una prueba de su devolución, lo que ocurra primero.</p>

      <h2>4. Excepciones legales al desistimiento</h2>
      <p>El derecho de desistimiento no se aplica únicamente en los supuestos previstos legalmente, entre otros: bienes confeccionados conforme a especificaciones del consumidor o claramente personalizados; bienes que puedan deteriorarse o caducar con rapidez; bienes precintados que no sean aptos para ser devueltos por razones de protección de la salud o higiene y cuyo precinto se haya retirado tras la entrega; y grabaciones, vídeo, software o soportes precintados cuando el precinto haya sido retirado, cuando resulte aplicable la excepción legal.</p>
      <p>Un libro, manga, juego o producto coleccionable <strong>no queda excluido del desistimiento por el mero hecho de pertenecer a esa categoría</strong>. Cualquier excepción se interpretará de forma estricta conforme a la ley.</p>

      <h2>5. Productos defectuosos, incorrectos o dañados</h2>
      <p>Si el producto entregado no es conforme con el contrato, es incorrecto o ha sufrido daños imputables a la preparación o transporte gestionado por nosotros, el consumidor no asumirá los gastos necesarios para poner el bien en conformidad. Contacta con <strong>${contactEmail()}</strong> y gestionaremos la solución legal adecuada.</p>

      <h2>6. Garantía legal</h2>
      <p>Para bienes nuevos vendidos a consumidores, respondemos de las faltas de conformidad que existan en el momento de la entrega y se manifiesten dentro del plazo legal, actualmente <strong>tres años desde la entrega</strong>. Las medidas correctoras y sus condiciones serán las previstas por la normativa vigente y se aplicarán sin gastos indebidos para el consumidor.</p>

      <h2>7. Modelo orientativo de desistimiento</h2>
      <blockquote>
        A la atención de ${legalIdentity().businessName}:<br />
        Por la presente comunico que desisto de mi contrato de venta del siguiente bien o bienes: [producto].<br />
        Pedido: [número]. Fecha de pedido/recepción: [fecha].<br />
        Nombre del consumidor: [nombre]. Dirección: [dirección].<br />
        Fecha: [fecha].
      </blockquote>
    `,
  }),

  "privacy-policy": () => ({
    id: "local-es-privacy-policy",
    name: "Política de privacidad",
    slug: "privacy-policy",
    body: null,
    local: true,
    body_html: `
      <p><strong>Última actualización:</strong> ${LAST_UPDATED}</p>
      ${identityHtml()}

      <h2>1. Qué datos tratamos</h2>
      <p>Podemos tratar los datos que facilites al comprar, crear una cuenta o contactar con nosotros: datos identificativos y de contacto, direcciones de envío y facturación, información del pedido, comunicaciones de atención al cliente y datos técnicos necesarios para seguridad y funcionamiento. Los datos completos de tarjeta son tratados por el proveedor de pagos y no deben almacenarse en nuestros sistemas cuando el flujo de pago se realiza mediante su infraestructura segura.</p>

      <h2>2. Finalidades y bases jurídicas</h2>
      <ul>
        <li><strong>Gestionar compras, pagos, entregas, devoluciones y atención posventa:</strong> ejecución del contrato o medidas precontractuales solicitadas por el interesado.</li>
        <li><strong>Facturación, contabilidad, obligaciones fiscales, prevención de fraude y atención de requerimientos legales:</strong> cumplimiento de obligaciones legales y, cuando proceda, interés legítimo en proteger la tienda y a sus clientes frente a operaciones fraudulentas.</li>
        <li><strong>Gestión de cuentas de cliente y soporte:</strong> ejecución de la relación contractual y atención de solicitudes.</li>
        <li><strong>Comunicaciones comerciales opcionales:</strong> consentimiento cuando sea exigible. Podrás retirarlo en cualquier momento sin afectar a la licitud del tratamiento previo.</li>
        <li><strong>Analítica o publicidad mediante tecnologías no necesarias:</strong> consentimiento previo cuando la normativa lo exija.</li>
      </ul>
      <p>No condicionamos una compra a aceptar tratamientos opcionales que no sean necesarios para ejecutar el contrato o cumplir una obligación legal.</p>

      <h2>3. Destinatarios y proveedores</h2>
      <p>Solo comunicaremos datos cuando sea necesario para prestar el servicio, cumplir una obligación legal o exista otra base jurídica válida. Pueden acceder a los datos, en la medida necesaria, proveedores de alojamiento e infraestructura, plataforma de comercio electrónico, pasarelas y entidades de pago, empresas de transporte y logística, correo transaccional, soporte, prevención de fraude y analítica cuando haya sido habilitada legítimamente.</p>
      <p>Si alguno de estos proveedores trata datos fuera del Espacio Económico Europeo, se utilizarán los mecanismos y garantías exigidos por la normativa aplicable, como decisiones de adecuación o cláusulas contractuales tipo cuando correspondan.</p>

      <h2>4. Conservación</h2>
      <p>Conservaremos los datos durante el tiempo necesario para gestionar la relación con el cliente y, posteriormente, durante los plazos exigidos por las obligaciones fiscales, contables, de consumo y para la formulación, ejercicio o defensa de reclamaciones. Los datos basados exclusivamente en consentimiento se conservarán hasta que se retire, sin perjuicio de los periodos de bloqueo o conservación que puedan resultar legalmente necesarios.</p>

      <h2>5. Derechos</h2>
      <p>Puedes solicitar acceso, rectificación, supresión, oposición, limitación del tratamiento y portabilidad cuando resulten aplicables, así como retirar un consentimiento previamente otorgado. Para ejercerlos, escribe a <strong>${contactEmail()}</strong> indicando el derecho que deseas ejercer y la información razonablemente necesaria para identificar tu solicitud.</p>
      <p>Si consideras que el tratamiento no se ajusta a la normativa, puedes presentar una reclamación ante la Agencia Española de Protección de Datos (AEPD), sin perjuicio de cualquier otro recurso que te corresponda.</p>

      <h2>6. Decisiones automatizadas</h2>
      <p>No adoptaremos decisiones basadas únicamente en un tratamiento automatizado que produzcan efectos jurídicos o te afecten significativamente de forma similar sin facilitar la información y garantías exigidas por la normativa.</p>

      <h2>7. Menores</h2>
      <p>La tienda no está diseñada para que menores sin capacidad suficiente contraten por sí solos. Los menores deberán actuar, cuando corresponda, con la intervención de sus representantes legales. No solicitamos intencionadamente a menores datos que no sean necesarios para la prestación del servicio.</p>

      <h2>8. Cookies y tecnologías similares</h2>
      <p>Las tecnologías estrictamente necesarias pueden utilizarse para funciones como mantener la sesión, conservar el carrito, seguridad o preferencias esenciales. Las cookies o tecnologías de analítica, personalización o publicidad que requieran consentimiento deberán permanecer desactivadas hasta que el usuario las acepte.</p>
      <p>Cuando se solicite consentimiento para cookies no necesarias, aceptar y rechazar deben presentarse de forma igualmente accesible. El usuario podrá cambiar posteriormente su decisión mediante el mecanismo de preferencias habilitado en la web.</p>

      <h2>9. Cambios en esta política</h2>
      <p>Podremos actualizar esta política para reflejar cambios normativos o en los tratamientos. Cuando un cambio sea relevante, se informará de manera adecuada y se solicitará un nuevo consentimiento si fuese legalmente necesario.</p>
    `,
  }),

  "terms-of-service": () => ({
    id: "local-es-terms-of-service",
    name: "Condiciones de contratación y aviso legal",
    slug: "terms-of-service",
    body: null,
    local: true,
    body_html: `
      <p><strong>Última actualización:</strong> ${LAST_UPDATED}</p>
      ${identityHtml()}

      <h2>1. Objeto y ámbito</h2>
      <p>Estas condiciones regulan el acceso a la tienda y las compras realizadas por consumidores a través de ${legalIdentity().tradeName}. En todo lo no previsto aquí se aplicará la normativa imperativa de protección de consumidores, contratación electrónica y demás legislación aplicable.</p>

      <h2>2. Información antes de comprar</h2>
      <p>Antes de finalizar el pedido se mostrarán las características esenciales del producto, su precio total y los impuestos incluidos cuando correspondan, los gastos adicionales aplicables, la disponibilidad, las opciones de entrega y pago y cualquier otra información precontractual exigida. El cliente podrá revisar y corregir los datos del carrito, dirección, envío y pago antes de confirmar.</p>

      <h2>3. Proceso de contratación</h2>
      <ol>
        <li>El cliente selecciona productos y cantidades.</li>
        <li>Revisa el carrito, facilita los datos necesarios y elige entrega y pago.</li>
        <li>Antes de confirmar, puede corregir errores y consultar estas condiciones y las demás políticas aplicables.</li>
        <li>Al pulsar el botón final que indique de forma inequívoca la obligación de pago, envía el pedido.</li>
        <li>La tienda remitirá una confirmación del pedido por correo electrónico u otro soporte duradero.</li>
      </ol>
      <p>El documento electrónico del pedido se conservará durante los periodos necesarios para gestionar la compra y cumplir las obligaciones legales. Cuando el cliente disponga de cuenta, podrá consultar la información que la plataforma mantenga accesible en su historial de pedidos.</p>
      <p>La contratación se realiza en el idioma seleccionado en la tienda cuando esté disponible.</p>

      <h2>4. Precios e impuestos</h2>
      <p>Los precios mostrados al consumidor incluirán los impuestos que deban incorporarse al precio conforme a la normativa aplicable. Los gastos de envío u otros costes adicionales se mostrarán antes de finalizar el pedido. No se añadirán servicios opcionales mediante casillas premarcadas.</p>

      <h2>5. Disponibilidad y errores de inventario</h2>
      <p>La aceptación y preparación del pedido están sujetas a la disponibilidad real del producto. Si después de la compra descubrimos que un artículo no puede suministrarse, informaremos al cliente sin demora y ofreceremos las soluciones que legalmente correspondan, incluida la devolución de las cantidades cobradas por el artículo no disponible cuando proceda. No sustituiremos un producto por otro distinto sin consentimiento del cliente.</p>
      <p>Si existe un error técnico manifiesto en datos esenciales de una oferta, procuraremos corregirlo con transparencia y contactar con el cliente antes de ejecutar una prestación distinta de la razonablemente contratada, respetando en todo caso sus derechos legales y el principio de buena fe.</p>

      <h2>6. Pago</h2>
      <p>Los métodos de pago disponibles se muestran durante el proceso de compra. El cliente se compromete a utilizar un medio de pago que esté autorizado a usar. Las operaciones podrán someterse a controles razonables de seguridad y prevención del fraude. Un control de seguridad no autoriza a retener indefinidamente importes ni a privar al consumidor de sus derechos.</p>

      <h2>7. Envíos, desistimiento y garantía</h2>
      <p>Los plazos de entrega, transmisión del riesgo, desistimiento, devoluciones y garantía se rigen por las políticas específicas publicadas en la tienda y, en todo caso, por los mínimos legales imperativos. Ninguna cláusula de estas condiciones pretende excluir o limitar esos derechos.</p>

      <h2>8. Cuenta de usuario</h2>
      <p>El cliente es responsable de facilitar datos veraces y mantener la confidencialidad de sus credenciales. Si detecta un uso no autorizado debe comunicárnoslo. Podemos bloquear temporalmente una cuenta cuando existan indicios razonables de fraude o riesgo de seguridad, limitando la medida a lo necesario y sin afectar indebidamente a pedidos o derechos ya adquiridos.</p>

      <h2>9. Propiedad intelectual</h2>
      <p>Los contenidos propios de la web —diseño, textos, fotografías propias, logotipos y software, cuando proceda— están protegidos por la normativa aplicable. Las marcas, imágenes y materiales de terceros pertenecen a sus respectivos titulares. La compra de un producto no implica la cesión de derechos de propiedad intelectual sobre dichos contenidos.</p>

      <h2>10. Responsabilidad</h2>
      <p>No excluimos responsabilidad cuando la ley no permite hacerlo, especialmente por dolo, negligencia grave, daños personales, falta de conformidad o derechos imperativos del consumidor. No respondemos de interrupciones inevitables o ajenas a nuestro control razonable, pero aplicaremos las medidas y remedios que legalmente correspondan cuando afecten al cumplimiento de un pedido.</p>

      <h2>11. Atención al cliente y reclamaciones</h2>
      <p>Para consultas o reclamaciones puedes escribir a <strong>${contactEmail()}</strong>. Facilitaremos una respuesta y trazabilidad razonables de la reclamación. Si estamos adheridos en el futuro a un sistema específico de resolución alternativa de litigios, se informará expresamente de ello y de cómo acceder.</p>

      <h2>12. Ley aplicable y tribunales</h2>
      <p>Estas condiciones se interpretarán conforme a la legislación española, sin privar al consumidor de la protección imperativa que pudiera corresponderle por su lugar de residencia. Cualquier controversia con un consumidor se someterá a los juzgados y tribunales que resulten competentes conforme a las normas imperativas aplicables; no imponemos una renuncia previa al fuero legal del consumidor.</p>

      <h2>13. Validez de las condiciones</h2>
      <p>Si una cláusula fuese declarada nula o inaplicable, se tendrá por no puesta en la medida necesaria y el resto continuará vigente. La versión aplicable a cada compra será la que estuviera accesible antes de confirmar el pedido, sin perjuicio de normas posteriores que resulten obligatorias.</p>
    `,
  }),
};

export function getSpanishLegalPolicy(
  slug: string,
): LocalLegalPolicy | null {
  return policies[slug]?.() ?? null;
}
