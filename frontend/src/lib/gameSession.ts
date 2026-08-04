'use client';
// İLERLEME KAYNAĞI — demo ile cüzdan modunun TEK ayrıştığı yer.
//
// Oyun kodu (paneller, koşu ekranı) hangi modda olduğunu bilmez; buradan
// gelen sözü kullanır. Böylece "demo mu, sunucu mu" sorusu arayüzün her
// köşesine dağılmıyor.
//
// ⚠️ CÜZDAN MODUNDA ÖDÜLÜ SUNUCU HESAPLAR. Buradaki kod ödül üretmez,
// sadece taşır. Demo modunda ise ilerleme localStorage'da ve ekonomiye
// hiç karışmaz (bkz. session.ts).

import {
  allowedStartDepth, applyRunResult, loadProgress, paidDepth, saveProgress,
  buyWithDust as localDustBuy,
  equipCosmetic as localEquip,
  pullReliquary as localPull,
  raiseOssuary as localRaise,
  placeWager as localPlaceWager,
  clearWager as localClearWager,
  claimAchievement as localClaimAch,
  claimStreak as localClaimStreak,
  utcDay,
  type Progress, type RunResult,
} from '@/game/progress';
import type { CosmeticSlot } from '@/game/cosmetics';
import { wagerPayout, wagerWon } from '@/game/wager';
import { CHARM_SLOTS } from '@/game/charms';
import { seedFromString } from '@/game/rng';
import { api, getMode } from '@/lib/session';

export interface Settled {
  progress: Progress;
  awarded: number;
  progressGold: number;
  dropGold: number;
  paidRange: { from: number; to: number } | null;
  /** koşuda bahis vardıysa sonucu — koşu sonu dökümünde gösterilir */
  wager: { stake: number; target: number; won: boolean; dust: number } | null;
}

export interface RunTicket {
  /** cüzdan modunda sunucunun açtığı koşu; demoda null */
  runId: string | null;
  seed: number;
  /** koşuya taşınan tılsımlar — açılışta tüketildiler, artık bu koşuya ait */
  charms: string[];
  /**
   * Koşunun başlayacağı derinlik. ⚠️ SUNUCUNUN kararı — motor bu değerle
   * kurulmalı, yoksa oynanan koşu ile doğrulanan koşu ayrışır.
   */
  startDepth: number;
  /**
   * Demoda koşuya taşınan bahis (sunucu yok, istemci çözecek).
   * Cüzdan modunda null — orada bahsi Run satırı taşıyor.
   */
  wager: { stake: number; target: number; stageId: number } | null;
}

const isWallet = () => getMode() === 'wallet';

/** Günlük seed — SADECE demo için. Cüzdan modunda seed sunucudan gelir. */
function demoSeed(mode: string, stageId: number): number {
  const d = new Date();
  const day = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
  return seedFromString(`${mode}:${stageId}:${day}`);
}

export async function loadSessionProgress(): Promise<Progress> {
  if (!isWallet()) return loadProgress();
  const { progress } = await api<{ progress: Progress }>('/progress');
  return progress;
}

export async function setHero(hero: string, current: Progress): Promise<Progress> {
  if (!isWallet()) {
    const next = { ...current, hero };
    saveProgress(next);
    return next;
  }
  const { progress } = await api<{ progress: Progress }>('/progress/hero', {
    method: 'POST', body: { hero },
  });
  return progress;
}

export async function buyUpgrade(id: string, current: Progress, cost: number): Promise<Progress> {
  if (!isWallet()) {
    const lv = current.upgrades[id] ?? 0;
    if (current.gold < cost) return current;
    const next: Progress = {
      ...current,
      gold: current.gold - cost,
      upgrades: { ...current.upgrades, [id]: lv + 1 },
    };
    saveProgress(next);
    return next;
  }
  // Cüzdan modunda fiyatı ve bakiyeyi SUNUCU doğrular — buradaki `cost`
  // sadece arayüzün gösterdiği sayı, yetkili değil.
  const { progress } = await api<{ progress: Progress }>('/progress/buy', {
    method: 'POST', body: { id },
  });
  return progress;
}

