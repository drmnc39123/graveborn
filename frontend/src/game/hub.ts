// HUB — oyuncunun gezdiği harabe köy. Kintara deseni: karakterle dolaş,
// binaya gir, panel açılır.
//
// VERİ ODAKLI: bina eklemek = aşağıya bir kayıt. Tileset geldiğinde sadece
// `sprite` alanı dolacak, yerleşim ve mantık değişmeyecek.
//
// Simülasyondan (engine.ts) tamamen AYRI: hub'da düşman/hasar/RNG yok.
// Karıştırmamak kasıtlı — bölüm koşusu deterministik olmak zorunda, hub değil.

export type BuildingId = 'quests' | 'shop' | 'upgrade' | 'market' | 'exchange' | 'tavern';

export interface Building {
  id: BuildingId;
  name: string;
  /** kısa açıklama — kapıya yaklaşınca gösterilir */
  hint: string;
  /** dünya koordinatı (merkez) */
  x: number;
  y: number;
  /** çarpışma kutusu (gövde) — oyuncu içinden geçemez */
  w: number;
  h: number;
  /** kapı bölgesi merkezi, gövdenin altında */
  doorX: number;
  doorY: number;
  /** ikon rengi (tileset gelene kadar yer tutucu) */
  color: string;
}

export const HUB_BOUNDS = { w: 1600, h: 1100 } as const;

/** Kapıya bu mesafede "E ile gir" çıkar */
export const DOOR_RADIUS = 46;

export const BUILDINGS: readonly Building[] = [
  {
    id: 'quests', name: 'The Warden\'s Post', hint: 'Choose a stage and descend',
    x: 300, y: 250, w: 200, h: 150, doorX: 300, doorY: 335, color: '#a01226',
  },
  {
    id: 'upgrade', name: 'Blacksmith', hint: 'Spend GOLD on permanent power',
    x: 640, y: 220, w: 180, h: 140, doorX: 640, doorY: 300, color: '#efa72e',
  },
  {
    id: 'shop', name: 'Pedlar\'s Stall', hint: 'Buy items and consumables',
    x: 980, y: 250, w: 170, h: 130, doorX: 980, doorY: 325, color: '#8a97a3',
  },
  {
    id: 'market', name: 'Marketplace', hint: 'Trade items with other players',
    x: 1300, y: 340, w: 210, h: 160, doorX: 1300, doorY: 430, color: '#5f9e4a',
  },
  {
    id: 'exchange', name: 'The Exchange', hint: 'Swap GOLD for $GRAVE',
    x: 420, y: 720, w: 200, h: 150, doorX: 420, doorY: 805, color: '#e3d8c0',
  },
  {
    id: 'tavern', name: 'Tavern', hint: 'Your profile and records',
    x: 900, y: 760, w: 220, h: 170, doorX: 900, doorY: 855, color: '#c8324a',
  },
] as const;

export const HUB_PLAYER = { radius: 13, speed: 190 } as const;

export interface HubState {
  x: number;
  y: number;
  facingRight: boolean;
  moving: boolean;
  animT: number;
  /** kapısında durulan bina (yoksa null) */
  atDoor: Building | null;
}

export function createHub(): HubState {
  return { x: HUB_BOUNDS.w / 2, y: HUB_BOUNDS.h - 180, facingRight: true, moving: false, animT: 0, atDoor: null };
}

/** Nokta bina gövdesinin içinde mi (çarpışma) */
function insideBody(b: Building, x: number, y: number, r: number) {
  return Math.abs(x - b.x) < b.w / 2 + r && Math.abs(y - b.y) < b.h / 2 + r;
}

/**
 * Hub adımı. dt DEĞİŞKEN olabilir (deterministik olması gerekmiyor —
 * burada rekabet yok, sadece gezinti).
 */
export function stepHub(s: HubState, dt: number, inx: number, iny: number) {
  const m = Math.hypot(inx, iny);
  const nx = m > 1e-4 ? inx / m : 0;
  const ny = m > 1e-4 ? iny / m : 0;

  const sp = HUB_PLAYER.speed * dt;
  const r = HUB_PLAYER.radius;

  // Eksenleri AYRI dene — köşeye sürtünürken tamamen kilitlenmesin
  const tryX = s.x + nx * sp;
  if (!BUILDINGS.some((b) => insideBody(b, tryX, s.y, r))) s.x = tryX;
  const tryY = s.y + ny * sp;
  if (!BUILDINGS.some((b) => insideBody(b, s.x, tryY, r))) s.y = tryY;

  // harita sınırları
  s.x = Math.max(r, Math.min(HUB_BOUNDS.w - r, s.x));
  s.y = Math.max(r, Math.min(HUB_BOUNDS.h - r, s.y));

  s.moving = m > 1e-4;
  s.animT += dt;
  if (nx > 0.01) s.facingRight = true;
  else if (nx < -0.01) s.facingRight = false;

  // en yakın kapı
  let best: Building | null = null;
  let bestD = DOOR_RADIUS * DOOR_RADIUS;
  for (const b of BUILDINGS) {
    const dx = b.doorX - s.x, dy = b.doorY - s.y;
    const d2 = dx * dx + dy * dy;
    if (d2 < bestD) { bestD = d2; best = b; }
  }
  s.atDoor = best;
}
