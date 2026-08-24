// DÜELLO — asenkron PvP, sunucu tarafı.
//
// Tasarım ve sayılar `@game/duel`'de. Burada dört iş var: kayıt yayınlamak,
// tabloyu kurmak, meydan okumayı doğrulamak ve sonucu YARIŞSIZ yazmak.
//
// ⚠️ MEYDAN OKUYAN RAKİBİN SEED'İNİ OYNUYOR. Seed kayıttan geliyor, yeni
// üretilmiyor — düellonun bütün adaleti bu. İstemci seed'i ne seçebiliyor
// ne de değiştirebiliyor; `/duel/start` onu Run satırına yazıyor.
//
// ⚠️ HEDEF KOŞU AÇILIRKEN DONDURULUYOR (`Run.duelTargetDepth`). Kapanışta
// rakibin güncel kaydına bakılsaydı hedef hareketli olurdu: oyuncu 40'ı
// geçmek için girer, o sırada rakip 45'e çıkar ve hiç haberi olmadan
// kaybederdi.
//
// ⚠️ DÜELLO GOLD ÖDEMİYOR. Puan ödüyor (sıfır toplamlı, enflasyon
// yaratamaz) ve toz — o da GÜNLÜK SERT TAVANLI, çünkü düello sınırsız
// oynanabiliyor.
//
// ⚠️ SEED TEK BAŞINA BİR KOŞUYU TARİF ETMİYOR — seed + MOTOR SÜRÜMÜ ediyor.
// `SIM_VERSION` arttığı an aynı seed başka bir koşu üretir (bkz.
// game/config.ts ve sim.test.mts SIM_SEAL). Bu yüzden her kayıt sürümüyle
// birlikte yazılıyor ve sürüm tutmayan kayda MEYDAN OKUNAMIYOR — yoksa
// meydan okuyan, savunanın hiç karşılaşmadığı bir koşuyu oynar ve kazanan
// sessizce değişir.

import crypto from 'node:crypto';
import { DUEL, duelBlocker, duelWon, nextRatings, STALE_ENGINE } from '@game/duel';
import { challengeRating, SIM_VERSION } from '@game/config';
import { utcDay } from '@game/progress';
import { prisma } from './db.js';
import { markPvpMatch } from './pvpSeason.js';
import { trackQuest } from './quests.js';

export class DuelError extends Error {
  constructor(public code: string, public status = 400) { super(code); }
}

/**
 * Koşu kapanışında kaydı yayınla/güncelle.
 *
 * ⚠️ SADECE DAHA İYİYSE. Her koşuyu yazmak, oyuncunun kötü bir koşusuyla
 * kendi kaydını düşürmesine izin verirdi — o da "kolay hedef" bırakıp
 * rakiplerinin puanını çalmanın yolu olurdu.
 *
 * ⚠️ KIRPILMIŞ KOŞU KAYIT OLMAZ. Leaderboard'daki kuralın aynısı: şüpheli
 * bir iddiadan doğan kayıt, başkalarının puanını da bozar.
 *
 * ⚠️ BAŞKA SÜRÜMDE KOŞULMUŞ KOŞU DA KAYIT OLMAZ (`runSim`). Sunucu koşan
 * motoru ölçemiyor; ölçebildiği tek şey kendi derlediği `SIM_VERSION`.
 * Koşu açılışında bildirilen sürüm buna uymuyorsa (dağıtım penceresinde
 * frontend ile backend bir süre ayrışabiliyor) kayıt YAZILMAZ. Yazsaydık
 * kayda yanlış sürüm damgalanır ve ona meydan okuyan HERKES sessizce başka
 * bir koşu oynardı — düzeltilmesi imkânsız, teşhisi çok zor bir adaletsizlik.
 *
 * ⚠️ ÖDÜLÜ ETKİLEMEZ. Sadece kayıt yayınlanmıyor; oyuncu koşusunun gold'unu
 * ve rekorunu normal alıyor. Eski bir sekme yüzünden kimse ödül kaybetmemeli.
 */
