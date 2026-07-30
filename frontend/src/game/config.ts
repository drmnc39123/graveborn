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
  // NOT: şu an tam animasyonlu tek düşman sprite'ımız var (CC0 iskelet).
  // Diğer tipler daireye düşüyor — meşru paketler gelince sadece `art` alanı eklenecek.
  { id: 'husk', hp: 10, speed: 42, damage: 6, radius: 11, xp: 1, color: '#8a97a3', fromMinute: 0, art: 'skeleton' },
  { id: 'crawler', hp: 18, speed: 62, damage: 8, radius: 10, xp: 2, color: '#b8ae98', fromMinute: 2 },
  { id: 'brute', hp: 55, speed: 33, damage: 14, radius: 18, xp: 5, color: '#a01226', fromMinute: 4 },
  { id: 'shade', hp: 30, speed: 82, damage: 10, radius: 12, xp: 4, color: '#5f9e4a', fromMinute: 6 },
  { id: 'gorger', hp: 140, speed: 28, damage: 20, radius: 25, xp: 12, color: '#efa72e', fromMinute: 9 },
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

/** Level-up'ta sunulan yükseltmeler. VS'nin "3 seçenekten 1" deseni. */
export interface Upgrade {
  id: string;
  name: string;
  desc: string;
  /** kaç kez alınabilir */
  maxStack: number;
}

// İsimler CLONE-SPEC.md'deki pasif item haritasıyla hizalı (Bloodmeal=Might,
// Restless Hands=Cooldown, Echo Charm=Amount, Unquiet Step=Move Speed,
// Soul Pull=Magnet, Stubborn Flesh=Max Health, Slow Knit=Recovery).
// OYUNCU-YÜZÜ TÜM METİNLER İNGİLİZCE — kod yorumları Türkçe.
export const UPGRADES: readonly Upgrade[] = [
  { id: 'dmg', name: 'Bloodmeal', desc: '+20% damage', maxStack: 8 },
  { id: 'rate', name: 'Restless Hands', desc: '-12% cooldown', maxStack: 8 },
  { id: 'count', name: 'Echo Charm', desc: '+1 projectile', maxStack: 4 },
  { id: 'pierce', name: 'Grave Iron', desc: '+1 pierce', maxStack: 3 },
  { id: 'speed', name: 'Unquiet Step', desc: '+10% move speed', maxStack: 5 },
  { id: 'magnet', name: 'Soul Pull', desc: '+35% pickup radius', maxStack: 4 },
  { id: 'hp', name: 'Stubborn Flesh', desc: '+20 max health, full heal', maxStack: 5 },
  { id: 'regen', name: 'Slow Knit', desc: '+0.4 HP/sec', maxStack: 4 },
] as const;
