// HAFTALIK BOSS (THE BARROW) — hazine kapısı testi.
//
// 🔴 NİYE VAR — ölçüldü (2026-09-16): boss tarafında HİÇ test yoktu ve iki
// kapı eksikti:
//   1. `contribute` hazinenin (ultra hesap) hasarını da yazıyordu → test
//      hesabı ORTAK canı düşürüp haftanın boss'unu herkes için bitirebilirdi
//      ve hasar tablosuna girerdi.
//   2. `kapatBir` kazananları yalnız banlı/silinmiş diye eliyordu → hazine
//      haftanın kozmetiğini ve tozunu gerçek bir oyuncunun yerine alırdı.
// Descent (`season.ts`) ve The Pit (`pvpSeason.ts`) bu kapıları kapatmıştı.
//
// ⚠️ GEÇMİŞ BİR HAFTADA yürüyor: gerçek haftanın boss'una dokunmak, aynı
// veritabanını kullanan geliştirme oturumunun canını düşürürdü.
// ⚠️ Hazine adresi uyduruluyor; gerçek adres okunmuyor.
//
// Çalıştır:  npx tsx src/worldBoss.test.mts

import crypto from 'node:crypto';
import bs58 from 'bs58';
import { bossWeek, weekEndsAt } from '@game/worldBoss';
import { prisma, toProgress } from './db.js';
import { contribute, settleBarrow } from './worldBoss.js';

const FAIL: string[] = [];
const check = (n: string, ok: boolean, d = '') => {
  console.log(`${ok ? '  ✓' : '  ✗'} ${n}${d ? ` — ${d}` : ''}`);
  if (!ok) FAIL.push(n);
};

const HAZINE = bs58.encode(crypto.randomBytes(32));
const eskiHazine = process.env.TREASURY_ADDRESS;
process.env.TREASURY_ADDRESS = HAZINE;

const BU = bossWeek(new Date());
const ESKI = BU - 600;
// ESKI haftasının içinde bir an: bitişinden bir saat önce
const ESKI_AN = new Date(weekEndsAt(ESKI) - 3_600_000);
const normal = `TEST_BOSS_${Date.now()}_n`;
const cuzdanlar = [HAZINE, normal];

await prisma.player.createMany({ data: cuzdanlar.map((wallet) => ({ wallet, gold: 0 })) });

try {
  console.log('\n[1] Yazma kapısı — hazine hasarı ortak cana ve tabloya girmiyor');
  {
    const can = async () => (await prisma.worldBoss.findUniqueOrThrow({ where: { week: ESKI } })).hp;
    const hp = (await prisma.player.findUniqueOrThrow({ where: { wallet: HAZINE } }));
    const hz = await contribute(HAZINE, toProgress(hp), 400, 900, 1, ESKI_AN);
    const once = await can();
    check('hazinenin hasar satırı YOK',
      (await prisma.bossDamage.findUnique({ where: { week_wallet: { week: ESKI, wallet: HAZINE } } })) === null);
    const maxHp = (await prisma.worldBoss.findUniqueOrThrow({ where: { week: ESKI } })).maxHp;
    check('ortak can DÜŞMEDİ', once === maxHp, `${once} / ${maxHp}`);
    check('hazine yanıtı sıfır kabul ediyor (ekran yalan söylemesin)', hz.accepted === 0, `${hz.accepted}`);

    // KONTROL: aynı çağrı normal oyuncuda yazıyor — test gerçekten ölçüyor
    const np = await prisma.player.findUniqueOrThrow({ where: { wallet: normal } });
    const nr = await contribute(normal, toProgress(np), 400, 900, 1, ESKI_AN);
    const satir = await prisma.bossDamage.findUnique({ where: { week_wallet: { week: ESKI, wallet: normal } } });
    check('normal oyuncunun hasarı yazıldı (kontrol)', nr.accepted > 0 && satir?.damage === nr.accepted,
      `${nr.accepted} kabul`);
    check('ortak can normal oyuncuyla düştü (kontrol)', (await can()) === maxHp - nr.accepted);
  }

  console.log('\n[2] Ödül kapısı — kapıdan önce yazılmış hazine satırı ödül almıyor');
  {
    // Yazma kapısından ÖNCEki bir haftayı taklit et: hazine tabloda en üstte
    // ⚠️ upsert: kapı yokken [1] satırı zaten yaratmış olur — test kırmızıda da sonuna kadar koşsun
    await prisma.bossDamage.upsert({
      where: { week_wallet: { week: ESKI, wallet: HAZINE } },
      update: { damage: 1_000_000_000 },
      create: { id: crypto.randomUUID(), week: ESKI, wallet: HAZINE, damage: 1_000_000_000, runs: 1 },
    });
    await settleBarrow();
    const hz = await prisma.bossAward.findMany({ where: { wallet: HAZINE } });
    check('hazine haftanın ödülünü ALMADI', hz.length === 0, `${hz.length} ödül`);
    const n = await prisma.bossAward.findFirst({ where: { week: ESKI, wallet: normal } });
    check('birincilik gerçek oyuncuya gitti (kontrol)', n?.rank === 1, `sıra ${n?.rank}`);
    check('hafta kapandı', (await prisma.bossClose.findUnique({ where: { week: ESKI } })) !== null);
  }
} finally {
  await prisma.bossAward.deleteMany({ where: { wallet: { in: cuzdanlar } } });
  await prisma.bossClose.deleteMany({ where: { week: ESKI } });
  await prisma.bossDamage.deleteMany({ where: { week: ESKI } });
  await prisma.worldBoss.deleteMany({ where: { week: ESKI } });
  await prisma.player.deleteMany({ where: { wallet: { in: cuzdanlar } } });
  if (eskiHazine === undefined) delete process.env.TREASURY_ADDRESS; else process.env.TREASURY_ADDRESS = eskiHazine;
}

console.log(`\n${FAIL.length === 0 ? '✅ BOSS KAPILARI SAĞLAM' : `❌ ${FAIL.length} BAŞARISIZ: ${FAIL.join(', ')}`}\n`);
process.exit(FAIL.length === 0 ? 0 : 1);
