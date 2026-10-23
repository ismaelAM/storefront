# Spree Migration Preparation Implementation Plan

**Goal:** Preparar una recuperación comprobable sin alterar la tienda actual.

**Architecture:** Paquete de recuperación local privado, verificación offline,
directorio de servidor generado desde la imagen exacta de origen. Base nueva
en Bisontcg, frontend actual en Vercel; corte bloqueado hasta restauración real.

**Tech Stack:** Node.js estándar, PostgreSQL, Rails/Spree, Vercel, Supabase.

**Spec:** `docs/superpowers/specs/2026-10-15-spree-migration-design.md`.

## Global Constraints

- No actualizar Spree ni seleccionar una versión del sandbox por suposición.
- No cambiar main, el catálogo activo, DNS o variables de producción.
- Los backups, imágenes y secretos nunca se añaden a Git.
- El proyecto Supabase de destino debe estar separado del catálogo existente.

## Review Focus

- Un dump truncado o alterado no puede pasar la verificación.
- Archivos fuera del paquete, incluso mediante symlinks, deben rechazarse.
- Un runtime no fijado por digest no puede generar un despliegue.
- Un destino ya existente no puede sobrescribirse.
- Un inventario diferente o incompleto debe bloquear la reconciliación.

## Task 1: Auditoría y organización

- [x] Revisar main, tablas de Supabase, DNS y requisitos oficiales.
- [x] Ejecutar suite base: 887 pruebas pasan.
- [x] Confirmar organización de destino: Bisontcg, proyecto separado.
- [x] Proyecto creado por el usuario mediante navegador; SQL de destino verificado.
- [x] Crear checkpoint privado de las 18 tablas de Supabase y verificar acceso.

## Task 2: Paquete verificable y servidor preparado

Files: `ops/spree-migration/migration.mjs`,
`ops/spree-migration/migration.test.mjs`, `ops/spree-migration/README.md`.

- [x] Escribir pruebas de integridad, contención de rutas y fallo seguro.
- [x] Ejecutarlas antes de implementación y observar fallo por módulo ausente.
- [x] Implementar `verifyBundle`, `compareInventory`, `prepareDeployment` y CLI.
- [x] Comprobar que el servidor no ejecuta seed, db:prepare ni migraciones.
- [x] Validación local: 12 pruebas Node, TypeScript, lint y 887 pruebas existentes.

## Task 3: Revisión y entrega

- [x] Revisar diff y secretos; rama publicada y PR de preparación #93 abierta.
- [x] Documentar estado real de origen, destino y límites de validación.
- [ ] Continuar con importación real cuando se reciba el paquete de origen.

## Rulings

- Ejecución directa en la rama específica del clon de esta sesión. La petición
  «empieza a migrarlo» aprueba avanzar con el diseño discutido; no se vuelve a
  solicitar permiso para preparar o revisar cambios reversibles.
- No hay Docker, Ruby ni PostgreSQL CLI en este runtime. Las pruebas Node son
  ejecutables aquí; un build Rails y una restauración real requieren esas
  herramientas y el paquete original. No presentar simulaciones como esos tests.
- Supabase `get_cost` devolvió UNAVAILABLE el 15/10/2026. No inventar un coste,
  confirmation ID o credenciales, ni crear recursos por otra cuenta.
- Revisión independiente: corregidos el recuento obligatorio en cada arranque y
  los overrides URL/TLS. No quedan incidencias importantes en esta preparación.
- Checkpoint aplicado a las 13:54:21 UTC: 18 tablas, 105.394 filas; RLS y ausencia
  de lectura para roles API verificadas. Es una copia interna de datos.
- CI de GitHub no devolvió ejecuciones para el commit ni para el merge ref
  durante la comprobación. Las dos pruebas Ruby siguen pendientes de ejecución;
  no se presentan como pasadas. El preview Vercel falla con el ENOTFOUND del
  backend original; esta entrega todavía no cambia su dirección.

## Continuación: reconstrucción autorizada

Ruling: el usuario pide seguir sin el backup original; la instalación nueva usa
Spree 5.6.1 sin fingir que sea la versión del sandbox. Coste si difiere: revisar
compatibilidad del contrato API antes de conectar el storefront.

- [x] Destino nuevo creado por el usuario y SQL comprobado.
- [x] Runtime oficial fijado y configuración de guardas/S3 preparada; build pendiente.
- [x] Copiar catálogo a staging privado y verificar checksums (15.097 registros).
- [ ] Conectar credenciales por canal privado, migrar esquema Rails y configurar tienda.
- [ ] Importar borradores, verificar medios y reconciliar nuevas correspondencias.
- [ ] Validar jobs durables y compra antes de tráfico.

