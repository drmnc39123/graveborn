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
import { PET_ART } from '@/game/sprites';
import type { Progress } from '@/game/progress';
import { Card, PanelHead, Tag } from '@/components/ui/cards';
import { BTN, Icon, IconText, PixelButton, type IconName } from '@/components/ui/kit';
import { bindPet, upgradePet, fusePet, equipPets, buyPetSlot } from '@/lib/gameSession';
import { play } from '@/game/sfx';
import { C, FONT, glass } from '@/lib/theme';

/**
 * PET PORTRESİ — kartın asıl eksik parçasıydı.
 *
 * 🔴 Panel ilk sürümde pet'lerin RESMİNİ HİÇ göstermiyordu: 12 kart metin +
 * küçük bir stat ikonuydu. Bir koleksiyon ekranının topladığın şeyi
 * göstermemesi, ekranın kendi işini yapmaması demek.
 *
 * ⚠️ SPRITE SAYFASINDAN TEK KARE KIRPILIYOR, ayrı portre dosyası YOK —
 * öyle bir dosya da yok. Topdown sayfaları 640×1440, yani 80px'lik 8 sütun ×
 * 18 satır; ilk kare (0,0) idle duruşu. Bone Archer şerit: 224×32, 7 kare.
 *
 * ⚠️ BOYUTLAR ÖLÇÜLDÜ, MANİFEST'E GÜVENİLMEDİ — `manifest.json` bone archer
 * şeridini 32×32 yazıyor (kare boyutu), dosya ise 224×32. Manifest'e göre
 * kırpsaydık portre tek bir iskeletin yedide birini gösterirdi.
 */
const TOPDOWN_SAYFA = { w: 640, h: 1440 };   // 8 sütun × 18 satır, 80px kare

/**
 * ⚠️ SIKI KIRPMA — 80×80'lik karenin TAMAMI değil.
 *
 * Ölçüldü: 11 topdown yaratığın hiçbiri karesini doldurmuyor, dolgu oranı
 * %10,6 ile %22,6 arasında ve içerik hep aynı bölgede — x 17-62, y 12-66.
 * Kareyi olduğu gibi göstermek 60 px'lik kutuda ~27 px'lik bir yaratık
 * demekti; "resim var ama küçücük" tam olarak paneli basit gösteren şeydi.
 *
 * Ortak kutu 56×56 ve (12,10)'dan başlıyor: her yaratığı payla içine alıyor,
 * hiçbirini kesmiyor. Pet başına ayrı kutu YAZILMADI — sayılar birbirine
 * yeterince yakın ve on iki sabit, tek sabitten daha kırılgan olurdu.
 */
const KIRP = { x: 12, y: 10, boy: 56 };

function PetPortrait({ artKey, size, bagli }: { artKey: string; size: number; bagli: boolean }) {
  const a = PET_ART[artKey]?.anims.idle ?? PET_ART[artKey]?.anims.walk;

  let kare: React.CSSProperties = {};
  if (a?.kind === 'grid') {
    // Kutu `boy` kaynak pikselini `size` ekran pikselinde gösterecek
    const olcek = size / KIRP.boy;
    kare = {
      backgroundSize: `${TOPDOWN_SAYFA.w * olcek}px ${TOPDOWN_SAYFA.h * olcek}px`,
      backgroundPosition: `${-KIRP.x * olcek}px ${-KIRP.y * olcek}px`,
    };
  } else if (a?.kind === 'sheet') {
    // ⚠️ ŞERİTTE KIRPMA YOK: Bone Archer karesini %43,8 dolduruyor ve içerik
    // kutusu (2,2)-(29,29), yani zaten sıkı. Aynı kırpmayı uygulamak onu
    // kesip başını uçururdu.
    kare = {
      backgroundSize: `${(a.frames ?? 1) * 100}% 100%`,
      backgroundPosition: '0% 0%',
    };
  }
  const arka = a?.src ?? '';

  return (
    <span style={{
      width: size, height: size, flexShrink: 0, borderRadius: 7,
      display: 'block', position: 'relative', overflow: 'hidden',
      backgroundImage: `url("${arka}")`,
      backgroundRepeat: 'no-repeat',
      imageRendering: 'pixelated',
      ...kare,
      // ⚠️ BAĞLANMAMIŞ PET SİLUET. Koleksiyon oyunlarının kuralı: sahip
      // olmadığını GÖSTER ama VERME. Gizleseydik oyuncu neyi kaçırdığını
      // bilmez, tam renkli gösterseydik bağlamanın anlamı kalmazdı.
      //
      // 🔴 İLK DEĞERLER `grayscale(1) brightness(0.32)` İDİ ve EKRANDA
      // SİMSİYAH KUTU ÇIKIYORDU — yaratığın SİLUETİ bile okunmuyordu, yani
      // "resim ekledim" derken hiçbir şey eklenmemişti. Siluetin işi şekli
      // GÖSTERMEK; karartmak değil. Şimdi soğuk bir hayalet tonu: gri değil
      // mavimsi, parlaklık okunacak kadar açık.
      filter: bagli
        ? 'none'
        : 'grayscale(0.85) brightness(0.78) contrast(1.15) sepia(0.25) hue-rotate(175deg) saturate(1.6)',
      opacity: bagli ? 1 : 0.72,
    }} />
  );
}

