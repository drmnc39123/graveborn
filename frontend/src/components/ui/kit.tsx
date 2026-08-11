'use client';
// FRANUKA UI KİTİ — tek 9-slice primitifi, tüm arayüz onun üstüne kuruluyor.
//
// NEDEN TEK PRİMİTİF: `public/art/ui/kit/` altındaki HER varlık 16px ızgarada.
// Paneller 48×48 (3×3 karo), geniş butonlar 48×16 (3×1), slot/ikon/onay
// kutusu 16×16. Yani hepsi `border-image ... 16 fill` ile kesiliyor; ayrı ayrı
// kırpma, atlas metadata'sı veya görsel editör gerekmiyor.
//
// ÖLÇEK: `scale` kaç kat büyütüleceği. borderWidth = slice × scale olduğu için
// 3 → 48px kenar. `image-rendering: pixelated` şart, yoksa piksel sanat bulanır.
//
// LİSANS: Franuka RPG UI pack — ticari kullanım serbest, ANCAK Credits'te
// franuka.itch.io bağlantısı ZORUNLU. (ATTRIBUTION.md)


import { useState, type CSSProperties, type ReactNode } from 'react';
import { C, FONT } from '@/lib/theme';
import { iconSrc, type IconName } from '@/lib/icons';

const KIT = '/art/ui/kit';

/** Piksel sanat için ortak kural — her 9-slice ve <img> bunu kullanır */
export const pixel: CSSProperties = { imageRendering: 'pixelated' };

/**
 * ÖLÇEK TAM SAYI OLMAK ZORUNDA.
 *
 * Piksel sanat 1.5× büyütülünce her kaynak piksel 1.5 ekran pikseline düşer;
 * yarım piksel diye bir şey olmadığı için kenarlar bir aşağı bir yukarı
 * yuvarlanır ve varlık "kaymış / titrek" görünür. Kullanıcı bunu ilk bakışta
 * yakaladı: panel içi bina butonları 1.5 ölçekteydi.
 *
 * Bu yüzden ölçek burada TEK NOKTADAN yuvarlanıyor — çağıran taraf yanlışlıkla
 * kesirli verse bile görsel bozulmaz.
 */
const int = (scale: number) => Math.max(1, Math.round(scale));

/**
 * Dört yandan 9-slice. SADECE kare varlıklar için (48×48 paneller):
 * 16+16 kenar + 16 orta = 48, yani gerçekten bir orta karo var.
 */
export function nineSlice(src: string, slice = 16, scale = 3): CSSProperties {
  const s = int(scale);
  return {
    borderStyle: 'solid',
    // ⚠️ ŞEFFAF KENAR RENGİ ŞART: görsel 404 verirse tarayıcı border-image'i
    // atlar ve DÜZ KENARLIK çizer — ekranda iki renkli slab olarak görünür.
    // (BannerMedium_03A.png yoktu, sadece _Normal/_Pressed vardı; ekranda
    //  "LEVEL 2" yazısının iki yanında soluk bloklar çıktı.) Şeffafla eksik
    //  varlık sessizce yok olur, sahte bir çerçeve uydurmaz.
    borderColor: 'transparent',
    borderWidth: slice * s,
    borderImageSource: `url("${src}")`,
    borderImageSlice: `${slice} fill`,
    borderImageRepeat: 'repeat',
    ...pixel,
  };
}

/**
 * SADECE YATAY dilimleme — 48×16 butonlar, çubuklar ve 48×32 flamalar için.
 *
 * NEDEN: bu varlıklar DİKEYDE orta karo İÇERMEZ (16 üst + 16 alt = 16px'lik
 * görselin tamamı). Dört yandan dilimlersen üst ve alt kenarlıklar üst üste
 * biner, içerik kutusu taşar ve metin butonun DIŞINA düşer. (Bu hataya bir kez
 * düşüldü; ekranda buton gibi görünen boş çubukların altında yazı kaldı.)
 *
 * Doğrusu: yükseklik SABİT (varlık yüksekliği × scale), yatayda orta karo
 * tekrarlar. Böylece piksel oranı hiç bozulmaz.
 */
