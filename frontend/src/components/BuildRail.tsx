'use client';
// KOŞU İÇİ BUILD RAYI — ekranın sol kenarı.
//
// NİYE VAR (kullanıcı isteği): taşınan kartlar can küresinin YANINDA,
// 32 px'lik sarmalayan bir satırdaydı. 6 silah + 6 pasif + diriliş rozeti
// `maxWidth: 330` içinde üç sıraya kırılıyor, simgeler birbirine değiyor ve
// koşunun en önemli bilgisi — "elimde ne var" — okunmaz hâle geliyordu.
// Üstelik slotlarda BAŞKA HİÇBİR ŞEY yoktu: `title` attribute'u dışında ne
// hasar, ne bekleme, ne evrim durumu.
//
// Yeni hâli: sol kenarda iki DÜŞEY sütun (silahlar · pasifler), 48 px
// slotlar, üstüne gelince gerçek sayıları gösteren bir bilgi kartı.
//
// ⚠️ SAYILAR MOTORDAN GELİYOR, arayüzde yeniden hesaplanmıyor: `dmg`
// `might`i, `cdMax` `cooldown`u, `count` `amount`ı içeriyor. Arayüz kendi
// hesabını yapsaydı Forge'da 20 seviye yükseltme almış oyuncuya taban hasar
// yazardı.
//
// ⚠️ DAR EKRANDA RAY TIKLANMAZ (`pointerEvents: none`). Sanal joystick
// canvas'a bağlı ve parmağın BASTIĞI yer merkez sayılıyor (`lib/stick.ts`);
// sol kenarda tıklanabilir bir şerit bırakmak, telefonda sola yürümek
// isteyen oyuncunun parmağını yutardı. Üstüne gelmek zaten masaüstü
// kavramı — orada hiçbir şey kaybedilmiyor.
//
// ⚠️ Tüm stiller INLINE · MOR YOK · oyuncu metinleri İngilizce.

import { useState, type ReactNode } from 'react';
import { PATTERN_TEXT } from '@/components/ui/cards';
import { CooldownRing, Icon, Slot } from '@/components/ui/kit';
import { WeaponPreview } from '@/components/WeaponPreview';
import { passiveIcon, weaponArt } from '@/game/combatArt';
import { weaponById } from '@/game/config';
import { evrimDurumu, evrimMetni, pasifBilgi, silahArtislari } from '@/game/buildInfo';
import { C, FONT, thinGlass } from '@/lib/theme';

export interface RailWeapon {
  id: string; name: string; level: number;
  cd: number; cdMax: number;
  /** `might` dahil gerçek vuruş hasarı */
  dmg: number;
  /** `stats.amount` dahil gerçek mermi/orb adedi */
  count: number;
}
export interface RailPassive { id: string; name: string; level: number }

/** Seçili satır — `w:<id>` / `p:<id>`; önek ŞART, silah ve pasif id'leri çakışabiliyor */
type Secim = string | null;

const SATIR_ARA = 6;

// ── küçük parçalar ────────────────────────────────────────────────────

function Baslik({ text }: { text: string }) {
  return (
    <div style={{
      fontFamily: FONT.ui, fontSize: 7.5, fontWeight: 900, letterSpacing: 1.3,
      color: C.boneFaint, textAlign: 'center', marginBottom: 4,
      textShadow: '0 1px 0 #000',
    }}>{text}</div>
  );
}

/** Seviye çipi — çıplak rakam yerine okunur bir rozet */
function Pip({ level, max, tone }: { level: number; max: boolean; tone: string }) {
  return (
    <span style={{
      position: 'absolute', right: -3, bottom: -3,
      minWidth: 14, height: 14, padding: '0 3px', borderRadius: 4,
      display: 'grid', placeItems: 'center',
      fontFamily: FONT.ui, fontSize: 9, fontWeight: 900, lineHeight: 1,
      color: max ? C.void : tone,
      background: max ? tone : 'rgba(6,5,4,0.86)',
      border: `1px solid ${max ? tone : `${tone}66`}`,
      fontVariantNumeric: 'tabular-nums',
    }}>{level}</span>
  );
}

function Satir({ label, value, tone = C.bone }: { label: string; value: string; tone?: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginTop: 3 }}>
      <span style={{ fontSize: 8.5, fontWeight: 900, letterSpacing: 1.1, color: C.boneFaint,
        flex: '0 0 74px' }}>{label}</span>
      <span style={{ fontSize: 11.5, fontWeight: 900, color: tone,
        fontVariantNumeric: 'tabular-nums' }}>{value}</span>
    </div>
  );
}

