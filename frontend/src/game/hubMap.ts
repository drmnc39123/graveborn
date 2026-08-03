// HUB DÜNYASI — harabe gotik köy.
//
// Zemin 32px karo ızgarası. Yol/çim ayrımı bir maskeden geliyor ve KARO
// KOMŞULARINDAN otomatik seçiliyor (autotile) — köşeleri elle yerleştirmek
// hem hataya açık hem de düzenlemesi imkânsız olurdu.
//
// Paket kısıtı: elimizde düz (h/v), 4 köşe (T_L/T_R/B_L/B_R) ve 2 uç (up/down)
// var; 3-yol veya 4-yol kavşak karosu YOK. Bu yüzden yollar sadece düz parça ve
// köşelerden kuruluyor — kavşak gerektiren desen çizilmiyor.

export const TILE = 32;
export const MAP_W = 50; // 1600 px
export const MAP_H = 36; // 1152 px

const G = 'hub/village';
export const TILES = {
  grass: `/art/${G}/spr_dark_grass_1.png`,
  h1: `/art/${G}/spr_path_h_1.png`,
  h2: `/art/${G}/spr_path_h_2.png`,
  v1: `/art/${G}/spr_path_v_1.png`,
  v2: `/art/${G}/spr_path_v_2.png`,
  tl: `/art/${G}/spr_path_T_L.png`,
  tr: `/art/${G}/spr_path_T_R.png`,
  bl: `/art/${G}/spr_path_B_L.png`,
  br: `/art/${G}/spr_path_B_R.png`,
  up: `/art/${G}/spr_path_up.png`,
  down: `/art/${G}/spr_path_down.png`,
} as const;

/** Yol maskesi — true = yol. Dikdörtgen koridorlarla kuruluyor. */
const path = new Uint8Array(MAP_W * MAP_H);
const at = (x: number, y: number) => (x < 0 || y < 0 || x >= MAP_W || y >= MAP_H ? 0 : path[y * MAP_W + x]);

function corridor(x0: number, y0: number, x1: number, y1: number) {
  for (let y = Math.min(y0, y1); y <= Math.max(y0, y1); y++) {
    for (let x = Math.min(x0, x1); x <= Math.max(x0, x1); x++) {
      if (x >= 0 && y >= 0 && x < MAP_W && y < MAP_H) path[y * MAP_W + x] = 1;
    }
  }
}

// ── köyün yol planı ──
// Dış çevre yolu (bina cephelerinin önünden geçer) + meydana inen tek spur.
corridor(6, 12, 43, 13);   // üst cadde (binaların önü)
corridor(6, 26, 43, 27);   // alt cadde
corridor(6, 12, 7, 27);    // sol bağlantı
corridor(42, 12, 43, 27);  // sağ bağlantı
corridor(23, 13, 24, 26);  // meydana inen orta spur

/** Autotile: komşulara bakıp doğru karoyu seç. */
export function tileAt(x: number, y: number): string {
  if (!at(x, y)) return TILES.grass;
  const n = at(x, y - 1), s = at(x, y + 1), w = at(x - 1, y), e = at(x + 1, y);

  // köşeler (iki komşu, dik açı)
  if (s && e && !n && !w) return TILES.tl;
  if (s && w && !n && !e) return TILES.tr;
  if (n && e && !s && !w) return TILES.bl;
  if (n && w && !s && !e) return TILES.br;

  // uçlar
  if (s && !n && !e && !w) return TILES.up;
  if (n && !s && !e && !w) return TILES.down;

  // düzler — iki varyantı dönüşümlü kullan, tekrar dokusu kırılsın
  if (e || w) return (x + y) % 2 ? TILES.h1 : TILES.h2;
  return (x + y) % 2 ? TILES.v1 : TILES.v2;
}

// ── BİNALAR ───────────────────────────────────────────────────────────
// Her bina TEK dosya (atlas dilimleme yok). `foot` = zemine oturan gövde
// kutusu; çarpışma ve derinlik sıralaması bundan hesaplanıyor.
export type BuildingId = 'quests' | 'upgrade' | 'shop' | 'market' | 'exchange' | 'tavern';

export interface HubBuilding {
  id: BuildingId;
  name: string;
  hint: string;
  src: string;
  /** çizim sol-üst köşesi (dünya px) */
  x: number;
  y: number;
  w: number;
  h: number;
  /** görselin ALT kısmındaki basılabilir gövde (çarpışma) */
  foot: { dx: number; dy: number; w: number; h: number };
  /** kapı noktası (dünya px) — oyuncu buraya yaklaşınca girer */
  doorX: number;
  doorY: number;
}

