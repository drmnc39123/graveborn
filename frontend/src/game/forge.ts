// THE FORGE — kalıcı yükseltmeler. Koşular arası taşınan güç.
//
// EKONOMİ: gold artık SONSUZ akıyor (bkz. config.ts "GOLD MUSLUĞU"). Eskiden
// oyundaki toplam gold 8.800'de sabitti ve ağaç ona göre kısılmıştı; o model
// oyunu ~30 dakikada bitiriyordu. Şimdi tam tersi kısıt geçerli:
//
//   AĞAÇ ASLA DOYMAMALI. Oyuncu ne kadar derine inerse insin, alacak bir
//   sonraki seviye HER ZAMAN olmalı — yoksa gold'un anlamı biter.
//
// Bu yüzden maliyet ÜSSEL (growth^level), kazanç ise derinlikle polinom
// büyüyor. Erken-orta oyunda "bir derinlik daha ≈ bir seviye daha" hissi
// verir, sonra makas yavaşça açılır. Bu kasıtlı.
//
// İLKE: motorun GERÇEKTEN kullandığı istatistikler dışında yükseltme YOK.
// `luck` motorda hiçbir yerde okunmuyor, o yüzden burada da yok — çalışmayan
// bir şeyi satmak oyuncuyu kandırmaktır.
//
// P2W NOTU: tek para birimi mimarisinde gold, markette token karşılığı satın
// alınabilecek. Sarmalı törpüleyen kural: buradaki tavanlar motorun STAT_CAP'ini
// DOLDURMAZ — kalıcı bir güç TABANI verir, farkın büyük kısmını hâlâ koşu içi
// ilerleme (pasifler + level-up + evrim) taşır. Bu oranı bozmayın.

import type { StatKey } from './config';

export interface ForgeUpgrade {
  id: string;
  name: string;
  desc: string;
  stat: StatKey;
  /** seviye başına artış (yüzdeler 0.05 = +%5) */
  perLevel: number;
  maxLevel: number;
  /** 1. seviyenin maliyeti */
  baseCost: number;
  /** her seviyede maliyet bu katsayıyla artar */
  growth: number;
}

export const FORGE: readonly ForgeUpgrade[] = [
  // ── ucuz giriş: ilk bölümün ardından hemen bir şey alınabilmeli ──
  { id: 'might', name: 'Whetstone', desc: '+5% damage', stat: 'might', perLevel: 0.05, maxLevel: 20, baseCost: 45, growth: 1.55 },
  { id: 'health', name: 'Thick Hide', desc: '+6% max health', stat: 'maxHp', perLevel: 0.06, maxLevel: 20, baseCost: 45, growth: 1.55 },
  { id: 'greed', name: 'Coin Sense', desc: '+6% gold from new depths', stat: 'greed', perLevel: 0.06, maxLevel: 12, baseCost: 55, growth: 1.55 },
  { id: 'magnet', name: 'Grave Pull', desc: '+6% pickup radius', stat: 'magnet', perLevel: 0.06, maxLevel: 12, baseCost: 55, growth: 1.52 },

  // ── orta kademe ──
  { id: 'area', name: 'Wide Swing', desc: '+4% attack area', stat: 'area', perLevel: 0.04, maxLevel: 18, baseCost: 70, growth: 1.55 },
  { id: 'recovery', name: 'Slow Mend', desc: '+0.12 HP/sec', stat: 'recovery', perLevel: 0.12, maxLevel: 12, baseCost: 70, growth: 1.55 },
  { id: 'pspeed', name: 'Swift Shot', desc: '+5% projectile speed', stat: 'projSpeed', perLevel: 0.05, maxLevel: 10, baseCost: 80, growth: 1.55 },
  { id: 'duration', name: 'Lasting Mark', desc: '+5% effect duration', stat: 'duration', perLevel: 0.05, maxLevel: 10, baseCost: 80, growth: 1.55 },
  // Hareket hızı survivors-like'ta en güçlü istatistik — bilerek küçük adımlı
  { id: 'mspeed', name: 'Restless Boots', desc: '+3% move speed', stat: 'moveSpeed', perLevel: 0.03, maxLevel: 12, baseCost: 90, growth: 1.58 },

  // ── pahalı, güçlü ──
  { id: 'armor', name: 'Bone Plating', desc: '+1 armor (flat damage cut)', stat: 'armor', perLevel: 1, maxLevel: 10, baseCost: 120, growth: 1.62 },
  { id: 'cooldown', name: 'Quick Hands', desc: '-2% cooldown', stat: 'cooldown', perLevel: 0.02, maxLevel: 12, baseCost: 130, growth: 1.58 },
  { id: 'growth', name: 'Soul Harvest', desc: '+5% experience', stat: 'growth', perLevel: 0.05, maxLevel: 10, baseCost: 150, growth: 1.6 },

  // ── risk/ödül: düşman güçlenir ama sürü de kalabalıklaşır ──
  { id: 'curse', name: 'Cursed Blood', desc: '+8% curse — deadlier enemies, more of them', stat: 'curse', perLevel: 0.08, maxLevel: 8, baseCost: 90, growth: 1.5 },

  // ── nadir, oyunu değiştiren alımlar ──
  { id: 'amount', name: 'Echo of War', desc: '+1 projectile on every weapon', stat: 'amount', perLevel: 1, maxLevel: 3, baseCost: 900, growth: 3.0 },
  { id: 'revival', name: 'Second Burial', desc: '+1 revival per run', stat: 'revival', perLevel: 1, maxLevel: 3, baseCost: 700, growth: 2.6 },
] as const;

/** Bir sonraki seviyenin maliyeti (level = şu anki seviye, 0 = hiç alınmamış) */
export function costOf(u: ForgeUpgrade, level: number): number {
  if (level >= u.maxLevel) return Infinity;
  return Math.round(u.baseCost * Math.pow(u.growth, level));
}

/** Bir yükseltmeyi max'a çıkarmanın toplam maliyeti */
export function totalCost(u: ForgeUpgrade): number {
  let s = 0;
  for (let i = 0; i < u.maxLevel; i++) s += costOf(u, i);
  return s;
}

/** Tüm ağacın maliyeti — ekonomi dengesi testi bunu kullanıyor */
export function treeTotalCost(): number {
  return FORGE.reduce((s, u) => s + totalCost(u), 0);
}

/** Oyuncunun şimdiye kadar bu ağaca harcadığı gold */
export function spentOn(levels: Record<string, number>): number {
  let s = 0;
  for (const u of FORGE) {
    const lv = Math.min(Math.max(0, levels[u.id] ?? 0), u.maxLevel);
    for (let i = 0; i < lv; i++) s += costOf(u, i);
  }
  return s;
}

/**
 * Satın alınan yükseltmelerden istatistik farkını çıkar.
 * Motorun STAT_BASE'ine EKLENİR (recomputeStats bunu taban kabul eder).
 */
export function permanentBonus(levels: Record<string, number>): Partial<Record<StatKey, number>> {
  const out: Partial<Record<StatKey, number>> = {};
  for (const u of FORGE) {
    const lv = Math.min(levels[u.id] ?? 0, u.maxLevel);
    if (lv <= 0) continue;
    const add = u.perLevel * lv;
    // cooldown AZALIR — diğerleri artar
    out[u.stat] = (out[u.stat] ?? 0) + (u.stat === 'cooldown' ? -add : add);
  }
  return out;
}