function Ayrac() {
  return <div style={{ height: 1, background: C.border, margin: '7px 0 5px' }} />;
}

// ── bilgi kartı ───────────────────────────────────────────────────────

function Kart({ children }: { children: ReactNode }) {
  /**
   * ⚠️ KART SATIRA DEĞİL RAYA GÖRE ORTALANIYOR ve bu ÖLÇÜLMÜŞ bir karar.
   * Önce satırın merkezine yapıştırılmıştı; kart ~320 px ve ray dikeyde
   * ortalı olduğu için EN ÜSTTEKİ satırın kartı kısa bir pencerede ekranın
   * dışına taşıyordu (720 px'de ucu ucuna sığıyor, 500 px'de tepesi
   * kesiliyordu). Ray zaten ekranın dikey ortasında duruyor: kartı rayın
   * merkezine bağlamak, hangi satır seçilirse seçilsin kartı ekranın
   * ortasında tutuyor.
   * ⚠️ `position: fixed` ÇÖZÜM DEĞİL: rayın kendisinde `transform` var ve
   * dönüştürülmüş bir ata `fixed`i yakalar (bu depoda ölçülmüş tuzak) —
   * portal gerekirdi, koşu içinde buna değmez.
   * ⚠️ Hangi slota ait olduğunu KONUM değil VURGU söylüyor: seçili slotun
   * çerçevesi yanıyor (aşağıda `secili`).
   * ⚠️ `pointerEvents: none` — kart imleci YAKALASAYDI fare kartın üstüne
   * kaydığında slotun `mouseleave`i tetiklenir, kart kapanır, fare yeniden
   * slota döner ve kart titrerdi.
   */
  return (
    <div style={{
      position: 'absolute', left: '100%', top: '50%', transform: 'translateY(-50%)',
      marginLeft: 12, width: 244, zIndex: 4, pointerEvents: 'none',
      ...thinGlass(11, 0.9), padding: '10px 12px',
      borderColor: `${C.candle}44`, fontFamily: FONT.ui,
    }}>{children}</div>
  );
}

/** Seçili slotun altındaki vurgu — kartın hangi simgeye ait olduğunu söyler */
function Vurgu({ tone }: { tone: string }) {
  return (
    <span style={{
      position: 'absolute', inset: -3, borderRadius: 7, pointerEvents: 'none',
      border: `1px solid ${tone}`, boxShadow: `0 0 10px ${tone}66`,
    }} />
  );
}

function SilahKarti({ w, passives }: { w: RailWeapon; passives: RailPassive[] }) {
  const def = weaponById(w.id);
  if (!def) return null;
  const pat = PATTERN_TEXT[def.pattern];
  const artis = silahArtislari(def, w.level);
  const evrim = evrimDurumu(w.id, w.level, passives);
  const maxed = w.level >= def.maxLevel;

  return (
    <Kart>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <img src={weaponArt(w.id).icon} alt="" width={26} height={26}
          style={{ imageRendering: 'pixelated', display: 'block' }} />
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 12.5, fontWeight: 900, color: C.bone, lineHeight: 1.15 }}>
            {def.name}
          </div>
          <div style={{ fontSize: 9, fontWeight: 900, letterSpacing: 1, marginTop: 1,
            color: maxed ? C.candle : C.boneFaint }}>
            {maxed ? `MAX · LV ${w.level}` : `LV ${w.level} / ${def.maxLevel}`}
            {pat && <span style={{ color: C.boneFaint }}> · {pat.label}</span>}
          </div>
        </div>
      </div>

      {/* ⚠️ ŞEMA: silahın NASIL ateş ettiğini metin anlatamıyor. Bu çizim
          `WeaponDef` alanlarından türüyor — uydurma bir animasyon değil. */}
      <div style={{ marginTop: 8 }}>
        <WeaponPreview def={def} height={38} />
      </div>

      <div style={{ marginTop: 7, fontSize: 11, lineHeight: 1.45, color: C.boneDim }}>
        {def.desc}.{pat ? ` ${pat.how}` : ''}
      </div>

      <Ayrac />
      {/* Gerçek sayılar: hepsi motordan, hepsi BU koşuya ait */}
      <Satir label="DAMAGE" value={String(Math.round(w.dmg))} tone={C.candle} />
      <Satir label="EVERY" value={`${w.cdMax.toFixed(2)}s`} />
      {w.count > 1 && <Satir label="PROJECTILES" value={`×${Math.round(w.count)}`} />}

      {artis.length > 0 && (
        <>
          <Ayrac />
          <div style={{ fontSize: 8.5, fontWeight: 900, letterSpacing: 1.1, color: C.boneFaint }}>
            NEXT LEVEL
          </div>
          <div style={{ fontSize: 11, fontWeight: 900, color: C.ok, marginTop: 2 }}>
            {artis.map((a) => `${a.text} ${a.label.toLowerCase()}`).join(' · ')}
          </div>
        </>
      )}

      {evrim && (
        <>
          <Ayrac />
          <div style={{ fontSize: 8.5, fontWeight: 900, letterSpacing: 1.1, color: C.boneFaint }}>
            EVOLUTION
          </div>
          <div style={{ fontSize: 11, fontWeight: 900, marginTop: 2, lineHeight: 1.4,
            color: evrim.silahTamam && evrim.pasifTamam ? C.candle : C.boneDim }}>
            {evrim.hedefAd}
            {/* ⚠️ "HAZIR" DEMEK "ŞİMDİ OLACAK" DEMEK DEĞİL: evrim ayrıca bir
                evrim sandığı istiyor (`engine.tryEvolve` yalnız sandıktan
                çağrılıyor). Bunu yazmazsak oyuncu rozeti görüp bekler ve
                hiçbir şey olmaz. */}
            <div style={{ fontWeight: 700, color: C.boneFaint, marginTop: 2 }}>
              {/* ⚠️ YALNIZ EKSİK ŞART YAZILIYOR. İlk hâli ikisini birden
                  sayıyordu ve ekranda "Needs this at Lv 6 (6/6)" çıkıyordu —
                  yani TUTULMUŞ bir şartı eksikmiş gibi gösteriyordu. */}
              {evrimMetni(evrim)}
            </div>
          </div>
        </>
      )}
    </Kart>
  );
}

