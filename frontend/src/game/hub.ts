// HUB mantığı — gezinme, çarpışma, etkileşim.
//
// Dünya artık KODDA DEĞİL: editörde çizilen public/map/village.json'dan geliyor
// (mapWorld.ts). world.ts sadece editöre başlangıç şablonu üretiyor.
//
// Simülasyondan (engine.ts) AYRI: burada düşman/hasar/RNG yok.

import { MAP_TILE } from './mapData';
import { DEFAULT_HERO } from './heroes';
import { createRng, seedFromString, type Rng } from './rng';
import type { MapWorld, WorldDoor, WorldTravel } from './mapWorld';

export const HUB_PLAYER = { radius: 11, speed: 215 } as const;

/** Yürünmek için yapılmış yüzeyler — bunların üstünde duvar engeli delinir.
 *  `floor` ve `tile` de dahil: kullanıcı zemin olarak taverna/kale döşemesi
 *  kullanmış, dar bir desen kale kapısını kapatıyordu. */
const ROAD_LIKE = /path|road|cobble|pattern_stone|pavement|floor|tile(?!set)|brick|plaza|stair/i;

/**
 * Karo türünü SADECE DOSYA ADINDAN belirle — klasör adından ASLA.
 *
 * Bu yüzden 723 çim karosu su sanılıyordu: River paketinin çimi
 * `/art/world/water/spr_grass_1.png` yolunda duruyor ve tüm yolda 'water'
 * aradığım için su sayılıp geçilmez oluyordu. Görünmez engellerin sebebi buydu.
 */
const baseName = (p: string) => p.slice(p.lastIndexOf('/') + 1);
const WATER_LIKE = /water|lake|river|pond|sea|ocean/i;
export const isWaterTile = (src: string) => WATER_LIKE.test(baseName(src));
// Etkileşim mesafeleri. 62 px çok dardı: oyuncu binanın İÇİNE girmeden
// "Press E" görünmüyordu. Artık bina cephesine yaklaşınca çıkıyor.
export const DOOR_RADIUS = 132;
export const PORTAL_RADIUS = 108;
/** Bu mesafeye girince seyahat portalı kendiliğinden çalışır (E gerekmez) */
export const TRAVEL_TRIGGER = 34;

export type BuildingId = string;

// ── KÖYLÜLER ──────────────────────────────────────────────────────────
//
// Köy oyunun nefes alınan yeri ama TEK CANLI oyuncuydu: binalar, meşaleler
// ve boş yollar. `public/art/npc/villagers` paketi (MutterPixel, ATTRIBUTION
// içinde ticari serbest doğrulanmış) depoda duruyordu ve HİÇ kullanılmamıştı.
//
// ⚠️ TAMAMEN KOZMETİK. Köylüler oyuncuyla çarpışmaz, engel olmaz, hiçbir
// etkileşime girmez. Canlı boss odasındaki hayalet kuralının aynısı: ekrana
// giren ama mantığa girmeyen şey güvenlidir, tersi değil.
//
// ⚠️ `Math.random()` YOK — `game/` altında yasak. Sabit tohumlu `createRng`
// kullanılıyor, yani köylüler her sayfa yüklemesinde AYNI yolu yürüyor.
// Bu bir kısıt değil avantaj: köyün düzeni sayfa yenilendiğinde zıplamıyor.

/** 4 köylü çeşidi — dosya adı gövdesi, `sprites.ts` yolları buradan kurar */
export const VILLAGER_KINDS = ['man', 'woman', 'oldman', 'old_woman'] as const;
export type VillagerKind = (typeof VILLAGER_KINDS)[number];

export interface Villager {
  x: number; y: number;
  kind: VillagerKind;
  facingRight: boolean;
  moving: boolean;
  animT: number;
  /** mevcut durumun kalan süresi (sn) — bitince yürü/dur değişir */
  stateT: number;
  /** birim yön vektörü; duruyorken (0,0) */
  dx: number; dy: number;
  /** doğduğu nokta — tasmanın merkezi, buradan fazla uzaklaşamaz */
  homeX: number; homeY: number;
  rng: Rng;
}

