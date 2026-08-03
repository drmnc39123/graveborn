// ARENA ZEMİNİ + ATMOSFER — savaş ekranının görsel omurgası.
//
// ⚠️ PERFORMANS ÖNCE. Ekranda 420 düşmana kadar çıkılabiliyor; zemin çizimi
// bunun üstüne binmemeli. Bu yüzden iki farklı yol kullanılıyor:
//
//   ZEMİN  → chunk önbelleği. 1280×720'de 900+ karo var, her kare tek tek
//            çizmek anlamsız. 256×256'lık parçalar bir kez offscreen canvas'a
//            işlenir, sonra ~20 blit ile ekrana basılır.
//   ENKAZ  → doğrudan çizim. Seyrek (hücre başına ~%1), ekranda 10-20 tane.
//            Chunk'a gömseydik parça sınırında kesilirdi.
//
// ⚠️ Görseller asenkron yükleniyor. Eksik görselle inşa edilen chunk sonsuza
// kadar bozuk kalırdı — o yüzden eksikse chunk ÖNBELLEĞE ALINMAZ, sonraki
// karede yeniden denenir.

import { artOf, tileHash, variantOf, type StageArt } from './stageArt';

const TILE = 32;
const CHUNK_TILES = 8;
const CHUNK = TILE * CHUNK_TILES; // 256px
/** Önbellek tavanı — oyuncu koştukça sınırsız büyümemeli */
const MAX_CHUNKS = 120;

const images = new Map<string, HTMLImageElement>();
const chunks = new Map<string, HTMLCanvasElement>();
let builtFor = -1;

/** Yeni koşu / yeni derinlik: bölüm değiştiyse önbellek geçersiz */
export function resetStageGround() {
  chunks.clear();
  builtFor = -1;
}

function img(src: string): HTMLImageElement | null {
  let i = images.get(src);
  if (!i) {
    if (typeof window === 'undefined') return null;
    i = new Image();
    i.src = src;
    images.set(src, i);
    return null;
  }
  return i.complete && i.naturalWidth > 0 ? i : null;
}

/** Ağırlıklı karo seçimi — ilk karo baskın, çeşitlilik gürültüye dönmesin */
function pickTile(art: StageArt, r: number): string {
  let total = 0;
  for (const w of art.weights) total += w;
  let acc = 0;
  const t = r * total;
  for (let i = 0; i < art.ground.length; i++) {
    acc += art.weights[i] ?? 1;
    if (t < acc) return art.ground[i];
  }
  return art.ground[0];
}

function chunkCanvas(art: StageArt, stageId: number, cx: number, cy: number): HTMLCanvasElement | null {
  const key = `${stageId}:${cx}:${cy}`;
  const hit = chunks.get(key);
  if (hit) return hit;
  if (typeof document === 'undefined') return null;

  const off = document.createElement('canvas');
  off.width = CHUNK;
  off.height = CHUNK;
  const o = off.getContext('2d');
  if (!o) return null;
  o.imageSmoothingEnabled = false;

  // ⚠️ RENK DERECELENDİRME BURADA, chunk başına BİR KEZ. Karo setleri parlak
  // ve doygun (çim resmen çimen yeşili); sadece üstüne atmosfer katmanı
  // koymak yetmedi, sahne gotik korku değil çocuk RPG'si gibi duruyordu.
  // `ctx.filter` her karede kullanılsa pahalı olurdu — chunk'ta bedava.
  o.filter = `saturate(${art.grade.sat}) brightness(${art.grade.bright})`;

  let eksik = false;
  for (let ty = 0; ty < CHUNK_TILES; ty++) {
    for (let tx = 0; tx < CHUNK_TILES; tx++) {
      const wx = cx * CHUNK_TILES + tx;
      const wy = cy * CHUNK_TILES + ty;
      const src = pickTile(art, tileHash(wx, wy, stageId));
      const im = img(src);
      if (!im) { eksik = true; continue; }

      // ⚠️ TEKRARI RENKLE DEĞİL DÖNDÜRMEYLE KIRIYORUZ. Farklı renkte karo
      // serpmek dama tahtası üretiyordu — varyantlar tam 32×32 blok olarak
      // okunuyor, arazi değil yama işi gibi duruyordu. Aynı karonun dört
      // yöne çevrilmiş hali tekrarı kırar ve renk bütünlüğünü bozmaz.
      const rot = Math.floor(tileHash(wx, wy, stageId + 991) * 4);
      const flip = tileHash(wx, wy, stageId + 4409) < 0.5 ? -1 : 1;
      o.save();
      o.translate(tx * TILE + TILE / 2, ty * TILE + TILE / 2);
      o.rotate((rot * Math.PI) / 2);
      o.scale(flip, 1);
      o.drawImage(im, -TILE / 2, -TILE / 2, TILE, TILE);
      o.restore();

      // Şeffaf detay katmanı — çim tutamı, çatlak, döküntü. Baz karonun
      // ÜSTÜNE biner; tek başına çizilseydi altı boş kalırdı.
      let acc = 0;
      const ov = tileHash(wx, wy, stageId + 15331);
      for (const layer of art.overlay) {
        acc += layer.chance;
        if (ov >= acc) continue;
        const oi = img(layer.src);
        if (!oi) break;
        const orot = Math.floor(tileHash(wx, wy, stageId + 27077) * 4);
        o.save();
        o.translate(tx * TILE + TILE / 2, ty * TILE + TILE / 2);
        o.rotate((orot * Math.PI) / 2);
        o.drawImage(oi, -TILE / 2, -TILE / 2, TILE, TILE);
        o.restore();
        break;
      }
    }
  }
  o.filter = 'none';
  // Eksik görselle önbelleğe alırsak boşluk kalıcı olur
  if (eksik) return null;

  // Bölümün rengini zemine işle — her yol kendi havasını taşısın
  const [tr, tg, tb] = art.tint;
  o.fillStyle = `rgba(${tr},${tg},${tb},${art.grade.tintA})`;
  o.fillRect(0, 0, CHUNK, CHUNK);

  if (chunks.size >= MAX_CHUNKS) {
    // En eskiyi at — Map ekleme sırasını korur
    const ilk = chunks.keys().next().value;
    if (ilk !== undefined) chunks.delete(ilk);
  }
  chunks.set(key, off);
  return off;
}

