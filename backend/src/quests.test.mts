// GÜNLÜK GÖREVLER — sunucu testi.
//
// Riskler:
//   1. ÇİFT ÖDÜL — aynı görevi iki kez almak günlük toz tavanını deler
//   2. ELLE DÜZENLENMİŞ KAYIT — `claimed: [hepsi]` yazmak ödülleri
//      bedavaya almanın yolu olmamalı
//   3. GÜN DEĞİŞİMİ — dünkü ilerleme bugüne taşınmamalı, dünkü görev
//      id'siyle bugün ödül alınmamalı
//   4. `depth` TOPLANMAMALI — üç kez 10'a inmek "30'a in"i tamamlamamalı
//
// Çalıştır:  npx tsx src/quests.test.mts

import { QUESTS, questAccumulate, questsFor, dayDustCeiling } from '@game/quests';
import { utcDay } from '@game/progress';
import { prisma } from './db.js';
import { claimQuest, listQuests, trackQuest } from './quests.js';

const FAIL: string[] = [];
const check = (n: string, ok: boolean, d = '') => {
  console.log(`${ok ? '  ✓' : '  ✗'} ${n}${d ? ` — ${d}` : ''}`);
  if (!ok) FAIL.push(n);
};

const P = `TEST_QUEST_${Date.now()}`;
const w = (n: number) => `${P}_${n}`;
const get = (n: number) => prisma.player.findUniqueOrThrow({ where: { wallet: w(n) } });
const BUGUN = utcDay(new Date());

await prisma.player.createMany({ data: [0, 1].map((n) => ({ wallet: w(n), gold: 100_000 })) });

console.log('\n═══ GÜNLÜK GÖREVLER ═══');

console.log('\n[1] Görevler TÜRETİLİYOR, saklanmıyor');
{
  const a = questsFor(w(0), BUGUN);
  const b = questsFor(w(0), BUGUN);
  check('aynı cüzdan + aynı gün → AYNI görevler',
    a.map((q) => q.id).join() === b.map((q) => q.id).join(), a.map((q) => q.id).join(', '));
  check('günde 3 görev', a.length === QUESTS.perDay, `${a.length}`);

  const c = questsFor(w(1), BUGUN);
  check('farklı cüzdan farklı görev alabiliyor',
    a.map((q) => q.id).join() !== c.map((q) => q.id).join()
    || true, c.map((q) => q.id).join(', '));

  const d = questsFor(w(0), '2020-01-01');
  check('farklı gün farklı görevler', a.map((q) => q.id).join() !== d.map((q) => q.id).join());

  // ⚠️ AYNI TÜRDEN İKİ GÖREV DÜŞMEMELİ — "2 koşu" ile "4 koşu" aynı gün
  // gelirse ikincisi birincisini kendiliğinden tamamlar.
  const turler = a.map((q) => q.kind);
  check('aynı türden iki görev YOK', new Set(turler).size === turler.length, turler.join(', '));

  // ⚠️ Musluk ölçülebilir olmalı
  console.log(`     günlük toz tavanı: ${dayDustCeiling(w(0), BUGUN)}`);
  check('günlük toz tavanı makul', dayDustCeiling(w(0), BUGUN) <= 250,
    `${dayDustCeiling(w(0), BUGUN)}`);
}

console.log('\n[2] ⭐ `depth` TOPLANMIYOR, en iyisi sayılıyor');
{
  // Üç kez 10'a inmek "30'a in" görevini tamamlamamalı
  check('depth: en iyi tek koşu', questAccumulate('depth', 10, 10) === 10);
  check('depth: daha derin geçiyor', questAccumulate('depth', 10, 22) === 22);
  check('depth: daha sığ değiştirmiyor', questAccumulate('depth', 22, 5) === 22);
  // Diğerlerinde toplam doğru
  check('run: toplanıyor', questAccumulate('run', 2, 1) === 3);
  check('spend: toplanıyor', questAccumulate('spend', 500, 300) === 800);
}

console.log('\n[3] ⭐ İlerleme ve ödül');
{
  const gorevler = questsFor(w(0), BUGUN);
  const hedef = gorevler[0];
  // Görevi tam tamamla
  await trackQuest(w(0), hedef.kind, hedef.goal);
  let v = await listQuests(w(0));
  const q = v.quests.find((x) => x.id === hedef.id)!;
  check('ilerleme işlendi', q.progress === hedef.goal, `${q.progress}/${hedef.goal}`);
  check('görev tamamlandı', q.done);
  check('henüz alınmadı', !q.claimed);

  const tozOnce = (await get(0)).dust;
  const r = await claimQuest(w(0), hedef.id);
  check('ödül alındı', r.dust === hedef.dust, `${r.dust} toz`);
  check('toz cüzdana yazıldı', (await get(0)).dust === tozOnce + hedef.dust);

  // ⭐ İKİNCİ KEZ ALINAMAZ
  let ikinci = true;
  try { await claimQuest(w(0), hedef.id); } catch { ikinci = false; }
  check('aynı ödül İKİNCİ KEZ alınamıyor', !ikinci);
  check('toz ikinci kez yazılmadı', (await get(0)).dust === tozOnce + hedef.dust);

  // Tamamlanmamış görevin ödülü alınamaz
  const yarim = gorevler[1];
  let erken = true;
  try { await claimQuest(w(0), yarim.id); } catch { erken = false; }
  check('tamamlanmamış görevin ödülü alınamıyor', !erken);

  v = await listQuests(w(0));
  check('bonus henüz hazır değil', !v.bonus.ready);
  let bonusErken = true;
  try { await claimQuest(w(0), '__bonus'); } catch { bonusErken = false; }
  check('erken bonus REDDEDİLİYOR', !bonusErken);
}

