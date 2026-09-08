'use client';
// THE LONG VIGIL — sezon kartı paneli.
//
// 🔴 KULLANICI: *"Bu kartı görsel mimari olarak en üst seviye yapman lazım.
// 1000 GOLD ve Metal Bladekeeper karakterinin görsellerini en üstte ayrı
// bir iki kutuda tutalım, gold ve hero ön planda olsun. Her şeyin bir
// görseli olsun ve bu kart efekt ve animasyonlu olsun. SOL ile satın alma
// butonu burda bulunsun. Bu kartta DUST ile alakalı bir şey olmasın, bu
// kart sadece SOL ile satın alınır ve tüm ödüller anında verilir. Kart
// alındığında kazanılan ödüller güzel bir animasyon önizlemesi ile
// kullanıcıya verilsin."*
//
// ⚠️ ESKİ HÂLİ: derinlikle açılan on iki kademeli bir YOL. Kaldırıldı;
// gerekçesi ve sonuçları `game/vigil.ts` başlığında yazılı.
//
// ⚠️ NE ALDIĞINI GİZLEMİYORUZ. Ödeme ekranında en pahalı hata, alanın ne
// aldığını yanlış sanmasıdır. Kart GÜÇ satıyor (gold + oynayarak
// açılamayan bir kahraman) ve metin bunu açıkça söylüyor — sattığın şeyi
// küçültmek de büyütmek kadar yanlış.
//
// ⚠️ `motionOff` DİNLENİYOR. Ödeme ekranında yanıp sönen bir şey, hareketi
// kapatmış oyuncuya rağmen yanıp sönmemeli.
//
// ⚠️ Tüm stiller INLINE · oyuncu metinleri İngilizce.

import { useCallback, useEffect, useMemo, useState } from 'react';
import { panelUnlocked } from '@/lib/testMode';
import { getMode } from '@/lib/session';
import { type Progress } from '@/game/progress';
import { VIGIL_GOLD, VIGIL_HERO, vigilCosmeticIds } from '@/game/vigil';
import { cosmeticById, RARITY } from '@/game/cosmetics';
import { heroById } from '@/game/heroes';
import { buyVigilSol } from '@/lib/gameSession';
import { SolIcon, SolPayButton, useSolRail } from '@/components/SolPayButton';
import { solPrice } from '@/game/solPrice';
import { PanelHead, Tag } from '@/components/ui/cards';
import { Icon } from '@/components/ui/kit';
import { HeroPortrait } from '@/components/HeroPortrait';
import { motionOff } from '@/components/ui/motion';
import { C, FONT, glass, thinGlass } from '@/lib/theme';

const KEYFRAMES = `
@keyframes gb-vig-in { 0% { opacity: 0; transform: translateY(10px) scale(0.94); } 100% { opacity: 1; transform: none; } }
@keyframes gb-vig-glow { 0%,100% { box-shadow: 0 0 14px rgba(239,167,46,0.20); } 50% { box-shadow: 0 0 26px rgba(239,167,46,0.42); } }
@keyframes gb-vig-shine { 0% { background-position: -140% 0; } 100% { background-position: 240% 0; } }
@keyframes gb-vig-nefes { 0%,100% { transform: scale(1); } 50% { transform: scale(1.035); } }
@keyframes gb-vig-rise { 0% { opacity: 0; transform: translateY(16px) scale(0.8); } 55% { opacity: 1; transform: translateY(-3px) scale(1.06); } 100% { opacity: 1; transform: none; } }
`;

/**
 * Kozmetiğin görseli — "her şeyin bir görseli olsun" (kullanıcı isteği).
 *
 * ⚠️ HER YUVA FARKLI ŞEY: kupa bir sprite, aura bir ışık halkası, isimlik
 * bir gradyan, unvan ise SALT METİN — `cosmetics.ts`te unvanın çizilecek
 * bir varlığı yok. Hepsi yuvasına göre çiziliyor; "görseli yok" diye boş
 * bırakmak isteği yarım bırakmak olurdu.
 */
