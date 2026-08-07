// HAFTALIK SEZON — leaderboard'un ikinci ekseni.
//
// NİYE VAR: tüm-zamanlar tablosu bir süre sonra KAPANIR. İlk oyuncular
// tepeye yerleşir, sonradan gelen matematiksel olarak birinci olamaz ve
// tablo ona "burası senin için değil" der. Haftalık sezon o kapıyı her
// Pazartesi yeniden açıyor: herkesin sıfırdan bir şansı oluyor.
//
// ⚠️ TÜM-ZAMANLAR TABLOSU KALDIRILMIYOR. İkisi farklı soruya cevap veriyor:
// "en iyi kim" (kalıcı prestij) ve "bu hafta kim" (tekrar gelme sebebi).
// Birini diğerinin yerine koymak ikisinden birini yok eder.
//
// ⚠️ ÖDÜL GOLD DEĞİL. Sıralama ödülü gold verseydi en iyi oyuncu aynı
// zamanda en çok gold basan olurdu — musluk beceriyle üssel büyürdü.
// Aynı gerekçe The Wager'da, haftalık boss'ta ve başarımlarda da geçerliydi;
// üçünde de aynı sonuca ayrı ayrı varıldı. Ödül: KOZMETİK + TOZ.
// Toz yalnızca kozmetik alır (bkz. cosmetics.ts dustCost), ekonomiye sızmaz.

import { bossWeek, weekEndsAt } from './worldBoss';

/**
 * Hafta tanımı TEK KAYNAK: haftalık boss ile birebir aynı.
 *
 * ⚠️ İkinci bir hafta tanımı yazma. Kaçınılmaz olarak kayar (biri Pazartesi
 * 00:00 UTC, diğeri yerel saat sanır) ve oyuncu "boss haftası bitti ama
 * sezon bitmedi" gibi açıklanamayan bir durumla karşılaşır.
 */
export const seasonWeek = bossWeek;
export const seasonEndsAt = weekEndsAt;

export interface SeasonReward {
  /** kaçıncı sıradan kaçıncı sıraya kadar (dahil) */
  from: number;
  to: number;
  /** kazanılan kozmetik id'si (cosmetics.ts, source:'earned') — yoksa sadece toz */
  cosmetic?: string;
  dust: number;
  label: string;
}

/**
 * ÖDÜL TABLOSU.
 *
 * ⚠️ BU TABLO ÖNCE SADECE İLK 10'DU ve gerekçesi şuydu: "daha geniş bir tablo
 * ödülü ucuzlatır — 'ilk 10'a girdim' bir cümledir, 'ilk 100'e girdim'
 * değildir." O gerekçe HÂLÂ GEÇERLİ ve tablo onu bozmadan genişledi.
 *
 * RETENTION.md'nin itirazı da haklıydı: 11. sıradaki için sezon YOK
 * hükmündeydi. Bütün hafta oynayıp 12. biten oyuncu, hiç oynamayanla tam
 * olarak aynı şeyi alıyordu — ve bir daha denemek için hiçbir sebebi yoktu.
 *
 * ÇÖZÜM İKİ TABAKA:
 *   • İlk 10  → KOZMETİK + toz. Görünen, övünülen, taşınan şey burada kalır.
 *   • 11-100 → SADECE TOZ, kozmetik YOK. Tırmanmak için bir sebep var ama
 *     "ilk 10" çizgisi hâlâ bir çizgi.
 *
 * ⚠️ 11-100 tozu bilerek KÜÇÜK. En alt kademe 20 toz; legendary bir kozmetik
 * 2100. Yani 51-100 aralığı bir gelir kaynağı değil, "sayıldın" demenin ucuz
 * yolu. Büyütmek sıralamayı bir toz musluğuna çevirirdi.
 */
export const SEASON_REWARDS: readonly SeasonReward[] = [
  { from: 1, to: 1, cosmetic: 't_deepest', dust: 420, label: 'Deepest of the Week' },
  { from: 2, to: 3, cosmetic: 'p_season', dust: 240, label: 'Vigil Silver' },
  { from: 4, to: 10, cosmetic: 'r_wreath', dust: 110, label: 'Barrow Wreath' },
  { from: 11, to: 25, dust: 60, label: 'Vigil Kept' },
  { from: 26, to: 50, dust: 35, label: 'Vigil Kept' },
  { from: 51, to: 100, dust: 20, label: 'Counted' },
] as const;

/**
 * Kozmetik ödülün bittiği sıra — "ilk 10" çizgisi TEK KAYNAKTAN türüyor.
 * Arayüz bu sayıyı kendi yazmasın: tablo değişirse çizgi de değişmeli.
 */
export const SEASON_COSMETIC_DEPTH =
  SEASON_REWARDS.reduce((m, r) => (r.cosmetic ? Math.max(m, r.to) : m), 0);

/** Verilen sıraya düşen ödül — sıra tablo dışındaysa `null` */
export function rewardForRank(rank: number): SeasonReward | null {
  if (!Number.isInteger(rank) || rank < 1) return null;
  return SEASON_REWARDS.find((r) => rank >= r.from && rank <= r.to) ?? null;
}

/** Ödüllendirilen son sıra — sorgu `take` değeri buradan gelir, elle yazılmaz */
export const SEASON_PAYOUT_DEPTH =
  SEASON_REWARDS.reduce((m, r) => Math.max(m, r.to), 0);
