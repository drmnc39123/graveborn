// PvP SEZONU — sunucu tarafı kapanış.
//
// Tasarım ve sayılar `@game/pvpSeason`'da. Burada üç iş var: haftayı
// kapatmak, ödülleri BİR KEZ vermek ve puanları yumuşak sıfırlamak.
//
// ⚠️ CRON YOK, TEMBEL KAPANIŞ. `season.ts`'teki desenin aynısı: uyuyan bir
// sunucuda arka plan işi çalışmaz. Tablo okunduğunda geçmiş haftalar
// kapatılıyor — yani "sıralamayı aç" aynı zamanda "geçen haftayı kapat"
// demek. Tekrarlanabilir ve zararsız.
//
// ⚠️ KAPANIŞ MÜHRÜ İLK YAZILIR. Ödüller önce verilseydi, mühür yazılırken
// çakışan bir istek ödülleri ikinci kez dağıtırdı.

import crypto from 'node:crypto';
import {
  PVP_PAYOUT_DEPTH, PVP_PLACEMENT, pvpReward, softReset,
} from '@game/pvpSeason';
import { seasonWeek } from '@game/season';
import { Prisma } from '@prisma/client';
import { prisma } from './db.js';

export interface PvpRow {
  rank: number; wallet: string; rating: number;
  wins: number; losses: number; matches: number; hero: string;
}

/**
 * Bu haftanın PvP tablosu.
 *
 * ⚠️ YERLEŞİM ŞARTI (`duelMatches >= PVP_PLACEMENT`). Olmadan tek şanslı
 * maçını kazanıp 1016'da duran biri, 40 maç oynamış 1400'lüğün üstünde
 * görünürdü — daha kötüsü, ödülü alıp bir daha hiç oynamayan hesaplar
 * tepeye çakılırdı.
 *
 * ⚠️ `duelWeek` FİLTRESİ: geçen sezonun puanı bu sezonun tablosunda
 * görünmez. Kapanış tembel olduğu için bu filtre şart — henüz kapanmamış
 * eski kayıtlar aksi hâlde tabloya sızardı.
 */
export async function pvpBoard(wallet: string | null, now = new Date(), limit = 20): Promise<{
  week: number;
  rows: PvpRow[];
  me: PvpRow | null;
  placement: number;
}> {
  const week = seasonWeek(now);
  const kosul = { banned: false, duelWeek: week, duelMatches: { gte: PVP_PLACEMENT } };
  const rows = await prisma.player.findMany({
    where: kosul,
    orderBy: [{ duelRating: 'desc' }, { duelWins: 'desc' }],
    take: Math.min(Math.max(limit, 1), 50),
    select: { wallet: true, duelRating: true, duelWins: true, duelLosses: true, duelMatches: true, hero: true },
  });
  const list: PvpRow[] = rows.map((r, i) => ({
    rank: i + 1, wallet: r.wallet, rating: r.duelRating,
    wins: r.duelWins, losses: r.duelLosses, matches: r.duelMatches, hero: r.hero,
  }));

  let me: PvpRow | null = null;
  if (wallet) {
    const p = await prisma.player.findUnique({
      where: { wallet },
      select: { duelRating: true, duelWins: true, duelLosses: true, duelMatches: true, hero: true, banned: true, duelWeek: true },
    });
    if (p && !p.banned && p.duelWeek === week) {
      const icinde = list.find((r) => r.wallet === wallet);
      if (icinde) me = icinde;
      else {
        // ⚠️ Tablonun dışındaysam sıram YİNE görünmeli. Ama yerleşimi
        // tamamlamadıysam sıra YOK — "kaç maç kaldı" bilgisi `matches`'ta.
        const yerlesti = p.duelMatches >= PVP_PLACEMENT;
        const ustum = yerlesti
          ? await prisma.player.count({ where: { ...kosul, duelRating: { gt: p.duelRating } } })
          : -1;
        me = {
          rank: yerlesti ? ustum + 1 : 0,
          wallet, rating: p.duelRating, wins: p.duelWins, losses: p.duelLosses,
          matches: p.duelMatches, hero: p.hero,
        };
      }
    }
  }
  return { week, rows: list, me, placement: PVP_PLACEMENT };
}

/**
 * Kapanmayı bekleyen PvP haftalarını kapat.
 *
 * ⚠️ Bir oyuncunun puanı ancak KENDİ haftası kapanınca sıfırlanıyor. Toplu
 * bir "herkesi sıfırla" yazımı, o hafta hiç oynamamış (ve dolayısıyla
 * `duelWeek`'i eski olan) oyuncuları da vurup geçmiş sezonun sonucunu
 * silerdi.
 */
