'use client';
// Kalıcı ilerleme — bölümler arası taşınan her şey.
//
// ŞU AN: localStorage. SONRA: backend (Faz D).
// Bu dosya kasıtlı olarak saf veri + saf fonksiyon; depolama arkası değişince
// sadece load/save değişecek, çağıran kod aynı kalacak.
//
// ⚠️ GÜVENLİK NOTU: localStorage oyuncu tarafından düzenlenebilir. Token
// ekonomisi devreye girdiğinde bu dosya TEK BAŞINA yetkili olmayacak —
// sunucu run özetini doğrulayıp gold'u KENDİSİ hesaplayacak. Buradaki
// fonksiyonlar sunucuda BİREBİR çalıştırılabilsin diye saf tutuluyor.

import { STAGES, checkpointFor, depthGold, stageById } from './config';
import { permanentBonus } from './forge';
import { DEFAULT_HERO, heroById } from './heroes';
import { CHARM_SLOTS, charmById } from './charms';

const KEY = 'graveborn:progress:v2';
const KEY_V1 = 'graveborn:progress:v1';

export interface Progress {
  /** harcanabilir toplam gold */
  gold: number;
  /** oynanabilir en yüksek bölüm (1'den başlar) */
  unlockedStage: number;
  /** bölüm id → tamamlandı mı */
  cleared: Record<number, boolean>;
  /** kalıcı Forge yükseltmeleri: id → seviye */
  upgrades: Record<string, number>;
  /** bölüm id → ilk-geçiş ödülü ödendi mi (bir kez ödenir) */
  firstClear: Record<number, boolean>;
  /** bölüm id → descent'te ödemesi YAPILMIŞ en derin seviye */
  depthPaid: Record<number, number>;
  /** seçili karakter (heroes.ts id) */
  hero: string;
  /**
   * Pedlar's Stall'dan alınmış, koşuya TAŞINAN tılsımlar (charms.ts id).
   * ⚠️ Koşu AÇILDIĞINDA tüketilir, bittiğinde değil: yoksa oyuncu koşuyu
   * başlatıp hemen çıkarak tılsımı sonsuza kadar saklardı.
   */
  charms: string[];
}

export function emptyProgress(): Progress {
  return {
    gold: 0, unlockedStage: 1, cleared: {}, upgrades: {},
    firstClear: {}, depthPaid: {}, hero: DEFAULT_HERO, charms: [],
  };
}

/** Eksik/bozuk alanlara karşı savunmacı normalize — kayıt biçimi değişse de oyun açılsın */
function normalize(p: Partial<Progress>): Progress {
  return {
    gold: Math.max(0, Number(p.gold) || 0),
    unlockedStage: Math.min(STAGES.length, Math.max(1, Number(p.unlockedStage) || 1)),
    cleared: p.cleared ?? {},
    upgrades: p.upgrades ?? {},
    firstClear: p.firstClear ?? {},
    depthPaid: p.depthPaid ?? {},
    // Bilinmeyen/eski kayıtta varsayılana düş — heroById zaten savunmacı
    hero: heroById(p.hero).id,
    // ⚠️ Tılsım alanı sonradan eklendi; eski kayıtlarda YOK. Ayrı bir şema
    // sürümü gerekmiyor çünkü eksikliği zararsız — boş listeye düşer.
    // Bilinmeyen id'ler ve slot taşması burada da kırpılır: kayıt elle
    // düzenlenebilir, güvenilmez.
    charms: Array.isArray(p.charms)
      ? p.charms.filter((c) => typeof c === 'string' && !!charmById(c)).slice(0, CHARM_SLOTS)
      : [],
  };
}

/**
 * v1 → v2 göçü. v1'de `claimed` (bölümden alınmış toplam gold) vardı;
 * ömür-boyu tavan modeli terk edildiği için o sayaç anlamını yitirdi.
 * Kazanılmış gold KAYBOLMAZ — sadece "bu bölümün ilk-geçiş ödülü alınmış"
 * bilgisine çevrilir, yoksa oyuncu ödülü ikinci kez toplayabilirdi.
 */
function migrateV1(raw: string): Progress | null {
  try {
    const old = JSON.parse(raw) as { gold?: number; unlockedStage?: number;
      claimed?: Record<number, number>; cleared?: Record<number, boolean>;
      upgrades?: Record<string, number> };
    const firstClear: Record<number, boolean> = {};
    for (const st of STAGES) {
      if ((old.claimed?.[st.id] ?? 0) > 0) firstClear[st.id] = true;
    }
    return normalize({
      gold: old.gold, unlockedStage: old.unlockedStage,
      cleared: old.cleared, upgrades: old.upgrades,
      firstClear, depthPaid: {},
    });
  } catch {
    return null;
  }
}

/**
 * Tarayıcı deposu — sunucuda YOKTUR.
 *
 * ⚠️ DOM tipine (`window`, `Storage`) BAĞLANMA. Bu dosya backend'de de
 * derleniyor ve orada `lib: ["ES2022"]` var, DOM yok; `window.localStorage`
 * yazmak backend derlemesini kırıyordu. Dosyanın en baştaki sözü
 * ("sunucuda birebir çalışacak") tiplerde de tutulmalı.
 */
interface KeyValueStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

function store(): KeyValueStore | null {
  const g = globalThis as unknown as { localStorage?: KeyValueStore };
  return g.localStorage ?? null;
}

