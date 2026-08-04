// THE OSSUARY — gold'un GERÇEKTEN sonsuz sinki.
//
// ⚠️ NEDEN RELIQUARY YETMİYOR: koleksiyon SONLU. 41 kozmetiğin hepsi
// toplandığında Reliquary sadece toz üretmeye başlar ve talebi düşer.
// Ölçüldü — oyuncu duvarında 4.170 gold/saat üretiyor; ekonominin bu akışı
// SONSUZA KADAR emen bir yere ihtiyacı var, yoksa gold birikir ve değersizleşir.
//
// Ossuary o yer: kendi anıtın. Seviyesi tavanı YOK, her seviye bir öncekinden
// pahalı, ve tek verdiği şey GÖRÜNÜRLÜK (leaderboard'da yanında duran rütbe).
//
// ⚠️ FORGE'UN "ASLA DOYMAMALI" KURALI BURAYA TAŞINDI. O kural Forge'da
// emekliye ayrıldı (karma model: Forge erken-orta oyunun güç tabanı, bitmesi
// bir kilometre taşı). Ama ekonominin BİR yerinde dipsiz bir kova olmak
// zorunda — burası orası. Bu dosyaya maxLevel EKLEMEYİN.
//
// ⚠️ GÜÇ VERMEZ. `cosmetics.ts`'teki kuralın aynısı.

/**
 * Seviye maliyeti: base · growth^(level-1).
 *
 * `growth` SEÇİLİRKEN ÖLÇÜLDÜ. Çok dik olursa (≥1.25) yirmi seviye sonra tek
 * bir basamak ulaşılamaz hale gelir ve oyuncu hedefi bırakır — sink ölür.
 * Çok yatay olursa (≤1.08) oyuncu yüz seviye alıp sıkılır ve sink yine ölür.
 * 1,13'te bir sonraki seviye HER ZAMAN görünür mesafede ama toplam asla
 * bitmiyor:
 *   L1 400 · L10 1.200 · L25 7.600 · L50 158.800 · L75 3,3M
 * Ölçülen 4.170 gold/saat ile L50 tek başına ~38 saatlik gelir — oyuncunun
 * doğal duracağı yer orası, ve orada bile "bir sonraki" duruyor.
 */
export const OSSUARY = {
  baseCost: 400,
  growth: 1.13,
  /** kaç seviyede bir rütbe adı değişir */
  tierEvery: 10,
} as const;

/**
 * RÜTBE ADLARI. Son ad tükenirse sayı devam eder ("Necropolis IV") — liste
 * bitince sistemin durmaması şart, çünkü seviyenin tavanı yok.
 */
const TIERS = [
  'Unmarked Grave',
  'Cairn',
  'Barrow',
  'Sepulchre',
  'Mausoleum',
  'Ossuary',
  'Catacomb',
  'Necropolis',
] as const;

const ROMAN = ['', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'];

/** Bir sonraki seviyenin maliyeti. `level` = ŞU ANKİ seviye (0 = hiç yükseltilmemiş) */
export function ossuaryCost(level: number): number {
  const lv = Math.max(0, Math.floor(level));
  return Math.round(OSSUARY.baseCost * Math.pow(OSSUARY.growth, lv));
}

/** Şimdiye kadar anıta gömülen toplam gold */
export function ossuarySpent(level: number): number {
  let s = 0;
  for (let i = 0; i < Math.max(0, Math.floor(level)); i++) s += ossuaryCost(i);
  return s;
}

/**
 * Seviyenin rütbe adı. Liste bitince Roma rakamıyla devam eder —
 * tavansız bir sistemde adların da tükenmemesi gerekir.
 */
export function ossuaryTier(level: number): string {
  const lv = Math.max(0, Math.floor(level));
  const i = Math.floor(lv / OSSUARY.tierEvery);
  if (i < TIERS.length) return TIERS[i];
  const tur = Math.floor(i / TIERS.length);
  const ad = TIERS[TIERS.length - 1];
  return `${ad} ${ROMAN[Math.min(tur, ROMAN.length - 1)] || `×${tur}`}`;
}

/** Rütbe içindeki ilerleme (0..1) — arayüz çubuğu için */
export function ossuaryTierProgress(level: number): number {
  return (Math.max(0, Math.floor(level)) % OSSUARY.tierEvery) / OSSUARY.tierEvery;
}
