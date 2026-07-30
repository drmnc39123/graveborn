'use client';
// Hub sahnesi — gezilebilir harabe köy + bina panelleri.
// Tileset gelene kadar binalar renkli bloklarla çiziliyor; yerleşim ve
// etkileşim mantığı hazır, sanat geldiğinde sadece çizim fonksiyonu değişecek.

import { useCallback, useEffect, useRef, useState } from 'react';
import { BUILDINGS, DOOR_RADIUS, HUB_BOUNDS, HUB_PLAYER, createHub, stepHub, type Building, type BuildingId } from '@/game/hub';
import { drawActor, PLAYER_ART, preloadAll } from '@/game/sprites';
import { unlockAudio, play } from '@/game/sfx';
import { C, glass } from '@/lib/theme';
import { loadProgress, type Progress } from '@/game/progress';

export function HubCanvas({ onEnter }: { onEnter: (id: BuildingId) => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const keysRef = useRef(new Set<string>());
  const stickRef = useRef({ active: false, dx: 0, dy: 0 });
  const enterRef = useRef(onEnter);
  enterRef.current = onEnter;

  const [prompt, setPrompt] = useState<Building | null>(null);
  const [progress, setProgress] = useState<Progress | null>(null);

  useEffect(() => { setProgress(loadProgress()); }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) return;
    preloadAll();

    const hub = createHub();
    let dpr = 1, cssW = 0, cssH = 0;
    const resize = () => {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      cssW = canvas.clientWidth; cssH = canvas.clientHeight;
      canvas.width = Math.round(cssW * dpr);
      canvas.height = Math.round(cssH * dpr);
    };
    resize();
    window.addEventListener('resize', resize);

    const unlock = () => unlockAudio();
    window.addEventListener('keydown', unlock, { once: true });
    window.addEventListener('pointerdown', unlock, { once: true });

    const onKeyDown = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      keysRef.current.add(k);
      if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(k)) e.preventDefault();
      if ((k === 'e' || k === 'enter') && hub.atDoor) {
        play('chest');
        enterRef.current(hub.atDoor.id);
      }
    };
    const onKeyUp = (e: KeyboardEvent) => keysRef.current.delete(e.key.toLowerCase());
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);

    // mobil: sanal joystick (bölüm sahnesiyle aynı desen)
    let origin = { x: 0, y: 0 };
    const onTouchStart = (e: TouchEvent) => {
      const t = e.touches[0];
      origin = { x: t.clientX, y: t.clientY };
      stickRef.current = { active: true, dx: 0, dy: 0 };
    };
    const onTouchMove = (e: TouchEvent) => {
      if (!stickRef.current.active) return;
      const t = e.touches[0];
      const dx = t.clientX - origin.x, dy = t.clientY - origin.y;
      const mag = Math.hypot(dx, dy) || 1;
      const k = Math.min(1, mag / 46) / mag;
      stickRef.current = { active: true, dx: dx * k, dy: dy * k };
      e.preventDefault();
    };
    const onTouchEnd = () => { stickRef.current = { active: false, dx: 0, dy: 0 }; };
    canvas.addEventListener('touchstart', onTouchStart, { passive: false });
    canvas.addEventListener('touchmove', onTouchMove, { passive: false });
    canvas.addEventListener('touchend', onTouchEnd);

    let raf = 0, last = performance.now(), promptAcc = 0;
    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      const dt = Math.min((now - last) / 1000, 0.05);
      last = now;

      const k = keysRef.current;
      let ix = 0, iy = 0;
      if (k.has('a') || k.has('arrowleft')) ix -= 1;
      if (k.has('d') || k.has('arrowright')) ix += 1;
      if (k.has('w') || k.has('arrowup')) iy -= 1;
      if (k.has('s') || k.has('arrowdown')) iy += 1;
      if (stickRef.current.active) { ix = stickRef.current.dx; iy = stickRef.current.dy; }
      stepHub(hub, dt, ix, iy);

      drawHub(ctx, hub, cssW, cssH, dpr);

      // React state'i ~10Hz örnekle — her frame güncellemek re-render fırtınası
      promptAcc += dt;
      if (promptAcc > 0.1) { promptAcc = 0; setPrompt(hub.atDoor); }
    };
    raf = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('keydown', unlock);
      window.removeEventListener('pointerdown', unlock);
      canvas.removeEventListener('touchstart', onTouchStart);
      canvas.removeEventListener('touchmove', onTouchMove);
      canvas.removeEventListener('touchend', onTouchEnd);
    };
  }, []);

  const enter = useCallback(() => { if (prompt) { play('chest'); onEnter(prompt.id); } }, [prompt, onEnter]);

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%', overflow: 'hidden', background: C.void }}>
      <canvas ref={canvasRef} style={{ width: '100%', height: '100%', display: 'block', touchAction: 'none' }} />

      {/* Cüzdan — Kintara deseni: para birimleri her zaman görünür */}
      <div style={{ position: 'absolute', top: 12, left: 12, display: 'flex', gap: 8 }}>
        <span style={{ ...glass(9), padding: '6px 12px', fontSize: 13, fontWeight: 800, color: C.candle }}>
          {Math.floor(progress?.gold ?? 0)} GOLD
        </span>
        <span style={{ ...glass(9), padding: '6px 12px', fontSize: 13, fontWeight: 800, color: C.boneFaint }}>
          0 $GRAVE
        </span>
      </div>

      {/* Kapı istemi */}
      {prompt && (
        <div style={{ position: 'absolute', bottom: 28, left: '50%', transform: 'translateX(-50%)', textAlign: 'center' }}>
          <div style={{ ...glass(12), padding: '12px 20px', minWidth: 240 }}>
            <div style={{ fontSize: 15, fontWeight: 900, color: C.bone }}>{prompt.name}</div>
            <div style={{ fontSize: 12, color: C.boneDim, marginTop: 2 }}>{prompt.hint}</div>
            <button onClick={enter}
              style={{ marginTop: 10, padding: '8px 22px', borderRadius: 10, border: 'none', cursor: 'pointer',
                fontWeight: 900, fontSize: 13, color: '#1a0508',
                background: `linear-gradient(180deg, ${C.candleSoft}, ${C.candle})` }}>
              ENTER <span style={{ opacity: 0.6 }}>(E)</span>
            </button>
          </div>
        </div>
      )}

      <div style={{ position: 'absolute', bottom: 10, right: 12, fontSize: 11, color: C.boneFaint }}>
        WASD / arrows to walk
      </div>
    </div>
  );
}