export async function publishRecord(
  wallet: string, mode: string, stageId: number, seed: number, depth: number,
  ascension: number, capped: boolean, runSim: number,
): Promise<void> {
  if (mode !== 'descent' || capped || depth < 1) return;
  if (runSim !== SIM_VERSION) {
    console.warn('[duel:surum-atlandi]', wallet, `kosu=${runSim} sunucu=${SIM_VERSION}`);
    return;
  }
  const rating = challengeRating(stageId, depth, ascension);
  if (!Number.isFinite(rating) || rating <= 0) return;

  const mevcut = await prisma.duelRecord.findUnique({
    where: { wallet_stageId: { wallet, stageId } },
    select: { id: true, depth: true },
  });
  if (mevcut && mevcut.depth >= depth) return;

  if (mevcut) {
    // ⚠️ KOŞULLU: araya giren daha iyi bir koşu ezilmesin
    await prisma.duelRecord.updateMany({
      where: { id: mevcut.id, depth: { lt: depth } },
      data: { seed: BigInt(seed), depth, rating, simVersion: SIM_VERSION, createdAt: new Date() },
    });
    return;
  }
  try {
    await prisma.duelRecord.create({
      data: {
        id: crypto.randomUUID(), wallet, stageId, seed: BigInt(seed), depth, rating,
        // ⚠️ SUNUCUNUN sürümü yazılıyor, istemcinin beyanı DEĞİL. Beyan
        // yukarıdaki kapıda zaten buna eşit olduğu doğrulandı; damgayı
        // sunucudan almak, kapının ileride gevşemesi hâlinde bile kaydın
        // uydurma bir sürümle yazılmasını imkânsız kılıyor.
        simVersion: SIM_VERSION,
      },
    });
  } catch {
    // Eşzamanlı iki koşu aynı anda ilk kaydı açtıysa tekil kısıt patlar —
    // ikincisi güncelleme yoluna düşsün.
    await prisma.duelRecord.updateMany({
      where: { wallet, stageId, depth: { lt: depth } },
      data: { seed: BigInt(seed), depth, rating, simVersion: SIM_VERSION, createdAt: new Date() },
    });
  }
}

export interface DuelBoardRow {
  id: string;
  wallet: string;
  stageId: number;
  depth: number;
  rating: number;
  duelRating: number;
  hero: string;
  /** meydan okunamıyorsa SEBEBİ (arayüz bunu gösteriyor) */
  blocker: string | null;
}

export interface DuelBoard {
  me: { rating: number; wins: number; losses: number; rewardedToday: number };
  rows: DuelBoardRow[];
  recent: {
    challenger: string; defender: string; stageId: number;
    depth: number; target: number; won: boolean; delta: number; at: string;
  }[];
}

