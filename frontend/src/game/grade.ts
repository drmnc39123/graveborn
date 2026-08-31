// RENK YÖNETİMİ — oyunun TEK renk dili.
//
// 🔴 NİYE VAR (ölçüldü, tahmin değil). Oyunda iki ayrı çizici vardı ve
// yalnız birinin renk yönetimi vardı:
//
//   `stageGround.ts` → grade{sat,bright,tintA} + tint + fog
//   `hubRender.ts`   → HİÇBİRİ, sadece bir vinyet
//
// Canvas pikselleri örneklendi (149.364 örnek, luminans bandı dağılımı):
//
//                0-20%   20-40%  40-60%  60-80%  80-100%   ort. RGB
//     Köy         9,7%    43,0%   41,7%    5,5%     0,2%   (101,100,61)
//     Savaş      94,2%     5,4%    0,1%    0,1%     0,1%   ( 31, 41,28)
//
// İki ekran ZIT yönlerde bozuktu: köyün %85'i orta tonda sıkışmış (tek bir
// yeşil, #668833, tüm karenin %28'i), savaş ekranı ise 129 renk kovasına
// düşmüş neredeyse siyah bir dikdörtgen.
//
// ⚠️ ASIL SONUÇ ZİNCİRİ — köyün ışık sistemi YAZILMIŞ AMA İŞLEMİYORDU:
// zemin derecelendirilmediği için parlak kalıyor → `drawMenuLights` mum
// halelerini `lighter` (additive) ile basıyor → parlak zeminde additive
// ışık görünmüyor. Mum ışığı ancak KARANLIĞA karşı okunur. Yani köyü
// derecelendirmek yeni bir süs eklemek değil, var olan bir sistemi
// çalıştırmak.
//
// ⚠️ BU DOSYA SİMÜLASYONA DOKUNMAZ. Saf sunum: girdi bir görsel + bir
// derece, çıktı pişmiş bir canvas. Motorun durumunu ne okur ne yazar.
//
// ⚠️ `ctx.filter` SICAK DÖNGÜDE YASAK (`perf.test.mts` kare başına 0 atama
// istiyor). Bu dosyadaki her `filter` kullanımı ÖNBELLEĞE PİŞİRME anında,
// yani nesne başına BİR KEZ olur. Çizim yolunda asla `filter` kurulmaz.

import { gorselAl } from './sprites';

/** Bir sahnenin renk kimliği. `stageArt.ts`teki alanların birleşimi. */
export interface Grade {
  /** doygunluk çarpanı (1 = dokunma) */
  sat: number;
  /** parlaklık çarpanı (1 = dokunma) */
  bright: number;
  /** tint katmanının alfası (0 = tint yok) */
  tintA: number;
  /** tint rengi [r,g,b] */
  tint: [number, number, number];
}

/**
 * Önbellek tavanı. ⚠️ `stageGround`daki `MAX_CHUNKS` ile aynı gerekçe:
 * sınırsız büyüyen önbellek uzun oturumda sessiz bir bellek sızıntısıdır.
 */
const MAX_PISMIS = 160;

/** src + derece → pişmiş sprite */
const pismis = new Map<string, HTMLCanvasElement>();

/**
 * Derecenin önbellek anahtarı.
 *
 * ⚠️ TINT DE ANAHTARA GİRER. Yalnız sat/bright ile anahtarlansaydı köyün
 * gündüz ve gece tint'i aynı gözü paylaşır, gün döngüsü hiç görünmezdi —
 * tam da `stageGround`un bir kez yaşadığı hata: önbellek anahtarı yalnız
 * bölüm id'siyken derinlik bandı değişince eski zemin ekranda kalıyordu.
 */
export function gradeAnahtari(g: Grade): string {
  return `${g.sat.toFixed(3)}|${g.bright.toFixed(3)}`
    + `|${g.tintA.toFixed(3)}|${g.tint[0]},${g.tint[1]},${g.tint[2]}`;
}

/** Canvas2D filtre dizesi — sat/bright tek yerden yazılsın diye. */
export function filtreMetni(g: Grade): string {
  return `saturate(${g.sat}) brightness(${g.bright})`;
}

/**
 * TINT KATMANI — bir chunk/sprite'ın ÜSTÜNE binen renk.
 *
 * ⚠️ `source-atop` KULLANILIYOR, düz `fillRect` DEĞİL. Şeffaf karo
 * bölgelerinde (harita kenarı, su oyuğu) düz dolgu, olmayan zemini
 * boyayıp chunk sınırını görünür bir dikdörtgen hâline getirirdi.
 * `source-atop` yalnız zaten boyanmış piksellere dokunur.
 */
