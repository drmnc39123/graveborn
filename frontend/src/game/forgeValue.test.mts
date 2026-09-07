// FORGE FİYAT DENGESİ MÜHRÜ.
//
// 🔴 NİYE VAR: 2026-09-07'de ölçüldü — Forge hatlarının 10.000 gold başına
// getirisi 10,7 KAT ayrışıyordu ve sıralama TERSTİ. `revival` ağacın EN UCUZ
// hattıyken EN GÜÇLÜSÜYDÜ (54,5 sn/10K), `area` ise pahalı ve en zayıfı (5,1).
// Pratik sonucu: optimal oyuncu üç hattı alıp gerisini görmezden geliyor,
// yani 14 hatlık ağacın yarısı TUZAK SEÇENEK oluyordu. Hiçbir test bunu
// söylemiyordu çünkü her hat tek başına "çalışıyordu".
//
// ⚠️ NİYE SİMÜLASYON DEĞİL: etkiyi burada yeniden ölçmek 5 tohum × 12 hat ×
// 12.000 tick eder ve mühür dakikalarca sürerdi — o da hiç çalıştırılmaz.
// Onun yerine ÖLÇÜM SONUCU VERİ OLARAK saklanıyor ve fiyatlarla oranı
// kontrol ediliyor. Biri bir hattın fiyatını (ya da `maxLevel`/`growth`ını)
// değiştirirse oran kayar ve mühür düşer — yani "yeniden ölç" der.
//
//   cd frontend && npx tsx src/game/forgeValue.test.mts

import { FORGE, totalCost, treeTotalCost } from './forge.js';

const FAIL: string[] = [];
const check = (n: string, ok: boolean, d = '') => {
  console.log(`${ok ? '  ✓' : '  ✗'} ${n}${d ? ` — ${d}` : ''}`);
  if (!ok) FAIL.push(n);
};

/**
 * ÖLÇÜLEN ETKİ — hattı maxlayınca kazanılan ORTALAMA hayatta kalma süresi.
 *
 * Koşul: 5 tohum · bölüm 1 · derinlik 22 · 12.000 tick tavanı · az kaçan
 * girdi deseni. Taban: 55,8 öldürme / 52,1 sn.
 *
 * ⚠️ BU SAYILAR ÖLÇÜM, TAHMİN DEĞİL — ve senaryoya bağlı. "Az kaç, hasar al"
 * deseni `revival`ın değerini ABARTIYOR (kaçmayı bilen oyuncu fazladan candan
 * daha az fayda görür). Bu yüzden fiyatlar %100 değil %70 hizalandı ve
 * aşağıdaki tavan 3,0x — tam eşitlik ARANMIYOR.
 *
 * ⚠️⚠️ GÜRÜLTÜ: 20 tohumla ölçüldü, taban 55,5 sn · sapma 35,1 sn (%63).
 * Bu yüzden eşik 3,0x — daha dar bir eşik gürültüyü kural sanmak olurdu.
 * `area`/`duration`/`pspeed` etkileri sapmanın ALTINDA, yani birbirinden
 * ayırt edilemiyorlar; aralarındaki fiyat farkını "düzeltmeye" çalışmayın.
 *
 * ⚠️ Motor davranışı değişirse (yeni silah, düşman dengesi, stat formülü) bu
 * tablo BAYATLAR. O zaman yapılacak şey tavanı yükseltmek değil, ölçümü
 * tekrarlamak: `Game`i 5 tohumla koştur, hattı maxla, süre farkını al.
 */
const OLCULEN_ETKI: Record<string, number> = {
  revival: 131.7, amount: 95.6, armor: 116.9, mspeed: 88.4, recovery: 45.0,
  duration: 31.3, cooldown: 48.3, health: 66.1, pspeed: 26.8, might: 61.2, area: 32.0,
};

/**
 * ⚠️ EKONOMİ HATLARI KAPSAM DIŞI (greed/magnet/growth): onların ölçütü
 * hayatta kalma değil gold/XP. Ölçmediğim bir şeyi kurala bağlamak, uydurma
 * bir eşiği gerçek sanmak olurdu.
 */
const EKONOMI = ['greed', 'magnet', 'growth'];

console.log('\n═══ FORGE FİYAT DENGESİ ═══');

console.log('\n[1] TABLO GÜNCEL Mİ');
{
  const kapsanan = FORGE.filter((u) => OLCULEN_ETKI[u.id] !== undefined).length;
  const beklenen = FORGE.length - EKONOMI.length;
  /**
   * ⚠️ YENİ HAT EKLENİRSE MÜHÜR DÜŞER ve bu KASITLI: ölçülmemiş bir hattın
   * fiyatı da denetlenmemiş demektir. Yeni hat ekleyen kişi ya etkisini
   * ölçüp tabloya yazar ya da bilerek ekonomi hattı ilan eder.
   */
  check('ölçüm tablosu tüm savaş hatlarını kapsıyor', kapsanan === beklenen,
    `${kapsanan}/${beklenen} · ${FORGE.length} hat`);
  const bilinmeyen = Object.keys(OLCULEN_ETKI).filter((id) => !FORGE.some((u) => u.id === id));
  check('tabloda olmayan hat yok (bayat kayıt)', bilinmeyen.length === 0, bilinmeyen.join(', '));
  check('ekonomi hatları gerçekten var', EKONOMI.every((id) => FORGE.some((u) => u.id === id)));
}

