'use client';
// DAVET — oyunun tek büyüme kanalı.
//
// ⚠️ İKİ İŞ, TEK PANEL: kendi kodunu paylaşmak ve başkasının kodunu
// girmek. İkisini ayırmak, yeni oyuncunun "kod nereye giriliyor" diye
// aradığı ekranı ikiye bölerdi.
//
// ⚠️ ÖDÜLÜN NE ZAMAN GELDİĞİ AÇIKÇA YAZILI. "Davet et, kazan" deyip
// koşulu gizlemek, ödülü beklerken alamayan oyuncuyu kandırılmış hissettirir.
// Koşul da bir savunma: ödül kayıt anında verilseydi bot çiftliğine para
// basardık (bkz. backend/referral.ts).
//
// ⚠️ GİRİŞ KUTUSU HAKKI OLMAYANA GÖSTERİLMEZ. Tıklanınca hep hata veren
// bir kutu, bozuk bir kutudur.

import { useCallback, useEffect, useState } from 'react';
import { panelUnlocked } from '@/lib/testMode';
import { getMode } from '@/lib/session';
import { enterReferral, fetchReferral, type ReferralState } from '@/lib/gameSession';
import { BRAND } from '@/lib/theme';
import { Card, CardSection, PanelHead, Tag } from '@/components/ui/cards';
import { BTN, PixelButton } from '@/components/ui/kit';
import { C, FONT, glass } from '@/lib/theme';

const HATA: Record<string, string> = {
  gecersiz_kod: 'That is not a code we recognise.',
  zaten_girildi: 'You have already joined with a code.',
  kendi_kodun: 'That is your own code.',
  pencere_kapandi: 'Codes can only be entered in your first days.',
  kod_bulunamadi: 'Nobody carries that code.',
  yasakli: 'This account cannot do that.',
};

