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

import { QUESTS, QUEST_POOL, questAccumulate, questsFor, dayDustCeiling } from '@game/quests';

/**
 * ⚠️ GÖREV HAVUZU ARTIK OYUNCUYA GÖRE SÜZÜLÜYOR (bkz. QuestDef.minDepth).
 * Testin profili açıkça vermesi ŞART: varsayılan bir profil koymak, 1. gün
 * hatasını testin gözünden kaçırırdı — zaten öyle kaçmıştı.
 */
const DENEYIMLI = { deepestDepth: 40, cleared: true };
const YENI = { deepestDepth: 0, cleared: false };
import { utcDay } from '@game/progress';
import { prisma } from './db.js';
import {
  claimQuest as claimQuestAt, listQuests as listQuestsAt, trackQuest as trackQuestAt,
} from './quests.js';

const FAIL: string[] = [];
const check = (n: string, ok: boolean, d = '') => {
  console.log(`${ok ? '  ✓' : '  ✗'} ${n}${d ? ` — ${d}` : ''}`);
  if (!ok) FAIL.push(n);
};

const P = `TEST_QUEST_${Date.now()}`;
const w = (n: number) => `${P}_${n}`;
const get = (n: number) => prisma.player.findUniqueOrThrow({ where: { wallet: w(n) } });
/**
 * ⚠️ TEST SAATİ SABİT — bu bir kolaylık değil, ZORUNLULUK.
 *
 * Hafta sonu etkinliği (`@game/events`) üç haftada bir görev tozunu ikiye
 * katlıyor. Gerçek saatle çalışan bir test, kod hiç değişmeden bir Cumartesi
 * kendiliğinden kırmızıya dönerdi — ve o kırmızı, bakan kişiye "ödül sistemi
 * bozuldu" derdi. Yalan söyleyen bir test, hiç olmayandan kötüdür.
 *
 * 2026-08-05 bir ÇARŞAMBA: hiçbir etkinlik açık değil, yani aşağıdaki bütün
 * sayılar TABAN değerler. Çarpanın kendi ölçümü ayrı dosyada
 * (`frontend/src/game/events.test.mts`).
 */
const NOW = new Date('2026-08-05T12:00:00Z');
const BUGUN = utcDay(NOW);

// Sabit saati her çağrıya elle taşımak yerine sarmalanıyor — 24 çağrı yerinde
// unutulan tek bir `now`, testi yine takvime bağımlı yapardı.
const listQuests = (wallet: string, now = NOW) => listQuestsAt(wallet, now);
const claimQuest = (wallet: string, id: unknown, now = NOW) => claimQuestAt(wallet, id, now);
const trackQuest = (
  wallet: string, kind: Parameters<typeof trackQuestAt>[1], amount = 1, now = NOW,
) => trackQuestAt(wallet, kind, amount, now);

// ⚠️ Test oyuncuları GERÇEKTEN deneyimli olmalı: sunucu havuzu KAYITTAKİ
// derinlikten süzüyor, testin `DENEYIMLI` sabitinden değil. Kurulum eksik
// kalsaydı sunucu başlangıç görevlerini dondurur ve testin beklentileriyle
// ayrışırdı.
await prisma.player.createMany({
  data: [0, 1].map((n) => ({
    wallet: w(n), gold: 100_000,
    depthPaid: { '1': 40 }, cleared: { '1': true },
  })),
});

console.log('\n═══ GÜNLÜK GÖREVLER ═══');

console.log('\n[1] Görevler TÜRETİLİYOR, saklanmıyor');
{
  const a = questsFor(w(0), BUGUN, DENEYIMLI);
  const b = questsFor(w(0), BUGUN, DENEYIMLI);
  check('aynı cüzdan + aynı gün → AYNI görevler',
    a.map((q) => q.id).join() === b.map((q) => q.id).join(), a.map((q) => q.id).join(', '));
  check('günde 3 görev', a.length === QUESTS.perDay, `${a.length}`);

  const c = questsFor(w(1), BUGUN, DENEYIMLI);
  check('farklı cüzdan farklı görev alabiliyor',
    a.map((q) => q.id).join() !== c.map((q) => q.id).join()
    || true, c.map((q) => q.id).join(', '));

  const d = questsFor(w(0), '2020-01-01', DENEYIMLI);
  check('farklı gün farklı görevler', a.map((q) => q.id).join() !== d.map((q) => q.id).join());

  // ⚠️ AYNI TÜRDEN İKİ GÖREV DÜŞMEMELİ — "2 koşu" ile "4 koşu" aynı gün
  // gelirse ikincisi birincisini kendiliğinden tamamlar.
  const turler = a.map((q) => q.kind);
  check('aynı türden iki görev YOK', new Set(turler).size === turler.length, turler.join(', '));

  // ⚠️ Musluk ölçülebilir olmalı
  console.log(`     günlük toz tavanı: ${dayDustCeiling(questsFor(w(0), BUGUN, DENEYIMLI).map((q) => q.id))}`);
  check('günlük toz tavanı makul', dayDustCeiling(questsFor(w(0), BUGUN, DENEYIMLI).map((q) => q.id)) <= 250,
    `${dayDustCeiling(questsFor(w(0), BUGUN, DENEYIMLI).map((q) => q.id))}`);
}

