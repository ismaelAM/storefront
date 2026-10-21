# BisonTCG Spree: instalación nueva

Este directorio es el root del proyecto Vercel `bisontcg-spree`. Es una
reconstrucción independiente, no una restauración de clientes/pedidos del
sandbox. La imagen oficial Spree 5.6.1 está fijada por digest amd64 y su
configuración OCI confirma Ruby 4.0.1, `/rails` y usuario `1000:1000`.
`vercel.json` fija expresamente `framework: container`: el proyecto vacío
creado desde el panel heredó Other y produjo un despliegue sin construir Rails.

## Conexión privada

Guardar estas variables únicamente en el proyecto **bisontcg-spree**, nunca
en Git, comentarios ni variables `NEXT_PUBLIC_`:

- `DATABASE_URL`: conexión **session pooler**, puerto 5432, usuario
  `postgres.dtrospakebdiqihhcrub`, base `postgres`, con `?sslmode=require`.
  Usar la cadena exacta del panel Connect; codificar caracteres reservados de
  la contraseña. No usar el transaction pooler 6543.
- `SECRET_KEY_BASE`: secreto aleatorio nuevo, estable entre despliegues.
- `SUPABASE_S3_ACCESS_KEY_ID` y `SUPABASE_S3_SECRET_ACCESS_KEY`: credenciales
  del S3 del proyecto nuevo; dan acceso servidor y no deben llegar al cliente.

`RAILS_HOST` admite el dominio estable del backend (solo host, sin protocolo).
Mientras se prueba el preview, el inicializador usa `VERCEL_URL` si falta
`RAILS_HOST`. Verificar las URLs absolutas desde el storefront antes del corte.

El bucket `spree-media` será privado. Rails usa URLs firmadas para servir medios.
El endpoint S3 y la región se fijan al destino nuevo. El proceso web exige todos
los secretos y rechaza migraciones pendientes; nunca ejecuta `db:prepare`,
seeds ni importa datos al arrancar.

## Esquema inicializado; configuración comercial pendiente

El 20/10 se verificó la conexión real de Production: la contraseña ya funciona
y Rails detecta 185 migraciones pendientes. El daemon `initialize` ejecuta
solamente las guardas y `db:migrate`, reutilizando por digest el contenedor
que ya se construyó en este proyecto. Recibe las variables privadas del mismo
deployment. No expone HTTP ni crea usuarios, tienda, muestras o catálogo.
Terminó el 20/10 a las 12:12:12 UTC: 185 migraciones y 155 tablas verificadas
en el esquema `spree`. Se escaló a cero y `instances.dub1` queda a cero en Git.
El endpoint `/up` ya devuelve la página verde de Rails. No es el worker de jobs.
Este paso utiliza la cuota Hobby existente, sin contratar un plan nuevo.

Configurar también `PORT=3000` como Config en los ajustes del proyecto:
Vercel resuelve el puerto desde esos ajustes, no desde `ENV` del Dockerfile.

Fuentes: https://vercel.com/docs/daemons y
https://vercel.com/docs/daemons/config-reference.

La operación `configure_store`, inicialmente detenida, crea únicamente la tienda
BisonTCG (ES/EUR/es), un canal, categorías de envío y almacén sin existencias.
Usa una transacción, las dos guardas de destino y comprobaciones de configuración.
No crea cuentas ni claves. `no-reply@bisontcg.com` es una configuración técnica;
los envíos de correo siguen deshabilitados hasta validar el remitente real.
No configura impuestos, pagos, transportistas ni stock a partir de proveedores.
El país se configura mediante `default_country`, compatible con Spree 5.6.1.
El mercado queda pendiente hasta configurar los transportistas y tarifas reales:
`default_country_iso` intenta crearlo inmediatamente y `MarketCountry` exige
cobertura de envío. No se añade un envío ficticio ni gratuito para pasar esa
validación. La Store conserva ES/EUR/es mediante los fallbacks oficiales.
Countries/States añaden referencia geográfica mundial: sin Markets, Spree puede
listar todos esos países en checkout. Esta configuración sirve para reconstruir
y administrar borradores, no acredita venta ni cobertura limitada a España.
Mantener el storefront y el bot sin conectar hasta validar Market, envíos y pagos.
Después de ejecutarla hay que dejarla de nuevo en cero.

Con el mismo contenedor y sus secretos, verificar primero:

```sh
ruby target.rb
./bin/rails runner ./target.rb
./bin/rails db:migrate
```

El destino debe contener los esquemas privados creados por
`../spree-migration/reconstruction.sql`. Rails usa `spree,extensions`.
La inicialización comercial debe crear la tienda BisonTCG con país, idioma,
moneda y configuración reales, sin `sample-data` ni los defaults USD/US/Shop.
La copia `spree_recovery.source_records` no crea aún productos de Spree.
Las nuevas correspondencias van en `destination_mappings`; no sobrescribir
`spree_product_id`/`spree_variant_id` en el proyecto canónico anterior.

