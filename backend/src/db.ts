import { PrismaClient } from '@prisma/client';
import type { Progress } from '@game/progress';
import { DEFAULT_HERO, heroById } from '@game/heroes';

export const prisma = new PrismaClient();

/** DB satırı → oyunun Progress arayüzü (frontend'le AYNI şekil) */
export function toProgress(p: {
  gold: number; unlockedStage: number; hero: string;
  cleared: unknown; firstClear: unknown; depthPaid: unknown; upgrades: unknown;
  charms?: unknown;
}): Progress {
  const obj = <T,>(v: unknown): T => (v && typeof v === 'object' ? (v as T) : ({} as T));
  return {
    gold: p.gold,
    unlockedStage: p.unlockedStage,
    hero: heroById(p.hero).id,
    cleared: obj<Record<number, boolean>>(p.cleared),
    firstClear: obj<Record<number, boolean>>(p.firstClear),
    depthPaid: obj<Record<number, number>>(p.depthPaid),
    upgrades: obj<Record<string, number>>(p.upgrades),
    charms: Array.isArray(p.charms) ? (p.charms as string[]) : [],
  };
}

/** Progress → DB alanları */
export function fromProgress(p: Progress) {
  return {
    gold: Math.max(0, Math.floor(p.gold)),
    unlockedStage: p.unlockedStage,
    hero: heroById(p.hero).id,
    cleared: p.cleared as object,
    firstClear: p.firstClear as object,
    depthPaid: p.depthPaid as object,
    upgrades: p.upgrades as object,
    charms: p.charms as object,
  };
}

/** Oyuncu yoksa oluştur — ilk cüzdan girişinde kayıt açılır */
export async function getOrCreatePlayer(wallet: string) {
  return prisma.player.upsert({
    where: { wallet },
    update: { lastSeen: new Date() },
    create: { wallet, hero: DEFAULT_HERO },
  });
}
