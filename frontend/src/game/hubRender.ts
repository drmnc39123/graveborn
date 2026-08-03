// Dünya çizimi — editörde çizilen haritadan (mapWorld.ts).
//
// DERİNLİK: nesneler mapWorld'de bir kez ayak Y'sine göre sıralanıyor.
// Oyuncu her frame kendi Y'sine göre araya sokuluyor (binary search) —
// 2086 nesneyi her karede yeniden sıralamak boşuna maliyetti.
//
// PERFORMANS: sadece kameraya girenler çiziliyor.

import { C } from '@/lib/theme';
import { drawActor, drawFrame, PLAYER_ART } from './sprites';
import { DOOR_RADIUS, HUB_PLAYER, PORTAL_RADIUS, type HubState } from './hub';
import { MAP_TILE } from './mapData';
import type { MapWorld, WorldObject } from './mapWorld';

/**
 * Köyün gece rengi. ⚠️ MOR YOK (kullanıcının kuralı) — soğuk mavi-gri.
 * Bu tek sabit sahnenin havasını belirliyor: altındaki parlak çim
 * (rgb 105,135,56) soğuyup gotik palete oturuyor.
 */
const NIGHT = 'rgba(13,18,28,0.62)';

/**
 * HATA AYIKLAMA — F1 ile açılır. Çarpışma kutularını, oyuncu yarıçapını ve
 * etkileşim mesafelerini çizer.
 * Neden var: "görünmez engel" şikayetlerini tahminle kovalamak yerine
 * doğrudan görmek için. Kutu görünüyorsa sebebi bellidir.
 */
export const DEBUG = { collision: false };

