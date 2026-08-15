// GRAVEBORN simülasyon çekirdeği — saf mantık, DOM/canvas bilgisi YOK.
// Bu ayrım kasıtlı: aynı kod ileride sunucuda headless koşabilir (ödül doğrulaması).
// Render tamamen ayrı (render.ts). Rastgelelik sadece Rng'den (Math.random YASAK).
//
// Bellek deseni: sabit kapasiteli diziler + swap-remove. Her frame yeni nesne
// tahsis edilmez → GC spike'ı yok → frame düşmesi yok.

import { createRng, type Rng } from './rng';
import { SpatialHash } from './spatial';
import {
  BOSS, BOSS_ARCH, CHEST_RADIUS, DESCENT, CONTACT_HIT_CD, COOLDOWN_FLOOR, ENEMIES, EVOLUTIONS, GEM,
  MAX_PASSIVES, MAX_WEAPONS, PASSIVES, PLAYER, RUN, SPAWN, STAGES, STAT_BASE, STAT_CAP, TICK,
  evrimPasifEsigi, evrimSilahEsigi,
  WEAPONS, ASCENSION, BEHAVIOR, ascensionDropMul, bossArchetypeOf, descentStage, rareDropAmount,
  rareDropChance, startLevelFor, weaponById,
  weaponCooldownAt, weaponCountAt, weaponDamageAt, xpForLevel,
  type Behavior, type BossArchetype, type EnemyType, type PassiveDef, type StageDef,
  type StatKey, type WeaponDef,
} from './config';
import { DEFAULT_HERO, heroById, mergeStats } from './heroes';
import type { RunPet } from './pets';

export interface Enemy {
  /**
   * Hangi `EnemyType`ten doğdu (config id).
   *
   * ⚠️ Mantığı BESLEMEZ — davranış `behavior` alanından okunuyor. Bu alan
   * ölçüm ve hata ayıklama için: testte "hangi tip kaç tane" sorusu `radius`
   * karşılaştırmasıyla çözülmeye çalışıldı ve YANLIŞ cevap verdi (brute ile
   * herald aynı çapta). Kimliği çapından tahmin etmek yerine taşımak daha
   * ucuz ve doğru.
   */
  typeId: string;
  x: number; y: number; hp: number; maxHp: number;
  speed: number; damage: number; radius: number; xp: number;
  color: string; hitFlash: number;
  /** sprites.ts ENEMY_ART anahtarı (yoksa daire çizilir) */
  art?: string;
  /** animasyon zamanı — spawn'da rastgele ofsetlenir, yoksa 400 düşman
   *  aynı frame'de yürür ve sürü robot gibi durur */
  animT: number;
  facingRight: boolean;
  /** alan hasarı (aura/orbit) bekleme sayacı — sürekli temas anında eritmesin */
  contactCd: number;
  /** boss ise: ölünce sandık düşürür, HP barı çizilir */
  boss?: {
    label: string; evolutionChest: boolean;
    /** >0 iken giriş sekansı: hareketsiz ve DOKUNULMAZ */
    intro: number;
    /** 0 = ilk faz, 1 = öfke fazı (HP yarıya inince) */
    phase: number;
    /** bir sonraki saldırıya kalan süre */
    atkCd: number;
    /** >0 iken tehlike alanı görünür ama henüz vurmadı (kaçma penceresi) */
    telegraph: number;
    /** telegraf/darbe yarıçapı */
    slamR: number;
    /**
     * Dövüş kalıbı (bkz. config BOSS_ARCH). Boss'un can/boyut dışında bir
     * kimliği olmasını sağlayan tek alan — bölümün boss SIRASINDAN türer,
     * RNG'den değil.
     */
    arch: BossArchetype;
    /**
     * Kaçıncı saldırı. İki işi var, ikisi de RNG'siz olmak zorunda:
     * `choir` yaylımının açısal kayması buradan türüyor (her yaylım aynı
     * açıdan çıksaydı oyuncu tek noktada durup hiç vurulmadan bekleyebilirdi)
     * ve `harrower`ın ikinci darbesi buradan zamanlanıyor.
     */
    atkNo: number;
    /**
     * `harrower`ın ikinci darbesine kalan süre; 0 = bekleyen darbe yok.
     * ⚠️ AYRI SAYAÇ ŞART: `telegraph`i yeniden kullanmak ikinci darbeyi de
     * "kaçılabilir bir telegraf" yapardı — oysa ikinci darbenin tamamı ilk
     * darbeden sonra ERKEN DÖNENİ cezalandırmak için var.
     */
    followUp: number;
    /** mezar küresine kalan süre — arketipten BAĞIMSIZ ikinci yetenek */
    orbCd: number;
  };

  // ── davranış durumu ──
  behavior: Behavior;
  /** menzillide ateş bekleme · hücumcuda faz sayacı */
  atkCd: number;
  /** hücumcu fazı: 0 yaklaş · 1 yükleniyor · 2 hücum · 3 nefeslen */
  cState: 0 | 1 | 2 | 3;
  /** hücumun KİLİTLENMİŞ yönü — fırladıktan sonra oyuncuyu takip etmez,
   *  yoksa kaçınmak imkânsız olur ve telegraf anlamını yitirir */
  cdx: number; cdy: number;
  /** weave salınımının faz ofseti — spawn sayacından türetilir (RNG'ye dokunmaz) */
  phase: number;
  /**
   * `splitter` için kuşak sayacı. 0 = ana gövde, 1 = parça.
   * ⚠️ Parçalar TEKRAR BÖLÜNMEZ: sonsuz bölünme hem bölümün bitmesini
   * imkânsız kılar hem 420 düşman tavanını anında doldururdu.
   */
  splitGen?: number;
}

/** Düşman mermisi — oyuncuya zarar verir. Oyuncununkinden AYRI dizi. */
export interface EnemyShot {
  x: number; y: number; vx: number; vy: number;
  damage: number; radius: number; life: number;
}

/** Boss'un düşürdüğü sandık — toplanınca evrim veya ödül */
export interface Chest { x: number; y: number; evolution: boolean }
export interface Projectile {
  x: number; y: number; vx: number; vy: number;
  damage: number; radius: number; life: number; pierce: number;
  /** ⚠️ MERMİYİ KİM ATTI. 1v1'de öldürme kredisi ve XP sahibine gitmeli;
   *  sahipsiz mermi, rakibin öldürdüğü düşmanın XP'sini sana yazardı. */
  owner: Hero;
  /** boomerang: ömür bu değerin ALTINA inince oyuncuya dönmeye başlar (emniyet) */
  returnAt?: number;
  /** boomerang: oyuncudan bu mesafeyi geçince döner — ASIL koşul bu */
  maxDist?: number;
  /** boomerang: dönüşe geçti mi (bir kez döndü mü geri gitmez) */
  returning?: boolean;
  /** boomerang: dönüş hızı (ilk atış hızı) */
  speed?: number;
  /**
   * homing: saniyede kaç radyan DÖNEBİLİR.
   * ⚠️ Sonsuz olmamalı — kusursuz takip `aimed`i gereksiz kılar (bkz. config).
   */
  seek?: number;
  /** ⚠️ SADECE GÖRSEL ETİKET — hangi silahtan çıktı. Hiçbir mantığı beslemez;
   *  render doğru mermi/çarpma sprite'ını seçmek için okur. */
  wid?: string;
}


/** Zincir silahının kozmetik yayı — render her frame boşaltır, simülasyona girmez */
export interface Arc { x1: number; y1: number; x2: number; y2: number }
export interface Gem { x: number; y: number; xp: number; life: number }

/** Sweep saldırısının geçici hitbox'ı — render de bunu çizer */
export interface HitZone {
  x: number; y: number; w: number; h: number;
  life: number; maxLife: number; damage: number;
  facingRight: boolean;
  /** vuruş alanını kim açtı — bkz. Projectile.owner */
  owner: Hero;
  /** aynı kesikte aynı düşmana iki kez vurmasın */
  hit: Set<Enemy>;
  /** true ise oyuncuyu TAKİP ETMEZ, bırakıldığı yerde kalır (ground) */
  anchored?: boolean;
  /** >0 ise bu aralıkla `hit` temizlenir → alan tekrar tekrar vurur */
  retick?: number;
  retickCd?: number;
  /** true ise dikdörtgen değil DAİRE olarak çarpışır ve çizilir */
  round?: boolean;
  /**
   * TUZAK. Doluysa alan HENÜZ hasar vermiyor: kuruluyor, sonra bekliyor,
   * düşman yaklaşınca PATLIYOR ve normal bir yuvarlak alana dönüşüyor.
   * ⚠️ `damage` tetiklenene kadar 0 — tuzağın tamamı bu gecikmede.
   */
  trap?: { arm: number; triggerR: number; blastR: number; damage: number };
  /** ⚠️ SADECE GÖRSEL ETİKET — bkz. Projectile.wid */
  wid?: string;
}

/** Sahip olunan silah — seviyesi ve kendi bekleme sayacı */
export interface OwnedWeapon { def: WeaponDef; level: number; cd: number }

/** Level-up'ta sunulan seçenek: yeni silah, silah yükseltmesi veya istatistik */
export interface Offer {
  kind: 'weapon-new' | 'weapon-up' | 'passive-new' | 'passive-up';
  id: string;
  name: string;
  desc: string;
  /** silah seçeneklerinde mevcut seviye (yükseltmede gösterilir) */
  level?: number;
}

export type Phase = 'running' | 'levelup' | 'dead' | 'won';

/** campaign = bitirilebilir bölüm · descent = sonsuz derinlik merdiveni */
export type RunMode = 'campaign' | 'descent';

/** Bölüm ilerlemesi — HUD "kaç düşman kaldı" göstergesi için */
export interface StageState {
  def: StageDef;
  /** henüz salınmamış düşman */
  toSpawn: number;
  /** bu bölümde toplam kaç düşman öldürüldü */
  killed: number;
  /** boss çağrıldı mı */
  bossSpawned: boolean;
  mode: RunMode;
  /** descent'te şu an inilen derinlik (campaign'de 0) */
  depth: number;
  /** bu koşuda TEMİZLENEN en derin seviye — ödül bundan hesaplanır */
  deepestCleared: number;
}

/** VS istatistik sistemi (CLONE-SPEC §1). Yüzdeler 1.0 = %100. */
export type Stats = Record<StatKey, number>;

/** Sahip olunan pasif item */
export interface OwnedPassive { def: PassiveDef; level: number }

/**
 * BİR DÖVÜŞÇÜNÜN DURUMU.
 *
 * ⚠️ NİYE AYRI SINIF: gerçek zamanlı 1v1 için iki oyuncunun AYNI
 * simülasyonda olması gerekiyor (ortak harita, ortak düşman dalgaları). Bu
 * alanlar `Game` üzerinde düz duruyordu; ikinci bir dövüşçü eklemenin tek
 * temiz yolu onları bir nesneye toplamak.
 *
 * ⚠️ BU ADIM SAF BİR YENİDEN DÜZENLEME. `Game` alanların hepsi için erişimci
 * taşıyor, yani motorun 1591 satırı da render/HUD de eskisi gibi `this.px`,
 * `g.hp`, `g.stats` yazmaya devam ediyor. `SIM_SEAL` mührü DEĞİŞMEMELİ —
 * testi tam olarak bunu kanıtlıyor.
 */
export class Hero {
  /** oynanan karakter — SADECE VERİ, motor görsel bilmez */
  readonly heroId: string;
  /** Forge + karakter eğilimi, tek kanalda birleşmiş */
  readonly permanent: Partial<Record<StatKey, number>>;

  // NOT: config'deki `as const` yüzünden açık `: number` şart —
  // yoksa TS `hp`'yi literal `100` olarak çıkarır ve atamalar patlar.
  px = 0; py = 0;
  hp: number = PLAYER.maxHp;
  iframe = 0;
  // sunum durumu — simülasyonu etkilemez, render okur
  animT = 0;
  moving = false;
  facingRight = true;
  /**
   * Saldırı / hasar animasyonu sayaçları.
   * ⚠️ SADECE SUNUM — hiçbir mantığı beslemezler, RNG tüketmezler, denge
   * etkileri yoktur. `sim.test.mts` mührü bunları hash'e ALMAZ.
   */
  atkT = 0;
  hurtT = 0;
  level = 1;
  xp = 0;
  /** koşu boyunca toplanan toplam XP (seviye atlayınca SIFIRLANMAZ) */
  xpEarned = 0;
  xpNext: number = xpForLevel(1);
  /** başlangıç draft'ında seçilmeyi bekleyen seviye sayısı */
  pendingLevels = 0;
  kills = 0;
  /** kaç kez dirilindi (Second Burial) */
  revives = 0;
  /** VS istatistikleri — pasiflerden TÜRETİLİR, doğrudan yazılmaz */
  stats: Stats = { ...STAT_BASE };
  weapons: OwnedWeapon[] = [];
  passives: OwnedPassive[] = [];
  /** yörünge silahlarının ortak açısı */
  orbitAngle = 0;
  /** levelup fazında sunulan 3 seçenek */
  offers: Offer[] = [];
  /** girdi (birim vektör) — 1v1'de telden geçen TEK şey bu */
  inx = 0;
  iny = 0;
  /** ⚠️ Ölü dövüşçü simülasyona KATILMAZ (hareket/ateş/hasar/toplama yok) */
  alive = true;

  /**
   * BAĞLANMIŞ YOLDAŞLAR (bkz. pets.ts).
   *
   * ⚠️ VARSAYILAN BOŞ ve bu KRİTİK. `damageEnemy` HER vuruşta `rng.next()`
   * tüketiyor (kritik zarı); pet bir kez vursa RNG akışı kayar ve `SIM_SEAL`
   * kırılırdı. Boş dizi hiç vurmuyor → pet'siz koşu bit bit eskisiyle aynı.
   * `allowedWeapons: null` ile birebir aynı duruş.
   *
   * ⚠️ Bu dizi FORAGER İÇERMEZ. Forager savaşmıyor; katkısı `permanent`
   * kanalından geçiyor (bkz. `petStatBonus`). Motorun her karede greed
   * hesaplaması için bir sebep yok ve o kanal ayrıca sunucunun da okuduğu yer.
   */
  pets: PetState[] = [];

  constructor(heroId: string, permanent: Partial<Record<StatKey, number>>) {
    this.heroId = heroId;
    this.permanent = permanent;
  }
}

/**
 * Bir pet'in koşu içindeki durumu.
 *
 * ⚠️ `anim` / `animT` / `animLeft` SADECE SUNUM — `atkT`/`hurtT` ile aynı
 * sınıfta. Mühür bunları hash'e ALMAZ; render okur, mantık okumaz.
 */
export interface PetState {
  readonly def: RunPet;
  x: number; y: number;
  /** bir sonraki eyleme kalan süre */
  cd: number;
  anim: 'walk' | 'attack' | 'cast' | 'bless';
  animT: number;
  animLeft: number;
  facingRight: boolean;
}

export class Game {
  readonly seed: number;
  private rng: Rng;
  /** null = kilit yok (bkz. constructor `allowedWeapons`) */
  private allowedWeapons: Set<string> | null;

  /** birinci dövüşçü — per-oyuncu durumun tamamı burada */
  readonly hero: Hero;
  /**
   * İkinci dövüşçü — SADECE gerçek zamanlı 1v1'de dolu.
   * ⚠️ `null` olduğu sürece motor tek satır fazladan iş yapmıyor ve hiç
   * ekstra RNG tüketmiyor; solo koşular bit bit aynı kalıyor.
   */
  rival: Hero | null = null;

