// ÖDÜL HESABI — sunucunun tek yetkili olduğu yer.
//
// KURAL: istemci "şu kadar gold kazandım" DEMEZ. Sadece NE YAPTIĞINI bildirir
// (hangi derinliğe indim, kaç nadir düşüş topladım). Sunucu ödülü KENDİ
// hesaplar ve iddiayı yapısal tavanla kırpar.
//
// Oyun mantığı frontend'den İÇE AKTARILIR, kopyalanmaz. Ekonomi kuralını iki
// yerde yazmak, er ya da geç iki yerde ayrışmak demektir — ve ayrışan taraf
// para basar. `progress.ts` en baştan bu yüzden saf fonksiyon yazıldı.

import { allowedStartDepth, applyRunResult, type Progress, type RunResult } from '@game/progress';
import { GOLD, PASSIVES, STAGES, descentStage, rareDropChance, stageById } from '@game/config';
import { CHARMS, CHARM_SLOTS } from '@game/charms';
import { permanentBonus } from '@game/forge';

/**
 * BU OYUNCUNUN nadir düşüş çarpanı — yapısal tavan bunu saymak ZORUNDA.
 *
 * Motor tarafında `greed` artık düşüş MİKTARINI çarpıyor. Tavan bunu
 * saymazsa Forge'unu doldurmuş DÜRÜST oyuncu kırpılır; bu sessiz bir hatadır,
 * kimse "gold'um eksik geldi" diye şikâyet etmez.
 *
 * ⚠️ AMA HERKESE GLOBAL TAVANI VERMEK DE YANLIŞ. İlk denemede sabit 2,5
 * kullanıldı ve ölçüldü: yalancının kazancı dürüst oyuncunun 2,1 katına
 * çıktı — yani greed'i HİÇ olmayan bir hesap, sanki tam doldurmuş gibi
 * yalan söyleyebiliyordu. Tavan oyuncuya göre daralmalı.
 *
 * Forge seviyesi sunucuda BİLİNİYOR. Koşu içi kaynaklar (Coin Mask pasifi,
 * ileride bir tılsım) bilinmiyor, onlar için teorik en yüksek pay bırakılır.
 */
export function greedCeiling(p: Progress): number {
  const forge = permanentBonus(p.upgrades).greed ?? 0;
  // Koşu içinde toplanabilecek en yüksek greed — havuzdan TÜRETİLİR, elle
  // yazılmaz: yeni bir greed pasifi eklenirse tavan kendiliğinden büyür.
  const passive = PASSIVES
    .filter((x) => x.stat === 'greed')
    .reduce((s, x) => s + x.perLevel * x.maxLevel, 0);
  const charm = [...CHARMS]
    .map((c) => c.stats.greed ?? 0)
    .sort((a, b) => b - a)
    .slice(0, CHARM_SLOTS)
    .reduce((s, v) => s + v, 0);
  return 1 + forge + passive + charm;
}

/** İstemcinin koşu sonunda gönderdiği iddia — HİÇBİRİ doğrudan kabul edilmez */
export interface RunClaim {
  deepestCleared: number;
  rareGold: number;
  cleared: boolean;
}

/**
 * NADİR DÜŞÜŞ TAVANI — O(1) yapısal sınır.
 *
 * Koşuyu sunucuda birebir yeniden simüle etmek MÜMKÜN (motor DOM'suz) ama
 * derin bir inişte 20.000+ tick demek; istek başına saniyeler sürer ve
 * kolayca DoS yüzeyi olur. Onun yerine "bu koşuda EN FAZLA kaç gold düşebilirdi"
 * sorusunu kapalı formda cevaplıyoruz.
 *
 * Hesap: geçilen her derinliğin düşman sayısı × o derinliğin düşüş ihtimali
 * × mümkün olan en yüksek düşüş miktarı. Gerçekte bunun çok altı düşer;
 * amaç adaleti değil TAVANI garanti etmek.
 */
