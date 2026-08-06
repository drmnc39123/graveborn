// GRAVEBORN — oyun dengesi. TÜM ayar sayıları burada, kod içine gömülmez.
// Denge değişikliği = sadece bu dosya. Motor bu sabitleri okur, kendi sayısı yoktur.

export const TICK = 1 / 60; // sabit timestep — simülasyon 60Hz, render ayrı
export const MAX_CATCHUP = 5; // bir frame'de en fazla 5 tick (sekme arka plana gidince donma olmasın)

/**
 * SİMÜLASYON SÜRÜMÜ — RNG akışını değiştiren her değişiklikte ARTAR.
 *
 * ⚠️ Aynı seed'in aynı koşuyu üretmesi sunucu ödül doğrulamasının temeli
 * (backend `settleRun` bu motoru çalıştırıyor). Bir `rng.next()` çağrısı
 * eklemek/çıkarmak/yerini değiştirmek TÜM eski seed'leri geçersiz kılar.
 * Böyle bir değişiklik yaparken:
 *   1. bu sayıyı artır,
 *   2. `sim.test.mts`'teki SIM_SEAL mührünü yeniden hesapla,
 *   3. günlük seed / leaderboard kayıtlarının sürümle etiketlendiğini doğrula.
 */
// v2: kritik vuruş eklendi — `damageEnemy` her çağrıda `rng.next()` tüketiyor.
// Bu TÜM eski seed'leri geçersiz kıldı (bilinçli; oyun henüz canlı değildi).
// v3: 16 düşmanın 12'sine gerçek davranış verildi (+`swarm` +`circler`).
// Bu bir rng değişikliği DEĞİL — düşmanlar farklı yürüdüğü için farklı
// zamanlarda ölüyor, akış aynı kalsa da sonuç kayıyor. Mühür yine de yenilendi.
export const SIM_VERSION = 3;

export const RUN = {
  /** Güvenlik tavanı — bölüm bitmese bile run bu sürede kapanır (takılma koruması) */
  durationSec: 30 * 60,
  arenaRadius: 2400, // oyuncu bu daireden çıkamaz (sonsuz kaçışı engeller)
} as const;

// ── BÖLÜMLER ──────────────────────────────────────────────────────────
// TASARIM KARARI: sonsuz koşu DEĞİL, bitirilebilir bölümler.
// Her bölümde SABİT sayıda düşman var; hepsi ölünce bölüm biter.
// Bu hem oyunu VS klonlarından ayırıyor hem de sonsuz spawn'daki denge
// uçurumunu ortadan kaldırıyor (sürü duvara dönüşüp DPS'i boğamıyor).
//
// EKONOMİ KURALI — "İLERLEME ÖDER, TEKRAR ÖDEMEZ":
// Bir bölümü/derinliği İLK kez geçmek tam ödül verir; zaten geçilmiş içeriği
// tekrar oynamak ilerleme ödülünden 0 verir. Böylece kolay bölümü sonsuz
// tekrarlayıp gold basmak imkânsız.
//
// Ama bu TEK BAŞINA yetmiyor: beceri tavanına çarpmış oyuncu sıfır kazanır ve
// oyunun 2. günü kalmaz. O yüzden musluk iki parçalı — ikinci parça NADİR
// DÜŞÜŞ (bkz. rareDropChance). Kintara modeli: gold kill başına maaş değil,
// nadir düşüştür (orada en iyi kaynak 100 kill'de 1). Kısıt tavan değil
// NADİRLİK + BECERİ (derinlikte hpMul üssel büyür).
export interface StageDef {
  id: number;
  name: string;
  /** Bu bölümde toplam kaç düşman gelecek — hepsi ölünce bölüm biter */
  enemyCount: number;
  /** Bölümü İLK kez temiz geçmenin ödülü. Bir kez ödenir, tekrarında 0. */
  firstClearGold: number;
  /** Saniyede kaç düşman salınır */
  spawnRate: number;
  /** Aynı anda sahnede en fazla kaç düşman */
  maxAlive: number;
  /** Düşman havuzu — bu bölümde hangi tipler çıkar */
  enemies: string[];
  /** Düşman can/hız çarpanı (bölüm zorluğu) */
  hpMul: number;
  speedMul: number;
  /**
   * Düşman HASAR çarpanı — YOKSA 1.
   *
   * ⚠️ NİYE SONRADAN EKLENDİ: ölçüldü, derinlik hasarı hiç ölçeklemiyordu.
   * Can ve hız büyüyor, hasar sabit kalıyordu; oyuncunun canı ve zırhı ise
   * Forge'la büyüdüğü için DERİNE İNDİKÇE DAHA GÜVENLİ oluyordu. Sonuç:
   * 21 koşunun 21'i ölümle değil 30 dakika tavanıyla bitiyordu — "duvar HP
   * değil takvim" sorunu tam olarak buradan geliyordu.
   *
   * ⚠️ Kampanya bölümleri bu alanı YAZMIYOR (1 kalıyor) — eski dengeleri ve
   * SIM_SEAL mührü bit bit korunuyor.
   */
  damageMul?: number;
  /** Bölüm sonunda boss gelir mi (kalan düşman 0'a inince) */
  boss?: { hp: number; speed: number; damage: number; radius: number; art: string; label: string };
}

