// GRAVEBORN backend — sunucu-otoriteli ilerleme.
//
// SÖZLEŞME: istemci ne kazandığını SÖYLEMEZ, ne yaptığını bildirir.
//   POST /run/start   → sunucu seed üretir ve runId açar
//   POST /run/finish   → sunucu ödülü KENDİ hesaplar (reward.ts)
// Bu iki uç olmadan gold, dolayısıyla token, istemciden basılabilir.

import crypto from 'node:crypto';
import express from 'express';
import cors from 'cors';
import { z } from 'zod';
import { prisma, toProgress, fromProgress, getOrCreatePlayer } from './db.js';
import { buildMessage, isValidWallet, issueNonce, issueToken, readToken, verifySignature, verifyTurnstile } from './auth.js';
import { canStart, settleRun } from './reward.js';
import { rankOf, recordDescent, top as lbTop } from './leaderboard.js';
import { paidDepth } from '@game/progress';
import { adminOnly, listPlayers, listRuns, overview, playerDetail, setBanned } from './admin.js';
import {
  MarketError, cancelListing, createListing, escrowedGold, listActive, listMine, tokenEnabled,
} from './market.js';
import { seedFromString } from '@game/rng';

const app = express();
app.use(express.json({ limit: '32kb' }));
app.use(cors({
  origin: (process.env.CORS_ORIGIN ?? 'http://localhost:3200').split(',').map((s) => s.trim()),
  credentials: false,
}));

/** Koşu bu süreden eski ise kapatılamaz — açık runId biriktirip sonra toplu kullanmayı engeller */
const RUN_TTL_MS = 45 * 60 * 1000;

// ── yardımcılar ──
function auth(req: express.Request): string | null {
  const h = req.header('authorization');
  return readToken(h?.startsWith('Bearer ') ? h.slice(7) : undefined);
}

const wrap = (fn: (req: express.Request, res: express.Response) => Promise<void>) =>
  (req: express.Request, res: express.Response) => {
    fn(req, res).catch((e) => {
      console.error('[hata]', req.method, req.path, e);
      res.status(500).json({ error: 'internal' });
    });
  };

app.get('/health', (_req, res) => { res.json({ ok: true }); });

/** Ana sayfa göstergesi — kimlik gerektirmez, kişisel veri döndürmez */
app.get('/stats', wrap(async (_req, res) => {
  const [players, runs] = await Promise.all([
    prisma.player.count(),
    prisma.run.count({ where: { claimedAt: { not: null } } }),
  ]);
  res.json({ players, runs });
}));

// ── KİMLİK ──
app.post('/auth/nonce', wrap(async (req, res) => {
  const wallet = req.body?.wallet;
  if (!isValidWallet(wallet)) { res.status(400).json({ error: 'gecersiz_cuzdan' }); return; }
  const nonce = await issueNonce(wallet);
  res.json({ nonce, message: buildMessage(wallet, nonce) });
}));

app.post('/auth/verify', wrap(async (req, res) => {
  const { wallet, signature, turnstileToken } = req.body ?? {};
  if (!isValidWallet(wallet) || typeof signature !== 'string') {
    res.status(400).json({ error: 'gecersiz_istek' }); return;
  }
  // Bot kontrolü İMZADAN ÖNCE: geçemeyene imza doğrulama maliyeti ödetmeyiz
  if (!(await verifyTurnstile(turnstileToken, req.ip))) {
    res.status(403).json({ error: 'bot_kontrolu_basarisiz' }); return;
  }
  if (!(await verifySignature(wallet, signature))) {
    res.status(401).json({ error: 'imza_dogrulanamadi' }); return;
  }
  const player = await getOrCreatePlayer(wallet);
  res.json({ token: issueToken(wallet), progress: toProgress(player) });
}));

// ── İLERLEME ──
app.get('/progress', wrap(async (req, res) => {
  const wallet = auth(req);
  if (!wallet) { res.status(401).json({ error: 'oturum_yok' }); return; }
  const player = await getOrCreatePlayer(wallet);
  res.json({ progress: toProgress(player) });
}));

/**
 * Karakter seçimi — istemcinin yazabildiği TEK ilerleme alanı.
 * Güvenli çünkü ekonomiye dokunmuyor: karakter gold üretmez, sadece
 * başlangıç silahını ve istatistik eğilimini belirler.
 */