export function maxRareGold(
  mode: string, stageId: number, deepestCleared: number,
  /** oyuncunun düşüş çarpanı tavanı — bkz. greedCeiling. 1 = greed yok. */
  greedMul = 1,
): number {
  const st = stageById(stageId);
  if (!st) return 0;

  const g = Math.max(1, greedMul);
  const dropMax = (depth: number) =>
    Math.max(1, Math.round(GOLD.dropMax * (1 + GOLD.dropAmountPerDepth * depth) * g));

  if (mode === 'campaign') {
    // Kampanyada oyuncu bölümü tekrar tekrar oynayabilir; tek bir koşuda
    // öldürebileceği en fazla düşman = havuz + boss.
    const kills = st.enemyCount + (st.boss ? 1 : 0);
    const expected = kills * rareDropChance(0);
    return Math.ceil(headroom(expected) * dropMax(0)) + (st.boss ? CHEST_ALLOWANCE : 0);
  }

  // Descent: 1..deepestCleared derinliklerinin TAMAMI + içinde bulunduğu
  // (bitmemiş) derinliğin tamamı sayılır — kapalı bir üst sınır.
  let expected = 0;
  let bosses = 0;
  const top = Math.max(0, Math.floor(deepestCleared)) + 1;
  for (let d = 1; d <= top; d++) {
    const def = descentStage(stageId, d);
    const kills = def.enemyCount + (def.boss ? 1 : 0);
    expected += kills * rareDropChance(d);
    if (def.boss) bosses += 1;
  }
  // En derin seviyenin miktar tavanı — hepsi oradan düşmüş gibi say
  return Math.ceil(headroom(expected) * dropMax(top)) + bosses * CHEST_ALLOWANCE;
}

/**
 * DÜŞÜŞ SAYISI ÜST SINIRI — beklenen değer + varyans payı.
 *
 * ⚠️ Sabit bir çarpan (ör. beklenenin 2,5 katı) AZ SAYIDA olayda yetmez.
 * 1. bölümde beklenen düşüş 0,7 adet; şanslı bir oyuncunun 3 düşüş alması
 * %3,4 ihtimalle olur ve sabit çarpanla tavan 20 gold'a düşüyordu — yani
 * DÜRÜST oyuncu kırpılıyordu. Bu sessiz bir hatadır: kimse "az gold aldım"
 * diye şikâyet etmez, oyun sadece cimri hissettirir.
 *
 * Binom dağılımının kuyruğu için: n + 4√n + sabit taban.
 */
function headroom(expectedCount: number): number {
  const n = Math.max(0, expectedCount);
  return n + 4 * Math.sqrt(n) + MIN_DROP_HEADROOM;
}

/** Beklenen sayı sıfıra yakınken bile bu kadar düşüşe izin ver */
const MIN_DROP_HEADROOM = 5;

/**
 * Sandıklar da `rareGold`'a yazıyor: evrim vermeyen sandık 200 × greed.
 * Greed en fazla +%72 (Forge tam dolu) → 344. 400 rahat bir pay.
 *
 * ⚠️ Sandık SADECE BOSS'tan düşer, her derinlikten değil. İlk sürümde
 * derinlik BAŞINA 900 pay bırakılmıştı ve tavan absürtleşiyordu: derinlik
 * 5'te dürüst oyuncu ~40 gold toplarken tavan 5.459 çıkıyordu, yani yalan
 * söyleyen 10 kat fazlasını alabiliyordu. Tavanın işe yaraması için
 * GERÇEĞE YAKIN olması şart.
 */
const CHEST_ALLOWANCE = 400;


/**
 * DERİNLİK TAVANI — "derinlik 9999'a indim" iddiasını keser.
 *
 * Koşunun süresi bile bu derinliğe yetmezdi: her derinlik en az
 * enemyCount / spawnRate saniye sürer. Süre bilgisine güvenmek yerine
 * (o da istemciden gelir) mutlak bir tavan koyuyoruz.
 */
export const MAX_DEPTH_CLAIM = 500;