// ── LEADERBOARD ───────────────────────────────────────────────────────
// ⚠️ Puan İSTEMCİDEN GİTMEZ. Sunucu koşu kapanışında kendi hesapladığı
// derinlikten yazar; burada sadece okunur.

export interface LeaderRow {
  rank: number;
  wallet: string;
  stage: number;
  depth: number;
  rating: number;
  hero: string;
  /** takılı kozmetikler — sıralamayı ETKİLEMEZ, sadece kim olduğunu gösterir */
  equipped?: { title?: string; plate?: string; trophy?: string };
}

export async function fetchLeaderboard(): Promise<{ rows: LeaderRow[]; me: { rank: number; row: LeaderRow } | null }> {
  // Demo oyuncusu da tabloyu GÖREBİLİR — girmek için sebep olsun diye.
  // Kendi sırası yok, çünkü demo ilerlemesi sunucuda hiç yok.
  return api<{ rows: LeaderRow[]; me: { rank: number; row: LeaderRow } | null }>('/leaderboard');
}

// ── OYUNCU DOSYASI ────────────────────────────────────────────────────
// ⚠️ Bu veri SADECE sunucuda var (Run tablosu). Demo modunda koşu geçmişi
// tutulmuyor — orada `fetchProfile` hata verir ve Tavern açıklayıcı bir
// mesaj gösterir. Sahte bir geçmiş uydurmak, demo oyuncusuna gerçek
// sanacağı bir sicil göstermek olurdu.

export interface ProfileRun {
  id: string; mode: string; stageId: number; startedAt: string;
  depth: number | null; awarded: number | null; durationSec: number | null;
  capped: boolean; wagerStake: number; wagerWon: boolean;
}

export interface ProfileData {
  totals: {
    runs: number; playSec: number; goldEarned: number; abandoned: number;
    bestDepth: number; bestStage: number; capped: number;
    wagersPlaced: number; wagersWon: number;
  };
  runs: ProfileRun[];
}

export async function fetchProfile(): Promise<ProfileData> {
  if (!isWallet()) throw new Error('demo');
  return api<ProfileData>('/profile');
}

// ── MARKETPLACE ───────────────────────────────────────────────────────
// ⚠️ DEMO MODUNDA MARKET KAPALI. Demo gold'u localStorage'da üretiliyor ve
// ekonomiye girmiyor; listelenebilseydi sahte gold gerçek $GRAVE karşılığı
// satılırdı. Kapı burada, tek yerde.

export interface Listing {
  id: string;
  seller: string;
  goldAmount: number;
  /** ⚠️ METİN — token en küçük birimi 2^53'ü aşabilir, number'a çevirme */
  priceGrave: string;
  status: string;
  createdAt: string;
  buyer: string | null;
}

export const marketAvailable = () => isWallet();

export async function fetchListings(): Promise<{ listings: Listing[]; tokenEnabled: boolean }> {
  // Emir defteri herkese açık — demo oyuncusu da bakabilir, sadece satamaz.
  return api<{ listings: Listing[]; tokenEnabled: boolean }>('/market/listings');
}

export async function fetchMyListings(): Promise<{ listings: Listing[]; escrowedGold: number }> {
  if (!isWallet()) return { listings: [], escrowedGold: 0 };
  return api<{ listings: Listing[]; escrowedGold: number }>('/market/mine');
}

export async function listGold(goldAmount: number, priceGrave: string) {
  return api<{ listing: Listing; progress: Progress; escrowedGold: number }>('/market/list', {
    method: 'POST', body: { goldAmount, priceGrave },
  });
}

export async function cancelGoldListing(id: string) {
  return api<{ progress: Progress; escrowedGold: number }>('/market/cancel', {
    method: 'POST', body: { id },
  });
}

/**
 * Tılsım satın al. ⚠️ Demo modunda da çalışır (demo gold'u ekonomiye
 * girmiyor, sadece bu tarayıcıda güç veriyor) — market'in aksine burada
 * kapatmaya gerek yok, hiçbir şey dışarı satılmıyor.
 */
