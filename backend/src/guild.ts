// LONCALAR — sunucu tarafı.
//
// Tasarım gerekçesi ve sayılar `@game/guild`'de. Burada yalnızca veritabanı
// işi ve YARIŞ KORUMASI var.
//
// ⚠️ HER YAZMA KOŞULLU. Bu oturumda kapatılan "5 eşzamanlı çekiliş" açığının
// dersi: oku-değiştir-yaz her yerde yarış açar. Loncada bunun bedeli somut —
// üye tavanı aşılır, gold iki kez düşer, aynı etiketten iki lonca doğar.

import crypto from 'node:crypto';
import {
  GUILD_COST, guildCap, guildLevel, nextGuildLevel, validateName, validateTag,
} from '@game/guild';
import { prisma } from './db.js';
import { withLedger } from './ledger.js';

export class GuildError extends Error {
  constructor(public code: string, public status = 400) { super(code); }
}

export interface GuildView {
  id: string;
  name: string;
  tag: string;
  owner: string;
  level: number;
  treasury: number;
  donated: number;
  members: { wallet: string; hero: string; bestRating: number }[];
  cap: number;
  /** üyelerin aldığı XP bonusu */
  growth: number;
  /** sonraki seviye için gereken hazine (yoksa null) */
  nextCost: number | null;
}

async function view(id: string): Promise<GuildView | null> {
  const g = await prisma.guild.findUnique({
    where: { id },
    include: {
      members: {
        select: { wallet: true, hero: true, bestRating: true },
        orderBy: { bestRating: 'desc' },
        take: 32,
      },
    },
  });
  if (!g) return null;
  const next = nextGuildLevel(g.level);
  return {
    id: g.id, name: g.name, tag: g.tag, owner: g.owner,
    level: g.level, treasury: g.treasury, donated: g.donated,
    members: g.members,
    cap: guildCap(g.level),
    growth: guildLevel(g.level).growth,
    nextCost: next ? next.cost : null,
  };
}

/** Oyuncunun loncası (yoksa null) */
export async function myGuild(wallet: string): Promise<GuildView | null> {
  const p = await prisma.player.findUnique({ where: { wallet }, select: { guildId: true } });
  return p?.guildId ? view(p.guildId) : null;
}

/** Katılınabilecek loncalar — dolu olanlar da görünür, sebebi belli olsun */
export async function listGuilds(limit = 40) {
  const rows = await prisma.guild.findMany({
    orderBy: [{ level: 'desc' }, { donated: 'desc' }],
    take: Math.min(Math.max(limit, 1), 100),
    include: { _count: { select: { members: true } } },
  });
  return rows.map((g) => ({
    id: g.id, name: g.name, tag: g.tag, level: g.level,
    members: g._count.members, cap: guildCap(g.level),
  }));
}

/**
 * Lonca kur.
 *
 * ⚠️ Gold `withLedger` üzerinden düşüyor — yani Crypt Vault katkısı ve defter
 * kaydı otomatik. Elle `player.update` yazmak o iki şeyi sessizce atlardı.
 */
export async function createGuild(
  wallet: string, rev: number, adRaw: unknown, etiketRaw: unknown,
): Promise<GuildView> {
  const ad = validateName(adRaw);
  if (!ad.ok) throw new GuildError(ad.reason);
  const etiket = validateTag(etiketRaw);
  if (!etiket.ok) throw new GuildError(etiket.reason);

  const p = await prisma.player.findUnique({
    where: { wallet }, select: { guildId: true, gold: true, banned: true },
  });
  if (!p || p.banned) throw new GuildError('yasakli', 403);
  if (p.guildId) throw new GuildError('zaten_loncada');
  if (p.gold < GUILD_COST) throw new GuildError('yetersiz_gold');

  const id = crypto.randomUUID();
  try {
    await prisma.guild.create({
      data: { id, name: ad.value, tag: etiket.value, owner: wallet, memberCount: 1 },
    });
  } catch {
    // `tag` tekil — çakışma tek olası sebep
    throw new GuildError('etiket_kullanimda');
  }

  try {
    // ⚠️ Gold KOŞULLU düşüyor (`withLedger`in rev kilidi). Kurucu aynı anda
    // başka bir alım yaptıysa bu işlem düşer ve lonca ortada kalmaz —
    // aşağıdaki catch onu siliyor.
    await withLedger(wallet, { gold: { decrement: GUILD_COST }, guildId: id },
      { kind: 'guild', gold: -GUILD_COST, detail: `[${etiket.value}] ${ad.value}` }, rev);
  } catch (e) {
    await prisma.guild.delete({ where: { id } }).catch(() => {});
    throw e;
  }

  return (await view(id))!;
}

