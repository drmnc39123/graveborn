// GRAVEBORN backend — sunucu-otoriteli ilerleme.
//
// SÖZLEŞME: istemci ne kazandığını SÖYLEMEZ, ne yaptığını bildirir.
//   POST /run/start   → sunucu seed üretir ve runId açar
//   POST /run/finish   → sunucu ödülü KENDİ hesaplar (reward.ts)
// Bu iki uç olmadan gold, dolayısıyla token, istemciden basılabilir.

import crypto from 'node:crypto';
import express from 'express';
import cors from 'cors';
import { rateLimit, ipKeyGenerator } from 'express-rate-limit';
import { z } from 'zod';
import { prisma, toProgress, fromProgress, getOrCreatePlayer, saveProgress, YarisHatasi } from './db.js';
import { buildMessage, isValidWallet, issueNonce, issueToken, readToken, verifySignature, verifyTurnstile } from './auth.js';
import { acceptDepth, canStart, resolveAscension, resolveStartDepth, settleRun } from './reward.js';
import { rankOf, recordDescent, top as lbTop } from './leaderboard.js';
import { awardsOf, recordSeason, seasonRankOf, settleSeasons, topSeason } from './season.js';
import { claimCrypt, deedList, vaultState } from './crypt.js';
import {
  GuildError, createGuild, donate, growthOf, joinGuild, leaveGuild, listGuilds, myGuild,
  upgradeGuild,
} from './guild.js';
import {
  GearError, equipGear, equippedBonus, grantRunGear, listGear, salvageGear, unequipSlot,
} from './gear.js';
import { SkillError, listSkills, setSkills, skillsBonusOf } from './skills.js';
import { DuelError, board as duelBoard, findMatch, ladder as duelLadder, publishRecord, resolveChallenge, settleDuel } from './duel.js';
import { GUILD_COST, GUILD_LEVELS } from '@game/guild';
import { cryptUpgradeCost, nextCryptTier } from '@game/crypt';
import { seasonWeek } from '@game/season';
import { paidDepth } from '@game/progress';
import { adminOnly, listPlayers, listRuns, overview, playerDetail, setBanned } from './admin.js';
import {
  MarketError, cancelListing, createListing, escrowedGold, listActive, listMine, tokenEnabled,
} from './market.js';
import { seedFromString } from '@game/rng';
import { wagerPayout } from '@game/wager';
import { PULL_COST } from '@game/cosmetics';
import { profileOf } from './profile.js';
import { bossState, contribute } from './worldBoss.js';
import { attachPresence, presenceCount } from './presence.js';
import { economy, ledgerOf, ledgerWrite, withLedger } from './ledger.js';
import { Prisma } from '@prisma/client';

/** Nullable Json'u boşaltmanın tek doğru yolu — `undefined` "dokunma" demek */
const DbNull = Prisma.DbNull;

const app = express();
app.use(express.json({ limit: '32kb' }));
app.use(cors({
  origin: (process.env.CORS_ORIGIN ?? 'http://localhost:3200').split(',').map((s) => s.trim()),
  credentials: false,
}));

// ── HIZ SINIRI ────────────────────────────────────────────────────────
//
// ⚠️ Bu katman ekonomi korumalarının YERİNE GEÇMEZ, onların ALTINA girer.
// Tek koşu kuralı ve iyimser kilit "ne kadar kazanabilirsin"i sınırlıyor;
// hız sınırı "saniyede kaç kez deneyebilirsin"i. İkisi farklı sorular:
// kilitli bir uca saniyede bin istek atmak yine de veritabanını yatırır.
//
// ⚠️ Anahtar CÜZDAN, IP DEĞİL (varsa). Web3'te bir kullanıcı VPN'le IP
// değiştirir ama cüzdanını değiştiremez — ve aynı kafedeki iki dürüst
// oyuncu tek IP'yi paylaştığı için IP anahtarı onları birbirine bağlardı.
// Oturumu olmayan istekler IP'ye düşer; orada başka bir kimlik yok.
app.set('trust proxy', 1);   // Railway/Vercel arkasında gerçek IP X-Forwarded-For'da

const kimlik = (req: express.Request) =>
  readToken(req.headers.authorization?.replace(/^Bearer /, '')) ?? ipKeyGenerator(req.ip ?? '');

/** Genel tavan — normal oyun bunun çok altında kalır */
app.use(rateLimit({
  windowMs: 60_000,
  limit: 300,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  keyGenerator: kimlik,
  message: { error: 'cok_fazla_istek' },
}));

/**
 * PARA HAREKETİ OLAN UÇLAR — dar tavan.
 *
 * Dürüst oyuncu dakikada birkaç kez satın alma yapar; 30 rahat bir üst
 * sınır. Bot için ise anlamlı bir duvar: iyimser kilit zaten eşzamanlıyı
 * teke indiriyor, bu da SIRAYLA denemeyi yavaşlatıyor.
 */
const paraLimiti = rateLimit({
  windowMs: 60_000,
  limit: 30,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  keyGenerator: kimlik,
  message: { error: 'cok_fazla_istek' },
});
for (const yol of [
  '/forge/buy', '/charm/buy', '/reliquary/pull', '/reliquary/dust-buy',
  '/ossuary/raise', '/wager/set', '/wager/clear',
  '/run/start', '/run/finish', '/boss/start', '/boss/finish',
  '/market/list', '/market/cancel', '/market/buy',
  '/achievement/claim', '/streak/claim', '/cosmetic/equip',
  '/guild/create', '/guild/join', '/guild/leave', '/guild/donate', '/guild/upgrade',
  '/gear/equip', '/gear/unequip', '/gear/salvage', '/skills/set', '/duel/start', '/duel/find',
]) app.use(yol, paraLimiti);

/**
 * KİMLİK UÇLARI — en dar tavan.
 *
 * ⚠️ Nonce üretimi ucuz görünür ama her çağrı bir DB yazımı; kimliksiz
 * olduğu için de tek savunma burası.
 */
const kimlikLimiti = rateLimit({
  windowMs: 60_000, limit: 12, standardHeaders: 'draft-7', legacyHeaders: false,
  keyGenerator: (req: express.Request) => ipKeyGenerator(req.ip ?? ''),
  message: { error: 'cok_fazla_istek' },
});
for (const yol of ['/auth/nonce', '/auth/verify']) app.use(yol, kimlikLimiti);