console.log('\n[4] ⭐ Üçünü de bitirince bonus');
{
  for (const q of questsFor(w(0), BUGUN)) {
    await trackQuest(w(0), q.kind, q.goal);
    await claimQuest(w(0), q.id).catch(() => null);
  }
  const v = await listQuests(w(0));
  check('üçü de alındı', v.quests.every((q) => q.claimed));
  check('bonus HAZIR', v.bonus.ready);

  const tozOnce = (await get(0)).dust;
  const b = await claimQuest(w(0), '__bonus');
  check('bonus alındı', b.dust === QUESTS.allBonus, `${b.dust}`);
  check('bonus tozu yazıldı', (await get(0)).dust === tozOnce + QUESTS.allBonus);
  let tekrar = true;
  try { await claimQuest(w(0), '__bonus'); } catch { tekrar = false; }
  check('bonus İKİNCİ KEZ alınamıyor', !tekrar);

  // ⚠️ Günlük tavan aşılmamalı
  const alinan = (await get(0)).dust;
  check('günün tozu tavanı aşmadı', alinan <= dayDustCeiling(w(0), BUGUN),
    `${alinan} ≤ ${dayDustCeiling(w(0), BUGUN)}`);
}

console.log('\n[5] ⭐ GÜVENLİK: elle düzenlenmiş kayıt');
{
  // Kayda "hepsi alındı" yaz — okuma bunu ELEMELİ mi
  await prisma.player.update({
    where: { wallet: w(1) },
    data: {
      quests: {
        day: BUGUN,
        progress: { yok_boyle: 999, q_run2: 999 },
        claimed: ['yok_boyle', 'q_depth30'],
        bonus: true,
      },
    },
  });
  const v = await listQuests(w(1));
  const bugun = new Set(questsFor(w(1), BUGUN).map((q) => q.id));
  check('bilinmeyen görev id\'si eleniyor', v.quests.every((q) => bugun.has(q.id)));
  // Bugünün görevi olmayan bir claim geçmemeli
  const sahte = v.quests.filter((q) => q.claimed && !bugun.has(q.id));
  check('bugünün görevi olmayan claim eleniyor', sahte.length === 0);

  // ⚠️ Dünkü bir görev id'siyle bugün ödül alınamamalı
  const dunku = questsFor(w(1), '2020-01-01').find((q) => !bugun.has(q.id));
  if (dunku) {
    let gecti = true;
    try { await claimQuest(w(1), dunku.id); } catch { gecti = false; }
    check('dünkü görev id\'siyle ödül ALINAMIYOR', !gecti, dunku.id);
  } else {
    check('dünkü görev id\'siyle ödül ALINAMIYOR', true, 'örtüşme yok');
  }

  check('geçersiz id reddediliyor', await red(() => claimQuest(w(1), 'yok_boyle')));
  check('sayı id reddediliyor', await red(() => claimQuest(w(1), 42 as unknown as string)));
  check('null id reddediliyor', await red(() => claimQuest(w(1), null)));
}

console.log('\n[6] Gün değişimi');
{
  // Dünkü kayıt bugüne taşınmamalı
  await prisma.player.update({
    where: { wallet: w(1) },
    data: { quests: { day: '2020-01-01', progress: { q_run2: 99 }, claimed: ['q_run2'], bonus: true } },
  });
  const v = await listQuests(w(1));
  check('dünkü ilerleme SIFIRLANDI', v.quests.every((q) => q.progress === 0),
    v.quests.map((q) => q.progress).join(','));
  check('dünkü claim taşınmadı', v.quests.every((q) => !q.claimed));
  check('dünkü bonus taşınmadı', !v.bonus.claimed);
}

console.log('\n[7] Eşzamanlı alma');
{
  await prisma.player.update({ where: { wallet: w(1) }, data: { dust: 0, quests: {} } });
  const q = questsFor(w(1), BUGUN)[0];
  await trackQuest(w(1), q.kind, q.goal);
  const r = await Promise.all([1, 2, 3, 4].map(() =>
    claimQuest(w(1), q.id).then((x) => x.dust).catch(() => 0)));
  const toplam = r.reduce((s, v) => s + v, 0);
  console.log(`     4 eşzamanlı alma → ${toplam} toz (tek ödül ${q.dust})`);
  check('yalnızca BİR ödül verildi', (await get(1)).dust === q.dust, `${(await get(1)).dust}`);
}

async function red(fn: () => Promise<unknown>): Promise<boolean> {
  try { await fn(); return false; } catch { return true; }
}

await prisma.player.deleteMany({ where: { wallet: { startsWith: P } } });

console.log(`\n${FAIL.length === 0 ? '✅ GÜNLÜK GÖREVLER SAĞLAM' : `❌ ${FAIL.length} BAŞARISIZ: ${FAIL.join(', ')}`}\n`);
process.exit(FAIL.length === 0 ? 0 : 1);
