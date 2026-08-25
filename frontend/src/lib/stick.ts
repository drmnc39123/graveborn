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
    ref.current = { active: true, dx: 0, dy: 0 };
  };

  const surukle = (e: TouchEvent) => {
    if (!ref.current.active) return;
    const t = e.touches[0];
    if (!t) return;
    const dx = t.clientX - merkez.x;
    const dy = t.clientY - merkez.y;
    const boy = Math.hypot(dx, dy) || 1;
    const k = Math.min(1, boy / TAM_HIZ_PX) / boy;
    ref.current = { active: true, dx: dx * k, dy: dy * k };
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
