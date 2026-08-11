'use client';
// OYUNCU KİMLİK KARTI — köyün sol üstünde, oyunun "sen kimsin" cümlesi.
//
// ⚠️ NİYE VAR: ana ekran bir navbardan ibaretti. Oyuncu köye giriyor ve
// karşısında kendisine dair TEK bir şey görmüyordu — ne adı, ne rütbesi, ne
// Reliquary'de kazandığı unvan. Kozmetikler yalnızca kendi panelinde ve
// leaderboard'da görünüyordu; `Identity.tsx`in kendi kuralı bunu zaten
// söylüyor: *"prestij GÖRÜLDÜĞÜ yerde değer kazanır"*. Bu kart o cümleyi
// köyde de doğru hâle getiriyor.
//
// ⚠️ HİÇBİR YENİ SİSTEM YAZILMADI. Rütbe `ossuary.ts`te ZATEN vardı
// (`ossuaryTier` + `ossuaryTierProgress`), portre `HeroPicker`da, kimlik
// satırı `Identity.tsx`te, çubuk `kit.tsx`te. Kart bunları bir araya
// getiriyor; ikinci bir gerçek kaynağı üretmiyor.
//
// ⚠️ İKİ AYRI EKSEN, BİLEREK:
//   RÜTBE  → Ossuary kademesi. Gold'la alınır, TAVANI YOK, güç vermez.
//            Bu bir PRESTİJ ekseni.
//   DERİNLİK → sunucunun doğruladığı en derin iniş. Bu bir BAŞARI ekseni.
// İkisini tek sayıya indirmek, parayla alınanla oynayarak kazanılanı aynı
// kefeye koymak olurdu.

import { useMemo } from 'react';
import { STAGES } from '@/game/config';
import { heroById } from '@/game/heroes';
import { ossuaryTier, ossuaryTierProgress } from '@/game/ossuary';
import { paidDepth, type Progress } from '@/game/progress';
import { nextPointAt, skillPoints } from '@/game/skills';
import { Portrait } from '@/components/HeroPicker';
import { Bar, Icon } from '@/components/ui/kit';
import { IdentityLine, identityOf } from '@/components/ui/Identity';
import { useCountUpInt } from '@/components/ui/motion';
import { C, FONT, thinGlass } from '@/lib/theme';

/** Cüzdan adresini kısalt — kart dar, kimlik için 8 hane yeter */
const short = (w: string) => `${w.slice(0, 4)}…${w.slice(-4)}`;

export function ProfileCard({ progress, wallet, onOpen }: {
  progress: Progress;
  /** cüzdan adresi — demo modunda boş */
  wallet?: string | null;
  /** karta tıklayınca açılacak panel (kayıtlar) */
  onOpen?: () => void;
}) {
  const hero = heroById(progress.hero);

  const olcum = useMemo(() => {
    // ⚠️ `paidDepth` KULLANILIYOR, iddia edilen derinlik değil: sunucunun
    // ödeme yaptığı derinlik. Skill puanlarıyla aynı kaynak — kartta başka
    // bir sayı göstermek, oyuncuya iki farklı "en derin"i öğretirdi.
    const enDerin = Math.max(0, ...STAGES.map((s) => paidDepth(progress, s.id)));
    return {
      enDerin,
      temizlenen: STAGES.filter((s) => progress.cleared[s.id]).length,
      puan: skillPoints(enDerin),
      sonraki: nextPointAt(enDerin),
    };
  }, [progress]);

  const rutbe = ossuaryTier(progress.ossuary);
  const ilerleme = ossuaryTierProgress(progress.ossuary);
  const derinlik = useCountUpInt(olcum.enDerin);

  const ad = wallet ? short(wallet) : 'You';
  const kimlik = identityOf(progress, ad);

  return (
    <div
      onClick={onOpen}
      style={{
        ...thinGlass(10),
        width: 236,
        padding: '9px 10px',
        fontFamily: FONT.ui,
        cursor: onOpen ? 'pointer' : 'default',
        // ⚠️ Kartın kendisi tıklama alıyor ama ETRAFI ALMIYOR — köy canvas'ı
        // bir OYNANIŞ ALANI; üstüne konan her kutu tıklanabilir yer yer.
        pointerEvents: 'auto',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
        {/* ⚠️ `frame={false}` — kartın kendi zemini var, portrenin ikinci bir
            çerçevesi iki iç içe kutu gibi görünürdü. */}
        <div style={{
          flexShrink: 0, width: 46, height: 46, borderRadius: 8, overflow: 'hidden',
          border: `1px solid ${C.border}`, background: 'rgba(0,0,0,0.32)',
          display: 'grid', placeItems: 'center',
        }}>
          <Portrait hero={hero} size={44} frame={false} />
        </div>

        <div style={{ minWidth: 0, flex: 1 }}>
          {/* Reliquary'den takılan unvan/levha/kupa BURADA görünüyor */}
          <IdentityLine id={kimlik} compact size={13} />
          <div style={{
            fontSize: 10, fontWeight: 900, letterSpacing: 1, color: C.candle,
            marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            {rutbe.toUpperCase()}
          </div>
        </div>
      </div>

      {/* RÜTBE İLERLEMESİ — Ossuary kademesi içindeki yol */}
      <div style={{ marginTop: 7 }}>
        <Bar pct={ilerleme} variant="01" scale={1} />
      </div>

      {/* BAŞARI EKSENİ — derinlik ve ondan türeyen puan */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 10, marginTop: 7,
        fontSize: 10.5, color: C.boneDim,
      }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 4 }} title="Deepest descent">
          <Icon name="skull" scale={1} dim />
          <b style={{ color: C.bone, fontVariantNumeric: 'tabular-nums' }}>{derinlik}</b>
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 4 }} title="Stages cleared">
          <Icon name="star" scale={1} dim />
          <b style={{ color: C.bone }}>{olcum.temizlenen}/{STAGES.length}</b>
        </span>
        {/* ⚠️ Puan yalnızca VARSA yazılıyor. Sıfırken "0 points" göstermek,
            yeni oyuncuya kazanmadığı bir şeyi hatırlatmaktan başka işe
            yaramaz; kartın dar satırını da yer. */}
        {olcum.puan > 0 && (
          <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}
            title={olcum.sonraki ? `Next point at depth ${olcum.sonraki}` : 'All points earned'}>
            <Icon name="tome" scale={1} dim />
            <b style={{ color: C.bone }}>{olcum.puan}</b>
          </span>
        )}
      </div>
    </div>
  );
}
