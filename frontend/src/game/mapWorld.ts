'use client';
// Editörde çizilen haritayı OYUN DÜNYASINA çevirir.
//
// Artık dünya kodda değil VERİDE: public/map/village.json.
// world.ts'teki elle yazılmış köy sadece editöre başlangıç şablonu veriyor;
// oyunun gördüğü dünya bu dosyadan geliyor.

import type { MapDoc, MapMarker, MapObject } from './mapData';
import { MAP_TILE } from './mapData';

export interface WorldObject extends MapObject {
  /** derinlik sıralaması için ayak Y'si (önceden hesaplanır) */
  footY: number;
}

export interface WorldDoor { id: string; label: string; x: number; y: number }
export interface WorldTravel { label: string; x: number; y: number; toX: number; toY: number }
export interface WorldFight { label: string; x: number; y: number }

export interface MapWorld {
  w: number;            // px
  h: number;            // px
  tileW: number;        // karo adedi
  tileH: number;
  palette: string[];
  tiles: number[];      // palet indeksi (0 = boş)
  objects: WorldObject[];
  /** çarpışma dikdörtgenleri — nesnelerin solid alt kısmı */
  solids: { x: number; y: number; w: number; h: number; wall: boolean }[];
  doors: WorldDoor[];
  travels: WorldTravel[];
  fight: WorldFight | null;
  spawn: { x: number; y: number };
  /** köprü alanları — su karoları burada yürünebilir */
  bridges: { x: number; y: number; w: number; h: number }[];
  /** ışık kaynakları — fener, meşale, ateş, mum */
  lights: { x: number; y: number; r: number }[];
}

export function buildMapWorld(doc: MapDoc): MapWorld {
  const objects: WorldObject[] = doc.objects.map((o) => ({ ...o, footY: o.y + o.h + (o.z ?? 0) }));
  // derinlik sırası bir kez hesaplanır; her frame sıralamak 2000 nesnede pahalı
  objects.sort((a, b) => a.footY - b.footY);

  const solids = doc.objects
    .filter((o) => (o.solid ?? 0) > 0)
    // Çarpışma gövdenin ALT kısmı: ağacın tepesinden geçilir, gövdesinden geçilmez.
    // Genişlik oranı nesneye göre: duvar neredeyse tam (bitişik duvarlar arasında
    // delik kalmasın), ağaç dar (sadece gövde).
    .map((o) => {
      const wf = o.solidW ?? 0.8;
      return {
        x: o.x + o.w * (1 - wf) / 2,
        y: o.y + o.h - (o.solid ?? 0),
        w: o.w * wf,
        h: o.solid ?? 0,
        wall: !!o.wall,
      };
    });

  const doors: WorldDoor[] = [];
  const travels: WorldTravel[] = [];
  let fight: WorldFight | null = null;

  for (const m of doc.markers) {
    if (m.kind === 'door') {
      if (!m.target) continue; // panel seçilmemiş kapı → sessizce atla (denetim editörde uyarıyor)
      doors.push({ id: m.target, label: m.label || m.target, x: m.x, y: m.y });
    } else if (m.kind === 'travel') {
      if (m.toX === undefined || m.toY === undefined) continue;
      travels.push({ label: m.label || 'Travel', x: m.x, y: m.y, toX: m.toX, toY: m.toY });
    } else if (m.kind === 'fight' && !fight) {
      fight = { label: m.label || 'The Fight Portal', x: m.x, y: m.y };
    }
  }

  // Köprüler: su üstünde yürünebilir alan. Kenarlardan biraz taşırıyoruz ki
  // köprüye adım atarken kıyıda takılma olmasın.
  const bridges = doc.objects
    .filter((o) => o.bridge)
    .map((o) => ({ x: o.x - 6, y: o.y - 6, w: o.w + 12, h: o.h + 12 }));

  // Işık kaynakları — fener/meşale/ateş/mum. Haritadan türetiliyor:
  // ayrı bir "ışık" nesnesi koydurmak yerine ateşi olan şey ışık verir.
  const lights = doc.objects
    .filter((o) => /lamp(?!_off)|lantern(?!s_off)|torch(?!_off)|fire(?!_portal)|flame|candle|brazier|campfire|fire_pit/i.test(o.src)
      && !/_off\.png$/i.test(o.src))
    .map((o) => ({
      x: o.x + o.w / 2,
      y: o.y + o.h * 0.45,
      r: Math.max(110, Math.min(230, o.w * 2.2)),
    }));

  return {
    w: doc.terrain.w * MAP_TILE,
    h: doc.terrain.h * MAP_TILE,
    tileW: doc.terrain.w,
    tileH: doc.terrain.h,
    palette: doc.terrain.palette,
    tiles: doc.terrain.data,
    objects,
    solids,
    doors,
    travels,
    fight,
    spawn: doc.spawn,
    bridges,
    lights,
  };
}

/** Haritayı sunucudan çek (public/map/village.json) */
export async function loadMapWorld(url = '/map/village.json'): Promise<MapWorld | null> {
  try {
    const r = await fetch(url, { cache: 'no-store' });
    if (!r.ok) return null;
    const doc = (await r.json()) as MapDoc;
    if (!doc?.terrain?.data) return null;
    return buildMapWorld(doc);
  } catch {
    return null;
  }
}
