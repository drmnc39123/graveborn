// Sprite yükleme + animasyon. VERİ ODAKLI: yeni düşman/karakter eklemek =
// aşağıya bir kayıt eklemek. Kod değişmez. Yeni asset paketi geldiğinde
// sıfır ek işle takılması bunun içindir.
//
// İki format destekliyoruz çünkü elimizdeki paketler farklı:
//   'sheet'    → tek PNG, yatay N frame (CC0 düşman paketi: 150×150)
//   'sequence' → frame başına ayrı PNG (LuizMelo kahraman paketleri: 288×128)

export type AnimKind = 'sheet' | 'sequence';

export interface AnimDef {
  kind: AnimKind;
  /** sheet: tek yol · sequence: `walk_{i}.png` şablonu ({i} 1'den başlar) */
  src: string;
  frames: number;
  fps: number;
  loop?: boolean;
}

export interface ActorArt {
  /** KARAKTERİN ekrandaki yüksekliği (px) — frame'in değil. */
  drawHeight: number;
  /**
   * Karakterin frame yüksekliğine oranı (0..1). Bu paketlerin frame'leri bol
   * boşluklu: 150×150 karenin içinde 51 px'lik iskelet var. Bu alan olmadan
   * ölçekleme frame'e göre yapılır ve karakter minik çıkar (ilk sürümde öyle oldu).
   * Değerler alfa sınır kutusu ÖLÇÜLEREK bulundu, tahmin değil.
   */
  contentRatio: number;
  /** Ayak hizasının frame yüksekliğine oranı (0=üst, 1=alt). Ölçülmüş. */
  anchorY: number;
  /** Sprite sağa bakıyorsa hareket yönüne göre çevir */
  flipByVelocity: boolean;
  anims: Record<string, AnimDef>;
}

// ── görsel kayıtları ──
// enemies/ ve heroes/ CC0 (LuizMelo). Detay: public/art/ATTRIBUTION.md
const SHEET = (src: string, frames: number, fps = 10): AnimDef => ({ kind: 'sheet', src, frames, fps, loop: true });
const SEQ = (src: string, frames: number, fps = 10): AnimDef => ({ kind: 'sequence', src, frames, fps, loop: true });

/** Düşman görselleri — config.ts'teki EnemyType.art anahtarıyla eşleşir */
export const ENEMY_ART: Record<string, ActorArt> = {
  skeleton: {
    drawHeight: 36, // ölçülen içerik 45×51 px / 150×150 frame
    contentRatio: 0.34,
    anchorY: 0.673,
    flipByVelocity: true,
    anims: {
      walk: SHEET('/art/enemies/Walk.png', 4, 8),
      run: SHEET('/art/enemies/Run.png', 8, 12),
      attack: SHEET('/art/enemies/Attack.png', 8, 12),
      hit: SHEET('/art/enemies/Take Hit.png', 4, 14),
      death: { ...SHEET('/art/enemies/Death.png', 4, 10), loop: false },
    },
  },
};

export const PLAYER_ART: ActorArt = {
  drawHeight: 44, // ölçülen içerik 60×44 px / 288×128 frame
  contentRatio: 0.344,
  anchorY: 0.992,
  flipByVelocity: true,
  anims: {
    idle: SEQ('/art/heroes/fire-knight/idle_{i}.png', 8, 8),
    run: SEQ('/art/heroes/fire-knight/run_{i}.png', 8, 12),
  },
};

// ── yükleyici ──
// Yüklenmemiş görsel için render daireye düşer (oyun asla siyah ekran vermez).
const cache = new Map<string, HTMLImageElement>();
const failed = new Set<string>();

function get(src: string): HTMLImageElement | null {
  const hit = cache.get(src);
  if (hit) return hit.complete && hit.naturalWidth > 0 ? hit : null;
  if (failed.has(src)) return null;
  if (typeof window === 'undefined') return null;
  const img = new Image();
  img.onerror = () => { failed.add(src); cache.delete(src); };
  img.src = src;
  cache.set(src, img);
  return null;
}

/** Bir aktörün tüm frame'lerini önceden istemeye başla (run başında çağrılır) */
export function preload(art: ActorArt) {
  for (const a of Object.values(art.anims)) {
    if (a.kind === 'sheet') get(a.src);
    else for (let i = 1; i <= a.frames; i++) get(a.src.replace('{i}', String(i)));
  }
}

export function preloadAll() {
  preload(PLAYER_ART);
  for (const art of Object.values(ENEMY_ART)) preload(art);
}

/**
 * Aktörü çizer. Görsel hazır değilse false döner → çağıran daireye düşer.
 * t: saniye cinsinden animasyon zamanı (her varlık kendi ofsetini verir ki
 *    sürü senkronize yürümesin — aynı frame'de 400 iskelet robot gibi durur).
 */
export function drawActor(
  ctx: CanvasRenderingContext2D,
  art: ActorArt,
  animName: string,
  t: number,
  x: number,
  y: number,
  facingRight: boolean,
): boolean {
  const anim = art.anims[animName] ?? Object.values(art.anims)[0];
  if (!anim) return false;

  const raw = Math.floor(t * anim.fps);
  const idx = anim.loop === false ? Math.min(raw, anim.frames - 1) : raw % anim.frames;

  let img: HTMLImageElement | null;
  let sx = 0, sy = 0, sw = 0, sh = 0;
  if (anim.kind === 'sheet') {
    img = get(anim.src);
    if (!img) return false;
    sw = Math.floor(img.width / anim.frames);
    sh = img.height;
    sx = idx * sw;
  } else {
    img = get(anim.src.replace('{i}', String(idx + 1)));
    if (!img) return false;
    sw = img.width;
    sh = img.height;
  }

  // drawHeight KARAKTERİN boyu → ölçek içerik oranı üzerinden hesaplanır.
  // (Frame yüksekliğine bölmek karakteri %34 boyunda çizer — ilk sürümdeki hata.)
  const scale = art.drawHeight / (sh * art.contentRatio);
  const dw = sw * scale;   // çizilen TÜM frame genişliği
  const dh = sh * scale;   // çizilen TÜM frame yüksekliği
  const dx = x - dw / 2;                  // yatayda frame ortalanır
  const dy = y - dh * art.anchorY;        // dikeyde ayak hizası world y'ye oturur

  if (art.flipByVelocity && !facingRight) {
    ctx.save();
    ctx.translate(x, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(img, sx, sy, sw, sh, -dw / 2, dy, dw, dh);
    ctx.restore();
  } else {
    ctx.drawImage(img, sx, sy, sw, sh, dx, dy, dw, dh);
  }
  return true;
}
