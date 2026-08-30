// DENGE ÖLÇÜM ARACI — ELLE çalıştırılır, mühür DEĞİLDİR.
//
//   npx tsx src/game/balance.probe.mts
//
// ⚠️ NİYE `balance.test.mts`'TEN AYRI: bu araç 12 seed × 30 dakikalık
// simülasyon koşturuyor ve yapılandırma başına ~2-4 dakika sürüyor. Böyle
// bir şey mühür OLAMAZ — çalıştırılmayan mühür, olmayan mühürdür. Mühür
// yapısal kontrolleri yapıyor; sayıları BU araç üretiyor ve `balance.test`
// başlığına yorum olarak yazılıyor.
//
// ── ÖLÇÜM ALETİNİN 4 KEZ YALAN SÖYLEDİĞİ YERLER ──
//
// 1. ⚠️ 10 DAKİKALIK PENCERE TABLOYU KIRPIYOR. Taban koşu "derinlik 4'te
//    ölüyor" görünüyordu; tam 30 dk pencerede 24'e gidiyor. Kırpılmış
//    pencerede hatların yarısı 0 çıkıyor ve "bu hat ölü" denesi geliyor.
//
// 2. ⚠️ 3 SEED YETMİYOR. 3 seed'le aynı ölçüm `might +10,7 / health +0,0`
//    dedi; 12 seed'de gerçek `might +1,7 / savunma üçlü +8,4` çıktı.
//    Tamamen sahte bir sıralamaydı.
//
// 3. ⚠️ DERİNLİK GÜRÜLTÜLÜ ÖLÇÜT. `pspeed` 0→3→5→7→10 kademelerinde
//    derinlik 8,2 · 7,6 · 7,1 · 8,5 · 6,7 — girdi tek yönlü artarken çıktı
//    zikzak. Aynı koşularda kill/dk %7 bandında. SALDIRI hattını kill/dk,
//    SAVUNMA hattını derinlik ile yargıla.
//
// 4. ⚠️ "VEKİL OYUNCU KAÇIYOR, EKONOMİ YANLIŞ KALİBRE" alarmı ÇÜRÜDÜ.
//    Dövüşen bir pilot yazıldı; tam pencerede iki pilot %4 içinde buluşuyor
//    (4.631 vs 4.816 gold/saat). `fleeInput` doğru araç.
//
// ── ÖLÇÜLEN (2026-08-24, 12 seed × 30 dk, `descent`, sıfır Forge tabanı) ──
//
//   yapılandırma      derinlik   kill/dk   koşu gold   hat fiyatı
//   taban                  8,2       111         268           —
//   might max              9,9       129         432      69.316
//   area max               6,1        98         140      63.161   ⚠️ TABANIN ALTINDA
//   amount max            14,2       132         707      30.778   ⭐ EN İYİ
//   duration max           8,8       112         333      28.619
//   cooldown max           8,1       116         289      45.932
//   pspeed max             6,7       106         200      28.619   ⚠️ ATIL
//   greed max              8,2       111         457      35.563   (gold +%70 — doğru)
//   health max             8,7         —         310      69.316
//   armor max              8,6         —         308      47.978
//   recovery max           9,1         —         349      38.762
//   SAVUNMA ÜÇÜ BİRDEN    16,6         —         915     156.056   ⭐ EŞİK ETKİSİ
//
// ── OKUNAN SONUÇLAR ──
//
// · SAVUNMA BİR EŞİK SİSTEMİ: üç hat tek tek +0,4/+0,5/+0,9 veriyor ama
//   birlikte +8,4. Toplamları 1,8 değil. Bir hattı TEK BAŞINA ölçüp
//   "gereksiz" diye silme veya ucuzlatma.
// · FİYAT–GÜÇ TERSLİĞİ: `amount` 30.778 gold ile `might`ten (69.316) hem
//   ucuz hem her iki ölçütte daha iyi.
// · `area` en pahalı üçüncü hat ve tam havuzda TABANIN ALTINDA (kill/dk
//   111 → 98). ⚠️ SEBEP BULUNAMADI — kurduğum hipotez ÇÜRÜDÜ, aşağıda.
// · `greed` çalışıyor (+%70 gold, tasarım +%72) ama derinliğe etkisi yok;
//   bu doğru, gold statı.
//
// ── ⚠️ ÇÜRÜYEN HİPOTEZ: "`area` MESAFE büyüttüğü için zararlı" ──
//
// İDDİA: `wArea` iki yerde alan değil mesafe büyütüyor — `maxDist`
// (bumerang sürünün dışına uçar) ve `orbitRadius` (orb'lar oyuncudan
// uzaklaşır, oysa sürü oyuncunun etrafında). Motorun kendi yorumu (~2169)
// aynı tuzağı `projSpeed` için yazıp MESAFEYE bağlayarak çözmüş.
//
// DENEY: silah havuzunu tek desene sabitleyip area'yı açtım (12 seed × 30 dk).
//   litany (orbit)     132 → 127  (−%4)   düşmeli → TUTTU
//   sickle (boomerang) 137 → 136  (−%1)   düşmeli → TUTMADI
//   lash   (sweep)     138 → 138  (−%1)   ARTMALI → TUTMADI
//   ward   (aura)      139 → 147  (+%6)   artmalı → TUTTU
//
// Dört tahminden ikisi tuttu = doğrulama DEĞİL. Üstelik izole silahlarda
// ortalama etki ~0 iken tam havuzda −%12 çıkıyor; yani −%12'yi `area`
// tek başına açıklamıyor, kurgu bileşimi de işin içinde.
//
// ⚠️ MOTORA DOKUNMA. `maxDist`/`orbitRadius`taki `wArea` çarpanını
// kaldırmak için ELDE KANIT YOK ve değişiklik mührü kırar.
// ⚠️ AMA FİYAT SORUNU DURUYOR: ölçülebilir tek kazanan aura (+%6) ve hat
// 63.161 gold (13,4 saat) istiyor. Mekanizma bilinmese de fiyat yüksek.