export const STAGES: readonly StageDef[] = [
  {
    id: 1, name: 'The Hollow Wood', enemyCount: 100, firstClearGold: 300,
    spawnRate: 1.6, maxAlive: 40, enemies: ['imp', 'rogue'], hpMul: 1, speedMul: 1,
  },
  {
    id: 2, name: 'Ossuary Halls', enemyCount: 200, firstClearGold: 700,
    spawnRate: 2.2, maxAlive: 60, enemies: ['imp', 'rogue', 'skeleton', 'wretch'],
    hpMul: 1.35, speedMul: 1.04,
  },
  {
    id: 3, name: 'The Charnel Works', enemyCount: 350, firstClearGold: 1400,
    spawnRate: 3.0, maxAlive: 90, enemies: ['skeleton', 'wretch', 'horned', 'bird'],
    hpMul: 1.9, speedMul: 1.08,
    boss: { hp: 4200, speed: 44, damage: 24, radius: 38, art: 'boss_mini', label: 'The Gorged' },
  },
  {
    id: 4, name: 'The Toll Tower', enemyCount: 550, firstClearGold: 2400,
    spawnRate: 3.8, maxAlive: 130, enemies: ['horned', 'bird', 'brute', 'fiend'],
    hpMul: 2.7, speedMul: 1.12,
    boss: { hp: 11000, speed: 48, damage: 30, radius: 44, art: 'boss_mega', label: 'Bell Warden' },
  },
  {
    id: 5, name: 'The Black Chapel', enemyCount: 800, firstClearGold: 4000,
    spawnRate: 4.6, maxAlive: 180, enemies: ['brute', 'fiend', 'crab', 'warrior', 'hulk'],
    hpMul: 3.8, speedMul: 1.16,
    boss: { hp: 30000, speed: 54, damage: 38, radius: 52, art: 'boss_nightmare', label: 'The Unburied' },
  },
  // ── GEÇ KAMPANYA ──
  // Buradan itibaren HER bölümde boss var: kampanyanın ikinci yarısı artık
  // "daha çok düşman" değil, her seferinde bir final. Düşman havuzu da
  // undead/vermin'e kayıyor — sürü görsel olarak da değişiyor.
  {
    id: 6, name: 'The Sunken Ossuary', enemyCount: 900, firstClearGold: 4200,
    spawnRate: 5.4, maxAlive: 220, enemies: ['fiend', 'crab', 'rat', 'dire_rat', 'warrior'],
    hpMul: 4.2, speedMul: 1.2, damageMul: 1.2,
    boss: { hp: 107_000, speed: 50, damage: 44, radius: 54, art: 'boss_mega', label: 'The Drowned Choir' },
  },
  {
    id: 7, name: 'Gallows Reach', enemyCount: 950, firstClearGold: 4500,
    spawnRate: 6.0, maxAlive: 260, enemies: ['dire_rat', 'warrior', 'hulk', 'bone_thrall'],
    hpMul: 4.4, speedMul: 1.24, damageMul: 1.35,
    boss: { hp: 113_000, speed: 52, damage: 50, radius: 56, art: 'boss_nightmare', label: 'The Hanged Warden' },
  },
  {
    id: 8, name: 'The Bone Choir', enemyCount: 1000, firstClearGold: 4900,
    spawnRate: 6.7, maxAlive: 300, enemies: ['bone_thrall', 'bone_archer', 'hulk', 'crab'],
    hpMul: 4.6, speedMul: 1.28, damageMul: 1.5,
    boss: { hp: 119_000, speed: 54, damage: 58, radius: 58, art: 'boss_mega', label: 'The Choirmaster' },
  },
  {
    id: 9, name: 'The Iron Vigil', enemyCount: 1000, firstClearGold: 5300,
    spawnRate: 7.4, maxAlive: 350, enemies: ['grave_knight', 'bone_archer', 'warrior', 'hulk'],
    hpMul: 4.8, speedMul: 1.32, damageMul: 1.7,
    boss: { hp: 125_000, speed: 56, damage: 66, radius: 60, art: 'boss_nightmare', label: 'The Iron Vigil' },
  },
  {
    id: 10, name: 'The Last Barrow', enemyCount: 1050, firstClearGold: 5700,
    spawnRate: 8.0, maxAlive: 420, enemies: ['grave_knight', 'bone_archer', 'bone_thrall', 'hulk', 'fiend'],
    hpMul: 5.0, speedMul: 1.36, damageMul: 1.9,
    boss: { hp: 130_000, speed: 58, damage: 76, radius: 66, art: 'boss_nightmare', label: 'The First Graveborn' },
  },

  // ══ İKİNCİ KİTAP: 11-25 ═══════════════════════════════════════════════
  //
  // ⚠️ DÜŞMAN SAYISI BÜYÜTÜLMÜYOR — tercih değil, ÖLÇÜM SONUCU.
  //
  // Sürdürülebilir öldürme hızı ölçüldü: ~2,0-2,7 düşman/sn. Bölüm 10'un
  // ESKİ 3.400 düşmanı bu hızda 28 DAKİKA demekti. `campaign.test.mts`
  // bunu yakaladı: bölüm 6'dan itibaren HİÇBİRİ bitmiyordu — yani sorun
  // yeni bölümlerden ÖNCE de vardı ve hiç fark edilmemişti (eski testler
  // yalnızca ilk 3 bölümü kontrol ediyordu).
  // Sayılar bitirilebilir olacak şekilde yeniden hesaplandı: ~5-11 dakika.
  //
  // ⚠️ CAN ÇARPANI DA KIRPILDI. İlk denemede 25. bölüm hpMul 330'du; ölçüm
  // oyuncunun SANİYEDE 0,1 düşman öldürdüğünü gösterdi. Bu duvar değil
  // İMKÂNSIZLIK: Forge tavanlı, oyuncunun hasarı 330 kat büyüyemiyor.
  // Aynı ders bugün Descent'te de öğrenildi — koşuyu bitiren şey canı değil
  // HASARI büyütmek. Zorluk artık `damageMul`'da taşınıyor (1,5 → 7,0).
  //
  // ⚠️ `maxAlive` 420'de SABİT — bu bir perf tavanı, tercih değil
  // (sim.test.mts tick bütçesini orada ölçüyor). Zorluk sahnedeki düşman
  // SAYISINDAN değil, canından ve HASARINDAN geliyor.
  //
  // Yani ikinci kitabın bölümleri KISA ve SERT: 4-8 dakika, her biri kendi
  // sürüsü ve kendi boss'uyla. Amaç kampanyayı ~1,5 saatten ~5 saate çıkarmak.
  {
    id: 11, name: 'The Weeping Steps', enemyCount: 1050, firstClearGold: 6200,
    spawnRate: 7.0, maxAlive: 300, enemies: ['bone_archer', 'grave_knight', 'rat', 'dire_rat'],
    hpMul: 5.2, speedMul: 1.38, damageMul: 2.2,
    boss: { hp: 136_000, speed: 56, damage: 84, radius: 60, art: 'boss_mega', label: 'The Stair Widow' },
  },
  {
    id: 12, name: 'Ashfall Reach', enemyCount: 1100, firstClearGold: 6700,
    spawnRate: 7.2, maxAlive: 320, enemies: ['brute', 'hulk', 'horned', 'warrior'],
    hpMul: 5.4, speedMul: 1.40, damageMul: 2.5,
    boss: { hp: 142_000, speed: 54, damage: 92, radius: 68, art: 'boss_nightmare', label: 'Cinder Warden' },
  },
  {
    id: 13, name: 'The Drowned Gate', enemyCount: 1100, firstClearGold: 7200,
    spawnRate: 7.4, maxAlive: 340, enemies: ['crab', 'fiend', 'bone_thrall', 'wretch'],
    hpMul: 5.5, speedMul: 1.42, damageMul: 2.8,
    boss: { hp: 148_000, speed: 58, damage: 100, radius: 62, art: 'boss_mega', label: 'The Gatekeeper' },
  },
  {
    id: 14, name: 'Hollow King\'s Court', enemyCount: 1150, firstClearGold: 7800,
    spawnRate: 7.6, maxAlive: 350, enemies: ['grave_knight', 'warrior', 'bone_archer', 'skeleton'],
    hpMul: 5.7, speedMul: 1.44, damageMul: 3.1,
    boss: { hp: 154_000, speed: 60, damage: 110, radius: 70, art: 'boss_nightmare', label: 'The Hollow King' },
  },
  {
    id: 15, name: 'The Rat Cathedral', enemyCount: 1150, firstClearGold: 8400,
    spawnRate: 8.0, maxAlive: 380, enemies: ['rat', 'dire_rat', 'wretch', 'imp'],
    hpMul: 5.8, speedMul: 1.46, damageMul: 3.4,
    boss: { hp: 160_000, speed: 64, damage: 118, radius: 58, art: 'boss_mini', label: 'The Litter Mother' },
  },
  {
    id: 16, name: 'Emberglass Wastes', enemyCount: 1200, firstClearGold: 9100,
    spawnRate: 8.0, maxAlive: 390, enemies: ['fiend', 'horned', 'bird', 'brute'],
    hpMul: 6.0, speedMul: 1.48, damageMul: 3.8,
    boss: { hp: 166_000, speed: 62, damage: 128, radius: 66, art: 'boss_mega', label: 'Glasswalker' },
  },
  {
    id: 17, name: 'The Sunless Vault', enemyCount: 1200, firstClearGold: 9800,
    spawnRate: 8.0, maxAlive: 400, enemies: ['bone_thrall', 'bone_archer', 'grave_knight', 'hulk'],
    hpMul: 6.1, speedMul: 1.50, damageMul: 4.2,
    boss: { hp: 171_000, speed: 60, damage: 140, radius: 72, art: 'boss_nightmare', label: 'The Vaultkeeper' },
  },
  {
    id: 18, name: 'Carrionfield', enemyCount: 1250, firstClearGold: 10600,
    spawnRate: 8.0, maxAlive: 410, enemies: ['bird', 'crab', 'rogue', 'wretch', 'rat'],
    hpMul: 6.3, speedMul: 1.52, damageMul: 4.6,
    boss: { hp: 177_000, speed: 66, damage: 152, radius: 60, art: 'boss_mini', label: 'The Carrion Choir' },
  },
  {
    id: 19, name: 'The Iron Throat', enemyCount: 1250, firstClearGold: 11400,
    spawnRate: 8.0, maxAlive: 420, enemies: ['warrior', 'grave_knight', 'hulk', 'brute'],
    hpMul: 6.4, speedMul: 1.54, damageMul: 5.0,
    boss: { hp: 183_000, speed: 62, damage: 166, radius: 74, art: 'boss_nightmare', label: 'Throat of Iron' },
  },
  {
    id: 20, name: 'The Pale Procession', enemyCount: 1300, firstClearGold: 12300,
    spawnRate: 8.0, maxAlive: 420, enemies: ['skeleton', 'bone_thrall', 'bone_archer', 'grave_knight'],
    hpMul: 6.6, speedMul: 1.56, damageMul: 5.4,
    boss: { hp: 189_000, speed: 64, damage: 182, radius: 68, art: 'boss_mega', label: 'The Pale Marshal' },
  },
  {
    id: 21, name: 'Where the Wood Ends', enemyCount: 1300, firstClearGold: 13300,
    spawnRate: 8.0, maxAlive: 420, enemies: ['imp', 'rogue', 'bird', 'fiend', 'dire_rat'],
    hpMul: 6.7, speedMul: 1.58, damageMul: 5.8,
    boss: { hp: 195_000, speed: 68, damage: 200, radius: 64, art: 'boss_mini', label: 'The Last Root' },
  },
  {
    id: 22, name: 'The Ossuary Deep', enemyCount: 1350, firstClearGold: 14400,
    spawnRate: 8.0, maxAlive: 420, enemies: ['bone_thrall', 'skeleton', 'grave_knight', 'bone_archer', 'hulk'],
    hpMul: 6.9, speedMul: 1.60, damageMul: 6.2,
    boss: { hp: 201_000, speed: 66, damage: 220, radius: 76, art: 'boss_nightmare', label: 'Marrowmind' },
  },
  {
    id: 23, name: 'The Furnace Below', enemyCount: 1350, firstClearGold: 15500,
    spawnRate: 8.0, maxAlive: 420, enemies: ['brute', 'hulk', 'horned', 'crab', 'warrior'],
    hpMul: 7.0, speedMul: 1.62, damageMul: 6.5,
    boss: { hp: 207_000, speed: 64, damage: 242, radius: 78, art: 'boss_mega', label: 'The Bellows' },
  },
  {
    id: 24, name: 'The Widow\'s Vigil', enemyCount: 1400, firstClearGold: 16800,
    spawnRate: 8.0, maxAlive: 420, enemies: ['grave_knight', 'bone_archer', 'warrior', 'fiend', 'bone_thrall'],
    hpMul: 7.2, speedMul: 1.64, damageMul: 6.8,
    boss: { hp: 212_000, speed: 68, damage: 266, radius: 72, art: 'boss_nightmare', label: 'She Who Waited' },
  },
  {
    id: 25, name: 'The Grave of Graves', enemyCount: 1400, firstClearGold: 18100,
    spawnRate: 8.0, maxAlive: 420,
    enemies: ['grave_knight', 'hulk', 'bone_archer', 'bone_thrall', 'fiend', 'warrior'],
    hpMul: 7.4, speedMul: 1.66, damageMul: 7.2,
    boss: { hp: 218_000, speed: 70, damage: 292, radius: 84, art: 'boss_nightmare', label: 'GRAVEBORN' },
  },
] as const;

export function stageById(id: number): StageDef | undefined {
  return STAGES.find((s) => s.id === id);
}