  // ── ERİŞİMCİLER ──
  // ⚠️ SİLİNMEZLER. Hem motorun kendi kodu hem render/HUD bu isimleri okuyup
  // yazıyor (`g.px`, `g.hp`, `g.stats`, `g.weapons`…). Alanları `hero`'ya
  // taşırken API'yi korumanın bedeli bu; alternatifi 200+ çağrı yerini
  // mekanik olarak yeniden yazmaktı — her biri ayrı bir hata şansı.
  get heroId() { return this.hero.heroId; }
  get permanent() { return this.hero.permanent; }
  get px() { return this.hero.px; } set px(v: number) { this.hero.px = v; }
  get py() { return this.hero.py; } set py(v: number) { this.hero.py = v; }
  get hp() { return this.hero.hp; } set hp(v: number) { this.hero.hp = v; }
  get iframe() { return this.hero.iframe; } set iframe(v: number) { this.hero.iframe = v; }
  get animT() { return this.hero.animT; } set animT(v: number) { this.hero.animT = v; }
  get moving() { return this.hero.moving; } set moving(v: boolean) { this.hero.moving = v; }
  get facingRight() { return this.hero.facingRight; } set facingRight(v: boolean) { this.hero.facingRight = v; }
  get atkT() { return this.hero.atkT; } set atkT(v: number) { this.hero.atkT = v; }
  get hurtT() { return this.hero.hurtT; } set hurtT(v: number) { this.hero.hurtT = v; }
  get level() { return this.hero.level; } set level(v: number) { this.hero.level = v; }
  get xp() { return this.hero.xp; } set xp(v: number) { this.hero.xp = v; }
  get xpEarned() { return this.hero.xpEarned; } set xpEarned(v: number) { this.hero.xpEarned = v; }
  get xpNext() { return this.hero.xpNext; } set xpNext(v: number) { this.hero.xpNext = v; }
  get pendingLevels() { return this.hero.pendingLevels; } set pendingLevels(v: number) { this.hero.pendingLevels = v; }
  get kills() { return this.hero.kills; } set kills(v: number) { this.hero.kills = v; }
  get revives() { return this.hero.revives; } set revives(v: number) { this.hero.revives = v; }
  get stats() { return this.hero.stats; } set stats(v: Stats) { this.hero.stats = v; }
  get weapons() { return this.hero.weapons; } set weapons(v: OwnedWeapon[]) { this.hero.weapons = v; }
  get passives() { return this.hero.passives; } set passives(v: OwnedPassive[]) { this.hero.passives = v; }
  get orbitAngle() { return this.hero.orbitAngle; } set orbitAngle(v: number) { this.hero.orbitAngle = v; }
  get offers() { return this.hero.offers; } set offers(v: Offer[]) { this.hero.offers = v; }

  /** seçilen ascension kademesi — 0 = kapalı (bkz. config.ASCENSION) */
  readonly ascension: number;

  /** descent'in başladığı derinlik (checkpoint); campaign'de 0 */
  readonly startDepth: number;

  // ⚠️ Per-dövüşçü alanlar (pendingLevels, kills, revives, stats, weapons,
  // passives, orbitAngle, offers) artık `Hero`'da — yukarıdaki erişimciler
  // eski isimleri koruyor.

  // run durumu — KOŞUYA ait, dövüşçüye değil
  time = 0;
  phase: Phase = 'running';
  /**
   * Bu koşuda NADİR DÜŞÜŞTEN toplanan gold. Kill başına maaş DEĞİL —
   * ilerleme ödülü (derinlik/ilk geçiş) buraya girmez, onu progress.ts hesaplar.
   * İsim bilerek `gold` değil: eskiden `gold` "kazanılan her şey" sanılıyordu.
   */
  rareGold = 0;
  /**
   * Bu koşuda BOSS'lara verilen toplam hasar. Haftalık ortak boss katkısı
   * buradan okunur (bkz. worldBoss.ts). Sürü hasarı DAHİL DEĞİL.
   */
  bossDamage = 0;

  // varlıklar
  enemies: Enemy[] = [];
  projectiles: Projectile[] = [];
  /** düşman mermileri — render bunları da çizer */
  enemyShots: EnemyShot[] = [];
  /** zincir yayları — KOZMETİK kuyruk, render her frame boşaltır */
  arcs: Arc[] = [];
  gems: Gem[] = [];
  hitZones: HitZone[] = [];
  /**
   * Sahnedeki HABERCİLER — her tick tazelenen küçük bir liste.
   *
   * ⚠️ Neden ayrı liste: haberci aurası her düşman için sorgulanıyor ve
   * 420 düşman × 420 düşman taraması saniyede 10 milyon karşılaştırma
   * demekti. Haberciler nadirdir (sahnede tipik 0-3); ayrı tutmak taramayı
   * 420 × 3'e indiriyor. Izgara sorgusu da denenebilirdi ama haberci sayısı
   * o kadar düşük ki düz döngü daha ucuz.
   */
  private heralds: Enemy[] = [];
  chests: Chest[] = [];

  /** Oynanan bölüm — sabit düşman havuzu, "hepsi öldü" bitiş koşulu */
  stage: StageState;
  /** merdivenin ait olduğu kampanya bölümü (descent tanımı bundan üretilir) */
  readonly baseStageId: number;
  /** son evrim (HUD duyurusu için); render/HUD okur, simülasyonu etkilemez */
  lastEvolution: { name: string; at: number } | null = null;

  /**
   * KOZMETİK olay kuyrukları — render katmanı her frame boşaltır.
   * Simülasyon durumunu ETKİLEMEZ ve RNG tüketmez; determinizm bozulmaz.
   * Render çalışmasa bile (headless test) tavanla sınırlı, sızıntı yapmaz.
   *
   * ⚠️ TAVANLAR UZUNLUK KONTROLÜYLE — asla `rng` ya da zaman bazlı örneklemeyle.
   * `if (len < N)` deterministik; "her 3 frame'de bir atla" değil.
   */
  deaths: {
    x: number; y: number;
    /** ölüm animasyonu için: hangi sprite, hangi yöne bakıyordu, ne kadar büyüktü */
    art?: string; facingRight: boolean; radius: number; boss: boolean;
  }[] = [];

  /**
   * Vuruş kuyruğu — hasar sayısı ve çarpma efektinin kaynağı.
   * `wid` vuran silahın id'si; render doğru mermi/çarpma görselini seçer.
   */
  hits: { x: number; y: number; dmg: number; crit: boolean; wid: string; killed: boolean }[] = [];

  /** Oyuncunun yediği hasar — ekran flaşı/vinyet/sarsıntı için */
  hurts: { amount: number }[] = [];

  /**
   * Pet alan patlamaları — SADECE ÇİZİM İÇİN.
   *
   * ⚠️ Hasar zaten `damageEnemy` ile uygulandı; bu kuyruk yalnızca "nerede
   * patladı" bilgisini render'a taşıyor. Diğer kozmetik kuyruklarla aynı
   * kural: tavanı UZUNLUK KONTROLÜYLE korunuyor, `rng` ya da zamanla değil.
   * Headless sunucuda kimse boşaltmıyor — tavan orada da tutmalı.
   */
  petBlasts: { x: number; y: number; r: number }[] = [];

  /**
   * Pet VURUŞ ÇİZGİSİ — SADECE ÇİZİM İÇİN.
   *
   * ⚠️ NİYE VAR: striker 260 piksele kadar ANINDA vuruyordu. Hasar gerçekten
   * uygulanıyordu (ölçüm: 60 sn'de 17 vuruş, hasarın %10,8'i) ama ekranda
   * pet ile kurbanı birbirine bağlayan HİÇBİR ŞEY yoktu. Oyuncunun gördüğü
   * "yanımda yürüyen bir şey" idi — tam olarak şikâyet de buydu.
   *
   * ⚠️ MERMİ NESNESİ YAPILMADI. Uçan bir mermi motora durum ve zamanlama
   * ekler; `SIM_SEAL` mühürlü ve pet zaten `damageEnemy` üzerinden RNG
   * tüketiyor. Çizgi tamamen kozmetik: hasar zaten uygulandı, bu kuyruk
   * sadece "nereden nereye" bilgisini taşıyor.
   */
  petStrikes: { x0: number; y0: number; x1: number; y1: number }[] = [];

  /**
   * Warden koruma darbesi — SADECE ÇİZİM İÇİN.
   *
   * ⚠️ Warden'ın oyuncuya tek geri bildirimi can barının kıpırdamasıydı ve
   * o da savaşın ortasında görülmüyor. İyileşme anında oyuncunun üstünde
   * görünür bir darbe olmazsa warden "hiçbir şey yapmayan pet" olarak
   * okunuyor.
   */
  petWards: { x: number; y: number }[] = [];

  /**
   * Düşman tipi → bu koşuda öldürülen sayı. Pet bağlamanın oynanış koşulu
   * buradan besleniyor (bkz. pets.ts BIND).
   *
   * ⚠️ Tavanı YOK ve olmamalı: bu bir kozmetik kuyruk değil, koşunun ÖZETİ.
   * Sözlük en fazla düşman tipi kadar anahtar tutar (21) — sınırsız büyüyen
   * bir dizi değil.
   */
  killsByType: Record<string, number> = {};

  /**
   * Ses ipuçları. Set kullanılıyor çünkü aynı frame'de 200 ölüm olsa da
   * tek 'kill' sesi çalınacak — dizi olsaydı sınırsız büyürdü.
   * Ses katmanı her frame boşaltır; simülasyonu ETKİLEMEZ.
   */
  events = new Set<string>();

  // ⚠️ Girdi de `Hero`'da (`hero.inx/iny`) — 1v1'de iki ayrı girdi olacak.
  // Bu erişimciler motorun eski `this.inx` yazımını olduğu gibi çalıştırıyor.
  private get inx() { return this.hero.inx; }
  private set inx(v: number) { this.hero.inx = v; }
  private get iny() { return this.hero.iny; }
  private set iny(v: number) { this.hero.iny = v; }

  // dahili
  private spawnAcc = 0;
  private spawnCount = 0; // sadece kozmetik animasyon ofseti için (RNG değil)
  private grid = new SpatialHash<Enemy>(64);
  private scratch: Enemy[] = [];
  /** ekran yarı-boyutu — spawn ringi için (render katmanı bildirir) */
  private viewW = 800;
  private viewH = 600;

  // ⚠️ `permanent` de `Hero`'da — 1v1'de iki dövüşçünün Forge ağacı,
  // ekipmanı ve becerileri AYRI. Yukarıdaki erişimci eski okumayı koruyor.

  constructor(
    seed: number,
    stageDef: StageDef = STAGES[0],
    permanent: Partial<Record<StatKey, number>> = {},
    mode: RunMode = 'campaign',
    heroId: string = DEFAULT_HERO,
    /**
     * Descent'in başlayacağı derinlik (checkpoint). 1 = merdivenin başı.
     *
     * ⚠️ İSTEMCİ BUNU SEÇEMEZ. Sunucu `/run/start`'ta oyuncunun ödemesi
     * yapılmış derinliğine bakıp izin verilen değeri KENDİ belirler ve Run
     * kaydına yazar; koşu kapanırken de istemcinin gönderdiğini değil o
     * kayıttaki değeri kullanır. Aksi hâlde "derinlik 400'den başladım,
     * 401'i temizledim" tek koşuda servet basardı.
     */
    startDepth = 1,
    /**
     * ASCENSION kademesi (0 = kapalı). Descent'te zorluk ve sıralama puanını
     * ölçekler.
     *
     * ⚠️ İSTEMCİ BUNU SEÇEBİLİR AMA SUNUCU DOĞRULAR. `/run/start` oyuncunun
     * ulaştığı derinliğe bakıp izin verilen kademeyi kendi belirler ve Run
     * kaydına yazar; kapanışta da istemcinin gönderdiğini değil o kaydı
     * kullanır. Aksi hâlde herkes 10. kademeyi seçip puan uydururdu.
     *
     * ⚠️ 0'da HİÇBİR ÇARPAN uygulanmaz — eski seed'ler bit bit aynı.
     */
    ascension = 0,
    /**
     * Level-up havuzuna girebilecek TABAN silah id'leri (bkz. `unlocks.ts`).
     *
     * ⚠️ VARSAYILAN `null` = HEPSİ AÇIK. Bu bilinçli: motorun eski
     * çağrıları (testler, mühür koşusu, sunucu doğrulaması) davranış
     * değiştirmesin. Kilit bir OYUNCU ilerlemesi kavramı; motor onu
     * bilmiyor, sadece verilen listeye uyuyor.
     *
     * ⚠️ Motor `Progress` ALMIYOR ve almamalı — DOM'suz ve saf kalması
     * sunucuda koşabilmesinin şartı. Kilidi dışarıda çözüp buraya sadece
     * sonucu vermek o sınırı koruyor.
     */
    allowedWeapons: readonly string[] | null = null,
    /**
     * Koşuya giren BAĞLANMIŞ YOLDAŞLAR (bkz. pets.ts `RunPet`).
     *
     * ⚠️ VARSAYILAN BOŞ — `allowedWeapons: null` ile aynı gerekçe: motorun
     * eski çağrıları (mühür koşusu, kampanya ölçümü, sunucu doğrulaması)
     * davranış değiştirmesin. Pet vurmaya başladığı anda `damageEnemy`
     * fazladan `rng.next()` tüketir ve aynı seed BAŞKA koşu üretir; bu
     * kabul edilebilir bir değişiklik AMA sadece oyuncu gerçekten pet
     * taşıyorsa.
     *
     * ⚠️ Motor nadirlik/seviye/füzyon/gold BİLMEZ. Onlar `Progress`e ait ve
     * `Progress` motora hiç girmiyor — dışarıda çözülüp buraya yalnızca
     * sonuç (`RunPet`) veriliyor.
     *
     * ⚠️ FORAGER BURAYA VERİLMEZ; katkısı `permanent` üzerinden gelir.
     */
    pets: readonly RunPet[] = [],
  ) {
    this.seed = seed;
    this.rng = createRng(seed);
    this.allowedWeapons = allowedWeapons ? new Set(allowedWeapons) : null;
    const hero = heroById(heroId);
    // Karakter eğilimi Forge bonuslarıyla AYNI kanaldan geçer — ayrı bir kod
    // yolu yok, ikisi toplanır. Sunucu da aynı fonksiyonu çalıştırabilir.
    this.hero = new Hero(hero.id, mergeStats(hero.stats, permanent));
    this.hero.pets = pets
      .filter((p) => p.role !== 'forager')
      .map((def) => ({
        def, x: 0, y: 0,
        // ⚠️ İLK EYLEM HEMEN DEĞİL. Koşunun ilk karesinde pet vursaydı,
        // oyuncu daha hareket etmeden ekranda açıklanamayan bir hasar
        // görürdü. Yarım bekleme, "yanımda bir şey var" sinyalini de veriyor.
        cd: def.cd * 0.5,
        anim: 'walk' as const, animT: 0, animLeft: 0, facingRight: true,
      }));
    // Verilen stageDef sadece "hangi bölümün merdiveni" bilgisini taşır,
    // descent'te asıl tanım descentStage()'ten gelir
    this.ascension = Math.max(0, Math.min(ASCENSION.max, Math.floor(ascension)));
    const start = mode === 'descent' ? Math.max(1, Math.floor(startDepth)) : 0;
    const startDef = mode === 'descent' ? descentStage(stageDef.id, start, this.ascension) : stageDef;
    this.baseStageId = stageDef.id;
    this.startDepth = start;
    this.stage = {
      def: startDef,
      toSpawn: startDef.enemyCount,
      killed: 0,
      bossSpawned: false,
      mode,
      depth: start,
      // ⚠️ 0'DAN BAŞLAR, start−1'den değil: bu alan "BU koşuda temizlenen en
      // derin seviye" demek. Checkpoint'ten başlayan oyuncu d15'i bu koşuda
      // OYNAMADI; oraya yazmak oynanmamış bir derinliği iddia etmek olurdu.
      deepestCleared: 0,
    };
    // Checkpoint'e kadarki seviyeler bekleyen level-up olarak kuyruğa girer —
    // oyuncu kartları normal ekrandan kendi seçer (bkz. startLevelFor)
    this.pendingLevels = start > 1 ? Math.max(0, startLevelFor(start) - 1) : 0;
    this.recomputeStats(this.hero);          // kalıcı bonuslar daha ilk kareden geçerli
    this.hp = this.stats.maxHp;     // +max can alındıysa dolu başla
    // Başlangıç silahı KARAKTERDEN gelir (VS'te her karakterin imza silahı var)
    this.giveWeapon(this.hero, hero.weapon);
  }

  /** Bölümde kalan düşman (salınmamış + sahnedeki). 0 = bölüm bitti. */
  get remaining() {
    return this.stage.toSpawn + this.enemies.length;
  }

