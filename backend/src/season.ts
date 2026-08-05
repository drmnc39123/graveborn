// HAFTALIK SEZON — sunucu tarafı.
//
// Tasarım gerekçesi ve ödül tablosu `@game/season`'da; burada yalnızca
// veritabanı işi var.
//
// ⚠️ Puan istemciden GELMEZ. `recordDescent` ile aynı kaynaktan, sunucunun
// zaten kırpıp doğruladığı derinlikten hesaplanıyor (bkz. reward.ts).

import crypto from 'node:crypto';
import { challengeRating } from '@game/config';
import {
  SEASON_PAYOUT_DEPTH, rewardForRank, seasonEndsAt, seasonWeek,
} from '@game/season';
import { prisma } from './db.js';

export interface SeasonRow {
  rank: number;
  wallet: string;
  stage: number;
  depth: number;
  rating: number;
  hero: string;
}

/**
 * Koşu kapanışında haftalık puanı güncelle.
 *
 * İki durum var ve ikisi de tek `updateMany` ile ifade edilemez:
 *  • puan GEÇEN haftaya aitse → hafta yenilenir, puan bu koşununki olur
 *    (düşük bir koşu bile geçen haftanın yüksek puanını EZER — sezon budur)
 *  • puan BU haftaya aitse → sadece daha iyiyse yazılır
 *
 * ⚠️ İkisi de KOŞULLU yazma. Aynı anda kapanan iki koşuda düşük olanın
 * yükseği ezmesini engelleyen şey `where`; okuyup-yazmak yarış açardı.
 */
export async function recordSeason(
  wallet: string, mode: string, stageId: number, depth: number, now = new Date(),
): Promise<boolean> {
  if (mode !== 'descent' || depth < 1) return false;

  const rating = challengeRating(stageId, depth);
  if (!Number.isFinite(rating) || rating <= 0) return false;

  const week = seasonWeek(now);
  const data = { seasonWeek: week, seasonStage: stageId, seasonDepth: depth, seasonRating: rating };

  // Önce "yeni hafta" yolu: kayıtlı hafta bu haftadan ESKİYSE koşulsuz yaz.
  const fresh = await prisma.player.updateMany({
    where: { wallet, seasonWeek: { lt: week } },
    data,
  });
  if (fresh.count > 0) return true;

  const better = await prisma.player.updateMany({
    where: { wallet, seasonWeek: week, seasonRating: { lt: rating } },
    data,
  });
  return better.count > 0;
}

/** Bu haftanın tablosu. Geçen haftanın puanları `seasonWeek` ile dışarıda kalır. */
export async function topSeason(limit = 50, now = new Date()): Promise<{
  week: number; endsAt: number; rows: SeasonRow[];
}> {
  const week = seasonWeek(now);
  const rows = await prisma.player.findMany({
    where: { banned: false, seasonWeek: week, seasonRating: { gt: 0 } },
    orderBy: [{ seasonRating: 'desc' }, { lastSeen: 'asc' }],
    take: Math.min(Math.max(limit, 1), 100),
    select: {
      wallet: true, seasonStage: true, seasonDepth: true, seasonRating: true, hero: true,
    },
  });
  return {
    week,
    endsAt: seasonEndsAt(week),
    rows: rows.map((r, i) => ({
      rank: i + 1,
      wallet: r.wallet,
      stage: r.seasonStage,
      depth: r.seasonDepth,
      rating: r.seasonRating,
      hero: r.hero,
    })),
  };
}

/** Bir oyuncunun bu haftaki sırası — listede yoksa `null` */
export async function seasonRankOf(
  wallet: string, now = new Date(),
): Promise<{ rank: number; row: SeasonRow } | null> {
  const week = seasonWeek(now);
  const me = await prisma.player.findUnique({
    where: { wallet },
    select: { seasonWeek: true, seasonStage: true, seasonDepth: true, seasonRating: true, hero: true, banned: true },
  });
  if (!me || me.banned || me.seasonWeek !== week || me.seasonRating <= 0) return null;

  const ahead = await prisma.player.count({
    where: { banned: false, seasonWeek: week, seasonRating: { gt: me.seasonRating } },
  });
  return {
    rank: ahead + 1,
    row: {
      rank: ahead + 1, wallet, stage: me.seasonStage, depth: me.seasonDepth,
      rating: me.seasonRating, hero: me.hero,
    },
  };
}

