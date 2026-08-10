'use client';
// THE BINDING — pet paneli.
//
// Panelin cevaplaması gereken dört soru var ve dördü de EKRANDA olmalı:
//   1. Bu pet ne yapıyor? (rol + sayı, "iyi bir şey" değil)
//   2. Neden alamıyorum? (kill mi eksik gold mu — sessiz düğme en kötüsü)
//   3. Yükseltirsem ne değişir? (şimdi → sonra, tek bakışta)
//   4. Hangisini taşıyorum? (yuva doluysa neyi çıkaracağım)
//
// ⚠️ "NEDEN ALAMIYORUM" SORUSU ÖZELLİKLE ÖNEMLİ. Bağlamanın İKİ koşulu var
// (kill + gold) ve bu türde alışılmadık; oyuncu gold'u yeterken düğmenin
// çalışmamasını hata sanır. Eksik olan hangisiyse O gösteriliyor.

import { useState } from 'react';
import {
  BIND, FUSE_COPIES, FUSE_GOLD, MYTHIC_CAP, PETS, SLOT2,
  bindKillsNeeded, petCap, petEffect, petLevelCost, type PetDef,
} from '@/game/pets';
import { RARITY } from '@/game/cosmetics';
import type { Progress } from '@/game/progress';
import { Card, PanelHead, Tag } from '@/components/ui/cards';
import { bindPet, upgradePet, fusePet, equipPets, buyPetSlot } from '@/lib/gameSession';
import { play } from '@/game/sfx';
import { C, FONT, glass } from '@/lib/theme';

/** Rolün oyuncuya ne yaptığı — tek cümle, oyun terimiyle */
const ROL_METNI: Record<string, { ad: string; ne: string; renk: string }> = {
  striker: { ad: 'STRIKER', ne: 'Strikes the nearest enemy', renk: C.blood },
  channeler: { ad: 'CHANNELER', ne: 'Blasts everything around it', renk: C.candle },
  warden: { ad: 'WARDEN', ne: 'Mends your wounds', renk: C.ok },
  forager: { ad: 'FORAGER', ne: 'Finds more gold, pulls it further', renk: C.ice },
};

/**
 * Rolün sayısal etkisini oyuncunun okuyabileceği hâle çevir.
 *
 * 🔴 TAM SAYIYA YUVARLANIYORDU ve ölçüldü: bir seviye ~0,56 puan ekliyor,
 * yani "şimdi → sonra" önizlemesi çoğu kartta AYNI sayıyı gösteriyordu.
 * En kötü örnek Bound Hulk'tu: 73.609 gold'luk yükseltme "32% → 32%" diyordu,
 * yani oyunun EN PAHALI alımı "hiçbir şey değişmiyor" diye okunuyordu.
 * Bir ondalık şart — kartın tek işi farkı göstermek.
 */
function etkiMetni(def: PetDef, lv: number, mythic: boolean): string {
  const e = petEffect(def, lv, mythic);
  const pct = (v: number) => `${(v * 100).toFixed(1)}%`;
  switch (def.role) {
    case 'striker': return `${pct(e.share)} of your damage every ${e.cd}s`;
    case 'channeler': return `${pct(e.share)} damage in a burst every ${e.cd}s`;
    case 'warden': return `heals ${pct(e.share)} of max health every ${e.cd}s`;
    default: return `+${pct(e.share)} gold found`;
  }
}

