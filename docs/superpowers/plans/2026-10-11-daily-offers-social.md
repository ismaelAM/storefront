# Plan de implementación

Diseño: [ofertas e Instagram](../specs/2026-10-11-daily-offers-social.md).

1. Probar y sustituir límite por perfiles con cuotas por cuatro categorías en el worker; conservar recuperación y añadir variante/precio/categoría al estado privado.
2. Validar snapshot público fresco contra Spree: fecha Madrid, rotación terminada, variante exacta, disponibilidad y descuento vigente.
3. Renderizar JPEG con plantilla determinista, descarga protegida y texto listo para copiar; probar dimensiones, escaping y fetch de imágenes.
4. Preparar cliente Meta con pruebas de errores, checkpoints y publicación ambigua; proteger preparación/publicación y persistir exclusión mutua.
5. Revisar cambios, ejecutar pruebas completas/TypeScript y comprobar preview/producción. Desplegar worker solo tras comparar sus archivos con la versión activa y verificar compatibilidad.
6. Documentar accesos pendientes y el uso del panel. No atribuir a Instagram una publicación sin respuesta real de Meta.

Trabajo paralelo autorizado por la guía dispatching-parallel-agents: selección, renderer y cliente Meta tienen archivos separados. La integración, datos y autorización pertenecen al coordinador.
