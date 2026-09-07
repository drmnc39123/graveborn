// YENİDEN DÖVME MÜHRÜ.
//
// 🔴 NİYE VAR: Reforge, gold'un en doğal sonsuz gideri (AFK Heroes'un 45
// günlük tablosunda 152.529 yükseltme). Bozulduğunda sessiz bozulur: bir
// kademenin maliyeti tanımsız kalırsa düğme "yükseltilemez" der ve kimse
// sebebini sormaz — ekipmana yatırım yolu kapanır, oyuncu bunu bir hata
// olarak değil "oyun böyleymiş" diye yaşar.
//
//   cd frontend && npx tsx src/game/reforge.test.mts

import { RARITIES, netBudget, rarityOf } from './gear.js';
import {
  FULL_PROMOTE_COST, REFORGE, canPromote, promoteCost, promotePreview, rerollCost,
} from './reforge.js';

const FAIL: string[] = [];
const check = (n: string, ok: boolean, d = '') => {
  console.log(`${ok ? '  ✓' : '  ✗'} ${n}${d ? ` — ${d}` : ''}`);
  if (!ok) FAIL.push(n);
};

/** hours.test.mts'te ölçülen tekrar koşusu geliri */
const GOLD_SAAT = 6031;
const ENUST = RARITIES.length;

console.log('\n═══ YENİDEN DÖVME ═══');

console.log('\n[1] ⭐ HER KADEMENİN YÜKSELTME MALİYETİ TANIMLI');
{
  /**
   * 🔴 SESSİZ KOPMA NOKTASI. `promoteCost` tanımsız bir kademede `null`
   * döner ve arayüz düğmeyi kapatır — hata mesajı YOKTUR. Oyuncu "bu parça
   * yükseltilemiyor" görür, sebebini bilmez.
   */
  for (let t = 1; t < ENUST; t++) {
    const c = promoteCost(t);
    check(`${rarityOf(t).name} → ${rarityOf(t + 1).name} maliyeti var`,
      typeof c === 'number' && c > 0, String(c));
  }
  check('en üst kademe yükseltilemez', promoteCost(ENUST) === null, String(promoteCost(ENUST)));
  check('canPromote en üstte false', !canPromote(ENUST));
  check('canPromote alt kademelerde true',
    [...Array(ENUST - 1)].every((_, i) => canPromote(i + 1)));

  /**
   * ⚠️ DOSYANIN KENDİ İDDİASI YOKLANIYOR: "Tavan RARITIES tablosundan
   * TÜRÜYOR: yeni bir kademe eklenirse yükseltme kendiliğinden oraya kadar
   * çalışır." Bu ancak maliyet tablosu da o kadar uzunsa DOĞRU. Kısa
   * kalırsa yeni kademe sessizce yükseltilemez olur — iddia yanlış olur,
   * kod hata vermez.
   */
  check('maliyet tablosu RARITIES kadar uzun',
    REFORGE.promote.length >= ENUST, `${REFORGE.promote.length} vs ${ENUST} kademe`);
  check('yeniden dizme tablosu RARITIES kadar uzun',
    REFORGE.reroll.length >= ENUST + 1, `${REFORGE.reroll.length} vs ${ENUST}`);
}

console.log('\n[2] MALİYET SIRASI');
{
  let artan = true;
  for (let t = 1; t < ENUST - 1; t++) {
    if ((promoteCost(t + 1) ?? 0) <= (promoteCost(t) ?? 0)) artan = false;
  }
  check('yükseltme her kademede pahalılaşıyor', artan);
  let rArtan = true;
  for (let t = 1; t < ENUST; t++) if (rerollCost(t + 1) <= rerollCost(t)) rArtan = false;
  check('yeniden dizme her kademede pahalılaşıyor', rArtan,
    [...Array(ENUST)].map((_, i) => rerollCost(i + 1)).join(' → '));
  check('toplam maliyet = parçaların toplamı',
    FULL_PROMOTE_COST === REFORGE.promote.reduce((s, v) => s + v, 0), String(FULL_PROMOTE_COST));
}

console.log('\n[3] ⭐ YÜKSELTME OYUNCUYU ZAYIFLATMIYOR');
{
  /**
   * 🔴 EN KÖTÜ HATA SINIFI: para ödeyip zayıflamak. gear.ts'te yazılı —
   * bir zamanlar en üst kademe bir alttakinden zayıftı ve bu "bir seçim
   * değil TUZAK"tı. Reforge o merdiveni PARAYLA tırmandırdığı için burada
   * ayrıca yoklanıyor: 32.000 gold ödeyip zayıflamak, geri alınamaz.
   */
  let dusen = 0;
  for (let t = 1; t < ENUST; t++) {
    if (netBudget(rarityOf(t + 1)) <= netBudget(rarityOf(t))) dusen++;
  }
  check('her yükseltme net gücü ARTIRIYOR', dusen === 0, `${dusen} düşüş`);
}

