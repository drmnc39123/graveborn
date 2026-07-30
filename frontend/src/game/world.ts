// GRAVEBORN DÜNYASI — elle tasarlanmış köy.
//
// ÖNCEKİ HATA: 1600 nesneyi tohumlu rastgeleyle serpiştirip "dünya" demiştim.
// Rastgele serpiştirme tasarım değildir: bina yan yana yığılıyor, portalın
// dibinde çeşme çıkıyor, yol hiçbir yere gitmiyordu.
// ŞİMDİ: her bina, yol ve meydan ELLE konumlandırılıyor. Rastgelelik SADECE
// orman dolgusunda ve o da yollardan/binalardan uzak tutuluyor.
//
// Roller tabelalı binalarla eşleşiyor (BLACKSMITH/GENERAL STORE/MARKET HALL/INN),
// harabe moloz değil.

import { createRng } from './rng';

export const TILE = 32;
export const MAP_W = 96;   // 3072 px
export const MAP_H = 64;   // 2048 px
export const WORLD_W = MAP_W * TILE;
export const WORLD_H = MAP_H * TILE;

// DİKKAT: `const enum` KULLANMA — isolatedModules açık, SWC satır içine alamıyor,
// değerler çalışma anında undefined olup Uint8Array'de 0'a düşüyor (tüm zemin çim olur).
export const T = { GRASS: 0, PATH: 1, WATER: 2, PLAZA: 3, DIRT: 4, BRIDGE: 5 } as const;
export type TerrainKind = typeof T[keyof typeof T];

const GND = '/art/stage/ground';
export const TILESET = {
  // DİKKAT: spr_grass_3 taban karo DEĞİL — şeffaf çim tutamı görseli.
  // Taban olarak kullanınca arkası siyah kalıyor ve harita dama tahtasına dönüyor.
  grass: [`${GND}/spr_grass_1.png`, `${GND}/spr_grass_2.png`],
  dirt: [`${GND}/spr_mud_1.png`, `${GND}/spr_mud_2.png`],
  path: {
    h: `${GND}/spr_stone_path_horizontal_1.png`,
    v: `${GND}/spr_stone_path_vertical_1.png`,
    cross: `${GND}/spr_stone_path_cross_roads_1.png`,
    tUp: `${GND}/spr_stone_path_t_up_1.png`,
    tDown: `${GND}/spr_stone_path_t_down_1.png`,
    ul: `${GND}/spr_stone_path_corner_up_left_1.png`,
    ur: `${GND}/spr_stone_path_corner_up_right_1.png`,
    dl: `${GND}/spr_stone_path_corner_down_left_1.png`,
    dr: `${GND}/spr_stone_path_corner_down_right_1.png`,
  },
  plazaTile: '/art/hub/village/spr_dark_grass_1.png', // gri arnavut kaldırımı
  water: '/art/world/water/spr_water_tile_strip2.png',
  waterEdge: {
    left: '/art/world/water/spr_water_vertical_left_strip2.png',
    right: '/art/world/water/spr_water_vertical_right_strip2.png',
  },
} as const;

// ── BİNALAR ───────────────────────────────────────────────────────────
// Hepsi 128×128. Izgarada 4 karo; aralarında EN AZ 6 karo boşluk bırakıldı
// (önceki sürümde dip dibeydiler).
export type BuildingId = 'quests' | 'upgrade' | 'shop' | 'market' | 'exchange' | 'tavern';

export interface Building {
  id: BuildingId; name: string; hint: string; src: string;
  x: number; y: number; w: number; h: number;
  foot: { dx: number; dy: number; w: number; h: number };
  doorX: number; doorY: number;
}

const TW = '/art/town';
/** 128'lik binalar için ortak taban: alt %30 basılamaz, kapı tam ortada altta */
const b128 = (id: BuildingId, name: string, hint: string, file: string, tx: number, ty: number): Building => {
  const x = tx * TILE, y = ty * TILE;
  return {
    id, name, hint, src: `${TW}/${file}.png`, x, y, w: 128, h: 128,
    foot: { dx: 10, dy: 76, w: 108, h: 46 },
    doorX: x + 64, doorY: y + 138,
  };
};

export const BUILDINGS: readonly Building[] = [
  b128('upgrade', 'The Forge', 'Spend GOLD on permanent power', 'Blacksmith', 22, 21),
  b128('tavern', 'The Rest', 'Your profile and records', 'Inn', 38, 21),
  b128('market', 'Market Hall', 'Trade with other players', 'Market_Hall', 54, 21),
  b128('shop', 'General Store', 'Buy items and consumables', 'General_Store', 22, 40),
  b128('exchange', 'The Exchange', 'Swap GOLD for $GRAVE', 'Spr_Alchemy_Laboratory', 54, 40),
  b128('quests', 'The Old Church', 'The Fight Portal stands before it', 'Church', 42, 6),
] as const;

