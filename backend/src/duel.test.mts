// DÜELLO — SUNUCU TESTİ.
//
// Elo matematiği `frontend/src/game/duel.test.mts`'te. Burada sunucuya özgü
// dört risk var:
//   1. SEED KAYITTAN GELMELİ — düellonun tek adalet dayanağı bu
//   2. KAYIT YALNIZCA İYİLEŞMELİ ve kırpılmış koşudan doğmamalı
//   3. YARIŞ — asenkron ladder'da aynı oyuncuya aynı anda iki kişi meydan
//      okuyabiliyor; puan yazımı birbirini EZMEMELİ
//   4. TOZ TAVANI — düello sınırsız oynanabiliyor
//
// Çalıştır:  npx tsx src/duel.test.mts

import { DUEL, nextRatings } from '@game/duel';
import { challengeRating } from '@game/config';
import { utcDay } from '@game/progress';
import { prisma } from './db.js';
import { board, findMatch, ladder, publishRecord, resolveChallenge, settleDuel } from './duel.js';

const FAIL: string[] = [];
const check = (n: string, ok: boolean, d = '') => {
  console.log(`${ok ? '  ✓' : '  ✗'} ${n}${d ? ` — ${d}` : ''}`);
  if (!ok) FAIL.push(n);
};

const P = `TEST_DUEL_${Date.now()}`;
const w = (n: number) => `${P}_${n}`;
const get = (n: number) => prisma.player.findUniqueOrThrow({ where: { wallet: w(n) } });
const CLEARED = { '1': true, '2': true };

await prisma.player.createMany({
  data: [0, 1, 2, 3].map((n) => ({ wallet: w(n), gold: 10_000, cleared: CLEARED })),
});

console.log('\n═══ DÜELLO (SUNUCU) ═══');

console.log('\n[1] ⭐ Kayıt yayınlama — yalnızca İYİLEŞİYOR');
{
  await publishRecord(w(1), 'descent', 1, 12345, 30, 0, false);
  let rec = await prisma.duelRecord.findUniqueOrThrow({
    where: { wallet_stageId: { wallet: w(1), stageId: 1 } },
  });
  check('kayıt açıldı', rec.depth === 30 && Number(rec.seed) === 12345, `d${rec.depth}`);
  check('puan hesaplandı', Math.abs(rec.rating - challengeRating(1, 30, 0)) < 1e-6);

  // ⚠️ DAHA KÖTÜ KOŞU KAYDI DÜŞÜRMEMELİ: düşürebilseydi oyuncu bilerek
  // "kolay hedef" bırakıp rakiplerinin puanını çalardı.
  await publishRecord(w(1), 'descent', 1, 999, 12, 0, false);
  rec = await prisma.duelRecord.findUniqueOrThrow({
    where: { wallet_stageId: { wallet: w(1), stageId: 1 } },
  });
  check('daha KÖTÜ koşu kaydı düşürmüyor', rec.depth === 30 && Number(rec.seed) === 12345,
    `d${rec.depth} seed${rec.seed}`);

  await publishRecord(w(1), 'descent', 1, 777, 44, 0, false);
  rec = await prisma.duelRecord.findUniqueOrThrow({
    where: { wallet_stageId: { wallet: w(1), stageId: 1 } },
  });
  check('daha İYİ koşu kaydı yükseltiyor', rec.depth === 44 && Number(rec.seed) === 777);

  // ⚠️ KIRPILMIŞ koşu kayıt olmaz — ona meydan okuyan HERKESİN puanı bozulur
  await publishRecord(w(1), 'descent', 1, 555, 900, 0, true);
  rec = await prisma.duelRecord.findUniqueOrThrow({
    where: { wallet_stageId: { wallet: w(1), stageId: 1 } },
  });
  check('KIRPILMIŞ koşu kayıt olmuyor', rec.depth === 44, `d${rec.depth}`);

  await publishRecord(w(1), 'campaign', 1, 1, 50, 0, false);
  check('kampanya koşusu kayıt olmuyor',
    (await prisma.duelRecord.count({ where: { wallet: w(1) } })) === 1);

  // Eşzamanlı yayınlama tekil kısıtta patlamamalı
  await Promise.all([50, 60, 55].map((d) => publishRecord(w(2), 'descent', 2, 4242, d, 0, false)));
  const r2 = await prisma.duelRecord.findUniqueOrThrow({
    where: { wallet_stageId: { wallet: w(2), stageId: 2 } },
  });
  check('eşzamanlı yayınlama EN İYİYİ tutuyor', r2.depth === 60, `d${r2.depth}`);
}

