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

  await prisma.run.create({
    data: {
      id: runId, wallet, seed: BigInt(seed), hero: p.hero,
      mode: body.data.mode, stageId: body.data.stageId,
    },
  });
  // BigInt JSON'a serileşmez; seed uint32 olduğu için Number'a sığar.
  res.json({ runId, seed, hero: p.hero });
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
  const s = settleRun(before, run.mode as 'campaign' | 'descent', run.stageId, body.data);

  const [saved] = await prisma.$transaction([
    prisma.player.update({ where: { wallet }, data: fromProgress(s.progress) }),
    prisma.run.update({
      where: { id: run.id },
      data: {
        claimedAt: new Date(),
        claimedDepth: body.data.deepestCleared,
        claimedGold: body.data.rareGold,
        awarded: s.awarded,
        capped: s.capped,
      },
    }),
  ]);

  if (s.capped) console.warn('[kirpildi]', wallet, run.id, s.reason.join(' | '));

  res.json({
    progress: toProgress(saved),
    awarded: s.awarded,
    progressGold: s.progressGold,
    dropGold: s.dropGold,
  });
}));

const port = Number(process.env.PORT ?? 4100);
app.listen(port, () => {
  console.log(`GRAVEBORN backend :${port}`);
});