export async function board(wallet: string, cleared: Record<string, boolean>): Promise<DuelBoard> {
  const me = await prisma.player.findUnique({
    where: { wallet },
    select: { duelRating: true, duelWins: true, duelLosses: true, duelDay: true, duelRewarded: true },
  });
  if (!me) throw new DuelError('oyuncu_yok', 404);

  const rows = await prisma.duelRecord.findMany({
    where: { wallet: { not: wallet }, player: { banned: false } },
    orderBy: { rating: 'desc' },
    take: DUEL.boardSize,
    include: { player: { select: { duelRating: true, hero: true } } },
  });

  // ⚠️ SOĞUMA TEK SORGUDA. Satır başına sorgu atmak 20 istek demekti ve
  // tablo her açılışta yavaşlardı.
  const rakipler = rows.map((r) => r.wallet);
  const sonMaclar = rakipler.length === 0 ? [] : await prisma.duel.findMany({
    where: { challenger: wallet, defender: { in: rakipler } },
    orderBy: { createdAt: 'desc' },
    select: { defender: true, createdAt: true },
  });
  const sonuncu = new Map<string, Date>();
  for (const d of sonMaclar) if (!sonuncu.has(d.defender)) sonuncu.set(d.defender, d.createdAt);

  const simdi = Date.now();
  const recent = await prisma.duel.findMany({
    orderBy: { createdAt: 'desc' }, take: 12,
  });

  return {
    me: {
      rating: me.duelRating, wins: me.duelWins, losses: me.duelLosses,
      rewardedToday: me.duelDay === utcDay(new Date()) ? me.duelRewarded : 0,
    },
    rows: rows.map((r) => {
      const son = sonuncu.get(r.wallet);
      const saat = son ? (simdi - son.getTime()) / 3_600_000 : Infinity;
      return {
        id: r.id, wallet: r.wallet, stageId: r.stageId, depth: r.depth, rating: r.rating,
        duelRating: r.player.duelRating, hero: r.player.hero,
        blocker: duelBlocker({
          challenger: wallet, defender: r.wallet, hoursSince: saat,
          stageCleared: !!cleared[String(r.stageId)],
          // ⚠️ Eski sürümde yazılmış kayıt tabloda GÖRÜNÜYOR ama düğmesi
          // kapalı ve SEBEBİ yazıyor. Gizlemek, oyuncuya kaydın nereye
          // kaybolduğunu hiç anlatmazdı.
          recordSim: r.simVersion, engineSim: SIM_VERSION,
        }),
      };
    }),
    recent: recent.map((d) => ({
      challenger: d.challenger, defender: d.defender, stageId: d.stageId,
      depth: d.depth, target: d.target, won: d.won, delta: d.delta,
      at: d.createdAt.toISOString(),
    })),
  };
}

/**
 * EŞLEŞME BUL — sunucu sana uygun rakibi kendisi seçsin.
 *
 * ⚠️ LİSTEDEN SEÇMEK YETMİYOR. Tablo puana göre sıralı; oyuncu doğal olarak
 * en zayıfı seçiyor ve ladder bir "en kolay hedefi bul" oyununa dönüyordu.
 * Eşleştirme PUAN YAKINLIĞINA göre yapılıyor: karşına dengi çıkıyor.
 *
 * ⚠️ UYGUNLUK KONTROLÜ `duelBlocker` İLE — aynı kural, tek yer. Soğumadaki,
 * kendi, banlı ve temizlemediğin bölümdeki kayıtlar burada da eleniyor;
 * "bul" düğmesi doğrulamayı atlayan bir arka kapı OLMAMALI.
 */
