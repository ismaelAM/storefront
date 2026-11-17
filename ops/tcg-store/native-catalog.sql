-- Intended for the owned Spree database, store 4. Run only as part of the
-- catalog cutover. The inventory was verified on 17 November 2026.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '45s';
LOCK TABLE spree.spree_products, spree.spree_products_taxons, spree.spree_taxons,
  spree.spree_variants, spree.spree_stock_items, spree.spree_orders, spree.spree_line_items,
  spree.spree_tags, spree.spree_taggings IN SHARE ROW EXCLUSIVE MODE;

CREATE TEMP TABLE tcg_keep (
  id bigint PRIMARY KEY, name text NOT NULL, permalink text NOT NULL, format text
) ON COMMIT DROP;
INSERT INTO tcg_keep VALUES
  (109, 'MTG Foundations Play Booster English Display (36)', 'tcg/mtg', 'boosters'),
  (163, 'Sleeves Display Official 3rd Anniversary 05 (12 Unidades) - DBSCG Fusion World', 'tcg/dbscg-fusion-world', 'accessories'),
  (206, 'Commander Display 4 Decks Fallout Inglés - Magic The Gathering', 'tcg/mtg', 'decks'),
  (302, 'Set de Inicio para 2 Jugadores Wilds Unknown - Disney Lorcana TCG', 'tcg/lorcana', 'sets'),
  (408, 'Booster Box Display (24 Sobres) Inglés FB-12 - DBSCG Fusion World', 'tcg/dbscg-fusion-world', 'boosters'),
  (437, 'Booster Box Display Vol.2 (10 Sobres) Rent-A-Girlfriend Inglés - Weiß Schwarz', 'tcg/weiss-schwarz', 'boosters'),
  (451, 'MTG MARVEL SUPER HEROES - BEGGINER BOX', 'tcg/mtg', 'sets'),
  (662, 'MTG - STAR TREK BEGGINER BOX INGLÉS', 'tcg/mtg', 'sets'),
  (671, 'Starter Deck Display Keter Sanctuary S02 (6 unidades) Inglés - Cardfight!! Vanguard', 'tcg/vanguard', 'decks'),
  (814, 'Trial Deck Eternal Ascent Red - Green Inglés TD-03 - Palworld', 'tcg/palworld', 'decks'),
  (829, 'Crossover Set (12 Sobres) Inglés Granblue Fantasy - Shadowverse: Evolve', 'tcg/shadowverse', 'sets'),
  (889, 'Preludio español - Disney Lorcana TCG', 'tcg/lorcana', 'sets'),
  (914, 'Prerelease Pack (15 Packs) Alemán Marvel Darkhold Destiny - Magic The Gathering', 'tcg/mtg', 'sets'),
  (952, 'Story Booster Display Inglés ST-02 - DBSCG Fusion World', 'tcg/dbscg-fusion-world', 'boosters'),
  (972, 'Starter Deck Display (8 Mazos) Español Seto Kaiba - Yu-Gi-Oh!', 'tcg/yugioh', 'decks'),
  (1030, 'Trial Deck (4 Mazos) Tales of SERIES Inglés - Weiß Schwarz', 'tcg/weiss-schwarz', 'decks'),
  (1067, 'Starter Deck Display ST-43 (6 Mazos) Inglés - One Piece Card Game', 'tcg/one-piece', 'decks'),
  (1104, 'Reprint Advanced Booster Display Digimon Generation (12 Sobres) Inglés AD-01 - Digimon Card Game', 'tcg/digimon', 'boosters'),
  (1132, 'Lorwyn Eclipsed - Play Booster Box (30 sobres, inglés) - Magic: The Gathering', 'tcg/mtg', 'boosters'),
  (1155, 'Starter Deck Display Dark States S01 (6 unidades) Inglés - Cardfight!! Vanguard', 'tcg/vanguard', 'decks'),
  (1218, 'Mazos de inicio Display (4 unidades) Kaiju nº 8 Inglés - Weiß Schwarz', 'tcg/weiss-schwarz', 'decks'),
  (1310, 'Booster Box Display (12 Sobres) Inglés Bouncer Bound - Hololive Card Game', 'tcg/hololive', 'boosters'),
  (1343, 'Bundle Gift Edition Inglés Marvel Darkhold Destiny - Magic The Gathering', 'tcg/mtg', 'sets'),
  (1369, 'Sneak Preview Kit Lyrical Monasterio The Legendary Idols! Inglés - Cardfight!! Vanguard', 'tcg/vanguard', 'sets'),
  (1440, 'Starter Deck Display (8 Mazos) Inglés Seto Kaiba - Yu-Gi-Oh!', 'tcg/yugioh', 'decks'),
  (1526, 'Booster Box Display (10 Sobres) Kaiju nº 8 Inglés - Weiß Schwarz', 'tcg/weiss-schwarz', 'boosters'),
  (1527, 'Starter Deck Display (8 Mazos) Inglés Yugi Muto - Yu-Gi-Oh!', 'tcg/yugioh', 'decks'),
  (1534, 'Double Pack Set Display DP-14 (8 sets) Inglés - One Piece Card Game', 'tcg/one-piece', 'sets'),
  (1549, 'Booster Box Display (16 Sobres) Lyrical Monasterio The Legendary Idols! Inglés - Cardfight!! Vanguard', 'tcg/vanguard', 'boosters'),
  (1573, 'Booster Box Display (20 Sobres) Ultra Bout Inglés B-33 - DBSCG Masters', 'tcg/dbscg-masters', 'boosters'),
  (1600, 'Starter Deck Display ST-41 (6 Mazos) Inglés - One Piece Card Game', 'tcg/one-piece', 'decks'),
  (1619, 'Booster Box Display (24 Sobres) Inglés EB-06 - One Piece Card Game', 'tcg/one-piece', 'boosters'),
  (1697, 'Starter Deck Display ST-39 (6 Mazos) Inglés - One Piece Card Game', 'tcg/one-piece', 'decks'),
  (1722, 'Starter Deck Display FS-06 (6 Mazos) Inglés - DBSCG Fusion World', 'tcg/dbscg-fusion-world', 'decks'),
  (1745, 'Tamer´s Selection Box X Antibody Inglés PB-26 - Digimon Card Game', 'tcg/digimon', 'sets'),
  (1818, 'Magic - Final Fantasy Starter Kit - Reed. anunciada por Wizards', 'tcg/mtg', 'decks'),
  (1820, 'Starter Deck Display ST-38 (6 Mazos) Inglés - One Piece Card Game', 'tcg/one-piece', 'decks'),
  (1826, 'Starter Deck Display (8 Mazos) Diaboromon Inglés ST-27 - Digimon Card Game', 'tcg/digimon', 'decks'),
  (1842, 'Play Booster Display (30 sobres) Reality Fracture Español - Magic The Gathering', 'tcg/mtg', 'boosters'),
  (1857, 'Arena Starter Kit (12 mazos) Bloomburrow Español - Magic The Gathering', 'tcg/mtg', 'decks'),
  (2005, 'Commander Display (4 Mazos) Final Fantasy Español - Magic The Gathering', 'tcg/mtg', 'decks'),
  (2098, 'Play Booster Display (36 Unidades) Foundations Español - Magic the Gathering', 'tcg/mtg', 'boosters'),
  (2133, 'Limited Card Park Distancia Cero (LM-09) (6 Unidades) Inglés - Digimon TCG', 'tcg/digimon', 'sets'),
  (2163, 'Starter Deck Display ST-42 (6 Mazos) Inglés - One Piece Card Game', 'tcg/one-piece', 'decks'),
  (2236, '1st Anniversary Set PB-03 Inglés - Gundam Card Game', 'tcg/gundam', 'sets'),
  (2248, 'Premium Card Collection Best Selection Vol. 7 Inglés - One Piece Card Game', 'tcg/one-piece', 'sets'),
  (2280, 'Fundas Stores Edition Vol.7 (12 unidades) One Piece - Bandai', 'tcg/one-piece', 'accessories'),
  (2303, 'Booster Box Display (24 Sobres) Inglés Glorious Victors - Yu-Gi-Oh!', 'tcg/yugioh', 'boosters'),
  (2414, 'Booster Box Display (24 Sobres) Español Inmortal Phoenix - Yu-Gi-Oh!', 'tcg/yugioh', 'boosters'),
  (2420, 'Booster Box Display (24 Sobres) Inglés Inmortal Phoenix - Yu-Gi-Oh!', 'tcg/yugioh', 'boosters'),
  (2433, 'Starter Deck Display Ultimate Deck 02 (6 Mazos) Inglés ST-15 - Gundam Card Game', 'tcg/gundam', 'decks'),
  (2443, 'Booster Box Display (24 sobres) Inglés FB-13 - DBSCG Fusion World', 'tcg/dbscg-fusion-world', 'boosters'),
  (2506, 'Magic The Gathering Play Booster Display (36 sobres) Duskmourn House of Horrors Español', 'tcg/mtg', 'boosters'),
  (2715, 'Booster Box Display OP-19 (24 sobres) Inglés - One Piece Card Game', 'tcg/one-piece', 'boosters'),
  (2804, 'Booster Box Display (16 sobres) Inglés - Cardfight!! Vanguard', 'tcg/vanguard', 'boosters'),
  (2820, 'Trial Deck Eternal Ascent Blue - Purple Inglés TD-04 - Palworld', 'tcg/palworld', 'decks'),
  (2902, 'Booster Box Display (24 Sobres) Español Glorious Victors - Yu-Gi-Oh!', 'tcg/yugioh', 'boosters'),
  (2915, 'Collector Booster Display (12 Sobres) Alemán Marvel Darkhold Destiny - Magic The Gathering', 'tcg/mtg', 'boosters'),
  (2958, 'Magic Foundations Jumpstart 2025 Booster', 'tcg/mtg', 'boosters'),
  (2960, 'Play Booster Display (30 Sobres) Inglés Marvel Darkhold Destiny - Magic The Gathering', 'tcg/mtg', 'boosters'),
  (3004, 'Starter Deck Display ST-37 (6 Mazos) Inglés - One Piece Card Game', 'tcg/one-piece', 'decks'),
  (3081, 'Play Booster Display (36 sobres) Modern Horizons 3 Español - Magic The Gathering', 'tcg/mtg', 'boosters'),
  (3133, 'Play Booster Display (30 sobres) Marvel Super Heroes Español - Magic The Gathering', 'tcg/mtg', 'boosters'),
  (3177, 'Booster Box Display (12 Sobres) Inglés BP-03 Eternal Ascent - Palworld', 'tcg/palworld', 'boosters'),
  (3213, 'Prerelease Pack (15 Packs) Español Marvel Darkhold Destiny - Magic The Gathering', 'tcg/mtg', 'sets'),
  (3214, 'Tarkir: Dragonstorm - Play Booster Box (30 sobres, español) - Magic: The Gathering', 'tcg/mtg', 'boosters'),
  (3285, 'Premium Card Collection 29th Anniversary Edition Inglés - One Piece Card Game', 'tcg/one-piece', 'sets'),
  (3435, 'Booster Box Display Inglés GD-07 - Gundam Card Game', 'tcg/gundam', 'boosters'),
  (3599, 'Structure Deck Spirit Charmers Español - Yu-Gi-Oh!', 'tcg/yugioh', 'decks'),
  (3641, 'Starter Deck Display ST-44 (6 Mazos) Inglés - One Piece Card Game', 'tcg/one-piece', 'decks'),
  (3728, 'Bundle TCG Alemán Marvel Darkhold Destiny - Magic The Gathering', 'tcg/mtg', 'sets'),
  (3736, 'Booster Box Display Malevolent VII (24 Sobres) Inglés EX-14 - Digimon Card Game', 'tcg/digimon', 'boosters'),
  (3890, 'Fundas Standard Sleeves 17 (4 Kinds Assort) (12 unidades) - One Piece Card Game', 'tcg/one-piece', 'accessories'),
  (3891, 'Sleeves Display Official (4 Kinds Assortment) 04 (12 unidades) - Digimon', 'tcg/digimon', 'accessories'),
  (3952, 'Booster Box Display (24 Sobres) -ABYSS OF X- Inglés BT-28 - Digimon Card Game', 'tcg/digimon', 'boosters'),
  (4020, 'Japanese 4th Anniversary Set Inglés - One Piece Card Game', 'tcg/one-piece', 'sets'),
  (4168, 'Booster Box Display (10 Sobres) Persona 30th Anniversary Inglés - Weiß Schwarz', 'tcg/weiss-schwarz', 'boosters'),
  (4309, 'Starter Deck Display (6 unidades) Ghost Meets Gal! Inglés - Cardfight!! Vanguard', 'tcg/vanguard', 'decks'),
  (4500, 'Premium Card Collection Best Selection: Ace & Sabo & Luffy Inglés - One Piece Card Game', 'tcg/one-piece', 'sets'),
  (4510, 'Starter Deck Display ST-40 (6 Mazos) Inglés - One Piece Card Game', 'tcg/one-piece', 'decks'),
  (4536, 'Sleeves Display 18 (4 Kinds Assort) (12 unidades) - One Piece Card Game', 'tcg/one-piece', 'accessories'),
  (4676, 'Starter Deck Display (8 Mazos) Español Yugi Muto - Yu-Gi-Oh!', 'tcg/yugioh', 'decks'),
  (4693, 'Extra Booster Pack (24 sobres) Inglés EB-02 - Gundam Card Game', 'tcg/gundam', 'boosters'),
  (4737, 'Starter Deck Display (4 Mazos) Inglés FS-15 - DBSCG Fusion World', 'tcg/dbscg-fusion-world', 'decks'),
  (4869, 'Premium Extra Booster Display (12 Sobres) PEB-01 Inglés - One Piece Card Game', 'tcg/one-piece', 'boosters'),
  (4970, 'Booster Box Display (10 Sobres) Tales of SERIES Inglés - Weiß Schwarz', 'tcg/weiss-schwarz', 'boosters'),
  (5061, 'Fallout - Science! Commander Deck (inglés) - Magic: The Gathering', 'tcg/mtg', 'decks'),
  (5062, 'Fallout - Mutant Menace Commander Deck (inglés) - Magic: The Gathering', 'tcg/mtg', 'decks'),
  (5063, 'Fallout - Hail, Caesar Commander Deck (inglés) - Magic: The Gathering', 'tcg/mtg', 'decks'),
  (5064, 'Fallout - Scrappy Survivors Commander Deck (inglés) - Magic: The Gathering', 'tcg/mtg', 'decks'),
  (5074, 'Booster Set (12 Sobres) Court of the Six Flowers Inglés - Shadowverse: Evolve', 'tcg/shadowverse', 'sets'),
  (5075, 'Preview Trials Kit Court of the Six Flowers Inglés - Shadowverse: Evolve', 'tcg/shadowverse', 'sets'),
  (5078, 'Triple Drive Booster (12 Sobres) Inglés D Finale - Vanguard', 'tcg/vanguard', 'boosters'),
  (5079, 'Random Master Decks (6 unidades) Inglés The 26 Vanguards - Vanguard', 'tcg/vanguard', 'decks'),
  (5080, 'Booster Box Display (24 Sobres) Español Maze of Machines - Yu-Gi-Oh!', 'tcg/yugioh', 'boosters'),
  (5081, 'Booster Box Display (24 Sobres) Inglés Maze of Machines - Yu-Gi-Oh!', 'tcg/yugioh', 'boosters'),
  (5084, 'Premium Battle Set Royal Knights PB-27 Inglés - Digimon TCG', 'tcg/digimon', 'sets'),
  (5085, 'Prerelease Pack (8 Kits) Inglés Edgerunners: Burn Bright - Cyberpunk TCG', 'tcg/cyberpunk', 'sets'),
  (5086, 'Premium Battle Set Seven Great Demon Lords PB-28 Inglés - Digimon TCG', 'tcg/digimon', 'sets'),
  (5087, 'Booster Box Display (24 Sobres) Inglés Edgerunners: Burn Bright - Cyberpunk TCG', 'tcg/cyberpunk', 'boosters'),
  (5091, 'Booster Box Display OP-20 (24 sobres) Inglés - One Piece Card Game', 'tcg/one-piece', 'boosters'),
  (5092, 'Double Pack Display DP-15 (8 sets) Inglés - One Piece Card Game', 'tcg/one-piece', 'sets'),
  (5093, 'Booster Box Display (10 Sobres) Date a live vol.3 Inglés - Weiß Schwarz', 'tcg/weiss-schwarz', 'boosters'),
  (5094, 'Booster Packs Display (30 Sobres) Marvel''s Spider-Man Inglés - Magic The Gathering', 'tcg/mtg', 'boosters'),
  (5095, 'Booster Box Display (10 Sobres) Metaphor: ReFantazio Inglés - Weiß Schwarz', 'tcg/weiss-schwarz', 'boosters'),
  (5096, 'Supply Set Metaphor: ReFantazio Inglés - Weiß Schwarz', 'tcg/weiss-schwarz', 'sets'),
  (5097, 'Trial Deck Display (4 Mazos) Metaphor: ReFantazio Inglés - Weiß Schwarz', 'tcg/weiss-schwarz', 'decks'),
  (5098, 'Caja de Principiante Foundations en Español - Magic the Gathering', 'tcg/mtg', 'sets');

