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
  isTestMode, TEST_QUESTS, TEST_GEAR, TEST_GUILDS, TEST_FOLLOWS,
  TEST_SKILLS, TEST_DUELS, TEST_PVP_SEASON, TEST_BOSS, TEST_CRYPT,
} from './testMode';
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
import { STAGES, maxAscensionFor } from '@/game/config';
import type { CosmeticSlot } from '@/game/cosmetics';
import { wagerPayout, wagerWon } from '@/game/wager';
import { CHARM_SLOTS } from '@/game/charms';
import type { GearItem, GearSlot } from '@/game/gear';
import type { StatKey } from '@/game/config';
import { seedFromString } from '@/game/rng';
import { api, getMode, getWallet } from '@/lib/session';

export interface Settled {
  progress: Progress;
  awarded: number;
  progressGold: number;
  dropGold: number;
  /**
   * `dropGold`'un kaçı hafta sonu etkinliğinden geldi (bkz. game/events.ts).
   * ⚠️ `dropGold`'a EKLENMEZ, onun İÇİNDE — ayrı satır olarak gösterilirken
   * toplama ikinci kez eklenmemeli.
   */
  eventGold: number;
  paidRange: { from: number; to: number } | null;
  /** koşuda bahis vardıysa sonucu — koşu sonu dökümünde gösterilir */
  wager: { stake: number; target: number; won: boolean; dust: number } | null;
  /**
   * Düello koşusuysa sonucu. ⚠️ `awarded` HER ZAMAN 0 — düello da gold
   * ödemiyor (bkz. game/duel.ts başlığı).
   */
  duel?: {
    won: boolean; depth: number; target: number;
    delta: number; rating: number; dust: number;
    defender: string; capped: boolean;
  } | null;
  /**
   * The Wilderness koşusuysa sonucu. ⚠️ `awarded` HER ZAMAN 0 olur — bu mod
   * gold ödemiyor (bkz. backend/gear.ts başlığı).
   */
  wilderness?: {
    /** canlı çıktı mı — ölen hiçbir şey almaz */
    extracted: boolean;
    depth: number;
    items: GearItem[];
    /** çanta dolu olduğu için verilemeyen parça sayısı */
    dropped: number;
  } | null;
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
  /** sunucunun onayladığı ascension kademesi — motor BUNUNLA kurulur */
  ascension: number;
  /**
   * Loncanın verdiği XP bonusu (0.04 = +%4). ⚠️ SUNUCUDAN gelir; demoda 0,
   * çünkü demo oyuncusunun loncası yok.
   */
  guildGrowth: number;
  /**
   * Takılı ekipmanın toplam bonusu. ⚠️ SUNUCUDAN gelir; demoda boş, çünkü
   * demo oyuncusunun ekipmanı sunucuda yok.
   */
  gear: Partial<Record<StatKey, number>>;
  /**
   * Beceri ağacının toplam bonusu. ⚠️ SUNUCUDAN gelir; demoda boş, çünkü
   * puan sunucunun doğruladığı derinlikten türüyor.
   */
  skills: Partial<Record<StatKey, number>>;
  /**
   * Düello koşusuysa rakip ve HEDEF derinlik.
   *
   * ⚠️ HEDEF HUD'DA GÖRÜNMEK ZORUNDA — bilette taşınmasının sebebi bu.
   * İlk sürümde yoktu ve oyun oynanabilir hâldeyken fark edildi: oyuncu
   * "kaçı geçmem lazım" sorusunu akılda tutmak zorundaydı.
   */
  duel?: { defender: string; target: number; stageId: number };
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

export interface SeasonAwardRow { week: number; rank: number; cosmetic: string | null; dust: number }

/**
 * HAFTALIK SEZON TABLOSU.
 *
 * ⚠️ Bu istek YAN ETKİLİ: sunucu kapanmış haftaları burada ödüllendiriyor
 * (bkz. backend/season.ts — cron yok, uyuyan sunucuda arka plan işi çalışmaz).
 * Yani "tabloyu aç" aynı zamanda "geçen haftayı kapat" demek. Tekrarlanabilir
 * ve zararsız, ama bilinsin diye yazıldı.
 */
export async function fetchSeasonBoard(): Promise<{
  week: number; endsAt: number; rows: LeaderRow[];
  me: { rank: number; row: LeaderRow } | null; awards: SeasonAwardRow[];
}> {
  return api('/leaderboard/season');
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

/**
 * ⚠️ `minGold`/`maxListings` SUNUCUDAN geliyor — panelde elle kopyalanmıştı
 * (`MarketPanel.tsx`). İki kopya, biri değişince diğerinin sessizce yalan
 * söylemesi demek: oyuncuya "min 50" yazıp sunucunun 100 istemesi.
 * ⚠️ Opsiyonel bırakıldı: eski bir sunucu sürümü alan göndermezse panel
 * kendi varsayılanına düşer, çökmez.
 */
export async function fetchListings(): Promise<{
  listings: Listing[]; tokenEnabled: boolean; minGold?: number; maxListings?: number;
}> {
  // Emir defteri herkese açık — demo oyuncusu da bakabilir, sadece satamaz.
  return api<{ listings: Listing[]; tokenEnabled: boolean; minGold?: number; maxListings?: number }>('/market/listings');
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
  // ⚠️ SADECE ÇİZİM İÇİN — bkz. lib/testMode.ts. Üretimde derlenmez.
  if (isTestMode()) return TEST_BOSS as never;
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

/**
 * Koşu ÇEŞİDİ — motorun modu DEĞİL.
 *
 * ⚠️ Motor hâlâ yalnızca 'campaign' | 'descent' biliyor ve `engine.ts`'te
 * tek satır değişmedi (determinizm mührü bozulmasın diye). The Wilderness
 * motoru DESCENT olarak çalıştırıyor; farkı sunucunun ne ödediğinde ve
 * arayüzde. Bu ayrımı tek yerde tutuyoruz: `engineModeOf`.
 */
export type RunKind = 'campaign' | 'descent' | 'wilderness' | 'duel';

export function engineModeOf(kind: RunKind): 'campaign' | 'descent' {
  return kind === 'campaign' ? 'campaign' : 'descent';
}

export async function startRun(
  mode: RunKind, stageId: number,
  /** oyuncunun seçtiği checkpoint — SUNUCU kırpar, burada gönderilen sadece bir istek */
  wantStartDepth = 1,
  /**
   * Oyuncunun seçtiği ascension kademesi. ⚠️ Bir İSTEK, bir izin değil:
   * sunucu `resolveAscension` ile hak edilene kırpar ve motor SUNUCUNUN
   * döndürdüğü değerle kurulur.
   */
  wantAscension = 0,
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
      // Demoda da aynı saf fonksiyon kırpıyor — kural tek yerde kalsın
      ascension: mode === 'descent'
        ? Math.min(Math.max(0, wantAscension), maxAscensionFor(
          STAGES.reduce((m, st) => Math.max(m, paidDepth(p, st.id)), 0)))
        : 0,
      // Demoda lonca yok — sunucu kaydı gerektiriyor
      guildGrowth: 0,
      // Demoda ekipman da yok — sunucuda üretiliyor
      gear: {},
      // Demoda beceri ağacı da yok — puan sunucuda doğrulanan derinlikten türüyor
      skills: {},
      wager: wagerLive ? w! : null,
    };
  }
  const out = await api<{
    runId: string; seed: number; charms?: string[]; startDepth?: number; ascension?: number;
    guildGrowth?: number; gear?: Partial<Record<string, number>>;
    skills?: Partial<Record<string, number>>;
  }>(
    '/run/start',
    { method: 'POST', body: { mode, stageId, startDepth: wantStartDepth, ascension: wantAscension } },
  );
  // ⚠️ SUNUCUNUN döndürdüğü değer kullanılır, istenen değil. Motoru başka bir
  // derinlikte kurmak koşuyu doğrulanamaz hale getirirdi.
  // Cüzdan modunda bahsi SUNUCU takip ediyor (Run satırında) — bilette
  // taşımaya gerek yok, kapanış yanıtı sonucu bildiriyor.
  return {
    runId: out.runId, seed: out.seed, charms: out.charms ?? [],
    startDepth: Math.max(1, out.startDepth ?? 1),
    // ⚠️ SUNUCUNUN döndürdüğü kademe — istenen değil. Motoru başka bir
    // kademede kurmak koşuyu doğrulanamaz hâle getirirdi.
    ascension: Math.max(0, out.ascension ?? 0),
    // ⚠️ Loncanın XP bonusu SUNUCUDAN. `myGuild()` okuyup buradan geçirmek de
    // mümkündü ama o, istemcinin beyan ettiği bir bonus olurdu — bir bonusun
    // kaynağı hiçbir zaman istemci olmamalı.
    guildGrowth: Math.max(0, out.guildGrowth ?? 0),
    // ⚠️ Takılı ekipmanın bonusu da SUNUCUDAN. İstemci parçalarını biliyor
    // ama beyan etmemeli — beyan ettiği an "5 Graveborn takılıyım" diyebilir.
    gear: (out.gear ?? {}) as RunTicket['gear'],
    // ⚠️ Beceri bonusu da SUNUCUDAN — üçüncü kez aynı kural.
    skills: (out.skills ?? {}) as RunTicket['skills'],
    wager: null,
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
      progressGold: r.progressGold, dropGold: r.dropGold,
      // Demo/çevrimdışı yolda etkinlik yok: çarpan sunucuda uygulanıyor ve
      // burada sunucu yok. Sıfır yazmak, olmayan bir bonusu göstermekten iyi.
      eventGold: 0, paidRange: r.paidRange,
      wager: wagerOut,
    };
  }

