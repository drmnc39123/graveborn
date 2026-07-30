// Nesne DAVRANIŞINI dosya adından çıkarır: çarpışma ve animasyon.
//
// NEDEN: editörde 2086 nesnenin her birine elle "bu duvar mı, kaç fps"
// dedirtmek gerçekçi değil. Bir binanın katı, bir çiçeğin geçilebilir,
// bir portalın animasyonlu olduğu ZATEN adından belli.
//
// Editör yeni nesne koyarken bunu varsayılan olarak kullanır (istenirse
// elle değiştirilir), oyun da eski haritaları bununla onarır.

/**
 * Katı nesneler. [desen, yükseklik oranı, genişlik oranı]
 *
 * ÖNCEKİ HATA: bina için 0.32 verilmişti — 96 px'lik evin üst 65 px'inden
 * geçiliyordu, oyuncu "binanın içine giriyorum" diyordu. Üstten görünümde
 * bir binanın ayak izi gövdesinin ALT YARISINDAN FAZLASIDIR; çatı payı
 * bırakmak yeter. Genişlik de 0.64'tü, bitişik duvarlar arasında delik
 * kalıyordu — 0.9'a çıkarıldı.
 */
const SOLID_RULES: [RegExp, number, number][] = [
  // binalar — çatı payı hariç neredeyse tamamı
  [/house|home|cottage|cabin|manor|villa|hut/i, 0.62, 0.9],
  [/tavern|inn|bakery|store|shop|smith|forge|workshop|barn|stable|shed|mill/i, 0.62, 0.9],
  [/church|chapel|cathedral|temple|shrine|tower|keep|castle|hall|library|observatory|laboratory/i, 0.6, 0.88],
  [/wizard_house|guard_house|town_hall|water_building/i, 0.62, 0.9],
  // duvar / kapı / çit — tamamı engel, aralarında delik olmamalı
  [/castle_wall|_wall|fence|gate(?!s)|palisade/i, 0.85, 0.98],
  // mezar, heykel, sütun, harabe
  [/tomb|grave|tombstone|statue|pillar|obelisk|altar|monument|ruin/i, 0.62, 0.85],
  // ağaç — sadece gövde (tepesinden geçilir, bu KASITLI)
  [/tree|trunk|stump|log(?!s_on)/i, 0.22, 0.4],
  // kaya, kuyu, araba, tezgah, sandık, varil
  [/rock|boulder|stone(?!_path|_floor)|well|cart|wagon|stall|crate|box|barrel|hay(?!stack_flat)/i, 0.5, 0.8],
  [/anvil|furnace|campfire|fire_pit|cauldron|target|dummy|bench|table/i, 0.45, 0.8],
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

/** Çarpışma kutusunun genişlik oranı (0..1) */
export function autoSolidW(src: string): number {
  const name = src.split('/').pop() ?? src;
  for (const [re, , wf] of SOLID_RULES) if (re.test(name)) return wf;
  return 0.8;
}

/** Duvar/çit mi — yol karosu bunları DELER (kapı geçişi) */
export function isWall(src: string): boolean {
  return /castle_wall|_wall|fence|gate(?!s)|palisade/i.test(src.split('/').pop() ?? src);
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

/**
 * ZEMİN görseli mi? Bunlar nesne olarak konsa bile HER ZAMAN en altta
 * çizilmeli. Aksi hâlde derinlik sırasına girip karakterin üstünü örtüyor
 * ("karakter zeminin arkasına saklanıyor" şikayeti tam olarak buydu).
 */
export function isGround(src: string): boolean {
  const n = src.split('/').pop() ?? src;
  return /floor|ground|_path|path_|pattern_stone|cobble|tile(?!set)|pavement|carpet|rug|road|grass|dirt|mud|sand|gravel/i.test(n);
}

/** Zemin nesnelerine verilen çizim önceliği — her şeyin altında kalsınlar */
export const GROUND_Z = -1_000_000;