function PasifKarti({ p }: { p: RailPassive }) {
  const bilgi = pasifBilgi(p.id, p.level);
  if (!bilgi) return null;
  return (
    <Kart>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <img src={passiveIcon(p.id)} alt="" width={26} height={26}
          style={{ imageRendering: 'pixelated', display: 'block' }} />
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 12.5, fontWeight: 900, color: C.bone, lineHeight: 1.15 }}>
            {bilgi.def.name}
          </div>
          <div style={{ fontSize: 9, fontWeight: 900, letterSpacing: 1, marginTop: 1,
            color: bilgi.maxed ? C.ice : C.boneFaint }}>
            {bilgi.maxed ? `MAX · LV ${p.level}` : `LV ${p.level} / ${bilgi.def.maxLevel}`}
          </div>
        </div>
      </div>

      <div style={{ marginTop: 7, fontSize: 11, lineHeight: 1.45, color: C.boneDim }}>
        {bilgi.def.desc} per level.
      </div>

      <Ayrac />
      {/* ⚠️ "NOW" SATIRI ESKİ ARAYÜZDE HİÇ YOKTU: oyuncu Lv 4 bir pasifin
          TOPLAMDA ne verdiğini kafadan çarpmak zorundaydı. */}
      <Satir label="NOW" value={bilgi.simdi} tone={C.ice} />
      {bilgi.sonra && <Satir label="AT NEXT LV" value={bilgi.sonra} tone={C.ok} />}
    </Kart>
  );
}

// ── ray ───────────────────────────────────────────────────────────────

