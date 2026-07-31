'use client';
// Oyun kabuğu: HUB ⇄ BÖLÜM.
// Hub'da gezersin, Warden's Post'tan bölüm seçersin, bölüm biter/ölürsün,
// gold TAVANA GÖRE cüzdana yazılır ve hub'a dönersin.

import { useCallback, useEffect, useState } from 'react';
import { HubCanvas } from '@/components/HubCanvas';
import { GameCanvas } from '@/components/GameCanvas';
import { ForgePanel } from '@/components/ForgePanel';
import { permanentBonus } from '@/game/forge';
import { STAGES, stageById } from '@/game/config';
import { applyRunResult, loadProgress, remainingGold, saveProgress, type Progress } from '@/game/progress';
import type { BuildingId } from '@/game/hub';
import { C, glass, ctaButton } from '@/lib/theme';

type Screen = { kind: 'hub' } | { kind: 'stage'; stageId: number };

export default function PlayPage() {
  const [screen, setScreen] = useState<Screen>({ kind: 'hub' });
  const [panel, setPanel] = useState<BuildingId | null>(null);
  const [progress, setProgress] = useState<Progress | null>(null);

  useEffect(() => { setProgress(loadProgress()); }, []);

  const onEnter = useCallback((id: BuildingId) => setPanel(id), []);

  /** Bölüm bitti/ölündü — gold'u TAVANA GÖRE yaz, hub'a dön */
  const finishStage = useCallback((stageId: number, goldEarned: number, cleared: boolean) => {
    setProgress((prev) => {
      const base = prev ?? loadProgress();
      const { progress: next } = applyRunResult(base, stageId, goldEarned, cleared);
      saveProgress(next);
      return next;
    });
    setScreen({ kind: 'hub' });
  }, []);

  if (screen.kind === 'stage') {
    const def = stageById(screen.stageId)!;
    return (
      <div style={{ position: 'fixed', inset: 0 }}>
        <GameCanvas
          stage={def}
          permanent={permanentBonus((progress ?? loadProgress()).upgrades)}
          onFinish={(goldEarned, cleared) => finishStage(def.id, goldEarned, cleared)}
        />
      </div>
    );
  }

  return (
    <div style={{ position: 'fixed', inset: 0 }}>
      <HubCanvas
        progress={progress}
        onEnterBuilding={onEnter}
        onEnterStage={(id) => setScreen({ kind: 'stage', stageId: id })}
      />

      {panel && (
        <div onClick={() => setPanel(null)}
          style={{ position: 'absolute', inset: 0, background: 'rgba(10,8,6,0.82)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div onClick={(e) => e.stopPropagation()} style={{ ...glass(16), padding: 24, width: '100%', maxWidth: 520, maxHeight: '80vh', overflowY: 'auto' }}>
            {panel === 'quests' ? (
              <StageSelect
                progress={progress}
                onPick={(id) => { setPanel(null); setScreen({ kind: 'stage', stageId: id }); }}
              />
            ) : panel === 'upgrade' ? (
              <ForgePanel progress={progress ?? loadProgress()} onChange={setProgress} />
            ) : (
              <ComingSoon id={panel} />
            )}
            <button onClick={() => setPanel(null)}
              style={{ marginTop: 18, width: '100%', padding: '10px 0', borderRadius: 10, border: `1px solid ${C.border}`,
                background: 'rgba(255,255,255,0.05)', color: C.boneDim, fontWeight: 800, fontSize: 13, cursor: 'pointer' }}>
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function StageSelect({ progress, onPick }: { progress: Progress | null; onPick: (id: number) => void }) {
  const p = progress ?? loadProgress();
  return (
    <>
      <div style={{ fontSize: 11, fontWeight: 900, letterSpacing: 2.5, color: C.blood, marginBottom: 4 }}>THE WARDEN&apos;S POST</div>
      <h2 style={{ margin: '0 0 4px', fontSize: 24, fontWeight: 900, color: C.bone }}>Choose your descent</h2>
      <p style={{ margin: '0 0 16px', fontSize: 12, color: C.boneFaint }}>
        Each stage holds a fixed number of enemies — and a fixed amount of gold. Clear it to unlock the next.
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
        {STAGES.map((s) => {
          const locked = s.id > p.unlockedStage;
          const left = remainingGold(p, s.id);
          const cleared = !!p.cleared[s.id];
          return (
            <button key={s.id} disabled={locked} onClick={() => onPick(s.id)}
              style={{ ...glass(11), padding: '13px 15px', textAlign: 'left', cursor: locked ? 'default' : 'pointer',
                opacity: locked ? 0.4 : 1, border: `1px solid ${cleared ? `${C.candle}55` : C.border}` }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
                <span style={{ fontWeight: 900, fontSize: 15, color: C.bone }}>
                  {s.id}. {s.name} {cleared && <span style={{ color: C.candle, fontSize: 12 }}>✓</span>}
                </span>
                <span style={{ fontSize: 11, color: C.boneFaint }}>{locked ? 'LOCKED' : `${s.enemyCount} enemies`}</span>
              </div>
              <div style={{ fontSize: 11.5, color: left > 0 ? C.candle : C.boneFaint, marginTop: 3 }}>
                {locked ? `Clear stage ${s.id - 1} to unlock`
                  : left > 0 ? `${left} gold still available here`
                  : 'Gold fully claimed — replay for practice'}
              </div>
            </button>
          );
        })}
      </div>
    </>
  );
}

const LABELS: Record<string, { title: string; body: string }> = {
  upgrade: { title: 'Blacksmith', body: 'Permanent upgrades bought with GOLD. Coming next.' },
  shop: { title: "Pedlar's Stall", body: 'Consumables and gear. Coming soon.' },
  market: { title: 'Marketplace', body: 'Player-to-player trading for $GRAVE. Coming soon.' },
  exchange: { title: 'The Exchange', body: 'Swap GOLD for $GRAVE. Coming soon.' },
  tavern: { title: 'Tavern', body: 'Your profile, records and guild. Coming soon.' },
};

function ComingSoon({ id }: { id: BuildingId }) {
  const l = LABELS[id] ?? { title: id, body: 'Coming soon.' };
  return (
    <>
      <h2 style={{ margin: '0 0 8px', fontSize: 22, fontWeight: 900, color: C.bone }}>{l.title}</h2>
      <p style={{ margin: 0, fontSize: 13, color: C.boneDim }}>{l.body}</p>
    </>
  );
}
