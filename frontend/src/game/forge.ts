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
  /**
   * Arayüzün sayıyı NASIL yazacağı.
   * ⚠️ Hepsi yüzde DEĞİL: `recovery` saniyede HP, `armor`/`amount`/`revival`
   * düz adet. Kart bunları yüzdeymiş gibi gösterince "Slow Mend +12%" gibi
   * anlamsız bir satır çıkıyordu — oysa açıklaması "+0.12 HP/sec" diyordu.
   */
  unit?: 'pct' | 'hpsec' | 'flat';
  /** true ise küçülmek İYİdir (cooldown): "−%2" bir kazanç */
  inverse?: boolean;
}

/** Bir yükseltmenin toplam etkisini oyuncuya gösterilecek metne çevirir */
export function effectText(u: ForgeUpgrade, level: number): string {
  const v = u.perLevel * level;
  if (u.unit === 'hpsec') return `+${v.toFixed(2)} HP/s`;
  if (u.unit === 'flat') return `+${Math.round(v)}`;
  return `${u.inverse ? '−' : '+'}${Math.round(v * 100)}%`;
}

/**
 * ⚠️ `growth` DEĞERLERİ ÖLÇÜMLE BELİRLENDİ — göz kararı değil.
 *
 * Eski tabloda hepsi ~1,55'ti ve sonuç şuydu (`curve.test.mts` ile ölçüldü):
 *   • ağaç toplamı 1.635.887 gold — tekrar koşusu geliriyle ~510 SAAT
 *   • ağacın %84,8'i SADECE 3 satırda (Whetstone + Thick Hide + Wide Swing)
 *   • en pahalı tek seviye 186.001 gold = 157 tekrar koşusu
 *
 * 1,55^19 ≈ 4.133 olduğu için 20 seviyeli satırlar diğer her şeyi eziyordu:
 * oyuncuya 15 seçenek gösteriliyor ama gerçek karar 3 tanesindeydi, kalan 12
 * satır süstü. Sorun seçeneklerin sayısında değil, geometrik büyümenin uzun
 * satırlarda patlamasındaydı — bu yüzden düzeltme maxLevel'ı kısmak DEĞİL,
 * satır başına HEDEF MALİYET tutturan growth'u çözmek oldu.
 *
 * Yeni tablo: ağaç 249.370 · ilk 3 satır %33,2 · en pahalı seviye 7.364.
 * Ağacın tamamı hâlâ uzun vadeli bir hedef (~210 tekrar koşusu) ama artık
 * 20 seviyenin HEPSİ alınabilir bir karar.
 */