// ── THE DESCENT ───────────────────────────────────────────────────────
// Bölüm temizlendikten sonra açılan SONSUZ derinlik merdiveni. Kampanya
// tek seferlik tüketim; oyunun ömrü burada.
//
// Koşuyu bitiren şey zamanlayıcı DEĞİL, CAN: derinlikler arası HP dolmaz.
// Ne kadar derine inebildiğin tamamen ne kadar hasar yemeden oynadığına bağlı.
/**
 * BOSS DAVRANIŞI.
 *
 * ⚠️ KIRMIZI ÇİZGİ: BOSS'UN HİÇBİR FAZI MESAFE TUTMAZ. Boss sahnedeki TEK
 * düşmanken kiting yaparsa bölüm sonsuza kadar bitmez — bu tuzağa bir kez
 * düşüldü (Ossuary Halls, 25 dakika, hiç bitmedi). Saldırılar DURARAK
 * yapılır (telegraf zaten bir duruş); hareket her zaman kovalamadır.
 *
 * ⚠️ Saldırı seçimi RNG KULLANMAZ — sırayla döner. Hem determinizm hem
 * okunabilirlik: oyuncu kalıbı öğrenebilmeli, zar atılırsa öğrenilecek bir
 * şey kalmaz.
 */
export const BOSS = {
  /** giriş: dokunulmaz, hareketsiz, isim kartı görünür */
  introSec: 2.0,
  /** tehlike alanı görünür ama henüz vurmuyor — kaçma penceresi */
  telegraphSec: 0.9,
  /** saldırılar arası bekleme (faz 1'de kısalır) */
  atkCd: 4.2,
  /** yer darbesi: yarıçap ve hasar çarpanı */
  slamRadius: 190,
  slamDamageMul: 1.5,
  /** HP bu oranın altına inince 2. faza geçer */
  phase2At: 0.5,
  /** 2. fazda hız ve saldırı sıklığı çarpanı */
  phase2Speed: 1.22,
  phase2Cd: 0.68,
} as const;

export const DESCENT = {
  /** derinlik d'de gelen düşman sayısı: base + perDepth·d */
  enemyBase: 60,
  enemyPerDepth: 10,
  /** düşman canı derinlik başına bu kadar katlanır (üssel — beceri kapısı budur) */
  hpGrowth: 1.16,
  /**
   * Derinlik başına HASAR büyümesi.
   * ⚠️ Candan BELİRGİN YAVAŞ (1.16 vs 1.055) ve bu kasıtlı: can "ne kadar
   * sürer", hasar "ne kadar tehlikeli" eksenidir. İkisini aynı hızda
   * büyütmek koşuyu birkaç derinlikte bitirirdi.
   */
  damageGrowth: 1.05,
  speedPerDepth: 0.012,
  speedMax: 1.9,
  spawnPerDepth: 0.12,
  spawnMax: 9,
  alivePerDepth: 6,
  /** perf tavanı — sahnede bundan fazla düşman olmaz */
  aliveMax: 420,
  /** kaç derinlikte bir boss */
  bossEvery: 5,
  /** boss gücü her boss basamağında bu kadar katlanır */
  bossGrowth: 1.35,
  /** her 3 derinlikte havuza bir düşman tipi daha eklenir */
  poolEvery: 3,

  /**
   * CHECKPOINT'TEN BAŞLARKEN VERİLEN SEVİYE — `startLevelFor` bunu kullanır.
   *
   * Uydurma değil ÖLÇÜM: `curve.test.mts` dürüst bir inişte oyuncunun her
   * derinlikte kaçıncı seviyede olduğunu kaydediyor. Ölçülen medyan koşu:
   *   d1→LV3 · d5→LV8 · d10→LV12 · d15→LV17 · d17→LV18
   * Buna oturan doğru: LV ≈ 3 + 0,95·(d−1).
   *
   * ⚠️ KASITLI OLARAK BİRAZ CİMRİ (ölçülenin ~1 seviye altı). Checkpoint'ten
   * başlamak, o derinliğe kendi inmekten GÜÇLÜ olmamalı; yoksa oyuncu için
   * en kârlı strateji koşuyu baştan oynamak yerine hep checkpoint'ten
   * başlamak olurdu ve merdivenin ortası ölü içeriğe dönerdi.
   */
  startLevelBase: 3,
  startLevelPerDepth: 0.95,
} as const;

/**
 * CHECKPOINT — bir derinliğe kadar inmiş oyuncunun geri dönebileceği basamak.
 *
 * NEDEN VAR: descent her koşuda derinlik 1'den başlıyordu. d20'yi görmek
 * isteyen oyuncu d1..d19'u HER SEFERİNDE yeniden temizlemek zorundaydı ve
 * ölçüldü — koşunun %71'i zaten ödenmiş, ödül vermeyen derinliklerde geçiyordu.
 * Bu sadece can sıkıcı değil, ekonomiyi de kırıyordu: 30 dakikalık süre tavanı
 * oyuncuyu CAN'ından önce TAKVİM'den durduruyordu.
 *
 * Boss derinlikleri checkpoint: merdivenin zaten var olan ritmi, ayrı bir
 * kavram uydurmaya gerek yok.
 */
export function checkpointFor(depth: number): number {
  const d = Math.max(0, Math.floor(depth));
  return Math.floor(d / DESCENT.bossEvery) * DESCENT.bossEvery;
}

/**
 * Checkpoint'ten başlayan koşuya verilecek başlangıç seviyesi.
 *
 * Seviyeler HEDİYE EDİLMEZ, DRAFT EDİLİR: motor bunları bekleyen level-up
 * olarak kuyruğa alır, oyuncu kartları normal ekrandan kendi seçer. Böylece
 * "hazır build" verilmiş olmuyor — VS'in asıl keyfi olan seçim korunuyor.
 */
export function startLevelFor(startDepth: number): number {
  const d = Math.floor(startDepth);
  if (d <= 1) return 1;
  // Başlangıç derinliği d ise oyuncu (d−1)'i temizlemiş sayılır
  return Math.max(1, Math.round(DESCENT.startLevelBase + DESCENT.startLevelPerDepth * (d - 2)));
}

/**
 * ASCENSION — Forge doyduktan sonra ne yapacağın.
 *
 * NİYE VAR: ölçüldü — Forge yarıya geldiği anda 21 koşunun 21'i 30 dakika
 * tavanına çarpıyor. Yani koşuyu bitiren şey ÖLÜM DEĞİL SAAT. Oyuncu artık
 * ölmüyor, sadece sıkılana kadar iniyor. Zorluk, Forge'un satın alabildiğinin
 * ÖTESİNE ölçeklenmek zorunda.
 *
 * ⚠️ KAMPANYAYI "HARD MOD"DA TEKRAR OYNATMAK DEĞİL. Descent zaten sonsuz
 * zorluk merdiveni; ikinci bir merdiven aynı işi iki kez yapmak olurdu.
 * Ayrıca "ilerleme öder, tekrar ödemez" kuralı gereği tekrar edilen kampanya
 * ya sıfır öder (anlamsız) ya da öder (ikinci musluk = Faz 2'de kapatılan şey).
 *
 * ⚠️ ÖDÜLÜ GOLD'A BAĞLAMA. Zorluk katmanı asıl olarak SIRALAMA ödülü:
 * `challengeRating` ascension'ı sayıyor, yani "aynı derinlik ama daha zor"
 * tabloda üstte çıkıyor. Gold tarafında sadece ılımlı bir düşüş çarpanı var
 * ve zorluk çarpanının çok altında — yoksa yeni bir musluk açardık.
 *
 * ⚠️ 0. KADEME TAM OLARAK ESKİ OYUN. Hiçbir çarpan uygulanmıyor, tek bir
 * `rng` çağrısı bile değişmiyor; eski seed'ler ve SIM_SEAL geçerli kalıyor.
 */
export const ASCENSION = {
  /** en yüksek kademe */
  max: 10,
  /** kademe başına düşman canı çarpanı (bileşik) */
  hpPer: 1.32,
  /** kademe başına hız çarpanı — cana göre çok daha yumuşak, kaçış ölmesin */
  speedPer: 1.025,
  /** kademe başına düşman sayısı artışı */
  countPer: 0.07,
  /**
   * Kademe başına HASAR çarpanı.
   * ⚠️ Katmanın ASIL dişi bu. İlk sürümde sadece can/sayı ölçekleniyordu ve
   * ölçüm gösterdi: 10. kademede bile 9 koşunun 9'u yine SÜRE TAVANINA
   * çarpıyordu — oyuncu ölmüyor, sadece yavaşlıyordu. Zorluk katmanı
   * yavaşlatmamalı, ÖLDÜRMELİ.
   */
  damagePer: 1.08,
  /** kademe başına düşüş MİKTARI artışı (ihtimal DEĞİL) */
  dropPer: 0.19,
  /**
   * A kademesini açmak için gereken en derin iniş.
   * ⚠️ Kademe atlatma yok: 1. kademe d15'te, 10. kademe d60'ta açılır.
   * Amaç yeni oyuncunun "zoru seçip hızlı zenginleşmesini" engellemek değil
   * (zaten ölür) — seçeneğin ANLAMLI olduğu anda görünmesi.
   */
  unlockBase: 10,
  unlockPer: 5,
} as const;

/** A kademesi için gereken derinlik */
export function ascensionUnlockDepth(a: number): number {
  return ASCENSION.unlockBase + ASCENSION.unlockPer * Math.max(1, Math.floor(a));
}

/**
 * Oyuncunun ulaştığı derinlikle açılmış EN YÜKSEK kademe.
 * ⚠️ Sunucu bunu `/run/start`'ta doğruluyor — istemcinin gönderdiği kademe
 * bunun üstündeyse kırpılır, yoksa herkes 10. kademeyi seçerdi.
 */
