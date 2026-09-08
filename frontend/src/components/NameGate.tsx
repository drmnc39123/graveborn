'use client';
// AD KAPISI — cüzdan bağlandıktan sonra, oyuna başlamadan önce.
//
// 🔴 NİYE VAR (kullanıcı): *"Oyuncu kayıt olurken zorunlu olarak açılacak
// bir pencerede, oyuna başlamadan önce bir nick koysun. Navbardaki
// butonların tarzında, piksel görünümde bir kart olsun."*
//
// ⚠️ YENİ BİR GÖRSEL DİL İCAT EDİLMİYOR: `Panel variant="07A" scale={3}`
// ana sayfadaki GRAVEBORN tabelasının aynısı, `PixelButton` navbarın
// kullandığı bileşenin ta kendisi. Aynı dokuz-dilim çerçeve, aynı font.
//
// 🔴 BU PENCERE KAPATILAMAZ — VE BU DEPODA BİR İSTİSNA.
// `FirstRun.tsx` başlığı oyuncuyu bir pencerenin arkasına HAPSETMEMEYİ
// savunuyor ve haklı; ama o bir TANITIM, bu bir KİMLİK. Adsız oyuncu
// sohbette, sıralamada ve düelloda `7dau…Bo4` olarak görünür — yani
// kapatılabilir yapmak, "sonra hallederim" diyen herkesi kalıcı olarak
// adresine mahkûm etmek olurdu. İstisna bilinçli ve tek.
//
// ⚠️ DEMO'DA ASLA AÇILMAZ. Demo'nun kuralı: cüzdan yokken SIFIR backend
// çağrısı. Çağıran taraf `wallet` verdiği için burada ikinci bir kapı
// gerekmiyor, ama gerekçe burada yazılı.
//
// ⚠️ Tüm stiller INLINE · MOR YOK · oyuncu metni İngilizce.

import { useCallback, useEffect, useRef, useState } from 'react';
import { AD_MAX, AD_MIN, renameCost, validatePlayerName } from '@/game/playerName';
import { checkPlayerName, setPlayerName } from '@/lib/gameSession';
import { BTN, Panel, PixelButton } from '@/components/ui/kit';
import { C, FONT } from '@/lib/theme';
import type { Progress } from '@/game/progress';

