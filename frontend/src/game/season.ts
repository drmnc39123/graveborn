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
 * ÖDÜL TABLOSU — ilk 10.
 *
 * ⚠️ Neden sadece 10: daha geniş bir tablo ödülü ucuzlatır. "İlk 10'a
 * girdim" bir cümledir; "ilk 100'e girdim" değildir. Toz miktarları da
 * bilinçli olarak küçük — bunlar bir gelir kaynağı değil, bir nişan.
 * (Referans: legendary kozmetik tozla 2100'e alınıyor, yani birincinin
 * haftalık tozu tek bir legendary'nin beşte biri kadar.)
 */
export const SEASON_REWARDS: readonly SeasonReward[] = [
  { from: 1, to: 1, cosmetic: 't_deepest', dust: 420, label: 'Deepest of the Week' },
  { from: 2, to: 3, cosmetic: 'p_season', dust: 240, label: 'Vigil Silver' },
  { from: 4, to: 10, cosmetic: 'r_wreath', dust: 110, label: 'Barrow Wreath' },
] as const;

/** Verilen sıraya düşen ödül — sıra tablo dışındaysa `null` */
export function rewardForRank(rank: number): SeasonReward | null {
  if (!Number.isInteger(rank) || rank < 1) return null;
  return SEASON_REWARDS.find((r) => rank >= r.from && rank <= r.to) ?? null;
}

/** Ödüllendirilen son sıra — sorgu `take` değeri buradan gelir, elle yazılmaz */
export const SEASON_PAYOUT_DEPTH =
  SEASON_REWARDS.reduce((m, r) => Math.max(m, r.to), 0);
