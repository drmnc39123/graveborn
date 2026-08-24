// ADMIN — bot politikasının İKİNCİ YARISI.
//
// Karar şuydu: tam replay doğrulaması YOK; sunucu ödül tavanı + admin denetimi
// yeterli. Tavan zaten kodda (reward.ts). Burası denetim tarafı.
//
// TASARIM İLKESİ: tablo dökmek değil, operatörün gerçek sorusunu cevaplamak.
// Gerçek sorular şunlar:
//   1. Kim çok gold kazandı ve bu makul mü?
//   2. Sunucu kimin iddiasını KIRPMAK zorunda kaldı? (yalan söylemenin izi)
//   3. Kim insan hızının üstünde koşu üretiyor?
//
// ⚠️ YIKICI İŞLEM YOK. Ban geri alınabilir; silme/sıfırlama uçları bilerek
// yazılmadı — yanlış bir tıklama oyuncunun emeğini geri dönüşsüz siler.

import type { Request, Response, NextFunction } from 'express';
import crypto from 'node:crypto';
import { prisma } from './db.js';

/**
 * Admin kapısı. Sır ortam değişkeninde; TANIMLI DEĞİLSE tüm admin uçları
 * KAPALI olur (403). Varsayılan bir sır koymak, unutulduğunda paneli herkese
 * açık bırakmak demekti.
 */
export function adminOnly(req: Request, res: Response, next: NextFunction) {
  const secret = process.env.ADMIN_SECRET;
  if (!secret) { res.status(403).json({ error: 'admin_kapali' }); return; }
  const given = req.get('x-admin-secret') ?? '';
  if (!timingSafeEqual(given, secret)) {
    // ⚠️ BAŞARISIZ DENEME GÜRÜLTÜ ÇIKARIR. Önce sessizce 401 dönüyordu:
    // kaba kuvvet denemesi hiçbir iz bırakmıyordu. Tek savunma dar hız
    // sınırıysa (bkz. `index.ts` adminLimiti) en azından GÖRÜLMELİ.
    console.warn('[admin] YETKİSİZ DENEME', req.ip ?? '?', req.method, req.path);
    res.status(401).json({ error: 'yetkisiz' }); return;
  }
  next();
}

/**
 * Sabit süreli karşılaştırma.
 *
 * ⚠️ UZUNLUK SIZINTISI KAPATILDI. Önce `given.length !== secret.length` ile
 * erken dönülüyordu — yani sırrın UZUNLUĞU zamanlamayla ölçülebiliyordu ve
 * sabit süreli karşılaştırmanın amacı kısmen boşa çıkıyordu. Artık iki
 * taraf da SHA-256'dan geçiyor: uzunluk ne olursa olsun karşılaştırma
 * 32 bayt üzerinde, sabit sürede yapılıyor.
 */
function timingSafeEqual(a: string, b: string): boolean {
  const ha = crypto.createHash('sha256').update(a).digest();
  const hb = crypto.createHash('sha256').update(b).digest();
  return crypto.timingSafeEqual(ha, hb);
}

const HOUR = 3600_000;

export interface PlayerRow {
  wallet: string;
  gold: number;
  unlockedStage: number;
  hero: string;
  banned: boolean;
  createdAt: string;
  lastSeen: string;
  runs: number;
  /** sunucunun iddiayı kırptığı koşu sayısı — ASIL sinyal bu */
  cappedRuns: number;
  /** hesap yaşına göre saatlik gold — insan hızının çok üstü şüpheli */
  goldPerHour: number;
  runsPerHour: number;
}

/**
 * Oyuncu listesi + risk sinyalleri.
 *
 * `cappedRuns` en güçlü sinyal: sunucu bir iddiayı kırptıysa istemci
 * hak etmediği bir sayı göndermiş demektir. Tek başına kanıt değil (eski
 * sürüm/ağ hatası da olabilir) ama sıralamanın tepesi buradan bakılır.
 */