export function maxAscensionFor(deepestDepth: number): number {
  const d = Math.max(0, Math.floor(deepestDepth));
  if (d < ascensionUnlockDepth(1)) return 0;
  return Math.min(ASCENSION.max, Math.floor((d - ASCENSION.unlockBase) / ASCENSION.unlockPer));
}

/** Kademenin zorluk çarpanı (düşman canı) — arayüzde de gösterilir */
export function ascensionHpMul(a: number): number {
  return Math.pow(ASCENSION.hpPer, Math.max(0, Math.floor(a)));
}

/** Kademenin düşman HASAR çarpanı */
export function ascensionDamageMul(a: number): number {
  return Math.pow(ASCENSION.damagePer, Math.max(0, Math.floor(a)));
}

/** Kademenin düşüş MİKTARI çarpanı */
export function ascensionDropMul(a: number): number {
  return 1 + ASCENSION.dropPer * Math.max(0, Math.floor(a));
}

/**
 * Derinlik d için bölüm tanımı üretir. SAF FONKSİYON — motor bunu çağırır,
 * kendi sayısı yoktur. Aynı (stageId, depth, asc) her zaman aynı tanımı verir.
 *
 * ⚠️ `asc` VARSAYILAN 0 ve 0'da hiçbir çarpan uygulanmıyor — eski çağrılar
 * ve eski seed'ler bit bit aynı sonucu üretmeye devam ediyor.
 */
export function descentStage(stageId: number, depth: number, asc = 0): StageDef {
  const base = stageById(stageId) ?? STAGES[0];
  const d = Math.max(1, Math.floor(depth));
  const a = Math.max(0, Math.min(ASCENSION.max, Math.floor(asc)));
  const isBoss = d % DESCENT.bossEvery === 0;
  const poolSize = Math.min(base.enemies.length, 1 + Math.floor(d / DESCENT.poolEvery));

  const def: StageDef = {
    id: base.id,
    name: `${base.name} — Depth ${d}`,
    enemyCount: Math.round((DESCENT.enemyBase + DESCENT.enemyPerDepth * d) * (1 + ASCENSION.countPer * a)),
    // Descent ödülü kill'den değil DERİNLİKTEN gelir (bkz. depthGold) — bu alan
    // sadece arayüz metni için taşınıyor, ödeme progress.ts'te hesaplanır.
    firstClearGold: depthGold(stageId, d),
    spawnRate: Math.min(DESCENT.spawnMax, base.spawnRate + DESCENT.spawnPerDepth * d),
    maxAlive: Math.min(DESCENT.aliveMax, base.maxAlive + DESCENT.alivePerDepth * d),
    enemies: base.enemies.slice(0, poolSize),
    hpMul: base.hpMul * Math.pow(DESCENT.hpGrowth, d) * ascensionHpMul(a),
    // ⚠️ HIZ TAVANI ASCENSION'DA DA GEÇERLİ. Tavanı aşan düşman oyuncudan
    // hızlı olur ve kaçış tamamen ölür — zorluk "kaçamıyorsun" değil
    // "daha çok vurman gerekiyor" olmalı.
    speedMul: Math.min(DESCENT.speedMax, base.speedMul * (1 + DESCENT.speedPerDepth * d)
      * Math.pow(ASCENSION.speedPer, a)),
    // ⚠️ Hasarın TAVANI YOK — hıza tavan koymak zorunlu (kaçış ölmesin) ama
    // hasar tam da koşuyu bitirmesi istenen şey. Tavan koymak "duvar takvim"
    // sorununu geri getirirdi.
    //
    // ⚠️ `base.damageMul` DE ÇARPILIYOR. Bu unutulmuştu ve zincirin kopuk
    // halkasıydı: bölüm 10'un merdiveni ile bölüm 1'in merdiveni hasar
    // açısından AYNI oluyordu. Kampanyada zorluk candan hasara taşınınca
    // sıralama ekseni de bozuldu (kolay bölümü farmlamak öne geçti).
    // Zor bir bölümün altındaki iniş her iki eksende de daha zor olmalı.
    damageMul: (base.damageMul ?? 1) * Math.pow(DESCENT.damageGrowth, d) * ascensionDamageMul(a),
  };

  if (isBoss) {
    const tier = d / DESCENT.bossEvery;
    const src = base.boss ?? STAGES[2].boss!;
    const mul = Math.pow(DESCENT.bossGrowth, tier);
    def.boss = {
      hp: Math.round(src.hp * mul),
      speed: src.speed,
      damage: Math.round(src.damage * Math.pow(1.12, tier)),
      radius: src.radius,
      art: src.art,
      label: `${src.label} · Depth ${d}`,
    };
  }
  return def;
}

/**
 * SIRALAMA EKSENİ — bir (bölüm, derinlik) çiftinin ne kadar zor olduğu.
 *
 * Neden gerekli: leaderboard tek sütun olacaksa "bölüm 1'de derinlik 40" ile
 * "bölüm 10'da derinlik 12" karşılaştırılabilir olmalı. Sadece derinliğe
 * bakmak yanlış — bölüm 10'un tabanı bölüm 1'in 14 katı. Sadece bölüme
 * bakmak da yanlış — derinlik üssel büyüyor.
 *
 * Ölçü = o derinlikte yere serilmesi gereken TOPLAM İŞ: düşman sayısı × can
 * çarpanı. Uydurma bir puan değil, `descentStage`'in KENDİ çıktısından
 * türer; denge sayısı değişirse sıralama da kendiliğinden düzelir.
 *
 * ⚠️ Boss canı KATILMIYOR: `hpMul` bir çarpan, `boss.hp` ham can — ikisini
 * toplamak birim karıştırmak olurdu.
 */
export function challengeRating(stageId: number, depth: number, asc = 0): number {
  const d = Math.floor(depth);
  if (d < 1) return 0;
  // ⚠️ Ascension BURADA sayılıyor ve asıl ödülü bu. "Aynı derinlik ama daha
  // zor" tabloda üstte çıkmalı; yoksa kimse zoru seçmez ve katman ölü doğar.
  // Ayrıca `descentStage` zaten hem sayıyı hem canı ölçekliyor, o yüzden
  // ayrı bir ascension terimi EKLENMİYOR — iki kez saymak olurdu.
  const def = descentStage(stageId, d, asc);
  // ⚠️ HASAR ÇARPANI DA SAYILIYOR. Eskiden yalnızca `enemyCount × hpMul`
  // vardı ve o zaman doğruydu: zorluğun tamamı candaydı. Kampanya 25 bölüme
  // çıkarken zorluk CANDAN HASARA taşındı (can büyütmek bölümü uzatıyor,
  // zorlaştırmıyor) ve ölçüm bunu yakaladı: bölüm 1'in derinliği bölüm 10'un
  // derinliğini geçmeye başladı, yani tablo kolay bölümü farmlamayı
  // ödüllendiriyordu. Sıralama ekseni "yere serilmesi gereken toplam iş"tir;
  // hayatta kalmak da o işin parçası.
  return def.enemyCount * def.hpMul * (def.damageMul ?? 1);
}

// ── GOLD MUSLUĞU ──────────────────────────────────────────────────────
// İki parça: (1) ilerleme ödülü — bir derinliği İLK kez geçince, bir kez.
//            (2) nadir düşüş  — her koşuda, düşük ihtimalle, sonsuz damla.
//
// Neden ikisi birden: sadece (1) olsaydı beceri tavanına çarpan oyuncu sıfır
// kazanırdı; sadece (2) olsaydı ilerlemenin temposu kaybolurdu.

export const GOLD = {
  /** derinlik ödülü: base · d^exp */
  depthBase: 25,
  depthExp: 1.35,
  /** zor bölümlerin derinliği daha çok öder */
  stageBonus: 0.15,
  /** nadir düşüş: taban ihtimal (≈1/143) */
  dropBase: 0.007,
  /** derinlik başına ihtimal artışı */
  dropPerDepth: 0.03,
  /** ihtimal tavanı — 1/20'den sık düşmesin */
  dropChanceMax: 0.05,
  /** düşüş miktarı: min..max, derinlikle ölçeklenir */
  dropMin: 3,
  dropMax: 11,
  dropAmountPerDepth: 0.05,
} as const;

/** Bir derinliği İLK kez geçmenin ödülü. greed çarpanı progress.ts'te uygulanır. */
export function depthGold(stageId: number, depth: number): number {
  const d = Math.max(1, Math.floor(depth));
  const stageMul = 1 + GOLD.stageBonus * (Math.max(1, stageId) - 1);
  return Math.round(GOLD.depthBase * Math.pow(d, GOLD.depthExp) * stageMul);
}

/**
 * Bir kill'in gold düşürme ihtimali. Derinlikle iyileşir → derin oyuncu
 * üretici, sığ oyuncu/bot cüzi kalır.
 *
 * ⚠️ İHTİMAL Forge'a BAĞLANMAZ — `greed` burayı çarpmaz. Sarmal riski
 * ihtimalde gerçek: ihtimal zaten derinlikle büyüyor, bir de gold ile
 * büyütmek iki üssel etkiyi çarpardı.
 *
 * MİKTAR ise (bkz. rareDropAmount) greed ile çarpılır. Bu ölçümden gelen bir
 * düzeltme: `greed` yalnızca İLERLEME ödülünü çarpıyordu ve duvarına çarpmış
 * oyuncuda ilerleme ödülü 0 olduğu için tam ihtiyaç anında ÖLÜ bir
 * yükseltmeydi (19.129 gold yatırıp sıfır getiri). Aynı hata `Coin Mask`
 * pasifini de baştan beri tamamen işlevsiz bırakıyordu. Miktarı çarpmak
 * sarmal kurmuyor: doğrusal bir çarpan, maliyeti geometrik satın alınıyor.
 */
