// GRAVEBORN — oyun dengesi. TÜM ayar sayıları burada, kod içine gömülmez.
// Denge değişikliği = sadece bu dosya. Motor bu sabitleri okur, kendi sayısı yoktur.

export const TICK = 1 / 60; // sabit timestep — simülasyon 60Hz, render ayrı
export const MAX_CATCHUP = 5; // bir frame'de en fazla 5 tick (sekme arka plana gidince donma olmasın)

export const RUN = {
  /** Run hedef süresi (saniye). VS'de 30 dk; biz 20 dk ile daha sıkı tutuyoruz. */
  durationSec: 20 * 60,
  arenaRadius: 2400, // oyuncu bu daireden çıkamaz (sonsuz kaçışı engeller)
} as const;

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
  | 'aimed'  // #1 en yakın düşmana mermi (Bone Shard)
  | 'sweep'  // #2 yatay kesik, düşmandan geçer (Grave Lash)
  | 'orbit'  // #6 karakterin etrafında yörünge (Litany)
  | 'aura';  // #8 yakın alan aurası (Wardsalt)

export interface WeaponDef {
  id: string;
  name: string;
  desc: string;
  pattern: WeaponPattern;
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
}

export const WEAPONS: readonly WeaponDef[] = [
  {
    id: 'shard', name: 'Bone Shard', desc: 'Fires at the nearest enemy',
    pattern: 'aimed', maxLevel: 8, damage: 20, cooldownSec: 0.42,
    dmgPerLevel: 1.18, cdPerLevel: 0.94, countLevels: [3, 5, 7],
    projectileSpeed: 470, spreadRad: 0.16, pierce: 1, range: 620, lifeSec: 1.5,
  },
  {
    id: 'lash', name: 'Grave Lash', desc: 'Slashes horizontally, passes through enemies',
    pattern: 'sweep', maxLevel: 8, damage: 26, cooldownSec: 1.05,
    dmgPerLevel: 1.2, cdPerLevel: 0.93, countLevels: [4, 7],
    sweepW: 132, sweepH: 46, sweepLifeSec: 0.18, areaPerLevel: 1.07,
  },
  {
    id: 'litany', name: 'Litany', desc: 'Pages orbit you, striking what they touch',
    pattern: 'orbit', maxLevel: 8, damage: 14, cooldownSec: 0.5,
    dmgPerLevel: 1.16, cdPerLevel: 0.97, countLevels: [2, 4, 6, 8],
    orbitRadius: 78, orbitSpeed: 2.3, orbRadius: 13, areaPerLevel: 1.05,
  },
  {
    id: 'ward', name: 'Wardsalt', desc: 'Burns everything near you',
    pattern: 'aura', maxLevel: 8, damage: 9, cooldownSec: 0.62,
    dmgPerLevel: 1.22, cdPerLevel: 0.95,
    auraRadius: 74, areaPerLevel: 1.09,
  },
] as const;

/** Aynı anda taşınabilecek silah sayısı (VS: 6) */
export const MAX_WEAPONS = 6;
/** Alan hasarı (aura/orbit) aynı düşmana en sık bu aralıkla vurur */
export const CONTACT_HIT_CD = 0.42;

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
}

