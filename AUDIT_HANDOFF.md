# Sesión activa — preparación de apertura — 10/10/2026

Este bloque es el estado vigente; los apartados de septiembre de abajo son históricos. Reanudar desde el primer pendiente sin repetir trabajo ya verificado.

## Autorización y reglas vigentes
- El propietario pide retirar las referencias públicas a identificadores personales, corregir fallos de web, integrar el bot y después corregir Stripe, tiempos de espera y catálogo incompleto. No introducir identificadores personales como requisito de publicación.
- Autorizado integrar los cambios verificados del bot en main (PR #71), incluyendo correcciones de la web y privacidad. Los siguientes arreglos de Stripe/bot también están autorizados. No realizar cargos ni enviar mensajes a clientes.
- Mantener Spree como fuente comercial, reutilizar ingesta/selector canónico, preservar PVP manuales, márgenes y cantidades físicas; no cerrar rastreos parciales ni inventar SKU/stock.
- Documento operativo: este archivo. Pendientes visibles: TODO.md. Reglas del bot: CATALOG_SOURCING.md y TCGFACTORY_SYNC.md. Actualizar evidencias/commits/despliegues tras cada hito y antes de compactar.

## Punto de partida comprobado
- Rama local y remota: fix/full-tcgfactory-catalog, HEAD e4d7195268f1df7ad52c575131c26de2ed7d8fc5; PR #71 abierta. main/Vercel producción da6dc652d79632963a137bed80b942b35b32834a. Repo limpio al iniciar.
- Supabase ikglqbjlbkbaronbiryl: devir-sync v132, autenticación propia, cron cada minuto habilitado. Código de PR #71 desplegado y migración de cursor aplicada.
- TCGFactory a 20:29 UTC: running, sección tcg, página6/12, offset12,147 descubiertos,92 procesados,0 fallos. Cinco familias configuradas; barrido completo todavía pendiente.
- Devir: ciclo ec1fa70a-a1c2-4046-912a-bdd391629db5 terminado parcial,16 fichas sin SKU y1 URL404 de presentación Akropolis. Siguiente ciclo 10/10 01:49 UTC. 605 ofertas antiguas Devir y12 TCG fuera de vigencia; seleccionadas caducadas0; alternativas elegibles más baratas ignoradas0.
- Desde 18:06 UTC:135 respuestas cron200,5 timeouts120s. La función sigue avanzando. Examinar presupuesto total y tareas de mantenimiento combinadas; no basta subir timeout.
- Vercel: errores recientes en fichas (resume div frente a __next_metadata_boundary__) y políticas (Spree401). Next instalado16.2.11, cacheComponents habilitado. Agente diagnose_web_runtime investiga causa, sin editar inicialmente.
- Stripe BisonTCG acct_1UDiVZHU3Etzdhlg, live: webhook habilitado en dominio raíz, devuelve308 a www; solo payment_intent.succeeded. Código atiende también amount_capturable_updated y canceled. No cambiar secreto de firma ni efectuar cargos.
- Catálogo/ficha/carrito/checkout/Stripe Element comprobados en www; carrito temporal vaciado, ningún cargo. Editor exige contraseña; API logística devuelve401 sin token. Sitemap/0.xml200,5688 URLs,18.4s en segunda comprobación. ES/FR/PT y políticaEN200.
- Baseline:544 pruebas/57 archivos y tsc pasan. E2E de checkout saltado por credenciales de prueba; no atribuir compra real verificada.

## Plan y registro de ejecución
- [x] Retirada lectura/salida pública del identificador fiscal en src/lib/legal/spain.ts; prueba con valor ficticio configurado demuestra que no aparece en HTML (RED→GREEN).
- [ ] Diagnosticar errores de fichas/políticas; reproducir o contrastar upstream, fijar regresiones y corregir causa mínima en rutas/data/config existentes.
- [ ] Pruebas completas, tsc, lint, revisión independiente; push rama, actualizar PR #71 al alcance final, merge autorizado y verificar Vercel READY del SHA integrado.
- [ ] Stripe: cambiar URL existente directamente a www y suscribir los tres eventos atendidos; verificar configuración y respuesta HTTP/firma sin cargos.
- [ ] Bot: corregir presupuesto global/justicia de tareas; demostrar timeout controlado/checkpoint/no retiros parciales. Desplegar y comprobar cron y avance real.
- [ ] Reanudar ciclo completo fresco de Devir y completar cinco familias TCG sin duplicados ni publicaciones de excepciones; documentar conteos/cobertura, exclusiones reales y límites pendientes.

Estado actual (reanudar aquí): privacidad en commit191ea68. Web implementada: htmlLimitedBots conserva lista oficial y añade Googlebot para evitar el árbol incompatible al reanudar PPR; fallback de políticas conocidas a contenido español existente solo ante Spree401/5xx. 559 pruebas/59 archivos pasan; tsc pasa; lint0 errores,240 avisos/3informaciones preexistentes. Revisión independiente antes de merge en curso. Build local no comprobable: Node/Next fallan en uv_resident_set_memory por entorno; exigir buildREADY de Vercel del SHA nuevo.

El acceso al preview protegido fue rechazado por revisión automática: la herramienta creaba un enlace temporal de acceso. No eludir la protección; comprobar producción pública tras merge autorizado. No afirmar preview verificado.

Bot: trabajo aislado en ../bot-runtime rama fix/bot-runtime-budget, basado191ea68. Cambios incompletos de index.ts y pruebas runtime retomados por finish_bot_budget; no desplegar sin terminar/regresiones/revisión. Deadline local por petición95s, fetch/body/retry acotados, defer seguro, mantenimiento global por turno, checkpoint de descubrimiento por grupos. Nueva columna global maintenance_turn default0 necesaria; aplicar migración antes de código. CLI Supabase2.120.0 fallaSIGABRT/Bun al ejecutar --help; documentar fallback de creación de migración si no funciona. WallClockTime de Supabase mide vida del worker (puede incluir varias llamadas), no prueba por sí solo un timeout de petición.

Próximo: guardar y subir web+docs, esperar revisión/build/CI, integrarPR71; verificar título Googlebot y políticas públicas; corregir webhook Stripe existente; terminar/desplegar presupuesto bot y verificar avance fresco de ambos proveedores. Ningún cambio web nuevo desplegado aún. El propietario autoriza continuar sin preguntas rutinarias.

---

# Historial — auditoría Bisontcg — 24/09/2026

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