  private giveWeapon(h: Hero, id: string) {
    const def = WEAPONS.find((w) => w.id === id);
    if (!def || h.weapons.length >= MAX_WEAPONS) return;
    if (h.weapons.some((w) => w.def.id === id)) return;
    h.weapons.push({ def, level: 1, cd: 0 });
  }

  private givePassive(h: Hero, id: string) {
    const def = PASSIVES.find((p) => p.id === id);
    if (!def || h.passives.length >= MAX_PASSIVES) return;
    if (h.passives.some((p) => p.def.id === id)) return;
    h.passives.push({ def, level: 1 });
    this.recomputeStats(this.hero);
  }

  /**
   * İstatistikleri pasiflerden YENİDEN HESAPLA.
   * Artımlı yazmak yerine türetmek kasıtlı: seviye/pasif değişince tek doğru
   * kaynak var, kayan yuvarlama hatası birikmiyor ve tavanlar tek yerde uygulanıyor.
   */
  private recomputeStats(h: Hero) {
    const s: Stats = { ...STAT_BASE };

    // KALICI yükseltmeler (The Forge) tabana eklenir — run boyunca sabit.
    // maxHp yüzde olarak geldiği için ayrı ele alınır; diğerleri toplamsal.
    let permHpPct = 0;
    for (const k of Object.keys(h.permanent) as StatKey[]) {
      const v = h.permanent[k] ?? 0;
      if (!v) continue;
      if (k === 'maxHp') permHpPct += v;
      else s[k] += v;
    }
    if (permHpPct) s.maxHp = PLAYER.maxHp * (1 + permHpPct);

    // Run içi pasifler bunun ÜSTÜNE biner
    let runHpPct = 0;
    for (const p of h.passives) {
      const add = p.def.perLevel * p.level;
      if (p.def.stat === 'cooldown') s.cooldown -= add;      // bekleme AZALIR
      else if (p.def.stat === 'maxHp') runHpPct += add;
      else s[p.def.stat] += add;
    }
    if (runHpPct) s.maxHp = PLAYER.maxHp * (1 + permHpPct + runHpPct);
    // VS tavanları
    for (const k of Object.keys(STAT_CAP) as StatKey[]) {
      const cap = STAT_CAP[k]!;
      if (s[k] > cap) s[k] = cap;
    }
    if (s.cooldown < COOLDOWN_FLOOR) s.cooldown = COOLDOWN_FLOOR;
    h.stats = s;
    if (h.hp > s.maxHp) h.hp = s.maxHp;
  }

  /** Silahın o seviyedeki hasarı — Might çarpanı uygulanır */
  private wDamage(h: Hero, w: OwnedWeapon) {
    return weaponDamageAt(w.def, w.level) * h.stats.might;
  }

  /**
   * Oyuncunun TOPLAM saniyelik hasarı — pet gücünün çıpası.
   *
   * ⚠️ NEDEN TOPLAM DPS, "en güçlü silah" DEĞİL: pet katkısı build'in
   * tamamına oranlanmalı. Tek silaha oranlansaydı, çok silahlı bir oyuncuda
   * pet görünmez, tek silahlı bir oyuncuda ezici olurdu — aynı `share`
   * sayısı iki build'de bambaşka anlama gelirdi.
   *
   * ⚠️ RNG TÜKETMEZ, sadece okur. Saf hesap.
   */
  private heroDps(h: Hero): number {
    let dps = 0;
    for (let i = 0; i < h.weapons.length; i++) {
      const w = h.weapons[i];
      // ⚠️ Bekleme 0'a bölünmeye karşı korunuyor: `cooldown` istatistiği
      // yeterince düşerse gerçek bir koşuda sıfıra yaklaşabiliyor ve
      // Infinity hasar üretirdi.
      dps += this.wDamage(h, w) / Math.max(0.05, this.wCooldown(h, w));
    }
    return dps;
  }

  /**
   * BAĞLANMIŞ YOLDAŞLAR (bkz. pets.ts).
   *
   * ⚠️ RNG KULLANMAZ. Hedef seçimi `nearestEnemyTo` (mesafeye göre, eşitlikte
   * ızgara sırasına göre belirli), zamanlama bekleme sayacı. Tek rastgelelik
   * `damageEnemy` içindeki kritik zarı ve o zaten HER vuruşta atılıyor.
   *
   * ⚠️ PET `enemies` DİZİSİNE GİRMEZ. Ölmekte olan düşman dersinin aynısı:
   * motora giren her varlık çarpışma, ızgara ve temizlik yollarının hepsine
   * girer; pet bunların hiçbirine ait değil.
   */
  private updatePets(h: Hero, dt: number) {
    // ⚠️ ERKEN ÇIKIŞ ŞART: pet'i olmayan koşuda tek satır bile çalışmamalı ki
    // `SIM_SEAL` bit bit korunsun.
    if (!h.pets.length) return;

    const dps = this.heroDps(h);
    for (let i = 0; i < h.pets.length; i++) {
      const p = h.pets[i];

      // ── TAKİP ── oyuncunun iki yanında, yaylı. Sabit ofset yerine yay,
      // pet'in oyuncuya yapışık görünmesini engelliyor; koşarken geride
      // kalıp durunca yetişiyor, yani "canlı" duruyor.
      const hedefX = h.px + (i === 0 ? -34 : 34);
      const hedefY = h.py + 24;
      const k = Math.min(1, dt * 6);
      const oncekiX = p.x;
      p.x += (hedefX - p.x) * k;
      p.y += (hedefY - p.y) * k;
      if (Math.abs(p.x - oncekiX) > 0.01) p.facingRight = p.x > oncekiX;

      // ── SUNUM ── animasyon sayacı; mantığı beslemez
      p.animT += dt;
      if (p.animLeft > 0) {
        p.animLeft -= dt;
        if (p.animLeft <= 0) { p.anim = 'walk'; p.animT = 0; }
      }

      // ── EYLEM ──
      p.cd -= dt;
      if (p.cd > 0) continue;

      const d = p.def;
      if (d.role === 'warden') {
        // ⚠️ Ölü oyuncuyu diriltmez — diriliş ayrı bir sistem (Second Burial)
        // ve pet onun yerine geçmemeli.
        if (h.alive && h.hp < h.stats.maxHp) {
          h.hp = Math.min(h.stats.maxHp, h.hp + h.stats.maxHp * d.share);
          p.cd = d.cd;
          p.anim = 'bless'; p.animT = 0; p.animLeft = 0.8;
          if (this.petWards.length < 12) this.petWards.push({ x: h.px, y: h.py });
        } else {
          // Canı doluysa bekleme SIFIRLANMAZ — bir sonraki karede tekrar
          // bakılır, yoksa tam dolu oyuncuda iyileşme sonsuza kadar ertelenir
          p.cd = 0;
        }
        continue;
      }

      // striker / channeler — hedef yoksa bekleme sıfırlanmaz, menzile giren
      // ilk düşmana hemen vurulur (pet "hazır bekliyor" hissi)
      const menzil = d.role === 'channeler' ? 340 : 260;
      const hedef = this.nearestEnemyTo(p.x, p.y, menzil);
      if (!hedef) { p.cd = 0; continue; }

      // vuruş başına hasar = share × oyuncu DPS × bekleme (bkz. pets.ts)
      const vurus = dps * d.share * d.cd;
      if (d.role === 'striker') {
        this.damageEnemy(h, hedef, vurus, 'pet');
        p.anim = 'attack';
        // ⚠️ Tavan UZUNLUK kontrolüyle — zaman ya da rng örneklemesi
        // determinizmi bozar (diğer kozmetik kuyrukların kuralı).
        if (this.petStrikes.length < 24) {
          this.petStrikes.push({ x0: p.x, y0: p.y, x1: hedef.x, y1: hedef.y });
        }
      } else {
        // ⚠️ ALAN HASARI HEDEFİN ÜSTÜNDE PATLAR, pet'in üstünde değil —
        // yoksa pet'ten uzaktaki sürü hiç vurulmaz ve rol anlamsızlaşır.
        const r2 = d.radius * d.radius;
        const cand = this.grid.query(hedef.x, hedef.y, d.radius, this.scratch);
        for (let j = 0; j < cand.length; j++) {
          const e = cand[j];
          if (e.hp <= 0) continue;
          const dx = e.x - hedef.x, dy = e.y - hedef.y;
          if (dx * dx + dy * dy > r2) continue;
          this.damageEnemy(h, e, vurus, 'pet');
        }
        p.anim = 'cast';
        // ⚠️ TAVAN: headless sunucuda bu kuyruğu kimse boşaltmıyor. Diğer
        // kozmetik kuyrukların kuralının aynısı — uzunluk kontrolü, zaman ya
        // da rng örneklemesi DEĞİL.
        if (this.petBlasts.length < 24) this.petBlasts.push({ x: hedef.x, y: hedef.y, r: d.radius });
      }
      p.animT = 0; p.animLeft = 0.55;
      p.cd = d.cd;
    }
  }
  /**
   * Arayüz için: bu silahın ŞU ANKİ tam soğuma süresi (seviye + istatistik).
   *
   * ⚠️ HUD `w.def.cooldownSec` (HAM TABAN) ile bölüyordu. `w.cd` ise gerçek
   * soğumayla dolduruluyor — yani soğuma indirimi olan bir oyuncuda halka
   * hiçbir zaman tamamlanmıyor, cezası olanda tavana yapışıyordu. Onluk
   * atama noktasına ayrı ayrı `cdMax` yazmak yerine tek okuma noktası:
   * sapması imkânsız.
   */
  cooldownMaxOf(w: OwnedWeapon): number {
    return Math.max(0.001, this.wCooldown(this.hero, w));
  }

  /** Silahın o seviyedeki bekleme süresi — Cooldown istatistiği uygulanır */
  private wCooldown(h: Hero, w: OwnedWeapon) {
    return weaponCooldownAt(w.def, w.level) * h.stats.cooldown;
  }
  /** Alan çarpanı (sweep/orbit/aura) — Area istatistiği uygulanır */
  private wArea(h: Hero, w: OwnedWeapon) {
    return Math.pow(w.def.areaPerLevel ?? 1, w.level - 1) * h.stats.area;
  }
  /** Adet (mermi/orb) — countLevels eşikleri + Amount istatistiği */
  private wCount(h: Hero, w: OwnedWeapon) {
    return weaponCountAt(w.def, w.level) + h.stats.amount;
  }

  setInput(x: number, y: number) {
    const m = Math.hypot(x, y);
    if (m > 1e-4) { this.inx = x / m; this.iny = y / m; } else { this.inx = 0; this.iny = 0; }
  }

  /**
   * ⚠️ GÖRÜŞ ALANI SİMÜLASYONU ETKİLİYOR — doğum halkasının yarıçapı
   * buradan geliyor (`spawn`). Yani PENCERE BOYUTU dünyayı değiştiriyor.
   *
   * Solo'da zararsız (herkes kendi koşusunu oynuyor) ama 1v1'de ÖLÜMCÜL:
   * dizüstünde 1280×720, masaüstünde 2560×1440 oynayan iki oyuncu FARKLI
   * düşmanlar görür ve lockstep sessizce çöker — kimse hata mesajı görmez,
   * sadece iki oyun ayrışır.
   *
   * `lockViewport` bu yüzden var: arena kurulurken sabit bir görüş alanı
   * mühürleniyor ve render katmanının `setViewport` çağrıları yok sayılıyor.
   */
  private viewLocked = false;

  setViewport(w: number, h: number) {
    if (this.viewLocked) return;
    this.viewW = w; this.viewH = h;
  }

  /** Arena modunda görüş alanını SABİTLE — bkz. setViewport başlığı */
  lockViewport(w: number, h: number) {
    this.viewW = w; this.viewH = h;
    this.viewLocked = true;
  }

  get minute() { return this.time / 60; }

  /** Bir sabit tick ilerlet. dt HER ZAMAN TICK'tir — değişken dt kabul edilmez. */
  step() {
    if (this.phase !== 'running') return;
    // BAŞLANGIÇ DRAFT'I — checkpoint'ten başlayan koşuda birikmiş seviyeler
    // sırayla sunulur. Saat ilerlemeden ÖNCE, çünkü draft oyun süresi değil.
    if (this.pendingLevels > 0) {
      this.pendingLevels -= 1;
      this.levelUp(this.hero);
      return;
    }
    const dt = TICK;
    this.time += dt;
    // Güvenlik tavanı — bölüm bir şekilde bitmezse run sonsuza kadar sürmesin
    if (this.time >= RUN.durationSec) { this.phase = 'dead'; return; }

    // ⚠️ RAKİP SIRASI SABİT: önce birinci dövüşçü, sonra rakip. Sıra
    // değişkense aynı seed aynı koşuyu üretmez.
    const r = this.rival;
    this.moveHero(this.hero, dt);
    if (r && r.alive) this.moveHero(r, dt);
    this.rebuildGrid();
    this.spawnBoss();
    this.spawn(dt);
    this.moveEnemies(dt);
    this.fire(this.hero, dt);            // 4 desen: aimed / sweep / orbit / aura
    if (r && r.alive) this.fire(r, dt);
    // ⚠️ Pet'ler silahlardan SONRA: ikisi de `damageEnemy` çağırıyor ve
    // `reapDead` ikisinin ardından tek seferde temizliyor. Araya girseydi
    // aynı karede iki kez ölüm işlenebilirdi.
    this.updatePets(this.hero, dt);
    if (r && r.alive) this.updatePets(r, dt);
    this.updateHitZones(dt);  // sweep hitbox'ları
    this.moveProjectiles(dt);
    this.collideProjectiles();
    this.reapDead();          // TÜM hasar kaynaklarından sonra tek temizlik
    this.collideHero(this.hero, dt);
    if (r && r.alive) this.collideHero(r, dt);
    this.updateEnemyShots(dt);
    this.updateGems(this.hero, dt);
    // ⚠️ MÜCEVHER SIRASI ÖNEMLİ: birinci dövüşçü önce topluyor. Aynı
    // mücevheri iki kişi alamaz (toplanan diziden çıkıyor); sıra sabit
    // olmasa aynı seed iki farklı sonuç verirdi.
    if (r && r.alive) this.updateGems(r, dt);
    this.updateChests();

    this.regen(this.hero, dt);
    if (r && r.alive) this.regen(r, dt);

    // BÖLÜM TAMAMLANDI: havuz boş, sahne temiz, boss (varsa) devrilmiş.
    // Sandık bekleyen varsa bitirme — oyuncu evrim sandığını kaçırmasın.
    if (this.remaining === 0 && this.chests.length === 0) {
      const needsBoss = !!this.stage.def.boss && !this.stage.bossSpawned;
      if (!needsBoss) {
        if (this.stage.mode === 'descent') this.advanceDepth();
        else this.phase = 'won';
      }
    }
  }

  /**
   * Bir derinlik temizlendi → bir alta in. Koşu BİTMEZ.
   *
   * ⚠️ CAN DOLDURULMAZ. Descent'i bitiren şey zamanlayıcı değil canın:
   * ne kadar hasarsız oynadıysan o kadar derine inersin. Burada HP'yi
   * doldurmak modu sonsuz ve anlamsız hale getirir.
   * Silah/pasif/level de korunur — merdiven boyunca build büyür.
   */
  private advanceDepth() {
    this.stage.deepestCleared = this.stage.depth;
    const next = this.stage.depth + 1;
    const def = descentStage(this.baseStageId, next, this.ascension);
    this.stage.def = def;
    this.stage.depth = next;
    this.stage.toSpawn = def.enemyCount;
    this.stage.killed = 0;
    this.stage.bossSpawned = false;
    this.spawnAcc = 0;
    this.events.add('depth');
  }

  /** Yenilenme + dokunulmazlık sayacı — dövüşçü başına */
  private regen(h: Hero, dt: number) {
    if (h.stats.recovery > 0 && h.hp > 0) {
      h.hp = Math.min(h.stats.maxHp, h.hp + h.stats.recovery * dt);
    }
    if (h.iframe > 0) h.iframe -= dt;
  }