export function PetPanel({ progress, onChange, onError }: {
  progress: Progress;
  onChange: (p: Progress) => void;
  onError?: (m: string) => void;
}) {
  const [busy, setBusy] = useState<string | null>(null);

  const yuva = progress.petSlot2 ? 2 : 1;
  const takili = (progress.equippedPets ?? []).slice(0, yuva);
  const enDerin = Object.values(progress.depthPaid ?? {})
    .reduce((m, v) => Math.max(m, Number(v) || 0), 0);

  // ⚠️ Sunucu hatası oyuncuya ÇEVRİLİYOR. `kill_yetersiz:1850/2000` gibi bir
  // kod paneli teknik gösterirdi; ama sayıyı da kaybetmemek gerek — oyuncu
  // "ne kadar kaldı" sorusunun cevabını görmeli.
  const cevir = (kod: string): string => {
    if (kod.startsWith('kill_yetersiz')) {
      const [, oran] = kod.split(':');
      return `Not enough kills — ${oran ?? ''}`;
    }
    if (kod.startsWith('kopya_yetersiz')) {
      const [, oran] = kod.split(':');
      return `Bind it more times first — ${oran ?? ''}`;
    }
    if (kod.startsWith('derinlik_yetersiz')) {
      const [, oran] = kod.split(':');
      return `Descend deeper first — ${oran ?? ''}`;
    }
    if (kod === 'gold_yetersiz') return 'Not enough gold.';
    if (kod === 'tavan') return 'Already at its ceiling.';
    if (kod === 'zaten_mythic') return 'Already mythic.';
    if (kod === 'max_kopya') return 'It cannot be bound again.';
    return 'The binding failed — try again.';
  };

  const calistir = (anahtar: string, ses: 'buy' | 'equip', f: () => Promise<Progress>) => {
    if (busy) return;
    setBusy(anahtar);
    play(ses);
    f().then(onChange)
      .catch((e: { message?: string }) => onError?.(cevir(String(e?.message ?? ''))))
      .finally(() => setBusy(null));
  };

  return (
    <>
      <PanelHead
        kicker="THE BINDING" accent={C.ice}
        title="What you killed, kept"
        sub={<>Bind the dead and they follow you down. Binding costs gold <b>and</b> proof —
          you must have killed enough of that kind. Levels are bought; <b>mythic is earned</b>.</>}
      />

      {/* Cüzdan + yuva durumu */}
      <div style={{
        ...glass(10), padding: '9px 12px', marginBottom: 10, fontFamily: FONT.ui,
        display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap',
      }}>
        <span style={{ fontSize: 17, fontWeight: 900, color: C.candle }}>
          {Math.floor(progress.gold).toLocaleString('en-US')} GOLD
        </span>
        <span style={{ fontSize: 10.5, color: C.boneFaint, textAlign: 'right' }}>
          {takili.length}/{yuva} carried
          {!progress.petSlot2 && ` · second slot at depth ${SLOT2.depth}`}
        </span>
      </div>

      {/* İkinci yuva — koşulu ve bedeli açıkça */}
      {!progress.petSlot2 && (
        <div style={{
          ...glass(10), padding: '9px 12px', marginBottom: 10, fontFamily: FONT.ui,
          display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap',
        }}>
          <span style={{ fontSize: 11, color: C.boneDim }}>
            A second collar — carry two at once.
            <span style={{ color: C.boneFaint }}> Depth {enDerin}/{SLOT2.depth}</span>
          </span>
          <button
            disabled={enDerin < SLOT2.depth || progress.gold < SLOT2.gold || busy !== null}
            onClick={() => calistir('slot', 'buy', buyPetSlot)}
            style={{
              all: 'unset', cursor: enDerin >= SLOT2.depth && progress.gold >= SLOT2.gold ? 'pointer' : 'not-allowed',
              padding: '5px 12px', borderRadius: 6, fontSize: 11, fontWeight: 900,
              background: enDerin >= SLOT2.depth && progress.gold >= SLOT2.gold ? C.candle : 'rgba(255,255,255,0.06)',
              color: enDerin >= SLOT2.depth && progress.gold >= SLOT2.gold ? '#1a0508' : C.boneFaint,
            }}>
            {SLOT2.gold.toLocaleString('en-US')} G
          </button>
        </div>
      )}

      {PETS.map((def) => {
        const kopya = progress.pets?.[def.id] ?? 0;
        const bagli = kopya > 0;
        const mythic = (progress.petFused ?? []).includes(def.id);
        const lv = Math.max(0, Math.floor(progress.petLevels?.[def.id] ?? 0));
        const tavan = petCap(def, mythic);
        const kill = progress.kills?.[def.bindsFrom] ?? 0;
        const gerekenKill = bindKillsNeeded(def, kopya);
        const bindGold = BIND[def.rarity].gold;
        const rol = ROL_METNI[def.role];
        const rar = RARITY[def.rarity];
        const takiliMi = takili.includes(def.id);

        const yukseltmeBedeli = lv < tavan ? petLevelCost(def, lv, mythic) : Infinity;
        const fuseHazir = def.rarity === 'legendary' && !mythic && kopya >= FUSE_COPIES;

        return (
          <Card key={def.id} accent={mythic}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
              <div style={{ minWidth: 190 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 13, fontWeight: 900, color: C.bone }}>{def.name}</span>
                  {/* ⚠️ NADİRLİK ROZETİ `Tag` DEĞİL — `Tag`in beş sabit tonu var ve
                      hiçbiri `cosmetics.ts` RARITY paletiyle örtüşmüyor. Rozeti
                      Tag'e sığdırmak, oyunun geri kalanında kullanılan nadirlik
                      renklerini pet panelinde KAYBETMEK olurdu.
                      ⚠️ MYTHIC bir nadirlik DEĞİL, füzyondan geçmiş legendary'nin
                      DURUMU (bkz. pets.ts) — o yüzden ayrı renkte gösteriliyor. */}
                  <span
                    title={mythic ? 'Fused — the ceiling is higher' : undefined}
                    style={{
                      fontSize: 9, fontWeight: 900, letterSpacing: 0.8, padding: '2px 6px',
                      borderRadius: 4, color: mythic ? C.candle : rar.color,
                      border: `1px solid ${mythic ? C.candle : rar.color}55`,
                      background: `${mythic ? C.candle : rar.color}18`,
                    }}>
                    {mythic ? 'MYTHIC' : rar.label}
                  </span>
                  <Tag tone="dim">{rol.ad}</Tag>
                  {takiliMi && <Tag tone="ok">CARRIED</Tag>}
                </div>
                <div style={{ fontSize: 10.5, color: C.boneFaint, marginTop: 3 }}>{def.blurb}</div>
                <div style={{ fontSize: 11, color: rol.renk, marginTop: 4 }}>{rol.ne}</div>
              </div>

              <div style={{ textAlign: 'right', minWidth: 150, fontFamily: FONT.ui }}>
                {!bagli ? (
                  <>
                    {/* ⚠️ NEDEN ALAMIYORUM — eksik olan koşul gösteriliyor.
                        İkisi de eksikse önce kill yazılıyor: gold sonradan
                        toplanabilir, kill oynamayı gerektirir. */}
                    <div style={{ fontSize: 10.5, color: kill >= gerekenKill ? C.ok : C.boneFaint }}>
                      {kill.toLocaleString('en-US')} / {gerekenKill.toLocaleString('en-US')} slain
                    </div>
                    <button
                      disabled={kill < gerekenKill || progress.gold < bindGold || busy !== null}
                      onClick={() => calistir(def.id, 'buy', () => bindPet(def.id))}
                      style={{
                        all: 'unset', marginTop: 5, padding: '5px 12px', borderRadius: 6,
                        fontSize: 11, fontWeight: 900,
                        cursor: kill >= gerekenKill && progress.gold >= bindGold ? 'pointer' : 'not-allowed',
                        background: kill >= gerekenKill && progress.gold >= bindGold ? C.ice : 'rgba(255,255,255,0.06)',
                        color: kill >= gerekenKill && progress.gold >= bindGold ? '#0d0b12' : C.boneFaint,
                      }}>
                      BIND · {bindGold.toLocaleString('en-US')} G
                    </button>
                  </>
                ) : (
                  <>
                    <div style={{ fontSize: 10.5, color: C.boneFaint }}>
                      LV {lv}/{tavan}{kopya > 1 ? ` · ${kopya}/${FUSE_COPIES} copies` : ''}
                    </div>
                    {/* ⚠️ ŞİMDİ → SONRA. Sadece "yükselt" demek, oyuncuya neyi
                        satın aldığını söylemiyor; kartın işi tam olarak bu. */}
                    <div style={{ fontSize: 11, color: C.bone, marginTop: 2 }}>
                      {etkiMetni(def, lv, mythic)}
                    </div>
                    {lv < tavan && (
                      <div style={{ fontSize: 10, color: C.ok, marginTop: 1 }}>
                        → {etkiMetni(def, lv + 1, mythic)}
                      </div>
                    )}

                    <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end', marginTop: 6, flexWrap: 'wrap' }}>
                      <button
                        disabled={lv >= tavan || progress.gold < yukseltmeBedeli || busy !== null}
                        onClick={() => calistir(def.id, 'buy', () => upgradePet(def.id))}
                        style={{
                          all: 'unset', padding: '5px 10px', borderRadius: 6, fontSize: 11, fontWeight: 900,
                          cursor: lv < tavan && progress.gold >= yukseltmeBedeli ? 'pointer' : 'not-allowed',
                          background: lv < tavan && progress.gold >= yukseltmeBedeli ? C.candle : 'rgba(255,255,255,0.06)',
                          color: lv < tavan && progress.gold >= yukseltmeBedeli ? '#1a0508' : C.boneFaint,
                        }}>
                        {lv >= tavan ? 'MAX' : `LV ${lv + 1} · ${yukseltmeBedeli.toLocaleString('en-US')} G`}
                      </button>

                      {def.rarity === 'legendary' && !mythic && (
                        <button
                          disabled={!fuseHazir || progress.gold < FUSE_GOLD || busy !== null}
                          onClick={() => calistir(def.id, 'buy', () => fusePet(def.id))}
                          title={`Needs ${FUSE_COPIES} copies — bind it again to gather them`}
                          style={{
                            all: 'unset', padding: '5px 10px', borderRadius: 6, fontSize: 11, fontWeight: 900,
                            cursor: fuseHazir && progress.gold >= FUSE_GOLD ? 'pointer' : 'not-allowed',
                            background: fuseHazir && progress.gold >= FUSE_GOLD ? C.blood : 'rgba(255,255,255,0.06)',
                            color: fuseHazir && progress.gold >= FUSE_GOLD ? C.bone : C.boneFaint,
                          }}>
                          FUSE → LV{MYTHIC_CAP}
                        </button>
                      )}

                      {/* Bir kopya daha — füzyon malzemesi */}
                      {def.rarity === 'legendary' && !mythic && kopya < FUSE_COPIES && (
                        <button
                          disabled={kill < gerekenKill || progress.gold < bindGold || busy !== null}
                          onClick={() => calistir(def.id, 'buy', () => bindPet(def.id))}
                          title={`${kill.toLocaleString('en-US')} / ${gerekenKill.toLocaleString('en-US')} slain`}
                          style={{
                            all: 'unset', padding: '5px 10px', borderRadius: 6, fontSize: 11, fontWeight: 900,
                            cursor: kill >= gerekenKill && progress.gold >= bindGold ? 'pointer' : 'not-allowed',
                            background: 'rgba(255,255,255,0.06)',
                            color: kill >= gerekenKill && progress.gold >= bindGold ? C.ice : C.boneFaint,
                          }}>
                          +1 COPY
                        </button>
                      )}

                      <button
                        disabled={busy !== null}
                        onClick={() => calistir(def.id, 'equip', () => equipPets(
                          takiliMi ? takili.filter((x) => x !== def.id)
                            // ⚠️ Yuva doluysa EN ESKİ çıkar. "Yer yok" deyip
                            // reddetmek, oyuncuyu önce çıkarmaya zorlar ve iki
                            // tıklık bir işi dört tıka çevirirdi.
                            : [...takili, def.id].slice(-yuva),
                        ))}
                        style={{
                          all: 'unset', padding: '5px 10px', borderRadius: 6, fontSize: 11, fontWeight: 900,
                          cursor: 'pointer',
                          background: takiliMi ? C.ok : 'rgba(255,255,255,0.06)',
                          color: takiliMi ? '#0d0b12' : C.bone,
                        }}>
                        {takiliMi ? 'CARRIED' : 'CARRY'}
                      </button>
                    </div>
                  </>
                )}
              </div>
            </div>
          </Card>
        );
      })}
    </>
  );
}
