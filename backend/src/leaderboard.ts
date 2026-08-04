// LEADERBOARD — "en derine kim indi".
//
// NİYE VAR: The Descent sonsuz, kampanya tek seferlik tüketim. Oyuncunun
// ertesi gün geri gelme sebebi burada; gold artık tavansız aksa bile
// "daha derine" demek için bir sebep gerekiyordu.
//
// ⚠️ SIRALAMA EKSENİ DERİNLİK DEĞİL, `challengeRating`. Sadece derinliğe
// bakmak 1. bölümü farmlamayı ödüllendirirdi: bölüm 10'un tabanı bölüm 1'in
// 14 katı, oysa derinlik sayısı ikisinde de aynı görünür.
//
// ⚠️ Puan istemciden GELMEZ. Koşu kapanışında, sunucunun zaten kırpıp
// doğruladığı derinlikten hesaplanır (bkz. reward.ts). İstemcinin
// dokunabildiği tek şey iddia, o da tavana çarpıyor.

import { challengeRating } from '@game/config';
import { prisma } from './db.js';

export interface Row {
  rank: number;
  wallet: string;
  stage: number;
  depth: number;
  rating: number;
  hero: string;
  /** takılı kozmetikler — SADECE görünür, sıralamayı etkilemez */
  equipped: { title?: string; plate?: string; trophy?: string };
}

/**
 * DB'deki `equipped` JSON'undan leaderboard'a ÇIKACAK alanları süz.
 *
 * ⚠️ İki sebeple ham JSON gönderilmiyor: (1) `aura` yalnızca koşu içinde
 * görünür, tabloda işi yok; (2) dışarı açılan her alan bir yüzeydir, kapsam
 * dar tutulur.
 *
 * Sahiplik doğrulaması BURADA YAPILMAZ: `equipCosmetic` yazarken doğruluyor,
 * `normalize` okurken tekrar süzüyor. Üçüncü bir kopya, üçüncü bir ayrışma
 * noktası olurdu.
 */
function wornOf(raw: unknown): Row['equipped'] {
  if (!raw || typeof raw !== 'object') return {};
  const e = raw as Record<string, unknown>;
  const pick = (k: string) => (typeof e[k] === 'string' ? (e[k] as string) : undefined);
  return { title: pick('title'), plate: pick('plate'), trophy: pick('trophy') };
}

/**
 * Koşu kapanışında rekoru güncelle. SADECE ARTAR — kötü bir koşu oyuncunun
 * rekorunu düşürmez, yoksa oyuncu en iyi skorunu korumak için oynamamaya
 * teşvik edilirdi.
 *
 * Yazma koşullu (`bestRating: { lt: rating }`): iki koşu aynı anda kapanırsa
 * düşük olan yükseği ezemez.
 */
export async function recordDescent(
  wallet: string, mode: string, stageId: number, depth: number,
): Promise<boolean> {
  if (mode !== 'descent' || depth < 1) return false;

  const rating = challengeRating(stageId, depth);
  if (!Number.isFinite(rating) || rating <= 0) return false;

  const hit = await prisma.player.updateMany({
    where: { wallet, bestRating: { lt: rating } },
    data: { bestStage: stageId, bestDepth: depth, bestRating: rating },
  });
  return hit.count > 0;
}

/** Top N — banlılar dışarıda, hiç inmemişler dışarıda */
export async function top(limit = 50): Promise<Row[]> {
  const rows = await prisma.player.findMany({
    where: { banned: false, bestRating: { gt: 0 } },
    orderBy: [{ bestRating: 'desc' }, { lastSeen: 'asc' }],
    take: Math.min(Math.max(limit, 1), 100),
    // ⚠️ `equipped` de çekiliyor: kozmetik prestij ANCAK BAŞKALARI GÖRÜRSE
    // değerlidir. Sadece kendi panelinde görünen bir unvana kimse gold vermez
    // ve Reliquary bir gold sinki olarak işlevini kaybeder.
    select: {
      wallet: true, bestStage: true, bestDepth: true, bestRating: true, hero: true,
      equipped: true,
    },
  });
  return rows.map((r, i) => ({
    rank: i + 1,
    wallet: r.wallet,
    stage: r.bestStage,
    depth: r.bestDepth,
    rating: r.bestRating,
    hero: r.hero,
    equipped: wornOf(r.equipped),
  }));
}

