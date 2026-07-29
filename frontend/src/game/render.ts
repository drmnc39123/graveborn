// Canvas çizim katmanı — simülasyona DOKUNMAZ, sadece okur.
// Kalın hatlı, gotik, düşük detay: 600 varlık çizilirken stil bütçesi düşük olmalı.
// Kural: aynı renkteki nesneler tek path'te toplanır (ctx durum değişimi pahalı).

import { C } from '@/lib/theme';
import { PLAYER, RUN } from './config';
import type { Game } from './engine';

export function render(ctx: CanvasRenderingContext2D, g: Game, w: number, h: number, dpr: number) {
  const cx = w / 2;
  const cy = h / 2;

  // zemin
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
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

/** Kaydırılan ızgara — hareket hissini verir (boş zeminde hız algılanmıyor) */
function drawGround(ctx: CanvasRenderingContext2D, g: Game, w: number, h: number) {
  const S = 80;
  const x0 = Math.floor((g.px - w / 2) / S) * S;
  const y0 = Math.floor((g.py - h / 2) / S) * S;
  const x1 = g.px + w / 2 + S;
  const y1 = g.py + h / 2 + S;

  ctx.strokeStyle = 'rgba(227,216,192,0.045)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let x = x0; x < x1; x += S) { ctx.moveTo(x, y0); ctx.lineTo(x, y1); }
  for (let y = y0; y < y1; y += S) { ctx.moveTo(x0, y); ctx.lineTo(x1, y); }
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
  // renk bazlı gruplama: her tip tek path
  const byColor = new Map<string, typeof g.enemies>();
  const flashing: typeof g.enemies = [];
  for (let i = 0; i < g.enemies.length; i++) {
    const e = g.enemies[i];
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

  ctx.fillStyle = blink ? C.blood : C.bone;
  ctx.strokeStyle = C.void;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(g.px, g.py, PLAYER.radius, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
}
