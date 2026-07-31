'use client';
// TAVERN — oyuncunun sicili.
//
// Bu panel BUGÜN gerçek olabiliyor çünkü tüm veri zaten Progress'te duruyor;
// backend beklemesine gerek yok. Market/Exchange'in aksine burada uydurma bir
// "yakında" ekranı göstermek gereksiz olurdu.

import { useMemo } from 'react';
import { STAGES, depthGold } from '@/game/config';
import { FORGE, costOf, spentOn } from '@/game/forge';
import { paidDepth, type Progress } from '@/game/progress';
import { C, FONT, glass } from '@/lib/theme';

export function RecordsPanel({ progress }: { progress: Progress }) {
  const stats = useMemo(() => {
    const cleared = STAGES.filter((s) => progress.cleared[s.id]).length;
    const deepest = Math.max(0, ...STAGES.map((s) => paidDepth(progress, s.id)));
    const forgeLevels = FORGE.reduce((n, u) => n + Math.min(progress.upgrades[u.id] ?? 0, u.maxLevel), 0);
    const forgeMax = FORGE.reduce((n, u) => n + u.maxLevel, 0);
    const spent = spentOn(progress.upgrades);
    // "Kazanılan toplam" ayrı tutulmuyor — harcanan + kalan ile türetiliyor.
    const earned = spent + Math.floor(progress.gold);
    // Bir sonraki alınabilir en ucuz yükseltme: "sırada ne var" sorusu
    let next: { name: string; cost: number } | null = null;
    for (const u of FORGE) {
      const lv = progress.upgrades[u.id] ?? 0;
      if (lv >= u.maxLevel) continue;
      const c = costOf(u, lv);
      if (!next || c < next.cost) next = { name: u.name, cost: c };
    }
    return { cleared, deepest, forgeLevels, forgeMax, spent, earned, next };
  }, [progress]);

  return (
    <>
      <div style={{ fontSize: 11, fontWeight: 900, letterSpacing: 2.5, color: C.blood, marginBottom: 4 }}>THE TAVERN</div>
      <h2 style={{ margin: '0 0 4px', fontSize: 24, fontWeight: 900, color: C.bone }}>Your record</h2>
      <p style={{ margin: '0 0 14px', fontSize: 12, color: C.boneDim, lineHeight: 1.55 }}>
        Everything the village knows about you.
      </p>

      <div style={{ display: 'grid', gap: 8, gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))' }}>
        <Stat label="Stages cleared" value={`${stats.cleared} / ${STAGES.length}`} />
        <Stat label="Deepest descent" value={stats.deepest > 0 ? `Depth ${stats.deepest}` : '—'} accent />
        <Stat label="Gold earned" value={stats.earned.toLocaleString('en-US')} accent />
        <Stat label="Gold in purse" value={Math.floor(progress.gold).toLocaleString('en-US')} />
        <Stat label="Spent at the Forge" value={stats.spent.toLocaleString('en-US')} />
        <Stat label="Forge levels" value={`${stats.forgeLevels} / ${stats.forgeMax}`} />
      </div>

      {/* Franuka Divider_03 mavi tonlu — gotik palete oturmuyor. Sade çizgi. */}
      <div style={{ margin: '16px 0 12px', borderTop: `1px solid ${C.border}` }} />

      <div style={{ fontSize: 11, fontWeight: 900, letterSpacing: 1.6, color: C.boneFaint, marginBottom: 8 }}>
        THE DESCENT — BY ROAD
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {STAGES.map((s) => {
          const locked = !progress.cleared[s.id];
          const best = paidDepth(progress, s.id);
          return (
            <div key={s.id} style={{ ...glass(9), padding: '8px 11px', display: 'flex',
              justifyContent: 'space-between', alignItems: 'center', gap: 10,
              opacity: locked ? 0.45 : 1, fontFamily: FONT.ui }}>
              <span style={{ fontSize: 12.5, fontWeight: 800, color: C.bone }}>{s.id}. {s.name}</span>
              <span style={{ fontSize: 11.5, color: best > 0 ? C.candle : C.boneFaint, whiteSpace: 'nowrap' }}>
                {locked ? 'not cleared'
                  : best > 0 ? `depth ${best} · next pays ${depthGold(s.id, best + 1)}`
                  : `never entered · depth 1 pays ${depthGold(s.id, 1)}`}
              </span>
            </div>
          );
        })}
      </div>

      {stats.next && (
        <div style={{ marginTop: 14, ...glass(10), padding: '10px 12px', fontFamily: FONT.ui }}>
          <div style={{ fontSize: 10.5, color: C.boneFaint, letterSpacing: 1.2, fontWeight: 900 }}>CHEAPEST UPGRADE LEFT</div>
          <div style={{ fontSize: 13, color: C.bone, marginTop: 3 }}>
            {stats.next.name} — <span style={{ color: progress.gold >= stats.next.cost ? C.candle : C.boneFaint }}>
              {stats.next.cost.toLocaleString('en-US')} gold
            </span>
          </div>
        </div>
      )}
    </>
  );
}

function Stat({ label, value, accent = false }: { label: string; value: string; accent?: boolean }) {
  return (
    <div style={{ ...glass(10), padding: '10px 12px', fontFamily: FONT.ui }}>
      <div style={{ fontSize: 9.5, fontWeight: 900, letterSpacing: 1.2, color: C.boneFaint }}>{label.toUpperCase()}</div>
      <div style={{ fontSize: 17, fontWeight: 900, color: accent ? C.candle : C.bone, marginTop: 3 }}>{value}</div>
    </div>
  );
}
