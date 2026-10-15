# BisonTCG: revisión previa a la apertura comercial

Fecha: 10 de octubre de 2026. Datos de catálogo tomados a las **18:19, hora de Madrid**; otras comprobaciones realizadas durante esta misma revisión. Es una fotografía del estado, no monitorización continua.

Base revisada: `main` `c7ecf4408cda884d1173104019c65141c7637016`. Producción Vercel `dpl_5gnQunKhLxsixRfQcNcBfX7XaGpY`, READY y con ese mismo commit.

## Dictamen

La web está publicada y su base técnica funciona, pero **todavía no recomendaría aceptar pedidos reales**. Los pendientes principales son el entorno de producción de Spree, los permisos para registrar pagos, los eventos que activan los correos, la identificación y contacto públicos y la revisión de impuestos. Una compra completa tampoco está validada. No son solo retoques de diseño.

Esta investigación no modifica código comercial, configuración, permisos ni secretos. No realiza compras, cobros, reembolsos, etiquetas, recogidas ni envíos de correo. La única escritura es este informe en una rama documental separada.

## Antes de aceptar pedidos reales

| Punto | Evidencia y límite | Qué falta y criterio de cierre |
| --- | --- | --- |
| **Spree de producción** | El selector administrativo coloca BisonTCG dentro de «Sandboxes». Las condiciones oficiales reservan ese servicio a evaluación, excluyen comercio real y datos de clientes, y no garantizan conservación ni copias de seguridad. No se ha visto un acuerdo de producción separado. | Confirmar y usar un entorno autorizado para producción; migrar catálogo/configuración y comprobar copia/restauración. Un eventual acuerdo separado puede cambiar la conclusión, pero no debe darse por supuesto. |
| **Plan de alojamiento comercial** | La API de logs de Vercel identifica el plan como Hobby. Su documentación limita Hobby a uso personal no comercial. La respuesta normalizada del equipo no expone facturación. | Confirmar el plan efectivo y pasar a uno que admita comercio si sigue siendo Hobby, o usar otro alojamiento adecuado. No se contrata ni actualiza ningún plan en esta revisión. |
| **Permisos de pagos Spree** | Hay dos claves secretas visibles. «La clave del stock» tiene permisos de productos, promociones, stock, categorías, settings y webhooks. «BisonTCG Logística Correos» tiene `read_orders`, `read_fulfillments`, `write_fulfillments`. **Ninguna tiene permisos de pagos.** No se descifra `SPREE_ADMIN_API_KEY`, por lo que no se certifica qué clave contiene. | Verificar la credencial efectiva del módulo Stripe y proporcionar los permisos mínimos necesarios: `read_orders`, `write_orders`, `read_payments`, `write_payments` (la escritura implica lectura en la API documentada). Comprobar lectura y registro de pago, actualización y finalización del pedido. No ampliar la clave de catálogo sin necesidad. |
| **Webhook Spree para correos** | La pantalla «Endpoints de webhook» muestra **«No se encontraron Webhook endpoint»**, sin filtro de búsqueda. El receptor de la web existe en `/api/webhooks/spree`, pero depende de recibir `order.completed`, `order.canceled`, `order.shipped` y `customer.password_reset_requested`. El webhook Stripe es distinto y sí existe. | Crear/configurar la suscripción Spree en el entorno definitivo, con firma y eventos correctos. Verificar recepción, procesamiento y entrega efectiva de confirmación y recuperación de contraseña. No confundir tener variables Gmail con tener el flujo conectado. |
| **Titular y contacto públicos** | Condiciones y privacidad españolas solo muestran «Titular: BisonTCG». No se muestran identidad jurídica real, NIF, domicilio, teléfono o correo. Las reclamaciones indican «puedes escribirnos» sin destino. El modelo de desistimiento tampoco tiene dirección. El código no renderiza NIF. | Publicar los datos reales y un canal operativo de atención/reclamación/desistimiento. No inventar datos ni publicar automáticamente un identificador personal retirado. Añadir también el plazo de reembolso por desistimiento: sin demora indebida y dentro de 14 días desde la comunicación, con la excepción legal de retención. |
| **Impuestos y documentación de venta** | En el administrador hay **una sola tasa: IVA 21 %, categoría Default, zona Madrid, incluido en precio**. No se observa una regla para el resto de Península/Baleares ni tipos diferenciados para libros/manga. Esto no acredita el impuesto final de cada producto o pedido. | Revisar zonas y categorías fiscales de las variantes, tratamiento de envío, destinos insulares y proceso de factura/justificante. Validar una muestra Madrid/otra provincia y otra familia fiscal. No extender un 21 % uniforme ni cambiar impuestos sin determinar el régimen aplicable. |
| **Compra de principio a fin** | Stripe permite cobros y payouts; su endpoint live está habilitado con URL/eventos correctos. Sin embargo, no hay evidencia de una compra completa ni eventos de los tres tipos relevantes en los últimos 30 días consultados. En CI, el job E2E figura verde pero sus pasos de checkout están **saltados por falta de secretos de prueba**. | Validar en entorno de pruebas autorizado: importe final, autenticación bancaria cuando corresponda, pago único, pedido completado, stock, correo, envío/tracking y cancelación/reembolso. La primera compra real sigue pendiente del propietario; no se realiza durante esta investigación. |

