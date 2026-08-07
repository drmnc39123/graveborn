// PvP SEZONU — düello ve arena sıralamasının haftalık kapanışı.
//
// ⚠️ NİYE VAR: puan sonsuza kadar birikiyordu, hiç sıfırlanmıyordu ve
// tepede olmak hiçbir şey getirmiyordu. Bu tam olarak ölü içerik deseni —
// ilk ay tırmanan oyuncu kilitleniyor, sonradan gelen asla yetişemiyor ve
// ikisi de oynamayı bırakıyor.
//
// ⚠️ SIFIRLAMA SERT DEĞİL YUMUŞAK. Herkesi 1000'e indirmek, aylardır
// tırmanan oyuncunun kimliğini siler ve sezon başında tablo tamamen
// gürültü olur. Puan taban değere doğru ÇEKİLİYOR: iyi oyuncu üstte
// başlıyor ama arayı yeniden açması gerekiyor.
//
// ⚠️ ÖDÜL GOLD DEĞİL. Bu oturumda altıncı kez aynı kural: Wager, dünya
// boss'u, başarımlar, lonca perki, düello ve şimdi sezon. Toz + kozmetik.
//
// ⚠️ SAF VERİ — sunucu da bu dosyayı okuyor.

/** Sezon sonunda ödül alan sıra sayısı */
export const PVP_PAYOUT_DEPTH = 10;

/**
 * YERLEŞİM ŞARTI — sıralamaya girmek için bu kadar maç.
 *
 * ⚠️ Olmadan tek şanslı maçını kazanıp 1016'da duran biri, 40 maç oynamış
 * 1400'lük oyuncunun tablosunda görünürdü; daha kötüsü, ödül aldıktan sonra
 * bir daha hiç oynamayan hesaplar tepeye çakılırdı.
 */
export const PVP_PLACEMENT = 5;

/** Puanın çekildiği taban */
export const PVP_BASE = 1000;

/**
 * Yumuşak sıfırlama oranı: sezon sonu puanının tabandan farkının ne kadarı
 * korunur. 0 = sert sıfırlama, 1 = hiç sıfırlama.
 *
 * ⚠️ 0,5 ölçülerek seçildi (bkz. pvpSeason.test.mts): 1800'lük oyuncu
 * 1400'de başlıyor — hâlâ belirgin biçimde üstte ama tek sezonluk bir
 * tırmanışla yakalanabilir. 0,8'de fark hiç kapanmıyor, 0,2'de tırmanmanın
 * anlamı kalmıyor.
 */
export const PVP_CARRY = 0.5;

/** Sezon kapanışında bir sonraki sezonun başlangıç puanı */
export function softReset(rating: number): number {
  return Math.round(PVP_BASE + (rating - PVP_BASE) * PVP_CARRY);
}

export interface PvpReward {
  rank: number;
  dust: number;
  /** kozmetik id — yoksa sadece toz */
  cosmetic?: string;
  title: string;
}

/**
 * Sıraya göre ödül.
 *
 * ⚠️ EĞRİ DİK DEĞİL. 1. ile 10. arasında 4 kat fark var, 40 kat değil:
 * ulaşılamaz bir zirve ödülü, 8. sıradaki oyuncuyu "zaten kazanamam" diye
 * bırakmaya iter. Ödül tırmanmayı ödüllendirmeli, tepeyi değil.
 */
export function pvpReward(rank: number): PvpReward | null {
  if (rank < 1 || rank > PVP_PAYOUT_DEPTH) return null;
  if (rank === 1) return { rank, dust: 400, cosmetic: 't_undying', title: 'Undying' };
  if (rank === 2) return { rank, dust: 300, title: 'Second Blade' };
  if (rank === 3) return { rank, dust: 240, title: 'Third Blade' };
  if (rank <= 5) return { rank, dust: 170, title: 'Top Five' };
  return { rank, dust: 100, title: 'Top Ten' };
}

/** Sezonun toplam toz maliyeti — musluk ölçülebilir olmalı */
export function pvpSeasonDustCost(): number {
  let s = 0;
  for (let r = 1; r <= PVP_PAYOUT_DEPTH; r++) s += pvpReward(r)?.dust ?? 0;
  return s;
}
