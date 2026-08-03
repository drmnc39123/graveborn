// EFEKT KATMANI TESTİ — havuzlama gerçekten çalışıyor mu, motoru kirletiyor mu.
//
// Buradaki asıl risk "efekt görünmüyor" değil (onu gözle görürsün), iki sinsi
// sınıf: (1) havuz yerine her frame yeni nesne tahsis edilmesi → GC spike →
// frame düşmesi, (2) efekt katmanının simülasyona sızması → tarayıcıda başka,
// sunucuda başka sonuç.
//
// Çalıştır:  npx tsx src/game/fx.test.mts

import { Game } from './engine.js';
import { TICK } from './config.js';
import { pumpFx, resetFx, shakeOffset, takeFreeze } from './fx.js';

const FAIL: string[] = [];
const check = (n: string, ok: boolean, d = '') => {
  console.log(`${ok ? '  ✓' : '  ✗'} ${n}${d ? ` — ${d}` : ''}`);
  if (!ok) FAIL.push(n);
};

console.log('\n[1] DOM\'suz çalışıyor');
{
  // fx.ts render katmanında yaşıyor ama `pumpFx` çizim yapmıyor — headless
  // koşabilmeli ki perf'i ölçülebilsin ve CI'da kırılmasın.
  const g = new Game(12345);
  g.setViewport(1280, 720);
  resetFx();
  let patladi = false;
  try {
    for (let i = 0; i < 120; i++) { g.step(); pumpFx(g, TICK); }
  } catch (e) {
    patladi = true;
    console.log('    hata:', (e as Error).message);
  }
  check('pumpFx headless çalışıyor (DOM yok)', !patladi);
  check('120 tick sonra oyun hâlâ ayakta', g.phase === 'running' || g.phase === 'levelup', g.phase);
}

console.log('\n[2] Kuyruklar boşaltılıyor');
{
  const g = new Game(999);
  g.setViewport(1280, 720);
  resetFx();
  for (let i = 0; i < 600; i++) { g.step(); pumpFx(g, TICK); }
  // ⚠️ `deaths` BİLEREK boşaltılmıyor (render.ts'teki ölüm patlaması onu
  // kullanıyor) — tek boşaltma noktası olmalı, yoksa efektlerden biri aç kalır.
  check('hits kuyruğu boşaltılıyor', g.hits.length === 0, `${g.hits.length}`);
  check('hurts kuyruğu boşaltılıyor', g.hurts.length === 0, `${g.hurts.length}`);
}

console.log('\n[3] Kuyruk tavanları (headless sızıntı koruması)');
{
  // Render hiç çalışmasa bile kuyruklar sonsuz büyümemeli — sunucu bu motoru
  // headless koşuyor ve bellek sızıntısı orada ölümcül olur.
  const g = new Game(4242);
  g.setViewport(1280, 720);
  for (let i = 0; i < 1800; i++) g.step();   // pumpFx YOK — kimse boşaltmıyor
  check('hits tavanı tutuyor (≤96)', g.hits.length <= 96, `${g.hits.length}`);
  check('deaths tavanı tutuyor (≤256)', g.deaths.length <= 256, `${g.deaths.length}`);
  check('hurts tavanı tutuyor (≤4)', g.hurts.length <= 4, `${g.hurts.length}`);
}

console.log('\n[4] Havuzlama — tahsis olmadığının kanıtı');
{
  // ⚠️ ASIL TEST BU. Havuz yerine push kullanılsaydı bellek koşu boyunca
  // büyürdü. Ölçüm: yoğun 20 saniyede heap artışı.
  const g = new Game(777);
  g.setViewport(1280, 720);
  resetFx();
  for (let i = 0; i < 300; i++) { g.step(); pumpFx(g, TICK); }  // ısınma

  global.gc?.();
  const before = process.memoryUsage().heapUsed;
  for (let i = 0; i < 1200; i++) { g.step(); pumpFx(g, TICK); }
  global.gc?.();
  const after = process.memoryUsage().heapUsed;
  const buyume = (after - before) / 1024 / 1024;
  console.log(`     1200 tick heap değişimi: ${buyume.toFixed(2)} MB`);
  // Motorun kendi varlıkları da büyüyor (düşman/mermi), o yüzden eşik cömert;
  // havuz yerine push olsaydı bu sayı on kat büyük olurdu.
  check('efekt katmanı bellek patlatmıyor (<12 MB)', buyume < 12, `${buyume.toFixed(2)} MB`);
}

