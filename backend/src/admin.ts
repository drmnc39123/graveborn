// ADMIN — bot politikasının İKİNCİ YARISI.
//
// Karar şuydu: tam replay doğrulaması YOK; sunucu ödül tavanı + admin denetimi
// yeterli. Tavan zaten kodda (reward.ts). Burası denetim tarafı.
//
// TASARIM İLKESİ: tablo dökmek değil, operatörün gerçek sorusunu cevaplamak.
// Gerçek sorular şunlar:
//   1. Kim çok gold kazandı ve bu makul mü?
//   2. Sunucu kimin iddiasını KIRPMAK zorunda kaldı? (yalan söylemenin izi)
//   3. Kim insan hızının üstünde koşu üretiyor?
//
// ⚠️ YIKICI İŞLEM KURALI — bir istisna var, gerekçesi aşağıda.
// Ban geri alınabilir. Oyuncu bazlı silme/sıfırlama uçları HÂLÂ YOK ve
// olmayacak: yanlış bir tıklama tek bir oyuncunun emeğini geri dönüşsüz
// siler ve bunun meşru bir kullanımı yok.
//
// TEK İSTİSNA: `betaSifirla()` — BETA KAPANIŞI. Bu kural yazıldığında
// öngörülmeyen bir durum: açık beta ilan edilip oynatılacak ve token
// gününde TÜM ilerleme silinecek (oyunculara önceden duyurularak). Yani
// silme burada kaza değil, ilan edilmiş bir ürün kararı.
//
// Kuralın ARDINDAKİ SEBEP (kazayla geri dönüşsüz silme) yine de geçerli,
// o yüzden üç kapı var: bakım modu açık olmalı · varsayılan `dryRun`
// (sayar, silmez) · gerçek silme için birebir onay dizesi.
// ⚠️ Oyuncu bazlı bir sıfırlama ucu bu istisnanın arkasına SAKLANMAZ.

import type { Request, Response, NextFunction } from 'express';
import crypto from 'node:crypto';
import { prisma } from './db.js';

/**
 * Admin kapısı. Sır ortam değişkeninde; TANIMLI DEĞİLSE tüm admin uçları
 * KAPALI olur (403). Varsayılan bir sır koymak, unutulduğunda paneli herkese
 * açık bırakmak demekti.
 */
export function adminOnly(req: Request, res: Response, next: NextFunction) {
  const secret = process.env.ADMIN_SECRET;
  if (!secret) { res.status(403).json({ error: 'admin_kapali' }); return; }
  const given = req.get('x-admin-secret') ?? '';
  if (!timingSafeEqual(given, secret)) {
    // ⚠️ BAŞARISIZ DENEME GÜRÜLTÜ ÇIKARIR. Önce sessizce 401 dönüyordu:
    // kaba kuvvet denemesi hiçbir iz bırakmıyordu. Tek savunma dar hız
    // sınırıysa (bkz. `index.ts` adminLimiti) en azından GÖRÜLMELİ.
    console.warn('[admin] YETKİSİZ DENEME', req.ip ?? '?', req.method, req.path);
    res.status(401).json({ error: 'yetkisiz' }); return;
  }
  next();
}

/**
 * Sabit süreli karşılaştırma.
 *
 * ⚠️ UZUNLUK SIZINTISI KAPATILDI. Önce `given.length !== secret.length` ile
 * erken dönülüyordu — yani sırrın UZUNLUĞU zamanlamayla ölçülebiliyordu ve
 * sabit süreli karşılaştırmanın amacı kısmen boşa çıkıyordu. Artık iki
 * taraf da SHA-256'dan geçiyor: uzunluk ne olursa olsun karşılaştırma
 * 32 bayt üzerinde, sabit sürede yapılıyor.
 */
function timingSafeEqual(a: string, b: string): boolean {
  const ha = crypto.createHash('sha256').update(a).digest();
  const hb = crypto.createHash('sha256').update(b).digest();
  return crypto.timingSafeEqual(ha, hb);
}