-- Preserve products attached to any order/cart, including the one in payment.
-- Archiving is reversible and leaves variants, inventory, media and orders intact.
CREATE TEMP TABLE tcg_retire ON COMMIT DROP AS
SELECT p.id
FROM spree.spree_products p
WHERE p.store_id = 4 AND p.status = 'active' AND p.deleted_at IS NULL
  AND NOT EXISTS (SELECT FROM tcg_keep k WHERE k.id = p.id)
  AND NOT EXISTS (
    SELECT FROM spree.spree_variants v JOIN spree.spree_line_items li ON li.variant_id = v.id
    WHERE v.product_id = p.id
  );

DO $guard$
BEGIN
  IF (SELECT count(*) FROM tcg_keep k JOIN spree.spree_products p
      ON p.id = k.id AND p.name = k.name AND p.store_id = 4
      AND p.status = 'active' AND p.deleted_at IS NULL
      WHERE EXISTS (SELECT FROM spree.spree_products_taxons pt
        JOIN spree.spree_taxons t ON t.id = pt.taxon_id
        WHERE pt.product_id = k.id AND t.permalink = k.permalink)) <> 108
     OR (SELECT count(*) FROM tcg_retire) <> 2655
     OR (SELECT count(*) FROM spree.spree_products
        WHERE store_id = 4 AND status = 'active' AND deleted_at IS NULL) <> 2764
  THEN RAISE EXCEPTION 'catalog drift: refresh and review selection'; END IF;
  IF EXISTS (SELECT FROM tcg_retire r JOIN spree.spree_products p USING (id)
      WHERE p.make_active_at > now())
     OR EXISTS (SELECT FROM tcg_retire r JOIN spree.spree_variants v ON v.product_id = r.id
        JOIN spree.spree_stock_items s ON s.variant_id = v.id WHERE s.count_on_hand > 0)
  THEN RAISE EXCEPTION 'protected stock or activation appeared'; END IF;
  IF EXISTS (SELECT FROM bison_ops.owner_cleanup_audit
      WHERE batch_key = 'owner-tcg-shop:2026-11-17') OR EXISTS (
        SELECT FROM spree.spree_tags WHERE name = 'bison-tcg-catalog' OR name LIKE 'bison-format:%'
      )
  THEN RAISE EXCEPTION 'TCG data already present; inspect before retry'; END IF;