/**
 * Loncaya katıl.
 *
 * ⚠️ TAVAN KONTROLÜ YAZMA SIRASINDA. Önce sayıp sonra yazmak klasik yarış:
 * son boş yere iki kişi aynı anda girer. Sayım transaction içinde ve üyelik
 * `guildId: null` şartıyla yazılıyor.
 */
export async function joinGuild(wallet: string, guildId: string): Promise<GuildView> {
  const g = await prisma.guild.findUnique({ where: { id: guildId }, select: { level: true } });
  if (!g) throw new GuildError('lonca_yok', 404);

  await prisma.$transaction(async (tx) => {
    // ⚠️ ÖNCE SAYAÇ, TEK SATIRLIK KOŞULLU YAZMAYLA.
    //
    // İlk sürüm `count()` okuyup sonra yazıyordu ve ÖLÇÜLDÜ: 5 kişilik
    // loncaya 8 eşzamanlı istekten 6'sı girdi. Postgres'in varsayılan
    // READ COMMITTED izolasyonunda iki istek de aynı sayıyı okuyup ikisi de
    // "tavan aşılmadı" sanıyor. Bir tablo genelindeki toplamı okuyarak
    // korunamaz; sayaç SATIRDA olmalı ki koşul yazmanın kendisinde olsun.
    const yer = await tx.guild.updateMany({
      where: { id: guildId, memberCount: { lt: guildCap(g.level) } },
      data: { memberCount: { increment: 1 } },
    });
    if (yer.count === 0) throw new GuildError('lonca_dolu');

    const hit = await tx.player.updateMany({
      where: { wallet, guildId: null, banned: false },
      data: { guildId },
    });
    // ⚠️ Buradan atmak sayacı da GERİ ALIR (aynı transaction). Ayrı
    // transaction olsaydı yer ayrılmış ama kimse girmemiş olurdu — lonca
    // zamanla "dolu ama boş" hâle gelirdi.
    if (hit.count === 0) throw new GuildError('zaten_loncada');
  });

  return (await view(guildId))!;
}

/**
 * Loncadan ayrıl.
 *
 * ⚠️ KURUCU AYRILIRSA LONCA DAĞILIR. Devir mekanizması bilerek yok: "sahibi
 * kayıp lonca" en sık görülen ölü içerik, ve devir kimin hakkı olduğu
 * tartışmasını doğurur. Kurucunun ayrılması bir karar olmalı, kaza değil —
 * arayüz bunu açıkça söylüyor.
 */
export async function leaveGuild(wallet: string): Promise<{ dagildi: boolean }> {
  const p = await prisma.player.findUnique({ where: { wallet }, select: { guildId: true } });
  if (!p?.guildId) throw new GuildError('loncada_degil');
  const g = await prisma.guild.findUnique({ where: { id: p.guildId }, select: { owner: true } });
  if (!g) {
    // Lonca silinmiş ama oyuncunun alanı boşalmamış — düzelt ve çık
    await prisma.player.update({ where: { wallet }, data: { guildId: null } });
    return { dagildi: false };
  }

  if (g.owner === wallet) {
    // ⚠️ `onDelete: SetNull` sayesinde üyelerin `guildId`'si otomatik boşalıyor
    await prisma.guild.delete({ where: { id: p.guildId } });
    return { dagildi: true };
  }
  await prisma.$transaction([
    prisma.player.update({ where: { wallet }, data: { guildId: null } }),
    // ⚠️ Sayaç sıfırın altına inmesin: bozuk bir kayıt loncayı sonsuza kadar
    // "dolu" gösterebilirdi.
    prisma.guild.updateMany({
      where: { id: p.guildId, memberCount: { gt: 0 } },
      data: { memberCount: { decrement: 1 } },
    }),
  ]);
  return { dagildi: false };
}