/** Koşu bu süreden eski ise kapatılamaz — açık runId biriktirip sonra toplu kullanmayı engeller */
const RUN_TTL_MS = 45 * 60 * 1000;

/**
 * ⚠️ AYNI ANDA TEK KOŞU — ekonominin en sert kuralı.
 *
 * Bu koruma olmadan koşular PARA BASIYOR. Ölçüldü: checkpoint d20'deki bir
 * hesap 20 koşuyu aynı anda açıp 48 saniye sonra hepsini kapatınca 81.481
 * gold alıyordu; saatlik ~6.000.000 gold, dürüst tekrar koşusunun (~122
 * gold/saat) yaklaşık 49.000 katı — Forge ağacının tamamı 2,5 dakikada.
 *
 * Sebep: ilerleme ödülü `depthPaid` sayesinde bir kez ödeniyor ama NADİR
 * DÜŞÜŞ tavanı KOŞU BAŞINA uygulanıyor. Tavan tek bir koşu için doğru;
 * yanlış olan sınırsız koşu açılabilmesiydi. Tavanı kısmak dürüst oyuncuyu
 * cezalandırırdı — doğru yer burası.
 *
 * ⚠️ Yeni koşu, açık kalan öncekini REDDETMEZ, İPTAL EDER. Sekmesi çöken
 * oyuncu 45 dakika kilitli kalmamalı. İptal edilen koşunun `claimedAt`'i
 * dolduğu için `/run/finish` ona 409 döner ve ödül alamaz.
 *
 * ⚠️ Dünya boss'u koşuları da dahil (tek tablo, tek kural): aksi hâlde bir
 * oyuncu yüzlerce boss koşusunu paralel açıp haftalık boss'u tek başına
 * devirebilir ve hasar tablosunu uydurabilirdi.
 */
async function acikKosulariIptalEt(wallet: string): Promise<number> {
  const iptal = await prisma.run.updateMany({
    where: { wallet, claimedAt: null },
    data: { claimedAt: new Date(), awarded: 0, capped: true },
  });
  if (iptal.count > 0) console.warn('[kosu-iptal]', wallet, `${iptal.count} acik kosu kapatildi`);
  return iptal.count;
}

// ── yardımcılar ──
function auth(req: express.Request): string | null {
  const h = req.header('authorization');
  return readToken(h?.startsWith('Bearer ') ? h.slice(7) : undefined);
}

const wrap = (fn: (req: express.Request, res: express.Response) => Promise<void>) =>
  (req: express.Request, res: express.Response) => {
    fn(req, res).catch((e) => {
      // ⚠️ Yarış hatası bir SUNUCU HATASI DEĞİL: araya eşzamanlı bir yazım
      // girdi, hiçbir şey değişmedi, istek güvenle tekrarlanabilir. 500
      // dönmek hem log'u kirletir hem istemciye "bozuldu" dedirtirdi.
      if (e instanceof YarisHatasi) {
        res.status(409).json({ error: 'es_zamanli_degisim' });
        return;
      }
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
  const saved = await withLedger(wallet, fromProgress(p),
    { kind: 'forge', gold: -cost, detail: `${u.id} L${lv + 1}` }, player.rev);
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
  const saved = await withLedger(wallet, fromProgress(p),
    { kind: 'charm', gold: -c.cost, detail: c.id }, player.rev);
  res.json({ progress: toProgress(saved), spent: c.cost });
}));

// ── THE RELIQUARY ──
//
// ⚠️ ZARI SUNUCU ATAR. Çekiliş sonucu istemciden gelseydi oyuncu 450 gold'a
// istediği legendary'yi "çekmiş" olurdu. İstemci tek bir sayı bile
// göndermiyor: sadece "çek" diyor.
//
// ⚠️ `crypto.randomInt` kullanılıyor, `Math.random()` değil. Oyun motorunun
// mulberry32'si BURAYA UYMAZ — o determinizm için var (aynı seed → aynı koşu);
// gacha'da tam tersi isteniyor, sonuç tahmin EDİLEMEMELİ.
app.post('/reliquary/pull', wrap(async (req, res) => {
  const wallet = auth(req);
  if (!wallet) { res.status(401).json({ error: 'oturum_yok' }); return; }

  const player = await getOrCreatePlayer(wallet);
  if (player.banned) { res.status(403).json({ error: 'yasakli' }); return; }

  const { pullReliquary } = await import('@game/progress');
  const roll = () => crypto.randomInt(0, 1 << 30) / (1 << 30);
  const out = pullReliquary(toProgress(player), roll(), roll());
  if (out.error) { res.status(400).json({ error: 'cekilis_yok', detay: out.error }); return; }

  const saved = await withLedger(wallet, fromProgress(out.progress), {
    kind: 'reliquary', gold: -PULL_COST,
    detail: out.result!.duplicate ? `${out.result!.cosmetic.id} (dup)` : out.result!.cosmetic.id,
  }, player.rev);
  res.json({
    progress: toProgress(saved),
    // Kozmetiğin TANIMI değil sadece id'si dönüyor — tanım zaten istemcide
    // (`cosmetics.ts` iki tarafta ortak), ağdan tekrar taşımak gereksiz.
    id: out.result!.cosmetic.id,
    duplicate: out.result!.duplicate,
    dust: out.result!.dust,
  });
}));

app.post('/reliquary/dust-buy', wrap(async (req, res) => {
  const wallet = auth(req);
  if (!wallet) { res.status(401).json({ error: 'oturum_yok' }); return; }
  const id = z.string().max(40).safeParse(req.body?.id);
  if (!id.success) { res.status(400).json({ error: 'gecersiz_id' }); return; }

  const player = await getOrCreatePlayer(wallet);
  const { buyWithDust } = await import('@game/progress');
  const out = buyWithDust(toProgress(player), id.data);
  if (out.error) { res.status(400).json({ error: 'alinamadi', detay: out.error }); return; }

  // ⚠️ gold: 0 — bu bir TOZ harcaması. Deftere yine de giriyor: kozmetiğin
  // nereden geldiği (çekiliş mi, hedefli alım mı) sonradan sorulabilir olmalı.
  const saved = await withLedger(wallet, fromProgress(out.progress),
    { kind: 'dust', gold: 0, detail: id.data }, player.rev);
  res.json({ progress: toProgress(saved) });
}));

