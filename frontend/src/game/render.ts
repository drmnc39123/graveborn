// Canvas çizim katmanı — simülasyona DOKUNMAZ, sadece okur.
// Kalın hatlı, gotik, düşük detay: 600 varlık çizilirken stil bütçesi düşük olmalı.
// Kural: aynı renkteki nesneler tek path'te toplanır (ctx durum değişimi pahalı).

import { C } from '@/lib/theme';
import { PLAYER, RUN } from './config';
import type { Game } from './engine';
import { drawActor, ENEMY_ART, PLAYER_ART } from './sprites';

export function render(ctx: CanvasRenderingContext2D, g: Game, w: number, h: number, dpr: number) {
  const cx = w / 2;
  const cy = h / 2;

  // zemin
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.imageSmoothingEnabled = false; // pixel-art: nearest-neighbor ZORUNLU, yoksa bulanıklaşır
  ctx.fillStyle = C.void;
  ctx.fillRect(0, 0, w, h);

  // kamera oyuncuyu ortalar
  ctx.save();
  ctx.translate(cx - g.px, cy - g.py);

  drawGround(ctx, g, w, h);
  drawArenaEdge(ctx, g);
  drawGems(ctx, g);
  drawEnemies(ctx, g);
  drawProjectiles(ctx, g);
  drawPlayer(ctx, g);

  ctx.restore();
}

// Zemin karosu tileset'ten KESİLİR: mainlevbuild.png içinde (736,416) konumunda
// 64×64'lük temiz taş zemin var (alfa taramasıyla bulundu, tahmin değil).
// Bir kez offscreen canvas'a çizip createPattern ile tekrarlıyoruz — her frame
// yüzlerce drawImage yerine tek fillRect.
let groundPattern: CanvasPattern | null = null;
let groundImg: HTMLImageElement | null = null;
const TILE = 64;

function ensureGroundPattern(ctx: CanvasRenderingContext2D): CanvasPattern | null {
  if (groundPattern) return groundPattern;
  if (!groundImg) {
    if (typeof window === 'undefined') return null;
    groundImg = new Image();
    groundImg.src = '/art/tiles/mainlevbuild.png';
    return null;
  }
  if (!groundImg.complete || groundImg.naturalWidth === 0) return null;

  const off = document.createElement('canvas');
  off.width = TILE;
  off.height = TILE;
  const octx = off.getContext('2d');
  if (!octx) return null;
  octx.imageSmoothingEnabled = false;
  octx.drawImage(groundImg, 736, 416, TILE, TILE, 0, 0, TILE, TILE);
  groundPattern = ctx.createPattern(off, 'repeat');
  return groundPattern;
}

/** Zemin — karo deseni. Yüklenene kadar ızgara çizgisine düşer. */
function drawGround(ctx: CanvasRenderingContext2D, g: Game, w: number, h: number) {
  const x0 = Math.floor((g.px - w / 2) / TILE) * TILE - TILE;
  const y0 = Math.floor((g.py - h / 2) / TILE) * TILE - TILE;
  const ww = w + TILE * 3;
  const hh = h + TILE * 3;

  const pat = ensureGroundPattern(ctx);
  if (pat) {
    ctx.save();
    ctx.fillStyle = pat;
    // Pattern world uzayına sabitlensin (kamerayla kaymasın, zeminle birlikte kaysın)
    ctx.translate(x0, y0);
    ctx.fillRect(0, 0, ww, hh);
    ctx.restore();
    // hafif karartma — karakterler zeminden ayrışsın
    ctx.fillStyle = 'rgba(10,8,6,0.28)';
    ctx.fillRect(x0, y0, ww, hh);
    return;
  }

  const S = 80;
  const gx1 = g.px + w / 2 + S;
  const gy1 = g.py + h / 2 + S;
  ctx.strokeStyle = 'rgba(227,216,192,0.045)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let x = Math.floor((g.px - w / 2) / S) * S; x < gx1; x += S) { ctx.moveTo(x, y0); ctx.lineTo(x, gy1); }
  for (let y = Math.floor((g.py - h / 2) / S) * S; y < gy1; y += S) { ctx.moveTo(x0, y); ctx.lineTo(gx1, y); }
  ctx.stroke();
}