export async function findMatch(
  wallet: string, cleared: Record<string, boolean>,
): Promise<DuelBoardRow> {
  const me = await prisma.player.findUnique({
    where: { wallet }, select: { duelRating: true },
  });
  if (!me) throw new DuelError('oyuncu_yok', 404);

  // ⚠️ Aday havuzu sınırlı (200): puan yakınlığına göre sıralamayı SQL'de
  // yapmak `abs()` gerektiriyor, Prisma bunu ifade etmiyor. Havuz büyürse
  // ham sorguya geçilmeli — şimdilik oyuncu sayısı bunun çok altında.
  const adaylar = await prisma.duelRecord.findMany({
    where: { wallet: { not: wallet }, player: { banned: false } },
    take: 200,
    include: { player: { select: { duelRating: true, hero: true } } },
  });
  if (adaylar.length === 0) throw new DuelError('Nobody has posted a record yet.');

  const rakipler = adaylar.map((r) => r.wallet);
  const sonMaclar = await prisma.duel.findMany({
    where: { challenger: wallet, defender: { in: rakipler } },
    orderBy: { createdAt: 'desc' },
    select: { defender: true, createdAt: true },
  });
  const sonuncu = new Map<string, Date>();
  for (const d of sonMaclar) if (!sonuncu.has(d.defender)) sonuncu.set(d.defender, d.createdAt);

  const simdi = Date.now();
  const uygun = adaylar
    .map((r) => {
      const son = sonuncu.get(r.wallet);
      const saat = son ? (simdi - son.getTime()) / 3_600_000 : Infinity;
      return {
        r,
        blocker: duelBlocker({
          challenger: wallet, defender: r.wallet, hoursSince: saat,
          stageCleared: !!cleared[String(r.stageId)],
          // ⚠️ Sürümü tutmayan kayıt EŞLEŞMEDE DE eleniyor — "bul" düğmesi
          // doğrulamayı atlayan bir arka kapı olmamalı (bkz. başlık).
          recordSim: r.simVersion, engineSim: SIM_VERSION,
        }),
        fark: Math.abs(r.player.duelRating - me.duelRating),
      };
    })
    .filter((x) => x.blocker === null)
    .sort((a, b) => a.fark - b.fark);

  if (uygun.length === 0) {
    // ⚠️ SEBEBİ SÖYLE. "Eşleşme bulunamadı" tek başına oyuncuya hiçbir şey
    // anlatmıyor; hepsi soğumadaysa bekleyeceğini, bölüm yüzündense ne
    // yapması gerektiğini bilmeli.
    const sogumada = adaylar.some((r) => {
      const son = sonuncu.get(r.wallet);
      return son && (simdi - son.getTime()) / 3_600_000 < DUEL.cooldownHours;
    });
    // ⚠️ SÜRÜM SEBEBİ AYRI SÖYLENİYOR. Motor sürümü yeni atlamışsa tablodaki
    // kayıtların TAMAMI bir anda oynanamaz hâle gelir; "temizlenmiş bölümde
    // kayıt yok" demek oyuncuyu hiç çözemeyeceği bir işe yollardı.
    const eskiSurum = adaylar.length > 0 && adaylar.every((r) => r.simVersion !== SIM_VERSION);
    throw new DuelError(eskiSurum
      ? 'Every posted record predates the current engine build. They refresh as players descend again.'
      : sogumada
        ? 'You have answered everyone recently. Come back in a few hours.'
        : 'No records on stages you have cleared. Clear another stage first.');
  }

  const kazanan = uygun[0].r;
  return {
    id: kazanan.id, wallet: kazanan.wallet, stageId: kazanan.stageId,
    depth: kazanan.depth, rating: kazanan.rating,
    duelRating: kazanan.player.duelRating, hero: kazanan.player.hero,
    blocker: null,
  };
}

export interface DuelLadderRow {
  rank: number; wallet: string; rating: number;
  wins: number; losses: number; hero: string;
}

/**
 * DÜELLO TABLOSU — sıralamanın kendi kartı.
 *
 * ⚠️ HİÇ DÜELLO OYNAMAMIŞLAR DIŞARIDA. Herkes 1000 puanla başlıyor; filtre
 * olmasa tablo hiç oynamamış yüzlerce 1000'likle dolar ve gerçekten
 * dövüşenler görünmezdi.
 */
export async function ladder(wallet: string, limit = 10): Promise<{
  rows: DuelLadderRow[];
  me: DuelLadderRow | null;
}> {
  const oynamis = { OR: [{ duelWins: { gt: 0 } }, { duelLosses: { gt: 0 } }] };
  const rows = await prisma.player.findMany({
    where: { banned: false, ...oynamis },
    orderBy: [{ duelRating: 'desc' }, { duelWins: 'desc' }],
    take: Math.min(Math.max(limit, 1), 50),
    select: { wallet: true, duelRating: true, duelWins: true, duelLosses: true, hero: true },
  });
  const list = rows.map((r, i) => ({
    rank: i + 1, wallet: r.wallet, rating: r.duelRating,
    wins: r.duelWins, losses: r.duelLosses, hero: r.hero,
  }));

  const ben = await prisma.player.findUnique({
    where: { wallet },
    select: { duelRating: true, duelWins: true, duelLosses: true, hero: true, banned: true },
  });
  if (!ben || ben.banned || (ben.duelWins === 0 && ben.duelLosses === 0)) {
    return { rows: list, me: null };
  }
  const icinde = list.find((r) => r.wallet === wallet);
  if (icinde) return { rows: list, me: icinde };

  // ⚠️ Tablonun dışındaysam SIRAM YİNE GÖRÜNMELİ — "listede yoksun" demek,
  // tırmanmak için sebep bırakmaz.
  const ustum = await prisma.player.count({
    where: { banned: false, ...oynamis, duelRating: { gt: ben.duelRating } },
  });
  return {
    rows: list,
    me: {
      rank: ustum + 1, wallet, rating: ben.duelRating,
      wins: ben.duelWins, losses: ben.duelLosses, hero: ben.hero,
    },
  };
}

