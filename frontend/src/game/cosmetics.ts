// KOZMETİKLER — gold'un SONSUZ talebinin ilk ayağı.
//
// NEDEN VAR: ölçüldü (curve.test.mts), oyuncu duvarına vardığında 4.170
// gold/saat üretmeye devam ediyor ama Forge ağacı sonlu (255.694). Ağaç
// bitince gold'un gidecek yeri kalmıyor → kimse gold SATIN ALMAZ, herkes
// satıcı olur, market likidite bulamaz, token'dan gelir doğmaz.
//
// ⚠️ KOZMETİK GÜÇ SATMAZ. Kintara'nın modelinden alınan tek katı kural bu:
// hiçbir gold sinki stat/güç vermez. Bizde Forge zaten güç satıyor (tek para
// mimarisi kararı); ikinci bir güç sinki eklemek P2W sarmalını iki katına
// çıkarırdı. Buradaki her şey SADECE görünür.
//
// ⚠️ HEPSİ GERÇEKTEN ÇİZİLİR. `charms.ts` ve `forge.ts`'teki kuralın aynısı:
// çalışmayan bir şeyi satmak oyuncuyu kandırmaktır. Dört yuvanın dördü de
// ekranda karşılığı olan şeyler:
//   title   → metin (Tavern, leaderboard, hub rıhtımı)
//   plate   → isim rengi/gradyanı
//   trophy  → /art/loot/ sprite'ı (16 dosya diskte hazırdı, hiç kullanılmıyordu)
//   aura    → oyuncunun altındaki renkli hale (fx katmanı)
//
// ⚠️ DOM'SUZ + tema dosyasından BAĞIMSIZ. Bu dosya backend'de de derleniyor
// (`@game/cosmetics`); `@/lib/theme` içe aktarmak sunucu derlemesini kırar.
// Renkler theme.ts'in AYNISI, elle kopyalandı — ikisi ayrışırsa oyuncu-yüzü
// renk değişir, kırılma olmaz.

export type CosmeticSlot = 'title' | 'plate' | 'trophy' | 'aura';
export type Rarity = 'common' | 'rare' | 'epic' | 'legendary';

export interface CosmeticDef {
  id: string;
  /** Oyuncuya görünen ad — İNGİLİZCE */
  name: string;
  slot: CosmeticSlot;
  rarity: Rarity;
  /** Nereden geldiğinin kısa hikâyesi — kartta okunur */
  desc: string;
  /**
   * ⚠️ `earned` olanlar ÇEKİLİŞE GİRMEZ. Başarımla kazanılan bir unvanın
   * tek değeri "satın alınamaz" olmasıdır; gacha havuzunda da bulunursa o
   * değer anında yok olur. `rollCosmetic` bunları dışarıda bırakıyor.
   */
  source?: 'reliquary' | 'earned';
  /** plate: isim gradyanı */
  plate?: { from: string; to: string };
  /** trophy: /art/loot/ şeridi (32×32) */
  trophy?: { src: string; frames: number };
  /** aura: oyuncunun altındaki hale rengi ve yarıçapı (px) */
  aura?: { color: string; radius: number };
}

/**
 * NADİRLİK TABLOSU.
 *
 * `weight` çekiliş ağırlığı, `dust` tekrar düşünce dönüşen toz,
 * `dustCost` tozla DOĞRUDAN alma fiyatı (pity — şansa teslim olmamak için).
 *
 * ⚠️ `dustCost` her zaman `dust`'ın belirgin üstünde olmalı: aksi hâlde
 * "çek, tozla al, çek" döngüsü çekilişten daha verimli olur ve gacha'nın
 * kendisi anlamsızlaşır. Oran testle korunuyor.
 */
export const RARITY: Record<Rarity, {
  weight: number; dust: number; dustCost: number; color: string; label: string;
}> = {
  common: { weight: 58, dust: 5, dustCost: 60, color: '#b8ae98', label: 'COMMON' },
  rare: { weight: 28, dust: 16, dustCost: 190, color: '#8a97a3', label: 'RARE' },
  epic: { weight: 11, dust: 48, dustCost: 620, color: '#efa72e', label: 'EPIC' },
  legendary: { weight: 3, dust: 160, dustCost: 2100, color: '#a01226', label: 'LEGENDARY' },
};

/** Bir çekilişin gold maliyeti — Reliquary'nin tek fiyatı */
export const PULL_COST = 450;

const T = (
  id: string, name: string, rarity: Rarity, desc: string,
): CosmeticDef => ({ id, name, slot: 'title', rarity, desc });

const P = (
  id: string, name: string, rarity: Rarity, from: string, to: string, desc: string,
): CosmeticDef => ({ id, name, slot: 'plate', rarity, desc, plate: { from, to } });

const R = (
  id: string, name: string, rarity: Rarity, file: string, frames: number, desc: string,
): CosmeticDef => ({
  id, name, slot: 'trophy', rarity, desc,
  trophy: { src: `/art/loot/${file}.png`, frames },
});

const A = (
  id: string, name: string, rarity: Rarity, color: string, radius: number, desc: string,
): CosmeticDef => ({ id, name, slot: 'aura', rarity, desc, aura: { color, radius } });