app.post('/progress/hero', wrap(async (req, res) => {
  const wallet = auth(req);
  if (!wallet) { res.status(401).json({ error: 'oturum_yok' }); return; }
  const hero = z.string().max(40).safeParse(req.body?.hero);
  if (!hero.success) { res.status(400).json({ error: 'gecersiz_karakter' }); return; }
  const player = await getOrCreatePlayer(wallet);
  const p = toProgress(player);
  p.hero = hero.data;                       // heroById içeride varsayılana düşürür
  const saved = await prisma.player.update({
    where: { wallet }, data: fromProgress(p),
  });
  res.json({ progress: toProgress(saved) });
}));

/** Forge alımı — fiyatı ve bakiyeyi SUNUCU doğrular */
app.post('/progress/buy', wrap(async (req, res) => {
  const wallet = auth(req);
  if (!wallet) { res.status(401).json({ error: 'oturum_yok' }); return; }
  const id = z.string().max(40).safeParse(req.body?.id);
  if (!id.success) { res.status(400).json({ error: 'gecersiz_yukseltme' }); return; }

  const { FORGE, costOf } = await import('@game/forge');
  const u = FORGE.find((x) => x.id === id.data);
  if (!u) { res.status(400).json({ error: 'bilinmeyen_yukseltme' }); return; }

  const player = await getOrCreatePlayer(wallet);
  const p = toProgress(player);
  const lv = p.upgrades[u.id] ?? 0;
  if (lv >= u.maxLevel) { res.status(400).json({ error: 'zaten_max' }); return; }
  const cost = costOf(u, lv);
  if (p.gold < cost) { res.status(400).json({ error: 'yetersiz_gold' }); return; }

  p.gold -= cost;
  p.upgrades = { ...p.upgrades, [u.id]: lv + 1 };
  const saved = await prisma.player.update({ where: { wallet }, data: fromProgress(p) });
  res.json({ progress: toProgress(saved), spent: cost });
}));

/**
 * PEDLAR'S STALL — tılsım satın alma.
 *
 * ⚠️ Fiyat ve slot sınırı SUNUCUDA doğrulanır; istemcinin gönderdiği tek şey
 * tılsımın id'si. Aksi hâlde "bedava tılsım" en kolay exploit olurdu.
 */
app.post('/charm/buy', wrap(async (req, res) => {
  const wallet = auth(req);
  if (!wallet) { res.status(401).json({ error: 'oturum_yok' }); return; }
  const id = z.string().max(40).safeParse(req.body?.id);
  if (!id.success) { res.status(400).json({ error: 'gecersiz_tilsim' }); return; }

  const { CHARMS, CHARM_SLOTS } = await import('@game/charms');
  const c = CHARMS.find((x) => x.id === id.data);
  if (!c) { res.status(400).json({ error: 'bilinmeyen_tilsim' }); return; }

  const player = await getOrCreatePlayer(wallet);
  const p = toProgress(player);
  if (p.charms.length >= CHARM_SLOTS) { res.status(400).json({ error: 'slot_dolu' }); return; }
  if (p.gold < c.cost) { res.status(400).json({ error: 'yetersiz_gold' }); return; }

  p.gold -= c.cost;
  p.charms = [...p.charms, c.id];
  const saved = await prisma.player.update({ where: { wallet }, data: fromProgress(p) });
  res.json({ progress: toProgress(saved), spent: c.cost });
}));

// ── KOŞU ──
const startSchema = z.object({
  mode: z.enum(['campaign', 'descent']),
  stageId: z.number().int().min(1).max(99),
});

app.post('/run/start', wrap(async (req, res) => {
  const wallet = auth(req);
  if (!wallet) { res.status(401).json({ error: 'oturum_yok' }); return; }
  const body = startSchema.safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: 'gecersiz_istek' }); return; }

  const player = await getOrCreatePlayer(wallet);
  if (player.banned) { res.status(403).json({ error: 'yasakli' }); return; }

  const p = toProgress(player);
  const why = canStart(p, body.data.mode, body.data.stageId);
  if (why) { res.status(400).json({ error: 'baslatilamaz', detay: why }); return; }

  // ⚠️ SEED SUNUCUDAN. Frontend'de istemci saatinden türüyordu; motor DOM'suz
  // olduğu için biri headless simülasyonla en kârlı seed'i arayıp saatini
  // ona kurabilirdi. Artık seed'i oyuncu SEÇEMEZ, sadece alır.
  const runId = crypto.randomUUID();
  const seed = seedFromString(`${runId}:${crypto.randomBytes(8).toString('hex')}`);

  // ⚠️ TILSIMLAR KOŞU AÇILIRKEN YANAR, kapanırken değil. Kapanışta tüketseydik
  // oyuncu koşuyu başlatıp hemen çıkarak tılsımı sonsuza kadar saklardı —
  // tek koşuluk olmalarının anlamı kalmazdı.
  const charms = p.charms;
  if (charms.length) {
    await prisma.player.update({ where: { wallet }, data: { charms: [] } });
  }

  await prisma.run.create({
    data: {
      id: runId, wallet, seed: BigInt(seed), hero: p.hero,
      mode: body.data.mode, stageId: body.data.stageId,
    },
  });
  // BigInt JSON'a serileşmez; seed uint32 olduğu için Number'a sığar.
  // `charms` geri dönüyor: istemci koşuyu bu tılsımlarla kuracak.
  res.json({ runId, seed, hero: p.hero, charms });
}));