export function sliceH(src: string, slice = 16, scale = 3): CSSProperties {
  const s = int(scale);
  return {
    borderStyle: 'solid',
    borderColor: 'transparent',   // bkz. nineSlice'taki not — eksik varlık sessiz kalsın
    borderWidth: `0 ${slice * s}px`,
    borderImageSource: `url("${src}")`,
    borderImageSlice: `0 ${slice} fill`,
    borderImageRepeat: 'repeat',
    boxSizing: 'border-box',
    ...pixel,
  };
}

// ── PANEL ─────────────────────────────────────────────────────────────
// 13 çerçeve var. Paletimiz gotik korku olduğu için seçim DAR:
//   07A → koyu şarap kırmızısı + sarmaşık köşe  ← VARSAYILAN, mezarlık teması
//   01B → soğuk mavi-gri (ikincil, "buz" tonu)
//   08A → düz gri (nötr, dikkat dağıtmaması gereken yerler)
// 01C/02A/04A/04B parlak turuncu-pembe bez — temaya ZIT, kullanma.

export type PanelStyle = '01A' | '01B' | '01C' | '02A' | '02B' | '03A'
  | '04A' | '04B' | '04C' | '05A' | '06A' | '07A' | '08A';

/**
 * ⚠️ Kısa TUTULDU (160 ms). Panel bir geçiş değil bir ARAÇ: oyuncu Forge'a
 * 20 kez giriyor, uzun bir animasyon 20 kez bekleme demek olurdu.
 * `both` şart — animasyon bitince son kareye kilitlenmezse panel titrer.
 */
// ⚠️ KAPANIŞ da burada tanımlı. Panel açılırken canlanıp kapanırken bir anda
// yok oluyordu — geçişin yarısı yapılmıştı. `Panel` kendi `animation`ını
// yazıyor ama `...style` ondan SONRA yayıldığı için çağıran taraf bunu
// style ile geçersiz kılabiliyor.
//
// ⚠️ AÇIKLAMA ŞABLON DİZESİNİN DIŞINDA. İçine yazmıştım ve yorumdaki ters
// tırnaklar diziyi erkenden bitirdi — bu oturumda üçüncü kez aynı sınıf hata
// (JSX yorumu ternary dalında, JSX yorumu içinde JSX yorumu, şimdi bu).
// Sınırlayıcı içeren bir açıklama, sınırlayıcının dışında durmalı.
const PANEL_ANIM = `@keyframes gb-panel-in {
  from { opacity: 0; transform: translateY(10px); }
  to   { opacity: 1; transform: translateY(0); }
}
@keyframes gb-panel-out {
  from { opacity: 1; transform: translateY(0); }
  to   { opacity: 0; transform: translateY(8px); }
}`;

/**
 * ÇERÇEVE BAŞINA KARARTMA — ölçülen dolgu parlaklığından türetildi.
 *
 * ⚠️ SAYILAR GÖZ KARARI DEĞİL. 13 çerçevenin merkez dolgu karosu PIL ile
 * ölçüldü (algılanan parlaklık, 0-255):
 *   07A  97,9  ← EN KOYU, referans
 *   02B 140,9 · 08A 148,6 · 01B 168,9 · 03A/04B/05A/06A 170,0
 *   01C/02A/04A 191,2 · 01A 208,5 · 04C 249,4
 *
 * 07A için 0,72 doğru kabul edildi (ekranda onaylandı). Geri kalanı aynı
 * ALGILANAN koyuluğu verecek şekilde çözüldü:  a = 1 − 0,28·97,9 / L
 *
 * ⚠️ Tek bir sabit kullanmak, panellere kimlik verilince iç zemini
 * soluklaştırıyordu — aynı örtü farklı zeminlerde farklı koyuluk üretir.
 */
const KARARTMA: Partial<Record<PanelStyle, number>> = {
  '07A': 0.72,
  '02B': 0.81,
  '08A': 0.82,
  '01B': 0.84,
  '03A': 0.84, '04B': 0.84, '05A': 0.84, '06A': 0.84,
  '01C': 0.86, '02A': 0.86, '04A': 0.86,
  '01A': 0.87,
  '04C': 0.89,
};

