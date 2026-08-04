// HAFTALIK ORTAK BOSS — sunucu tarafı.
//
// ⚠️ ORTAK CAN TEK GERÇEKTİR. Herkes kendi koşusunda vuruyor ama can havuzu
// burada; istemcinin "boss'un canı şu kadar kaldı" demesi mümkün değil.
//
// ⚠️ HASAR İDDİASI TAM DOĞRULANAMIYOR ve bu bilinçli bir kabul. Motor
// deterministik ve DOM'suz, yani koşu sunucuda yeniden oynatılabilir — AMA
// girdiye bağlı ve girdi kaydedilmiyor. 60Hz'de iki eksenlik girdiyi
// kaydetmek/taşımak, bir SIRALAMA için ödenmeyecek bir maliyet.
//
// Bunun yerine iki katmanlı savunma:
//   1. yapısal tavan (`maxBossDamage`) — "en fazla ne olabilirdi"
//   2. ÖDÜL GOLD DEĞİL — şişirilmiş hasarın maliyeti sadece bir sıralama
//      satırı; ekonomiye hiç dokunmuyor (bkz. worldBoss.ts başlığı)

import crypto from 'node:crypto';
import { bossOfWeek, bossWeek, maxBossDamage, weekEndsAt } from '@game/worldBoss';
import { permanentBonus } from '@game/forge';
import { heroById } from '@game/heroes';
import { mergeStats } from '@game/heroes';
import { prisma } from './db.js';
import type { Progress } from '@game/progress';

/** Bu haftanın boss durumu — yoksa açılır */
export async function currentBoss(now = new Date()) {
  const week = bossWeek(now);
  const def = bossOfWeek(week);

  const row = await prisma.worldBoss.upsert({
    where: { week },
    update: {},
    create: { week, bossId: def.id, maxHp: def.hp, hp: def.hp },
  });
  return { week, def, row };
}

export interface BossState {
  week: number;
  bossId: string;
  name: string;
  epithet: string;
  art: string;
  hp: number;
  maxHp: number;
  /** hafta bitiş zamanı (ms) — geri sayım */
  endsAt: number;
  defeated: boolean;
  /** en çok hasar verenler */
  top: { wallet: string; damage: number }[];
  /** isteyen oyuncunun kendi katkısı ve sırası */
  me: { damage: number; rank: number } | null;
}

export async function bossState(wallet?: string, now = new Date()): Promise<BossState> {
  const { week, def, row } = await currentBoss(now);

  const top = await prisma.bossDamage.findMany({
    where: { week },
    orderBy: { damage: 'desc' },
    take: 20,
    select: { wallet: true, damage: true },
  });

  let me: BossState['me'] = null;
  if (wallet) {
    const mine = await prisma.bossDamage.findUnique({
      where: { week_wallet: { week, wallet } },
      select: { damage: true },
    });
    if (mine) {
      // ⚠️ Sıra SAYIMLA bulunuyor, tabloyu çekip indeks aramakla değil —
      // leaderboard.rankOf'taki gerekçenin aynısı, indeksten cevaplanıyor.
      const ahead = await prisma.bossDamage.count({
        where: { week, damage: { gt: mine.damage } },
      });
      me = { damage: mine.damage, rank: ahead + 1 };
    }
  }

  return {
    week,
    bossId: row.bossId,
    name: def.name,
    epithet: def.epithet,
    art: def.art,
    hp: row.hp,
    maxHp: row.maxHp,
    endsAt: weekEndsAt(week),
    defeated: row.hp <= 0,
    top: top.map((t) => ({ wallet: t.wallet, damage: t.damage })),
    me,
  };
}

export interface ContributeResult {
  accepted: number;
  claimed: number;
  capped: boolean;
  state: BossState;
}

/**
 * Koşu sonundaki hasarı ortak cana işle.
 *
 * ⚠️ `elapsedSec` SUNUCUNUN ölçtüğü süre (Run.startedAt farkı), istemcinin
 * bildirdiği değil. Tavan buna bağlı olduğu için istemciden alınsaydı tavan
 * da istemcinin elinde olurdu.
 */
export async function contribute(
  wallet: string, progress: Progress, claimed: number, elapsedSec: number,
  now = new Date(),
): Promise<ContributeResult> {
  const { week } = await currentBoss(now);

  // Oyuncunun KENDİ kalıcı bonusları — tavan ona göre daralır.
  // Forge'u boş bir hesap, tam yükseltilmiş bir hesabın tavanını alamaz.
  const perm = mergeStats(heroById(progress.hero).stats, permanentBonus(progress.upgrades));
  const tavan = maxBossDamage(elapsedSec, perm);

  const ham = Math.max(0, Math.floor(Number(claimed) || 0));
  const capped = ham > tavan;
  const accepted = Math.min(ham, tavan);

  if (accepted > 0) {
    await prisma.$transaction([
      // Ortak can — ASLA sıfırın altına inmez
      prisma.$executeRaw`
        UPDATE "WorldBoss" SET hp = GREATEST(0, hp - ${accepted}) WHERE week = ${week}
      `,
      prisma.bossDamage.upsert({
        where: { week_wallet: { week, wallet } },
        update: { damage: { increment: accepted }, runs: { increment: 1 } },
        create: { id: crypto.randomUUID(), week, wallet, damage: accepted, runs: 1 },
      }),
    ]);
  }

  return { accepted, claimed: ham, capped, state: await bossState(wallet, now) };
}
