// DENGE MÜHRÜ — "bu düğme ne kazandırıyor, neye mal oluyor, dengeli mi?"
//
// Çalıştır:  npx tsx src/game/balance.test.mts
//
// ⚠️ NİYE AYRI BİR DOSYA: `curve.test` ekonominin HIZINI ölçüyor (gold/saat,
// kaç saatte ağaç dolar), `pacing.test` bir koşunun TEMPOSUNU. Bu dosya
// üçüncü bir soru soruyor: harcama SEÇENEKLERİ birbirine göre dengeli mi.
//
// ⚠️ BU DOSYA SİMÜLASYON KOŞTURMAZ ve bu bilinçli. Bir Forge hattının
// değerini ölçmek 12 seed × 30 dk koşu istiyor (~4 dk/hat, 14 hat = 1 saat).
// Böyle bir mühür ÇALIŞTIRILMAZ, yani olmayan mühürdür. Buradaki kontroller
// yapısal: "bonus motora ULAŞIYOR mu", "fiyatlar birbirine göre tutarlı mı".
// Ölçüme dayanan sayılar aşağıda YORUM olarak yazılı, tekrar üretilebilir.

import { CHARMS } from './charms.js';
import { FORGE, permanentBonus, totalCost, treeTotalCost } from './forge.js';
import { PULL_COST } from './cosmetics.js';
import { STAGES } from './config.js';
import { Game } from './engine.js';
import { seedFromString } from './rng.js';

const FAIL: string[] = [];
const check = (n: string, ok: boolean, d = '') => {
  console.log(`${ok ? '  ✓' : '  ✗'} ${n}${d ? ` — ${d}` : ''}`);
  if (!ok) FAIL.push(n);
};

/**
 * ÖLÇÜLEN MUSLUK — 4 seed × 30 dk, yarı dolu Forge, `descent`.
 * kaçan pilot 4.631 · dövüşen pilot 4.816 gold/saat.
 *
 * ⚠️ İKİ PİLOT DA ÖLÇÜLDÜ ve bilerek: "vekil oyuncu kaçıyor, o yüzden
 * ekonomi yanlış" diye bir alarm verildi ve ÖLÇÜMLE ÇÜRÜDÜ — tam pencerede
 * ikisi %4 içinde buluşuyor. Alarmın sebebi 10 dakikalık kırpılmış pencereydi.
 */
const GOLD_SAAT = 4700;

console.log('\n═══ DENGE ═══');

console.log('\n[1] ⭐ Her Forge hattı motora ULAŞIYOR mu');
// ⚠️ NİYE VAR: bu depoda tekrar eden en verimli hata sınıfı "kod çalışıyor,
// veri hesaplanıyor, son adımda ekrana/motora ULAŞMIYOR" (bkz. pet bağlama,
// evrim ipucu, soğuma halkası). Bir Forge hattı motora ulaşmazsa oyuncu
// on binlerce gold'u HİÇBİR ŞEYE öder ve hiçbir test bunu söylemez.
const bosOyun = new Game(seedFromString('bal'), STAGES[0], permanentBonus({}), 'descent', undefined, 1);
bosOyun.setViewport(1280, 720);
const tabanStat = bosOyun.stats as unknown as Record<string, number>;
const ulasmayan: string[] = [];
for (const u of FORGE) {
  const g = new Game(seedFromString('bal'), STAGES[0], permanentBonus({ [u.id]: u.maxLevel }), 'descent', undefined, 1);
  g.setViewport(1280, 720);
  const n = g.stats as unknown as Record<string, number>;
  if (!Object.keys(n).some((k) => n[k] !== tabanStat[k])) ulasmayan.push(u.id);
}
check('⭐ 14 Forge hattının hepsi bir stat DEĞİŞTİRİYOR', ulasmayan.length === 0,
  ulasmayan.length ? `ULAŞMAYAN: ${ulasmayan.join(', ')}` : `${FORGE.length} hat`);

console.log('\n[2] Tılsım (tek koşuluk) ile Forge (kalıcı) tutarlı mı');
// ⚠️ Tılsım UCUZ ve tek koşuluk, Forge PAHALI ve kalıcı. Doğru ilişki:
// tılsım anlık çözüm, Forge yatırım. Bir tılsım kalıcı hattan daha çok
// veriyorsa Forge'a hiç kimse dokunmaz.
const tilsimSaat = CHARMS.map((c) => c.cost / GOLD_SAAT);
console.log(`     tılsım fiyatları: ${CHARMS.map((c) => `${c.name} ${c.cost}`).join(' · ')}`);
check('hiçbir tılsım tek koşuda 20 dakikalık kazançtan pahalı değil',
  Math.max(...tilsimSaat) * 60 <= 20, `en pahalı ${(Math.max(...tilsimSaat) * 60).toFixed(1)} dk`);

