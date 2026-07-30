'use client';
// Koddaki dünyayı (world.ts) EDİTÖR BELGESİNE çevirir.
//
// Amaç: sıfır haritadan başlamamak. Mevcut köy — binalar, yollar, ağaçlar,
// portallar, kapılar — editöre yüklenir, üstünde çalışılır.
//
// Tek yönlü: kod → editör. Editörde kaydettiğin harita artık tek doğru
// kaynak olur; kodda tanımlı dünya sadece başlangıç şablonu.

import {
  BUILDINGS, DECOR, MAP_H, MAP_W, PORTALS, TILE, buildWorld, tileSrcAt,
} from './world';
import { createHub } from './hub';
import type { MapDoc, MapObject, MapMarker } from './mapData';

export function importCodeWorld(): MapDoc {
  const world = buildWorld();

  // ── zemin ── her karonun çözülmüş görselini palete koy
  const palette: string[] = [];
  const paletteOf = (src: string) => {
    let i = palette.indexOf(src);
    if (i < 0) { palette.push(src); i = palette.length - 1; }
    return i + 1; // 0 = boş
  };
  const data = new Array(MAP_W * MAP_H).fill(0);
  for (let y = 0; y < MAP_H; y++) {
    for (let x = 0; x < MAP_W; x++) {
      data[y * MAP_W + x] = paletteOf(tileSrcAt(world, x, y));
    }
  }

  // ── nesneler ──
  let id = 1;
  const objects: MapObject[] = [];

  // binalar — çarpışma yüksekliği foot kutusundan gelir
  for (const b of BUILDINGS) {
    objects.push({
      id: id++, src: b.src, x: b.x, y: b.y, w: b.w, h: b.h,
      solid: b.foot.h, fps: 0,
    });
  }

  // dekoratif binalar
  for (const d of DECOR) {
    objects.push({
      id: id++, src: d.src, x: d.x, y: d.y, w: d.w, h: d.h,
      solid: d.solid ?? 0, fps: d.fps ?? 0,
    });
  }

  // serpiştirilmiş doğa (ağaç, çalı, kaya, fener…)
  for (const s of world.scatter) {
    objects.push({
      id: id++, src: s.src, x: s.x, y: s.y, w: s.w, h: s.h,
      solid: 0, fps: s.fps ?? 0,
    });
  }

  // portal görselleri de nesne olarak dursun ki editörde görünsünler
  for (const p of PORTALS) {
    objects.push({
      id: id++, src: p.src, x: p.x, y: p.y, w: 96, h: 96,
      frames: 7, rows: 1, row: 0, col: 0, fps: 10, solid: 0,
    });
  }

  // ── işaretçiler ── (oyunun etkileşim noktaları)
  const markers: MapMarker[] = [];
  for (const b of BUILDINGS) {
    markers.push({ id: id++, kind: 'door', x: b.doorX, y: b.doorY, label: b.name, target: b.id });
  }
  for (const p of PORTALS) {
    markers.push({
      id: id++, kind: p.kind, x: p.x + 48, y: p.y + 60, label: p.label,
      toX: p.toX, toY: p.toY,
    });
  }

  const start = createHub();
  return {
    version: 1,
    name: 'Koddaki köy',
    terrain: { w: MAP_W, h: MAP_H, palette, data },
    objects,
    markers,
    spawn: { x: Math.round(start.x), y: Math.round(start.y) },
  };
}