const HOUR = 3600_000;

export interface PlayerRow {
  wallet: string;
  gold: number;
  unlockedStage: number;
  hero: string;
  banned: boolean;
  createdAt: string;
  lastSeen: string;
  runs: number;
  /** sunucunun iddiayı kırptığı koşu sayısı — ASIL sinyal bu */
  cappedRuns: number;
  /** hesap yaşına göre saatlik gold — insan hızının çok üstü şüpheli */
  goldPerHour: number;
  runsPerHour: number;
}

/**
 * Oyuncu listesi + risk sinyalleri.
 *
 * `cappedRuns` en güçlü sinyal: sunucu bir iddiayı kırptıysa istemci
 * hak etmediği bir sayı göndermiş demektir. Tek başına kanıt değil (eski
 * sürüm/ağ hatası da olabilir) ama sıralamanın tepesi buradan bakılır.
 */
export async function listPlayers(sort: 'gold' | 'capped' | 'new', limit: number): Promise<PlayerRow[]> {
  const players = await prisma.player.findMany({
    orderBy: sort === 'new' ? { createdAt: 'desc' } : { gold: 'desc' },
    take: Math.min(Math.max(limit, 1), 200),
  });

  const grouped = await prisma.run.groupBy({
    by: ['wallet'],
    _count: { _all: true },
    where: { wallet: { in: players.map((p) => p.wallet) } },
  });
  const cappedGrouped = await prisma.run.groupBy({
    by: ['wallet'],
    _count: { _all: true },
    where: { wallet: { in: players.map((p) => p.wallet) }, capped: true },
  });

  const runCount = new Map(grouped.map((g) => [g.wallet, g._count._all]));
  const cappedCount = new Map(cappedGrouped.map((g) => [g.wallet, g._count._all]));
  const now = Date.now();

  const rows: PlayerRow[] = players.map((p) => {
    // Yeni hesapta saat ~0 olur ve oran sonsuza fırlar; en az 1 saat sayıyoruz
    const hours = Math.max(1, (now - p.createdAt.getTime()) / HOUR);
    const runs = runCount.get(p.wallet) ?? 0;
    return {
      wallet: p.wallet,
      gold: p.gold,
      unlockedStage: p.unlockedStage,
      hero: p.hero,
      banned: p.banned,
      createdAt: p.createdAt.toISOString(),
      lastSeen: p.lastSeen.toISOString(),
      runs,
      cappedRuns: cappedCount.get(p.wallet) ?? 0,
      goldPerHour: Math.round(p.gold / hours),
      runsPerHour: Math.round((runs / hours) * 10) / 10,
    };
  });

  if (sort === 'capped') rows.sort((a, b) => b.cappedRuns - a.cappedRuns || b.gold - a.gold);
  return rows;
}

/** Şüpheli koşular — sunucunun kırptıkları. Denetim buradan başlar. */
export async function listRuns(onlyCapped: boolean, limit: number) {
  const runs = await prisma.run.findMany({
    where: onlyCapped ? { capped: true } : {},
    orderBy: { startedAt: 'desc' },
    take: Math.min(Math.max(limit, 1), 200),
  });
  return runs.map((r) => ({
    id: r.id,
    wallet: r.wallet,
    mode: r.mode,
    stageId: r.stageId,
    hero: r.hero,
    seed: r.seed.toString(),          // BigInt JSON'a doğrudan gitmez
    startedAt: r.startedAt.toISOString(),
    claimedAt: r.claimedAt?.toISOString() ?? null,
    claimedDepth: r.claimedDepth,
    claimedGold: r.claimedGold,
    awarded: r.awarded,
    capped: r.capped,
    /** koşu ne kadar sürdü — 5 saniyede biten "derinlik 40" iddiası fiziksel olarak imkânsız */
    durationSec: r.claimedAt
      ? Math.round((r.claimedAt.getTime() - r.startedAt.getTime()) / 1000)
      : null,
  }));
}

