// LEADERBOARD TESTİ — sıralama ekseni adil mi, rekor güvenli mi.
//
// Buradaki asıl risk "yanlış sıralama" değil, SIRALAMANIN YANLIŞ ŞEYİ
// ÖDÜLLENDİRMESİ: sadece derinliğe bakan bir tablo 1. bölümü farmlamayı
// üst sıraya taşırdı ve oyuncular oraya akardı.
//
// Çalıştır:  npx tsx src/leaderboard.test.mts

import { challengeRating } from '@game/config';
import { prisma } from './db.js';
import { backfill, rankOf, recomputeAll, recordDescent, top } from './leaderboard.js';

const FAIL: string[] = [];
const check = (n: string, ok: boolean, d = '') => {
  console.log(`${ok ? '  ✓' : '  ✗'} ${n}${d ? ` — ${d}` : ''}`);
  if (!ok) FAIL.push(n);
};

const P = `TEST_LB_${Date.now()}`;
const w = (n: number) => `${P}_${n}`;
const get = (n: number) => prisma.player.findUniqueOrThrow({ where: { wallet: w(n) } });

await prisma.player.createMany({
  data: [0, 1, 2, 3].map((n) => ({ wallet: w(n), gold: 0 })),
});

// ── 1) Sıralama ekseni ──
console.log('\n[1] challengeRating');
{
  // Derinlik arttıkça puan artmalı — yoksa daha derine inmenin anlamı kalmaz
  let monoton = true;
  for (let d = 1; d < 60; d++) {
    if (challengeRating(1, d + 1) <= challengeRating(1, d)) { monoton = false; break; }
  }
  check('derinlik arttıkça puan ARTIYOR', monoton);

  // Aynı derinlikte zor bölüm daha çok puan vermeli
  let bolumMonoton = true;
  for (let s = 1; s < 10; s++) {
    if (challengeRating(s + 1, 10) <= challengeRating(s, 10)) { bolumMonoton = false; break; }
  }
  check('aynı derinlikte ZOR bölüm daha çok puan veriyor', bolumMonoton);

  check('derinlik 0 puan vermiyor', challengeRating(1, 0) === 0);
  check('negatif derinlik puan vermiyor', challengeRating(1, -5) === 0);

  // ⭐ ASIL SORU: 1. bölümü farmlamak zor bölümü geçmekten kârlı mı?
  // Bölüm 1 derinlik 40 ile bölüm 10 derinlik 40 arasında bölüm 10 önde olmalı.
  check('bölüm 10 · derinlik 40 > bölüm 1 · derinlik 40',
    challengeRating(10, 40) > challengeRating(1, 40),
    `${challengeRating(10, 40).toExponential(2)} vs ${challengeRating(1, 40).toExponential(2)}`);

  // Ölçü mantıklı bir aralıkta mı — sonsuz/NaN sıralamayı sessizce bozar
  check('derin değerler sonlu kalıyor', Number.isFinite(challengeRating(10, 200)),
    challengeRating(10, 200).toExponential(2));
}

// ── 2) Rekor yazımı ──
console.log('\n[2] Rekor');
{
  check('descent rekoru yazılıyor', await recordDescent(w(0), 'descent', 1, 10));
  const a = await get(0);
  check('alanlar doğru', a.bestStage === 1 && a.bestDepth === 10, `bölüm ${a.bestStage} derinlik ${a.bestDepth}`);

  // ⭐ Rekor DÜŞMEMELİ: kötü bir koşu skoru silerse oyuncu oynamamaya teşvik edilir
  check('daha kötü koşu rekoru DÜŞÜRMÜYOR', !(await recordDescent(w(0), 'descent', 1, 3)));
  const b = await get(0);
  check('rekor korundu', b.bestDepth === 10, `${b.bestDepth}`);

  check('daha iyi koşu rekoru yükseltiyor', await recordDescent(w(0), 'descent', 1, 25));
  check('yeni rekor yazıldı', (await get(0)).bestDepth === 25);

  // Kampanyada derinlik kavramı yok
  check('kampanya koşusu rekor yazmıyor', !(await recordDescent(w(1), 'campaign', 5, 0)));
  check('kampanya oyuncusu tabloda yok', (await get(1)).bestRating === 0);

  check('derinlik 0 rekor yazmıyor', !(await recordDescent(w(1), 'descent', 1, 0)));
}