/** Dekoratif binalar — rol yok, köyü dolduruyor. Yine ELLE konumlandırıldı. */
export interface Decor { src: string; x: number; y: number; w: number; h: number; solid?: number; fps?: number }

const d = (file: string, tx: number, ty: number, w = 128, h = 128, solid = 42): Decor =>
  ({ src: `${TW}/${file}.png`, x: tx * TILE, y: ty * TILE, w, h, solid });

export const DECOR: readonly Decor[] = [
  // kale duvarı + muhafız kapısı — mezarlığı köyden ayırır
  d('spr_castle_wall_1', 30, 16), d('spr_castle_wall_1', 34, 16),
  d('Guard_House', 42, 16),
  d('spr_castle_wall_1', 50, 16), d('spr_castle_wall_1', 54, 16),
  d('spr_castle_tower', 26, 16), d('spr_castle_tower', 58, 16),

  // köy dolgu evleri — meydanın çevresinde, aralıklı
  d('Bakery', 30, 40), d('Merchant_House', 62, 30), d('Stone_House', 16, 30),
  d('Carpenter_Workshop', 46, 47), d('Small_Cottage', 30, 51), d('Farmhouse', 60, 47),
  d('spr_cozy_barn', 68, 40), d('spr_store_house', 16, 47),

  // nehir kıyısında su değirmeni — nehre bakması mantıklı
  { src: `${TW}/spr_water_building.png`, x: 72 * TILE, y: 34 * TILE, w: 64, h: 96, solid: 34 },

  // gözlemevi — uzaktan görünen dönüm noktası
  { src: `${TW}/Spr_Magical_Observatory.png`, x: 14 * TILE, y: 18 * TILE, w: 256, h: 256, solid: 70 },
] as const;

// ── PORTALLAR ─────────────────────────────────────────────────────────
// TEK dövüş portalı (kilisenin önünde, mezarlıkta — çeşmenin dibinde değil).
// Diğerleri sadece keşif amaçlı ışınlanma.
export interface Portal {
  id: string; kind: 'fight' | 'travel';
  src: string; x: number; y: number; label: string; toX?: number; toY?: number;
}

const P = '/art/portals';
export const PORTALS: readonly Portal[] = [
  { id: 'fight', kind: 'fight', src: `${P}/spr_fire_portal_strip7.png`, x: 45 * TILE, y: 11 * TILE, label: 'The Fight Portal' },
  { id: 'toWood', kind: 'travel', src: `${P}/spr_Nature_portal_strip7.png`, x: 45 * TILE, y: 57 * TILE, label: 'Blackroot Wood', toX: 6 * TILE, toY: 55 * TILE },
  { id: 'toVillage', kind: 'travel', src: `${P}/spr_holy_portal_strip7.png`, x: 4 * TILE, y: 54 * TILE, label: 'Return to the Village', toX: 45 * TILE + 48, toY: 55 * TILE + 130 },
] as const;

export const PORTAL_SIZE = 96;
export const PORTAL_RADIUS = 56;
export const DOOR_RADIUS = 62;

// ── ÜRETİLEN DÜNYA ────────────────────────────────────────────────────
export interface Scatter { src: string; x: number; y: number; w: number; h: number; fps?: number }
export interface Solid { x: number; y: number; w: number; h: number }
export interface World { terrain: Uint8Array; scatter: Scatter[]; solids: Solid[] }

const idx = (x: number, y: number) => y * MAP_W + x;

function rect(t: Uint8Array, x0: number, y0: number, x1: number, y1: number, v: TerrainKind) {
  for (let y = Math.max(0, y0); y <= Math.min(MAP_H - 1, y1); y++)
    for (let x = Math.max(0, x0); x <= Math.min(MAP_W - 1, x1); x++) t[idx(x, y)] = v;
}

// ── NEHİR ve KÖPRÜ ────────────────────────────────────────────────────
// DÜZ ve SABİT genişlikte (5 karo). Önceki sürümde sinüs ile kıvrılıyordu;
// kenar karoları tutmuyordu ve köprü nehre oturmuyordu.
export const RIVER_X0 = 78, RIVER_X1 = 82;
export const BRIDGE_Y0 = 31, BRIDGE_Y1 = 33;

