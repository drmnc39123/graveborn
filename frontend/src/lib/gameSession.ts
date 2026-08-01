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
  applyRunResult, loadProgress, paidDepth, saveProgress,
  type Progress, type RunResult,
} from '@/game/progress';
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

export async function startRun(mode: 'campaign' | 'descent', stageId: number): Promise<RunTicket> {
  if (!isWallet()) return { runId: null, seed: demoSeed(mode, stageId) };
  const out = await api<{ runId: string; seed: number }>('/run/start', {
    method: 'POST', body: { mode, stageId },
  });
  return { runId: out.runId, seed: out.seed };
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