  /**
   * İKİNCİ DÖVÜŞÇÜYÜ SAHNEYE KOY — gerçek zamanlı 1v1.
   *
   * ⚠️ KOŞU BAŞLAMADAN ÖNCE çağrılmalı. Ortada çağırmak, iki istemcinin
   * simülasyonlarını ayrıştırır: lockstep'te herkes AYNI tick'te AYNI
   * dünyayı görmek zorunda.
   *
   * ⚠️ Rakip arenanın öbür yanında doğuyor — üst üste doğsalar ilk saniyede
   * birbirlerinin düşmanlarını çekip maçı adaletsiz açarlardı.
   */
  addRival(heroId: string, permanent: Partial<Record<StatKey, number>> = {}): Hero {
    const def = heroById(heroId);
    const r = new Hero(def.id, mergeStats(def.stats, permanent));
    r.px = RUN.arenaRadius * 0.25;
    r.py = 0;
    this.hero.px = -RUN.arenaRadius * 0.25;
    this.rival = r;
    this.recomputeStats(r);
    r.hp = r.stats.maxHp;
    this.giveWeapon(r, def.weapon);
    return r;
  }

  /** Rakibin girdisi — 1v1'de ağdan gelir */
  setRivalInput(x: number, y: number) {
    const r = this.rival;
    if (!r) return;
    const m = Math.hypot(x, y);
    if (m > 1e-4) { r.inx = x / m; r.iny = y / m; } else { r.inx = 0; r.iny = 0; }
  }

  /**
   * Düşmanın hedefi — YAŞAYAN en yakın dövüşçü.
   *
   * ⚠️ `rival` yokken birinci dövüşçüyü döndürüyor, yani solo davranış
   * birebir aynı ve hiç RNG tüketmiyor.
   */
  private target(x: number, y: number): Hero {
    const r = this.rival;
    if (!r || !r.alive) return this.hero;
    if (!this.hero.alive) return r;
    const a = (this.hero.px - x) ** 2 + (this.hero.py - y) ** 2;
    const b = (r.px - x) ** 2 + (r.py - y) ** 2;
    return b < a ? r : this.hero;
  }

  private moveHero(h: Hero, dt: number) {
    const sp = PLAYER.speed * h.stats.moveSpeed;
    h.px += h.inx * sp * dt;
    h.py += h.iny * sp * dt;
    h.animT += dt;
    if (h.atkT > 0) h.atkT = Math.max(0, h.atkT - dt);
    if (h.hurtT > 0) h.hurtT = Math.max(0, h.hurtT - dt);
    h.moving = h.inx !== 0 || h.iny !== 0;
    if (h.inx > 0.01) h.facingRight = true;
    else if (h.inx < -0.01) h.facingRight = false;
    // arena sınırı
    const d = Math.hypot(h.px, h.py);
    if (d > RUN.arenaRadius) {
      h.px = (h.px / d) * RUN.arenaRadius;
      h.py = (h.py / d) * RUN.arenaRadius;
    }
  }

  private rebuildGrid() {
    this.grid.clear();
    for (let i = 0; i < this.enemies.length; i++) {
      const e = this.enemies[i];
      this.grid.insert(e.x, e.y, e);
    }
  }

  /** Bölümün düşman havuzu (config'den) — en az 1 tip garanti */
  private availableTypes(): readonly EnemyType[] {
    const ids = this.stage.def.enemies;
    const list = ENEMIES.filter((t) => ids.includes(t.id));
    return list.length ? list : [ENEMIES[0]];
  }

  /**
   * Ağırlıklı düşman seçimi — özel tipler NADİR olsun.
   *
   * ⚠️ TEK ZAR TÜKETİR, tıpkı `rng.pick` gibi. Tüketilen zar sayısı değişseydi
   * RNG akışı kayar ve mühür kırılırdı. Ağırlıkların hepsi 1 olduğunda bu
   * fonksiyon `pick` ile BİREBİR aynı sonucu veriyor — 1. bölüm (imp/rogue)
   * bu yüzden hiç etkilenmedi ve `SIM_SEAL` korundu.
   */
  private pickWeighted(types: readonly EnemyType[]): EnemyType {
    let toplam = 0;
    for (let i = 0; i < types.length; i++) toplam += types[i].weight ?? 1;
    let r = this.rng.range(0, toplam);
    for (let i = 0; i < types.length; i++) {
      r -= types[i].weight ?? 1;
      if (r < 0) return types[i];
    }
    // kayan nokta artığı — son elemana düş (asla `undefined` dönme)
    return types[types.length - 1];
  }

  private spawn(dt: number) {
    const st = this.stage;
    if (st.toSpawn <= 0) return; // havuz bitti — bölümdeki her düşman salındı

    // Curse (Cursed Skull): düşman hızı/canı/sıklığı artar — VS ile aynı.
    // Bölüm sisteminde ADET artmaz (havuz sabit), sadece güç ve hız artar;
    // yoksa gold tavanı ile düşman sayısı arasındaki bağ kopardı.
    const curse = this.stats.curse;
    const rate = st.def.spawnRate * curse;
    this.spawnAcc += rate * dt;
    const types = this.availableTypes();
    const hpScale = st.def.hpMul * curse;
    const spScale = st.def.speedMul * curse;
    // ⚠️ Hasar çarpanı `curse` ile ÇARPILMIYOR. Curse zaten can+hız+sıklık
    // artırıyor; hasarı da eklemek onu tek başına ölümcül yapardı ve Forge
    // satırı "alma" tuzağına dönerdi.
    const dmgScale = st.def.damageMul ?? 1;

    while (this.spawnAcc >= 1) {
      this.spawnAcc -= 1;
      if (st.toSpawn <= 0) { this.spawnAcc = 0; break; }
      if (this.enemies.length >= st.def.maxAlive) { this.spawnAcc = 0; break; }
      st.toSpawn -= 1;
      const t = this.pickWeighted(types);
      // ekran dikdörtgeninin dışındaki bir elipste doğ
      const ang = this.rng.range(0, Math.PI * 2);
      const rx = this.viewW / 2 + SPAWN.ringMargin;
      const ry = this.viewH / 2 + SPAWN.ringMargin;
      // `rival` yokken her zaman birinci dövüşçü — solo davranış birebir aynı
      const r = this.rival;
      const anchor = r && r.alive && this.hero.alive
        ? (this.spawnCount % 2 === 0 ? this.hero : r)
        : (this.hero.alive ? this.hero : (r ?? this.hero));
      this.enemies.push({
        typeId: t.id,
        // ⚠️ DOĞUM MERKEZİ SIRAYLA. Halka birinci dövüşçüye sabitliyken
        // ölçüldü: rakip 25 saniyede SIFIR düşman gördü, sürünün tamamı bir
        // tarafa yığıldı (6 / 0). Paylaşılan arena, paylaşılan sürü demek —
        // yoksa iki oyuncu aynı haritada iki ayrı oyun oynuyor.
        // Sıra `spawnCount` paritesinden geliyor: deterministik, RNG yemiyor.
        x: anchor.px + Math.cos(ang) * rx,
        y: anchor.py + Math.sin(ang) * ry,
        hp: t.hp * hpScale, maxHp: t.hp * hpScale,
        speed: t.speed * spScale, damage: t.damage * dmgScale, radius: t.radius,
        xp: t.xp, color: t.color, hitFlash: 0,
        // animT KOZMETİK → rng'den ALINMAZ. Aksi hâlde bir görsel değişiklik
        // RNG akışını kaydırır ve aynı günlük seed başka bir run üretir.
        // Spawn sayacından türetiliyor: deterministik, çeşitli, RNG'ye dokunmuyor.
        art: t.art, animT: (this.spawnCount * 0.37) % 2, facingRight: true,
        contactCd: 0,
        behavior: t.behavior ?? 'chase',
        // Ateş/salınım fazları spawn sayacından türetiliyor: deterministik ve
        // çeşitli, ama RNG akışına DOKUNMUYOR. rng'den alsaydık kozmetik bir
        // ekleme aynı günlük seed'in başka bir run üretmesine yol açardı.
        atkCd: BEHAVIOR.ranged.fireCd * (0.35 + ((this.spawnCount * 0.61) % 1) * 0.65),
        cState: 0, cdx: 0, cdy: 0,
        phase: (this.spawnCount++ * 1.13) % (Math.PI * 2),
      });
    }
  }

  /**
   * Bölüm boss'u — havuzdaki tüm normal düşmanlar salınıp ölünce gelir.
   * Yani boss bölümün FİNALİ, zaman bazlı değil ilerleme bazlı.
   */
  private spawnBoss() {
    const st = this.stage;
    const b = st.def.boss;
    if (!b || st.bossSpawned) return;
    if (st.toSpawn > 0 || this.enemies.length > 0) return; // önce sürü temizlensin
    st.bossSpawned = true;

    // Curse boss'u da güçlendirir — pasifin riski her yerde tutarlı olmalı
    const hp = b.hp * this.stats.curse;
    const ang = this.rng.range(0, Math.PI * 2);
    const rx = this.viewW / 2 + SPAWN.ringMargin;
    const ry = this.viewH / 2 + SPAWN.ringMargin;
    this.enemies.push({
      typeId: 'boss',
      x: this.px + Math.cos(ang) * rx,
      y: this.py + Math.sin(ang) * ry,
      hp, maxHp: hp,
      speed: b.speed, damage: b.damage, radius: b.radius,
      xp: 400, color: '#a01226', hitFlash: 0,
      art: b.art, animT: 0, facingRight: true, contactCd: 0,
      // Boss KOVALAR. Menzilli/hücumcu bir boss tek başına sahnedeyken
      // mesafe tutarsa bölüm finali sonsuza kadar uzar.
      behavior: 'chase', atkCd: 0, cState: 0, cdx: 0, cdy: 0, phase: 0,
      boss: {
        label: b.label, evolutionChest: true,
        intro: BOSS.introSec, phase: 0, atkCd: BOSS.atkCd,
        telegraph: 0,
        // ⚠️ Yarıçap ARKETİPE GÖRE. `keeper` daha geniş (kaçarak çıkmak zor,
        // içeri girmek kolay olsun), `harrower` daha dar (iki darbe üst üste
        // biniyor; tam yarıçapta olsalardı kaçınmak imkânsızlaşırdı).
        slamR: BOSS.slamRadius * BOSS_ARCH[bossArchetypeOf(st.def)].radiusMul,
        arch: bossArchetypeOf(st.def), atkNo: 0, followUp: 0,
        // ⚠️ İlk küre HEMEN atılmıyor: giriş sekansının hemen ardından gelen
        // bir mermi, oyuncunun boss'u daha görmeden vurulması demekti.
        orbCd: BOSS.orbCd,
      },
    });
    this.events.add('boss');
  }

  /** Sandık toplama — evrim sandığıysa evrim dene, olmazsa ödüle çevir */
  private updateChests() {
    // Sürü temizlenince sandıklar oyuncuya AKAR.
    // Yoksa oyuncu sandığı fark etmezse bölüm asla bitmiyor (bitiş koşulu
    // sandık bekliyor) ve gold'unu alamadan kilitleniyor. Testte tam bu oldu.
    const cleared = this.stage.toSpawn === 0 && this.enemies.length === 0;
    for (let i = this.chests.length - 1; i >= 0; i--) {
      const c = this.chests[i];
      if (cleared) {
        const ddx = this.px - c.x, ddy = this.py - c.y;
        const d = Math.hypot(ddx, ddy) || 1;
        const pull = 420 * TICK;
        c.x += (ddx / d) * pull;
        c.y += (ddy / d) * pull;
      }
      const dx = c.x - this.px, dy = c.y - this.py;
      const rr = PLAYER.radius + CHEST_RADIUS;
      if (dx * dx + dy * dy > rr * rr) continue;

      this.swapRemove(this.chests, i);
      this.events.add('chest');
      const evolved = c.evolution ? this.tryEvolve(this.hero) : false;
      if (!evolved) {
        // Evrim yoksa sandık boşa gitmesin (VS: sandık altın/XP verir)
        this.rareGold += 200 * this.stats.greed;
        this.addXp(this.hero, 60);
      }
    }
  }

  /**
   * Evrim kuralı: taban silah YETERİNCE YÜKSEK + gereken pasif YETERİNCE
   * YÜKSEK + evrim sandığı. Uygun ilk eşleşme evrimleşir (VS'te de sandık
   * başına bir evrim).
   *
   * 🔴 ŞART GEVŞETİLDİ (2026-08-15): eskiden VS'in birebir kuralıydı —
   * silah MAX (lv8) + pasif MAX (lv5). ÖLÇÜLDÜ ve o şart bu oyunda
   * ULAŞILAMAZDI: 13 hedefli seçim istiyor, ilerlemiş oyuncu 23 seçim
   * alıyor ve bunları 4 silah + 6 pasife dağıtmak zorunda. Her kararını
   * tek çifte harcayan KASITLI bir avcı bile silahı ancak lv4,8'e
   * çıkarabiliyordu. Sonuç: 11 evrim yazılmış, sıfırı tetikleniyor.
   *
   * VS'te aynı şart çalışıyor çünkü VS oyuncusu koşu başına 60-100
   * level-up alıyor; bizde 23. Kuralı kopyalamak yetmiyor, ONU BESLEYEN
   * TEMPOYU da kopyalamak gerekiyordu — o yapılamayınca şart uyarlandı.
   *
   * ÖLÇÜM (6 seed, yarı Forge, kasıtlı avcı — `MAX_WEAPONS` 4 ile):
   *     şart MAX/MAX          → evrim 0
   *     şart maxLevel-2 / 3   → evrim 1,7 koşu başına
   *
   * ⚠️ MAKUL OYUNCU YİNE 0 GÖRÜYOR ve bu bilinçli kabul: evrim NİYET
   * istiyor, kaza değil. VS'te de oyuncu tarifi öğrenip ona göre kuruyor.
   * Buradaki iş "kazara evrim" üretmek değil, DENEYENİN ULAŞABİLMESİNİ
   * sağlamaktı. Level-up kartındaki evrim ipucu bu yüzden kritik.
   */
  private tryEvolve(h: Hero): boolean {
    for (const ev of EVOLUTIONS) {
      const w = h.weapons.find((x) => x.def.id === ev.weapon);
      if (!w || w.level < evrimSilahEsigi(w.def)) continue;
      const p = h.passives.find((x) => x.def.id === ev.passive);
      if (!p || p.level < evrimPasifEsigi(p.def)) continue;

      const to = weaponById(ev.to);
      if (!to) continue;
      // Taban silah gider, yerine evrimleşmiş gelir. Pasif KALIR (VS ile aynı).
      w.def = to;
      w.level = 1;
      w.cd = 0;
      this.lastEvolution = { name: to.name, at: this.time };
      this.events.add('evolve');
      return true;
    }
    return false;
  }

