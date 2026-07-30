// HUB mantığı — gezinme, çarpışma, etkileşim.
//
// Dünya artık KODDA DEĞİL: editörde çizilen public/map/village.json'dan geliyor
// (mapWorld.ts). world.ts sadece editöre başlangıç şablonu üretiyor.
//
// Simülasyondan (engine.ts) AYRI: burada düşman/hasar/RNG yok.

import { MAP_TILE } from './mapData';
import type { MapWorld, WorldDoor, WorldTravel } from './mapWorld';

export const HUB_PLAYER = { radius: 11, speed: 215 } as const;
export const DOOR_RADIUS = 62;
export const PORTAL_RADIUS = 60;

export type BuildingId = string;

export interface HubState {
  x: number; y: number;
  facingRight: boolean; moving: boolean; animT: number;
  world: MapWorld;
  atDoor: WorldDoor | null;
  atTravel: WorldTravel | null;
  atFight: boolean;
  /** ışınlanma sonrası kısa kilit — portalın üstünde durup geri zıplamayı önler */
  warpLock: number;
}

export function createHub(world: MapWorld): HubState {
  return {
    x: world.spawn.x, y: world.spawn.y,
    facingRight: true, moving: false, animT: 0,
    world, atDoor: null, atTravel: null, atFight: false, warpLock: 0,
  };
}

/** Katı nesnelerle ve su karolarıyla çarpışma */
function blocked(s: HubState, x: number, y: number, r: number) {
  const w = s.world;
  for (const c of w.solids) {
    if (x + r > c.x && x - r < c.x + c.w && y + r > c.y && y - r < c.y + c.h) return true;
  }
  const tx = Math.floor(x / MAP_TILE), ty = Math.floor(y / MAP_TILE);
  if (tx < 0 || ty < 0 || tx >= w.tileW || ty >= w.tileH) return true;
  // Su geçilmez. Karo görselinin adından anlıyoruz — editörde su karosu
  // seçilirken ayrı bir "tip" verilmiyor, tek doğru kaynak dosya yolu.
  const pal = w.palette[w.tiles[ty * w.tileW + tx] - 1];
  if (pal && /water|lake/i.test(pal) && !/bridge/i.test(pal)) return true;
  return false;
}

export function stepHub(s: HubState, dt: number, inx: number, iny: number) {
  if (s.warpLock > 0) s.warpLock -= dt;

  const m = Math.hypot(inx, iny);
  const nx = m > 1e-4 ? inx / m : 0;
  const ny = m > 1e-4 ? iny / m : 0;
  const sp = HUB_PLAYER.speed * dt;
  const r = HUB_PLAYER.radius;

  // Eksenleri AYRI dene — duvara sürtünürken kilitlenme olmasın
  const tx = s.x + nx * sp;
  if (!blocked(s, tx, s.y, r)) s.x = tx;
  const ty = s.y + ny * sp;
  if (!blocked(s, s.x, ty, r)) s.y = ty;

  s.x = Math.max(r, Math.min(s.world.w - r, s.x));
  s.y = Math.max(r, Math.min(s.world.h - r, s.y));

  s.moving = m > 1e-4;
  s.animT += dt;
  if (nx > 0.01) s.facingRight = true;
  else if (nx < -0.01) s.facingRight = false;

  // ── etkileşim yakınlığı ──
  const locked = s.warpLock > 0;

  // dövüş portalı
  const f = s.world.fight;
  s.atFight = !locked && !!f && Math.hypot(f.x - s.x, f.y - s.y) < PORTAL_RADIUS;

  // seyahat portalı
  let bt: WorldTravel | null = null;
  let btd = PORTAL_RADIUS * PORTAL_RADIUS;
  if (!locked) {
    for (const t of s.world.travels) {
      const dx = t.x - s.x, dy = t.y - s.y;
      const d2 = dx * dx + dy * dy;
      if (d2 < btd) { btd = d2; bt = t; }
    }
  }
  s.atTravel = s.atFight ? null : bt;

  // bina kapısı (portallar öncelikli — istemler üst üste binmesin)
  let bd: WorldDoor | null = null;
  let bdd = DOOR_RADIUS * DOOR_RADIUS;
  for (const d of s.world.doors) {
    const dx = d.x - s.x, dy = d.y - s.y;
    const d2 = dx * dx + dy * dy;
    if (d2 < bdd) { bdd = d2; bd = d; }
  }
  s.atDoor = s.atFight || s.atTravel ? null : bd;
}

/** Seyahat portalı — ışınla ve kısa kilit koy (anında geri zıplamasın) */
export function warp(s: HubState, toX: number, toY: number) {
  s.x = toX;
  s.y = toY;
  s.warpLock = 0.9;
  s.atDoor = null;
  s.atTravel = null;
  s.atFight = false;
}