/**
 * Zemin. Kamera dönüşümü UYGULANMIŞ halde çağrılır (dünya uzayı).
 */
export function drawStageGround(
  ctx: CanvasRenderingContext2D, stageId: number,
  px: number, py: number, w: number, h: number,
) {
  const art = artOf(stageId);
  if (builtFor !== stageId) { chunks.clear(); builtFor = stageId; }

  // Karo yüklenene kadar altta duracak taban rengi — bir kare bile beyaz/boş
  // görünmesin (yükleme sırasında ekran atlıyordu).
  const [r, g, b] = art.tint;
  ctx.fillStyle = `rgb(${Math.round(r * 1.6)},${Math.round(g * 1.6)},${Math.round(b * 1.6)})`;
  ctx.fillRect(px - w, py - h, w * 2, h * 2);

  const c0x = Math.floor((px - w / 2) / CHUNK);
  const c0y = Math.floor((py - h / 2) / CHUNK);
  const c1x = Math.floor((px + w / 2) / CHUNK);
  const c1y = Math.floor((py + h / 2) / CHUNK);

  for (let cy = c0y; cy <= c1y; cy++) {
    for (let cx = c0x; cx <= c1x; cx++) {
      const cv = chunkCanvas(art, stageId, cx, cy);
      if (cv) ctx.drawImage(cv, cx * CHUNK, cy * CHUNK);
    }
  }
}

/**
 * Enkaz — zeminin üstünde, oyuncunun ALTINDA. Seyrek olduğu için doğrudan
 * çiziliyor; chunk'a gömülseydi parça sınırında kesilirdi (64px ağaç 32px
 * hücreye sığmıyor).
 */
