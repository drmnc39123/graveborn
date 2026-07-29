'use client';
import { useMemo } from 'react';
import { GameCanvas } from '@/components/GameCanvas';

// Günlük seed: herkes aynı gün aynı run'ı oynar → skorlar birebir kıyaslanabilir.
// (Faz 4'te seed'i sunucu verecek; şimdilik tarihten türetiliyor.)
function dailySeed() {
  const d = new Date();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
}

export default function PlayPage() {
  const seed = useMemo(dailySeed, []);
  return (
    <div style={{ position: 'fixed', inset: 0 }}>
      <GameCanvas seedText={seed} />
    </div>
  );
}
