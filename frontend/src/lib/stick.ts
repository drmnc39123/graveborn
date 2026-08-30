// SANAL JOYSTICK — dokunmatik hareket girdisi, TEK KAYNAK.
//
// ⚠️ NİYE ORTAK DOSYA: bu mantık `GameCanvas` ve `HubCanvas` içinde İKİ AYRI
// yerde, birbirinden habersiz yazılmıştı ve `ArenaScreen`e üçüncü kez
// yazılmak üzereydi. Bu depoda aynı sınıf bir hata pahalıya mal oldu:
// `smartPick` üç ayrı yerde yazılmıştı ve İKİSİ BOZUKTU (bkz.
// `simPlayer.mts` başlığı) — üç ölçüm aleti üç farklı oyuncuyu simüle
// ediyordu ve kimse fark etmiyordu.
//
// ⚠️ VE İKİ KOPYA ZATEN AYRIŞMIŞTI: `GameCanvas` `touchcancel` dinliyordu,
// `HubCanvas` DİNLEMİYORDU. Fark görünmez ama gerçek: telefonda gelen
// çağrı, bildirim veya sistem jesti dokunuşu iptal ettiğinde `touchend`
// GELMEZ, `touchcancel` gelir. Köyde çubuk "basılı" kalıyor ve karakter
// oyuncu ekrana bir daha dokunana kadar tek yöne yürüyordu.

/** Çubuğun anlık durumu. `dx`/`dy` birim çemberde (uzunluk ≤ 1). */
export interface Cubuk {
  active: boolean;
  dx: number;
  dy: number;
  /**
   * Parmağın bastığı nokta (CSS px, canvas'a göre) — ÇİZİM için.
   * ⚠️ Girdi hesabına GİRMEZ; yalnız `cubukCiz` okur. Motora hiçbir şey
   * taşımıyor, o yüzden simülasyonu etkilemez.
   */
  ox?: number;
  oy?: number;
}

export const CUBUK_BOS: Cubuk = { active: false, dx: 0, dy: 0 };

/**
 * ⚠️ TAM HIZ MESAFESİ. Parmağın bastığı yer merkez sayılır; bu kadar
 * sürükleyince hız tavana çıkar. 46 px iki kopyada da aynıydı, ölçülmüş
 * bir değer olarak korunuyor — büyütmek küçük ekranda tam hıza ulaşmayı
 * zorlaştırır, küçültmek yön kontrolünü hassaslaştırır.
 */
const TAM_HIZ_PX = 46;

/**
 * Canvas'a sanal joystick bağlar. Dönen fonksiyon dinleyicileri söker.
 *
 * @param canvas dokunuşun dinleneceği öğe
 * @param ref çağıranın döngüsünde okuduğu kutu (`{ current: Cubuk }`)
 *
 * ⚠️ `touchAction: 'none'` ÇAĞIRANIN İŞİ — canvas stilinde olmalı, yoksa
 * tarayıcı sürüklemeyi sayfa kaydırması sanar ve `touchmove` gelmez.
 */
export function cubukTak(
  canvas: HTMLElement,
  ref: { current: Cubuk },
): () => void {
  let merkez = { x: 0, y: 0 };

  const basla = (e: TouchEvent) => {
    const t = e.touches[0];
    if (!t) return;
    merkez = { x: t.clientX, y: t.clientY };
    const k = canvas.getBoundingClientRect();
    ref.current = { active: true, dx: 0, dy: 0, ox: t.clientX - k.left, oy: t.clientY - k.top };
  };

  const surukle = (e: TouchEvent) => {
    if (!ref.current.active) return;
    const t = e.touches[0];
    if (!t) return;
    const dx = t.clientX - merkez.x;
    const dy = t.clientY - merkez.y;
    const boy = Math.hypot(dx, dy) || 1;
    const k = Math.min(1, boy / TAM_HIZ_PX) / boy;
    ref.current = { active: true, dx: dx * k, dy: dy * k, ox: ref.current.ox, oy: ref.current.oy };
    e.preventDefault();
  };

  // ⚠️ HEM `touchend` HEM `touchcancel`. Birini yazmak yetmez — iptal
  // durumunda `touchend` hiç gelmez ve çubuk basılı kalır.
  const birak = () => { ref.current = { active: false, dx: 0, dy: 0 }; };

  canvas.addEventListener('touchstart', basla, { passive: false });
  canvas.addEventListener('touchmove', surukle, { passive: false });
  canvas.addEventListener('touchend', birak);
  canvas.addEventListener('touchcancel', birak);

  return () => {
    canvas.removeEventListener('touchstart', basla);
    canvas.removeEventListener('touchmove', surukle);
    canvas.removeEventListener('touchend', birak);
    canvas.removeEventListener('touchcancel', birak);
  };
}

/**
 * ⭐ ÇUBUĞU ÇİZ — parmakla oynayan oyuncuya geri bildirim.
 *
 * ⚠️ NİYE VAR: joystick GÖRÜNMEZDİ. Üç canvas'ta da dokunmatik girdi
 * çalışıyordu ama ekranda hiçbir iz yoktu — oyuncu parmağını nereye
 * bastığını, ne kadar ittiğini, hatta çubuğun çalışıp çalışmadığını
 * göremiyordu. Görünmeyen bir kontrol, olmayan kontroldür.
 *
 * ⚠️ `render.ts`E DOKUNULMADI. Çizim çağıranın döngüsünde, render'dan
 * SONRA yapılıyor: bu bir HUD katmanı, sahnenin parçası değil. Motora da
 * girmiyor — `ox/oy` yalnız burada okunuyor, simülasyon etkilenmiyor.
 *
 * ⚠️ `ctx.filter` ve `shadowBlur` YOK — projenin sıcak döngü kuralı.
 *
 * @param dpr cihaz piksel oranı; çağıran canvas'ı bununla ölçeklediyse
 *   koordinatlar da ölçeklenmeli.
 */
export function cubukCiz(
  ctx: CanvasRenderingContext2D, c: Cubuk, dpr = 1,
): void {
  if (!c.active || c.ox === undefined || c.oy === undefined) return;
  const x = c.ox * dpr, y = c.oy * dpr;
  const halka = TAM_HIZ_PX * dpr;
  const topak = 15 * dpr;

  ctx.save();
  // dış halka — tam hız mesafesini gösterir
  ctx.globalAlpha = 0.22;
  ctx.lineWidth = 2 * dpr;
  ctx.strokeStyle = '#e3d8c0';
  ctx.beginPath();
  ctx.arc(x, y, halka, 0, Math.PI * 2);
  ctx.stroke();

  // topak — mevcut yön ve büyüklük. `dx/dy` birim çemberde (≤1),
  // yani halka yarıçapıyla çarpmak doğru konumu verir.
  ctx.globalAlpha = 0.34;
  ctx.fillStyle = '#e3d8c0';
  ctx.beginPath();
  ctx.arc(x + c.dx * halka, y + c.dy * halka, topak, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}
