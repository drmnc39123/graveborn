'use client';
// THE WAGER — koşu öncesi risk. Gerekçe ve musluk analizi: game/wager.ts.
//
// ⚠️ Oyuncuya ÖDÜLÜN TOZ OLDUĞU açıkça söyleniyor. "Gold katla" beklentisiyle
// gelen oyuncu toz görünce kandırıldığını düşünür; oysa tasarım kararı tam
// tersini korumak için alındı — gold ödeseydi bahis bir musluk olurdu ve
// herkesin gold'u değersizleşirdi.

import { useCallback, useMemo, useState } from 'react';
import { BTN, PixelButton } from '@/components/ui/kit';
import { STAGES } from '@/game/config';
import { WAGER, wagerError, wagerPayout, wagerTarget } from '@/game/wager';
import { paidDepth, type Progress } from '@/game/progress';
import { cancelWager, placeWager } from '@/lib/gameSession';
import { Card, CardSection, Tag } from '@/components/ui/cards';
import { C } from '@/lib/theme';

export function WagerSection({ progress, onChange, onError }: {
  progress: Progress;
  onChange: (p: Progress) => void;
  onError: (msg: string) => void;
}) {
  const cleared = useMemo(() => STAGES.filter((s) => progress.cleared[s.id]), [progress.cleared]);
  const [stageId, setStageId] = useState<number>(cleared[cleared.length - 1]?.id ?? 1);
  const [stake, setStake] = useState<number>(WAGER.minStake * 4);
  const [busy, setBusy] = useState(false);

  const best = paidDepth(progress, stageId);
  const target = wagerTarget(best);
  const payout = wagerPayout(stake);
  const err = wagerError(stake, progress.gold);
  const armed = progress.wager;

  const place = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    try { onChange(await placeWager(stageId, stake, progress)); }
    catch (e) { onError(e instanceof Error ? e.message : 'The bet was refused.'); }
    finally { setBusy(false); }
  }, [busy, stageId, stake, progress, onChange, onError]);

  const cancel = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    try { onChange(await cancelWager(progress)); }
    catch (e) { onError(e instanceof Error ? e.message : 'Could not withdraw.'); }
    finally { setBusy(false); }
  }, [busy, progress, onChange, onError]);

  if (!cleared.length) {
    return (
      <p style={{ margin: 0, fontSize: 12, color: C.boneFaint, lineHeight: 1.6 }}>
        Nothing to bet on yet. Clear a stage and the Descent opens beneath it — the
        dead only take wagers on ground you have already walked.
      </p>
    );
  }

  return (
    <>
      <p style={{ margin: '0 0 14px', fontSize: 12, color: C.boneDim, lineHeight: 1.55 }}>
        Stake gold that your next descent goes <strong style={{ color: C.bone }}>deeper than
        you have ever gone</strong>. Win and the dead pay you in dust. Lose and the gold stays
        down there.
      </p>

      {armed ? (
        // ── KURULMUŞ BAHİS ──
        <Card accent>
          <div style={{ padding: '14px 13px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <Tag tone="blood">BET STANDING</Tag>
              <span style={{ fontSize: 13, fontWeight: 900, color: C.bone }}>
                {STAGES.find((s) => s.id === armed.stageId)?.name ?? `Stage ${armed.stageId}`}
              </span>
            </div>
            <div style={{ fontSize: 12, color: C.boneDim, marginTop: 8, lineHeight: 1.55 }}>
              Reach <strong style={{ color: C.candle }}>depth {armed.target}</strong> and
              collect <strong style={{ color: C.ice }}>{wagerPayout(armed.stake)} dust</strong>.
            </div>
            {/* ⚠️ Bu uyarı KALDIRILAMAZ: gold koşu açılırken yanıyor, oyuncu
                bunu bahsi kurarken bilmeli. */}
            <div style={{ fontSize: 11, color: C.boneFaint, marginTop: 6, lineHeight: 1.45 }}>
              {armed.stake.toLocaleString('en-US')} gold will be taken when the run opens —
              not now. Leaving the run early does not give it back.
            </div>
            <PixelButton
              variant={BTN.action} scale={2}
              onClick={cancel} disabled={busy}
              style={{ width: '100%', marginTop: 12, fontSize: 11, fontWeight: 900, letterSpacing: 0.8 }}>
              WITHDRAW THE BET
            </PixelButton>
          </div>
        </Card>
      ) : (
        // ── BAHİS KURMA ──
        <Card>
          <div style={{ padding: '13px' }}>
            <div style={{ fontSize: 10, fontWeight: 900, letterSpacing: 1.2, color: C.boneFaint, marginBottom: 6 }}>
              WHICH ROAD
            </div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 13 }}>
              {cleared.map((s) => {
                const on = s.id === stageId;
                return (
                  <button key={s.id} onClick={() => setStageId(s.id)}
                    style={{
                      all: 'unset', cursor: 'pointer', padding: '6px 10px', borderRadius: 6,
                      fontSize: 11, fontWeight: 800,
                      color: on ? C.bone : C.boneFaint,
                      background: on ? 'rgba(239,167,46,0.14)' : 'rgba(255,255,255,0.05)',
                      border: `1px solid ${on ? `${C.candle}55` : 'rgba(255,255,255,0.10)'}`,
                    }}>
                    {s.name}
                  </button>
                );
              })}
            </div>

            {/* Hedef — oyuncunun KENDİ rekorundan türer, seçilemez */}
            <div style={{
              display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
              padding: '10px 11px', borderRadius: 7,
              background: 'rgba(160,18,38,0.10)', border: '1px solid rgba(160,18,38,0.3)',
            }}>
              <div style={{ flex: 1, minWidth: 130 }}>
                <div style={{ fontSize: 10, fontWeight: 900, letterSpacing: 1, color: C.boneFaint }}>
                  YOUR TARGET
                </div>
                <div style={{ fontSize: 15, fontWeight: 900, color: C.candle, marginTop: 2 }}>
                  Depth {target}
                </div>
              </div>
              <div style={{ fontSize: 11, color: C.boneDim, lineHeight: 1.45, flex: 2, minWidth: 160 }}>
                {best > 0
                  ? `Your deepest here is ${best}. The bet only pays if you go past it.`
                  : 'You have never descended here. Reaching depth 1 settles the bet.'}
              </div>
            </div>

            <div style={{ fontSize: 10, fontWeight: 900, letterSpacing: 1.2, color: C.boneFaint, margin: '13px 0 6px' }}>
              HOW MUCH
            </div>
            <input
              type="range"
              min={WAGER.minStake}
              max={Math.max(WAGER.minStake, Math.min(WAGER.maxStake, Math.floor(progress.gold)))}
              step={50}
              value={stake}
              onChange={(e) => setStake(Number(e.target.value))}
              style={{ width: '100%', accentColor: C.blood }}
            />
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 8, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 15, fontWeight: 900, color: C.candle }}>
                {stake.toLocaleString('en-US')} gold
              </span>
              <span style={{ fontSize: 12, color: C.boneFaint }}>→</span>
              <span style={{ fontSize: 15, fontWeight: 900, color: C.ice }}>
                {payout.toLocaleString('en-US')} dust
              </span>
              <Tag>IF YOU MAKE IT</Tag>
            </div>

            {/* ⚠️ BTN.strong — bahis yatırmak GERİ DÖNÜŞSÜZ: gold koşu
                açılırken yanıyor, kaybedince geri gelmiyor. Altın doku
                "satın alıyorsun" der ve bu riski gizlerdi. */}
            <PixelButton
              variant={BTN.strong} scale={3}
              onClick={place} disabled={!!err || busy}
              style={{ width: '100%', marginTop: 13, fontSize: 12, fontWeight: 900, letterSpacing: 1 }}>
              {err ? err.toUpperCase() : busy ? 'PLACING…' : 'PLACE THE BET'}
            </PixelButton>
          </div>
        </Card>
      )}

      <CardSection label="WHY DUST AND NOT GOLD">
        <span style={{ fontSize: 11, color: C.boneFaint, lineHeight: 1.5 }}>
          A bet that paid gold would print it. Early on your record climbs almost every
          run, so &ldquo;beat your record&rdquo; would be close to a sure thing — and a sure thing
          that pays gold is a mint, not a gamble. Paying in dust keeps the gold flowing
          one way: out.
        </span>
      </CardSection>
    </>
  );
}
