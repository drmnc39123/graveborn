// DÜELLO — asenkron PvP, sunucu tarafı.
//
// Tasarım ve sayılar `@game/duel`'de. Burada dört iş var: kayıt yayınlamak,
// tabloyu kurmak, meydan okumayı doğrulamak ve sonucu YARIŞSIZ yazmak.
//
// ⚠️ MEYDAN OKUYAN RAKİBİN SEED'İNİ OYNUYOR. Seed kayıttan geliyor, yeni
// üretilmiyor — düellonun bütün adaleti bu. İstemci seed'i ne seçebiliyor
// ne de değiştirebiliyor; `/duel/start` onu Run satırına yazıyor.
//
// ⚠️ HEDEF KOŞU AÇILIRKEN DONDURULUYOR (`Run.duelTargetDepth`). Kapanışta
// rakibin güncel kaydına bakılsaydı hedef hareketli olurdu: oyuncu 40'ı
// geçmek için girer, o sırada rakip 45'e çıkar ve hiç haberi olmadan
// kaybederdi.
//
// ⚠️ DÜELLO GOLD ÖDEMİYOR. Puan ödüyor (sıfır toplamlı, enflasyon
// yaratamaz) ve toz — o da GÜNLÜK SERT TAVANLI, çünkü düello sınırsız
// oynanabiliyor.

import crypto from 'node:crypto';
import { DUEL, duelBlocker, duelWon, nextRatings } from '@game/duel';
import { challengeRating } from '@game/config';
import { utcDay } from '@game/progress';
import { prisma } from './db.js';

export class DuelError extends Error {
  constructor(public code: string, public status = 400) { super(code); }
}

/**
 * Koşu kapanışında kaydı yayınla/güncelle.
 *
 * ⚠️ SADECE DAHA İYİYSE. Her koşuyu yazmak, oyuncunun kötü bir koşusuyla
 * kendi kaydını düşürmesine izin verirdi — o da "kolay hedef" bırakıp
 * rakiplerinin puanını çalmanın yolu olurdu.
 *
 * ⚠️ KIRPILMIŞ KOŞU KAYIT OLMAZ. Leaderboard'daki kuralın aynısı: şüpheli
 * bir iddiadan doğan kayıt, başkalarının puanını da bozar.
 */
export async function publishRecord(
  wallet: string, mode: string, stageId: number, seed: number, depth: number,
  ascension: number, capped: boolean,
): Promise<void> {
  if (mode !== 'descent' || capped || depth < 1) return;
  const rating = challengeRating(stageId, depth, ascension);
  if (!Number.isFinite(rating) || rating <= 0) return;

  const mevcut = await prisma.duelRecord.findUnique({
    where: { wallet_stageId: { wallet, stageId } },
    select: { id: true, depth: true },
  });
  if (mevcut && mevcut.depth >= depth) return;

  if (mevcut) {
    // ⚠️ KOŞULLU: araya giren daha iyi bir koşu ezilmesin
    await prisma.duelRecord.updateMany({
      where: { id: mevcut.id, depth: { lt: depth } },
      data: { seed: BigInt(seed), depth, rating, createdAt: new Date() },
    });
    return;
  }
  try {
    await prisma.duelRecord.create({
      data: { id: crypto.randomUUID(), wallet, stageId, seed: BigInt(seed), depth, rating },
    });
  } catch {
    // Eşzamanlı iki koşu aynı anda ilk kaydı açtıysa tekil kısıt patlar —
    // ikincisi güncelleme yoluna düşsün.
    await prisma.duelRecord.updateMany({
      where: { wallet, stageId, depth: { lt: depth } },
      data: { seed: BigInt(seed), depth, rating, createdAt: new Date() },
    });
  }
}

export interface DuelBoardRow {
  id: string;
  wallet: string;
  stageId: number;
  depth: number;
  rating: number;
  duelRating: number;
  hero: string;
  /** meydan okunamıyorsa SEBEBİ (arayüz bunu gösteriyor) */
  blocker: string | null;
}