const finishSchema = z.object({
  runId: z.string().uuid(),
  deepestCleared: z.number().int().min(0).max(100000),
  rareGold: z.number().int().min(0).max(100000000),
  cleared: z.boolean(),
});

app.post('/run/finish', wrap(async (req, res) => {
  const wallet = auth(req);
  if (!wallet) { res.status(401).json({ error: 'oturum_yok' }); return; }
  const body = finishSchema.safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: 'gecersiz_istek' }); return; }

  const run = await prisma.run.findUnique({ where: { id: body.data.runId } });
  if (!run || run.wallet !== wallet) { res.status(404).json({ error: 'kosu_yok' }); return; }
  // Tek kullanımlık: aynı koşu iki kez ödül alamaz
  if (run.claimedAt) { res.status(409).json({ error: 'zaten_kapatildi' }); return; }
  if (Date.now() - run.startedAt.getTime() > RUN_TTL_MS) {
    await prisma.run.update({ where: { id: run.id }, data: { claimedAt: new Date(), awarded: 0 } });
    res.status(410).json({ error: 'kosu_zaman_asimi' }); return;
  }

  const player = await getOrCreatePlayer(wallet);
  const before = toProgress(player);
  const elapsedSec = (Date.now() - run.startedAt.getTime()) / 1000;
  const s = settleRun(before, run.mode as 'campaign' | 'descent', run.stageId, body.data, elapsedSec);

  const [saved] = await prisma.$transaction([
    prisma.player.update({ where: { wallet }, data: fromProgress(s.progress) }),
    prisma.run.update({
      where: { id: run.id },
      data: {
        claimedAt: new Date(),
        claimedDepth: body.data.deepestCleared,
        claimedGold: body.data.rareGold,
        awarded: s.awarded,
        awardedDepth: paidDepth(s.progress, run.stageId),
        capped: s.capped,
      },
    }),
  ]);

  if (s.capped) console.warn('[kirpildi]', wallet, run.id, s.reason.join(' | '));

  // Leaderboard rekoru — istemcinin iddiasından DEĞİL, sunucunun kabul ettiği
  // derinlikten.
  //
  // ⚠️ KIRPILAN KOŞU REKOR YAZMAZ. Gold tarafında kırpılmış bir iddiadan
  // kalanı ödemek zararsız (miktar küçülür), ama sıralamada tek bir yalan
  // tepeyi kalıcı kilitler. Şüpheliyse tabloya hiç girmesin.
  const reached = paidDepth(s.progress, run.stageId);
  const record = s.capped ? false : await recordDescent(wallet, run.mode, run.stageId, reached);

  res.json({
    progress: toProgress(saved),
    awarded: s.awarded,
    progressGold: s.progressGold,
    dropGold: s.dropGold,
    record,
  });
}));

// ── LEADERBOARD ──
// Puan istemciden gelmez; koşu kapanışında sunucu yazar (bkz. leaderboard.ts).
app.get('/leaderboard', wrap(async (req, res) => {
  const limit = Number(req.query.limit ?? 50);
  // Oturum varsa kendi sıranı da dön — top 50'de olmayan oyuncu nerede
  // olduğunu göremezse tablo ona hiçbir şey söylemiyor demektir.
  const wallet = auth(req);
  const [rows, me] = await Promise.all([
    lbTop(Number.isFinite(limit) ? limit : 50),
    wallet ? rankOf(wallet) : Promise.resolve(null),
  ]);
  res.json({ rows, me });
}));

// ── MARKETPLACE ──
// Oyuncudan oyuncuya: gold ↔ $GRAVE. Hazine taraf DEĞİL (bkz. market.ts).
const listSchema = z.object({
  goldAmount: z.number().int().positive(),
  // Fiyat METİN olarak alınır: JSON number 2^53'ten sonra sessizce bozulur,
  // token en küçük birimi kolayca o aralığa çıkar.
  priceGrave: z.string().regex(/^\d{1,30}$/),
});

