// BÖLÜM SANAT YÖNÜ — her yolun kendi zemini, kendi enkazı, kendi havası.
//
// NİYE VAR: arena tek bir 64×64 karonun sonsuz tekrarıydı. On bölümün onu da
// aynı kahverengi düzlükte geçiyordu; "The Hollow Wood" ile "The Bone Choir"
// arasında görsel HİÇBİR fark yoktu ve karo kenarları ızgara gibi okunuyordu.
// Varlıklar diskte hazır duruyordu (16 karanlık ağaç, katakomp zemini, tabut,
// kafatası, harabe) ama savaş ekranı hiçbirine dokunmuyordu.
//
// ⚠️ BU DOSYA SAF VERİ + SAF HASH. DOM yok, `Math.random()` yok. Dekor
// yerleşimi konumdan türer: aynı koordinat her cihazda, her koşuda aynı
// görünür. Motorun `rng` akışına ASLA dokunmaz — kozmetik bir zar atmak
// simülasyonu kaydırır ve aynı seed başka oyun üretir.
//
// ⚠️ DEKOR ÇARPIŞMA YAPMAZ. Görsel olarak orada, mekanik olarak yok.
//
// ⚠️ KARO SETİ İKİ SINIFTAN OLUŞUYOR — ÖLÇÜLDÜ, tahmin değil:
//     OPAK   (a=1.00):    grass_1/2, mud_1/2, catacomb_floor_1…6  → zemin
//     ŞEFFAF (a≈0.20-0.30): grass_3, gold_floor_1/2, rock          → üst katman
//   Şeffaf olanı zemin sanıp tek başına çizmek ekranı koyu karelerle
//   doldurmuştu: altında hiçbir şey yok, taban dolgusu görünüyordu. Bunlar
//   `overlay` — baz karonun ÜSTÜNE binerler.
//
// ⚠️ Aynı ailedeki karolar neredeyse aynı ortalama renkte (catacomb_floor'lar
//   rgb(52…60, 66…75, 61…67); grass_1 ile grass_2 birebir aynı). Bu yüzden
//   serbestçe karışabilirler — "dama tahtası" sorunu renk farkından değil
//   ŞEFFAFLIKTAN geliyordu.

const G = '/art/stage/ground';
const D = '/art/stage/dungeon';
const T = '/art/stage/trees';
const R = '/art/world/ruins';
const P = '/art/world/props';

export interface DecorDef {
  src: string;
  w: number;
  h: number;
  /** 32px'lik hücre başına düşme ihtimali (0..1) — seyreklik buradan ayarlanır */
  chance: number;
  /** 0..1 saydamlık — enkaz zemine gömülü hissetsin */
  alpha?: number;
  /**
   * Altına düşen gölgenin koyuluğu (0..1).
   * ⚠️ Gölgesiz enkaz zeminin ÜSTÜNE yapıştırılmış gibi duruyor; basit bir
   * elips onu sahnenin içine oturtuyor. Sprite'ların kendi gölgesi yok.
   */
  shadow?: number;
}

/** Baz karonun üstüne binen şeffaf detay — çim tutamı, çatlak, döküntü */
export interface OverlayDef {
  src: string;
  /** hücre başına görülme ihtimali (0..1) */
  chance: number;
}

export interface StageArt {
  /** ⚠️ SADECE OPAK 32×32 karolar */
  ground: string[];
  /** karo ağırlıkları — aynı ailedeki karolar benzer renkte olduğu için eşite yakın olabilir */
  weights: number[];
  /** baz karonun üstüne binen şeffaf detaylar */
  overlay: OverlayDef[];
  /**
   * Zemin renk derecelendirmesi — chunk'a BİR KEZ uygulanır.
   * ⚠️ Sadece atmosfer katmanıyla karartmak yetmiyordu: çim parlak yeşil
   * (ölçüldü: rgb 105,135,56) kalıyor, sahne gotik korku değil çocuk RPG'si
   * gibi görünüyordu. Zemin kendi içinde koyulaşmalı ki aktörler öne çıksın.
   */
  grade: { sat: number; bright: number; tintA: number };
  /**
   * Atmosfer yıkaması [r, g, b, alpha].
   * ⚠️ Hazır rgba METNİ DEĞİL: bu renk oyuncu etrafında açılan bir ışık
   * halesine dönüştürülüyor (merkezde soluk, kenarda koyu).
   */
  tint: [number, number, number, number];
  /** sis yoğunluğu 0..1 */
  fog: number;
  decor: DecorDef[];
}

