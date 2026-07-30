// Dünya çizimi. Katman sırası ve derinlik burada çözülüyor.
//
// DERİNLİK: bina/dekor/portal/oyuncu tek listede toplanıp AYAK Y'sine göre
// sıralanıyor → oyuncu ağacın/binanın önündeyse önde, arkasındaysa arkada.
// PERFORMANS: 17.920 karo ve ~1700 dekor var; sadece kameraya giren çiziliyor.

import { C } from '@/lib/theme';
import { drawActor, drawFrame, PLAYER_ART } from './sprites';
import { HUB_PLAYER, type HubState } from './hub';
import {
  BUILDINGS, MAP_H, MAP_W, PORTALS, PORTAL_SIZE, T, TILE, TILESET, WORLD_H, WORLD_W,
  lampLights, type TerrainKind, type World,
} from './world';

interface Drawable { y: number; draw: () => void }

let lights: { x: number; y: number; r: number }[] | null = null;

export function renderHub(
  ctx: CanvasRenderingContext2D, s: HubState,
  w: number, h: number, dpr: number, time: number, unlockedStage: number,
) {
  if (!lights) lights = lampLights(s.world);

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = C.void;
  ctx.fillRect(0, 0, w, h);

  const camX = Math.max(w / 2, Math.min(WORLD_W - w / 2, s.x));
  const camY = Math.max(h / 2, Math.min(WORLD_H - h / 2, s.y));
  const ox = Math.round(w / 2 - camX), oy = Math.round(h / 2 - camY);
  ctx.save();
  ctx.translate(ox, oy);

  const viewL = camX - w / 2 - 128, viewR = camX + w / 2 + 128;
  const viewT = camY - h / 2 - 160, viewB = camY + h / 2 + 160;

  drawTerrain(ctx, s.world, viewL, viewR, viewT, viewB, time);

  // ── derinlik sıralı katman (sadece görünenler) ──
  const items: Drawable[] = [];

  for (const b of BUILDINGS) {
    if (b.x + b.w < viewL || b.x > viewR || b.y + b.h < viewT || b.y > viewB) continue;
    items.push({
      y: b.y + b.foot.dy + b.foot.h,
      draw: () => {
        if (!drawFrame(ctx, b.src, b.x, b.y, { w: b.w, h: b.h })) {
          ctx.fillStyle = '#2b2f2c';
          ctx.fillRect(b.x, b.y, b.w, b.h);
        }
      },
    });
  }

  for (const sc of s.world.scatter) {
    if (sc.x + sc.w < viewL || sc.x > viewR || sc.y + sc.h < viewT || sc.y > viewB) continue;
    items.push({
      y: sc.y + sc.h,
      draw: () => { drawFrame(ctx, sc.src, sc.x, sc.y, { w: sc.w, h: sc.h, fps: sc.fps, t: time }); },
    });
  }

  for (const p of PORTALS) {
    if (p.x + PORTAL_SIZE < viewL || p.x > viewR || p.y + PORTAL_SIZE < viewT || p.y > viewB) continue;
    items.push({
      y: p.y + PORTAL_SIZE,
      draw: () => {
        drawFrame(ctx, p.src, p.x, p.y, { w: PORTAL_SIZE, h: PORTAL_SIZE, fps: 10, t: time });
        // portal ışığı
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        const cx = p.x + PORTAL_SIZE / 2, cy = p.y + PORTAL_SIZE / 2;
        const tint = p.kind === 'fight' ? '200,60,40' : '120,190,150';
        const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, 120);
        g.addColorStop(0, `rgba(${tint},0.28)`);
        g.addColorStop(1, `rgba(${tint},0)`);
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.arc(cx, cy, 120, 0, Math.PI * 2); ctx.fill();
        ctx.restore();
      },
    });
  }

  items.push({
    y: s.y,
    draw: () => {
      if (!drawActor(ctx, PLAYER_ART, s.moving ? 'run' : 'idle', s.animT, s.x, s.y, s.facingRight)) {
        ctx.fillStyle = C.bone;
        ctx.beginPath(); ctx.arc(s.x, s.y, HUB_PLAYER.radius, 0, Math.PI * 2); ctx.fill();
      }
    },
  });

  items.sort((a, b) => a.y - b.y);
  for (const it of items) it.draw();

  drawLamps(ctx, time, viewL, viewR, viewT, viewB);
  drawDoorGlow(ctx, s);
  ctx.restore();

  drawVignette(ctx, w, h);
  drawMinimap(ctx, s, w);
}

