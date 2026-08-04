// OYUNCU DOSYASI — Run tablosunda biriken ama hiç yüzeye çıkmayan veri.
//
// ⚠️ NEDEN AYRI BİR "TOPLAM" SÜTUNU YOK: `Progress`'e `totalKills` /
// `totalPlaySec` gibi sayaçlar eklemek cazipti ama hepsi İSTEMCİNİN
// bildirdiği sayılara dayanırdı — yani profil ekranı yalan söylenebilir bir
// yüzey olurdu. Oysa aynı bilgilerin çoğu sunucunun ZATEN güvendiği veriden
// türetilebiliyor:
//   • oynanan süre  → Run.startedAt / claimedAt farkı (sunucu saati)
//   • kazanılan gold → Run.awarded (sunucunun kendi hesabı)
//   • en derin iniş  → Player.depthPaid (settleRun'ın kırptığı değer)
// Bu yüzden burada tek bir istemci sayısı kullanılmıyor.
//
// ⚠️ Kill sayısı BİLEREK YOK. Tek kaynağı istemcinin iddiası olurdu ve
// profilde "1.2 milyar kill" yazan bir hesap, tüm ekranı değersizleştirirdi.
// Gerçekten istenirse motor sunucuda koşturulup türetilebilir (DOM'suz),
// ama o maliyet bir vanity sayısı için ödenmez.

import { prisma } from './db.js';

export interface ProfileRun {
  id: string;
  mode: string;
  stageId: number;
  startedAt: string;
  /** sunucunun KABUL ETTİĞİ derinlik — istemcinin iddiası değil */
  depth: number | null;
  awarded: number | null;
  durationSec: number | null;
  capped: boolean;
  wagerStake: number;
  wagerWon: boolean;
}

export interface ProfileData {
  totals: {
    runs: number;
    /** kapanmış koşuların toplam süresi (saniye) — SUNUCU saatinden */
    playSec: number;
    goldEarned: number;
    /** hazineye/koşuya girmiş ama kapanmamış koşu sayısı */
    abandoned: number;
    bestDepth: number;
    bestStage: number;
    /** kırpılmış koşu sayısı — oyuncunun kendisi de görsün, gizli sicil olmasın */
    capped: number;
    wagersPlaced: number;
    wagersWon: number;
  };
  runs: ProfileRun[];
}

const MAX_RUNS = 40;

export async function profileOf(wallet: string): Promise<ProfileData> {
  const [player, runs, agg] = await Promise.all([
    prisma.player.findUnique({
      where: { wallet },
      select: { bestDepth: true, bestStage: true },
    }),
    prisma.run.findMany({
      where: { wallet },
      orderBy: { startedAt: 'desc' },
      take: MAX_RUNS,
    }),
    prisma.run.aggregate({
      where: { wallet, claimedAt: { not: null } },
      _sum: { awarded: true },
      _count: true,
    }),
  ]);

  // ⚠️ Süre toplamı SORGUYLA yapılamıyor (iki sütunun farkı), o yüzden
  // kapanmış koşular tek tek çekiliyor. Sadece `startedAt`/`claimedAt`
  // seçiliyor — 40 satırlık sayfa için tam satır çekmek gereksiz yük olurdu.
  const kapanan = await prisma.run.findMany({
    where: { wallet, claimedAt: { not: null } },
    select: { startedAt: true, claimedAt: true, capped: true, wagerStake: true, wagerWon: true },
  });

  let playSec = 0;
  let capped = 0;
  let wagersPlaced = 0;
  let wagersWon = 0;
  for (const r of kapanan) {
    playSec += Math.max(0, Math.round((r.claimedAt!.getTime() - r.startedAt.getTime()) / 1000));
    if (r.capped) capped += 1;
    if (r.wagerStake > 0) { wagersPlaced += 1; if (r.wagerWon) wagersWon += 1; }
  }

  const acikKosu = await prisma.run.count({ where: { wallet, claimedAt: null } });

  return {
    totals: {
      runs: agg._count,
      playSec,
      goldEarned: agg._sum.awarded ?? 0,
      abandoned: acikKosu,
      bestDepth: player?.bestDepth ?? 0,
      bestStage: player?.bestStage ?? 0,
      capped,
      wagersPlaced,
      wagersWon,
    },
    runs: runs.map((r) => ({
      id: r.id,
      mode: r.mode,
      stageId: r.stageId,
      startedAt: r.startedAt.toISOString(),
      // ⚠️ `awardedDepth` gösteriliyor, `claimedDepth` DEĞİL: biri sunucunun
      // kabul ettiği, diğeri ham iddia. Oyuncuya iddiasını göstermek,
      // kırpılmış bir koşuyu başarı gibi okutmak olurdu.
      depth: r.awardedDepth,
      awarded: r.awarded,
      durationSec: r.claimedAt
        ? Math.round((r.claimedAt.getTime() - r.startedAt.getTime()) / 1000)
        : null,
      capped: r.capped,
      wagerStake: r.wagerStake,
      wagerWon: r.wagerWon,
    })),
  };
}