/**
 * Deterministik hash — konumdan sabit bir 0..1 üretir.
 * Motorun rng'sinden BAĞIMSIZ olmalı: render simülasyonu kirletemez.
 */
export function tileHash(x: number, y: number, salt = 0): number {
  let h = (Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(salt, 2246822519)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177) | 0;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

// ── Sık kullanılan parçalar ──
const tree = (chance: number): DecorDef => ({ src: `${T}/spr_dark_tree_1.png`, w: 96, h: 96, chance, alpha: 0.95, shadow: 0.34 });
const skull = (chance: number): DecorDef => ({ src: `${D}/spr_skull_1.png`, w: 32, h: 32, chance, alpha: 0.75 });
const bones = (chance: number): DecorDef => ({ src: `${D}/spr_skulls.png`, w: 32, h: 32, chance, alpha: 0.7 });
const rubble = (chance: number): DecorDef => ({ src: `${G}/spr_rock.png`, w: 32, h: 32, chance, alpha: 0.85 });

// Şeffaf üst katmanlar — ölçülen alpha ≈ 0.20-0.30
const grassTuft = (chance: number): OverlayDef => ({ src: `${G}/spr_grass_3.png`, chance });
const cracks = (chance: number): OverlayDef => ({ src: `${D}/spr_gold_floor_1.png`, chance });
const cracks2 = (chance: number): OverlayDef => ({ src: `${D}/spr_gold_floor_2.png`, chance });
const grit = (chance: number): OverlayDef => ({ src: `${G}/spr_rock.png`, chance });

/**
 * ⚠️ Ağaçlar TEK dosya değil — 16 varyant var. Hepsini tek tek listelemek
 * yerine hash ile seçiliyor (bkz. `variantOf`).
 */
export const TREE_VARIANTS = 16;

/** Ağaç dekoru için varyant yolu — hash'ten türer, dosya adı hesaplanır */
export function variantOf(src: string, r: number): string {
  if (!src.includes('spr_dark_tree_')) return src;
  const n = 1 + Math.floor(r * TREE_VARIANTS);
  return src.replace(/spr_dark_tree_\d+/, `spr_dark_tree_${Math.min(n, TREE_VARIANTS)}`);
}

/**
 * On yol, on ayrı his. Sıra kasıtlı: yeşil/topraktan başlar, kemiğe ve taşa
 * gider. Oyuncu ilerlerken zeminin altından çıkanlar değişsin.
 */
export const STAGE_ART: Record<number, StageArt> = {
  // 1 — The Hollow Wood: hâlâ orman, ama ışık çekilmiş
  1: {
    ground: [`${G}/spr_grass_1.png`, `${G}/spr_grass_2.png`],
    weights: [6, 5],
    overlay: [grassTuft(0.16)],
    grade: { sat: 0.40, bright: 0.60, tintA: 0.34 },
    tint: [18, 26, 18, 0.52],
    fog: 0.16,
    decor: [tree(0.020), rubble(0.006)],
  },
  // 2 — Ossuary Halls: toprak altına iniş
  2: {
    ground: [`${D}/spr_catacomb_floor_1.png`, `${D}/spr_catacomb_floor_2.png`, `${D}/spr_catacomb_floor_3.png`],
    weights: [5, 4, 4],
    overlay: [cracks(0.08), grit(0.05)],
    grade: { sat: 0.48, bright: 0.62, tintA: 0.32 },
    tint: [14, 16, 22, 0.55],
    fog: 0.2,
    decor: [skull(0.010), bones(0.006), { src: `${D}/spr_coffin_1.png`, w: 32, h: 32, shadow: 0.22, chance: 0.003, alpha: 0.85 }],
  },
  // 3 — The Charnel Works: çamur ve enkaz
  3: {
    ground: [`${G}/spr_mud_1.png`, `${G}/spr_mud_2.png`],
    weights: [5, 4],
    overlay: [grit(0.10), cracks(0.05)],
    grade: { sat: 0.50, bright: 0.58, tintA: 0.34 },
    tint: [24, 16, 14, 0.55],
    fog: 0.22,
    decor: [bones(0.010), rubble(0.007), { src: `${D}/spr_smashed_objs.png`, w: 32, h: 32, chance: 0.005, alpha: 0.8 }],
  },
  // 4 — The Toll Tower: taş
  4: {
    ground: [`${D}/spr_catacomb_floor_2.png`, `${D}/spr_catacomb_floor_5.png`],
    weights: [5, 4],
    overlay: [grit(0.12)],
    grade: { sat: 0.44, bright: 0.62, tintA: 0.32 },
    tint: [16, 18, 24, 0.55],
    fog: 0.2,
    decor: [rubble(0.009), { src: `${R}/spr_old_stone_1.png`, w: 32, h: 32, shadow: 0.2, chance: 0.006, alpha: 0.8 }, skull(0.004)],
  },
  // 5 — The Black Chapel: altın damarlı taş
  5: {
    ground: [`${D}/spr_catacomb_floor_1.png`, `${D}/spr_catacomb_floor_4.png`],
    weights: [6, 3],
    overlay: [cracks(0.13), cracks2(0.08)],
    grade: { sat: 0.54, bright: 0.60, tintA: 0.34 },
    tint: [20, 14, 16, 0.58],
    fog: 0.24,
    decor: [{ src: `${D}/spr_coffin_2.png`, w: 32, h: 32, shadow: 0.22, chance: 0.008, alpha: 0.9 }, skull(0.008), bones(0.005)],
  },
  // 6 — The Sunken Ossuary: su altı çamuru
  6: {
    ground: [`${G}/spr_mud_2.png`, `${G}/spr_mud_1.png`],
    weights: [5, 4],
    overlay: [grit(0.08)],
    grade: { sat: 0.42, bright: 0.56, tintA: 0.36 },
    tint: [12, 20, 22, 0.58],
    fog: 0.28,
    decor: [bones(0.012), { src: `${D}/spr_bone_pillow.png`, w: 16, h: 64, chance: 0.004, alpha: 0.75 }, rubble(0.005)],
  },
  // 7 — Gallows Reach: açık arazi, kırık yapılar
  7: {
    ground: [`${G}/spr_mud_1.png`, `${G}/spr_mud_2.png`],
    weights: [5, 4],
    overlay: [grassTuft(0.11), grit(0.06)],
    grade: { sat: 0.44, bright: 0.60, tintA: 0.33 },
    tint: [22, 18, 14, 0.56],
    fog: 0.2,
    decor: [tree(0.012), { src: `${R}/spr_broken_wall.png`, w: 64, h: 64, shadow: 0.26, chance: 0.006, alpha: 0.8 }, skull(0.006)],
  },
  // 8 — The Bone Choir: kemik tarlası
  8: {
    ground: [`${D}/spr_catacomb_floor_3.png`, `${D}/spr_catacomb_floor_1.png`, `${D}/spr_catacomb_floor_6.png`],
    weights: [5, 4, 4],
    overlay: [cracks2(0.06)],
    grade: { sat: 0.42, bright: 0.60, tintA: 0.34 },
    tint: [16, 16, 20, 0.58],
    fog: 0.26,
    decor: [skull(0.016), bones(0.012), { src: `${D}/spr_coffin_1.png`, w: 32, h: 32, shadow: 0.22, chance: 0.004, alpha: 0.85 }],
  },
  // 9 — The Iron Vigil: antik duvarlar
  9: {
    ground: [`${D}/spr_catacomb_floor_5.png`, `${D}/spr_catacomb_floor_4.png`],
    weights: [5, 4],
    overlay: [grit(0.12), cracks(0.05)],
    grade: { sat: 0.40, bright: 0.58, tintA: 0.35 },
    tint: [14, 16, 20, 0.6],
    fog: 0.24,
    decor: [
      { src: `${R}/spr_ancient_wall_1.png`, w: 64, h: 64, shadow: 0.26, chance: 0.007, alpha: 0.82 },
      { src: `${R}/spr_fallen_pillow_1.png`, w: 64, h: 64, shadow: 0.22, chance: 0.005, alpha: 0.8 },
      rubble(0.007),
    ],
  },
  // 10 — The Last Barrow: mezar
  10: {
    ground: [`${D}/spr_catacomb_floor_6.png`, `${D}/spr_catacomb_floor_1.png`],
    weights: [5, 3],
    overlay: [cracks(0.10), grit(0.06)],
    grade: { sat: 0.46, bright: 0.54, tintA: 0.38 },
    tint: [18, 12, 14, 0.62],
    fog: 0.3,
    decor: [
      { src: `${R}/spr_Heros_Tomb.png`, w: 64, h: 64, shadow: 0.3, chance: 0.004, alpha: 0.85 },
      skull(0.012), bones(0.008), tree(0.008),
    ],
  },

  // ══ İKİNCİ KİTAP: 11-25 ═══════════════════════════════════════════════
  //
  // ⚠️ YENİ KARO YOK ve gerek de yok. Ayrım `grade` + `tint` + `fog`'dan
  // geliyor: aynı katakomp zemini, mor olmayan bir renk sıcaklığı ve farklı
  // bir sis yoğunluğuyla bambaşka bir yer gibi okunuyor. Ölçüldü — karo
  // ailelerinin ortalama renkleri zaten birbirine çok yakın (dosya başlığı),
  // yani ayrımı taşıyan şey karo DEĞİL, renk katmanı.
  //
  // ⚠️ MOR YOK. `tint` üçlüleri seçilirken kırmızı-mavi dengesi bilerek
  // bozuk tutuldu (biri diğerinden belirgin yüksek), çünkü ikisi eşitlenip
  // yeşil düşünce ekranda mor çıkıyor.

  // 11 — The Weeping Steps: ıslak taş, damlayan sis
  11: {
    ground: [`${D}/spr_catacomb_floor_3.png`, `${D}/spr_catacomb_floor_5.png`],
    weights: [5, 4],
    overlay: [grit(0.10), cracks2(0.06)],
    grade: { sat: 0.34, bright: 0.52, tintA: 0.40 },
    tint: [12, 20, 26, 0.62],
    fog: 0.34,
    decor: [{ src: `${R}/spr_Ancient_Pillow_1.png`, w: 64, h: 64, shadow: 0.24, chance: 0.006, alpha: 0.8 }, bones(0.010)],
  },
  // 12 — Ashfall Reach: kül düşen çorak
  12: {
    ground: [`${G}/spr_mud_1.png`, `${G}/spr_mud_2.png`],
    weights: [5, 5],
    overlay: [grit(0.16)],
    grade: { sat: 0.30, bright: 0.56, tintA: 0.36 },
    tint: [30, 20, 14, 0.58],
    fog: 0.30,
    decor: [rubble(0.012), { src: `${R}/spr_Rock_Pile_1.png`, w: 64, h: 64, shadow: 0.26, chance: 0.005, alpha: 0.85 }],
  },
  // 13 — The Drowned Gate: su altı kapısı, soğuk
  13: {
    ground: [`${D}/spr_catacomb_floor_2.png`, `${G}/spr_mud_2.png`],
    weights: [5, 3],
    overlay: [cracks(0.12), grit(0.05)],
    grade: { sat: 0.42, bright: 0.50, tintA: 0.44 },
    tint: [10, 22, 32, 0.66],
    fog: 0.40,
    decor: [{ src: `${D}/spr_water_bowl.png`, w: 32, h: 32, shadow: 0.18, chance: 0.006, alpha: 0.8 }, bones(0.008), rubble(0.006)],
  },
  // 14 — Hollow King's Court: altın çürümüş taht salonu
  14: {
    ground: [`${D}/spr_catacomb_floor_4.png`, `${D}/spr_catacomb_floor_6.png`],
    weights: [5, 4],
    overlay: [cracks(0.18), cracks2(0.10)],
    grade: { sat: 0.52, bright: 0.56, tintA: 0.34 },
    tint: [30, 24, 10, 0.56],
    fog: 0.26,
    decor: [
      { src: `${R}/spr_Ancient_Pillow_2.png`, w: 64, h: 64, shadow: 0.26, chance: 0.007, alpha: 0.82 },
      { src: `${D}/spr_flag.png`, w: 32, h: 32, shadow: 0.2, chance: 0.004, alpha: 0.8 },
      skull(0.008),
    ],
  },
  // 15 — The Rat Cathedral: pislik ve kemik
  15: {
    ground: [`${G}/spr_mud_1.png`, `${D}/spr_catacomb_floor_1.png`],
    weights: [5, 4],
    overlay: [grit(0.14), cracks2(0.05)],
    grade: { sat: 0.38, bright: 0.48, tintA: 0.40 },
    tint: [22, 20, 12, 0.62],
    fog: 0.32,
    decor: [bones(0.018), skull(0.014), rubble(0.008)],
  },
  // 16 — Emberglass Wastes: cam gibi yanmış toprak
  16: {
    ground: [`${G}/spr_mud_2.png`, `${D}/spr_catacomb_floor_5.png`],
    weights: [5, 3],
    overlay: [cracks(0.20), grit(0.08)],
    grade: { sat: 0.44, bright: 0.60, tintA: 0.34 },
    tint: [36, 18, 10, 0.58],
    fog: 0.24,
    decor: [rubble(0.014), { src: `${R}/spr_Rock_Pile_1.png`, w: 64, h: 64, shadow: 0.28, chance: 0.006, alpha: 0.85 }],
  },
  // 17 — The Sunless Vault: ışıksız hazine
  17: {
    ground: [`${D}/spr_catacomb_floor_6.png`, `${D}/spr_catacomb_floor_4.png`],
    weights: [5, 4],
    overlay: [cracks2(0.14), grit(0.06)],
    grade: { sat: 0.30, bright: 0.44, tintA: 0.46 },
    tint: [14, 14, 20, 0.68],
    fog: 0.42,
    decor: [
      { src: `${D}/spr_coffin_2.png`, w: 32, h: 32, shadow: 0.24, chance: 0.006, alpha: 0.85 },
      { src: `${R}/spr_Ancient_Pillow_3.png`, w: 64, h: 64, shadow: 0.26, chance: 0.005, alpha: 0.8 },
    ],
  },
  // 18 — Carrionfield: açık alan, leş
  18: {
    ground: [`${G}/spr_grass_1.png`, `${G}/spr_mud_1.png`],
    weights: [4, 5],
    overlay: [grassTuft(0.10), grit(0.08)],
    grade: { sat: 0.36, bright: 0.54, tintA: 0.38 },
    tint: [22, 24, 14, 0.58],
    fog: 0.28,
    decor: [bones(0.016), tree(0.010), skull(0.010)],
  },
  // 19 — The Iron Throat: dar, metalik, boğucu
  19: {
    ground: [`${D}/spr_catacomb_floor_5.png`, `${D}/spr_catacomb_floor_3.png`],
    weights: [5, 4],
    overlay: [grit(0.18), cracks(0.06)],
    grade: { sat: 0.26, bright: 0.46, tintA: 0.46 },
    tint: [18, 20, 24, 0.68],
    fog: 0.38,
    decor: [
      { src: `${R}/spr_ancient_wall_1.png`, w: 64, h: 64, shadow: 0.28, chance: 0.009, alpha: 0.84 },
      rubble(0.010),
    ],
  },
  // 20 — The Pale Procession: kemik beyazı geçit
  20: {
    ground: [`${D}/spr_catacomb_floor_1.png`, `${D}/spr_catacomb_floor_2.png`],
    weights: [5, 5],
    overlay: [cracks2(0.16), grit(0.05)],
    grade: { sat: 0.22, bright: 0.66, tintA: 0.30 },
    tint: [26, 26, 24, 0.50],
    fog: 0.22,
    decor: [
      skull(0.020), bones(0.016),
      { src: `${D}/spr_coffin_1.png`, w: 32, h: 32, shadow: 0.22, chance: 0.006, alpha: 0.85 },
    ],
  },
  // 21 — Where the Wood Ends: ormanın son hâli
  21: {
    ground: [`${G}/spr_grass_2.png`, `${G}/spr_mud_2.png`],
    weights: [4, 5],
    overlay: [grassTuft(0.14), grit(0.06)],
    grade: { sat: 0.32, bright: 0.44, tintA: 0.44 },
    tint: [14, 22, 16, 0.66],
    fog: 0.40,
    decor: [tree(0.028), rubble(0.008), bones(0.006)],
  },
  // 22 — The Ossuary Deep: kemik üstüne kemik
  22: {
    ground: [`${D}/spr_catacomb_floor_2.png`, `${D}/spr_catacomb_floor_6.png`],
    weights: [5, 4],
    overlay: [cracks(0.14), cracks2(0.08)],
    grade: { sat: 0.26, bright: 0.48, tintA: 0.44 },
    tint: [20, 18, 22, 0.66],
    fog: 0.36,
    decor: [
      bones(0.024), skull(0.018),
      { src: `${D}/spr_bone_pillow.png`, w: 32, h: 32, shadow: 0.22, chance: 0.008, alpha: 0.85 },
    ],
  },
  // 23 — The Furnace Below: kor, en sıcak bölüm
  23: {
    ground: [`${G}/spr_mud_1.png`, `${D}/spr_catacomb_floor_4.png`],
    weights: [5, 4],
    overlay: [cracks(0.24), grit(0.10)],
    grade: { sat: 0.50, bright: 0.58, tintA: 0.36 },
    tint: [40, 16, 8, 0.60],
    fog: 0.26,
    decor: [rubble(0.016), { src: `${R}/spr_Rock_Pile_1.png`, w: 64, h: 64, shadow: 0.3, chance: 0.008, alpha: 0.85 }],
  },
  // 24 — The Widow's Vigil: bekleyiş, en soğuk bölüm
  24: {
    ground: [`${D}/spr_catacomb_floor_3.png`, `${D}/spr_catacomb_floor_1.png`],
    weights: [5, 4],
    overlay: [grit(0.12), cracks2(0.08)],
    grade: { sat: 0.24, bright: 0.42, tintA: 0.48 },
    tint: [12, 18, 28, 0.70],
    fog: 0.46,
    decor: [
      { src: `${R}/spr_Heros_Tomb.png`, w: 64, h: 64, shadow: 0.3, chance: 0.006, alpha: 0.85 },
      { src: `${D}/spr_coffin_2.png`, w: 32, h: 32, shadow: 0.24, chance: 0.008, alpha: 0.85 },
      bones(0.010),
    ],
  },
  // 25 — The Grave of Graves: son bölüm, her şeyin bittiği yer
  25: {
    ground: [`${D}/spr_catacomb_floor_6.png`, `${D}/spr_catacomb_floor_5.png`],
    weights: [5, 4],
    overlay: [cracks(0.20), cracks2(0.14), grit(0.08)],
    grade: { sat: 0.44, bright: 0.40, tintA: 0.52 },
    tint: [26, 10, 12, 0.72],
    fog: 0.50,
    decor: [
      { src: `${R}/Spr_Ancient_Archway_1_big.png`, w: 96, h: 96, shadow: 0.34, chance: 0.004, alpha: 0.86 },
      { src: `${R}/spr_Heros_Tomb.png`, w: 64, h: 64, shadow: 0.3, chance: 0.006, alpha: 0.85 },
      skull(0.022), bones(0.018), tree(0.008),
    ],
  },
};

/** Bilinmeyen bölüm için 1. yol — eksik veri sahneyi boş bırakmasın */
export function artOf(stageId: number): StageArt {
  return STAGE_ART[stageId] ?? STAGE_ART[1];
}
