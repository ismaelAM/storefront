# Traslado de Spree: preparación y recuperación

Estado: **preparación, no restauración ni corte de producción**. El frontend
sigue en Vercel. El backend del sandbox no es accesible por DNS. El usuario
ha elegido un proyecto separado en la organización Supabase **Bisontcg**.

## Qué está comprobado

El 15/10/2026, Supabase conserva 5.000 productos canónicos, 5.015 variantes,
5.082 ofertas de proveedores y cuatro páginas. No hay tablas `spree_*` en ese
proyecto. Esos datos permiten recuperar parte del catálogo, pero no acreditan
la conservación de clientes, pedidos, precios finales, stock o archivos de Spree.

La herramienta `get_cost` del conector devuelve `UNAVAILABLE`; por tanto todavía
no se ha creado ni cobrado un proyecto de destino. No sustituir ese paso por
otra cuenta ni asumir un precio. No hay credenciales de la base de origen,
dump, archivos originales ni versión exacta del backend disponibles aquí.

Se ha creado una copia interna de las 18 tablas públicas existentes en el esquema
privado `migration_checkpoint_20261015`, con recuentos y checksums de contenido.
Los roles `anon`, `authenticated` y `service_role` no pueden leerla y todas sus
tablas tienen RLS. El SQL operativo se conserva en `checkpoint.sql`; no repetirlo
ni sobrescribir el esquema existente. Esta copia contiene datos, no índices,
constraints, secuencias, funciones o archivos de Storage. Está en el mismo
proyecto y **no sustituye un backup independiente ni copia el backend de Spree**.

## Primero, conseguir el paquete de origen

Pedir al proveedor una copia coherente del mismo instante, incluyendo:

1. Dump PostgreSQL en formato custom (`pg_dump -Fc`), versión de PostgreSQL,
   versión de Spree, extensiones, esquema y recuentos de tablas.
2. Imagen exacta del servidor por digest, o código y lockfiles para reconstruirla.
   Deben incluirse personalizaciones, plugins y configuración de workers.
3. Todos los archivos de Active Storage, conservando claves y nombres de servicio.
   Un listado de URLs remotas no es una copia de esos archivos.
4. Configuración y claves de cifrado necesarias por un canal privado. No enviar
   credenciales por comentarios de PR ni añadirlas al manifiesto.

No crear otro sandbox con productos de muestra como sustituto del original.
No ejecutar `sample-data`, `db:seed`, `db:reset` ni `db:prepare` al recuperar.

Guardar el paquete en una ubicación privada, por ejemplo `.local/spree-recovery/`
(ignorada por Git). Mantener además una copia cifrada independiente fuera de
este proyecto y comprobar que se puede leer. Nunca subir backups al repositorio
público, a `public/`, a imágenes Docker o a artifacts públicos de CI.

El manifiesto JSON contiene exclusivamente:

| Campo | Valor que debe entregar/confirmar el origen |
| --- | --- |
| `schemaVersion` | Número `1` |
| `capturedAt` | Instante ISO 8601 con zona horaria |
| `source.host` | `bisontcg.spree.sh` |
| `source.spreeVersion` | Versión exacta de origen; no adivinarla |
| `source.image` | Referencia de imagen con `@sha256:` y digest real de 64 caracteres |
| `database.file` | Ruta relativa al dump dentro del paquete |
| `database.sha256` | SHA-256 real del dump |
| `database.postgresMajor` | Versión mayor del PostgreSQL de origen |
| `media.file` | Ruta relativa al archivo de medios dentro del paquete |
| `media.sha256` | SHA-256 real del archivo de medios |
| `inventory` | Objeto con los cinco recuentos siguientes, incluidos ceros |

Las claves de `inventory` son `spree_products`, `spree_variants`, `spree_orders`,
`spree_users` y `active_storage_blobs`. Deben proceder de la misma copia, no de
los recuentos de Supabase ni de datos sintéticos. Los tests usan archivos
sintéticos únicamente para comprobar el verificador.

## Comandos disponibles

```bash
node ops/spree-migration/migration.mjs verify .local/spree-recovery/manifest.json
node ops/spree-migration/migration.mjs prepare .local/spree-recovery/manifest.json .local/spree-runtime
node --test ops/spree-migration/migration.test.mjs
```

`verify` comprueba integridad SHA-256 y firma `PGDMP`, no la validez completa del
dump ni del archivo de medios. Usar también `pg_restore --list` e inspeccionar
el contenido antes de importar. Un dump contiene SQL ejecutable: revisar origen,
extensiones y posibles funciones antes de restaurarlo en la base nueva.

