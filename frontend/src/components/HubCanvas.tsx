'use client';
// Hub sahnesi — editörde çizilen köy. Çizim hubRender.ts'te, mantık hub.ts'te;
// bu bileşen köprü: harita yükleme, girdi, döngü ve React tarafı istemler.

import { useCallback, useEffect, useRef, useState } from 'react';
import { createHub, stepHub, warp, type HubState } from '@/game/hub';
import { renderHub, DEBUG } from '@/game/hubRender';
import { loadMapWorld } from '@/game/mapWorld';
import { preloadAll } from '@/game/sprites';
import { unlockAudio, play } from '@/game/sfx';
import { C, glass } from '@/lib/theme';

type Hint = { kind: 'door' | 'fight' | 'travel'; title: string; sub: string };

// Cüzdan ve bina rıhtımı artık play/page.tsx'te (BuildingDock) — bu bileşen
// sadece sahneyi ve sahneye ait istemleri yönetir.
export function HubCanvas({
  onEnterBuilding, onEnterStage,
}: {
  onEnterBuilding: (id: string) => void;
  onEnterStage: (stageId: number) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const keysRef = useRef(new Set<string>());
  const stickRef = useRef({ active: false, dx: 0, dy: 0 });
  const cbRef = useRef({ onEnterBuilding, onEnterStage });
  cbRef.current = { onEnterBuilding, onEnterStage };

  const [hint, setHint] = useState<Hint | null>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [debug, setDebug] = useState(false);
  const [warpMsg, setWarpMsg] = useState<string | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) return;

    let raf = 0;
    let disposed = false;
    const cleanups: (() => void)[] = [];

    (async () => {
      const world = await loadMapWorld();
      if (disposed) return;
      if (!world) { setStatus('error'); return; }
      setStatus('ready');
      preloadAll();

      const hub: HubState = createHub(world);
      let dpr = 1, cssW = 0, cssH = 0;
      const resize = () => {
        dpr = Math.min(window.devicePixelRatio || 1, 2);
        cssW = canvas.clientWidth; cssH = canvas.clientHeight;
        canvas.width = Math.round(cssW * dpr);
        canvas.height = Math.round(cssH * dpr);
      };
      resize();
      window.addEventListener('resize', resize);
      cleanups.push(() => window.removeEventListener('resize', resize));

      // Öğe ölçüsü 0 gelirse (sekme gizliyken, panel kapalıyken) canvas 0×0
      // kalıp bir daha düzelmiyordu — window resize olayı gelmiyor.
      // ResizeObserver öğe ölçülendiği anda yakalar.
      const ro = new ResizeObserver(() => resize());
      ro.observe(canvas);
      cleanups.push(() => ro.disconnect());

      const unlock = () => unlockAudio();
      window.addEventListener('keydown', unlock, { once: true });
      window.addEventListener('pointerdown', unlock, { once: true });

      const interact = () => {
        const { onEnterBuilding: ob, onEnterStage: os } = cbRef.current;
        if (hub.atFight) { play('chest'); os(0); return; }          // bölüm seçim paneli
        if (hub.atTravel) { play('chest'); warp(hub, hub.atTravel.toX, hub.atTravel.toY); return; }
        if (hub.atDoor) { play('chest'); ob(hub.atDoor.id); }
      };

      const onKeyDown = (e: KeyboardEvent) => {
        const k = e.key.toLowerCase();
        keysRef.current.add(k);
        if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' '].includes(k)) e.preventDefault();
        if (k === 'e' || k === 'enter') interact();
        // F1: çarpışma kutularını göster/gizle — "görünmez engel" avı için
        if (e.key === 'F1') { e.preventDefault(); DEBUG.collision = !DEBUG.collision; setDebug(DEBUG.collision); }
      };
      const onKeyUp = (e: KeyboardEvent) => keysRef.current.delete(e.key.toLowerCase());
      window.addEventListener('keydown', onKeyDown);
      window.addEventListener('keyup', onKeyUp);
      cleanups.push(() => {
        window.removeEventListener('keydown', onKeyDown);
        window.removeEventListener('keyup', onKeyUp);
      });

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
      cleanups.push(() => {
        canvas.removeEventListener('touchstart', onTouchStart);
        canvas.removeEventListener('touchmove', onTouchMove);
        canvas.removeEventListener('touchend', onTouchEnd);
      });

      let last = performance.now(), t = 0, hintAcc = 0;
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

        renderHub(ctx, hub, cssW, cssH, dpr, t);

        // React state ~10Hz — her frame güncellemek re-render fırtınası olur
        hintAcc += dt;
        if (hintAcc > 0.1) {
          hintAcc = 0;
          if (hub.justWarped) { setWarpMsg(hub.justWarped); hub.justWarped = null; setTimeout(() => setWarpMsg(null), 1800); }
          if (hub.atFight) setHint({ kind: 'fight', title: hub.world.fight?.label ?? 'Fight Portal', sub: 'Choose a stage and descend' });
          else if (hub.atTravel) setHint({ kind: 'travel', title: hub.atTravel.label, sub: 'Step through to travel' });
          else if (hub.atDoor) setHint({ kind: 'door', title: hub.atDoor.label, sub: 'Enter' });
          else setHint(null);
        }
      };
      raf = requestAnimationFrame(loop);
    })();

    return () => {
      disposed = true;
      cancelAnimationFrame(raf);
      for (const c of cleanups) c();
    };
  }, []);

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%', overflow: 'hidden', background: C.void }}>
      <canvas ref={canvasRef} style={{ width: '100%', height: '100%', display: 'block', touchAction: 'none' }} />

      {status !== 'ready' && (
        <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', color: C.boneDim, fontSize: 14 }}>
          {status === 'loading' ? 'Loading the village…' : (
            <div style={{ textAlign: 'center' }}>
              <div style={{ color: C.blood, fontWeight: 800, marginBottom: 6 }}>Harita yüklenemedi</div>
              <div style={{ fontSize: 12 }}>public/map/village.json bulunamadı</div>
            </div>
          )}
        </div>
      )}

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

      {warpMsg && (
        <div style={{ position: 'absolute', top: '32%', left: 0, right: 0, textAlign: 'center', pointerEvents: 'none' }}>
          <div style={{ fontSize: 11, fontWeight: 900, letterSpacing: 2.5, color: C.ok }}>TRAVELLED</div>
          <div style={{ fontSize: 26, fontWeight: 900, color: C.bone, textShadow: `0 0 20px ${C.ok}` }}>{warpMsg}</div>
        </div>
      )}

      <div style={{ position: 'absolute', bottom: 10, right: 12, fontSize: 11, color: debug ? C.blood : C.boneFaint }}>
        WASD / arrows · E to interact · <b>F1</b> {debug ? 'collision ON' : 'collision'}
      </div>
    </div>
  );
}
