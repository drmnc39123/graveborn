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
import {
  ASCENSION, GOLD, PASSIVES, STAGES, ascensionDropMul, descentStage, maxAscensionFor,
  rareDropChance, stageById,
} from '@game/config';
import { CHARMS, CHARM_SLOTS } from '@game/charms';
import { permanentBonus } from '@game/forge';
import { PETS, petCap, petEffect } from '@game/pets';

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
  // ⚠️ FORAGER PET'İ DE SAYILMAK ZORUNDA. Forager `greed` veriyor ve o katkı
  // `permanent` kanalından geçiyor — yani oyuncunun GERÇEK greed'inin
  // parçası. Buraya eklenmezse tavan gerçek kazancın ALTINDA kalır ve
  // DÜRÜST oyuncu haksız yere kırpılır. Yalancıyı değil dürüstü cezalandıran
  // bir tavan, tavansızlıktan daha kötüdür.
  return 1 + forge + passive + charm + petGreedCeiling(p);
}

/**
 * Forager pet'lerinden gelebilecek EN YÜKSEK greed.
 *
 * ⚠️ SAHİP OLDUKLARINDAN türetiliyor — hiç pet bağlamamış oyuncunun tavanı
 * büyümüyor. Global sabit bir pay bırakmak, bu fonksiyonun başındaki notta
 * anlatılan hatanın (yalancıya dürüstün 2,1 katını veren sabit tavan) pet
 * üzerinden birebir tekrarı olurdu.
 *
 * ⚠️ Anlık seviye DEĞİL, o pet'in ULAŞABİLECEĞİ tavan kullanılıyor: burası
 * bir üst sınır hesabı. Anlık kuşanıma bakmak, koşu sırasında pet
 * değiştirmeyi doğrulanması gereken ikinci bir sayıya çevirirdi.
 */
function petGreedCeiling(p: Progress): number {
  const sahip = p.pets ?? {};
  const fused = p.petFused ?? [];
  const paylar: number[] = [];
  for (const def of PETS) {
    if (def.role !== 'forager') continue;
    if ((sahip[def.id] ?? 0) <= 0) continue;
    const mythic = fused.includes(def.id);
    paylar.push(petEffect(def, petCap(def, mythic), mythic).share);
  }
  const yuva = p.petSlot2 ? 2 : 1;
  return paylar.sort((a, b) => b - a).slice(0, yuva).reduce((s, v) => s + v, 0);
}

/**
 * BU KOŞUDA EN FAZLA KAÇ DÜŞMAN ÖLDÜRÜLEBİLİRDİ — kill iddiasının tavanı.
 *
 * ⚠️ NİYE ŞART: kill sayacı pet bağlamanın "parayla alınamaz" koşulu
 * (bkz. pets.ts BIND). İstemci "999.999 brute öldürdüm" diyebilseydi bütün
 * legendary pet'ler ilk koşuda açılır ve o koşul kâğıt üzerinde kalırdı.
 *
 * ⚠️ `maxRareGold` ile AYNI DESEN: koşuyu yeniden simüle etmiyoruz (DoS
 * yüzeyi), "en fazla ne mümkündü" sorusunu kapalı formda cevaplıyoruz.
 * Burada tavan daha da net çünkü düşman sayısı sabit — şansa bağlı değil.
 */
export function maxKills(
  mode: string, stageId: number, deepestCleared: number, ascension = 0,
): number {
  const st = stageById(stageId);
  if (!st) return 0;
  if (mode === 'campaign') return st.enemyCount + (st.boss ? 1 : 0);

  let toplam = 0;
  const top = Math.max(0, Math.floor(deepestCleared)) + 1;
  for (let d = 1; d <= top; d++) {
    const def = descentStage(stageId, d, ascension);
    toplam += def.enemyCount + (def.boss ? 1 : 0);
  }
  return toplam;
}

