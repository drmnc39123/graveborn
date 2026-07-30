// Harita veri biçimi — editör bunu üretir, oyun bunu okur.
// TEK doğru kaynak: harita artık kodda değil veride.

export const MAP_TILE = 32;

export interface MapObject {
  /** benzersiz id — seçme/silme için */
  id: number;
  src: string;
  x: number;
  y: number;
  w: number;
  h: number;
  /** Sayfadaki SÜTUN sayısı (yatay kare adedi). Izgara sayfalarında da kullanılır. */
  frames?: number;
  /** Izgara sayfasında hangi SATIR (0 tabanlı). Tek sıra sayfalarda 0. */
  row?: number;
  /** Izgara sayfasında hangi SÜTUN (0 tabanlı). Animasyon varsa başlangıç karesi. */
  col?: number;
  /** Sayfadaki toplam satır sayısı — kare yüksekliğini hesaplamak için */
  rows?: number;
  /** animasyon hızı (frames>1 ise) */
  fps?: number;
  /** çarpışma: gövdenin alt kısmının yüksekliği (0 = geçilebilir) */
  solid?: number;
  /** çizim sırası için ek kaydırma (ağaç tepesi gibi) */
  z?: number;
}

/** Zemin boyası — karo indeksi → karo görseli */
export interface MapTerrain {
  w: number;
  h: number;
  /** her karo için palet indeksi (0 = boş/çim) */
  data: number[];
  /** palet: indeks → görsel yolu */
  palette: string[];
}

export interface MapDoc {
  version: 1;
  name: string;
  terrain: MapTerrain;
  objects: MapObject[];
  /** oyuncunun doğduğu nokta */
  spawn: { x: number; y: number };
  /** etkileşim noktaları — bina kapıları ve portallar */
  markers: MapMarker[];
}

export type MarkerKind = 'door' | 'fight' | 'travel';

export interface MapMarker {
  id: number;
  kind: MarkerKind;
  x: number;
  y: number;
  label: string;
  /** door: hangi bina paneli açılacak · travel: nereye ışınlanacak */
  target?: string;
  toX?: number;
  toY?: number;
}

export function emptyMap(w = 96, h = 64): MapDoc {
  return {
    version: 1,
    name: 'village',
    terrain: { w, h, data: new Array(w * h).fill(0), palette: [] },
    objects: [],
    spawn: { x: (w / 2) * MAP_TILE, y: (h / 2) * MAP_TILE },
    markers: [],
  };
}

const KEY = 'graveborn:map:v1';

export function saveMapLocal(m: MapDoc) {
  if (typeof window === 'undefined') return;
  try { window.localStorage.setItem(KEY, JSON.stringify(m)); } catch { /* kota */ }
}

export function loadMapLocal(): MapDoc | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as MapDoc) : null;
  } catch { return null; }
}

/** Palete karo ekle (varsa mevcut indeksi döner) */
export function paletteIndex(t: MapTerrain, src: string): number {
  const i = t.palette.indexOf(src);
  if (i >= 0) return i + 1; // 0 = boş
  t.palette.push(src);
  return t.palette.length;
}
