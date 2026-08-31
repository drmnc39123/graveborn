// PİKSEL BİTMAP FONT — oyunun GERÇEK başlık yüzü.
//
// 🔴 NİYE VAR: oyunun iki font ailesi (`GBText`, `GBTitle`) AYNI DOSYAYA
// işaret ediyor (`Pixellari.ttf`) — yani tipografik hiyerarşi diye bir şey
// yoktu, başlıkla gövde metni birebir aynı yüzdü. Üstelik 303 çağrı yeri
// `fontWeight: 700-900` istiyor ve dosyanın tek ağırlığı var; tarayıcı
// sahte kalın üretiyor (ölçüldü: aynı ilerleme genişliğine %37 daha fazla
// mürekkep → harf içi boşluklar kapanıyor).
//
// ⭐ ASIL BULGU: paketin GERÇEK başlık fontu depoda DURUYOR ve hiç
// kullanılmıyordu — `public/art/ui/kit/Fonts/` altında 8 bitmap sayfa
// (metin + başlık × Brown/Gold/Red/White). `ATTRIBUTION.md` bunları
// "8'in/11'in katlarında kullanın, vektör değiller" diye tarif ediyor.
// `fx.ts` de `"FantasyRPGtext"` diye TTF sanıp arıyordu; öyle bir TTF yok,
// paketteki hâli buydu.
//
// ⚠️ IZGARA ÖLÇÜLDÜ, VARSAYILMADI. Boş sütun/satır taraması yapıldı:
//   BAŞLIK  416×48 → 26×3 hücre, hücre 16×16
//   METİN   512×80 → 32×5 hücre, hücre 16×16
// Karakter sırası da ekrana basılıp OKUNDU (aşağıdaki haritalar).
//
// ⚠️ GLİF GENİŞLİKLERİ ÇALIŞMA ZAMANINDA ÖLÇÜLÜYOR, elle yazılmıyor.
// Hücre 16 px ama mürekkep dar (ör. `I` 3 px, `W` 11 px); sabit 16 px
// ilerleme kullanmak kelimeleri harf çorbasına çevirirdi. Elle bir tablo
// yazmak ise 78 + 160 sayı demek ve ilk yanlış sayı sessizce kayar.

/** Hücre boyu — iki sayfa için de ölçüldü */
const HUCRE = 16;

/**
 * BAŞLIK SAYFASI — 26×3, SADECE BÜYÜK HARF.
 * ⚠️ Küçük harf YOK. `ciz()` gelen metni büyütüyor; başlık fontu zaten
 * bu iş için çizilmiş ve oyunun başlıklarının hepsi büyük harf.
 */
const BASLIK_HARITA =
  'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
  + '0123456789.,;:¿?¡!\'"+-=★@#'
  + '$%&/\\_()[]{}|~<>^';

/**
 * METİN SAYFASI — 32×5, tam takım.
 * ⚠️ `Ñ` HARFİ N'DEN SONRA GELİYOR (paketin sırası, ASCII değil). Bu
 * satırı alfabetik sanıp `Ñ`yi atlamak sonraki BÜTÜN harfleri bir hücre
 * kaydırırdı — sessiz ve tamamen okunmaz bir sonuç.
 * ⚠️ Satır 32 hücre ama harfler 27'de bitiyor; kalan hücreler BOŞ ve
 * haritada karşılıkları yok (aşağıdaki dolgu bunun için).
 */
const METIN_HARITA =
  'ABCDEFGHIJKLMNÑOPQRSTUVWXYZ'.padEnd(32, ' ')
  + 'abcdefghijklmnñopqrstuvwxyz'.padEnd(32, ' ')
  + '0123456789.,;:¿?¡!\'"'.padEnd(32, ' ');

export type FontRengi = 'white' | 'gold' | 'red' | 'brown';
export type FontAilesi = 'title' | 'text';

const DOSYA: Record<FontAilesi, Record<FontRengi, string>> = {
  title: {
    white: '/art/ui/kit/Fonts/FontTitle_White.png',
    gold: '/art/ui/kit/Fonts/FontTitle_Gold.png',
    red: '/art/ui/kit/Fonts/FontTitle_Red.png',
    brown: '/art/ui/kit/Fonts/FontTitle_Brown.png',
  },
  text: {
    white: '/art/ui/kit/Fonts/FontText_White.png',
    gold: '/art/ui/kit/Fonts/FontText_Gold.png',
    red: '/art/ui/kit/Fonts/FontText_Red.png',
    brown: '/art/ui/kit/Fonts/FontText_Brown.png',
  },
};

const SUTUN: Record<FontAilesi, number> = { title: 26, text: 32 };
const HARITA: Record<FontAilesi, string> = { title: BASLIK_HARITA, text: METIN_HARITA };

interface Glif {
  /** hücre içindeki mürekkep kutusu */
  sx: number; sw: number;
  /** hücrenin sol üst köşesi (atlas içinde) */
  cx: number; cy: number;
}

interface Yuklu {
  im: HTMLImageElement;
  glif: Map<string, Glif>;
  /** mürekkebin dikey sınırları — satır yüksekliği buradan */
  ust: number; alt: number;
}

const yuklu = new Map<string, Yuklu>();
const yukleniyor = new Map<string, Promise<Yuklu | null>>();

/**
 * Sayfayı yükle ve HER GLİFİN mürekkep genişliğini ÖLÇ.
 *
 * ⚠️ BİR KEZ. Ölçüm 78-160 hücre × 16×16 piksel tarama; her çizimde
 * yapılsaydı saçma olurdu. Sonuç modülde önbelleklenir.
 */