/**
 * Meydan okumayı doğrula ve koşunun kurulacağı bilgileri döndür.
 *
 * ⚠️ ARAYÜZDE GİZLENEN DÜĞME BİR KORUMA DEĞİLDİR — aynı `duelBlocker`
 * burada da çalışıyor. Kural tek yerde yazılı, iki yerde uygulanıyor.
 *
 * ⚠️ SÜRÜM KAPISI BURADA, tabloda değil. Tablo bir GÖRÜNÜM; kayıt kimliğini
 * elinde tutan biri düğmeyi hiç görmeden doğrudan `/duel/start` çağırabilir.
 * Uyuşmazlıkta koşu AÇILMIYOR — sessizce başka bir koşu açmak, kaybedeni
 * sebebini hiç öğrenemeyeceği bir maça sokardı.
 */
export async function resolveChallenge(
  wallet: string, recordId: unknown, cleared: Record<string, boolean>,
  /**
   * Meydan okuyanın motorunun sürümü — istemcinin beyanı. `undefined` =
   * sürümünü bildirmeyen (eski) istemci; kasıtlı olarak 0 sayılıyor, yani
   * hiçbir sürüme uymuyor ve kapıdan geçemiyor. Güvenli tarafa kapalı.
   */
  challengerSim: number | undefined,
): Promise<{
  stageId: number; seed: number; defender: string; targetDepth: number;
  defRating: number; simVersion: number;
}> {
  if (typeof recordId !== 'string' || !recordId) throw new DuelError('gecersiz_kayit');
  const rec = await prisma.duelRecord.findUnique({
    where: { id: recordId },
    include: { player: { select: { duelRating: true, banned: true } } },
  });
  if (!rec) throw new DuelError('kayit_yok', 404);
  if (rec.player.banned) throw new DuelError('rakip_yasakli', 403);

  // ⚠️ MEYDAN OKUYANIN KENDİ MOTORU da güncel olmalı. Kayıt sunucuyla aynı
  // sürümde olsa bile, günlerdir açık duran bir sekme ESKİ motoru
  // çalıştırıyor: seed aynı, koşu başka. Bu dal kayıt tarafından AYRI, çünkü
  // yapılacak şey de ayrı — oyuncunun sayfayı yenilemesi yeterli.
  if ((challengerSim ?? 0) !== SIM_VERSION) throw new DuelError(STALE_ENGINE);

  const son = await prisma.duel.findFirst({
    where: { challenger: wallet, defender: rec.wallet },
    orderBy: { createdAt: 'desc' },
    select: { createdAt: true },
  });
  const saat = son ? (Date.now() - son.createdAt.getTime()) / 3_600_000 : Infinity;

  const engel = duelBlocker({
    challenger: wallet, defender: rec.wallet, hoursSince: saat,
    stageCleared: !!cleared[String(rec.stageId)],
    // ⚠️ `STALE_RECORD` buradan çıkıyor — tekrar oynatma bu kapıda ölüyor.
    recordSim: rec.simVersion, engineSim: SIM_VERSION,
  });
  if (engel) throw new DuelError(engel);

  return {
    stageId: rec.stageId,
    // Koşuya damgalanacak sürüm — kaydınkiyle AYNI olmak zorunda ve
    // yukarıdaki kapı bunu garantiledi.
    simVersion: rec.simVersion,
    // ⚠️ SEED KAYITTAN. Yeni seed üretmek düellonun tek adalet dayanağını
    // yok ederdi: iki oyuncu farklı koşuları oynayıp karşılaştırılırdı.
    seed: Number(rec.seed),
    defender: rec.wallet,
    targetDepth: rec.depth,
    defRating: rec.player.duelRating,
  };
}

