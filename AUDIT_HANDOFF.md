# Continuidad de la auditoría Bisontcg — 24/09/2026

## Leer primero
Este documento describe el código incluido en PR #57. El resultado definitivo del merge y despliegue se registra en outputs/BISONTCG-CONTINUAR.md de la tarea Codex. No confundir código integrado con producción comprobada.

## Decisiones del propietario
- TcgFactory Restock NO es disponibilidad vendible. Sí se permite vender si existe stock físico u otra fuente válida.
- Pulsar Publicar en Spree es la aprobación humana; no tiene que quitar etiquetas. La siguiente sincronización reconoce los motivos ya presentados. Motivos nuevos vuelven a requerir revisión.
- Autorizado integrar cambios verificados en main. Conservar cambios ajenos y el stock físico real.

## Implementado
PR #57 incluye las correcciones de disponibilidad del #56, conservación de stock físico, protección frente a rastreos incompletos, Restock público/autenticado y aprobación desde Spree. También incluye correcciones de carrito, checkout, pagos, autenticación Puck, metadatos y paginación BISON3. No volver a integrar #56 por separado.

Archivos principales: supabase/functions/devir-sync/index.ts; supabase/functions/_shared/{catalog-publish-policy,tcgfactory-adapter,tcgfactory-web}.ts. Documentación de reglas: CATALOG_SOURCING.md y TCGFACTORY_SYNC.md.

Se guarda catalog.review_pending_fingerprint en campos privados de Spree. Primero se confirma el paso a borrador y después se escriben nuevos motivos, para evitar aprobar automáticamente una revisión tras un fallo parcial. Los rechazos explícitos se mantienen. Las aprobaciones admiten que desaparezcan motivos, pero no motivos nuevos.

## Validación realizada
56 archivos / 466 pruebas pasan; TypeScript storefront pasa; comprobación estática TypeScript Edge pasa (stub de Deno y paquete Supabase instalado); lint sin errores, 238 avisos y 1 información. Revisión independiente de los dos últimos fallos corregidos. No se ejecutó Deno real ni checkout E2E: el job de GitHub puede estar verde con pasos saltados por falta de credenciales Stripe de prueba.

## Producción observada antes de integrar
Supabase ikglqbjlbkbaronbiryl: devir-sync v118, verify_jwt=false con autenticación propia. A las 11:45 UTC del 24/09: enabled=true, phase=error, ciclo ba279db8-240f-48e7-9641-dc576d04c2db; último éxito 22/09 03:56 UTC. Cron cada minuto. Había trabajos processing abandonados; no se han reencolado ni inventado existencias.
Vercel: proyecto prj_mATswKVd2PKLnYewwoVlgS8SrSCN, equipo team_u0EdCclID0csvEJ2EVkhpTtd. Producción observada c8565ba (cambio legal del propietario).

## Próximos pasos, una tarea pequeña cada vez
1. Confirmar merge #57 y SHA de main; comprobar deployment Vercel de ese SHA. Obtener devir-sync desplegado y comparar el contenido exacto con main, incluyendo todos sus imports _shared. Si sigue v118, desplegar desde main conservando autenticación actual. No asumir que merge despliega Edge Functions.
2. Reparar exclusión mutua y recuperación del bot. El bloqueo global actual sólo usa lock_until, sin propietario/token ni renovación; release_lock puede liberar el bloqueo de otro trabajador. Los trabajos processing no se recuperan. Añadir token de propietario, liberación condicional y recuperación de leases expiradas con pruebas de dos trabajadores concurrentes. No reencolar masivamente con trabajadores activos. run-now no arregla un ciclo activo en error.
3. Tras esa reparación, recuperar UN ciclo controlado y verificar con lecturas de Spree: Restock como única fuente -> borrador/sin venta; Restock más stock físico o Devir válido -> sigue vendible; publicar revisión -> se aprueba en el siguiente ciclo y sigue actualizándose; motivo nuevo -> vuelve a revisión. Comprobar que cantidades físicas no cambian. No ejecutar barridos masivos para probar.
4. Stripe: verificar endpoint directo www (el dominio raíz devolvía 308), entrega firmada real y permisos de la clave general de Spree. Persisten riesgos de concurrencia y caída entre POST de pago y PATCH de metadatos; resolver con idempotencia persistente y pruebas de reintento antes de dar pagos por cerrados. No efectuar cargos de prueba en producción.
5. Terminar auditoría general por áreas con alcance acotado. No está completada toda la revisión de Git/Supabase/Vercel/Stripe/Spree.

## Comandos y precauciones
Desde el repositorio: git status; git fetch origin; crear rama nueva desde origin/main. pnpm test; pnpm exec tsc --noEmit; pnpm lint. En esta máquina git fetch requiere git -c http.sslBackend=openssl fetch origin. Vitest Windows se ejecutó con node node_modules/vitest/vitest.mjs run --config ../vitest.audit.mjs --configLoader native; en CI Linux usar scripts normales.
No aplicar stash bisontcg-audit-before-main-75641ed; no reutilizar puck_editor. Las ramas audit/local-checkpoint-2026-09-23 y audit/stock-checkpoint-2026-09-24 son copias históricas, no pendientes que haya que integrar. No borrar stock_items ni reproducir total_on_hand en una ubicación. Brujaluz fue corregido por el propietario con stock=0 y backorderable=true: preservar ese significado.

## Prompt breve para continuar con otro modelo
Lee AUDIT_HANDOFF.md y AGENTS.md. Comprueba main, PR57 y versiones desplegadas sin repetir la auditoría. Trabaja únicamente en el paso pendiente más prioritario: bloqueo con propietario y recuperación segura de trabajos processing. Escribe pruebas de concurrencia/expiración, un PR pequeño y actualiza este documento con evidencia. No publiques cambios de catálogo masivos ni inventes stock.