export function loadProgress(): Progress {
  const s = store();
  if (!s) return emptyProgress();
  try {
    const raw = s.getItem(KEY);
    if (raw) return normalize(JSON.parse(raw) as Partial<Progress>);

    const legacy = s.getItem(KEY_V1);
    if (legacy) {
      const migrated = migrateV1(legacy);
      if (migrated) { saveProgress(migrated); return migrated; }
    }
    return emptyProgress();
  } catch {
    return emptyProgress();
  }
}

export function saveProgress(p: Progress) {
  const s = store();
  if (!s) return;
  try { s.setItem(KEY, JSON.stringify(p)); } catch { /* kota dolu — sessiz geç */ }
}

/**
 * Forge'un `greed` yükseltmesinden gelen ilerleme-ödülü çarpanı.
 * Tek doğru kaynak forge.ts — oran burada tekrar yazılmaz.
 * ⚠️ Sadece İLERLEME ödülünü çarpar; nadir düşüşe dokunmaz (motor tarafında,
 * rollRareGold içinde açıklandı: aksi hâlde gold→oran→gold sarmalı kurulur).
 */
function greedMul(p: Progress): number {
  return 1 + Math.max(0, permanentBonus(p.upgrades).greed ?? 0);
}

/** Bölümün ilk-geçiş ödülü hâlâ alınabilir mi */
export function firstClearAvailable(p: Progress, stageId: number): number {
  const st = stageById(stageId);
  if (!st || p.firstClear[stageId]) return 0;
  return Math.round(st.firstClearGold * greedMul(p));
}

/** Descent'te bu bölümde ödeme yapılmış en derin seviye */
export function paidDepth(p: Progress, stageId: number): number {
  return Math.max(0, Number(p.depthPaid[stageId]) || 0);
}

/**
 * Koşunun başlayabileceği EN DERİN nokta — checkpoint'in bir altı.
 *
 * ⚠️ SUNUCUNUN KARARI. `/run/start` bu fonksiyonu çağırıp izin verilen değeri
 * Run kaydına yazar; istemcinin gönderdiği sayı doğrudan kullanılmaz.
 *
 * Ödül kuralı DEĞİŞMEZ: ödeme hâlâ yalnızca `depthPaid`'in ötesindeki
 * derinlikler için yapılır. Checkpoint sadece oyuncuyu oraya kadar
 * ışınlıyor — para basmıyor. d23'e inmiş oyuncu d21'den başlar, d21..d23'ü
 * bedava tekrar oynar (nadir düşüş hariç), kazancı d24'te başlar.
 */
export function allowedStartDepth(p: Progress, stageId: number): number {
  return checkpointFor(paidDepth(p, stageId)) + 1;
}

/** `from`(hariç) → `to`(dahil) arası derinliklerin toplam ödülü */
export function depthRewardBetween(p: Progress, stageId: number, from: number, to: number): number {
  let sum = 0;
  for (let d = Math.floor(from) + 1; d <= Math.floor(to); d++) sum += depthGold(stageId, d);
  return Math.round(sum * greedMul(p));
}

export interface RunResult {
  mode: 'campaign' | 'descent';
  stageId: number;
  /** kampanyada bölüm bitirildi mi */
  cleared: boolean;
  /** descent'te bu koşuda temizlenen en derin seviye */
  deepestCleared: number;
  /** koşu içinde nadir düşüşten toplanan gold */
  rareGold: number;
}

/**
 * Bir koşunun sonucunu işle. EXPLOIT KAPISI BURASI.
 *
 * KURAL — "İlerleme öder, tekrar ödemez":
 *   • Bölümü/derinliği İLK kez geçmek tam ödül verir.
 *   • Zaten geçilmiş içeriği tekrar oynamak ilerleme ödülünden 0 verir.
 *   • Nadir düşüş her koşuda gelir (musluğun sonsuz damlası) — küçüktür ve
 *     oranı Forge'a bağlı DEĞİLDİR.
 *
 * Saf fonksiyon: yeni Progress döner, girdiyi değiştirmez.
 */
export function applyRunResult(p: Progress, run: RunResult): {
  progress: Progress;
  awarded: number;
  /** ödülün ilerlemeden gelen kısmı (arayüzde ayrı gösterilir) */
  progressGold: number;
  /** nadir düşüşten gelen kısım */
  dropGold: number;
  /** descent'te bu koşuda ödenen derinlik aralığı — [from+1, to] */
  paidRange: { from: number; to: number } | null;
} {
  const drop = Math.max(0, Math.floor(run.rareGold));
  let progressGold = 0;
  let paidRange: { from: number; to: number } | null = null;

  const next: Progress = {
    ...p,
    cleared: { ...p.cleared },
    upgrades: { ...p.upgrades },
    firstClear: { ...p.firstClear },
    depthPaid: { ...p.depthPaid },
  };

  if (run.mode === 'campaign') {
    if (run.cleared) {
      progressGold = firstClearAvailable(p, run.stageId); // ikinci geçişte 0 döner
      next.firstClear[run.stageId] = true;
      next.cleared[run.stageId] = true;
      if (run.stageId + 1 <= STAGES.length) {
        next.unlockedStage = Math.max(next.unlockedStage, run.stageId + 1);
      }
    }
  } else {
    const from = paidDepth(p, run.stageId);
    const to = Math.max(0, Math.floor(run.deepestCleared));
    if (to > from) {
      progressGold = depthRewardBetween(p, run.stageId, from, to);
      next.depthPaid[run.stageId] = to;
      paidRange = { from, to };
    }
  }

  const awarded = progressGold + drop;
  next.gold = p.gold + awarded;
  return { progress: next, awarded, progressGold, dropGold: drop, paidRange };
}