export async function overview() {
  const [players, banned, runsTotal, runsCapped, openRuns, gold] = await Promise.all([
    prisma.player.count(),
    prisma.player.count({ where: { banned: true } }),
    prisma.run.count({ where: { claimedAt: { not: null } } }),
    prisma.run.count({ where: { capped: true } }),
    prisma.run.count({ where: { claimedAt: null } }),
    prisma.player.aggregate({ _sum: { gold: true } }),
  ]);
  return {
    players, banned,
    runsClaimed: runsTotal,
    runsCapped,
    /** açılıp hiç kapanmamış koşular — terk edilmiş ya da kapanışı engellenmiş */
    runsOpen: openRuns,
    goldInCirculation: gold._sum.gold ?? 0,
  };
}

/** Tek oyuncunun dosyası — son koşularıyla birlikte */
export async function playerDetail(wallet: string) {
  const player = await prisma.player.findUnique({ where: { wallet } });
  if (!player) return null;
  const runs = await prisma.run.findMany({
    where: { wallet }, orderBy: { startedAt: 'desc' }, take: 50,
  });
  return {
    player: {
      ...player,
      createdAt: player.createdAt.toISOString(),
      lastSeen: player.lastSeen.toISOString(),
    },
    runs: runs.map((r) => ({
      id: r.id, mode: r.mode, stageId: r.stageId, seed: r.seed.toString(),
      startedAt: r.startedAt.toISOString(),
      claimedAt: r.claimedAt?.toISOString() ?? null,
      claimedDepth: r.claimedDepth, claimedGold: r.claimedGold,
      awarded: r.awarded, capped: r.capped,
      durationSec: r.claimedAt
        ? Math.round((r.claimedAt.getTime() - r.startedAt.getTime()) / 1000)
        : null,
    })),
  };
}

/** Ban / ban kaldır. GERİ ALINABİLİR — bilerek yıkıcı değil. */
export async function setBanned(wallet: string, banned: boolean) {
  return prisma.player.update({
    where: { wallet },
    data: { banned },
    select: { wallet: true, banned: true },
  });
}

// ── BETA SIFIRLAMA ────────────────────────────────────────────────────

/** Silinecek/korunacak tabloların sayımı — hem dryRun hem sonuç raporu */
export interface SifirlamaSayim {
  [tablo: string]: number;
}

/**
 * BETA KAPANIŞI — tüm oyuncu verisini siler.
 *
 * 🔴 CASCADE'E GÜVENMEK YETMEZ, ÖLÇÜLDÜ. Şemada 20 model var; `Player`
 * silindiğinde cascade ile giden yalnız 8'i (Run · DuelRecord · Listing ·
 * Follow · Ticket→TicketMessage · PvpAward · SeasonAward · GearItem).
 * Geriye kalan **9 tablo Player'a cascade ile bağlı DEĞİL** ve naif bir
 * `player.deleteMany()` sonrası hayatta kalırdı:
 *   Ledger (ekonomi defteri) · BossDamage · AuthNonce · Duel ·
 *   WorldBoss · SeasonClose · PvpClose · Guild · CryptVault
 * Yani "cascade halleder" demek, beta ekonomisinin defterini ve dağılmış
 * loncaları yeni sezona taşımak olurdu.
 *
 * ⚠️ `ServerFlag` KORUNUR. Bakım bayrağı ve duyuru metni yapılandırmadır,
 * oyuncu verisi değil — silinseydi sıfırlamanın kendisi bakım modunu
 * kapatır ve oyun yarı silinmiş hâlde açılırdı.
 *
 * ⚠️ `CryptVault` SİLİNMEZ, SIFIRLANIR. Tekil satır (`@id @default(1)`);
 * silmek onu yeniden yaratmayı çağırana bırakırdı. Bakiye ve ömür boyu
 * sayaçlar 0'a çekiliyor.
 *
 * ⚠️ SIRA FK'YE GÖRE. Önce Player'a bağlı olmayan yapraklar, sonra
 * `Player` (cascade çalışsın), en sonda `Guild` — `Player.guildId`
 * `onDelete: SetNull` taşıyor, loncayı önce silmek her oyuncuya
 * gereksiz bir yazma yapardı.
 */
