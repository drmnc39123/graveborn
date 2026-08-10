'use client';
// HAFTALIK ORTAK BOSS — giriş odası.
//
// Kullanıcının tarifi: "ortak özel bir map, haftalık BOSS, oyuncular girsin,
// hasara göre sıralama olsun".
//
// ⚠️ AŞAMA 1: ASENKRON. Herkes kendi koşusunda vuruyor, ortak can sunucuda
// düşüyor, hasar tablosu canlı. Oyuncuların birbirini AYNI ANDA görmesi
// (aşama 2) `ws` gerektiriyor; değerin büyük kısmı zaten burada ve risk çok
// daha düşük. Panelde bunu oyuncuya da söylüyoruz — "aynı anda göreceksin"
// sözü verip vermemek en kolay güven kaybı olurdu.

import { useCallback, useEffect, useState } from 'react';
import { BTN, PixelButton } from '@/components/ui/kit';
import { BOSS_RUN_SEC, bossProgress } from '@/game/worldBoss';
import { fetchWorldBoss, worldBossAvailable, type BossState } from '@/lib/gameSession';
import { Card, CardSection, PanelHead, Tag } from '@/components/ui/cards';
import { C } from '@/lib/theme';

const short = (w: string) => `${w.slice(0, 4)}…${w.slice(-4)}`;
const big = (n: number) => n.toLocaleString('en-US');

function remaining(endsAt: number): string {
  const ms = endsAt - Date.now();
  if (ms <= 0) return 'ending';
  const h = Math.floor(ms / 3600_000);
  if (h >= 24) return `${Math.floor(h / 24)}d ${h % 24}h`;
  return `${h}h ${Math.floor((ms % 3600_000) / 60_000)}m`;
}

