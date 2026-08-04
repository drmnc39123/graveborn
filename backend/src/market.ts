// MARKETPLACE — oyuncudan oyuncuya gold ↔ $GRAVE.
//
// ⚠️ EV TAKASI DEĞİL. Hazine sabit kurdan gold almaz. Token DAİMA başka bir
// oyuncunun cüzdanından gelir; oyun token BASMAZ. Sıfır-emisyon sözü budur.
//
// ⚠️ ESCROW EKONOMİNİN CAN DAMARI. İlan açılırken gold satıcının
// bakiyesinden DÜŞÜLÜR. Düşmezsek oyuncu aynı gold'u hem satışa koyar hem
// Forge'da harcar — yoktan gold üretmenin en kolay yolu bu.
//
// TOKEN HENÜZ YOK: satın alma ucu `TOKEN_MINT` tanımlanana kadar 503 döner.
// Listeleme/iptal/escrow bugün çalışır ve test edilir; ödeme bacağı token
// çıkınca zincir üstü doğrulamayla açılır (bkz. verifyPayment notu).

import crypto from 'node:crypto';
import { prisma } from './db.js';

/** Kintara ölçüsü: oyuncu başına aynı anda en fazla bu kadar aktif ilan */
export const MAX_ACTIVE_LISTINGS = 10;

/** En az bu kadar gold listelenebilir — 1 gold'luk ilan spam'i defter şişirir */
export const MIN_GOLD = 50;

/**
 * Token satışından alınan komisyon: %5 → yarısı yakılır, yarısı hazineye.
 * Gold tarafından komisyon ALINMAZ (Kintara yapısı).
 * ⚠️ Sayı burada TEK kaynak; oran değişirse tek yerden değişir.
 */
export const FEE = { totalBps: 500, burnBps: 250, treasuryBps: 250 } as const;

export function feeSplit(price: bigint) {
  const total = (price * BigInt(FEE.totalBps)) / 10000n;
  const burn = (price * BigInt(FEE.burnBps)) / 10000n;
  return { total, burn, treasury: total - burn, toSeller: price - total };
}

export function tokenEnabled() { return Boolean(process.env.TOKEN_MINT); }

export class MarketError extends Error {
  constructor(public code: string, public status = 400) { super(code); }
}

/**
 * İlan aç. Gold ATOMİK olarak escrow'a alınır.
 *
 * Tek transaction: bakiye düşürme + ilan oluşturma birlikte olur ya da
 * hiç olmaz. `updateMany` + koşullu `gold: { gte }` kullanılıyor çünkü iki
 * eşzamanlı istek aynı bakiyeyi iki kez harcayabilir (klasik çift harcama).
 */
export async function createListing(seller: string, goldAmount: number, priceGrave: bigint) {
  if (!Number.isInteger(goldAmount) || goldAmount < MIN_GOLD) {
    throw new MarketError('gecersiz_miktar');
  }
  if (priceGrave <= 0n) throw new MarketError('gecersiz_fiyat');

  const active = await prisma.listing.count({ where: { seller, status: 'active' } });
  if (active >= MAX_ACTIVE_LISTINGS) throw new MarketError('ilan_siniri', 409);

  const id = crypto.randomUUID();
  return prisma.$transaction(async (tx) => {
    // KOŞULLU düşme: bakiye yetmiyorsa 0 satır etkilenir ve iptal ederiz.
    // `findUnique` ile okuyup sonra yazmak, iki isteğin arasına sıkışan
    // ikinci bir harcamayı kaçırırdı.
    const hit = await tx.player.updateMany({
      where: { wallet: seller, gold: { gte: goldAmount }, banned: false },
      data: { gold: { decrement: goldAmount } },
    });
    if (hit.count === 0) throw new MarketError('yetersiz_gold', 409);

    // ⚠️ Defter kaydı AYNI transaction içinde (tx). Escrow'a kilitlenen gold
    // oyuncunun bakiyesinden çıkmış görünür; nereye gittiğini defter
    // yazmazsa "gold'um kayboldu" şikâyetinin cevabı olmaz.
    await tx.ledger.create({
      data: {
        id: crypto.randomUUID(), wallet: seller, kind: 'market_list',
        gold: -goldAmount, detail: id,
      },
    });

    return tx.listing.create({
      data: { id, seller, goldAmount, priceGrave, status: 'active' },
    });
  });
}