export function BuildRail({ weapons, passives, revivalLeft, dar }: {
  weapons: RailWeapon[];
  passives: RailPassive[];
  revivalLeft: number;
  /** dar ekran — ray küçülür ve TIKLANMAZ olur (bkz. dosya başlığı) */
  dar: boolean;
}) {
  const [secim, setSecim] = useState<Secim>(null);
  if (weapons.length === 0 && passives.length === 0 && revivalLeft <= 0) return null;

  const olcek = dar ? 2 : 3;          // 32 px / 48 px — kit ölçeği TAM SAYI olmak zorunda
  const kutu = 16 * olcek;
  const ikon = dar ? 22 : 34;
  const etkilesim: 'none' | 'auto' = dar ? 'none' : 'auto';

  /**
   * ⚠️ DAR EKRANDA KART HİÇ ÇİZİLMİYOR — "açılamaz" YETMEZ. Masaüstünde bir
   * slotun üstündeyken pencereyi daraltan oyuncuda seçim durumu KALIYORDU
   * ve kart telefon genişliğinde ekranın yarısını kaplıyordu (ölçüldü:
   * 375 px'de 244 px'lik kart oyun alanının %65'i). `dar` kontrolü seçimi
   * çizime kadar taşımıyor; durumu temizlemeye gerek kalmıyor.
   */
  const secilenSilah = !dar && secim?.startsWith('w:')
    ? weapons.find((w) => `w:${w.id}` === secim) ?? null : null;
  const secilenPasif = !dar && secim?.startsWith('p:')
    ? passives.find((p) => `p:${p.id}` === secim) ?? null : null;

  const sutun = (baslik: string, cocuk: ReactNode) => (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
      {!dar && <Baslik text={baslik} />}
      <div style={{ display: 'flex', flexDirection: 'column', gap: SATIR_ARA }}>{cocuk}</div>
    </div>
  );

  return (
    <div style={{
      position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)',
      display: 'flex', alignItems: 'flex-start', gap: 8,
      pointerEvents: 'none', zIndex: 3,
    }}>
      {weapons.length > 0 && sutun('ARMS', weapons.map((w) => {
        const def = weaponById(w.id);
        const maxed = !!def && w.level >= def.maxLevel;
        const evrim = evrimDurumu(w.id, w.level, passives);
        const hazir = !!evrim && evrim.silahTamam && evrim.pasifTamam;
        const anahtar = `w:${w.id}`;
        return (
          <div key={w.id} style={{ position: 'relative', pointerEvents: etkilesim }}
            onMouseEnter={() => setSecim(anahtar)} onMouseLeave={() => setSecim(null)}>
            <CooldownRing pct={w.cd / w.cdMax} size={kutu}>
              <Slot type="Weapon" variant="02" scale={olcek} title={`${w.name} L${w.level}`}>
                <img src={weaponArt(w.id).icon} alt="" width={ikon} height={ikon}
                  style={{ imageRendering: 'pixelated', display: 'block' }} />
              </Slot>
            </CooldownRing>
            <Pip level={w.level} max={maxed} tone={C.candle} />
            {/* ⚠️ EVRİM İŞARETİ RAYDA: koşunun en değerli bilgisi, level-up
                kartı açılana kadar hiçbir yerde görünmüyordu — oyuncu şartı
                tuttuğunu ancak bir sonraki seçim ekranında öğreniyordu. */}
            {hazir && (
              <span style={{
                position: 'absolute', left: -3, top: -3, width: 9, height: 9,
                borderRadius: '50%', background: C.candle,
                boxShadow: `0 0 7px ${C.candle}`, border: `1px solid ${C.void}`,
              }} />
            )}
            {secim === anahtar && <Vurgu tone={C.candle} />}
          </div>
        );
      }))}

      {(passives.length > 0 || revivalLeft > 0) && sutun('CHARMS', (
        <>
          {passives.map((p) => {
            const bilgi = pasifBilgi(p.id, p.level);
            const anahtar = `p:${p.id}`;
            return (
              <div key={p.id} style={{ position: 'relative', pointerEvents: etkilesim }}
                onMouseEnter={() => setSecim(anahtar)} onMouseLeave={() => setSecim(null)}>
                <Slot type="Ring" variant="02" scale={olcek} title={`${p.name} L${p.level}`}>
                  <img src={passiveIcon(p.id)} alt="" width={ikon - 2} height={ikon - 2}
                    style={{ imageRendering: 'pixelated', display: 'block' }} />
                </Slot>
                <Pip level={p.level} max={!!bilgi?.maxed} tone={C.ice} />
                {secim === anahtar && <Vurgu tone={C.ice} />}
              </div>
            );
          })}

          {/* ⚠️ DİRİLİŞ HAKKI: DÖRT yerden satın alınabiliyor (Forge "Second
              Burial", aynı adlı pasif, "Grave Offering" tılsımı, sigil
              ekipmanı) ve oyuncu kaçı kaldığını ölene kadar göremiyordu.
              KALAN gösteriliyor, harcanmış değil. */}
          {revivalLeft > 0 && (
            <div style={{
              width: kutu, height: dar ? 22 : 26, borderRadius: 6,
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 3,
              border: `1px solid ${C.ok}66`, background: 'rgba(6,5,4,0.6)',
              fontFamily: FONT.ui, fontSize: dar ? 10 : 11, fontWeight: 900, color: C.ok,
            }} title={`${revivalLeft} revival left — you get back up at half health`}>
              <Icon name="sigil" scale={1} />
              ×{revivalLeft}
            </div>
          )}
        </>
      ))}

      {/* ⚠️ KART RAYIN COCUGU, SATIRIN DEGIL — konumu rayın merkezine göre
          çözülüyor (bkz. `Kart`). Satır içinde dursaydı en üstteki slotun
          kartı kısa pencerede ekranın dışına taşardı. */}
      {secilenSilah && <SilahKarti w={secilenSilah} passives={passives} />}
      {secilenPasif && <PasifKarti p={secilenPasif} />}
    </div>
  );
}