export function Panel({
  children, variant = '07A', scale = 3, pad = 14, style, onClick,
}: {
  children?: ReactNode;
  variant?: PanelStyle;
  scale?: number;
  /** kenarlığın İÇİNDEKİ boşluk */
  pad?: number;
  style?: CSSProperties;
  onClick?: (e: React.MouseEvent) => void;
}) {
  // ⚠️ AÇILIŞ SESİ BURADA DEĞİL. Denendi ve ÖLÇÜLDÜ: ses hiç çalmadı.
  // Sebep, `Panel` sekmeler arası geçişte YENİDEN MONTE OLMUYOR — React aynı
  // elemanı koruyup sadece çocuklarını değiştiriyor, `useEffect([])` bir kez
  // çalışıp susuyor. Ayrıca doğru yer de burası değildi: `Panel` bir sunum
  // bileşeni, "şu an açılıyor muyum" onun bilgisi değil. Ses artık panel
  // DURUMUNUN değiştiği yerde (play/page.tsx içindeki `setPanel` sarmalayıcısı).
  //
  // ⚠️ Aşağıdaki AÇILIŞ ANİMASYONU da aynı sebeple sekme geçişlerinde tekrar
  // ETMEZ ve bu İSTENEN davranış: panel kapanıp yeniden açılınca (o zaman
  // gerçekten unmount oluyor) animasyon çalışıyor, Forge↔Tavern geçişinde
  // çalışmıyor. Her sekme değişiminde 160 ms beklemek sinir bozucu olurdu.
  return (
    <div onClick={onClick} style={{
      ...nineSlice(`${KIT}/Background-boxes/BGbox_${variant}.png`, 16, scale),
      position: 'relative',
      // ⚠️ AÇILIŞ ANİMASYONU BURADA, her panelde ayrı ayrı DEĞİL. Panel
      // "birden beliriyordu"; 9 kapının hepsine elle animasyon eklemek er ya
      // da geç eksik kalırdı.
      // ⚠️ `scale` DEĞİL `translateY` + `opacity` kullanılıyor: 9-slice
      // kenarlık ölçeklenince piksel ızgarası bozulur ve çerçeve bulanır.
      animation: 'gb-panel-in 160ms ease-out both',
      ...style,
    }}>
      <style>{PANEL_ANIM}</style>
      {/* ⚠️ PEMBEYİ KIRAN KATMAN. 07A "koyu şarap kırmızısı" diye seçilmişti
          ama ekranda düpedüz PEMBE duruyor — oyunun geri kalanı geceyken
          panel parlıyordu. CSS `filter` çözüm DEĞİL: panelin çocuklarını da
          (metin, buton, sprite) soldururdu. Onun yerine yalnızca zemine
          oturan, tıklamaları geçiren ayrı bir katman.

          ⚠️ KATMAN İÇERİK SARMALAYICISININ İÇİNDE OLMAK ZORUNDA, panelin
          doğrudan çocuğu olarak DEĞİL. Sebep ölçüldü: panel kaydırılabilir
          (`overflowY:auto`) ve mutlak konumlu bir çocuk, kaydırma kutusunun
          GÖRÜNEN alanına göre boyutlanıyor — içeriğe göre değil. Forge
          panelinde içerik 1779 px'ken katman 794 px kalıyordu: **985 px
          koyulaştırılmadan** açıkta duruyordu ve oyuncu aşağı indikçe
          kartların altındaki zemin bir yerden sonra ham pembeye dönüyordu.
          Sarmalayıcı normal akışta olduğu için yüksekliği İÇERİĞİN tamamı;
          `inset:0` artık gerçekten her yeri kaplıyor. */}
      <div style={{ position: 'relative', padding: pad, fontFamily: FONT.ui }}>
        {/* 🔴 KARARTMA 0,44 İDİ ve YETMİYORDU. Ekranda ölçüldü: panel hâlâ
            pembe-mor okunuyordu ve daha kötüsü, KARTLAR ZEMİNDEN AYRIŞMIYORDU
            — kart ile panel aynı yüzey gibi görünüyordu. Kartın zeminini
            koyultmak tek başına çözmedi, çünkü sorun kartta değil ARKASINDAKİ
            yüzeydeydi. Karartmada çerçevenin sarmaşık ve doku detayı hâlâ
            görünüyor (tamamen kapatmak Franuka çerçevesini boşa harcardı) ama
            içerik artık koyu bir zeminin üstünde duruyor.

            🔴 SONRA SABİT 0,72 DE YETMEDİ — ve sebebi ölçüldü: o değer YALNIZCA
            07A için doğruydu. Panellere kendi kimlikleri verilince (ahşap,
            metal, altın) iç zemin soluklaştı, çünkü 07A dolgusu 97,9 parlaklıkta
            ama diğerleri 141-249 arasında. Aynı örtü farklı zeminlerde farklı
            koyuluk üretir; örtü ÇERÇEVEYE GÖRE olmalı. */}
        <div style={{
          position: 'absolute', inset: 0, pointerEvents: 'none',
          background: `rgba(11,8,14,${KARARTMA[variant] ?? 0.78})`,
        }} />
        <div style={{ position: 'relative' }}>{children}</div>
      </div>
    </div>
  );
}

