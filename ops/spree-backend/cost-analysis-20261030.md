# Spree: consumo y revisión — 30/10/2026

## Resultado

El crecimiento evitable más claro está en la contabilidad de uso de claves API, no en el número de productos. Spree 5.6.1 encola `ApiKeys::MarkAsUsed` cuando `last_used_at` supera una hora. Con el worker general apagado deliberadamente, ese timestamp no avanza y cada solicitud vuelve a crear trabajo. El parche conserva la precisión horaria mediante UPDATE atómico, limitado a ID/tienda/clave no revocada, sin callbacks ni modificación de otras columnas. Mantiene autenticación, scopes y fallback JWT nativos; no procesa ni borra trabajos históricos.

Estado: **desplegado y verificado en producción el 30/10/2026** con autorización del propietario para usar el navegador. Deployment `dpl_2m1k7j9fkyweXvgjS7tcizTzBzmU`, fuente `38a6d29133b8793faf3e24329e024b598a89fa43`, dominio `project-7ck7q.vercel.app`. El conector sigue sin acceso al backend; el panel autenticado permitió completar la operación.

## Mediciones de base de datos

Ventana inicial: 30/10/2026, 01:10–01:12 Madrid (00:10–00:12 UTC), consultas de solo lectura. Base nativa `dtrospakebdiqihhcrub`, esquema `spree`; origen de proveedores `ikglqbjlbkbaronbiryl`.

| Recurso | Medición inicial |
| --- | ---: |
| Base nativa, total |286,51 MB |
| Tablas e índices de Spree |237,13 MB |
| Solid Queue e índices |181,58 MB (63,4% del total) |
| Trabajos totales / pendientes |143.579 /141.576 |
| Trabajos creados en 24 h / última hora |7.179 /177 |
| Workers registrados de Solid Queue |0, deliberado |
| Base de origen de proveedores |192,63 MB |

| Clase pendiente | Pendientes | Nuevos en 24 h |
| --- | ---: | ---: |
| ApiKeys::MarkAsUsed |84.965 |4.411 |
| Events::SubscriberJob |21.275 |1.222 |
| Products::TouchTaxonsJob |14.839 |931 |
| ActiveStorage::TransformJob |14.632 |378 |
| Images::SaveFromUrlJob |3.384 |174 |
| ActiveStorage::AnalyzeJob |2.464 |63 |

Las claves API representaban el 61,4% de las nuevas inserciones de trabajos de esa ventana. **Esto no equivale a un 61,4% de ahorro de CPU, factura ni espacio recuperado**. El cambio evita su crecimiento futuro; no reduce el histórico almacenado. No habilitar el worker para vaciar la cola: también ejecutaría eventos y trabajos de catálogo/imágenes.

Readback 30/10 a las 12:04 Madrid: 143.679 pendientes, 86.317 de `Spree::ApiKeys::MarkAsUsed` (+1.352 desde la lectura inicial). Confirma que el crecimiento continúa antes de desplegar el parche; no es una medida posterior al cambio.

## Correo, conexiones y proveedores

El guard del correo ya corregido usa búsqueda indexada `UNION ALL`, timeout SQL de 5 s y evita llamadas a Vercel cuando no hay correo. Últimas 9 h de la lectura inicial: 540/540 ejecuciones correctas, media 31 ms, p95 71 ms, máximo 330 ms, sin correo pendiente. El acumulador desde 15/10 atribuye 22.391 s de 40.891 s a la consulta antigua (54,8%); **es historia anterior a la reparación, no consumo actual ni ahorro facturado**.

Dos consultas históricas de `COUNT DISTINCT` de productos acumulan 2.507 s y 1.702 s, con medias 2,93 s y 3,42 s. Antes de añadir índices o alterar consultas deben medirse planes y deltas posteriores al incidente.

Las muestras de conexiones mostraron 16→5 conexiones, principalmente servicios Supabase en reposo; no acreditan saturación Rails. Máximo configurado 60, pooler 15. Los agregados posteriores al incidente no mostraron coincidencias de pool lleno, demasiados clientes, timeout SQL o deadlock. Sin excepción Rails concreta no se atribuyen los 500 intermitentes al pool.

Cron de proveedores: 24/24 ticks horarios correctos, media SQL de encolado 116 ms; no mide el tiempo completo del crawler. TCGFactory seguía avanzando en merchandising (offset 27, 1942 procesados acumulados, sin error actual). Devir deshabilitado y mecanismos compartidos preservados. No se creó worker, keepalive, cron duplicado ni sondeo periódico nuevo.

## Vercel: consumo exclusivo de Spree, comprobado en el panel

Lectura del 30/10, aproximadamente 13:00–13:19 Madrid, en el proyecto **bisontcg-spree**. El panel advierte hasta una hora de retraso. Ciclo seleccionado: **25/10–25/11**, acumulado parcial hasta esta lectura; no es una previsión del ciclo completo.