export function rareDropChance(depth: number): number {
  const d = Math.max(0, Math.floor(depth));
  return Math.min(GOLD.dropChanceMax, GOLD.dropBase * (1 + GOLD.dropPerDepth * d));
}

/** Düşen gold miktarı. roll = [0,1) — ÇAĞIRAN rng.ts'ten vermeli, Math.random() YASAK. */
export function rareDropAmount(depth: number, roll: number): number {
  const d = Math.max(0, Math.floor(depth));
  const span = GOLD.dropMax - GOLD.dropMin;
  const raw = GOLD.dropMin + roll * span;
  return Math.max(1, Math.round(raw * (1 + GOLD.dropAmountPerDepth * d)));
}

export const PLAYER = {
  radius: 13,
  maxHp: 100,
  speed: 165, // px/sn
  // Magnet: VS tabanı 30. Bizim dünya ölçeği farklı (oyuncu yarıçapı 13 vs VS 32 px
  // sprite) → 40 ile aynı oransal hissi veriyor. Soul Pull ile çarpımsal büyür.
  pickupRadius: 40,
  iframeSec: 0.24, // VS ile birebir: 240 ms (önce 0.55 idi — CLONE-SPEC kalibrasyonu)
  regenPerSec: 0,
} as const;

/** Ana silah — "Bone Shard": en yakın düşmana otomatik ateş.
 *  DENGE NOTU: ilk sürümde 12 hasar / 0.62 sn (≈19 DPS) idi. Headless test
 *  gösterdi ki düşman HP ölçeklenmesine yetişemiyor → oyuncu LV6'da takılıyor
 *  ve güç fantezisi eğrisi tersine dönüyor. DPS ≈48'e çıkarıldı + varsayılan
 *  delme verildi (tek hedefli mermi 400+ düşmana karşı yetersiz throughput). */
export const WEAPON = {
  damage: 20,
  cooldownSec: 0.42,
  projectileSpeed: 470,
  projectileRadius: 5,
  projectileLifeSec: 1.5,
  count: 1, // aynı anda atılan mermi
  spreadRad: 0.16, // count>1 olduğunda yayılma
  pierce: 1, // kaç düşmanı geçebilir
  range: 620, // hedef arama menzili
} as const;

// ── SİLAHLAR ──────────────────────────────────────────────────────────
// CLONE-SPEC.md'deki 15 saldırı arketipinden ilk 4'ü. Motor tek, desen veri.
// Yeni silah eklemek = buraya bir kayıt. Motor kodu değişmez.
export type WeaponPattern =
  | 'aimed'      // #1 en yakın düşmana mermi (Bone Shard)
  | 'sweep'      // #2 yatay kesik, düşmandan geçer (Grave Lash)
  | 'orbit'      // #6 karakterin etrafında yörünge (Litany)
  | 'aura'       // #8 yakın alan aurası (Wardsalt)
  | 'nova'       // her yöne halka patlaması (Toll of Bells)
  | 'ground'     // yere bırakılan kalıcı alan (Consecrated Ash)
  | 'boomerang'  // gidip dönen mermi (Rusted Sickle)
  | 'chain';     // düşmandan düşmana sıçrayan (Pale Lightning)

export interface WeaponDef {
  id: string;
  name: string;
  desc: string;
  pattern: WeaponPattern;
  /** true ise level-up havuzunda ÇIKMAZ — sadece evrimle gelir */
  evolved?: boolean;
  maxLevel: number;
  damage: number;
  cooldownSec: number;
  /** seviye başına hasar çarpanı */
  dmgPerLevel: number;
  /** seviye başına bekleme çarpanı (1'den küçük = hızlanır) */
  cdPerLevel: number;
  /** kaçıncı seviyelerde +1 adet (mermi/orb) kazanır */
  countLevels?: number[];

  // aimed
  projectileSpeed?: number;
  spreadRad?: number;
  pierce?: number;
  range?: number;
  lifeSec?: number;
  // sweep — oyuncunun önünde beliren dikdörtgen hitbox
  sweepW?: number;
  sweepH?: number;
  sweepLifeSec?: number;
  /** seviye başına alan çarpanı (sweep/aura) */
  areaPerLevel?: number;
  // orbit
  orbitRadius?: number;
  orbitSpeed?: number; // rad/sn
  orbRadius?: number;
  // aura
  auraRadius?: number;
  // nova — oyuncudan her yöne halka
  novaCount?: number;
  // ground — yere bırakılan, oyuncuyla HAREKET ETMEYEN kalıcı alan
  groundRadius?: number;
  groundLifeSec?: number;
  /** alan bu aralıkla tekrar vurur (saniye) */
  groundTickSec?: number;
  // boomerang — gidip dönen mermi
  /** ömrün bu oranı geçince oyuncuya dönmeye başlar */
  returnAt?: number;
  // chain — en yakından başlayıp sıçrayan zincir
  chainJumps?: number;
  chainRange?: number;
  /** her sıçramada hasar bu oranla azalır */
  chainFalloff?: number;
}

export const WEAPONS: readonly WeaponDef[] = [
  {
    id: 'shard', name: 'Bone Shard', desc: 'Fires at the nearest enemy',
    pattern: 'aimed', maxLevel: 8, damage: 20, cooldownSec: 0.42,
    dmgPerLevel: 1.18, cdPerLevel: 0.94, countLevels: [3, 5, 7],
    projectileSpeed: 470, spreadRad: 0.16, pierce: 1, range: 620, lifeSec: 1.5,
  },
  {
    // countLevels ilk eşiği 1: seviye 1'de HER İKİ YANA birden vurur.
    // Tek yöne vuran kesik, hareket eden oyuncu için okunaksızdı — sürü her
    // yönden geliyor ama silah sadece baktığın tarafı tarıyordu (ölçüm:
    // 30 sn hareketli 16,6 kill → çift taraflı 29,6).
    id: 'lash', name: 'Grave Lash', desc: 'Slashes to both sides, passes through enemies',
    pattern: 'sweep', maxLevel: 8, damage: 30, cooldownSec: 0.8,
    dmgPerLevel: 1.2, cdPerLevel: 0.93, countLevels: [1, 4, 7],
    sweepW: 150, sweepH: 54, sweepLifeSec: 0.2, areaPerLevel: 1.07,
  },
  {
    // DENGE ÖLÇÜMÜ ([8D]): 60 sn'de 5 kill ile açık ara en zayıftı. Orb'lar
    // sadece halkaya DEĞENİ vuruyor; başlangıçta iki orb bile yokken silah
    // pratikte boştu. Hasar/tempo yükseltildi ve 2. orb 2. seviyeye çekildi.
    id: 'litany', name: 'Litany', desc: 'Pages orbit you, striking what they touch',
    // countLevels'ın ilk eşiği 1: seviye 1'de bile İKİ orb döner. Tek orb
    // halkanın %6'sını tarıyordu, silah pratikte boştu.
    pattern: 'orbit', maxLevel: 8, damage: 22, cooldownSec: 0.4,
    dmgPerLevel: 1.16, cdPerLevel: 0.97, countLevels: [1, 3, 5, 7],
    orbitRadius: 78, orbitSpeed: 2.6, orbRadius: 17, areaPerLevel: 1.06,
  },
  {
    // DENGE ÖLÇÜMÜ: 14 kill. Yakın alan silahı, oyuncunun sürüye girmesini
    // istiyor — riski yüksek, ödülü düşüktü.
    id: 'ward', name: 'Wardsalt', desc: 'Burns everything near you',
    pattern: 'aura', maxLevel: 8, damage: 14, cooldownSec: 0.52,
    dmgPerLevel: 1.22, cdPerLevel: 0.95,
    auraRadius: 84, areaPerLevel: 1.09,
  },

  // ── İKİNCİ DÖRTLÜ ──
  // MAX_WEAPONS 6 olduğu için 8 silahtan 6'sı taşınabiliyor: her run bir
  // TERCİH. Dördü de mevcut dördünden farklı bir SORU soruyor —
  // "nereye bakıyorsun", "nerede duruyorsun", "ne zaman atıyorsun".
  {
    // DENGE ÖLÇÜMÜ: 87 kill ile en tepedeydi — her yöne birden vurduğu için
    // nişan almayı hiç gerektirmiyor. Tempo yavaşlatıldı, delme düşürüldü.
    id: 'toll', name: 'Toll of Bells', desc: 'A shockwave bursts outward from you',
    pattern: 'nova', maxLevel: 8, damage: 15, cooldownSec: 2.3,
    dmgPerLevel: 1.19, cdPerLevel: 0.94, countLevels: [3, 5, 7],
    novaCount: 8, projectileSpeed: 300, pierce: 1, lifeSec: 1.0,
  },
  {
    id: 'ash', name: 'Consecrated Ash', desc: 'Leaves burning ash where you stood',
    pattern: 'ground', maxLevel: 8, damage: 11, cooldownSec: 1.6,
    dmgPerLevel: 1.21, cdPerLevel: 0.95, countLevels: [4, 7],
    groundRadius: 62, groundLifeSec: 3.4, groundTickSec: 0.5, areaPerLevel: 1.08,
  },
  {
    // BAŞLANGIÇ SİLAHI ÖLÇÜMÜ (30 sn, hareketli): 11,8 kill → tempo 1.35'ten
    // 1.0'a indi (15,8) → seviye 1'de İKİ orak (24,6). Tek orak dar bir
    // koridor tarıyordu; sürü her yönden gelirken bu okunmuyordu.
    id: 'sickle', name: 'Rusted Sickle', desc: 'Thrown wide — and it comes back',
    pattern: 'boomerang', maxLevel: 8, damage: 24, cooldownSec: 1.0,
    dmgPerLevel: 1.2, cdPerLevel: 0.94, countLevels: [1, 4, 7],
    projectileSpeed: 340, spreadRad: 0.42, pierce: 99, range: 620,
    lifeSec: 2.2, returnAt: 0.5,
  },
  {
    // DENGE ÖLÇÜMÜ: 87 kill. Sıçrama sayısı ve tempo düşürüldü — kalabalıkta
    // hâlâ güçlü, ama tek başına bölüm temizleyen silah olmamalı.
    id: 'lightning', name: 'Pale Lightning', desc: 'Leaps from one corpse to the next',
    pattern: 'chain', maxLevel: 8, damage: 26, cooldownSec: 1.85,
    dmgPerLevel: 1.22, cdPerLevel: 0.94,
    chainJumps: 2, chainRange: 190, chainFalloff: 0.72, range: 460,
  },
] as const;