// ── BUTON ─────────────────────────────────────────────────────────────
// Franuka'da 3 durum var: Normal / Selected / Pressed. Disabled YOK —
// onu doygunluğu düşürüp saydamlaştırarak kendimiz üretiyoruz (standart yol).

export type ButtonStyle = '01A' | '01B' | '01C' | '01D' | '01E'
  | '02A' | '02B' | '02C' | '02D' | '02E' | '03A' | '03B' | '03C' | '03D' | '03E';

/**
 * DÜĞME SÖZLÜĞÜ — hangi eylem hangi dokuyu kullanır.
 *
 * ⚠️ VARYANTLAR GÖZLE SEÇİLDİ, adına göre değil: 15 varyantın hepsi PIL ile
 * kontakt sayfasına dizilip bakıldı. Bulgular kodda kalsın —
 *   01A nötr kahve · 02A KIRMIZI · 03A altın + mücevher (en gösterişli)
 *   01B/02B/03B aynıların dar hâli
 *   01C/02C/03C üzerinde "OK" YAZISI GÖMÜLÜ → özel metinle KULLANILAMAZ
 *   01D/E · 02D/E · 03D/E ince süs şeritleri, düğme değil
 *
 * ⚠️ ANLAM DOKUYA BAĞLANIYOR ki oyuncu okumadan önce ne olduğunu bilsin:
 * altın = gold harcıyorsun, kırmızı = geri dönüşü yok, kahve = sıradan.
 */
export const BTN = {
  /** gold harcayan alım — altın, mücevherli */
  buy: '03A',
  /** geri dönüşsüz / ağır eylem (füzyon, satış, iptal) */
  strong: '02A',
  /** sıradan eylem (tak/çıkar, sekme, kapat) */
  action: '01A',
} as const;

export function PixelButton({
  children, onClick, variant = '01A', scale = 2, disabled = false, active = false,
  style, title,
}: {
  children: ReactNode;
  onClick?: () => void;
  variant?: ButtonStyle;
  scale?: number;
  disabled?: boolean;
  /** seçili/aktif görünüm (Selected dokusu) */
  active?: boolean;
  style?: CSSProperties;
  title?: string;
}) {
  const [down, setDown] = useState(false);
  const [hover, setHover] = useState(false);

  const state = disabled ? 'Normal' : down ? 'Pressed' : (active || hover) ? 'Selected' : 'Normal';
  const src = `${KIT}/Buttons/Button_${variant}_${state}.png`;
  // 48×16 → YÜKSEKLİK SABİT (16·scale), yatayda orta karo tekrarlar.
  const s = int(scale);
  const h = 16 * s;
  return (
    <button
      title={title}
      disabled={disabled}
      // ⚠️ TIKLAMA SESİ ARTIK BURADA DEĞİL — `sfx.installUiClickSound()`.
      // Buradaki eski yorum kuralı doğru koymuştu ("ya hepsi ya hiçbiri") ama
      // ölçüm kuralın çiğnendiğini gösterdi: PixelButton'dan geçmeyen 82 ham
      // <button> vardı ve hiçbiri ses çıkarmıyordu. Ses tek bir delege
      // dinleyiciye taşındı; böylece kural bileşene bağlı kalmıyor ve yeni
      // eklenen düğme de kendiliğinden sese kavuşuyor.
      onClick={onClick}
      onPointerDown={() => setDown(true)}
      onPointerUp={() => setDown(false)}
      onPointerLeave={() => { setDown(false); setHover(false); }}
      onPointerEnter={() => setHover(true)}
      style={{
        ...sliceH(src, 16, s),
        height: h,
        minWidth: 48 * s,
        padding: 0,
        background: 'transparent',
        cursor: disabled ? 'default' : 'pointer',
        opacity: disabled ? 0.45 : 1,
        filter: disabled ? 'grayscale(0.7)' : 'none',
        fontFamily: FONT.ui,
        color: disabled ? C.boneFaint : C.bone,
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        // Pressed dokusu zaten bir piksel aşağı çizilmiş; metni de birlikte indir
        transform: down && !disabled ? 'translateY(1px)' : 'none',
        ...style,
      }}
    >
      <span style={{
        display: 'block', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
        lineHeight: 1, textShadow: '0 1px 0 rgba(0,0,0,0.55)',
      }}>
        {children}
      </span>
    </button>
  );
}