function yukle(aile: FontAilesi, renk: FontRengi): Promise<Yuklu | null> {
  const anahtar = `${aile}:${renk}`;
  const hazir = yuklu.get(anahtar);
  if (hazir) return Promise.resolve(hazir);
  const bekleyen = yukleniyor.get(anahtar);
  if (bekleyen) return bekleyen;
  if (typeof document === 'undefined') return Promise.resolve(null);

  const p = new Promise<Yuklu | null>((resolve) => {
    const im = new Image();
    im.onerror = () => resolve(null);
    im.onload = () => {
      const c = document.createElement('canvas');
      c.width = im.width; c.height = im.height;
      const g = c.getContext('2d', { willReadFrequently: true });
      if (!g) { resolve(null); return; }
      g.imageSmoothingEnabled = false;
      g.drawImage(im, 0, 0);
      const d = g.getImageData(0, 0, c.width, c.height).data;
      const dolu = (x: number, y: number) => d[(y * c.width + x) * 4 + 3] > 16;

      const sutun = SUTUN[aile];
      const harita = HARITA[aile];
      const glif = new Map<string, Glif>();
      let ust = HUCRE, alt = 0;

      for (let i = 0; i < harita.length; i++) {
        const ch = harita[i];
        if (ch === ' ' || ch === undefined) continue;
        const cx = (i % sutun) * HUCRE;
        const cy = Math.floor(i / sutun) * HUCRE;
        if (cx + HUCRE > c.width || cy + HUCRE > c.height) continue;

        let x0 = HUCRE, x1 = -1;
        for (let y = 0; y < HUCRE; y++) {
          for (let x = 0; x < HUCRE; x++) {
            if (!dolu(cx + x, cy + y)) continue;
            if (x < x0) x0 = x;
            if (x > x1) x1 = x;
            if (y < ust) ust = y;
            if (y > alt) alt = y;
          }
        }
        // ⚠️ BOŞ HÜCRE HARİTAYA GİRMEZ. Girseydi `ciz()` onu "var" sayar ve
        // metinde görünmez bir delik açardı.
        if (x1 < x0) continue;
        glif.set(ch, { sx: x0, sw: x1 - x0 + 1, cx, cy });
      }

      if (alt < ust) { resolve(null); return; }   // hiç mürekkep yok
      const y: Yuklu = { im, glif, ust, alt };
      yuklu.set(anahtar, y);
      resolve(y);
    };
    im.src = DOSYA[aile][renk];
  });
  yukleniyor.set(anahtar, p);
  return p;
}

/** Sayfayı önceden istemeye başla (çizimden önce çağrılabilir) */
export function pixelFontYukle(aile: FontAilesi, renk: FontRengi): void {
  void yukle(aile, renk);
}

/** Yüklüyse hazır kayıt, değilse null — senkron çizim yolu için */
export function pixelFontHazir(aile: FontAilesi, renk: FontRengi): Yuklu | null {
  return yuklu.get(`${aile}:${renk}`) ?? null;
}

export interface CizimOlcusu { w: number; h: number }

/**
 * Metnin piksel ölçüsü — hiçbir şey çizmeden.
 * ⚠️ Boşluk genişliği harf yüksekliğinin üçte biri: sabit bir piksel
 * değeri ölçek büyüdükçe kelimeleri birbirine yapıştırırdı.
 */
export function pixelOlc(
  y: Yuklu, metin: string, olcek: number, bosluk = 1,
): CizimOlcusu {
  const h = y.alt - y.ust + 1;
  let w = 0;
  for (const ch of metin) {
    if (ch === ' ') { w += Math.round(h / 3) + bosluk; continue; }
    const g = y.glif.get(ch);
    if (!g) continue;
    w += g.sw + bosluk;
  }
  return { w: Math.max(0, (w - bosluk)) * olcek, h: h * olcek };
}

/**
 * Metni bir 2B bağlama çiz. Sol-üst köşe (x, y).
 * @returns çizilen genişlik (px) — hiç glif yoksa 0
 *
 * ⚠️ ÖLÇEK TAM SAYI OLMALI. Kesirli ölçek piksel ızgarasını bozar ve
 * fontun bütün amacı kaybolur; çağıran taraf yuvarlamalı.
 */
export function pixelCiz(
  ctx: CanvasRenderingContext2D, y: Yuklu, metin: string,
  x: number, yy: number, olcek: number, bosluk = 1,
): number {
  const h = y.alt - y.ust + 1;
  let kalem = x;
  for (const ch of metin) {
    if (ch === ' ') { kalem += (Math.round(h / 3) + bosluk) * olcek; continue; }
    const g = y.glif.get(ch);
    if (!g) continue;
    ctx.drawImage(
      y.im,
      g.cx + g.sx, g.cy + y.ust, g.sw, h,
      Math.round(kalem), Math.round(yy), g.sw * olcek, h * olcek,
    );
    kalem += (g.sw + bosluk) * olcek;
  }
  return kalem - x - bosluk * olcek;
}

/**
 * Metnin bu sayfayla TAMAMEN çizilip çizilemeyeceği.
 *
 * ⚠️ KISMİ ÇİZİM YOK. Bir harf eksikse metin sessizce delikli çıkar —
 * bu depodaki "kod çalışıyor, ekranda yanlış" sınıfının tam örneği.
 * Çağıran taraf bunu sorup TTF'e düşmeli.
 */
export function pixelKapsiyor(y: Yuklu, metin: string): boolean {
  for (const ch of metin) {
    if (ch === ' ') continue;
    if (!y.glif.has(ch)) return false;
  }
  return true;
}
