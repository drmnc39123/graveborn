'use client';
// LEVEL-UP KARTI — koşunun en önemli kararı.
//
// NİYE VAR: eski hâli düz bir butondu. Slot çerçevesinin içinde silah resmi
// değil "1/2/3" rakamı duruyordu; veri modelinde `icon` alanı BİLE YOKTU.
// Oyuncu her seviyede körlemesine seçiyordu: ne kazandığını, silahın nasıl
// ateş ettiğini, evrime yaklaşıp yaklaşmadığını hiçbir yerde göremiyordu.
//
// ⚠️ Tüm stiller INLINE · MOR YOK · oyuncu metinleri İngilizce.

import { EVOLUTIONS, PASSIVES, WEAPONS, EVOLVED, weaponById,
  weaponCooldownAt, weaponCountAt, weaponDamageAt } from '@/game/config';
import { useState } from 'react';
import { passiveIcon, weaponArt } from '@/game/combatArt';
import { PATTERN_TEXT, Tag } from '@/components/ui/cards';
import { Slot } from '@/components/ui/kit';
import { C, FONT } from '@/lib/theme';

export interface OfferView {
  id: string; name: string; desc: string; kind: string; level?: number;
}

/** 16×16 pixel ikon — bulanıklaşmamalı */
function Icon({ src, size = 26 }: { src: string; size?: number }) {
  return (
    <img src={src} alt="" width={size} height={size}
      style={{ imageRendering: 'pixelated', display: 'block' }} />
  );
}

/**
 * Bu seçim evrime yaklaştırıyor mu?
 * ⚠️ Oyuncunun bilmesi gereken en değerli bilgi bu: evrim silah MAX + pasif
 * MAX + boss sandığı istiyor. Nerede olduğunu göstermezsek oyuncu tesadüfen
 * bulmayı bekliyoruz demektir.
 */
function evolutionHint(id: string, kind: string, level: number | undefined,
  weapons: { id: string; level: number }[], passives: { id: string; level: number }[]) {
  if (!kind.startsWith('weapon')) return null;
  const evo = EVOLUTIONS.find((e) => e.weapon === id);
  if (!evo) return null;

  const def = weaponById(id);
  const gerekenPasif = PASSIVES.find((p) => p.id === evo.passive);
  const sahipPasif = passives.find((p) => p.id === evo.passive);
  const evolvedDef = EVOLVED.find((w) => w.id === evo.to);
  if (!def || !gerekenPasif || !evolvedDef) return null;

  const silahMax = (level ?? 0) + 1 >= def.maxLevel;   // bu seçimden SONRA
  const pasifMax = (sahipPasif?.level ?? 0) >= gerekenPasif.maxLevel;

  if (silahMax && pasifMax) {
    return { tone: 'blood' as const, text: `EVOLUTION READY · ${evolvedDef.name}` };
  }
  if (silahMax) {
    return { tone: 'dim' as const, text: `Needs ${gerekenPasif.name} (${sahipPasif?.level ?? 0}/${gerekenPasif.maxLevel})` };
  }
  return { tone: 'dim' as const, text: `Evolves into ${evolvedDef.name} at max` };
}

