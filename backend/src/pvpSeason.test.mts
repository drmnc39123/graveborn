// PvP SEZONU — sunucu testi.
//
// Buradaki riskler bir ladder'ı sessizce öldüren türden:
//   1. YERLEŞİM — tek şanslı maçını kazanan, 40 maç oynamışın üstünde
//      görünürse tablo anlamını yitirir
//   2. ÇİFT ÖDEME — kapanış tembel ve tekrarlanabilir; iki kez ödemesi
//      toz musluğunu delerdi
//   3. YANLIŞ SIFIRLAMA — o hafta oynamamış oyuncuyu sıfırlamak, geçmiş
//      sezonun sonucunu siler
//
// Çalıştır:  npx tsx src/pvpSeason.test.mts

import {
  PVP_BASE, PVP_PAYOUT_DEPTH, PVP_PLACEMENT, pvpReward, pvpSeasonDustCost, softReset,
} from '@game/pvpSeason';
import { seasonWeek } from '@game/season';
import { prisma } from './db.js';
import { pvpAwards, pvpBoard, settlePvpSeasons } from './pvpSeason.js';

const FAIL: string[] = [];
const check = (n: string, ok: boolean, d = '') => {
  console.log(`${ok ? '  ✓' : '  ✗'} ${n}${d ? ` — ${d}` : ''}`);
  if (!ok) FAIL.push(n);
};

const P = `TEST_PVPS_${Date.now()}`;
const w = (n: number) => `${P}_${n}`;
const get = (n: number) => prisma.player.findUniqueOrThrow({ where: { wallet: w(n) } });
const BU = seasonWeek(new Date());
const GECEN = BU - 1;

console.log('\n═══ PvP SEZONU ═══');

console.log('\n[1] Ödül eğrisi ve yumuşak sıfırlama');
{
  check('1. sıra ödül alıyor', !!pvpReward(1));
  check('son sıra ödül alıyor', !!pvpReward(PVP_PAYOUT_DEPTH));
  check('tablo dışı ödül ALMIYOR', pvpReward(PVP_PAYOUT_DEPTH + 1) === null);
  check('0. sıra yok', pvpReward(0) === null);

  // ⚠️ EĞRİ DİK OLMAMALI: ulaşılamaz bir zirve ödülü 8. sıradakini
  // "zaten kazanamam" diye bırakmaya iter.
  const bir = pvpReward(1)!.dust, on = pvpReward(PVP_PAYOUT_DEPTH)!.dust;
  console.log(`     1. sıra ${bir} toz · ${PVP_PAYOUT_DEPTH}. sıra ${on} toz · toplam ${pvpSeasonDustCost()}`);
  check('1. ile son arası 6 kattan az', bir / on < 6, `${(bir / on).toFixed(1)}×`);
  check('ödüller azalan sırada',
    Array.from({ length: PVP_PAYOUT_DEPTH - 1 }, (_, i) =>
      pvpReward(i + 1)!.dust >= pvpReward(i + 2)!.dust).every(Boolean));
  // ⚠️ SEZON GOLD ÖDEMİYOR — altıncı kez aynı kural
  check('ödülde gold alanı YOK', !Object.keys(pvpReward(1)!).includes('gold'),
    Object.keys(pvpReward(1)!).join(', '));

  // ── YUMUŞAK SIFIRLAMA ──
  console.log(`     1800 → ${softReset(1800)} · 1000 → ${softReset(1000)} · 400 → ${softReset(400)}`);
  check('taban puan sabit kalıyor', softReset(PVP_BASE) === PVP_BASE);
  check('yüksek puan DÜŞÜYOR ama tabana inmiyor',
    softReset(1800) < 1800 && softReset(1800) > PVP_BASE, `${softReset(1800)}`);
  check('düşük puan YÜKSELİYOR', softReset(400) > 400, `${softReset(400)}`);
  // ⚠️ Sert sıfırlama kimliği siler, sıfırlamamak tabloyu dondurur
  check('sıfırlama ne sert ne etkisiz',
    softReset(1800) > 1200 && softReset(1800) < 1700, `${softReset(1800)}`);
}

console.log('\n[2] ⭐ YERLEŞİM ŞARTI');
{
  await prisma.player.createMany({
    data: [
      // yerleşmiş, güçlü
      { wallet: w(0), duelRating: 1500, duelWins: 12, duelLosses: 3, duelMatches: 15, duelWeek: BU },
      { wallet: w(1), duelRating: 1300, duelWins: 8, duelLosses: 4, duelMatches: 12, duelWeek: BU },
      // ⚠️ TEK MAÇINI KAZANMIŞ: yüksek puan ama yerleşmemiş
      { wallet: w(2), duelRating: 1900, duelWins: 1, duelLosses: 0, duelMatches: 1, duelWeek: BU },
      // geçen sezondan kalma
      { wallet: w(3), duelRating: 1700, duelWins: 20, duelLosses: 2, duelMatches: 22, duelWeek: GECEN },
    ],
  });

  const b = await pvpBoard(w(2));
  const isimler = b.rows.map((r) => r.wallet.slice(-1));
  console.log(`     tablo: ${isimler.join(', ')} (yerleşim ${PVP_PLACEMENT} maç)`);
  check('yerleşmemiş 1900\'lük tabloda YOK', !b.rows.some((r) => r.wallet === w(2)));
  check('yerleşmiş oyuncular tabloda', b.rows.some((r) => r.wallet === w(0)));
  // ⚠️ GEÇEN SEZONUN PUANI BU TABLODA GÖRÜNMEZ
  check('geçen sezondan kalan tabloda YOK', !b.rows.some((r) => r.wallet === w(3)));
  check('sıralama puana göre', b.rows[0]?.wallet === w(0), b.rows[0]?.wallet.slice(-1));

  // Yerleşmemiş oyuncuya SIRA verilmemeli ama durumu görünmeli
  check('yerleşmemişin sırası 0 (yani yok)', b.me?.rank === 0, `${b.me?.rank}`);
  check('kaç maç oynadığı görünüyor', b.me?.matches === 1, `${b.me?.matches}`);
  check('yerleşim eşiği bildiriliyor', b.placement === PVP_PLACEMENT);
}

