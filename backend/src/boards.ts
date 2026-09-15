// LEADERBOARDS MERKEZİ — tek uç, on bir pano (`GET /boards/:id`).
//
// 🔴 NİYE VAR (kullanıcı): *"Şu an All time ve This week var… her panoya
// ayrı bir sıralama yapalım: en fazla GOLD, en çok derinlik, descend
// turnuvası, bölüm+derinlik, toz, Forge, en iyi guild"* ve *"The PIT ve
// düels gibi panelleri de leaderboardsa eklemek lazım."*
//
// ⚠️ YENİ SIRALAMA MANTIĞI YAZILMADI: her pano mevcut fonksiyonu okuyor
// (`top`, `topSeason`, `pvpBoard`, `ladder`, `listGuilds`). Eski uçlar diğer
// paneller için yerinde kalıyor. Aynı tabloyu iki yerde iki kez sıralamak,
// bu depoda her seferinde iki farklı sıra üretti.
//
// ⚠️ ÖNBELLEK YOK — BİLİNÇLİ, planın bir kalemini bu yüzden uygulamadım.
// Ölçüldü (yerel, `boards.test` [7]): en pahalı pano birkaç ms, hepsi
// indeksli. `names.ts` başlığının kuralı burada da geçerli: ad ÜCRETLİ
// değişiyor ve bayat ad servis etmek ödenen gold'un karşılığını vermemek.
// Önbellek ayrıca "koşudan döndüm, tabloda eski sıram duruyor" çelişkisini
// doğururdu (`me` taze, liste bayat). Ölçülmeden eklenen önbellek, ölçülmeden
// eklenen her şey gibi.
//
// ⚠️ `bossState` ÇAĞRILMIYOR: her okumada `worldBoss.upsert` yapıyor.
// Pano bir OKUMA; yazma yan etkisi taşımamalı.

import { GUNLUK_TABLO, gunBaslangici } from '@game/daily';
import { forgeLevelsOf } from '@game/forge';
import { seasonEndsAt } from '@game/season';
import { guildCap } from '@game/guild';
import { bossWeek, weekEndsAt } from '@game/worldBoss';
import { prisma } from './db.js';
import { ladder } from './duel.js';
import { herkeseAcikMi, herkeseAcikOyuncu } from './kamuSuzgec.js';
import { rankOf, top, wornOf, type Row } from './leaderboard.js';
import { pvpAwards, pvpBoard, settlePvpSeasons } from './pvpSeason.js';
import { awardsOf, seasonRankOf, settleSeasons, topSeason } from './season.js';
import { hazineAdresi } from './solPay.js';

export { herkeseAcikMi, herkeseAcikOyuncu };

/** Pano kimlikleri — istemcideki çiplerle AYNI liste (`boards.test` karşılaştırıyor) */
export const PANO_IDLERI = [
  'descent', 'season', 'daily',
  'gold', 'forge', 'dust', 'ossuary',
  'pit', 'answering', 'guilds', 'boss',
] as const;
export type PanoId = (typeof PANO_IDLERI)[number];

export const PANO_LIMIT = 50;

/**
 * Tek satır şekli — her pano yalnız kendi alanlarını doldurur.
 *
 * ⚠️ `value` SIRALAMA ANAHTARI, gösterilen metin DEĞİL. Metni istemci
 * türetiyor (`Stage 24 · Depth 21`, `102 / 164`) — sunucu İngilizce cümle
 * kurmaz, oyuncu metni tek yerde yaşar.
 */
export interface PanoSatiri {
  rank: number;
  /** lonca panosunda `null` */
  wallet: string | null;
  name: string | null;
  value: number;
  hero?: string;
  equipped?: Row['equipped'];
  ossuary?: number;
  stage?: number;
  depth?: number;
  wins?: number;
  losses?: number;
  matches?: number;
  guild?: { id: string; tag: string; level: number; members: number; cap: number };
}