console.log('\n[2] ⭐ SEED KAYITTAN geliyor — düellonun tek adalet dayanağı');
{
  const rec = await prisma.duelRecord.findUniqueOrThrow({
    where: { wallet_stageId: { wallet: w(1), stageId: 1 } },
  });
  const ch = await resolveChallenge(w(0), rec.id, CLEARED);
  check('seed rakibin kaydından', ch.seed === Number(rec.seed), `${ch.seed}`);
  check('bölüm kayıttan', ch.stageId === rec.stageId);
  check('hedef derinlik kayıttan', ch.targetDepth === rec.depth, `${ch.targetDepth}`);
  check('savunanın puanı anlık alınıyor', ch.defRating === DUEL.start, `${ch.defRating}`);
}

console.log('\n[3] ⭐ GÜVENLİK: kendine / kilitli bölüme / soğumada meydan okuma');
{
  const kendi = await prisma.duelRecord.findUniqueOrThrow({
    where: { wallet_stageId: { wallet: w(1), stageId: 1 } },
  });
  const dene = async (wallet: string, id: string, cleared: Record<string, boolean>) => {
    try { await resolveChallenge(wallet, id, cleared); return 'gecti'; }
    catch (e) { return e instanceof Error && e.constructor.name === 'DuelError' ? 'red' : `patladi:${e}`; }
  };
  check('kendi kaydına meydan okunamıyor', (await dene(w(1), kendi.id, CLEARED)) === 'red');
  check('temizlenmemiş bölüme meydan okunamıyor',
    (await dene(w(0), kendi.id, {})) === 'red');
  check('bilinmeyen kayıt → red', (await dene(w(0), 'yok-boyle', CLEARED)) === 'red');
  check('id yerine sayı → red', (await dene(w(0), 42 as unknown as string, CLEARED)) === 'red');

  // Banlı rakibe meydan okunamaz
  await prisma.player.update({ where: { wallet: w(1) }, data: { banned: true } });
  check('BANLI rakibe meydan okunamıyor', (await dene(w(0), kendi.id, CLEARED)) === 'red');
  await prisma.player.update({ where: { wallet: w(1) }, data: { banned: false } });
}

console.log('\n[4] ⭐ Sonuç — beraberlik savunanın, puan hareket ediyor');
{
  const hedef = 44;
  // KAYBEDEN düello
  const kayip = await settleDuel(w(0), w(1), 1, hedef - 5, hedef, DUEL.start);
  check('daha sığ inen KAYBEDİYOR', !kayip.won);
  check('kaybeden puan kaybetti', kayip.delta < 0, `${kayip.delta}`);
  check('kaybeden TOZ almıyor', kayip.dust === 0);

  // ⚠️ BERABERLİK: hedefe ULAŞMAK yetmez, GEÇMEK gerekir
  const berabere = await settleDuel(w(0), w(1), 1, hedef, hedef, DUEL.start);
  check('AYNI derinlik kazanç DEĞİL', !berabere.won);

  const kazanc = await settleDuel(w(0), w(1), 1, hedef + 1, hedef, DUEL.start);
  check('daha derin inen KAZANIYOR', kazanc.won);
  check('kazanan puan aldı', kazanc.delta > 0, `+${kazanc.delta}`);
  check('kazanan TOZ aldı', kazanc.dust === DUEL.dustPerWin, `${kazanc.dust}`);

  const a = await get(0); const b = await get(1);
  check('kazanan/kaybeden sayaçları tutuyor', a.duelWins === 1 && a.duelLosses === 2,
    `${a.duelWins}G ${a.duelLosses}M`);
  check('SAVUNAN çevrimdışıyken de puanı hareket etti', b.duelRating !== DUEL.start,
    `${b.duelRating}`);
  check('savunanın sayaçları da işledi', b.duelWins === 2 && b.duelLosses === 1,
    `${b.duelWins}G ${b.duelLosses}M`);
}