/**
 * SÜRE TABANI — "derinlik 500'e indim" iddiasını FİZİKLE keser.
 *
 * `MAX_DEPTH_CLAIM` tek başına yetmiyor: 500'e kırpılan bir yalan hâlâ 500'dür
 * ve leaderboard'ın tepesini kalıcı olarak kilitler. Gold tarafında yapısal
 * tavan bunu tolere edebiliyordu (kırpılan miktar küçük), sıralamada
 * edemiyor — orada tek bir yalan tabloyu bitirir.
 *
 * Her derinlik en az `enemyCount / spawnRate` saniye sürer: düşmanlar o hızın
 * üstünde SAHNEYE ÇIKAMAZ, hepsi ölmeden derinlik bitmez. Bu alt sınır
 * motorun kendi sayılarından türer, uydurma değil.
 *
 * ⚠️ Cömert olmak ZORUNDA: gerçek koşu bundan uzun sürer (oyuncu düşmanı
 * anında öldürmez). Amaç dürüst oyuncuyu kırpmak değil, imkânsızı elemek.
 */
export function minDescentSeconds(stageId: number, depth: number, startDepth = 1): number {
  let s = 0;
  for (let d = Math.max(1, Math.floor(startDepth)); d <= depth; d++) {
    const def = descentStage(stageId, d);
    s += (def.enemyCount / def.spawnRate) * TIME_SAFETY;
  }
  return s;
}

/**
 * ⚠️ GÜVENLİK PAYI. `enemyCount / spawnRate` teoride kusursuz bir alt sınır
 * ama uygulamada ±1 düşmanlık kaymalara duyarlı (ilk düşman t=0'da mı yoksa
 * bir aralık sonra mı çıkıyor). Ölçtük: gerçek koşuda pay yalnızca 1
 * derinlikti — o kadar dar ki motorda tek bir zamanlama değişikliği DÜRÜST
 * oyuncuyu kırpmaya başlardı. Bu sessiz bir hatadır: kimse "derinliğim
 * eksik sayıldı" diye şikâyet etmez, oyun sadece bozuk hissettirir.
 *
 * %15 pay yalancıya hiçbir şey kazandırmıyor (o saniyeler değil derinlikler
 * uyduruyor), dürüst oyuncuya nefes alanı veriyor.
 */
const TIME_SAFETY = 0.85;

/**
 * Geçen sürede en fazla hangi derinliğe inilebilirdi.
 *
 * ⚠️ `startDepth` ŞART. Checkpoint'ten başlayan oyuncu d1..d(start−1)'i
 * OYNAMIYOR, dolayısıyla o derinliklerin süresini de harcamıyor. Tabanı hep
 * 1'den saymak, checkpoint kullanan DÜRÜST oyuncuyu "imkânsız hızlı" ilan
 * edip kırpardı — ve bu sessiz bir hata olurdu: kimse "derinliğim eksik
 * sayıldı" diye şikâyet etmez, oyun sadece bozuk hissettirir.
 */
export function maxDepthInTime(stageId: number, elapsedSec: number, startDepth = 1): number {
  const from = Math.max(1, Math.floor(startDepth));
  // Süre bilinmiyorsa (Infinity) sınır uygulanmaz — saf hesaplarda ve
  // testlerde `settleRun` süresiz çağrılabiliyor.
  if (Number.isNaN(elapsedSec) || elapsedSec <= 0) return from - 1;
  if (!Number.isFinite(elapsedSec)) return MAX_DEPTH_CLAIM;

  let s = 0;
  for (let d = from; d <= MAX_DEPTH_CLAIM; d++) {
    const def = descentStage(stageId, d);
    s += (def.enemyCount / def.spawnRate) * TIME_SAFETY;
    if (s > elapsedSec) return d - 1;
  }
  return MAX_DEPTH_CLAIM;
}

export interface Settlement {
  progress: Progress;
  awarded: number;
  progressGold: number;
  dropGold: number;
  /** iddia kırpıldı mı — admin panelinde şüpheli işareti */
  capped: boolean;
  reason: string[];
}

/**
 * Koşuyu kapat. `before` = koşu BAŞLARKENKİ ilerleme (Run kaydından değil,
 * oyuncunun güncel kaydından okunur; ikisi de sunucuda).
 */
