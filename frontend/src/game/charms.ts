// PEDLAR'S STALL — koşuya taşınan tılsımlar.
//
// NİYE VAR: gold'un tek çıkışı The Forge'du. Kintara araştırmasından çıkan
// ders net — TEK SİNK'Lİ EKONOMİ DOYAR: oyuncu ağacı doldurdukça gold'un
// anlamı biter ve elinde biriken yığın markete akar. Tılsımlar sonsuz
// tüketilen ikinci musluk deliği.
//
// ⚠️ KİLİTLİ KURAL: "Pedlar koşuya taşıdığın şeyleri satar, KALICI GÜÇ
// DEĞİL. O Forge'un işi." Tılsım tek koşuluk; kazansan da kaybetsen de
// yanar. Kolaylık satar, kestirme değil.
//
// ⚠️ GOLD ARTIRAN TILSIM YOK. Plan kuralı: `greed` nadir düşüşü etkilemez,
// yoksa "gold al → daha çok gold" sarmalı kurulur. Aynı sebeple burada da
// kazanç çarpanı satılmıyor — sadece hayatta kalma ve güç.
//
// ⚠️ SAF VERİ. DOM yok, `Math.random()` yok; sunucu da aynı dosyayı okur.

import type { StatKey } from './config';

export interface CharmDef {
  id: string;
  name: string;
  desc: string;
  cost: number;
  /** motorun `permanent` kanalına eklenen bonuslar — Forge ile aynı yol */
  stats: Partial<Record<StatKey, number>>;
}

/** Aynı anda taşınabilecek tılsım sayısı — seçim zorlasın diye dar */
export const CHARM_SLOTS = 2;

/**
 * ⚠️ HEPSİ MOTORUN GERÇEKTEN OKUDUĞU İSTATİSTİKLER. Forge'daki kuralın
 * aynısı: çalışmayan bir şeyi satmak oyuncuyu kandırmaktır.
 *
 * Fiyatlandırma mantığı: bir tılsım, aynı etkiyi veren Forge seviyelerinden
 * UCUZ ama tek koşuluk. Birkaç koşudan fazla oynayacak oyuncu için Forge
 * her zaman daha kârlı — kalıcı güç orada kalsın diye.
 */
export const CHARMS: readonly CharmDef[] = [
  { id: 'draught', name: 'Blood Draught', desc: '+25% max health for one run', cost: 80, stats: { maxHp: 0.25 } },
  { id: 'ash', name: "Scholar's Ash", desc: '+30% experience for one run', cost: 100, stats: { growth: 0.30 } },
  { id: 'skin', name: 'Iron Skin', desc: '+3 armor for one run', cost: 110, stats: { armor: 3 } },
  { id: 'edge', name: 'Whetted Edge', desc: '+18% damage for one run', cost: 130, stats: { might: 0.18 } },
  { id: 'boots', name: 'Swift Boots', desc: '+10% move speed for one run', cost: 150, stats: { moveSpeed: 0.10 } },
  { id: 'offering', name: 'Grave Offering', desc: '+1 revival for one run', cost: 260, stats: { revival: 1 } },
] as const;

export function charmById(id: string): CharmDef | undefined {
  return CHARMS.find((c) => c.id === id);
}

/**
 * Taşınan tılsımların toplam etkisi — `permanentBonus()` çıktısıyla
 * BİRLEŞTİRİLİR (ikisi de motorun aynı `permanent` kanalına gider).
 */
export function charmBonus(ids: readonly string[]): Partial<Record<StatKey, number>> {
  const out: Partial<Record<StatKey, number>> = {};
  for (const id of ids) {
    const c = charmById(id);
    if (!c) continue;
    for (const [k, v] of Object.entries(c.stats)) {
      const key = k as StatKey;
      out[key] = (out[key] ?? 0) + (v ?? 0);
    }
  }
  return out;
}

/** İki bonus haritasını topla — Forge + tılsım */
export function mergeBonus(
  a: Partial<Record<StatKey, number>>,
  b: Partial<Record<StatKey, number>>,
): Partial<Record<StatKey, number>> {
  const out: Partial<Record<StatKey, number>> = { ...a };
  for (const [k, v] of Object.entries(b)) {
    const key = k as StatKey;
    out[key] = (out[key] ?? 0) + (v ?? 0);
  }
  return out;
}