export function tintUygula(
  ctx: CanvasRenderingContext2D, w: number, h: number, g: Grade,
): void {
  if (g.tintA <= 0) return;
  ctx.save();
  ctx.globalCompositeOperation = 'source-atop';
  ctx.fillStyle = `rgba(${g.tint[0]},${g.tint[1]},${g.tint[2]},${g.tintA})`;
  ctx.fillRect(0, 0, w, h);
  ctx.restore();
}

/**
 * DERECELENDİRİLMİŞ SPRITE — yoksa pişirir, varsa önbellekten verir.
 *
 * ⚠️ GÖRSELİ ÇAĞIRAN VERİR, bu modül YÜKLEMEZ. Sebebi somut: depoda İKİ
 * ayrı görsel yükleyici var (`sprites.ts`in `cache`i ve `stageGround`un
 * kendi `images` haritası). Bu fonksiyon kendi yükleyicisini seçseydi,
 * diğerini kullanan çağıran için aynı dosya İKİ KEZ indirilir ve
 * "yüklendi mi" sorusunun iki ayrı cevabı olurdu. `src` burada yalnız
 * ÖNBELLEK ANAHTARI.
 *
 * ⚠️ EKSİK GÖRSEL ÖNBELLEĞE ALINMAZ. Görseller asenkron yükleniyor; yarım
 * yüklenmiş bir sprite pişirilirse o bozuk hâl sonsuza kadar önbellekte
 * kalır. Ölçülemeyen boyutta HAM görsel döner (bu kare derecesiz çizilir),
 * sonraki karede yeniden denenir.
 */
export function gradeli(
  src: string, im: HTMLImageElement, g: Grade,
): CanvasImageSource {
  if (typeof document === 'undefined') return im;

  const key = `${src}|${gradeAnahtari(g)}`;
  const hit = pismis.get(key);
  if (hit) return hit;

  const w = im.naturalWidth, h = im.naturalHeight;
  if (!w || !h) return im;   // henüz yüklenmedi — pişirme

  const off = document.createElement('canvas');
  off.width = w; off.height = h;
  const o = off.getContext('2d');
  if (!o) return im;
  o.imageSmoothingEnabled = false;
  o.filter = filtreMetni(g);
  o.drawImage(im, 0, 0);
  o.filter = 'none';
  tintUygula(o, w, h, g);

  if (pismis.size >= MAX_PISMIS) {
    const ilk = pismis.keys().next().value;
    if (ilk) pismis.delete(ilk);
  }
  pismis.set(key, off);
  return off;
}

/** `sprites.ts` yükleyicisini kullanan kolaylık sarmalayıcısı (köy tarafı). */
export function gradeliGorsel(src: string, g: Grade): CanvasImageSource | null {
  const im = gorselAl(src);
  if (!im) return null;
  return gradeli(src, im, g);
}

/** Yeni koşu / bölüm değişimi — pişmiş önbelleği boşalt. */
export function resetGrade(): void {
  pismis.clear();
}

// ── KÖYÜN GÜN DÖNGÜSÜ ─────────────────────────────────────────────────
//
// ⚠️ SAAT SUNUCUDAN VE **UTC**. İki ayrı karar:
//
//   (1) Sunucudan — `EventBanner`daki kuralın aynısı. Cihaz saatine
//       güvenilseydi saati kaymış bir telefonda köy gece, komşusunda
//       gündüz olurdu.
//   (2) UTC — köy ÇOK OYUNCULU. Yerel saate bağlansaydı yan yana duran
//       iki oyuncu farklı gökyüzü görürdü. Gün döngüsü bir saat okuması
//       değil, herkesin paylaştığı bir DÜNYA OLAYI olmalı.
//
// ⚠️ SAATE YUVARLANIYOR, sürekli değil. Derece chunk önbelleğinin anahtarı;
// her karede biraz kaysaydı önbellek her karede çöp olur ve köy hem
// titrer hem yavaşlardı. Saat başı bir kez değişmek göze görünmez.

/**
 * Günün üç çapası. Ara saatler bunların arasında yumuşatılır.
 *
 * 🔴 BU DEĞERLER SERBEST SEÇİLMEDİ — `hubRender.ts`te yazılı bir yasak var:
 *   *"KÖYE GECE KATMANI EKLEME. Bir kez denendi (nesnelerden sonra,
 *     ışıklardan önce koyu bir yıkama): meşaleler gerçekten yanıyor gibi
 *     oldu ama köy KARARDI ve kullanıcı geri aldırdı."*
 *
 * ⚠️ BU O DEĞİL, ve farkı bilmek önemli. Geri alınan deneme SAHNENİN
 * TAMAMINA geç bir karartma yıkamasıydı: oyuncu, köylüler ve binalar dahil
 * her şey kararıyordu. Buradaki derecelendirme yalnız **zemine ve durağan
 * dekora** pişiyor; aktörler (oyuncu, köylüler, diğer oyuncular) tam
 * parlaklıkta kalıyor. Yani "kimi göreceğim" hiç değişmiyor, "nerede
 * duruyorum" değişiyor.
 *
 * ⚠️ GECE SİYAH DEĞİL. `bright: 0.58` bilinçli bir taban: ölçülen sorun
 * köyün tonal aralığının olmaması (%93 orta ton, %0,2 parlak), fazla
 * aydınlık olması değil. Kaldıraç ARALIĞI AÇMAK — dipleri indirip mum
 * ışığının tepeleri üretmesine izin vermek. Daha fazla karartmak, geri
 * alınan denemeyi tekrarlamak olur.
 */
