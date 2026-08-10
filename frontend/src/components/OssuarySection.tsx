'use client';
// THE OSSUARY — anıt. Ekonominin dipsiz kovası (gerekçe: game/ossuary.ts).
//
// ⚠️ Oyuncuya "bu sonsuz" DEMİYORUZ ama gizlemiyoruz da: bir sonraki
// seviyenin fiyatı ve rütbenin ne zaman değişeceği hep görünür. Gacha'nın
// aksine burada belirsizlik yok — ne kadar verirsen o kadar yükselir.

import { useCallback, useState } from 'react';
import { BTN, PixelButton } from '@/components/ui/kit';
import { OSSUARY, ossuaryCost, ossuarySpent, ossuaryTier, ossuaryTierProgress } from '@/game/ossuary';
import type { Progress } from '@/game/progress';
import { raiseOssuary } from '@/lib/gameSession';
import { Card, CardSection, Tag } from '@/components/ui/cards';
import { C } from '@/lib/theme';

export function OssuarySection({ progress, onChange, onError }: {
  progress: Progress;
  onChange: (p: Progress) => void;
  onError: (msg: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const lv = progress.ossuary;
  const cost = ossuaryCost(lv);
  const canBuy = progress.gold >= cost && !busy;
  const tier = ossuaryTier(lv);
  const nextTier = ossuaryTier(lv + (OSSUARY.tierEvery - (lv % OSSUARY.tierEvery)));
  const toNext = OSSUARY.tierEvery - (lv % OSSUARY.tierEvery);
  const pct = ossuaryTierProgress(lv);

  const raise = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    try {
      onChange(await raiseOssuary(progress));
    } catch (e) {
      onError(e instanceof Error ? e.message : 'The stone would not take it.');
    } finally { setBusy(false); }
  }, [busy, progress, onChange, onError]);

  return (
    <>
      <p style={{ margin: '0 0 14px', fontSize: 12, color: C.boneDim, lineHeight: 1.55 }}>
        Raise your own monument. Every stone laid is one the ladder can never take back —
        and unlike the Forge, this one has <strong style={{ color: C.bone }}>no last stone</strong>.
      </p>

      <Card accent>
        <div style={{ padding: '14px 13px' }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 9, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 22, fontWeight: 900, color: C.candle }}>{tier}</span>
            <Tag tone="gold">LEVEL {lv}</Tag>
          </div>

          {/* Rütbe ilerlemesi — bir sonraki adın ne zaman geleceği görünsün */}
          <div style={{ marginTop: 11 }}>
            <div style={{
              height: 8, borderRadius: 4, overflow: 'hidden',
              background: 'rgba(255,255,255,0.07)', border: `1px solid ${C.border}`,
            }}>
              <div style={{
                width: `${Math.round(pct * 100)}%`, height: '100%',
                background: `linear-gradient(90deg, ${C.blood}, ${C.candle})`,
              }} />
            </div>
            <div style={{ fontSize: 10.5, color: C.boneFaint, marginTop: 5 }}>
              {toNext} more {toNext === 1 ? 'stone' : 'stones'} until <strong style={{ color: C.boneDim }}>{nextTier}</strong>
            </div>
          </div>

          {/* ⚠️ BTN.buy — anıt taşı GOLD ile alınıyor. Ossuary ekonominin
              tavansız sink'i; altın doku "burada gold gidiyor" der. */}
          <PixelButton
            variant={BTN.buy} scale={3}
            onClick={raise} disabled={!canBuy}
            style={{ width: '100%', marginTop: 13, fontSize: 12, fontWeight: 900, letterSpacing: 1 }}>
            {busy ? 'LAYING STONE…' : `LAY A STONE · ${cost.toLocaleString('en-US')} G`}
          </PixelButton>
        </div>

        <div style={{
          display: 'flex', gap: 14, flexWrap: 'wrap', padding: '9px 13px',
          borderTop: '1px solid rgba(255,255,255,0.08)', background: 'rgba(0,0,0,0.2)',
        }}>
          <span style={{ fontSize: 11, color: C.boneDim }}>
            GOLD <strong style={{ color: C.candle }}>{Math.floor(progress.gold).toLocaleString('en-US')}</strong>
          </span>
          <span style={{ fontSize: 11, color: C.boneDim, marginLeft: 'auto' }}>
            BURIED HERE <strong style={{ color: C.bone }}>{ossuarySpent(lv).toLocaleString('en-US')}</strong>
          </span>
        </div>
      </Card>

      {/* Sonraki basamaklar — oyuncu neye doğru gittiğini görsün */}
      <CardSection label="THE ROAD AHEAD">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
          {[0, 1, 2, 3].map((i) => {
            const at = lv + i;
            return (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11 }}>
                <span style={{ width: 52, color: i === 0 ? C.candle : C.boneFaint, fontWeight: 900 }}>
                  L{at + 1}
                </span>
                <span style={{ flex: 1, color: C.boneDim }}>{ossuaryTier(at)}</span>
                <span style={{ color: i === 0 ? C.candle : C.boneFaint }}>
                  {ossuaryCost(at).toLocaleString('en-US')}
                </span>
              </div>
            );
          })}
        </div>
      </CardSection>

      <CardSection label="WHY THIS NEVER ENDS">
        <span style={{ fontSize: 11, color: C.boneFaint, lineHeight: 1.5 }}>
          The Forge has a last upgrade. The relic shelf has a last relic. This does not —
          each stone costs more than the one before, forever. It is where the gold you
          will still be earning a year from now is meant to go.
        </span>
      </CardSection>
    </>
  );
}