export function WorldBossPanel({ onEnter }: { onEnter: () => void }) {
  const [state, setState] = useState<BossState | null>(null);
  const [err, setErr] = useState<string | null>(null);

  // ⚠️ İZLEMEK SERBEST, GİRMEK CÜZDANLI. Demo oyuncusuna boss'u hiç
  // göstermemek, katılmak için en güçlü sebebi saklamak olurdu. Hata sadece
  // sunucuya ulaşılamadığında görünür.
  useEffect(() => {
    fetchWorldBoss()
      .then(setState)
      .catch(() => setErr('The barrow does not answer. The server may be down.'));
  }, []);

  const canEnter = worldBossAvailable();
  const enter = useCallback(() => { onEnter(); }, [onEnter]);

  if (err) {
    return (
      <>
        <PanelHead kicker="THE SHARED BARROW" accent={C.blood} title="One grave, everyone" />
        <p style={{ margin: 0, fontSize: 12, color: C.boneFaint, lineHeight: 1.6 }}>{err}</p>
      </>
    );
  }
  if (!state) {
    return <p style={{ margin: 0, fontSize: 12, color: C.boneFaint }}>Listening at the door…</p>;
  }

  const pct = bossProgress(state.hp, state.maxHp);

  return (
    <>
      <PanelHead kicker="THE SHARED BARROW" accent={C.blood} title={state.name} />
      <p style={{ margin: '0 0 14px', fontSize: 12, color: C.boneDim, lineHeight: 1.55, fontStyle: 'italic' }}>
        {state.epithet}
      </p>

      <Card accent={!state.defeated}>
        <div style={{ padding: '14px 13px' }}>
          {/* ── ORTAK CAN ── */}
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 10, fontWeight: 900, letterSpacing: 1.2, color: C.boneFaint }}>
              SHARED HEALTH
            </span>
            <span style={{ marginLeft: 'auto', fontSize: 11, color: C.boneDim }}>
              {remaining(state.endsAt)} left this week
            </span>
          </div>
          <div style={{
            height: 16, borderRadius: 8, overflow: 'hidden', marginTop: 7,
            background: 'rgba(0,0,0,0.42)', border: `1px solid ${C.border}`,
          }}>
            <div style={{
              width: `${Math.round((1 - pct) * 100)}%`, height: '100%',
              background: `linear-gradient(90deg, ${C.blood}, ${C.bloodSoft})`,
              transition: 'width 0.4s ease',
            }} />
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 6, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 12, fontWeight: 800, color: C.bone }}>
              {big(state.hp)} <span style={{ color: C.boneFaint, fontWeight: 400 }}>/ {big(state.maxHp)}</span>
            </span>
            <span style={{ marginLeft: 'auto', fontSize: 12, fontWeight: 900, color: C.candle }}>
              {(pct * 100).toFixed(1)}% down
            </span>
          </div>

          {/* ⚠️ Bir oyuncunun tek başına deviremeyeceği kadar can var ve bunu
              söylüyoruz — "neden bitiremiyorum" hissi yerine "birlikte
              indiriyoruz" hissi. */}
          <p style={{ margin: '11px 0 0', fontSize: 11, color: C.boneFaint, lineHeight: 1.5 }}>
            No one takes this down alone. Every hit anyone lands comes off the same
            pool — and the barrow seals when the week turns, finished or not.
          </p>

          {state.me && (
            <div style={{
              marginTop: 11, padding: '9px 11px', borderRadius: 7,
              background: 'rgba(239,167,46,0.10)', border: `1px solid ${C.candle}44`,
              display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap',
            }}>
              <Tag tone="gold">#{state.me.rank}</Tag>
              <span style={{ fontSize: 12, color: C.bone }}>
                You have dealt <strong style={{ color: C.candle }}>{big(state.me.damage)}</strong>
              </span>
            </div>
          )}

          {(() => {
            const kapali = state.defeated || !canEnter;
            return (
              <PixelButton variant={BTN.strong} scale={3} onClick={enter} disabled={kapali}
                style={{ fontSize: 13, fontWeight: 900, letterSpacing: 1, minWidth: 0, padding: '0 18px' }}>
                ENTER THE ROOM
              </PixelButton>
            );
          })()}
          {/* ⚠️ Demo oyuncusu NEDEN giremediğini bilmeli — sadece soluk bir
              düğme göstermek "bozuk" hissettirir. */}
          {!canEnter && !state.defeated && (
            <div style={{ fontSize: 10.5, color: C.boneFaint, marginTop: 6, lineHeight: 1.45 }}>
              The shared pool is one number for everyone, so it only counts damage from
              wallet-backed runs. Demo progress never touches it.
            </div>
          )}
        </div>
      </Card>

      {/* ── HASAR TABLOSU ── */}
      <div style={{ margin: '16px 0 8px', fontSize: 11, fontWeight: 900, letterSpacing: 1.6, color: C.boneFaint }}>
        WHO IS HITTING HARDEST
      </div>
      {state.top.length === 0 ? (
        <p style={{ margin: 0, fontSize: 11.5, color: C.boneFaint, lineHeight: 1.5 }}>
          Nobody has touched it yet this week. The first mark is still open.
        </p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
          {state.top.map((r, i) => {
            const mine = state.me !== null && r.damage === state.me.damage && i + 1 === state.me.rank;
            return (
              <Card key={r.wallet} accent={mine}>
                <div style={{ padding: '7px 11px', display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ width: 28, flexShrink: 0, fontSize: 12, fontWeight: 900,
                    color: i === 0 ? C.candle : i < 3 ? C.bone : C.boneFaint }}>#{i + 1}</span>
                  <span style={{ flex: 1, minWidth: 0, fontSize: 11.5, color: C.boneDim,
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {mine ? 'You' : short(r.wallet)}
                  </span>
                  <span style={{ fontSize: 12, fontWeight: 800, color: C.candle }}>{big(r.damage)}</span>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      <CardSection label="WHAT THIS PAYS">
        <span style={{ fontSize: 11, color: C.boneFaint, lineHeight: 1.5 }}>
          Dust and marks of the barrow — never gold. Damage is the one number the
          server cannot fully re-check, so nothing here is allowed to touch the
          economy everyone else is digging in.
        </span>
      </CardSection>

      {/* ⚠️ Burada eskiden "yapılıyor" yazıyordu — söz verilmişti, tutuldu.
          Oyuncuya olmayan bir şeyi var göstermek kadar, olanı gizlemek de
          yanlış: canlı görünürlük artık çalışıyor ve sınırı da yazılı. */}
      <CardSection label="WHO ELSE IS IN THERE">
        <span style={{ fontSize: 11, color: C.boneFaint, lineHeight: 1.5 }}>
          You will see the others moving in the room with you, in real time. They cannot
          touch you and you cannot touch them — everyone fights the same wound alone,
          together. If the connection drops, the run carries on as normal.
        </span>
      </CardSection>
    </>
  );
}
