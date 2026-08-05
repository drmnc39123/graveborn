// HAFTALIK SEZON TESTİ.
//
// Buradaki asıl risk "yanlış sıra" değil, ÖDÜLÜN İKİ KEZ VERİLMESİ. Sezon
// kapanışı arka plan işi değil, istek üzerine tetikleniyor — yani aynı anda
// on istek aynı haftayı kapatmaya kalkabilir. Test bunu gerçekten paralel
// çağırarak ölçüyor, "muhtemelen çalışır" demiyor.
//
// İkinci risk: hafta dönüşünün SESSİZ kayması. `seasonWeek` ile `bossWeek`
// aynı fonksiyon olmalı; ayrışırlarsa oyuncu "boss haftası bitti, sezon
// bitmedi" gibi açıklanamayan bir durum görür.
//
// Çalıştır:  npx tsx src/season.test.mts

import { challengeRating } from '@game/config';
import { SEASON_PAYOUT_DEPTH, rewardForRank, seasonWeek } from '@game/season';
import { bossWeek } from '@game/worldBoss';
import { prisma } from './db.js';
import { awardsOf, recordSeason, seasonRankOf, settleSeasons, topSeason } from './season.js';

const FAIL: string[] = [];
const check = (n: string, ok: boolean, d = '') => {
  console.log(`${ok ? '  ✓' : '  ✗'} ${n}${d ? ` — ${d}` : ''}`);
  if (!ok) FAIL.push(n);
};

/**
 * ⚠️ VERİTABANINDAN OKUNAN FLOAT'I `===` İLE KARŞILAŞTIRMA.
 *
 * Ölçüldü: 140.48063999999997 yazılıyor, 140.48064 okunuyor. Sebep Postgres'in
 * `double precision` değerleri metin olarak 15 anlamlı basamakla yayınlaması
 * (`extra_float_digits`) — 17 basamak gerekiyordu. Kayıp ~1e-14 bağıl, yani
 * sıralama için tamamen zararsız (hiçbir sırayı çeviremez) ama tam eşitlik
 * testini sessizce kırar. Ayarı değiştirmeye DEĞMEZ; testin bilmesi yeter.
 */
const yaklasik = (a: number, b: number) => Math.abs(a - b) <= Math.abs(b) * 1e-9;

const P = `TEST_SZN_${Date.now()}`;
const w = (n: number) => `${P}_${n}`;
const get = (n: number) => prisma.player.findUniqueOrThrow({ where: { wallet: w(n) } });

const NOW = new Date();
const WEEK = seasonWeek(NOW);
// Kapanış testleri GEÇMİŞ bir hafta üzerinde yürüyor: gerçek haftayı
// kapatmak, aynı veritabanını kullanan diğer testlerin verisini etkilerdi.
const ESKI = WEEK - 500;

const IDS = [0, 1, 2, 3, 4];
await prisma.player.createMany({ data: IDS.map((n) => ({ wallet: w(n), gold: 0 })) });

// ── 1) Hafta tanımı ──
console.log('\n[1] Hafta tanımı');
{
  check('sezon haftası = boss haftası (TEK tanım)', seasonWeek(NOW) === bossWeek(NOW),
    `${seasonWeek(NOW)} = ${bossWeek(NOW)}`);
  // Pazartesi 00:00 UTC sınırında değişmeli
  const pzt = new Date(Date.UTC(2026, 7, 3, 0, 0, 0));       // 3 Ağustos 2026 Pazartesi
  const oncesi = new Date(pzt.getTime() - 1000);
  check('hafta Pazartesi 00:00 UTC\'de dönüyor', seasonWeek(pzt) === seasonWeek(oncesi) + 1,
    `${seasonWeek(oncesi)} → ${seasonWeek(pzt)}`);
}