app.post('/cosmetic/equip', wrap(async (req, res) => {
  const wallet = auth(req);
  if (!wallet) { res.status(401).json({ error: 'oturum_yok' }); return; }
  const body = z.object({
    slot: z.enum(['title', 'plate', 'trophy', 'aura']),
    // null = yuvayı boşalt
    id: z.string().max(40).nullable(),
  }).safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: 'gecersiz_istek' }); return; }

  const player = await getOrCreatePlayer(wallet);
  const { equipCosmetic } = await import('@game/progress');
  // ⚠️ Sahiplik kontrolü `equipCosmetic` içinde — sunucuya ayrı bir kontrol
  // yazmak, iki yerde iki kural demekti. Sahip olmadığını takmaya çalışan
  // istek sessizce eskisini korur.
  const next = equipCosmetic(toProgress(player), body.data.slot, body.data.id);
  const saved = await saveProgress(wallet, player.rev, fromProgress(next));
  res.json({ progress: toProgress(saved) });
}));

/**
 * GOLD DEFTERİ — oyuncunun kendi hareketleri.
 * "Gold'um nereye gitti" sorusunun cevabı; bugüne kadar hiçbir yerde yoktu.
 */
app.get('/ledger', wrap(async (req, res) => {
  const wallet = auth(req);
  if (!wallet) { res.status(401).json({ error: 'oturum_yok' }); return; }
  res.json({ entries: await ledgerOf(wallet) });
}));

/**
 * OYUNCU DOSYASI — Tavern'in "HISTORY" sekmesi.
 * Sadece KENDİ dosyanı görürsün; başkasının koşu geçmişi kişisel veridir ve
 * leaderboard'da zaten görünmesi gereken her şey görünüyor.
 */
app.get('/profile', wrap(async (req, res) => {
  const wallet = auth(req);
  if (!wallet) { res.status(401).json({ error: 'oturum_yok' }); return; }
  res.json(await profileOf(wallet));
}));

// ── HAFTALIK ORTAK BOSS ──
//
// ⚠️ AYRI UÇLAR, `settleRun`'a DOKUNULMADI. Boss odası gold ÖDEMİYOR, yani
// `settleRun`'ın kampanya/descent dallarına üçüncü bir mod eklemek sadece
// risk olurdu — ödül hesabı en hassas kod ve boss'un onunla işi yok.
app.get('/worldboss', wrap(async (req, res) => {
  // Kimlik ZORUNLU DEĞİL: boss odası herkese görünür, "gir de gör" olsun.
  res.json(await bossState(auth(req) ?? undefined));
}));

app.post('/boss/start', wrap(async (req, res) => {
  const wallet = auth(req);
  if (!wallet) { res.status(401).json({ error: 'oturum_yok' }); return; }
  const player = await getOrCreatePlayer(wallet);
  if (player.banned) { res.status(403).json({ error: 'yasakli' }); return; }

  const st = await bossState(wallet);
  if (st.defeated) { res.status(409).json({ error: 'boss_devrildi' }); return; }

  await acikKosulariIptalEt(wallet);   // paralel boss koşusu = uydurma hasar tablosu

  const runId = crypto.randomUUID();
  const seed = seedFromString(`${runId}:${crypto.randomBytes(8).toString('hex')}`);
  await prisma.run.create({
    data: {
      id: runId, wallet, seed: BigInt(seed), hero: toProgress(player).hero,
      mode: 'worldboss', stageId: 0,
    },
  });
  res.json({ runId, seed, hero: toProgress(player).hero, week: st.week, bossId: st.bossId });
}));

app.post('/boss/finish', wrap(async (req, res) => {
  const wallet = auth(req);
  if (!wallet) { res.status(401).json({ error: 'oturum_yok' }); return; }
  const body = z.object({
    runId: z.string().uuid(),
    damage: z.number().int().min(0).max(2_000_000_000),
  }).safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: 'gecersiz_istek' }); return; }

  const run = await prisma.run.findUnique({ where: { id: body.data.runId } });
  if (!run || run.wallet !== wallet || run.mode !== 'worldboss') {
    res.status(404).json({ error: 'kosu_yok' }); return;
  }
  if (run.claimedAt) { res.status(409).json({ error: 'zaten_kapatildi' }); return; }

  const player = await getOrCreatePlayer(wallet);
  // ⚠️ SÜRE SUNUCUDAN. Tavan buna bağlı; istemciden alınsaydı tavan da
  // istemcinin elinde olurdu.
  const elapsedSec = (Date.now() - run.startedAt.getTime()) / 1000;
  const out = await contribute(wallet, toProgress(player), body.data.damage, elapsedSec);

  await prisma.run.update({
    where: { id: run.id },
    data: {
      claimedAt: new Date(),
      claimedGold: body.data.damage,   // ham iddia — admin panelinde okunur
      awarded: out.accepted,
      capped: out.capped,
    },
  });
  if (out.capped) console.warn('[boss-kirpildi]', wallet, run.id, body.data.damage, '→', out.accepted);

  res.json({ accepted: out.accepted, capped: out.capped, state: out.state });
}));

// ── BAŞARIMLAR + GÜNLÜK SERİ ──
//
// ⚠️ Başarım koşulları SADECE `Progress`ten okunuyor (achievements.ts) ve
// `Progress` sunucu-otoriteli. Yani istemcinin "şu başarımı hak ettim"
// demesine gerek yok — sunucu aynı saf fonksiyonu çalıştırıp kendisi bakıyor.
app.post('/achievement/claim', wrap(async (req, res) => {
  const wallet = auth(req);
  if (!wallet) { res.status(401).json({ error: 'oturum_yok' }); return; }
  const id = z.string().max(40).safeParse(req.body?.id);
  if (!id.success) { res.status(400).json({ error: 'gecersiz_id' }); return; }

  const player = await getOrCreatePlayer(wallet);
  const { claimAchievement } = await import('@game/progress');
  const out = claimAchievement(toProgress(player), id.data);
  if (out.error) { res.status(400).json({ error: 'alinamadi', detay: out.error }); return; }

  // ⚠️ Deftere GOLD hareketi yazılmıyor çünkü YOK — ödül toz ve kozmetik.
  // Faz 2'de dengelenen musluk/sink oranı bu sayede bozulmuyor.
  // ⚠️ Ama İYİMSER KİLİT ŞART: ödül veren bir yol, korumasız bırakılırsa
  // eşzamanlı iki istekle iki kez ödenir.
  const saved = await saveProgress(wallet, player.rev, fromProgress(out.progress));
  res.json({ progress: toProgress(saved) });
}));