export const COSMETICS: readonly CosmeticDef[] = [
  // ── UNVANLAR ──────────────────────────────────────────────────────
  T('t_grave', 'the Graveborn', 'common', 'What everyone here is called, until they earn otherwise.'),
  T('t_dig', 'Gravedigger', 'common', 'You have moved more earth than most men see in a life.'),
  T('t_wake', 'the Wakeful', 'common', 'Sleep is for those the dark has not yet noticed.'),
  T('t_ash', 'Ash-Walker', 'common', 'The Charnel Works left their mark on your boots.'),
  T('t_toll', 'Bellbound', 'rare', 'The Toll Tower rang for you and you kept walking.'),
  T('t_deep', 'the Deepdrawn', 'rare', 'Something below learned your name before you learned its.'),
  T('t_thrice', 'Thrice-Buried', 'rare', 'Three times down. Three times not staying down.'),
  T('t_choir', 'Choirbreaker', 'epic', 'The Bone Choir sang. You did not join.'),
  T('t_vigil', 'Warden of the Vigil', 'epic', 'Iron holds the gate. You held the iron.'),
  T('t_unburied', 'the Unburied', 'epic', 'No grave has managed to keep you yet.'),
  T('t_first', 'First Graveborn', 'legendary', 'The Last Barrow gave up its oldest title.'),
  T('t_endless', 'Keeper of the Endless Stair', 'legendary', 'You went far enough that the stair stopped counting.'),

  // ── İSİM LEVHALARI ────────────────────────────────────────────────
  // ⚠️ MOR YOK — projenin en katı görsel kuralı. Palet: kemik, kan, mum
  // altını, buz grisi, çürük yeşili, kor turuncusu.
  P('p_bone', 'Bone Script', 'common', '#e3d8c0', '#b8ae98', 'Plain letters, cut clean.'),
  P('p_soil', 'Grave Soil', 'common', '#b8ae98', '#7d7565', 'The colour of turned earth.'),
  P('p_ice', 'Coldbreath', 'common', '#a9b6c2', '#6d7a86', 'Letters that fog when read aloud.'),
  P('p_moss', 'Rot Green', 'rare', '#7fbf62', '#3f6b2f', 'Growth, of the wrong kind.'),
  P('p_blood', 'Bloodletter', 'rare', '#c8324a', '#7a0d1c', 'Written in what was spent getting here.'),
  P('p_ember', 'Ember Oath', 'rare', '#f0a24a', '#b8531a', 'Still warm from the forge.'),
  P('p_candle', 'Candlelight', 'epic', '#f7c46a', '#c07f14', 'The last light anyone brought down.'),
  P('p_wake', "Dead Man's Gold", 'legendary', '#ffe9a8', '#a01226', 'Gold that bled. Worn only by those who came back.'),

  // ── KUPALAR (diskteki /art/loot/) ─────────────────────────────────
  // ⚠️ `spr_Amethyst` KASITLI OLARAK YOK — mor. Projenin kuralı gereği
  // ekranda mor bir şey görünemez, o yüzden 16 dosyanın 15'i kullanılıyor.
  R('r_coin', 'Toll Coin', 'common', 'spr_cozy_coin_strip7', 7, 'One coin. Enough to be let through, once.'),
  R('r_purse', "Sexton's Purse", 'common', 'spr_sack_of_coins_strip5', 5, 'Heavier than it looks. Most of it is teeth.'),
  R('r_silverbar', 'Silver Ingot', 'common', 'spr_sliver_bar_strip3', 3, 'Struck in a mint that no longer exists.'),
  R('r_scroll', 'Sealed Writ', 'common', 'spr_scroll_strip7', 7, 'The seal is unbroken. It is better that way.'),
  R('r_potion', 'Draught of Stillness', 'common', 'spr_blue_potions_strip7', 7, 'Stops the shaking. Stops other things too.'),
  R('r_coinstack', "Gravekeeper's Wages", 'rare', 'spr_coin_stack_strip9', 9, 'Paid monthly. Collected rarely.'),
  R('r_silverstack', 'Silver Hoard', 'rare', 'spr_sliver_stack_strip9', 9, 'Someone counted this pile every night.'),
  R('r_bluegem', 'Coldheart Shard', 'rare', 'spr_blue_gem_strip5', 5, 'Cold to hold. Colder to keep.'),
  R('r_greengem', 'Verdant Tear', 'rare', 'spr_green_gem_strip5', 5, 'Wept by something that should not weep.'),
  R('r_goldbar', 'Bar of Tithe Gold', 'epic', 'spr_gold_bar_strip5', 5, 'The tithe was paid. The debt was not settled.'),
  R('r_redgem', 'Bloodstone', 'epic', 'spr_red_gem_strip5', 5, 'It keeps the temperature of whoever holds it.'),
  R('r_ring', 'Signet of the Vigil', 'epic', 'spr_ring_strip5', 5, 'Still bears the mark of the last warden.'),
  R('r_pearls', 'Drowned Pearls', 'epic', 'spr_pearl_necklace_strip5', 5, 'Recovered from the Sunken Ossuary. Not willingly given.'),
  R('r_effigy', "Saint's Effigy", 'legendary', 'spr_stature_strip7', 7, 'The face has been worn smooth by kissing.'),
  R('r_crown', 'Barrow Crown', 'legendary', 'spr_crown_strip5', 5, 'Taken from the Last Barrow. It has been taken before.'),

  // ── HALELER ───────────────────────────────────────────────────────
  A('a_bone', 'Pale Halo', 'common', '#e3d8c0', 46, 'A faint ring of grave-light.'),
  A('a_ice', 'Cold Wake', 'common', '#8a97a3', 46, 'The air behind you never quite warms.'),
  A('a_moss', 'Rotbloom', 'rare', '#5f9e4a', 50, 'Things grow where you stand still.'),
  A('a_ember', 'Emberfall', 'rare', '#d2691e', 50, 'Sparks that refuse to land.'),
  A('a_blood', 'Bloodmark', 'epic', '#a01226', 54, 'It is not your blood. It has not been for a while.'),
  A('a_candle', 'Vigil Flame', 'legendary', '#efa72e', 58, 'Lit at your first death. Never put out since.'),

  // ── KAZANILANLAR (çekilişte YOK) ──────────────────────────────────
  // ⚠️ Bunların tek değeri satın alınamaz olmaları. Havuza girerlerse
  // başarımlar anlamsızlaşır ve gacha "her şeyi verir" hale gelir.
  { ...T('t_stair', 'Who Counts the Stair', 'legendary', 'Earned, not found. Depth 40 with your own two feet.'), source: 'earned' },
  { ...T('t_hollow', 'Hollow-Handed', 'epic', 'Earned by clearing every road the campaign offers.'), source: 'earned' },
  { ...P('p_relic', 'Reliquary Gold', 'legendary', '#ffe9a8', '#efa72e', 'Earned by emptying the reliquary of every relic it holds.'), source: 'earned' },
  { ...A('a_stone', 'Monument Light', 'epic', '#b8ae98', 52, 'Earned by raising the monument twenty stones high.'), source: 'earned' },
] as const;