  const out = await api<{
    progress: Progress; awarded: number; progressGold: number; dropGold: number;
    eventGold?: number; wager: Settled['wager']; wilderness?: Settled['wilderness']; duel?: Settled['duel'];
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
    eventGold: out.eventGold ?? 0,
    wilderness: out.wilderness ?? null,
    duel: out.duel ?? null,
    paidRange: after > before ? { from: before, to: after } : null,
  };
}

// ── HAFTA SONU ETKİNLİĞİ ──────────────────────────────────────────────
// ⚠️ PENCERE SUNUCUDAN OKUNUR, istemcide hesaplanmaz. `eventAt(new Date())`
// yazmak cazipti ve tek satırdı — ama saati kaymış bir cihaz Salı günü
// "Ashfall açık" yazar, oyuncu koşuyu bitirir ve bonusu göremezdi. Ödemeyi
// yapan saat hangisiyse, gösteren saat de o olmalı.

export interface EventState {
  /** sunucunun saati — geri sayım bunun üstünden yürür, cihazınkinden değil */
  now: number;
  live: boolean;
  startsAt: number;
  endsAt: number;
  event: {
    id: string; name: string; blurb: string;
    effect: string; mul: number; tone: string;
  };
}

export async function fetchEvent(): Promise<EventState> {
  return api<EventState>('/events');
}