No reemplazar el plan de restauración si posteriormente aparece el dump.

## Ejecución del 20/10: producción autorizada

El usuario ha pedido Production expresamente y ha guardado las credenciales.
`dpl_Gn9scPR4FRF3w41Ldv4n5iNJt9Sp` conecta con Supabase y detecta 185
migraciones pendientes; el fallo de contraseña del despliegue anterior está
resuelto. No se ha cambiado el dominio ni el frontend.

Ruling: usar un daemon de inicialización separado, con la imagen ya construida
fijada por digest, para ejecutar las migraciones bajo las guardas existentes.
Vercel no ofrece release_command y el conector sigue sin acceso al proyecto;
este mecanismo utiliza las variables del deployment sin leer secretos ni
ejecutar migraciones en el proceso web. Coste si falla: el backend continúa
bloqueado y hay que detener el daemon; el staging canónico queda separado.

- [x] Probar el fallo seguro de la operación y desplegarla en Production.
- [x] Verificar tablas y migraciones, detener el daemon y fijar instancias a cero.
- [ ] Configurar tienda, importación, worker durable y pruebas de compra.

Evidencia: Production `dpl_GBHcQt8aysBZouekFV7cbuX4zp5B`, commit `929c1a2`.
Inicialización completada a las 12:12:12 UTC, 185 migraciones, 155 tablas,
0 tiendas, 15.097 registros de staging intactos y 0 medios subidos. Daemon
verificado en 0/0 instancias; `/up` devuelve la página verde de Rails.
PORT=3000 guardado como Config en Production. 887 pruebas existentes pasan,
17 pruebas operativas pasan (2 Ruby omitidas), TypeScript y revisión sin
hallazgos importantes. Minor diferido: prueba específica del fallo de la
guarda ejecutada por rails runner; la orden precede a db:migrate bajo set -e.

Verificación: 887 pruebas existentes pasan, TypeScript sin errores; 14 pruebas
Node de migración/arranque pasan y 2 de Ruby se omiten por falta de runtime local.
Los tres checksums de staging coinciden con el checkpoint de las 13:54:21 UTC.
Los tres roles API no tienen acceso al esquema ni SELECT; el advisor solo
informa RLS sin policies en las dos tablas privadas (denegación intencionada).
Revisión independiente: sin hallazgos Critical/Important en la preparación.
El host de medios se toma de RAILS_HOST o VERCEL_URL; queda documentado y
pendiente de verificación en un despliegue real.


## Reanudación 20/10, 18:21 CEST

Production de configuración: `dpl_8ue3csCiLrCR96GAc1iftkgig4MH`, commit
`49963f2`. El build terminó correctamente, pero la operación falló con
`Market countries is invalid`: el callback de `default_country_iso` crea
un mercado cuyo país debe estar cubierto por un método de envío.
La transacción volvió atrás; SQL al reanudar confirma 0 tiendas, 0 productos
y 15.097 registros privados intactos.

Ruling: configurar el país por la asociación `default_country` y los defaults
EUR/es, soportados por Store y Current de Spree 5.6.1; aplazar Market hasta
definir cobertura y tarifas reales. No saltarse validaciones ni crear portes
ficticios. El seed Countries sólo añade referencia geográfica, sin cuentas,
claves, productos, impuestos ni pagos.

La corrección queda preparada en la rama, sin cambiar main ni ejecutar la
operación. El entorno de ejecución y navegador dejó de estar disponible;
TypeScript y la ejecución real quedan pendientes. El conector de Vercel ya
había denegado acceso al proyecto y no se presupone que haya cambiado.

Siguiente ejecución: construir y promover esta rama al backend nuevo; ejecutar
configure_store una vez, verificar Store/default country/default channel y
acceso a /admin, y detener la operación. Después recuperar los cambios locales
de import_catalog/worker del workspace anterior antes de reconstruir archivos.
Preflight del staging: 106 productos sin variantes; una familia con 2 variantes
ambiguas (sin opciones / Inglés) se conserva para revisión, sin inventarlas.

Revisión de la corrección: sin Critical/Important para publicarla sólo en draft.
Matiz verificado: Countries/States añaden geografía mundial y el checkout sin
Markets puede listar todos los países. No habilitar venta ni anunciar cobertura
ES-only por estos defaults. Comprobar tienda recargada, cero Markets y canal
persistido después de ejecutar. La revisión anterior no detectó la dependencia
de MarketCountry; la evidencia del fallo real prevalece.