console.log('\n[3] Ağacın toplam maliyeti — oyuncunun hissettiği birim: SAAT');
const agacSaat = treeTotalCost() / GOLD_SAAT;
const enPahaliHat = Math.max(...FORGE.map((u) => totalCost(u)));
console.log(`     tüm ağaç ${treeTotalCost().toLocaleString('en-US')} gold = ${agacSaat.toFixed(0)} saat`);
console.log(`     en pahalı tek hat ${enPahaliHat.toLocaleString('en-US')} = ${(enPahaliHat / GOLD_SAAT).toFixed(1)} saat`);
console.log(`     kozmetik çekiliş ${PULL_COST} = ${(PULL_COST / GOLD_SAAT * 60).toFixed(0)} dk`);
// ⚠️ ÜST SINIR, hedef DEĞİL. Ağaç bir "asla bitmeyen" hedef olmalı ama
// ulaşılamaz olmamalı. 126 saat ölçüldü; 250 saat üstü bir ağaç oyuncuya
// "hiç bitmez" der ve ilerleme hissini öldürür.
check('tüm ağaç 250 saatin altında', agacSaat < 250, `${agacSaat.toFixed(0)} saat`);
check('tek bir hat 25 saatin altında', enPahaliHat / GOLD_SAAT < 25,
  `${(enPahaliHat / GOLD_SAAT).toFixed(1)} saat`);

console.log('\n[4] ÖLÇÜM YÖNTEMİ — hattı TEK TEK değerlemek YANLIŞ');
// ⭐ ÖLÇÜLDÜ (12 seed × 30 dk, `balance.probe.mts`, taban derinlik 8,2):
//     health max ........  8,7  (+0,5)
//     armor  max ........  8,6  (+0,4)
//     recovery max ......  9,1  (+0,9)
//     ÜÇÜ BİRDEN ....... 16,6  (+8,4)   ← toplamları 1,8 değil 8,4
//     might max .........  9,9  (+1,7)
//     duration max ......  8,8  (+0,6)
//
// SAVUNMA BİR EŞİK SİSTEMİ. Üç hat tek tek eşiğin ALTINDA kalıyor ve
// "ölü" görünüyor; birlikte eşiği geçip derinliği İKİYE KATLIYOR. Yani
// "bu hat ne kazandırıyor" sorusunun tek-hat cevabı YOKTUR — eşikli bir
// sistemde toplamsal analiz yalan söyler.
// ⚠️ Bir hattı TEK BAŞINA ölçüp "gereksiz" diye SİLME veya UCUZLATMA.
//
// ⚠️ DERİNLİK GÜRÜLTÜLÜ BİR ÖLÇÜT. `pspeed` 0→3→5→7→10 kademelerinde
// derinlik 8,2 · 7,6 · 7,1 · 8,5 · 6,7 çıkıyor — girdi tek yönlü artarken
// çıktı zikzak. Aynı koşularda kill/dk 111 · 110 · 112 · 120 · 106, yani
// %7 bandında KARARLI. Saldırı hattı yargılarken kill/dk kullan.
// `pspeed` sonucu: ZARARLI DEĞİL, ATIL — kill hızını ölçülebilir biçimde
// hiç değiştirmiyor ama 28.619 gold (6,1 saat) istiyor.

console.log('\n[5] Fiyat sırası ile GÜÇ sırası çelişiyor mu');
// ⚠️ ÖLÇÜLDÜ (12 seed × 30 dk, `_defprobe`): savunma hatları taban 8,2
// derinliğe göre health +0,5 · armor +0,4 · recovery +0,9 katıyor.
// Yani ÖLÜ DEĞİLLER — ama `health` 69.316 gold ile ağacın EN PAHALI hattı
// (`might` ile eşit) ve `might` aynı paraya belirgin biçimde daha fazla
// veriyor. Ölçüm sayıları `_defprobe` ile tekrar üretilebilir.
//
// ⚠️ 3 SEED KULLANMA. 3 seed'le aynı ölçüm "savunma hatları TAMAMEN ölü,
// taban derinlik 4" diyordu; 12 seed'de taban 8,2 çıktı. Bu oturumda 3-seed
// örneklem İKİ KEZ yanlış sonuca götürdü.
const enPahali = [...FORGE].sort((a, b) => totalCost(b) - totalCost(a))[0];
const enUcuz = [...FORGE].sort((a, b) => totalCost(a) - totalCost(b))[0];
console.log(`     en pahalı: ${enPahali.name} (${totalCost(enPahali).toLocaleString('en-US')})`);
console.log(`     en ucuz  : ${enUcuz.name} (${totalCost(enUcuz).toLocaleString('en-US')})`);
check('en pahalı hat en ucuzun 5 katından fazla değil',
  totalCost(enPahali) / totalCost(enUcuz) <= 5,
  `${(totalCost(enPahali) / totalCost(enUcuz)).toFixed(1)}×`);

console.log(`\n${FAIL.length === 0 ? '✅ DENGE SAĞLAM' : `❌ ${FAIL.length} BAŞARISIZ: ${FAIL.join(', ')}`}\n`);
process.exit(FAIL.length === 0 ? 0 : 1);