// ── THE CRYPT DEED ────────────────────────────────────────────────────
// ⚠️ DEMO MODUNDA YOK. Kasa ORTAK bir bakiye ve sunucuda yaşıyor; demo
// oyuncusunun ilerlemesi hiç sunucuya yazılmıyor. Sahte bir kasa uydurmak
// "gerçek sanacağı bir sicil göstermek" olurdu — market ve koşu geçmişinde
// verilen kararın aynısı.

export interface CryptState {
  tiers: { tier: number; name: string; cost: number; weight: number; blurb: string }[];
  vault: { balance: number; owners: number; totalWeight: number };
  me: { tier: number; claimedWeek: number } | null;
  week: number;
}

export async function fetchCrypt(): Promise<CryptState> {
  // ⚠️ SADECE ÇİZİM İÇİN — bkz. lib/testMode.ts. Üretimde derlenmez.
  if (isTestMode()) return TEST_CRYPT as never;
  return api<CryptState>('/crypt');
}

export async function buyCryptDeed(): Promise<{ progress: Progress; tier: number; spent: number }> {
  return api('/crypt/buy', { method: 'POST', body: {} });
}

export async function claimCrypt(): Promise<{ progress: Progress; amount: number; week: number }> {
  return api('/crypt/claim', { method: 'POST', body: {} });
}