console.log('\n[5] ⭐ Eşzamanlı düello — puan yazımı birbirini EZİYOR mu');
{
  // ⚠️ ASENKRON LADDER: aynı savunana aynı anda iki kişi meydan okuyabilir.
  // Mutlak yazma (oku-değiştir-yaz) ikinci sonucun birincisini ezerdi.
  await prisma.player.updateMany({
    where: { wallet: { in: [w(0), w(2), w(3)] } },
    data: { duelRating: DUEL.start, duelWins: 0, duelLosses: 0 },
  });
  await prisma.player.update({ where: { wallet: w(1) }, data: { duelRating: DUEL.start, duelWins: 0, duelLosses: 0 } });

  const beklenenDusus = nextRatings(DUEL.start, DUEL.start, true).defender - DUEL.start;
  const r = await Promise.all([w(0), w(2), w(3)].map((c) =>
    settleDuel(c, w(1), 1, 60, 44, DUEL.start).catch(() => null)));
  const gecen = r.filter(Boolean).length;
  const def = await get(1);
  console.log(`     3 eşzamanlı düello → ${gecen} tamamlandı, savunan ${DUEL.start} → ${def.duelRating}`);
  check('üç düello da işlendi', gecen === 3, `${gecen}`);
  check('savunanın kaybı ÜÇ KEZ sayıldı',
    def.duelRating === DUEL.start + beklenenDusus * 3,
    `beklenen ${DUEL.start + beklenenDusus * 3}, gerçek ${def.duelRating}`);
  check('savunanın mağlubiyet sayacı 3', def.duelLosses === 3, `${def.duelLosses}`);
}

console.log('\n[6] ⭐ Puan TABANI — eksiye inmiyor');
{
  await prisma.player.update({ where: { wallet: w(3) }, data: { duelRating: 105 } });
  for (let i = 0; i < 12; i++) await settleDuel(w(3), w(0), 1, 1, 999, 2000);
  const p = await get(3);
  check('puan 100 tabanının altına inmiyor', p.duelRating >= 100, `${p.duelRating}`);
}

console.log('\n[7] ⭐ TOZ günlük tavanı — sınırsız oynanabilen mod, sınırlı musluk');
{
  await prisma.player.update({
    where: { wallet: w(0) },
    data: { dust: 0, duelDay: '', duelRewarded: 0, duelRating: DUEL.start },
  });
  let toz = 0;
  for (let i = 0; i < 10; i++) {
    toz += (await settleDuel(w(0), w(2), 1, 90, 44, DUEL.start)).dust;
  }
  const p = await get(0);
  console.log(`     10 galibiyet → ${toz} toz (tavan ${DUEL.dailyRewarded} × ${DUEL.dustPerWin})`);
  check('toz TAVANDA duruyor', toz === DUEL.dailyRewarded * DUEL.dustPerWin, `${toz}`);
  check('cüzdandaki toz da tavanlı', p.dust === toz, `${p.dust}`);
  check('sayaç bugüne yazıldı', p.duelDay === utcDay(new Date()), p.duelDay);
  // ⚠️ Tavan dolduktan sonra da düello OYNANABİLİR ve PUAN verir — sadece toz yok
  check('tavan sonrası puan hâlâ hareket ediyor', p.duelRating !== DUEL.start, `${p.duelRating}`);

  // Gün değişince sıfırlanmalı (tembel sıfırlama — cron yok)
  await prisma.player.update({ where: { wallet: w(0) }, data: { duelDay: '2000-01-01' } });
  const yeniGun = await settleDuel(w(0), w(2), 1, 90, 44, DUEL.start);
  check('gün değişince toz yeniden akıyor', yeniGun.dust === DUEL.dustPerWin, `${yeniGun.dust}`);
}