// ── çizim ──
function drawHub(ctx: CanvasRenderingContext2D, hub: ReturnType<typeof createHub>, w: number, h: number, dpr: number) {
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = C.void;
  ctx.fillRect(0, 0, w, h);

  // kamera oyuncuyu ortalar ama harita sınırında durur
  const camX = Math.max(w / 2, Math.min(HUB_BOUNDS.w - w / 2, hub.x));
  const camY = Math.max(h / 2, Math.min(HUB_BOUNDS.h - h / 2, hub.y));
  ctx.save();
  ctx.translate(w / 2 - camX, h / 2 - camY);

  // zemin
  ctx.fillStyle = '#1c211f'; // solmuş teal-gri — tileset'in zemin tonuna yakın
  ctx.fillRect(0, 0, HUB_BOUNDS.w, HUB_BOUNDS.h);
  ctx.strokeStyle = 'rgba(227,216,192,0.04)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let x = 0; x <= HUB_BOUNDS.w; x += 64) { ctx.moveTo(x, 0); ctx.lineTo(x, HUB_BOUNDS.h); }
  for (let y = 0; y <= HUB_BOUNDS.h; y += 64) { ctx.moveTo(0, y); ctx.lineTo(HUB_BOUNDS.w, y); }
  ctx.stroke();

  // binalar (YER TUTUCU — tileset gelince sprite'a dönecek)
  for (const b of BUILDINGS) {
    const x = b.x - b.w / 2, y = b.y - b.h / 2;
    ctx.fillStyle = 'rgba(10,8,6,0.55)';
    ctx.fillRect(x + 6, y + 10, b.w, b.h); // gölge
    ctx.fillStyle = '#2b2f2c';
    ctx.fillRect(x, y, b.w, b.h);
    ctx.strokeStyle = b.color;
    ctx.lineWidth = 3;
    ctx.strokeRect(x, y, b.w, b.h);

    // tabela
    ctx.fillStyle = C.bone;
    ctx.font = '800 13px ui-sans-serif, system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(b.name, b.x, b.y);
    ctx.textAlign = 'left';

    // kapı
    ctx.fillStyle = b.color;
    ctx.fillRect(b.doorX - 16, b.doorY - 22, 32, 26);
    // kapı ışığı (yaklaşınca parlar)
    const near = Math.hypot(hub.x - b.doorX, hub.y - b.doorY) < DOOR_RADIUS;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const g = ctx.createRadialGradient(b.doorX, b.doorY, 0, b.doorX, b.doorY, near ? 60 : 34);
    g.addColorStop(0, `rgba(239,167,46,${near ? 0.45 : 0.18})`);
    g.addColorStop(1, 'rgba(239,167,46,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(b.doorX, b.doorY, near ? 60 : 34, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  // oyuncu
  if (!drawActor(ctx, PLAYER_ART, hub.moving ? 'run' : 'idle', hub.animT, hub.x, hub.y, hub.facingRight)) {
    ctx.fillStyle = C.bone;
    ctx.beginPath();
    ctx.arc(hub.x, hub.y, HUB_PLAYER.radius, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.restore();
}