/** Rolün oyuncuya ne yaptığı — tek cümle, oyun terimiyle */
const ROL_METNI: Record<string, { ad: string; ne: string; renk: string; ikon: IconName }> = {
  striker: { ad: 'STRIKER', ne: 'Strikes the nearest enemy', renk: C.blood, ikon: 'damage' },
  channeler: { ad: 'CHANNELER', ne: 'Blasts everything around it', renk: C.candle, ikon: 'magic' },
  warden: { ad: 'WARDEN', ne: 'Mends your wounds', renk: C.ok, ikon: 'heal' },
  forager: { ad: 'FORAGER', ne: 'Finds more gold, pulls it further', renk: C.ice, ikon: 'magnet' },
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
        <IconText name="gold" scale={1} style={{ fontSize: 17, fontWeight: 900, color: C.candle }}>
          {Math.floor(progress.gold).toLocaleString('en-US')} GOLD
        </IconText>
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
          <PixelButton
            variant={BTN.buy} scale={2}
            disabled={enDerin < SLOT2.depth || progress.gold < SLOT2.gold || busy !== null}
            onClick={() => calistir('slot', 'buy', buyPetSlot)}
            style={{ fontSize: 11, fontWeight: 900, minWidth: 0, padding: '0 10px' }}>
            {SLOT2.gold.toLocaleString('en-US')} G
          </PixelButton>
        </div>
      )}

      {/* ⚠️ İKİ SÜTUN — 12 pet tek sütunda uzun bir kaydırma yapıyordu ve
          kartların sağ tarafı boş kalıyordu (durum satırı sola yaslı, düğme
          satırı sağa yaslı; ikisinin arası ölü alan).
          ⚠️ KART YAPISINA DOKUNULMADI. Satırları birleştirmek o ölü alanı
          kapatırdı ama üç yatay satır düzeni "hepsi kayık ve sığmıyor"
          şikâyetinin DÜZELTMESİ — sarma geri gelirse kartlar yine birbirinden
          farklı görünür. Dar sütun zaten boşluğu görünmez hâle getiriyor.
          ⚠️ `minmax(360px)` — kart içeriği (portre + ad + rol + düğmeler)
          bunun altında sıkışır; dar ekranda kendiliğinden tek sütuna düşer. */}
      <div style={{
        display: 'grid', gap: 8,
        gridTemplateColumns: 'repeat(auto-fill, minmax(360px, 1fr))',
        alignItems: 'start',
      }}>
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
            {/* 🔴 KART TAMAMEN YENİDEN DİZİLDİ. Önceki hâli üç sütunu
                `flexWrap` ile yan yana koyuyordu ve ekranda REZALET
                görünüyordu: sağ sütunun içeriği (LV + etki + üç düğme)
                genişleyince blok komple alta düşüyor, o kart bambaşka bir
                düzene bürünüyordu. On iki kartın on ikisi farklı görünüyordu
                — "hepsi kayık ve sığmıyor gibi" tam olarak buydu.

                ⚠️ SARMA YERİNE SABİT RİTİM. Kart artık üç YATAY satır:
                  1) portre + ad/nadirlik/rol   (portre sabit, metin esner)
                  2) durum + etki (şimdi → sonra)
                  3) düğmeler — HER ZAMAN kendi satırında, sağa yaslı
                İçerik ne kadar uzarsa uzasın iskelet değişmiyor; kartlar
                birbirinin aynısı okunuyor. */}
            <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
              {/* ── PORTRE ── kartın ilk okunan şeyi bu olmalı, metin değil */}
              <div style={{
                position: 'relative', flexShrink: 0,
                padding: 4, borderRadius: 9,
                // ⚠️ ÇERÇEVE NADİRLİK RENGİNDE ve MYTHIC'te altın. Rozet zaten
                // yazıyor ama 12 kartlık bir listede oyuncu ÖNCE renge bakar,
                // sonra okur — çerçeve o taramayı ücretsiz yapıyor.
                // 🔴 ZEMİN ÇOK AÇIKTI. Panelin kendisi pembe-mor; portre kutusu
                // da yarı saydam olunca sprite zemine karışıyordu. Piksel sanat
                // KOYU ve DÜZ bir zemin ister — yoksa kenarları erir.
                border: `1px solid ${mythic ? C.candle : rar.color}${bagli ? '88' : '33'}`,
                background: bagli
                  ? `radial-gradient(circle at 50% 32%, ${mythic ? C.candle : rar.color}2e, #0a080e 72%)`
                  : '#0a080e',
                boxShadow: 'inset 0 0 0 1px rgba(0,0,0,0.55)',
              }}>
                <PetPortrait artKey={def.art} size={60} bagli={bagli} />
                {/* Seviye rozeti portrenin üstünde — "kaçıncı seviyede" sorusu
                    kartın en sık sorulanı ve en uzağındaydı. */}
                {bagli && (
                  <span style={{
                    position: 'absolute', right: -3, bottom: -3,
                    fontSize: 9, fontWeight: 900, lineHeight: 1,
                    padding: '3px 5px', borderRadius: 5,
                    color: '#0d0b12', background: mythic ? C.candle : rar.color,
                    border: '1px solid rgba(0,0,0,0.45)',
                  }}>
                    {lv}
                  </span>
                )}
              </div>

              <div style={{ minWidth: 0, flex: 1 }}>
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
                  {/* 🔴 ROL ROZETİ KALDIRILDI — rol zaten aşağıdaki açıklama
                      satırında ikonu ve rengiyle duruyordu, yani AYNI BİLGİ
                      kartta iki kez vardı. Ekranda ölçüldü: ad + nadirlik +
                      rol rozeti 170 px'lik sütuna sığmıyor ve rozet alt satıra
                      kayıyordu; kart iki satırlık bir başlıkla şişiyordu.
                      Tekrarı silmek hem yer açtı hem satır kaymasını bitirdi. */}
                  {takiliMi && <Tag tone="ok">CARRIED</Tag>}
                </div>
                <div style={{ fontSize: 10.5, color: C.boneDim, marginTop: 3, lineHeight: 1.35 }}>{def.blurb}</div>
                {/* 🔴 ROL SATIRI OKUNMUYORDU: rolün kendi rengi (koyu kırmızı,
                    yeşil) panelin pembe-mor zemininde eriyordu. Renk ROZETTE
                    kalıyor, cümle kemik renginde yazılıyor — renk kimliği
                    kaybolmadan okunurluk geri geliyor. */}
                <IconText name={rol.ikon}
                  style={{ fontSize: 11, color: C.bone, marginTop: 5, fontWeight: 700 }}>
                  <span style={{ borderLeft: `2px solid ${rol.renk}`, paddingLeft: 6 }}>
                    <b style={{ color: rol.renk, letterSpacing: 0.5 }}>{rol.ad}</b>
                    <span style={{ color: C.boneDim, fontWeight: 400 }}> · {rol.ne}</span>
                  </span>
                </IconText>
              </div>

            </div>

            {/* ── 2. SATIR: DURUM + ETKİ ──
                Tam genişlik, sola yaslı. Sağ sütunda sıkışıp sarmıyor. */}
            <div style={{
              marginTop: 8, paddingTop: 8, fontFamily: FONT.ui,
              borderTop: '1px solid rgba(255,255,255,0.07)',
            }}>
              {!bagli ? (
                // ⚠️ NEDEN ALAMIYORUM — eksik olan koşul, sayısıyla. Kafatası
                // ikonu bezeme DEĞİL: bağlamanın gold dışında ikinci bir koşulu
                // olduğunu tek bakışta söyleyen şey o.
                // ⚠️ KOŞUL SAĞLANINCA KESİR GÖSTERİLMİYOR. Eskiden her iki
                // durumda da "X / Y slain" yazıyordu ve şart aşılınca ekranda
                // "400 / 150 slain" çıkıyordu — 1'i geçen bir kesir, yeşil
                // bile olsa HATA gibi okunuyor. Gerçek sayı korunuyor (kaç
                // öldürdüğün bilgi), ama sonucu kesir değil KELİME söylüyor.
                <IconText name="skull" dim={kill < gerekenKill}
                  style={{ fontSize: 11, color: kill >= gerekenKill ? C.ok : C.boneFaint }}>
                  {kill >= gerekenKill ? (
                    <>{kill.toLocaleString('en-US')} slain · enough</>
                  ) : (
                    <>
                      {kill.toLocaleString('en-US')} / {gerekenKill.toLocaleString('en-US')} slain
                      <span style={{ color: C.boneFaint }}>
                        {' '}· {(gerekenKill - kill).toLocaleString('en-US')} more
                      </span>
                    </>
                  )}
                </IconText>
              ) : (
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 10.5, fontWeight: 900, color: C.boneFaint, letterSpacing: 0.6 }}>
                    LV {lv}/{tavan}{kopya > 1 ? ` · ${kopya}/${FUSE_COPIES} COPIES` : ''}
                  </span>
                  {/* ⚠️ ŞİMDİ → SONRA. Sadece "yükselt" demek oyuncuya neyi satın
                      aldığını söylemiyor; kartın asıl işi bu farkı göstermek. */}
                  <span style={{ fontSize: 11, color: C.bone }}>
                    {etkiMetni(def, lv, mythic)}
                    {lv < tavan && (
                      <span style={{ color: C.ok }}> → {etkiMetni(def, lv + 1, mythic)}</span>
                    )}
                  </span>
                </div>
              )}
            </div>

            {/* ── 3. SATIR: DÜĞMELER ──
                ⚠️ HER ZAMAN KENDİ SATIRINDA ve sağa yaslı. Metnin yanına
                koymak, uzun etki cümlesi olan kartlarda düğmeleri alta
                itiyordu ve her kart farklı görünüyordu. */}
            <div style={{
              display: 'flex', gap: 6, justifyContent: 'flex-end',
              marginTop: 8, flexWrap: 'wrap',
            }}>
              {!bagli ? (
                <PixelButton
                  variant={BTN.buy} scale={2}
                  disabled={kill < gerekenKill || progress.gold < bindGold || busy !== null}
                  onClick={() => calistir(def.id, 'buy', () => bindPet(def.id))}
                  style={{ fontSize: 10.5, fontWeight: 900, minWidth: 0, padding: '0 8px' }}>
                  BIND · {bindGold.toLocaleString('en-US')} G
                </PixelButton>
              ) : (
                <>
                  <PixelButton
                    variant={BTN.buy} scale={2}
                    disabled={lv >= tavan || progress.gold < yukseltmeBedeli || busy !== null}
                    onClick={() => calistir(def.id, 'buy', () => upgradePet(def.id))}
                    style={{ fontSize: 10.5, fontWeight: 900, minWidth: 0, padding: '0 8px' }}>
                    {lv >= tavan ? 'MAX' : `LV ${lv + 1} · ${yukseltmeBedeli.toLocaleString('en-US')} G`}
                  </PixelButton>

                  {def.rarity === 'legendary' && !mythic && kopya < FUSE_COPIES && (
                    <PixelButton
                      variant={BTN.action} scale={2}
                      disabled={kill < gerekenKill || progress.gold < bindGold || busy !== null}
                      onClick={() => calistir(def.id, 'buy', () => bindPet(def.id))}
                      title={kill >= gerekenKill
                        ? `${kill.toLocaleString('en-US')} slain — enough`
                        : `${kill.toLocaleString('en-US')} / ${gerekenKill.toLocaleString('en-US')} slain`}
                      style={{ fontSize: 10.5, fontWeight: 900, minWidth: 0, padding: '0 8px' }}>
                      +1 COPY
                    </PixelButton>
                  )}

                  {def.rarity === 'legendary' && !mythic && (
                    <PixelButton
                      variant={BTN.strong} scale={2}
                      disabled={!fuseHazir || progress.gold < FUSE_GOLD || busy !== null}
                      onClick={() => calistir(def.id, 'buy', () => fusePet(def.id))}
                      title={`Needs ${FUSE_COPIES} copies — bind it again to gather them`}
                      style={{ fontSize: 10.5, fontWeight: 900, minWidth: 0, padding: '0 8px' }}>
                      FUSE → LV{MYTHIC_CAP}
                    </PixelButton>
                  )}

                  <PixelButton
                    variant={BTN.action} scale={2} active={takiliMi}
                    disabled={busy !== null}
                    onClick={() => calistir(def.id, 'equip', () => equipPets(
                      takiliMi ? takili.filter((x) => x !== def.id)
                        : [...takili, def.id].slice(-yuva),
                    ))}
                    style={{ fontSize: 10.5, fontWeight: 900, minWidth: 0, padding: '0 8px' }}>
                    {takiliMi ? 'CARRIED' : 'CARRY'}
                  </PixelButton>
                </>
              )}
            </div>
          </Card>
        );
      })}
      </div>
    </>
  );
}