export function NameGate({ onDone }: { onDone: (p: Progress) => void }) {
  const [ad, setAd] = useState('');
  const [durum, setDurum] = useState<'bos' | 'bakiliyor' | 'musait' | 'hata'>('bos');
  const [mesaj, setMesaj] = useState<string | null>(null);
  const [gonderiliyor, setGonderiliyor] = useState(false);
  const zamanlayici = useRef<ReturnType<typeof setTimeout> | null>(null);
  const girisRef = useRef<HTMLInputElement>(null);

  // ⚠️ Odak otomatik: pencere zorunlu, oyuncuyu bir de tıklamaya zorlamak
  // gereksiz sürtünme.
  useEffect(() => { girisRef.current?.focus(); }, []);

  /**
   * CANLI MÜSAİTLİK.
   *
   * 🔴 NİYE: "gönder" dedikten sonra "bu ad alınmış" demek en pahalı hata
   * biçimi — `GuildPanel` de aynı dersi taşıyor. Oyuncu yazarken öğreniyor.
   * ⚠️ GECİKMELİ: her tuşta sunucuya gitmek 16 karakterlik bir adda 16
   * istek demekti.
   * ⚠️ BU BİR REZERVASYON DEĞİL: iki oyuncu aynı anda "musait" görebilir.
   * Gerçek kapı yazma anındaki `@unique`; burası yalnız nezaket.
   */
  useEffect(() => {
    if (zamanlayici.current) clearTimeout(zamanlayici.current);
    const yerel = validatePlayerName(ad);
    if (!yerel.ok) {
      // ⚠️ Boş kutuda hata gösterme: daha bir şey yazmamış oyuncuyu
      // azarlamak olurdu.
      setDurum(ad.length === 0 ? 'bos' : 'hata');
      setMesaj(ad.length === 0 ? null : yerel.reason);
      return;
    }
    setDurum('bakiliyor');
    setMesaj(null);
    zamanlayici.current = setTimeout(() => {
      checkPlayerName(yerel.value)
        .then((r) => {
          setDurum(r.ok ? 'musait' : 'hata');
          setMesaj(r.ok ? null : (r.reason ?? 'That name is taken.'));
        })
        // ⚠️ Ağ hatası "alınmış" demek DEĞİL: oyuncuyu yanlış bilgiyle
        // vazgeçirmektense göndermesine izin ver, sunucu son sözü söyler.
        .catch(() => { setDurum('musait'); setMesaj(null); });
    }, 350);
    return () => { if (zamanlayici.current) clearTimeout(zamanlayici.current); };
  }, [ad]);

  const gonder = useCallback(() => {
    const v = validatePlayerName(ad);
    if (!v.ok || gonderiliyor) return;
    setGonderiliyor(true);
    setPlayerName(v.value)
      .then(onDone)
      .catch((e: Error) => {
        setDurum('hata');
        setMesaj(e.message || 'That name cannot be used.');
        setGonderiliyor(false);
      });
  }, [ad, gonderiliyor, onDone]);

  const hazir = durum === 'musait' && !gonderiliyor;

  return (
    <div style={{
      position: 'absolute', inset: 0, zIndex: 40,
      display: 'grid', placeItems: 'center', padding: 16,
      // ⚠️ Arkayı KAPATIYOR: pencere zorunlu, altındaki köye tıklanmamalı.
      background: 'rgba(10,8,6,0.88)',
    }}>
      <Panel variant="07A" scale={3} pad={12} style={{ width: 'min(94vw, 400px)' }}>
        <div style={{ fontFamily: FONT.ui, textAlign: 'center' }}>
          <div style={{ fontSize: 10, fontWeight: 900, letterSpacing: 2, color: C.blood }}>
            BEFORE YOU GO DOWN
          </div>
          <div style={{ fontSize: 19, fontWeight: 900, color: C.bone, margin: '6px 0 3px' }}>
            What do they call you?
          </div>
          {/* ⚠️ NİYE SORULDUĞU YAZILI: zorunlu bir pencereyi gerekçesiz
              göstermek, oyuncuya "form doldur" demektir. */}
          <div style={{ fontSize: 11, color: C.boneDim, lineHeight: 1.55, marginBottom: 12 }}>
            The ladder, the duels and the square will show this name instead of
            your wallet.
          </div>

          <input
            ref={girisRef}
            value={ad}
            onChange={(e) => setAd(e.target.value)}
            /**
             * 🔴 `stopPropagation` ŞART. Köyün tuş dinleyicisi `window`'da:
             * adına "wasd" yazan oyuncunun karakteri de yürürdü.
             * `ChatPanel` bu dersi zaten taşıyor — aynı tuzak, aynı çözüm.
             */
            onKeyDown={(e) => {
              e.stopPropagation();
              if (e.key === 'Enter' && hazir) gonder();
            }}
            placeholder={`${AD_MIN}-${AD_MAX} characters`}
            maxLength={AD_MAX}
            spellCheck={false}
            autoComplete="off"
            style={{
              width: '100%', boxSizing: 'border-box', padding: '8px 10px',
              borderRadius: 6, textAlign: 'center',
              border: `1px solid ${durum === 'hata' ? C.blood : durum === 'musait' ? C.ok : C.border}`,
              background: 'rgba(0,0,0,0.35)', color: C.bone,
              fontFamily: FONT.ui, fontSize: 15, fontWeight: 900, letterSpacing: 1,
              outline: 'none',
            }}
          />

          {/* ⚠️ DURUM SATIRI HER ZAMAN YER KAPLIYOR (`minHeight`): görünüp
              kaybolan bir satır kartı zıplatır ve düğme parmağın altından
              kayar. */}
          <div style={{
            minHeight: 16, marginTop: 6, fontSize: 10.5, lineHeight: 1.4,
            color: durum === 'hata' ? C.bloodSoft : durum === 'musait' ? C.ok : C.boneFaint,
          }}>
            {durum === 'bakiliyor' && 'Checking…'}
            {durum === 'musait' && 'That name is free.'}
            {durum === 'hata' && mesaj}
          </div>

          <div style={{ marginTop: 10 }}>
            <PixelButton
              variant={BTN.action} scale={3} disabled={!hazir} onClick={gonder}
              style={{ width: '100%', fontSize: 12, fontWeight: 900, letterSpacing: 1.2 }}
            >
              {gonderiliyor ? 'CLAIMING…' : 'CLAIM IT'}
            </PixelButton>
          </div>

          {/* 🔴 FİYAT ÖNDEN SÖYLENİYOR. Sonradan öğrenmek ilk destek
              talebini üretir: "adımı değiştirmek istedim, gold istedi."
              Bir bedeli sonradan duyurmak, onu gizlemekle aynı şeydir. */}
          <div style={{ marginTop: 9, fontSize: 9.5, color: C.boneFaint, lineHeight: 1.5 }}>
            This first one is free. Changing it later costs{' '}
            {renameCost(1).toLocaleString('en-US')} gold, and more each time after that.
          </div>
        </div>
      </Panel>
    </div>
  );
}