export interface Pano {
  id: PanoId;
  rows: PanoSatiri[];
  me: PanoSatiri | null;
  /** haftalık panolarda (season, pit, boss) */
  week?: number;
  endsAt?: number;
  /** günlük panoda */
  day?: string;
  /** THE PIT: sıraya girmek için gereken maç */
  placement?: number;
  /** DESCENT TRIALS / THE PIT: oyuncunun geçmiş ödülleri */
  awards?: { week: number; rank: number; cosmetic: string | null; dust: number }[];
}

export function panoIdMi(x: string): x is PanoId {
  return (PANO_IDLERI as readonly string[]).includes(x);
}

const derinlikSatiri = (r: Row): PanoSatiri => ({
  rank: r.rank, wallet: r.wallet, name: r.name, value: r.rating, hero: r.hero,
  equipped: r.equipped, ossuary: r.ossuary, stage: r.stage, depth: r.depth,
});

export async function panoOku(id: PanoId, wallet: string | null, now = new Date()): Promise<Pano> {
  switch (id) {
    case 'descent': {
      const [rows, me] = await Promise.all([top(PANO_LIMIT), wallet ? rankOf(wallet) : null]);
      return { id, rows: rows.map(derinlikSatiri), me: me ? derinlikSatiri(me.row) : null };
    }
    case 'season': {
      // ⚠️ ÖNCE KAPAT: pano geçen haftanın ödül dağıtımını tetikleyen
      // okumalardan biri (bkz. season.ts — cron yok).
      await settleSeasons(now).catch((e) => console.warn('[sezon-kapanis]', e));
      const [board, me, awards] = await Promise.all([
        topSeason(PANO_LIMIT, now),
        wallet ? seasonRankOf(wallet, now) : null,
        wallet ? awardsOf(wallet) : [],
      ]);
      return {
        id, week: board.week, endsAt: board.endsAt, awards,
        rows: board.rows.map(derinlikSatiri), me: me ? derinlikSatiri(me.row) : null,
      };
    }
    case 'daily': return gunlukPano(wallet, now);
    case 'gold': return sutunPanosu(id, 'goldEarned', wallet);
    case 'forge': return sutunPanosu(id, 'forgeLevels', wallet);
    case 'dust': return sutunPanosu(id, 'dust', wallet);
    case 'ossuary': return sutunPanosu(id, 'ossuary', wallet);
    case 'pit': {
      await settlePvpSeasons(now).catch((e) => console.warn('[pvp-kapanis]', e));
      const [b, awards] = await Promise.all([pvpBoard(wallet, now, PANO_LIMIT), wallet ? pvpAwards(wallet) : []]);
      const satir = (r: (typeof b.rows)[number]): PanoSatiri => ({
        rank: r.rank, wallet: r.wallet, name: r.name, value: r.rating, hero: r.hero,
        wins: r.wins, losses: r.losses, matches: r.matches,
      });
      return {
        id, week: b.week, endsAt: seasonEndsAt(b.week), placement: b.placement, awards,
        rows: b.rows.map(satir), me: b.me ? satir(b.me) : null,
      };
    }
    case 'answering': {
      // ⚠️ `ladder` cüzdan İSTİYOR; boş dize hiçbir satıra eşleşmez → `me` null.
      const l = await ladder(wallet ?? '', PANO_LIMIT);
      const satir = (r: (typeof l.rows)[number]): PanoSatiri => ({
        rank: r.rank, wallet: r.wallet, name: r.name, value: r.rating, hero: r.hero,
        wins: r.wins, losses: r.losses,
      });
      return { id, rows: l.rows.map(satir), me: l.me ? satir(l.me) : null };
    }
    case 'guilds': return loncaPanosu(wallet);
    case 'boss': return bossPanosu(wallet, now);
  }
}

/**
 * Oyuncu satırındaki TEK bir sütuna göre pano — gold, forge, toz, anıt.
 *
 * ⚠️ `gt: 0`: hiç kazanmamış/almamış oyuncu tabloyu "0" satırlarıyla
 * doldurmasın. Aynı kural `me` için: değeri 0 olanın sırası YOK.
 * ⚠️ Beraberlikte `lastSeen asc` — `top()` ile aynı: kararlı sıra.
 */