app.post('/streak/claim', wrap(async (req, res) => {
  const wallet = auth(req);
  if (!wallet) { res.status(401).json({ error: 'oturum_yok' }); return; }

  const player = await getOrCreatePlayer(wallet);
  const { claimStreak, utcDay } = await import('@game/progress');
  // ⚠️ GÜN SUNUCUDAN. İstemcinin tarihine güvenmek, sistem saatini ileri
  // alıp aynı gün içinde seriyi defalarca toplamanın kapısını açardı.
  const out = claimStreak(toProgress(player), utcDay(new Date()));
  if (out.error) { res.status(400).json({ error: 'alinamadi', detay: out.error }); return; }

  const saved = await saveProgress(wallet, player.rev, fromProgress(out.progress));
  res.json({ progress: toProgress(saved), reward: out.reward, days: out.days });
}));

// ── THE OSSUARY ──
// Ekonominin dipsiz kovası. Tavan YOK; maliyet `ossuaryCost` ile SUNUCUDA
// hesaplanır, istemciden fiyat alınmaz.
app.post('/ossuary/raise', wrap(async (req, res) => {
  const wallet = auth(req);
  if (!wallet) { res.status(401).json({ error: 'oturum_yok' }); return; }

  const player = await getOrCreatePlayer(wallet);
  const { raiseOssuary } = await import('@game/progress');
  const before = toProgress(player);
  const out = raiseOssuary(before);
  if (out.error) { res.status(400).json({ error: 'yukseltilemedi', detay: out.error }); return; }

  const saved = await withLedger(wallet, fromProgress(out.progress), {
    kind: 'ossuary', gold: -(before.gold - out.progress.gold),
    detail: `L${out.progress.ossuary}`,
  }, player.rev);
  res.json({ progress: toProgress(saved) });
}));

// ── THE WAGER ──
// ⚠️ Bahis GOLD ÖDEMEZ, TOZ öder (bkz. wager.ts başlığı) — gold ödeseydi
// erken oyunda rekor her koşuda arttığı için bir MUSLUK olurdu.
app.post('/wager/place', wrap(async (req, res) => {
  const wallet = auth(req);
  if (!wallet) { res.status(401).json({ error: 'oturum_yok' }); return; }
  const body = z.object({
    stageId: z.number().int().min(1).max(99),
    stake: z.number().int().min(1).max(10_000_000),
  }).safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: 'gecersiz_istek' }); return; }

  const player = await getOrCreatePlayer(wallet);
  if (player.banned) { res.status(403).json({ error: 'yasakli' }); return; }

  const { placeWager } = await import('@game/progress');
  // ⚠️ Hedef İSTEMCİDEN ALINMAZ — `placeWager` oyuncunun kendi rekorundan
  // türetir. Alınsaydı "hedefim derinlik 1" deyip bedava toz basılırdı.
  const out = placeWager(toProgress(player), body.data.stageId, body.data.stake);
  if (out.error) { res.status(400).json({ error: 'bahis_kurulamadi', detay: out.error }); return; }

  const saved = await saveProgress(wallet, player.rev, fromProgress(out.progress));
  res.json({ progress: toProgress(saved) });
}));

app.post('/wager/clear', wrap(async (req, res) => {
  const wallet = auth(req);
  if (!wallet) { res.status(401).json({ error: 'oturum_yok' }); return; }
  const player = await getOrCreatePlayer(wallet);
  const { clearWager } = await import('@game/progress');
  const saved = await saveProgress(wallet, player.rev, fromProgress(clearWager(toProgress(player))));
  res.json({ progress: toProgress(saved) });
}));