export interface DuelBoard {
  me: { rating: number; wins: number; losses: number; rewardedToday: number };
  rows: DuelBoardRow[];
  recent: {
    challenger: string; defender: string; stageId: number;
    depth: number; target: number; won: boolean; delta: number; at: string;
  }[];
}

export async function board(wallet: string, cleared: Record<string, boolean>): Promise<DuelBoard> {
  const me = await prisma.player.findUnique({
    where: { wallet },
    select: { duelRating: true, duelWins: true, duelLosses: true, duelDay: true, duelRewarded: true },
  });
  if (!me) throw new DuelError('oyuncu_yok', 404);

  const rows = await prisma.duelRecord.findMany({
    where: { wallet: { not: wallet }, player: { banned: false } },
    orderBy: { rating: 'desc' },
    take: DUEL.boardSize,
    include: { player: { select: { duelRating: true, hero: true } } },
  });

  // ⚠️ SOĞUMA TEK SORGUDA. Satır başına sorgu atmak 20 istek demekti ve
  // tablo her açılışta yavaşlardı.
  const rakipler = rows.map((r) => r.wallet);
  const sonMaclar = rakipler.length === 0 ? [] : await prisma.duel.findMany({
    where: { challenger: wallet, defender: { in: rakipler } },
    orderBy: { createdAt: 'desc' },
    select: { defender: true, createdAt: true },
  });
  const sonuncu = new Map<string, Date>();
  for (const d of sonMaclar) if (!sonuncu.has(d.defender)) sonuncu.set(d.defender, d.createdAt);

  const simdi = Date.now();
  const recent = await prisma.duel.findMany({
    orderBy: { createdAt: 'desc' }, take: 12,
  });

  return {
    me: {
      rating: me.duelRating, wins: me.duelWins, losses: me.duelLosses,
      rewardedToday: me.duelDay === utcDay(new Date()) ? me.duelRewarded : 0,
    },
    rows: rows.map((r) => {
      const son = sonuncu.get(r.wallet);
      const saat = son ? (simdi - son.getTime()) / 3_600_000 : Infinity;
      return {
        id: r.id, wallet: r.wallet, stageId: r.stageId, depth: r.depth, rating: r.rating,
        duelRating: r.player.duelRating, hero: r.player.hero,
        blocker: duelBlocker({
          challenger: wallet, defender: r.wallet, hoursSince: saat,
          stageCleared: !!cleared[String(r.stageId)],
        }),
      };
    }),
    recent: recent.map((d) => ({
      challenger: d.challenger, defender: d.defender, stageId: d.stageId,
      depth: d.depth, target: d.target, won: d.won, delta: d.delta,
      at: d.createdAt.toISOString(),
    })),
  };
}

/**
 * Meydan okumayı doğrula ve koşunun kurulacağı bilgileri döndür.
 *
 * ⚠️ ARAYÜZDE GİZLENEN DÜĞME BİR KORUMA DEĞİLDİR — aynı `duelBlocker`
 * burada da çalışıyor. Kural tek yerde yazılı, iki yerde uygulanıyor.
 */
export async function resolveChallenge(
  wallet: string, recordId: unknown, cleared: Record<string, boolean>,
): Promise<{ stageId: number; seed: number; defender: string; targetDepth: number; defRating: number }> {
  if (typeof recordId !== 'string' || !recordId) throw new DuelError('gecersiz_kayit');
  const rec = await prisma.duelRecord.findUnique({
    where: { id: recordId },
    include: { player: { select: { duelRating: true, banned: true } } },
  });
  if (!rec) throw new DuelError('kayit_yok', 404);
  if (rec.player.banned) throw new DuelError('rakip_yasakli', 403);

  const son = await prisma.duel.findFirst({
    where: { challenger: wallet, defender: rec.wallet },
    orderBy: { createdAt: 'desc' },
    select: { createdAt: true },
  });
  const saat = son ? (Date.now() - son.createdAt.getTime()) / 3_600_000 : Infinity;

  const engel = duelBlocker({
    challenger: wallet, defender: rec.wallet, hoursSince: saat,
    stageCleared: !!cleared[String(rec.stageId)],
  });
  if (engel) throw new DuelError(engel);

  return {
    stageId: rec.stageId,
    // ⚠️ SEED KAYITTAN. Yeni seed üretmek düellonun tek adalet dayanağını
    // yok ederdi: iki oyuncu farklı koşuları oynayıp karşılaştırılırdı.
    seed: Number(rec.seed),
    defender: rec.wallet,
    targetDepth: rec.depth,
    defRating: rec.player.duelRating,
  };
}