/**
 * KAPANMIŞ HAFTALARI ÖDÜLLENDİR.
 *
 * ⚠️ CRON YOK — kapanış İSTEK ÜZERİNE tetikleniyor (tabloyu görüntüleyen ya
 * da koşu bitiren herkes). Sebep: sunucu barındırma kararı henüz verilmedi
 * ve arka plan işine bağlı bir ödül, sunucu uykudayken sessizce kaybolur.
 * Kimse haftalarca oynamazsa dağıtım gecikir ama YAPILIR — ödül hafta
 * numarasına bağlı, "şu an" ne olduğuna değil.
 *
 * ⚠️ ÇİFT ÖDÜL KORUMASI YAZMA SIRASINDA: `SeasonClose` satırı ödüllerle
 * AYNI transaction'da yaratılıyor ve `week` birincil anahtar. İki istek
 * aynı anda girerse ikincisi anahtara çarpar, işlem geri alınır, ödül bir
 * kez verilir. Ayrıca `SeasonAward` üzerinde (week, wallet) tekil.
 */
export async function settleSeasons(now = new Date()): Promise<{ week: number; winners: number }[]> {
  const week = seasonWeek(now);
  const out: { week: number; winners: number }[] = [];

  // Kapanmayı bekleyen haftalar: puanı olan ama BU haftadan eski kayıtlar.
  const pending = await prisma.player.findMany({
    where: { seasonWeek: { lt: week, gt: 0 }, seasonRating: { gt: 0 } },
    select: { seasonWeek: true },
    distinct: ['seasonWeek'],
    orderBy: { seasonWeek: 'asc' },
    take: 12,   // güvenlik tavanı: tek istekte 12 haftadan fazlasını kapatma
  });
  if (pending.length === 0) return out;

  const closed = await prisma.seasonClose.findMany({
    where: { week: { in: pending.map((p) => p.seasonWeek) } },
    select: { week: true },
  });
  const done = new Set(closed.map((c) => c.week));

  for (const { seasonWeek: w } of pending) {
    if (done.has(w)) continue;
    try {
      out.push(await settleOne(w));
    } catch {
      // Anahtar çakışması = başka bir istek aynı haftayı zaten kapattı.
      // Hata değil, yarışın kaybeden tarafı. Sessizce geç.
    }
  }
  return out;
}

async function settleOne(week: number): Promise<{ week: number; winners: number }> {
  const winners = await prisma.player.findMany({
    where: { banned: false, seasonWeek: week, seasonRating: { gt: 0 } },
    orderBy: [{ seasonRating: 'desc' }, { lastSeen: 'asc' }],
    take: SEASON_PAYOUT_DEPTH,
    select: { wallet: true, cosmetics: true, dust: true },
  });

  return prisma.$transaction(async (tx) => {
    // ⚠️ İLK YAZILAN BU. Çakışırsa transaction burada ölür ve hiçbir ödül
    // verilmez — sıra tersine olsaydı ödüller verilip kapanış düşerdi.
    await tx.seasonClose.create({ data: { week, winners: winners.length } });

    for (let i = 0; i < winners.length; i++) {
      const rank = i + 1;
      const reward = rewardForRank(rank);
      if (!reward) continue;
      const w = winners[i];

      // Zaten sahip olunan kozmetik ikinci kez eklenmez — envanter bir küme.
      const owned = Array.isArray(w.cosmetics) ? (w.cosmetics as unknown[]).filter((x) => typeof x === 'string') as string[] : [];
      const add = reward.cosmetic && !owned.includes(reward.cosmetic) ? reward.cosmetic : null;

      await tx.player.update({
        where: { wallet: w.wallet },
        data: {
          dust: { increment: reward.dust },
          ...(add ? { cosmetics: [...owned, add] } : {}),
        },
      });
      await tx.seasonAward.create({
        data: {
          id: crypto.randomUUID(), week, wallet: w.wallet, rank,
          cosmetic: reward.cosmetic ?? null, dust: reward.dust,
        },
      });
    }
    return { week, winners: winners.length };
  });
}

/** Oyuncunun kazandığı sezon ödülleri — en yeniden eskiye */
export async function awardsOf(wallet: string, limit = 10) {
  return prisma.seasonAward.findMany({
    where: { wallet },
    orderBy: { week: 'desc' },
    take: Math.min(Math.max(limit, 1), 50),
    select: { week: true, rank: true, cosmetic: true, dust: true },
  });
}