/**
 * Hazineye bağış.
 *
 * ⚠️ BAĞIŞ GERİ ÇEKİLEMEZ ve bu tasarımın kendisi. Çekilebilseydi lonca,
 * oyuncular arası gold transfer kanalı olurdu: kur, doldur, dağıt, kapat.
 * Hazine yalnızca seviye satın alır.
 */
export async function donate(wallet: string, rev: number, miktar: unknown): Promise<GuildView> {
  const m = Math.floor(Number(miktar) || 0);
  if (m < 100) throw new GuildError('cok_kucuk');

  const p = await prisma.player.findUnique({
    where: { wallet }, select: { guildId: true, gold: true, banned: true },
  });
  if (!p || p.banned) throw new GuildError('yasakli', 403);
  if (!p.guildId) throw new GuildError('loncada_degil');
  if (p.gold < m) throw new GuildError('yetersiz_gold');

  await withLedger(wallet, { gold: { decrement: m } },
    { kind: 'guild', gold: -m, detail: 'donation' }, rev);
  await prisma.guild.update({
    where: { id: p.guildId },
    data: { treasury: { increment: m }, donated: { increment: m } },
  });

  return (await view(p.guildId))!;
}

/**
 * Seviye yükselt — hazineden ödenir.
 *
 * ⚠️ Yalnızca KURUCU yükseltebilir. Herkes yükseltebilseydi biri hazineyi
 * loncanın istemediği bir anda boşaltabilirdi.
 * ⚠️ Hazine kontrolü KOŞULLU yazmada (`treasury: { gte: cost }`), okuyup
 * yazmakta değil — iki eşzamanlı yükseltme hazineyi negatife düşürürdü.
 */
export async function upgradeGuild(wallet: string): Promise<GuildView> {
  const p = await prisma.player.findUnique({ where: { wallet }, select: { guildId: true } });
  if (!p?.guildId) throw new GuildError('loncada_degil');
  const g = await prisma.guild.findUnique({
    where: { id: p.guildId }, select: { owner: true, level: true },
  });
  if (!g) throw new GuildError('lonca_yok', 404);
  if (g.owner !== wallet) throw new GuildError('sadece_kurucu', 403);

  const next = nextGuildLevel(g.level);
  if (!next) throw new GuildError('zaten_max');

  const hit = await prisma.guild.updateMany({
    where: { id: p.guildId, level: g.level, treasury: { gte: next.cost } },
    data: { treasury: { decrement: next.cost }, level: next.level },
  });
  if (hit.count === 0) throw new GuildError('hazine_yetersiz');

  return (await view(p.guildId))!;
}

/**
 * Koşuya taşınacak XP bonusu — loncasızsa 0.
 *
 * ⚠️ İSTEMCİ BUNU BEYAN EDEMEZ. `/run/start` burayı çağırır; bonusun kaynağı
 * her zaman veritabanı olmalı, aksi hâlde "loncam 5. seviye" demek yeterdi.
 */
export async function growthOf(wallet: string): Promise<number> {
  const p = await prisma.player.findUnique({
    where: { wallet }, select: { guild: { select: { level: true } } },
  });
  return p?.guild ? guildLevel(p.guild.level).growth : 0;
}

/**
 * Sohbette/tabloda gösterilecek etiket VE lonca kimliği.
 *
 * ⚠️ İKİSİ TEK SORGUDA. Ayrı `tagOf` + `myGuild` çağrısı iki gidiş-dönüş
 * demekti; `presence.ts` bunu bağlantı başına çağırıyor ve lonca kanalı
 * için `id`ye de ihtiyacı var. `myGuild` burada KULLANILAMAZ: o tam
 * `GuildView` kuruyor (üye listesi, seviye, maliyet) — bir etiket için
 * ödenecek bedel değil.
 */
export async function tagOf(wallet: string): Promise<{ id: string; tag: string } | null> {
  const p = await prisma.player.findUnique({
    where: { wallet }, select: { guild: { select: { id: true, tag: true } } },
  });
  return p?.guild ? { id: p.guild.id, tag: p.guild.tag } : null;
}