export async function betaSifirla(gercek: boolean): Promise<SifirlamaSayim> {
  const sayim: SifirlamaSayim = {};

  // ── ÖNCE SAY ── dryRun'da da gerçek silmede de aynı sayılar raporlanır
  const [
    players, runs, duelRecords, listings, follows, tickets, ticketMessages,
    pvpAwards, seasonAwards, gearItems,
    ledger, bossDamage, authNonce, duels, worldBoss, seasonClose, pvpClose, guilds,
  ] = await Promise.all([
    prisma.player.count(), prisma.run.count(), prisma.duelRecord.count(),
    prisma.listing.count(), prisma.follow.count(), prisma.ticket.count(),
    prisma.ticketMessage.count(), prisma.pvpAward.count(),
    prisma.seasonAward.count(), prisma.gearItem.count(),
    prisma.ledger.count(), prisma.bossDamage.count(), prisma.authNonce.count(),
    prisma.duel.count(), prisma.worldBoss.count(), prisma.seasonClose.count(),
    prisma.pvpClose.count(), prisma.guild.count(),
  ]);
  Object.assign(sayim, {
    players, runs, duelRecords, listings, follows, tickets, ticketMessages,
    pvpAwards, seasonAwards, gearItems,
    ledger, bossDamage, authNonce, duels, worldBoss, seasonClose, pvpClose, guilds,
  });

  if (!gercek) return sayim;

  // ── SONRA SİL ── tek transaction: yarım silinmiş bir dünya kalmasın
  await prisma.$transaction([
    // 1) Player'a cascade ile BAĞLI OLMAYANLAR
    prisma.ledger.deleteMany({}),
    prisma.bossDamage.deleteMany({}),
    prisma.authNonce.deleteMany({}),
    prisma.duel.deleteMany({}),
    prisma.worldBoss.deleteMany({}),
    prisma.seasonClose.deleteMany({}),
    prisma.pvpClose.deleteMany({}),
    // 2) Player — 8 tablo cascade ile gider
    prisma.player.deleteMany({}),
    // 3) Lonca (oyuncular gittikten SONRA)
    prisma.guild.deleteMany({}),
    // 4) Kasa: silinmez, sıfırlanır
    prisma.cryptVault.updateMany({ data: { balance: 0, filled: 0, paid: 0 } }),
  ]);

  return sayim;
}

// ── BÜYÜME VE DENETİM İZİ ─────────────────────────────────────────────

/**
 * DEFTER DIŞA AKTARIMI — NDJSON, satır satır akıtılır.
 *
 * ⚠️ NİYE VAR: `betaSifirla()`'nın kendi başlığı "defteri önce dışarı al"
 * diyor ama bunu yapmanın BİR YOLU YOKTU. Talimatı yazıp aracı yazmamak,
 * kapanış günü ya defteri kaybetmek ya da canlı veritabanına elle SQL
 * atmak demekti; ikincisi kardeş projede iş kazası çıkarmış bir yol.
 *
 * ⚠️ TEK SEFERDE BELLEĞE ALINMAZ. Beta boyunca yüz binlerce satır
 * birikebilir; `findMany()` ile hepsini diziye almak süreci düşürürdü.
 * Sayfalama `id` üzerinden (cursor) — `at` benzersiz değil, aynı
 * milisaniyede iki kayıt varsa `at` ile sayfalama satır atlatır.
 */