// ── LONCALAR ──────────────────────────────────────────────────────────
// ⚠️ DEMO MODUNDA YOK — Crypt ile aynı gerekçe: lonca ORTAK bir kayıt.
// Ayrıca `growth` perkini KOŞUYA sunucu taşıyor (`/run/start`), buradan
// okunan değer yalnızca gösterim — istemcinin bildirdiği bir bonus, ödül
// hesabına giren bir bonus olamaz.

export interface GuildSummary {
  id: string; name: string; tag: string; level: number;
  members: number; cap: number;
}

export interface MyGuild {
  id: string; name: string; tag: string; owner: string;
  level: number; treasury: number; donated: number;
  members: { wallet: string; hero: string; bestRating: number }[];
  cap: number; growth: number; nextCost: number | null;
}

export interface GuildState {
  mine: MyGuild | null;
  list: GuildSummary[];
  cost: number;
  /** ⚠️ Sadece "hangi satır benim" içindir — yetki değil, sunucu kendi bakar */
  wallet: string | null;
}

export async function fetchGuilds(): Promise<GuildState> {
  // ⚠️ SADECE ÇİZİM İÇİN — bkz. lib/testMode.ts. Üretimde derlenmez.
  if (isTestMode()) return TEST_GUILDS as never;
  const out = await api<Omit<GuildState, 'wallet'>>('/guild');
  return { ...out, wallet: getWallet() };
}

/** ⚠️ `progress` de dönüyor — kurma gold düşürüyor, navbar güncellenmeli */
export async function createGuild(name: string, tag: string): Promise<{ guild: MyGuild; progress: Progress }> {
  return api('/guild/create', { method: 'POST', body: { name, tag } });
}

export async function joinGuild(id: string): Promise<MyGuild> {
  const { guild } = await api<{ guild: MyGuild }>('/guild/join', {
    method: 'POST', body: { id },
  });
  return guild;
}

export async function leaveGuild(): Promise<{ dagildi: boolean }> {
  return api('/guild/leave', { method: 'POST', body: {} });
}

export async function donateGuild(amount: number): Promise<{ guild: MyGuild; progress: Progress }> {
  return api('/guild/donate', { method: 'POST', body: { amount } });
}

// ── EKİPMAN ───────────────────────────────────────────────────────────
// ⚠️ DEMO MODUNDA YOK. Ekipman sunucuda üretiliyor (bkz. game/gear.ts):
// istemcinin ürettiği bir parça, istemcinin verdiği bir güç olurdu.

export interface GearView {
  items: (GearItem & { equipped: boolean })[];
  equipped: Partial<Record<GearSlot, string>>;
  vaultSize: number;
}

export async function fetchGear(): Promise<GearView> {
  // ⚠️ SADECE ÇİZİM İÇİN — bkz. lib/testMode.ts. Üretimde derlenmez.
  if (isTestMode()) return TEST_GEAR as never;
  return api<GearView>('/gear');
}

export async function equipGear(id: string): Promise<GearView> {
  return api('/gear/equip', { method: 'POST', body: { id } });
}

export async function unequipGear(slot: GearSlot): Promise<GearView> {
  return api('/gear/unequip', { method: 'POST', body: { slot } });
}

