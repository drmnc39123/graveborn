'use client';
// Motor ile React arasındaki köprü. Simülasyon ref'lerde yaşar — React state'i
// her frame güncellemek 60Hz'de re-render fırtınası yaratır, o yüzden HUD ~10Hz'de
// ayrıca örneklenir. Oyun döngüsü React render döngüsünden BAĞIMSIZ.

import { useCallback, useEffect, useRef, useState } from 'react';
import { Game } from '@/game/engine';
import { render, resetEffects } from '@/game/render';
import { MAX_CATCHUP, RUN, TICK } from '@/game/config';
import { seedFromString } from '@/game/rng';
import { preloadAll } from '@/game/sprites';
import { isSoundEnabled, play, setSoundEnabled, unlockAudio } from '@/game/sfx';
import { C, glass, ctaButton } from '@/lib/theme';

interface Hud {
  time: number; hp: number; maxHp: number; level: number;
  xp: number; xpNext: number; kills: number; gold: number;
  enemies: number; phase: string; fps: number;
  offers: { id: string; name: string; desc: string; kind: string }[];
  weapons: { name: string; level: number }[];
  passives: { name: string; level: number }[];
  revives: number;
  evolution: { name: string; at: number } | null;
}

const fmtTime = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

export function GameCanvas({ seedText }: { seedText: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gameRef = useRef<Game | null>(null);
  const keysRef = useRef(new Set<string>());
  const stickRef = useRef({ active: false, dx: 0, dy: 0 });
  const [hud, setHud] = useState<Hud | null>(null);
  const [runId, setRunId] = useState(0); // artırınca yeni run başlar
  const [muted, setMuted] = useState(false);

  const choose = useCallback((id: string) => {
    gameRef.current?.choose(id);
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) return;

    preloadAll(); // sprite'ları erken istemeye başla (yüklenene kadar daireye düşer)
    const game = new Game(seedFromString(seedText));
    gameRef.current = game;
    resetEffects(); // önceki run'ın patlamaları yeni run'a taşmasın

    let dpr = 1;
    let cssW = 0;
    let cssH = 0;
    const resize = () => {
      dpr = Math.min(window.devicePixelRatio || 1, 2); // 2'nin üstü mobilde bedava fps kaybı
      cssW = canvas.clientWidth;
      cssH = canvas.clientHeight;
      canvas.width = Math.round(cssW * dpr);
      canvas.height = Math.round(cssH * dpr);
      game.setViewport(cssW, cssH);
    };
    resize();
    window.addEventListener('resize', resize);

    // ── girdi ──
    // Tarayıcı otomatik oynatmayı engeller — ilk kullanıcı hareketinde aç.
    // Bu olmadan ses hiç çalmaz ve sebebi de görünmez (sessiz başarısızlık).
    const onFirstGesture = () => unlockAudio();
    window.addEventListener('keydown', onFirstGesture, { once: true });
    window.addEventListener('pointerdown', onFirstGesture, { once: true });
    window.addEventListener('touchstart', onFirstGesture, { once: true });

    const onKeyDown = (e: KeyboardEvent) => {
      keysRef.current.add(e.key.toLowerCase());
      if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' '].includes(e.key.toLowerCase())) e.preventDefault();
      // level-up'ta 1/2/3 ile seçim
      if (game.phase === 'levelup' && ['1', '2', '3'].includes(e.key)) {
        const idx = Number(e.key) - 1;
        const o = game.offers[idx];
        if (o) game.choose(o.id);
      }
    };
    const onKeyUp = (e: KeyboardEvent) => keysRef.current.delete(e.key.toLowerCase());
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);

    // dokunmatik: ekrana basılan yer merkez, sürükleme yön verir (sanal joystick)
    let touchOrigin = { x: 0, y: 0 };
    const onTouchStart = (e: TouchEvent) => {
      const t = e.touches[0];
      touchOrigin = { x: t.clientX, y: t.clientY };
      stickRef.current = { active: true, dx: 0, dy: 0 };
    };
    const onTouchMove = (e: TouchEvent) => {
      if (!stickRef.current.active) return;
      const t = e.touches[0];
      const dx = t.clientX - touchOrigin.x;
      const dy = t.clientY - touchOrigin.y;
      const max = 46; // bu mesafede tam hız
      const m = Math.hypot(dx, dy) || 1;
      const k = Math.min(1, m / max) / m;
      stickRef.current = { active: true, dx: dx * k, dy: dy * k };
      e.preventDefault();
    };
    const onTouchEnd = () => { stickRef.current = { active: false, dx: 0, dy: 0 }; };
    canvas.addEventListener('touchstart', onTouchStart, { passive: false });
    canvas.addEventListener('touchmove', onTouchMove, { passive: false });
    canvas.addEventListener('touchend', onTouchEnd);
    canvas.addEventListener('touchcancel', onTouchEnd);

    // ── döngü: sabit timestep + akümülatör ──
    let raf = 0;
    let last = performance.now();
    let acc = 0;
    let hudAcc = 0;
    let frames = 0;
    let fpsTimer = 0;
    let fps = 0;

    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      const rawDt = (now - last) / 1000;
      last = now;
      // sekme arka plandan dönünce 10sn'lik açığı kapatmaya çalışmasın
      const dt = Math.min(rawDt, TICK * MAX_CATCHUP);

      // girdi topla
      const k = keysRef.current;
      let ix = 0, iy = 0;
      if (k.has('a') || k.has('arrowleft')) ix -= 1;
      if (k.has('d') || k.has('arrowright')) ix += 1;
      if (k.has('w') || k.has('arrowup')) iy -= 1;
      if (k.has('s') || k.has('arrowdown')) iy += 1;
      if (stickRef.current.active) { ix = stickRef.current.dx; iy = stickRef.current.dy; }
      game.setInput(ix, iy);

      acc += dt;
      let ticks = 0;
      while (acc >= TICK && ticks < MAX_CATCHUP) {
        game.step();
        acc -= TICK;
        ticks++;
      }
      if (acc > TICK * MAX_CATCHUP) acc = 0; // birikmiş açığı at

      render(ctx, game, cssW, cssH, dpr, dt);

      // ses ipuçlarını boşalt (sfx kendi içinde kısıyor)
      if (game.events.size) {
        for (const e of game.events) play(e as any);
        game.events.clear();
      }

      // fps ölçümü
      frames++;
      fpsTimer += rawDt;
      if (fpsTimer >= 0.5) { fps = Math.round(frames / fpsTimer); frames = 0; fpsTimer = 0; }

      // HUD'u ~12Hz örnekle (60Hz React re-render gereksiz)
      hudAcc += rawDt;
      if (hudAcc >= 1 / 12 || game.phase !== 'running') {
        hudAcc = 0;
        setHud({
          time: game.time, hp: game.hp, maxHp: game.stats.maxHp, level: game.level,
          xp: game.xp, xpNext: game.xpNext, kills: game.kills, gold: game.gold,
          enemies: game.enemies.length, phase: game.phase, fps,
          offers: game.offers.map((o) => ({ id: o.id, name: o.name, desc: o.desc, kind: o.kind })),
          weapons: game.weapons.map((w) => ({ name: w.def.name, level: w.level })),
          passives: game.passives.map((p) => ({ name: p.def.name, level: p.level })),
          revives: game.revives,
          evolution: game.lastEvolution,
        });
      }
    };
    raf = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('keydown', onFirstGesture);
      window.removeEventListener('pointerdown', onFirstGesture);
      window.removeEventListener('touchstart', onFirstGesture);
      window.removeEventListener('resize', resize);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      canvas.removeEventListener('touchstart', onTouchStart);
      canvas.removeEventListener('touchmove', onTouchMove);
      canvas.removeEventListener('touchend', onTouchEnd);
      canvas.removeEventListener('touchcancel', onTouchEnd);
    };
  }, [seedText, runId]);

  const xpPct = hud ? Math.min(100, (hud.xp / hud.xpNext) * 100) : 0;
  const hpPct = hud ? Math.max(0, (hud.hp / hud.maxHp) * 100) : 100;

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%', overflow: 'hidden', background: C.void }}>
      <canvas ref={canvasRef} style={{ width: '100%', height: '100%', display: 'block', touchAction: 'none' }} />

      {/* ── HUD ── */}
      {hud && (
        <>
          {/* üst şerit: XP + süre */}
          <div style={{ position: 'absolute', top: 0, left: 0, right: 0, pointerEvents: 'none' }}>
            <div style={{ height: 7, background: 'rgba(0,0,0,0.55)' }}>
              <div style={{ height: '100%', width: `${xpPct}%`, background: `linear-gradient(90deg, ${C.candleSoft}, ${C.candle})`, transition: 'width 90ms linear' }} />
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px', fontSize: 13, fontWeight: 800 }}>
              <span style={{ color: C.candle }}>LV {hud.level}</span>
              <span style={{ color: C.bone, fontSize: 20, fontVariantNumeric: 'tabular-nums' }}>{fmtTime(hud.time)}</span>
              <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ color: C.boneDim, fontVariantNumeric: 'tabular-nums' }}>{hud.kills} kill</span>
                <button
                  onClick={() => { const next = !isSoundEnabled(); setSoundEnabled(next); setMuted(!next); unlockAudio(); }}
                  aria-label={muted ? 'Unmute' : 'Mute'}
                  style={{ pointerEvents: 'auto', width: 26, height: 22, borderRadius: 6, cursor: 'pointer',
                    border: `1px solid ${C.border}`, background: 'rgba(0,0,0,0.4)', color: muted ? C.boneFaint : C.candle,
                    fontSize: 12, lineHeight: 1, padding: 0 }}>
                  {muted ? '🔇' : '🔊'}
                </button>
              </span>
            </div>
          </div>

          {/* Evrim duyurusu — 4 saniye görünür. Oyuncu bunu kaçırmamalı,
              run'ın en büyük anı. */}
          {hud.evolution && hud.time - hud.evolution.at < 4 && (
            <div style={{ position: 'absolute', top: '30%', left: 0, right: 0, textAlign: 'center', pointerEvents: 'none' }}>
              <div style={{ fontSize: 11, fontWeight: 900, letterSpacing: 3, color: C.candle, marginBottom: 4 }}>EVOLVED</div>
              <div style={{ fontSize: 34, fontWeight: 900, color: C.bone, textShadow: `0 0 26px ${C.candle}, 0 2px 0 ${C.void}` }}>
                {hud.evolution.name}
              </div>
            </div>
          )}

          {/* alt sol: can + istatistik */}
          <div style={{ position: 'absolute', bottom: 12, left: 12, pointerEvents: 'none' }}>
            <div style={{ width: 168, height: 12, borderRadius: 7, background: 'rgba(0,0,0,0.6)', border: `1px solid ${C.border}`, overflow: 'hidden' }}>
              <div style={{ height: '100%', width: `${hpPct}%`, background: `linear-gradient(90deg, ${C.blood}, ${C.bloodSoft})`, transition: 'width 90ms linear' }} />
            </div>
            <div style={{ marginTop: 6, fontSize: 11, color: C.boneFaint, fontVariantNumeric: 'tabular-nums' }}>
              {Math.ceil(hud.hp)}/{Math.round(hud.maxHp)} HP · {Math.floor(hud.gold)} gold · {hud.enemies} enemies · {hud.fps} fps
            </div>

            {/* Taşınan build — oyuncu neye sahip olduğunu görmeli */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginTop: 8, maxWidth: 300 }}>
              {hud.weapons.map((w) => (
                <span key={w.name} style={{ fontSize: 10, fontWeight: 800, color: C.candle, background: 'rgba(239,167,46,0.13)', border: `1px solid ${C.candle}44`, padding: '2px 6px', borderRadius: 6 }}>
                  {w.name} <span style={{ opacity: 0.75 }}>L{w.level}</span>
                </span>
              ))}
              {hud.passives.map((p) => (
                <span key={p.name} style={{ fontSize: 10, fontWeight: 700, color: C.ice, background: 'rgba(138,151,163,0.12)', border: `1px solid ${C.ice}44`, padding: '2px 6px', borderRadius: 6 }}>
                  {p.name} <span style={{ opacity: 0.75 }}>L{p.level}</span>
                </span>
              ))}
            </div>
          </div>
        </>
      )}

      {/* ── LEVEL UP ── */}
      {hud?.phase === 'levelup' && (
        <div style={{ position: 'absolute', inset: 0, background: 'rgba(10,8,6,0.86)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: 2.5, color: C.candle, marginBottom: 18 }}>LEVEL {hud.level}</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, width: '100%', maxWidth: 380 }}>
            {hud.offers.map((o, i) => (
              <button key={o.id} onClick={() => choose(o.id)}
                style={{ ...glass(12), padding: '14px 16px', textAlign: 'left', cursor: 'pointer', color: C.bone, display: 'flex', alignItems: 'center', gap: 12 }}>
                <span style={{ width: 24, height: 24, flexShrink: 0, borderRadius: 6, background: 'rgba(239,167,46,0.16)', border: `1px solid ${C.candle}55`, color: C.candle, fontSize: 12, fontWeight: 900, display: 'grid', placeItems: 'center' }}>{i + 1}</span>
                <span style={{ minWidth: 0 }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap' }}>
                    <span style={{ fontWeight: 800, fontSize: 14.5 }}>{o.name}</span>
                    {/* Silah mı pasif mi, yeni mi yükseltme mi — kararı hızlandırır */}
                    <span style={{ fontSize: 9, fontWeight: 800, letterSpacing: 0.6, padding: '1px 5px', borderRadius: 4,
                      color: o.kind.startsWith('weapon') ? C.candle : C.ice,
                      background: o.kind.startsWith('weapon') ? 'rgba(239,167,46,0.14)' : 'rgba(138,151,163,0.14)' }}>
                      {o.kind.endsWith('new') ? 'NEW' : 'UPGRADE'}
                    </span>
                  </span>
                  <span style={{ display: 'block', fontSize: 12, color: C.boneDim, marginTop: 2 }}>{o.desc}</span>
                </span>
              </button>
            ))}
          </div>
          <div style={{ marginTop: 14, fontSize: 11, color: C.boneFaint }}>Press 1 · 2 · 3 to choose</div>
        </div>
      )}

      {/* ── ÖLÜM / KAZANMA ── */}
      {(hud?.phase === 'dead' || hud?.phase === 'won') && (
        <div style={{ position: 'absolute', inset: 0, background: 'rgba(10,8,6,0.9)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div style={{ fontSize: 34, fontWeight: 900, color: hud.phase === 'won' ? C.candle : C.blood, marginBottom: 6 }}>
            {hud.phase === 'won' ? 'SURVIVED' : 'YOU DIED'}
          </div>
          <div style={{ fontSize: 13, color: C.boneDim, marginBottom: 20, textAlign: 'center' }}>
            {fmtTime(hud.time)} · LV {hud.level} · {hud.kills} kill · {hud.gold} gold
            <br />
            <span style={{ color: C.boneFaint, fontSize: 12 }}>
              {hud.phase === 'won' ? `${RUN.durationSec / 60} minutes survived` : 'Death is progress — the gold you earned is yours to keep'}
            </span>
          </div>
          <button onClick={() => setRunId((n) => n + 1)} style={ctaButton(true)}>Rise Again</button>
        </div>
      )}
    </div>
  );
}
