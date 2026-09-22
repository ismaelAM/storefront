export interface CommercialProductInput {
  name: string;
  categoryKey?: string | null;
  unitCostNet?: number | null;
}

export interface CommercialPricingProfile {
  code: string;
  targetMargin: number;
  referenceDiscount: number;
  dailyOfferDiscount: number;
  saturdayOfferDiscount: number;
  offerFloorMargin: number;
  offerEligible: boolean;
}

function normalized(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

const PROFILES: Record<string, CommercialPricingProfile> = {
  mtg_booster_box: {
    code: "mtg_booster_box",
    targetMargin: 0.045,
    referenceDiscount: 0.08,
    dailyOfferDiscount: 0.05,
    saturdayOfferDiscount: 0.08,
    offerFloorMargin: 0.01,
    offerEligible: true,
  },
  mtg_collector_box: {
    code: "mtg_collector_box",
    targetMargin: 0.055,
    referenceDiscount: 0.07,
    dailyOfferDiscount: 0.06,
    saturdayOfferDiscount: 0.1,
    offerFloorMargin: 0.015,
    offerEligible: true,
  },
  mtg_commander_precon: {
    code: "mtg_commander_precon",
    targetMargin: 0.1,
    referenceDiscount: 0.05,
    dailyOfferDiscount: 0.08,
    saturdayOfferDiscount: 0.12,
    offerFloorMargin: 0.02,
    offerEligible: true,
  },
  mtg_bundle: {
    code: "mtg_bundle",
    targetMargin: 0.085,
    referenceDiscount: 0.07,
    dailyOfferDiscount: 0.07,
    saturdayOfferDiscount: 0.11,
    offerFloorMargin: 0.02,
    offerEligible: true,
  },
  mtg_starter: {
    code: "mtg_starter",
    targetMargin: 0.09,
    referenceDiscount: 0.07,
    dailyOfferDiscount: 0.08,
    saturdayOfferDiscount: 0.12,
    offerFloorMargin: 0.02,
    offerEligible: true,
  },
  mtg_booster: {
    code: "mtg_booster",
    targetMargin: 0.07,
    referenceDiscount: 0.08,
    dailyOfferDiscount: 0.06,
    saturdayOfferDiscount: 0.09,
    offerFloorMargin: 0.015,
    offerEligible: true,
  },
  mtg_other: {
    code: "mtg_other",
    targetMargin: 0.065,
    referenceDiscount: 0.08,
    dailyOfferDiscount: 0.06,
    saturdayOfferDiscount: 0.1,
    offerFloorMargin: 0.015,
    offerEligible: true,
  },
  yugioh_box: {
    code: "yugioh_box",
    targetMargin: 0.05,
    referenceDiscount: 0.08,
    dailyOfferDiscount: 0.05,
    saturdayOfferDiscount: 0.08,
    offerFloorMargin: 0.01,
    offerEligible: true,
  },
  yugioh_deck: {
    code: "yugioh_deck",
    targetMargin: 0.09,
    referenceDiscount: 0.07,
    dailyOfferDiscount: 0.08,
    saturdayOfferDiscount: 0.12,
    offerFloorMargin: 0.02,
    offerEligible: true,
  },
  yugioh_other: {
    code: "yugioh_other",
    targetMargin: 0.07,
    referenceDiscount: 0.08,
    dailyOfferDiscount: 0.06,
    saturdayOfferDiscount: 0.1,
    offerFloorMargin: 0.015,
    offerEligible: true,
  },
  other_tcg_sealed: {
    code: "other_tcg_sealed",
    targetMargin: 0.08,
    referenceDiscount: 0.08,
    dailyOfferDiscount: 0.07,
    saturdayOfferDiscount: 0.11,
    offerFloorMargin: 0.02,
    offerEligible: true,
  },
  board_game: {
    code: "board_game",
    targetMargin: 0.085,
    referenceDiscount: 0.12,
    dailyOfferDiscount: 0.08,
    saturdayOfferDiscount: 0.12,
    offerFloorMargin: 0.025,
    offerEligible: true,
  },
  board_game_expansion: {
    code: "board_game_expansion",
    targetMargin: 0.1,
    referenceDiscount: 0.1,
    dailyOfferDiscount: 0.09,
    saturdayOfferDiscount: 0.13,
    offerFloorMargin: 0.025,
    offerEligible: true,
  },
  board_game_kids: {
    code: "board_game_kids",
    targetMargin: 0.095,
    referenceDiscount: 0.1,
    dailyOfferDiscount: 0.08,
    saturdayOfferDiscount: 0.12,
    offerFloorMargin: 0.025,
    offerEligible: true,
  },
  rpg: {
    code: "rpg",
    targetMargin: 0.09,
    referenceDiscount: 0.08,
    dailyOfferDiscount: 0.07,
    saturdayOfferDiscount: 0.11,
    offerFloorMargin: 0.025,
    offerEligible: true,
  },
  manga: {
    code: "manga",
    targetMargin: 0.05,
    referenceDiscount: 0.05,
    dailyOfferDiscount: 0,
    saturdayOfferDiscount: 0,
    offerFloorMargin: 0.05,
    offerEligible: false,
  },
  sleeves: {
    code: "sleeves",
    targetMargin: 0.13,
    referenceDiscount: 0.1,
    dailyOfferDiscount: 0.1,
    saturdayOfferDiscount: 0.15,
    offerFloorMargin: 0.03,
    offerEligible: true,
  },
  deck_boxes: {
    code: "deck_boxes",
    targetMargin: 0.14,
    referenceDiscount: 0.1,
    dailyOfferDiscount: 0.1,
    saturdayOfferDiscount: 0.15,
    offerFloorMargin: 0.03,
    offerEligible: true,
  },
  playmats: {
    code: "playmats",
    targetMargin: 0.15,
    referenceDiscount: 0.1,
    dailyOfferDiscount: 0.1,
    saturdayOfferDiscount: 0.15,
    offerFloorMargin: 0.03,
    offerEligible: true,
  },
  albums: {
    code: "albums",
    targetMargin: 0.14,
    referenceDiscount: 0.1,
    dailyOfferDiscount: 0.1,
    saturdayOfferDiscount: 0.15,
    offerFloorMargin: 0.03,
    offerEligible: true,
  },
  dice: {
    code: "dice",
    targetMargin: 0.15,
    referenceDiscount: 0.1,
    dailyOfferDiscount: 0.1,
    saturdayOfferDiscount: 0.15,
    offerFloorMargin: 0.03,
    offerEligible: true,
  },
  storage: {
    code: "storage",
    targetMargin: 0.13,
    referenceDiscount: 0.1,
    dailyOfferDiscount: 0.09,
    saturdayOfferDiscount: 0.14,
    offerFloorMargin: 0.03,
    offerEligible: true,
  },
  accessories: {
    code: "accessories",
    targetMargin: 0.14,
    referenceDiscount: 0.1,
    dailyOfferDiscount: 0.1,
    saturdayOfferDiscount: 0.15,
    offerFloorMargin: 0.03,
    offerEligible: true,
  },
  other: {
    code: "other",
    targetMargin: 0.08,
    referenceDiscount: 0.1,
    dailyOfferDiscount: 0.07,
    saturdayOfferDiscount: 0.11,
    offerFloorMargin: 0.025,
    offerEligible: true,
  },
};

export function commercialPricingProfile(
  input: CommercialProductInput,
): CommercialPricingProfile {
  const name = normalized(input.name);
  const key = normalized(input.categoryKey ?? "");

  const mtg =
    key === "tcg/mtg" ||
    /\b(?:magic(?::|\s+-|\s+the\s+gathering)|mtg)\b/.test(name);
  if (mtg) {
    if (
      /\b(?:commander|precon(?:structed)?|preconstruid[oa]|commander\s+deck)\b/.test(
        name,
      )
    ) {
      return PROFILES.mtg_commander_precon;
    }
    if (
      /\bcollector\b/.test(name) &&
      /\b(?:display|booster\s*box|box|caja)\b/.test(name)
    ) {
      return PROFILES.mtg_collector_box;
    }
    const unitCostNet = Number(input.unitCostNet);
    if (
      /\b(?:display|booster\s*box|caja\s+(?:de\s+)?sobres)\b/.test(name) ||
      /\bplay\s+booster\b.*\b(?:30|36)\b/.test(name) ||
      (/\b(?:play|draft|set)\s+booster\b/.test(name) &&
        Number.isFinite(unitCostNet) &&
        unitCostNet >= 40)
    ) {
      return PROFILES.mtg_booster_box;
    }
    if (/\b(?:bundle|fat\s*pack)\b/.test(name)) return PROFILES.mtg_bundle;
    if (/\b(?:starter|beginner|begginer)\b/.test(name))
      return PROFILES.mtg_starter;
    if (/\b(?:booster|sobre)\b/.test(name)) return PROFILES.mtg_booster;
    return PROFILES.mtg_other;
  }

  const yugioh =
    key === "tcg/yugioh" ||
    /\b(?:yu-?gi-?oh|yugioh|quarter\s+century|duelist)\b/.test(name);
  if (yugioh) {
    if (/\b(?:display|booster\s*box|caja\s+(?:de\s+)?sobres)\b/.test(name))
      return PROFILES.yugioh_box;
    if (/\b(?:starter|structure|deck|baraja)\b/.test(name))
      return PROFILES.yugioh_deck;
    return PROFILES.yugioh_other;
  }

  if (
    /\b(?:pokemon|pok[eé]mon|lorcana|one\s+piece\s+card\s+game|flesh\s+and\s+blood|star\s+wars\s+unlimited)\b/.test(
      name,
    ) &&
    /\b(?:display|booster|box|caja|etb|elite\s+trainer|starter|deck|baraja|tin|collection|coleccion|blister)\b/.test(
      name,
    )
  ) {
    return PROFILES.other_tcg_sealed;
  }

  if (key === "manga-comic") return PROFILES.manga;
  if (key.startsWith("rol/")) return PROFILES.rpg;
  if (key === "juegos-de-mesa/expansiones") return PROFILES.board_game_expansion;
  if (key === "juegos-de-mesa/infantil") return PROFILES.board_game_kids;
  if (key === "juegos-de-mesa/general") return PROFILES.board_game;

  if (key.includes("fundas")) return PROFILES.sleeves;
  if (key === "accesorios/cajas-mazo") return PROFILES.deck_boxes;
  if (key === "accesorios/tapetes") return PROFILES.playmats;
  if (key === "accesorios/albumes") return PROFILES.albums;
  if (key === "accesorios/dados") return PROFILES.dice;
  if (key === "accesorios/almacenaje") return PROFILES.storage;
  if (key === "accesorios" || key.startsWith("accesorios/"))
    return PROFILES.accessories;

  return PROFILES.other;
}

export function madridCommercialDay(now = new Date()): {
  dayKey: string;
  saturday: boolean;
} {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Madrid",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
  }).formatToParts(now);
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return {
    dayKey: `${value.year}-${value.month}-${value.day}`,
    saturday: value.weekday === "Sat",
  };
}

export function deterministicOfferScore(dayKey: string, variantId: string): number {
  const input = `${dayKey}:${variantId}`;
  let hash = 2166136261;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}