/**
 * Koşunun tip bazlı öldürme sayacını ilerlemeye EKLE.
 *
 * ⚠️ TOPLAM `maxKills` İLE KIRPILIYOR — tek tip için değil, hepsinin
 * toplamı için. Tip başına kırpmak yetmezdi: 20 tipin her birine tavan
 * kadar yazan bir yalancı 20 kat kazanırdı.
 *
 * ⚠️ KIRPMA ORANTILI, kesme DEĞİL. Sadece fazlasını atsaydık yalancı yine
 * tavana kadar dolu alırdı; orantılı küçültme iddiayı geçerli bir koşunun
 * ölçeğine indiriyor ve dürüst oyuncuya hiç dokunmuyor (onun toplamı zaten
 * tavanın altında).
 */
export function applyKills(
  before: Record<string, number>,
  claim: unknown,
  cap: number,
): Record<string, number> {
  if (!claim || typeof claim !== 'object') return before;
  const gelen: Record<string, number> = {};
  let toplam = 0;
  for (const [k, v] of Object.entries(claim as Record<string, unknown>)) {
    const n = Math.floor(Number(v));
    if (!Number.isFinite(n) || n <= 0) continue;
    // ⚠️ Boss `typeId: 'boss'` ile geliyor ve hiçbir pet ondan bağlanmıyor —
    // taşımak zararsız, ayrı bir dal açmak sadece istisna yaratırdı.
    gelen[k] = n;
    toplam += n;
  }
  if (toplam <= 0) return before;

  const oran = toplam > cap ? cap / toplam : 1;
  const out = { ...before };
  for (const [k, v] of Object.entries(gelen)) {
    const eklenecek = Math.floor(v * oran);
    if (eklenecek > 0) out[k] = (out[k] ?? 0) + eklenecek;
  }
  return out;
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
  /**
   * ⚠️ ASCENSION KADEMESİ — Run kaydından, istemciden DEĞİL.
   *
   * Tavan bunu saymak ZORUNDA: ascension düşüş MİKTARINI çarpıyor, saymazsak
   * zoru seçen DÜRÜST oyuncu kırpılır. Bu sessiz bir hatadır — kimse "gold'um
   * eksik geldi" diye şikâyet etmez, oyun sadece cimri hissettirir.
   *
   * ⚠️ Sunucu bunu Run'dan okuduğu için yalancıya kapı açmıyor: iddia edilen
   * kademe değil, `/run/start`'ta doğrulanıp kaydedilen kademe kullanılıyor.
   */
  ascension = 0,
  /**
   * ⚠️ SÜRE — koşunun GERÇEKTEN ne kadar sürdüğü (sunucu saati).
   *
   * 🔴 NİYE EKLENDİ: bu fonksiyon yalnız İDDİA EDİLEN derinliğe bakıyordu ve
   * descent dalında `top = deepestCleared + 1` yazıyor — yani `deepestCleared:0`
   * gönderen SIFIR SANİYELİK bir koşu bile derinlik 1'in tam havuzunu
   * alıyordu. Üstüne `headroom()` koşulsuz `MIN_DROP_HEADROOM = 5` taban
   * ekliyor, `dropMax` ile çarpılıyor.
   *
   * ÖLÇÜLDÜ: taze hesap ~142 gold/koşu × 900 koşu/saat (hız sınırının izin
   * verdiği) = **~128.000 gold/saat**, dürüst oyunun ~21 katı. Forge ağacının
   * tamamı ~2 saatte. Ve `capped` yanmıyordu — koşu TEMİZ görünüyordu.
   *
   * ⚠️ `acceptDepth` bu deliği kapatmıyor: derinlik 0 iddiası zaten
   * doğru, kırpılacak bir şey yok. Delik `+1` payında.
   */
  elapsedSec = Infinity,
): number {
  const st = stageById(stageId);
  if (!st) return 0;

  const g = Math.max(1, greedMul) * ascensionDropMul(ascension);
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
    // ⚠️ Ascension düşman SAYISINI da artırıyor; tavan onu da saymalı.
    const def = descentStage(stageId, d, ascension);
    const kills = def.enemyCount + (def.boss ? 1 : 0);
    expected += kills * rareDropChance(d);
    if (def.boss) bosses += 1;
  }
  // En derin seviyenin miktar tavanı — hepsi oradan düşmüş gibi say
  const ham = Math.ceil(headroom(expected) * dropMax(top)) + bosses * CHEST_ALLOWANCE;

  // ⚠️ SÜRE ORANI — `+1` payının bedeli. İçinde bulunulan (bitmemiş) derinliğin
  // tamamını saymak dürüst oyuncu için doğru; ama hiç oynamamış bir koşu için
  // bedava gold demek. Oran, o derinlikte GERÇEKTEN geçirilen sürenin payı:
  // sıfır saniye → sıfır pay, tam süre → bugünküyle birebir aynı.
  // Dürüst koşu her zaman 1'de kalır (derin koşularda `elapsedSec` çok büyük).
  if (!Number.isFinite(elapsedSec)) return ham;
  const birDerinlikSn = (descentStage(stageId, top, ascension).enemyCount
    / descentStage(stageId, top, ascension).spawnRate) * TIME_SAFETY;
  const oran = birDerinlikSn > 0 ? Math.min(1, Math.max(0, elapsedSec) / birDerinlikSn) : 1;
  return Math.ceil(ham * oran);
}