// ── EVRİMLEŞMİŞ SİLAHLAR ──────────────────────────────────────────────
// VS kuralı: taban silah MAX + doğru pasif envanterde + boss sandığı.
// Evrimleşmişler level-up havuzunda ÇIKMAZ (evolved: true) — sadece evrimle gelir.
export const EVOLVED: readonly WeaponDef[] = [
  {
    id: 'reliquary', name: 'Reliquary', desc: 'Evolved Bone Shard', evolved: true,
    pattern: 'aimed', maxLevel: 1, damage: 58, cooldownSec: 0.24,
    dmgPerLevel: 1, cdPerLevel: 1, projectileSpeed: 560, spreadRad: 0.2,
    pierce: 4, range: 760, lifeSec: 1.9, countLevels: [],
  },
  {
    id: 'weeping', name: 'Weeping Wound', desc: 'Evolved Grave Lash', evolved: true,
    pattern: 'sweep', maxLevel: 1, damage: 74, cooldownSec: 0.62,
    dmgPerLevel: 1, cdPerLevel: 1, sweepW: 230, sweepH: 78, sweepLifeSec: 0.26,
    areaPerLevel: 1, countLevels: [1], // her zaman iki yana birden
  },
  {
    id: 'vespers', name: 'Black Vespers', desc: 'Evolved Litany', evolved: true,
    pattern: 'orbit', maxLevel: 1, damage: 40, cooldownSec: 0.28,
    dmgPerLevel: 1, cdPerLevel: 1, orbitRadius: 104, orbitSpeed: 3.1,
    orbRadius: 20, areaPerLevel: 1, countLevels: [1, 1, 1, 1, 1], // 6 orb
  },
  {
    id: 'glutton', name: 'Soul Glutton', desc: 'Evolved Wardsalt', evolved: true,
    pattern: 'aura', maxLevel: 1, damage: 30, cooldownSec: 0.34,
    dmgPerLevel: 1, cdPerLevel: 1, auraRadius: 132, areaPerLevel: 1,
  },
  {
    id: 'requiem', name: 'Requiem Mass', desc: 'Evolved Toll of Bells', evolved: true,
    pattern: 'nova', maxLevel: 1, damage: 44, cooldownSec: 1.05,
    dmgPerLevel: 1, cdPerLevel: 1, novaCount: 18, projectileSpeed: 340,
    pierce: 5, lifeSec: 1.5, countLevels: [],
  },
  {
    id: 'pyre', name: 'Pyre Unending', desc: 'Evolved Consecrated Ash', evolved: true,
    pattern: 'ground', maxLevel: 1, damage: 30, cooldownSec: 0.85,
    dmgPerLevel: 1, cdPerLevel: 1, groundRadius: 108, groundLifeSec: 5.5,
    groundTickSec: 0.34, areaPerLevel: 1, countLevels: [1],
  },
  {
    id: 'reaper', name: "Reaper's Arc", desc: 'Evolved Rusted Sickle', evolved: true,
    pattern: 'boomerang', maxLevel: 1, damage: 64, cooldownSec: 0.8,
    dmgPerLevel: 1, cdPerLevel: 1, projectileSpeed: 420, spreadRad: 0.5,
    pierce: 99, range: 720, lifeSec: 2.6, returnAt: 0.5, countLevels: [1, 1],
  },
  {
    id: 'sainthood', name: 'Storm of Saints', desc: 'Evolved Pale Lightning', evolved: true,
    pattern: 'chain', maxLevel: 1, damage: 72, cooldownSec: 0.7,
    dmgPerLevel: 1, cdPerLevel: 1, chainJumps: 8, chainRange: 290,
    chainFalloff: 0.92, range: 560,
  },
] as const;

export interface EvolutionDef {
  /** taban silah id — MAX seviyede olmalı */
  weapon: string;
  /** gereken pasif id — MAX seviyede olmalı (VS 1.0 sonrası kuralı) */
  passive: string;
  /** sonuç */
  to: string;
}

export const EVOLUTIONS: readonly EvolutionDef[] = [
  { weapon: 'shard', passive: 'hands', to: 'reliquary' },   // Bone Shard + Restless Hands
  { weapon: 'lash', passive: 'flesh', to: 'weeping' },      // Grave Lash + Stubborn Flesh
  { weapon: 'litany', passive: 'sigil', to: 'vespers' },    // Litany + Binding Sigil
  { weapon: 'ward', passive: 'slowknit', to: 'glutton' },   // Wardsalt + Slow Knit
  // Her evrim FARKLI bir pasif ister — aynı pasifi iki evrimin şartı yapmak
  // build çeşitliliğini öldürür, tek "doğru" pasif ortaya çıkar.
  { weapon: 'toll', passive: 'tallow', to: 'requiem' },     // Toll of Bells + Tallow Candle
  { weapon: 'ash', passive: 'bloodmeal', to: 'pyre' },      // Consecrated Ash + Bloodmeal
  { weapon: 'sickle', passive: 'sinew', to: 'reaper' },     // Rusted Sickle + Sinew Wrap
  { weapon: 'lightning', passive: 'skull', to: 'sainthood' }, // Pale Lightning + Cursed Skull
] as const;

/** id → tanım (taban + evrimleşmiş hepsi) */
/**
 * Silahın BELİRLİ bir seviyedeki değerleri — saf, istatistiksiz.
 *
 * ⚠️ TEK DOĞRU KAYNAK. Formül bugüne kadar motorun içine gömülüydü ve arayüz
 * ona erişemiyordu; level-up kartında "Lv 3 → 4 ne kazandırır" gösterilemiyor,
 * oyuncu körlemesine seçiyordu. Motor da artık bunları çağırıyor — iki yerde
 * yazılsaydı er ya da geç ayrışırlardı.
 *
 * ⚠️ `stats` çarpanı BURAYA GİRMEZ (might/cooldown/amount motorun işi);
 * bunlar silahın kendi eğrisi.
 */
export function weaponDamageAt(def: WeaponDef, level: number): number {
  return def.damage * Math.pow(def.dmgPerLevel, Math.max(1, level) - 1);
}

export function weaponCooldownAt(def: WeaponDef, level: number): number {
  return def.cooldownSec * Math.pow(def.cdPerLevel, Math.max(1, level) - 1);
}

/** Kaç mermi/orb — `stats.amount` HARİÇ (onu motor ekler) */
export function weaponCountAt(def: WeaponDef, level: number): number {
  return 1 + (def.countLevels?.filter((l) => level >= l).length ?? 0);
}

export function weaponById(id: string): WeaponDef | undefined {
  return WEAPONS.find((w) => w.id === id) ?? EVOLVED.find((w) => w.id === id);
}

// ── BOSS'LAR ve SANDIK ────────────────────────────────────────────────
// VS'te 25:00'te boss + 10:00 sonrası sandıklar evrim verir. Run'ımız 20 dk,
// o yüzden ölçekledik: 5/10/15. 10:00'dan SONRAKİ sandıklar evrim verir.
export interface BossSpawn {
  atSec: number;
  hp: number;
  speed: number;
  damage: number;
  radius: number;
  xp: number;
  art: string;
  label: string;
  /** sandığı evrim verir mi (VS'in 10 dakika kuralı) */
  evolutionChest: boolean;
}

export const BOSSES: readonly BossSpawn[] = [
  { atSec: 5 * 60, hp: 2600, speed: 42, damage: 22, radius: 34, xp: 120, art: 'boss_mini', label: 'The Gorged', evolutionChest: false },
  { atSec: 10 * 60, hp: 9000, speed: 46, damage: 28, radius: 42, xp: 320, art: 'boss_mega', label: 'Bell Warden', evolutionChest: true },
  { atSec: 15 * 60, hp: 24000, speed: 52, damage: 36, radius: 50, xp: 800, art: 'boss_nightmare', label: 'The Unburied', evolutionChest: true },
] as const;

/** Sandık toplama yarıçapı — mücevherden büyük, kaçırmak zor olsun */
export const CHEST_RADIUS = 22;

/** Aynı anda taşınabilecek silah sayısı (VS: 6) */
export const MAX_WEAPONS = 6;
/** Alan hasarı (aura/orbit) aynı düşmana en sık bu aralıkla vurur */
export const CONTACT_HIT_CD = 0.42;

