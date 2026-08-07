// ARENA MAÇ ODASI — sunucu testi.
//
// Protokol determinizmi `frontend/src/game/arena.test.mts`'te ölçülüyor.
// Burada sunucuya özgü üç risk var:
//   1. EŞLEŞME — sıradaki ilk kişiyi almak 900'ü 1900'le eşleştirir ve maç
//      daha başlamadan biter
//   2. ODA KURULUMU — iki oyuncu doğru koltuklara ve doğru bonuslarla
//      oturmalı; karışırsa kimse fark etmez, sadece maç haksız olur
//   3. PUAN YAZIMI — aynı oyuncunun iki maçı aynı anda bitebilir
//
// Çalıştır:  npx tsx src/arena.test.mts

import { ARENA, ratingWindow } from '@game/arena';
import { nextRatings } from '@game/duel';
import { prisma } from './db.js';
import { debugAge, debugReset, debugRoom, joinQueue, leaveQueue, settleArena, arenaStats } from './arena.js';

const FAIL: string[] = [];
const check = (n: string, ok: boolean, d = '') => {
  console.log(`${ok ? '  ✓' : '  ✗'} ${n}${d ? ` — ${d}` : ''}`);
  if (!ok) FAIL.push(n);
};

const P = `TEST_ARENA_${Date.now()}`;
const w = (n: number) => `${P}_${n}`;
const get = (n: number) => prisma.player.findUniqueOrThrow({ where: { wallet: w(n) } });

await prisma.player.createMany({
  data: [
    { wallet: w(0), duelRating: 1000, hero: 'knight' },
    { wallet: w(1), duelRating: 1900, hero: 'ranger' },
    { wallet: w(2), duelRating: 1010, hero: 'priestess' },
    { wallet: w(3), duelRating: 1000, hero: 'knight', banned: true },
  ],
});
debugReset();

console.log('\n═══ ARENA MAÇ ODASI ═══');

console.log('\n[1] Kuyruk — ilk giren bekliyor');
{
  const r = await joinQueue(w(0), 'knight');
  check('ilk oyuncu kuyrukta', r.state === 'waiting', r.state);
  check('bekleme süresi bildiriliyor', typeof r.waited === 'number', `${r.waited}s`);

  // ⚠️ Aynı oyuncu tekrar girince İKİNCİ kayıt açılmamalı — kendiyle
  // eşleşebilir ya da kuyruğu şişirirdi.
  const tekrar = await joinQueue(w(0), 'knight');
  check('aynı oyuncu ikinci kez sıraya girmiyor', tekrar.state === 'waiting');
  check('kuyrukta tek kayıt', arenaStats().queued === 1, `${arenaStats().queued}`);
}

console.log('\n[2] ⭐ Eşleşme EN YAKIN PUANA göre');
{
  // ⚠️ Sıradaki ilk kişiyi almak 1000'i 1900'le eşleştirirdi ve maç daha
  // başlamadan biterdi. 1900 önce kuyruğa giriyor ki "ilk gelen" değil
  // "en yakın" seçildiği görünsün.
  await joinQueue(w(1), 'ranger');       // 1900 — uzak
  const r = await joinQueue(w(2), 'priestess'); // 1010 — 1000'e YAKIN
  check('eşleşme oldu', r.state === 'matched', r.state);
  const rakip = r.setup!.players.find((p) => p.wallet !== w(2));
  check('EN YAKIN puanlı seçildi (ilk gelen değil)', rakip?.wallet === w(0),
    `${rakip?.wallet.slice(-1)} · ${rakip?.duelRating}`);
  check('uzak puanlı kuyrukta KALDI', arenaStats().queued >= 1);

  // Bekleyen taraf yoklamada kendi kurulumunu almalı
  const bekleyen = await joinQueue(w(0), 'knight');
  check('bekleyen yoklamada eşleşmeyi alıyor', bekleyen.state === 'matched');
  check('iki taraf AYNI maçta',
    bekleyen.setup!.matchId === r.setup!.matchId, r.setup!.matchId.slice(0, 8));
  // ⚠️ TARAFLAR FARKLI olmalı; ikisi de 0 olsaydı ikisi de kendini `hero`
  // sanardı ve girdiler karışırdı.
  check('taraflar farklı', bekleyen.setup!.side !== r.setup!.side,
    `${bekleyen.setup!.side} vs ${r.setup!.side}`);
  check('eşleşen kuyruktan düştü', !(await joinQueue(w(0), 'knight')).setup);
  leaveQueue(w(0));

  // ── ODA ──
  const oda = debugRoom(r.setup!.matchId);
  check('oda açıldı', !!oda);
  check('koltuklar doğru oyuncularda',
    oda!.seats[0] === r.setup!.players[0].wallet && oda!.seats[1] === r.setup!.players[1].wallet,
    oda!.seats.join(' / '));
  check('sunucu kendi simülasyonunu kurdu', !!oda!.game.rival);
  // ⚠️ Seed SUNUCUDAN — istemci seçemez
  check('seed üretildi', r.setup!.seed > 0 && Number.isInteger(r.setup!.seed), `${r.setup!.seed}`);
  check('görüş alanı mühürlü',
    (oda!.game as unknown as { viewW: number }).viewW === ARENA.viewW);
  // Kahramanlar kayıttan geldi
  check('kahramanlar kayıttan', oda!.game.hero.heroId === r.setup!.players[0].heroId
    && oda!.game.rival!.heroId === r.setup!.players[1].heroId,
    `${oda!.game.hero.heroId} vs ${oda!.game.rival!.heroId}`);
}

