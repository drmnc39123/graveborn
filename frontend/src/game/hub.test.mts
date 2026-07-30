// Çarpışma doğrulaması — GERÇEK oyun koduyla, haritanın GERÇEK verisiyle.
// Bir önceki düzeltmeyi doğrulamadan gönderdim ve bozuk çıktı; bu dosya
// onun tekrarını engelliyor.
//
// Çalıştır:  npx tsx src/game/hub.test.mts

import { readFileSync } from 'node:fs';
import { buildMapWorld } from './mapWorld.js';
import { createHub, stepHub, HUB_PLAYER } from './hub.js';
import { MAP_TILE } from './mapData.js';
import type { MapDoc } from './mapData.js';

const doc = JSON.parse(readFileSync('public/map/village.json', 'utf8')) as MapDoc;
const world = buildMapWorld(doc);

const FAIL: string[] = [];
const check = (name: string, ok: boolean, detail = '') => {
  console.log(`${ok ? '  ✓' : '  ✗'} ${name}${detail ? ` — ${detail}` : ''}`);
  if (!ok) FAIL.push(name);
};

/** Bir noktaya ışınla ve o yöne yürümeye çalış; ilerledi mi? */
function canWalk(fromX: number, fromY: number, dx: number, dy: number, steps = 30) {
  const h = createHub(world);
  h.x = fromX; h.y = fromY;
  const x0 = h.x, y0 = h.y;
  for (let i = 0; i < steps; i++) stepHub(h, 1 / 60, dx, dy);
  return Math.hypot(h.x - x0, h.y - y0) > 12;
}

console.log('\n[1] Dünya kurulumu');
check('nesneler yüklendi', world.objects.length > 2000, `${world.objects.length}`);
check('çarpışma kutuları var', world.solids.length > 800, `${world.solids.length}`);
check('köprü alanı var', world.bridges.length > 0, `${world.bridges.length}`);
check('kapılar bağlı', world.doors.length >= 5, `${world.doors.length} kapı`);
check('dövüş portalı var', !!world.fight);

console.log('\n[2] Binalara girilemiyor');
// Her kapının hemen ARKASINDAKİ nokta (binanın gövdesi) engelli olmalı
let blockedCount = 0;
for (const d of world.doors) {
  // kapıdan 60 px yukarı = binanın içi
  const inside = !canWalk(d.x, d.y + 40, 0, -1, 60);
  if (inside) blockedCount++;
}
check('bina gövdeleri engelli', blockedCount >= Math.ceil(world.doors.length * 0.6),
  `${blockedCount}/${world.doors.length} kapının arkası kapalı`);

console.log('\n[3] Katı nesnelerin merkezi geçilmez');
let solidHits = 0, solidTried = 0;
for (const c of world.solids.slice(0, 400)) {
  if (c.w < 24 || c.h < 12) continue; // çok küçükler atlanır
  solidTried++;
  const cx = c.x + c.w / 2, cy = c.y + c.h / 2;
  // kutunun soluna koy, sağa yürü — geçememeli
  if (!canWalk(c.x - HUB_PLAYER.radius - 4, cy, 1, 0, 40)) solidHits++;
}
check('katı nesneler yürümeyi durduruyor', solidHits > solidTried * 0.7,
  `${solidHits}/${solidTried}`);

console.log('\n[4] Köprüden geçiliyor');
let bridgeOk = 0;
for (const b of world.bridges) {
  const cx = b.x + b.w / 2;
  // köprünün üstünden aşağı doğru yürü
  if (canWalk(cx, b.y + 8, 0, 1, 50)) bridgeOk++;
}
check('köprüler geçilebilir', bridgeOk > 0, `${bridgeOk}/${world.bridges.length}`);

console.log('\n[5] Su geçilmez (köprü dışında)');
let waterBlocked = 0, waterTried = 0;
for (let i = 0; i < world.tiles.length && waterTried < 40; i++) {
  const src = world.palette[world.tiles[i] - 1] ?? '';
  if (!/water|lake/i.test(src)) continue;
  const tx = i % world.tileW, ty = Math.floor(i / world.tileW);
  const wx = tx * MAP_TILE + 16, wy = ty * MAP_TILE + 16;
  if (world.bridges.some((b) => wx > b.x && wx < b.x + b.w && wy > b.y && wy < b.y + b.h)) continue;
  waterTried++;
  // kıyıdan suya doğru yürü
  if (!canWalk(wx - MAP_TILE * 2, wy, 1, 0, 60)) waterBlocked++;
}
check('su engelli', waterTried === 0 || waterBlocked > waterTried * 0.6, `${waterBlocked}/${waterTried}`);

console.log('\n[6] Zemin nesneleri en altta çiziliyor');
const ground = world.objects.filter((o) => (o.z ?? 0) < -1000);
check('zemin nesneleri işaretli', ground.length > 100, `${ground.length} nesne`);
check('hepsi listenin başında', world.objects.slice(0, ground.length).every((o) => (o.z ?? 0) < -1000));
check('zemin nesnelerinde çarpışma yok', ground.every((o) => !(o.solid ?? 0)));

console.log(`\n${FAIL.length === 0 ? '✅ TÜM ÇARPIŞMA TESTLERİ GEÇTİ' : `❌ ${FAIL.length} BAŞARISIZ: ${FAIL.join(', ')}`}\n`);
process.exit(FAIL.length === 0 ? 0 : 1);
