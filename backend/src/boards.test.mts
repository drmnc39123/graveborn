// LEADERBOARDS — kamu süzgeci ve adlar.
//
// 🔴 NİYE VAR: panolar "kim görünebilir" sorusunu ayrı ayrı cevaplıyordu
// ve `/daily` hiç cevaplamıyordu — banlı oyuncu ile hazine listeleniyordu.
// Bu test hazineyi ve banlı oyuncuyu HER panonun TEPESİNE koyuyor; süzgeç
// silinirse 1. sırada görünürler (hata enjeksiyonuyla kanıtlandı).
//
// ⚠️ HAZİNE ADRESİ BU SÜREÇTE UYDURULUYOR: gerçek adres ne okunuyor ne
// yazdırılıyor. `hazineAdresi()` env'i çağrı anında okuyor, o yüzden
// içe aktarmadan SONRA atamak yetiyor (dotenv var olanı ezmez).
//
// Çalıştır:  npx tsx src/boards.test.mts

import crypto from 'node:crypto';
import bs58 from 'bs58';
import { PVP_PLACEMENT } from '@game/pvpSeason';
import { seasonWeek } from '@game/season';
import { gunBaslangici } from '@game/daily';
import { gunlukTablo, herkeseAcikOyuncu } from './boards.js';
import { prisma } from './db.js';
import { ladder } from './duel.js';
import { pvpBoard } from './pvpSeason.js';

const FAIL: string[] = [];
const check = (n: string, ok: boolean, d = '') => {
  console.log(`${ok ? '  ✓' : '  ✗'} ${n}${d ? ` — ${d}` : ''}`);
  if (!ok) FAIL.push(n);
};

const P = `TEST_BRD_${Date.now()}`;
const HAZINE = bs58.encode(crypto.randomBytes(32));
const eskiHazine = process.env.TREASURY_ADDRESS;
process.env.TREASURY_ADDRESS = HAZINE;

const NOW = new Date();
const WEEK = seasonWeek(NOW);
// ⚠️ Adlar AYRI olmalı: ortak önekten kesilince üçü aynı çıkıyordu ve
// "ad geliyor" kontrolü KİMİN adının geldiğini ayırt edemiyordu.
const ek = Date.now().toString(36);
const AD_N = `bN${ek}`, AD_H = `bH${ek}`, AD_B = `bB${ek}`;
const normal = `${P}_normal`;
const banli = `${P}_banli`;

// Hazine ve banlı oyuncu HER tabloda en yüksek değerle — süzgeç yoksa tepede.
const ortak = { duelWeek: WEEK, duelMatches: PVP_PLACEMENT + 5, duelWins: 50, duelLosses: 1 };
await prisma.player.createMany({
  data: [
    { wallet: HAZINE, gold: 0, name: AD_H, duelRating: 9_000_001, ...ortak },
    { wallet: banli, gold: 0, name: AD_B, duelRating: 9_000_000, banned: true, ...ortak },
    { wallet: normal, gold: 0, name: AD_N, duelRating: 8_999_999, ...ortak },
  ],
});
const kosu = (wallet: string, depth: number) => ({
  id: crypto.randomUUID(), wallet, seed: 1n, mode: 'daily', stageId: 1, hero: 'warrior',
  startedAt: NOW, claimedAt: NOW, awardedDepth: depth,
});
await prisma.run.createMany({
  data: [kosu(HAZINE, 99_999), kosu(banli, 99_998), kosu(normal, 99_997)],
});

try {
  console.log('\n[1] Süzgecin kendisi');
  {
    const f = herkeseAcikOyuncu();
    check('hazine tanımlıyken hazine süzülüyor', f.wallet?.not === HAZINE);
    process.env.TREASURY_ADDRESS = '';
    const bos = herkeseAcikOyuncu();
    // ⚠️ `{ not: null }` Prisma'da çalışma anında patlıyor — anahtar hiç olmamalı
    check('hazine tanımsızken wallet koşulu HİÇ yok', !('wallet' in bos) && bos.banned === false);
    process.env.TREASURY_ADDRESS = HAZINE;
  }

  console.log('\n[2] GÜNLÜK İNİŞ');
  {
    const t = await gunlukTablo(gunBaslangici(NOW));
    check('tepede normal oyuncu', t[0]?.wallet === normal, `1. ${t[0]?.wallet?.slice(0, 24)}`);
    check('hazine YOK', !t.some((r) => r.wallet === HAZINE));
    check('banlı YOK', !t.some((r) => r.wallet === banli));
    check('ad geliyor', t[0]?.name === AD_N, `${t[0]?.name}`);
  }

  console.log('\n[3] THE PIT (haftalık)');
  {
    const b = await pvpBoard(null, NOW, 50);
    check('tepede normal oyuncu', b.rows[0]?.wallet === normal, `1. ${b.rows[0]?.wallet?.slice(0, 24)}`);
    check('hazine YOK', !b.rows.some((r) => r.wallet === HAZINE));
    check('banlı YOK', !b.rows.some((r) => r.wallet === banli));
    check('ad geliyor', b.rows[0]?.name === AD_N, `${b.rows[0]?.name}`);
    check('hazinenin kendi sırası da YOK', (await pvpBoard(HAZINE, NOW)).me === null);
    // Kontrol grubu: normal oyuncunun sırası var ve adı taşıyor
    const me = (await pvpBoard(normal, NOW)).me;
    check('normal oyuncunun sırası ve adı var (kontrol)', me?.rank === 1 && me?.name === AD_N);
  }

  console.log('\n[4] THE ANSWERING (tüm zamanlar)');
  {
    const l = await ladder(normal, 50);
    check('tepede normal oyuncu', l.rows[0]?.wallet === normal, `1. ${l.rows[0]?.wallet?.slice(0, 24)}`);
    check('hazine YOK', !l.rows.some((r) => r.wallet === HAZINE));
    check('hazinenin kendi sırası da YOK', (await ladder(HAZINE, 50)).me === null);
  }
} finally {
  await prisma.run.deleteMany({ where: { wallet: { in: [HAZINE, banli, normal] } } });
  await prisma.player.deleteMany({ where: { wallet: { in: [HAZINE, banli, normal] } } });
  if (eskiHazine === undefined) delete process.env.TREASURY_ADDRESS;
  else process.env.TREASURY_ADDRESS = eskiHazine;
}

console.log(`\n${FAIL.length === 0 ? '✅ PANOLAR SAĞLAM' : `❌ ${FAIL.length} BAŞARISIZ: ${FAIL.join(', ')}`}\n`);
process.exit(FAIL.length === 0 ? 0 : 1);
