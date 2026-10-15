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

## Fuentes técnicas

- https://vercel.com/docs/functions/runtimes/container
- https://vercel.com/kb/guide/does-vercel-support-ruby-on-rails-applications
- https://supabase.com/docs/guides/getting-started/quickstarts/ruby-on-rails
- https://supabase.com/docs/guides/platform/migrating-to-supabase/postgres