const VILLAGER_SPEED = 46;
const VILLAGER_RADIUS = 8;
/** Kaç köylü — köyü canlandırmaya yeter, kalabalık yapıp yolu gizlemez */
const VILLAGER_COUNT = 7;
/** Doğduğu noktadan bu kadar uzaklaşınca geri döner — köyden çıkıp kaybolmasın */
const VILLAGER_LEASH = 190;

/** Bu nokta yürünmek için yapılmış bir yüzeyin üstünde mi? */
function onRoadTile(w: MapWorld, x: number, y: number): boolean {
  const px = Math.floor(x / MAP_TILE), py = Math.floor(y / MAP_TILE);
  if (px < 0 || py < 0 || px >= w.tileW || py >= w.tileH) return false;
  return ROAD_LIKE.test(baseName(w.palette[w.tiles[py * w.tileW + px] - 1] ?? ''));
}

/**
 * Köylüleri yola yerleştir.
 *
 * ⚠️ Yol karoları TARANIYOR, konum tahmin EDİLMİYOR. Harita editörde
 * çiziliyor ve değişebilir; sabit koordinat yazmak, kullanıcı yolu
 * kaydırdığı gün köylüleri duvarın içinde bırakırdı.
 */
function spawnVillagers(w: MapWorld, s: HubState): Villager[] {
  const rng = createRng(seedFromString('graveborn-villagers'));

  // Yola ait, birbirinden uzak aday noktalar topla
  const aday: { x: number; y: number }[] = [];
  for (let ty = 0; ty < w.tileH; ty++) {
    for (let tx = 0; tx < w.tileW; tx++) {
      const x = tx * MAP_TILE + MAP_TILE / 2;
      const y = ty * MAP_TILE + MAP_TILE / 2;
      if (!onRoadTile(w, x, y)) continue;
      if (blocked(s, x, y, VILLAGER_RADIUS)) continue;
      // Oyuncunun doğduğu yere çok yakın olmasın — açılışta üstüne binmesin
      if (Math.hypot(x - w.spawn.x, y - w.spawn.y) < 90) continue;
      aday.push({ x, y });
    }
  }
  if (!aday.length) return [];

  rng.shuffle(aday);
  const secilen: { x: number; y: number }[] = [];
  for (const a of aday) {
    if (secilen.length >= VILLAGER_COUNT) break;
    // Aralarında en az 120 px olsun — hepsi tek köşeye yığılmasın
    if (secilen.some((p) => Math.hypot(p.x - a.x, p.y - a.y) < 120)) continue;
    secilen.push(a);
  }

  return secilen.map((p, i) => ({
    x: p.x, y: p.y,
    kind: VILLAGER_KINDS[i % VILLAGER_KINDS.length],
    facingRight: true, moving: false, animT: rng.range(0, 3),
    stateT: rng.range(0.5, 2.5), dx: 0, dy: 0,
    homeX: p.x, homeY: p.y,
    rng: createRng(seedFromString(`villager-${i}`)),
  }));
}

/** Köylüleri ilerlet — oyuncudan tamamen bağımsız */
function stepVillagers(s: HubState, dt: number) {
  for (const v of s.villagers) {
    v.animT += dt;
    v.stateT -= dt;

    if (v.stateT <= 0) {
      const uzak = Math.hypot(v.x - v.homeX, v.y - v.homeY) > VILLAGER_LEASH;
      if (uzak) {
        // Tasma gerildi — eve dön. Rastgele yön seçse köyden büsbütün çıkardı.
        const a = Math.atan2(v.homeY - v.y, v.homeX - v.x);
        v.dx = Math.cos(a); v.dy = Math.sin(a);
        v.stateT = v.rng.range(1.5, 3);
      } else if (v.rng.next() < 0.38) {
        v.dx = 0; v.dy = 0;                       // dur ve etrafa bak
        v.stateT = v.rng.range(1.2, 3.4);
      } else {
        const a = v.rng.range(0, Math.PI * 2);
        v.dx = Math.cos(a); v.dy = Math.sin(a);
        v.stateT = v.rng.range(1, 2.8);
      }
    }

    v.moving = v.dx !== 0 || v.dy !== 0;
    if (!v.moving) continue;

    const sp = VILLAGER_SPEED * dt;
    // Eksenler ayrı — oyuncudaki kuralın aynısı, duvara sürtünce kilitlenmesin
    const nx = v.x + v.dx * sp;
    const okX = !blocked(s, nx, v.y, VILLAGER_RADIUS) && onRoadTile(s.world, nx, v.y);
    if (okX) v.x = nx;
    const ny = v.y + v.dy * sp;
    const okY = !blocked(s, v.x, ny, VILLAGER_RADIUS) && onRoadTile(s.world, v.x, ny);
    if (okY) v.y = ny;

    // İki eksende de tıkandıysa yönü hemen yenile — duvara bakıp yürüme
    // animasyonu oynatan bir köylü, hareket eden bir dekordan daha kötü.
    if (!okX && !okY) v.stateT = 0;

    if (v.dx > 0.01) v.facingRight = true;
    else if (v.dx < -0.01) v.facingRight = false;
  }
}

