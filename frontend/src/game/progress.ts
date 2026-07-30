'use client';
// Kalıcı ilerleme — bölümler arası taşınan her şey.
//
// ŞU AN: localStorage. SONRA: backend (Faz 2).
// Bu dosya kasıtlı olarak saf veri + saf fonksiyon; depolama arkası değişince
// sadece load/save değişecek, çağıran kod aynı kalacak.
//
// ⚠️ GÜVENLİK NOTU: localStorage oyuncu tarafından düzenlenebilir. Token
// ekonomisi devreye girdiğinde bu dosya TEK BAŞINA yetkili olmayacak —
// sunucu run özetini doğrulayıp gold'u KENDİSİ hesaplayacak. Buradaki yapı
// (bölüm başına tavan, kazanılmış gold kaydı) sunucuda birebir tekrarlanacak.

import { STAGES, stageById } from './config';

const KEY = 'graveborn:progress:v1';

export interface Progress {
  /** harcanabilir toplam gold */
  gold: number;
  /** oynanabilir en yüksek bölüm (1'den başlar) */
  unlockedStage: number;
  /** bölüm id → o bölümden ŞİMDİYE KADAR alınmış toplam gold (tavan kontrolü) */
  claimed: Record<number, number>;
  /** bölüm id → tamamlandı mı */
  cleared: Record<number, boolean>;
  /** kalıcı shop yükseltmeleri: id → seviye */
  upgrades: Record<string, number>;
}

export function emptyProgress(): Progress {
  return { gold: 0, unlockedStage: 1, claimed: {}, cleared: {}, upgrades: {} };
}

export function loadProgress(): Progress {
  if (typeof window === 'undefined') return emptyProgress();
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return emptyProgress();
    const p = JSON.parse(raw) as Partial<Progress>;
    // Eksik alanlara karşı savunmacı: kayıt biçimi değişirse oyun açılmaya devam etsin
    return {
      gold: Math.max(0, Number(p.gold) || 0),
      unlockedStage: Math.min(STAGES.length, Math.max(1, Number(p.unlockedStage) || 1)),
      claimed: p.claimed ?? {},
      cleared: p.cleared ?? {},
      upgrades: p.upgrades ?? {},
    };
  } catch {
    return emptyProgress();
  }
}

export function saveProgress(p: Progress) {
  if (typeof window === 'undefined') return;
  try { window.localStorage.setItem(KEY, JSON.stringify(p)); } catch { /* kota dolu — sessiz geç */ }
}

/** Bölümden daha ne kadar gold alınabilir (tavan eksi alınmış) */
export function remainingGold(p: Progress, stageId: number): number {
  const st = stageById(stageId);
  if (!st) return 0;
  return Math.max(0, st.goldCap - (p.claimed[stageId] ?? 0));
}

/**
 * Bir denemenin sonucunu işle. EXPLOIT KAPISI BURASI.
 *
 * Oyuncu denemede ne kadar kazanırsa kazansın, bölümün kalan tavanından
 * fazlası verilmez. 700'lük bölümde 695 alıp ölen, tekrar oynayınca en fazla
 * 5 daha alır — bölümü tekrar tekrar oynayarak gold basamaz.
 *
 * Saf fonksiyon: yeni Progress döner, girdiyi değiştirmez (test edilebilirlik).
 */
export function applyRunResult(
  p: Progress,
  stageId: number,
  goldEarnedThisAttempt: number,
  stageCleared: boolean,
): { progress: Progress; awarded: number; capped: boolean } {
  const allowed = remainingGold(p, stageId);
  const awarded = Math.max(0, Math.min(Math.floor(goldEarnedThisAttempt), allowed));

  const next: Progress = {
    ...p,
    gold: p.gold + awarded,
    claimed: { ...p.claimed, [stageId]: (p.claimed[stageId] ?? 0) + awarded },
    cleared: { ...p.cleared },
    upgrades: { ...p.upgrades },
  };

  if (stageCleared) {
    next.cleared[stageId] = true;
    // sonraki bölümü aç (varsa)
    if (stageId + 1 <= STAGES.length) {
      next.unlockedStage = Math.max(next.unlockedStage, stageId + 1);
    }
  }

  return { progress: next, awarded, capped: awarded < Math.floor(goldEarnedThisAttempt) };
}