export function buildWorld(): World {
  const gen = createRng(0x62a4e1);
  const rng = () => gen.next();
  const t = new Uint8Array(MAP_W * MAP_H);
  const scatter: Scatter[] = [];
  const solids: Solid[] = [];

  // nehir
  rect(t, RIVER_X0, 0, RIVER_X1, MAP_H - 1, T.WATER);
  // köprü — nehrin ÜSTÜNDEN geçilir; bu karolar yürünebilir
  rect(t, RIVER_X0 - 2, BRIDGE_Y0, RIVER_X1 + 2, BRIDGE_Y1, T.BRIDGE);

  // meydan
  rect(t, 36, 27, 54, 37, T.PLAZA);
  // mezarlık toprağı
  rect(t, 34, 2, 62, 15, T.DIRT);

  // yollar — ana kuzey-güney ekseni + doğu-batı ekseni (meydanda kesişir)
  rect(t, 44, 10, 46, 26, T.PATH);   // kilise → meydan
  rect(t, 44, 38, 46, 58, T.PATH);   // meydan → güney portalı
  rect(t, 8, 31, 35, 33, T.PATH);    // batı → meydan
  rect(t, 55, 31, RIVER_X0 - 3, 33, T.PATH); // meydan → köprü
  rect(t, 24, 25, 26, 31, T.PATH);   // Blacksmith spuru
  rect(t, 56, 25, 58, 31, T.PATH);   // Market spuru
  rect(t, 24, 33, 26, 40, T.PATH);   // Store spuru
  rect(t, 56, 33, 58, 40, T.PATH);   // Exchange spuru

  const free = (px: number, py: number) => {
    const tx = Math.floor(px / TILE), ty = Math.floor(py / TILE);
    if (tx < 1 || ty < 1 || tx >= MAP_W - 1 || ty >= MAP_H - 1) return false;
    return t[idx(tx, ty)] === T.GRASS;
  };
  const clearOf = (px: number, py: number, min: number) =>
    BUILDINGS.every((b) => Math.hypot(px - (b.x + 64), py - (b.y + 64)) > min) &&
    DECOR.every((c) => Math.hypot(px - (c.x + c.w / 2), py - (c.y + c.h / 2)) > min * 0.8) &&
    PORTALS.every((p) => Math.hypot(px - p.x, py - p.y) > 170);

  const add = (src: string, x: number, y: number, w: number, h: number, solid?: number, fps?: number) => {
    scatter.push({ src, x, y, w, h, fps });
    if (solid) solids.push({ x: x + w * 0.28, y: y + h - solid, w: w * 0.44, h: solid });
  };

  // dekoratif binaları çarpışmaya ve çizime ekle
  for (const c of DECOR) add(c.src, c.x, c.y, c.w, c.h, c.solid, c.fps);

  // ── ORMAN KUŞAKLARI ── (yalnızca bu dikdörtgenlerde, yoldan uzak)
  const trees = Array.from({ length: 16 }, (_, i) => `/art/world/darktrees/spr_dark_tree_${i + 1}.png`);
  const forestZones: [number, number, number, number][] = [
    [0, 0, 30, 15],       // kuzeybatı
    [66, 0, 96, 15],      // kuzeydoğu
    [0, 36, 12, 64],      // batı şeridi
    [0, 52, 40, 64],      // güneybatı
    [58, 50, 78, 64],     // güneydoğu
    [84, 0, 96, 64],      // nehrin doğusu
  ];
  for (const [zx0, zy0, zx1, zy1] of forestZones) {
    const area = (zx1 - zx0) * (zy1 - zy0);
    const count = Math.floor(area * 0.42);
    for (let i = 0; i < count; i++) {
      const x = (zx0 + rng() * (zx1 - zx0)) * TILE;
      const y = (zy0 + rng() * (zy1 - zy0)) * TILE;
      if (!free(x, y) || !clearOf(x, y, 150)) continue;
      add(trees[Math.floor(rng() * trees.length)], x, y, 64, 64, 14);
    }
  }

  // zemin ayrıntısı — çim tutamı, çiçek, taş (çarpışmasız)
  const detail = [
    '/art/world/forest/Spr_Grass_Tuft_1.png', '/art/world/forest/Spr_Grass_Tuft_2.png',
    '/art/world/forest/spr_flower_1.png', '/art/world/forest/spr_flower_2.png',
    '/art/world/forest/spr_mushrooms_1.png', '/art/world/forest/spr_rock.png',
    '/art/world/forest/spr_tall_grass_1.png',
  ];
  for (let i = 0; i < 380; i++) {
    const x = rng() * WORLD_W, y = rng() * WORLD_H;
    if (!free(x, y) || !clearOf(x, y, 90)) continue;
    add(detail[Math.floor(rng() * detail.length)], x, y, 32, 32);
  }

  // ── MEZARLIK — kilisenin iki yanında DÜZENLİ sıralar ──
  for (let row = 0; row < 3; row++) {
    for (let col = 0; col < 6; col++) {
      for (const side of [34, 52]) {
        const x = (side + col) * TILE;
        const y = (4 + row * 3) * TILE;
        if (Math.abs(x - 45 * TILE) < 190) continue; // portalın önünü boş bırak
        add(`/art/world/ruins/spr_old_stone_${1 + Math.floor(rng() * 3)}.png`, x, y, 32, 32, 10);
      }
    }
  }
  add('/art/world/ruins/spr_Heros_Tomb.png', 38 * TILE, 3 * TILE, 64, 64, 20);
  add('/art/world/ruins/spr_old_statue.png', 56 * TILE, 3 * TILE, 64, 64, 18);

  // ── KÖPRÜ GÖRSELİ ── nehrin üstüne, tam genişliğinde
  for (let bx = RIVER_X0 - 2; bx <= RIVER_X1 + 2; bx += 3) {
    scatter.push({ src: '/art/world/bridges/spr_bridge_1.png', x: bx * TILE, y: (BRIDGE_Y0 - 1) * TILE, w: 96, h: 96 });
  }

  // ── MEYDAN PROPLARI ── az ve yerinde (önce 6 tezgah üst üsteydi)
  add('/art/world/square/spr_water_fountain_strip2.png', 44 * TILE, 31 * TILE, 128, 64, 26, 3);
  add('/art/world/props/spr_well.png', 38 * TILE, 34 * TILE, 48, 48, 18);
  add('/art/hub/stalls/spr_stall_1.png', 49 * TILE, 28 * TILE, 64, 64, 18);
  add('/art/hub/stalls/spr_stall_4.png', 39 * TILE, 28 * TILE, 64, 64, 18);
  add('/art/hub/stalls/spr_cart.png', 51 * TILE, 35 * TILE, 64, 64, 16);

  // fenerler — yol boyunca düzenli
  const lamps: [number, number][] = [
    [42, 25], [48, 25], [42, 38], [48, 38], [34, 31], [56, 31],
    [44, 17], [46, 45], [20, 31], [70, 31],
  ];
  for (const [lx, ly] of lamps) add('/art/hub/lights/spr_outdoor_lamp.png', lx * TILE, ly * TILE, 64, 64, 10);

  return { terrain: t, scatter, solids };
}

