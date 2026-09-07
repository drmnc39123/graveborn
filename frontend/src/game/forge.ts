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
  /**
   * ══════════════════════════════════════════════════════════════════
   * ⚠️ FİYATLAR ÖLÇÜLEREK HİZALANDI (2026-09-07). Elle seçilmiş değiller.
   * ══════════════════════════════════════════════════════════════════
   * 🔴 SORUN: 5 tohumlu ölçümde (d22, hayatta kalma süresi) hatların
   * 10.000 gold başına getirisi 10,7 KAT ayrışıyordu ve sıralama TERSTİ —
   * `revival` ağacın EN UCUZ hattıyken EN GÜÇLÜSÜYDÜ (54,5 sn/10K),
   * `area` ise pahalı ve en zayıfı (5,1). Pratik sonucu: optimal oyuncu
   * revival+amount+armor alıp gerisini görmezden geliyor, yani 14 hatlık
   * ağacın yarısı TUZAK SEÇENEK oluyordu.
   *
   * ÇÖZÜM: her hattın toplam maliyeti ölçülen etkisiyle orantılandı.
   * `baseCost` oranla ölçeklendi — `growth` ve `maxLevel` DEĞİŞMEDİ, yani
   * maliyet eğrisinin şekli aynı kaldı.
   *   yayılım 10,7x → 2,1x · ağaç toplamı 593.697 → 594.032 (+%0,1)
   *
   * ⚠️ %100 DEĞİL %70 HİZALANDI ve bu bilinçli. Ölçüm senaryosu "az kaç,
   * hasar al" olduğu için `revival`ın değerini ABARTIYOR: kaçmayı bilen
   * oyuncu fazladan candan daha az fayda görür. Tek bir metriğe tam
   * güvenip hepsini eşitlemek, ölçemediğim oyun tarzını cezalandırırdı.
   * Kalan 2,1x fark tuzak değil, ÇEŞİTLİLİK.
   *
   * ⚠️ AĞAÇ TOPLAMI KORUNDU. `hours.test`/`curve.test` ağacı 98-145 saat
   * diye ölçüyor ve o sayı başka denge kararlarının dayanağı; toplamı
   * değiştirmek bu denetimin kapsamı dışındaydı.
   *
   * ⚠️ ÜÇ HAT AYRICA "DUVAR" KISITINA TAKILDI ve düzeltildi. `curve.test`
   * tek bir seviyenin tekrar koşusunun 60 katını (≈22.560 gold) geçmemesini
   * istiyor — haklı: tek satın alma bir duvar olmamalı. İlk hizalamada
   * `armor` 25.221'e, `revival` 42.578'e çıkmıştı. Çözüm `growth`u
   * düşürüp `baseCost`u yükseltmek oldu: TOPLAM benzer kaldı, ZİRVE düştü.
   * 3 seviyeli hatlar (amount/revival) bu tavana yapısal olarak sıkışıyor —
   * toplamları o yüzden hedeflenenden düşük tutuldu.
   *   sonuç: yayılım 2,5x · en yüksek seviye 20.728 (tavanın %8 altı)
   *   ağaç 593.697 → 564.111 (94-138 saat, eski 98-145)
   *
   * ⚠️ HİZALAMA `growth` İLE YAPILDI, `baseCost` İLE DEĞİL — ve bunu bir
   * mühür öğretti. İlk denemede ucuzlayan hatların `baseCost`u düşürüldü;
   * `forge.test` "ilk derinliklerde de ilerleme var" kontrolüyle kırmızı
   * verdi: derinlik 0'da 131 seviye alınabiliyordu ve d5/d10 hiçbir şey
   * eklemiyordu — erken oyun eğrisi düzleşmişti. Giriş fiyatı ERKEN OYUNU
   * belirliyor, toplam ise GEÇ oyunu. Toplamı düşürmek gerekiyorsa doğru
   * kol `growth`; `baseCost` orijinal değerinde bırakıldı.
   *
   * ⚠️⚠️ ÖLÇÜM GÜRÜLTÜLÜ — SONRADAN AYAR YAPACAK OLAN BUNU BİLMELİ.
   * 20 tohumla ölçüldü: aynı taban koşusu ortalama 55,5 sn ama SAPMA
   * 35,1 sn (%63); aralık 30,9-180,8. 5 tohumluk bir ölçümün kendi
   * ortalaması 27,5 sn oynuyor. Sinyal/gürültü ayrımı:
   *   ≥2 sapma (GERÇEK) : revival · armor · amount · mspeed
   *   1,2-2   (sınırda) : health · might · cooldown · recovery
   *   <1      (GÜRÜLTÜ) : area · duration · pspeed — birbirinden ayırt EDİLEMEZ
   * Yani düzeltmenin YÖNÜ sağlam (10,7x'lik ters sıralama gürültünün çok
   * üstündeydi) ama kalan 2,5x fark ÖLÇÜM BELİRSİZLİĞİNİN İÇİNDE. Daha ince
   * ayar yapmak gürültüyü ölçmek olur; durulacak yer burası.
   * ⚠️ Yeniden ayar yapılacaksa ÖNCE tohum sayısını artır (20+), sonra oran.
   *
   * ⚠️ EKONOMİ HATLARINA (greed/magnet/growth) DOKUNULMADI: onların ölçütü
   * hayatta kalma değil gold/XP. Ölçmediğim bir şeyi ayarlamak, ölçtüğüm
   * hatayı başka yere taşımak olurdu.
   */
  { id: 'might', name: 'Whetstone', desc: '+5% damage', stat: 'might', perLevel: 0.05, maxLevel: 20, baseCost: 110, growth: 1.272 },
  { id: 'health', name: 'Thick Hide', desc: '+6% max health', stat: 'maxHp', perLevel: 0.06, maxLevel: 20, baseCost: 110, growth: 1.275 },
  // ⚠️ Açıklama "from new depths" DEĞİL: greed artık nadir düşüş miktarını da
  // çarpıyor (bkz. config.rareDropChance başlığı). Eski metin, duvarına
  // çarpmış oyuncuya işe yaramaz bir şey sattığımızı gizliyordu.
  { id: 'greed', name: 'Coin Sense', desc: '+6% gold from every source', stat: 'greed', perLevel: 0.06, maxLevel: 12, baseCost: 130, growth: 1.51 },
  { id: 'magnet', name: 'Grave Pull', desc: '+6% pickup radius', stat: 'magnet', perLevel: 0.06, maxLevel: 12, baseCost: 130, growth: 1.47 },

  // ── orta kademe ──
  { id: 'area', name: 'Wide Swing', desc: '+4% attack area', stat: 'area', perLevel: 0.04, maxLevel: 18, baseCost: 170, growth: 1.227 },
  { id: 'recovery', name: 'Slow Mend', desc: '+0.12 HP/sec', stat: 'recovery', perLevel: 0.12, maxLevel: 12, baseCost: 170, growth: 1.451, unit: 'hpsec' },
  { id: 'pspeed', name: 'Swift Shot', desc: '+5% projectile speed', stat: 'projSpeed', perLevel: 0.05, maxLevel: 10, baseCost: 190, growth: 1.494 },
  { id: 'duration', name: 'Lasting Mark', desc: '+5% effect duration', stat: 'duration', perLevel: 0.05, maxLevel: 10, baseCost: 190, growth: 1.513 },
  // Hareket hızı survivors-like'ta en güçlü istatistik — bilerek küçük adımlı
  { id: 'mspeed', name: 'Restless Boots', desc: '+3% move speed', stat: 'moveSpeed', perLevel: 0.03, maxLevel: 12, baseCost: 278, growth: 1.45 },

  // ── pahalı, güçlü ──
  { id: 'armor', name: 'Bone Plating', desc: '+1 armor (flat damage cut)', stat: 'armor', perLevel: 1, maxLevel: 10, baseCost: 883, growth: 1.42, unit: 'flat' },
  { id: 'cooldown', name: 'Quick Hands', desc: '-2% cooldown', stat: 'cooldown', perLevel: 0.02, maxLevel: 12, baseCost: 310, growth: 1.371, inverse: true },
  { id: 'growth', name: 'Soul Harvest', desc: '+5% experience', stat: 'growth', perLevel: 0.05, maxLevel: 10, baseCost: 360, growth: 1.51 },

  /**
   * 🔴 `Cursed Blood` KALDIRILDI (kullanıcı kararı, 2026-08-14). GERİ EKLEME.
   *
   * NİYE: Forge'un vaadi bu panelin kendi başlığında yazıyor —
   * "Bought once, kept forever. Every run after this starts stronger."
   * Lanet yükseltmesi bunun TERSİNİ yapıyordu: kalıcı, geri alınamaz ve
   * ölçümle gösterildiği üzere oyuncuyu ZAYIFLATIYOR. Diğer 14 yükseltmenin
   * hepsi koşulsuz iyi; bu tek istisna bir tuzaktı.
   *
   * ÖLÇÜM (12 seed × 5 kademe, kontrollü deney — aynı seed, tek fark lanet):
   *     lv0  derinlik 11,8 · gold/koşu 537 · gold/dk 32,5
   *     lv4  derinlik  9,3 · gold/koşu 366 · gold/dk 36,0
   *     lv8  derinlik  6,6 · gold/koşu 249 · gold/dk 37,8
   * Lanet derinliği %44, koşu başına gold'u %54 düşürüyor; dakika başına
   * gold yalnız %16 artıyor. Derinlik ilerlemeyi kapıyor (checkpoint,
   * yetenek puanı), yani takas çoğu oyuncu için kötü.
   * ⚠️ Ölçüm `fleeInput` yapay zekâsıyla; insandan kötü oynuyor ve lanet
   * kötü oyunu daha çok cezalandırıyor. YÖN güvenilir, BÜYÜKLÜK üst sınır.
   *
   * ⚠️ LANET OYUNDAN ÇIKMADI — yalnız GERİ DÖNÜŞÜ OLMAYAN yerden çıktı:
   *   · `skills.ts` "Invite Them In" — laneti +%10 deneyimle BİRLİKTE satıyor
   *     ve yetenek ağacı respec edilebiliyor
   *   · `gear.ts` sigil yuvası — takıp çıkarılabilir
   *   · `config.ts` Cursed Skull tılsımı — tek koşuluk, kalıcı değil
   * Risk kolu geri alınabilir yerlerde durur. Forge geri alınamaz.
   *
   * ⚠️ Motorun `stats.curse` kanalı DURUYOR ve dokunulmadı — yukarıdaki üç
   * kaynak onu besliyor. Bu bir arayüz/ekonomi kararı, motor değişikliği
   * DEĞİL: SIM_SEAL bozulmadı.
   */

  // ── nadir, oyunu değiştiren alımlar ──
  // ⚠️ Bu ikisinde growth DEĞİL baseCost yükseltildi: sadece 3 seviyeleri var,
  // geometrik büyüme 3 adımda anlamlı bir toplam üretemiyor. Oyunu değiştiren
  // alımlar pahalı KALMALI, yoksa erken oyunda alınıp eğriyi düzleştirirler.
  { id: 'amount', name: 'Echo of War', desc: '+1 projectile on every weapon', stat: 'amount', perLevel: 1, maxLevel: 3, baseCost: 12000, growth: 1.30, unit: 'flat' },
  { id: 'revival', name: 'Second Burial', desc: '+1 revival per run', stat: 'revival', perLevel: 1, maxLevel: 3, baseCost: 12000, growth: 1.30, unit: 'flat' },
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