async function sutunPanosu(
  id: PanoId, alan: 'goldEarned' | 'forgeLevels' | 'dust' | 'ossuary', wallet: string | null,
): Promise<Pano> {
  const kosul = { ...herkeseAcikOyuncu(), [alan]: { gt: 0 } };
  const secim = { wallet: true, name: true, hero: true, equipped: true, ossuary: true, banned: true, [alan]: true } as const;
  type Ham = { wallet: string; name: string | null; hero: string; equipped: unknown; ossuary: number; banned: boolean } & Record<string, unknown>;
  const satir = (r: Ham, rank: number): PanoSatiri => ({
    rank, wallet: r.wallet, name: r.name, value: Number(r[alan]) || 0, hero: r.hero,
    equipped: wornOf(r.equipped), ossuary: r.ossuary,
  });

  const rows = (await prisma.player.findMany({
    where: kosul,
    orderBy: [{ [alan]: 'desc' }, { lastSeen: 'asc' }],
    take: PANO_LIMIT,
    select: secim,
  })) as unknown as Ham[];
  const list = rows.map((r, i) => satir(r, i + 1));

  let me: PanoSatiri | null = null;
  if (wallet) {
    me = list.find((r) => r.wallet === wallet) ?? null;
    if (!me) {
      const ben = (await prisma.player.findUnique({ where: { wallet }, select: secim })) as unknown as Ham | null;
      const deger = ben ? Number(ben[alan]) || 0 : 0;
      if (ben && deger > 0 && herkeseAcikMi(wallet, ben.banned)) {
        const ustum = await prisma.player.count({ where: { ...herkeseAcikOyuncu(), [alan]: { gt: deger } } });
        me = satir(ben, ustum + 1);
      }
    }
  }
  return { id, rows: list, me };
}

async function gunlukPano(wallet: string | null, now: Date): Promise<Pano> {
  const bas = gunBaslangici(now);
  const t = await gunlukTablo(bas);
  const rows: PanoSatiri[] = t.map((r) => ({
    rank: r.rank, wallet: r.wallet, name: r.name, value: r.depth, depth: r.depth, hero: r.hero,
  }));
  let me: PanoSatiri | null = rows.find((r) => r.wallet === wallet) ?? null;
  if (wallet && !me) {
    const kosu = await prisma.run.findFirst({
      where: { wallet, mode: 'daily', startedAt: { gte: bas }, claimedAt: { not: null }, capped: false },
      select: { awardedDepth: true, claimedAt: true, hero: true, player: { select: { name: true, banned: true } } },
    });
    const d = kosu?.awardedDepth ?? 0;
    if (kosu && d > 0 && herkeseAcikMi(wallet, kosu.player.banned)) {
      // ⚠️ Tablonun sıralamasıyla AYNI: derin olan, eşitse önce bitiren üstte.
      const ustum = await prisma.run.count({
        where: {
          mode: 'daily', startedAt: { gte: bas }, claimedAt: { not: null }, capped: false,
          player: herkeseAcikOyuncu(),
          OR: [{ awardedDepth: { gt: d } }, { awardedDepth: d, claimedAt: { lt: kosu.claimedAt! } }],
        },
      });
      me = { rank: ustum + 1, wallet, name: kosu.player.name, value: d, depth: d, hero: kosu.hero };
    }
  }
  return { id: 'daily', day: bas.toISOString().slice(0, 10), rows, me };
}

async function loncaPanosu(wallet: string | null): Promise<Pano> {
  const g = await prisma.guild.findMany({
    orderBy: [{ level: 'desc' }, { donated: 'desc' }],
    take: PANO_LIMIT,
    select: { id: true, name: true, tag: true, level: true, donated: true, memberCount: true },
  });
  const satir = (x: (typeof g)[number], rank: number): PanoSatiri => ({
    rank, wallet: null, name: x.name, value: x.level,
    guild: { id: x.id, tag: x.tag, level: x.level, members: x.memberCount, cap: guildCap(x.level) },
  });
  const rows = g.map((x, i) => satir(x, i + 1));

  let me: PanoSatiri | null = null;
  if (wallet) {
    const p = await prisma.player.findUnique({ where: { wallet }, select: { guildId: true } });
    if (p?.guildId) {
      me = rows.find((r) => r.guild?.id === p.guildId) ?? null;
      if (!me) {
        const benim = await prisma.guild.findUnique({
          where: { id: p.guildId },
          select: { id: true, name: true, tag: true, level: true, donated: true, memberCount: true },
        });
        if (benim) {
          const ustum = await prisma.guild.count({
            where: { OR: [{ level: { gt: benim.level } }, { level: benim.level, donated: { gt: benim.donated } }] },
          });
          me = satir(benim, ustum + 1);
        }
      }
    }
  }
  return { id: 'guilds', rows, me };
}

