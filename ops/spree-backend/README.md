# BisonTCG Spree: instalación nueva

Este directorio es el root del proyecto Vercel `bisontcg-spree`. Es una
reconstrucción independiente, no una restauración de clientes/pedidos del
sandbox. La imagen oficial Spree 5.6.1 está fijada por digest amd64 y su
configuración OCI confirma Ruby 4.0.1, `/rails` y usuario `1000:1000`.
`vercel.json` fija expresamente `framework: container`: el proyecto vacío
creado desde el panel heredó Other y produjo un despliegue sin construir Rails.

## Conexión privada pendiente

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
ops/spree-migration/migration.test.mjs`. Un test de shell no acredita que Rails
ni S3 funcionen: siguen pendientes el build y la prueba real con secretos.
