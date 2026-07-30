// Sprite yükleme + animasyon. VERİ ODAKLI: yeni düşman/karakter eklemek =
// aşağıya bir kayıt eklemek. Kod değişmez. Yeni asset paketi geldiğinde
// sıfır ek işle takılması bunun içindir.
//
// İki format destekliyoruz çünkü elimizdeki paketler farklı:
//   'sheet'    → tek PNG, yatay N frame (CC0 düşman paketi: 150×150)
//   'sequence' → frame başına ayrı PNG (LuizMelo kahraman paketleri: 288×128)

export type AnimKind = 'sheet' | 'sequence' | 'grid';

export interface AnimDef {
  kind: AnimKind;
  /** sheet/grid: tek yol · sequence: `walk_{i}.png` şablonu ({i} 1'den başlar) */
  src: string;
  frames: number;
  fps: number;
  loop?: boolean;
  /** grid: frame boyutu ve hangi satır (BDragon canavarları 80×80, satır=animasyon) */
  frameW?: number;
  frameH?: number;
  row?: number;
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

// BDragon1727 "Topdown Monsters" — 640×1440 sheet, 80×80 frame, 8 frame/satır.
// Satır düzeni (paketin "Animation name.png" belgesinden):
//   0 idle · 1 walk · 2 victory · 3 jump · 4 crouched · 5 attack1 · 6 hit
//   7 blast1 · 8 blast2 · 9 levelup · 10 appear · 11 active · 12 death1 · 13 death2 · 14 teleport
const MON_ROW = { idle: 0, walk: 1, attack: 5, hit: 6, death: 12 } as const;
const monster = (file: string, contentRatio: number, anchorY: number, drawHeight: number): ActorArt => ({
  drawHeight,
  contentRatio,
  anchorY,
  flipByVelocity: true,
  anims: {
    walk: { kind: 'grid', src: `/art/enemies/topdown/${file}.png`, frames: 8, fps: 10, loop: true, frameW: 80, frameH: 80, row: MON_ROW.walk },
    idle: { kind: 'grid', src: `/art/enemies/topdown/${file}.png`, frames: 8, fps: 7, loop: true, frameW: 80, frameH: 80, row: MON_ROW.idle },
    hit: { kind: 'grid', src: `/art/enemies/topdown/${file}.png`, frames: 8, fps: 16, loop: true, frameW: 80, frameH: 80, row: MON_ROW.hit },
    attack: { kind: 'grid', src: `/art/enemies/topdown/${file}.png`, frames: 8, fps: 12, loop: true, frameW: 80, frameH: 80, row: MON_ROW.attack },
  },
});

/** Düşman görselleri — config.ts'teki EnemyType.art anahtarıyla eşleşir.
 *  contentRatio/anchorY değerleri her canavar için ALFA SINIR KUTUSU ÖLÇÜLEREK bulundu. */
export const ENEMY_ART: Record<string, ActorArt> = {
  // Topdown canavarlar (öne bakan) — sürünün gövdesi
  mon_horned: monster('00', 0.612, 0.788, 40),
  mon_crab: monster('01', 0.675, 0.838, 44),
  mon_brute: monster('02', 0.55, 0.762, 46),
  mon_slim: monster('03', 0.612, 0.8, 38),
  mon_fiend: monster('04', 0.662, 0.812, 42),
  mon_imp: monster('05', 0.562, 0.775, 36),
  mon_rogue: monster('06', 0.538, 0.738, 36),
  mon_bird: monster('07', 0.662, 0.812, 40),
  mon_wretch: monster('08', 0.575, 0.788, 38),
  mon_warrior: monster('09', 0.662, 0.812, 42),
  mon_hulk: monster('10', 0.562, 0.75, 48),

  // Boss'lar — aynı sheet'ler, çok daha büyük çizilir. Silüet farkı yeterli:
  // ekranda 400 düşman varken boyut en okunaklı "bu farklı" sinyali.
  boss_mini: monster('01', 0.675, 0.838, 110),
  boss_mega: monster('09', 0.662, 0.812, 140),
  boss_nightmare: monster('10', 0.562, 0.75, 175),

  // LuizMelo (CC0) yandan görünüm — çeşitlilik için karışımda kalıyor
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

// ── mermi ve efektler ──
// Mermi: BDragon "All Fire Bullet" atlası, 16×16 hücre. Satır 4 = yöne dönebilen
// dart formu (5 frame). Turuncu/altın zaten paletimizde (C.candle).
export const BULLET = { src: '/art/fx/bullets/All_Fire_Bullet_Pixel_16x16_00.png', cell: 16, row: 4, frames: 5, fps: 14, size: 18 } as const;

// Efekt: BDragon RPG Effect, 64×64 frame, SATIR = RENK, SÜTUN = frame (12).
// Palet kuralı: MOR SATIRLAR (1, 6, 8) KULLANILMAZ.
//   0 turuncu · 2 mavi · 3 yeşil · 4 kahve · 5 KEMİK BEYAZI · 7 KAN KIRMIZISI
export const FX = {
  hit: { src: '/art/fx/rpg/1010.png', cell: 64, row: 5, frames: 12, fps: 26, size: 40 },
  death: { src: '/art/fx/rpg/1010.png', cell: 64, row: 7, frames: 12, fps: 22, size: 58 },
} as const;

export interface CellAnim { src: string; cell: number; row: number; frames: number; fps: number; size: number }

/** Atlas hücresini çizer. Hazır değilse false döner → çağıran basit şekle düşer. */
export function drawCell(ctx: CanvasRenderingContext2D, a: CellAnim, frame: number, x: number, y: number, angle = 0): boolean {
  const img = get(a.src);
  if (!img) return false;
  const idx = Math.min(Math.max(frame, 0), a.frames - 1);
  const s = a.size;
  ctx.save();
  ctx.translate(x, y);
  if (angle) ctx.rotate(angle);
  ctx.drawImage(img, idx * a.cell, a.row * a.cell, a.cell, a.cell, -s / 2, -s / 2, s, s);
  ctx.restore();
  return true;
}

// ── genel amaçlı görsel yardımcıları (hub/dünya çizimi için) ──

/**
 * Dosya adındaki `_stripN` ekinden frame sayısını OKUR.
 * Paketlerin tamamı bu kurala uyuyor (spr_isim_walk_strip9.png), o yüzden
 * frame sayısını elle girmiyoruz — yanlış sayı girme hatası tümden kalkıyor.
 * strip yoksa 1 döner (tek kare görsel).
 */
export function framesFromName(src: string): number {
  const m = /_strip(\d+)\b/i.exec(src);
  return m ? Math.max(1, parseInt(m[1], 10)) : 1;
}

/** Görseli getir (yüklenmediyse null) — dış modüller de kullanabilsin */
export function image(src: string): HTMLImageElement | null {
  return get(src);
}

/**
 * Tek kare veya strip'ten bir kare çizer. Frame sayısı dosya adından okunur.
 * x,y = ÇİZİM MERKEZİ değil, sol-üst (dünya karolarıyla hizalamak için).
 */
export function drawFrame(
  ctx: CanvasRenderingContext2D, src: string, x: number, y: number,
  opts: {
    frame?: number; fps?: number; t?: number; w?: number; h?: number;
    anchor?: 'topleft' | 'bottom';
    /** IZGARA SAYFASI: sütun/satır sayısı ve kullanılacak hücre.
     *  Editörde seçilen kare oyunda da aynı çıksın diye gerekli. */
    cols?: number; rows?: number; row?: number; col?: number;
  } = {},
): boolean {
  const img = get(src);
  if (!img) return false;

  // Sütun sayısı: açıkça verilmişse o, yoksa dosya adındaki _stripN
  const cols = Math.max(1, opts.cols ?? framesFromName(src));
  const rows = Math.max(1, opts.rows ?? 1);
  const fw = Math.floor(img.width / cols);
  const fh = Math.floor(img.height / rows);

  // Animasyon YALNIZCA fps verilmişse; yoksa sabit hücre çizilir.
  // (Editörde fps 0 bırakılan nesneler oyunda da durgun kalmalı.)
  const baseCol = opts.col ?? 0;
  const idx = opts.frame !== undefined
    ? opts.frame % cols
    : opts.fps && opts.t !== undefined ? Math.floor(opts.t * opts.fps) % cols : baseCol;

  const dw = opts.w ?? fw;
  const dh = opts.h ?? fh;
  const dy = opts.anchor === 'bottom' ? y - dh : y;
  ctx.drawImage(img, idx * fw, (opts.row ?? 0) * fh, fw, fh, Math.round(x), Math.round(dy), dw, dh);
  return true;
}

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
  get(BULLET.src);
  get(FX.hit.src);
  get(FX.death.src);
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
  if (anim.kind === 'grid') {
    img = get(anim.src);
    if (!img) return false;
    sw = anim.frameW!;
    sh = anim.frameH!;
    sx = idx * sw;
    sy = (anim.row ?? 0) * sh;
  } else if (anim.kind === 'sheet') {
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