/**
 * HAFTALIK BOSS — bu haftanın hasar tablosu.
 *
 * ⚠️ `BossDamage`in `Player` ilişkisi YOK: süzgeç sorguya giremiyor. Aday
 * FAZLA çekilip süzülüyor — `settleBarrow`un aynı gerekçesi: ilk 50'yi
 * alacaksak 50 satır çekmek yetmez, tepedekiler banlıysa liste eksik kalır.
 */
async function bossPanosu(wallet: string | null, now: Date): Promise<Pano> {
  const week = bossWeek(now);
  const aday = await prisma.bossDamage.findMany({
    where: { week, damage: { gt: 0 } },
    orderBy: [{ damage: 'desc' }, { id: 'asc' }],
    take: PANO_LIMIT * 3,
    select: { wallet: true, damage: true },
  });
  const kimlik = await oyuncuKimlikleri(aday.map((a) => a.wallet).concat(wallet ? [wallet] : []));
  const acik = aday.filter((a) => {
    const k = kimlik.get(a.wallet);
    return k && herkeseAcikMi(a.wallet, k.banned);
  });
  const satir = (a: { wallet: string; damage: number }, rank: number): PanoSatiri => {
    const k = kimlik.get(a.wallet);
    return {
      rank, wallet: a.wallet, name: k?.name ?? null, value: a.damage, hero: k?.hero,
      equipped: k ? wornOf(k.equipped) : undefined, ossuary: k?.ossuary,
    };
  };
  const rows = acik.slice(0, PANO_LIMIT).map((a, i) => satir(a, i + 1));

  let me: PanoSatiri | null = null;
  if (wallet) {
    const k = kimlik.get(wallet);
    const icinde = acik.findIndex((a) => a.wallet === wallet);
    if (icinde >= 0) me = satir(acik[icinde], icinde + 1);
    else if (k && herkeseAcikMi(wallet, k.banned)) {
      const benim = await prisma.bossDamage.findUnique({
        where: { week_wallet: { week, wallet } }, select: { damage: true },
      });
      if (benim && benim.damage > 0) {
        // ⚠️ Aday listesinin DIŞINDA: süzgeç sayıma giremiyor, sayı gizli
        // (banlı/hazine) oyuncuları da sayabilir — en kötü ihtimalle sıra
        // olduğundan birkaç kötü görünür, asla iyi değil.
        const ustum = await prisma.bossDamage.count({ where: { week, damage: { gt: benim.damage } } });
        me = satir({ wallet, damage: benim.damage }, ustum + 1);
      }
    }
  }
  return { id: 'boss', week, endsAt: weekEndsAt(week), rows, me };
}

async function oyuncuKimlikleri(wallets: string[]) {
  const benzersiz = [...new Set(wallets.filter(Boolean))];
  const out = new Map<string, { name: string | null; hero: string; equipped: unknown; ossuary: number; banned: boolean }>();
  if (benzersiz.length === 0) return out;
  const rows = await prisma.player.findMany({
    where: { wallet: { in: benzersiz } },
    select: { wallet: true, name: true, hero: true, equipped: true, ossuary: true, banned: true },
  });
  for (const r of rows) out.set(r.wallet, r);
  return out;
}

export interface GunlukSatir { rank: number; wallet: string; name: string | null; depth: number; hero: string }

