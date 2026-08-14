// Dünya çizimi — editörde çizilen haritadan (mapWorld.ts).
//
// DERİNLİK: nesneler mapWorld'de bir kez ayak Y'sine göre sıralanıyor.
// Aktörler (oyuncu + köylüler) her frame kendi aralarında sıralanıp bu
// sıralı listeyle BİRLEŞTİRİLİYOR — 2086 nesneyi her karede yeniden
// sıralamak boşuna maliyetti, aktör sayısı ise tek haneli.
//
// PERFORMANS: sadece kameraya girenler çiziliyor.

import { C } from '@/lib/theme';
import { cosmeticById } from './cosmetics';
import { drawActor, drawFrame, playerArt, villagerArt } from './sprites';
import { DOOR_RADIUS, HUB_PLAYER, PORTAL_RADIUS, type HubState, type Villager } from './hub';
import { MAP_TILE } from './mapData';
import type { MapWorld, WorldObject } from './mapWorld';

/** Sunucudan gelen köy oyuncusu — `lib/chat.ts` `Ghost` ile aynı şekil */
export interface KoyOyuncu {
  n: string; x: number; y: number; f: number;
  a?: string;
  /** son mesaj — balon */
  b?: string;
  /** balonun yaşı (ms) */
  bt?: number;
}

/** Balon bu süreden sonra hiç çizilmez (ms) — son 500 ms solarak gider */
const BALON_MS = 3500;

/**
 * HATA AYIKLAMA — F1 ile açılır. Çarpışma kutularını, oyuncu yarıçapını ve
 * etkileşim mesafelerini çizer.
 * Neden var: "görünmez engel" şikayetlerini tahminle kovalamak yerine
 * doğrudan görmek için. Kutu görünüyorsa sebebi bellidir.
 */
export const DEBUG = { collision: false };