export async function* defterAkisi(batch = 5000): AsyncGenerator<string> {
  let cursor: string | undefined;
  for (;;) {
    const rows = await prisma.ledger.findMany({
      take: batch,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
      orderBy: { id: 'asc' },
    });
    if (!rows.length) return;
    yield rows.map((r) => JSON.stringify({
      id: r.id, wallet: r.wallet, at: r.at.toISOString(),
      kind: r.kind, gold: r.gold, detail: r.detail,
    })).join('\n') + '\n';
    cursor = rows[rows.length - 1].id;
  }
}

export interface BuyumeGun {
  /** YYYY-MM-DD (UTC) */
  gun: string;
  /** o gün açılan hesap sayısı */
  yeni: number;
  /**
   * o günün hesaplarından, açılıştan ≥24s sonra HÂLÂ yazma yapmış olanlar.
   * ⚠️ Kohort 24 saatten genç ise `null` — 0 DEĞİL (aşağıdaki uyarı).
   */
  kalan1g: number | null;
  /** aynısı 7 gün için */
  kalan7g: number | null;
}

/**
 * ⭐ BÜYÜME — beta kararının dayanağı (bkz. beta planı FAZ B1).
 *
 * ⚠️ BU KLASİK D1/D7 RETENTION DEĞİL, ve öyle etiketlenmemeli. Ölçtüğü
 * şey: `lastSeen - createdAt >= 24s`. `lastSeen` şemada `@updatedAt`,
 * yani oyuncu satırına yapılan HER yazmada güncelleniyor — giriş değil,
 * ilerleme kaydı. "Hesabı açtıktan 24 saat sonra hâlâ oynuyordu" için iyi
 * bir vekil; "ertesi gün geri döndü" için değil. Gerçek kohort ölçümü
 * oturum kaydı ister, o da bugün yok.
 *
 * 🔴 EN ÖNEMLİ AYRINTI — GENÇ KOHORT `null` DÖNER, 0 DEĞİL.
 * Bugün açılmış 40 hesabın hiçbiri "24 saattir duruyor" olamaz; bunu 0
 * olarak raporlamak "%0 tutunma" gibi okunur ve tam ters karar verdirir.
 * Ölçüm penceresi dolmamış kohort ÖLÇÜLMEMİŞTİR — boş bırakılır.
 */
export async function buyume(gun: number): Promise<{ gunler: BuyumeGun[]; toplam: number }> {
  const gunSayisi = Math.min(Math.max(Math.trunc(gun), 1), 90);
  const baslangic = new Date(Date.now() - gunSayisi * 24 * HOUR);
  const rows = await prisma.player.findMany({
    where: { createdAt: { gte: baslangic } },
    select: { createdAt: true, lastSeen: true },
  });

  const simdi = Date.now();
  const GUN_MS = 24 * HOUR;
  const kova = new Map<string, { yeni: number; k1: number; k7: number }>();
  for (const r of rows) {
    const anahtar = r.createdAt.toISOString().slice(0, 10);
    const k = kova.get(anahtar) ?? { yeni: 0, k1: 0, k7: 0 };
    k.yeni++;
    const omur = r.lastSeen.getTime() - r.createdAt.getTime();
    if (omur >= GUN_MS) k.k1++;
    if (omur >= 7 * GUN_MS) k.k7++;
    kova.set(anahtar, k);
  }

  const gunler: BuyumeGun[] = [...kova.entries()]
    .sort((a, b) => (a[0] < b[0] ? 1 : -1))
    .map(([g, k]) => {
      // Kohortun EN GENÇ üyesi bile pencereyi doldurmuş mu? Gün sonundan say.
      const gunSonu = Date.parse(`${g}T23:59:59.999Z`);
      return {
        gun: g,
        yeni: k.yeni,
        kalan1g: simdi - gunSonu >= GUN_MS ? k.k1 : null,
        kalan7g: simdi - gunSonu >= 7 * GUN_MS ? k.k7 : null,
      };
    });

  return { gunler, toplam: rows.length };
}