// ── 2) Ödül tablosu ──
console.log('\n[2] Ödül tablosu');
{
  check('1. sıra ödül alıyor', rewardForRank(1)?.cosmetic === 't_deepest');
  check('10. sıra hâlâ ödül alıyor', rewardForRank(10) !== null);
  check('11. sıra ödül ALMIYOR', rewardForRank(11) === null);
  check('0 ve negatif sıra ödül almıyor', rewardForRank(0) === null && rewardForRank(-1) === null);
  check('ödeme derinliği tablodan türüyor', SEASON_PAYOUT_DEPTH === 10, `${SEASON_PAYOUT_DEPTH}`);
  // ⚠️ GOLD ÖDÜLÜ YOK — bu kural kod tarafından da korunmalı, yorumda kalmamalı
  const goldVar = Object.keys(rewardForRank(1)!).includes('gold');
  check('ödül tablosunda GOLD alanı yok', !goldVar);
  // Sıra kötüleştikçe ödül artmamalı
  let azalan = true;
  for (let r = 1; r < 10; r++) {
    const a = rewardForRank(r)!, b = rewardForRank(r + 1)!;
    if (b.dust > a.dust) { azalan = false; break; }
  }
  check('alt sıralar üst sıralardan çok toz almıyor', azalan);
}

// ── 3) Puan yazımı ──
console.log('\n[3] Puan yazımı');
{
  await recordSeason(w(0), 'descent', 3, 20, 0, NOW);
  check('sezon puanı yazıldı', (await get(0)).seasonRating > 0);

  // Daha kötü koşu AYNI hafta içinde rekoru düşürmemeli
  const once = (await get(0)).seasonRating;
  await recordSeason(w(0), 'descent', 1, 2, 0, NOW);
  check('aynı hafta içinde KÖTÜ koşu puanı düşürmüyor', (await get(0)).seasonRating === once,
    `${once}`);

  // Kampanya koşusu sezona girmemeli
  await recordSeason(w(1), 'campaign', 5, 30, 0, NOW);
  check('kampanya koşusu sezon puanı yazmıyor', (await get(1)).seasonRating === 0);

  // ⭐ SEZON MANTIĞI: geçen haftaya ait puan, bu haftanın KÖTÜ koşusuyla EZİLİR.
  // Bu `best*` ile arasındaki tek gerçek fark; kaybolursa sezon "ikinci bir
  // tüm-zamanlar tablosu"na dönüşür ve varlık sebebi kalmaz.
  await prisma.player.update({
    where: { wallet: w(2) },
    data: { seasonWeek: WEEK - 1, seasonStage: 10, seasonDepth: 60, seasonRating: 9e12 },
  });
  await recordSeason(w(2), 'descent', 1, 3, 0, NOW);
  const p2 = await get(2);
  check('GEÇEN haftanın puanı bu haftanın koşusuyla sıfırlanıyor',
    p2.seasonWeek === WEEK && yaklasik(p2.seasonRating, challengeRating(1, 3)),
    `hafta ${p2.seasonWeek}, puan ${p2.seasonRating.toFixed(2)}`);
}

// ── 4) Tablo ve sıra ──
console.log('\n[4] Tablo');
{
  const board = await topSeason(100, NOW);
  const mine = board.rows.filter((r) => r.wallet.startsWith(P));
  check('bu haftanın oyuncuları tabloda', mine.length === 2, `${mine.length} satır`);
  check('tablo puana göre sıralı', mine[0].rating >= mine[1].rating);
  check('haftanın bitişi geleceği gösteriyor', board.endsAt > NOW.getTime());

  const r0 = await seasonRankOf(w(0), NOW);
  check('oyuncu kendi sırasını görüyor', r0 !== null && r0.rank >= 1, `#${r0?.rank}`);

  // Puanı olmayan oyuncu tabloda görünmemeli
  check('hiç inmemiş oyuncunun sırası YOK', (await seasonRankOf(w(1), NOW)) === null);

  // Banlı oyuncu düşmeli
  await prisma.player.update({ where: { wallet: w(0) }, data: { banned: true } });
  check('banlı oyuncu tablodan düşüyor',
    !(await topSeason(100, NOW)).rows.some((r) => r.wallet === w(0)));
  check('banlının kendi sırası da yok', (await seasonRankOf(w(0), NOW)) === null);
  await prisma.player.update({ where: { wallet: w(0) }, data: { banned: false } });
}