function KozmetikGorsel({ id, boy = 34 }: { id: string; boy?: number }) {
  const def = cosmeticById(id);
  if (!def) return null;
  const renk = RARITY[def.rarity].color;

  const ic = def.slot === 'trophy' && def.trophy ? (
    // ⚠️ Şerit sprite: `objectFit:none` ile İLK kare gösteriliyor, yoksa
    // beş kare yan yana sıkışırdı.
    <img src={def.trophy.src} alt="" width={boy - 8} height={boy - 8}
      style={{
        imageRendering: 'pixelated', display: 'block',
        objectFit: 'none', objectPosition: 'left center',
      }} />
  ) : def.slot === 'aura' && def.aura ? (
    <span style={{
      width: boy - 12, height: boy - 12, borderRadius: '50%',
      background: `radial-gradient(circle, ${def.aura.color}cc 0%, ${def.aura.color}22 60%, transparent 72%)`,
      boxShadow: `0 0 12px ${def.aura.color}aa`,
    }} />
  ) : def.slot === 'plate' && def.plate ? (
    <span style={{
      width: boy - 8, height: 12, borderRadius: 3,
      background: `linear-gradient(90deg, ${def.plate.from}, ${def.plate.to})`,
      border: `1px solid ${renk}66`,
    }} />
  ) : (
    <span style={{
      fontFamily: FONT.title, fontSize: boy * 0.5, fontWeight: 900,
      color: renk, textShadow: `0 0 10px ${renk}88`, lineHeight: 1,
    }}>{def.name.replace(/^The\s+/i, '').charAt(0).toUpperCase()}</span>
  );

  return (
    <span style={{
      width: boy, height: boy, flexShrink: 0, borderRadius: 7,
      display: 'grid', placeItems: 'center', overflow: 'hidden',
      background: 'rgba(0,0,0,0.35)', border: `1px solid ${renk}55`,
    }}>{ic}</span>
  );
}

