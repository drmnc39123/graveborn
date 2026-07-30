// Hub çizimi — gerçek sanatla. Katman sırası ve derinlik burada çözülüyor.
//
// DERİNLİK KURALI: bina/prop/oyuncu tek listede toplanıp AYAK Y'sine göre
// sıralanıyor. Böylece oyuncu binanın önündeyse önde, arkasındaysa arkada
// çiziliyor. Sabit katman sırası kullansaydık oyuncu her zaman binanın
// üstünde yüzerdi — köy hissi anında çökerdi.

import { C } from '@/lib/theme';
import { drawActor, drawFrame, PLAYER_ART } from './sprites';
import { HUB_H, HUB_PLAYER, HUB_W, type HubState } from './hub';
import {
  BUILDINGS, LIGHTS, MAP_H, MAP_W, PORTALS, PORTAL_SIZE, PROPS, TILE, tileAt,
} from './hubMap';

interface Drawable { y: number; draw: () => void }

export function renderHub(
  ctx: CanvasRenderingContext2D,
  s: HubState,
  w: number,
  h: number,
  dpr: number,
  time: number,
  unlockedStage: number,
) {
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.imageSmoothingEnabled = false; // pixel-art: nearest-neighbor ZORUNLU
  ctx.fillStyle = C.void;
  ctx.fillRect(0, 0, w, h);

  // kamera oyuncuyu ortalar, harita kenarında durur
  const camX = Math.max(w / 2, Math.min(HUB_W - w / 2, s.x));
  const camY = Math.max(h / 2, Math.min(HUB_H - h / 2, s.y));
  ctx.save();
  ctx.translate(Math.round(w / 2 - camX), Math.round(h / 2 - camY));

  drawGround(ctx, camX, camY, w, h);

  // ── derinlik sıralı katman ──
  const items: Drawable[] = [];

  for (const b of BUILDINGS) {
    const footBottom = b.y + b.foot.dy + b.foot.h;
    items.push({
      y: footBottom,
      draw: () => {
        if (!drawFrame(ctx, b.src, b.x, b.y, { w: b.w, h: b.h })) {
          // görsel yüklenmediyse blok çiz — asla boş alan bırakma
          ctx.fillStyle = '#2b2f2c';
          ctx.fillRect(b.x, b.y, b.w, b.h);
        }
      },
    });
  }

  for (const p of PROPS) {
    const pw = p.w ?? 64, ph = p.h ?? 64;
    items.push({
      y: p.y + ph,
      draw: () => { drawFrame(ctx, p.src, p.x, p.y, { w: pw, h: ph, fps: p.fps, t: time }); },
    });
  }

  // portallar
  for (const pt of PORTALS) {
    const locked = pt.stageId > unlockedStage;
    items.push({
      y: pt.y + PORTAL_SIZE,
      draw: () => {
        ctx.save();
        if (locked) ctx.globalAlpha = 0.28;
        drawFrame(ctx, pt.src, pt.x, pt.y, { w: PORTAL_SIZE, h: PORTAL_SIZE, fps: 10, t: time });
        ctx.restore();

        // bölüm numarası — hangi portal hangi Depth okunmalı
        ctx.font = '800 13px ui-sans-serif, system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillStyle = locked ? C.boneFaint : C.candle;
        ctx.fillText(locked ? '🔒' : `${pt.stageId}`, pt.x + PORTAL_SIZE / 2, pt.y + PORTAL_SIZE + 14);
        ctx.textAlign = 'left';
      },
    });
  }

  // oyuncu
  items.push({
    y: s.y,
    draw: () => {
      if (!drawActor(ctx, PLAYER_ART, s.moving ? 'run' : 'idle', s.animT, s.x, s.y, s.facingRight)) {
        ctx.fillStyle = C.bone;
        ctx.beginPath();
        ctx.arc(s.x, s.y, HUB_PLAYER.radius, 0, Math.PI * 2);
        ctx.fill();
      }
    },
  });

  items.sort((a, b) => a.y - b.y);
  for (const it of items) it.draw();

  drawLights(ctx, time);
  drawDoorMarkers(ctx, s);

  ctx.restore();

  drawVignette(ctx, w, h);
}

/** Zemin karoları — sadece ekranda görünen aralık çizilir (1800 karo değil ~600) */
function drawGround(ctx: CanvasRenderingContext2D, camX: number, camY: number, w: number, h: number) {
  const x0 = Math.max(0, Math.floor((camX - w / 2) / TILE) - 1);
  const x1 = Math.min(MAP_W - 1, Math.ceil((camX + w / 2) / TILE) + 1);
  const y0 = Math.max(0, Math.floor((camY - h / 2) / TILE) - 1);
  const y1 = Math.min(MAP_H - 1, Math.ceil((camY + h / 2) / TILE) + 1);

  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      if (!drawFrame(ctx, tileAt(x, y), x * TILE, y * TILE, { w: TILE, h: TILE })) {
        ctx.fillStyle = '#1c211f';
        ctx.fillRect(x * TILE, y * TILE, TILE, TILE);
      }
    }
  }
}

/** Fener parlamaları — additive, nabız gibi hafif titrer (mum hissi) */
function drawLights(ctx: CanvasRenderingContext2D, time: number) {
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (let i = 0; i < LIGHTS.length; i++) {
    const l = LIGHTS[i];
    const flicker = 0.88 + Math.sin(time * 3.1 + i * 1.7) * 0.12;
    const r = l.r * flicker;
    const g = ctx.createRadialGradient(l.x, l.y, 0, l.x, l.y, r);
    g.addColorStop(0, 'rgba(239,167,46,0.30)');
    g.addColorStop(0.45, 'rgba(200,120,40,0.12)');
    g.addColorStop(1, 'rgba(239,167,46,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(l.x, l.y, r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

/** Kapı işaretleri — yaklaşınca parlar, uzakta soluk durur */
function drawDoorMarkers(ctx: CanvasRenderingContext2D, s: HubState) {
  for (const b of BUILDINGS) {
    const near = s.atDoor?.id === b.id;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const r = near ? 54 : 30;
    const g = ctx.createRadialGradient(b.doorX, b.doorY, 0, b.doorX, b.doorY, r);
    g.addColorStop(0, `rgba(239,167,46,${near ? 0.5 : 0.16})`);
    g.addColorStop(1, 'rgba(239,167,46,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(b.doorX, b.doorY, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}

/** Kenar karartma — gotik kapalılık hissi, dikkati merkeze toplar */
function drawVignette(ctx: CanvasRenderingContext2D, w: number, h: number) {
  const g = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.35, w / 2, h / 2, Math.max(w, h) * 0.75);
  g.addColorStop(0, 'rgba(0,0,0,0)');
  g.addColorStop(1, 'rgba(6,5,4,0.62)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
}