app.get('/market/listings', wrap(async (req, res) => {
  const limit = Number(req.query.limit ?? 50);
  const offset = Number(req.query.offset ?? 0);
  res.json({
    listings: await listActive(Number.isFinite(limit) ? limit : 50, Number.isFinite(offset) ? offset : 0),
    tokenEnabled: tokenEnabled(),
  });
}));

app.get('/market/mine', wrap(async (req, res) => {
  const wallet = auth(req);
  if (!wallet) { res.status(401).json({ error: 'oturum_yok' }); return; }
  res.json({ listings: await listMine(wallet), escrowedGold: await escrowedGold(wallet) });
}));

app.post('/market/list', wrap(async (req, res) => {
  const wallet = auth(req);
  if (!wallet) { res.status(401).json({ error: 'oturum_yok' }); return; }
  const body = listSchema.safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: 'gecersiz_istek' }); return; }
  try {
    const listing = await createListing(wallet, body.data.goldAmount, BigInt(body.data.priceGrave));
    const player = await prisma.player.findUniqueOrThrow({ where: { wallet } });
    res.json({
      listing: { ...listing, priceGrave: listing.priceGrave.toString() },
      progress: toProgress(player),
      escrowedGold: await escrowedGold(wallet),
    });
  } catch (e) {
    if (e instanceof MarketError) { res.status(e.status).json({ error: e.code }); return; }
    throw e;
  }
}));

app.post('/market/cancel', wrap(async (req, res) => {
  const wallet = auth(req);
  if (!wallet) { res.status(401).json({ error: 'oturum_yok' }); return; }
  const id = req.body?.id;
  if (typeof id !== 'string') { res.status(400).json({ error: 'gecersiz_istek' }); return; }
  try {
    await cancelListing(wallet, id);
    const player = await prisma.player.findUniqueOrThrow({ where: { wallet } });
    res.json({ progress: toProgress(player), escrowedGold: await escrowedGold(wallet) });
  } catch (e) {
    if (e instanceof MarketError) { res.status(e.status).json({ error: e.code }); return; }
    throw e;
  }
}));

// Satın alma token çıkana kadar KAPALI — sahte bir "satın al" düğmesi
// göstermek, oyuncuyu olmayan bir işleme sokmak olurdu.
app.post('/market/buy', wrap(async (_req, res) => {
  res.status(503).json({ error: 'token_yok' });
}));

// ── ADMIN ──
// Bot politikasının ikinci yarısı: tavan kodda, denetim burada.
// ADMIN_SECRET tanımlı değilse tüm bu uçlar 403 döner (bkz. adminOnly).
app.get('/admin/overview', adminOnly, wrap(async (_req, res) => {
  res.json(await overview());
}));

app.get('/admin/players', adminOnly, wrap(async (req, res) => {
  const sort = req.query.sort === 'capped' ? 'capped' : req.query.sort === 'new' ? 'new' : 'gold';
  const limit = Number(req.query.limit ?? 50);
  res.json({ players: await listPlayers(sort, Number.isFinite(limit) ? limit : 50) });
}));

app.get('/admin/runs', adminOnly, wrap(async (req, res) => {
  const limit = Number(req.query.limit ?? 50);
  res.json({ runs: await listRuns(req.query.capped === '1', Number.isFinite(limit) ? limit : 50) });
}));

app.get('/admin/player/:wallet', adminOnly, wrap(async (req, res) => {
  const detail = await playerDetail(req.params.wallet);
  if (!detail) { res.status(404).json({ error: 'oyuncu_yok' }); return; }
  res.json(detail);
}));

app.post('/admin/ban', adminOnly, wrap(async (req, res) => {
  const { wallet, banned } = req.body ?? {};
  if (!isValidWallet(wallet) || typeof banned !== 'boolean') {
    res.status(400).json({ error: 'gecersiz_istek' }); return;
  }
  const exists = await prisma.player.findUnique({ where: { wallet }, select: { wallet: true } });
  if (!exists) { res.status(404).json({ error: 'oyuncu_yok' }); return; }
  console.warn('[admin]', banned ? 'BAN' : 'BAN KALDIR', wallet);
  res.json(await setBanned(wallet, banned));
}));

const port = Number(process.env.PORT ?? 4100);
app.listen(port, () => {
  console.log(`GRAVEBORN backend :${port}`);
});