const R = '/art/hub/ruins';
export const BUILDINGS: readonly HubBuilding[] = [
  {
    id: 'quests', name: "The Warden's Post", hint: 'Open the portals and descend',
    src: `${R}/spr_Gothic_Cathedral.png`, x: 672, y: 96, w: 512, h: 512,
    foot: { dx: 96, dy: 360, w: 320, h: 130 }, doorX: 928, doorY: 500,
  },
  {
    id: 'upgrade', name: 'The Forge', hint: 'Spend GOLD on permanent power',
    src: `${R}/spr_Ruined_Castle.png`, x: 96, y: 128, w: 512, h: 512,
    foot: { dx: 110, dy: 370, w: 300, h: 120 }, doorX: 300, doorY: 492,
  },
  {
    id: 'shop', name: "Pedlar's Stall", hint: 'Charms you carry into a run',
    src: `${R}/spr_Ruined_Tavern.png`, x: 1248, y: 224, w: 256, h: 256,
    foot: { dx: 40, dy: 170, w: 180, h: 80 }, doorX: 1376, doorY: 452,
  },
  {
    id: 'market', name: 'Marketplace', hint: 'Sell GOLD to other players',
    src: `${R}/spr_Abandoned_Town_Hall.png`, x: 224, y: 800, w: 256, h: 256,
    foot: { dx: 40, dy: 170, w: 180, h: 80 }, doorX: 352, doorY: 1028,
  },
  {
    id: 'exchange', name: 'The Exchange', hint: 'Standing bids from other players',
    src: `${R}/spr_manor.png`, x: 1216, y: 800, w: 256, h: 256,
    foot: { dx: 40, dy: 170, w: 180, h: 80 }, doorX: 1344, doorY: 1028,
  },
  {
    id: 'tavern', name: 'The Rest', hint: 'Your profile and records',
    src: `${R}/Spr_Ruined_Library.png`, x: 736, y: 832, w: 256, h: 256,
    foot: { dx: 40, dy: 170, w: 180, h: 80 }, doorX: 864, doorY: 1060,
  },
] as const;

/** Dekor — çarpışmasız, sadece atmosfer. Derinlik için y'ye göre sıralanır. */
export interface Prop { src: string; x: number; y: number; w?: number; h?: number; fps?: number }

export const PROPS: readonly Prop[] = [
  // animasyonlu değirmen — köyün siluetine hareket katar
  { src: `${R}/Spr_Abandoned_Windmill_strip9.png`, x: 1520, y: 96, w: 256, h: 256, fps: 8 },
  { src: `${R}/Spr_Clock_Tower.png`, x: 448, y: 448, w: 256, h: 256 },

  // fenerler — meydanı ve yolları aydınlatır
  { src: '/art/hub/lights/spr_outdoor_lamp.png', x: 704, y: 736, w: 64, h: 64 },
  { src: '/art/hub/lights/spr_outdoor_lamp.png', x: 992, y: 736, w: 64, h: 64 },
  { src: '/art/hub/lights/spr_outdoor_lamp.png', x: 704, y: 352, w: 64, h: 64 },
  { src: '/art/hub/lights/spr_outdoor_lamp.png', x: 1120, y: 352, w: 64, h: 64 },
  { src: '/art/hub/lights/spr_lanterns.png', x: 240, y: 736, w: 64, h: 64 },
  { src: '/art/hub/lights/spr_lanterns.png', x: 1408, y: 736, w: 64, h: 64 },

  // pazar tezgahları — Marketplace'in önü canlı görünsün
  { src: '/art/hub/stalls/spr_stall_1.png', x: 160, y: 1088, w: 64, h: 64 },
  { src: '/art/hub/stalls/spr_stall_4.png', x: 480, y: 1088, w: 64, h: 64 },
  { src: '/art/hub/stalls/spr_cart.png', x: 560, y: 1024, w: 64, h: 64 },
  { src: '/art/hub/stalls/spr_box_1.png', x: 640, y: 1088, w: 32, h: 32 },
] as const;

/** Işık kaynakları — additive parlama, fenerlerin üstüne biner */
export const LIGHTS: readonly { x: number; y: number; r: number }[] = [
  { x: 736, y: 760 }, { x: 1024, y: 760 }, { x: 736, y: 376 }, { x: 1152, y: 376 },
  { x: 272, y: 760 }, { x: 1440, y: 760 },
].map((l) => ({ ...l, r: 150 }));

// ── PORTALLAR ─────────────────────────────────────────────────────────
// Bölüm girişleri. Katedralin önündeki meydanda dizili duruyorlar;
// her Depth kendi portalıyla açılıyor — kapıdan girmekten çok daha okunaklı.
export interface PortalSpot { stageId: number; src: string; x: number; y: number }

const P = '/art/portals';
// PALET KURALI: MOR YOK. dark_portal ve Void_Portal ekranda mor/magenta
// çıkıyor, o yüzden kullanılmıyor — yerlerine lava (turuncu-kırmızı) ve
// holy (beyaz-altın) konuldu; ikisi de kan/mum paletimizin içinde.
export const PORTALS: readonly PortalSpot[] = [
  { stageId: 1, src: `${P}/spr_Nature_portal_strip7.png`, x: 672, y: 640 },
  { stageId: 2, src: `${P}/spr_Lava_Portal_strip7.png`, x: 800, y: 640 },
  { stageId: 3, src: `${P}/spr_ice_portal_strip7.png`, x: 928, y: 640 },
  { stageId: 4, src: `${P}/spr_fire_portal_strip7.png`, x: 1056, y: 640 },
  { stageId: 5, src: `${P}/spr_holy_portal_strip7.png`, x: 1184, y: 640 },
] as const;

export const PORTAL_SIZE = 96;
export const PORTAL_RADIUS = 52;
export const DOOR_RADIUS = 60;