export function settleRun(
  before: Progress,
  mode: 'campaign' | 'descent',
  stageId: number,
  claim: RunClaim,
  /** koşu açıldığından beri geçen saniye — süre tabanı kontrolü için */
  elapsedSec = Infinity,
  /**
   * Koşunun başladığı derinlik. ⚠️ İSTEMCİDEN DEĞİL, Run kaydından gelir —
   * `/run/start` bunu `allowedStartDepth`'e göre kendisi yazmıştı.
   */
  startDepth = 1,
): Settlement {
  const reason: string[] = [];
  let capped = false;

  // 1) Derinlik iddiası
  let depth = Math.max(0, Math.floor(Number(claim.deepestCleared) || 0));
  if (depth > MAX_DEPTH_CLAIM) {
    depth = MAX_DEPTH_CLAIM;
    capped = true;
    reason.push(`derinlik iddiası ${claim.deepestCleared} → ${MAX_DEPTH_CLAIM}`);
  }
  // Süre tabanı — mutlak tavandan çok daha keskin bir sınır
  if (mode === 'descent' && depth > 0) {
    // Checkpoint'ten başlayan koşu d1..d(start−1)'i oynamadı; taban oradan sayılır
    const fizik = maxDepthInTime(stageId, elapsedSec, startDepth);
    if (depth > fizik) {
      reason.push(`derinlik ${depth} → süreye sığan ${fizik} (${Math.round(elapsedSec)} sn)`);
      depth = Math.max(0, fizik);
      capped = true;
    }
  }
  if (mode === 'campaign' && depth !== 0) {
    depth = 0;
    reason.push('kampanyada derinlik iddiası yok sayıldı');
  }

  // 2) Nadir düşüş iddiası — yapısal tavana kırp
  const rawGold = Math.max(0, Math.floor(Number(claim.rareGold) || 0));
  const goldCap = maxRareGold(mode, stageId, depth, greedCeiling(before));
  let rareGold = rawGold;
  if (rareGold > goldCap) {
    rareGold = goldCap;
    capped = true;
    reason.push(`nadir gold ${rawGold} → tavan ${goldCap}`);
  }

  // 3) Bölüm gerçekten açık mı — kilitli bölümden ödül alınamaz
  if (stageId > before.unlockedStage) {
    reason.push(`kilitli bölüm ${stageId} (açık: ${before.unlockedStage})`);
    return {
      progress: before, awarded: 0, progressGold: 0, dropGold: 0,
      capped: true, reason,
    };
  }

  // 4) Ödülü OYUNUN KENDİ fonksiyonu hesaplasın — exploit kapısı orada
  const run: RunResult = {
    mode, stageId,
    cleared: mode === 'campaign' && !!claim.cleared,
    deepestCleared: depth,
    rareGold,
  };
  const r = applyRunResult(before, run);

  return {
    progress: r.progress,
    awarded: r.awarded,
    progressGold: r.progressGold,
    dropGold: r.dropGold,
    capped,
    reason,
  };
}

/**
 * Koşunun GERÇEKTEN başlayacağı derinlik.
 *
 * İstemci bir istek gönderir, sunucu onu oyuncunun hak ettiği checkpoint'e
 * KIRPAR. Reddetmek yerine kırpmak bilinçli: oyuncu başka cihazda ilerlemiş
 * olabilir, elindeki sayı eskimiş olabilir. Kırpma sessizce doğru olanı yapar;
 * reddetmek ise oynayamayan bir oyuncu üretirdi.
 */
export function resolveStartDepth(
  p: Progress, mode: string, stageId: number, wanted: unknown,
): number {
  if (mode !== 'descent') return 0;
  const w = Math.max(1, Math.floor(Number(wanted) || 1));
  return Math.min(w, allowedStartDepth(p, stageId));
}

/** Koşu başlatılabilir mi (bölüm açık mı, descent için bölüm geçilmiş mi) */
export function canStart(p: Progress, mode: string, stageId: number): string | null {
  if (!stageById(stageId)) return 'bilinmeyen bölüm';
  if (stageId > p.unlockedStage) return 'bölüm kilitli';
  if (mode === 'descent' && !p.cleared[stageId]) return 'önce bölümü temizle';
  if (mode !== 'campaign' && mode !== 'descent') return 'bilinmeyen mod';
  return null;
}

export { STAGES };