  private moveEnemies(dt: number) {
    // AV MODU: bölümün son düşmanları hızlanır ve sonunda oyuncudan HIZLI olur.
    //
    // Bölüm tabanlı oyunda kaçan son birkaç düşman oyuncuyu bölümde kilitler.
    // Testte Ossuary Halls 14 düşmanla 25 dakika sürdü ve hiç bitmedi: o bölümün
    // düşmanları oyuncudan yavaş, kaçanı ASLA yakalayamıyorlar.
    // Bu yüzden hız garantisi düşmanın kendi hızına değil OYUNCU hızına bağlandı —
    // son düşmanlardan kaçılamaz, dönüp savaşmak zorundasın. Bölüm her zaman yakınsar.
    // OYUN TESTİ DÜZELTMESİ: ilk sürüm eşiği 20'ydi ve tabanı oyuncu hızının
    // 1.15 katına çıkarıyordu → oyuncu "düşmanlar koşuyor, full canla öldüm" dedi.
    // 100 düşmanlık bölümde son %20'nin kaçılamaz olması kuşatma demek.
    // Artık SADECE son 8 düşman ve taban oyuncu hızının ALTINDA kalıyor:
    // kaçabilirsin ama mesafe açamazsın → menzilde kalırlar, silah onları biçer.
    // Yakınsama garantisi korunuyor, haksız hız yok.
    // ⚠️ HER TICK TAZELENİR, kalıcı tutulmaz: ölen bir haberci listede
    // kalsaydı sürüyü mezarından hızlandırmaya devam ederdi.
    this.heralds.length = 0;
    for (let i = 0; i < this.enemies.length; i++) {
      const e = this.enemies[i];
      if (e.behavior === 'herald' && e.hp > 0) this.heralds.push(e);
    }

    const left = this.remaining;
    const playerSpeed = PLAYER.speed * this.stats.moveSpeed;
    let huntFloor = 0;
    if (left > 0 && left <= 8) {
      const t = (8 - left) / 8;                    // 0 → 1 (azaldıkça artar)
      huntFloor = playerSpeed * (0.6 + 0.35 * t);  // son düşmanda ~0.95x oyuncu hızı
    }

    for (let i = 0; i < this.enemies.length; i++) {
      const e = this.enemies[i];
      // ⚠️ HEDEF DÜŞMAN BAŞINA: en yakın YAŞAYAN dövüşçü. `rival` yokken
      // her zaman birinci dövüşçü — solo davranış birebir aynı.
      const tg = this.target(e.x, e.y);
      const dx = tg.px - e.x;
      const dy = tg.py - e.y;
      const d = Math.hypot(dx, dy) || 1;
      const nx = dx / d, ny = dy / d;
      // HABERCİ AURASI — yakındaki habercinin hız çarpanı.
      // ⚠️ Habercinin KENDİSİNE uygulanmaz: uygulansaydı iki haberci
      // birbirini hızlandırır ve etki katlanırdı.
      // ⚠️ Boss'a da uygulanmaz — boss hızı kendi arketip mantığında.
      let auraMul = 1;
      if (!e.boss && e.behavior !== 'herald' && this.heralds.length > 0) {
        for (let k = 0; k < this.heralds.length; k++) {
          const hr = this.heralds[k];
          if (hr.hp <= 0) continue;
          const hdx = hr.x - e.x, hdy = hr.y - e.y;
          if (hdx * hdx + hdy * hdy <= BEHAVIOR.herald.auraR * BEHAVIOR.herald.auraR) {
            auraMul = BEHAVIOR.herald.speedMul;
            break;   // ⚠️ TEK KEZ — çarpanlar üst üste BİNMEZ
          }
        }
      }
      // ⚠️ BUFF TAVANI — haberci hiçbir düşmanı oyuncudan hızlı yapamaz.
      // Tavan düşmanın KENDİ hızını asla düşürmez: `Math.max(e.speed, ...)`
      // olmasaydı yavaş bir oyuncunun karşısındaki sürü buff'sız hâlinden bile
      // yavaşlar, yani haberci düşmanları KÖTÜLEŞTİRİRDİ.
      const buffed = auraMul > 1
        ? Math.min(e.speed * auraMul, Math.max(e.speed, playerSpeed * BEHAVIOR.herald.speedCap))
        : e.speed;
      const sp = e.boss ? e.speed : Math.max(buffed, huntFloor);

      // AV MODU davranışı EZER: son 8 düşman kaldığında herkes kovalar.
      // Menzilli/hücumcu bir düşman mesafe tutmaya devam ederse bölüm
      // kilitlenir; yakınsama garantisi her şeyin üstünde.
      // ⚠️ BOSS AYRI YOL — ama yine KOVALAR. Aşağıdaki hiçbir dal mesafe
      // tutmuyor; saldırı sadece DURARAK yapılıyor.
      if (e.boss) { this.moveBoss(e, dt, nx, ny, d, sp); continue; }

      const bh: Behavior = huntFloor > 0 ? 'chase' : e.behavior;

      switch (bh) {
        case 'ranged': this.moveRanged(e, dt, nx, ny, d, sp); break;
        case 'charger': this.moveCharger(e, dt, nx, ny, d, sp); break;
        case 'swarm': this.moveSwarm(e, dt, nx, ny, sp); break;
        case 'circler': this.moveCircler(e, dt, nx, ny, d, sp); break;
        case 'weave': {
          // İleri gitmeye devam eder ama yanal salınır → nişanlı mermiler ıskalar
          const s = Math.sin(this.time * BEHAVIOR.weave.freq + e.phase);
          e.x += (nx + -ny * s * BEHAVIOR.weave.amp) * sp * dt;
          e.y += (ny + nx * s * BEHAVIOR.weave.amp) * sp * dt;
          break;
        }
        default:
          e.x += nx * sp * dt;
          e.y += ny * sp * dt;
      }

      e.animT += dt;
      if (dx > 0.5) e.facingRight = true;
      else if (dx < -0.5) e.facingRight = false;
      if (e.hitFlash > 0) e.hitFlash -= dt;
      if (e.contactCd > 0) e.contactCd -= dt;
    }
  }

  /**
   * BOSS — giriş sekansı, iki faz, telegraflı yer darbesi.
   *
   * ⚠️ HİÇBİR DAL MESAFE TUTMAZ. Boss sahnedeki tek düşmanken kiting yaparsa
   * bölüm sonsuza kadar bitmez — repo bu tuzağa bir kez düştü (Ossuary Halls,
   * 25 dakika, hiç bitmedi). Saldırı DURARAK yapılır (telegraf zaten bir
   * duruştur) ve biter bitmez kovalamaya döner.
   *
   * ⚠️ Saldırı seçimi RNG KULLANMAZ. Hem determinizm hem okunabilirlik:
   * oyuncu kalıbı öğrenebilmeli, zar atılırsa öğrenilecek şey kalmaz.
   */
  private moveBoss(e: Enemy, dt: number, nx: number, ny: number, d: number, sp: number) {
    const b = e.boss!;

    // ── giriş: hareketsiz ve DOKUNULMAZ ──
    if (b.intro > 0) {
      b.intro -= dt;
      e.animT += dt;
      return;
    }

    // ── faz geçişi: canı yarıya inince öfkelenir ──
    if (b.phase === 0 && e.hp <= e.maxHp * BOSS.phase2At) {
      b.phase = 1;
      b.telegraph = 0;
      b.atkCd = BOSS.atkCd * BOSS.phase2Cd * 0.5;  // faz değişimi bir saldırıyı öne çeker
      this.events.add('boss');
    }
    const hiz = b.phase === 1 ? sp * BOSS.phase2Speed : sp;
    const A = BOSS_ARCH[b.arch];

    // ── İKİNCİ YETENEK: MEZAR KÜRESİ ──
    // ⚠️ TELEGRAF DALINDAN ÖNCE ve ondan BAĞIMSIZ. Aşağıdaki telegraf bloğu
    // erken `return` ediyor; küre oraya konsaydı boss saldırı hazırlarken
    // küre atamaz, yani tam da baskının gerektiği anda susardı.
    // ⚠️ Boss bu sırada DURMUYOR — küre kovalamanın üstüne biniyor. Durarak
    // atsaydı bu bir kiting biçimi olur ve bölüm kilitlenme riskine girerdi.
    b.orbCd -= dt;
    if (b.orbCd <= 0) {
      this.bossOrb(e, b);
      b.orbCd = BOSS.orbCd * (b.phase === 1 ? BOSS.phase2Cd : 1);
    }

    // ── `harrower`ın İKİNCİ darbesi ──
    // ⚠️ TELEGRAFSIZ ve bu kasıtlı: ikinci darbenin tamamı "ilk darbeden
    // sonra erken dönen"i cezalandırmak için var. Ona da kaçma penceresi
    // verilseydi arketip, `warden`ın iki kez tekrarından ibaret olurdu.
    // Boss bu sırada DURMAZ — kovalamaya devam eder, yani kiting yok.
    if (b.followUp > 0) {
      b.followUp -= dt;
      if (b.followUp <= 0) {
        const R = b.slamR * ('secondRadiusMul' in A ? A.secondRadiusMul : 1);
        const M = BOSS.slamDamageMul * ('secondDamageMul' in A ? A.secondDamageMul : 1);
        this.bossStrike(e, R, M, 0);
      }
    }

    // ── telegraf: darbe hazırlanıyor. Boss DURUR — bu kiting değil, oyuncuya
    //    kaçma penceresi; süre dolunca hemen kovalamaya dönüyor.
    if (b.telegraph > 0) {
      b.telegraph -= dt;
      e.animT += dt;
      if (b.telegraph <= 0) {
        b.atkNo += 1;
        this.bossResolve(e, b, A);
        b.atkCd = BOSS.atkCd * (b.phase === 1 ? BOSS.phase2Cd : 1);
      }
      return;
    }

    // ── normal: KOVALA ──
    e.x += nx * hiz * dt;
    e.y += ny * hiz * dt;
    e.animT += dt;

    // Saldırıyı sadece YAKINDAYKEN hazırla — uzaktan telegraf açmak hem
    // anlamsız hem oyuncuya bedava kaçış verir.
    b.atkCd -= dt;
    if (b.atkCd <= 0 && d < b.slamR * 1.6) {
      b.telegraph = BOSS.telegraphSec * A.telegraphMul;
      this.events.add('charge');
    }
  }

  /**
   * Telegraf dolunca ne oluyor — ARKETİPİN TAMAMI BURADA.
   *
   * ⚠️ Hiçbir dal boss'u HAREKET ETTİRMEZ ya da geri çekmez. Arketipler
   * saldırının ŞEKLİNİ değiştiriyor, boss'un mesafe politikasını değil:
   * hareket her zaman kovalama kalır (bkz. config BOSS başlığındaki kırmızı
   * çizgi — kiting bölümü sonsuza kadar kilitler).
   */
  private bossResolve(
    e: Enemy, b: NonNullable<Enemy['boss']>, A: (typeof BOSS_ARCH)[BossArchetype],
  ) {
    switch (b.arch) {
      case 'keeper': {
        // HALKA: dış bantta vurur, MERKEZ GÜVENLİ — `warden`ın tam tersi.
        // Oyuncu kaçmayı öğrendikten sonra bu arketip onu boss'a KOŞMAYA
        // zorluyor; çeşitliliğin asıl kaynağı sayı değil, bu ters karar.
        const inner = b.slamR * ('innerMul' in A ? A.innerMul : 0.42);
        this.bossStrike(e, b.slamR, BOSS.slamDamageMul * A.damageMul, inner);
        break;
      }
      case 'choir': {
        // YAYLIM: dururken çembersel mermi. Boss yerinde kalıyor, yani
        // menzilli DEĞİL — mesafe tutmuyor, sadece bir saldırı yapıyor.
        const n = 'shots' in A ? A.shots : 12;
        const dmg = e.damage * ('shotDamageMul' in A ? A.shotDamageMul : 0.5);
        // ⚠️ Kayma SALDIRI SAYACINDAN türüyor, RNG'den değil: hem determinizm
        // korunuyor hem her yaylım bir öncekinin boşluklarını kapatıyor.
        const spin = b.atkNo * ('spinPerVolley' in A ? A.spinPerVolley : 0.26);
        const sp = 'shotSpeed' in A ? A.shotSpeed : 118;
        for (let i = 0; i < n; i++) {
          if (this.enemyShots.length >= BEHAVIOR.ranged.maxAlive) break;
          const ang = spin + (i / n) * Math.PI * 2;
          this.enemyShots.push({
            x: e.x, y: e.y,
            vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp,
            damage: dmg,
            radius: 'shotRadius' in A ? A.shotRadius : 7,
            life: 'shotLifeSec' in A ? A.shotLifeSec : 2.6,
          });
        }
        this.events.add('eshot');
        break;
      }
      case 'harrower':
        // ÇİFTE DARBE: küçük ve hızlı, sonra büyük. İlki şimdi, ikincisi
        // `followUp` ile — telegrafsız (bkz. yukarıdaki not).
        this.bossStrike(e, b.slamR, BOSS.slamDamageMul * A.damageMul, 0);
        b.followUp = 'secondDelaySec' in A ? A.secondDelaySec : 0.55;
        break;
      default:
        // WARDEN: taban kalıp — merkezden yayılan disk, karşılığı KAÇ.
        this.bossStrike(e, b.slamR, BOSS.slamDamageMul * A.damageMul, 0);
    }
  }

  /**
   * MEZAR KÜRESİ — boss'un ikinci yeteneği, arketipten bağımsız.
   *
   * Yavaş, büyük ve okunur. Oyuncudan yavaş olduğu için kaçmak HER ZAMAN
   * mümkün; ama yer değiştirmeyi zorluyor, yani "telegrafı bekle, kaç, geri
   * gel" ritminin arasındaki ölü zamanı dolduruyor.
   *
   * ⚠️ HEDEF ATIŞ ANINDA KİLİTLENİR, küre TAKİP ETMEZ. Takip etseydi
   * kaçınmak imkânsız olurdu ve yavaşlığın hiçbir anlamı kalmazdı.
   */
  private bossOrb(e: Enemy, b: NonNullable<Enemy['boss']>) {
    const tg = this.target(e.x, e.y);
    const dx = tg.px - e.x, dy = tg.py - e.y;
    const d = Math.hypot(dx, dy) || 1;
    const taban = Math.atan2(dy, dx);
    // 2. fazda yelpaze — ⚠️ açı RNG'den değil, sabit aralıktan
    const n = b.phase === 1 ? BOSS.orbPhase2Count : 1;
    for (let i = 0; i < n; i++) {
      if (this.enemyShots.length >= BEHAVIOR.ranged.maxAlive) break;
      const ang = taban + (i - (n - 1) / 2) * BOSS.orbSpreadRad;
      this.enemyShots.push({
        x: e.x, y: e.y,
        vx: Math.cos(ang) * BOSS.orbSpeed,
        vy: Math.sin(ang) * BOSS.orbSpeed,
        damage: e.damage * BOSS.orbDamageMul,
        radius: BOSS.orbRadius,
        life: BOSS.orbLifeSec,
      });
    }
    this.events.add('eshot');
  }

  /**
   * Bir alan darbesini uygula.
   *
   * `inner > 0` ise HALKA: iç yarıçapın altında kalan hiç hasar almaz.
   * Tek bir yerde toplandı çünkü dört arketip de aynı üç şeyi doğru yapmak
   * zorunda: EN YAKIN dövüşçüyü hedefle (1v1'de boss kimin yanındaysa onu
   * vurur), `iframe`e saygı göster, hasar sayısını kuyruğa yaz.
   */
  private bossStrike(e: Enemy, radius: number, damageMul: number, inner: number) {
    const tg = this.target(e.x, e.y);
    const dist = Math.hypot(tg.px - e.x, tg.py - e.y);
    if (dist > radius || dist < inner || tg.iframe > 0) return;
    const taken = Math.max(1, Math.round(e.damage * damageMul) - tg.stats.armor);
    tg.hp -= taken;
    tg.iframe = PLAYER.iframeSec;
    this.events.add('hurt');
    tg.hurtT = 0.32;
    if (this.hurts.length < 4) this.hurts.push({ amount: taken });
  }

  /** Menzilli: tercih ettiği mesafeyi korur, arada ok atar. */
  private moveRanged(e: Enemy, dt: number, nx: number, ny: number, d: number, sp: number) {
    const R = BEHAVIOR.ranged;
    if (d > R.prefer + R.band) {
      e.x += nx * sp * dt;
      e.y += ny * sp * dt;
    } else if (d < R.prefer - R.band) {
      // geri çekil — ürkek, tam hızda değil
      e.x -= nx * sp * R.retreatMul * dt;
      e.y -= ny * sp * R.retreatMul * dt;
    }
    // ölü bantta durur ve nişan alır

    e.atkCd -= dt;
    // Tavan: derin inişte sahnede 400 düşman olabilir, hepsi okçuysa saniyede
    // ~190 ok doğar. Okunabilirlik de fps de çöker. Bekleme yine işler, sadece
    // atış düşmez — yani "ateş edemiyor" hissi vermeden yoğunluk sınırlanır.
    if (e.atkCd <= 0 && d < R.prefer + R.band * 3 && this.enemyShots.length < R.maxAlive) {
      e.atkCd = R.fireCd;
      this.enemyShots.push({
        x: e.x, y: e.y,
        vx: nx * R.shotSpeed, vy: ny * R.shotSpeed,
        damage: e.damage * R.shotDamageMul,
        radius: R.shotRadius,
        life: R.shotLifeSec,
      });
      this.events.add('eshot');
    }
  }