export function VigilSection({ progress, onChange, onError }: {
  progress: Progress;
  onChange: (p: Progress) => void;
  onError: (msg: string) => void;
}) {
  const ray = useSolRail();
  const kart = progress.vigil === true;
  const hareketKapali = motionOff();
  const kozmetikler = useMemo(() => vigilCosmeticIds(), []);
  const kahraman = heroById(VIGIL_HERO);
  const lamports = solPrice('battlepass');

  /**
   * ÖDÜL ANI — satın alındıktan SONRA bir kez oynayan önizleme.
   *
   * ⚠️ SATIN ALMA ANINDA açılıyor, kart sahipliğine BAKARAK değil: kartı
   * olan oyuncu paneli her açtığında kutlama izlemek zorunda kalmamalı.
   */
  const [odulAni, setOdulAni] = useState(false);
  useEffect(() => {
    if (!odulAni) return;
    const t = setTimeout(() => setOdulAni(false), 4200);
    return () => clearTimeout(t);
  }, [odulAni]);

  const alindi = useCallback(async (sig: string) => {
    onChange((await buyVigilSol(sig)).progress);
    if (!hareketKapali) setOdulAni(true);
  }, [onChange, hareketKapali]);

  if (!panelUnlocked(getMode())) {
    return (
      <PanelHead kicker="STARTER PACK" title="Gold, a hero, six relics" accent={C.candle}
        sub="The pack is kept in the village ledger, not on your device. Connect a wallet to take the card." />
    );
  }

  const anim = (ad: string, sure: string, gecikme = 0) =>
    hareketKapali ? undefined : `${ad} ${sure} ${gecikme}ms both`;

  return (
    <>
      <style>{KEYFRAMES}</style>

      <PanelHead kicker="STARTER PACK" title="Bought once. Everything at once."
        accent={C.candle}
        sub={kart
          ? 'The card is yours. Everything below is already in your hands.'
          : 'One payment in SOL. Every reward lands the moment it clears — nothing to grind, nothing to claim later.'} />

      {/* ══════════════════════════════════════════════════════════════
          ⭐ ÖN PLAN: GOLD ve KAHRAMAN — iki ayrı kutu (kullanıcı isteği).
          İkisi kartın GÜÇ tarafı; kozmetikler aşağıda. Eşit ağırlıkta
          duruyorlar çünkü ikisi de "ne alıyorum" sorusunun cevabı.
          ⚠️ `minmax(min(210px,100%),1fr)`: dar ekranda alt alta düşüyor.
          Sert bir taban telefonda taşardı — bu depoda ölçülmüş tuzak.
          ══════════════════════════════════════════════════════════════ */}
      <div style={{
        display: 'grid', gap: 10, marginBottom: 12,
        gridTemplateColumns: 'repeat(auto-fit, minmax(min(210px, 100%), 1fr))',
      }}>
        {/* ── GOLD ── */}
        <div style={{
          ...glass(10), padding: '15px 16px', position: 'relative', overflow: 'hidden',
          border: `1px solid ${C.candle}55`,
          animation: anim('gb-vig-glow', '3.4s ease-in-out infinite'),
        }}>
          {/* ⚠️ Parıltı DEKOR: `pointerEvents:none` ve metnin ALTINDA —
              metnin üstünden geçen bir şerit okunurluğu düşürürdü. */}
          {!hareketKapali && (
            <span style={{
              position: 'absolute', inset: 0, pointerEvents: 'none',
              background: `linear-gradient(105deg, transparent 40%, ${C.bone}18 50%, transparent 60%)`,
              backgroundSize: '220% 100%',
              animation: 'gb-vig-shine 3.6s ease-in-out infinite',
            }} />
          )}
          <div style={{ display: 'flex', alignItems: 'center', gap: 11, position: 'relative' }}>
            <span style={{
              width: 46, height: 46, flexShrink: 0, borderRadius: 10,
              display: 'grid', placeItems: 'center',
              background: 'rgba(0,0,0,0.34)', border: `1px solid ${C.candle}55`,
            }}>
              <Icon name="gold" scale={2} />
            </span>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontFamily: FONT.title, fontSize: 24, fontWeight: 900,
                color: C.candle, lineHeight: 1, textShadow: `0 0 16px ${C.candle}66` }}>
                {VIGIL_GOLD.toLocaleString('en-US')}
              </div>
              <div style={{ fontFamily: FONT.ui, fontSize: 10, fontWeight: 900,
                letterSpacing: 1.3, color: C.boneDim, marginTop: 3 }}>GOLD, INSTANTLY</div>
              <div style={{ fontFamily: FONT.ui, fontSize: 10.5, color: C.boneFaint,
                marginTop: 4, lineHeight: 1.45 }}>
                Spend it anywhere gold goes — the Forge, the Stall, the Reliquary.
              </div>
            </div>
          </div>
        </div>

        {/* ── KAHRAMAN ── */}
        {/* ⚠️ KUTU BIRAZ BUYUDU ve NEFES ALIYOR (kullanıcı isteği).
            Ölçek 1 → 1,035; daha fazlası yanındaki gold kutusuyla hizayı
            bozuyor ve "titriyor" gibi duruyordu. */}
        <div style={{
          ...glass(10), padding: '15px 16px', position: 'relative', overflow: 'hidden',
          border: `1px solid ${C.blood}66`,
          animation: anim('gb-vig-nefes', '3.2s ease-in-out infinite'),
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            {/**
              * 🔴 GERÇEK KARAKTER, HARF DEĞİL (kullanıcı düzeltmesi).
              * İlk sürüm "M" harfi gösteriyordu çünkü şeridi `<img>` ile
              * doğru kırpamıyordum. Çözüm kırpma matematiğini yeniden
              * yazmak değil, OYUNUN KENDİ ÇİZİCİSİNİ kullanmaktı
              * (`HeroPortrait` → `drawActor`): kare seçimi, `contentRatio`,
              * `anchorY`, `crop` — hepsi orada ve ölçülerek bulunmuş.
              * ⚠️ `run` animasyonu: kutuda duran değil YÜRÜYEN bir karakter,
              * "canlı olarak hareketli" istendi.
              */}
            <span style={{
              width: 60, height: 60, flexShrink: 0, borderRadius: 10,
              display: 'grid', placeItems: 'center', overflow: 'hidden',
              background: 'radial-gradient(circle at 50% 70%, rgba(160,18,38,0.22), rgba(0,0,0,0.42))',
              border: `1px solid ${C.blood}66`,
            }}>
              <HeroPortrait hero={VIGIL_HERO} size={58} anim="run" />
            </span>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontFamily: FONT.title, fontSize: 17, fontWeight: 900,
                color: C.bone, lineHeight: 1.1 }}>{kahraman.name}</div>
              <div style={{ fontFamily: FONT.ui, fontSize: 10, fontWeight: 900,
                letterSpacing: 1.2, color: C.bloodSoft, marginTop: 3 }}>
                CANNOT BE UNLOCKED BY PLAYING
              </div>
              {/* ⚠️ İSTATİSTİKLER `heroes.ts`TEN OKUNUYOR, elle yazılmıyor:
                  dengesi bir gün değişirse metin kendiliğinden doğru kalır. */}
              <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginTop: 6 }}>
                {Object.entries(kahraman.stats).map(([k, v]) => {
                  const n = v as number;
                  return (
                    <span key={k} style={{
                      fontFamily: FONT.ui, fontSize: 9.5, fontWeight: 900, letterSpacing: 0.4,
                      padding: '2px 6px', borderRadius: 4,
                      color: n > 0 ? C.ok : C.badText,
                      border: `1px solid ${n > 0 ? C.ok : C.badText}44`,
                      background: 'rgba(0,0,0,0.25)',
                    }}>
                      {n > 0 ? '+' : '−'}
                      {Math.abs(n) < 1 ? `${Math.round(Math.abs(n) * 100)}%` : Math.abs(n)}
                      {' '}{k}
                    </span>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════════════
          KOZMETİKLER — altısı da görseliyle.
          ⚠️ Bunlar çekilişten ASLA çıkmıyor ve tozla da alınamıyor
          (`tozlaAlinabilirMi`). Kartın kozmetik tarafındaki tek gerçek
          değer bu ve söylenmesi gerekiyor.
          ══════════════════════════════════════════════════════════════ */}
      <div style={{ ...thinGlass(10, 0.5), padding: '11px 12px', marginBottom: 12 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 9,
          flexWrap: 'wrap' }}>
          <span style={{ fontFamily: FONT.ui, fontSize: 10, fontWeight: 900,
            letterSpacing: 1.4, color: C.candle }}>SIX RELICS</span>
          <span style={{ fontFamily: FONT.ui, fontSize: 10.5, color: C.boneFaint }}>
            the reliquary will never roll them, and dust will never buy them
          </span>
        </div>
        <div style={{
          display: 'grid', gap: 7,
          gridTemplateColumns: 'repeat(auto-fill, minmax(min(150px, 100%), 1fr))',
        }}>
          {kozmetikler.map((id, i) => {
            const def = cosmeticById(id);
            if (!def) return null;
            const renk = RARITY[def.rarity].color;
            return (
              <div key={id} style={{
                display: 'flex', alignItems: 'center', gap: 8,
                padding: '7px 8px', borderRadius: 7,
                background: 'rgba(255,255,255,0.04)',
                border: `1px solid ${renk}33`,
                animation: anim('gb-vig-in', '360ms ease-out', i * 55),
              }}>
                <KozmetikGorsel id={id} boy={32} />
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontFamily: FONT.ui, fontSize: 11, fontWeight: 900,
                    color: C.bone, overflow: 'hidden', textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap' }}>{def.name}</div>
                  <div style={{ fontFamily: FONT.ui, fontSize: 9, fontWeight: 900,
                    letterSpacing: 0.8, color: renk, marginTop: 2 }}>
                    {RARITY[def.rarity].label} · {def.slot.toUpperCase()}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════════════
          SATIN ALMA — kullanıcı isteği: SOL düğmesi BU kartta.
          🔴 RAY KAPALIYKEN SESSİZ KALINMAZ. Kartın tek eylemi SOL; düğme
          yok olunca geriye tıklanacak hiçbir şeyi olmayan bir kutu kalıyor
          ve oyuncu kartın bozuk olduğunu sanıyor.
          ══════════════════════════════════════════════════════════════ */}
      {!kart ? (
        <div style={{
          ...glass(10), padding: '13px 14px',
          border: `1px solid ${C.candle}66`,
          display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap',
        }}>
          <div style={{ minWidth: 0, flex: '1 1 200px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
              <SolIcon size={16} />
              <span style={{ fontFamily: FONT.title, fontSize: 20, fontWeight: 900,
                color: C.bone, lineHeight: 1 }}>
                {lamports !== null ? `${lamports / 1e9} SOL` : '—'}
              </span>
              <Tag tone="gold">ONE PAYMENT</Tag>
            </div>
            {/* ⚠️ CÜZDANIN NE SORACAĞI YAZILI: imza istenmiyor, doğrudan
                transfer. Beklenmedik bir cüzdan uyarısı, ödemenin en sık
                yarıda bırakıldığı yer. */}
            <div style={{ fontFamily: FONT.ui, fontSize: 10.5, color: C.boneFaint,
              marginTop: 5, lineHeight: 1.5 }}>
              Your wallet is asked to send SOL and nothing else — no message to sign.
            </div>
          </div>
          <div style={{ flexShrink: 0 }}>
            {ray === 'acik' ? (
              <SolPayButton
                urun="battlepass"
                lamports={lamports}
                onError={onError}
                onDone={alindi}
              />
            ) : (
              <span style={{
                fontFamily: FONT.ui, fontSize: 9.5, fontWeight: 900, letterSpacing: 1,
                color: C.boneFaint, border: `1px solid ${C.border}66`,
                padding: '5px 10px', borderRadius: 5, whiteSpace: 'nowrap',
              }}>{ray === 'bilinmiyor' ? '…' : 'NOT OPEN YET'}</span>
            )}
          </div>
          {/* ⚠️ NE ZAMAN AÇILACAĞI DEĞİL, NİYE KAPALI OLDUĞU yazılıyor.
              Takvime bağlı bir söz, o gün geldiğinde arkasındaki iş
              bitmemişse de gelir ve tutulamaz. */}
          {ray === 'kapali' && (
            <div style={{
              flexBasis: '100%', padding: '7px 9px', borderRadius: 5,
              border: `1px solid ${C.border}66`, background: 'rgba(0,0,0,0.22)',
              fontFamily: FONT.ui, fontSize: 10.5, color: C.boneFaint, lineHeight: 1.5,
            }}>
              The card cannot be bought yet — payments are not switched on. Everything
              above is what it contains, and it is not going anywhere.
            </div>
          )}
        </div>
      ) : (
        <div style={{
          ...glass(10), padding: '11px 13px',
          border: `1px solid ${C.ok}55`, display: 'flex', alignItems: 'center',
          gap: 9, flexWrap: 'wrap',
        }}>
          <Tag tone="ok">YOURS</Tag>
          <span style={{ fontFamily: FONT.ui, fontSize: 11.5, color: C.boneDim }}>
            Everything above was granted the moment the payment cleared.
          </span>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════
          ⭐ ÖDÜL ANI — satın alındıktan sonra bir kez.
          🔴 Kullanıcı: *"kart alındığında kazanılan ödüller güzel bir
          animasyon önizlemesi ile kullanıcıya verilsin."*
          ⚠️ Perde TIKLAMAYI YEMİYOR (`pointerEvents: none`) ve kendi
          kendine kapanıyor: oyuncuyu kutlamanın içine hapsetmek, ödemenin
          hemen ardından yapılabilecek en kötü şey.
          ⚠️ Hareket kapalıysa HİÇ AÇILMIYOR (`alindi` içinde kontrol).
          ══════════════════════════════════════════════════════════════ */}
      {odulAni && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 40, pointerEvents: 'none',
          display: 'flex', flexDirection: 'column', alignItems: 'center',
          justifyContent: 'center', gap: 14, padding: 20,
          background: 'radial-gradient(ellipse at center, rgba(10,8,6,0.72) 0%, rgba(6,5,4,0.90) 70%)',
          animation: 'gb-vig-in 260ms ease-out both',
        }}>
          <div style={{
            fontFamily: FONT.title, fontSize: 'clamp(22px, 5vw, 34px)', fontWeight: 900,
            color: C.candle, letterSpacing: 2, textAlign: 'center',
            textShadow: `0 0 26px ${C.candle}, 0 2px 0 ${C.void}`,
            animation: 'gb-vig-rise 520ms ease-out both',
          }}>THE PACK IS YOURS</div>

          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', justifyContent: 'center' }}>
            <div style={{
              ...glass(10), padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 8,
              border: `1px solid ${C.candle}66`,
              animation: 'gb-vig-rise 520ms ease-out 160ms both',
            }}>
              <Icon name="gold" scale={2} />
              <span style={{ fontFamily: FONT.title, fontSize: 20, fontWeight: 900,
                color: C.candle }}>+{VIGIL_GOLD.toLocaleString('en-US')}</span>
            </div>
            <div style={{
              ...glass(10), padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 8,
              border: `1px solid ${C.blood}66`,
              animation: 'gb-vig-rise 520ms ease-out 300ms both',
            }}>
              <HeroPortrait hero={VIGIL_HERO} size={34} anim="run" />
              <span style={{ fontFamily: FONT.ui, fontSize: 12.5, fontWeight: 900,
                color: C.bone }}>{kahraman.name}</span>
            </div>
          </div>

          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'center',
            maxWidth: 520 }}>
            {kozmetikler.map((id, i) => (
              <div key={id} style={{
                animation: `gb-vig-rise 480ms ease-out ${440 + i * 90}ms both`,
              }}>
                <KozmetikGorsel id={id} boy={40} />
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  );
}