export async function buyCharm(id: string, current: Progress, cost: number): Promise<Progress> {
  if (!isWallet()) {
    if (current.gold < cost || current.charms.length >= CHARM_SLOTS) return current;
    const next: Progress = { ...current, gold: current.gold - cost, charms: [...current.charms, id] };
    saveProgress(next);
    return next;
  }
  // Cüzdan modunda fiyatı ve slot sınırını SUNUCU doğrular
  const { progress } = await api<{ progress: Progress }>('/charm/buy', {
    method: 'POST', body: { id },
  });
  return progress;
}

// ── THE RELIQUARY ─────────────────────────────────────────────────────
// ⚠️ Demoda zarı istemci atar, cüzdan modunda SUNUCU. İkisi de AYNI saf
// fonksiyonu (`pullReliquary`) çalıştırıyor — kural tek yerde.
//
// ⚠️ Demoda `Math.random()` KULLANILIYOR ve bu bilinçli bir istisna: motorun
// determinizm kuralı koşu simülasyonu içindir (aynı seed → aynı koşu), gacha
// ise tam tersini ister. Demo gold'u zaten ekonomiye girmiyor, sunucuda ise
// bu yol hiç çalışmıyor.

export interface PullOutcome {
  progress: Progress;
  /** çekilen kozmetiğin id'si — tanımı istemcide zaten var */
  id: string;
  duplicate: boolean;
  dust: number;
}

export async function pullReliquary(current: Progress): Promise<PullOutcome> {
  if (!isWallet()) {
    const out = localPull(current, Math.random(), Math.random());
    if (out.error || !out.result) throw new Error(out.error ?? 'pull failed');
    saveProgress(out.progress);
    return {
      progress: out.progress, id: out.result.cosmetic.id,
      duplicate: out.result.duplicate, dust: out.result.dust,
    };
  }
  return api<PullOutcome>('/reliquary/pull', { method: 'POST', body: {} });
}

export async function buyCosmeticWithDust(id: string, current: Progress): Promise<Progress> {
  if (!isWallet()) {
    const out = localDustBuy(current, id);
    if (out.error) throw new Error(out.error);
    saveProgress(out.progress);
    return out.progress;
  }
  const { progress } = await api<{ progress: Progress }>('/reliquary/dust-buy', {
    method: 'POST', body: { id },
  });
  return progress;
}

export async function equipCosmetic(
  slot: CosmeticSlot, id: string | null, current: Progress,
): Promise<Progress> {
  if (!isWallet()) {
    const next = localEquip(current, slot, id);
    saveProgress(next);
    return next;
  }
  const { progress } = await api<{ progress: Progress }>('/cosmetic/equip', {
    method: 'POST', body: { slot, id },
  });
  return progress;
}

// ── HAFTALIK ORTAK BOSS ───────────────────────────────────────────────
// ⚠️ DEMODA YOK. Ortak can havuzu sunucuda; demo oyuncusunun vurduğu hasarı
// oraya işlemek, ekonomiye girmeyen bir ilerlemenin herkesin gördüğü tabloyu
// etkilemesi olurdu (market'in demoda kapalı olmasıyla aynı gerekçe).

export interface BossState {
  week: number; bossId: string; name: string; epithet: string; art: string;
  hp: number; maxHp: number; endsAt: number; defeated: boolean;
  top: { wallet: string; damage: number }[];
  me: { damage: number; rank: number } | null;
}

export const worldBossAvailable = () => isWallet();

/**
 * Boss durumu — HERKESE AÇIK, cüzdan gerektirmez.
 *
 * ⚠️ Burada bir `isWallet()` kapısı VARDI ve yanlıştı: ana sayfadaki
 * ziyaretçi tanımı gereği giriş yapmamıştır, yani "şu an ne oluyor" bölümü
 * HİÇ görünmezdi — tam da onu görmesi gereken kişiye. Sunucudaki uç zaten
 * kimlik istemiyor; kimliksiz istekte sadece `me` null döner.
 *
 * Cüzdan kapısı BOSS ODASINA GİRMEKTE (`/boss/start`), izlemekte değil.
 */