export async function salvageGear(ids: string[]): Promise<{
  dust: number; removed: number; progress: Progress; gear: GearView;
}> {
  return api('/gear/salvage', { method: 'POST', body: { ids } });
}

/**
 * YENİDEN DÖVME — yükseltme ya da yeniden dizme.
 *
 * ⚠️ İstemci SADECE "hangi parça, hangi işlem" diyor. Ekleri sunucu üretiyor
 * ve seed'i de sunucu seçiyor; buradan seed göndermek, beğenilen sonucu
 * bulana kadar deneme yapmanın kapısı olurdu (bkz. backend/gear.reforgeGear).
 */
export async function reforgeGear(id: string, action: 'promote' | 'reroll'): Promise<{
  item: GearItem; spent: number; gold: number; progress: Progress; gear: GearView;
}> {
  return api('/gear/reforge', { method: 'POST', body: { id, action } });
}

// ── DÜELLO (asenkron PvP) ─────────────────────────────────────────────
// ⚠️ DEMO MODUNDA YOK. Düello başka bir oyuncunun SUNUCUDAKİ kaydına karşı
// oynanıyor; demoda rakip diye bir şey yok ve sahte bir rakip uydurmak,
// olmayan bir topluluğu varmış gibi göstermek olurdu.

export interface DuelRow {
  id: string; wallet: string; stageId: number; depth: number;
  rating: number; duelRating: number; hero: string;
  /** meydan okunamıyorsa SEBEBİ */
  blocker: string | null;
}

export interface DuelLadderRow {
  rank: number; wallet: string; rating: number;
  wins: number; losses: number; hero: string;
}

export interface DuelBoard {
  me: { rating: number; wins: number; losses: number; rewardedToday: number };
  rows: DuelRow[];
  recent: {
    challenger: string; defender: string; stageId: number;
    depth: number; target: number; won: boolean; delta: number; at: string;
  }[];
  /** düellonun KENDİ sıralaması — koşu tablosundan ayrı */
  ladder: { rows: DuelLadderRow[]; me: DuelLadderRow | null };
}

/**
 * Sunucu sana uygun rakibi bulsun.
 *
 * ⚠️ PUAN YAKINLIĞINA göre seçiyor. Listeden seçmek yeterli değildi:
 * tablo puana göre sıralı olduğu için oyuncu doğal olarak en zayıfı seçiyor
 * ve ladder "en kolay hedefi bul" oyununa dönüyordu.
 */
// ── DESTEK TALEPLERİ ──
// ⚠️ DEMO MODUNDA YOK: talep cüzdana bağlı, cevaplanacak bir muhatap yok.

export interface TicketView {
  id: string; subject: string; status: string;
  createdAt: string; bumpedAt: string;
  messages: { fromAdmin: boolean; body: string; at: string }[];
}

export async function fetchTickets(): Promise<TicketView[]> {
  const { tickets } = await api<{ tickets: TicketView[] }>('/tickets');
  return tickets;
}

export async function openTicket(subject: string, body: string): Promise<TicketView> {
  const { ticket } = await api<{ ticket: TicketView }>('/tickets', {
    method: 'POST', body: { subject, body },
  });
  return ticket;
}

export async function replyTicket(id: string, body: string): Promise<TicketView> {
  const { ticket } = await api<{ ticket: TicketView }>('/tickets/reply', {
    method: 'POST', body: { id, body },
  });
  return ticket;
}

// ── TAKİP (arkadaş listesi) ──
// ⚠️ Tek yönlü, onay yok — listede görünen her şey zaten sıralamada
// görünüyor (bkz. backend/follow.ts).

export interface FollowRow {
  wallet: string; hero: string; online: boolean;
  duelRating: number; bestStage: number; bestDepth: number;
  recordId: string | null; recordDepth: number;
  /** meydan okunamıyorsa SEBEBİ */
  blocker: string | null;
}

export interface FollowState { rows: FollowRow[]; max: number }

