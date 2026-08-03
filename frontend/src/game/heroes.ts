// KARAKTERLER — VS modeli: her karakterin bir İMZA SİLAHI ve istatistik eğilimi var.
//
// Sadece görsel fark yeterli değil; oyuncu "hangisini seçsem" diye
// düşünmüyorsa seçim ekranı gereksiz bir tıklamadan ibarettir. Bu yüzden her
// karakter FARKLI bir silahla başlıyor ve farklı bir oynanış vaat ediyor.
//
// ⚠️ İstatistik eğilimleri motorun `permanent` kanalından geçiyor — Forge
// bonuslarıyla AYNI mekanizma. Yani ayrı bir kod yolu yok, toplanıyorlar.
//
// contentRatio / anchorY / portre kırpma kutuları tarayıcıda ALFA SINIR
// KUTUSU ÖLÇÜLEREK bulundu (repo'nun yerleşik yöntemi), tahminle değil.

import type { StatKey } from './config';

export interface HeroDef {
  id: string;
  name: string;
  title: string;
  /** başlangıç silahı — WEAPONS id'si */
  weapon: string;
  /** oynanışı bir cümlede anlatan vaat */
  blurb: string;
  /** STAT_BASE'e eklenir (cooldown NEGATİF = daha hızlı) */
  stats: Partial<Record<StatKey, number>>;
  /** oyuncuya gösterilecek artı/eksi listesi */
  pros: string[];
  cons: string[];

  // ── görsel ──
  /** public/art/heroes/<dir>/ */
  dir: string;
  /** idle/run dosya şablonları ({i} 1'den başlar) */
  idle: string;
  run: string;
  idleFrames: number;
  runFrames: number;
  /**
   * Saldırı / hasar alma / ölüm animasyonları.
   * ⚠️ Motor bugüne kadar SADECE idle+run çiziyordu — karakter saldırırken
   * duruyordu. Dosyalar diskte hazırdı (kare sayıları ölçüldü), sadece
   * bildirilmiyorlardı. Hepsi `loop: false` oynar.
   */
  atk: string; atkFrames: number;
  hurt: string; hurtFrames: number;
  death: string; deathFrames: number;
  /** oyun içi çizim ölçüleri (ölçülmüş) */
  contentRatio: number;
  anchorY: number;
  drawHeight: number;
  /** portre kırpma: 288×128 karenin içindeki içerik kutusu */
  crop: { x: number; y: number; w: number; h: number };
}