export function LevelUpCard({ offer, index, onPick, weapons, passives }: {
  offer: OfferView;
  index: number;
  onPick: (id: string) => void;
  weapons: { id: string; level: number }[];
  passives: { id: string; level: number }[];
}) {
  const silah = offer.kind.startsWith('weapon');
  const yeni = offer.kind.endsWith('new');

  // ⚠️ TEKLİF ID'Sİ ÖNEKLİ. Motor `w:lash` / `p:sinew` üretiyor
  // (engine.ts `rollOffers`) çünkü silah ve pasif id'leri çakışabilir.
  // Kart bu öneki SÖKMEDEN arama yapıyordu ve üç şey birden sessizce
  // ölmüştü — hiçbiri hata vermediği için de kimse fark etmemişti:
  //
  //   weaponById('w:lash')            → undefined  ⇒ desen etiketi ve
  //                                      "nasıl ateş eder" satırı hiç yok
  //   weaponArt('w:lash')             → yedek ikon ⇒ her silah aynı ikon
  //   EVOLUTIONS.find(e.weapon===...) → asla eşleşmez
  //                                   ⇒ EVRİM İPUCU HİÇ GÖSTERİLMEDİ
  //
  // Sonuncusu en pahalısı: bu dosyanın kendi başlığı evrim ipucunu
  // "oyuncunun bilmesi gereken en değerli bilgi" diye tarif ediyor.
  //
  // ⚠️ `onPick`e ÖNEKLİ id gitmeli — motorun `choose()` beklediği o.
  const oz = offer.id.replace(/^[wp]:/, '');

  const def = silah ? weaponById(oz) : undefined;
  const pat = def ? PATTERN_TEXT[def.pattern] : undefined;
  const icon = silah ? weaponArt(oz).icon : passiveIcon(oz);

  const lv = offer.level ?? 0;
  const sonraki = lv + 1;

  // "Lv 3 → 4 ne kazandırır" — saf fonksiyonlar config.ts'te, motorla AYNI
  const deltas: { label: string; text: string }[] = [];
  if (def && !yeni) {
    const d0 = weaponDamageAt(def, lv), d1 = weaponDamageAt(def, sonraki);
    if (d1 > d0) deltas.push({ label: 'DAMAGE', text: `+${Math.round(((d1 / d0) - 1) * 100)}%` });
    const c0 = weaponCooldownAt(def, lv), c1 = weaponCooldownAt(def, sonraki);
    if (c1 < c0) deltas.push({ label: 'ATTACK SPEED', text: `+${Math.round(((c0 / c1) - 1) * 100)}%` });
    const n0 = weaponCountAt(def, lv), n1 = weaponCountAt(def, sonraki);
    if (n1 > n0) deltas.push({ label: 'PROJECTILES', text: `+${n1 - n0}` });
  }

  const evo = evolutionHint(oz, offer.kind, offer.level, weapons, passives);

  /**
   * DÜŞEY SÜTUN — kartlar YAN YANA, alt alta değil.
   *
   * ⚠️ NİYE YENİDEN YAZILDI: üç teklif alt alta dizilince koşunun en önemli
   * kararı bir "menü satırı" gibi okunuyordu. Ortak `Card` bileşeni de bu iş
   * için fazla nötrdü — her panelde aynı kutu. Seçim anının kendi görsel
   * kimliği olmalı, o yüzden kart burada elle kuruluyor.
   *
   * ⚠️ TÜR RENGİ TAŞIYOR. Silah = mum altını, kalıntı/pasif = buz grisi.
   * Oyuncu üç kartı okumadan ÖNCE hangisinin silah hangisinin pasif olduğunu
   * görüyor; kıyas oradan başlıyor.
   *
   * ⚠️ `height:'100%'` + evrim ipucunun `marginTop:'auto'`su ŞART. Üç kartın
   * metni farklı uzunlukta; onsuz kartlar farklı boyda biter ve ipuçları
   * farklı hizalarda asılır — ızgaranın verdiği kıyas kolaylığı kaybolur.
   */
  const ton = silah ? C.candle : C.ice;
  const [uzerinde, setUzerinde] = useState(false);
  const one = uzerinde;

  return (
    <div
      role="button" tabIndex={0}
      onClick={() => onPick(offer.id)}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onPick(offer.id); } }}
      onPointerEnter={() => setUzerinde(true)}
      onPointerLeave={() => setUzerinde(false)}
      style={{
        position: 'relative', cursor: 'pointer', height: '100%',
        display: 'flex', flexDirection: 'column',
        borderRadius: 12,
        border: `1px solid ${one ? `${ton}88` : 'rgba(255,255,255,0.10)'}`,
        // Kart bir YÜZEY: üstten ışık alan dikey degrade + türün rengi
        background: `linear-gradient(180deg, ${ton}1c 0%, rgba(14,10,8,0.92) 42%, rgba(8,6,5,0.96) 100%)`,
        boxShadow: one
          ? `0 0 0 1px ${ton}44, 0 14px 34px rgba(0,0,0,0.62), inset 0 1px 0 ${ton}33`
          : '0 8px 22px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.05)',
        // ⚠️ 120 ms — panel açılışıyla aynı bütçe. Seçim anı bir geçiş değil
        // bir KARAR; uzun animasyon oyuncuyu bekletir.
        transition: 'transform 120ms ease-out, box-shadow 120ms ease-out, border-color 120ms ease-out',
        transform: one ? 'translateY(-3px)' : 'none',
        overflow: 'hidden',
      }}
    >
      {/* ── ÜST ŞERİT: tür + tuş ── */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '7px 10px',
        background: `linear-gradient(180deg, ${ton}26, transparent)`,
        borderBottom: `1px solid ${ton}22`,
      }}>
        <span style={{
          fontFamily: FONT.ui, fontSize: 9, fontWeight: 900, letterSpacing: 1.8, color: ton,
        }}>{silah ? 'WEAPON' : 'RELIC'}</span>
        {/* ⚠️ Tuş rozeti üst şeritte ve KLAVYE TUŞU gibi çiziliyor. Yan yana
            düzende oyuncunun ilk aradığı şey "hangi tuş"; ikonun köşesine
            yapışık 16 px'lik bir etiket o işi göremiyordu. */}
        <span style={{
          minWidth: 20, height: 20, padding: '0 5px', borderRadius: 5,
          display: 'grid', placeItems: 'center',
          fontFamily: FONT.ui, fontSize: 11, fontWeight: 900,
          color: C.void, background: ton,
          boxShadow: 'inset 0 -2px 0 rgba(0,0,0,0.28)',
        }}>{index + 1}</span>
      </div>

      <div style={{
        display: 'flex', flexDirection: 'column', gap: 9,
        padding: '12px 12px 11px', flex: 1,
      }}>
        {/* ── İKON: arkasında türün ışığı ── */}
        <div style={{ display: 'flex', justifyContent: 'center', position: 'relative', padding: '4px 0 2px' }}>
          {/* ⚠️ Işık ikonun ARKASINDA ve türün renginde — kart taranırken göz
              önce buraya düşüyor. `pointerEvents:'none'` şart, yoksa halkanın
              üstüne gelince kartın hover'ı titriyor. */}
          <div style={{
            position: 'absolute', width: 118, height: 118, top: -20, borderRadius: '50%',
            background: `radial-gradient(circle, ${ton}${one ? '38' : '22'}, transparent 66%)`,
            pointerEvents: 'none',
          }} />
          {/**
            * ⚠️ ÖLÇEK TAM SAYI (kit kuralı) — 4 = 64 px yuva.
            * ⚠️ İKON YUVANIN İÇ ALANINA GÖRE ÖLÇÜLDÜ, yuva boyuna göre DEĞİL.
            * Franuka yuvası 16×16 ve kenarlığı her yandan ~3 px yiyor; 4×'te
            * iç alan ≈ 40 px. Önce 44 px verildi ve ekranda ölçüldü: ikonun
            * kendi açık zemini çerçeveyi TAMAMEN yutuyordu, yuva görünmez
            * oluyordu. 30 px her yandan nefes payı bırakıyor ve çerçeve
            * yeniden okunuyor.
            */}
          <div style={{ position: 'relative' }}>
            <Slot type={silah ? 'Weapon' : 'Ring'} variant="02" scale={4}>
              <Icon src={icon} size={30} />
            </Slot>
          </div>
        </div>

        {/* ── AD + ROZETLER ── */}
        <div style={{ textAlign: 'center' }}>
          <div style={{
            fontFamily: FONT.title, fontWeight: 900, fontSize: 18,
            color: C.bone, lineHeight: 1.2,
            textShadow: `0 0 14px ${ton}33`,
          }}>{offer.name}</div>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 5, flexWrap: 'wrap',
            justifyContent: 'center', marginTop: 6,
          }}>
            {yeni
              ? <Tag tone={silah ? 'gold' : 'ok'}>NEW</Tag>
              : <Tag tone="dim">LV {lv} → {sonraki}</Tag>}
            {pat && <Tag tone="dim">{pat.label}</Tag>}
          </div>
        </div>

        <div style={{ height: 1, background: `linear-gradient(90deg, transparent, ${ton}30, transparent)` }} />

        {/* ⚠️ Silahın ADI ne yaptığını söylemiyor — deseni söylüyor.
            "bu hero ateş etmiyor" şikâyeti tam bu bilgi eksikliğindendi. */}
        <div style={{
          fontSize: 11.5, color: C.boneDim, lineHeight: 1.5, textAlign: 'center',
        }}>{yeni && pat ? pat.how : offer.desc}</div>

        {/* ⚠️ ARTIŞLAR ARTIK ETİKET DEĞİL, SATIR. "Lv 3 → 4 ne kazandırır"
            sorusunun cevabı taranabilir olmalı; yan yana rozetler sarılıp
            karışıyordu. Ad solda, değer sağda ve HİZALI. */}
        {deltas.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
            {deltas.map((d) => (
              <div key={d.label} style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                gap: 8, padding: '3px 7px', borderRadius: 5,
                background: 'rgba(255,255,255,0.04)',
              }}>
                <span style={{
                  fontFamily: FONT.ui, fontSize: 9, fontWeight: 900,
                  letterSpacing: 1.1, color: C.boneFaint,
                }}>{d.label}</span>
                <span style={{ fontSize: 11.5, fontWeight: 900, color: C.ok }}>{d.text}</span>
              </div>
            ))}
          </div>
        )}

        {/* ⚠️ `marginTop:'auto'` — evrim ipucu HER kartta en altta, aynı
            hizada. Bu dosyanın kendi başlığı onu "oyuncunun bilmesi gereken
            en değerli bilgi" diye tarif ediyor; hizasız asılırsa taranamaz. */}
        {evo && (
          <div style={{ marginTop: 'auto', paddingTop: 6, textAlign: 'center' }}>
            <Tag tone={evo.tone}>{evo.text}</Tag>
          </div>
        )}
      </div>
    </div>
  );
}
