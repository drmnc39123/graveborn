import { Prisma, PrismaClient } from '@prisma/client';
import type { Progress } from '@game/progress';
import { DEFAULT_HERO, heroById } from '@game/heroes';

export const prisma = new PrismaClient();

/** DB satırı → oyunun Progress arayüzü (frontend'le AYNI şekil) */
export function toProgress(p: {
  gold: number; unlockedStage: number; hero: string;
  cleared: unknown; firstClear: unknown; depthPaid: unknown; upgrades: unknown;
  charms?: unknown;
  cosmetics?: unknown; equipped?: unknown; dust?: number;
  ossuary?: number; wager?: unknown;
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
    cosmetics: Array.isArray(p.cosmetics) ? (p.cosmetics as string[]) : [],
    equipped: obj<Progress['equipped']>(p.equipped),
    dust: Math.max(0, Math.floor(Number(p.dust) || 0)),
    ossuary: Math.max(0, Math.floor(Number(p.ossuary) || 0)),
    // ⚠️ Ham JSON doğrudan geçiyor; doğrulamayı `normalize` DEĞİL, saf
    // fonksiyonlar yapıyor. Buradaki tek iş taşımak.
    wager: (p.wager ?? null) as Progress['wager'],
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
    cosmetics: p.cosmetics as object,
    equipped: p.equipped as object,
    dust: Math.max(0, Math.floor(p.dust)),
    ossuary: Math.max(0, Math.floor(p.ossuary)),
    // ⚠️ `undefined` DEĞİL `Prisma.DbNull`. Prisma'da `undefined` "bu alana
    // dokunma" demek — bahis o zaman ASLA temizlenemez ve koşu açıldıktan
    // sonra da kayıtta durup ikinci kez yanardı. Nullable Json'u boşaltmanın
    // tek doğru yolu DbNull.
    wager: p.wager === null ? Prisma.DbNull : (p.wager as object),
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