console.log('\n[8] ⭐ Eşzamanlı toz — tavan deliniyor mu');
{
  await prisma.player.update({
    where: { wallet: w(3) },
    data: { dust: 0, duelDay: utcDay(new Date()), duelRewarded: 0, duelRating: DUEL.start },
  });
  await Promise.all(Array.from({ length: 8 }, () =>
    settleDuel(w(3), w(2), 1, 90, 44, DUEL.start).catch(() => null)));
  const p = await get(3);
  console.log(`     8 eşzamanlı galibiyet → ${p.dust} toz, sayaç ${p.duelRewarded}`);
  check('eşzamanlıda da tavan AŞILMADI', p.dust <= DUEL.dailyRewarded * DUEL.dustPerWin,
    `${p.dust}`);
  check('sayaç tavanı aşmadı', p.duelRewarded <= DUEL.dailyRewarded, `${p.duelRewarded}`);
}

console.log('\n[9] Tablo');
{
  const b = await board(w(0), CLEARED);
  check('kendi kaydım tabloda YOK', !b.rows.some((r) => r.wallet === w(0)));
  check('rakip kayıtları var', b.rows.length > 0, `${b.rows.length} satır`);
  check('kendi puanım bildiriliyor', typeof b.me.rating === 'number', `${b.me.rating}`);
  check('son maçlar listeleniyor', b.recent.length > 0, `${b.recent.length}`);
  // ⚠️ Soğuma sebebi TABLODA görünmeli — düğmeyi sessizce gizlemek "neden
  // yapamıyorum" sorusunu doğururdu
  const soguyan = b.rows.find((r) => r.blocker);
  check('soğumadaki rakip SEBEBİNİ gösteriyor', !!soguyan?.blocker, soguyan?.blocker ?? 'yok');

  const kilitli = await board(w(0), {});
  check('temizlenmemiş bölüm sebebi gösteriliyor',
    kilitli.rows.every((r) => !!r.blocker), kilitli.rows[0]?.blocker ?? '');
}

console.log('\n[10] ⭐ EŞLEŞME BULMA — puan YAKINLIĞINA göre');
{
  // ⚠️ Listeden seçmek yetmiyordu: tablo puana göre sıralı olduğu için
  // oyuncu doğal olarak EN ZAYIFI seçiyor ve ladder "en kolay hedefi bul"
  // oyununa dönüyordu. Eşleştirme dengini çıkarmalı.
  // ⚠️ TEST KENDİ BÖLÜMÜNE KAPALI (bölüm 5) ve bu bir zorunluluk:
  // `findMatch` veritabanındaki TÜM kayıtlara bakıyor, yani başka
  // testlerden/oyunculardan kalanlar da aday oluyor. İlk sürüm bölüm 1
  // kullanıyordu ve "uygun rakip kalmadı" kontrolü, ortamda duran alakasız
  // bir kayıt yüzünden düştü. Bir testin sonucu başkasının verisine bağlı
  // olmamalı — `cleared` yalnızca bu bölümü açarak havuzu kapatıyoruz.
  const YALNIZ = { '5': true };
  await prisma.duel.deleteMany({ where: { challenger: w(0) } });
  await prisma.player.update({ where: { wallet: w(0) }, data: { duelRating: 1000 } });
  // Üç rakip: çok zayıf, DENGİ, çok güçlü
  await prisma.player.update({ where: { wallet: w(1) }, data: { duelRating: 500 } });
  await prisma.player.update({ where: { wallet: w(2) }, data: { duelRating: 1010 } });
  await prisma.player.update({ where: { wallet: w(3) }, data: { duelRating: 1900 } });
  for (const [i, d] of [[1, 20], [2, 30], [3, 40]] as const) {
    await publishRecord(w(i), 'descent', 5, 1000 + i, d, 0, false);
  }

  const m = await findMatch(w(0), YALNIZ);
  console.log(`     puanım 1000 · adaylar 500 / 1010 / 1900 → seçilen ${m.duelRating}`);
  check('DENGİ seçildi (en zayıf DEĞİL)', m.duelRating === 1010, `${m.duelRating}`);
  check('seçilen engelsiz', m.blocker === null);
  check('kendi kaydım seçilmedi', m.wallet !== w(0));

  // ⚠️ Soğumadaki rakip eşleşmede de ELENMELİ — "bul" düğmesi doğrulamayı
  // atlayan bir arka kapı OLMAMALI.
  await settleDuel(w(0), m.wallet, 5, 99, m.depth, m.duelRating);
  const m2 = await findMatch(w(0), YALNIZ);
  check('soğumadaki rakip eşleşmede ELENİYOR', m2.wallet !== m.wallet,
    `${m2.duelRating}`);

  // Hiç uygun kalmayınca SEBEBİ söylemeli
  for (const i of [1, 2, 3]) {
    await settleDuel(w(0), w(i), 5, 1, 999, 1000).catch(() => null);
  }
  let sebep = '';
  try { await findMatch(w(0), YALNIZ); } catch (e) { sebep = (e as Error).message; }
  check('uygun rakip yoksa SEBEBİ söyleniyor', sebep.length > 10, sebep);

  // Temizlenmemiş bölüm de sebebiyle reddedilmeli
  await prisma.duel.deleteMany({ where: { challenger: w(0) } });
  let sebep2 = '';
  try { await findMatch(w(0), {}); } catch (e) { sebep2 = (e as Error).message; }
  check('temizlenmemiş bölüm sebebi ayrı', /Clear another stage/.test(sebep2), sebep2);
}

