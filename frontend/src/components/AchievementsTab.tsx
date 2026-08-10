'use client';
// BAŞARIMLAR + GÜNLÜK SERİ — "yarın niye geleyim" sorusunun cevabı.
//
// ⚠️ Ödüller GOLD DEĞİL (bkz. achievements.ts). Bunu oyuncuya da söylüyoruz:
// "toz ve satın alınamayan eşya". Gold bekleyip toz gören oyuncu kandırıldığını
// düşünür; oysa karar tam tersini korumak için alındı — başarım gold verse
// Faz 2'de dengelenen musluk/sink oranı bozulurdu.

import { useCallback, useMemo, useState } from 'react';
import { BTN, PixelButton } from '@/components/ui/kit';
import { achievementStates } from '@/game/achievements';
import { cosmeticById } from '@/game/cosmetics';
import { streakReward, type Progress } from '@/game/progress';
import { claimAchievement, claimStreak, streakAvailable } from '@/lib/gameSession';
import { Card, CardSection, Tag } from '@/components/ui/cards';
import { C } from '@/lib/theme';

export function AchievementsTab({ progress, onChange, onError }: {
  progress: Progress;
  onChange: (p: Progress) => void;
  onError: (msg: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [flash, setFlash] = useState<string | null>(null);
  const states = useMemo(() => achievementStates(progress), [progress]);
  const claimable = states.filter((s) => s.claimable).length;
  const done = states.filter((s) => s.claimed).length;
  const canStreak = streakAvailable(progress);

  const takeStreak = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    try {
      const r = await claimStreak(progress);
      onChange(r.progress);
      setFlash(`Day ${r.days} — +${r.reward} dust`);
    } catch (e) {
      onError(e instanceof Error ? e.message : 'Already collected today.');
    } finally { setBusy(false); }
  }, [busy, progress, onChange, onError]);

  const take = useCallback(async (id: string) => {
    if (busy) return;
    setBusy(true);
    try { onChange(await claimAchievement(id, progress)); }
    catch (e) { onError(e instanceof Error ? e.message : 'Could not claim that.'); }
    finally { setBusy(false); }
  }, [busy, progress, onChange, onError]);

  return (
    <>
      {/* ── GÜNLÜK SERİ ── */}
      <Card accent={canStreak}>
        <div style={{ padding: '13px', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 150 }}>
            <div style={{ fontSize: 10, fontWeight: 900, letterSpacing: 1.2, color: C.boneFaint }}>
              DAILY VIGIL
            </div>
            <div style={{ fontSize: 15, fontWeight: 900, color: C.bone, marginTop: 3 }}>
              {progress.streak.days > 0
                ? `${progress.streak.days} ${progress.streak.days === 1 ? 'day' : 'days'} kept`
                : 'The vigil has not been kept'}
            </div>
            <div style={{ fontSize: 11, color: C.boneFaint, marginTop: 3, lineHeight: 1.45 }}>
              {canStreak
                ? `Light it today for ${streakReward(progress.streak.days + 1)} dust.`
                : `Come back tomorrow for ${streakReward(progress.streak.days + 1)} dust. Miss a day and it starts over.`}
            </div>
          </div>
          {/* ⚠️ BTN.action — günlük nöbet TOZ ödüyor, gold değil. Altın doku
              iki ekonomiyi karıştırırdı (aynı kural Today panelinde de var). */}
          <PixelButton
            variant={BTN.action} scale={2} active={canStreak}
            onClick={takeStreak} disabled={!canStreak || busy}
            style={{ fontSize: 11.5, fontWeight: 900, letterSpacing: 0.9, minWidth: 0, padding: '0 12px' }}>
            {canStreak ? 'LIGHT IT' : 'KEPT TODAY'}
          </PixelButton>
        </div>
        {flash && (
          <div style={{ padding: '8px 13px', borderTop: '1px solid rgba(255,255,255,0.08)',
            background: 'rgba(138,151,163,0.10)', fontSize: 11.5, color: C.ice }}>
            {flash}
          </div>
        )}
      </Card>

      <div style={{ display: 'flex', alignItems: 'baseline', gap: 9, margin: '16px 0 4px', flexWrap: 'wrap' }}>
        <span style={{ fontSize: 11, fontWeight: 900, letterSpacing: 1.6, color: C.boneFaint }}>
          DEEDS
        </span>
        <span style={{ fontSize: 11, color: C.boneDim }}>{done}/{states.length}</span>
        {claimable > 0 && <Tag tone="gold">{claimable} TO CLAIM</Tag>}
        <span style={{ marginLeft: 'auto', fontSize: 10, color: C.boneFaint }}>
          dust and unbuyable relics — never gold
        </span>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {states.map((s) => {
          const pct = Math.min(1, s.progress / s.def.goal);
          const reward = s.def.cosmetic ? cosmeticById(s.def.cosmetic) : undefined;
          return (
            <Card key={s.def.id} accent={s.claimable} dim={s.claimed}>
              <div style={{ padding: '10px 11px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 13, fontWeight: 900,
                    color: s.claimed ? C.boneFaint : C.bone }}>{s.def.name}</span>
                  {s.claimed && <Tag>CLAIMED</Tag>}
                  {reward && <Tag tone="blood">UNBUYABLE · {reward.name}</Tag>}
                  <span style={{ marginLeft: 'auto', fontSize: 11, color: C.ice }}>
                    +{s.def.dust} dust
                  </span>
                </div>
                <div style={{ fontSize: 11, color: C.boneFaint, marginTop: 3, lineHeight: 1.4 }}>
                  {s.def.desc}
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginTop: 8 }}>
                  <div style={{ flex: 1, height: 6, borderRadius: 3, overflow: 'hidden',
                    background: 'rgba(255,255,255,0.07)', border: `1px solid ${C.border}` }}>
                    <div style={{
                      width: `${Math.round(pct * 100)}%`, height: '100%',
                      background: s.done
                        ? `linear-gradient(90deg, ${C.blood}, ${C.candle})`
                        : 'rgba(184,174,152,0.45)',
                    }} />
                  </div>
                  <span style={{ fontSize: 10.5, color: C.boneFaint, width: 54, textAlign: 'right' }}>
                    {s.progress}/{s.def.goal}
                  </span>
                  {s.claimable && (
                    <PixelButton
                      variant={BTN.action} scale={2} active
                      onClick={() => take(s.def.id)} disabled={busy}
                      style={{ fontSize: 10.5, fontWeight: 900, letterSpacing: 0.8, minWidth: 0, padding: '0 8px' }}>
                      CLAIM
                    </PixelButton>
                  )}
                </div>
              </div>
            </Card>
          );
        })}
      </div>

      <CardSection label="WHY NOT GOLD">
        <span style={{ fontSize: 11, color: C.boneFaint, lineHeight: 1.5 }}>
          Deeds pay dust and relics that cannot be bought at any price. Paying gold would
          add to the pile everyone is already digging out of — and the whole point of the
          reliquary and the monument is to take gold <em>out</em>.
        </span>
      </CardSection>
    </>
  );
}