console.log('\n[2b] ⭐ PUAN PENCERESİ — dar başlıyor, bekledikçe açılıyor');
{
  // ⚠️ BU TEST BİR TASARIM AÇIĞI YAKALADI. İlk sürüm "kuyruktaki en yakını
  // seç" diyordu; ama kuyrukta tek kişi varsa o zaten en yakındır. Ölçüldü:
  // 1000 puanlı oyuncu, sırada duran 1900'lükle ANINDA eşleşiyordu ve maç
  // daha başlamadan bitiyordu — yakınlık mantığı pratikte hiç çalışmıyordu.
  const w0 = ratingWindow(0);
  const w30 = ratingWindow(30);
  const wSon = ratingWindow(ARENA.queueTimeoutSec);
  console.log(`     0 sn → ±${w0} · 30 sn → ±${w30} · ${ARENA.queueTimeoutSec} sn → ±${wSon}`);
  check('başlangıçta DAR', w0 === ARENA.window0, `±${w0}`);
  check('bekledikçe genişliyor', w30 > w0 && wSon > w30);
  // ⚠️ Pencere sabit kalsaydı yüksek puanlı oyuncu SONSUZA KADAR beklerdi.
  // Adil olmak, kimseyi oyunsuz bırakmak demek değil.
  check('zaman aşımında neredeyse herkesi kabul ediyor', wSon >= 900, `±${wSon}`);
  check('negatif süre patlatmıyor', ratingWindow(-5) === ARENA.window0);

  // 900 puanlık fark dar pencerede eşleşmemeli
  debugReset();
  await joinQueue(w(1), 'ranger');                 // 1900
  const dar = await joinQueue(w(0), 'knight');     // 1000 — fark 900
  check('900 puanlık fark DAR pencerede eşleşmiyor', dar.state === 'waiting', dar.state);
  check('ikisi de kuyrukta', arenaStats().queued === 2, `${arenaStats().queued}`);

  // ⚠️ İKİ TARAFIN DAHA UZUN BEKLEYENİ geçerli. Yeni gelen kendi dar
  // penceresiyle karar verseydi, saatlerdir bekleyeni reddederdi ve ikisi
  // de sonsuza kadar beklerdi.
  debugReset();
  await joinQueue(w(1), 'ranger');
  debugAge(w(1), Date.now() - (ARENA.queueTimeoutSec - 5) * 1000);
  const gec = await joinQueue(w(0), 'knight');
  check('UZUN bekleyen, uzak rakiple eşleşebiliyor', gec.state === 'matched', gec.state);
  debugReset();
}

console.log('\n[3] Banlı oyuncu kuyruğa giremiyor');
{
  let girdi = true;
  try { await joinQueue(w(3), 'knight'); } catch { girdi = false; }
  check('banlı REDDEDİLİYOR', !girdi);
}