function drawArenaEdge(ctx: CanvasRenderingContext2D, g: Game) {
  ctx.strokeStyle = 'rgba(160,18,38,0.5)';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.arc(0, 0, RUN.arenaRadius, 0, Math.PI * 2);
  ctx.stroke();
}

function drawGems(ctx: CanvasRenderingContext2D, g: Game) {
  if (!g.gems.length) return;
  ctx.fillStyle = C.candle;
  ctx.beginPath();
  for (let i = 0; i < g.gems.length; i++) {
    const m = g.gems[i];
    ctx.moveTo(m.x, m.y - 5);
    ctx.lineTo(m.x + 4, m.y);
    ctx.lineTo(m.x, m.y + 5);
    ctx.lineTo(m.x - 4, m.y);
  }
  ctx.fill();
}

function drawEnemies(ctx: CanvasRenderingContext2D, g: Game) {
  // Sprite'ı olanları sprite ile çiz; olmayanlar (veya görsel henüz yüklenmediyse)
  // renk bazlı daire path'ine düşer. Oyun asla boş ekran vermez.
  const byColor = new Map<string, typeof g.enemies>();
  const flashing: typeof g.enemies = [];
  for (let i = 0; i < g.enemies.length; i++) {
    const e = g.enemies[i];
    if (e.art) {
      const art = ENEMY_ART[e.art];
      // vuruş anında 'hit' animasyonu varsa onu oynat
      const anim = e.hitFlash > 0 && art?.anims.hit ? 'hit' : 'walk';
      if (art && drawActor(ctx, art, anim, e.animT, e.x, e.y, e.facingRight)) continue;
    }
    if (e.hitFlash > 0) { flashing.push(e); continue; }
    let arr = byColor.get(e.color);
    if (!arr) { arr = []; byColor.set(e.color, arr); }
    arr.push(e);
  }

  ctx.lineWidth = 2.5;
  ctx.strokeStyle = C.void;
  for (const [color, arr] of byColor) {
    ctx.fillStyle = color;
    ctx.beginPath();
    for (let i = 0; i < arr.length; i++) {
      const e = arr[i];
      ctx.moveTo(e.x + e.radius, e.y);
      ctx.arc(e.x, e.y, e.radius, 0, Math.PI * 2);
    }
    ctx.fill();
    ctx.stroke();
  }

  // vuruş parlaması — kemik beyazı
  if (flashing.length) {
    ctx.fillStyle = C.bone;
    ctx.beginPath();
    for (let i = 0; i < flashing.length; i++) {
      const e = flashing[i];
      ctx.moveTo(e.x + e.radius, e.y);
      ctx.arc(e.x, e.y, e.radius, 0, Math.PI * 2);
    }
    ctx.fill();
  }
}

function drawProjectiles(ctx: CanvasRenderingContext2D, g: Game) {
  if (!g.projectiles.length) return;
  ctx.fillStyle = C.bone;
  ctx.beginPath();
  for (let i = 0; i < g.projectiles.length; i++) {
    const p = g.projectiles[i];
    ctx.moveTo(p.x + p.radius, p.y);
    ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
  }
  ctx.fill();
}

function drawPlayer(ctx: CanvasRenderingContext2D, g: Game) {
  // dokunulmazlık penceresinde yanıp söner
  const blink = g.iframe > 0 && Math.floor(g.iframe * 14) % 2 === 0;

  // toplama yarıçapı
  ctx.strokeStyle = 'rgba(239,167,46,0.16)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(g.px, g.py, PLAYER.pickupRadius * g.stats.magnetMul, 0, Math.PI * 2);
  ctx.stroke();

  // sprite varsa onu çiz; dokunulmazlık penceresinde yarı saydam yanıp söner
  if (!blink) {
    if (drawActor(ctx, PLAYER_ART, g.moving ? 'run' : 'idle', g.animT, g.px, g.py, g.facingRight)) return;
  } else {
    ctx.save();
    ctx.globalAlpha = 0.45;
    const drawn = drawActor(ctx, PLAYER_ART, g.moving ? 'run' : 'idle', g.animT, g.px, g.py, g.facingRight);
    ctx.restore();
    if (drawn) return;
  }

  // görsel yüklenmediyse daireye düş
  ctx.fillStyle = blink ? C.blood : C.bone;
  ctx.strokeStyle = C.void;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(g.px, g.py, PLAYER.radius, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
}