export async function fetchWorldBoss(): Promise<BossState> {
  return api<BossState>('/worldboss');
}

export async function startBossRun(): Promise<{ runId: string; seed: number; hero: string }> {
  return api<{ runId: string; seed: number; hero: string }>('/boss/start', {
    method: 'POST', body: {},
  });
}

export async function finishBossRun(runId: string, damage: number): Promise<{
  accepted: number; capped: boolean; state: BossState;
}> {
  return api<{ accepted: number; capped: boolean; state: BossState }>('/boss/finish', {
    method: 'POST', body: { runId, damage },
  });
}

// ── BAŞARIMLAR + SERİ ─────────────────────────────────────────────────
// ⚠️ Demoda gün İSTEMCİ saatinden okunuyor ve bu bilinçli bir taviz: demo
// ilerlemesi ekonomiye hiç girmiyor. Cüzdan modunda gün SUNUCUDAN gelir.

export async function claimAchievement(id: string, current: Progress): Promise<Progress> {
  if (!isWallet()) {
    const out = localClaimAch(current, id);
    if (out.error) throw new Error(out.error);
    saveProgress(out.progress);
    return out.progress;
  }
  const { progress } = await api<{ progress: Progress }>('/achievement/claim', {
    method: 'POST', body: { id },
  });
  return progress;
}

export async function claimStreak(current: Progress): Promise<{
  progress: Progress; reward: number; days: number;
}> {
  if (!isWallet()) {
    const out = localClaimStreak(current, utcDay(new Date()));
    if (out.error) throw new Error(out.error);
    saveProgress(out.progress);
    return { progress: out.progress, reward: out.reward, days: out.days };
  }
  return api<{ progress: Progress; reward: number; days: number }>('/streak/claim', {
    method: 'POST', body: {},
  });
}

/** Bugün seri alınabilir mi — arayüz kartı buna göre gösterir */
export function streakAvailable(p: Progress): boolean {
  return p.streak.last !== utcDay(new Date());
}

// ── OSSUARY + WAGER ───────────────────────────────────────────────────
// İkisi de saf fonksiyonu paylaşıyor; cüzdan modunda sunucu, demoda istemci
// çalıştırıyor. Fiyat ve hedef HER İKİ YOLDA DA saf fonksiyondan geliyor.

export async function raiseOssuary(current: Progress): Promise<Progress> {
  if (!isWallet()) {
    const out = localRaise(current);
    if (out.error) throw new Error(out.error);
    saveProgress(out.progress);
    return out.progress;
  }
  const { progress } = await api<{ progress: Progress }>('/ossuary/raise', {
    method: 'POST', body: {},
  });
  return progress;
}

export async function placeWager(
  stageId: number, stake: number, current: Progress,
): Promise<Progress> {
  if (!isWallet()) {
    const out = localPlaceWager(current, stageId, stake);
    if (out.error) throw new Error(out.error);
    saveProgress(out.progress);
    return out.progress;
  }
  // ⚠️ `stake` gidiyor ama HEDEF gitmiyor — onu sunucu oyuncunun kendi
  // rekorundan türetiyor. Hedefi istemcinin vermesi bedava toz demekti.
  const { progress } = await api<{ progress: Progress }>('/wager/place', {
    method: 'POST', body: { stageId, stake },
  });
  return progress;
}

export async function cancelWager(current: Progress): Promise<Progress> {
  if (!isWallet()) {
    const next = localClearWager(current);
    saveProgress(next);
    return next;
  }
  const { progress } = await api<{ progress: Progress }>('/wager/clear', {
    method: 'POST', body: {},
  });
  return progress;
}