  /**
   * Hücumcu: yaklaş → YÜKLEN (dur, telegraf) → fırla → nefeslen.
   * Yön yüklenme BİTİNCE kilitlenir; hücum sırasında oyuncuyu takip etmez,
   * yoksa telegrafın anlamı kalmaz ve kaçınmak imkânsız olur.
   */
  private moveCharger(e: Enemy, dt: number, nx: number, ny: number, d: number, sp: number) {
    const K = BEHAVIOR.charger;
    switch (e.cState) {
      case 0: // yaklaş
        e.x += nx * sp * dt;
        e.y += ny * sp * dt;
        if (d < K.trigger) { e.cState = 1; e.atkCd = K.windupSec; }
        break;
      case 1: // yükleniyor — yerinde durur, oyuncuya kaçma penceresi
        e.atkCd -= dt;
        if (e.atkCd <= 0) {
          e.cState = 2;
          e.atkCd = K.dashSec;
          e.cdx = nx; e.cdy = ny;   // yön ŞİMDİ kilitlenir
          this.events.add('charge');
        }
        break;
      case 2: // hücum
        e.x += e.cdx * sp * K.dashMul * dt;
        e.y += e.cdy * sp * K.dashMul * dt;
        e.atkCd -= dt;
        if (e.atkCd <= 0) { e.cState = 3; e.atkCd = K.recoverSec; }
        break;
      default: // nefeslen — yavaş yaklaşır, tekrar yüklenmeden önce açık verir
        e.x += nx * sp * K.recoverMul * dt;
        e.y += ny * sp * K.recoverMul * dt;
        e.atkCd -= dt;
        if (e.atkCd <= 0) e.cState = 0;
    }
  }

  /**
   * Sürü: yanındaki müttefik sayısına göre hızlanır, yalnızken yavaşlar.
   *
   * Komşu sayısı grid'den (3×3 hücre) okunur — düşman başına mesafe döngüsü YOK.
   * Grid `moveEnemies`'ten hemen önce yeniden inşa edildiği için bir tick
   * gecikmeli değil, güncel.
   *
   * ⚠️ TAVANI KALDIRMA. Tavansız hâlde 40 kişilik yığın oyuncudan hızlı olur ve
   * kaçış imkânsızlaşır — hız garantisi (`huntFloor`) zaten ayrı bir sistem.
   */
  private moveSwarm(e: Enemy, dt: number, nx: number, ny: number, sp: number) {
    const S = BEHAVIOR.swarm;
    const near = this.grid.countNear(e.x, e.y) - 1;  // kendisi hariç
    const mul = near <= 0
      ? S.aloneMul
      : Math.min(S.maxMul, 1 + near * S.perAlly);
    const v = sp * mul;
    e.x += nx * v * dt;
    e.y += ny * v * dt;
  }

  /**
   * Çemberci: oyuncunun etrafında döner ve spiral hâlinde içeri kapanır.
   *
   * Radyal bileşen her zaman İÇERİ bakar (`closeIn`), teğet bileşen yörüngeyi
   * çizer. Dönüş yönü `phase`'ten türer — rng harcamaz, spawn sayacından gelir,
   * yani aynı seed aynı yönü verir.
   *
   * ⚠️ SABİT YARIÇAPTA DÖNDÜRME. Denendiği anda bölüm kilitlenir: kimse temas
   * etmez, kimse ölmez, süre tavanına kadar sürer (Ossuary Halls dersi).
   * `closeIn` bu davranışın kendi yakınsama garantisi.
   */
  private moveCircler(e: Enemy, dt: number, nx: number, ny: number, d: number, sp: number) {
    const R = BEHAVIOR.circler;
    // Uzaktaysa tam hızla yaklaş; yörüngeye girince radyal hız SIFIRLANIR ve
    // geriye sadece teğet + `closeIn` kalır. Dışarı itme YOK (bkz. config).
    const radial = d > R.prefer ? 1 : 0;
    const spin = (Math.floor(e.phase * 4) & 1) ? 1 : -1;
    // Teğet vektör = normalin 90° döndürülmüşü
    const tx = -ny * spin, ty = nx * spin;
    e.x += (nx * radial * sp + tx * sp * R.tangentMul + nx * R.closeIn) * dt;
    e.y += (ny * radial * sp + ty * sp * R.tangentMul + ny * R.closeIn) * dt;
  }

  /** Düşman mermileri — uçur, oyuncuya çarpanı işle, süresi dolanı at */
  private updateEnemyShots(dt: number) {
    const pr = PLAYER.radius;
    for (let i = this.enemyShots.length - 1; i >= 0; i--) {
      const s = this.enemyShots[i];
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      s.life -= dt;

      const dx = s.x - this.px, dy = s.y - this.py;
      const rr = s.radius + pr;
      if (dx * dx + dy * dy <= rr * rr) {
        // Dokunulmazlık penceresindeyken mermi SÖNMEZ, sadece geçer —
        // yoksa iframe boyunca gelen atışlar bedava emiliyor olurdu.
        if (this.iframe <= 0) {
          const taken = Math.max(1, s.damage - this.stats.armor);
          this.hp -= taken;
          this.iframe = PLAYER.iframeSec;
          this.events.add('hurt');
          this.hurtT = 0.32;
          if (this.hurts.length < 4) this.hurts.push({ amount: taken });
          this.swapRemove(this.enemyShots, i);
          continue;
        }
      }
      if (s.life <= 0) this.swapRemove(this.enemyShots, i);
    }
  }

  private nearestEnemy(range: number): Enemy | null {
    let best: Enemy | null = null;
    let bestD = range * range;
    for (let i = 0; i < this.enemies.length; i++) {
      const e = this.enemies[i];
      const dx = e.x - this.px, dy = e.y - this.py;
      const d2 = dx * dx + dy * dy;
      if (d2 < bestD) { bestD = d2; best = e; }
    }
    return best;
  }

  /**
   * En yakın düşman — OYUNCUYA değil, verilen NOKTAYA göre.
   *
   * ⚠️ Takip eden mermi için `nearestEnemy` yanlış cevabı verirdi: mermi
   * oyuncudan uzaklaştıkça oyuncunun yanındaki düşmanı hedeflemeye devam
   * eder, yani geri dönerdi. Hedef merminin KENDİ konumundan seçilmeli.
   * ⚠️ Ölmekte olanlar elenir; ölü bir hedefe kilitlenen mermi, sürünün
   * ortasında dümdüz gider.
   */
  private nearestEnemyTo(x: number, y: number, range: number): Enemy | null {
    let best: Enemy | null = null;
    let bestD = range * range;
    const cand = this.grid.query(x, y, range, this.scratch);
    for (let i = 0; i < cand.length; i++) {
      const e = cand[i];
      if (e.hp <= 0) continue;
      const dx = e.x - x, dy = e.y - y;
      const d2 = dx * dx + dy * dy;
      if (d2 < bestD) { bestD = d2; best = e; }
    }
    return best;
  }

  /** Tüm silahları ilerlet. Motor tek, desen veri — yeni silah = config kaydı. */
  private fire(h: Hero, dt: number) {
    // Yörünge açısı sürekli döner (silah olmasa da; kayıt tutmak ucuz).
    // ⚠️ Hız SİLAHTAN gelir. Önce sabit 2.3 yazılıydı ve `def.orbitSpeed`
    // hiçbir yerde okunmuyordu — Black Vespers'ın 3.1'i ölü veriydi, evrim
    // tasarlandığından yavaş dönüyordu. Açı ortak olduğu için en hızlı
    // yörünge silahı belirler (pratikte oyuncu tek yörünge silahı taşır).
    let os = 2.3;
    for (let i = 0; i < h.weapons.length; i++) {
      const d = h.weapons[i].def;
      if (d.pattern === 'orbit') os = Math.max(os, d.orbitSpeed ?? 2.3);
    }
    h.orbitAngle = (h.orbitAngle + os * dt) % (Math.PI * 2);

    for (let i = 0; i < h.weapons.length; i++) {
      const w = h.weapons[i];
      const def = w.def;

      // Yörünge sürekli aktif — bekleme sayacı sadece hasar tiki için
      if (def.pattern === 'orbit') {
        w.cd -= dt;
        if (w.cd <= 0) { w.cd = this.wCooldown(h, w); this.orbitHit(h, w); }
        continue;
      }

      w.cd -= dt;
      if (w.cd > 0) continue;

      if (def.pattern === 'aimed') {
        const target = this.nearestEnemy(def.range ?? 600);
        if (!target) continue; // menzilde hedef yoksa bekle, cooldown harcanmaz
        w.cd = this.wCooldown(h, w);
        h.atkT = 0.30;      // sunum: karakter saldırı animasyonu oynatsın
        this.fireAimed(h, w, target);
      } else if (def.pattern === 'sweep') {
        w.cd = this.wCooldown(h, w);
        h.atkT = 0.30;
        this.fireSweep(h, w);
      } else if (def.pattern === 'aura') {
        w.cd = this.wCooldown(h, w);
        this.fireAura(h, w);
      } else if (def.pattern === 'nova') {
        w.cd = this.wCooldown(h, w);
        h.atkT = 0.30;
        this.fireNova(h, w);
      } else if (def.pattern === 'ground') {
        w.cd = this.wCooldown(h, w);
        h.atkT = 0.30;
        this.fireGround(h, w);
      } else if (def.pattern === 'boomerang') {
        // Hedef ARAMAZ: baktığın yöne savrulur ve döner. "Nereye bakıyorsun"
        // sorusunu soran tek silah — aimed'ın otomatik nişanından farkı bu.
        w.cd = this.wCooldown(h, w);
        h.atkT = 0.30;
        this.fireBoomerang(h, w);
      } else if (def.pattern === 'chain') {
        const target = this.nearestEnemy(def.range ?? 460);
        if (!target) continue;
        w.cd = this.wCooldown(h, w);
        h.atkT = 0.30;
        this.fireChain(h, w, target);
      } else if (def.pattern === 'homing') {
        // ⚠️ `aimed`den farkı: hedef YOKSA DA ateş eder. Takip eden mermi
        // sonradan hedef bulabilir; beklemek bu silahın anlamını yok ederdi.
        w.cd = this.wCooldown(h, w);
        h.atkT = 0.30;
        this.fireHoming(h, w);
      } else if (def.pattern === 'mine') {
        w.cd = this.wCooldown(h, w);
        h.atkT = 0.30;
        this.fireMine(h, w);
      }
    }
  }

  /** #3 nova — oyuncudan her yöne eşit aralıklı halka */
  private fireNova(h: Hero, w: OwnedWeapon) {
    const def = w.def;
    const n = (def.novaCount ?? 8) + this.wCount(h, w) - 1;
    const spd = (def.projectileSpeed ?? 300) * h.stats.projSpeed;
    const dmg = this.wDamage(h, w);
    const life = (def.lifeSec ?? 1.1) * h.stats.duration;
    // Başlangıç açısı her atışta kayar — üst üste atışlar aynı koridorları
    // taramasın, yoksa halkalar arası kalıcı ölü açılar oluşur.
    const base = (this.time * 0.9) % (Math.PI * 2);
    for (let i = 0; i < n; i++) {
      const a = base + (i * Math.PI * 2) / n;
      this.projectiles.push({ owner: h,
        x: h.px, y: h.py,
        vx: Math.cos(a) * spd, vy: Math.sin(a) * spd,
        damage: dmg, radius: 6, life, pierce: def.pierce ?? 2,
        wid: def.id,
      });
    }
  }

  /** #4 ground — ayağının altına kalıcı alan bırakır (oyuncuyla HAREKET ETMEZ) */
  private fireGround(h: Hero, w: OwnedWeapon) {
    const def = w.def;
    const r = (def.groundRadius ?? 62) * this.wArea(h, w);
    const life = (def.groundLifeSec ?? 3.4) * h.stats.duration;
    const n = this.wCount(h, w) >= 2 ? 2 : 1;
    for (let i = 0; i < n; i++) {
      // ikinci alan hafif ofsetli — üst üste binip tek alan gibi görünmesin
      const off = n === 1 ? 0 : (i === 0 ? -r * 0.7 : r * 0.7);
      this.hitZones.push({ owner: h,
        x: h.px + off, y: h.py,
        w: r * 2, h: r * 2,
        life, maxLife: life,
        damage: this.wDamage(h, w),
        facingRight: true,
        hit: new Set<Enemy>(),
        anchored: true,
        retick: def.groundTickSec ?? 0.5,
        retickCd: 0,
        round: true,
        wid: def.id,
      });
    }
  }

  /** #5 boomerang — baktığın yöne savrulur, ömrünün yarısında geri döner */
  /**
   * TAKİP — `aimed`in cevaplayamadığı soruyu cevaplıyor: kaçan düşman.
   *
   * ⚠️ Hedef yoksa da ateş eder ve mermi hedefi SONRADAN arar. `aimed` gibi
   * "hedef yoksa bekle" deseydi takip özelliğinin anlamı kalmazdı — mermi
   * zaten hedefe kilitli doğardı.
   */
  private fireHoming(h: Hero, w: OwnedWeapon) {
    const def = w.def;
    const n = this.wCount(h, w);
    const spd = (def.projectileSpeed ?? 210) * h.stats.projSpeed;
    const life = (def.lifeSec ?? 3.2) * h.stats.duration;
    // Varsa en yakın düşmana, yoksa bakılan yöne — ikisi de KİLİT DEĞİL,
    // sadece başlangıç yönü.
    const t = this.nearestEnemy(def.range ?? 520);
    const baseAng = t
      ? Math.atan2(t.y - h.py, t.x - h.px)
      : (h.facingRight ? 0 : Math.PI);
    for (let i = 0; i < n; i++) {
      // ⚠️ Yelpaze GENİŞ: dar açılsaydı n mermi aynı düşmana gider, fazlası
      // boşa yanardı. Takip zaten toparlıyor; geniş başlamak kapsama kazandırıyor.
      const off = n === 1 ? 0 : (i - (n - 1) / 2) * 0.55;
      const a = baseAng + off;
      this.projectiles.push({ owner: h,
        x: h.px, y: h.py,
        vx: Math.cos(a) * spd, vy: Math.sin(a) * spd,
        damage: this.wDamage(h, w), radius: 7,
        life, pierce: def.pierce ?? 1,
        seek: def.seekRate ?? 3.4,
        wid: def.id,
      });
    }
  }

  /**
   * TUZAK — tek "önceden düşün" silahı.
   *
   * ⚠️ Oyuncunun ÜSTÜNE bırakılıyor, ileri değil. İleri bırakmak "nereye
   * bakıyorsun" sorusunu sorardı ve onu zaten boomerang soruyor. Buradaki
   * soru "sürü nereden gelecek": oyuncu tuzağı bırakıp çekiliyor.
   */
  private fireMine(h: Hero, w: OwnedWeapon) {
    const def = w.def;
    const n = this.wCount(h, w);
    const alan = this.wArea(h, w);
    const trigger = (def.mineTriggerR ?? 40) * alan;
    const blast = (def.mineBlastR ?? 92) * alan;
    const life = (def.mineLifeSec ?? 9) * h.stats.duration;
    for (let i = 0; i < n; i++) {
      // Tuzaklar üst üste binmesin: binseydi tek tuzak gibi görünür ve
      // aynı anda patlayıp tek patlama etkisi yaparlardı.
      const a = (i / Math.max(1, n)) * Math.PI * 2;
      const off = n === 1 ? 0 : trigger * 1.6;
      this.hitZones.push({ owner: h,
        x: h.px + Math.cos(a) * off, y: h.py + Math.sin(a) * off,
        w: trigger * 2, h: trigger * 2,
        life, maxLife: life,
        // ⚠️ SIFIR — tuzak kurulurken hiçbir şeye zarar vermez.
        damage: 0,
        facingRight: true,
        hit: new Set<Enemy>(),
        anchored: true,
        round: true,
        trap: {
          arm: def.mineArmSec ?? 0.6,
          triggerR: trigger,
          blastR: blast,
          damage: this.wDamage(h, w),
        },
        wid: def.id,
      });
    }
  }


