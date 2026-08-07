// TAKİP LİSTESİ — sunucu testi.
//
// Riskler:
//   1. Liste bir SORGU ARACI olmamalı — "yok" ile "banlı" aynı cevabı
//      vermeli, yoksa kimin banlı olduğu dışarıdan öğrenilir
//   2. Tekrar takip listeyi şişirmemeli
//   3. Meydan okuma engeli listede de GÖRÜNMELİ — düğme sessizce
//      çalışmazsa oyuncu sebebini bilemez
//
// Çalıştır:  npx tsx src/follow.test.mts

import { prisma } from './db.js';
import { FOLLOW_MAX, follow, listFollows, unfollow } from './follow.js';
import { publishRecord, settleDuel } from './duel.js';

const FAIL: string[] = [];
const check = (n: string, ok: boolean, d = '') => {
  console.log(`${ok ? '  ✓' : '  ✗'} ${n}${d ? ` — ${d}` : ''}`);
  if (!ok) FAIL.push(n);
};

const P = `TEST_FOLLOW_${Date.now()}`;
const w = (n: number) => `${P}_${n}`;
const CLEARED = { '1': true, '2': true };

await prisma.player.createMany({
  data: [
    { wallet: w(0), cleared: CLEARED },
    { wallet: w(1), hero: 'ranger', duelRating: 1200, bestStage: 3, bestDepth: 44 },
    { wallet: w(2), hero: 'priestess', duelRating: 900 },
    { wallet: w(3), banned: true },
  ],
});

console.log('\n═══ TAKİP LİSTESİ ═══');

console.log('\n[1] Takip etme');
{
  await follow(w(0), w(1));
  let l = await listFollows(w(0), CLEARED);
  check('takip edildi', l.rows.length === 1, `${l.rows.length}`);
  check('rakip bilgileri geliyor',
    l.rows[0].duelRating === 1200 && l.rows[0].bestDepth === 44,
    `${l.rows[0].duelRating} · d${l.rows[0].bestDepth}`);
  check('tavan bildiriliyor', l.max === FOLLOW_MAX, `${l.max}`);

  // ⚠️ Tekrar takip listeyi ŞİŞİRMEMELİ
  await follow(w(0), w(1));
  l = await listFollows(w(0), CLEARED);
  check('aynı kişi iki kez eklenmiyor', l.rows.length === 1, `${l.rows.length}`);

  await follow(w(0), w(2));
  l = await listFollows(w(0), CLEARED);
  check('ikinci kişi eklendi', l.rows.length === 2);
  // Çevrimiçi olan önce, sonra puana göre — hiçbiri çevrimiçi değil
  check('puana göre sıralı', l.rows[0].duelRating >= l.rows[1].duelRating,
    `${l.rows[0].duelRating} ≥ ${l.rows[1].duelRating}`);
}

console.log('\n[2] ⭐ Liste bir SORGU ARACI değil');
{
  const dene = async (t: unknown) => {
    try { await follow(w(0), t); return 'gecti'; }
    catch (e) { return (e as Error).message; }
  };
  // ⚠️ "Yok" ile "banlı" AYNI cevabı vermeli: aksi hâlde liste, hangi
  // cüzdanların banlı olduğunu sorgulamanın aracı olurdu.
  const yok = await dene(`${P}_HIC_YOK`);
  const banli = await dene(w(3));
  check('olmayan cüzdan reddediliyor', yok !== 'gecti', yok);
  check('banlı cüzdan reddediliyor', banli !== 'gecti', banli);
  check('İKİSİ AYNI CEVABI veriyor', yok === banli, `"${yok}"`);

  check('kendini takip edemiyor', (await dene(w(0))) !== 'gecti');
  check('sayı reddediliyor', (await dene(42)) !== 'gecti');
  check('boş metin reddediliyor', (await dene('  ')) !== 'gecti');
  check('null reddediliyor', (await dene(null)) !== 'gecti');
}

