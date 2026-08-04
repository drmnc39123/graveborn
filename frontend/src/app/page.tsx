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
import { PHANTOM_URL, fetchStats, getPhantom, setMode, signInWithWallet } from '@/lib/session';

export default function Home() {
  const router = useRouter();
  const [stats, setStats] = useState<{ players: number; runs: number } | null>(null);
  const [busy, setBusy] = useState<'wallet' | 'demo' | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [captcha, setCaptcha] = useState<string | null>(null);

  useEffect(() => { fetchStats().then(setStats); }, []);

  const needCaptcha = turnstileEnabled() && !captcha;

  const onDemo = () => {
    setMode('demo');
    setBusy('demo');
    router.push('/play');
  };

  const onWallet = async () => {
    setErr(null);
    if (!getPhantom()) {
      setErr('phantom');
      return;
    }
    setBusy('wallet');
    try {
      await signInWithWallet(captcha ?? undefined);
      router.push('/play');
    } catch (e) {
      const code = e instanceof Error ? e.message : 'hata';
      // Kullanıcı imzayı reddettiyse bu bir hata değil, bir karardır
      setErr(/reject|denied|4001/i.test(code) ? null : 'baglanti');
      setBusy(null);
    }
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

          <PixelButton
            variant="01A" scale={3}
            disabled={busy !== null || needCaptcha}
            onClick={onDemo}
            style={{ width: '100%', fontSize: 13, fontWeight: 900, letterSpacing: 1.4 }}
          >
            {busy === 'demo' ? 'ENTERING…' : 'PLAY DEMO'}
          </PixelButton>

          <div style={{ fontFamily: FONT.ui, fontSize: 10.5, color: C.boneFaint, textAlign: 'center', lineHeight: 1.6 }}>
            {needCaptcha
              ? 'Complete the check above to enter'
              : 'Demo keeps your progress on this device only'}
          </div>
        </div>

        {err === 'phantom' && (
          <div style={{ ...glass(10), padding: '10px 14px', maxWidth: 340, textAlign: 'center', fontFamily: FONT.ui }}>
            <div style={{ fontSize: 12, color: C.bone }}>No Phantom wallet found.</div>
            <a href={PHANTOM_URL} target="_blank" rel="noreferrer noopener"
              style={{ fontSize: 11.5, color: C.candle, textDecoration: 'underline' }}>
              Install Phantom
            </a>
            <div style={{ fontSize: 11, color: C.boneFaint, marginTop: 4 }}>…or play the demo, no wallet needed.</div>
          </div>
        )}
        {err === 'baglanti' && (
          <div style={{ ...glass(10), padding: '10px 14px', fontSize: 11.5, color: C.bad, fontFamily: FONT.ui }}>
            Could not reach the server. The demo still works.
          </div>
        )}

        {/* ── ALT BİLGİ ── */}
        {/* Sadece GERÇEK olanlar. Sosyal hesaplar ve dokümanlar henüz yok;
            olmayan bağlantı koymak ziyaretçiyi boşa tıklatmak olurdu.
            $GRAVE de henüz çıkmadı — sahte bir kontrat adresi ASLA gösterilmez. */}
        <div style={{ marginTop: 10, textAlign: 'center', fontFamily: FONT.ui }}>
          <div style={{ ...glass(9), padding: '7px 14px', display: 'inline-block', fontSize: 11, color: C.boneDim }}>
            <b style={{ color: C.candle }}>${BRAND.ticker}</b> has not launched yet — there is no contract address.
          </div>
          <div style={{ marginTop: 10, fontSize: 10, color: C.boneFaint }}>
            UI art by{' '}
            <a href="https://franuka.itch.io" target="_blank" rel="noreferrer noopener"
              style={{ color: C.boneDim, textDecoration: 'underline' }}>franuka.itch.io</a>
            {' · '}world art by MutterPixel Studio
          </div>
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
