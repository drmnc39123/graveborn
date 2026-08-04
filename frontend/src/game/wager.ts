// THE WAGER — koşu öncesi risk. Ekonominin üçüncü sinki.
//
// ⚠️ EN BÜYÜK TASARIM TUZAĞI BURADAYDI ve bilerek başka bir yoldan geçildi.
//
// "Gold yatır, hedefe ulaşırsan katla" en doğal tasarım — ve bir MUSLUKTUR.
// Sebebi ölçümde: descent'te oyuncunun rekoru erken oyunda her koşuda 1-2
// derinlik artıyor (zincir ölçümü: d24 → d34 → d41). Yani "rekorunu geç"
// koşulu erken oyunda neredeyse GARANTİ kazanç demek. 2× ödeme ile bu, saatte
// binlerce gold BASAN bir makine olurdu; oyuncu duvarına yaklaştıkça musluk
// kapanırdı ama o zamana kadar hasar verilmiş olurdu.
//
// ÇÖZÜM: BAHİS GOLD ÖDEMEZ, TOZ ÖDER.
// Gold ekonomiden TAMAMEN çıkar (sink), karşılığında kozmetik parası gelir.
// Böylece:
//   • hiçbir kazanma oranında faucet oluşmaz — gold basılmıyor
//   • Reliquary'nin şansına mahkûm olmayan, BECERİYE dayalı bir kozmetik yolu
//   • kaybetmek gerçekten acıtır (gold gitti, karşılığı yok)
//
// ⚠️ Hedef oyuncunun KENDİ rekoruna görelidir. Sabit bir hedef (ör. "derinlik
// 20'ye in") duvarını çoktan geçmiş oyuncuya bedava toz basardı.

import { RARITY } from './cosmetics';

export const WAGER = {
  /** yatırılabilecek en az ve en çok gold */
  minStake: 250,
  maxStake: 25_000,
  /**
   * Kaç gold, kazanılırsa 1 toz eder.
   *
   * ⚠️ RELIQUARY'DEN UCUZ OLMALI ama çok değil — yoksa çekiliş anlamsızlaşır.
   * Ölçü: 450 gold'luk bir çekiliş ortalama ~14 toz değerinde
   * (nadirlik ağırlıklı beklenen toz), yani ~32 gold/toz. Bahis kazanınca
   * 22 gold/toz veriyor: beceriyi ödüllendiren ama çekilişi öldürmeyen fark.
   * KAYBEDİNCE 0 — beklenen değer bu yüzden çekilişin altında kalıyor.
   */
  goldPerDust: 22,
  /**
   * Hedef: rekorun kaç derinlik ötesi. 1 = "bir basamak daha derine in".
   * ⚠️ 0 OLAMAZ — rekorunu tekrarlamak beceri değil, garanti kazanç olurdu.
   */
  depthsAhead: 1,
} as const;

export interface WagerTicket {
  /** yatırılan gold — koşu AÇILIRKEN yandı */
  stake: number;
  /** bu derinliğe ULAŞILMALI (dahil) */
  target: number;
  /** hangi bölümün merdiveninde */
  stageId: number;
}

/** Bu bölümde bahsin hedefi ne olur */
export function wagerTarget(paidDepth: number): number {
  return Math.max(1, Math.floor(paidDepth)) + WAGER.depthsAhead;
}

/** Kazanılırsa kaç toz — saf, tek doğru kaynak */
export function wagerPayout(stake: number): number {
  return Math.floor(Math.max(0, stake) / WAGER.goldPerDust);
}

/** Yatırım geçerli mi (sınırlar + bakiye) — arayüz ve sunucu aynı cümleyi kullanır */
export function wagerError(stake: number, gold: number): string | null {
  const s = Math.floor(stake);
  if (!Number.isFinite(s) || s < WAGER.minStake) return `minimum ${WAGER.minStake} gold`;
  if (s > WAGER.maxStake) return `maximum ${WAGER.maxStake.toLocaleString('en-US')} gold`;
  if (s > gold) return 'not enough gold';
  return null;
}

/**
 * Bahis kazanıldı mı. `deepestCleared` SUNUCUNUN kabul ettiği derinlik olmalı,
 * istemcinin iddiası değil — `settleRun` zaten kırpıyor, bahis o çıktıyı okur.
 */
export function wagerWon(t: WagerTicket, deepestCleared: number): boolean {
  return Math.floor(deepestCleared) >= t.target;
}

/**
 * Bahsin beklenen değerini kabaca ölçer — denge testinin kullandığı araç.
 * `winRate` 0..1. Çıktı: 1 gold başına kaç toz.
 *
 * ⚠️ Çekilişin toz verimiyle KIYASLANMALI: bahis her zaman daha riskli
 * olmalı ama kazanınca daha verimli. İkisi de tek yönlü (gold → toz), yani
 * hiçbir oranda gold basılmıyor — bu fonksiyon dengeyi ölçer, güvenliği değil.
 */
export function wagerEfficiency(winRate: number): number {
  return (Math.min(1, Math.max(0, winRate)) / WAGER.goldPerDust);
}

/** Bir çekilişin beklenen toz değeri — nadirlik ağırlıklı ortalama */
export function expectedPullDust(): number {
  const total = Object.values(RARITY).reduce((s, r) => s + r.weight, 0);
  return Object.values(RARITY).reduce((s, r) => s + (r.weight / total) * r.dust, 0);
}
