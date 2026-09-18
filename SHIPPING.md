# Envíos BisonTCG

Rama de trabajo: `puck_editor`

## Objetivo

BisonTCG tendrá un método de envío propio para entregas locales en Madrid. Spree seguirá siendo la fuente de verdad para zonas, métodos, tarifas, pedidos y shipments; Next.js solo presenta la opción disponible en checkout y el estado del pedido.

## Método local

Nombre visible recomendado: **Entrega local BisonTCG — Madrid**

Código recomendado: `BISON_LOCAL_MADRID`

Tipo de precio inicial: tarifa fija. El importe definitivo se decidirá antes de activarlo en producción.

Zona: una Zone exclusiva para Madrid. No debe mezclarse con la zona española general.

Categoría de envío: la categoría física normal de los productos de BisonTCG.

Tiempo estimado: se configurará en días laborables cuando definamos la promesa comercial.

## Funcionamiento esperado

1. El cliente introduce su dirección de entrega.
2. Spree comprueba la Zone de la dirección.
3. Si la dirección pertenece a la zona de Madrid, aparece `Entrega local BisonTCG — Madrid`.
4. El cliente selecciona esa opción y Spree añade su coste al pedido.
5. El pedido queda asociado a un Shipment de Spree.
6. Nosotros gestionamos el envío manualmente desde Spree.
7. Desde el admin se actualiza el estado del Shipment y, cuando exista, el número de tracking.
8. Next.js mostrará al cliente el estado disponible del Shipment y el tracking cuando Spree lo exponga.

Spree soporta estados de shipment durante el ciclo de fulfillment y expone la información de seguimiento mediante su API. Por tanto, no necesitamos crear una base de datos paralela para inventarnos estados de envío.

## Estados que queremos mostrar al cliente

No se crearán estados personalizados en Next.js inicialmente. Usaremos los estados nativos de Spree y los traduciremos visualmente en el storefront a conceptos claros:

- Pendiente / preparando
- Enviado / en reparto
- Entregado

Cuando el proceso operativo esté probado, podremos estudiar estados adicionales si realmente los necesita BisonTCG.

## Tracking

Para el reparto local no hace falta una API externa. Podemos trabajar sin número de tracking y simplemente actualizar el Shipment desde Spree.

Para envíos fuera del reparto local, la opción preferida pasa a ser **Correos**. Correos ofrece APIs oficiales para prerregistro, generación de etiquetas, solicitudes de recogida y tracking. La integración requiere contrato de transporte y acceso al Portal de Desarrolladores con OAuth 2.0.

Hasta disponer de ese contrato, se puede operar manualmente desde Mi Oficina de Correos y guardar el código de seguimiento en el Shipment de Spree. El storefront no necesita saber si la etiqueta se creó por API o manualmente: sigue leyendo estado y tracking desde Spree.

## Configuración en Spree Sandbox / producción

La configuración real se hará en `Settings → Shipping`:

1. Crear una Zone exclusiva de Madrid.
2. Crear el método `Entrega local BisonTCG — Madrid`.
3. Asociarlo a la Zone de Madrid.
4. Asociarlo a la Shipping Category física.
5. Elegir una tarifa fija y el importe comercial definitivo.
6. Añadir el tiempo estimado de entrega.
7. Revisar la configuración de impuestos de envío.
8. Guardar y probar el checkout con una dirección de Madrid y otra fuera de la zona.

Spree indica que los métodos de envío se filtran por Zone y que el cliente solo ve los métodos que corresponden a su dirección de entrega. También permite configurar tarifa plana y tiempo estimado directamente desde el método de envío.

## No hacer todavía

No añadir lógica en Next.js del tipo `if city === Madrid` para decidir el precio o la disponibilidad. Esa regla debe pertenecer a Spree para que checkout, admin y futuras integraciones compartan la misma verdad.

No integrar Correos por API hasta que exista contrato y credenciales oficiales. Si no se obtienen, mantener la operativa manual con Mi Oficina y tracking en Spree.

No mezclar la futura integración de Correos con Stripe. El pago y el fulfillment son procesos distintos: Spree coordina ambos y cada proveedor se integra en su capa correspondiente.

## Futuro Correos

Arquitectura objetivo:

```text
Spree
├── BISON_LOCAL_MADRID
│   └── gestión manual/local
│
└── CORREOS
    ├── prerregistro
    ├── etiqueta
    ├── recogida
    └── tracking
```

Si no hay acceso a API, el mismo método `CORREOS` puede operarse manualmente: se crea el envío en Mi Oficina, se pega la etiqueta y se guarda el tracking en el Shipment de Spree. Cuando llegue la API, automatizamos sin cambiar la experiencia del cliente.

## Requisitos para darlo por terminado

- [ ] Zone real de Madrid creada en Spree.
- [ ] Método local creado y visible en checkout.
- [ ] Tarifa definitiva definida.
- [ ] Tiempo estimado definido.
- [ ] Prueba positiva con dirección de Madrid.
- [ ] Prueba negativa con dirección fuera de Madrid.
- [ ] Shipment creado correctamente en un pedido real.
- [ ] Cambio de estado del Shipment reflejado en el storefront.
- [ ] Tracking comprobado cuando exista.
- [ ] Prueba completa en Preview/Vercel cuando el bloqueo de builds desaparezca.
