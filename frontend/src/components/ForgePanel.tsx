'use client';
// THE FORGE — kalıcı yükseltme dükkânı.
//
// Gold'un tek harcama yeri (şimdilik). Bölüm bitirip gold kazanmanın
// karşılığı burada: sonraki run'lar kalıcı olarak güçlenir.

import { useMemo } from 'react';
import { FORGE, costOf, spentOn, type ForgeUpgrade } from '@/game/forge';
import type { Progress } from '@/game/progress';
import { buyUpgrade } from '@/lib/gameSession';
import { play } from '@/game/sfx';
import { C, glass } from '@/lib/theme';

export function ForgePanel({
  progress, onChange, onError,
}: {
  progress: Progress;
  onChange: (p: Progress) => void;
  onError?: (msg: string) => void;
}) {
  const spent = useMemo(() => spentOn(progress.upgrades), [progress.upgrades]);
  const levels = useMemo(
    () => FORGE.reduce((n, u) => n + Math.min(progress.upgrades[u.id] ?? 0, u.maxLevel), 0),
    [progress.upgrades],
  );
  const maxLevels = useMemo(() => FORGE.reduce((n, u) => n + u.maxLevel, 0), []);

  const buy = (u: ForgeUpgrade) => {
    const lv = progress.upgrades[u.id] ?? 0;
    if (lv >= u.maxLevel) return;
    const cost = costOf(u, lv);
    if (progress.gold < cost) return;
    play('chest');
    // Cüzdan modunda fiyatı ve bakiyeyi SUNUCU doğrular; demo modunda
    // yerel kayda yazılır. Ayrımı gameSession yapar, panel bilmez.
    buyUpgrade(u.id, progress, cost)
      .then(onChange)
      .catch(() => onError?.('Yükseltme alınamadı.'));
  };

  return (
    <>
      <div style={{ fontSize: 11, fontWeight: 900, letterSpacing: 2.5, color: C.blood, marginBottom: 4 }}>THE FORGE</div>
      <h2 style={{ margin: '0 0 4px', fontSize: 24, fontWeight: 900, color: C.bone }}>Permanent power</h2>
      <p style={{ margin: '0 0 10px', fontSize: 12, color: C.boneFaint, lineHeight: 1.5 }}>
        Bought once, kept forever. Every run after this starts stronger — even the ones you lose.
      </p>

      {/* Cüzdan + ilerleme. Artık "bütçe" yok — gold sonsuz akıyor, ağaç doymuyor. */}
      <div style={{ ...glass(10), padding: '9px 12px', marginBottom: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 17, fontWeight: 900, color: C.candle }}>{Math.floor(progress.gold)} GOLD</span>
        <span style={{ fontSize: 10.5, color: C.boneFaint, textAlign: 'right' }}>
          {levels}/{maxLevels} levels forged<br />
          {spent} gold spent here
        </span>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
        {FORGE.map((u) => {
          const lv = progress.upgrades[u.id] ?? 0;
          const maxed = lv >= u.maxLevel;
          const cost = costOf(u, lv);
          const can = !maxed && progress.gold >= cost;
          return (
            <div key={u.id} style={{
              ...glass(10), padding: '10px 12px',
              border: `1px solid ${maxed ? `${C.candle}55` : C.border}`,
              opacity: maxed ? 0.75 : 1,
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 900, fontSize: 14, color: C.bone }}>
                    {u.name}
                    <span style={{ marginLeft: 7, fontSize: 11, color: maxed ? C.candle : C.boneFaint }}>
                      {maxed ? 'MAX' : `Lv ${lv}/${u.maxLevel}`}
                    </span>
                  </div>
                  <div style={{ fontSize: 11.5, color: C.boneDim, marginTop: 2 }}>{u.desc}</div>
                </div>

                <button onClick={() => buy(u)} disabled={!can}
                  style={{
                    flexShrink: 0, minWidth: 92, padding: '8px 12px', borderRadius: 9, border: 'none',
                    cursor: can ? 'pointer' : 'default', fontWeight: 900, fontSize: 12.5,
                    color: maxed ? C.boneFaint : can ? '#1a0508' : C.boneFaint,
                    background: maxed ? 'rgba(255,255,255,0.06)'
                      : can ? `linear-gradient(180deg, ${C.candleSoft}, ${C.candle})`
                      : 'rgba(255,255,255,0.06)',
                  }}>
                  {maxed ? '✓ MAX' : `${cost} G`}
                </button>
              </div>

              {/* seviye çubuğu — kaç kaldığı bir bakışta görünsün */}
              <div style={{ display: 'flex', gap: 3, marginTop: 8 }}>
                {Array.from({ length: u.maxLevel }, (_, i) => (
                  <span key={i} style={{
                    flex: 1, height: 4, borderRadius: 2,
                    background: i < lv ? C.candle : 'rgba(255,255,255,0.1)',
                  }} />
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}