console.log('\n[3] ⭐ Meydan okuma durumu listede');
{
  // Kayıt yokken sebebi yazılı olmalı
  let l = await listFollows(w(0), CLEARED);
  const kayitsiz = l.rows.find((r) => r.wallet === w(2))!;
  check('kaydı olmayanın SEBEBİ yazılı', !!kayitsiz.blocker, kayitsiz.blocker ?? '');
  check('kaydı olmayanın recordId yok', kayitsiz.recordId === null);

  // Kayıt yayınla → meydan okunabilir olmalı
  await publishRecord(w(1), 'descent', 1, 4242, 30, 0, false);
  l = await listFollows(w(0), CLEARED);
  const hedef = l.rows.find((r) => r.wallet === w(1))!;
  check('kayıt varsa meydan okunabilir', hedef.blocker === null && !!hedef.recordId,
    `d${hedef.recordDepth}`);
  check('hedef derinlik listede', hedef.recordDepth === 30, `${hedef.recordDepth}`);

  // ⚠️ Soğuma listede de GÖRÜNMELİ — düğme sessizce çalışmazsa oyuncu
  // sebebini bilemez
  await settleDuel(w(0), w(1), 1, 99, 30, 1200);
  l = await listFollows(w(0), CLEARED);
  const soguyan = l.rows.find((r) => r.wallet === w(1))!;
  check('soğumadaki rakip SEBEBİNİ gösteriyor',
    !!soguyan.blocker && /Wait/.test(soguyan.blocker), soguyan.blocker ?? '');

  // Temizlenmemiş bölüm de sebebiyle
  const kilitli = await listFollows(w(0), {});
  const k = kilitli.rows.find((r) => r.wallet === w(1))!;
  check('temizlenmemiş bölüm sebebi ayrı', !!k.blocker, k.blocker ?? '');
}

console.log('\n[4] Banlı hesap listede GÖRÜNMÜYOR ama kayıt duruyor');
{
  await prisma.player.update({ where: { wallet: w(2) }, data: { banned: true } });
  let l = await listFollows(w(0), CLEARED);
  check('banlı takip listede yok', !l.rows.some((r) => r.wallet === w(2)),
    `${l.rows.length} satır`);
  // ⚠️ Takip KAYDI silinmiyor: ban kalkarsa liste kendiliğinden geri gelmeli
  check('takip kaydı silinmedi',
    (await prisma.follow.count({ where: { wallet: w(0), target: w(2) } })) === 1);
  await prisma.player.update({ where: { wallet: w(2) }, data: { banned: false } });
  l = await listFollows(w(0), CLEARED);
  check('ban kalkınca liste geri geliyor', l.rows.some((r) => r.wallet === w(2)));
}

console.log('\n[5] Bırakma ve tavan');
{
  await unfollow(w(0), w(2));
  const l = await listFollows(w(0), CLEARED);
  check('takip bırakıldı', !l.rows.some((r) => r.wallet === w(2)), `${l.rows.length}`);
  check('olmayanı bırakmak patlamıyor',
    await unfollow(w(0), 'yok_boyle').then(() => true).catch(() => false));
  check('geçersiz tip patlamıyor',
    await unfollow(w(0), 42 as unknown as string).then(() => true).catch(() => false));

  // ⚠️ TAVAN: sınırsız takip listeyi ve sorguyu şişirirdi
  const fazla = Array.from({ length: FOLLOW_MAX + 3 }, (_, i) => `${P}_bulk_${i}`);
  await prisma.player.createMany({ data: fazla.map((wa) => ({ wallet: wa })) });
  let reddedildi = false;
  for (const t of fazla) {
    try { await follow(w(0), t); } catch { reddedildi = true; break; }
  }
  check('takip tavanı uygulanıyor', reddedildi);
  check('tavan aşılmadı',
    (await prisma.follow.count({ where: { wallet: w(0) } })) <= FOLLOW_MAX,
    `${await prisma.follow.count({ where: { wallet: w(0) } })}`);
}

await prisma.follow.deleteMany({ where: { wallet: { startsWith: P } } });
await prisma.duel.deleteMany({ where: { challenger: { startsWith: P } } });
await prisma.duelRecord.deleteMany({ where: { wallet: { startsWith: P } } });
await prisma.player.deleteMany({ where: { wallet: { startsWith: P } } });

console.log(`\n${FAIL.length === 0 ? '✅ TAKİP LİSTESİ SAĞLAM' : `❌ ${FAIL.length} BAŞARISIZ: ${FAIL.join(', ')}`}\n`);
process.exit(FAIL.length === 0 ? 0 : 1);