export const FORGE: readonly ForgeUpgrade[] = [
  // ── ucuz giriş: ilk bölümün ardından hemen bir şey alınabilmeli ──
  { id: 'might', name: 'Whetstone', desc: '+5% damage', stat: 'might', perLevel: 0.05, maxLevel: 20, baseCost: 110, growth: 1.30 },
  { id: 'health', name: 'Thick Hide', desc: '+6% max health', stat: 'maxHp', perLevel: 0.06, maxLevel: 20, baseCost: 110, growth: 1.30 },
  // ⚠️ Açıklama "from new depths" DEĞİL: greed artık nadir düşüş miktarını da
  // çarpıyor (bkz. config.rareDropChance başlığı). Eski metin, duvarına
  // çarpmış oyuncuya işe yaramaz bir şey sattığımızı gizliyordu.
  { id: 'greed', name: 'Coin Sense', desc: '+6% gold from every source', stat: 'greed', perLevel: 0.06, maxLevel: 12, baseCost: 130, growth: 1.51 },
  { id: 'magnet', name: 'Grave Pull', desc: '+6% pickup radius', stat: 'magnet', perLevel: 0.06, maxLevel: 12, baseCost: 130, growth: 1.47 },

  // ── orta kademe ──
  { id: 'area', name: 'Wide Swing', desc: '+4% attack area', stat: 'area', perLevel: 0.04, maxLevel: 18, baseCost: 170, growth: 1.30 },
  { id: 'recovery', name: 'Slow Mend', desc: '+0.12 HP/sec', stat: 'recovery', perLevel: 0.12, maxLevel: 12, baseCost: 170, growth: 1.48, unit: 'hpsec' },
  { id: 'pspeed', name: 'Swift Shot', desc: '+5% projectile speed', stat: 'projSpeed', perLevel: 0.05, maxLevel: 10, baseCost: 190, growth: 1.56 },
  { id: 'duration', name: 'Lasting Mark', desc: '+5% effect duration', stat: 'duration', perLevel: 0.05, maxLevel: 10, baseCost: 190, growth: 1.56 },
  // Hareket hızı survivors-like'ta en güçlü istatistik — bilerek küçük adımlı
  { id: 'mspeed', name: 'Restless Boots', desc: '+3% move speed', stat: 'moveSpeed', perLevel: 0.03, maxLevel: 12, baseCost: 215, growth: 1.45 },

  // ── pahalı, güçlü ──
  { id: 'armor', name: 'Bone Plating', desc: '+1 armor (flat damage cut)', stat: 'armor', perLevel: 1, maxLevel: 10, baseCost: 290, growth: 1.58, unit: 'flat' },
  { id: 'cooldown', name: 'Quick Hands', desc: '-2% cooldown', stat: 'cooldown', perLevel: 0.02, maxLevel: 12, baseCost: 310, growth: 1.41, inverse: true },
  { id: 'growth', name: 'Soul Harvest', desc: '+5% experience', stat: 'growth', perLevel: 0.05, maxLevel: 10, baseCost: 360, growth: 1.51 },

  // ── risk/ödül: düşman güçlenir ama sürü de kalabalıklaşır ──
  /**
   * ⚠️ LANET HİÇBİR ÖDÜLÜ ÇARPMIYOR — ÖLÇÜLDÜ, tahmin değil.
   *
   * Motor `stats.curse`u yalnız üç yerde kullanıyor: düşman canı, hızı ve
   * doğuş sıklığı (`engine.ts` 1028-1034, 1094). Hiçbir gold/deneyim
   * formülünde geçmiyor. Buna rağmen ÜÇ ayrı yerde oyuncuya "richer"
   * (zenginleşirsin) deniyordu — burada, `config.ts` Cursed Skull tılsımında
   * ve `skills.ts` "Invite Them In" düğümünde. Dördü de düzeltildi.
   *
   * Kontrollü deney (12 seed × 5 kademe, aynı seed, TEK fark lanet):
   *     lv0  derinlik 11,8 · gold/koşu 537 · gold/dk 32,5
   *     lv2  derinlik 11,1 · gold/koşu 490 · gold/dk 33,2
   *     lv4  derinlik  9,3 · gold/koşu 366 · gold/dk 36,0
   *     lv6  derinlik  7,8 · gold/koşu 312 · gold/dk 35,2
   *     lv8  derinlik  6,6 · gold/koşu 249 · gold/dk 37,8
   *
   * Yani lanet DERİNLİĞİ %44, koşu başına gold'u %54 düşürüyor; karşılığında
   * dakika başına gold yalnız %16 artıyor. Derinlik ilerlemeyi kapıyor
   * (checkpoint, yetenek puanı) — bu takas çoğu oyuncu için KÖTÜ.
   *
   * ⚠️ Ölçüm `fleeInput` yapay zekâsıyla yapıldı; insandan kötü oynuyor ve
   * lanet kötü oyunu daha çok cezalandırıyor. YÖN güvenilir, BÜYÜKLÜK üst
   * sınır. Yeniden ölçmeden "abartılmış" diye indirme.
   *
   * ⚠️ AÇIK KARAR (kullanıcıya bırakıldı): bu yükseltme ya gerçek bir ödül
   * çarpanı kazanmalı (motor değişikliği → SIM_SEAL kırılır, ekonomi
   * etkilenir) ya da Forge'dan kalkmalı. Metin şimdilik DÜRÜST: ne verdiğini
   * değil, ne aldığını yazıyor.
   */
  { id: 'curse', name: 'Cursed Blood', desc: '+8% curse — enemies hit harder, move faster, arrive sooner', stat: 'curse', perLevel: 0.08, maxLevel: 8, baseCost: 215, growth: 1.71 },

  // ── nadir, oyunu değiştiren alımlar ──
  // ⚠️ Bu ikisinde growth DEĞİL baseCost yükseltildi: sadece 3 seviyeleri var,
  // geometrik büyüme 3 adımda anlamlı bir toplam üretemiyor. Oyunu değiştiren
  // alımlar pahalı KALMALI, yoksa erken oyunda alınıp eğriyi düzleştirirler.
  { id: 'amount', name: 'Echo of War', desc: '+1 projectile on every weapon', stat: 'amount', perLevel: 1, maxLevel: 3, baseCost: 3360, growth: 2.4, unit: 'flat' },
  { id: 'revival', name: 'Second Burial', desc: '+1 revival per run', stat: 'revival', perLevel: 1, maxLevel: 3, baseCost: 2640, growth: 2.4, unit: 'flat' },
] as const;

/** Bir sonraki seviyenin maliyeti (level = şu anki seviye, 0 = hiç alınmamış) */
export function costOf(u: ForgeUpgrade, level: number): number {
  if (level >= u.maxLevel) return Infinity;
  return Math.round(u.baseCost * Math.pow(u.growth, level));
}

/**
 * TEK bir yükseltmeye şimdiye kadar gömülen gold.
 * Kartta "bu satıra ne kadar yatırdım" sorusunu cevaplıyor — `spentOn` ağacın
 * TAMAMINI topluyor, satır bazında bilgi vermiyordu.
 */
export function spentOnOne(u: ForgeUpgrade, level: number): number {
  let s = 0;
  for (let i = 0; i < Math.min(level, u.maxLevel); i++) s += costOf(u, i);
  return s;
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