export async function listPlayers(sort: 'gold' | 'capped' | 'new', limit: number): Promise<PlayerRow[]> {
  const players = await prisma.player.findMany({
    orderBy: sort === 'new' ? { createdAt: 'desc' } : { gold: 'desc' },
    take: Math.min(Math.max(limit, 1), 200),
  });

  const grouped = await prisma.run.groupBy({
    by: ['wallet'],
    _count: { _all: true },
    where: { wallet: { in: players.map((p) => p.wallet) } },
  });
  const cappedGrouped = await prisma.run.groupBy({
    by: ['wallet'],
    _count: { _all: true },
    where: { wallet: { in: players.map((p) => p.wallet) }, capped: true },
  });

  const runCount = new Map(grouped.map((g) => [g.wallet, g._count._all]));
  const cappedCount = new Map(cappedGrouped.map((g) => [g.wallet, g._count._all]));
  const now = Date.now();

  const rows: PlayerRow[] = players.map((p) => {
    // Yeni hesapta saat ~0 olur ve oran sonsuza fırlar; en az 1 saat sayıyoruz
    const hours = Math.max(1, (now - p.createdAt.getTime()) / HOUR);
    const runs = runCount.get(p.wallet) ?? 0;
    return {
      wallet: p.wallet,
      gold: p.gold,
      unlockedStage: p.unlockedStage,
      hero: p.hero,
      banned: p.banned,
      createdAt: p.createdAt.toISOString(),
      lastSeen: p.lastSeen.toISOString(),
      runs,
      cappedRuns: cappedCount.get(p.wallet) ?? 0,
      goldPerHour: Math.round(p.gold / hours),
      runsPerHour: Math.round((runs / hours) * 10) / 10,
    };
  });

  if (sort === 'capped') rows.sort((a, b) => b.cappedRuns - a.cappedRuns || b.gold - a.gold);
  return rows;
}

/** Şüpheli koşular — sunucunun kırptıkları. Denetim buradan başlar. */
export async function listRuns(onlyCapped: boolean, limit: number) {
  const runs = await prisma.run.findMany({
    where: onlyCapped ? { capped: true } : {},
    orderBy: { startedAt: 'desc' },
    take: Math.min(Math.max(limit, 1), 200),
  });
  return runs.map((r) => ({
    id: r.id,
    wallet: r.wallet,
    mode: r.mode,
    stageId: r.stageId,
    hero: r.hero,
    seed: r.seed.toString(),          // BigInt JSON'a doğrudan gitmez
    startedAt: r.startedAt.toISOString(),
    claimedAt: r.claimedAt?.toISOString() ?? null,
    claimedDepth: r.claimedDepth,
    claimedGold: r.claimedGold,
    awarded: r.awarded,
    capped: r.capped,
    /** koşu ne kadar sürdü — 5 saniyede biten "derinlik 40" iddiası fiziksel olarak imkânsız */
    durationSec: r.claimedAt
      ? Math.round((r.claimedAt.getTime() - r.startedAt.getTime()) / 1000)
      : null,
  }));
}

export async function overview() {
  const [players, banned, runsTotal, runsCapped, openRuns, gold] = await Promise.all([
    prisma.player.count(),
    prisma.player.count({ where: { banned: true } }),
    prisma.run.count({ where: { claimedAt: { not: null } } }),
    prisma.run.count({ where: { capped: true } }),
    prisma.run.count({ where: { claimedAt: null } }),
    prisma.player.aggregate({ _sum: { gold: true } }),
  ]);
  return {
    players, banned,
    runsClaimed: runsTotal,
    runsCapped,
    /** açılıp hiç kapanmamış koşular — terk edilmiş ya da kapanışı engellenmiş */
    runsOpen: openRuns,
    goldInCirculation: gold._sum.gold ?? 0,
  };
}

/** Tek oyuncunun dosyası — son koşularıyla birlikte */
export async function playerDetail(wallet: string) {
  const player = await prisma.player.findUnique({ where: { wallet } });
  if (!player) return null;
  const runs = await prisma.run.findMany({
    where: { wallet }, orderBy: { startedAt: 'desc' }, take: 50,
  });
  return {
    player: {
      ...player,
      createdAt: player.createdAt.toISOString(),
      lastSeen: player.lastSeen.toISOString(),
    },
    runs: runs.map((r) => ({
      id: r.id, mode: r.mode, stageId: r.stageId, seed: r.seed.toString(),
      startedAt: r.startedAt.toISOString(),
      claimedAt: r.claimedAt?.toISOString() ?? null,
      claimedDepth: r.claimedDepth, claimedGold: r.claimedGold,
      awarded: r.awarded, capped: r.capped,
      durationSec: r.claimedAt
        ? Math.round((r.claimedAt.getTime() - r.startedAt.getTime()) / 1000)
        : null,
    })),
  };
}

/** Ban / ban kaldır. GERİ ALINABİLİR — bilerek yıkıcı değil. */
export async function setBanned(wallet: string, banned: boolean) {
  return prisma.player.update({
    where: { wallet },
    data: { banned },
    select: { wallet: true, banned: true },
  });
}