export async function fetchFollows(): Promise<FollowState> {
  // ⚠️ SADECE ÇİZİM İÇİN — bkz. lib/testMode.ts. Üretimde derlenmez.
  if (isTestMode()) return TEST_FOLLOWS as never;
  return api<FollowState>('/follow');
}

export async function addFollow(wallet: string): Promise<FollowState> {
  return api('/follow', { method: 'POST', body: { wallet } });
}

export async function removeFollow(wallet: string): Promise<FollowState> {
  return api(`/follow?wallet=${encodeURIComponent(wallet)}`, { method: 'DELETE' });
}

// ── GÜNLÜK GÖREVLER ──
// ⚠️ DEMO MODUNDA YOK: ilerleme sunucunun doğruladığı olaylardan geliyor.

export interface QuestState {
  day: string;
  quests: { id: string; text: string; goal: number; dust: number;
    progress: number; done: boolean; claimed: boolean }[];
  bonus: { dust: number; ready: boolean; claimed: boolean };
  /** günün toplam toz tavanı */
  ceiling: number;
}

export async function fetchQuests(): Promise<QuestState> {
  // ⚠️ SADECE ÇİZİM İÇİN — bkz. lib/testMode.ts. Üretimde derlenmez.
  if (isTestMode()) return TEST_QUESTS as never;
  return api<QuestState>('/quests');
}

export async function claimQuest(id: string): Promise<{ view: QuestState; dust: number; progress: Progress }> {
  return api('/quests/claim', { method: 'POST', body: { id } });
}

// ── PvP SEZONU ──
// ⚠️ Bu istek YAN ETKİLİ: sunucu kapanmayı bekleyen haftaları burada
// kapatıyor (cron yok). "Tabloyu aç" aynı zamanda "geçen sezonu kapat"
// demek — tekrarlanabilir ve zararsız.

export interface PvpSeasonRow {
  rank: number; wallet: string; rating: number;
  wins: number; losses: number; matches: number; hero: string;
}

export interface PvpSeasonState {
  week: number;
  rows: PvpSeasonRow[];
  /** sıram — `rank: 0` = henüz yerleşmedim */
  me: PvpSeasonRow | null;
  /** sıralamaya girmek için gereken maç sayısı */
  placement: number;
  awards: { week: number; rank: number; rating: number; cosmetic: string | null; dust: number }[];
}

export async function fetchPvpSeason(): Promise<PvpSeasonState> {
  // ⚠️ SADECE ÇİZİM İÇİN — bkz. lib/testMode.ts. Üretimde derlenmez.
  if (isTestMode()) return TEST_PVP_SEASON as never;
  return api<PvpSeasonState>('/pvp/season');
}

export async function findDuel(): Promise<DuelRow> {
  const { match } = await api<{ match: DuelRow }>('/duel/find', { method: 'POST', body: {} });
  return match;
}

export async function fetchDuels(): Promise<DuelBoard> {
  // ⚠️ SADECE ÇİZİM İÇİN — bkz. lib/testMode.ts. Üretimde derlenmez.
  if (isTestMode()) return TEST_DUELS as never;
  return api<DuelBoard>('/duel');
}

/**
 * Meydan okumayı başlat.
 *
 * ⚠️ SEED SUNUCUDAN VE RAKİBİN KAYDINDAN gelir — istemci ne seçiyor ne de
 * biliyor. Düellonun bütün adaleti buna dayanıyor: iki oyuncu TAM OLARAK
 * aynı koşuyu oynuyor.
 */
export async function startDuel(recordId: string): Promise<RunTicket & {
  duel: { defender: string; target: number; stageId: number };
}> {
  const out = await api<{
    runId: string; seed: number; charms?: string[]; startDepth?: number; ascension?: number;
    guildGrowth?: number; gear?: Partial<Record<string, number>>;
    skills?: Partial<Record<string, number>>;
    duel: { defender: string; target: number; stageId: number };
  }>('/duel/start', { method: 'POST', body: { recordId } });
  return {
    runId: out.runId, seed: out.seed, charms: out.charms ?? [],
    startDepth: 1, ascension: 0,
    guildGrowth: Math.max(0, out.guildGrowth ?? 0),
    gear: (out.gear ?? {}) as RunTicket['gear'],
    skills: (out.skills ?? {}) as RunTicket['skills'],
    wager: null,
    duel: out.duel,
  };
}