export function drawStageDecor(
  ctx: CanvasRenderingContext2D, stageId: number,
  px: number, py: number, w: number, h: number,
) {
  const art = artOf(stageId);
  if (!art.decor.length) return;

  // Kenardan bir tur fazla tara: yarısı ekran dışında kalan enkaz aniden
  // belirmesin.
  const pad = 2;
  const x0 = Math.floor((px - w / 2) / TILE) - pad;
  const y0 = Math.floor((py - h / 2) / TILE) - pad;
  const x1 = Math.floor((px + w / 2) / TILE) + pad;
  const y1 = Math.floor((py + h / 2) / TILE) + pad;

  ctx.save();
  // Enkaz da zeminle aynı derecelendirmeden geçsin — yoksa koyu bir arazinin
  // üstünde parlak sprite'lar yüzer gibi durur. Tek set/reset, tüm enkaz için.
  ctx.filter = `saturate(${art.grade.sat}) brightness(${art.grade.bright + 0.12})`;
  for (let ty = y0; ty <= y1; ty++) {
    for (let tx = x0; tx <= x1; tx++) {
      const r = tileHash(tx, ty, stageId + 7919);
      let acc = 0;
      for (const d of art.decor) {
        acc += d.chance;
        if (r >= acc) continue;

        const im = img(variantOf(d.src, tileHash(tx, ty, stageId + 104729)));
        if (!im) break;
        // Hücre içinde küçük bir kayma — ızgaraya dizilmiş görünmesin
        const jx = (tileHash(tx, ty, 31) - 0.5) * TILE * 0.6;
        const jy = (tileHash(tx, ty, 37) - 0.5) * TILE * 0.6;
        const cxp = tx * TILE + jx;
        const cyp = ty * TILE + jy;

        // Gölge önce — enkaz zemine otursun, üstüne yapıştırılmış durmasın
        if (d.shadow) {
          ctx.globalAlpha = d.shadow;
          ctx.fillStyle = '#000';
          ctx.beginPath();
          ctx.ellipse(cxp, cyp + d.h * 0.34, d.w * 0.30, d.h * 0.10, 0, 0, Math.PI * 2);
          ctx.fill();
        }

        ctx.globalAlpha = d.alpha ?? 1;
        ctx.drawImage(im, cxp - d.w / 2, cyp - d.h / 2, d.w, d.h);
        break;
      }
    }
  }
  ctx.restore();
}

/**
 * ATMOSFER — sahnenin havasını veren tek geçiş. Kamera dönüşümü GERİ
 * ALINMIŞ halde, ekran uzayında çağrılır.
 *
 * ⚠️ Düz bir karartma katmanı DEĞİL. Renk oyuncunun etrafında açılıyor:
 * merkezde soluk, kenarda koyu. Böylece hem vinyet hem "meşale taşıyor"
 * hissi tek fillRect ile geliyor — ayrı bir ışık geçişi maskeleme
 * gerektirirdi (offscreen + destination-out), o da her karede pahalı.
 */
export function drawAtmosphere(
  ctx: CanvasRenderingContext2D, stageId: number,
  w: number, h: number, time: number,
) {
  const art = artOf(stageId);
  const [r, g, b, a] = art.tint;
  const cx = w / 2;
  const cy = h / 2;
  const maxR = Math.hypot(w, h) / 2;

  // Meşale nefesi — sabit bir hale ölü görünüyor
  const nefes = 1 + Math.sin(time * 1.7) * 0.03 + Math.sin(time * 0.7) * 0.02;
  const ic = maxR * 0.30 * nefes;

  // ⚠️ Alpha'lar zemin derecelendirmesi eklendikten SONRA düşürüldü. İkisi
  // birden tam güçte olunca sahne okunmaz karanlığa gidiyordu: düşmanlar
  // kayboluyor, oyuncu nereye gittiğini göremiyordu. Karartmanın işi
  // sahneyi köşelerden çerçevelemek, ortasını yutmak değil.
  const grad = ctx.createRadialGradient(cx, cy, ic * 0.25, cx, cy, maxR);
  grad.addColorStop(0, `rgba(${r},${g},${b},${a * 0.05})`);
  grad.addColorStop(0.35, `rgba(${r},${g},${b},${a * 0.26})`);
  grad.addColorStop(0.72, `rgba(${r},${g},${b},${a * 0.62})`);
  grad.addColorStop(1, `rgba(${Math.round(r * 0.5)},${Math.round(g * 0.5)},${Math.round(b * 0.5)},${Math.min(a * 1.15, 0.8)})`);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);

  // Sis — iki yavaş sürüklenen kütle. Tek katman "duran duman" gibi
  // görünüyordu; iki farklı hızda üst üste binince akıyor.
  if (art.fog > 0) {
    drawFogBank(ctx, w, h, time * 0.021, art.fog, 0.62);
    drawFogBank(ctx, w, h, -time * 0.013 + 0.5, art.fog, 0.42);
  }
}

function drawFogBank(ctx: CanvasRenderingContext2D, w: number, h: number, t: number, yogunluk: number, olcek: number) {
  const f = ((t % 1) + 1) % 1;
  const x = (f * (w + 700)) - 350;
  const y = h * (0.3 + Math.sin(t * 6.28) * 0.22);
  const rad = Math.max(w, h) * olcek;

  const gr = ctx.createRadialGradient(x, y, 0, x, y, rad);
  gr.addColorStop(0, `rgba(190,200,205,${yogunluk * 0.11})`);
  gr.addColorStop(0.55, `rgba(170,180,190,${yogunluk * 0.05})`);
  gr.addColorStop(1, 'rgba(150,160,170,0)');
  ctx.fillStyle = gr;
  ctx.fillRect(0, 0, w, h);
}
