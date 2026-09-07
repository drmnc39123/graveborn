// OTOMATİK NESNE SINIFLANDIRICILARI MÜHRÜ.
//
// 🔴 NİYE VAR: bu modül bu deponun imza hatasının canlı örneğiydi — dört
// export YAZILMIŞ ama HİÇBİR YERDEN ÇAĞRILMIYORDU (2026-09-07 ölçüldü).
// Sonuçları görünmezdi ama gerçekti:
//   • `mapWorld.ts:51` `o.solidW ?? 0.8` okuyor; editör bu alanı hiç
//     yazmadığı için ÇİT ile KULE aynı çarpışma genişliğindeydi.
//   • Çizim sırası `footY = y + h + (z ?? 0)`; zemin görseli nesne olarak
//     konduğunda z'si olmadığı için KARAKTERİN ÜSTÜNE çizilebiliyordu —
//     `isGround`un kendi yorumundaki şikayet tam olarak buydu.
//
// ⚠️ Bu mühür yalnız sınıflandırıcıların doğruluğunu değil, ÇAĞRILDIKLARINI
// da ölçüyor. Doğru çalışan ama kimsenin çağırmadığı bir fonksiyon,
// bozuk bir fonksiyondan daha tehlikelidir: kodu okuyan "bu iş hallolmuş"
// sanır.
//
//   cd frontend && npx tsx src/game/autoProps.test.mts

import fs from 'node:fs';
import {
  GROUND_Z, autoFps, autoSolid, autoSolidW, isBridge, isGround, isWall,
} from './autoProps.js';

const FAIL: string[] = [];
const check = (n: string, ok: boolean, d = '') => {
  console.log(`${ok ? '  ✓' : '  ✗'} ${n}${d ? ` — ${d}` : ''}`);
  if (!ok) FAIL.push(n);
};

console.log('\n═══ OTOMATİK NESNE SINIFLANDIRICILARI ═══');

console.log('\n[1] ⭐ ÇAĞRILIYORLAR MI — modülün kendi hikâyesi');
{
  /**
   * 🔴 ASIL KONTROL. Sınıflandırıcı doğru çalışsa bile çağrılmıyorsa hiçbir
   * işe yaramaz. Editör nesne yerleştirmenin TEK yeri; her sınıflandırıcı
   * orada geçmeli.
   */
  const ed = fs.readFileSync('src/app/editor/page.tsx', 'utf8');
  for (const ad of ['autoFps', 'autoSolid', 'autoSolidW', 'isBridge', 'isGround', 'GROUND_Z']) {
    check(`editör "${ad}" çağırıyor`, new RegExp(`\\b${ad}\\b`).test(ed));
  }
  // ⚠️ KONTROL GRUBU: tarama her şeye "evet" diyor olabilirdi.
  check('uydurma ad bulunmuyor (kontrol grubu)', !/\bautoZzzYok\b/.test(ed));

  /**
   * ⚠️ İKİ YERLEŞTİRME NOKTASI AYNI ALANLARI YAZMALI. Ayrışırlarsa nesnenin
   * nasıl konduğuna göre davranış değişir ve sebebi görünmez olur — tek
   * tıkla konan duvar geçilebilir, sürükleyerek konan geçilemez olurdu.
   */
  const alanlar = ['fps:', 'solid:', 'solidW:', 'z: GROUND_Z', 'bridge: true'];
  for (const a of alanlar) {
    const n = ed.split(a).length - 1;
    check(`"${a}" iki yerleştirme noktasında da var`, n >= 2, `${n} kez`);
  }
}

console.log('\n[2] ⭐ DUVAR ASLA ZEMİN DEĞİL — öncelik yazılı');
{
  /**
   * `cobble_wall` iki kalıba da uyuyor: `cobble` → zemin, `_wall` → duvar.
   * Öncelik olmasaydı duvar `GROUND_Z` alır, karakterin ALTINA çizilir ve
   * oyuncu duvarın içinden geçiyormuş gibi görünürdü.
   */
  const cakisan = ['cobble_wall.png', 'stone_path_wall.png', 'grass_fence.png', 'road_gate.png'];
  for (const n of cakisan) {
    check(`${n}: duvar sayılıyor`, isWall(n), `wall=${isWall(n)}`);
    check(`${n}: zemin SAYILMIYOR`, !isGround(n), `ground=${isGround(n)}`);
  }
  // ⚠️ ÇİFT TARAFLI: gerçek zemin hâlâ zemin olmalı, kural her şeyi elemesin
  for (const n of ['floor_wood.png', 'cobble_01.png', 'grass_tile.png', 'dirt_path_02.png']) {
    check(`${n}: zemin`, isGround(n), `ground=${isGround(n)}`);
  }
  check('GROUND_Z belirgin biçimde negatif', GROUND_Z < -1000, String(GROUND_Z));
}

console.log('\n[3] ÇARPIŞMA');
{
  // ⚠️ Geçilebilir olması gerekenler engel OLMAMALI
  for (const n of ['grass_01.png', 'floor_wood.png']) {
    check(`${n}: geçilebilir`, autoSolid(n, 64) === 0, String(autoSolid(n, 64)));
  }
  // ⚠️ `solidW` her zaman kullanılabilir bir oran dönmeli: 0 çarpışmayı
  // yok eder, 1'in üstü nesneden geniş bir duvar yaratır.
  for (const n of ['tower.png', 'fence_01.png', 'tree_big.png', 'bilinmeyen_sey.png']) {
    const w = autoSolidW(n);
    check(`${n}: solidW 0–1 arası`, w > 0 && w <= 1, String(w));
  }
  check('yükseklik oranı en az 6 piksel', autoSolid('house_01.png', 10) >= 6 || autoSolid('house_01.png', 10) === 0);
}

console.log('\n[4] ANİMASYON');
{
  // ⚠️ Çok kareli değilse animasyon anlamsız — tek kareyi oynatmak, sprite'ı
  // her karede yeniden çizip hiçbir şey değiştirmemek demek.
  check('strip yoksa fps 0', autoFps('rock_01.png') === 0, String(autoFps('rock_01.png')));
  check('strip varsa oynuyor', autoFps('torch_strip8.png') > 0, String(autoFps('torch_strip8.png')));
  check('sandık strip\'i olsa da durgun', autoFps('chest_strip6.png') === 0, String(autoFps('chest_strip6.png')));
  check('tanınmayan strip yine de oynuyor', autoFps('acayip_sey_strip4.png') > 0);
  // ⚠️ Hiçbir fps saçma olmamalı: 60 fps bir meşale için kare bütçesi yakar
  for (const n of ['portal_strip10.png', 'water_strip4.png', 'flag_strip6.png']) {
    const f = autoFps(n);
    check(`${n}: fps makul (0–15)`, f >= 0 && f <= 15, String(f));
  }
}

console.log('\n[5] KÖPRÜ');
{
  check('bridge tanınıyor', isBridge('wood_bridge.png'));
  check('plank tanınıyor', isBridge('plank_02.png'));
  check('sıradan nesne köprü değil', !isBridge('tree_01.png'));
}

console.log(`\n${FAIL.length === 0 ? '✅ SINIFLANDIRICILAR SAĞLAM' : `❌ ${FAIL.length} BAŞARISIZ: ${FAIL.join(', ')}`}\n`);
process.exit(FAIL.length === 0 ? 0 : 1);