console.log('\n[4] ÖNİZLEME DÜRÜST — lanet saklanmıyor');
{
  /**
   * ⚠️ Oyuncu 32.000 gold harcamadan ÖNCE "bu işlem sana ikinci bir lanet
   * getirecek" cümlesini görmeli. Sonradan öğrenmek, geri alınamayan bir
   * harcamada en kötü sürpriz.
   */
  check('en üstte önizleme yok', promotePreview(ENUST) === null);
  let hata = 0, lanetArtti = 0;
  for (let t = 1; t < ENUST; t++) {
    const p = promotePreview(t);
    if (!p) { hata++; continue; }
    if (p.from !== rarityOf(t).name || p.to !== rarityOf(t + 1).name) hata++;
    if (p.cost !== promoteCost(t)) hata++;
    if (p.banesFrom !== rarityOf(t).banes || p.banesTo !== rarityOf(t + 1).banes) hata++;
    if (p.boonsFrom !== rarityOf(t).boons || p.boonsTo !== rarityOf(t + 1).boons) hata++;
    // ⚠️ Lanet ASLA azalmaz — azalsaydı yükseltme "bedava iyileşme" olurdu
    // ve ekipman tasarımının kalbi (daha büyük takas) sökülürdü.
    if (p.banesTo < p.banesFrom) hata++;
    if (p.banesTo > p.banesFrom) lanetArtti++;
  }
  check('önizleme her kademede tutarlı', hata === 0, `${hata} sapma`);
  // Dosyanın iddiası: Kept→Marked bir lanet, Cursed→Graveborn ikincisi.
  check('tam iki yükseltme lanet ekliyor', lanetArtti === 2, `${lanetArtti}`);
}

console.log('\n[5] BOZUK GİRDİ');
{
  check('kademe 0 → null', promoteCost(0) === null);
  check('negatif kademe → null', promoteCost(-3) === null);
  check('NaN kademe → null', promoteCost(Number.NaN) === null);
  check('çok yüksek kademe → null', promoteCost(999) === null);
  check('kesirli kademe aşağı yuvarlanıyor', promoteCost(2.9) === promoteCost(2));
  // ⚠️ rerollCost HER ZAMAN bir sayı dönmeli: null dönseydi arayüz "NaN gold"
  // yazar ve düğme sessizce ölürdü.
  check('rerollCost bozuk girdide bile sayı',
    [0, -1, 999, Number.NaN, 2.5].every((t) => Number.isFinite(rerollCost(t))),
    [0, -1, 999, Number.NaN, 2.5].map((t) => rerollCost(t)).join(','));
  check('rerollCost hiç 0 dönmüyor',
    [1, 2, 3, 4, 5, 999].every((t) => rerollCost(t) > 0));
}

console.log('\n[6] EKONOMİ — ölçüm, hüküm değil');
{
  const saat = (g: number) => g / GOLD_SAAT;
  check('tam yükseltme ~7,3 saat (dosyadaki iddia)',
    saat(FULL_PROMOTE_COST) > 6 && saat(FULL_PROMOTE_COST) < 9,
    `${saat(FULL_PROMOTE_COST).toFixed(1)} saat · ${FULL_PROMOTE_COST.toLocaleString('en-US')} gold`);
  check('en üst kademede yeniden dizme ~18 dk (dosyadaki iddia)',
    saat(rerollCost(ENUST)) * 60 > 12 && saat(rerollCost(ENUST)) * 60 < 25,
    `${(saat(rerollCost(ENUST)) * 60).toFixed(0)} dk`);

  /**
   * ⚠️ BU BİR ÖLÇÜM, EŞİK DEĞİL. Kademe başına "net güç puanı başına gold"
   * yazdırılıyor ki dengeyi değiştiren biri neyi değiştirdiğini görsün.
   * Buraya bir eşik koymak, ölçmediğim bir kanaati kurala çevirmek olurdu.
   */
  const satirlar: string[] = [];
  for (let t = 1; t < ENUST; t++) {
    const kazanc = netBudget(rarityOf(t + 1)) - netBudget(rarityOf(t));
    satirlar.push(`${rarityOf(t).name}→${rarityOf(t + 1).name}: ${Math.round((promoteCost(t) ?? 0) / kazanc).toLocaleString('en-US')} gold/net puan`);
  }
  console.log(`     ${satirlar.join('\n     ')}`);
  // Tek gerçek kural: hiçbir yükseltme BEDAVA olmamalı (sink ölür).
  check('hiçbir yükseltme bedava değil',
    [...Array(ENUST - 1)].every((_, i) => (promoteCost(i + 1) ?? 0) > 0));
}

console.log(`\n${FAIL.length === 0 ? '✅ YENİDEN DÖVME SAĞLAM' : `❌ ${FAIL.length} BAŞARISIZ: ${FAIL.join(', ')}`}\n`);
process.exit(FAIL.length === 0 ? 0 : 1);