console.log('\n[2] ⭐ TUZAK SEÇENEK YOK — verim yayılımı sınırlı');
{
  const satir = FORGE
    .filter((u) => OLCULEN_ETKI[u.id] !== undefined)
    .map((u) => ({ id: u.id, gold: totalCost(u), verim: OLCULEN_ETKI[u.id] / (totalCost(u) / 10000) }))
    .sort((a, b) => b.verim - a.verim);

  for (const s of satir) {
    console.log(`     ${s.id.padEnd(10)} ${s.gold.toLocaleString('en-US').padStart(8)} gold · ${s.verim.toFixed(1)} sn/10K`);
  }
  const enIyi = satir[0].verim, enKotu = satir[satir.length - 1].verim;
  const yayilim = enIyi / enKotu;
  /**
   * 🔴 EŞİK 3,0x. Altı çeşitlilik, üstü tuzak: 10,7x'te oyuncunun rasyonel
   * seçimi hatların yarısını hiç almamaktı. Tam eşitlik (1,0x) de hedef
   * değil — ölçüm tek senaryodan geliyor ve her oyun tarzını temsil etmiyor.
   */
  check('verim yayılımı ≤ 3,0x', yayilim <= 3.0,
    `${yayilim.toFixed(1)}x (${satir[0].id} ${enIyi.toFixed(1)} ↔ ${satir[satir.length - 1].id} ${enKotu.toFixed(1)})`);

  // ⚠️ ÇİFT TARAFLI: hiçbir hat bedava olmamalı — 0 maliyetli bir hat
  // yayılımı sonsuza götürür ve yukarıdaki kontrol anlamını yitirir.
  check('her hattın maliyeti var', FORGE.every((u) => totalCost(u) > 0));
  check('hiçbir hat aşırı ucuz değil (> 5.000 gold)',
    FORGE.every((u) => totalCost(u) > 5_000),
    FORGE.filter((u) => totalCost(u) <= 5_000).map((u) => u.id).join(', ') || 'hepsi üstünde');
}

console.log('\n[3] AĞAÇ TOPLAMI KORUNUYOR');
{
  /**
   * ⚠️ `hours.test` ve `curve.test` ağacı 98-145 saat diye ölçüyor ve o sayı
   * başka denge kararlarının dayanağı. Fiyat hizalaması TOPLAMI değiştirmemeli;
   * değiştirilecekse bilinçli olmalı ve o testler yeniden okunmalı.
   */
  const toplam = treeTotalCost();
  check('ağaç toplamı beklenen aralıkta (560K-630K)',
    toplam > 560_000 && toplam < 630_000, `${toplam.toLocaleString('en-US')} gold`);
  const saatDusuk = toplam / 6031, saatYuksek = toplam / 4085;
  check('ağaç 90-160 saat aralığında',
    saatDusuk > 90 && saatYuksek < 160,
    `${saatDusuk.toFixed(0)}-${saatYuksek.toFixed(0)} saat`);
}

console.log('\n[4] MALİYET EĞRİSİ SAĞLAM');
{
  // Her hat seviye başına pahalılaşmalı — düzleşen bir eğri son seviyeleri
  // bedavaya yakın yapar ve ağacın sonu anlamsızlaşır.
  check('her hatta growth > 1', FORGE.every((u) => u.growth > 1),
    FORGE.filter((u) => u.growth <= 1).map((u) => u.id).join(', ') || 'hepsi artan');
  check('her hatta maxLevel ≥ 3', FORGE.every((u) => u.maxLevel >= 3));
  check('baseCost pozitif', FORGE.every((u) => u.baseCost > 0));
  // ⚠️ İlk seviye ERİŞİLEBİLİR olmalı: yeni oyuncu ağaca dokunamıyorsa
  // Forge bir hedef değil, bir duvar olur.
  const enUcuzIlk = Math.min(...FORGE.map((u) => u.baseCost));
  check('en ucuz ilk seviye < 15 dakikalık gelir', enUcuzIlk < 6031 / 4,
    `${enUcuzIlk} gold`);
}

console.log(`\n${FAIL.length === 0 ? '✅ FORGE FİYATLARI DENGELİ' : `❌ ${FAIL.length} BAŞARISIZ: ${FAIL.join(', ')}`}\n`);
process.exit(FAIL.length === 0 ? 0 : 1);