/**
 * Düşman davranışı. Şimdiye kadar HEPSİ 'chase' idi — 16 farklı sprite ama tek
 * bir hareket: "oyuncuya doğru yürü". Sürü ne kadar kalabalıklaşırsa
 * kalabalıklaşsın oyuncunun verdiği karar değişmiyordu.
 *
 * ⚠️ BÖLÜM YAKINSAMA GARANTİSİ: son 8 düşman kaldığında motor davranışı
 * ZORLA 'chase'e çevirir. Yoksa menzilli/hücumcu bir düşman sonsuza kadar
 * mesafe tutup bölümü kilitleyebilir (bu tuzağa bir kez düşüldü: Ossuary
 * Halls 14 düşmanla 25 dakika sürdü ve hiç bitmedi).
 */
export type Behavior = 'chase' | 'weave' | 'ranged' | 'charger' | 'swarm' | 'circler';

export interface EnemyType {
  id: string;
  hp: number;
  speed: number;
  damage: number;
  radius: number;
  xp: number;
  color: string;
  /** kaçıncı dakikadan sonra çıkmaya başlar */
  fromMinute: number;
  /** sprites.ts ENEMY_ART anahtarı. Yoksa/yüklenmezse renkli daireye düşer. */
  art?: string;
  /** hareket kalıbı — yazılmazsa 'chase' */
  behavior?: Behavior;
}

/** Davranış ayarları — tek yerde, motorda gömülü sayı yok. */
export const BEHAVIOR = {
  weave: {
    /** yanal salınımın genliği (px/sn) ve frekansı (rad/sn) */
    amp: 0.55,
    freq: 3.4,
  },
  ranged: {
    /** bu mesafeyi korumaya çalışır: yakınsa geri çekilir, uzaksa yaklaşır */
    prefer: 250,
    /** ölü bant — sürekli ileri geri titrememesi için */
    band: 55,
    /** geri çekilirken hız çarpanı (ürkek görünsün) */
    retreatMul: 0.8,
    fireCd: 2.1,
    shotSpeed: 210,
    shotRadius: 5,
    /** temas hasarının bu oranı kadar vurur */
    shotDamageMul: 0.75,
    shotLifeSec: 3.2,
    /** sahnedeki düşman mermisi tavanı — okunabilirlik + fps emniyeti */
    maxAlive: 90,
  },
  charger: {
    /** bu mesafeye girince yüklenmeye başlar */
    trigger: 230,
    /** yüklenme süresi — oyuncuya kaçma penceresi verir (telegraf) */
    windupSec: 0.62,
    dashSec: 0.42,
    dashMul: 3.4,
    /** hücum sonrası nefeslenme */
    recoverSec: 0.95,
    recoverMul: 0.45,
  },
  /**
   * SÜRÜ — yanında müttefik varken hızlanır, yalnızken yavaşlar.
   *
   * Oyuncuya YENİ BİR KARAR verir: "sürüyü dağıt, toplanmasına izin verme".
   * Kaçmak artık tek başına yetmiyor; kaçarken onları arkanda TOPLUYORSAN
   * geri döndüğünde daha hızlı bir duvarla karşılaşıyorsun.
   */
  swarm: {
    /**
     * Komşu sayımı grid'in 3×3 hücresinden gelir (≈ ±96 px kutu) — ayrı bir
     * yarıçap sabiti YOK. Gerçek yarıçap ölçmek düşman başına mesafe döngüsü
     * demekti; "kalabalık mıyım" sorusunun cevabı için kutu yeterli.
     * Sayıya düşmanın KENDİSİ de dahil, bu yüzden eşik 1'den başlıyor.
     */
    /** komşu başına hız çarpanı artışı (kendisi hariç) */
    perAlly: 0.085,
    /** ⚠️ TAVAN ŞART: tavansız bir sürü 40 kişilik yığında oyuncuyu geçerdi */
    maxMul: 1.5,
    /** yalnızken cezalı — ayrı düşen sürü düşmanı zayıf olmalı ki dağıtmak ÖDÜLLENSİN */
    aloneMul: 0.78,
  },
  /**
   * ÇEMBERCİ — üstüne gelmez, ETRAFINDA döner ve yavaşça içeri kapanır.
   *
   * Oyuncuya farklı bir baskı: kuşatılıyorsun. Durursan halka daralır;
   * hareket edersen halka bozulur. "Bir yöne kaç" refleksini kıran tek davranış.
   *
   * ⚠️ SPİRAL İÇERİ KAPANIR (`closeIn`), sabit yarıçapta dönmez. Sabit
   * yarıçap bölümü kilitlerdi: kimse temas etmez, kimse ölmez. Yakınsama
   * garantisi (son 8 düşman) zaten var ama davranışın KENDİSİ de yakınsamalı.
   */
  circler: {
    /** korumaya çalıştığı yarıçap */
    prefer: 175,
    /** teğet hız çarpanı — dönme hızı */
    tangentMul: 0.95,
    /**
     * Saniyede bu kadar içeri kapanır (px/sn) — spiralin daralma hızı.
     * ⚠️ Radyal DIŞARI itme YOK. İlk sürümde yarıçapın içine girince
     * `-0.35 × hız` ile dışarı itiliyordu; bu `closeIn`'i katbekat yeniyor,
     * düşman 175 px'te asılı kalıyor ve ölçüm bunu yakaladı (minD 174).
     * Yörünge sadece daralabilir.
     */
    closeIn: 24,
  },
} as const;

// Renkler theme.ts paletinden — MOR YOK
export const ENEMIES: readonly EnemyType[] = [
  // Her tip ayrı sprite'a bağlı — sürüde görsel çeşitlilik oyunun "ucuz klon"
  // görünmemesinin en belirgin işareti (tür incelemesinden çıkan ders).
  // HIZ DENGESİ (oyun testi: "bir tık hızlılar") — hepsi ~%14 düşürüldü.
  // Referans: oyuncu 165 px/sn. En hızlı düşman artık oyuncunun ~%41'i (önce %47),
  // yani kaçış her zaman mümkün ama rahat değil.
  // ⚠️ HERKESE ÖZEL DAVRANIŞ VERİLMEDİ ve bu bir eksik değil, TASARIM.
  // Her düşman özelse hiçbiri özel değildir: oyuncunun "normal"i okuyabilmesi
  // için bir taban gerekiyor. `chase` kalanlar (imp · skeleton · brute · hulk)
  // o taban — sürünün duvarı. Geri kalan 12'si ondan AYRIŞARAK anlam kazanıyor.
  { id: 'imp', hp: 10, speed: 39, damage: 6, radius: 10, xp: 1, color: '#8a97a3', fromMinute: 0, art: 'mon_imp' },
  // Hırsız çevik: yanal salınır, nişanlı mermiler ıskalar
  { id: 'rogue', hp: 14, speed: 50, damage: 7, radius: 10, xp: 1, color: '#b8ae98', fromMinute: 0, art: 'mon_rogue', behavior: 'weave' },
  { id: 'skeleton', hp: 18, speed: 38, damage: 8, radius: 11, xp: 2, color: '#ddd3bb', fromMinute: 1.5, art: 'skeleton' },
  // Sefiller kalabalıkken cesaretlenir — oyuncuya "dağıt" kararı verir
  { id: 'wretch', hp: 22, speed: 53, damage: 8, radius: 11, xp: 2, color: '#8a97a3', fromMinute: 2, art: 'mon_wretch', behavior: 'swarm' },
  // Boynuz = tos: telegrafla yüklenir, yandan kaçmak gerekir
  { id: 'horned', hp: 30, speed: 41, damage: 10, radius: 12, xp: 3, color: '#5f9e4a', fromMinute: 3, art: 'mon_horned', behavior: 'charger' },
  // Kuş çember çizer — kuşatma hissi, "tek yöne kaç" refleksini kırar
  { id: 'bird', hp: 26, speed: 67, damage: 9, radius: 11, xp: 3, color: '#efa72e', fromMinute: 4, art: 'mon_bird', behavior: 'circler' },
  { id: 'brute', hp: 62, speed: 29, damage: 14, radius: 16, xp: 5, color: '#a01226', fromMinute: 5, art: 'mon_brute' },
  { id: 'fiend', hp: 48, speed: 57, damage: 12, radius: 13, xp: 5, color: '#c8324a', fromMinute: 6, art: 'mon_fiend', behavior: 'circler' },
  // Yengeç yanlamasına yürür — salınım tam onun hareketi
  { id: 'crab', hp: 90, speed: 33, damage: 16, radius: 17, xp: 7, color: '#efa72e', fromMinute: 8, art: 'mon_crab', behavior: 'weave' },
  { id: 'warrior', hp: 110, speed: 45, damage: 18, radius: 15, xp: 9, color: '#a01226', fromMinute: 10, art: 'mon_warrior', behavior: 'charger' },
  { id: 'hulk', hp: 210, speed: 26, damage: 22, radius: 22, xp: 14, color: '#5f9e4a', fromMinute: 12, art: 'mon_hulk' },

  // ── GEÇ KAMPANYA / DERİN İNİŞ SÜRÜSÜ ──
  // MutterPixel undead + vermin. Topdown canavarlar önden bakan çizimler;
  // bunlar yandan. Silüet farkı, geç bölümlerin "aynı sürü" hissini kırıyor.
  // Fareler kıvrılarak koşar: nişanlı mermiler ıskalar, sürü "duvar" olmaz.
  { id: 'rat', hp: 34, speed: 74, damage: 8, radius: 9, xp: 3, color: '#b8ae98', fromMinute: 3, art: 'rat_small', behavior: 'weave' },
  // İri fare artık salınmıyor: küçüğüyle aynı hareket ikisini de siliyordu.
  // Sürüde cesaretlenir — kendi yavruları onun yakıtı olur.
  { id: 'dire_rat', hp: 70, speed: 62, damage: 13, radius: 12, xp: 6, color: '#8a97a3', fromMinute: 6, art: 'rat_large', behavior: 'swarm' },
  // Köleler kalabalıkta hızlanır: geç bölümlerin yoğunluğu artık tehdit ÜRETİYOR
  { id: 'bone_thrall', hp: 130, speed: 43, damage: 16, radius: 13, xp: 10, color: '#ddd3bb', fromMinute: 9, art: 'skel_basic', behavior: 'swarm' },
  // MENZİLLİ: mesafe tutar ve ok atar. Oyuncuyu "sürüden kaç" yerine
  // "atışı da savuştur" kararına zorlayan ilk düşman.
  { id: 'bone_archer', hp: 150, speed: 40, damage: 19, radius: 13, xp: 12, color: '#e3d8c0', fromMinute: 11, art: 'bone_archer', behavior: 'ranged' },
  // HÜCUMCU: yaklaşır, durur (telegraf), sonra fırlar. Tehlike ani ve okunabilir.
  { id: 'grave_knight', hp: 320, speed: 34, damage: 26, radius: 16, xp: 20, color: '#8a97a3', fromMinute: 14, art: 'skel_armored', behavior: 'charger' },
] as const;