## Recuperación real del 21/10

- [x] Configurar la tienda ES/EUR/es, un canal y cero Markets pendientes de portes.
- [x] Corregir el locale de contenido de las operaciones y el nombre base de Store.
- [x] Importar 5.000 borradores, 5.013 variantes canónicas y 2.458 precios EUR.
- [x] Reconciliar nombres, SKU, opciones y precios: cero diferencias por SQL.
- [x] Verificar cero publicaciones y cero stock físico/backorders inventados.
- [x] Recuperar diez imágenes primarias y leer de nuevo sus bytes desde Supabase.
- [x] Worker con cuatro procesos vivos, 60 derivados y 132 jobs completados sin fallos.
- [x] Ampliar a 100 imágenes, optimizar las 90 nuevas a WebP y releer las diez iniciales.
- [ ] Configurar acceso del propietario y credenciales de las integraciones.
- [ ] Resolver capacidad de conexiones; probar Market, envíos, pagos y compra.
- [ ] Conectar storefront, transferir mappings y reactivar bots tras las pruebas.

Evidencia de Production: `dpl_BEc3SKJdjppKfAtNUFjSwYnhoVSd`, commit `6692719`.
Los 15.097 registros privados conservan los tres checksums originales usando
`md5(string_agg(md5(payload::text), '' ORDER BY source_id))` por tabla.
Una familia con dos variantes ambiguas queda sin mapear para revisión; se
mantienen sus datos originales. No hay cuentas de administrador ni se ha
cambiado el dominio de la web.

Incidencia operacional: el pooler de sesión rechazó conexiones con
`EMAXCONNSESSION`, límite 15, durante el solapamiento del despliegue. Se detuvo
la operación, se pausó temporalmente el worker y se continuó secuencialmente.
Después se reactivó el worker y se comprobaron los derivados de imágenes.
No se ha contratado capacidad adicional ni se ha cambiado el aislamiento SQL.

El importador de catálogo se dejó de nuevo en 0 tras verificar los recuentos.
Los medios iniciales ocupan 4.347.601 bytes incluyendo sus 60 derivados.
El formulario seguro de acceso al panel de Supabase se interrumpió sin resultado
confirmado; el conector SQL sigue operativo y permitió continuar la recuperación.

Actualización del 21/10 a las 16:12 UTC: 100 assets y 100 asociaciones, 508
derivados registrados, 674 jobs completados, 20 fallidos y 540 listos. El worker
se pausó tras SIGKILL por memoria y errores de cuota S3 429/SlowDown; queda
pendiente reintentar esos medios y comprobar la concurrencia reducida a uno.
Un job histórico de housekeeping falla por `SolidCable::Message.prunable`,
ausente en la versión fijada 4.0.2; el contenedor corrige la programación futura
al scope oficial `trimmable`, conservando el fallo histórico para revisión.

## Catálogo público solicitado el 22/10

El usuario insiste en que no hay productos visibles. El objetivo inmediato
pasa a ser navegación de catálogo con precios recuperados y stock sin validar
incomprable, manteniendo pendiente la apertura de venta y los bots. La cuenta
de administración no bloquea técnicamente esta navegación. Se mantiene main.

- [x] Confirmar ambos fallos: frontend usa backend antiguo y Home sólo carga ofertas/prerreservas.
- [x] Test Ruby de selección observado rojo en `91c79cc`; verde en build de `c5bf58c`.
- [x] Preparar publicación guardada de 2.315 productos y clave publishable por canal, sin stock/preventas.
- [x] Separar pool general y merchandising en Puck, compartiendo datos publicados con el editor.
- [x] Test de grid observado rojo y luego verde; 891 pruebas pasan con el ajuste de variantes.
- [x] Terminar publicación y verificar 2.315 activos, clave pública y operación en 0/0.
- [ ] Verificar Store API, Preview y navegación/ficha públicas antes de confirmar recuperación visible.
- [ ] Comprobar memoria/conexiones y reintentar los 22 jobs fallidos; mantener cron pausado hasta migrar integraciones.

Deployment web previo para rollback: `dpl_8GRCL8Dk1ij14KcWWgvFAY5wcGDF`.
La fuente Puck `pages.home` conserva los cinco bloques originales y añade
`home-general-catalog`; se añade un enlace Ver catálogo al hero sólo si no
tenía botón principal. No se inventa disponibilidad física para rellenar Home.

### Aclaración comercial y bloqueo de Vercel