export interface DuelOutcome {
  won: boolean;
  depth: number;
  target: number;
  delta: number;
  rating: number;
  dust: number;
}

/**
 * Düelloyu kapat — puanları ve tozu yaz.
 *
 * ⚠️ PUANLAR `increment` İLE yazılıyor, mutlak değerle DEĞİL. Asenkron bir
 * ladder'da aynı oyuncuya aynı anda iki kişi meydan okuyabiliyor; mutlak
 * yazma ikinci sonucun birincisini EZMESİNE yol açardı (oku-değiştir-yaz
 * yarışının klasiği). Artımlar toplanır ve ikisi de sayılır.
 *
 * ⚠️ TOZ KOŞULLU YAZMADA. Günlük tavanı okuyup sonra yazmak, aynı anda
 * biten iki düelloda tavanı deldirirdi.
 */
export async function settleDuel(
  challenger: string, defender: string, stageId: number,
  depth: number, target: number, defRating: number,
): Promise<DuelOutcome> {
  const me = await prisma.player.findUnique({
    where: { wallet: challenger }, select: { duelRating: true },
  });
  if (!me) throw new DuelError('oyuncu_yok', 404);

  const won = duelWon(depth, target);
  const r = nextRatings(me.duelRating, defRating, won);
  const dc = r.challenger - me.duelRating;
  const dd = r.defender - defRating;
  const gun = utcDay(new Date());

  let dust = 0;
  await prisma.$transaction(async (tx) => {
    await tx.player.update({
      where: { wallet: challenger },
      data: {
        duelRating: { increment: dc },
        ...(won ? { duelWins: { increment: 1 } } : { duelLosses: { increment: 1 } }),
      },
    });
    // Savunan çevrimdışı — puanı yine de hareket ediyor (asenkron ladder)
    await tx.player.updateMany({
      where: { wallet: defender },
      data: {
        duelRating: { increment: dd },
        ...(won ? { duelLosses: { increment: 1 } } : { duelWins: { increment: 1 } }),
      },
    });
    // ⚠️ TABAN 100 — artımlar birikip puanı eksiye düşürmesin
    await tx.player.updateMany({
      where: { wallet: { in: [challenger, defender] }, duelRating: { lt: 100 } },
      data: { duelRating: 100 },
    });

    if (won) {
      // Gün değiştiyse sayacı sıfırla (tembel sıfırlama — cron yok)
      await tx.player.updateMany({
        where: { wallet: challenger, duelDay: { not: gun } },
        data: { duelDay: gun, duelRewarded: 0 },
      });
      // ⚠️ TAVAN KOŞULUN İÇİNDE: okuyup yazmak iki eşzamanlı düelloda delerdi
      const hit = await tx.player.updateMany({
        where: { wallet: challenger, duelDay: gun, duelRewarded: { lt: DUEL.dailyRewarded } },
        data: { duelRewarded: { increment: 1 }, dust: { increment: DUEL.dustPerWin } },
      });
      if (hit.count > 0) dust = DUEL.dustPerWin;
    }

    await tx.duel.create({
      data: {
        id: crypto.randomUUID(), challenger, defender, stageId,
        depth, target, won, delta: dc, dust,
      },
    });
    // ⚠️ Maç SEZONA işleniyor: yerleşim sayacı ve puanın ait olduğu hafta.
    // Aynı transaction'da olmak zorunda — ayrı olsaydı puan yazılıp maç
    // sayılmayan kayıtlar doğardı ve yerleşim şartı delinirdi.
    await markPvpMatch(tx, [challenger, defender]);
  });

  // ⚠️ Transaction DIŞINDA: görev sayacı bir maçın kapanmasını asla
  // engellememeli (bkz. quests.trackQuest başlığı).
  if (won) await trackQuest(challenger, 'duel', 1);

  const son = await prisma.player.findUniqueOrThrow({
    where: { wallet: challenger }, select: { duelRating: true },
  });
  return { won, depth, target, delta: dc, rating: son.duelRating, dust };
}