// ── BANNER (başlık şeridi) ────────────────────────────────────────────

/**
 * DİKKAT: sadece DURAĞAN flamalar burada listeli. 03A/03B/03C dosyaları
 * `_Normal/_Pressed/_Selected` ekiyle geliyor, düz adları YOK — birlik
 * yazınca 404 alınıyordu. Tip bunu derleme anında engelliyor.
 */
export type BannerStyle = '01A' | '01B' | '01C' | '02A' | '02B' | '02C' | '04A' | '05A' | '06A';

// Varsayılan 01C: koyu şarap merkez + altın kenar. 02A/02B/04A/05A açık renkli
// bez flamalar — koyu sahnede metin okunmuyor, kullanma.
export function Banner({ children, variant = '01C', scale = 2, style }: {
  children: ReactNode;
  variant?: BannerStyle;
  scale?: number;
  style?: CSSProperties;
}) {
  // 48×32 → yükseklik sabit (32·scale), yatayda tekrarlar (bkz. sliceH notu)
  return (
    <div style={{
      ...sliceH(`${KIT}/Title-banners/BannerMedium_${variant}.png`, 16, scale),
      height: 32 * int(scale),
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      ...style,
    }}>
      <div style={{
        fontFamily: FONT.title, fontWeight: 900, letterSpacing: 1.5, lineHeight: 1,
        color: C.bone, textAlign: 'center', whiteSpace: 'nowrap',
        textShadow: '0 1px 0 rgba(0,0,0,0.6)',
      }}>
        {children}
      </div>
    </div>
  );
}

// ── AYIRAÇ ────────────────────────────────────────────────────────────

export function Divider({ variant = '03', scale = 2 }: { variant?: string; scale?: number }) {
  return (
    <div style={{
      height: 16 * scale,
      backgroundImage: `url("${KIT}/Dividers/Divider_${variant}.png")`,
      backgroundSize: `auto ${16 * scale}px`,
      backgroundRepeat: 'repeat-x',
      backgroundPosition: 'center',
      ...pixel,
    }} />
  );
}

// ── CAN KÜRESİ ────────────────────────────────────────────────────────
// Diablo tarzı: dolgu alttan yukarı kırpılır, üstüne çerçeve biner.

export function Orb({ pct, kind = 'HP', scale = 2 }: {
  /** 0..1 */
  pct: number;
  kind?: 'HP' | 'MP' | 'Energy';
  /** varlık 48×48 — boyut TAM KAT olmalı, yoksa küre bulanıklaşır */
  scale?: number;
}) {
  const p = Math.max(0, Math.min(1, pct));
  const size = 48 * int(scale);
  return (
    <div style={{ position: 'relative', width: size, height: size, flexShrink: 0 }}>
      {/* dolgu — alttan yukarı doluyor */}
      <div style={{
        position: 'absolute', left: 0, right: 0, bottom: 0,
        height: `${p * 100}%`, overflow: 'hidden',
      }}>
        <img
          src={`${KIT}/Resource-orbs/Orb_${kind}.png`}
          alt=""
          style={{ position: 'absolute', bottom: 0, width: size, height: size, ...pixel }}
        />
      </div>
      {/* çerçeve — dolgunun üstünde */}
      <img
        src={`${KIT}/Resource-orbs/Orb_Frame_${kind}.png`}
        alt=""
        style={{ position: 'absolute', inset: 0, width: size, height: size, ...pixel }}
      />
    </div>
  );
}

// ── ÇUBUK (XP / ilerleme) ─────────────────────────────────────────────
// Franuka 8 kademe hazır dolgu veriyor; biz kutuyu taban alıp en dolu
// kademeyi kırparak PÜRÜZSÜZ dolum yapıyoruz (kademeli görünüm istemiyoruz).