/**
 * Bir oyuncunun sırası. Listede yoksa `null` — "sıralaman yok, bir iniş yap"
 * demek, 0. sıra göstermekten dürüst.
 *
 * ⚠️ Sayım sorgusu, tabloyu çekip indeksini aramaktan ucuz: `bestRating`
 * indeksli, `count` indeksten cevaplanır.
 */
export async function rankOf(wallet: string): Promise<{ rank: number; row: Row } | null> {
  const me = await prisma.player.findUnique({
    where: { wallet },
    select: {
      wallet: true, bestStage: true, bestDepth: true, bestRating: true, hero: true,
      banned: true, equipped: true,
    },
  });
  if (!me || me.banned || me.bestRating <= 0) return null;

  const ahead = await prisma.player.count({
    where: { banned: false, bestRating: { gt: me.bestRating } },
  });
  const rank = ahead + 1;
  return {
    rank,
    row: {
      rank, wallet: me.wallet, stage: me.bestStage, depth: me.bestDepth,
      rating: me.bestRating, hero: me.hero, equipped: wornOf(me.equipped),
    },
  };
}

/**
 * TABLOYU SIFIRDAN KUR — kaçış valfi.
 *
 * ⚠️ Rekor "sadece artar" olduğu için yanlış yazılmış bir satır kendiliğinden
 * DÜZELMEZ; oyuncuyu banlamak dışında yolu yoktu. Bu gerçek bir açık:
 * süre tabanı eklenmeden önce yazılmış kayıtlar tabloda kalıyordu.
 *
 * Kaynak `Run` tablosu: SADECE kırpılmamış (`capped: false`) descent koşuları
 * ve sunucunun KABUL ETTİĞİ derinlik (`awardedDepth`) — istemcinin iddiası
 * değil. Kaydı olmayan oyuncunun rekoru sıfırlanır.
 */
export async function recomputeAll(): Promise<{ players: number; cleared: number }> {
  const runs = await prisma.run.findMany({
    where: { mode: 'descent', capped: false, claimedAt: { not: null }, awardedDepth: { gt: 0 } },
    select: { wallet: true, stageId: true, awardedDepth: true },
  });

  const best = new Map<string, { stage: number; depth: number; rating: number }>();
  for (const r of runs) {
    const depth = r.awardedDepth ?? 0;
    const rating = challengeRating(r.stageId, depth);
    const cur = best.get(r.wallet);
    if (!cur || rating > cur.rating) best.set(r.wallet, { stage: r.stageId, depth, rating });
  }

  // Kaydı olmayan herkesin rekoru sıfırlanır — eski kirli satırlar burada düşer
  const cleared = await prisma.player.updateMany({
    where: { wallet: { notIn: [...best.keys()] }, bestRating: { gt: 0 } },
    data: { bestStage: 0, bestDepth: 0, bestRating: 0 },
  });

  for (const [wallet, b] of best) {
    await prisma.player.updateMany({
      where: { wallet },
      data: { bestStage: b.stage, bestDepth: b.depth, bestRating: b.rating },
    });
  }
  return { players: best.size, cleared: cleared.count };
}

/**
 * Mevcut oyuncuların rekorunu `depthPaid`'den geri doldur.
 *
 * Denormalize alanlar sonradan eklendi; onlarsız eski oyuncular leaderboard'a
 * hiç görünmezdi ve "benim inişim nerede?" haklı bir şikâyet olurdu.
 * Idempotent — tekrar çalıştırmak zarar vermez, çünkü yalnızca daha yüksek
 * bir puan bulursa yazar.
 */
export async function backfill(): Promise<{ scanned: number; updated: number }> {
  const players = await prisma.player.findMany({
    select: { wallet: true, depthPaid: true, bestRating: true },
  });

  let updated = 0;
  for (const p of players) {
    const paid = (p.depthPaid ?? {}) as Record<string, number>;
    let bestStage = 0, bestDepth = 0, bestRating = 0;

    for (const [k, v] of Object.entries(paid)) {
      const stageId = Number(k);
      const depth = Math.floor(Number(v) || 0);
      if (!Number.isFinite(stageId) || depth < 1) continue;
      const r = challengeRating(stageId, depth);
      if (r > bestRating) { bestRating = r; bestStage = stageId; bestDepth = depth; }
    }

    if (bestRating > p.bestRating) {
      await prisma.player.update({
        where: { wallet: p.wallet },
        data: { bestStage, bestDepth, bestRating },
      });
      updated += 1;
    }
  }
  return { scanned: players.length, updated };
}
