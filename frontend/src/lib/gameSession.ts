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
  type Progress, type RunResult,
} from '@/game/progress';
import type { CosmeticSlot } from '@/game/cosmetics';
import { CHARM_SLOTS } from '@/game/charms';
import { seedFromString } from '@/game/rng';
import { api, getMode } from '@/lib/session';

export interface Settled {
  progress: Progress;
  awarded: number;
  progressGold: number;
  dropGold: number;
  paidRange: { from: number; to: number } | null;
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

export async function startRun(
  mode: 'campaign' | 'descent', stageId: number,
  /** oyuncunun seçtiği checkpoint — SUNUCU kırpar, burada gönderilen sadece bir istek */
  wantStartDepth = 1,
): Promise<RunTicket> {
  if (!isWallet()) {
    // ⚠️ Demoda da tılsımlar koşu AÇILIRKEN yanar — cüzdan modundaki kuralın
    // aynısı, yoksa iki mod farklı davranır ve demo yanıltıcı olur.
    const p = loadProgress();
    const charms = p.charms;
    if (charms.length) saveProgress({ ...p, charms: [] });
    // Demoda sunucu yok; kırpmayı aynı saf fonksiyonla İSTEMCİ yapar. Kural
    // tek yerde kalsın diye `allowedStartDepth` burada da çağrılıyor.
    const start = mode === 'descent'
      ? Math.min(Math.max(1, wantStartDepth), allowedStartDepth(p, stageId)) : 1;
    return { runId: null, seed: demoSeed(mode, stageId), charms, startDepth: start };
  }
  const out = await api<{ runId: string; seed: number; charms?: string[]; startDepth?: number }>(
    '/run/start', { method: 'POST', body: { mode, stageId, startDepth: wantStartDepth } },
  );
  // ⚠️ SUNUCUNUN döndürdüğü değer kullanılır, istenen değil. Motoru başka bir
  // derinlikte kurmak koşuyu doğrulanamaz hale getirirdi.
  return {
    runId: out.runId, seed: out.seed, charms: out.charms ?? [],
    startDepth: Math.max(1, out.startDepth ?? 1),
  };
}

export async function finishRun(
  ticket: RunTicket | null, run: RunResult, current: Progress,
): Promise<Settled> {
  const before = paidDepth(current, run.stageId);

  if (!isWallet() || !ticket?.runId) {
    const r = applyRunResult(current, run);
    saveProgress(r.progress);
    return {
      progress: r.progress, awarded: r.awarded,
      progressGold: r.progressGold, dropGold: r.dropGold, paidRange: r.paidRange,
    };
  }

  const out = await api<{
    progress: Progress; awarded: number; progressGold: number; dropGold: number;
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