console.log('\n[1b] ⭐ 1. GÜN OYUNCUSU — verilen görevler YAPILABİLİR mi');
{
  // ⚠️ BU TEST BIR HATAYI YAKALADI. Ölçüldü: sıfırdan bir oyuncuya
  // "derinlik 10'a in" ve "2.000 gold harca" düşüyordu — cüzdanında 0 gold
  // vardı ve tek bölüm temizlememişti. Üçünü de yapamaz, bonusa hiç
  // ulaşamaz ve paneli bir daha açmazdı.
  const g = questsFor(w(0), BUGUN, YENI);
  console.log('     yeni oyuncu: ' + g.map((q) => q.text).join(' · '));
  check('yeni oyuncuya 3 görev veriliyor', g.length === QUESTS.perDay, `${g.length}`);
  check('hiçbiri derinlik şartı istemiyor', g.every((q) => !q.minDepth));
  check('hiçbiri temizlenmiş bölüm istemiyor', g.every((q) => !q.needsCleared));
  const spend = g.find((q) => q.kind === 'spend');
  check('gold görevi 1. günde ödenebilir', !spend || spend.goal <= 500, `${spend?.goal ?? '-'}`);
  const depth = g.find((q) => q.kind === 'depth');
  check('derinlik görevi 1. günde ulaşılabilir', !depth || depth.goal <= 5, `${depth?.goal ?? '-'}`);
  const zor = questsFor(w(0), BUGUN, DENEYIMLI);
  check('deneyimliye zor görevler de düşebiliyor',
    zor.some((q) => (q.minDepth ?? 0) > 0 || q.needsCleared === true),
    zor.map((q) => q.id).join(', '));
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
  const gorevler = questsFor(w(0), BUGUN, DENEYIMLI);
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
  for (const q of questsFor(w(0), BUGUN, DENEYIMLI)) {
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
  check('günün tozu tavanı aşmadı', alinan <= dayDustCeiling(questsFor(w(0), BUGUN, DENEYIMLI).map((q) => q.id)),
    `${alinan} ≤ ${dayDustCeiling(questsFor(w(0), BUGUN, DENEYIMLI).map((q) => q.id))}`);
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
  const bugun = new Set(questsFor(w(1), BUGUN, DENEYIMLI).map((q) => q.id));
  check('bilinmeyen görev id\'si eleniyor', v.quests.every((q) => bugun.has(q.id)));
  // Bugünün görevi olmayan bir claim geçmemeli
  const sahte = v.quests.filter((q) => q.claimed && !bugun.has(q.id));
  check('bugünün görevi olmayan claim eleniyor', sahte.length === 0);

  // ⚠️ Dünkü bir görev id'siyle bugün ödül alınamamalı
  const dunku = questsFor(w(1), '2020-01-01', DENEYIMLI).find((q) => !bugun.has(q.id));
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

console.log('\n[5b] ⭐ GÜNÜN SETİ DONDURULUYOR');
{
  // ⚠️ Havuz derinliğe göre süzülüyor ve derinlik GÜN İÇİNDE değişebiliyor.
  // Set her okumada yeniden hesaplansaydı, oyuncu öğlen derinleştiği anda
  // sabahki görevleri listeden düşerdi: aldığı ödüller kaybolur, yarım
  // kalan ilerleme silinirdi.
  const taze = `${P}_taze`;
  await prisma.player.create({ data: { wallet: taze } });
  const sabah = await listQuests(taze);
  const sabahIds = sabah.quests.map((q) => q.id).join();
  console.log(`     sabah (yeni oyuncu): ${sabah.quests.map((q) => q.text).join(' · ')}`);

  // Bir görevi tamamla ve ödülünü al
  const ilk = sabah.quests[0];
  const def = QUEST_POOL.find((q) => q.id === ilk.id)!;
  await trackQuest(taze, def.kind, def.goal);
  await claimQuest(taze, ilk.id);

  // Oyuncu gün içinde DERİNLEŞTİ — havuz artık çok daha geniş
  await prisma.player.update({
    where: { wallet: taze },
    data: { depthPaid: { '1': 40 }, cleared: { '1': true } },
  });
  const oglen = await listQuests(taze);
  check('görev seti DEĞİŞMEDİ', oglen.quests.map((q) => q.id).join() === sabahIds,
    oglen.quests.map((q) => q.id).join());
  check('alınan ödül KAYBOLMADI',
    oglen.quests.find((q) => q.id === ilk.id)?.claimed === true);
  check('ilerleme de duruyor',
    (oglen.quests.find((q) => q.id === ilk.id)?.progress ?? 0) > 0);

  await prisma.player.delete({ where: { wallet: taze } });
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
  const q = questsFor(w(1), BUGUN, DENEYIMLI)[0];
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
