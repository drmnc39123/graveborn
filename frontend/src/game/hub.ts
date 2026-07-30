// HUB mantığı — gezinme, çarpışma, etkileşim. Dünya verisi world.ts'te.
// Simülasyondan (engine.ts) AYRI: burada düşman/hasar/RNG yok.

import {
  BUILDINGS, DOOR_RADIUS, PORTALS, PORTAL_RADIUS, PORTAL_SIZE, TILE, T, WORLD_H, WORLD_W,
  buildWorld, type Building, type BuildingId, type Portal, type World,
} from './world';

export const HUB_PLAYER = { radius: 11, speed: 215 } as const;
export type { BuildingId };

export interface HubState {
  x: number; y: number;
  facingRight: boolean; moving: boolean; animT: number;
  atDoor: Building | null;
  atPortal: Portal | null;
  world: World;
  /** ışınlanma sonrası kısa kilit — portalın üstünde durup geri zıplamayı önler */
  warpLock: number;
}

export function createHub(): HubState {
  const world = buildWorld();
  return {
    x: 45 * 32, y: 34 * 32, // köy meydanı, çeşmenin hemen altı
    facingRight: true, moving: false, animT: 0,
    atDoor: null, atPortal: null, world, warpLock: 0,
  };
}

/** Bina gövdeleri + katı dekor + su ile çarpışma */
function blocked(s: HubState, x: number, y: number, r: number) {
  for (const b of BUILDINGS) {
    const fx = b.x + b.foot.dx, fy = b.y + b.foot.dy;
    if (x + r > fx && x - r < fx + b.foot.w && y + r > fy && y - r < fy + b.foot.h) return true;
  }
  for (const c of s.world.solids) {
    if (x + r > c.x && x - r < c.x + c.w && y + r > c.y && y - r < c.y + c.h) return true;
  }
  // su geçilmez (köprüler PATH değil ama üstünden geçilebilsin diye köprü
  // konumlarında su zaten yok sayılmıyor — köprüler dekor, su karosu altta kalır)
  // Su geçilmez — ama KÖPRÜ karoları geçilir. Nehri ancak köprüden aşarsın.
  const tx = Math.floor(x / TILE), ty = Math.floor(y / TILE);
  const mw = WORLD_W / TILE, mh = WORLD_H / TILE;
  if (tx < 0 || ty < 0 || tx >= mw || ty >= mh) return true;
  if (s.world.terrain[ty * mw + tx] === T.WATER) return true;
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

  s.x = Math.max(r, Math.min(WORLD_W - r, s.x));
  s.y = Math.max(r, Math.min(WORLD_H - r, s.y));

  s.moving = m > 1e-4;
  s.animT += dt;
  if (nx > 0.01) s.facingRight = true;
  else if (nx < -0.01) s.facingRight = false;

  // portal yakınlığı
  let bp: Portal | null = null;
  let bpd = PORTAL_RADIUS * PORTAL_RADIUS;
  for (const p of PORTALS) {
    const dx = p.x + PORTAL_SIZE / 2 - s.x, dy = p.y + PORTAL_SIZE / 2 - s.y;
    const d2 = dx * dx + dy * dy;
    if (d2 < bpd) { bpd = d2; bp = p; }
  }
  s.atPortal = s.warpLock > 0 ? null : bp;

  // kapı yakınlığı (portal öncelikli — iki istem üst üste binmesin)
  let bd: Building | null = null;
  let bdd = DOOR_RADIUS * DOOR_RADIUS;
  for (const b of BUILDINGS) {
    const dx = b.doorX - s.x, dy = b.doorY - s.y;
    const d2 = dx * dx + dy * dy;
    if (d2 < bdd) { bdd = d2; bd = b; }
  }
  s.atDoor = s.atPortal ? null : bd;
}

/** Seyahat portalı — ışınla ve kısa kilit koy (anında geri zıplamasın) */
export function warp(s: HubState, toX: number, toY: number) {
  s.x = toX;
  s.y = toY;
  s.warpLock = 0.9;
  s.atPortal = null;
  s.atDoor = null;
}
