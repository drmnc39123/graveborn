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
  achievements?: unknown; streak?: unknown;
  kills?: unknown; pets?: unknown; petLevels?: unknown;
  petFused?: unknown; equippedPets?: unknown; petSlot2?: boolean;
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
    achievements: Array.isArray(p.achievements) ? (p.achievements as string[]) : [],
    // ⚠️ `obj<T>()` eksik alanı `{}` yapar ve `streak.days` UNDEFINED kalırdı;
    // `claimStreak` içinde `days + 1` o zaman NaN üretir ve seri sessizce
    // bozulur. Şekil burada TAM kurulmalı.
    streak: {
      days: Math.max(0, Math.floor(Number((p.streak as { days?: unknown })?.days) || 0)),
      last: typeof (p.streak as { last?: unknown })?.last === 'string'
        ? ((p.streak as { last: string }).last) : '',
    },
    // ── THE BINDING ──
    // ⚠️ Ham JSON taşınıyor; kırpma ve doğrulama saf fonksiyonların işi
    // (frontend `normalize`, sunucu `pets.ts`). Buradaki tek iş TAŞIMAK —
    // aynı kuralı iki yerde yazmak ayrışma riskidir.
    kills: obj<Record<string, number>>(p.kills),
    pets: obj<Record<string, number>>(p.pets),
    petLevels: obj<Record<string, number>>(p.petLevels),
    petFused: Array.isArray(p.petFused) ? (p.petFused as string[]) : [],
    equippedPets: Array.isArray(p.equippedPets) ? (p.equippedPets as string[]) : [],
    petSlot2: p.petSlot2 === true,
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
    achievements: p.achievements as object,
    streak: p.streak as object,
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

/**
 * Progress yazımı — İYİMSER KİLİTLİ. Gold hareketi olmayan yollar için.
 * (Gold hareketi varsa `withLedger(..., rev)` kullan; o da aynı kilidi kurar
 * ama defter kaydını da aynı transaction'a koyar.)
 *
 * ⚠️ NİYE ZORUNLU: `fromProgress` MUTLAK değer yazıyor. Koruma olmadan iki
 * eşzamanlı istek aynı `before`'u okuyup birbirini eziyor. ÖLÇÜLDÜ: tam
 * 1 çekilişlik gold'u olan hesaba 5 eşzamanlı istek atınca 5'i de geçti.
 * Ödül veren yollarda (başarım, seri) bu doğrudan çift ödeme demek.
 */
export async function saveProgress(
  wallet: string, rev: number, data: ReturnType<typeof fromProgress>,
) {
  const hit = await prisma.player.updateMany({
    where: { wallet, rev },
    data: { ...data, rev: rev + 1 },
  });
  if (hit.count === 0) throw new YarisHatasi();
  return prisma.player.findUniqueOrThrow({ where: { wallet } });
}

/** Araya eşzamanlı bir yazım girdi — istemci isteği tekrarlamalı (409). */
export class YarisHatasi extends Error {
  constructor() { super('es_zamanli_degisim'); this.name = 'YarisHatasi'; }
}