console.log('\n[11] Sıralama tablosu');
{
  const l = await ladder(w(0), 10);
  check('tablo dolu', l.rows.length > 0, `${l.rows.length} satır`);
  check('puana göre AZALAN sıralı',
    l.rows.every((r, i) => i === 0 || r.rating <= l.rows[i - 1].rating),
    l.rows.map((r) => r.rating).join(' ≥ '));
  check('sıra numaraları 1\'den başlıyor', l.rows[0].rank === 1);

  // ⚠️ HİÇ OYNAMAMIŞLAR DIŞARIDA: herkes 1000'le başlıyor, filtre olmasa
  // tablo hiç dövüşmemiş yüzlerce 1000'likle dolardı.
  const bos = `${P}_bos`;
  await prisma.player.create({ data: { wallet: bos, duelRating: 5000 } });
  const l2 = await ladder(w(0), 10);
  check('hiç düello oynamamış tabloda YOK', !l2.rows.some((r) => r.wallet === bos));
  check('5000 puanlı hayalet tepeye çıkmadı', l2.rows[0].rating !== 5000);
  await prisma.player.delete({ where: { wallet: bos } });

  // ⚠️ Tablo dışındaysam sıram YİNE görünmeli
  await prisma.player.update({ where: { wallet: w(0) }, data: { duelRating: 120, duelWins: 1 } });
  const l3 = await ladder(w(0), 2);
  check('tablo dışındayken sıram bildiriliyor', !!l3.me, `sıra ${l3.me?.rank}`);
  check('sıram listenin uzunluğundan büyük', (l3.me?.rank ?? 0) > l3.rows.length,
    `${l3.me?.rank} > ${l3.rows.length}`);

  // Hiç oynamamış oyuncunun "me" satırı olmamalı
  const yeni = `${P}_yeni`;
  await prisma.player.create({ data: { wallet: yeni } });
  check('hiç oynamamışın kendi sırası da YOK', (await ladder(yeni, 5)).me === null);
  await prisma.player.delete({ where: { wallet: yeni } });
}

await prisma.duel.deleteMany({ where: { challenger: { startsWith: P } } });
await prisma.duel.deleteMany({ where: { defender: { startsWith: P } } });
await prisma.duelRecord.deleteMany({ where: { wallet: { startsWith: P } } });
await prisma.player.deleteMany({ where: { wallet: { startsWith: P } } });

console.log(`\n${FAIL.length === 0 ? '✅ DÜELLO SUNUCUSU SAĞLAM' : `❌ ${FAIL.length} BAŞARISIZ: ${FAIL.join(', ')}`}\n`);
process.exit(FAIL.length === 0 ? 0 : 1);
