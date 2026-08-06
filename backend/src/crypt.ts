// THE CRYPT DEED — sunucu tarafı.
//
// Tasarım gerekçesi `@game/crypt`'te. Buradaki tek iş, o matematiği
// veritabanında YAPISAL olarak garantiye almak:
//
//   kasadan çıkan ≤ kasaya giren
//
// Kasa gerçek bir bakiye satırı; içine girmemiş gold çıkamaz. Oyun yeni gold
// BASMIYOR, harcayandan deed sahibine AKTARIYOR.

import crypto from 'node:crypto';
import { CRYPT_TIERS, cryptContribution, cryptShare, cryptTier } from '@game/crypt';
import { seasonWeek } from '@game/season';
import type { Prisma } from '@prisma/client';
import { prisma } from './db.js';
import type { LedgerKind } from './ledger.js';

/**
 * Hangi harcamalar kasaya katkı yapar.
 *
 * ⚠️ `market_list` YOK: o bir ESCROW, iptal edilince gold geri dönüyor.
 * Katkı alsaydık oyuncu ilan açıp iptal ederek kasayı kendi gold'uyla
 * doldurup payını geri çekerdi — küçük ama gerçek bir kaçak.
 * ⚠️ `run` YOK: o musluk, harcama değil.
 */
const SINK_KINDS: ReadonlySet<string> = new Set<LedgerKind>([
  'forge', 'charm', 'reliquary', 'ossuary', 'wager', 'guild', 'skill',
]);

export function isCryptSink(kind: string, gold: number): boolean {
  return gold < 0 && SINK_KINDS.has(kind);
}

/**
 * Bir sink harcamasının payını kasaya ekle.
 *
 * ⚠️ ÇAĞIRANIN TRANSACTION'INDA çalışmalı — harcama ile katkı ayrı
 * transaction'larda olursa biri başarısız olunca kasa ile defter ayrışır ve
 * `paid <= filled` denetimi anlamını kaybeder.
 */
export async function contributeToVault(
  tx: Prisma.TransactionClient, kind: string, gold: number,
): Promise<number> {
  if (!isCryptSink(kind, gold)) return 0;
  const pay = cryptContribution(Math.abs(gold));
  if (pay <= 0) return 0;
  await tx.cryptVault.upsert({
    where: { id: 1 },
    update: { balance: { increment: pay }, filled: { increment: pay } },
    create: { id: 1, balance: pay, filled: pay, paid: 0 },
  });
  return pay;
}

export interface VaultState {
  balance: number;
  filled: number;
  paid: number;
  /** kasayı paylaşan toplam ağırlık */
  totalWeight: number;
  owners: number;
}

/** Kasanın durumu + kaç deed sahibi paylaşıyor */
export async function vaultState(): Promise<VaultState> {
  const [v, sahipler] = await Promise.all([
    prisma.cryptVault.findUnique({ where: { id: 1 } }),
    prisma.player.groupBy({
      by: ['cryptTier'],
      where: { cryptTier: { gt: 0 }, banned: false },
      _count: { _all: true },
    }),
  ]);
  let totalWeight = 0, owners = 0;
  for (const g of sahipler) {
    const t = cryptTier(g.cryptTier);
    if (!t) continue;
    totalWeight += t.weight * g._count._all;
    owners += g._count._all;
  }
  return {
    balance: v?.balance ?? 0, filled: v?.filled ?? 0, paid: v?.paid ?? 0,
    totalWeight, owners,
  };
}

export type ClaimResult =
  | { ok: true; amount: number; week: number }
  | { ok: false; reason: 'deed_yok' | 'bu_hafta_alindi' | 'kasa_bos' };

/**
 * Haftalık çekim.
 *
 * ⚠️ ÜÇ KORUMA DA KOŞULLU YAZMA İLE, okuyup-yazmakla DEĞİL:
 *  1. `cryptClaimedWeek: { lt: week }` — aynı hafta iki kez çekilemez.
 *  2. `balance: { gte: pay }` — kasada olmayan gold ödenemez.
 * İkisi de `updateMany` şartı; araya giren eşzamanlı istek eşleşmez ve düşer.
 * Bu tam olarak bu oturumda kapatılan "5 eşzamanlı çekiliş" açığının aynısı.
 */
export async function claimCrypt(wallet: string, now = new Date()): Promise<ClaimResult> {
  const week = seasonWeek(now);
  const p = await prisma.player.findUnique({
    where: { wallet },
    select: { cryptTier: true, cryptClaimedWeek: true, banned: true },
  });
  if (!p || p.banned || p.cryptTier <= 0) return { ok: false, reason: 'deed_yok' };
  if (p.cryptClaimedWeek >= week) return { ok: false, reason: 'bu_hafta_alindi' };

  const t = cryptTier(p.cryptTier);
  if (!t) return { ok: false, reason: 'deed_yok' };

  const st = await vaultState();
  const pay = cryptShare(st.balance, t.weight, st.totalWeight);
  if (pay <= 0) return { ok: false, reason: 'kasa_bos' };

  try {
    return await prisma.$transaction(async (tx) => {
      // ⚠️ ÖNCE KASA. Bakiye yetmiyorsa hiç kimseye ödeme yapılmamalı.
      const kasa = await tx.cryptVault.updateMany({
        where: { id: 1, balance: { gte: pay } },
        data: { balance: { decrement: pay }, paid: { increment: pay } },
      });
      if (kasa.count === 0) throw new Error('kasa_yetersiz');

      const oyuncu = await tx.player.updateMany({
        where: { wallet, cryptClaimedWeek: { lt: week } },
        data: { gold: { increment: pay }, cryptClaimedWeek: week },
      });
      if (oyuncu.count === 0) throw new Error('zaten_alindi');

      await tx.ledger.create({
        data: {
          id: crypto.randomUUID(), wallet, kind: 'crypt', gold: pay,
          detail: `T${t.tier} · week ${week}`,
        },
      });
      return { ok: true as const, amount: pay, week };
    });
  } catch {
    return { ok: false, reason: 'bu_hafta_alindi' };
  }
}

/** Deed satın al / yükselt — bedel `cryptUpgradeCost`, farkı öder */
export function deedList() {
  return CRYPT_TIERS;
}
