// Nesne DAVRANIŞINI dosya adından çıkarır: çarpışma ve animasyon.
//
// NEDEN: editörde 2086 nesnenin her birine elle "bu duvar mı, kaç fps"
// dedirtmek gerçekçi değil. Bir binanın katı, bir çiçeğin geçilebilir,
// bir portalın animasyonlu olduğu ZATEN adından belli.
//
// Editör yeni nesne koyarken bunu varsayılan olarak kullanır (istenirse
// elle değiştirilir), oyun da eski haritaları bununla onarır.

/** Katı: gövdesinden geçilemez. Değer = alt kısmın kaç pikseli engel. */
const SOLID_RULES: [RegExp, number][] = [
  // binalar — gövdenin alt ~%32'si duvar
  [/house|home|cottage|cabin|manor|villa|hut/i, 0.32],
  [/tavern|inn|bakery|store|shop|smith|forge|workshop|barn|stable|shed|mill/i, 0.32],
  [/church|chapel|cathedral|temple|shrine|tower|keep|castle|hall|library|observatory|laboratory/i, 0.32],
  [/wizard_house|guard_house|town_hall|water_building/i, 0.32],
  // duvar / kapı / çit — neredeyse tamamı engel
  [/castle_wall|_wall|fence|gate(?!s)|palisade/i, 0.55],
  // taş yapılar, mezar, heykel, sunak
  [/tomb|grave|tombstone|statue|pillar|obelisk|altar|monument|ruin/i, 0.4],
  // ağaç — sadece gövde (tepesinden geçilir)
  [/tree|trunk|stump|log(?!s_on)/i, 0.16],
  // kaya, kuyu, araba, tezgah, sandık, varil
  [/rock|boulder|stone(?!_path|_floor)|well|cart|wagon|stall|crate|box|barrel|hay(?!stack_flat)/i, 0.3],
  [/anvil|furnace|campfire|fire_pit|cauldron|target|dummy|bench|table/i, 0.28],
];

/** Kesinlikle geçilebilir — zemin süsü. Kural sırası önemli, bunlar önce bakılır. */
const PASSABLE = /grass|flower|mushroom|leaf|tuft|path|dirt|mud|lilly|plant|puddle|shadow|light_overlay|overlay|decal|crack/i;

/** Animasyon hızları — dosya adına göre */
const FPS_RULES: [RegExp, number][] = [
  [/portal/i, 10],
  [/fire|flame|torch|campfire|candle|lantern|lamp(?!_off)/i, 8],
  [/fountain|water|lake|river|wave/i, 2.5],
  [/mill|windmill/i, 8],
  [/chest|mimic/i, 0],     // sandık: durgun dursun, açılınca oynatılır
  [/banner|flag|cloth/i, 4],
  [/smoke|steam|spark|glow|magic|rune|crystal|gem|coin|orb/i, 7],
];

/** Bu nesnenin alt kaç pikseli engel olmalı (0 = geçilebilir) */
export function autoSolid(src: string, h: number): number {
  const name = src.split('/').pop() ?? src;
  if (PASSABLE.test(name)) return 0;
  for (const [re, frac] of SOLID_RULES) {
    if (re.test(name)) return Math.max(6, Math.round(h * frac));
  }
  return 0;
}

/** Bu nesne animasyonlu mu, kaç fps (0 = durgun) */
export function autoFps(src: string): number {
  const name = src.split('/').pop() ?? src;
  // Çok kareli değilse animasyon anlamsız
  if (!/_strip(\d+)/i.test(name)) return 0;
  for (const [re, fps] of FPS_RULES) {
    if (re.test(name)) return fps;
  }
  return 6; // strip'i var ama tanımadık → yavaşça oynat
}

/** Köprü mü — su üstünde yürünebilir alan sağlar */
export function isBridge(src: string): boolean {
  return /bridge|step_stones|dock|pier|plank/i.test(src);
}
