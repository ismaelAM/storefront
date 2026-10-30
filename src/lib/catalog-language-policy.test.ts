import { describe, expect, it } from "vitest";
import { isExcludedCatalogLanguage } from "../../supabase/functions/_shared/devir-catalog-policy";
import { parseTcgFactoryListing } from "../../supabase/functions/_shared/tcgfactory-web";

const cases: Array<{input: Parameters<typeof isExcludedCatalogLanguage>[0]; expected: boolean}> = [
  {
    "input": {
      "name": "Bundle TCG Francés Marvel Darkhold Destiny - Magic The Gathering",
      "options": {
        "idioma": "Español",
        "edicion": "Marvel Darkhold Destiny"
      },
      "categoryKey": "tcg/mtg"
    },
    "expected": true
  },
  {
    "input": {
      "name": "Bundle TCG Francés Star Trek - Magic The Gathering",
      "options": {
        "idioma": "Español",
        "edicion": "Star Trek"
      },
      "categoryKey": "tcg/mtg"
    },
    "expected": true
  },
  {
    "input": {
      "name": "Bundle TCG Reality Fracture Francés - Magic The Gathering",
      "options": {
        "idioma": "Español",
        "edicion": "Reality Fracture"
      },
      "categoryKey": "tcg/mtg"
    },
    "expected": true
  },
  {
    "input": {
      "name": "Collector Booster Display (12 Sobres) Francés Marvel Darkhold Destiny - Magic The Gathering",
      "options": {
        "idioma": "Español",
        "edicion": "Marvel Darkhold Destiny"
      },
      "categoryKey": "tcg/mtg"
    },
    "expected": true
  },
  {
    "input": {
      "name": "Collector Booster Display (12 Sobres) Francés Star Trek - Magic The Gathering",
      "options": {
        "idioma": "Español",
        "edicion": "Star Trek"
      },
      "categoryKey": "tcg/mtg"
    },
    "expected": true
  },
  {
    "input": {
      "name": "Commander Display (4 Mazos) Francés Marvel Darkhold Destiny - Magic The Gathering",
      "options": {
        "idioma": "Español",
        "edicion": "Marvel Darkhold Destiny"
      },
      "categoryKey": "tcg/mtg"
    },
    "expected": true
  },
  {
    "input": {
      "name": "Commander Display (4 Mazos) Francés Star Trek - Magic The Gathering",
      "options": {
        "idioma": "Español",
        "edicion": "Star Trek"
      },
      "categoryKey": "tcg/mtg"
    },
    "expected": true
  },
  {
    "input": {
      "name": "Commander Display (4 Mazos) Italiano Marvel Darkhold Destiny - Magic The Gathering",
      "options": {
        "idioma": "Español",
        "edicion": "Marvel Darkhold Destiny"
      },
      "categoryKey": "tcg/mtg"
    },
    "expected": true
  },
  {
    "input": {
      "name": "Commander Display (4 Mazos) Italiano Star Trek - Magic The Gathering",
      "options": {
        "idioma": "Español",
        "edicion": "Star Trek"
      },
      "categoryKey": "tcg/mtg"
    },
    "expected": true
  },
  {
    "input": {
      "name": "Commander Display (4 mazos) Reality Fracture Italiano - Magic The Gathering",
      "options": {
        "idioma": "Español",
        "edicion": "Reality Fracture"
      },
      "categoryKey": "tcg/mtg"
    },
    "expected": true
  },
  {
    "input": {
      "name": "Jumpstart Booster Display (24 sobres) Marvel Super Heroes Francés - Magic The Gathering",
      "options": {
        "idioma": "Español",
        "edicion": "Marvel Super Heroes"
      },
      "categoryKey": "tcg/mtg"
    },
    "expected": true
  },
  {
    "input": {
      "name": "Play Booster Display (30 Sobres) Francés Marvel Darkhold Destiny - Magic The Gathering",
      "options": {
        "idioma": "Español",
        "edicion": "Marvel Darkhold Destiny"
      },
      "categoryKey": "tcg/mtg"
    },
    "expected": true
  },
  {
    "input": {
      "name": "Play Booster Display (30 Sobres) Francés Star Trek - Magic The Gathering",
      "options": {
        "idioma": "Español",
        "edicion": "Star Trek"
      },
      "categoryKey": "tcg/mtg"
    },
    "expected": true
  },
  {
    "input": {
      "name": "Play Booster Display (30 Sobres) Italiano Marvel Darkhold Destiny - Magic The Gathering",
      "options": {
        "idioma": "Español",
        "edicion": "Marvel Darkhold Destiny"
      },
      "categoryKey": "tcg/mtg"
    },
    "expected": true
  },
  {
    "input": {
      "name": "Play Booster Display (30 Sobres) Italiano Star Trek - Magic The Gathering",
      "options": {
        "idioma": "Español",
        "edicion": "Star Trek"
      },
      "categoryKey": "tcg/mtg"
    },
    "expected": true
  },
  {
    "input": {
      "name": "Play Booster Display (30 sobres) Reality Fracture Francés - Magic The Gathering",
      "options": {
        "idioma": "Español",
        "edicion": "Reality Fracture"
      },
      "categoryKey": "tcg/mtg"
    },
    "expected": true
  },
  {
    "input": {
      "name": "Play Booster Display (30 sobres) Reality Fracture Italiano - Magic The Gathering",
      "options": {
        "idioma": "Español",
        "edicion": "Reality Fracture"
      },
      "categoryKey": "tcg/mtg"
    },
    "expected": true
  },
  {
    "input": {
      "name": "Prerelease Pack (15 Packs) Francés Marvel Darkhold Destiny - Magic The Gathering",
      "options": {
        "idioma": "Español",
        "edicion": "Marvel Darkhold Destiny"
      },
      "categoryKey": "tcg/mtg"
    },
    "expected": true
  },
  {
    "input": {
      "name": "Prerelease Pack (15 Packs) Francés Star Trek - Magic The Gathering",
      "options": {
        "idioma": "Español",
        "edicion": "Star Trek"
      },
      "categoryKey": "tcg/mtg"
    },
    "expected": true
  },
  {
    "input": {
      "name": "Prerelease Pack (15 Packs) Italiano Marvel Darkhold Destiny - Magic The Gathering",
      "options": {
        "idioma": "Español",
        "edicion": "Marvel Darkhold Destiny"
      },
      "categoryKey": "tcg/mtg"
    },
    "expected": true
  },
  {
    "input": {
      "name": "Prerelease Pack (15 Packs) Italiano Star Trek - Magic The Gathering",
      "options": {
        "idioma": "Español",
        "edicion": "Star Trek"
      },
      "categoryKey": "tcg/mtg"
    },
    "expected": true
  },
  {
    "input": {
      "name": "Prerelease Pack (15 packs) Italiano The Hobbit - Magic The Gathering",
      "options": {
        "idioma": "Español",
        "edicion": "The Hobbit"
      },
      "categoryKey": "tcg/mtg"
    },
    "expected": true
  },
  {
    "input": {
      "name": "Prerelease Pack (15 unidades) Teenage Mutant Ninja Turtles Francés - Magic The Gathering",
      "options": {
        "idioma": "Español",
        "edicion": "Teenage Mutant Ninja Turtles"
      },
      "categoryKey": "tcg/mtg"
    },
    "expected": true
  },
  {
    "input": {
      "name": "MTG Play Booster Display Español",
      "options": {
        "idioma": "Español"
      }
    },
    "expected": false
  },
  {
    "input": {
      "name": "Lorwyn Eclipsed Play Booster Box (inglés) - Magic: The Gathering",
      "options": {
        "idioma": "Inglés"
      }
    },
    "expected": false
  },
  {
    "input": {
      "name": "MTG Play Booster French",
      "options": {
        "idioma": "Español"
      }
    },
    "expected": true
  },
  {
    "input": {
      "name": "MTG Play Booster Italian",
      "options": {
        "idioma": "Español"
      }
    },
    "expected": true
  },
  {
    "input": {
      "name": "Catan",
      "options": {
        "language": "fr-FR"
      }
    },
    "expected": true
  },
  {
    "input": {
      "name": "Catan",
      "options": {
        "idioma": "it"
      }
    },
    "expected": true
  },
  {
    "input": {
      "name": "Catan (Francés)"
    },
    "expected": true
  },
  {
    "input": {
      "name": "MTG Box",
      "url": "https://tcgfactory.com/es/distribucion/play-booster-italiano.html"
    },
    "expected": true
  },
  {
    "input": {
      "name": "MTG Box",
      "options": {
        "language": "ja"
      }
    },
    "expected": false
  },
  {
    "input": {
      "name": "Funko French Bulldog",
      "options": {
        "idioma": "Español"
      },
      "categoryKey": "merchandising"
    },
    "expected": false
  },
  {
    "input": {
      "name": "The Italian Job",
      "categoryKey": "juegos-de-mesa/general"
    },
    "expected": false
  },
  {
    "input": {
      "name": "Juego multilingüe",
      "options": {
        "idioma": "Español / Inglés / Francés / Italiano"
      }
    },
    "expected": false
  },
  {
    "input": {
      "name": "Funko Pop Francia",
      "options": {
        "idioma": "Español"
      }
    },
    "expected": false
  },
  {
    "input": {
      "name": "MTG Booster (FR)"
    },
    "expected": true
  },
  {
    "input": {
      "name": "MTG Booster Francés",
      "variantName": "Estándar",
      "options": {
        "idioma": "Español"
      }
    },
    "expected": true
  },
  {
    "input": {
      "url": "https://tcgfactory.com/es/distribucion/jeu-fran%C3%A7ais.html"
    },
    "expected": true
  },
  {
    "input": {
      "url": "https://tcgfactory.com/es/distribucion/mtg-booster-french.html"
    },
    "expected": true
  },
  {
    "input": {
      "name": "MTG Bundle English French multilingual",
      "options": {
        "idioma": "English / French"
      }
    },
    "expected": false
  },
  {
    "input": {
      "name": "Pokémon (Español / Francés)"
    },
    "expected": false
  },
  {
    "input": {
      "name": "Pokémon (English / French)"
    },
    "expected": false
  },
  {
    "input": {
      "url": "https://tcgfactory.com/es/distribucion/pokemon-espanol-frances.html"
    },
    "expected": false
  },
  {
    "input": {
      "url": "https://tcgfactory.com/es/distribucion/pokemon-caja-fr.html"
    },
    "expected": true
  }
];
describe("owner retail language exclusion", () => {
  it.each(cases)("applies the language policy to $input", ({input, expected}) => {
    expect(isExcludedCatalogLanguage(input)).toBe(expected);
  });
  it("filters supplier URLs without changing linked pagination", () => {
    const html = '<div id="js-product-list"><a href="https://tcgfactory.com/es/distribucion/mtg-booster-frances.html">FR</a><a href="https://tcgfactory.com/es/distribucion/mtg-booster-italiano.html">IT</a><a href="https://tcgfactory.com/es/distribucion/mtg-booster-espanol.html">ES</a><a href="https://tcgfactory.com/es/distribucion/mtg-booster-english.html">EN</a></div><nav class="pagination"><a href="https://tcgfactory.com/es/distribucion-accesorios?page=7">7</a></nav>';
    const result = parseTcgFactoryListing(html);
    expect(result.productUrls).toEqual(["https://tcgfactory.com/es/distribucion/mtg-booster-espanol.html", "https://tcgfactory.com/es/distribucion/mtg-booster-english.html"]);
    expect(result.totalPages).toBe(7);
  });
});
