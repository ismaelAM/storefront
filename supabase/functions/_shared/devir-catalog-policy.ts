export interface DevirCategoryCandidate {
  name: string;
  url?: string | null;
  categoryKeyOverride?: string | null;
}

const LANGUAGE_REPLACEMENTS: Array<[RegExp, string]> = [
  [/\b(?:español|espanol|castellano|spanish)\b/gi, "Español"],
  [/\b(?:inglés|ingles|ngles|english)\b/gi, "Inglés"],
  [/\b(?:francés|frances|french)\b/gi, "Francés"],
  [/\b(?:alemán|aleman|german)\b/gi, "Alemán"],
  [/\b(?:portugués|portugues|portuguese)\b/gi, "Portugués"],
  [/\b(?:japonés|japones|japanese)\b/gi, "Japonés"],
  [/\b(?:italiano|italian)\b/gi, "Italiano"],
];

export function normalizeDevirCatalogTitle(value: string): string {
  let cleaned = value
    .replace(/^m[aá]s\s+vistas\s+/i, "")
    .replace(
      /\s*\((?:fecha\s+de\s+(?:venta(?:\s+en\s+tiendas)?|salida|puesta\s+a\s+la\s+venta)|a\s+la\s+venta(?:\s+el)?)\s*\d{1,2}[\/.-]\d{1,2}[\/.-]\d{4}\)\s*/gi,
      " ",
    )
    .replace(
      /\s*[-–—]?\s*(?:fecha\s+de\s+(?:venta(?:\s+en\s+tiendas)?|salida|puesta\s+a\s+la\s+venta)|a\s+la\s+venta(?:\s+el)?)\s*\d{1,2}[\/.-]\d{1,2}[\/.-]\d{4}\b/gi,
      " ",
    )
    .replace(/\s+\d{1,2}[\/-]\d{1,2}[\/-]\d{4}\s*$/g, "");

  for (const [pattern, replacement] of LANGUAGE_REPLACEMENTS) {
    cleaned = cleaned.replace(pattern, replacement);
  }

  return cleaned
    // Fix a recurring supplier typo such as "(inglés" at the end.
    .replace(
      /\((Español|Inglés|Francés|Alemán|Portugués|Japonés|Italiano)\s*$/i,
      "($1)",
    )
    .replace(
      /\s+-\s+(?=(?:Español|Inglés|Francés|Alemán|Portugués|Japonés|Italiano)\b)/gi,
      " - ",
    )
    .replace(/\s{2,}/g, " ")
    .replace(/\s+([,.;:])/g, "$1")
    .replace(/[\s\-–—,:;]+$/g, "")
    .trim();
}

export function inferDevirCategoryKey(
  product: DevirCategoryCandidate,
): string {
  if (product.categoryKeyOverride?.trim()) {
    return product.categoryKeyOverride.trim();
  }

  const name = product.name.toLowerCase();
  const url = (product.url ?? "").toLowerCase();
  const value = name + " " + url;

  if (/accesorio|sleeves|fundas|deck\s*box|tapete|playmat|carpeta|album/.test(value)) {
    return "accesorios";
  }

  if (/(?:n[uú]m\.?|num\.?|vol\.?|volumen)\s*0*\d{1,3}/i.test(product.name)) {
    return "manga-comic";
  }

  if (/pathfinder/.test(value)) return "rol/pathfinder";
  if (/d&d|dungeons\s*&?\s*dragons|forgotten realms|dragonlance/.test(value)) {
    return "rol/dungeons-dragons";
  }
  if (/warhammer/.test(value)) return "rol/warhammer";

  // Devir distributes several RPG lines whose titles do not contain generic
  // words such as "rol" or "RPG". Resolve the brand before the board-game
  // fallback so supplements, screens, cards and starter boxes stay together.
  if (
    /vampiro|cthulhu|runequest|forbidden\s+lands|blade\s*runner|vaesen|dragonbane|el\s+anillo\s+[uú]nico|the\s+one\s+ring|archivo\s+de\s+las\s+tormentas|stormlight|mutant\s+year\s+zero|coriolis|tales\s+from\s+the\s+loop|symbaroum|m[oö]rk\s+borg|shadowrun|starfinder|traveller|candela\s+obscura|broken\s+tales|juego\s+de\s+rol|roleplaying|rpg\b|libro\s+b[aá]sico|pantalla\s+de\s+direcci[oó]n/.test(
      value,
    )
  ) {
    return "rol/otros";
  }

  if (
    /yugioh|yu-gi-oh|yu gi oh|quarter century|duelist|battles of legend|dueling (?:heroes|mirrors)/.test(value)
  ) {
    return "tcg/yugioh";
  }

  const explicitMagicBrand =
    /^\s*magic\b/i.test(product.name) ||
    /\/magic(?:-|$)/.test(url) ||
    /\bmtg\b/.test(value);
  const knownMagicSet =
    /aetherdrift|tarkir|bloomburrow|duskmourn|innistrad|zendikar|modern horizons|foundations|strixhaven/.test(value);
  if (explicitMagicBrand || knownMagicSet) {
    return "tcg/mtg";
  }

  if (/expansi[oó]n|expansion|\bexp\.|ampliaci[oó]n|big\s*box/.test(value)) {
    return "juegos-de-mesa/expansiones";
  }
  if (/junior|infantil|primaria|secundaria|kids|niñ[oa]s/.test(value)) {
    return "juegos-de-mesa/infantil";
  }
  return "juegos-de-mesa/general";
}