export interface HubState {
  x: number; y: number;
  facingRight: boolean; moving: boolean; animT: number;
  world: MapWorld;
  atDoor: WorldDoor | null;
  atTravel: WorldTravel | null;
  atFight: boolean;
  /** ışınlanma sonrası kısa kilit — portalın üstünde durup geri zıplamayı önler */
  warpLock: number;
  /** son ışınlanmanın adı — HUD kısa bir bildirim gösterir */
  justWarped: string | null;
  /**
   * Köyde yürüyen karakterin id'si.
   *
   * ⚠️ NİYE EKLENDİ: köyde HER ZAMAN Fire Knight yürüyordu. `hubRender`
   * sabit `PLAYER_ART`ı çiziyordu (`sprites.ts` → `playerArt(DEFAULT_HERO)`),
   * yani oyuncu hangi karakteri seçerse seçsin ekrandaki figür değişmiyordu.
   * Karakter seçimi bir kimlik kararı; köy onu yansıtmıyorsa seçim yalnızca
   * bir istatistik tablosu olur.
   */
  hero: string;
  /** Köyde dolaşan NPC'ler — SALT KOZMETİK, oyuncuyla etkileşmez */
  villagers: Villager[];
}

/**
 * ⚠️ `hero` OPSİYONEL ve varsayılanı `DEFAULT_HERO`. Zorunlu yapmak
 * `hub.test.mts`teki mevcut çağrıları kırardı ve testin ilgilendiği şey
 * çarpışma/kapı mantığı — karakter değil.
 */
export function createHub(world: MapWorld, hero: string = DEFAULT_HERO): HubState {
  const s: HubState = {
    x: world.spawn.x, y: world.spawn.y,
    facingRight: true, moving: false, animT: 0,
    world, atDoor: null, atTravel: null, atFight: false, warpLock: 0, justWarped: null,
    hero,
    villagers: [],
  };
  // ⚠️ `s` KURULDUKTAN SONRA — `spawnVillagers` çarpışma için `blocked(s,…)`
  // çağırıyor ve o da `s.world`e bakıyor. Nesne hazır olmadan çağrılamaz.
  s.villagers = spawnVillagers(world, s);
  return s;
}

