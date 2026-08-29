'use client';
// THE FORGE — kalıcı yükseltme dükkânı.
//
// Gold'un tek harcama yeri (şimdilik). Bölüm bitirip gold kazanmanın
// karşılığı burada: sonraki run'lar kalıcı olarak güçlenir.

import { useMemo } from 'react';
import { FORGE, costOf, effectText, spentOn, spentOnOne, type ForgeUpgrade } from '@/game/forge';
import { Card, PanelHead, Tag } from '@/components/ui/cards';
import { BTN, Icon, IconText, PixelButton } from '@/components/ui/kit';
import { statIcon } from '@/lib/icons';
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
    play('buy');
    // Cüzdan modunda fiyatı ve bakiyeyi SUNUCU doğrular; demo modunda
    // yerel kayda yazılır. Ayrımı gameSession yapar, panel bilmez.
    buyUpgrade(u.id, progress, cost)
      .then(onChange)
      .catch(() => onError?.('The upgrade could not be bought.'));
  };

  return (
    <>
      <PanelHead
        kicker="THE FORGE" accent={C.candle}
        title="Permanent power"
        sub="Bought once, kept forever. Every run after this starts stronger — even the ones you lose."
      />

      {/* Cüzdan + ilerleme. Artık "bütçe" yok — gold sonsuz akıyor, ağaç doymuyor. */}
      <div style={{ ...glass(10), padding: '9px 12px', marginBottom: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <IconText name="gold" style={{ fontSize: 17, fontWeight: 900, color: C.candle }}>
          {/* ⚠️ BINLIK AYRAC: "615533 GOLD" okunmuyor. Panelin geri kalani
              zaten toLocaleString kullaniyordu, burasi ve MarketPanel unutulmustu. */}
          {Math.floor(progress.gold).toLocaleString('en-US')} GOLD
        </IconText>
        <span style={{ fontSize: 10.5, color: C.boneFaint, textAlign: 'right' }}>
          {levels}/{maxLevels} levels forged<br />
          {spent.toLocaleString('en-US')} gold spent here
        </span>
      </div>

      {/* ⚠️ İKİ SÜTUN — 16 yükseltme tek sütunda uzun bir kaydırma yapıyordu
          ve kartların sağı boştu (ad/açıklama solda, satın alma düğmesi ta
          sağda). Panel genişledi diye içerik esnetilmez; genişlik yeni bir
          sütuna dönüşür. Reliquary ve Binding'de aynı düzeltme yapıldı.
          ⚠️ `minmax(380px)` — kart içeriği (ad + LV + NOW→NEXT + seviye
          boncukları + fiyat düğmesi) bunun altında sıkışır.
          ⚠️ `min(380px, 100%)` — ÇIPLAK `380px` YAZMA. ÖLÇÜLDÜ: 375 px'lik
          telefonda panel içerik alanı **227 px**, ızgara ise **380 px**
          kalıyordu — 153 px taşma. `minmax` alt sınırı SERT bir tabandır;
          sadece sütun SAYISI 1'e düşer, genişliği düşmez. Fiyat düğmesi
          kartın sağında olduğu için telefonda SATIN ALMA DÜĞMESİ EKRAN
          DIŞINDA kalıyordu. */}
      <div style={{
        display: 'grid', gap: 7,
        gridTemplateColumns: 'repeat(auto-fill, minmax(min(380px, 100%), 1fr))',
        alignItems: 'start',
      }}>
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
                      <Icon name={statIcon(u.stat)} scale={1} title={u.stat} />
                      <span style={{ fontWeight: 900, fontSize: 14.5, color: C.bone }}>{u.name}</span>
                      {maxed ? <Tag tone="gold">MAX</Tag> : <Tag>LV {lv}/{u.maxLevel}</Tag>}
                    </div>
                    <div style={{ fontSize: 11.5, color: C.boneDim, marginTop: 3 }}>{u.desc} per level</div>
                  </div>

                  {/* ⚠️ Franuka dokusu — düz gradyan bir dikdörtgen "düğme gibi"
                      durmuyordu. Altın varyantı (BTN.buy) gold harcayan her yerde aynı:
                      oyuncu okumadan önce ne olduğunu bilsin. */}
                  <PixelButton
                    variant={BTN.buy} scale={2}
                    onClick={() => buy(u)} disabled={!can}
                    style={{ flexShrink: 0, fontSize: 11.5, fontWeight: 900, minWidth: 0, padding: '0 10px' }}>
                    {maxed ? 'MAX' : `${cost.toLocaleString('en-US')} G`}
                  </PixelButton>
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
                  <div style={{ fontSize: 10.5, color: C.badText, marginTop: 7 }}>
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