// ── MİNİ HARİTA (sağ üst) ─────────────────────────────────────────────
// Zemin bir kez offscreen canvas'a çiziliyor; her frame 6144 karo taramak
// gereksiz. Sadece oyuncu/portal noktaları üstüne biniyor.
let miniBase: HTMLCanvasElement | null = null;
const MINI_W = 168, MINI_H = 112;

function buildMiniBase(world: World) {
  const c = document.createElement('canvas');
  c.width = MAP_W; c.height = MAP_H;
  const g = c.getContext('2d');
  if (!g) return null;
  const img = g.createImageData(MAP_W, MAP_H);
  const col: Record<number, [number, number, number]> = {
    [T.GRASS]: [40, 54, 38], [T.PATH]: [104, 98, 86], [T.WATER]: [38, 74, 104],
    [T.PLAZA]: [92, 96, 96], [T.DIRT]: [70, 58, 44], [T.BRIDGE]: [120, 88, 56],
  };
  for (let i = 0; i < world.terrain.length; i++) {
    const [r, gg, b] = col[world.terrain[i]] ?? col[T.GRASS];
    img.data[i * 4] = r; img.data[i * 4 + 1] = gg; img.data[i * 4 + 2] = b; img.data[i * 4 + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  return c;
}

function drawMinimap(ctx: CanvasRenderingContext2D, s: HubState, w: number) {
  if (!miniBase) miniBase = buildMiniBase(s.world);
  if (!miniBase) return;
  const x = w - MINI_W - 14, y = 14;

  ctx.save();
  ctx.fillStyle = 'rgba(10,8,6,0.82)';
  ctx.fillRect(x - 4, y - 4, MINI_W + 8, MINI_H + 8);
  ctx.strokeStyle = 'rgba(227,216,192,0.28)';
  ctx.lineWidth = 2;
  ctx.strokeRect(x - 4, y - 4, MINI_W + 8, MINI_H + 8);

  ctx.imageSmoothingEnabled = false;
  ctx.globalAlpha = 0.92;
  ctx.drawImage(miniBase, x, y, MINI_W, MINI_H);
  ctx.globalAlpha = 1;

  const sx = MINI_W / WORLD_W, sy = MINI_H / WORLD_H;

  // binalar
  ctx.fillStyle = C.candle;
  for (const b of BUILDINGS) ctx.fillRect(x + b.x * sx - 1, y + b.y * sy - 1, 4, 4);

  // portallar
  for (const p of PORTALS) {
    ctx.fillStyle = p.kind === 'fight' ? C.blood : C.ok;
    ctx.beginPath();
    ctx.arc(x + (p.x + 48) * sx, y + (p.y + 48) * sy, 3, 0, Math.PI * 2);
    ctx.fill();
  }

  // oyuncu
  ctx.fillStyle = C.bone;
  ctx.beginPath();
  ctx.arc(x + s.x * sx, y + s.y * sy, 3.2, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = C.void; ctx.lineWidth = 1; ctx.stroke();
  ctx.restore();
}

function drawTerrain(
  ctx: CanvasRenderingContext2D, world: World,
  vl: number, vr: number, vt: number, vb: number, time: number,
) {
  const x0 = Math.max(0, Math.floor(vl / TILE));
  const x1 = Math.min(MAP_W - 1, Math.ceil(vr / TILE));
  const y0 = Math.max(0, Math.floor(vt / TILE));
  const y1 = Math.min(MAP_H - 1, Math.ceil(vb / TILE));
  const ter = world.terrain;
  const at = (x: number, y: number) =>
    x < 0 || y < 0 || x >= MAP_W || y >= MAP_H ? T.GRASS : (ter[y * MAP_W + x] as TerrainKind);

  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const v = at(x, y);
      const px = x * TILE, py = y * TILE;
      let src: string;

      if (v === T.WATER) {
        // Nehir DÜZ ve sabit genişlikte → sadece sol/sağ kıyı karosu gerekiyor.
        // (Kıvrımlı nehirde kenarlar tutmuyordu — düzelten şey bu.)
        const wl = at(x - 1, y) !== T.WATER;
        const e = at(x + 1, y) !== T.WATER;
        src = wl ? TILESET.waterEdge.left : e ? TILESET.waterEdge.right : TILESET.water;
        drawFrame(ctx, src, px, py, { w: TILE, h: TILE, fps: 2.5, t: time });
        continue;
      }

      if (v === T.BRIDGE) {
        // köprü karosu: altında su akar, üstüne köprü görseli dekor olarak biner
        drawFrame(ctx, TILESET.water, px, py, { w: TILE, h: TILE, fps: 2.5, t: time });
        continue;
      }

      if (v === T.PATH) {
        const n = at(x, y - 1) === T.PATH, s2 = at(x, y + 1) === T.PATH;
        const wl = at(x - 1, y) === T.PATH, e = at(x + 1, y) === T.PATH;
        const P = TILESET.path;
        src = n && s2 && wl && e ? P.cross
          : n && s2 && e ? P.tUp : n && s2 && wl ? P.tDown
          : s2 && e ? P.ul : s2 && wl ? P.ur
          : n && e ? P.dl : n && wl ? P.dr
          : n || s2 ? P.v : P.h;
      } else if (v === T.PLAZA) {
        src = TILESET.plazaTile;
      } else if (v === T.DIRT) {
        src = TILESET.dirt[(x * 7 + y * 13) % TILESET.dirt.length];
      } else {
        src = TILESET.grass[(x * 5 + y * 11) % TILESET.grass.length];
      }

      if (!drawFrame(ctx, src, px, py, { w: TILE, h: TILE })) {
        ctx.fillStyle = v === T.PATH ? '#3a3128' : '#1e2622';
        ctx.fillRect(px, py, TILE, TILE);
      }
    }
  }
}

function drawLamps(ctx: CanvasRenderingContext2D, time: number, vl: number, vr: number, vt: number, vb: number) {
  if (!lights) return;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (let i = 0; i < lights.length; i++) {
    const l = lights[i];
    if (l.x < vl - 200 || l.x > vr + 200 || l.y < vt - 200 || l.y > vb + 200) continue;
    const flicker = 0.88 + Math.sin(time * 3.1 + i * 1.7) * 0.12;
    const r = l.r * flicker;
    const g = ctx.createRadialGradient(l.x, l.y, 0, l.x, l.y, r);
    g.addColorStop(0, 'rgba(239,167,46,0.26)');
    g.addColorStop(0.45, 'rgba(200,120,40,0.10)');
    g.addColorStop(1, 'rgba(239,167,46,0)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(l.x, l.y, r, 0, Math.PI * 2); ctx.fill();
  }
  ctx.restore();
}

function drawDoorGlow(ctx: CanvasRenderingContext2D, s: HubState) {
  for (const b of BUILDINGS) {
    const near = s.atDoor?.id === b.id;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const r = near ? 56 : 30;
    const g = ctx.createRadialGradient(b.doorX, b.doorY, 0, b.doorX, b.doorY, r);
    g.addColorStop(0, `rgba(239,167,46,${near ? 0.5 : 0.14})`);
    g.addColorStop(1, 'rgba(239,167,46,0)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(b.doorX, b.doorY, r, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }
}

function drawVignette(ctx: CanvasRenderingContext2D, w: number, h: number) {
  const g = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.38, w / 2, h / 2, Math.max(w, h) * 0.78);
  g.addColorStop(0, 'rgba(0,0,0,0)');
  g.addColorStop(1, 'rgba(6,5,4,0.58)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
}