export function InvitePanel({ onError }: { onError: (msg: string) => void }) {
  const [durum, setDurum] = useState<ReferralState | null>(null);
  const [giris, setGiris] = useState('');
  const [busy, setBusy] = useState(false);
  const [kopyalandi, setKopyalandi] = useState(false);

  const yukle = useCallback(() => {
    fetchReferral().then(setDurum).catch(() => setDurum(null));
  }, []);
  useEffect(() => { if (panelUnlocked(getMode())) yukle(); }, [yukle]);

  /**
   * ⚠️ PAYLAŞIM LİNKİYLE GELDİYSE KUTUYU DOLDUR. Kod ana sayfada
   * yakalanıp saklanıyor; burada yalnız hazır bekletiliyor. Otomatik
   * GİRİLMİYOR — geri alınamayan bir bağ oyuncunun kararı olmalı.
   */
  useEffect(() => {
    try {
      const k = localStorage.getItem('graveborn:ref');
      if (k) setGiris(k);
    } catch { /* yoksay */ }
  }, []);

  if (!panelUnlocked(getMode())) {
    return (
      <>
        <PanelHead kicker="THE INVITATION" title="Bring someone down with you" accent={C.ice}
          sub="Invitations live in the village ledger, not on your device. Connect a wallet to get a code." />
      </>
    );
  }
  if (!durum) {
    return (
      <>
        <PanelHead kicker="THE INVITATION" title="Bring someone down with you" accent={C.ice} />
        <div style={{ ...glass(9), padding: '16px 14px', fontSize: 12, color: C.boneFaint,
          textAlign: 'center', fontFamily: FONT.ui }}>Reading the ledger…</div>
      </>
    );
  }

  /**
   * ⚠️ PAYLAŞILAN ADRES KARTI OLAN SAYFA, ana sayfa DEĞİL. `/s/<kod>`
   * X'te ve Telegram'da oyuncunun kendi rakamlarıyla bir kart çiziyor;
   * ana sayfa herkes için aynı görseli gösterirdi ve paylaşımın kişisel
   * olan tarafı kaybolurdu.
   */
  const link = `https://playgraveborn.com/s/${durum.code}`;
  const metin = `I have been down to depth ${durum.rewardDepth}+ in ${BRAND.name}. Come and see how far you get.`;
  const xLink = `https://x.com/intent/tweet?text=${encodeURIComponent(metin)}&url=${encodeURIComponent(link)}`;

  const kopyala = () => {
    try { void navigator.clipboard?.writeText(link); setKopyalandi(true); } catch { /* yoksay */ }
    setTimeout(() => setKopyalandi(false), 1600);
  };

  const gir = async () => {
    if (busy || giris.trim().length < 6) return;
    setBusy(true);
    try { setDurum(await enterReferral(giris.trim())); setGiris(''); }
    catch (e) {
      const k = (e as { code?: string; message?: string })?.code
        ?? (e as { message?: string })?.message ?? '';
      onError(HATA[k] ?? 'That code was refused.');
    } finally { setBusy(false); }
  };

  return (
    <>
      <PanelHead kicker="THE INVITATION" title="Bring someone down with you" accent={C.ice}
        sub="Nobody is paid for signing up — a wallet costs nothing to make. The reward opens when the person you brought actually goes down." />

      {/* Kendi kodun */}
      <Card accent>
        <div style={{ padding: '12px 13px', fontFamily: FONT.ui }}>
          <div style={{ fontSize: 9.5, fontWeight: 900, letterSpacing: 1.4, color: C.boneFaint }}>
            YOUR CODE
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 5, flexWrap: 'wrap' }}>
            <span style={{
              fontSize: 24, fontWeight: 900, letterSpacing: 4, color: C.candle,
              fontVariantNumeric: 'tabular-nums',
            }}>{durum.code}</span>
            <span style={{ marginLeft: 'auto', display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              <PixelButton variant={BTN.strong} scale={2} onClick={kopyala}>
                {kopyalandi ? 'COPIED' : 'COPY LINK'}
              </PixelButton>
              {/* ⚠️ `noopener`: `target=_blank` olan her bağlantıda şart —
                  açılan sayfa `window.opener` üzerinden bizi yönlendirebilir. */}
              <a href={xLink} target="_blank" rel="noopener noreferrer"
                style={{ all: 'unset', display: 'inline-block' }}>
                <PixelButton variant={BTN.buy} scale={2}>SHARE ON X</PixelButton>
              </a>
            </span>
          </div>
          <div style={{ marginTop: 7, fontSize: 11, color: C.boneFaint, wordBreak: 'break-all' }}>
            {link}
          </div>
        </div>
      </Card>

      {/* Sayaç */}
      <CardSection label="What it has brought you" tone={C.candle}>
        <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap', fontFamily: FONT.ui }}>
          <Sayac etiket="JOINED" deger={String(durum.invited)} />
          <Sayac etiket="WENT DOWN" deger={String(durum.rewarded)} vurgu />
          <Sayac etiket="DUST EARNED" deger={(durum.rewarded * durum.rewardDust).toLocaleString('en-US')} />
        </div>
        {/* ⚠️ KOŞUL AÇIKÇA YAZILI — hem dürüstlük hem savunma. */}
        <div style={{ marginTop: 8, fontSize: 11, color: C.boneDim, lineHeight: 1.5 }}>
          Both of you get {durum.rewardDust} dust the first time someone who joined with your
          code reaches depth {durum.rewardDepth}. Up to {durum.cap} of them. Dust buys relics,
          never power.
        </div>
      </CardSection>

      {/* Kod girme — SADECE hakkı olana */}
      {durum.canEnter && (
        <CardSection label="Came here from someone?" tone={C.ice}>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <input
              value={giris}
              onChange={(e) => setGiris(e.target.value.toUpperCase())}
              onKeyDown={(e) => { e.stopPropagation(); if (e.key === 'Enter') void gir(); }}
              maxLength={6}
              placeholder="THEIR CODE"
              style={{
                flex: '1 1 120px', minWidth: 0, padding: '7px 10px', borderRadius: 6,
                border: `1px solid ${C.border}`, background: 'rgba(0,0,0,0.35)',
                color: C.bone, fontFamily: FONT.ui, fontSize: 14, fontWeight: 900,
                letterSpacing: 3, outline: 'none',
              }} />
            <PixelButton variant={BTN.strong} scale={2}
              disabled={busy || giris.trim().length < 6} onClick={gir}>
              JOIN
            </PixelButton>
          </div>
        </CardSection>
      )}

      {/* ⚠️ Zaten girmişse SÖYLE. Sessizce kutuyu kaldırmak, oyuncuya
          "burada bir şey vardı sanmıştım" dedirtir. */}
      {durum.joinedWith && (
        <div style={{ marginTop: 10, fontSize: 11, color: C.boneFaint, fontFamily: FONT.ui }}>
          You came down with <strong style={{ color: C.boneDim }}>{durum.joinedWith}</strong>.
        </div>
      )}
      {!durum.canEnter && !durum.joinedWith && (
        <div style={{ marginTop: 10, fontSize: 11, color: C.boneFaint, fontFamily: FONT.ui }}>
          Codes can only be entered in your first days here. Yours has passed.
        </div>
      )}
    </>
  );
}

function Sayac({ etiket, deger, vurgu = false }: {
  etiket: string; deger: string; vurgu?: boolean;
}) {
  return (
    <div>
      <div style={{ fontSize: 8.5, fontWeight: 900, letterSpacing: 1.2, color: C.boneFaint }}>
        {etiket}
      </div>
      <div style={{ fontSize: 17, fontWeight: 900, color: vurgu ? C.candle : C.bone }}>
        {deger}
      </div>
    </div>
  );
}