function drawCollisionDebug(
  ctx: CanvasRenderingContext2D, s: HubState,
  vl: number, vr: number, vt: number, vb: number,
) {
  const w = s.world;
  ctx.save();
  ctx.lineWidth = 2;
  for (const c of w.solids) {
    if (c.x + c.w < vl || c.x > vr || c.y + c.h < vt || c.y > vb) continue;
    // duvarlar mavi (yol bunları deler), diğerleri kırmızı
    ctx.fillStyle = c.wall ? 'rgba(90,150,255,0.28)' : 'rgba(255,60,80,0.28)';
    ctx.strokeStyle = c.wall ? 'rgba(90,150,255,0.9)' : 'rgba(255,60,80,0.9)';
    ctx.fillRect(c.x, c.y, c.w, c.h);
    ctx.strokeRect(c.x, c.y, c.w, c.h);
  }
  // köprüler yeşil
  ctx.strokeStyle = 'rgba(95,200,120,0.95)';
  ctx.fillStyle = 'rgba(95,200,120,0.2)';
  for (const b of w.bridges) {
    if (b.x + b.w < vl || b.x > vr) continue;
    ctx.fillRect(b.x, b.y, b.w, b.h);
    ctx.strokeRect(b.x, b.y, b.w, b.h);
  }
  // oyuncu yarıçapı
  ctx.strokeStyle = '#fff';
  ctx.beginPath();
  ctx.arc(s.x, s.y, HUB_PLAYER.radius, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

/**
 * MENÜ ARKA PLANI — ana sayfada yavaşça süzülen köy.
 *
 * Oyunun kendi haritasını kullanır: ana sayfada başka bir görsel göstermek
 * hem yalan olurdu hem de ikinci bir varlık takımı bakımı demekti. Aynı
 * çizim fonksiyonları (drawTerrain/drawObject/drawLights) tekrar kullanılıyor.
 *
 * Oyuncu, mini harita ve etkileşim parıltısı YOK — burası oynanmıyor.
 */
export function renderMenuBackground(
  ctx: CanvasRenderingContext2D, world: MapWorld,
  w: number, h: number, dpr: number, time: number,
  camX: number, camY: number,
) {
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = C.void;
  ctx.fillRect(0, 0, w, h);

  const cx = Math.max(w / 2, Math.min(world.w - w / 2, camX));
  const cy = Math.max(h / 2, Math.min(world.h - h / 2, camY));
  ctx.save();
  ctx.translate(Math.round(w / 2 - cx), Math.round(h / 2 - cy));

  const viewL = cx - w / 2 - 160, viewR = cx + w / 2 + 160;
  const viewT = cy - h / 2 - 200, viewB = cy + h / 2 + 200;

  drawTerrain(ctx, world, viewL, viewR, viewT, viewB, time);
  for (const o of world.objects) drawObject(ctx, o, viewL, viewR, viewT, viewB, time);
  drawMenuLights(ctx, world, time, viewL, viewR, viewT, viewB);
  ctx.restore();

  drawVignette(ctx, w, h);
}

/** Menüde ışıklar oyuncuya değil sadece zamana bağlı titrer */
function drawMenuLights(
  ctx: CanvasRenderingContext2D, world: MapWorld, time: number,
  vl: number, vr: number, vt: number, vb: number,
) {
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (const l of world.lights) {
    if (l.x < vl || l.x > vr || l.y < vt || l.y > vb) continue;
    const flick = 0.86 + Math.sin(time * 3.1 + l.x * 0.03) * 0.14;
    const r = l.r * flick;
    const g = ctx.createRadialGradient(l.x, l.y, 0, l.x, l.y, r);
    g.addColorStop(0, `rgba(239,167,46,${0.30 * flick})`);
    g.addColorStop(1, 'rgba(239,167,46,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(l.x, l.y, r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

export function renderHub(
  ctx: CanvasRenderingContext2D, s: HubState,
  w: number, h: number, dpr: number, time: number,
) {
  const world = s.world;

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = C.void;
  ctx.fillRect(0, 0, w, h);

  const camX = Math.max(w / 2, Math.min(world.w - w / 2, s.x));
  const camY = Math.max(h / 2, Math.min(world.h - h / 2, s.y));
  ctx.save();
  ctx.translate(Math.round(w / 2 - camX), Math.round(h / 2 - camY));

  const viewL = camX - w / 2 - 160, viewR = camX + w / 2 + 160;
  const viewT = camY - h / 2 - 200, viewB = camY + h / 2 + 200;

  drawTerrain(ctx, world, viewL, viewR, viewT, viewB, time);

  // ── nesneler + oyuncu, derinlik sıralı ──
  // Nesneler zaten sıralı; oyuncunun sırasını bulup ikiye bölerek çiziyoruz.
  const objs = world.objects;
  const playerFoot = s.y;
  let lo = 0, hi = objs.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (objs[mid].footY < playerFoot) lo = mid + 1; else hi = mid;
  }
  const split = lo;

  for (let i = 0; i < split; i++) drawObject(ctx, objs[i], viewL, viewR, viewT, viewB, time);
  drawPlayer(ctx, s);
  // Oyuncunun ÜSTÜNE gelen nesneler: eğer oyuncuyu örtüyorlarsa saydamlaşır.
  // Duvarın/binanın arkasına geçmek doğru, ama içinde kaybolmak değil —
  // kale kapısından geçerken karakter tamamen gömülüyordu.
  for (let i = split; i < objs.length; i++) {
    drawObject(ctx, objs[i], viewL, viewR, viewT, viewB, time, occludes(objs[i], s.x, s.y));
  }

  // ── GECE ──
  // ⚠️ SIRA KRİTİK: karartma nesnelerden SONRA, ışıklardan ÖNCE. Köyde bir
  // ışık sistemi zaten vardı (meşaleler, ocak, pencereler) ama hiçbir işe
  // yaramıyordu — ortalık gündüz gibi aydınlıktı, `lighter` ile eklenen
  // parıltı beyaz üstüne beyazdı. Karartılacak bir gece olmadan ışığın
  // anlamı yok. Parlak çim de bu katmanın altında soğuyor.
  ctx.fillStyle = NIGHT;
  ctx.fillRect(camX - w / 2 - 2, camY - h / 2 - 2, w + 4, h + 4);

  drawLights(ctx, s, time, viewL, viewR, viewT, viewB);
  drawInteractGlow(ctx, s, time);
  if (DEBUG.collision) drawCollisionDebug(ctx, s, viewL, viewR, viewT, viewB);
  ctx.restore();

  drawVignette(ctx, w, h);
  drawMinimap(ctx, s, w);
}

/** Bu nesne oyuncunun üstünü örtüyor mu (gövdesi oyuncuyu kapsıyor mu)? */
function occludes(o: WorldObject, px: number, py: number): boolean {
  return px > o.x + 4 && px < o.x + o.w - 4 && py > o.y && py < o.y + o.h;
}

function drawObject(
  ctx: CanvasRenderingContext2D, o: WorldObject,
  vl: number, vr: number, vt: number, vb: number, time: number, fade = false,
) {
  if (o.x + o.w < vl || o.x > vr || o.y + o.h < vt || o.y > vb) return;
  if (fade) ctx.globalAlpha = 0.42;
  drawFrame(ctx, o.src, o.x, o.y, {
    w: o.w, h: o.h,
    cols: o.frames, rows: o.rows, row: o.row, col: o.col,
    fps: o.fps, t: time,
  });
  if (fade) ctx.globalAlpha = 1;
}

/** Fener/meşale/ateş parıltısı — sıcak, hafif titreşimli */
function drawLights(
  ctx: CanvasRenderingContext2D, s: HubState, time: number,
  vl: number, vr: number, vt: number, vb: number,
) {
  const lights = s.world.lights;
  if (!lights.length) return;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (let i = 0; i < lights.length; i++) {
    const l = lights[i];
    if (l.x + l.r < vl || l.x - l.r > vr || l.y + l.r < vt || l.y - l.r > vb) continue;
    const flicker = 0.86 + Math.sin(time * 3.3 + i * 1.9) * 0.14;
    const r = l.r * flicker;
    // Gece katmanı geldikten sonra güçlendirildi: eskisi (0.34) aydınlık
    // sahnede zaten görünmüyordu, karanlıkta ise cılız kalıyordu.
    const g = ctx.createRadialGradient(l.x, l.y, 0, l.x, l.y, r);
    g.addColorStop(0, 'rgba(255,198,116,0.62)');
    g.addColorStop(0.4, 'rgba(226,146,54,0.26)');
    g.addColorStop(1, 'rgba(239,167,46,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(l.x, l.y, r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function drawPlayer(ctx: CanvasRenderingContext2D, s: HubState) {
  if (!drawActor(ctx, PLAYER_ART, s.moving ? 'run' : 'idle', s.animT, s.x, s.y, s.facingRight)) {
    ctx.fillStyle = C.bone;
    ctx.beginPath();
    ctx.arc(s.x, s.y, HUB_PLAYER.radius, 0, Math.PI * 2);
    ctx.fill();
  }
}

/** Kapı ve portal işaretleri — yaklaşınca parlar, uzaktan soluk durur */
function drawInteractGlow(ctx: CanvasRenderingContext2D, s: HubState, time: number) {
  const puls = 0.85 + Math.sin(time * 3) * 0.15;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';

  const spot = (x: number, y: number, r: number, tint: string, on: boolean) => {
    const rr = r * (on ? puls * 1.25 : 0.7);
    const g = ctx.createRadialGradient(x, y, 0, x, y, rr);
    g.addColorStop(0, `rgba(${tint},${on ? 0.42 : 0.14})`);
    g.addColorStop(1, `rgba(${tint},0)`);
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, rr, 0, Math.PI * 2);
    ctx.fill();
  };

  for (const d of s.world.doors) spot(d.x, d.y, DOOR_RADIUS, '239,167,46', s.atDoor?.id === d.id && s.atDoor?.x === d.x);
  for (const t of s.world.travels) spot(t.x, t.y, PORTAL_RADIUS, '95,158,74', s.atTravel?.x === t.x && s.atTravel?.y === t.y);
  if (s.world.fight) spot(s.world.fight.x, s.world.fight.y, PORTAL_RADIUS, '200,60,40', s.atFight);

  ctx.restore();
}

function drawTerrain(
  ctx: CanvasRenderingContext2D, world: MapWorld,
  vl: number, vr: number, vt: number, vb: number, time: number,
) {
  const T = MAP_TILE;
  const x0 = Math.max(0, Math.floor(vl / T));
  const x1 = Math.min(world.tileW - 1, Math.ceil(vr / T));
  const y0 = Math.max(0, Math.floor(vt / T));
  const y1 = Math.min(world.tileH - 1, Math.ceil(vb / T));

  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const v = world.tiles[y * world.tileW + x];
      if (!v) continue;
      const src = world.palette[v - 1];
      if (!src) continue;
      // strip'li karolar (akan su) dosya adından anlaşılıp animasyonlu çizilir
      if (!drawFrame(ctx, src, x * T, y * T, { w: T, h: T, fps: 2.5, t: time })) {
        ctx.fillStyle = '#1e2622';
        ctx.fillRect(x * T, y * T, T, T);
      }
    }
  }
}

// ── MİNİ HARİTA ───────────────────────────────────────────────────────
let miniBase: HTMLCanvasElement | null = null;
let miniFor: MapWorld | null = null;
const MINI_W = 172, MINI_H = 116;

function buildMiniBase(world: MapWorld) {
  const c = document.createElement('canvas');
  c.width = world.tileW; c.height = world.tileH;
  const g = c.getContext('2d');
  if (!g) return null;
  const img = g.createImageData(world.tileW, world.tileH);
  for (let i = 0; i < world.tiles.length; i++) {
    const full = world.palette[world.tiles[i] - 1] ?? '';
    // SADECE dosya adı — klasör adı değil. `/art/world/water/spr_grass_1.png`
    // mini haritada mavi görünüyordu ve oyuncu bunu fark edip bildirdi.
    const src = full.slice(full.lastIndexOf('/') + 1);
    let r = 30, gg = 38, b = 30;
    if (/water|lake|river|pond/i.test(src)) { r = 38; gg = 74; b = 104; }
    else if (/path|stone|plaza|cobble|floor/i.test(src)) { r = 104; gg = 98; b = 86; }
    else if (/mud|dirt/i.test(src)) { r = 70; gg = 58; b = 44; }
    else if (/grass/i.test(src)) { r = 44; gg = 60; b = 40; }
    img.data[i * 4] = r; img.data[i * 4 + 1] = gg; img.data[i * 4 + 2] = b; img.data[i * 4 + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  return c;
}

function drawMinimap(ctx: CanvasRenderingContext2D, s: HubState, w: number) {
  const world = s.world;
  if (miniFor !== world) { miniBase = buildMiniBase(world); miniFor = world; }
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

  const sx = MINI_W / world.w, sy = MINI_H / world.h;

  ctx.fillStyle = C.candle;
  for (const d of world.doors) ctx.fillRect(x + d.x * sx - 1.5, y + d.y * sy - 1.5, 3, 3);
  ctx.fillStyle = C.ok;
  for (const t of world.travels) ctx.fillRect(x + t.x * sx - 1.5, y + t.y * sy - 1.5, 3, 3);
  if (world.fight) {
    ctx.fillStyle = C.blood;
    ctx.beginPath();
    ctx.arc(x + world.fight.x * sx, y + world.fight.y * sy, 3.4, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.fillStyle = C.bone;
  ctx.beginPath();
  ctx.arc(x + s.x * sx, y + s.y * sy, 3.2, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = C.void; ctx.lineWidth = 1; ctx.stroke();
  ctx.restore();
}

function drawVignette(ctx: CanvasRenderingContext2D, w: number, h: number) {
  const g = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.36, w / 2, h / 2, Math.max(w, h) * 0.76);
  g.addColorStop(0, 'rgba(0,0,0,0)');
  g.addColorStop(1, 'rgba(6,5,4,0.6)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
}
