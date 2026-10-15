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
- [ ] Crear proyecto: bloqueado, `get_cost` no está disponible en el servidor MCP.
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

- [ ] Revisar diff y secretos; publicar rama y abrir PR de preparación.
- [ ] Documentar estado real de origen, destino y límites de validación.
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