function drawCollisionDebug(
  ctx: CanvasRenderingContext2D, s: HubState,
  vl: number, vr: number, vt: number, vb: number,
) {
  const w = s.world;
  ctx.save();
  ctx.lineWidth = 2;
  for (const c of w.solids) {
    if (c.x + c.w < vl || c.x > vr || c.y + c.h < vt || c.y > vb) continue;
    // duvarlar mavi (yol bunları deler), diğerleri kırmızı
    ctx.fillStyle = c.wall ? 'rgba(90,150,255,0.28)' : 'rgba(255,60,80,0.28)';
    ctx.strokeStyle = c.wall ? 'rgba(90,150,255,0.9)' : 'rgba(255,60,80,0.9)';
    ctx.fillRect(c.x, c.y, c.w, c.h);
    ctx.strokeRect(c.x, c.y, c.w, c.h);
  }
  // köprüler yeşil
  ctx.strokeStyle = 'rgba(95,200,120,0.95)';
  ctx.fillStyle = 'rgba(95,200,120,0.2)';
  for (const b of w.bridges) {
    if (b.x + b.w < vl || b.x > vr) continue;
    ctx.fillRect(b.x, b.y, b.w, b.h);
    ctx.strokeRect(b.x, b.y, b.w, b.h);
  }
  // oyuncu yarıçapı
  ctx.strokeStyle = '#fff';
  ctx.beginPath();
  ctx.arc(s.x, s.y, HUB_PLAYER.radius, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

/**
 * MENÜ ARKA PLANI — ana sayfada yavaşça süzülen köy.
 *
 * Oyunun kendi haritasını kullanır: ana sayfada başka bir görsel göstermek
 * hem yalan olurdu hem de ikinci bir varlık takımı bakımı demekti. Aynı
 * çizim fonksiyonları (drawTerrain/drawObject/drawLights) tekrar kullanılıyor.
 *
 * Oyuncu, mini harita ve etkileşim parıltısı YOK — burası oynanmıyor.
 */
export function renderMenuBackground(
  ctx: CanvasRenderingContext2D, world: MapWorld,
  w: number, h: number, dpr: number, time: number,
  camX: number, camY: number,
) {
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = C.void;
  ctx.fillRect(0, 0, w, h);

  const cx = Math.max(w / 2, Math.min(world.w - w / 2, camX));
  const cy = Math.max(h / 2, Math.min(world.h - h / 2, camY));
  ctx.save();
  ctx.translate(Math.round(w / 2 - cx), Math.round(h / 2 - cy));

  const viewL = cx - w / 2 - 160, viewR = cx + w / 2 + 160;
  const viewT = cy - h / 2 - 200, viewB = cy + h / 2 + 200;

  drawTerrain(ctx, world, viewL, viewR, viewT, viewB, time);
  for (const o of world.objects) drawObject(ctx, o, viewL, viewR, viewT, viewB, time);
  drawMenuLights(ctx, world, time, viewL, viewR, viewT, viewB);
  ctx.restore();

  drawVignette(ctx, w, h);
}

/** Menüde ışıklar oyuncuya değil sadece zamana bağlı titrer */
function drawMenuLights(
  ctx: CanvasRenderingContext2D, world: MapWorld, time: number,
  vl: number, vr: number, vt: number, vb: number,
) {
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (const l of world.lights) {
    if (l.x < vl || l.x > vr || l.y < vt || l.y > vb) continue;
    const flick = 0.86 + Math.sin(time * 3.1 + l.x * 0.03) * 0.14;
    const r = l.r * flick;
    const g = ctx.createRadialGradient(l.x, l.y, 0, l.x, l.y, r);
    g.addColorStop(0, `rgba(239,167,46,${0.30 * flick})`);
    g.addColorStop(1, 'rgba(239,167,46,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(l.x, l.y, r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

export function renderHub(
  ctx: CanvasRenderingContext2D, s: HubState,
  w: number, h: number, dpr: number, time: number,
  /**
   * Köydeki diğer oyuncular. ⚠️ TAMAMEN KOZMETİK — `HubState`e girmiyor,
   * çarpışmıyor, kapı/portal tetiklemiyor. Boss odasındaki hayalet kuralının
   * aynısı (bkz. `render.ts` `drawGhosts`).
   */
  oyuncular: readonly KoyOyuncu[] = [],
) {
  const world = s.world;

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = C.void;
  ctx.fillRect(0, 0, w, h);

  const camX = Math.max(w / 2, Math.min(world.w - w / 2, s.x));
  const camY = Math.max(h / 2, Math.min(world.h - h / 2, s.y));
  ctx.save();
  ctx.translate(Math.round(w / 2 - camX), Math.round(h / 2 - camY));

  const viewL = camX - w / 2 - 160, viewR = camX + w / 2 + 160;
  const viewT = camY - h / 2 - 200, viewB = camY + h / 2 + 200;

  drawTerrain(ctx, world, viewL, viewR, viewT, viewB, time);

  // ── nesneler + oyuncu, derinlik sıralı ──
  // Nesneler zaten sıralı; oyuncunun sırasını bulup ikiye bölerek çiziyoruz.
  const objs = world.objects;

  // ⚠️ ARTIK TEK OYUNCU DEĞİL: köylüler de derinlik sırasına giriyor. Eskiden
  // ikili arama ile TEK bir kesme noktası bulunuyordu; köylüler eklendiğinde
  // o yaklaşım hepsini oyuncuyla aynı katmana koyar, üstteki köylü alttaki
  // binanın önüne çizilirdi. Aktörler y'ye göre sıralanıp nesnelerle
  // BİRLEŞTİRİLİYOR (iki liste de sıralı, klasik merge).
  const aktorler: { y: number; ciz: () => void }[] = [
    { y: s.y, ciz: () => drawPlayer(ctx, s) },
  ];
  for (const v of s.villagers) {
    if (v.x < viewL || v.x > viewR || v.y < viewT || v.y > viewB) continue;
    aktorler.push({ y: v.y, ciz: () => drawVillager(ctx, v) });
  }
  // ⚠️ Gerçek oyuncular da DERİNLİK SIRASINA giriyor — köylülerle aynı
  // listeye. Ayrı bir geçişte çizilselerdi binaların önünde/arkasında
  // yanlış katmanda görünürlerdi.
  for (const o of oyuncular) {
    if (o.x < viewL || o.x > viewR || o.y < viewT || o.y > viewB) continue;
    aktorler.push({ y: o.y, ciz: () => drawKoyOyuncu(ctx, o) });
  }
  aktorler.sort((a, b) => a.y - b.y);

  // ⚠️ ÖRTME SOLMASI OYUNCUNUN Y'SİNE BAĞLI, DÖNGÜNÜN SIRASINA DEĞİL.
  // İlk yazımda "kalan nesneler" solma kontrolünden geçiyordu; oyuncudan
  // AŞAĞIDA duran bir köylü varsa, oyuncuyla o köylü arasındaki nesneler
  // birleştirme döngüsünün içinde kalıyor ve kontrolü kaçırıyordu — yani
  // köylülerin varlığı, oyuncunun bina içinde kaybolmasını geri getirebilirdi.
  // Ölçüt tek: nesne oyuncunun ÜSTÜNE çiziliyorsa ve onu örtüyorsa solar.
  let oi = 0;
  const cizNesne = (o: WorldObject) => {
    const ustte = o.footY >= s.y;
    drawObject(ctx, o, viewL, viewR, viewT, viewB, time, ustte && occludes(o, s.x, s.y));
  };

  for (const a of aktorler) {
    while (oi < objs.length && objs[oi].footY < a.y) cizNesne(objs[oi++]);
    a.ciz();
  }
  // Duvarın/binanın arkasına geçmek doğru, ama içinde kaybolmak değil —
  // kale kapısından geçerken karakter tamamen gömülüyordu.
  for (; oi < objs.length; oi++) cizNesne(objs[oi]);

  // ── GECE ──
  // ⚠️ KÖYE GECE KATMANI EKLEME. Bir kez denendi (nesnelerden sonra,
  // ışıklardan önce koyu bir yıkama): meşaleler ve ocak gerçekten yanıyor
  // gibi oldu ama köy KARARDI ve kullanıcı geri aldırdı. Köy oyunun nefes
  // alınan yeri — atmosfer arenanın işi, burası aydınlık kalacak.
  drawLights(ctx, s, time, viewL, viewR, viewT, viewB);
  drawInteractGlow(ctx, s, time);
  if (DEBUG.collision) drawCollisionDebug(ctx, s, viewL, viewR, viewT, viewB);
  ctx.restore();

  drawVignette(ctx, w, h);
  drawMinimap(ctx, s, w);
}

/** Bu nesne oyuncunun üstünü örtüyor mu (gövdesi oyuncuyu kapsıyor mu)? */
function occludes(o: WorldObject, px: number, py: number): boolean {
  return px > o.x + 4 && px < o.x + o.w - 4 && py > o.y && py < o.y + o.h;
}

function drawObject(
  ctx: CanvasRenderingContext2D, o: WorldObject,
  vl: number, vr: number, vt: number, vb: number, time: number, fade = false,
) {
  if (o.x + o.w < vl || o.x > vr || o.y + o.h < vt || o.y > vb) return;
  if (fade) ctx.globalAlpha = 0.42;
  drawFrame(ctx, o.src, o.x, o.y, {
    w: o.w, h: o.h,
    cols: o.frames, rows: o.rows, row: o.row, col: o.col,
    fps: o.fps, t: time,
  });
  if (fade) ctx.globalAlpha = 1;
}

/** Fener/meşale/ateş parıltısı — sıcak, hafif titreşimli */
function drawLights(
  ctx: CanvasRenderingContext2D, s: HubState, time: number,
  vl: number, vr: number, vt: number, vb: number,
) {
  const lights = s.world.lights;
  if (!lights.length) return;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (let i = 0; i < lights.length; i++) {
    const l = lights[i];
    if (l.x + l.r < vl || l.x - l.r > vr || l.y + l.r < vt || l.y - l.r > vb) continue;
    const flicker = 0.86 + Math.sin(time * 3.3 + i * 1.9) * 0.14;
    const r = l.r * flicker;
    // ⚠️ Gece katmanı için 0.62'ye çıkarılmıştı; gece geri alınınca bu değer
    // aydınlık sahnede beyaza patlıyordu. Özgün değere döndü.
    const g = ctx.createRadialGradient(l.x, l.y, 0, l.x, l.y, r);
    g.addColorStop(0, 'rgba(255,196,110,0.34)');
    g.addColorStop(0.45, 'rgba(220,140,50,0.14)');
    g.addColorStop(1, 'rgba(239,167,46,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(l.x, l.y, r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function drawPlayer(ctx: CanvasRenderingContext2D, s: HubState) {
  // ⚠️ Sabit `PLAYER_ART` DEĞİL, seçili karakter. `playerArt` kendi
  // önbelleğini tutuyor (`heroArtCache`), her karede yeniden kurulmuyor.
  if (!drawActor(ctx, playerArt(s.hero), s.moving ? 'run' : 'idle', s.animT, s.x, s.y, s.facingRight)) {
    ctx.fillStyle = C.bone;
    ctx.beginPath();
    ctx.arc(s.x, s.y, HUB_PLAYER.radius, 0, Math.PI * 2);
    ctx.fill();
  }
}

/**
 * Köylü — SALT DEKOR.
 *
 * ⚠️ Görsel yüklenmediyse HİÇBİR ŞEY çizilmiyor. Oyuncuda daire yedeği var
 * (o olmazsa oyun oynanamaz), köylüde yok: yüklenmemiş bir dekor için köyün
 * ortasına kemik rengi daireler serpmek, eksikliği gizlemek değil büyütmek olur.
 */
function drawVillager(ctx: CanvasRenderingContext2D, v: Villager) {
  drawActor(ctx, villagerArt(v.kind, v.facingRight), v.moving ? 'run' : 'idle',
    v.animT, v.x, v.y, v.facingRight);
}

/**
 * KÖYDEKİ BAŞKA OYUNCU.
 *
 * ⚠️ SPRITE DEĞİL SİLÜET — boss odasındaki `drawGhosts` kuralının aynısı:
 * oyuncu kalabalıkta KENDİ karakterini kaybetmemeli. Kendi karakteri tam
 * sprite, başkaları içi boş bir silüet.
 */
function drawKoyOyuncu(ctx: CanvasRenderingContext2D, o: KoyOyuncu) {
  const renk = o.a ? cosmeticById(o.a)?.aura?.color ?? C.ice : C.ice;
  ctx.save();

  ctx.globalAlpha = 0.34;
  ctx.fillStyle = renk;
  ctx.beginPath();
  ctx.ellipse(o.x, o.y + 3, HUB_PLAYER.radius * 0.9, HUB_PLAYER.radius * 1.3, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.globalAlpha = 0.6;
  ctx.strokeStyle = renk;
  ctx.lineWidth = 2;
  ctx.stroke();

  // bakış yönü — kimin nereye gittiği okunsun
  ctx.beginPath();
  ctx.moveTo(o.x + (o.f ? 6 : -6), o.y - 2);
  ctx.lineTo(o.x + (o.f ? 13 : -13), o.y + 1);
  ctx.stroke();

  ctx.globalAlpha = 0.55;
  ctx.fillStyle = C.bone;
  ctx.font = '600 10px ui-monospace, monospace';
  ctx.textAlign = 'center';
  ctx.fillText(o.n, o.x, o.y - HUB_PLAYER.radius - 8);

  // ── KONUŞMA BALONU ──
  // ⚠️ Sunucu 4 sn'den tazeyi gönderiyor; burada 3,5 sn'de kesiliyor ve son
  // 500 ms solarak gidiyor. İki eşik farklı olmak ZORUNDA: aynı olsaydı
  // balon tam görünürken bir anda kaybolurdu.
  if (o.b && typeof o.bt === 'number' && o.bt < BALON_MS) {
    const kalan = BALON_MS - o.bt;
    ctx.globalAlpha = Math.min(1, kalan / 500);
    // ⚠️ Metin KISALTILIYOR: sunucu 180 karaktere izin veriyor ve o uzunlukta
    // bir balon köyün yarısını kapatır.
    const metin = o.b.length > 40 ? `${o.b.slice(0, 39)}…` : o.b;
    ctx.font = '600 11px ui-monospace, monospace';
    const gen = ctx.measureText(metin).width + 14;
    const bx = o.x - gen / 2;
    const by = o.y - HUB_PLAYER.radius - 40;
    ctx.fillStyle = 'rgba(10,8,6,0.88)';
    ctx.strokeStyle = `${renk}66`;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(bx, by, gen, 20, 5);
    ctx.fill();
    ctx.stroke();
    // kuyruk — balon kime ait belli olsun
    ctx.beginPath();
    ctx.moveTo(o.x - 4, by + 20);
    ctx.lineTo(o.x, by + 25);
    ctx.lineTo(o.x + 4, by + 20);
    ctx.fillStyle = 'rgba(10,8,6,0.88)';
    ctx.fill();

    ctx.fillStyle = C.bone;
    ctx.textAlign = 'center';
    ctx.fillText(metin, o.x, by + 14);
  }

  ctx.restore();
}

/** Kapı ve portal işaretleri — yaklaşınca parlar, uzaktan soluk durur */
function drawInteractGlow(ctx: CanvasRenderingContext2D, s: HubState, time: number) {
  const puls = 0.85 + Math.sin(time * 3) * 0.15;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';

  const spot = (x: number, y: number, r: number, tint: string, on: boolean) => {
    const rr = r * (on ? puls * 1.25 : 0.7);
    const g = ctx.createRadialGradient(x, y, 0, x, y, rr);
    g.addColorStop(0, `rgba(${tint},${on ? 0.42 : 0.14})`);
    g.addColorStop(1, `rgba(${tint},0)`);
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, rr, 0, Math.PI * 2);
    ctx.fill();
  };

  for (const d of s.world.doors) spot(d.x, d.y, DOOR_RADIUS, '239,167,46', s.atDoor?.id === d.id && s.atDoor?.x === d.x);
  for (const t of s.world.travels) spot(t.x, t.y, PORTAL_RADIUS, '95,158,74', s.atTravel?.x === t.x && s.atTravel?.y === t.y);
  if (s.world.fight) spot(s.world.fight.x, s.world.fight.y, PORTAL_RADIUS, '200,60,40', s.atFight);

  ctx.restore();
}

function drawTerrain(
  ctx: CanvasRenderingContext2D, world: MapWorld,
  vl: number, vr: number, vt: number, vb: number, time: number,
) {
  const T = MAP_TILE;
  const x0 = Math.max(0, Math.floor(vl / T));
  const x1 = Math.min(world.tileW - 1, Math.ceil(vr / T));
  const y0 = Math.max(0, Math.floor(vt / T));
  const y1 = Math.min(world.tileH - 1, Math.ceil(vb / T));

  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const v = world.tiles[y * world.tileW + x];
      if (!v) continue;
      const src = world.palette[v - 1];
      if (!src) continue;
      // strip'li karolar (akan su) dosya adından anlaşılıp animasyonlu çizilir
      if (!drawFrame(ctx, src, x * T, y * T, { w: T, h: T, fps: 2.5, t: time })) {
        ctx.fillStyle = '#1e2622';
        ctx.fillRect(x * T, y * T, T, T);
      }
    }
  }
}

// ── MİNİ HARİTA ───────────────────────────────────────────────────────
let miniBase: HTMLCanvasElement | null = null;
let miniFor: MapWorld | null = null;
const MINI_W = 172, MINI_H = 116;

function buildMiniBase(world: MapWorld) {
  const c = document.createElement('canvas');
  c.width = world.tileW; c.height = world.tileH;
  const g = c.getContext('2d');
  if (!g) return null;
  const img = g.createImageData(world.tileW, world.tileH);
  for (let i = 0; i < world.tiles.length; i++) {
    const full = world.palette[world.tiles[i] - 1] ?? '';
    // SADECE dosya adı — klasör adı değil. `/art/world/water/spr_grass_1.png`
    // mini haritada mavi görünüyordu ve oyuncu bunu fark edip bildirdi.
    const src = full.slice(full.lastIndexOf('/') + 1);
    let r = 30, gg = 38, b = 30;
    if (/water|lake|river|pond/i.test(src)) { r = 38; gg = 74; b = 104; }
    else if (/path|stone|plaza|cobble|floor/i.test(src)) { r = 104; gg = 98; b = 86; }
    else if (/mud|dirt/i.test(src)) { r = 70; gg = 58; b = 44; }
    else if (/grass/i.test(src)) { r = 44; gg = 60; b = 40; }
    img.data[i * 4] = r; img.data[i * 4 + 1] = gg; img.data[i * 4 + 2] = b; img.data[i * 4 + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  return c;
}

function drawMinimap(ctx: CanvasRenderingContext2D, s: HubState, w: number) {
  const world = s.world;
  if (miniFor !== world) { miniBase = buildMiniBase(world); miniFor = world; }
  if (!miniBase) return;
  const x = w - MINI_W - 14, y = 14;

  ctx.save();
  ctx.fillStyle = 'rgba(10,8,6,0.82)';
  ctx.fillRect(x - 4, y - 4, MINI_W + 8, MINI_H + 8);
  ctx.strokeStyle = 'rgba(227,216,192,0.28)';
  ctx.lineWidth = 2;
  ctx.strokeRect(x - 4, y - 4, MINI_W + 8, MINI_H + 8);

  ctx.imageSmoothingEnabled = false;
  ctx.globalAlpha = 0.92;
  ctx.drawImage(miniBase, x, y, MINI_W, MINI_H);
  ctx.globalAlpha = 1;

  const sx = MINI_W / world.w, sy = MINI_H / world.h;

  ctx.fillStyle = C.candle;
  for (const d of world.doors) ctx.fillRect(x + d.x * sx - 1.5, y + d.y * sy - 1.5, 3, 3);
  ctx.fillStyle = C.ok;
  for (const t of world.travels) ctx.fillRect(x + t.x * sx - 1.5, y + t.y * sy - 1.5, 3, 3);
  if (world.fight) {
    ctx.fillStyle = C.blood;
    ctx.beginPath();
    ctx.arc(x + world.fight.x * sx, y + world.fight.y * sy, 3.4, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.fillStyle = C.bone;
  ctx.beginPath();
  ctx.arc(x + s.x * sx, y + s.y * sy, 3.2, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = C.void; ctx.lineWidth = 1; ctx.stroke();
  ctx.restore();
}

function drawVignette(ctx: CanvasRenderingContext2D, w: number, h: number) {
  const g = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.36, w / 2, h / 2, Math.max(w, h) * 0.76);
  g.addColorStop(0, 'rgba(0,0,0,0)');
  g.addColorStop(1, 'rgba(6,5,4,0.6)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
}
