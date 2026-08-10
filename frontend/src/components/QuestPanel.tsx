'use client';
// GÜNLÜK GÖREVLER — arayüz.
//
// ⚠️ ÜÇ GÖREV, TEK EKRAN, KAYDIRMA YOK. Günlük görev listesi uzarsa
// "bugün ne yapmalıyım" sorusu bir okuma işine dönüşür ve tam da o an
// oyuncu paneli kapatır.
//
// ⚠️ İLERLEME ÇUBUĞU SAYIYLA BİRLİKTE. "2/4" görmek, dolmakta olan bir
// çubuktan çok daha net: oyuncu kaç koşu daha gerektiğini hesaplamak
// zorunda kalmamalı.

import { useCallback, useEffect, useState } from 'react';
import { BTN, PixelButton } from '@/components/ui/kit';
import { QUESTS } from '@/game/quests';
import type { Progress } from '@/game/progress';
import { claimQuest, fetchQuests, type QuestState } from '@/lib/gameSession';
import { getMode } from '@/lib/session';
import { CardSection, PanelHead } from '@/components/ui/cards';
import { C, FONT, glass } from '@/lib/theme';

export function QuestPanel({ onChange, onError }: {
  progress: Progress;
  onChange: (p: Progress) => void;
  onError: (msg: string) => void;
}) {
  const [st, setSt] = useState<QuestState | null>(null);
  const [err, setErr] = useState(false);
  const [busy, setBusy] = useState(false);

  const yukle = useCallback(() => {
    fetchQuests().then(setSt).catch(() => setErr(true));
  }, []);
  useEffect(() => { if (getMode() === 'wallet') yukle(); }, [yukle]);

  if (getMode() !== 'wallet') {
    return (
      <PanelHead kicker="TODAY" title="Three things, every day" accent={C.candle}
        sub="Daily work is tracked on the server from what you actually did. Connect a wallet to be given any." />
    );
  }
  if (err) return <Note>Could not read today&apos;s work.</Note>;
  if (!st) return <Note>Reading the day…</Note>;

  const al = async (id: string) => {
    if (busy) return;
    setBusy(true);
    try {
      const r = await claimQuest(id);
      setSt(r.view);
      onChange(r.progress);
    } catch (e) {
      onError(e instanceof Error ? e.message : 'Could not claim it.');
      yukle();
    } finally { setBusy(false); }
  };

  const alinan = st.quests.filter((q) => q.claimed).length;

  return (
    <>
      <PanelHead kicker="TODAY" title="Three things, every day" accent={C.candle}
        sub="Reset at midnight UTC. Progress comes from what the server saw you do — nothing here is claimed on your word."
        right={<span style={{ fontSize: 12, fontWeight: 900, color: C.candle }}>{alinan}/{QUESTS.perDay}</span>} />

      <CardSection label="Today's work" tone={C.candle}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {st.quests.map((q) => {
            const pct = Math.min(100, Math.round((q.progress / q.goal) * 100));
            return (
              <div key={q.id} style={{
                padding: '9px 11px', borderRadius: 8, fontFamily: FONT.ui,
                border: `1px solid ${q.claimed ? 'rgba(255,255,255,0.08)' : q.done ? `${C.candle}77` : 'rgba(255,255,255,0.10)'}`,
                background: q.done && !q.claimed
                  ? 'linear-gradient(180deg, rgba(239,167,46,0.15), rgba(0,0,0,0.30))'
                  : 'linear-gradient(180deg, rgba(255,255,255,0.035), rgba(0,0,0,0.26))',
                opacity: q.claimed ? 0.55 : 1,
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                  <span style={{ flex: 1, minWidth: 0, fontSize: 12, fontWeight: 900,
                    color: q.claimed ? C.boneFaint : C.bone,
                    textDecoration: q.claimed ? 'line-through' : 'none' }}>
                    {q.text}
                  </span>
                  {/* ⚠️ SAYI ÇUBUKLA BİRLİKTE — "2/4" hesap yaptırmıyor */}
                  <span style={{ fontSize: 11, color: C.boneFaint, fontVariantNumeric: 'tabular-nums' }}>
                    {q.progress}/{q.goal}
                  </span>
                  {q.claimed ? (
                    <span style={{ fontSize: 11, fontWeight: 900, color: C.ok }}>✓</span>
                  ) : (
                    {/* ⚠️ BTN.action — ödül TOZ, gold değil. Altın doku
                        "gold harcıyorsun/kazanıyorsun" demek; toz ayrı bir para ve
                        onu altın göstermek iki ekonomiyi karıştırırdı. */}
                    <PixelButton
                      variant={BTN.action} scale={2} active={q.done}
                      onClick={() => (q.done ? al(q.id) : undefined)}
                      disabled={!q.done || busy}
                      style={{ fontSize: 11, fontWeight: 900, minWidth: 0, padding: '0 10px' }}>
                      +{q.dust}
                    </PixelButton>
                  )}
                </div>
                {!q.claimed && (
                  <div style={{ height: 5, borderRadius: 3, marginTop: 6, overflow: 'hidden',
                    background: 'rgba(0,0,0,0.45)' }}>
                    <div style={{ width: `${pct}%`, height: '100%',
                      background: q.done ? C.candle : C.ice }} />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </CardSection>

      {/* ── BONUS ──
          ⚠️ Üçünün de ALINMASINA bağlı, sadece bitmesine değil: yoksa
          oyuncu bonusu alıp tek tek ödülleri almayı unutabilirdi. */}
      <div style={{
        ...glass(10), padding: '11px 13px', fontFamily: FONT.ui,
        display: 'flex', alignItems: 'center', gap: 10,
      }}>
        <span style={{ flex: 1, minWidth: 0 }}>
          <span style={{ display: 'block', fontSize: 11.5, fontWeight: 900, color: C.bone }}>
            All three
          </span>
          <span style={{ display: 'block', fontSize: 11, color: C.boneFaint }}>
            {st.bonus.claimed ? 'Taken. Come back tomorrow.'
              : st.bonus.ready ? 'Everything is done — take it.'
              : 'Claim all three to open this.'}
          </span>
        </span>
        <button
          onClick={() => (st.bonus.ready && !st.bonus.claimed ? al('__bonus') : undefined)}
          disabled={!st.bonus.ready || st.bonus.claimed || busy}
          style={{
            all: 'unset', cursor: st.bonus.ready && !st.bonus.claimed ? 'pointer' : 'default',
            padding: '7px 13px', borderRadius: 7, fontSize: 12, fontWeight: 900,
            color: st.bonus.ready && !st.bonus.claimed ? '#1a0508' : C.boneFaint,
            background: st.bonus.ready && !st.bonus.claimed
              ? `linear-gradient(180deg, ${C.candleSoft}, ${C.candle})`
              : 'rgba(227,216,192,0.07)',
          }}>
          {st.bonus.claimed ? '✓' : `+${st.bonus.dust}`}
        </button>
      </div>

      <div style={{ marginTop: 10, fontSize: 11, color: C.boneFaint, lineHeight: 1.55 }}>
        Daily work pays dust, never gold — the same rule the wager, the barrow
        and the ladder follow. At most {st.ceiling} dust a day.
        {' '}Harder work appears as you go deeper.
      </div>
    </>
  );
}

function Note({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ ...glass(9), padding: '16px 14px', fontSize: 12, color: C.boneFaint,
      textAlign: 'center', lineHeight: 1.6, fontFamily: FONT.ui }}>
      {children}
    </div>
  );
}