/** DENGE NOTU: ilk değerler (base 2.4 / perMinute 1.7 / cap 620 / hp +%34) ile
 *  5. dakikada tavan doluyordu — hem görsel lapa hem de kill hızı çöküşü.
 *  Tavan 420'ye çekildi (okunabilirlik + fps payı), eğri yumuşatıldı. */
export const SPAWN = {
  /** Ekran kenarının bu kadar dışında doğar (aniden içeride belirmesin) */
  ringMargin: 90,
  /**
   * Saniyede doğan düşman: base + minute * perMinute
   * DENGE NOTU (oyun testi): base 2.0 iken 1. dakikada ~145 düşman doğuyordu —
   * oyuncu "anında sel oluyor" dedi. Açılış üçe bölündü; eğim korundu ki
   * geç oyun baskısı kaybolmasın.
   */
  base: 0.7,
  perMinute: 0.8,
  /** Aynı anda sahnede en fazla kaç düşman (performans + okunabilirlik tavanı) */
  maxAlive: 420,
  /** Düşman HP/hız dakika bazlı ölçeklenmesi */
  hpScalePerMinute: 0.17,
  /** Oyun testi: "bir tık hızlılar" → 0.018'den düşürüldü */
  speedScalePerMinute: 0.011,
} as const;

/** Level n'e geçmek için gereken toplam XP */
export function xpForLevel(level: number): number {
  return Math.floor(6 * Math.pow(level, 1.42) + level * 4);
}

export const GEM = {
  radius: 5,
  magnetSpeed: 400,
  lifeSec: 45, // toplanmayan mücevhel bir süre sonra kaybolur (birikme = performans)
} as const;

// ── PASİF ITEM'LAR ────────────────────────────────────────────────────
// CLONE-SPEC.md §3'ün birebir uygulaması. Her pasif BİR istatistiği besler;
// istatistik taban değerleri ve tavanları VS'ten alındı (CLONE-SPEC §1).
export type StatKey =
  | 'might' | 'armor' | 'maxHp' | 'recovery' | 'cooldown' | 'area'
  | 'projSpeed' | 'duration' | 'amount' | 'moveSpeed' | 'magnet'
  | 'luck' | 'growth' | 'greed' | 'curse' | 'revival'
  // ⚠️ KRİTİK VURUŞ — VS'te yok, bizim eklememiz. Zar HER vuruşta atılır
  // (bkz. engine.damageEnemy); bu SIM_VERSION 2'yi getirdi.
  | 'crit' | 'critMul';

/** VS taban değerleri. Yüzdeler 1.0 = %100. */
export const STAT_BASE: Record<StatKey, number> = {
  might: 1, armor: 0, maxHp: PLAYER.maxHp, recovery: 0, cooldown: 1, area: 1,
  projSpeed: 1, duration: 1, amount: 0, moveSpeed: 1, magnet: 1,
  luck: 1, growth: 1, greed: 1, curse: 1, revival: 0,
  /** %5 taban kritik şansı — her build'de arada bir sarı sayı görünsün */
  crit: 0.05,
  /** kritik hasar çarpanı */
  critMul: 1.5,
};

/** VS tavanları. cooldown TABAN değil TAVAN sınırı (%10'un altına inemez). */
export const STAT_CAP: Partial<Record<StatKey, number>> = {
  might: 10,      // %1000
  armor: 50,
  area: 10,       // %1000
  projSpeed: 5,   // %500
  duration: 5,    // %500
  amount: 10,
  // ⚠️ "her vuruş kritik" build'i olmasın — %60 tavan. Üstü hem denge hem
  // görsel gürültü sorunu (ekran sürekli sarı sayı olurdu).
  crit: 0.6,
  critMul: 4,
  // ⚠️ `greed` artık nadir düşüş MİKTARINI çarpıyor, yani musluğun doğrudan
  // parçası. Tavansız bırakmak sunucunun yapısal gold tavanını da tavansız
  // bırakırdı (bkz. reward.maxRareGold). Forge (+0,72) + Coin Mask (+0,50)
  // toplamı 2,22; 2,5 rahat ama kapalı bir sınır.
  greed: 2.5,
};
export const COOLDOWN_FLOOR = 0.10; // %10 — VS'in dibi

export interface PassiveDef {
  id: string;
  name: string;
  /** VS'teki karşılığı — referans için, oyuncuya gösterilmez */
  vs: string;
  stat: StatKey;
  /** seviye başına artış. Yüzde istatistiklerde toplamsal (0.10 = +%10) */
  perLevel: number;
  maxLevel: number;
  desc: string;
}

export const PASSIVES: readonly PassiveDef[] = [
  { id: 'bloodmeal', name: 'Bloodmeal', vs: 'Spinach', stat: 'might', perLevel: 0.10, maxLevel: 5, desc: '+10% damage' },
  { id: 'boneplate', name: 'Bone Plate', vs: 'Armor', stat: 'armor', perLevel: 1, maxLevel: 5, desc: '+1 armor' },
  { id: 'flesh', name: 'Stubborn Flesh', vs: 'Hollow Heart', stat: 'maxHp', perLevel: 0.20, maxLevel: 5, desc: '+20% max health' },
  { id: 'slowknit', name: 'Slow Knit', vs: 'Pummarola', stat: 'recovery', perLevel: 0.2, maxLevel: 5, desc: '+0.2 HP/sec' },
  { id: 'hands', name: 'Restless Hands', vs: 'Empty Tome', stat: 'cooldown', perLevel: 0.08, maxLevel: 5, desc: '-8% cooldown' },
  { id: 'tallow', name: 'Tallow Candle', vs: 'Candelabrador', stat: 'area', perLevel: 0.10, maxLevel: 5, desc: '+10% area' },
  { id: 'sinew', name: 'Sinew Wrap', vs: 'Bracer', stat: 'projSpeed', perLevel: 0.10, maxLevel: 5, desc: '+10% projectile speed' },
  { id: 'sigil', name: 'Binding Sigil', vs: 'Spellbinder', stat: 'duration', perLevel: 0.10, maxLevel: 5, desc: '+10% duration' },
  { id: 'echo', name: 'Echo Charm', vs: 'Duplicator', stat: 'amount', perLevel: 1, maxLevel: 2, desc: '+1 projectile' },
  { id: 'step', name: 'Unquiet Step', vs: 'Wings', stat: 'moveSpeed', perLevel: 0.10, maxLevel: 5, desc: '+10% move speed' },
  { id: 'soulpull', name: 'Soul Pull', vs: 'Attractorb', stat: 'magnet', perLevel: 0.25, maxLevel: 5, desc: '+25% pickup radius' },
  // ⚠️ "Dead Man's Luck" (luck) KALDIRILDI. Motor `stats.luck`'ı hiçbir yerde
  // okumuyordu; oyuncu bir run'ın en önemli kararı olan level-up seçimini
  // 5 kez TAM ANLAMIYLA hiçbir şeye harcayabiliyordu. The Forge'da aynı
  // gerekçeyle dışarıda bırakılmıştı — havuzda tutmak tutarsızlıktı.
  // Gerçek bir şans sistemi (sandık/nadirlik) gelirse geri eklenir.
  { id: 'crown', name: 'Grave Crown', vs: 'Crown', stat: 'growth', perLevel: 0.08, maxLevel: 5, desc: '+8% experience' },
  { id: 'coinmask', name: 'Coin Mask', vs: 'Stone Mask', stat: 'greed', perLevel: 0.10, maxLevel: 5, desc: '+10% gold' },
  { id: 'skull', name: 'Cursed Skull', vs: "Skull O'Maniac", stat: 'curse', perLevel: 0.10, maxLevel: 5, desc: '+10% curse — deadlier, richer' },
  { id: 'burial', name: 'Second Burial', vs: 'Tirajisú', stat: 'revival', perLevel: 1, maxLevel: 2, desc: '+1 revival' },
  // ── kritik arketipi ──
  { id: 'edge', name: 'Whetted Bone', vs: '—', stat: 'crit', perLevel: 0.05, maxLevel: 5, desc: '+5% critical chance' },
  { id: 'frenzy', name: 'Grave Frenzy', vs: '—', stat: 'critMul', perLevel: 0.25, maxLevel: 4, desc: '+25% critical damage' },
] as const;

/** Aynı anda taşınabilecek pasif sayısı (VS: 6, silahlardan ayrı) */
export const MAX_PASSIVES = 6;


