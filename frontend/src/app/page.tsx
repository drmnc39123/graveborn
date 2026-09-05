'use client';
// ANA SAYFA — oyunun kapısı.
//
// Tasarım: arka planda oyunun GERÇEK köyü yavaşça süzülür, üstünde koyu bir
// perde, ortada tabela ve iki kapı: cüzdanla gir ya da demoyu oyna.
//
// Demo neden var: cüzdan zorunlu bir kapı, oyunu görmeden cüzdan bağlamak
// istemeyen herkesi kapıda kaybeder. Demo huniyi açık tutar; kaydı olmayan
// bir vitrin, kısa yol değil (bkz. lib/session.ts).

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { MenuBackground } from '@/components/MenuBackground';
import { HomeSections } from '@/components/HomeSections';
import { Panel, PixelButton } from '@/components/ui/kit';
import { Turnstile, turnstileEnabled } from '@/components/Turnstile';
import { BRAND, C, FONT, glass } from '@/lib/theme';
import { fetchStats, setMode, signInWithWallet } from '@/lib/session';
import {
  type Cuzdan, KURULUM, MOBIL_CUZDANLAR, bulunanCuzdanlar, cuzdanlariIzle, mobilMi,
} from '@/lib/wallets';

export default function Home() {
  const router = useRouter();
  const [stats, setStats] = useState<{ players: number; runs: number } | null>(null);
  const [busy, setBusy] = useState<'wallet' | 'demo' | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [captcha, setCaptcha] = useState<string | null>(null);
  const [cuzdanlar, setCuzdanlar] = useState<Cuzdan[]>([]);
  const [secici, setSecici] = useState(false);
  const [mobil, setMobil] = useState(false);

  useEffect(() => { fetchStats().then(setStats); }, []);

  /**
   * ⚠️ CÜZDAN LİSTESİ TEK SEFERLİK OKUNAMAZ. Eklentiler sayfayla aynı anda
   * yüklenmiyor; ilk karede liste boş olup 200 ms sonra dolabiliyor. Tek
   * bir okuma yapsaydık oyuncu kurulu cüzdanını görmez, "cüzdan yok"
   * ekranıyla karşılaşırdı. Wallet Standard geç kaydolanları haber veriyor.
   */
  useEffect(() => {
    setMobil(mobilMi());
    const tazele = () => setCuzdanlar(bulunanCuzdanlar());
    tazele();
    const birak = cuzdanlariIzle(tazele);
    const t = setTimeout(tazele, 600);
    return () => { birak(); clearTimeout(t); };
  }, []);

  const needCaptcha = turnstileEnabled() && !captcha;

  const onDemo = () => {
    setMode('demo');
    setBusy('demo');
    router.push('/play');
  };

  const baglan = async (c: Cuzdan) => {
    setErr(null);
    setSecici(false);
    setBusy('wallet');
    try {
      await signInWithWallet(c, captcha ?? undefined);
      router.push('/play');
    } catch (e) {
      const code = e instanceof Error ? e.message : 'hata';
      // Kullanıcı imzayı reddettiyse bu bir hata değil, bir karardır
      setErr(/reject|denied|4001/i.test(code) ? null : 'baglanti');
      setBusy(null);
    }
  };

  /**
   * ⚠️ TEK CÜZDAN VARSA SEÇİM EKRANI GÖSTERİLMİYOR. Tek seçenekli bir liste
   * kullanıcıya karar verdirmez, sadece fazladan bir tık koyar — eski tek
   * düğmeli akış o durumda aynen korunuyor.
   */
  const onWallet = () => {
    setErr(null);
    if (cuzdanlar.length === 1) { void baglan(cuzdanlar[0]); return; }
    setSecici((v) => !v);
  };

  return (
    <main style={{ position: 'fixed', inset: 0, overflow: 'auto' }}>
      <MenuBackground />

      {/* ⚠️ Kapı TAM EKRAN kalıyor (minHeight 100vh): ziyaretçi ilk anda
          sadece "gir" kararıyla karşılaşsın. İçerik bölümleri ALTINDA —
          isteyen kaydırıp okur, istemeyen tek tıkla girer. Kapıyı içerikle
          doldurmak huniyi yavaşlatırdı. */}
      <div style={{
        position: 'relative', zIndex: 1, minHeight: '100vh',
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        justifyContent: 'center', padding: '40px 20px', gap: 18,
      }}>
        {/* ── TABELA ── */}
        <Panel variant="07A" scale={3} pad={10} style={{ maxWidth: 560, width: '100%' }}>
          <div style={{ textAlign: 'center' }}>
            <div style={{
              fontFamily: FONT.title, fontSize: 'clamp(38px, 9vw, 64px)', fontWeight: 900,
              letterSpacing: 2, lineHeight: 1, color: C.bone,
              textShadow: `0 0 26px rgba(160,18,38,0.55), 0 3px 0 ${C.void}`,
            }}>
              {BRAND.name}
            </div>
            <div style={{
              marginTop: 8, fontFamily: FONT.ui, fontSize: 11.5, letterSpacing: 1.4,
              color: C.candle, fontWeight: 900,
            }}>
              ON SOLANA · ${BRAND.ticker}
            </div>
          </div>
        </Panel>

        <div style={{
          fontFamily: FONT.ui, fontSize: 'clamp(12px, 2.4vw, 14px)', color: C.boneDim,
          textAlign: 'center', textShadow: `0 2px 8px ${C.void}`,
        }}>
          Clear the stage · descend forever · <span style={{ color: C.bone }}>rise again</span>
        </div>

        {/* Sunucu kapalıysa bu satır hiç görünmez — uydurma sayı göstermeyiz */}
        {stats && (
          <div style={{ fontFamily: FONT.ui, fontSize: 11.5, color: C.boneFaint }}>
            {stats.players.toLocaleString('en-US')} gravebound · {stats.runs.toLocaleString('en-US')} descents survived
          </div>
        )}

        {/* ── BOT KONTROLÜ ── (anahtar tanımlıysa görünür) */}
        <Turnstile onToken={setCaptcha} />

        {/* ── KAPILAR ── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 9, width: 'min(92vw, 330px)', marginTop: 4 }}>
          <PixelButton
            variant="02A" scale={3}
            disabled={busy !== null || needCaptcha}
            onClick={onWallet}
            style={{ width: '100%', fontSize: 13, fontWeight: 900, letterSpacing: 1.4 }}
          >
            {busy === 'wallet' ? 'CONNECTING…' : 'CONNECT WALLET'}
          </PixelButton>

          {/* ⚠️ DEMO CAPTCHA'YA BAĞLI DEĞİL — bilerek.
              Demo sunucuya HİÇ dokunmuyor (ilerleme localStorage'da, tek bir
              uç bile çağrılmıyor). Bot kontrolünün koruduğu şey HESAP AÇMA,
              yani cüzdan girişi. Demoyu da kilitlemek, hiçbir şeyi
              korumadan huninin EN TEPESİNE sürtünme koymaktı: oyuncu daha
              oyunu görmeden bir doğrulama ekranıyla karşılaşıyordu.
              Demo bir vitrindir; vitrinin kapısına kilit takılmaz. */}
          <PixelButton
            variant="01A" scale={3}
            disabled={busy !== null}
            onClick={onDemo}
            style={{ width: '100%', fontSize: 13, fontWeight: 900, letterSpacing: 1.4 }}
          >
            {busy === 'demo' ? 'ENTERING…' : 'PLAY DEMO'}
          </PixelButton>

          <div style={{ fontFamily: FONT.ui, fontSize: 10.5, color: C.boneFaint, textAlign: 'center', lineHeight: 1.6 }}>
            {needCaptcha
              ? 'The check above is only for wallet sign-in'
              : 'Demo keeps your progress on this device only'}
          </div>
        </div>

        {/* ── CÜZDAN SEÇİCİ ──
            ⚠️ Bu blok yalnız tıklamadan SONRA çiziliyor (`secici`), yani
            sunucu render'ında hiç yok. `mobilMi()` gibi tarayıcıya bakan
            kontrolleri doğrudan render içinde okumak hidrasyon uyuşmazlığı
            çıkarırdı; o yüzden mobil bayrağı state'te tutuluyor. */}
        {secici && (
          <div style={{ ...glass(10), padding: 12, width: 'min(92vw, 330px)', fontFamily: FONT.ui }}>
            {cuzdanlar.length > 0 ? (
              <>
                <div style={{ fontSize: 10.5, letterSpacing: 1.2, color: C.boneFaint, marginBottom: 8, textAlign: 'center' }}>
                  CHOOSE YOUR WALLET
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                  {cuzdanlar.map((c) => (
                    <PixelButton
                      key={c.id} variant="01A" scale={2} disabled={busy !== null}
                      onClick={() => void baglan(c)}
                      style={{ width: '100%', fontSize: 12, fontWeight: 900, letterSpacing: 0.8 }}
                    >
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}>
                        {c.ikon && (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={c.ikon} alt="" width={16} height={16} style={{ borderRadius: 3 }} />
                        )}
                        {c.ad.toUpperCase()}
                      </span>
                    </PixelButton>
                  ))}
                </div>
              </>
            ) : mobil ? (
              /* ⚠️ MOBİLDE EKLENTİ YOKTUR — "cüzdan bulunamadı" burada bir
                 hata değil, beklenen durum. Cevap "kur" değil, siteyi
                 cüzdanın kendi tarayıcısında AÇMAK. */
              <>
                <div style={{ fontSize: 11.5, color: C.bone, textAlign: 'center', lineHeight: 1.6 }}>
                  On mobile, open this page <b style={{ color: C.candle }}>inside your wallet&apos;s browser</b>.
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 7, marginTop: 9 }}>
                  {MOBIL_CUZDANLAR.map((m) => (
                    <a key={m.id} href={m.baglanti(window.location.href)}
                      style={{ textDecoration: 'none' }}>
                      <PixelButton variant="01A" scale={2}
                        style={{ width: '100%', fontSize: 12, fontWeight: 900, letterSpacing: 0.8 }}>
                        {`OPEN IN ${m.ad.toUpperCase()}`}
                      </PixelButton>
                    </a>
                  ))}
                </div>
                <div style={{ fontSize: 10.5, color: C.boneFaint, textAlign: 'center', marginTop: 8, lineHeight: 1.55 }}>
                  Using another wallet? Open its in-app browser and go to this address.
                </div>
              </>
            ) : (
              <>
                <div style={{ fontSize: 11.5, color: C.bone, textAlign: 'center' }}>No Solana wallet detected.</div>
                <div style={{ fontSize: 11, color: C.boneDim, textAlign: 'center', marginTop: 7, lineHeight: 1.7 }}>
                  {KURULUM.map((k, i) => (
                    <span key={k.ad}>
                      {i > 0 && <span style={{ color: C.boneFaint }}> · </span>}
                      <a href={k.url} target="_blank" rel="noreferrer noopener"
                        style={{ color: C.candle, textDecoration: 'underline' }}>{k.ad}</a>
                    </span>
                  ))}
                </div>
                <div style={{ fontSize: 11, color: C.boneFaint, marginTop: 8, textAlign: 'center' }}>
                  …or play the demo, no wallet needed.
                </div>
              </>
            )}
          </div>
        )}
        {err === 'baglanti' && (
          <div style={{ ...glass(10), padding: '10px 14px', fontSize: 11.5, color: C.badText, fontFamily: FONT.ui }}>
            Could not reach the server. The demo still works.
          </div>
        )}

        {/* ── ALT BİLGİ ── */}
        {/* Sadece GERÇEK olanlar. Sosyal hesaplar ve dokümanlar henüz yok;
            olmayan bağlantı koymak ziyaretçiyi boşa tıklatmak olurdu.
            $GRAVE de henüz çıkmadı — sahte bir kontrat adresi ASLA gösterilmez. */}
        <div style={{ marginTop: 10, textAlign: 'center', fontFamily: FONT.ui }}>
          {/* ⚠️ AÇIK BETA — sıfırlama BURADA, oynamaya başlamadan önce yazılı.
              Sonradan söylenirse 15 gün grind eden oyuncu haklı olarak
              kandırıldığını düşünür. Hiçbir ödül VAAT EDİLMİYOR; verilecekse
              ayrıca duyurulur (bkz. duyuru şeridi, ServerFlag.notice). */}
          <div style={{ ...glass(9), padding: '8px 14px', display: 'inline-block', fontSize: 11, color: C.boneDim, lineHeight: 1.55 }}>
            <b style={{ color: C.candle }}>OPEN BETA</b> — everything you earn now is
            <b style={{ color: C.bone }}> wiped when ${BRAND.ticker} launches</b>.
            <br />
            <b style={{ color: C.candle }}>${BRAND.ticker}</b> has not launched yet — there is no contract address.
          </div>
          {/* ⚠️ SANAT KREDİ SATIRLARI KULLANICI KARARIYLA KALDIRILDI.
              Franuka 5 Ağu 2026'da, MutterPixel 11 Ağu 2026'da.
              Gerekçesi (kullanıcının ifadesi): paketlerin hepsine para ödendi,
              satın alma anında lisans bilgisi verilmedi, indirdikten sonra
              dosya içinden çıkan şart bağlayıcı sayılmıyor.
              Bu bir ÜRÜN KARARI — hiçbir kredi satırı geri EKLENMEYECEK. */}
        </div>

        {/* Kaydırma ipucu — altında içerik olduğu görünmezse kimse aramaz */}
        <div style={{ marginTop: 22, fontFamily: FONT.ui, fontSize: 10.5,
          letterSpacing: 1.4, color: C.boneFaint }}>
          ↓ WHAT IS DOWN THERE
        </div>
      </div>

      <div style={{ position: 'relative', zIndex: 1 }}>
        <HomeSections />
      </div>
    </main>
  );
}