Fuentes primarias: [condiciones de Spree Sandbox](https://spreecommerce.org/terms-of-service/), [Vercel Hobby](https://vercel.com/docs/plans/hobby), [Admin API Spree](https://spreecommerce.org/docs/api-reference/admin-api/introduction), [LSSI art.10](https://www.boe.es/buscar/act.php?id=BOE-A-2002-13758#a10), [información precontractual art.97](https://www.boe.es/buscar/act.php?id=BOE-A-2007-20555#a97), [reembolso por desistimiento art.107](https://www.boe.es/buscar/act.php?id=BOE-A-2007-20555#a107), [Ley IVA arts.90–91](https://www.boe.es/buscar/act.php?id=BOE-A-1992-28740#a90).

## Importantes, con alcance delimitado

### Catálogo y comparación de proveedores

La selección sí compara coste neto normalizado puesto en almacén; no compara directamente PVP de proveedores. En la fotografía de Supabase:

- **1.943 ofertas seleccionadas**: ninguna caducada o inelegible; ninguna oferta elegible más barata ignorada; ninguna variante elegible sin selección; ninguna selección disponible con cantidad cero.
- Cola de conciliación: **0 pendientes** para ambos proveedores. Esto no certifica por sí solo todas las fichas publicadas o el stock físico en Spree.
- TCGFactory ya recorre más familias que accesorios. Run `tcgfactory-1791568032822`: merchandising 17/129, 1.798 descubiertos, 1.260 procesados, **2 fallos**; sin ejecución completa anterior registrada. Queda cobertura por terminar, incluida la familia posterior de pinturas.
- Esos dos fallos no desaparecen por esperar: al final de las familias, `cumulativeFailed > 0` marca `partial_run_not_completed` y no cierra el run como válido (`supabase/functions/devir-sync/index.ts`, bloque de cierre).
- Devir: 1.032 procesados y **8 errores** (4 SKU no reconocibles y 4 costes inválidos), sin pendientes. Último cierre correcto: 30 de septiembre; el ciclo observado terminó con errores a las 12:33 Madrid.
- **13 productos requieren revisión** y **14 identidades no tienen mapeo Spree**. No equivale a 27 productos públicos defectuosos: pueden solaparse o quedar retenidos.
- Hay 67 ofertas activas caducadas (10 Devir, 57 TCGFactory), **ninguna seleccionada**.
- Worker v133 activo. Últimos 30 minutos: 30 ejecuciones cron correctas, 28 respuestas HTTP200, sin timeout/error observado; algunas respuestas aún en curso.

Corregir las entradas fallidas y completar ambas ingestas antes de anunciar el surtido entero. Puede abrirse con un subconjunto válido y revisado: no hay evidencia de que el selector del más barato esté fallando o de que estas incidencias bloqueen todos los productos.

### Correos y preparación de pedidos

El checkout ya calcula automáticamente sus gastos mediante métodos nativos Spree: 21 tramos Correos por peso y destino. La entrega local Madrid está en **4,99 €**. Las pruebas anteriores sin compra comprobaron que Madrid desaparece al cambiar a Lugo y que el coste se recalcula por cantidad. El usuario no ve la calculadora interna.

La generación automática de etiquetas/recogidas sigue pendiente: faltan `CORREOS_CLIENT_SECRET` y `CORREOS_ID_ACCESS_TOKEN` entre las variables de producción. **Esto puede suplirse al arrancar con etiquetas manuales y tracking en Spree**, si el propietario puede comprar/preparar realmente esos envíos. Debe validarse ese procedimiento antes del primer pedido; no se presume que ya esté probado.

Los pesos de producto son estimaciones, no paquetes pesados. Revisar volumen, embalaje, costes y margen; un shipment de peso cero o superior a 30 kg no obtiene esos tramos. Las tarifas son publicadas 2026, no una cotización de contrato Correos; deben revisarse antes de 2027. No ampliar destinos insulares/internacionales sin logística y fiscalidad definidas.

### Correos transaccionales, devoluciones y captura

Gmail está implementado y sus variables de OAuth/remitente están presentes, pero no se verifica aquí el refresh token ni una entrega real. No hay failover automático a Resend. Tras conectar el webhook Spree, probar confirmación, cancelación, envío y reset de contraseña. El estado de publicación de la aplicación OAuth de Google no fue observado: no se afirma que el token haya caducado.

Los pedidos por encima de **500 €** usan captura manual. Definir quién revisa/captura a tiempo y cómo se gestionan autorizaciones que caducan. El módulo implementa cancelar autorizaciones sin capturar; no automatiza reembolsos de pagos ya capturados. Se puede operar con reembolso manual en Stripe y conciliación en Spree, pero hay que documentar y comprobar ese proceso, también para reservas sin stock.

### Incidencia condicional con tarjetas regalo o crédito

El servidor crea el PaymentIntent usando `amount_due`, pero el formulario reacciona a `cart.total`. Una tarjeta regalo parcial puede reducir `amount_due` sin cambiar `total`; aplicada después de iniciar el formulario, el intento podría conservar un importe mayor y la conciliación lo rechazaría después del cobro. Es un defecto identificado por revisión de código, **no una transacción reproducida**. Corregir y probar antes de habilitar tarjetas regalo/crédito; no se demuestra que ese caso esté disponible hoy para usuarios reales. Fuentes: `src/components/checkout/PaymentSection.tsx`, `src/lib/data/stripe-live.ts`, `src/lib/payments/stripe-live.ts` y tipos del SDK instalado.

## Mejoras de prioridad baja o condicionadas

| Mejora | Alcance |
| --- | --- |
| BISON3 gratis en Madrid y logo horizontal | Aplazados por el propietario. No bloquear apertura por esto ni activar envío gratis global. Preparación previa conservada en PR79, borrador. |
| Productos sincronizados con Stripe | **No necesario** para el flujo PaymentIntent actual. Spree aporta productos e importe; Stripe procesa pagos. No añadir sincronización de catálogo sin una necesidad nueva. |
| Contacto móvil | Enlaza a `/es/es/#contact`, pero no existe ese destino. Arreglar junto con el contacto real obligatorio. |
| Idiomas y SEO | Traducir los correos, validar fichas/políticas por mercado e idioma realmente ofrecido, canonical/JSON-LD y Search Console. La auditoría pública se centró en España/español. |
| Reintentos de correo | La deduplicación de eventos se guarda en memoria del proceso. Usar idempotencia persistente al aumentar volumen para evitar duplicados entre instancias/reintentos. |
| Cookies y telemetría | GTM está condicionado al consentimiento; antes de activarlo, concretar herramientas, terceros, duración y retirada. Analytics/Speed Insights se montan siempre; no se observó el payload en navegador ni se certifica que filtre IDs/URLs de pedido. Revisar privacidad y redacción de esas URLs, sin calificar automáticamente la analítica sin cookies como infracción. |
| Seguridad Supabase | Advisors: aviso `pg_net` en esquema público y tablas con RLS sin políticas. Los datos internos de catálogo no tienen grants públicos y las tablas sin políticas deniegan por defecto. No se observa fuga por esos avisos; no abrir políticas para silenciarlos. Revisar la ubicación de la extensión como mantenimiento. |
| Mantenimiento de documentación | TODO/AGENTS contienen pasos históricos que ya no describen el estado real. Actualizar después de cerrar esta lista; no ejecutar indiscriminadamente todo checkbox antiguo. |

## Comprobaciones que sí pasan

- **628 pruebas en 64 archivos**, ejecutadas durante esta revisión, sin fallos.
- TypeScript sin errores y paridad de claves/ICU de idiomas correcta. El primer lanzador `tsx` falló por permisos de socket temporal del entorno; el comando equivalente `node --import tsx scripts/check-locale-parity.ts` pasó.
- [CI de main](https://github.com/ismaelAM/storefront/actions/runs/38064538955): lint, typecheck y unit tests correctos. El checkout E2E no se ejecutó.
- Producción READY en el commit de main indicado; home y cuatro políticas españolas HTTP200, sin marcador de error React.
- Cláusula de reservas y reembolso íntegro de **PR78 publicada**.
- Stripe live: cobros y payouts habilitados, sin requisitos pendientes; endpoint de pagos habilitado y con tipos de evento correctos. La entrega efectiva de esos eventos aún no está demostrada.
- Comparador de ofertas y aislamiento de datos internos de Supabase sin la anomalía descrita arriba.
- No hay errores/fatales de Vercel en la ventana consultable de los últimos 30 minutos. No equivale a una prueba bajo tráfico o a monitorización permanente.

## Orden recomendado y responsabilidades

1. **Propietario/proveedor:** resolver entorno y condiciones de producción Spree, plan comercial de hosting y copias de seguridad. No comprometer compras reales a una instancia de evaluación.
2. **Técnico, con acceso apropiado:** verificar la clave efectiva, permisos mínimos de pagos y conexión de eventos Spree. Crear permisos nuevos requiere una acción específica; esta investigación no los concede.
3. **Propietario y técnico:** aportar/publicar identidad y contacto reales, revisar reglas fiscales y canal de facturación; completar el plazo legal de reembolso.
4. **Técnico y propietario:** ejecutar el recorrido completo en pruebas; confirmar correos y operación manual de envío/reembolso/captura. Después, la validación de primera compra real prevista por el propietario.
5. **Técnico:** resolver fallos de proveedores y entradas retenidas; cerrar ingestas válidas. Limitar el lanzamiento a productos y destinos verificados mientras quede cobertura pendiente.
6. **Posteriormente:** diseño, BISON3, logo horizontal, idiomas adicionales, automatización completa de Correos y mejoras de mantenimiento.

Se considera listo para ventas cuando los puntos de la primera tabla tengan evidencia de cierre, exista un surtido válido y el operador pueda preparar, enviar y reembolsar un pedido. No es necesario cerrar todas las mejoras opcionales.

## Límites de la investigación

No hay prueba real de cobro, devolución, correo, etiqueta o entrega. No se han descifrado secretos ni auditado exhaustivamente todas las fichas de Spree, el stock físico, contratos particulares, facturas, payloads de telemetría, accesibilidad, carga o seguridad ofensiva. La revisión de textos legales contrasta omisiones concretas con fuentes oficiales; no sustituye una revisión jurídica/fiscal integral. Una configuración externa o un acuerdo no observado puede resolver algunos pendientes y debe acreditarse antes de darlos por cerrados.
