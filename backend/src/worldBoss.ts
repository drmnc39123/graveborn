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
import {
  BARROW_PAYOUT_DEPTH, barrowRewardForRank, bossOfWeek, bossWeek, maxBossDamage, weekEndsAt,
} from '@game/worldBoss';
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
  /**
   * Hafta sonu etkinliği çarpanı (bkz. `@game/events`).
   *
   * ⚠️ TAVANDAN SONRA uygulanıyor. `maxBossDamage`'ı çarpmak cazipti ama o
   * tavan "bu oyuncu bu sürede en fazla ne verebilirdi" sorusunun cevabı —
   * yani bir DOĞRULAMA aracı. İkiye katlamak, etkinlik hafta sonu UYDURMA
   * hasarın tavanını da ikiye katlamak olurdu. Bonus, kabul edilmiş hasarın
   * üstüne biner.
   */
  eventMul = 1,
  now = new Date(),
): Promise<ContributeResult> {
  const { week } = await currentBoss(now);

  // Oyuncunun KENDİ kalıcı bonusları — tavan ona göre daralır.
  // Forge'u boş bir hesap, tam yükseltilmiş bir hesabın tavanını alamaz.
  const perm = mergeStats(heroById(progress.hero).stats, permanentBonus(progress.upgrades));
  const tavan = maxBossDamage(elapsedSec, perm);

  const ham = Math.max(0, Math.floor(Number(claimed) || 0));
  const capped = ham > tavan;
  // ⚠️ `capped` çarpandan ETKİLENMEZ: bonus bir kırpma değil. Etkinlik hafta
  // sonu her koşunun "şüpheli" işaretlenmesi, admin panelini kullanılamaz
  // hâle getirirdi.
  const mul = Number.isFinite(eventMul) ? Math.max(1, eventMul) : 1;
  const accepted = Math.floor(Math.min(ham, tavan) * mul);

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

// ══════════════════════════════════════════════════════════════════════
// HAFTALIK KAPANIŞ — kapanmış Barrow haftalarının ödülünü dağıt.
// ══════════════════════════════════════════════════════════════════════
// 🔴 NİYE YENİ: hasar aylardır kaydediliyordu ama ÖDENMİYORDU. Panel
// "WHAT THIS PAYS" diyordu, hiçbir yerde ödeme yoktu — haftalık kapanış
// derinlik puanına göre sıralıyor ve boss hasarı o puana hiç girmiyor.
//
// ⚠️ CRON YOK — `settleSeasons` ile aynı gerekçe: kapanış İSTEK ÜZERİNE
// tetikleniyor. Arka plan işine bağlı bir ödül, sunucu uykudayken sessizce
// kaybolur. Kimse oynamazsa dağıtım gecikir ama YAPILIR: ödül hafta
// numarasına bağlı, "şu an" ne olduğuna değil.
//
// ⚠️ ÇİFT ÖDÜL KORUMASI YAZMA SIRASINDA: `BossClose` satırı ödüllerle AYNI
// transaction'da ve İLK yaratılıyor; `week` birincil anahtar. İki istek aynı
// anda girerse ikincisi anahtara çarpar, işlem geri alınır, ödül BİR KEZ
// verilir. Sıra tersine olsaydı ödüller verilip kapanış düşerdi.

export async function settleBarrow(now = new Date()): Promise<{ week: number; winners: number }[]> {
  const week = bossWeek(now);
  const out: { week: number; winners: number }[] = [];

  // Kapanmayı bekleyen haftalar: hasar kaydı olan ama BU haftadan eskiler.
  const bekleyen = await prisma.bossDamage.findMany({
    where: { week: { lt: week }, damage: { gt: 0 } },
    select: { week: true },
    distinct: ['week'],
    orderBy: { week: 'asc' },
    take: 12,   // güvenlik tavanı — tek istekte 12 haftadan fazlasını kapatma
  });
  if (bekleyen.length === 0) return out;

  const kapali = await prisma.bossClose.findMany({
    where: { week: { in: bekleyen.map((b) => b.week) } },
    select: { week: true },
  });
  const bitti = new Set(kapali.map((c) => c.week));

  for (const { week: w } of bekleyen) {
    if (bitti.has(w)) continue;
    try { out.push(await kapatBir(w)); }
    catch {
      // Anahtar çakışması = başka bir istek aynı haftayı kapattı.
      // Hata değil, yarışın kaybeden tarafı.
    }
  }
  return out;
}

async function kapatBir(week: number): Promise<{ week: number; winners: number }> {
  /**
   * ⚠️ BANLI OYUNCU ELENİYOR ve bu kritik: hasar tam doğrulanamayan tek
   * sayı, yani şişirme en çok BURADA işe yarardı. Ban kararı sonradan
   * verilse bile hafta henüz kapanmamışsa ödül gitmez.
   * ⚠️ Eşitlikte ÖNCE VURAN kazanır (`id` artan) — rastgele değil.
   */
  /**
   * ⚠️ BANLI ELEME SORGUDA DEĞİL, KODDA. `BossDamage`in `Player` ile bir
   * ilişkisi yok (yalnız `wallet` metni tutuyor), yani `where` içinden
   * süzülemiyor — tsc bunu yakaladı. Çözüm şema değiştirmek değil, GENİŞ
   * çekip elemek: ilk 5'i alacaksak 5 satır çekmek yetmez, tepedekiler
   * banlıysa liste eksik kalırdı.
   */
  const aday = await prisma.bossDamage.findMany({
    where: { week, damage: { gt: 0 } },
    orderBy: [{ damage: 'desc' }, { id: 'asc' }],
    take: BARROW_PAYOUT_DEPTH * 6,
    select: { wallet: true, damage: true },
  });

  const oyuncular = aday.length > 0
    ? await prisma.player.findMany({
      where: { wallet: { in: aday.map((r) => r.wallet) } },
      select: { wallet: true, cosmetics: true, banned: true },
    })
    : [];
  const banli = new Set(oyuncular.filter((p) => p.banned).map((p) => p.wallet));
  /**
   * ⚠️ Hesabı SİLİNMİŞ cüzdan da eleniyor (`oyuncular`da yoksa) — ödül
   * yazılamayacak bir cüzdana sıra ayırmak, ilk 5'i dörde düşürürdü.
   */
  const kayitli = new Set(oyuncular.map((p) => p.wallet));
  const satirlar = aday
    .filter((r) => kayitli.has(r.wallet) && !banli.has(r.wallet))
    .slice(0, BARROW_PAYOUT_DEPTH);
  const sahipOlunan = new Map(oyuncular.map((p) => [
    p.wallet,
    Array.isArray(p.cosmetics)
      ? (p.cosmetics as unknown[]).filter((x): x is string => typeof x === 'string')
      : [],
  ]));

  const kayitlar: {
    id: string; week: number; wallet: string; rank: number;
    cosmetic: string | null; dust: number;
  }[] = [];
  const odemeler: { wallet: string; dust: number; cosmetic: string | null }[] = [];

  for (let i = 0; i < satirlar.length; i++) {
    const rank = i + 1;
    const odul = barrowRewardForRank(rank);
    if (!odul) continue;
    const wallet = satirlar[i].wallet;
    // Zaten sahip olunan kozmetik ikinci kez eklenmez — envanter bir küme.
    const eldeki = sahipOlunan.get(wallet) ?? [];
    const eklenecek = odul.cosmetic && !eldeki.includes(odul.cosmetic) ? odul.cosmetic : null;
    odemeler.push({ wallet, dust: odul.dust, cosmetic: eklenecek });
    kayitlar.push({
      id: crypto.randomUUID(), week, wallet, rank,
      cosmetic: odul.cosmetic ?? null, dust: odul.dust,
    });
  }

  await prisma.$transaction(async (tx) => {
    // ⚠️ İLK YAZILAN BU (bkz. başlıktaki çift ödül notu).
    await tx.bossClose.create({ data: { week, winners: satirlar.length } });

    for (const o of odemeler) {
      const eldeki = sahipOlunan.get(o.wallet) ?? [];
      await tx.player.update({
        where: { wallet: o.wallet },
        data: {
          dust: { increment: o.dust },
          ...(o.cosmetic ? { cosmetics: [...eldeki, o.cosmetic] } : {}),
        },
      });
    }

    if (kayitlar.length > 0) {
      await tx.bossAward.createMany({ data: kayitlar, skipDuplicates: true });
    }
  });

  return { week, winners: satirlar.length };
}