export function cosmeticById(id: string): CosmeticDef | undefined {
  return COSMETICS.find((c) => c.id === id);
}

export function cosmeticsInSlot(slot: CosmeticSlot): CosmeticDef[] {
  return COSMETICS.filter((c) => c.slot === slot);
}

/** Çekilişten çıkabilen kozmetikler — koleksiyon sayacı bunu kullanmalı */
export function rollableCosmetics(): CosmeticDef[] {
  return COSMETICS.filter((c) => c.source !== 'earned');
}

/** Başarımla kazanılanlar — Reliquary'de "kazanılır, satın alınmaz" olarak gösterilir */
export function earnedCosmetics(): CosmeticDef[] {
  return COSMETICS.filter((c) => c.source === 'earned');
}

/**
 * ÇEKİLİŞ — saf fonksiyon, zarı ÇAĞIRAN atar.
 *
 * ⚠️ `Math.random()` YASAK (projenin en eski kuralı) ve burada ikinci bir
 * sebep daha var: cüzdan modunda zarı SUNUCU atmalı. Fonksiyon iki [0,1)
 * sayısı alır — birini nadirlik, diğerini o nadirlik içindeki seçim için
 * kullanır. Böylece aynı mantık istemcide (demo) ve sunucuda birebir çalışır.
 *
 * ⚠️ İKİ AYRI ZAR şart. Tek zarı hem nadirliğe hem seçime bölmek, havuz
 * boyutu nadirliğe göre değiştiği için dağılımı sessizce eğerdi.
 */
export function rollCosmetic(rarityRoll: number, pickRoll: number): CosmeticDef {
  const total = Object.values(RARITY).reduce((s, r) => s + r.weight, 0);
  let acc = 0;
  let chosen: Rarity = 'common';
  const target = Math.min(0.999999, Math.max(0, rarityRoll)) * total;
  for (const key of Object.keys(RARITY) as Rarity[]) {
    acc += RARITY[key].weight;
    if (target < acc) { chosen = key; break; }
  }
  // ⚠️ `earned` kozmetikler HAVUZDA YOK — başarımla kazanılanlar satın
  // alınamamalı (bkz. CosmeticDef.source).
  const pool = COSMETICS.filter((c) => c.rarity === chosen && c.source !== 'earned');
  const i = Math.min(pool.length - 1, Math.floor(Math.max(0, pickRoll) * pool.length));
  return pool[i];
}

/** Bir çekilişin sonucu — tekrar geldiyse toza döner */
export interface PullResult {
  cosmetic: CosmeticDef;
  duplicate: boolean;
  /** tekrarsa kazanılan toz, değilse 0 */
  dust: number;
}

/** Çekilişi sahiplik listesine göre yorumla. SAF — girdiyi değiştirmez. */
export function resolvePull(owned: readonly string[], def: CosmeticDef): PullResult {
  const duplicate = owned.includes(def.id);
  return { cosmetic: def, duplicate, dust: duplicate ? RARITY[def.rarity].dust : 0 };
}
