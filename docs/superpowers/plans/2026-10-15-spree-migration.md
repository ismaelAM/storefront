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
