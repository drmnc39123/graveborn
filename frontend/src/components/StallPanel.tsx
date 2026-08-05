'use client';
// PEDLAR'S STALL — koşuya taşınan tılsımlar.
//
// Ekonominin İKİNCİ gold sink'i. Forge kalıcı güç satar ve er geç dolar;
// burada satılanlar her koşuda yanar, yani musluk hiç kapanmaz.
//
// ⚠️ Tılsım koşu AÇILIRKEN tüketilir. Panelde bunu açıkça yazmak zorundayız:
// oyuncu "aldım ama gitti" demeden önce niye gittiğini bilmeli.

import { useState } from 'react';
import { CHARMS, CHARM_SLOTS, charmById, type CharmDef } from '@/game/charms';
import type { Progress } from '@/game/progress';
import { Card, PanelHead, Tag } from '@/components/ui/cards';
import { buyCharm } from '@/lib/gameSession';
import { play } from '@/game/sfx';
import { C, FONT, glass } from '@/lib/theme';

export function StallPanel({ progress, onChange }: {
  progress: Progress;
  onChange: (p: Progress) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const dolu = progress.charms.length >= CHARM_SLOTS;

  const buy = (c: CharmDef) => {
    if (dolu || progress.gold < c.cost || busy) return;
    setErr(null); setBusy(true);
    play('buy');
    buyCharm(c.id, progress, c.cost)
      .then(onChange)
      .catch(() => setErr('The pedlar turned you away — try again.'))
      .finally(() => setBusy(false));
  };

  return (
    <>
      <PanelHead
        kicker="THE PEDLAR'S STALL" accent={C.ok}
        title="Carried, not kept"
        sub={<>Charms burn on the run you take them into — win or lose. Permanent power is the
          Forge&apos;s business; this is what you carry down with you.</>}
      />

      {/* Cüzdan + taşınan tılsımlar */}
      <div style={{
        ...glass(10), padding: '9px 12px', marginBottom: 10, fontFamily: FONT.ui,
        display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap',
      }}>
        <span style={{ fontSize: 17, fontWeight: 900, color: C.candle }}>
          {Math.floor(progress.gold).toLocaleString('en-US')} GOLD
        </span>
        <span style={{ fontSize: 10.5, color: C.boneFaint, textAlign: 'right' }}>
          {progress.charms.length}/{CHARM_SLOTS} charms carried
        </span>
      </div>

      {/* Taşınanlar — ne aldığı ve ne zaman yanacağı görünür olmalı */}
      {progress.charms.length > 0 && (
        <div style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 10.5, fontWeight: 900, letterSpacing: 1.5, color: C.boneFaint, marginBottom: 6 }}>
            CARRIED INTO YOUR NEXT RUN
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {progress.charms.map((id, i) => {
              const c = charmById(id);
              if (!c) return null;
              return (
                <Card key={`${id}-${i}`} accent>
                  <div style={{ padding: '9px 11px', display: 'flex', alignItems: 'center', gap: 9 }}>
                    <span style={{ fontSize: 13, fontWeight: 900, color: C.candle }}>{c.name}</span>
                    <span style={{ fontSize: 11, color: C.boneDim }}>{c.desc}</span>
                    <span style={{ marginLeft: 'auto' }}><Tag tone="blood">BURNS ON ENTRY</Tag></span>
                  </div>
                </Card>
              );
            })}
          </div>
        </div>
      )}

      {dolu && (
        <div style={{
          ...glass(10), padding: '9px 11px', marginBottom: 10,
          border: `1px solid ${C.candle}44`, fontSize: 11.5, color: C.boneDim, lineHeight: 1.5,
        }}>
          Both hands full. Take a run to spend what you carry.
        </div>
      )}

      <div style={{ fontSize: 10.5, fontWeight: 900, letterSpacing: 1.5, color: C.boneFaint, marginBottom: 6 }}>
        ON THE COUNTER
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
        {CHARMS.map((c) => {
          const parasiVar = progress.gold >= c.cost;
          const can = !dolu && parasiVar && !busy;
          const eksik = c.cost - Math.floor(progress.gold);
          return (
            <Card key={c.id} dim={dolu}>
              <div style={{ padding: '11px 12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 900, fontSize: 14, color: C.bone }}>{c.name}</div>
                  <div style={{ fontSize: 11.5, color: C.boneDim, marginTop: 3 }}>{c.desc}</div>
                  {!dolu && !parasiVar && (
                    <div style={{ fontSize: 10.5, color: C.bad, marginTop: 5 }}>
                      {eksik.toLocaleString('en-US')} more gold needed
                    </div>
                  )}
                </div>
                <button onClick={() => buy(c)} disabled={!can}
                  style={{
                    flexShrink: 0, minWidth: 92, padding: '9px 12px', borderRadius: 9, border: 'none',
                    cursor: can ? 'pointer' : 'default', fontWeight: 900, fontSize: 12.5,
                    color: can ? '#1a0508' : C.boneFaint,
                    background: can ? `linear-gradient(180deg, ${C.candleSoft}, ${C.candle})` : 'rgba(255,255,255,0.06)',
                    boxShadow: can ? `0 3px 12px ${C.candle}44` : 'none',
                  }}>
                  {c.cost.toLocaleString('en-US')} G
                </button>
              </div>
            </Card>
          );
        })}
      </div>

      {err && (
        <div style={{
          marginTop: 10, padding: '9px 11px', borderRadius: 9,
          border: `1px solid ${C.blood}66`, background: 'rgba(120,20,30,0.18)',
          fontSize: 12, color: C.bone,
        }}>
          {err}
        </div>
      )}
    </>
  );
}
