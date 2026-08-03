'use client';
// THE FORGE — kalıcı yükseltme dükkânı.
//
// Gold'un tek harcama yeri (şimdilik). Bölüm bitirip gold kazanmanın
// karşılığı burada: sonraki run'lar kalıcı olarak güçlenir.

import { useMemo } from 'react';
import { FORGE, costOf, effectText, spentOn, spentOnOne, type ForgeUpgrade } from '@/game/forge';
import { Card, Tag } from '@/components/ui/cards';
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
          // ⚠️ Eskiden kartta sadece "+5% damage" (bir SEVİYENİN etkisi) vardı.
          // Oyuncunun bilmek istediği şey o değil: şu an ne kadar güçlü ve
          // bir seviye daha alırsa ne olacak. İkisi de burada.
          const yatirim = spentOnOne(u, lv);
          const eksik = cost - Math.floor(progress.gold);

          return (
            <Card key={u.id} accent={maxed}>
              <div style={{ padding: '11px 12px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap' }}>
                      <span style={{ fontWeight: 900, fontSize: 14.5, color: C.bone }}>{u.name}</span>
                      {maxed ? <Tag tone="gold">MAX</Tag> : <Tag>LV {lv}/{u.maxLevel}</Tag>}
                    </div>
                    <div style={{ fontSize: 11.5, color: C.boneDim, marginTop: 3 }}>{u.desc} per level</div>
                  </div>

                  <button onClick={() => buy(u)} disabled={!can}
                    style={{
                      flexShrink: 0, minWidth: 96, padding: '9px 12px', borderRadius: 9, border: 'none',
                      cursor: can ? 'pointer' : 'default', fontWeight: 900, fontSize: 12.5,
                      color: maxed ? C.boneFaint : can ? '#1a0508' : C.boneFaint,
                      background: maxed ? 'rgba(255,255,255,0.06)'
                        : can ? `linear-gradient(180deg, ${C.candleSoft}, ${C.candle})`
                        : 'rgba(255,255,255,0.06)',
                      boxShadow: can ? `0 3px 12px ${C.candle}44` : 'none',
                    }}>
                    {maxed ? '✓ MAX' : `${cost.toLocaleString('en-US')} G`}
                  </button>
                </div>

                {/* Şu an → sonra. Alımın ne kazandırdığı açıkça görünsün. */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap', marginTop: 9 }}>
                  <Tag tone={lv > 0 ? 'ok' : 'dim'}>NOW {effectText(u, lv)}</Tag>
                  {!maxed && (
                    <>
                      <span style={{ color: C.boneFaint, fontSize: 11 }}>→</span>
                      <Tag tone="gold">NEXT {effectText(u, lv + 1)}</Tag>
                    </>
                  )}
                  {lv > 0 && (
                    <span style={{ marginLeft: 'auto', fontSize: 10, color: C.boneFaint }}>
                      {yatirim.toLocaleString('en-US')} gold invested
                    </span>
                  )}
                </div>

                {/* seviye çubuğu — kaç kaldığı bir bakışta görünsün */}
                <div style={{ display: 'flex', gap: 3, marginTop: 9 }}>
                  {Array.from({ length: u.maxLevel }, (_, i) => (
                    <span key={i} style={{
                      flex: 1, height: 4, borderRadius: 2,
                      background: i < lv ? C.candle : 'rgba(255,255,255,0.1)',
                      boxShadow: i < lv ? `0 0 5px ${C.candle}66` : 'none',
                    }} />
                  ))}
                </div>

                {/* Parası yetmiyorsa NE KADAR eksik olduğu yazsın — "alamıyorum"
                    tek başına bilgi değil, hedef değil. */}
                {!maxed && !can && (
                  <div style={{ fontSize: 10.5, color: C.bad, marginTop: 7 }}>
                    {eksik.toLocaleString('en-US')} more gold needed
                  </div>
                )}
              </div>
            </Card>
          );
        })}
      </div>
    </>
  );
}