El usuario indica que los artículos sin stock físico permanecen publicados y
se sirven con preparación de 2–3 días. La ficha recupera la traducción existente
`extendedFulfillment` para la variante comprable sin stock, excluyendo preventas.
No cambia el permiso de compra de Spree, precios ni carrito. Cinco regresiones
verifican stock físico, proveedor, preventa, agotado y stock de variante frente
al agregado del producto. Dos fallaron antes del parche; las ocho pruebas de
la ficha pasan después. Suite completa: **896 pruebas / 90 archivos**, TypeScript
sin errores. La venta bajo pedido aún requiere reactivar la integración real.

Evidencia del catálogo: Production backend `dpl_8zhVjuMBZW7LygEHorufDW4Wi847`,
operación terminada a las 06:03:11 UTC. Preview de la rama tiene URL y clave
publishable nuevas; Production frontend conserva sus variables anteriores.
El build `dpl_EL2Q8Dd7CJtQbWq7JxUyCvh6p9fd` se solicitó por SHA y por eso
no tomó las variables específicas de rama: falló ENOTFOUND al host antiguo.
La siguiente solicitud por rama devuelve **402 resource_creation_blocked**;
el panel confirma **Deployments Paused / Fluid Active CPU / Hobby fair use**.
No hay corte del storefront ni verificación pública completada. Todos los
daemons de operaciones y el worker están a cero; el cron canónico sigue pausado.

Las ofertas de ambos distribuidores llegan como máximo al 15/10; ninguna es
vigente respecto de sus límites de caducidad. No abrir todos los backorders
por SQL ni alargar artificialmente la caducidad. Tras resolver el bloqueo:
desplegar por nombre de rama, verificar la API y catálogo, migrar credenciales
scoped y mappings, refrescar proveedores, reconciliar stock bajo pedido y probar
el protocolo de preparación, además de Market/envíos/pagos antes de compra real.

## Continuación durante la pausa: ensayo de integración (22/10)

- [x] Revalidar 5.000 productos / 5.013 mappings; cero correspondencias sin verificar.
- [x] Comprobar propietarios de registros nuevos, SKU y padres canónicos: cero faltantes.
- [x] Comparar origen y checkpoint: identidad, revisión, SKU, opciones y precio intactos; solo 26 updated_at distintos.
- [x] Preparar generador de ensayo reversible y exportador sin secretos.
- [x] Ensayar realmente los IDs en las tablas canónicas y heredada de Devir; verificar ROLLBACK con huellas completas.
- [x] Probar rechazo de duplicados, mezcla de tipos, SQL inyectado, campos no escalares y propiedades heredadas; once pruebas pasan.
- [x] Verificar rutas y permisos contra el código oficial del backend fijado.
- [ ] Resolver o aislar las dos variantes ambiguas también referenciadas por Devir antes de habilitar el worker.
- [ ] Crear credencial del backend nuevo y probar HTTP; ejecutar corte coordinado una vez levantada la pausa.

El ensayo inicialmente detectó dos pares heredados sin variante nueva. Se
corrigió la expectativa para conservar juntos ambos IDs y mantenerlos pendientes;
no hacer una migración parcial de su padre. El resultado final valida 5.000 /
5.013 y devuelve ready_for_cutover=false, siempre con ROLLBACK. Las huellas
posteriores de origen son 08419a6e1fd6ca51e88e49ada8911f4c para productos y
0292a7a4cb1cba694be51db62fd0019b para variantes, iguales a las anteriores al
ensayo. No se escribió disponibilidad ni stock ni se alteraron precios.

La API de Vercel sigue devolviendo 402 resource_creation_blocked al solicitar
el build por nombre de rama. La Edge Function existente sigue en v134; su cron
está pausado. Preview conserva URL y clave pública específicas de la rama.
SQL confirma cero categorías, Markets, métodos de envío, métodos de pago y
cuentas admin en el destino: son tareas pendientes, no configuración ya migrada.

Revisión independiente: corregidos el acceso heredado a PREFIX, las colisiones
transitorias de UNIQUE en intercambios de IDs y el falso resultado de éxito de
un ejecutor que continúe tras errores. El SQL libera referencias mapeadas dentro
de la transacción, preserva las demás y emite validación antes del ROLLBACK.
Ensayos PostgreSQL con el fragmento real: intercambio de dos IDs y ciclo de
tres pasan; la versión anterior fallaba UNIQUE. La guarda de URL incorrecta
falla sin resultado de éxito. El ensayo completo final pasa y una consulta
independiente confirma de nuevo las huellas originales. El revisor vuelve a
comprobar las once pruebas Node y no encuentra defectos importantes pendientes.
