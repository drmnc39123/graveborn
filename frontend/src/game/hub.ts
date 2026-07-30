// HUB mantığı — gezinme, çarpışma, etkileşim algılama.
// Dünya verisi hubMap.ts'te; burası sadece durum ve hareket.
//
// Simülasyondan (engine.ts) tamamen AYRI: hub'da düşman/hasar/RNG yok.
// Bölüm koşusu deterministik olmak zorunda, hub değil — karıştırmamak kasıtlı.

import {
  BUILDINGS, DOOR_RADIUS, MAP_H, MAP_W, PORTALS, PORTAL_RADIUS, TILE,
  type BuildingId, type HubBuilding, type PortalSpot,
} from './hubMap';

export const HUB_W = MAP_W * TILE;
export const HUB_H = MAP_H * TILE;
export const HUB_PLAYER = { radius: 12, speed: 200 } as const;

export type { BuildingId };

export interface HubState {
  x: number;
  y: number;
  facingRight: boolean;
  moving: boolean;
  animT: number;
  /** kapısında durulan bina */
  atDoor: HubBuilding | null;
  /** üstünde durulan portal */
  atPortal: PortalSpot | null;
}

export function createHub(): HubState {
  // meydanda, portalların hemen altında başla
  return { x: 928, y: 800, facingRight: true, moving: false, animT: 0, atDoor: null, atPortal: null };
}

/** Bina gövdesi (foot) ile çarpışma */
function blocked(x: number, y: number, r: number) {
  for (const b of BUILDINGS) {
    const fx = b.x + b.foot.dx, fy = b.y + b.foot.dy;
    if (x + r > fx && x - r < fx + b.foot.w && y + r > fy && y - r < fy + b.foot.h) return true;
  }
  return false;
}

export function stepHub(s: HubState, dt: number, inx: number, iny: number) {
  const m = Math.hypot(inx, iny);
  const nx = m > 1e-4 ? inx / m : 0;
  const ny = m > 1e-4 ? iny / m : 0;
  const sp = HUB_PLAYER.speed * dt;
  const r = HUB_PLAYER.radius;

  // Eksenleri AYRI dene — duvara sürtünürken tamamen kilitlenmesin,
  // oyuncu köşelerde takılıp kalmasın (klasik "duvara yapışma" şikayeti).
  const tx = s.x + nx * sp;
  if (!blocked(tx, s.y, r)) s.x = tx;
  const ty = s.y + ny * sp;
  if (!blocked(s.x, ty, r)) s.y = ty;

  s.x = Math.max(r, Math.min(HUB_W - r, s.x));
  s.y = Math.max(r, Math.min(HUB_H - r, s.y));

  s.moving = m > 1e-4;
  s.animT += dt;
  if (nx > 0.01) s.facingRight = true;
  else if (nx < -0.01) s.facingRight = false;

  // en yakın portal (öncelikli — meydanda duruyorlar)
  let bp: PortalSpot | null = null;
  let bpd = PORTAL_RADIUS * PORTAL_RADIUS;
  for (const p of PORTALS) {
    const dx = p.x + 48 - s.x, dy = p.y + 48 - s.y;
    const d2 = dx * dx + dy * dy;
    if (d2 < bpd) { bpd = d2; bp = p; }
  }
  s.atPortal = bp;

  // en yakın kapı
  let bd: HubBuilding | null = null;
  let bdd = DOOR_RADIUS * DOOR_RADIUS;
  for (const b of BUILDINGS) {
    const dx = b.doorX - s.x, dy = b.doorY - s.y;
    const d2 = dx * dx + dy * dy;
    if (d2 < bdd) { bdd = d2; bd = b; }
  }
  s.atDoor = bp ? null : bd; // portal varsa o öncelikli, iki istem üst üste binmesin
}
