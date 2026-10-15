# Recuperación y traslado de Spree

## Objetivo acordado

Conservar Spree, su gestor de productos y la web de BisonTCG. Trasladar el
backend fuera del sandbox a un alojamiento propio, con PostgreSQL en un
proyecto separado de la organización Supabase **Bisontcg**. Mantener
`www.bisontcg.com`; proponer `admin.bisontcg.com` para gestión cuando se haya
comprobado la restauración. No podemos trasladar el subdominio de `spree.sh`.

## Evidencia del 15/10/2026

- Main `f937c3b30dc2e82f19e70c010ea3ac50904c9efa`; 887 pruebas pasan.
- `bisontcg.spree.sh` y `console.spree.sh`: NXDOMAIN en Google y Cloudflare.
- Supabase `ikglqbjlbkbaronbiryl` está operativo: 5.000 productos canónicos,
  5.015 variantes, 5.082 ofertas de proveedores y cuatro páginas.
- Esa base no tiene tablas `spree_*`. No es un backup completo de Spree.
- Este repositorio contiene el storefront, no el código/configuración exactos
  del backend del sandbox. El starter upstream actual usa Spree 6 prerelease;
  copiarlo sería introducir una actualización ajena a la recuperación.

## Arquitectura

Mantener el storefront Next.js en su proyecto actual de Vercel. Preparar un
proyecto Vercel independiente para el servidor Rails en Container Runtime,
reutilizando **la imagen exacta del servidor de origen fijada por digest**.
PostgreSQL y archivos deben ser persistentes y estar fuera del contenedor.
El panel sigue siendo Spree; Supabase Studio no lo sustituye.

No seleccionar una versión nueva de Spree hasta recuperar la versión de origen.
Los workers necesitan alojamiento/ejecución independiente: los contenedores
Vercel escalan a cero. Su estrategia se comprobará contra las colas reales
del origen antes de permitir el cambio de tráfico.

## Primera entrega ejecutable

Un verificador de paquete de recuperación comprueba dump PostgreSQL custom,
archivo de medios, SHA-256, inventario de tablas y runtime fijado por digest.
Un generador prepara el directorio desplegable solo después de verificar ese
paquete. Un comparador contrasta el inventario restaurado con el de origen.
No restaura bases automáticamente ni cambia DNS, credenciales, precios,
catálogo o pagos. Fallar si falta evidencia es comportamiento previsto.

## Datos necesarios para la recuperación completa

Dump de Spree, archivos originales de Active Storage, imagen exacta o código
y lockfiles del backend, configuración de almacenamiento, claves necesarias
para descifrado y configuración de workers. Los secretos se transfieren por
canales seguros, nunca por Git, manifiestos públicos o comentarios de PR.
Una extracción por API sería una alternativa parcial con alcance distinto.

## Criterios de aceptación y corte

El paquete debe superar integridad y formato. La restauración debe conservar
IDs y reconciliar productos, variantes, clientes, pedidos y blobs; además hay
que comprobar asociaciones, precios, stock, impuestos, permisos, medios,
workers y checkout con credenciales de prueba. Comparar solo cantidades no
demuestra por sí solo ausencia de pérdidas.

Hasta completar esas verificaciones, no modificar `SPREE_API_URL`, automatismos
de proveedores, webhooks de pagos ni dominios de producción. Preparar rollback
y una copia independiente antes del corte. No prometer migración sin pérdida
mientras falten los datos del origen.

## Ampliación autorizada: reconstrucción del catálogo

El usuario ha pedido continuar sin esperar al backup original y ha confirmado
que el bot recupera las imágenes del distribuidor. Se conserva la ruta de
restauración anterior, pero deja de bloquear la preparación de una instalación
nueva. No se presenta como recuperación de pedidos, cuentas o stock físico.

Destino creado: `dtrospakebdiqihhcrub`, BisonTCG Spree, organización Bisontcg,
PostgreSQL 17, Irlanda, plan gratuito y Data API desactivada. Proyecto Vercel
independiente `bisontcg-spree`, aún sin despliegue ni tráfico de producción.

La instalación nueva usa Spree 5.6.1, imagen oficial por digest y revisión
upstream `86aff8be595f326da2144909cfb5b080a7525e55`. El esquema Rails será
privado (`spree`). El catálogo se prepara en otro esquema privado de destino,
con identidades UUID y payload de origen intactos. Las correspondencias con
nuevos IDs se guardarán separadas: no sustituir IDs antiguos ni redirigir bots.

Active Storage usará un bucket privado de Supabase por S3. No usar disco local
ni productos de demostración. Migraciones y configuración inicial se ejecutan
expresamente fuera del arranque web. Mantener bloqueado el corte hasta probar
medios, procesamiento durable de jobs, precios, inventario y checkout.

El conector Vercel no puede ver el proyecto recién creado (404 por ID y nombre),
aunque el navegador confirma el proyecto y su ID. Se continúa con el navegador
ya autorizado; no se vuelve a intentar la misma llamada sin cambio de acceso.

## Fuentes técnicas

- https://vercel.com/docs/functions/runtimes/container
- https://vercel.com/kb/guide/does-vercel-support-ruby-on-rails-applications
- https://supabase.com/docs/guides/getting-started/quickstarts/ruby-on-rails
- https://supabase.com/docs/guides/platform/migrating-to-supabase/postgres