// ── 5) Kapanış ve ödül ──
console.log('\n[5] Kapanış');
{
  // ESKI haftaya üç oyuncu koy — 1., 2. ve 3. sıra ödülleri ayrışsın
  await prisma.player.update({ where: { wallet: w(3) }, data: { seasonWeek: ESKI, seasonRating: 500, seasonStage: 5, seasonDepth: 20 } });
  await prisma.player.update({ where: { wallet: w(4) }, data: { seasonWeek: ESKI, seasonRating: 300, seasonStage: 4, seasonDepth: 15 } });

  const tozOnce3 = (await get(3)).dust;

  // ⭐ ASIL TEST: beş eşzamanlı kapanış çağrısı. Kilit doğru kurulmadıysa
  // ödül birden çok kez verilir ve toz kaçağı ekonomiye sızar.
  await Promise.all([1, 2, 3, 4, 5].map(() => settleSeasons(NOW).catch(() => [])));

  const close = await prisma.seasonClose.findUnique({ where: { week: ESKI } });
  check('kapanmış hafta defterde', close !== null, `${close?.winners} kazanan`);

  const awards = await prisma.seasonAward.findMany({ where: { week: ESKI, wallet: { startsWith: P } } });
  check('her kazanan TEK ödül aldı (5 eşzamanlı çağrıya rağmen)', awards.length === 2,
    `${awards.length} ödül satırı`);

  const p3 = await get(3);
  const odul1 = rewardForRank(1)!;
  check('birinci doğru tozu aldı', p3.dust === tozOnce3 + odul1.dust,
    `${tozOnce3} → ${p3.dust} (+${odul1.dust})`);
  const kozmetik = Array.isArray(p3.cosmetics) ? (p3.cosmetics as string[]) : [];
  check('birinci kozmetiği aldı', kozmetik.includes(odul1.cosmetic!), kozmetik.join(','));

  const a3 = awards.find((a) => a.wallet === w(3))!;
  const a4 = awards.find((a) => a.wallet === w(4))!;
  check('sıralar doğru dağıldı', a3.rank === 1 && a4.rank === 2, `${a3.rank}, ${a4.rank}`);
  check('ikinci farklı kozmetik aldı', a4.cosmetic === rewardForRank(2)!.cosmetic, `${a4.cosmetic}`);

  // Tekrar çağırmak hiçbir şey değiştirmemeli
  const tozSonra = (await get(3)).dust;
  await settleSeasons(NOW);
  check('kapanmış hafta tekrar ödüllendirilmiyor', (await get(3)).dust === tozSonra);

  // Oyuncu ödül geçmişini görebilmeli
  const gecmis = await awardsOf(w(3));
  check('oyuncu ödül geçmişini görüyor', gecmis.length === 1 && gecmis[0].rank === 1);

  // ⚠️ BU HAFTA KAPANMAMALI. Kapanırsa oyuncular hafta ortasında ödül alır
  // ve haftanın kalanı anlamsızlaşır.
  check('AÇIK hafta kapatılmadı', (await prisma.seasonClose.findUnique({ where: { week: WEEK } })) === null);
}

// ── temizlik ──
await prisma.seasonAward.deleteMany({ where: { wallet: { startsWith: P } } });
await prisma.seasonClose.deleteMany({ where: { week: ESKI } });
await prisma.player.deleteMany({ where: { wallet: { startsWith: P } } });

console.log(`\n${FAIL.length === 0 ? '✅ SEZON SAĞLAM' : `❌ ${FAIL.length} BAŞARISIZ: ${FAIL.join(', ')}`}\n`);
process.exit(FAIL.length === 0 ? 0 : 1);