import { permanentBonus } from './forge.js';
import { RUN, STAGES, TICK } from './config.js';
import { Game } from './engine.js';
import { seedFromString } from './rng.js';
import { fleeInput, smartPick } from './simPlayer.js';

const SEEDS = Array.from({ length: 12 }, (_, i) => `s${i + 1}`);
const LIMIT = Math.round(RUN.durationSec / TICK) + 10;

function profil(up: Record<string, number>) {
  let d = 0, k = 0, t = 0, gld = 0;
  const der: number[] = [];
  for (const seed of SEEDS) {
    const g = new Game(seedFromString(seed), STAGES[0], permanentBonus(up), 'descent', undefined, 1);
    g.setViewport(1280, 720);
    for (let i = 0; i < LIMIT; i++) {
      if (g.phase === 'levelup') g.choose(smartPick(g));
      if (g.phase !== 'running') break;
      g.setInput(...fleeInput(g)); g.step();
    }
    d += g.stage.deepestCleared; k += g.kills; t += g.time; gld += g.rareGold;
    der.push(g.stage.deepestCleared);
  }
  der.sort((a, b) => a - b);
  const dk = t / SEEDS.length / 60;
  return {
    d: d / SEEDS.length, ortanca: der[6], dk,
    killDk: (k / SEEDS.length) / dk, gold: gld / SEEDS.length,
  };
}

const KONU: Array<[string, Record<string, number>]> = [
  ['taban', {}],
  ['might max', { might: 20 }],
  ['area max', { area: 18 }],
  ['amount max', { amount: 3 }],
  ['duration max', { duration: 10 }],
  ['cooldown max', { cooldown: 12 }],
  ['pspeed max', { pspeed: 10 }],
  ['greed max', { greed: 12 }],
  ['health max', { health: 20 }],
  ['armor max', { armor: 10 }],
  ['recovery max', { recovery: 12 }],
  // ⭐ EŞİK KONTROLÜ — üçünü BİRLİKTE ölçmeden savunma yargılanamaz
  ['savunma üçlü', { health: 20, armor: 10, recovery: 12 }],
];

console.log('yapılandırma     derinlik  ortanca  kill/dk   gold    dk');
for (const [ad, up] of KONU) {
  const p = profil(up);
  console.log(`${ad.padEnd(15)} ${p.d.toFixed(1).padStart(7)} ${String(p.ortanca).padStart(8)} ` +
    `${p.killDk.toFixed(0).padStart(8)} ${p.gold.toFixed(0).padStart(7)} ${p.dk.toFixed(1).padStart(5)}`);
}
