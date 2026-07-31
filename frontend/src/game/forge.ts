// THE FORGE — kalıcı yükseltmeler. Bölümler arası taşınan güç.
//
// TASARIM KISITI: oyundaki gold SONLU. Bölüm tavanları toplamı 8.800
// (300+700+1400+2400+4000) ve tekrar oynayınca gold gelmiyor (exploit kapalı).
// Bu yüzden ağacın toplam maliyeti bu bütçeye göre kuruldu: hepsini almak
// MÜMKÜN DEĞİL — oyuncu seçim yapmak zorunda. Seçim olmayan ağaç ağaç değildir.
//
// İLKE: motorun GERÇEKTEN kullandığı istatistikler dışında yükseltme YOK.
// `luck` motorda hiçbir yerde okunmuyor, o yüzden burada da yok — çalışmayan
// bir şeyi satmak oyuncuyu kandırmaktır.

import type { StatKey } from './config';

export interface ForgeUpgrade {
  id: string;
  name: string;
  desc: string;
  stat: StatKey;
  /** seviye başına artış (yüzdeler 0.06 = +%6) */
  perLevel: number;
  maxLevel: number;
  /** 1. seviyenin maliyeti */
  baseCost: number;
  /** her seviyede maliyet bu katsayıyla artar */
  growth: number;
}

export const FORGE: readonly ForgeUpgrade[] = [
  // ── ucuz giriş: ilk bölümün ardından hemen bir şey alınabilmeli ──
  { id: 'might', name: 'Whetstone', desc: '+6% damage', stat: 'might', perLevel: 0.06, maxLevel: 5, baseCost: 45, growth: 1.7 },
  { id: 'health', name: 'Thick Hide', desc: '+8% max health', stat: 'maxHp', perLevel: 0.08, maxLevel: 5, baseCost: 45, growth: 1.7 },
  { id: 'greed', name: 'Coin Sense', desc: '+8% gold from kills', stat: 'greed', perLevel: 0.08, maxLevel: 4, baseCost: 55, growth: 1.7 },
  { id: 'magnet', name: 'Grave Pull', desc: '+8% pickup radius', stat: 'magnet', perLevel: 0.08, maxLevel: 4, baseCost: 55, growth: 1.65 },

  // ── orta kademe ──
  { id: 'area', name: 'Wide Swing', desc: '+6% attack area', stat: 'area', perLevel: 0.06, maxLevel: 4, baseCost: 70, growth: 1.7 },
  { id: 'recovery', name: 'Slow Mend', desc: '+0.15 HP/sec', stat: 'recovery', perLevel: 0.15, maxLevel: 4, baseCost: 70, growth: 1.7 },
  { id: 'pspeed', name: 'Swift Shot', desc: '+8% projectile speed', stat: 'projSpeed', perLevel: 0.08, maxLevel: 3, baseCost: 80, growth: 1.7 },
  { id: 'duration', name: 'Lasting Mark', desc: '+8% effect duration', stat: 'duration', perLevel: 0.08, maxLevel: 3, baseCost: 80, growth: 1.7 },
  { id: 'mspeed', name: 'Restless Boots', desc: '+5% move speed', stat: 'moveSpeed', perLevel: 0.05, maxLevel: 4, baseCost: 90, growth: 1.7 },

  // ── pahalı, güçlü ──
  { id: 'armor', name: 'Bone Plating', desc: '+1 armor (flat damage cut)', stat: 'armor', perLevel: 1, maxLevel: 3, baseCost: 120, growth: 1.8 },
  { id: 'cooldown', name: 'Quick Hands', desc: '-3% cooldown', stat: 'cooldown', perLevel: 0.03, maxLevel: 4, baseCost: 130, growth: 1.75 },
  { id: 'growth', name: 'Soul Harvest', desc: '+8% experience', stat: 'growth', perLevel: 0.08, maxLevel: 3, baseCost: 150, growth: 1.8 },

  // ── risk/ödül ──
  { id: 'curse', name: 'Cursed Blood', desc: '+10% curse — deadlier enemies, more of them', stat: 'curse', perLevel: 0.10, maxLevel: 3, baseCost: 90, growth: 1.6 },

  // ── tek seferlik büyük alımlar ──
  { id: 'amount', name: 'Echo of War', desc: '+1 projectile on every weapon', stat: 'amount', perLevel: 1, maxLevel: 1, baseCost: 900, growth: 1 },
  { id: 'revival', name: 'Second Burial', desc: '+1 revival per run', stat: 'revival', perLevel: 1, maxLevel: 2, baseCost: 700, growth: 2.1 },
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