/**
 * BÖLÜM TEMİZLEME İDDİASI — kampanyanın süre tabanı.
 *
 * 🔴 NİYE VAR: `cleared` DOĞRULANMAYAN bir istemci boolean'ıydı. `acceptDepth`
 * derinlik iddiasını fizikle kesiyor ama o kontrol `mode !== 'campaign'` ile
 * başlıyor — yani kampanyanın hiçbir alt sınırı yoktu.
 *
 * SÖMÜRÜ (ölçüldü): `POST /run/start {mode:'campaign', stageId:N}` ardından
 * `POST /run/finish {cleared:true}`. İki istek, sıfır saniye. Merdiven sıralı
 * olduğu için ~20 istekte TÜM kampanya biter. Zarar iki katmanlı:
 *   1. Her bölümün `firstClearGold`u alınır (~81.600 gold, Forge ağacının %32'si)
 *   2. ⭐ ASIL ZARAR: `cleared[stageId]` descent'in kapısı (`canStart`) —
 *      taze bir hesap anında bölüm 10 descent'ine ve Wilderness ekipman
 *      musluğuna girer. Bölüm 10 derinlik ödülü bölüm 1'in 2,35 katı.
 * Üstelik `capped` yanmadığı için admin panelinde koşu TEMİZ görünüyordu.
 *
 * ⚠️ TABAN MOTORUN KENDİ SAYISINDAN türüyor, uydurma bir sabit değil:
 * `enemyCount / spawnRate` — `minDescentSeconds` ile AYNI formül, aynı
 * `TIME_SAFETY` payı. Arayüzdeki "MIN 1m 15s" etiketi de bu sayı.
 */
