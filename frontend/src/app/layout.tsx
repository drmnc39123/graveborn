import type { Metadata, Viewport } from 'next';
import { ErrorReporter } from '@/components/ErrorReporter';
import { BRAND, C } from '@/lib/theme';

/** Kart metni — OpenGraph ve X kartında AYNI cümle dursun diye tek yerde. */
const PAYLASIM_METNI = 'A pixel survivor roguelike on Solana. Endless runs, a cursed Forge, no permanent death. Open beta — progress wipes when $GRAVE launches.';

export const metadata: Metadata = {
  /**
   * ⚠️ `metadataBase` OLMADAN `og:image` GÖRECELİ kalıyor ve X, Telegram,
   * Discord kartı HİÇ çizilmiyor — link çıplak görünür. Lansmanın hunisi
   * tamamen o kanallardan geçtiği için bu doğrudan tıklama kaybıydı.
   *
   * ⚠️ Üretim alan adı SABİT yazılı, env'den okunmuyor. Vercel önizleme
   * dağıtımları her seferinde ayrı bir alan adı üretiyor; env'den okusaydı
   * her önizlemenin kartı başka bir yere işaret ederdi. Kart her zaman
   * üretim görselini göstersin.
   */
  metadataBase: new URL('https://playgraveborn.com'),
  title: `${BRAND.name} — ${BRAND.tagline}`,
  description: 'Survive the endless horde. Die. Rise again stronger. On Solana.',
  applicationName: BRAND.name,
  openGraph: {
    type: 'website',
    siteName: BRAND.name,
    url: '/',
    title: `${BRAND.name} — ${BRAND.tagline}`,
    /**
     * ⚠️ Beta uyarısı KARTTA DA duruyor. Paylaşılan link, oyuncunun oyunu
     * ilk gördüğü yer; sıfırlamayı sitede söyleyip kartta söylememek
     * "bana kimse söylemedi"nin zeminini hazırlar.
     */
    description: PAYLASIM_METNI,
    images: [{ url: '/og.png', width: 1200, height: 630, alt: `${BRAND.name} — ${BRAND.tagline}` }],
  },
  twitter: {
    // ⚠️ 'summary' olursa X küçük kare kart çizer ve 1200x630 görsel kırpılır
    card: 'summary_large_image',
    title: `${BRAND.name} — ${BRAND.tagline}`,
    description: PAYLASIM_METNI,
    images: ['/og.png'],
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false, // oyun ekranında pinch-zoom kazası olmasın
  themeColor: C.void,
};

/**
 * OYUN FONTLARI — dosyalar `public/fonts/` altında, PROJEYLE BİRLİKTE geliyor.
 *
 * ⚠️ CDN'DEN ÇEKİLMİYOR. Ne `next/font/google` (derlemede ağ ister) ne de
 * Google Fonts bağlantısı: oyun Phantom'un uygulama-içi tarayıcısında da
 * açılıyor ve orada dış istekler güvenilmez. Dosya repoda duruyor.
 *
 * • Pixellari (Zacchary Dempsey-Plante) — hem gövde hem başlık. Düz, süssüz,
 *   gerçek küçük harfli bir piksel font. Kullanıcının kendi seçimi.
 *
 * ⚠️ DOSYADA TEK AĞIRLIK VAR ama TARAYICI SENTETİK KALIN ÜRETİYOR.
 *
 * ⚠️ BURADA BİR ÖLÇÜM HATASI VARDI, DÜZELTİLDİ. Eski not "400/700/900 aynı
 * genişliği veriyor, `fontWeight: 900` ETKİSİZ" diyordu. Genişlik ölçüsü
 * YANLIŞ ALETTİ: Chromium bu fontta sentetik kalını ilerlemeyi (advance)
 * büyütmeden çiziyor, o yüzden genişlik hiç kıpırdamıyor. Doğru alet
 * MÜREKKEP: aynı metnin opak piksel sayısı.
 *
 *   400 → 4.524 piksel · 700 → 6.464 piksel  (+%42,9)
 *   (kontrol: sistem sans-serif aynı testte +%26,7 — yani alet sağlam)
 *
 * Yani `fontWeight` ÇALIŞIYOR ve vurgu için kullanılabilir.
 *
 * ⚠️ SENTEZ İKİLİ: 700 ile 900 BİREBİR AYNI (ikisi de 6.464). Ara kademe
 * yok — "biraz daha kalın" diye 800/900 yazmanın karşılığı yok, tek karar
 * kalın mı değil mi.
 *
 * ⚠️ "HER ŞEY KALIN" ŞÜPHESİ ÖLÇÜLDÜ ve DOĞRULANMADI — bu not, aynı yanlış
 * teşhisin üçüncü kez konulmasını önlemek için duruyor.
 *
 * Kaynak kodda sayınca tablo korkutucu görünüyor: 275 `fontWeight`
 * kullanımının 239'u 900, yalnızca 2'si 400. Ama KAYNAK SAYMAK YANLIŞ ALET.
 * Çalışan arayüzde render edilen metin ölçüldüğünde tablo tersine dönüyor:
 *
 *   Reliquary  125 metin · %78 kalın · uzun düz metin kalın: 0
 *   Forge      240 metin · %65 kalın · uzun düz metin kalın: 0
 *
 * Yani o 900'ler ETİKETLERE, öğe adlarına, değerlere, çiplere ve düğme
 * yazılarına düşüyor — kalının doğru olduğu yerler. Gövde metni (açıklamalar,
 * yardım satırları, alt başlıklar) ZATEN 400. Hiyerarşi çalışıyor.
 *
 * Sonuç: toplu bir "900 → 400" taraması YAPILMAMALI; düzeltilecek bir şey
 * yok, tarama çalışan hiyerarşiyi bozardı.
 *
 * ⚠️ İkinci bir aileyi kalın olarak eşleştirme denemesi YAPILMADI: Silkscreen
 * ve Pixellari'nin oranları farklı, karışım tutarsız görünürdü.
 *
 * Elenenler (aynı hataya tekrar düşülmesin diye):
 *   · Pixelify Sans — yuvarlak hatları "süslü" bulundu.
 *   · Jacquard 12 (blackletter) — en süslü parçaydı, başlıklardan kaldırıldı.
 *   · VT323 — bold yüzü yok VE ince/soluk; okunurluk düştü.
 *   · Silkscreen — düz ve gerçek bold'u var ama küçük harfleri küçük-kapital
 *     gibi duruyor, her şey bağırıyormuş gibi okunuyordu.

 *
 * `font-display: swap` — font gelmezse arayüz görünmez kalmaz, yedeğe düşer.
 */
/**
 * ── İMLEÇ BİLGİSİ ──
 *
 * ⚠️ BU AÇIKLAMA BİLEREK BURADA, `FONT_FACE`İN İÇİNDE DEĞİL. Aşağıdaki şablon
 * dizesi olduğu gibi `<style>` etiketine basılıyor; içine yazılan her yorum
 * HER ZİYARETÇİYE indiriliyor ve sayfa kaynağında okunuyor. Bu blok orada
 * duruyordu: hem boşuna byte, hem de sağlayıcı adını sayfaya gömüyordu.
 * TS yorumu derlemede düşer, ekrana hiç çıkmaz.
 *
 * ⚠️ SEÇİM ÖLÇÜLDÜ, GÖZ ONAYLADI. Sekiz aday görünür piksel ortalamasıyla
 * tarandı:
 *   Cursor02 rgb(180,63,66) KIRMIZI  ← blood(160,18,38)'e en yakın, SEÇİLDİ
 *   Cursor03 rgb(94,137,79) YEŞİL    ← palet kuralı, elendi
 *   Tick01   %7 dolu                 ← neredeyse görünmez, elendi
 *   Gauntlet %33 dolu                ← 16 px'de şekilsiz bir blob, elendi
 *
 * ⚠️ 2 KAT BÜYÜTÜLDÜ. 16 px imleç ekranda sistem imlecinin yarısı kadar
 * kalıyordu ve kullanıcı "çok küçük" dedi. CSS imleci ÖLÇEKLEMEZ — görselin
 * kendi boyutunu kullanır; o yüzden 32×32 dosyalar ÜRETİLDİ
 * (`public/art/cursors/`, NEAREST ile; BICUBIC piksel sanatını bulanık bir
 * lekeye çevirirdi).
 *
 * ⚠️ SICAK NOKTA SPRITE'TAN ÖLÇÜLDÜ, tahmin edilmedi. Alfa haritası çıkarıldı:
 * ok ucu (5,4)'te, parmak ucu (7,2)'de. İki katına çıkınca sıcak nokta da İKİ
 * KATINA çıkmak ZORUNDA: (10,8) ve (14,4). Unutulsaydı tıklama imlecin
 * ucundan 16 px kayardı — fark edilmesi zor, yaşaması can sıkıcı bir hata.
 *
 * ⚠️ `!important` ŞART ve ölçümle anlaşıldı: düğmeler imleci SATIR İÇİ stille
 * veriyor (`PixelButton: cursor:'pointer'`) ve satır içi stil stylesheet
 * kuralını yener. Onsuz `getComputedStyle(button).cursor` hâlâ "pointer"
 * çıkıyordu — yani özel imleç düğmelere HİÇ ulaşmıyordu.
 * ⚠️ `:not(:disabled)` — devre dışı düğmede el işareti göstermek tıklanabilir
 * olduğunu SÖYLEMEK olurdu.
 * ⚠️ `auto`/`pointer` YEDEĞİ ŞART: dosya 404 verirse tarayıcı imleci tamamen
 * kaybetmesin.
 * ⚠️ Yazı alanları KENDİ imlecini korur — metin imleci okla değiştirilirse
 * nereye yazılacağını gösteren tek işaret kaybolur.
 */
const FONT_FACE = `
/* Tek aile, tek dosya, tek ağırlık. */
@font-face {
  font-family: 'GBText';
  src: url('/fonts/Pixellari.ttf') format('truetype');
  font-display: swap;
}
@font-face {
  font-family: 'GBTitle';
  src: url('/fonts/Pixellari.ttf') format('truetype');
  font-display: swap;
}
/* Piksel sanat her yerde net kalsın */
img { image-rendering: pixelated; }
button { font: inherit; }

body { cursor: url('/art/cursors/Cursor02@2x.png') 10 8, auto; }
a, button:not(:disabled), [role='button'], summary,
input[type='checkbox'], input[type='radio'], select {
  cursor: url('/art/cursors/Hand01_Up@2x.png') 14 4, pointer !important;
}
input[type='text'], input[type='number'], input:not([type]), textarea {
  cursor: text;
}
`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head><style dangerouslySetInnerHTML={{ __html: FONT_FACE }} /></head>
      <body
        style={{
          margin: 0,
          minHeight: '100vh',
          background: `radial-gradient(1200px 700px at 50% -10%, ${C.grave} 0%, ${C.soil} 45%, ${C.void} 100%)`,
          color: C.bone,
          fontFamily: 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
          WebkitFontSmoothing: 'antialiased',
        }}
      >
        {/* ⚠️ EN ÜSTTE: hata yakalayıcıları çocuklardan ÖNCE kurulmalı,
            yoksa ilk render sırasında patlayan bir hata hiç bildirilmez. */}
        <ErrorReporter />
        {children}
      </body>
    </html>
  );
}
