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
import { ossuaryCost } from './ossuary';
import { WAGER, wagerError, wagerTarget, type WagerTicket } from './wager';
import { achievementById } from './achievements';
import { permanentBonus } from './forge';
import { DEFAULT_HERO, heroById } from './heroes';
import { CHARM_SLOTS, charmById } from './charms';
import {
  PULL_COST, RARITY, cosmeticById, resolvePull, rollCosmetic,
  type CosmeticSlot, type PullResult,
} from './cosmetics';

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
  /** Reliquary'den çıkmış kozmetikler (cosmetics.ts id) — SADECE görünür, güç vermez */
  cosmetics: string[];
  /** Yuva başına takılı kozmetik */
  equipped: Partial<Record<CosmeticSlot, string>>;
  /** Tekrar çıkan kozmetiklerden biriken toz — istenen kozmetiği doğrudan alır */
  dust: number;
  /**
   * Anıt seviyesi. TAVANI YOK — ekonominin dipsiz kovası burası
   * (bkz. ossuary.ts). Sadece görünürlük verir, güç vermez.
   */
  ossuary: number;
  /** Alınmış başarımlar (achievements.ts id) — bir kez alınır */
  achievements: string[];
  /**
   * Günlük seri. `last` UTC gün damgası (YYYY-MM-DD).
   * ⚠️ Tarihi İSTEMCİ VERMEZ: cüzdan modunda sunucunun günü kullanılır,
   * yoksa sistem saatini ileri alıp her gün üst üste seri toplanırdı.
   */
  streak: { days: number; last: string };
  /**
   * KURULMUŞ bahis — henüz yanmadı.
   * ⚠️ Tılsımlardaki kuralın aynısı: gold koşu AÇILIRKEN düşer, bahis
   * kurulurken değil. Kurulunca düşseydi oyuncu bahsi kurup hiç oynamadan
   * parasını kaybederdi; koşu bitince düşseydi kaybeden çıkıp kaçardı.
   */
  wager: WagerTicket | null;
}

export function emptyProgress(): Progress {
  return {
    gold: 0, unlockedStage: 1, cleared: {}, upgrades: {},
    firstClear: {}, depthPaid: {}, hero: DEFAULT_HERO, charms: [],
    cosmetics: [], equipped: {}, dust: 0, ossuary: 0, wager: null,
    achievements: [], streak: { days: 0, last: '' },
  };
}

/** Elle düzenlenmiş kayda karşı bahis biletini doğrula — hepsi ya da hiçbiri */
function cleanWager(raw: unknown): WagerTicket | null {
  if (!raw || typeof raw !== 'object') return null;
  const w = raw as Record<string, unknown>;
  const stake = Math.floor(Number(w.stake) || 0);
  const target = Math.floor(Number(w.target) || 0);
  const stageId = Math.floor(Number(w.stageId) || 0);
  // ⚠️ Sınırlar burada da uygulanır: kayıt güvenilmez, "stake: 1" yazıp
  // hedefi 1'e çekmek bedava toz basmanın en kolay yolu olurdu.
  if (stake < WAGER.minStake || stake > WAGER.maxStake) return null;
  if (target < 1 || stageId < 1) return null;
  return { stake, target, stageId };
}

/**
 * Takılı kozmetikleri sahiplik listesine göre süz.
 *
 * ⚠️ SAHİP OLMADIĞINI TAKAMAZ. Kayıt elle düzenlenebilir; "equipped" alanına
 * hiç çekilmemiş bir legendary yazmak, gacha'yı tamamen atlamanın en kolay
 * yolu olurdu. Kozmetik güç vermiyor ama prestij TAM DA değerini burada
 * buluyor — leaderboard'da görünen şey o.
 */
function cleanEquipped(
  raw: unknown, owned: readonly string[],
): Partial<Record<CosmeticSlot, string>> {
  const out: Partial<Record<CosmeticSlot, string>> = {};
  if (!raw || typeof raw !== 'object') return out;
  for (const [slot, id] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof id !== 'string' || !owned.includes(id)) continue;
    const def = cosmeticById(id);
    // Yuva adı da tanımdan doğrulanır: 'aura' yuvasına bir unvan takılamaz
    if (def && def.slot === slot) out[def.slot] = id;
  }
  return out;
}

