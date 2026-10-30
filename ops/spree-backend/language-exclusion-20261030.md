# Exclusión de francés e italiano — 30/10/2026

El propietario excluye las ediciones retail francesas e italianas. Se mantienen español, inglés y otros idiomas; las ediciones multilingües que incluyen español/inglés se conservan. No se decide por país de fabricación o por nombres como French Bulldog/The Italian Job.

Auditoría:23 referencias canónicas, todas con una única variante retail nativa y cero unidades físicas; seis estaban activas y17 en borrador. Algunas tenían options.idioma=Español incorrectamente, aunque el título y la URL indicaban francés o italiano. Se verificaron identidades por SKU y mapping canónico, sin fuzzy matching.

Operación:23 variantes canónicas disabled, padres exclusivos rechazados con nota de propietario, ofertas/discovery inactivos. Los23 padres de Spree están archivados, sin backorder/preventa. Se conservan fotos, precios, cantidades e historial y se registra el estado previo en metadata language_exclusion_20261030. No se borran productos ni se modifican otras ediciones.

Prevención: filtro compartido de idioma; exclusión en enlaces del listado TCG sin alterar cálculo de paginación, guardas antes de fetch/importación/reconciliación/escritura Spree. La reconciliación excluida retorna sin modificar un padre compartido. Ofertas diarias ya excluyen fulfillment disabled. No se repite ni se borra el carrusel de Instagram publicado hoy.

Validación:45 casos del cuerpo real del helper ejecutados en JavaScript, observados fallar antes de la implementación y pasar después; integración del listado conserva ES/EN y siete páginas. Se añaden46 regresiones Vitest. El executor local está desconectado: no se ha podido ejecutar pnpm test ni tsc para este cambio; no se reutiliza el resultado1094 de la tarea anterior como si validase este diff. La publicación de Edge y sus fuentes se comprueban por separado. Sin builds de Vercel, workers nuevos, permisos ni credenciales nuevos.

Referencias bloqueadas:
- 5010996465436: Bundle TCG Francés Marvel Darkhold Destiny - Magic The Gathering
- 5010996414380: Bundle TCG Francés Star Trek - Magic The Gathering
- 5010996423962: Bundle TCG Reality Fracture Francés - Magic The Gathering
- 5010996445179: Collector Booster Display (12 Sobres) Francés Marvel Darkhold Destiny - Magic The Gathering
- 5010996413550: Collector Booster Display (12 Sobres) Francés Star Trek - Magic The Gathering
- 5010996445902: Commander Display (4 Mazos) Francés Marvel Darkhold Destiny - Magic The Gathering
- 5010996419996: Commander Display (4 Mazos) Francés Star Trek - Magic The Gathering
- 5010996445919: Commander Display (4 Mazos) Italiano Marvel Darkhold Destiny - Magic The Gathering
- 5010996420015: Commander Display (4 Mazos) Italiano Star Trek - Magic The Gathering
- 5010996424051: Commander Display (4 mazos) Reality Fracture Italiano - Magic The Gathering
- 5010996357625: Jumpstart Booster Display (24 sobres) Marvel Super Heroes Francés - Magic The Gathering
- 5010996444981: Play Booster Display (30 Sobres) Francés Marvel Darkhold Destiny - Magic The Gathering
- 5010996413147: Play Booster Display (30 Sobres) Francés Star Trek - Magic The Gathering
- 5010996445018: Play Booster Display (30 Sobres) Italiano Marvel Darkhold Destiny - Magic The Gathering
- 5010996413178: Play Booster Display (30 Sobres) Italiano Star Trek - Magic The Gathering
- 5010996423474: Play Booster Display (30 sobres) Reality Fracture Francés - Magic The Gathering
- 5010996423429: Play Booster Display (30 sobres) Reality Fracture Italiano - Magic The Gathering
- 5010996448330: Prerelease Pack (15 Packs) Francés Marvel Darkhold Destiny - Magic The Gathering
- 5010996422514: Prerelease Pack (15 Packs) Francés Star Trek - Magic The Gathering
- 5010996448415: Prerelease Pack (15 Packs) Italiano Marvel Darkhold Destiny - Magic The Gathering
- 5010996422552: Prerelease Pack (15 Packs) Italiano Star Trek - Magic The Gathering
- 5010996389497: Prerelease Pack (15 packs) Italiano The Hobbit - Magic The Gathering
- 5010996351135: Prerelease Pack (15 unidades) Teenage Mutant Ninja Turtles Francés - Magic The Gathering

Revisión independiente: se corrigió la preservación de grupos multilingües en título/URL con cuatro regresiones adicionales RED→GREEN. También se comprueba el idioma de la ficha autenticada antes de reconciliar disponibilidad y se reconocen sufijos TCG -fr/-it. Sin discrepancias de tipos en las firmas revisadas.