// ── 3) Eş zamanlılık ──
// İki koşu aynı anda kapanırsa DÜŞÜK olan yükseği ezmemeli.
console.log('\n[3] Eş zamanlılık');
{
  await prisma.player.update({ where: { wallet: w(2) }, data: { bestStage: 0, bestDepth: 0, bestRating: 0 } });
  await Promise.all([
    recordDescent(w(2), 'descent', 1, 30),
    recordDescent(w(2), 'descent', 1, 5),
    recordDescent(w(2), 'descent', 1, 18),
  ]);
  const c = await get(2);
  check('eş zamanlı yazımda EN İYİ kalıyor', c.bestDepth === 30, `derinlik ${c.bestDepth}`);
}

// ── 4) Tablo ──
console.log('\n[4] Tablo');
{
  await recordDescent(w(3), 'descent', 10, 20); // zor bölüm — en tepede olmalı
  const rows = await top(100);
  const mine = rows.filter((r) => r.wallet.startsWith(P));

  check('inen oyuncular tabloda', mine.length === 3, `${mine.length} kayıt`);
  check('hiç inmemiş oyuncu tabloda YOK', !rows.some((r) => r.wallet === w(1)));

  const sirali = mine.every((r, i) => i === 0 || mine[i - 1].rating >= r.rating);
  check('puana göre azalan sıralı', sirali);
  check('zor bölüm oyuncusu önde', mine[0].wallet === w(3), mine[0].wallet.slice(-1));

  check('rank alanı 1\'den başlıyor', rows[0].rank === 1);

  // Ban — leaderboard cezanın görünür olduğu yer
  await prisma.player.update({ where: { wallet: w(3) }, data: { banned: true } });
  check('BANLI oyuncu tablodan düşüyor', !(await top(100)).some((r) => r.wallet === w(3)));
  check('banlı oyuncunun sırası yok', (await rankOf(w(3))) === null);
  await prisma.player.update({ where: { wallet: w(3) }, data: { banned: false } });
}

// ── 5) Kendi sıram ──
console.log('\n[5] Sıra');
{
  const r0 = await rankOf(w(0));
  check('sıra dönüyor', r0 !== null && r0.rank >= 1, `#${r0?.rank}`);

  // Sıra, tablodaki konumla TUTARLI olmalı — iki ayrı sorgu, aynı cevap
  const rows = await top(100);
  const idx = rows.findIndex((r) => r.wallet === w(0));
  check('sıra tablodaki konumla tutarlı', r0!.rank === idx + 1, `#${r0!.rank} vs tablo #${idx + 1}`);

  check('hiç inmemişin sırası YOK (0. sıra değil)', (await rankOf(w(1))) === null);
  check('olmayan cüzdanın sırası yok', (await rankOf('YOK_BOYLE_BIR_CUZDAN')) === null);
}