// ── BECERİ AĞACI ──────────────────────────────────────────────────────
// ⚠️ DEMO MODUNDA YOK. Puan `depthPaid`'ten türüyor ve doğrulaması sunucuda;
// demoda sahte bir ağaç göstermek, olmayan bir gücü varmış gibi göstermek
// olurdu (ekipmandaki gerekçenin aynısı).

export interface SkillState {
  nodes: string[];
  points: number;
  spent: number;
  /** dağılımı bozmanın gold bedeli */
  respec: number;
}

export async function fetchSkills(): Promise<SkillState> {
  // ⚠️ SADECE ÇİZİM İÇİN — bkz. lib/testMode.ts. Üretimde derlenmez.
  if (isTestMode()) return TEST_SKILLS as never;
  return api<SkillState>('/skills');
}

/**
 * Dağılımı kaydet — TAM LİSTE gönderilir, fark değil.
 *
 * ⚠️ Sunucu listeyi `sanitizeSkills`'ten geçirip ÇIKTISINI yazıyor; yani
 * dönen `nodes` istemcinin istediği değil, sunucunun kabul ettiği.
 * `charged` > 0 ise bu bir respec'ti ve gold alındı.
 */
export async function saveSkills(nodes: string[]): Promise<SkillState & { charged: number; progress: Progress }> {
  return api('/skills/set', { method: 'POST', body: { nodes } });
}

export async function buyGuildUpgrade(): Promise<MyGuild> {
  const { guild } = await api<{ guild: MyGuild }>('/guild/upgrade', {
    method: 'POST', body: {} });
  return guild;
}

// ── THE BINDING (pet) ─────────────────────────────────────────────────
//
// ⚠️ DEMO MODUNDA BAĞLAMA VE FÜZYON YOK, yalnızca yükseltme/kuşanma çalışır.
// Sebep: bağlamanın koşulu KILL SAYACI ve o sayaç demo koşularından geliyor —
// yani demoda pet açmak, ekonomiye girmeyen gold'la güç kazanmak olurdu.
// `buyCharm`teki demo dalıyla aynı mantık değil: orada bahis kozmetik değil,
// burada doğrudan hasar.
//
// ⚠️ HEPSİ SUNUCUNUN DÖNDÜĞÜ `progress`İ KULLANIYOR, yerel tahmini değil.
// Fiyatı, kill eşiğini ve yuva sınırını sunucu doğruluyor; istemcinin
// hesabını yazmak, iki yerde ayrışan bir ekonomi demek olurdu.

export async function bindPet(id: string): Promise<Progress> {
  const { progress } = await api<{ progress: Progress }>('/pets/bind', {
    method: 'POST', body: { pet: id },
  });
  return progress;
}

export async function upgradePet(id: string): Promise<Progress> {
  const { progress } = await api<{ progress: Progress }>('/pets/upgrade', {
    method: 'POST', body: { pet: id },
  });
  return progress;
}

export async function fusePet(id: string): Promise<Progress> {
  const { progress } = await api<{ progress: Progress }>('/pets/fuse', {
    method: 'POST', body: { pet: id },
  });
  return progress;
}

export async function equipPets(ids: string[]): Promise<Progress> {
  const { progress } = await api<{ progress: Progress }>('/pets/equip', {
    method: 'POST', body: { pets: ids },
  });
  return progress;
}

export async function buyPetSlot(): Promise<Progress> {
  const { progress } = await api<{ progress: Progress }>('/pets/slot', {
    method: 'POST', body: {},
  });
  return progress;
}