/** Eksik/bozuk alanlara karşı savunmacı normalize — kayıt biçimi değişse de oyun açılsın */
function normalize(p: Partial<Progress>): Progress {
  const out: Progress = {
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
    // ⚠️ Kozmetik alanları da SONRADAN eklendi; tılsımlardaki gerekçenin
    // aynısı geçerli — eksikliği zararsız, boşa düşer, ayrı şema sürümü
    // gerektirmez. Bilinmeyen id'ler burada eleniyor (kayıt güvenilmez).
    cosmetics: Array.isArray(p.cosmetics)
      ? [...new Set(p.cosmetics.filter((c) => typeof c === 'string' && !!cosmeticById(c)))]
      : [],
    equipped: {},   // aşağıda sahiplik listesine göre doldurulur
    dust: Math.max(0, Math.floor(Number(p.dust) || 0)),
    ossuary: Math.max(0, Math.floor(Number(p.ossuary) || 0)),
    wager: cleanWager(p.wager),
    achievements: Array.isArray(p.achievements)
      ? [...new Set(p.achievements.filter((a) => typeof a === 'string'))]
      : [],
    streak: {
      days: Math.max(0, Math.floor(Number(p.streak?.days) || 0)),
      last: typeof p.streak?.last === 'string' ? p.streak.last : '',
    },
  };
  out.equipped = cleanEquipped(p.equipped, out.cosmetics);
  return out;
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

// ── THE RELIQUARY ─────────────────────────────────────────────────────
// Gold'un sonsuz talebinin ilk ayağı. Saf fonksiyonlar: sunucu bunları
// BİREBİR çalıştırıyor, ekonomi iki yerde yazılmıyor.

/**
 * Bir çekiliş yap. Zarları ÇAĞIRAN verir (cüzdan modunda sunucu, demoda
 * istemci) — `Math.random()` bu dosyaya asla girmez.
 *
 * ⚠️ Gold kontrolü BURADA. Çağıran tarafa bırakmak, iki çağıran (istemci ve
 * sunucu) arasında er ya da geç ayrışma demekti.
 */
export function pullReliquary(p: Progress, rarityRoll: number, pickRoll: number): {
  progress: Progress;
  result: PullResult | null;
  /** başarısızsa sebebi — arayüz bunu gösterir */
  error: string | null;
} {
  if (p.gold < PULL_COST) return { progress: p, result: null, error: 'not enough gold' };

  const def = rollCosmetic(rarityRoll, pickRoll);
  const result = resolvePull(p.cosmetics, def);

  const next: Progress = {
    ...p,
    gold: p.gold - PULL_COST,
    cosmetics: result.duplicate ? [...p.cosmetics] : [...p.cosmetics, def.id],
    dust: p.dust + result.dust,
    equipped: { ...p.equipped },
  };
  return { progress: next, result, error: null };
}

/**
 * Tozla DOĞRUDAN alma — şansa teslim olmamanın yolu (pity).
 * Koleksiyonun son parçası için 300 çekiliş beklemek oyuncuyu kaybettirir.
 */
export function buyWithDust(p: Progress, id: string): {
  progress: Progress; error: string | null;
} {
  const def = cosmeticById(id);
  if (!def) return { progress: p, error: 'unknown item' };
  if (p.cosmetics.includes(id)) return { progress: p, error: 'already owned' };
  const cost = RARITY[def.rarity].dustCost;
  if (p.dust < cost) return { progress: p, error: 'not enough dust' };
  return {
    progress: {
      ...p, dust: p.dust - cost,
      cosmetics: [...p.cosmetics, id], equipped: { ...p.equipped },
    },
    error: null,
  };
}

/**
 * Anıtı bir seviye yükselt. Ekonominin dipsiz kovası — tavan YOK.
 *
 * ⚠️ Maliyet `ossuaryCost` ile hesaplanır, çağırandan ALINMAZ. Tılsımda ve
 * Forge'da olduğu gibi: fiyatı istemcinin göndermesi, istemcinin fiyat
 * belirlemesi demektir.
 */
export function raiseOssuary(p: Progress): { progress: Progress; error: string | null } {
  const cost = ossuaryCost(p.ossuary);
  if (p.gold < cost) return { progress: p, error: 'not enough gold' };
  return {
    progress: { ...p, gold: p.gold - cost, ossuary: p.ossuary + 1, equipped: { ...p.equipped } },
    error: null,
  };
}

// ── BAŞARIMLAR + GÜNLÜK SERİ ──────────────────────────────────────────

/**
 * Başarım ödülünü al. Koşul `Progress`ten okunuyor (achievements.ts), yani
 * sunucu aynı fonksiyonu çalıştırıp aynı cevabı buluyor.
 *
 * ⚠️ Ödül GOLD DEĞİL. Gold vermek musluğu büyütür ve Faz 2'de dengelenen
 * musluk/sink oranını bozar. Toz + satın alınamayan kozmetik veriliyor.
 */
export function claimAchievement(p: Progress, id: string): {
  progress: Progress; error: string | null;
} {
  const def = achievementById(id);
  if (!def) return { progress: p, error: 'unknown achievement' };
  if (p.achievements.includes(id)) return { progress: p, error: 'already claimed' };
  if (def.read(p) < def.goal) return { progress: p, error: 'not finished' };

  const cosmetics = def.cosmetic && !p.cosmetics.includes(def.cosmetic)
    ? [...p.cosmetics, def.cosmetic]
    : [...p.cosmetics];

  return {
    progress: {
      ...p, equipped: { ...p.equipped },
      achievements: [...p.achievements, id],
      dust: p.dust + def.dust,
      cosmetics,
    },
    error: null,
  };
}

/** Seri ödülü: gün başına artan, tavanlı toz */
export const STREAK = {
  baseDust: 15,
  perDay: 8,
  /** ⚠️ TAVAN ŞART: tavansız bir seri 200. günde absürt toz basar */
  maxDust: 120,
} as const;

export function streakReward(days: number): number {
  return Math.min(STREAK.maxDust, STREAK.baseDust + STREAK.perDay * Math.max(0, days - 1));
}

/** `YYYY-MM-DD` biçiminde UTC gün damgası */
export function utcDay(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
}

/**
 * Günlük seriyi işle.
 *
 * ⚠️ `today` ÇAĞIRANDAN gelir ve cüzdan modunda SUNUCUNUN günüdür. İstemcinin
 * saatine güvenmek, sistem tarihini ileri alıp aynı gün içinde seriyi
 * defalarca toplamanın kapısını açardı.
 *
 * Kural: dün toplandıysa seri UZAR, daha eskiyse SIFIRDAN başlar
 * (1'e döner, 0'a değil — bugün de bir gündür).
 */
export function claimStreak(p: Progress, today: string): {
  progress: Progress; reward: number; days: number; error: string | null;
} {
  if (p.streak.last === today) {
    return { progress: p, reward: 0, days: p.streak.days, error: 'already claimed today' };
  }
  const dun = new Date(`${today}T00:00:00Z`);
  dun.setUTCDate(dun.getUTCDate() - 1);
  const devam = p.streak.last === utcDay(dun);
  const days = devam ? p.streak.days + 1 : 1;
  const reward = streakReward(days);
  return {
    progress: {
      ...p, equipped: { ...p.equipped },
      dust: p.dust + reward,
      streak: { days, last: today },
    },
    reward, days, error: null,
  };
}

// ── THE WAGER ─────────────────────────────────────────────────────────

/**
 * Bahsi KUR. Gold henüz düşmez — koşu açılırken yanar (bkz. Progress.wager).
 * Hedef oyuncunun kendi rekorundan türetilir, istemciden alınmaz.
 */
export function placeWager(p: Progress, stageId: number, stake: number): {
  progress: Progress; error: string | null;
} {
  if (!p.cleared[stageId]) return { progress: p, error: 'clear the stage first' };
  const err = wagerError(stake, p.gold);
  if (err) return { progress: p, error: err };
  return {
    progress: {
      ...p, equipped: { ...p.equipped },
      wager: { stake: Math.floor(stake), target: wagerTarget(paidDepth(p, stageId)), stageId },
    },
    error: null,
  };
}

/** Kurulmuş bahsi iptal et — henüz yanmadığı için bedelsiz */
export function clearWager(p: Progress): Progress {
  return { ...p, equipped: { ...p.equipped }, wager: null };
}

/** Kozmetik tak/çıkar. `id` null ise yuva boşaltılır. */
export function equipCosmetic(p: Progress, slot: CosmeticSlot, id: string | null): Progress {
  const equipped = { ...p.equipped };
  if (id === null) {
    delete equipped[slot];
  } else {
    const def = cosmeticById(id);
    // Sahip olmadığını ya da yuvası tutmayanı takmayı sessizce yok say —
    // `cleanEquipped` ile aynı kural, tek fark bunun yazma yolu olması
    if (!def || def.slot !== slot || !p.cosmetics.includes(id)) return p;
    equipped[slot] = id;
  }
  return { ...p, equipped };
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