/** İlanı iptal et — escrow'daki gold satıcıya GERİ DÖNER */
export async function cancelListing(seller: string, id: string) {
  return prisma.$transaction(async (tx) => {
    // Sadece KENDİ aktif ilanı; `updateMany` ile koşullu kapatma sayesinde
    // aynı ilan iki kez iptal edilip gold iki kez iade edilemez.
    const hit = await tx.listing.updateMany({
      where: { id, seller, status: 'active' },
      data: { status: 'cancelled', closedAt: new Date() },
    });
    if (hit.count === 0) throw new MarketError('ilan_yok', 404);

    const listing = await tx.listing.findUniqueOrThrow({ where: { id } });
    await tx.player.update({
      where: { wallet: seller },
      data: { gold: { increment: listing.goldAmount } },
    });
    await tx.ledger.create({
      data: {
        id: crypto.randomUUID(), wallet: seller, kind: 'market_cancel',
        gold: listing.goldAmount, detail: id,
      },
    });
    return listing;
  });
}

export async function listActive(limit: number, offset: number) {
  const rows = await prisma.listing.findMany({
    where: { status: 'active' },
    orderBy: { createdAt: 'desc' },
    take: Math.min(Math.max(limit, 1), 100),
    skip: Math.max(offset, 0),
  });
  return rows.map(view);
}

export async function listMine(seller: string) {
  const rows = await prisma.listing.findMany({
    where: { seller },
    orderBy: { createdAt: 'desc' },
    take: 50,
  });
  return rows.map(view);
}

/** Satıcının escrow'da bekleyen toplam gold'u — arayüzde gösterilmeli */
export async function escrowedGold(seller: string): Promise<number> {
  const agg = await prisma.listing.aggregate({
    where: { seller, status: 'active' },
    _sum: { goldAmount: true },
  });
  return agg._sum.goldAmount ?? 0;
}

function view(l: {
  id: string; seller: string; goldAmount: number; priceGrave: bigint;
  status: string; createdAt: Date; closedAt: Date | null; buyer: string | null;
}) {
  return {
    id: l.id,
    seller: l.seller,
    goldAmount: l.goldAmount,
    // ⚠️ BigInt JSON'a doğrudan gidemez — metin olarak taşınır.
    priceGrave: l.priceGrave.toString(),
    status: l.status,
    createdAt: l.createdAt.toISOString(),
    closedAt: l.closedAt?.toISOString() ?? null,
    buyer: l.buyer,
  };
}

/**
 * SATIN ALMA — token çıkana kadar KAPALI.
 *
 * Token geldiğinde buraya zincir üstü doğrulama gelecek ve şu üç kural
 * ZORUNLU (Ghost Hunter'da tam bu üçü eksikti, başarısız işlemlerin imzaları
 * kabul edilip sahte satın alma yapıldı):
 *   1. `tx.meta.err` null DEĞİLSE reddet — başarısız işlem de imza üretir
 *   2. Alıcının gönderdiği mint = $GRAVE mint'i, alıcı = satıcı cüzdanı,
 *      miktar = ilan fiyatı (komisyon düşülmüş payıyla birlikte) OLMALI
 *   3. İmza TEK KULLANIMLIK (`Listing.paymentSig` @unique) — aynı ödeme
 *      iki ilanı kapatamaz
 * Ayrıca gold devri ile ilanın kapanması AYNI transaction'da olmalı.
 */
export async function buyListing(): Promise<never> {
  throw new MarketError('token_yok', 503);
}