/**
 * GÜNLÜK İNİŞ tablosu — bugünün kapanmış, kırpılmamış koşuları.
 *
 * 🔴 SÜZGEÇSİZDİ (2026-09-15): `/daily` içinde yazılıydı ve banlı oyuncuyu
 * da hazineyi de listeliyordu. Buraya taşındı ki test edilebilsin ve
 * `/boards/daily` aynı sorguyu okusun — iki kopya olmasın.
 *
 * @param bas bugünün başlangıcı (`gunBaslangici()`)
 */
export async function gunlukTablo(bas: Date): Promise<GunlukSatir[]> {
  const rows = await prisma.run.findMany({
    where: {
      mode: 'daily', startedAt: { gte: bas }, claimedAt: { not: null }, capped: false,
      player: herkeseAcikOyuncu(),
    },
    // ⚠️ Beraberlikte ÖNCE BİTİREN üstte: aynı derinliğe önce ulaşan
    // daha iyi oynamıştır ve sıralama kararlı olmalı.
    orderBy: [{ awardedDepth: 'desc' }, { claimedAt: 'asc' }],
    take: GUNLUK_TABLO,
    // ⚠️ Ad AYNI SORGUDAN: ilişki süzgeç için zaten birleşiyor.
    select: { wallet: true, awardedDepth: true, hero: true, player: { select: { name: true } } },
  });
  return rows.map((r, i) => ({
    rank: i + 1, wallet: r.wallet, name: r.player.name, depth: r.awardedDepth ?? 0, hero: r.hero,
  }));
}

/**
 * PANO SÜTUNLARINI SIFIRDAN KUR — `goldEarned` ve `forgeLevels`.
 *
 * Deploy sonrası bir kez (migration BİLEREK doldurmuyor, bkz. migration.sql)
 * ve şüphe olduğunda. İDEMPOTENT: iki kez çalıştırmak aynı sonucu verir.
 *
 * ⚠️ `goldEarned` DEFTERDEN, `Run.awarded`dan DEĞİL: boss koşusu
 * `Run.awarded`a HASAR yazıyor (bkz. `/boss/finish`) ve profildeki "gold
 * earned" tam bu yüzden şişikti. Defterin `run` kaydı ise yalnız
 * `/run/finish`in kampanya/descent yolunda, gold ile birlikte yazılıyor —
 * sütunun canlıda artırıldığı AYNI yer. İki tanım tek kaynağa bağlı.
 *
 * ⚠️ Koşu başına `gold > 0`: canlı yazım `Math.max(0, …)` ile artırıyor.
 * 🔴 Hazine 0: ultra hesabın koşuları defterde duruyor ama sayılmıyor.
 */
export async function panoSutunlariniKur(): Promise<{ gold: number; forge: number }> {
  const h = hazineAdresi();
  const gold = await prisma.$executeRaw`
    UPDATE "Player" p SET "goldEarned" = COALESCE((
      SELECT SUM(l.gold)::int FROM "Ledger" l
      WHERE l.wallet = p.wallet AND l.kind = 'run' AND l.gold > 0
    ), 0)
    WHERE p.wallet <> ${h ?? ''}`;
  if (h) await prisma.player.updateMany({ where: { wallet: h }, data: { goldEarned: 0 } });

  // `upgrades` JSON — toplamı SQL'de değil, canlı yazımla AYNI fonksiyonla.
  // İkinci bir SQL tanımı, kırpma kuralı değişince sessizce ayrışırdı.
  let forge = 0;
  let imlec: string | undefined;
  for (;;) {
    const sayfa = await prisma.player.findMany({
      take: 500,
      ...(imlec ? { skip: 1, cursor: { wallet: imlec } } : {}),
      orderBy: { wallet: 'asc' },
      select: { wallet: true, upgrades: true, forgeLevels: true },
    });
    if (sayfa.length === 0) break;
    for (const p of sayfa) {
      const ups = p.upgrades && typeof p.upgrades === 'object' ? (p.upgrades as Record<string, number>) : {};
      const dogru = forgeLevelsOf(ups);
      if (dogru !== p.forgeLevels) {
        await prisma.player.updateMany({ where: { wallet: p.wallet }, data: { forgeLevels: dogru } });
        forge += 1;
      }
    }
    imlec = sayfa[sayfa.length - 1].wallet;
  }
  return { gold, forge };
}