console.log('\n[5] Güncelleme bütçesi');
{
  const g = new Game(31337);
  g.setViewport(1280, 720);
  resetFx();
  for (let i = 0; i < 600; i++) { g.step(); pumpFx(g, TICK); }  // sürüyü büyüt

  const N = 1200;
  const t0 = performance.now();
  for (let i = 0; i < N; i++) { g.step(); pumpFx(g, TICK); }
  const toplam = performance.now() - t0;

  // pumpFx'i ayrı ölç: aynı sayıda çağrı, step olmadan
  const t1 = performance.now();
  for (let i = 0; i < N; i++) pumpFx(g, TICK);
  const sadecePump = (performance.now() - t1) / N;

  console.log(`     step+pump ${(toplam / N).toFixed(3)} ms/tick · sadece pumpFx ${sadecePump.toFixed(4)} ms`);
  console.log(`     sahnede ${g.enemies.length} düşman`);
  // Frame bütçesi 16.7 ms; pumpFx bunun %3'ünü geçmemeli
  check('pumpFx bütçesi (<0.5 ms/frame)', sadecePump < 0.5, `${sadecePump.toFixed(4)} ms`);
}

console.log('\n[6] Hit-stop ve sarsıntı');
{
  const g = new Game(555);
  g.setViewport(1280, 720);
  resetFx();

  check('başlangıçta sarsıntı yok', shakeOffset().x === 0 && shakeOffset().y === 0);
  check('başlangıçta donma yok', takeFreeze() === 0);

  // Oyuncuya hasar verdir → hem sarsıntı hem donma gelmeli
  g.hurts.push({ amount: 10 });
  pumpFx(g, TICK);
  const sh = shakeOffset();
  check('hasar sarsıntı üretiyor', Math.abs(sh.x) + Math.abs(sh.y) > 0,
    `(${sh.x.toFixed(2)}, ${sh.y.toFixed(2)})`);
  const f = takeFreeze();
  check('hasar donma üretiyor', f > 0, `${(f * 1000).toFixed(0)} ms`);
  check('donma bir kez okunur (tekrar 0)', takeFreeze() === 0);
  check('donma tavanı makul (≤90 ms)', f <= 0.09, `${(f * 1000).toFixed(0)} ms`);

  // Sarsıntı sönmeli — kalıcı olsaydı ekran sürekli titrerdi
  for (let i = 0; i < 240; i++) pumpFx(g, TICK);
  const sh2 = shakeOffset();
  check('sarsıntı sönüyor', sh2.x === 0 && sh2.y === 0);
}

console.log('\n[7] Determinizm — efektler rng akışını KİRLETMİYOR');
{
  // Aynı seed, biri pumpFx'li biri pumpFx'siz: simülasyon birebir aynı kalmalı.
  const mk = (pump: boolean) => {
    const g = new Game(24680);
    g.setViewport(1280, 720);
    resetFx();
    for (let i = 0; i < 900; i++) {
      if (g.phase === 'levelup') g.choose(g.offers[0].id);
      if (g.phase !== 'running') break;
      g.hp = g.stats.maxHp;
      g.setInput(Math.cos(i * TICK * 0.7), Math.sin(i * TICK * 0.7));
      g.step();
      if (pump) pumpFx(g, TICK);
    }
    return g;
  };
  const ile = mk(true);
  const siz = mk(false);
  check('pumpFx kill sayısını DEĞİŞTİRMİYOR', ile.kills === siz.kills, `${ile.kills} = ${siz.kills}`);
  check('pumpFx konumu DEĞİŞTİRMİYOR', Math.abs(ile.px - siz.px) < 1e-9 && Math.abs(ile.py - siz.py) < 1e-9);
  check('pumpFx nadir gold\'u DEĞİŞTİRMİYOR', ile.rareGold === siz.rareGold, `${ile.rareGold}`);
}

console.log(`\n${FAIL.length === 0 ? '✅ EFEKT KATMANI SAĞLAM' : `❌ ${FAIL.length} BAŞARISIZ: ${FAIL.join(', ')}`}\n`);
process.exit(FAIL.length === 0 ? 0 : 1);
