# Estabilidad y presupuesto — 17 de noviembre de 2026

## Causa verificada

La producción `fd761dc53f08924e912c8b49d2d773cc29eb3f8e` fue pausada por
Vercel, no por un nuevo fallo de build. Los eventos del 16 de noviembre a
las 02:22:18 UTC (03:22 Madrid) registran `BUDGET_REACHED` para storefront
y bisontcg-spree. La respuesta pública comprobada fue HTTP 503 con
`x-vercel-error: DEPLOYMENT_PAUSED`.

El propietario exige conservar el presupuesto y su acción de pausa. Esta
corrección no los modifica ni reanuda proyectos, ejecuta cron o publica en IG.

## Consumo observado antes de estos cambios

Vercel billing_charges devolvió realmente 14Nov08Z → 16Nov08Z, 48 horas
(09:00 Madrid en ambos extremos). Total EffectiveCost 4.923005018208 USD,
menos Subscription Licenses 1.290322580645 USD: infraestructura
3.632682437563 USD, media 1.816341218782 USD/24h. El intervalo incluye horas
posteriores a la pausa: no representa 48 horas de servicio continuo.
Se usaron agregados completos, no las 100 muestras de los 1774 registros.
No es una factura final ni un ahorro medido. Pro mantiene su cuota de 20 USD/mes.

Para esa misma selección, el panel de Fluid Provisioned Memory mostró
181.7 GB-h (98.6 %) de bisontcg-spree y 2.5 GB-h (1.4 %) de storefront.
Spree ya tiene Standard 2 GB/1 vCPU; no se cambió memoria a ciegas. En una
selección distinta de tres días, Observability mostraba media 616 MB/2.05 GB.
No se atribuye a un proyecto ningún subtotal de las muestras truncadas.

## Correcciones

- El transporte común del SDK tiene un plazo de 30 segundos que también
  cubre la lectura del cuerpo. Los timeouts pasan como SpreeError 504,
  evitando que el SDK repita una operación cuyo resultado ya es incierto.
- Los fallos HTML/texto y DEPLOYMENT_PAUSED conservan su status HTTP y
  devuelven un error seguro, sin intentar interpretarlos como JSON ni
  repetirlos. Los errores JSON normales conservan el contrato del SDK.
- La navegación no repite una consulta más amplia tras fallar la consulta
  inicial de categorías. Conserva ese fallback ante una respuesta vacía válida.
- Las dos tarjetas de producto desactivan la precarga de fichas: la visita
  real sigue navegando mediante Next Link.
- El catálogo DTC anónimo revalida a los 20 minutos, con expiración a los
  60 minutos, frente a 10/30. Clientes, wholesale, ofertas y mutaciones del
  carrito conservan sus perfiles y comprobaciones comerciales existentes.
- Se desactivan los builds Git automáticos de esta rama en ambos proyectos,
  para evitar reconstrucciones duplicadas y no activar la tienda pausada.

## Verificación y límites

124 archivos / 1307 pruebas de aplicación pasan. TypeScript sin errores;
revisión independiente sin hallazgos críticos/importantes; diff sin errores.
Los tests reproducían antes el SyntaxError de una pausa, reintentos innecesarios
y esperas sin límite, y comprueban recuperación, auth/canal, cuerpo y timeout
de una mutación sin repetición.

El plazo es por intento. Los errores de red y errores JSON transitorios
conservan los reintentos del SDK; abortar la llamada no garantiza cancelar
trabajo que Rails ya inició. No se ha medido ahorro posterior ni se declara
alcanzado el objetivo de 0.50 USD/día. Desplegar código no elimina un corte
de presupuesto. La publicación queda pendiente mientras no haya presupuesto
disponible; no aumentar ni desactivar el límite para publicarla.
