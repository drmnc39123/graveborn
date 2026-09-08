// DESCENT GİRİŞ ÖLÇÜMÜ — elle çalıştırılır, mühür DEĞİLDİR.
//
//   npx tsx src/game/descent.probe.mts
//
// 🔴 KULLANICI BİLDİRİMİ: *"Descent moduna girdiğimizde ilk olarak 70 civarı
// düşman geliyor fakat o kadar zor ki daha derinlik 1 bile geçilemiyor."*
//
// Sayı doğru: d1 = `enemyBase 60 + enemyPerDepth 10` = tam 70 düşman.
// Sorulan şey ise ölçülebilir: TABAN bir oyuncu (hiç Forge yükseltmesi yok)
// derinlik 1'i geçebiliyor mu, ne kadar sürüyor, canının ne kadarı gidiyor?
//
// ⚠️ ÖLÇÜM ALETİ ORTAK: `simPlayer.mts` (`fleeInput` + `smartPick`). Kendi
// yapay oyuncumu YAZMIYORUM — bu depoda iki kez denendi, ikisi de yalan
// söyledi.
//
// ⚠️ YAPAY OYUNCU İYİMSER BİR TAVAN. `fleeInput` sürekli ve kusursuz kaçıyor,
// `smartPick` her seviyede en iyi kartı alıyor. Yani buradan çıkan sayı
// "iyi oynayan biri ne yapar" sorusunun cevabı; yeni bir oyuncu BUNUN
// ALTINDA kalır. Bu yüzden sonuç "d1 geçiliyor" çıkarsa bile kullanıcının
// şikâyeti çürümez — o zaman sorun matematik değil, İLK DAKİKA olur.

import { Game } from './engine.js';
import { STAGES, RUN, TICK, DESCENT, descentStage } from './config.js';
import { seedFromString } from './rng.js';
import { fleeInput, smartPick } from './simPlayer.js';

const SEEDS = Array.from({ length: 12 }, (_, i) => `d${i + 1}`);
const LIMIT = Math.round(RUN.durationSec / TICK) + 10;

interface Sonuc {
  derinlik: number;
  /** d1'i temizlediği an (sn); temizleyemediyse null */
  d1Sn: number | null;
  /** d1 biterken kalan can yüzdesi */
  d1Can: number | null;
  /** koşu boyunca aynı anda sahnede görülen en çok düşman */
  enKalabalik: number;
  oldu: boolean;
  sure: number;
}

function kos(seed: string, tabanId = STAGES[0].id): Sonuc {
  // ⚠️ `permanent` BOŞ: taze oyuncu, hiç Forge yükseltmesi yok — şikâyetin
  // geldiği durum bu.
  const taban = STAGES.find((x) => x.id === tabanId) ?? STAGES[0];
  const g = new Game(seedFromString(seed), taban, {}, 'descent', undefined, 1);
  g.setViewport(1280, 720);
  let d1Sn: number | null = null, d1Can: number | null = null, enKalabalik = 0;
  for (let i = 0; i < LIMIT; i++) {
    if (g.phase === 'levelup') g.choose(smartPick(g));
    if (g.phase !== 'running') break;
    g.setInput(...fleeInput(g));
    g.step();
    if (g.enemies.length > enKalabalik) enKalabalik = g.enemies.length;
    if (d1Sn === null && g.stage.deepestCleared >= 1) {
      d1Sn = g.time;
      d1Can = (g.hp / g.stats.maxHp) * 100;
    }
  }
  return {
    derinlik: g.stage.deepestCleared, d1Sn, d1Can, enKalabalik,
    oldu: g.phase === 'dead', sure: g.time,
  };
}

console.log('\n=== DESCENT GİRİŞİ — TABAN OYUNCU (Forge yok) ===\n');
console.log(`d1 düşman sayısı: ${descentStage(STAGES[0].id, 1).enemyCount}`
  + `  (taban ${DESCENT.enemyBase} + derinlik başına ${DESCENT.enemyPerDepth})`);
console.log(`aynı anda sahnede en çok: ${descentStage(STAGES[0].id, 1).maxAlive}`);
console.log(`koşu süre tavanı: ${(RUN.durationSec / 60).toFixed(0)} dk\n`);

console.log('seed   d1 (sn)  d1 can%   en kalabalık   ulaşılan derinlik  süre(dk)  son');
const hepsi: Sonuc[] = [];
for (const s of SEEDS) {
  const r = kos(s);
  hepsi.push(r);
  console.log(
    `${s.padEnd(6)} ${(r.d1Sn === null ? '—' : r.d1Sn.toFixed(1)).padStart(7)}`
    + ` ${(r.d1Can === null ? '—' : r.d1Can.toFixed(0)).padStart(8)}`
    + ` ${String(r.enKalabalik).padStart(14)}`
    + ` ${String(r.derinlik).padStart(18)}`
    + ` ${(r.sure / 60).toFixed(1).padStart(9)}`
    + `  ${r.oldu ? 'öldü' : 'süre doldu'}`,
  );
}

console.log('\n=== AYNI "DEPTH 1", FARKLI TABAN BOLUM ===\n');
console.log('taban  d1 gecen  d1 ort sn   ulasilan derinlik(ortanca)');
for (const id of [1, 5, 10, 15, 20, 25]) {
  if (!STAGES.some((x) => x.id === id)) continue;
  const rs = SEEDS.slice(0, 6).map((sd) => kos(sd, id));
  const g2 = rs.filter((r) => r.d1Sn !== null);
  const dd = rs.map((r) => r.derinlik).sort((a, b) => a - b);
  console.log(`b${String(id).padStart(2)}    ${String(g2.length + '/' + rs.length).padStart(8)}`
    + ` ${(g2.length ? (g2.reduce((a, r) => a + (r.d1Sn ?? 0), 0) / g2.length).toFixed(1) : '—').padStart(10)}`
    + ` ${String(dd[Math.floor(dd.length / 2)]).padStart(28)}`);
}

const gecen = hepsi.filter((r) => r.d1Sn !== null);
const der = hepsi.map((r) => r.derinlik).sort((a, b) => a - b);
console.log('');
console.log(`d1'i GEÇEN koşu      : ${gecen.length}/${SEEDS.length}`);
if (gecen.length > 0) {
  const ort = gecen.reduce((s, r) => s + (r.d1Sn ?? 0), 0) / gecen.length;
  const can = gecen.reduce((s, r) => s + (r.d1Can ?? 0), 0) / gecen.length;
  console.log(`d1 ortalama süre     : ${ort.toFixed(1)} sn`);
  console.log(`d1 biterken can      : %${can.toFixed(0)}`);
}
console.log(`ulaşılan derinlik    : ortanca ${der[Math.floor(der.length / 2)]} · `
  + `en az ${der[0]} · en çok ${der[der.length - 1]}`);
console.log('');