export function acceptCleared(
  mode: string, stageId: number, claimed: unknown, elapsedSec: number,
): { cleared: boolean; capped: boolean; reason: string[] } {
  const reason: string[] = [];
  if (mode !== 'campaign' || !claimed) return { cleared: false, capped: false, reason };

  const st = stageById(stageId);
  if (!st) return { cleared: false, capped: false, reason };

  // Süre bilinmiyorsa (saf hesaplar, testler) sınır uygulanmaz —
  // `maxDepthInTime` ile aynı duruş.
  if (!Number.isFinite(elapsedSec)) return { cleared: true, capped: false, reason };

  const taban = (st.enemyCount / st.spawnRate) * TIME_SAFETY;
  if (elapsedSec < taban) {
    reason.push(
      `bölüm ${stageId} temizlendi iddiası → ${Math.round(elapsedSec)} sn, `
      + `en az ${Math.round(taban)} sn gerekiyor`,
    );
    return { cleared: false, capped: true, reason };
  }
  return { cleared: true, capped: false, reason };
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

/**
 * DERİNLİK İDDİASINI KABUL EDİLEBİLİR HÂLE KIRP.
 *
 * `settleRun`'ın içinden çıkarıldı çünkü ikinci bir çağıran doğdu:
 * The Wilderness gold ödemiyor ama ekipmanı DERİNLİĞE göre veriyor, yani
 * aynı kırpmaya ihtiyacı var. İki yerde iki kırpma yazmak, er ya da geç
 * birinin gevşemesi demekti — ve gevşeyen taraf bedava ekipman basardı.
 */
export function acceptDepth(
  mode: string, stageId: number, claimed: unknown, elapsedSec: number, startDepth: number,
): { depth: number; capped: boolean; reason: string[] } {
  const reason: string[] = [];
  let capped = false;
  let depth = Math.max(0, Math.floor(Number(claimed) || 0));
  if (depth > MAX_DEPTH_CLAIM) {
    depth = MAX_DEPTH_CLAIM;
    capped = true;
    reason.push(`derinlik iddiası ${claimed} → ${MAX_DEPTH_CLAIM}`);
  }
  // Süre tabanı — mutlak tavandan çok daha keskin bir sınır.
  // ⚠️ Wilderness de derinliğe dayanıyor, o yüzden burada da geçerli.
  if (mode !== 'campaign' && depth > 0) {
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
  return { depth, capped, reason };
}

export interface Settlement {
  progress: Progress;
  awarded: number;
  progressGold: number;
  dropGold: number;
  /** `dropGold`'un kaçı hafta sonu etkinliğinden geldi — koşu sonu dökümü */
  eventGold: number;
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
  /**
   * Ascension kademesi. ⚠️ Run kaydından gelir, istemciden değil.
   * Hem düşüş tavanını hem sıralama puanını etkiliyor.
   */
  ascension = 0,
  /**
   * Hafta sonu etkinliğinin nadir düşüş çarpanı (bkz. `@game/events`).
   *
   * ⚠️ KOŞUNUN BAŞLANGIÇ ANINDAN çözülür, kapanış anından değil — çağrı
   * yeri `eventMul(run.startedAt, 'dropGold')` gönderiyor.
   *
   * ⚠️ SADECE `dropGold`'a dokunuyor. `progressGold` bilerek dışarıda:
   * o her derinlik için BİR KEZ ödenen bir ödül ve çarpılsaydı oyuncuya
   * "ilerlemeyi hafta sonuna sakla" derdi. Bir etkinliğin oyuncuyu Cuma
   * günü OYNAMAMAYA teşvik etmesi, kendi amacını yenerdi.
   */
  eventDropMul = 1,
): Settlement {
  const reason: string[] = [];
  let capped = false;

  // 1) Derinlik iddiası — kırpma `acceptDepth`'te (Wilderness de onu kullanıyor)
  const kabul = acceptDepth(mode, stageId, claim.deepestCleared, elapsedSec, startDepth);
  const depth = kabul.depth;
  if (kabul.capped) capped = true;
  reason.push(...kabul.reason);

  // 1b) Bölüm temizleme iddiası — kampanyanın süre tabanı (bkz. acceptCleared)
  const temiz = acceptCleared(mode, stageId, claim.cleared, elapsedSec);
  if (temiz.capped) capped = true;
  reason.push(...temiz.reason);

  // 2) Nadir düşüş iddiası — yapısal tavana kırp
  const rawGold = Math.max(0, Math.floor(Number(claim.rareGold) || 0));
  const goldCap = maxRareGold(mode, stageId, depth, greedCeiling(before), ascension, elapsedSec);
  let rareGold = rawGold;
  if (rareGold > goldCap) {
    rareGold = goldCap;
    capped = true;
    reason.push(`nadir gold ${rawGold} → tavan ${goldCap}`);
  }

  // 2b) Etkinlik çarpanı — ⚠️ TAVANDAN SONRA.
  // Tavan iddianın MEŞRULUĞUNU ölçüyor (oyuncunun gerçek greed'ine bağlı);
  // etkinlik ise doğrulanmış bir ödemeyi büyütüyor. Ters sırada tavan bonusu
  // yerdi ve etkinlik hiçbir şey yapmazdı. Ayrıca `capped` bayrağı burada
  // DEĞİŞMİYOR: bonus bir kırpma değil, koşu şüpheli sayılmamalı.
  const eventMul = Number.isFinite(eventDropMul) ? Math.max(1, eventDropMul) : 1;
  const eventGold = eventMul > 1 ? Math.floor(rareGold * eventMul) - rareGold : 0;
  rareGold += eventGold;

  // 3) Bölüm gerçekten açık mı — kilitli bölümden ödül alınamaz
  if (stageId > before.unlockedStage) {
    reason.push(`kilitli bölüm ${stageId} (açık: ${before.unlockedStage})`);
    return {
      progress: before, awarded: 0, progressGold: 0, dropGold: 0, eventGold: 0,
      capped: true, reason,
    };
  }

  // 4) Ödülü OYUNUN KENDİ fonksiyonu hesaplasın — exploit kapısı orada
  const run: RunResult = {
    mode, stageId,
    cleared: temiz.cleared,
    deepestCleared: depth,
    rareGold,
  };
  const r = applyRunResult(before, run);

  return {
    progress: r.progress,
    awarded: r.awarded,
    progressGold: r.progressGold,
    dropGold: r.dropGold,
    eventGold,
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

/**
 * İzin verilen ascension kademesi — istemcinin isteği BURADA kırpılır.
 *
 * ⚠️ Kilidi oyuncunun ULAŞTIĞI derinlik açıyor (`paidDepth`), iddia ettiği
 * değil: `paidDepth` sunucunun ödediği, yani zaten doğrulanmış derinlik.
 * Kırpma sessiz — hata dönmek yerine en yüksek izinli kademeye indiriyoruz;
 * arayüz zaten sadece açık kademeleri gösteriyor, buraya gelen bir fazlalık
 * ya eski bir sekme ya da elle atılmış bir istek.
 */
export function resolveAscension(p: Progress, mode: string, stageId: number, wanted: unknown): number {
  if (mode !== 'descent') return 0;
  const w = Math.max(0, Math.min(ASCENSION.max, Math.floor(Number(wanted) || 0)));
  // Oyuncunun HERHANGİ bir bölümde ulaştığı en derin nokta kilidi açar:
  // kademe bölüme değil oyuncunun becerisine bağlı bir seçim.
  const enDerin = STAGES.reduce((m, st) => Math.max(m, Number(p.depthPaid[st.id] ?? 0)), 0);
  return Math.min(w, maxAscensionFor(enDerin));
}

/** Koşu başlatılabilir mi (bölüm açık mı, descent/wilderness için bölüm geçilmiş mi) */
export function canStart(p: Progress, mode: string, stageId: number): string | null {
  if (!stageById(stageId)) return 'bilinmeyen bölüm';
  if (stageId > p.unlockedStage) return 'bölüm kilitli';
  // ⚠️ Wilderness motoru DESCENT olarak çalıştırıyor (bkz. gear.ts başlığı) —
  // giriş şartı da descent'in aynısı.
  if (mode !== 'campaign' && !p.cleared[stageId]) return 'önce bölümü temizle';
  if (mode !== 'campaign' && mode !== 'descent' && mode !== 'wilderness') return 'bilinmeyen mod';
  return null;
}

export { STAGES };