console.log('\n[3] ⭐ Sezon kapanışı — ödül BİR KEZ');
{
  // Geçen haftaya ait, yerleşmiş üç oyuncu
  await prisma.player.updateMany({
    where: { wallet: { in: [w(0), w(1)] } },
    data: { duelWeek: GECEN },
  });
  await prisma.player.update({ where: { wallet: w(2) }, data: { duelWeek: GECEN, duelMatches: 9 } });

  const oncekiToz = (await get(0)).dust;
  const r1 = await settlePvpSeasons();
  const kapanan = r1.find((x) => x.week === GECEN);
  check('geçen sezon kapandı', !!kapanan, `${kapanan?.winners} kazanan`);

  const a0 = await get(0);
  check('kazanan toz aldı', a0.dust > oncekiToz, `${oncekiToz} → ${a0.dust}`);
  const odul = await pvpAwards(w(0));
  check('ödül kaydı yazıldı', odul.length > 0, `sıra ${odul[0]?.rank}`);
  // 1900 puanlı w(2) artık yerleşmiş (9 maç) → birinci olmalı
  check('en yüksek puanlı 1. oldu', (await pvpAwards(w(2)))[0]?.rank === 1);
  // ⚠️ ZİRVE UNVANI SATIN ALINAMAZ — birinciye veriliyor
  const kazanan = await get(2);
  check('1. sıra unvanı aldı',
    ((kazanan.cosmetics as string[]) ?? []).includes('t_undying'),
    JSON.stringify(kazanan.cosmetics));

  // ⭐ TEKRAR ÇALIŞTIRMA — ödül İKİNCİ KEZ verilmemeli
  const tozSonra = a0.dust;
  const r2 = await settlePvpSeasons();
  check('ikinci kapanış aynı haftayı TEKRAR kapatmıyor',
    !r2.some((x) => x.week === GECEN), `${r2.length} hafta`);
  check('toz İKİNCİ KEZ verilmedi', (await get(0)).dust === tozSonra, `${(await get(0)).dust}`);
  check('ödül kaydı tek', (await pvpAwards(w(0))).filter((a) => a.week === GECEN).length === 1);
}

console.log('\n[4] ⭐ Yumuşak sıfırlama DOĞRU kişilere uygulandı mı');
{
  const p0 = await get(0);
  check('puan yumuşak sıfırlandı', p0.duelRating < 1500 && p0.duelRating > PVP_BASE,
    `1500 → ${p0.duelRating}`);
  // ⚠️ ZİRVE KORUNUYOR: sıfırlama kimliği silmemeli
  check('ömür boyu zirve korundu', p0.duelPeak >= 1500, `${p0.duelPeak}`);
  check('maç sayacı sıfırlandı', p0.duelMatches === 0, `${p0.duelMatches}`);
  check('hafta işareti temizlendi', p0.duelWeek === 0, `${p0.duelWeek}`);

  // ⚠️ O HAFTA OYNAMAMIŞ OYUNCU DOKUNULMAMALI
  await prisma.player.create({
    data: { wallet: w(9), duelRating: 1600, duelMatches: 0, duelWeek: 0, duelPeak: 1600 },
  });
  await settlePvpSeasons();
  const p9 = await get(9);
  check('o hafta oynamamışın puanı DEĞİŞMEDİ', p9.duelRating === 1600, `${p9.duelRating}`);
}

console.log('\n[5] Yeni sezon temiz başlıyor');
{
  const b = await pvpBoard(w(0));
  check('bu haftanın tablosu boş', b.rows.length === 0, `${b.rows.length} satır`);
  check('hafta numarası bildiriliyor', b.week === BU, `${b.week}`);
  // Geçmiş ödüller GÖRÜNMEYE devam etmeli — "geçen hafta 3. oldun"
  check('geçmiş ödüller duruyor', (await pvpAwards(w(0))).length > 0);
}

await prisma.pvpAward.deleteMany({ where: { wallet: { startsWith: P } } });
await prisma.pvpClose.deleteMany({ where: { week: GECEN } });
await prisma.player.deleteMany({ where: { wallet: { startsWith: P } } });

console.log(`\n${FAIL.length === 0 ? '✅ PvP SEZONU SAĞLAM' : `❌ ${FAIL.length} BAŞARISIZ: ${FAIL.join(', ')}`}\n`);
process.exit(FAIL.length === 0 ? 0 : 1);