/**
 * ÇUBUK DOLGUSUNUN RENGİ — sprite ADIYLA değil ÖLÇÜLEN RENGİYLE seçildi.
 *
 * ⚠️ `Bar` varyanttan bağımsız hep `_Bar08`i çiziyordu ve o sprite ÖLÇÜLDÜ:
 * rgb(102,157,78) — düpedüz YEŞİL. Oyunun paleti kemik/kan/mum altını/buz;
 * yeşil hiçbir yerde yok. Koşu içi XP çubuğu da kartın rütbe çubuğu da
 * bu yüzden sırıtıyordu.
 *
 * Sekiz dolgunun hepsi ölçüldü (ortalama görünür piksel):
 *   Bar01 110,196,187 turkuaz · Bar02 200,57,63 kırmızı · Bar03 229,126,46 kehribar
 *   Bar04 146,190,77 yeşil    · Bar05 93,150,160 buz    · Bar06 207,74,61 kırmızı
 *   Bar07 200,103,47 pas      · Bar08 102,157,78 yeşil
 *
 * Palete eşleme: gold→Bar03 (mum altını #efa72e'ye en yakın),
 * blood→Bar02, ice→Bar05. Yeşiller kullanılmıyor.
 */
const BAR_DOLGU = { gold: '03', blood: '02', ice: '05' } as const;

export function Bar({ pct, variant = '01', tone = 'gold', height = 16, scale = 2 }: {
  pct: number;
  variant?: '01' | '02' | '03';
  /** dolgu rengi — ⚠️ varsayılan `gold`, yeşil ARTIK SEÇENEK DEĞİL */
  tone?: keyof typeof BAR_DOLGU;
  height?: number;
  scale?: number;
}) {
  const p = Math.max(0, Math.min(1, pct));
  const s = Math.max(1, Math.round(scale));
  const h = height * s;
  return (
    <div style={{ position: 'relative', width: '100%', height: h }}>
      {/* boş oluk — altta */}
      <div style={{
        position: 'absolute', inset: 0,
        ...sliceH(`${KIT}/Sliders---Bars/Slider${variant}_Box.png`, 16, s),
      }} />
      {/* dolgu — oluğun İÇİNE oturur. Box `fill` ile ortasını da boyadığı için
          dolguyu üstte ve biraz içeride çiziyoruz, yoksa oluk dolguyu örter. */}
      <div style={{
        position: 'absolute', top: s, bottom: s, left: s * 2, right: s * 2,
        overflow: 'hidden',
      }}>
        <div style={{
          height: '100%', width: `${p * 100}%`, overflow: 'hidden',
          transition: 'width 120ms linear',
        }}>
          <div style={{
            height: '100%', width: `${100 / Math.max(p, 0.0001)}%`,
            backgroundImage: `url("${KIT}/Sliders---Bars/Slider${variant}_Bar${BAR_DOLGU[tone]}.png")`,
            backgroundSize: '100% 100%',
            ...pixel,
          }} />
        </div>
      </div>
    </div>
  );
}

// ── SLOT (silah / pasif kutusu) ───────────────────────────────────────

export type SlotType = 'Empty' | 'Weapon' | 'Shield' | 'Armor' | 'Headgear'
  | 'Gloves' | 'Footwear' | 'Necklace' | 'Ring' | 'Potion' | 'Consumable';

export function Slot({ type = 'Empty', variant = '02', scale = 2, children, title }: {
  type?: SlotType;
  variant?: '01' | '02' | '03';
  /** varlık 16×16 — boyut TAM KAT olmalı */
  scale?: number;
  children?: ReactNode;
  title?: string;
}) {
  const size = 16 * int(scale);
  return (
    <div title={title} style={{
      position: 'relative', width: size, height: size, flexShrink: 0,
      backgroundImage: `url("${KIT}/-tem-slots/Slot_${variant}_${type}.png")`,
      backgroundSize: '100% 100%',
      ...pixel,
    }}>
      {children && (
        <div style={{
          position: 'absolute', inset: 0, display: 'grid', placeItems: 'center',
          fontFamily: FONT.ui, fontSize: 11, fontWeight: 900, color: C.bone,
          textShadow: '0 1px 0 #000',
        }}>
          {children}
        </div>
      )}
    </div>
  );
}

