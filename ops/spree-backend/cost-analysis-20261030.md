# Spree: consumo y revisión — 30/10/2026

## Resultado

El crecimiento evitable más claro está en la contabilidad de uso de claves API, no en el número de productos. Spree 5.6.1 encola `ApiKeys::MarkAsUsed` cuando `last_used_at` supera una hora. Con el worker general apagado deliberadamente, ese timestamp no avanza y cada solicitud vuelve a crear trabajo. El parche conserva la precisión horaria mediante UPDATE atómico, limitado a ID/tienda/clave no revocada, sin callbacks ni modificación de otras columnas. Mantiene autenticación, scopes y fallback JWT nativos; no procesa ni borra trabajos históricos.

Estado: código revisado y pruebas de contrato pasan; **pendiente desplegar/verificar en Rails real**. El conector disponible solo enumera `storefront` y devuelve 404 para el proyecto/deployment del backend. No se ha intentado sortear esta limitación mediante navegador.

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

## Vercel: coste disponible y límite de atribución

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

Es un extracto de categorías, no un desglose completo. La salida tenía 3600 registros y muestra parcial; no se extrapolan muestras ni se asignan cargos al backend. Observability respondió 403 para métricas por proyecto. Falta acceso autorizado al panel o al proyecto backend para obtener invocaciones, CPU, memoria y costes atribuibles; no hay cifra mensual fiable de Spree con la información actual.

## Validación y siguientes pasos

- Suite frontend 1084 pruebas/109 archivos y TypeScript pasan. Contratos Ruby pasan tanto en disposición local como en la del contenedor; revisión independiente sin incidencias abiertas.
- Tests Ruby usan métodos del gem oficial 5.6.1 y fixtures de persistencia/reloj; no sustituyen el boot Rails ni la concurrencia SQL real.
- Desplegar una única versión agrupada del backend cuando sea accesible; verificar arranque y que una lectura autenticada actualice `last_used_at` sin crear `MarkAsUsed`. Comparar deltas de cola y recursos en intervalos equivalentes, sin pings de mantenimiento.
- No borrar colas, reducir pools ni cancelar eventos de negocio sin evidencia de su impacto.
- Correos sigue pendiente de credenciales y prueba operativa; no se hizo compra, etiqueta, recogida ni cargo.