export async function settlePvpSeasons(now = new Date()): Promise<{ week: number; winners: number }[]> {
  const week = seasonWeek(now);
  const out: { week: number; winners: number }[] = [];

  const bekleyen = await prisma.player.findMany({
    where: { duelWeek: { lt: week, gt: 0 }, duelMatches: { gt: 0 } },
    select: { duelWeek: true },
    distinct: ['duelWeek'],
    orderBy: { duelWeek: 'asc' },
    take: 12,   // güvenlik tavanı — tek istekte 12 haftadan fazlasını kapatma
  });
  if (bekleyen.length === 0) return out;

  const kapali = await prisma.pvpClose.findMany({
    where: { week: { in: bekleyen.map((p) => p.duelWeek) } },
    select: { week: true },
  });
  const bitti = new Set(kapali.map((c) => c.week));

  for (const { duelWeek: w } of bekleyen) {
    if (bitti.has(w)) continue;
    try { out.push(await kapatOne(w)); }
    catch { /* anahtar çakışması = başka istek kapattı; yarışın kaybeden tarafı */ }
  }
  return out;
}

async function kapatOne(week: number): Promise<{ week: number; winners: number }> {
  const kazananlar = await prisma.player.findMany({
    where: { banned: false, duelWeek: week, duelMatches: { gte: PVP_PLACEMENT } },
    orderBy: [{ duelRating: 'desc' }, { duelWins: 'desc' }],
    take: PVP_PAYOUT_DEPTH,
    select: { wallet: true, duelRating: true, cosmetics: true },
  });

  return prisma.$transaction(async (tx) => {
    // ⚠️ İLK YAZILAN BU — bkz. dosya başlığı.
    await tx.pvpClose.create({ data: { week, winners: kazananlar.length } });

    for (let i = 0; i < kazananlar.length; i++) {
      const p = kazananlar[i];
      const odul = pvpReward(i + 1);
      if (!odul) continue;
      const sahip = (p.cosmetics as string[] | null) ?? [];
      // ⚠️ Zaten sahip olunan kozmetik TEKRAR EKLENMEZ: aynı unvanı iki kez
      // kazanan oyuncunun listesinde iki kopya belirirdi.
      const yeni = odul.cosmetic && !sahip.includes(odul.cosmetic)
        ? [...sahip, odul.cosmetic] : sahip;
      await tx.player.update({
        where: { wallet: p.wallet },
        data: {
          // ⚠️ Toz `increment` ile: kapanış sırasında oyuncu düello oynayıp
          // toz kazanabilir; mutlak yazma onu silerdi.
          dust: { increment: odul.dust },
          ...(yeni.length !== sahip.length ? { cosmetics: yeni } : {}),
        },
      });
      await tx.pvpAward.create({
        data: {
          id: crypto.randomUUID(), week, wallet: p.wallet, rank: i + 1,
          rating: p.duelRating, cosmetic: odul.cosmetic ?? null, dust: odul.dust,
        },
      });
    }

    // ── YUMUŞAK SIFIRLAMA ──
    // ⚠️ SADECE O HAFTAYA AİT KAYITLAR. `duelWeek` filtresi olmadan, o hafta
    // hiç oynamamış oyuncular da sıfırlanır ve geçmiş sezonun sonucu silinir.
    const oyuncular = await tx.player.findMany({
      where: { duelWeek: week },
      select: { wallet: true, duelRating: true, duelPeak: true },
    });
    for (const p of oyuncular) {
      await tx.player.update({
        where: { wallet: p.wallet },
        data: {
          duelRating: softReset(p.duelRating),
          // ⚠️ ZİRVE KORUNUYOR: sıfırlama kimliği silmemeli, yoksa ceza gibi gelir
          duelPeak: Math.max(p.duelPeak, p.duelRating),
          duelMatches: 0,
          duelWeek: 0,
        },
      });
    }

    return { week, winners: kazananlar.length };
  }, { timeout: 20_000 });
}

/** Oyuncunun geçmiş sezon ödülleri — "geçen hafta 3. oldun" */
export async function pvpAwards(wallet: string, limit = 8) {
  const rows = await prisma.pvpAward.findMany({
    where: { wallet }, orderBy: { week: 'desc' }, take: limit,
  });
  return rows.map((a) => ({
    week: a.week, rank: a.rank, rating: a.rating,
    cosmetic: a.cosmetic, dust: a.dust,
  }));
}

/**
 * Maç sonucunu sezona işle — `settleDuel` ve `settleArena` bunu çağırır.
 *
 * ⚠️ HAFTA DEĞİŞTİYSE PUAN DEVREDİLMEZ, kapanış onu yapıyor. Burada sadece
 * "bu puan bu haftaya ait" işaretleniyor ve maç sayacı ilerliyor.
 */
export async function markPvpMatch(
  // ⚠️ `Prisma.TransactionClient` — el yazması bir arayüz DEĞİL. Kendi
  // yazdığım dar tip, Prisma'nın jenerik `updateMany` imzasıyla uyuşmuyordu
  // ve çağrı yeri derlenmiyordu; daraltmanın hiçbir güvenlik faydası da yok.
  tx: Prisma.TransactionClient,
  wallets: string[], now = new Date(),
) {
  const week = seasonWeek(now);
  await tx.player.updateMany({
    where: { wallet: { in: wallets } },
    data: { duelWeek: week, duelMatches: { increment: 1 } },
  });
}