console.log('\n[4] ⭐ Puan yazımı');
{
  debugReset();
  await prisma.player.updateMany({
    where: { wallet: { in: [w(0), w(2)] } },
    data: { duelRating: 1000, duelWins: 0, duelLosses: 0 },
  });
  const seat = (wallet: string, rating: number) =>
    ({ wallet, ws: null, ix: 0, iy: 0, rating }) as Parameters<typeof settleArena>[0];

  const beklenen = nextRatings(1000, 1000, true);
  const delta = await settleArena(seat(w(0), 1000), seat(w(2), 1000), 0, 60 * 90);
  const a = await get(0), b = await get(2);
  check('kazanan puan aldı', a.duelRating === beklenen.challenger,
    `${a.duelRating} (+${delta})`);
  check('kaybeden puan kaybetti', b.duelRating === beklenen.defender, `${b.duelRating}`);
  check('galibiyet/mağlubiyet sayaçları', a.duelWins === 1 && b.duelLosses === 1);

  // ⚠️ Maç kaydı geçmişte görünmeli, süresiyle
  const kayit = await prisma.duel.findFirst({
    where: { challenger: w(0) }, orderBy: { createdAt: 'desc' },
  });
  check('maç kaydı yazıldı', !!kayit);
  check('arena maçı bölüm 0 ile işaretli', kayit?.stageId === 0, `${kayit?.stageId}`);
  check('süre saniye olarak kaydedildi', kayit?.depth === 90, `${kayit?.depth}s`);
  // ⚠️ Arena TOZ ÖDEMİYOR — asenkron düellodaki günlük tavan burada da
  // delinmemeli, en temizi hiç ödememek.
  check('arena TOZ ödemiyor', kayit?.dust === 0);
}

console.log('\n[5] ⭐ Eşzamanlı bitiş — puan yazımı birbirini eziyor mu');
{
  await prisma.player.updateMany({
    where: { wallet: { in: [w(0), w(2)] } },
    data: { duelRating: 1000, duelWins: 0, duelLosses: 0 },
  });
  const seat = (wallet: string, rating: number) =>
    ({ wallet, ws: null, ix: 0, iy: 0, rating }) as Parameters<typeof settleArena>[0];
  const tek = nextRatings(1000, 1000, true).challenger - 1000;

  // Aynı oyuncunun üç maçı aynı anda bitiyor
  await Promise.all([0, 1, 2].map(() =>
    settleArena(seat(w(0), 1000), seat(w(2), 1000), 0, 600).catch(() => null)));
  const a = await get(0);
  console.log(`     3 eşzamanlı bitiş → 1000 → ${a.duelRating} (tek maç +${tek})`);
  check('üç kazanç da sayıldı', a.duelRating === 1000 + tek * 3,
    `beklenen ${1000 + tek * 3}`);
  check('galibiyet sayacı 3', a.duelWins === 3, `${a.duelWins}`);
}

console.log('\n[6] Puan tabanı');
{
  await prisma.player.update({ where: { wallet: w(2) }, data: { duelRating: 105 } });
  const seat = (wallet: string, rating: number) =>
    ({ wallet, ws: null, ix: 0, iy: 0, rating }) as Parameters<typeof settleArena>[0];
  for (let i = 0; i < 10; i++) await settleArena(seat(w(0), 2000), seat(w(2), 105), 0, 300);
  check('puan 100 tabanının altına inmiyor', (await get(2)).duelRating >= 100,
    `${(await get(2)).duelRating}`);
}

console.log('\n[7] Kuyruk temizliği');
{
  debugReset();
  check('sıfırlama sonrası kuyruk boş', arenaStats().queued === 0 && arenaStats().rooms === 0);
  await joinQueue(w(0), 'knight');
  leaveQueue(w(0));
  check('kuyruktan çıkılabiliyor', arenaStats().queued === 0);
  check('kuyruk zaman aşımı tanımlı', ARENA.queueTimeoutSec > 0, `${ARENA.queueTimeoutSec}s`);
  check('maç süresi tavanı tanımlı', ARENA.maxMatchSec > 0, `${ARENA.maxMatchSec}s`);
}

debugReset();
await prisma.duel.deleteMany({ where: { challenger: { startsWith: P } } });
await prisma.duel.deleteMany({ where: { defender: { startsWith: P } } });
await prisma.player.deleteMany({ where: { wallet: { startsWith: P } } });

console.log(`\n${FAIL.length === 0 ? '✅ ARENA ODASI SAĞLAM' : `❌ ${FAIL.length} BAŞARISIZ: ${FAIL.join(', ')}`}\n`);
process.exit(FAIL.length === 0 ? 0 : 1);
