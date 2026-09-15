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
import nacl from 'tweetnacl';
import { stageById } from '@game/config';
import { FORGE, costOf, forgeLevelsOf } from '@game/forge';
import { PVP_PLACEMENT } from '@game/pvpSeason';
import { seasonWeek } from '@game/season';
import { gunBaslangici } from '@game/daily';
import { gunlukTablo, herkeseAcikOyuncu, panoSutunlariniKur } from './boards.js';
import { prisma } from './db.js';
import { withLedger } from './ledger.js';
import { TIME_SAFETY } from './reward.js';
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

  console.log('\n[5] Pano sütunlarını yeniden kur');
  {
    // Kirli başlangıç: sütunlar YANLIŞ, defter ve JSON doğru.
    const u0 = FORGE[0], u1 = FORGE[1];
    const ups = { [u0.id]: 3, [u1.id]: u1.maxLevel + 50, kaldirilmis_hat: 40 };
    await prisma.player.update({
      where: { wallet: normal },
      data: { goldEarned: 999_999, forgeLevels: 0, upgrades: ups },
    });
    const defter = (wallet: string, kind: string, gold: number) => ({
      id: crypto.randomUUID(), wallet, kind, gold,
    });
    await prisma.ledger.createMany({
      data: [
        defter(normal, 'run', 300), defter(normal, 'run', 25), defter(normal, 'run', 0),
        // ⚠️ KONTROL GRUBU: bunlar kazanç DEĞİL — toplama girerse sütun yalan söyler
        defter(normal, 'admin_grant', 50_000), defter(normal, 'forge', -200), defter(normal, 'wager', 7_000),
        // 🔴 hazinenin koşusu defterde duruyor ama sayılmamalı
        defter(HAZINE, 'run', 5_000),
      ],
    });

    const r1 = await panoSutunlariniKur();
    const n1 = await prisma.player.findUniqueOrThrow({ where: { wallet: normal } });
    check('goldEarned = defterin YALNIZ `run` toplamı', n1.goldEarned === 325, `${n1.goldEarned}`);
    const beklenenForge = 3 + u1.maxLevel;
    check('forgeLevels kırpılmış, bilinmeyen hat sayılmıyor',
      n1.forgeLevels === beklenenForge && forgeLevelsOf(ups) === beklenenForge,
      `${n1.forgeLevels} (beklenen ${beklenenForge})`);
    const h1 = await prisma.player.findUniqueOrThrow({ where: { wallet: HAZINE } });
    check('hazinenin goldEarned\'i 0', h1.goldEarned === 0, `${h1.goldEarned}`);
    check('bir şeyler düzeltildi', r1.forge >= 1 && r1.gold >= 1, JSON.stringify(r1));

    const r2 = await panoSutunlariniKur();
    const n2 = await prisma.player.findUniqueOrThrow({ where: { wallet: normal } });
    check('İDEMPOTENT: ikinci çalıştırma aynı sonucu veriyor',
      n2.goldEarned === 325 && n2.forgeLevels === beklenenForge && r2.forge === 0, JSON.stringify(r2));
  }
} finally {
  await prisma.ledger.deleteMany({ where: { wallet: { in: [HAZINE, banli, normal] } } });
  await prisma.run.deleteMany({ where: { wallet: { in: [HAZINE, banli, normal] } } });
  await prisma.player.deleteMany({ where: { wallet: { in: [HAZINE, banli, normal] } } });
  if (eskiHazine === undefined) delete process.env.TREASURY_ADDRESS;
  else process.env.TREASURY_ADDRESS = eskiHazine;
}

