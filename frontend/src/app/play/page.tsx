'use client';
// Oyun kabuğu: HUB ⇄ BÖLÜM.
// Hub'da gezersin, Warden's Post'tan bölüm seçersin, bölüm biter/ölürsün,
// gold TAVANA GÖRE cüzdana yazılır ve hub'a dönersin.

import { useCallback, useEffect, useState } from 'react';
import { HubCanvas } from '@/components/HubCanvas';
import { GameCanvas } from '@/components/GameCanvas';
import { ForgePanel } from '@/components/ForgePanel';
import { RecordsPanel } from '@/components/RecordsPanel';
import { BuildingDock } from '@/components/BuildingDock';
import { Panel, PixelButton } from '@/components/ui/kit';
import { permanentBonus } from '@/game/forge';
import { STAGES, depthGold, stageById } from '@/game/config';
import {
  applyRunResult, loadProgress, paidDepth, saveProgress,
  type Progress, type RunResult,
} from '@/game/progress';
import type { RunMode } from '@/game/engine';
import type { BuildingId } from '@/game/hub';
import { C, glass, ctaButton } from '@/lib/theme';

type Screen = { kind: 'hub' } | { kind: 'stage'; stageId: number; mode: RunMode };

/** Koşu sonu bildirimi — ödülün nereden geldiği oyuncuya AÇIKÇA gösterilir */
type Payout = {
  mode: RunMode;
  /** bu koşuda temizlenen en derin seviye — "hiç inemedin" ile "buraya zaten
   *  inmiştin" ayrımı için gerekli; ikisi de 0 öder ama sebepleri farklı */
  deepestCleared: number;
  progressGold: number;
  dropGold: number;
  paidRange: { from: number; to: number } | null;
};