// ── 6) Geri doldurma ──
console.log('\n[6] Backfill');
{
  // Eski oyuncu taklidi: depthPaid dolu ama denormalize alanlar boş
  await prisma.player.update({
    where: { wallet: w(1) },
    data: { depthPaid: { 3: 14, 7: 9 }, bestStage: 0, bestDepth: 0, bestRating: 0 },
  });

  const r1 = await backfill();
  check('backfill oyuncuyu buldu', r1.updated >= 1, `${r1.updated}/${r1.scanned}`);

  const p = await get(1);
  // Bölüm 7 derinlik 9 mu, bölüm 3 derinlik 14 mü daha zor — puan karar versin
  const beklenen = challengeRating(3, 14) >= challengeRating(7, 9) ? 3 : 7;
  check('EN ZOR iniş seçildi (en derin değil)', p.bestStage === beklenen,
    `bölüm ${p.bestStage} · 3→${challengeRating(3, 14).toExponential(2)} 7→${challengeRating(7, 9).toExponential(2)}`);

  // ⭐ Idempotent: ikinci çalıştırma hiçbir şeyi değiştirmemeli
  const before = await get(1);
  const r2 = await backfill();
  const after = await get(1);
  check('ikinci backfill DEĞİŞİKLİK yapmıyor',
    before.bestRating === after.bestRating && r2.updated === 0, `${r2.updated} güncelleme`);

  // Mevcut rekoru DÜŞÜRMEMELİ
  await prisma.player.update({
    where: { wallet: w(0) },
    data: { depthPaid: { 1: 2 } }, // rekordan çok düşük
  });
  const yuksek = (await get(0)).bestRating;
  await backfill();
  check('backfill mevcut rekoru düşürmüyor', (await get(0)).bestRating === yuksek);
}

// ── 7) Yeniden kurma (kaçış valfi) ──
// Rekor "sadece artar" olduğu için yanlış yazılmış bir satır kendiliğinden
// DÜZELMEZ. Süre tabanı eklenmeden önce yazılmış "derinlik 500" kaydı tam
// olarak böyle takılı kalmıştı.
console.log('\n[7] Yeniden kurma');
{
  const mk = (id: string, wallet: string, stageId: number, depth: number, capped: boolean) =>
    prisma.run.create({
      data: {
        id, wallet, seed: 1n, mode: 'descent', stageId, hero: 'knight',
        claimedAt: new Date(), claimedDepth: depth, awardedDepth: depth,
        awarded: 0, capped,
      },
    });

  await prisma.run.deleteMany({ where: { wallet: { startsWith: P } } });
  await mk(`${P}-a`, w(0), 1, 8, false);   // dürüst
  await mk(`${P}-b`, w(0), 1, 400, true);  // kırpılmış — SAYILMAMALI
  await mk(`${P}-c`, w(2), 1, 3, false);

  // Kirli bir rekor yaz: yeniden kurma bunu düşürmeli
  await prisma.player.update({
    where: { wallet: w(3) },
    data: { bestStage: 1, bestDepth: 500, bestRating: challengeRating(1, 500) },
  });

  const r = await recomputeAll();
  check('yeniden kurma çalıştı', r.players >= 2, `${r.players} oyuncu · ${r.cleared} sıfırlandı`);

  const p0 = await get(0);
  check('KIRPILMIŞ koşu rekor olmuyor', p0.bestDepth === 8, `derinlik ${p0.bestDepth}`);

  const p3 = await get(3);
  check('kaydı olmayanın kirli rekoru SIFIRLANIYOR', p3.bestRating === 0, `${p3.bestRating}`);
  check('sıfırlanan tablodan düşüyor', !(await top(100)).some((x) => x.wallet === w(3)));

  // Idempotent
  const r2 = await recomputeAll();
  check('ikinci kez çalıştırmak aynı sonucu veriyor',
    (await get(0)).bestDepth === 8 && r2.players === r.players, `${r2.players}`);

  await prisma.run.deleteMany({ where: { wallet: { startsWith: P } } });
}

// ── temizlik ──
await prisma.run.deleteMany({ where: { wallet: { startsWith: P } } });
await prisma.player.deleteMany({ where: { wallet: { startsWith: P } } });

console.log(`\n${FAIL.length === 0 ? '✅ LEADERBOARD SAĞLAM' : `❌ ${FAIL.length} BAŞARISIZ: ${FAIL.join(', ')}`}\n`);
process.exit(FAIL.length === 0 ? 0 : 1);