  private fireBoomerang(h: Hero, w: OwnedWeapon) {
    const def = w.def;
    const n = this.wCount(h, w);
    const spd = (def.projectileSpeed ?? 340) * h.stats.projSpeed;
    const life = (def.lifeSec ?? 2.2) * h.stats.duration;
    const baseAng = h.facingRight ? 0 : Math.PI;
    for (let i = 0; i < n; i++) {
      const off = n === 1 ? 0 : (i - (n - 1) / 2) * (def.spreadRad ?? 0.42);
      const a = baseAng + off;
      this.projectiles.push({ owner: h,
        x: h.px, y: h.py,
        vx: Math.cos(a) * spd, vy: Math.sin(a) * spd,
        damage: this.wDamage(h, w), radius: 8,
        life, pierce: def.pierce ?? 99,
        // Dönüş mesafesi alan istatistiğiyle büyür (yay genişler); ömür
        // sadece emniyet freni — ekranda sonsuza kadar takılı kalmasın.
        maxDist: (def.range ?? 620) * 0.5 * this.wArea(h, w),
        returnAt: life * (def.returnAt ?? 0.5),
        speed: spd,
        wid: def.id,
      });
    }
  }

  /**
   * #7 chain — en yakından başlar, düşmandan düşmana sıçrar.
   * Anlık hasar; görsel için `arcs` kuyruğuna yazar (render boşaltır).
   * Aynı düşmana iki kez sıçramaz, yoksa iki düşman arasında hapsolur.
   */
  private fireChain(h: Hero, w: OwnedWeapon, first: Enemy) {
    const def = w.def;
    const jumps = def.chainJumps ?? 3;
    const range = def.chainRange ?? 210;
    const falloff = def.chainFalloff ?? 0.8;
    let dmg = this.wDamage(h, w);
    let cur = first;
    const seen = new Set<Enemy>([cur]);
    let fx = h.px, fy = h.py;

    for (let j = 0; j <= jumps; j++) {
      this.damageEnemy(h, cur, dmg, def.id);
      if (this.arcs.length < 64) this.arcs.push({ x1: fx, y1: fy, x2: cur.x, y2: cur.y });
      fx = cur.x; fy = cur.y;

      // bir sonraki en yakın, HENÜZ VURULMAMIŞ düşman
      let next: Enemy | null = null;
      let bestD = range * range;
      const cand = this.grid.query(cur.x, cur.y, range + 30, this.scratch);
      for (let i = 0; i < cand.length; i++) {
        const e = cand[i];
        if (e.hp <= 0 || seen.has(e)) continue;
        const dx = e.x - cur.x, dy = e.y - cur.y;
        const d2 = dx * dx + dy * dy;
        if (d2 < bestD) { bestD = d2; next = e; }
      }
      if (!next) break;
      seen.add(next);
      cur = next;
      dmg *= falloff;
    }
    this.events.add('chain');
  }

  /** #1 aimed — en yakın düşmana mermi(ler) */
  private fireAimed(h: Hero, w: OwnedWeapon, target: Enemy) {
    const def = w.def;
    const baseAng = Math.atan2(target.y - h.py, target.x - h.px);
    const n = this.wCount(h, w);
    const spd = (def.projectileSpeed ?? 450) * h.stats.projSpeed; // Sinew Wrap
    for (let i = 0; i < n; i++) {
      const off = n === 1 ? 0 : (i - (n - 1) / 2) * (def.spreadRad ?? 0.16);
      const a = baseAng + off;
      this.projectiles.push({ owner: h,
        x: h.px, y: h.py,
        vx: Math.cos(a) * spd, vy: Math.sin(a) * spd,
        damage: this.wDamage(h, w), radius: 5,
        life: (def.lifeSec ?? 1.5) * h.stats.duration, // Binding Sigil
        pierce: def.pierce ?? 0,
        wid: def.id,
      });
    }
  }

  /** #2 sweep — oyuncunun baktığı yöne yatay kesik; düşmandan geçer */
  private fireSweep(h: Hero, w: OwnedWeapon) {
    const def = w.def;
    const area = this.wArea(h, w);
    const wdt = (def.sweepW ?? 130) * area;
    const hgt = (def.sweepH ?? 45) * area;
    const n = this.wCount(h, w); // 2+ olunca her iki yana birden vurur
    const dirs = n >= 2 ? [true, false] : [h.facingRight];
    for (const right of dirs) {
      this.hitZones.push({ owner: h,
        x: h.px + (right ? wdt / 2 : -wdt / 2),
        y: h.py,
        w: wdt, h: hgt,
        life: (def.sweepLifeSec ?? 0.18) * h.stats.duration,
        maxLife: (def.sweepLifeSec ?? 0.18) * h.stats.duration,
        damage: this.wDamage(h, w),
        facingRight: right,
        hit: new Set<Enemy>(),
        wid: def.id,
      });
    }
  }

  /** #8 aura — yakındaki her düşmana tek seferde hasar */
  private fireAura(h: Hero, w: OwnedWeapon) {
    const r = (w.def.auraRadius ?? 70) * this.wArea(h, w);
    const dmg = this.wDamage(h, w);
    const cand = this.grid.query(h.px, h.py, r + 30, this.scratch);
    for (let i = 0; i < cand.length; i++) {
      const e = cand[i];
      if (e.hp <= 0) continue;
      const dx = e.x - h.px, dy = e.y - h.py;
      const rr = r + e.radius;
      if (dx * dx + dy * dy > rr * rr) continue;
      this.damageEnemy(h, e, dmg, w.def.id);
    }
  }

  /** #6 orbit — dönen orb'lar temas ettiğine vurur (düşman başına bekleme ile) */
  private orbitHit(h: Hero, w: OwnedWeapon) {
    const def = w.def;
    const rad = (def.orbitRadius ?? 78) * this.wArea(h, w);
    const orbR = (def.orbRadius ?? 13) * this.wArea(h, w);
    const n = this.wCount(h, w);
    const dmg = this.wDamage(h, w);
    for (let k = 0; k < n; k++) {
      const a = h.orbitAngle + (k * Math.PI * 2) / n;
      const ox = h.px + Math.cos(a) * rad;
      const oy = h.py + Math.sin(a) * rad;
      const cand = this.grid.query(ox, oy, orbR + 30, this.scratch);
      for (let i = 0; i < cand.length; i++) {
        const e = cand[i];
        if (e.hp <= 0 || e.contactCd > 0) continue;
        const dx = e.x - ox, dy = e.y - oy;
        const rr = orbR + e.radius;
        if (dx * dx + dy * dy > rr * rr) continue;
        e.contactCd = CONTACT_HIT_CD;
        this.damageEnemy(h, e, dmg, def.id);
      }
    }
  }

  /**
   * Tek noktadan hasar — ölüm/gem/efekt mantığı burada toplanır.
   *
   * `wid` vuran silahın id'si: SADECE görsel etiket, hiçbir mantığı beslemez.
   * Render bununla doğru çarpma efektini seçer (bkz. combatArt.ts).
   */
  private damageEnemy(h: Hero, e: Enemy, dmg: number, wid = '') {
    // ⚠️ ZAR HER VURUŞTA ATILIR — kritik şansı 0 olsa bile, hatta vuruş
    // boşa gidecek olsa bile. `rollRareGold` ile AYNI kural: zarı koşula
    // bağlı atmak RNG akışını duruma göre kaydırır, aynı seed farklı koşu
    // üretir ve sunucu doğrulaması ile istemci sonsuza kadar ayrışır.
    // ⚠️ Bu yüzden aşağıdaki "boss dokunulmaz" kontrolü zardan SONRA geliyor.
    const crit = this.rng.next() < h.stats.crit;

    // Boss giriş sekansında DOKUNULMAZ — yoksa oyuncu boss daha belirmeden
    // eritir ve giriş anı (isim kartı, telegrafı öğrenme) hiç yaşanmaz.
    if (e.boss && e.boss.intro > 0) return;

    const out = crit ? dmg * h.stats.critMul : dmg;

    e.hp -= out;
    // ⚠️ SUNUM DEĞİL, KOŞU ÇIKTISI: haftalık ortak boss'a katkı bu sayıdan
    // hesaplanıyor. Sadece BOSS'a vurulan sayılır — sürüye vurulan hasar
    // ortak cana katılırsa oyuncu boss'a hiç yaklaşmadan katkı üretirdi.
    // RNG tüketmiyor, mühür etkilenmiyor.
    if (e.boss) this.bossDamage += out;
    e.hitFlash = crit ? 0.16 : 0.09;
    this.events.add(crit ? 'crit' : 'hit');
    const killed = e.hp <= 0;
    // ⚠️ Tavan uzunluk kontrolüyle — zaman/rng bazlı örnekleme determinizmi bozar
    if (this.hits.length < 96) {
      this.hits.push({ x: e.x, y: e.y, dmg: out, crit, wid, killed });
    }
    if (killed) this.killEnemy(h, e);
  }

  /** Sweep hitbox'larını ilerlet ve temas edenlere vur */
  private updateHitZones(dt: number) {
    for (let i = this.hitZones.length - 1; i >= 0; i--) {
      const z = this.hitZones[i];
      // Kesik oyuncuyla hareket eder; YERE BIRAKILAN alan (anchored) etmez —
      // "nerede durduğun" sorusunu soran tek silah bu, takip ederse anlamı kalmaz.
      if (!z.anchored) {
        z.x = this.px + (z.facingRight ? z.w / 2 : -z.w / 2);
        z.y = this.py;
      }

      // ── TUZAK: kurul → bekle → PATLA ──
      // ⚠️ Patlamadan ÖNCE hiç hasar vermiyor (`damage` 0). Patlayınca normal
      // bir yuvarlak alana DÖNÜŞÜYOR: yarıçap patlama yarıçapı oluyor, hasar
      // yazılıyor, ömür tek bir vuruşluk kırpılıyor ve `trap` siliniyor.
      // Ayrı bir "patlama" nesnesi eklemek yerine bu yol seçildi — aynı
      // çarpışma kodu, yeni bir tür yok.
      if (z.trap) {
        const tr = z.trap;
        if (tr.arm > 0) tr.arm -= dt;
        let patla = false;
        if (tr.arm <= 0) {
          const yakin = this.grid.query(z.x, z.y, tr.triggerR + 40, this.scratch);
          for (let j = 0; j < yakin.length; j++) {
            const e = yakin[j];
            if (e.hp <= 0) continue;
            const dx = e.x - z.x, dy = e.y - z.y;
            const rr = tr.triggerR + e.radius;
            if (dx * dx + dy * dy <= rr * rr) { patla = true; break; }
          }
        }
        if (patla) {
          z.w = tr.blastR * 2;
          z.h = tr.blastR * 2;
          z.damage = tr.damage;
          // ⚠️ Kısa ama SIFIR DEĞİL: sıfır ömür, çarpışma hiç koşmadan
          // alanın silinmesi demekti — tuzak sessizce hiçbir şey yapmazdı.
          z.life = 0.14;
          z.maxLife = 0.14;
          z.hit.clear();
          z.trap = undefined;
        } else {
          // Kurulurken ne vurur ne de süresi dolmadan silinir
          z.life -= dt;
          if (z.life <= 0) this.swapRemove(this.hitZones, i);
          continue;
        }
      }

      // Tekrar vuran alan: sayaç dolunca vurulanlar listesi temizlenir
      if (z.retick && z.retick > 0) {
        z.retickCd = (z.retickCd ?? 0) - dt;
        if (z.retickCd <= 0) { z.retickCd = z.retick; z.hit.clear(); }
      }

      const hw = z.w / 2, hh = z.h / 2;
      const cand = this.grid.query(z.x, z.y, Math.max(z.w, z.h) / 2 + 30, this.scratch);
      for (let j = 0; j < cand.length; j++) {
        const e = cand[j];
        if (e.hp <= 0 || z.hit.has(e)) continue;
        if (z.round) {
          const dx = e.x - z.x, dy = e.y - z.y;
          const rr = hw + e.radius;
          if (dx * dx + dy * dy > rr * rr) continue;
        } else {
          if (Math.abs(e.x - z.x) > hw + e.radius) continue;
          if (Math.abs(e.y - z.y) > hh + e.radius) continue;
        }
        z.hit.add(e);
        this.damageEnemy(z.owner, e, z.damage, z.wid);
      }

      z.life -= dt;
      if (z.life <= 0) this.swapRemove(this.hitZones, i);
    }
  }