const CAPA = {
  /** 10-16 — güvenli ve açık, ama artık DÜZ değil */
  gunduz: { sat: 0.96, bright: 0.92, tintA: 0.08, tint: [26, 24, 16] },
  /** 16-20 — kehribar batış */
  aksam: { sat: 0.88, bright: 0.84, tintA: 0.16, tint: [46, 28, 14] },
  /** 22-06 — soğuk alacakaranlık; ışık sahneyi burada DEVRALIR */
  gece: { sat: 0.74, bright: 0.72, tintA: 0.26, tint: [14, 18, 32] },
} as const satisfies Record<string, Grade>;

/**
 * Sunucu saati bilinmiyorken kullanılan derece.
 *
 * ⚠️ GÜNDÜZ, gece değil. Sunucuya ulaşamayan oyuncu köyü ASLA karanlık
 * görmemeli: karanlık bir köy "bir şey bozuk" sinyali verir ve oyuncunun
 * bunu düzeltmesinin yolu yoktur. Bilinmeyen durumun cevabı en güvenli
 * durumdur.
 */
export const GUNDUZ: Grade = { ...CAPA.gunduz, tint: [...CAPA.gunduz.tint] };

const kar = (a: number, b: number, k: number) => a + (b - a) * k;

function harmanla(a: Grade, b: Grade, k: number): Grade {
  return {
    sat: kar(a.sat, b.sat, k),
    bright: kar(a.bright, b.bright, k),
    tintA: kar(a.tintA, b.tintA, k),
    tint: [
      Math.round(kar(a.tint[0], b.tint[0], k)),
      Math.round(kar(a.tint[1], b.tint[1], k)),
      Math.round(kar(a.tint[2], b.tint[2], k)),
    ],
  };
}

/**
 * Köyün o saatteki derecesi.
 *
 * @param nowMs sunucudan gelen epoch ms. ⚠️ Sunucu saati YOKSA çağıran
 *   taraf gündüz varsayar (bkz. `hubRender`) — oyun asla erişilemeyen bir
 *   sunucu yüzünden karanlıkta kilitlenmez.
 */
export function koyGradei(nowMs: number): Grade {
  const s = new Date(nowMs).getUTCHours();

  // 06→10 şafak (gece→gündüz) · 16→20 batış (gündüz→akşam)
  // 20→22 gece iner (akşam→gece) · kalanlar sabit
  if (s >= 6 && s < 10) return harmanla(CAPA.gece, CAPA.gunduz, (s - 6) / 4);
  if (s >= 10 && s < 16) return { ...CAPA.gunduz, tint: [...CAPA.gunduz.tint] };
  if (s >= 16 && s < 20) return harmanla(CAPA.gunduz, CAPA.aksam, (s - 16) / 4);
  if (s >= 20 && s < 22) return harmanla(CAPA.aksam, CAPA.gece, (s - 20) / 2);
  return { ...CAPA.gece, tint: [...CAPA.gece.tint] };
}

/**
 * Köyün ışık şiddeti çarpanı — mum haleleri karanlıkta daha güçlü yansın.
 *
 * ⚠️ GİRDİ `Grade`, saat DEĞİL. Ölçüt zeminin gerçekte ne kadar karardığı;
 * saatten ikinci kez türetilseydi iki eğri zamanla ayrışır ve ışık, zemine
 * uymayan bir güçte yanardı.
 *
 * ⚠️ AYRI FONKSİYON, `Grade`in içinde bir ALAN değil: `Grade` zemine
 * uygulanan bir renk dönüşümü, bu ise ışık katmanının parlaklığı. Tek
 * nesneye koymak, bölüm zeminini derecelendirirken sahne ışığını da
 * sessizce değiştirmek olurdu.
 */
export function koyIsikGucu(g: Grade): number {
  // 0,72 (gece) → ~1,25×  ·  0,84 (akşam) → ~1,07×  ·  0,92 (gündüz) → ~0,98×
  return Math.max(0.85, Math.min(1.6, 0.9 / Math.max(0.35, g.bright)));
}