// ── MİNİ İKONLAR ──────────────────────────────────────────────────────
//
// 96 dosya (32 ikon × Normal/Outline/Selected), hepsi 16×16 — ve bugüne kadar
// kodda HİÇ geçmiyorlardı. Paneller salt metindi; sayıların yanında ne
// olduğunu söyleyen bir işaret yoktu.
//
// ⚠️ İSİMLER ANLAMLA VERİLİYOR, DOSYA NUMARASIYLA DEĞİL. `Icon_05` yazmak,
// altı ay sonra "05 neydi" sorusunu ve tek tek dosya açmayı garantiler.
// Eşleme kontakt sayfası ÜRETİLİP GÖZLE OKUNARAK yapıldı, tahminle değil —
// bu projede sprite'ı adına göre yargılamak daha önce yanılttı.
// Eşleme `lib/icons.ts`te — saf veri, test edilebilir olsun diye ayrı
// (React bileşeni node testinden içe aktarılamıyor).
export { ICON, type IconName } from '@/lib/icons';

/**
 * 16×16 mini ikon.
 *
 * ⚠️ `scale` TAM SAYI (bkz. `int` başlığı) — kesirli ölçek piksel sanatı
 * titretir ve kullanıcı bunu ilk bakışta yakalamıştı.
 *
 * ⚠️ `dim` varyantı ayrı bir DOSYA (`_Outline`), CSS `opacity` DEĞİL.
 * Saydamlık ikonu soluklaştırır ama okunaklılığını da düşürür; paketin kendi
 * dış-hat çizimi 16 pikselde çok daha net kalıyor.
 */
export function Icon({ name, scale = 1, dim = false, title, style }: {
  name: IconName;
  scale?: number;
  dim?: boolean;
  title?: string;
  style?: CSSProperties;
}) {
  const s = 16 * int(scale);
  return (
    <span
      title={title}
      role="img"
      aria-label={name}
      style={{
        display: 'inline-block', width: s, height: s, flexShrink: 0,
        verticalAlign: 'text-bottom',
        backgroundImage: `url("${iconSrc(name, dim)}")`,
        backgroundSize: '100% 100%',
        ...pixel,
        ...style,
      }}
    />
  );
}

/** İkon + metin — panellerde en sık tekrar eden kalıp, tek yerde dursun */
export function IconText({ name, children, scale = 1, dim = false, gap = 5, style }: {
  name: IconName;
  children: ReactNode;
  scale?: number;
  dim?: boolean;
  gap?: number;
  style?: CSSProperties;
}) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap, ...style }}>
      <Icon name={name} scale={scale} dim={dim} />
      {children}
    </span>
  );
}

// ── SEKME ─────────────────────────────────────────────────────────────

export function Tab({ children, active = false, onClick, variant = '01', size = 44 }: {
  children: ReactNode;
  active?: boolean;
  onClick?: () => void;
  variant?: string;
  size?: number;
}) {
  return (
    <button onClick={onClick} style={{
      width: size, height: size, padding: 0, border: 'none', cursor: 'pointer',
      background: `url("${KIT}/Spellbook---Tabs/Tab${variant}_Bottom_${active ? 'Selected' : 'Normal'}.png") center/100% 100% no-repeat`,
      fontFamily: FONT.ui, fontSize: 11, fontWeight: 900,
      color: active ? C.candle : C.boneDim,
      ...pixel,
    }}>
      {children}
    </button>
  );
}

// ── SOĞUMA HALKASI ────────────────────────────────────────────────────
// `ui/borders/` altındaki 1024px radial'lar lisansı DOĞRULANMAMIŞ pakette.
// O yüzden halkayı conic-gradient ile çiziyoruz: sıfır dosya, sıfır risk.

export function CooldownRing({ pct, size = 48, children }: {
  /** 0 = hazır, 1 = tam soğumada */
  pct: number;
  size?: number;
  children?: ReactNode;
}) {
  const p = Math.max(0, Math.min(1, pct));
  return (
    <div style={{ position: 'relative', width: size, height: size, flexShrink: 0 }}>
      {children}
      {p > 0 && (
        <div style={{
          position: 'absolute', inset: 0, pointerEvents: 'none',
          background: `conic-gradient(rgba(6,5,4,0.72) ${p * 360}deg, transparent 0deg)`,
        }} />
      )}
    </div>
  );
}