/** Katı nesnelerle ve su karolarıyla çarpışma */
function blocked(s: HubState, x: number, y: number, r: number) {
  const w = s.world;

  // Ayakların altındaki karo YOL mu? Öyleyse duvar/çit engelleri delinir:
  // harita yapan duvarın içinden yol geçirdiyse orada kapı vardır.
  // (Kalenin kapısına giden yol duvar tarafından kapatılıyordu.)
  // "Yol" = yürünmek için yapılmış her yüzey. Sadece 'path|road' aramak
  // yetmedi: kale kapısının zemini `spr_Traven_Floor_1.png` idi ve kural
  // tetiklenmediği için kapı kapalı kalıyordu.
  const px = Math.floor(x / MAP_TILE), py = Math.floor(y / MAP_TILE);
  const onRoad = px >= 0 && py >= 0 && px < w.tileW && py < w.tileH
    && ROAD_LIKE.test(baseName(w.palette[w.tiles[py * w.tileW + px] - 1] ?? ''));

  for (const c of w.solids) {
    if (c.wall && onRoad) continue; // kapı geçişi
    if (x + r > c.x && x - r < c.x + c.w && y + r > c.y && y - r < c.y + c.h) return true;
  }
  const tx = Math.floor(x / MAP_TILE), ty = Math.floor(y / MAP_TILE);
  if (tx < 0 || ty < 0 || tx >= w.tileW || ty >= w.tileH) return true;
  // Su geçilmez — AMA köprü varsa geçilir. Köprü bir nesne, su bir karo;
  // ikisi üst üste durduğu için karoya bakıp reddetmek köprüyü de kapatıyordu.
  const pal = w.palette[w.tiles[ty * w.tileW + tx] - 1];
  if (pal && isWaterTile(pal)) {
    for (const b of w.bridges) {
      if (x > b.x && x < b.x + b.w && y > b.y && y < b.y + b.h) return false;
    }
    return true;
  }
  return false;
}

export function stepHub(s: HubState, dt: number, inx: number, iny: number) {
  if (s.warpLock > 0) s.warpLock -= dt;
  stepVillagers(s, dt);

  const m = Math.hypot(inx, iny);
  const nx = m > 1e-4 ? inx / m : 0;
  const ny = m > 1e-4 ? iny / m : 0;
  const sp = HUB_PLAYER.speed * dt;
  const r = HUB_PLAYER.radius;

  // Eksenleri AYRI dene — duvara sürtünürken kilitlenme olmasın
  const tx = s.x + nx * sp;
  if (!blocked(s, tx, s.y, r)) s.x = tx;
  const ty = s.y + ny * sp;
  if (!blocked(s, s.x, ty, r)) s.y = ty;

  s.x = Math.max(r, Math.min(s.world.w - r, s.x));
  s.y = Math.max(r, Math.min(s.world.h - r, s.y));

  s.moving = m > 1e-4;
  s.animT += dt;
  if (nx > 0.01) s.facingRight = true;
  else if (nx < -0.01) s.facingRight = false;

  // ── etkileşim yakınlığı ──
  const locked = s.warpLock > 0;

  // dövüş portalı
  const f = s.world.fight;
  s.atFight = !locked && !!f && Math.hypot(f.x - s.x, f.y - s.y) < PORTAL_RADIUS;

  // seyahat portalı
  let bt: WorldTravel | null = null;
  let btd = PORTAL_RADIUS * PORTAL_RADIUS;
  if (!locked) {
    for (const t of s.world.travels) {
      const dx = t.x - s.x, dy = t.y - s.y;
      const d2 = dx * dx + dy * dy;
      if (d2 < btd) { btd = d2; bt = t; }
    }
  }
  s.atTravel = s.atFight ? null : bt;

  // SEYAHAT PORTALI: içine girince KENDİLİĞİNDEN ışınlar.
  // Oyuncu "içinden geçiyor" dedi — portalın üstünden yürüyüp hiçbir şey
  // olmaması yanlış. E'ye basmayı beklemek de gereksiz; portal zaten geçit.
  if (bt && !locked) {
    const d = Math.hypot(bt.x - s.x, bt.y - s.y);
    if (d < TRAVEL_TRIGGER) {
      warp(s, bt.toX, bt.toY);
      s.justWarped = bt.label;
    }
  }

  // bina kapısı (portallar öncelikli — istemler üst üste binmesin)
  let bd: WorldDoor | null = null;
  let bdd = DOOR_RADIUS * DOOR_RADIUS;
  for (const d of s.world.doors) {
    const dx = d.x - s.x, dy = d.y - s.y;
    const d2 = dx * dx + dy * dy;
    if (d2 < bdd) { bdd = d2; bd = d; }
  }
  s.atDoor = s.atFight || s.atTravel ? null : bd;
}

/** Seyahat portalı — ışınla ve kısa kilit koy (anında geri zıplamasın) */
export function warp(s: HubState, toX: number, toY: number) {
  s.x = toX;
  s.y = toY;
  s.warpLock = 0.9;
  s.atDoor = null;
  s.atTravel = null;
  s.atFight = false;
}