// ── [6] CANLI YOL — gerçek `/run/finish` ve Forge alımı ──
//
// ⚠️ SUNUCU ŞART (API, varsayılan 4100). [5] sütunu kuran fonksiyonu ölçüyor;
// burası sütunun CANLIDA doğru arttığını. İkisi ayrı iddia: recompute doğru
// olsa bile `/run/finish` artırmayı unutsa pano her deploy'a kadar bayat kalırdı.
console.log('\n[6] Canlı yol (sunucu)');
{
  const API = process.env.API ?? 'http://localhost:4100';
  const api = async (path: string, o: { method?: string; body?: unknown; token?: string } = {}) => {
    const r = await fetch(`${API}${path}`, {
      method: o.method ?? 'GET',
      headers: { 'content-type': 'application/json', ...(o.token ? { authorization: `Bearer ${o.token}` } : {}) },
      body: o.body ? JSON.stringify(o.body) : undefined,
    });
    const t = await r.text();
    let json: any = null; try { json = t ? JSON.parse(t) : null; } catch { /* metin */ }
    return { status: r.status, json };
  };
  const kp = nacl.sign.keyPair();
  const cuzdan = bs58.encode(kp.publicKey);
  const imzala = (m: string) => bs58.encode(nacl.sign.detached(new TextEncoder().encode(m), kp.secretKey));
  try {
    const n = await api('/auth/nonce', { method: 'POST', body: { wallet: cuzdan } });
    const v = await api('/auth/verify', { method: 'POST', body: { wallet: cuzdan, signature: imzala(n.json.message) } });
    const token = v.json?.token as string;
    check('oturum açıldı', !!token, `${v.status}`);

    // İki koşu: biri ANINDA (kırpılır ama nadir düşüşü ödenir), biri meşru.
    const k1 = await api('/run/start', { method: 'POST', token, body: { mode: 'campaign', stageId: 1 } });
    await api('/run/finish', { method: 'POST', token, body: { runId: k1.json.runId, deepestCleared: 0, rareGold: 25, cleared: true } });
    const st = stageById(1)!;
    const k2 = await api('/run/start', { method: 'POST', token, body: { mode: 'campaign', stageId: 1 } });
    await prisma.run.update({
      where: { id: k2.json.runId },
      data: { startedAt: new Date(Date.now() - ((st.enemyCount / st.spawnRate) * TIME_SAFETY + 3) * 1000) },
    });
    await api('/run/finish', { method: 'POST', token, body: { runId: k2.json.runId, deepestCleared: 0, rareGold: 25, cleared: true } });

    const toplam = await prisma.ledger.aggregate({ where: { wallet: cuzdan, kind: 'run', gold: { gt: 0 } }, _sum: { gold: true } });
    const p1 = await prisma.player.findUniqueOrThrow({ where: { wallet: cuzdan } });
    check('koşu goldEarned\'i artırdı', p1.goldEarned > 0, `${p1.goldEarned}`);
    check('goldEarned === defterin `run` toplamı (canlı yol)', p1.goldEarned === (toplam._sum.gold ?? 0),
      `${p1.goldEarned} vs ${toplam._sum.gold}`);

    // KONTROL: yönetici vermesi bakiyeyi artırıyor ama kazancı DEĞİL
    const g = await withLedger(cuzdan, { gold: { increment: 50_000 } }, { kind: 'admin_grant', gold: 50_000, detail: 'boards.test' });
    check('yönetici vermesi bakiyeyi artırdı (kontrol)', g.gold === p1.gold + 50_000);
    check('yönetici vermesi goldEarned\'i DEĞİŞTİRMEDİ', g.goldEarned === p1.goldEarned, `${g.goldEarned}`);

    // Forge alımı → sütun canlıda artıyor (fromProgress yolu)
    const ucuz = [...FORGE].sort((a, b) => costOf(a, 0) - costOf(b, 0))[0];
    const al = await api('/progress/buy', { method: 'POST', token, body: { id: ucuz.id } });
    const p2 = await prisma.player.findUniqueOrThrow({ where: { wallet: cuzdan } });
    check('Forge alımı forgeLevels\'i yazdı', al.status === 200 && p2.forgeLevels === p1.forgeLevels + 1,
      `${al.status} · ${p1.forgeLevels} → ${p2.forgeLevels}`);
    check('Forge harcaması goldEarned\'i DÜŞÜRMEDİ', p2.goldEarned === p1.goldEarned);
  } catch (e) {
    check('sunucuya ulaşıldı', false, `${API} — ${(e as Error).message}`);
  } finally {
    await prisma.ledger.deleteMany({ where: { wallet: cuzdan } });
    await prisma.run.deleteMany({ where: { wallet: cuzdan } });
    await prisma.player.deleteMany({ where: { wallet: cuzdan } });
  }
}

console.log(`\n${FAIL.length === 0 ? '✅ PANOLAR SAĞLAM' : `❌ ${FAIL.length} BAŞARISIZ: ${FAIL.join(', ')}`}\n`);
process.exit(FAIL.length === 0 ? 0 : 1);