  private moveProjectiles(dt: number) {
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const p = this.projectiles[i];

      // TAKİP: hız vektörünü hedefe doğru SINIRLI bir açıyla çevir.
      // ⚠️ Hız BÜYÜKLÜĞÜ korunuyor, sadece yön dönüyor — yoksa takip eden
      // mermi hedefe yaklaştıkça hızlanır/yavaşlar ve denge kayardı.
      if (p.seek && p.seek > 0) {
        const t = this.nearestEnemyTo(p.x, p.y, 900);
        if (t) {
          const sp = Math.hypot(p.vx, p.vy) || 1;
          const cur = Math.atan2(p.vy, p.vx);
          const want = Math.atan2(t.y - p.y, t.x - p.x);
          // açı farkını [-π, π] aralığına indir
          let fark = want - cur;
          while (fark > Math.PI) fark -= Math.PI * 2;
          while (fark < -Math.PI) fark += Math.PI * 2;
          const en = p.seek * dt;
          const yeni = cur + Math.max(-en, Math.min(en, fark));
          p.vx = Math.cos(yeni) * sp;
          p.vy = Math.sin(yeni) * sp;
        }
      }

      // BOOMERANG: MESAFEYE göre döner, ömre göre değil.
      //
      // ⚠️ Önce "ömrün yarısında dön" yazılıydı ve bu bir TUZAK yaratıyordu:
      // projSpeed arttıkça silah aynı sürede DAHA UZAĞA gidiyor, yani sürünün
      // dışında kalıyordu. Leaf Ranger'ın +%15 projSpeed'i kendi imza silahını
      // KÖTÜLEŞTİRİYORDU (ölçüm: knight+sickle 100 kill, ranger+sickle 26).
      // Mesafeye bağlayınca projSpeed saf bir iyileştirmeye dönüşüyor:
      // aynı yayı daha hızlı çizer.
      if (p.maxDist !== undefined || p.returnAt !== undefined) {
        const dx = this.px - p.x, dy = this.py - p.y;
        const d = Math.hypot(dx, dy) || 1;
        if (!p.returning) {
          const farEnough = p.maxDist !== undefined && d > p.maxDist;
          const outOfTime = p.returnAt !== undefined && p.life < p.returnAt;
          if (farEnough || outOfTime) p.returning = true;
        }
        if (p.returning) {
          const sp = p.speed ?? Math.hypot(p.vx, p.vy);
          p.vx = (dx / d) * sp;
          p.vy = (dy / d) * sp;
          // elinde tekrar toplandıysa erken sönsün (ekranda takılı kalmasın)
          if (d < PLAYER.radius + p.radius) { this.swapRemove(this.projectiles, i); continue; }
        }
      }

      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.life -= dt;
      if (p.life <= 0) this.swapRemove(this.projectiles, i);
    }
  }

  private collideProjectiles() {
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const p = this.projectiles[i];
      const cand = this.grid.query(p.x, p.y, p.radius + 30, this.scratch);
      let consumed = false;
      for (let j = 0; j < cand.length; j++) {
        const e = cand[j];
        if (e.hp <= 0) continue;
        const rr = p.radius + e.radius;
        const dx = e.x - p.x, dy = e.y - p.y;
        if (dx * dx + dy * dy > rr * rr) continue;

        this.damageEnemy(p.owner, e, p.damage, p.wid);

        if (p.pierce > 0) { p.pierce -= 1; continue; }
        consumed = true;
        break;
      }
      if (consumed) this.swapRemove(this.projectiles, i);
    }
  }

  /** Ölenleri diziden çıkar. TÜM hasar kaynakları (mermi/sweep/orbit/aura)
   *  işledikten SONRA bir kez çağrılır — yoksa aynı düşman iki kez ödül verir. */
  private reapDead() {
    for (let i = this.enemies.length - 1; i >= 0; i--) {
      if (this.enemies[i].hp <= 0) this.swapRemove(this.enemies, i);
    }
  }

  private killEnemy(h: Hero, e: Enemy) {
    // ⚠️ ÖLDÜRME KREDİSİ VURANA. Bu satır `this.kills` idi ve ölçüldü:
    // rakip 25 saniye dövüştü, XP topladı ama SIFIR kill göründü — bütün
    // öldürmeler birinci oyuncuya yazılıyordu. 1v1'de skor tablosunun
    // tamamı bu tek satıra bakıyor.
    h.kills += 1;
    // ⚠️ TİP BAZINDA SAYAÇ — pet bağlamanın "parayla alınamaz" dayanağı
    // (bkz. pets.ts BIND). Sadece SAYIYOR: rng tüketmiyor, dengeye
    // dokunmuyor, mühür bunu hash'e almıyor. Sunucu koşu özetinden okuyup
    // `Progress.kills`e ekliyor; yani sayacın kendisi de istemci iddiası
    // değil, doğrulanmış koşunun çıktısı.
    //
    // ⚠️ Boss `typeId: 'boss'` ile geliyor ve bilerek sayılıyor — hiçbir pet
    // boss'tan bağlanmıyor, o yüzden zararsız; ayrı bir dal açmak sadece
    // okunması gereken bir istisna yaratırdı.
    this.killsByType[e.typeId] = (this.killsByType[e.typeId] ?? 0) + 1;
    this.stage.killed += 1;
    this.rollRareGold();
    this.gems.push({ x: e.x, y: e.y, xp: e.xp, life: GEM.lifeSec });
    this.events.add('kill');
    if (e.boss) this.chests.push({ x: e.x, y: e.y, evolution: e.boss.evolutionChest });
    // headless koşuda render boşaltmaz → tavan koy, sonsuz büyümesin.
    // Görsel etiketler taşınıyor: leş animasyonu ölen düşmanın sprite'ını,
    // baktığı yönü ve boyutunu bilmeli (motor bunları zaten tutuyor).
    if (this.deaths.length < 256) {
      this.deaths.push({
        x: e.x, y: e.y, art: e.art,
        facingRight: e.facingRight, radius: e.radius, boss: !!e.boss,
      });
    }

    // ── PATLAYICI: öldüğü YERDE patlar ──
    // ⚠️ Patlama SADECE dövüşçülere zarar verir, DÜŞMANLARA DEĞİL. Düşmanlara
    // da verseydi oyuncu tek bir patlayıcıyı öldürüp sürünün yarısını
    // temizler, silahlar gereksizleşirdi.
    if (e.behavior === 'exploder') {
      const B = BEHAVIOR.exploder;
      const tg = this.target(e.x, e.y);
      const dd = Math.hypot(tg.px - e.x, tg.py - e.y);
      if (dd <= B.blastR && tg.iframe <= 0) {
        const taken = Math.max(1, Math.round(e.damage * B.blastDamageMul) - tg.stats.armor);
        tg.hp -= taken;
        tg.iframe = PLAYER.iframeSec;
        this.events.add('hurt');
        tg.hurtT = 0.32;
        if (this.hurts.length < 4) this.hurts.push({ amount: taken });
      }
      this.events.add('charge');   // patlamanın kendi sesi
    }

    // ── BÖLÜNEN: ikiye ayrılır ──
    // ⚠️ TEK KUŞAK (`splitGen`) ve ⚠️ TAVANA SAYGILI: `aliveMax` dolmuşken
    // bölünmek 420 sınırını delerdi ve o sınır fps emniyeti.
    if (e.behavior === 'splitter' && !e.splitGen) {
      const S = BEHAVIOR.splitter;
      const cocukHp = Math.max(1, e.maxHp * S.childHpMul);
      for (let k = 0; k < S.children; k++) {
        if (this.enemies.length >= DESCENT.aliveMax) break;
        // ⚠️ Açı SPAWN SAYACINDAN türüyor, rng'den DEĞİL: burada zar atmak
        // RNG akışını ölüm sayısına bağlar ve aynı seed başka koşu üretirdi.
        const a = ((this.spawnCount++ * 2.399) + k * Math.PI) % (Math.PI * 2);
        this.enemies.push({
          typeId: e.typeId,
          x: e.x + Math.cos(a) * S.spreadPx,
          y: e.y + Math.sin(a) * S.spreadPx,
          hp: cocukHp, maxHp: cocukHp,
          speed: e.speed * S.childSpeedMul,
          damage: e.damage,
          radius: Math.max(6, e.radius * S.childRadiusMul),
          // ⚠️ XP de bölünüyor: bölünmek oyuncuya BEDAVA seviye vermemeli.
          xp: Math.max(1, Math.round(e.xp * S.childHpMul)),
          color: e.color, hitFlash: 0,
          art: e.art, animT: 0, facingRight: true, contactCd: 0,
          behavior: 'chase', atkCd: 0, cState: 0, cdx: 0, cdy: 0,
          phase: (this.spawnCount * 1.13) % (Math.PI * 2),
          splitGen: 1,
        });
      }
    }
  }

  /**
   * NADİR GOLD DÜŞÜŞÜ — musluğun ikinci parçası (Kintara modeli).
   *
   * Kill başına maaş yok; her kill düşük ihtimalle gold düşürür. İhtimal
   * derinlikle iyileşir, böylece derin oyuncu üretici / sığ oyuncu cüzi kalır.
   *
   * ⚠️ Zar HER kill'de atılır (düşse de düşmese de) — yoksa RNG akışı
   * ihtimale bağlı olarak kayar ve aynı seed farklı koşu üretir.
   * ⚠️ greed BURAYA girmez: "gold al → düşüş oranı artır" sarmalı kurulmasın.
   */
  private rollRareGold() {
    const depth = this.stage.depth;
    const hit = this.rng.next() < rareDropChance(depth);
    const roll = this.rng.next();
    if (hit) {
      // ⚠️ `greed` MİKTARI çarpar, İHTİMALİ değil (bkz. rareDropChance başlığı).
      // Zar zaten atıldı — çarpma RNG tüketmiyor, yani mühür kaymıyor.
      // greed tabanı 1.0 olduğu için yükseltmesiz oyuncuda etkisi yok.
      // ⚠️ Ascension da MİKTARI çarpar, İHTİMALİ değil — greed'le aynı kanal.
      // Zar zaten atıldı, çarpma RNG tüketmiyor, mühür kaymıyor.
      this.rareGold += rareDropAmount(depth, roll)
        * Math.max(1, this.stats.greed)
        * ascensionDropMul(this.ascension);
      this.events.add('coin');
    }
  }

  private collideHero(h: Hero, dt: number) {
    if (h.iframe > 0) return;
    const cand = this.grid.query(h.px, h.py, PLAYER.radius + 30, this.scratch);
    for (let i = 0; i < cand.length; i++) {
      const e = cand[i];
      const rr = PLAYER.radius + e.radius;
      const dx = e.x - h.px, dy = e.y - h.py;
      if (dx * dx + dy * dy > rr * rr) continue;
      // Armor düz azaltma (VS) — ama en az 1 hasar geçer, yoksa yüksek armor
      // oyuncuyu tamamen dokunulmaz yapar ve run hiç bitmez.
      const taken = Math.max(1, e.damage - h.stats.armor);
      h.hp -= taken;
      h.iframe = PLAYER.iframeSec;
      this.events.add('hurt');
      h.hurtT = 0.32;
      if (this.hurts.length < 4) this.hurts.push({ amount: taken });
      if (h.hp <= 0) {
        if (h.stats.revival > 0) {
          // Second Burial — VS'teki gibi %50 canla dirilir, hak tükenir
          h.stats.revival -= 1;
          h.hp = h.stats.maxHp * 0.5;
          h.iframe = 2.5; // dirilişten sonra nefes payı
          h.revives += 1;
        } else {
          h.hp = 0;
          h.alive = false;
          // ⚠️ 1v1'DE ÖLÜM MAÇI BİTİRİR AMA KİMİN ÖLDÜĞÜNE GÖRE.
          // Solo'da `rival` null ve davranış birebir eski: phase='dead'.
          if (!this.rival) this.phase = 'dead';
          else this.phase = h === this.hero ? 'dead' : 'won';
        }
      }
      return; // tek tick'te tek vuruş
    }
  }

  private updateGems(h: Hero, dt: number) {
    const magnet = PLAYER.pickupRadius * h.stats.magnet;
    for (let i = this.gems.length - 1; i >= 0; i--) {
      const g = this.gems[i];
      g.life -= dt;
      if (g.life <= 0) { this.swapRemove(this.gems, i); continue; }

      const dx = h.px - g.x, dy = h.py - g.y;
      const d = Math.hypot(dx, dy);
      if (d < magnet) {
        // çekim: yaklaştıkça hızlanır (VS'deki mücevher akışı hissi)
        const pull = GEM.magnetSpeed * dt;
        g.x += (dx / (d || 1)) * pull;
        g.y += (dy / (d || 1)) * pull;
      }
      if (d < PLAYER.radius + GEM.radius) {
        this.addXp(h, g.xp);
        this.events.add('gem');
        this.swapRemove(this.gems, i);
      }
    }
  }

  private addXp(h: Hero, amount: number) {
    h.xp += amount * h.stats.growth; // Grave Crown
    // Ömür boyu toplanan XP — seviye atlayınca sıfırlanan `xp`'nin aksine
    // MONOTON. Profil sayfası bunu kullanacak; testler de "XP akıyor mu"
    // sorusunu seviye EŞİĞİNE takılmadan sorabiliyor.
    h.xpEarned += amount * h.stats.growth;
    if (h.xp >= h.xpNext) {
      h.xp -= h.xpNext;
      this.levelUp(h);
    }
  }

  /**
   * Bir seviye atla ve kart ekranını aç.
   *
   * ⚠️ `rollOffers()` RNG TÜKETİR. Bu yüzden çağıran taraf koşullu olmamalı:
   * `pendingLevels` sadece checkpoint'li koşularda 0'dan büyük, normal koşuda
   * bu yol hiç işlemiyor — yani derinlik 1'den başlayan tüm eski seed'ler
   * aynı akışı görüyor ve SIM_VERSION artmıyor.
   */
  private levelUp(h: Hero) {
    h.level += 1;
    h.xpNext = xpForLevel(h.level);
    this.rollOffers(h);
    this.events.add('levelup');
    this.phase = 'levelup';
  }

  /**
   * 3 seçenek üret: silah yükseltmesi + yeni silah + istatistik karışımı.
   * VS deseni: silahlar istatistiklerden ÖNCELİKLİ, yoksa oyuncu tek silahta kalır.
   */
  private rollOffers(h: Hero) {
    const pool: Offer[] = [];

    // sahip olunan ve max'a ulaşmamış silahlar
    for (const w of h.weapons) {
      if (w.level >= w.def.maxLevel) continue;
      pool.push({
        kind: 'weapon-up', id: `w:${w.def.id}`, name: w.def.name,
        desc: `Level ${w.level} → ${w.level + 1}`, level: w.level,
      });
    }
    // slot varsa henüz alınmamış silahlar
    if (h.weapons.length < MAX_WEAPONS) {
      for (const def of WEAPONS) {
        if (h.weapons.some((w) => w.def.id === def.id)) continue;
        // ⚠️ KİLİTLİ SİLAH HAVUZA GİRMEZ. Girip de "kilitli" diye
        // gösterilseydi kart yerini işgal eder, oyuncuya seçemeyeceği bir
        // seçenek sunardı — üç karttan biri boşa giderdi.
        if (this.allowedWeapons && !this.allowedWeapons.has(def.id)) continue;
        pool.push({ kind: 'weapon-new', id: `w:${def.id}`, name: def.name, desc: def.desc });
      }
    }
    // sahip olunan ve max'a ulaşmamış pasifler
    for (const p of h.passives) {
      if (p.level >= p.def.maxLevel) continue;
      pool.push({
        kind: 'passive-up', id: `p:${p.def.id}`, name: p.def.name,
        desc: `${p.def.desc}  (Lv ${p.level} → ${p.level + 1})`, level: p.level,
      });
    }
    // slot varsa henüz alınmamış pasifler
    if (h.passives.length < MAX_PASSIVES) {
      for (const def of PASSIVES) {
        if (h.passives.some((p) => p.def.id === def.id)) continue;
        pool.push({ kind: 'passive-new', id: `p:${def.id}`, name: def.name, desc: def.desc });
      }
    }

    const shuffled = this.rng.shuffle(pool);
    // En az bir SİLAH seçeneği garanti — yoksa oyuncu pasif yağmuruna tutulup
    // tek silahla kalıyor ve build derinliği oluşmuyor.
    const weaponOffers = shuffled.filter((o) => o.kind === 'weapon-up' || o.kind === 'weapon-new');
    const picked: Offer[] = [];
    if (weaponOffers.length) picked.push(weaponOffers[0]);
    // ⚠️ GARANTİLİ PASİF — yukarıdaki garantili silahın SİMETRİĞİ.
    // Silah garantisi vardı, pasif garantisi YOKTU. `MAX_WEAPONS` 4'e
    // inince havuzda silah yükseltmelerinin payı arttı ve ölçümde pasifler
    // aç kaldı (6 yuvanın 2,2'si). Artık her level-up'ta en az bir pasif
    // seçeneği MASADA — almak oyuncunun kararı.
    // ⚠️ Bu, pasif açlığını tek başına ÇÖZMÜYOR: ölçümdeki vekil oyuncu
    // silah yükseltmesini (77 puan) yeni pasiften (62) önde tutuyor ve
    // sayı yerinde kaldı. Vekili sonucu güzelleştirmek için değiştirmek
    // ölçüm aletini kurcalamak olurdu. Yapısal olan şey artık doğru:
    // seçenek her zaman sunuluyor.
    const passiveOffers = shuffled.filter((o) => o.kind === 'passive-up' || o.kind === 'passive-new');
    if (passiveOffers.length) picked.push(passiveOffers[0]);
    for (const o of shuffled) {
      if (picked.length >= 3) break;
      if (picked.includes(o)) continue;
      picked.push(o);
    }
    // KONUM YANLILIĞINI KIR: garantili silah hep 0. sırada kalırsa "hep ilkine
    // basan" oyuncu ömür boyu pasif görmez. Garanti listede OLMAK, sırada değil.
    h.offers = this.rng.shuffle(picked);
  }

  /** levelup fazında seçim uygula */
  choose(id: string) {
    const h = this.hero;   // ⚠️ dışarıdan gelen seçim BİRİNCİ dövüşçünün

    if (this.phase !== 'levelup') return;
    const o = h.offers.find((x) => x.id === id);
    if (!o) return;
    const key = id.slice(2); // "w:" / "p:" önekini at

    switch (o.kind) {
      case 'weapon-new':
        this.giveWeapon(h, key);
        break;
      case 'weapon-up': {
        const w = h.weapons.find((x) => x.def.id === key);
        if (w && w.level < w.def.maxLevel) w.level += 1;
        break;
      }
      case 'passive-new':
        this.givePassive(h, key);
        break;
      case 'passive-up': {
        const p = h.passives.find((x) => x.def.id === key);
        if (p && p.level < p.def.maxLevel) {
          p.level += 1;
          // Max HP artışı anında iyileştirir (VS: Hollow Heart aldığında canın artar)
          const before = h.stats.maxHp;
          this.recomputeStats(this.hero);
          if (h.stats.maxHp > before) h.hp += h.stats.maxHp - before;
        }
        break;
      }
    }
    h.offers = [];
    this.phase = 'running';
  }

  private swapRemove<T>(arr: T[], i: number) {
    const last = arr.length - 1;
    if (i !== last) arr[i] = arr[last];
    arr.pop();
  }

  /**
   * Run özeti — Faz D'de sunucuya bu gönderilecek, ödülü SUNUCU hesaplar.
   *
   * Sunucu `rareGold`'a körlemesine güvenmeyecek: motor deterministik olduğu
   * için aynı seed + aynı mod ile koşuyu yeniden türetip sayıyı doğrulayabilir.
   * `deepestCleared` ise tek tam sayı karşılaştırmasıyla ödüle çevrilir.
   */
  summary() {
    return {
      seed: this.seed,
      mode: this.stage.mode,
      stageId: this.baseStageId,
      startDepth: this.startDepth,
      depth: this.stage.depth,
      deepestCleared: this.stage.deepestCleared,
      durationSec: Math.round(this.time),
      level: this.level,
      kills: this.kills,
      killsByType: this.killsByType,
      rareGold: Math.floor(this.rareGold),
      outcome: this.phase,
    };
  }
}
