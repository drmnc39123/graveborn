'use client';
// KÖYDE CÜZDAN BAĞLA — demo oynayanın huniden düşmediği yer.
//
// 🔴 NİYE VAR (kullanıcı isteği): *"demo modunda oynayan biri Connect Wallet
// butonunu da görmeli. Şu an demoda oynayan bir kişi homepage sayfasına geri
// gelerek connect wallet yapıyor."*
//
// Huninin en pahalı adımı buydu: oyunu beğenen oyuncu, hesap açmak için
// oyundan ÇIKIP ana sayfaya dönmek zorundaydı. Geri dönmeyen her oyuncu,
// oyunu beğendiği hâlde kaybedilmiş bir oyuncu.
//
// ⚠️ MANTIK PAYLAŞILIYOR, GÖRÜNÜM DEĞİL (`useCuzdanBaglan`). Akışı ikinci
// kez yazmanın somut tehlikesi var: kopyalardan biri Turnstile jetonunu
// göndermeyi unutursa o kapı SESSİZCE çalışmaz — sunucu 403 döner ve hata
// bir yapılandırma sorunu gibi görünür.
//
// ⚠️ YALNIZ DEMO MODUNDA ÇİZİLİYOR. Cüzdanla girmiş oyuncuya "bağlan"
// demek, ona zaten yaptığı şeyi teklif etmektir.
//
// ⚠️ Tüm stiller INLINE · MOR YOK · oyuncu metinleri İngilizce.

import { useCallback, useState } from 'react';
import { Turnstile } from '@/components/Turnstile';
import { useCuzdanBaglan } from '@/lib/useWalletConnect';
import { BTN, PixelButton } from '@/components/ui/kit';
import { C, FONT, thinGlass } from '@/lib/theme';

export function PlayConnect({ style }: { style?: React.CSSProperties }) {
  const [acik, setAcik] = useState(false);
  /**
   * ⚠️ BAĞLANINCA SAYFA YENİLENİYOR (`router.refresh()` DEĞİL, tam yükleme).
   * Köy, ilerleme, kimlik kartı ve rıhtım hepsi oturum durumunu MOUNT anında
   * okuyor; yerinde güncellemek için hepsini tek tek haberdar etmek
   * gerekirdi ve biri unutulursa oyuncu "bağlandım ama hiçbir şey değişmedi"
   * ekranıyla kalırdı. Bağlanma bir kez olan bir olay; tam yükleme burada
   * en ucuz doğru cevap.
   */
  const bitti = useCallback(() => { window.location.href = '/play'; }, []);
  const { cuzdanlar, busy, err, needCaptcha, setCaptcha, baglan } = useCuzdanBaglan(bitti);

  const ac = useCallback(() => {
    // ⚠️ TEK CÜZDAN VARSA SEÇİM EKRANI YOK — tek seçenekli liste karar
    // verdirmez, sadece fazladan bir tık koyar (kapıdaki kuralın aynısı).
    if (cuzdanlar.length === 1 && !needCaptcha) { void baglan(cuzdanlar[0]); return; }
    setAcik((v) => !v);
  }, [cuzdanlar, needCaptcha, baglan]);

  return (
    <div style={{ position: 'relative', ...style }}>
      {/* 🔴 RIHTIMDAKİ DÜĞMENİN BİREBİR AYNISI (kullanıcı düzeltmesi:
          *"Connect Wallet butonunu navbardaki butonlar ile aynı yap
          dedim sana"*).
          İlk sürümde yalnız YÜKSEKLİĞİ ortaktı; gövdesi elle çizilmiş düz
          bir dikdörtgendi. Rıhtımın bütün düğmeleri `PixelButton` —
          dokuz-dilim piksel çerçeve, `BTN.action` varyantı, `scale={2}`,
          aynı punto ve harf aralığı. Elle çizmek onu köyün dilinden
          koparıyordu.
          ⚠️ Ölçü de artık elle yazılmıyor: bileşen kendi yüksekliğini
          getiriyor, `KONTROL_BOYU` sabitine gerek kalmadı. */}
      <PixelButton
        variant={BTN.action}
        scale={2}
        disabled={busy}
        onClick={ac}
        title="Connect a wallet to keep your progress"
        style={{ width: '100%', fontSize: 11, fontWeight: 900, letterSpacing: 0.9 }}
      >
        {busy ? 'CONNECTING…' : 'CONNECT WALLET'}
      </PixelButton>

      {/* ⚠️ NE İŞE YARADIĞI YAZIYOR. "Connect wallet" tek başına bir
          eylem adı; oyuncunun bilmesi gereken şey demo ilerlemesinin
          TAŞINMADIĞI — sonradan öğrenirse haklı olarak kızar.
          (Kural `progress.ts`te de yazılı: demo bir vitrindir, kısa yol
          değil; localStorage oyuncunun kontrolünde olduğu için taşımak
          doğrudan para basma açığıdır.) */}
      <div style={{ marginTop: 4, fontFamily: FONT.ui, fontSize: 9, lineHeight: 1.4,
        color: C.boneFaint, textAlign: 'center' }}>
        Demo progress does not carry over.
      </div>

      {acik && (
        <div style={{
          position: 'absolute', top: '100%', left: 0, right: 0, marginTop: 6,
          zIndex: 9, ...thinGlass(11, 0.94), padding: 9,
          display: 'flex', flexDirection: 'column', gap: 6,
        }}>
          {/* ⚠️ BOT KONTROLÜ BURADA DA ŞART: sunucu jetonsuz isteği 403 ile
              reddediyor (`bot_kontrolu_basarisiz`). Widget'ı koymasaydım
              düğme çalışır görünüp sessizce başarısız olurdu. */}
          <Turnstile onToken={setCaptcha} />

          {cuzdanlar.length === 0 ? (
            <div style={{ fontFamily: FONT.ui, fontSize: 10.5, color: C.boneFaint,
              lineHeight: 1.5, textAlign: 'center' }}>
              No wallet found. Install one, or open the game inside your wallet&apos;s browser.
            </div>
          ) : cuzdanlar.map((c) => (
            <button key={c.id} onClick={() => void baglan(c)} disabled={busy || needCaptcha}
              style={{
                display: 'flex', alignItems: 'center', gap: 7, width: '100%',
                padding: '6px 8px', borderRadius: 6, cursor: 'pointer',
                background: 'rgba(255,255,255,0.05)', border: `1px solid ${C.border}`,
                color: C.bone, fontFamily: FONT.ui, fontSize: 11, fontWeight: 800,
                opacity: busy || needCaptcha ? 0.5 : 1,
              }}>
              {c.ikon && (
                <img src={c.ikon} alt="" width={16} height={16}
                  style={{ borderRadius: 4, display: 'block' }} />
              )}
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {c.ad}
              </span>
            </button>
          ))}

          {err && (
            <div style={{ fontFamily: FONT.ui, fontSize: 10, color: C.badText, textAlign: 'center' }}>
              That did not connect. Try again.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