// ── KOŞU ──
const startSchema = z.object({
  // ⚠️ 'wilderness' motorda BİR MOD DEĞİL — motor onu descent olarak
  // çalıştırıyor (bkz. gear.ts başlığı). Fark tamamen sunucunun ne ödediğinde.
  mode: z.enum(['campaign', 'descent', 'wilderness', 'duel']),
  stageId: z.number().int().min(1).max(99),
  /**
   * İstemcinin başlamak İSTEDİĞİ derinlik. Bir istek, bir izin değil —
   * `resolveStartDepth` bunu oyuncunun hak ettiği checkpoint'e kırpar.
   */
  startDepth: z.number().int().min(1).max(100000).optional(),
  /** İstenen ascension kademesi — `resolveAscension` hak edilene kırpar */
  ascension: z.number().int().min(0).max(50).optional(),
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

  // ⚠️ BAHİS DE KOŞU AÇILIRKEN YANAR — tılsımlardaki gerekçenin aynısı.
  // Sadece DESCENT'te ve SADECE aynı bölümde geçerli: kampanyada derinlik
  // kavramı yok, başka bölümde de rekor başka.
  const bahis = p.wager;
  const bahisGecerli = !!bahis
    && body.data.mode === 'descent'
    && bahis.stageId === body.data.stageId
    && p.gold >= bahis.stake;

  if (charms.length || bahis) {
    const temizle = prisma.player.update({
      where: { wallet },
      data: {
        charms: [],
        wager: DbNull,   // geçersiz olsa bile temizlenir — koşuya taşınmayan bahis kalmaz
        ...(bahisGecerli ? { gold: { decrement: bahis!.stake } } : {}),
      },
    });
    // ⚠️ Bahis yanması da deftere girer ve AYNI transaction'da: yoksa
    // "gold nereye gitti" sorusunun cevabı bir yerde eksik kalır.
    await (bahisGecerli
      ? prisma.$transaction([temizle, ledgerWrite({
          wallet, kind: 'wager', gold: -bahis!.stake, detail: `target d${bahis!.target}`,
        })])
      : temizle);
  }

  // Checkpoint SUNUCUDA çözülür — istemcinin isteği burada kırpılır
  const startDepth = resolveStartDepth(p, body.data.mode, body.data.stageId, body.data.startDepth);
  // Ascension da öyle: kilidi oyuncunun ULAŞTIĞI derinlik açıyor
  const ascension = resolveAscension(p, body.data.mode, body.data.stageId, body.data.ascension);

  // ⚠️ LONCA PERKİ SUNUCUDAN GELİR, istemciden gelmez. İstemci "loncam 5.
  // seviye" diyebilseydi perk beyan edilen bir şey olurdu; burada okunuyor.
  // (Ödül güvenliği buna dayanmıyor — o yapısal tavanlarda — ama bir bonusun
  // kaynağı hiçbir zaman istemci olmamalı, kural sızıntı bırakmasın diye.)
  const guildGrowth = await growthOf(wallet);
  // ⚠️ EKİPMAN BONUSU DA SUNUCUDAN. Aynı gerekçe: bir bonusun kaynağı
  // hiçbir zaman istemci olmamalı. İstemci takılı parçalarını zaten biliyor
  // ama BEYAN etmemeli — beyan ettiği an "5 Graveborn takılıyım" diyebilir.
  const gear = await equippedBonus(wallet);
  // ⚠️ Beceri bonusu da SUNUCUDAN — üçüncü kez aynı kural: bir bonusun
  // kaynağı hiçbir zaman istemci olmamalı.
  const skills = await skillsBonusOf(wallet);

  await acikKosulariIptalEt(wallet);   // ⚠️ bkz. fonksiyon başlığı — para basma koruması

  await prisma.run.create({
    data: {
      id: runId, wallet, seed: BigInt(seed), hero: p.hero,
      mode: body.data.mode, stageId: body.data.stageId,
      startDepth: Math.max(1, startDepth),
      ascension,
      wagerStake: bahisGecerli ? bahis!.stake : 0,
      wagerTarget: bahisGecerli ? bahis!.target : 0,
    },
  });
  // BigInt JSON'a serileşmez; seed uint32 olduğu için Number'a sığar.
  // `charms` geri dönüyor: istemci koşuyu bu tılsımlarla kuracak.
  // `startDepth` de dönüyor: istemci motoru BU değerle kurmak ZORUNDA, yoksa
  // oynadığı koşu sunucunun doğrulayacağı koşu olmaz.
  // `ascension` geri dönüyor: istemci motoru BU değerle kurmak ZORUNDA,
  // yoksa oynadığı koşu sunucunun doğrulayacağı koşu olmaz.
  // `guildGrowth`: loncanın verdiği XP bonusu (0 = loncasız)
  // `gear`: takılı ekipmanın toplam bonusu — motor bunu `permanent` kanalında okur
  res.json({ runId, seed, hero: p.hero, charms, startDepth, ascension, guildGrowth, gear, skills });
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

  // ── DÜELLO ──
  // ⚠️ AYRI YOL, `settleRun`'a HİÇ UĞRAMIYOR. Wilderness ile aynı gerekçe:
  // düello sınırsız tekrarlanabiliyor, dolayısıyla tek kuruş gold ödeyemez.
  // `depthPaid` de ilerlemiyor ve leaderboard'a yazılmıyor.
  if (run.mode === 'duel') {
    const kabul = acceptDepth('duel', run.stageId, body.data.deepestCleared,
      elapsedSec, run.startDepth);
    const sonuc = kabul.capped
      // Kırpılmış bir iddia düello KAZANAMAZ — leaderboard ve bahisteki
      // kuralın aynısı. Şüpheli koşuya puan vermek tabloyu kilitlerdi.
      ? await settleDuel(wallet, run.duelDefender!, run.stageId, 0,
          run.duelTargetDepth ?? 0, run.duelDefRating ?? 1000)
      : await settleDuel(wallet, run.duelDefender!, run.stageId, kabul.depth,
          run.duelTargetDepth ?? 0, run.duelDefRating ?? 1000);

    await prisma.run.update({
      where: { id: run.id },
      data: {
        claimedAt: new Date(), claimedDepth: body.data.deepestCleared,
        claimedGold: 0, awarded: 0, awardedDepth: kabul.depth, capped: kabul.capped,
      },
    });
    if (kabul.capped) console.warn('[kirpildi:duel]', wallet, run.id, kabul.reason.join(' | '));

    res.json({
      progress: toProgress(await getOrCreatePlayer(wallet)),
      awarded: 0, progressGold: 0, dropGold: 0, record: false, wager: null,
      duel: { ...sonuc, defender: run.duelDefender, capped: kabul.capped },
    });
    return;
  }

  // ── THE WILDERNESS ──
  // ⚠️ AYRI YOL, `settleRun`'a HİÇ UĞRAMIYOR. Sebep tek cümle: Wilderness
  // sınırsız tekrarlanabilir, dolayısıyla tek kuruş gold ödeyemez. Aynı
  // gerekçeyle `depthPaid` de ilerlemiyor ve leaderboard'a hiç yazmıyor —
  // tekrarlanabilir bir mod rekor tablosunu anlamsız kılardı.
  if (run.mode === 'wilderness') {
    const kabul = acceptDepth('wilderness', run.stageId, body.data.deepestCleared,
      elapsedSec, run.startDepth);
    // ⚠️ ÇIKIŞ ŞARTI: ölen hiçbir şey almaz. `cleared` istemcinin sözü ve
    // doğrulanamıyor (bkz. gear.ts başlığı) — ama yalancı, dürüst bir
    // oyuncunun başarıyla çıktığında alacağından FAZLASINI alamıyor:
    // parça sayısı kabul edilen derinlikten türüyor.
    const cikti = !!body.data.cleared;
    const odul = cikti && !kabul.capped
      ? await grantRunGear(wallet, Number(run.seed), kabul.depth)
      : { items: [], dropped: 0 };

    await prisma.run.update({
      where: { id: run.id },
      data: {
        claimedAt: new Date(), claimedDepth: body.data.deepestCleared,
        claimedGold: 0, awarded: 0, awardedDepth: kabul.depth, capped: kabul.capped,
      },
    });
    if (kabul.capped) console.warn('[kirpildi:wilderness]', wallet, run.id, kabul.reason.join(' | '));

    res.json({
      progress: toProgress(await getOrCreatePlayer(wallet)),
      awarded: 0, progressGold: 0, dropGold: 0, record: false, wager: null,
      wilderness: {
        extracted: cikti,
        depth: kabul.depth,
        items: odul.items,
        /** çanta dolu olduğu için verilemeyen parça sayısı */
        dropped: odul.dropped,
      },
    });
    return;
  }

  const s = settleRun(
    before, run.mode as 'campaign' | 'descent', run.stageId, body.data, elapsedSec,
    run.startDepth, run.ascension,
  );

  // ── BAHİS ──
  // ⚠️ Kazanç ölçüsü SUNUCUNUN kabul ettiği derinlik. `settleRun` iddiayı
  // zaten süre tabanına kırptı; bahis o çıktıyı okuyor, istemcinin sayısını
  // değil. Hedef = koşu öncesi rekor + 1 olduğu için "paidDepth arttı mı"
  // sorusu tam olarak "rekorunu geçti mi" demek.
  //
  // ⚠️ KIRPILAN KOŞU BAHSİ KAZANAMAZ — leaderboard'daki kuralın aynısı.
  // Şüpheli bir koşuya toz ödemek, kırpmanın anlamını ortadan kaldırırdı.
  const ulasilan = paidDepth(s.progress, run.stageId);
  const bahisKazandi = run.wagerStake > 0 && !s.capped && ulasilan >= run.wagerTarget;
  const bahisTozu = bahisKazandi ? wagerPayout(run.wagerStake) : 0;

  // ⚠️ SIRA ÖNEMLİ: `saved` DİZİNİN İLK ELEMANI. Defter kaydını başa koymak
  // `saved`'a oyuncu satırı yerine defter satırını verirdi ve yanıt sessizce
  // bozulurdu — oyuncu güncellemesi hep 0. sırada kalmalı.
  const [saved] = await prisma.$transaction([
    prisma.player.update({
      where: { wallet },
      data: {
        ...fromProgress(s.progress),
        // ⚠️ `increment` kullanılıyor: `fromProgress` toz alanını koşu
        // ÖNCESİ değerle yazıyor, üstüne düz atama yapmak eşzamanlı bir
        // Reliquary çekilişini silebilirdi.
        ...(bahisTozu > 0 ? { dust: { increment: bahisTozu } } : {}),
      },
    }),
    prisma.run.update({
      where: { id: run.id },
      data: {
        claimedAt: new Date(),
        claimedDepth: body.data.deepestCleared,
        claimedGold: body.data.rareGold,
        awarded: s.awarded,
        awardedDepth: ulasilan,
        capped: s.capped,
        wagerWon: bahisKazandi,
      },
    }),
    ledgerWrite({
      wallet, kind: 'run', gold: s.awarded,
      detail: `${run.mode} s${run.stageId}${ulasilan ? ` d${ulasilan}` : ''}${s.capped ? ' (trimmed)' : ''}`,
    }),
  ]);

  if (s.capped) console.warn('[kirpildi]', wallet, run.id, s.reason.join(' | '));

  // Leaderboard rekoru — istemcinin iddiasından DEĞİL, sunucunun kabul ettiği
  // derinlikten.
  //
  // ⚠️ KIRPILAN KOŞU REKOR YAZMAZ. Gold tarafında kırpılmış bir iddiadan
  // kalanı ödemek zararsız (miktar küçülür), ama sıralamada tek bir yalan
  // tepeyi kalıcı kilitler. Şüpheliyse tabloya hiç girmesin.
  // Aynı kırpma kuralı sezon tablosunda da geçerli — iki tablo, tek karar.
  const record = s.capped ? false : await recordDescent(wallet, run.mode, run.stageId, ulasilan, run.ascension);
  if (!s.capped) await recordSeason(wallet, run.mode, run.stageId, ulasilan, run.ascension);
  // ⚠️ DÜELLO KAYDI da buradan yayınlanıyor — ve SADECE kırpılmamış koşudan.
  // Şüpheli bir iddiadan doğan kayıt, ona meydan okuyan HERKESİN puanını
  // bozardı.
  await publishRecord(wallet, run.mode, run.stageId, Number(run.seed), ulasilan,
    run.ascension, s.capped);

  res.json({
    progress: toProgress(saved),
    awarded: s.awarded,
    progressGold: s.progressGold,
    dropGold: s.dropGold,
    record,
    // Bahis vardıysa sonucu — arayüz koşu sonu dökümünde gösterir
    wager: run.wagerStake > 0
      ? { stake: run.wagerStake, target: run.wagerTarget, won: bahisKazandi, dust: bahisTozu }
      : null,
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

/**
 * HAFTALIK SEZON TABLOSU.
 *
 * ⚠️ Kapanmış haftaların ödülü BURADA dağıtılıyor (`settleSeasons`). Arka
 * plan işi yok; tabloyu açan ilk kişi geçen haftayı da kapatmış oluyor.
 * Bu bilinçli bir seçim: uyuyan bir sunucuda cron çalışmaz, ödül kaybolur.
 * Dağıtım hafta numarasına bağlı olduğu için GECİKEBİLİR ama BOZULMAZ.
 */
app.get('/leaderboard/season', wrap(async (req, res) => {
  await settleSeasons();

  const limit = Number(req.query.limit ?? 50);
  const wallet = auth(req);
  const [board, me, awards] = await Promise.all([
    topSeason(Number.isFinite(limit) ? limit : 50),
    wallet ? seasonRankOf(wallet) : Promise.resolve(null),
    wallet ? awardsOf(wallet) : Promise.resolve([]),
  ]);
  res.json({ ...board, me, awards });
}));

// ── THE CRYPT DEED ──
//
// ⚠️ BU BİR MUSLUK DEĞİL. Deed pasif gold ÜRETMİYOR; her gold sink'inin %10'u
// ortak bir kasaya düşüyor ve sahipler oradan çekiyor (bkz. game/crypt.ts).
// Kasa gerçek bir bakiye — içine girmemiş gold çıkamaz.
app.get('/crypt', wrap(async (req, res) => {
  const wallet = auth(req);
  const [vault, me] = await Promise.all([
    vaultState(),
    wallet ? prisma.player.findUnique({
      where: { wallet }, select: { cryptTier: true, cryptClaimedWeek: true },
    }) : Promise.resolve(null),
  ]);
  res.json({
    tiers: deedList(),
    vault: { balance: vault.balance, owners: vault.owners, totalWeight: vault.totalWeight },
    me: me ? { tier: me.cryptTier, claimedWeek: me.cryptClaimedWeek } : null,
    week: seasonWeek(new Date()),
  });
}));

app.post('/crypt/buy', wrap(async (req, res) => {
  const wallet = auth(req);
  if (!wallet) { res.status(401).json({ error: 'oturum_yok' }); return; }
  const player = await getOrCreatePlayer(wallet);
  if (player.banned) { res.status(403).json({ error: 'yasakli' }); return; }

  const next = nextCryptTier(player.cryptTier);
  if (!next) { res.status(400).json({ error: 'zaten_max' }); return; }
  // ⚠️ FİYAT SUNUCUDA. İstemci hangi kademeyi istediğini bile göndermiyor:
  // tek geçerli hamle "bir sonraki kademe", o yüzden seçime yer yok.
  const cost = cryptUpgradeCost(player.cryptTier);
  const p = toProgress(player);
  if (p.gold < cost) { res.status(400).json({ error: 'yetersiz_gold' }); return; }

  p.gold -= cost;
  // ⚠️ Deed'in KENDİSİ de bir sink ve kasaya katkı yapar — `withLedger`
  // içindeki kanca `crypt_deed` türünü de sayıyor olsaydı oyuncu kendi
  // alımından pay alırdı. O yüzden tür `forge` ailesinde DEĞİL: aşağıdaki
  // `crypt_deed` SINK_KINDS'ta yok, yani alım bedeli TAMAMEN imha ediliyor.
  const saved = await withLedger(wallet, {
    ...fromProgress(p), cryptTier: next.tier,
  }, { kind: 'crypt_deed', gold: -cost, detail: `T${next.tier} ${next.name}` }, player.rev);

  res.json({ progress: toProgress(saved), tier: next.tier, spent: cost });
}));

app.post('/crypt/claim', wrap(async (req, res) => {
  const wallet = auth(req);
  if (!wallet) { res.status(401).json({ error: 'oturum_yok' }); return; }
  const out = await claimCrypt(wallet);
  if (!out.ok) { res.status(400).json({ error: out.reason }); return; }
  const player = await getOrCreatePlayer(wallet);
  res.json({ progress: toProgress(player), amount: out.amount, week: out.week });
}));

// ── LONCALAR ──
//
// ⚠️ Perk GOLD DEĞİL XP veriyor (bkz. game/guild.ts). Gold veren bir lonca
// perki musluğu üye sayısıyla çarpardı ve bugün kapatılan iki para basma
// açığının üçüncüsü olurdu.
app.get('/guild', wrap(async (req, res) => {
  const wallet = auth(req);
  const [mine, list] = await Promise.all([
    wallet ? myGuild(wallet) : Promise.resolve(null),
    listGuilds(),
  ]);
  res.json({ mine, list, cost: GUILD_COST, levels: GUILD_LEVELS });
}));

app.post('/guild/create', wrap(async (req, res) => {
  const wallet = auth(req);
  if (!wallet) { res.status(401).json({ error: 'oturum_yok' }); return; }
  const player = await getOrCreatePlayer(wallet);
  try {
    const guild = await createGuild(wallet, player.rev, req.body?.name, req.body?.tag);
    // ⚠️ İLERLEME DE DÖNÜYOR. Kurma 25.000 gold düşürüyor; sadece loncayı
    // döndürseydik navbar eski bakiyeyi göstermeye devam ederdi — ölçüldü,
    // lonca kuruldu ve gold hiç eksilmemiş gibi durdu.
    res.json({ guild, progress: toProgress(await getOrCreatePlayer(wallet)) });
  } catch (e) {
    if (e instanceof GuildError) { res.status(e.status).json({ error: e.code }); return; }
    throw e;
  }
}));

app.post('/guild/join', wrap(async (req, res) => {
  const wallet = auth(req);
  if (!wallet) { res.status(401).json({ error: 'oturum_yok' }); return; }
  const id = z.string().uuid().safeParse(req.body?.id);
  if (!id.success) { res.status(400).json({ error: 'gecersiz_lonca' }); return; }
  try {
    res.json({ guild: await joinGuild(wallet, id.data) });
  } catch (e) {
    if (e instanceof GuildError) { res.status(e.status).json({ error: e.code }); return; }
    throw e;
  }
}));

app.post('/guild/leave', wrap(async (req, res) => {
  const wallet = auth(req);
  if (!wallet) { res.status(401).json({ error: 'oturum_yok' }); return; }
  try {
    res.json(await leaveGuild(wallet));
  } catch (e) {
    if (e instanceof GuildError) { res.status(e.status).json({ error: e.code }); return; }
    throw e;
  }
}));

app.post('/guild/donate', wrap(async (req, res) => {
  const wallet = auth(req);
  if (!wallet) { res.status(401).json({ error: 'oturum_yok' }); return; }
  const player = await getOrCreatePlayer(wallet);
  try {
    const guild = await donate(wallet, player.rev, req.body?.amount);
    res.json({ guild, progress: toProgress(await getOrCreatePlayer(wallet)) });
  } catch (e) {
    if (e instanceof GuildError) { res.status(e.status).json({ error: e.code }); return; }
    throw e;
  }
}));

app.post('/guild/upgrade', wrap(async (req, res) => {
  const wallet = auth(req);
  if (!wallet) { res.status(401).json({ error: 'oturum_yok' }); return; }
  try {
    res.json({ guild: await upgradeGuild(wallet) });
  } catch (e) {
    if (e instanceof GuildError) { res.status(e.status).json({ error: e.code }); return; }
    throw e;
  }
}));

// ── EKİPMAN ──
//
// ⚠️ HİÇBİRİ GOLD'A DOKUNMUYOR. Parçalama TOZ veriyor (kozmetik parası);
// gold verseydi The Wilderness sınırsız tekrarlanabilir bir musluk olurdu.
app.get('/gear', wrap(async (req, res) => {
  const wallet = auth(req);
  if (!wallet) { res.status(401).json({ error: 'oturum_yok' }); return; }
  res.json(await listGear(wallet));
}));

app.post('/gear/equip', wrap(async (req, res) => {
  const wallet = auth(req);
  if (!wallet) { res.status(401).json({ error: 'oturum_yok' }); return; }
  try {
    res.json(await equipGear(wallet, req.body?.id));
  } catch (e) {
    if (e instanceof GearError) { res.status(e.status).json({ error: e.code }); return; }
    throw e;
  }
}));

app.post('/gear/unequip', wrap(async (req, res) => {
  const wallet = auth(req);
  if (!wallet) { res.status(401).json({ error: 'oturum_yok' }); return; }
  try {
    res.json(await unequipSlot(wallet, req.body?.slot));
  } catch (e) {
    if (e instanceof GearError) { res.status(e.status).json({ error: e.code }); return; }
    throw e;
  }
}));

app.post('/gear/salvage', wrap(async (req, res) => {
  const wallet = auth(req);
  if (!wallet) { res.status(401).json({ error: 'oturum_yok' }); return; }
  try {
    const out = await salvageGear(wallet, req.body?.ids);
    res.json({ ...out, progress: toProgress(await getOrCreatePlayer(wallet)), gear: await listGear(wallet) });
  } catch (e) {
    if (e instanceof GearError) { res.status(e.status).json({ error: e.code }); return; }
    throw e;
  }
}));

// ── BECERİ AĞACI ──
//
// ⚠️ Puan SATIN ALINMIYOR, `depthPaid`'ten TÜRETİLİYOR (bkz. skills.ts).
// Gold yalnızca RESPEC'te el değiştiriyor ve o da güç satmıyor — oyuncu
// zaten sahip olduğu gücü yeniden diziyor.
app.get('/skills', wrap(async (req, res) => {
  const wallet = auth(req);
  if (!wallet) { res.status(401).json({ error: 'oturum_yok' }); return; }
  res.json(await listSkills(wallet));
}));

app.post('/skills/set', wrap(async (req, res) => {
  const wallet = auth(req);
  if (!wallet) { res.status(401).json({ error: 'oturum_yok' }); return; }
  try {
    const out = await setSkills(wallet, req.body?.nodes);
    res.json({ ...out.view, charged: out.charged, progress: toProgress(await getOrCreatePlayer(wallet)) });
  } catch (e) {
    if (e instanceof SkillError) { res.status(e.status).json({ error: e.code }); return; }
    throw e;
  }
}));

// ── DÜELLO (asenkron PvP) ──
//
// ⚠️ Meydan okuyan RAKİBİN SEED'İNİ oynuyor — düellonun bütün adaleti buna
// dayanıyor. Gerçek zamanlı PvP bilerek yapılmadı: determinizm mührünü ve
// sunucu-otoriteli ödülü bozardı (bkz. game/duel.ts başlığı).
app.get('/duel', wrap(async (req, res) => {
  const wallet = auth(req);
  if (!wallet) { res.status(401).json({ error: 'oturum_yok' }); return; }
  const p = toProgress(await getOrCreatePlayer(wallet));
  const cleared = p.cleared as unknown as Record<string, boolean>;
  // ⚠️ Tablo ve sıralama TEK istekte: panel açılışında iki tur atmak,
  // arayüzün iki ayrı yükleme durumu taşıması demekti.
  const [b, l] = await Promise.all([duelBoard(wallet, cleared), duelLadder(wallet)]);
  res.json({ ...b, ladder: l });
}));

/**
 * EŞLEŞME BUL — sunucu puan yakınlığına göre rakip seçiyor.
 *
 * ⚠️ Doğrulama `resolveChallenge`'takiyle AYNI (`duelBlocker`); bu uç bir
 * kısayol, bir arka kapı DEĞİL.
 */
app.post('/duel/find', wrap(async (req, res) => {
  const wallet = auth(req);
  if (!wallet) { res.status(401).json({ error: 'oturum_yok' }); return; }
  const player = await getOrCreatePlayer(wallet);
  if (player.banned) { res.status(403).json({ error: 'yasakli' }); return; }
  const p = toProgress(player);
  try {
    res.json({ match: await findMatch(wallet, p.cleared as unknown as Record<string, boolean>) });
  } catch (e) {
    if (e instanceof DuelError) { res.status(e.status).json({ error: e.code }); return; }
    throw e;
  }
}));

app.post('/duel/start', wrap(async (req, res) => {
  const wallet = auth(req);
  if (!wallet) { res.status(401).json({ error: 'oturum_yok' }); return; }
  const player = await getOrCreatePlayer(wallet);
  if (player.banned) { res.status(403).json({ error: 'yasakli' }); return; }
  const p = toProgress(player);

  let ch;
  try {
    ch = await resolveChallenge(wallet, req.body?.recordId, p.cleared as unknown as Record<string, boolean>);
  } catch (e) {
    if (e instanceof DuelError) { res.status(e.status).json({ error: e.code }); return; }
    throw e;
  }

  const runId = crypto.randomUUID();
  const guildGrowth = await growthOf(wallet);
  const gear = await equippedBonus(wallet);
  const skills = await skillsBonusOf(wallet);

  // ⚠️ Tılsımlar düelloda da koşu AÇILIRKEN yanıyor — normal koşudaki
  // kuralın aynısı, yoksa düello tılsım saklamanın bedava yolu olurdu.
  const charms = p.charms;
  if (charms.length) {
    await prisma.player.update({ where: { wallet }, data: { charms: [] } });
  }

  await acikKosulariIptalEt(wallet);
  await prisma.run.create({
    data: {
      id: runId, wallet, seed: BigInt(ch.seed), hero: p.hero,
      mode: 'duel', stageId: ch.stageId, startDepth: 1, ascension: 0,
      // ⚠️ HEDEF DONDURULUYOR — bkz. duel.ts başlığı
      duelDefender: ch.defender, duelTargetDepth: ch.targetDepth, duelDefRating: ch.defRating,
    },
  });
  res.json({
    runId, seed: ch.seed, hero: p.hero, charms,
    startDepth: 1, ascension: 0, guildGrowth, gear, skills,
    duel: { defender: ch.defender, target: ch.targetDepth, stageId: ch.stageId },
  });
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
  // Oyuncu dosyası artık gold hareketlerini de taşıyor — "bu hesap gold'u
  // nereden buldu, nereye harcadı" sorusu tek ekranda cevaplanabilmeli.
  res.json({ ...detail, ledger: await ledgerOf(req.params.wallet, 80) });
}));

/**
 * EKONOMİ PANOSU — musluk/sink dengesi.
 *
 * ⚠️ Faz 2'nin bütün sink çalışması bu oranı dengelemek içindi ve o zamana
 * kadar ÖLÇÜLEMİYORDU. Üretim sürekli tüketimi aşarsa gold birikip
 * değersizleşir (ve market'te satılık gold'un fiyatı çöker); tersi olursa
 * oyuncu hiçbir şey alamaz.
 */
app.get('/admin/economy', adminOnly, wrap(async (req, res) => {
  const hours = Number(req.query.hours ?? 168);
  res.json(await economy(Number.isFinite(hours) ? Math.min(Math.max(hours, 1), 24 * 90) : 168));
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

/** Canlı boss odası — o an kaç kişi bağlı (admin/izleme) */
app.get('/admin/presence', adminOnly, wrap(async (_req, res) => {
  res.json(presenceCount());
}));

const port = Number(process.env.PORT ?? 4100);
// ⚠️ `app.listen`'in DÖNDÜRDÜĞÜ sunucu WebSocket'e veriliyor. Ayrı bir port
// açmak reverse proxy ve CORS tarafında ikinci bir yapılandırma demekti;
// aynı sunucuda `/presence` yolu tek kapı olarak kalıyor.
const server = app.listen(port, () => {
  console.log(`GRAVEBORN backend :${port}`);
});
attachPresence(server);