export async function startRun(
  mode: 'campaign' | 'descent', stageId: number,
  /** oyuncunun seçtiği checkpoint — SUNUCU kırpar, burada gönderilen sadece bir istek */
  wantStartDepth = 1,
): Promise<RunTicket> {
  if (!isWallet()) {
    // ⚠️ Demoda da tılsımlar VE BAHİS koşu AÇILIRKEN yanar — cüzdan
    // modundaki kuralın aynısı, yoksa iki mod farklı davranır ve demo
    // yanıltıcı olur. Bahsi demoda hiç yakmamak daha da kötüsü olurdu:
    // oyuncu kurabildiği ama asla çözülmeyen bir bahis görürdü.
    const p = loadProgress();
    const charms = p.charms;
    // Demoda sunucu yok; kırpmayı aynı saf fonksiyonla İSTEMCİ yapar. Kural
    // tek yerde kalsın diye `allowedStartDepth` burada da çağrılıyor.
    const start = mode === 'descent'
      ? Math.min(Math.max(1, wantStartDepth), allowedStartDepth(p, stageId)) : 1;

    // Bahis SADECE aynı bölümün descent'inde geçerli — kampanyada derinlik yok
    const w = p.wager;
    const wagerLive = !!w && mode === 'descent' && w.stageId === stageId && p.gold >= w.stake;
    if (charms.length || w) {
      saveProgress({
        ...p, charms: [], wager: null,
        gold: wagerLive ? p.gold - w!.stake : p.gold,
      });
    }
    return {
      runId: null, seed: demoSeed(mode, stageId), charms, startDepth: start,
      wager: wagerLive ? w! : null,
    };
  }
  const out = await api<{ runId: string; seed: number; charms?: string[]; startDepth?: number }>(
    '/run/start', { method: 'POST', body: { mode, stageId, startDepth: wantStartDepth } },
  );
  // ⚠️ SUNUCUNUN döndürdüğü değer kullanılır, istenen değil. Motoru başka bir
  // derinlikte kurmak koşuyu doğrulanamaz hale getirirdi.
  // Cüzdan modunda bahsi SUNUCU takip ediyor (Run satırında) — bilette
  // taşımaya gerek yok, kapanış yanıtı sonucu bildiriyor.
  return {
    runId: out.runId, seed: out.seed, charms: out.charms ?? [],
    startDepth: Math.max(1, out.startDepth ?? 1), wager: null,
  };
}

export async function finishRun(
  ticket: RunTicket | null, run: RunResult, current: Progress,
): Promise<Settled> {
  const before = paidDepth(current, run.stageId);

  if (!isWallet() || !ticket?.runId) {
    const r = applyRunResult(current, run);
    // ⚠️ Bahis, ÖDÜL İŞLENDİKTEN SONRA çözülür: kazanma ölçüsü "rekorunu
    // geçti mi" ve rekor `applyRunResult` içinde güncelleniyor. Önce
    // bakılsaydı oyuncu her zaman kaybederdi.
    let prog = r.progress;
    let wagerOut: Settled['wager'] = null;
    const w = ticket?.wager ?? null;
    if (w && run.mode === 'descent' && w.stageId === run.stageId) {
      const won = wagerWon(w, paidDepth(prog, run.stageId));
      const dust = won ? wagerPayout(w.stake) : 0;
      if (dust > 0) prog = { ...prog, dust: prog.dust + dust };
      wagerOut = { stake: w.stake, target: w.target, won, dust };
    }
    saveProgress(prog);
    return {
      progress: prog, awarded: r.awarded,
      progressGold: r.progressGold, dropGold: r.dropGold, paidRange: r.paidRange,
      wager: wagerOut,
    };
  }

  const out = await api<{
    progress: Progress; awarded: number; progressGold: number; dropGold: number;
    wager: Settled['wager'];
  }>('/run/finish', {
    method: 'POST',
    body: {
      runId: ticket.runId,
      deepestCleared: run.deepestCleared,
      rareGold: run.rareGold,
      cleared: run.cleared,
    },
  });

  // Sunucu aralık döndürmüyor (ödül için gerekmiyor); arayüzün "hangi
  // derinlikler ödedi" satırı için önce/sonra farkından türetiyoruz.
  const after = paidDepth(out.progress, run.stageId);
  return {
    ...out,
    paidRange: after > before ? { from: before, to: after } : null,
  };
}