| Concepto | Uso acumulado mostrado | Valor USD |
| --- | ---: | ---: |
| CPU activa Fluid | 15 horas | 2,55 |
| Memoria provisionada Fluid | 154,58 GB·h | 2,15 |
| Memoria de daemons | 12,44 GB·h | 0,35 |
| CPU de daemons | 20 minutos | 0,06 |
| Invocaciones Functions | 90,81 mil | 0,05 |
| Transferencia al origen | 342 MB | 0,02 |
| Eventos de observabilidad | 183,4 mil | 0,11 |
| CPU de compilación | 1 hora | 0,21 |
| Almacenamiento Functions | 1 GB-mes | 0,12 |
| Almacenamiento VCR | 4 GB | 0,40 |
| **Subtotal de infraestructura** | | **6,02** |

CDN: 92,74 mil solicitudes, 331 MB de transferencia y 14,3 s de CPU adicional, mostrados como incluidos. Suscripción atribuida al proyecto: 0,00 USD. En la lectura del equipo, el crédito incluido usado era 6,69/20 USD y los cargos adicionales eran 0 USD. Los 6,02 USD son consumo valorado, no una factura adicional de ese importe; no incluyen el precio del plan ni facturación externa de Supabase.

CPU y memoria Fluid suman 4,70 USD (aproximadamente 78% del subtotal). La prioridad de ahorro es reducir trabajo y duración del backend; las invocaciones suponen solo 0,05 USD en este acumulado. No debe confundirse el número de tareas de Solid Queue con invocaciones facturadas.

Al seleccionar el periodo relativo, el panel normalizó el intervalo al **día 30/10** (00:00–23:59 Madrid, todavía incompleto). Mostró **0,21 USD**: CPU 32 min/0,09 USD, memoria 5,18 GB·h/0,07 USD, compilación 12 min/0,04 USD; otras partidas aparecen redondeadas a 0,00. No se etiqueta como «últimas 12 horas» ni como un día completo. Tampoco se usa para atribuir ahorro al parche recién publicado o proyectar una mensualidad.

## Consulta inicial del conector: solo costes del equipo

Consulta solicitada 23–30/10 UTC. El resumen devuelto cubre realmente 25/10 07:00–29/10 07:00 UTC, con retraso del proveedor. `EffectiveCost` **8,209855 USD del equipo**, incluyendo suscripción y recursos de otros proyectos; `BilledCost` prácticamente 0 en ese resultado. No representa una factura final ni un coste exclusivo de Spree.

| Servicio, todo el equipo | EffectiveCost USD |
| --- | ---: |
| Licencias de suscripción |2,580645 |
| CPU activa Fluid |2,170651 |
| Memoria provisionada Fluid |1,797894 |
| Memoria de daemons |0,345770 |
| CPU de daemons |0,058511 |
| CPU de builds |0,322000 |
| Almacenamiento VCR |0,401314 |
| Invocaciones Functions |0,061518 |

Es un extracto de categorías, no un desglose completo. La salida tenía 3600 registros y muestra parcial; no se extrapolan muestras ni se asignan cargos al backend. Observability respondió 403 para métricas por proyecto. Esta limitación del conector quedó resuelta para la atribución mediante el acceso al panel autorizado por el propietario: el desglose exclusivo está arriba. Sigue sin haber una proyección mensual fiable.

## Validación y siguientes pasos

- Suite frontend 1084 pruebas/109 archivos y TypeScript pasan. Contratos Ruby pasan tanto en disposición local como en la del contenedor; revisión independiente sin incidencias abiertas.
- Tests Ruby usan métodos del gem oficial 5.6.1 y fixtures de persistencia/reloj; no sustituyen el boot Rails ni la concurrencia SQL real.
- Release completado mediante una preview de la rama y su reconstrucción con variables de producción, como exige el panel. No se cambió la rama de producción ni se hizo merge a main. Worker y recuperación permanecen configurados a cero.
- Antes de la prueba, las fechas de uso eran null. Una petición pública normal a una ficha deliberadamente inexistente atravesó el cliente del storefront: producto 404, categorías 200, markets 200 y Admin store 200 en logs nativos. La página mostró no encontrado/noindex sin digest genérico.
- Readback a las 13:17:48 Madrid: claves activa publishable y secret con last_used_at a las 13:17:32 y 13:17:33; la clave revocada permanece sin uso. Total MarkAsUsed **86.577**, último ID 145955, último creado 13:08:20; **cero creados desde el release**. Se verifican Rails real, autenticación y persistencia sin nuevo trabajo de cola; no una medición de ahorro monetario.
- El extracto de logs también muestra cierres graciosos y mensajes «Application exited with code 1» después de respuestas correctas. No se afirma que el conjunto de logs esté libre de errores ni se atribuyen sin más al parche.
- Comparar recursos en intervalos equivalentes posteriores al parche antes de cuantificar ahorro, sin pings de mantenimiento.
- No borrar colas, reducir pools ni cancelar eventos de negocio sin evidencia de su impacto.
- Correos sigue pendiente de credenciales y prueba operativa; no se hizo compra, etiqueta, recogida ni cargo.