`prepare` exige un directorio de salida que no exista. Genera un candidato
Vercel desde el digest de origen y presupone el layout `/rails` de la imagen
oficial. Hay que inspeccionar la imagen real: si difiere, adaptar este generador
con pruebas antes de desplegar. No descarga imágenes ni publica servicios.

El candidato comprueba destino y TLS antes de cargar Rails, y después contrasta
la configuración efectiva de ActiveRecord. Rechaza parámetros URL duplicados,
overrides de conexión, el proyecto del catálogo actual y el pooler de transacciones.
Aborta ante migraciones pendientes; no actualiza el esquema al arrancar.
La comparación con el inventario original se ejecuta **una sola vez antes del
corte**, con `./bin/rails runner ./migration-inventory.rb`. No se impone al
arranque normal: pedidos o altas posteriores cambiarán legítimamente las cifras.

## Restauración en destino: pendiente de datos y aprovisionamiento

1. Crear el proyecto separado en Bisontcg, preferiblemente cerca de Irlanda,
   después de obtener y aceptar su coste real. El proyecto actual del catálogo
   es `ikglqbjlbkbaronbiryl`: no restaurar Spree sobre él.
2. Ajustar versión de PostgreSQL y extensiones a la copia. Usar una conexión
   dedicada con TLS y mantener las tablas Spree fuera del acceso público del
   Data API. Verificar grants/RLS sin sustituir las reglas de acceso de Rails.
3. Restaurar el dump en la base vacía con herramientas PostgreSQL compatibles.
   No usar `--clean` o `--create` contra un proyecto Supabase gestionado, ni
   importar roles/esquemas de sistema del origen. Revisar primero su contenido.
4. Copiar medios a almacenamiento persistente compatible con el adaptador de
   origen. Mantener claves, service names y adjuntos; comprobar todos los objetos
   inventariados y las variantes de imagen. No usar el filesystem del contenedor.
5. Conservar claves de aplicación/cifrado y configurar secretos en Vercel.
   No cambiar a Supabase Auth: los usuarios y el panel siguen siendo de Spree.
6. Verificar asociaciones, identificadores, precios, stock, impuestos, cuentas,
   pedidos y estado de pagos. Configurar workers durables por separado y probar
   tareas e idempotencia antes de habilitar productores o reintentos.
   `SOLID_QUEUE_IN_PUMA=false` solo desactiva workers si la imagen original
   compara su valor con `true`; hay que comprobar su `config/puma.rb`, plugins,
   inicializadores y entrypoint. No basta con definir esa variable.
7. Generar un JSON de recuentos desde destino y compararlo con la copia:

```sql
SELECT json_build_object(
  'spree_products', (SELECT count(*) FROM spree_products),
  'spree_variants', (SELECT count(*) FROM spree_variants),
  'spree_orders', (SELECT count(*) FROM spree_orders),
  'spree_users', (SELECT count(*) FROM spree_users),
  'active_storage_blobs', (SELECT count(*) FROM active_storage_blobs)
);
```

```bash
node ops/spree-migration/migration.mjs compare .local/spree-recovery/manifest.json .local/restored-inventory.json
```

Recuentos iguales no prueban una recuperación sin pérdidas: reconciliar campos,
relaciones y medios, además de ejecutar pruebas funcionales del negocio.

## Corte y rollback

No cortar hasta superar la restauración y las pruebas completas. Probar preview
con credenciales de pagos de prueba y sin activar notificaciones ni jobs reales.
Reconciliar también Stripe, webhooks, correos, proveedores y automatizaciones de
Supabase que todavía apuntan a Spree; cambiar solo `SPREE_API_URL` sería incompleto.

Cuando todo esté verificado, configurar `admin.bisontcg.com` si está disponible,
mantener `www.bisontcg.com` y cambiar los consumidores de manera coordinada.
No controlamos `bisontcg.spree.sh`. Registrar las variables anteriores de forma
privada y conservar ambas copias para rollback. Como el origen sigue caído,
apuntar de nuevo a él no sería por sí solo un rollback operativo.

## Límites de esta entrega

No se ha restaurado ni trasladado ningún dato de Spree, creado el proyecto de
destino, desplegado Rails, conectado medios, configurado workers ni cambiado DNS
o producción. Este entorno no tiene Docker, Ruby o PostgreSQL CLI; el candidato
requiere build y pruebas reales cuando se obtenga la imagen y el backup.