export default function PlayPage() {
  const [screen, setScreen] = useState<Screen>({ kind: 'hub' });
  const [panel, setPanel] = useState<BuildingId | null>(null);
  const [progress, setProgress] = useState<Progress | null>(null);
  const [payout, setPayout] = useState<Payout | null>(null);

  useEffect(() => { setProgress(loadProgress()); }, []);

  const onEnter = useCallback((id: BuildingId) => setPanel(id), []);

  /** Koşu bitti — ödülü progress.ts hesaplar (exploit kapısı orada), hub'a dön */
  const finishRun = useCallback((run: RunResult) => {
    setProgress((prev) => {
      const base = prev ?? loadProgress();
      const r = applyRunResult(base, run);
      saveProgress(r.progress);
      setPayout({
        mode: run.mode, deepestCleared: run.deepestCleared,
        progressGold: r.progressGold, dropGold: r.dropGold, paidRange: r.paidRange,
      });
      return r.progress;
    });
    setScreen({ kind: 'hub' });
  }, []);

  // GELİŞTİRME KANCASI — üretimde YOK.
  // Hub'da gezmek requestAnimationFrame'e bağlı; otomatik doğrulamada tarayıcı
  // paneli görünmediğinde rAF donuyor ve hiçbir panele yürüyerek ulaşılamıyor.
  // Bu kanca panelleri doğrudan açar: /play?panel=quests  ·  window.__gb.panel('quests')
  useEffect(() => {
    if (process.env.NODE_ENV === 'production') return;
    const w = window as unknown as { __gb?: unknown };
    w.__gb = { panel: setPanel, finish: finishRun, screen: setScreen };
    const q = new URLSearchParams(window.location.search).get('panel');
    if (q) setPanel(q);
    return () => { delete w.__gb; };
  }, [finishRun]);

  if (screen.kind === 'stage') {
    const def = stageById(screen.stageId)!;
    return (
      <div style={{ position: 'fixed', inset: 0 }}>
        <GameCanvas
          stage={def}
          mode={screen.mode}
          permanent={permanentBonus((progress ?? loadProgress()).upgrades)}
          onFinish={finishRun}
        />
      </div>
    );
  }

  return (
    <div style={{ position: 'fixed', inset: 0 }}>
      <HubCanvas
        onEnterBuilding={onEnter}
        // Dövüş portalı doğrudan bölüm BAŞLATMAZ, seçim panelini açar.
        // (HubCanvas burada os(0) çağırıyordu; stageById(0) undefined olduğu
        //  için portala basmak sayfayı çökertiyordu.)
        onEnterStage={() => setPanel('quests')}
      />

      {/* Cüzdan + bina rıhtımı — yürümek seçenek, zorunluluk değil */}
      <BuildingDock open={panel} onOpen={setPanel} gold={progress?.gold ?? 0} />

      {/* Koşu sonu ödül dökümü — ödülün NEREDEN geldiği görünür olmalı,
          yoksa "tekrar oynadım ama gold gelmedi" haklı şikâyeti doğar */}
      {payout && (
        <div onClick={() => setPayout(null)}
          style={{ position: 'absolute', inset: 0, background: 'rgba(10,8,6,0.82)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '78px 20px 20px' }}>
          <div onClick={(e) => e.stopPropagation()} style={{ ...glass(16), padding: 24, width: '100%', maxWidth: 420, textAlign: 'center' }}>
            <div style={{ fontSize: 11, fontWeight: 900, letterSpacing: 2.5, color: C.blood, marginBottom: 6 }}>THE VILLAGE SETTLES UP</div>
            <div style={{ fontSize: 38, fontWeight: 900, color: C.candle, marginBottom: 14 }}>
              +{payout.progressGold + payout.dropGold} <span style={{ fontSize: 16 }}>GOLD</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 7, fontSize: 12.5, textAlign: 'left' }}>
              <Row
                label={payout.paidRange
                  ? `New depths ${payout.paidRange.from + 1}–${payout.paidRange.to}`
                  : payout.mode === 'descent'
                    ? (payout.deepestCleared === 0 ? 'No depth cleared' : 'No new depths')
                    : 'First clear'}
                value={payout.progressGold}
                hint={payout.progressGold > 0 ? undefined
                  : payout.mode === 'descent'
                    ? (payout.deepestCleared === 0
                        ? 'you left before clearing depth 1'
                        : 'you have been this deep before — go deeper')
                    : 'already claimed — replay pays nothing'}
              />
              <Row label="Rare finds" value={payout.dropGold} hint={payout.dropGold === 0 ? 'nothing dropped this run' : undefined} />
            </div>
            <button onClick={() => setPayout(null)}
              style={{ ...ctaButton(true), marginTop: 18, width: '100%' }}>Continue</button>
          </div>
        </div>
      )}

      {panel && (
        <div onClick={() => setPanel(null)}
          style={{ position: 'absolute', inset: 0, zIndex: 5, background: 'rgba(10,8,6,0.84)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '78px 20px 20px' }}>
          <Panel variant="07A" scale={3} pad={6} onClick={(e) => e.stopPropagation()}
            style={{ width: '100%', maxWidth: 560, maxHeight: '84vh', overflowY: 'auto' }}>
            {/* Panel içinde ikinci bir bina sırası YOK — navbar panelin üstünde
                (zIndex 6) ve açıkken de tıklanabilir kalıyor. İki sıra hem
                gereksizdi hem panelin içinde sarıp dağınık duruyordu. */}
            {panel === 'quests' ? (
              <StageSelect
                progress={progress}
                onPick={(id, mode) => { setPanel(null); setScreen({ kind: 'stage', stageId: id, mode }); }}
              />
            ) : panel === 'upgrade' ? (
              <ForgePanel progress={progress ?? loadProgress()} onChange={setProgress} />
            ) : panel === 'tavern' ? (
              <RecordsPanel progress={progress ?? loadProgress()} />
            ) : (
              <ComingSoon id={panel} />
            )}

            <div style={{ marginTop: 16, textAlign: 'center' }}>
              <PixelButton variant="02A" scale={2} onClick={() => setPanel(null)}
                style={{ width: '100%', fontSize: 12, fontWeight: 900, letterSpacing: 1.5 }}>
                CLOSE
              </PixelButton>
            </div>
          </Panel>
        </div>
      )}
    </div>
  );
}

function Row({ label, value, hint }: { label: string; value: number; hint?: string }) {
  return (
    <div style={{ ...glass(9), padding: '9px 12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
      <span style={{ minWidth: 0 }}>
        <span style={{ display: 'block', color: C.bone, fontWeight: 800 }}>{label}</span>
        {hint && <span style={{ display: 'block', fontSize: 11, color: C.boneFaint, marginTop: 1 }}>{hint}</span>}
      </span>
      <span style={{ flexShrink: 0, fontWeight: 900, fontSize: 15, color: value > 0 ? C.candle : C.boneFaint }}>
        +{value}
      </span>
    </div>
  );
}

function StageSelect({ progress, onPick }: {
  progress: Progress | null;
  onPick: (id: number, mode: RunMode) => void;
}) {
  const p = progress ?? loadProgress();
  return (
    <>
      <div style={{ fontSize: 11, fontWeight: 900, letterSpacing: 2.5, color: C.blood, marginBottom: 4 }}>THE WARDEN&apos;S POST</div>
      <h2 style={{ margin: '0 0 4px', fontSize: 24, fontWeight: 900, color: C.bone }}>Choose your road</h2>
      <p style={{ margin: '0 0 16px', fontSize: 12, color: C.boneDim, lineHeight: 1.55 }}>
        Clear a stage once for its reward. Then the Descent opens beneath it — an endless
        ladder where every new depth pays, and no depth pays twice.
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
        {STAGES.map((s) => {
          const locked = s.id > p.unlockedStage;
          const cleared = !!p.cleared[s.id];
          const claimed = !!p.firstClear[s.id];
          const best = paidDepth(p, s.id);
          const nextDepthPays = depthGold(s.id, best + 1);
          return (
            <div key={s.id} style={{ ...glass(11), padding: '13px 15px',
              opacity: locked ? 0.4 : 1, border: `1px solid ${cleared ? `${C.candle}55` : C.border}` }}>
              <button disabled={locked} onClick={() => onPick(s.id, 'campaign')}
                style={{ all: 'unset', display: 'block', width: '100%', cursor: locked ? 'default' : 'pointer' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
                  <span style={{ fontWeight: 900, fontSize: 15, color: C.bone }}>
                    {s.id}. {s.name} {cleared && <span style={{ color: C.candle, fontSize: 12 }}>✓</span>}
                  </span>
                  <span style={{ fontSize: 11, color: C.boneFaint }}>{locked ? 'LOCKED' : `${s.enemyCount} enemies`}</span>
                </div>
                <div style={{ fontSize: 11.5, color: !claimed ? C.candle : C.boneFaint, marginTop: 3 }}>
                  {locked ? `Clear stage ${s.id - 1} to unlock`
                    : !claimed ? `First clear pays ${s.firstClearGold} gold`
                    : 'Reward claimed — replay for practice'}
                </div>
              </button>

              {/* Descent — bölüm bir kez temizlenince açılır. Oyunun ömrü burada. */}
              {cleared && (
                <button onClick={() => onPick(s.id, 'descent')}
                  style={{ all: 'unset', display: 'block', width: '100%', marginTop: 9, paddingTop: 9,
                    borderTop: `1px solid ${C.border}`, cursor: 'pointer' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
                    <span style={{ fontWeight: 900, fontSize: 13.5, color: C.blood }}>⛏ THE DESCENT</span>
                    <span style={{ fontSize: 11, color: C.boneFaint }}>
                      {best > 0 ? `best depth ${best}` : 'never entered'}
                    </span>
                  </div>
                  <div style={{ fontSize: 11.5, color: C.candle, marginTop: 3 }}>
                    Depth {best + 1} pays {nextDepthPays} gold
                  </div>
                </button>
              )}
            </div>
          );
        })}
      </div>
    </>
  );
}

// Kapalı binalar. "Coming soon" tek başına oyuncuya hiçbir şey söylemiyordu;
// burada NE olacağı ve NİYE kapalı olduğu yazıyor.
// ⚠️ Hiçbir yerde "swap gold for $GRAVE" DEMİYORUZ: hazine sabit kurdan alım
// yaparsa oyun token BASMIŞ olur ve sıfır-emisyon sözü çöker. İkisi de P2P.
const LOCKED: Record<string, { kicker: string; title: string; body: string; bullets: string[]; gate: string }> = {
  shop: {
    kicker: "THE PEDLAR'S STALL", title: 'Shuttered',
    body: 'The pedlar deals in things you carry into a run — not permanent power. That is the Forge’s business.',
    bullets: [
      'Charms consumed on a single descent',
      'Bought with gold, spent whether you win or lose',
      'Deliberately weaker than Forge levels — convenience, not a shortcut',
    ],
    gate: 'Opens when run-consumables land.',
  },
  market: {
    kicker: 'THE MARKETPLACE', title: 'Not yet trading',
    body: 'Where players sell gold to each other for $GRAVE. The game never mints the token — every coin comes from another player’s wallet.',
    bullets: [
      'You list gold at your own price',
      'A buyer pays from their wallet, on-chain',
      'Listings sit in escrow until sold or cancelled',
    ],
    gate: 'Opens with $GRAVE.',
  },
  exchange: {
    kicker: 'THE EXCHANGE', title: 'Not yet trading',
    body: 'The order book behind the Marketplace — standing bids and asks instead of fixed listings.',
    bullets: [
      'Player-to-player only, no house counterparty',
      'A fee on token trades; half of it burned',
      'Gold-priced trades stay fee-free',
    ],
    gate: 'Opens with $GRAVE.',
  },
};

function ComingSoon({ id }: { id: BuildingId }) {
  const l = LOCKED[id];
  if (!l) {
    return <h2 style={{ margin: 0, fontSize: 22, fontWeight: 900, color: C.bone }}>{id}</h2>;
  }
  return (
    <>
      <div style={{ fontSize: 11, fontWeight: 900, letterSpacing: 2.5, color: C.blood, marginBottom: 4 }}>{l.kicker}</div>
      <h2 style={{ margin: '0 0 8px', fontSize: 24, fontWeight: 900, color: C.bone }}>{l.title}</h2>
      <p style={{ margin: '0 0 14px', fontSize: 12.5, color: C.boneDim, lineHeight: 1.6 }}>{l.body}</p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {l.bullets.map((b) => (
          <div key={b} style={{ ...glass(9), padding: '9px 12px', fontSize: 12, color: C.boneDim, lineHeight: 1.45 }}>
            <span style={{ color: C.candle, marginRight: 8 }}>•</span>{b}
          </div>
        ))}
      </div>
      <div style={{ marginTop: 14, textAlign: 'center', fontSize: 11, fontWeight: 900,
        letterSpacing: 1.6, color: C.boneDim }}>
        {l.gate.toUpperCase()}
      </div>
    </>
  );
}