END $guard$;

INSERT INTO bison_ops.owner_cleanup_audit(batch_key, table_name, record_id, before_row)
SELECT 'owner-tcg-shop:2026-11-17', 'spree_products', p.id::text,
  jsonb_build_object('status', p.status, 'updated_at', p.updated_at)
FROM spree.spree_products p
WHERE p.id IN (SELECT id FROM tcg_retire UNION ALL SELECT id FROM tcg_keep);

INSERT INTO spree.spree_tags (name, created_at, updated_at)
SELECT tag, now(), now() FROM (
  SELECT 'bison-tcg-catalog' AS tag
  UNION SELECT 'bison-format:' || format FROM tcg_keep WHERE format IS NOT NULL
) t;

INSERT INTO spree.spree_taggings (tag_id, taggable_type, taggable_id, context, created_at)
SELECT t.id, 'Spree::Product', k.id, 'tags', now()
FROM tcg_keep k JOIN spree.spree_tags t
  ON t.name IN ('bison-tcg-catalog', 'bison-format:' || k.format);

UPDATE spree.spree_tags t SET taggings_count = counts.taggings_count
FROM (
  SELECT tag_id, count(*) AS taggings_count FROM spree.spree_taggings
  WHERE tag_id IN (SELECT id FROM spree.spree_tags WHERE name = 'bison-tcg-catalog' OR name LIKE 'bison-format:%')
  GROUP BY tag_id
) counts
WHERE t.id = counts.tag_id;

UPDATE spree.spree_products SET status = 'archived', updated_at = now()
WHERE id IN (SELECT id FROM tcg_retire);
UPDATE spree.spree_products SET updated_at = now() WHERE id IN (SELECT id FROM tcg_keep);

DO $verify$
BEGIN
  IF (SELECT count(*) FROM spree.spree_products WHERE store_id = 4 AND status = 'active' AND deleted_at IS NULL) <> 109
     OR (SELECT count(*) FROM spree.spree_taggings tg JOIN spree.spree_tags t ON t.id = tg.tag_id
        WHERE t.name = 'bison-tcg-catalog' AND tg.taggable_type = 'Spree::Product' AND tg.context = 'tags') <> 108
  THEN RAISE EXCEPTION 'TCG catalog verification failed'; END IF;
END $verify$;
COMMIT;