export const HEROES: readonly HeroDef[] = [
  {
    id: 'knight',
    name: 'Fire Knight',
    title: 'The Ember Oath',
    weapon: 'shard',
    blurb: 'Balanced. Fires on its own — the safest way to learn the horde.',
    stats: { armor: 1, maxHp: 0.08 },
    pros: ['+1 armor', '+8% max health', 'Auto-aiming starter weapon'],
    cons: [],
    dir: 'fire-knight', idle: 'idle_{i}.png', run: 'run_{i}.png',
    idleFrames: 8, runFrames: 8,
    atk: '1_atk_{i}.png', atkFrames: 11,
    hurt: 'take_hit_{i}.png', hurtFrames: 6,
    death: 'death_{i}.png', deathFrames: 13,
    contentRatio: 0.344, anchorY: 0.992, drawHeight: 44,
    crop: { x: 100, y: 83, w: 60, h: 44 },
  },
  {
    id: 'ranger',
    name: 'Leaf Ranger',
    title: 'The Long Wake',
    weapon: 'sickle',
    blurb: 'Fragile, relentless. Your sickle flies where you face — aim with your feet.',
    // ⚠️ Önce moveSpeed +%12 verilmişti ve KENDİ SİLAHINA ÇALIŞIYORDU:
    // sürüyü geride bırakıyor, yön bağımlı sickle boşluğa atıyordu. Canlı
    // oyunda 15 saniyede 3 kill. Ölçüm (30 sn, hareketli, 5 seed):
    //   temiz gövde 15,8 · mv+12 varyantı 14,0 · bu varyant 19,2
    // Karakterin istatistiği silahını DESTEKLEMELİ, onunla dövüşmemeli.
    stats: { moveSpeed: 0.05, cooldown: -0.15, projSpeed: 0.15, maxHp: -0.12 },
    pros: ['−15% attack cooldown', '+15% projectile speed', '+5% move speed'],
    cons: ['−12% max health'],
    dir: 'leaf-ranger', idle: 'idle_{i}.png', run: 'run_{i}.png',
    idleFrames: 12, runFrames: 10,
    atk: '1_atk_{i}.png', atkFrames: 10,
    hurt: 'take_hit_{i}.png', hurtFrames: 6,
    death: 'death_{i}.png', deathFrames: 19,
    contentRatio: 0.344, anchorY: 0.992, drawHeight: 44,
    crop: { x: 118, y: 83, w: 49, h: 44 },
  },
  {
    id: 'priestess',
    name: 'Water Priestess',
    title: 'The Still Vigil',
    // ⚠️ Önce Litany (orbit) verilmişti — YANLIŞ SEÇİMDİ. Yörünge silahı
    // ekranda hiçbir şey ATEŞLEMEZ; sadece 78 px'lik halkaya DEĞEN düşmana
    // vurur. Hareket eden oyuncunun ardında sürüklenen düşmanlar halkaya
    // hiç girmiyordu: oyun testinde 13,8 saniyede 2 kill, ölçümde hareket
    // eden oyuncu için 30 sn'de 9 kill (en iyi silah 38).
    // Başlangıç silahı GÖRÜNÜR ve KENDİ HEDEFLEYEN olmalı.
    weapon: 'lightning',
    blurb: 'Slow to kill, hard to kill. Lightning finds the dead for you while your wounds close.',
    stats: { recovery: 0.5, area: 0.15, might: -0.1 },
    pros: ['+0.5 HP/sec regeneration', '+15% attack area'],
    cons: ['−10% damage'],
    dir: 'water-priestess', idle: 'idle_{i}.png', run: 'walk_{i}.png',
    idleFrames: 8, runFrames: 10,
    atk: '1_atk_{i}.png', atkFrames: 7,
    hurt: 'take_hit_{i}.png', hurtFrames: 7,
    death: 'death_{i}.png', deathFrames: 16,
    contentRatio: 0.289, anchorY: 0.992, drawHeight: 40,
    crop: { x: 132, y: 90, w: 28, h: 37 },
  },
  {
    id: 'bladekeeper',
    name: 'Metal Bladekeeper',
    title: 'The Iron Wake',
    weapon: 'lash',
    blurb: 'Heavy and mean. Cuts wide, but the swarm will catch you if you wander.',
    stats: { might: 0.15, maxHp: 0.15, armor: 2, moveSpeed: -0.1 },
    pros: ['+15% damage', '+15% max health', '+2 armor'],
    cons: ['−10% move speed'],
    dir: 'metal-bladekeeper', idle: '01_idle_{i}.png', run: '02_run_{i}.png',
    idleFrames: 8, runFrames: 8,
    atk: '07_1_atk_{i}.png', atkFrames: 6,
    hurt: '12_take_hit_{i}.png', hurtFrames: 6,
    death: '13_death_{i}.png', deathFrames: 12,
    contentRatio: 0.328, anchorY: 0.992, drawHeight: 42,
    crop: { x: 124, y: 85, w: 45, h: 42 },
  },
] as const;

export const DEFAULT_HERO = HEROES[0].id;

export function heroById(id: string | undefined): HeroDef {
  return HEROES.find((h) => h.id === id) ?? HEROES[0];
}

/** Karakter + Forge bonuslarını TEK istatistik nesnesinde topla */
export function mergeStats(
  a: Partial<Record<StatKey, number>>,
  b: Partial<Record<StatKey, number>>,
): Partial<Record<StatKey, number>> {
  const out: Partial<Record<StatKey, number>> = { ...a };
  for (const k of Object.keys(b) as StatKey[]) {
    out[k] = (out[k] ?? 0) + (b[k] ?? 0);
  }
  return out;
}
