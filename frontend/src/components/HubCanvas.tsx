'use client';
// Hub sahnesi — gezilebilir harabe köy. Çizim hubRender.ts'te, mantık hub.ts'te;
// bu bileşen sadece köprü: girdi, döngü ve React tarafı istemler.

import { useCallback, useEffect, useRef, useState } from 'react';
import { createHub, stepHub, warp, type BuildingId, type HubState } from '@/game/hub';
import { renderHub } from '@/game/hubRender';
import { preloadAll } from '@/game/sprites';
import { unlockAudio, play } from '@/game/sfx';
import { C, glass } from '@/lib/theme';
import { loadProgress, remainingGold, type Progress } from '@/game/progress';
import { stageById } from '@/game/config';

export function HubCanvas({
  onEnterBuilding, onEnterStage, progress,
}: {
  onEnterBuilding: (id: BuildingId) => void;
  onEnterStage: (stageId: number) => void;
  progress: Progress | null;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const keysRef = useRef(new Set<string>());
  const stickRef = useRef({ active: false, dx: 0, dy: 0 });
  const cbRef = useRef({ onEnterBuilding, onEnterStage, unlocked: progress?.unlockedStage ?? 1 });
  cbRef.current = { onEnterBuilding, onEnterStage, unlocked: progress?.unlockedStage ?? 1 };

  const [hint, setHint] = useState<{ title: string; sub: string; kind: 'door' | 'fight' | 'travel' } | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) return;
    preloadAll();

    const hub: HubState = createHub();
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

    const interact = () => {
      const { onEnterBuilding: ob, onEnterStage: os } = cbRef.current;
      const p = hub.atPortal;
      if (p) {
        play('chest');
        // TEK dövüş portalı — bölüm seçimi panelden yapılır.
        // Diğer portallar sadece keşif: uzak bölgelere ışınlar, savaş yok.
        if (p.kind === 'fight') os(0);
        else if (p.toX !== undefined && p.toY !== undefined) warp(hub, p.toX, p.toY);
      } else if (hub.atDoor) {
        play('chest');
        ob(hub.atDoor.id);
      }
    };

    const onKeyDown = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      keysRef.current.add(k);
      if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' '].includes(k)) e.preventDefault();
      if (k === 'e' || k === 'enter') interact();
    };
    const onKeyUp = (e: KeyboardEvent) => keysRef.current.delete(e.key.toLowerCase());
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);

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

    let raf = 0, last = performance.now(), t = 0, hintAcc = 0;
    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      const dt = Math.min((now - last) / 1000, 0.05);
      last = now;
      t += dt;

      const k = keysRef.current;
      let ix = 0, iy = 0;
      if (k.has('a') || k.has('arrowleft')) ix -= 1;
      if (k.has('d') || k.has('arrowright')) ix += 1;
      if (k.has('w') || k.has('arrowup')) iy -= 1;
      if (k.has('s') || k.has('arrowdown')) iy += 1;
      if (stickRef.current.active) { ix = stickRef.current.dx; iy = stickRef.current.dy; }
      stepHub(hub, dt, ix, iy);

      renderHub(ctx, hub, cssW, cssH, dpr, t, cbRef.current.unlocked);

      // React state ~10Hz — her frame güncellemek re-render fırtınası olur
      hintAcc += dt;
      if (hintAcc > 0.1) {
        hintAcc = 0;
        const p = hub.atPortal;
        if (p) {
          setHint(p.kind === 'fight'
            ? { kind: 'fight', title: p.label, sub: 'Choose a stage and descend' }
            : { kind: 'travel', title: p.label, sub: 'Step through to travel' });
        } else if (hub.atDoor) {
          setHint({ kind: 'door', title: hub.atDoor.name, sub: hub.atDoor.hint });
        } else setHint(null);
      }
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

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%', overflow: 'hidden', background: C.void }}>
      <canvas ref={canvasRef} style={{ width: '100%', height: '100%', display: 'block', touchAction: 'none' }} />

      {/* Cüzdan */}
      <div style={{ position: 'absolute', top: 12, left: 12, display: 'flex', gap: 8 }}>
        <Pill color={C.candle}>{Math.floor(progress?.gold ?? 0)} GOLD</Pill>
        <Pill color={C.boneFaint}>0 $GRAVE</Pill>
      </div>

      {/* Etkileşim istemi */}
      {hint && (
        <div style={{ position: 'absolute', bottom: 26, left: '50%', transform: 'translateX(-50%)', width: 'min(92vw, 330px)' }}>
          <div style={{ ...glass(13), padding: '13px 18px', textAlign: 'center' }}>
            <div style={{ fontSize: 10, fontWeight: 900, letterSpacing: 2, marginBottom: 3,
              color: hint.kind === 'fight' ? C.blood : hint.kind === 'travel' ? C.ok : C.ice }}>
              {hint.kind === 'fight' ? 'FIGHT PORTAL' : hint.kind === 'travel' ? 'TRAVEL PORTAL' : 'BUILDING'}
            </div>
            <div style={{ fontSize: 16, fontWeight: 900, color: C.bone }}>{hint.title}</div>
            <div style={{ fontSize: 12, color: C.boneDim, marginTop: 2 }}>{hint.sub}</div>
            <div style={{ marginTop: 10, fontSize: 12, fontWeight: 800, color: C.candle }}>
              Press <span style={{ padding: '2px 7px', borderRadius: 5, background: 'rgba(239,167,46,0.16)', border: `1px solid ${C.candle}55` }}>E</span>
            </div>
          </div>
        </div>
      )}

      <div style={{ position: 'absolute', bottom: 10, right: 12, fontSize: 11, color: C.boneFaint }}>
        WASD / arrows · E to interact
      </div>
    </div>
  );
}

function Pill({ children, color }: { children: React.ReactNode; color: string }) {
  return (
    <span style={{ ...glass(9), padding: '6px 12px', fontSize: 13, fontWeight: 800, color }}>{children}</span>
  );
}