// Renkler theme.ts paletinden — MOR YOK
export const ENEMIES: readonly EnemyType[] = [
  // Her tip ayrı sprite'a bağlı — sürüde görsel çeşitlilik oyunun "ucuz klon"
  // görünmemesinin en belirgin işareti (tür incelemesinden çıkan ders).
  { id: 'imp', hp: 10, speed: 46, damage: 6, radius: 10, xp: 1, color: '#8a97a3', fromMinute: 0, art: 'mon_imp' },
  { id: 'rogue', hp: 14, speed: 58, damage: 7, radius: 10, xp: 1, color: '#b8ae98', fromMinute: 0, art: 'mon_rogue' },
  { id: 'skeleton', hp: 18, speed: 44, damage: 8, radius: 11, xp: 2, color: '#ddd3bb', fromMinute: 1.5, art: 'skeleton' },
  { id: 'wretch', hp: 22, speed: 62, damage: 8, radius: 11, xp: 2, color: '#8a97a3', fromMinute: 2, art: 'mon_wretch' },
  { id: 'horned', hp: 30, speed: 48, damage: 10, radius: 12, xp: 3, color: '#5f9e4a', fromMinute: 3, art: 'mon_horned' },
  { id: 'bird', hp: 26, speed: 78, damage: 9, radius: 11, xp: 3, color: '#efa72e', fromMinute: 4, art: 'mon_bird' },
  { id: 'brute', hp: 62, speed: 34, damage: 14, radius: 16, xp: 5, color: '#a01226', fromMinute: 5, art: 'mon_brute' },
  { id: 'fiend', hp: 48, speed: 66, damage: 12, radius: 13, xp: 5, color: '#c8324a', fromMinute: 6, art: 'mon_fiend' },
  { id: 'crab', hp: 90, speed: 38, damage: 16, radius: 17, xp: 7, color: '#efa72e', fromMinute: 8, art: 'mon_crab' },
  { id: 'warrior', hp: 110, speed: 52, damage: 18, radius: 15, xp: 9, color: '#a01226', fromMinute: 10, art: 'mon_warrior' },
  { id: 'hulk', hp: 210, speed: 30, damage: 22, radius: 22, xp: 14, color: '#5f9e4a', fromMinute: 12, art: 'mon_hulk' },
] as const;

/** DENGE NOTU: ilk değerler (base 2.4 / perMinute 1.7 / cap 620 / hp +%34) ile
 *  5. dakikada tavan doluyordu — hem görsel lapa hem de kill hızı çöküşü.
 *  Tavan 420'ye çekildi (okunabilirlik + fps payı), eğri yumuşatıldı. */
export const SPAWN = {
  /** Ekran kenarının bu kadar dışında doğar (aniden içeride belirmesin) */
  ringMargin: 90,
  /** Saniyede doğan düşman: base + minute * perMinute */
  base: 2.0,
  perMinute: 0.85,
  /** Aynı anda sahnede en fazla kaç düşman (performans + okunabilirlik tavanı) */
  maxAlive: 420,
  /** Düşman HP/hız dakika bazlı ölçeklenmesi */
  hpScalePerMinute: 0.17,
  speedScalePerMinute: 0.018,
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
  | 'luck' | 'growth' | 'greed' | 'curse' | 'revival';

/** VS taban değerleri. Yüzdeler 1.0 = %100. */
export const STAT_BASE: Record<StatKey, number> = {
  might: 1, armor: 0, maxHp: PLAYER.maxHp, recovery: 0, cooldown: 1, area: 1,
  projSpeed: 1, duration: 1, amount: 0, moveSpeed: 1, magnet: 1,
  luck: 1, growth: 1, greed: 1, curse: 1, revival: 0,
};

/** VS tavanları. cooldown TABAN değil TAVAN sınırı (%10'un altına inemez). */
export const STAT_CAP: Partial<Record<StatKey, number>> = {
  might: 10,      // %1000
  armor: 50,
  area: 10,       // %1000
  projSpeed: 5,   // %500
  duration: 5,    // %500
  amount: 10,
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
  { id: 'luck', name: "Dead Man's Luck", vs: 'Clover', stat: 'luck', perLevel: 0.10, maxLevel: 5, desc: '+10% luck' },
  { id: 'crown', name: 'Grave Crown', vs: 'Crown', stat: 'growth', perLevel: 0.08, maxLevel: 5, desc: '+8% experience' },
  { id: 'coinmask', name: 'Coin Mask', vs: 'Stone Mask', stat: 'greed', perLevel: 0.10, maxLevel: 5, desc: '+10% gold' },
  { id: 'skull', name: 'Cursed Skull', vs: "Skull O'Maniac", stat: 'curse', perLevel: 0.10, maxLevel: 5, desc: '+10% curse — deadlier, richer' },
  { id: 'burial', name: 'Second Burial', vs: 'Tirajisú', stat: 'revival', perLevel: 1, maxLevel: 2, desc: '+1 revival' },
] as const;

/** Aynı anda taşınabilecek pasif sayısı (VS: 6, silahlardan ayrı) */
export const MAX_PASSIVES = 6;