## Recuperación verificada el 21/10

Production `dpl_BEc3SKJdjppKfAtNUFjSwYnhoVSd` contiene la tienda BisonTCG,
ES/EUR/es y un canal. La importación ha creado 5.000 productos borrador,
5.013 correspondencias de variantes y 2.458 precios EUR de `last_auto_price`.
SQL confirma cero diferencias en nombres, SKU, opciones y precios recuperados,
cero publicaciones y cero stock vendible. Los 106 productos sin variantes y
la familia ambigua de dos variantes permanecen conservados para revisión;
las dos variantes ambiguas no se han inventado en Spree.

Las operaciones fijan `Spree::Current.content_locale` además de I18n: fuera de
HTTP, usar sólo `I18n.with_locale(:es)` dejaba sin escribir las columnas base.
`configure_store` también repara el nombre base de la tienda existente.

El primer lote de medios verificó diez asociaciones mediante SHA256 y lectura
real del objeto privado. Solid Queue procesó sus 60 derivados, con 132 jobs
completados y ningún fallo en la comprobación posterior. Son fotos primarias;
esto no acredita la recuperación de todas las galerías.

El lote se amplió a 100 asociaciones verificadas el 21/10 a las 16:00 UTC.
Las 90 imágenes nuevas son WebP, de hasta 1200 píxeles, y las diez primeras
se volvieron a leer tras desplegar. Las galerías restantes siguen en staging.
Durante la generación posterior de miniaturas se observaron SIGKILL con más
de 1 GiB de memoria y respuestas S3 429/SlowDown. Se pausó el worker: el último
recuento fue 674 jobs completados, 20 fallidos y 540 listos; no confundir este
estado con el lote inicial sin fallos. El worker limita ahora JOB_THREADS y
JOB_CONCURRENCY a 1; verificar memoria, cuota S3 y reintentar los trabajos de
medios fallidos desde Solid Queue tras confirmar el acceso del propietario.
El registro fallido de housekeeping usa un scope inexistente en Solid Cable
4.0.2; el contenedor de operaciones corrige `prunable` por `trimmable` con una
comprobación del texto original. Ese cambio no reescribe el job histórico.

El alta de administrador usa el formulario de la aplicación host y
`main_app.admin_user_registration_path`. Devise comparte el mapping admin_user
entre host y engine; se incluye la misma vista en ambas carpetas scoped
(admin_users y admin_user). El formulario no asigna roles automáticamente.

Las operaciones `configure_store`, `import_catalog` e `import_media` se arrancan
en Production escalando únicamente `dub1` de 0 a 1. Tras verificar el resultado,
hay que escalarlas a 0: el proceso duerme después de terminar. Todos los defaults
de Git son 0 para que un Preview no ejecute la reconstrucción. `worker` ejecuta
`bin/jobs` y se mantiene en 1 en Production cuando se procesan trabajos.

El session pooler tiene un límite de 15 clientes: durante una promoción,
el solapamiento de workers y peticiones HTTP agotó las conexiones. Para la
reconstrucción se pausó el worker, se ejecutaron las operaciones una a una y
después se reactivó. Antes de conectar tráfico hay que resolver/verificar ese
presupuesto de conexiones bajo carga y durante despliegues.

El cron canónico `devir-cloud-sync-tick` sigue pausado. Antes de reactivarlo:
verificar credenciales del backend nuevo, transferir las correspondencias
canónicas y probar los contratos reales; no apuntarlo a IDs del sandbox antiguo.

## Condiciones antes de producción

- Configurar y comprobar un procesador durable de Solid Queue. El web
  desactiva `SOLID_QUEUE_IN_PUMA`; Vercel puede escalar a cero.
- Importar productos/variantes como borradores, conservando opciones y SKU.
- Recuperar fotos y comprobar lectura después de otro despliegue.
- Reconciliar precios manuales y `last_auto_price`; no inferir stock físico
  a partir de unidades disponibles en un distribuidor.
- Probar productos, variantes, medios, impuestos, carrito y checkout aislado.
- Configurar correo expresamente: está desactivado durante la reconstrucción.
- Cambiar bot, storefront, webhooks y dominio solo después de estas pruebas.

Pruebas locales de guardas: `node --test ops/spree-backend/start.test.mjs
ops/spree-migration/migration.test.mjs`. Los tests Ruby de catálogo y medios
se ejecutan durante el build con el runtime fijado. Un test de shell no acredita
Rails, S3 ni el checkout: contrastar siempre los recuentos y las operaciones reales.