export interface DuelOutcome {
  won: boolean;
  depth: number;
  target: number;
  delta: number;
  rating: number;
  dust: number;
}

/**
 * Düelloyu kapat — puanları ve tozu yaz.
 *
 * ⚠️ PUANLAR `increment` İLE yazılıyor, mutlak değerle DEĞİL. Asenkron bir
 * ladder'da aynı oyuncuya aynı anda iki kişi meydan okuyabiliyor; mutlak
 * yazma ikinci sonucun birincisini EZMESİNE yol açardı (oku-değiştir-yaz
 * yarışının klasiği). Artımlar toplanır ve ikisi de sayılır.
 *
 * ⚠️ TOZ KOŞULLU YAZMADA. Günlük tavanı okuyup sonra yazmak, aynı anda
 * biten iki düelloda tavanı deldirirdi.
 */
export async function settleDuel(
  challenger: string, defender: string, stageId: number,
  depth: number, target: number, defRating: number,
): Promise<DuelOutcome> {
  const me = await prisma.player.findUnique({
    where: { wallet: challenger }, select: { duelRating: true },
  });
  if (!me) throw new DuelError('oyuncu_yok', 404);

  const won = duelWon(depth, target);
  const r = nextRatings(me.duelRating, defRating, won);
  const dc = r.challenger - me.duelRating;
  const dd = r.defender - defRating;
  const gun = utcDay(new Date());

  let dust = 0;
  await prisma.$transaction(async (tx) => {
    await tx.player.update({
      where: { wallet: challenger },
      data: {
        duelRating: { increment: dc },
        ...(won ? { duelWins: { increment: 1 } } : { duelLosses: { increment: 1 } }),
      },
    });
    // Savunan çevrimdışı — puanı yine de hareket ediyor (asenkron ladder)
    await tx.player.updateMany({
      where: { wallet: defender },
      data: {
        duelRating: { increment: dd },
        ...(won ? { duelLosses: { increment: 1 } } : { duelWins: { increment: 1 } }),
      },
    });
    // ⚠️ TABAN 100 — artımlar birikip puanı eksiye düşürmesin
    await tx.player.updateMany({
      where: { wallet: { in: [challenger, defender] }, duelRating: { lt: 100 } },
      data: { duelRating: 100 },
    });

    if (won) {
      // Gün değiştiyse sayacı sıfırla (tembel sıfırlama — cron yok)
      await tx.player.updateMany({
        where: { wallet: challenger, duelDay: { not: gun } },
        data: { duelDay: gun, duelRewarded: 0 },
      });
      // ⚠️ TAVAN KOŞULUN İÇİNDE: okuyup yazmak iki eşzamanlı düelloda delerdi
      const hit = await tx.player.updateMany({
        where: { wallet: challenger, duelDay: gun, duelRewarded: { lt: DUEL.dailyRewarded } },
        data: { duelRewarded: { increment: 1 }, dust: { increment: DUEL.dustPerWin } },
      });
      if (hit.count > 0) dust = DUEL.dustPerWin;
    }

    await tx.duel.create({
      data: {
        id: crypto.randomUUID(), challenger, defender, stageId,
        depth, target, won, delta: dc, dust,
      },
    });
  });

  const son = await prisma.player.findUniqueOrThrow({
    where: { wallet: challenger }, select: { duelRating: true },
  });
  return { won, depth, target, delta: dc, rating: son.duelRating, dust };
}