/**
 * Bir karonun ÇİZİLECEK görselini döndürür (autotile dahil).
 * hubRender ile AYNI kuralları uygular — editör "koddaki dünyayı yükle"
 * derken bunu kullanıyor ki editördeki görüntü oyundakiyle birebir olsun.
 */
export function tileSrcAt(world: World, x: number, y: number): string {
  const at = (a: number, b: number): number =>
    a < 0 || b < 0 || a >= MAP_W || b >= MAP_H ? T.GRASS : world.terrain[b * MAP_W + a];
  const v = at(x, y);

  if (v === T.WATER) {
    const wl = at(x - 1, y) !== T.WATER;
    const e = at(x + 1, y) !== T.WATER;
    return wl ? TILESET.waterEdge.left : e ? TILESET.waterEdge.right : TILESET.water;
  }
  if (v === T.BRIDGE) return TILESET.water;
  if (v === T.PATH) {
    const n = at(x, y - 1) === T.PATH, s = at(x, y + 1) === T.PATH;
    const wl = at(x - 1, y) === T.PATH, e = at(x + 1, y) === T.PATH;
    const P = TILESET.path;
    return n && s && wl && e ? P.cross
      : n && s && e ? P.tUp : n && s && wl ? P.tDown
      : s && e ? P.ul : s && wl ? P.ur
      : n && e ? P.dl : n && wl ? P.dr
      : n || s ? P.v : P.h;
  }
  if (v === T.PLAZA) return TILESET.plazaTile;
  if (v === T.DIRT) return TILESET.dirt[(x * 7 + y * 13) % TILESET.dirt.length];
  return TILESET.grass[(x * 5 + y * 11) % TILESET.grass.length];
}

export function lampLights(w: World) {
  return w.scatter.filter((s) => s.src.includes('outdoor_lamp')).map((s) => ({ x: s.x + 32, y: s.y + 42, r: 170 }));
}
