// Çarpışma doğrulaması — GERÇEK oyun koduyla, haritanın GERÇEK verisiyle.
// Bir önceki düzeltmeyi doğrulamadan gönderdim ve bozuk çıktı; bu dosya
// onun tekrarını engelliyor.
//
// Çalıştır:  npx tsx src/game/hub.test.mts

import { existsSync, readFileSync } from 'node:fs';
import { buildMapWorld } from './mapWorld.js';
import { createHub, stepHub, HUB_PLAYER } from './hub.js';
import { HEROES } from './heroes.js';
import { playerArt, villagerArt } from './sprites.js';
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

/** Belirtilen X'i GEÇEBİLDİ mi? (mesafe değil, hattı aşmak) */
function crossesX(fromX: number, y: number, targetX: number, steps = 90) {
  const h = createHub(world);
  h.x = fromX; h.y = y;
  for (let i = 0; i < steps; i++) stepHub(h, 1 / 60, 1, 0);
  return h.x > targetX;
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
// DİKKAT: su tespiti SADECE dosya adından. Bu test önce tüm yolda arıyordu
// ve `/art/world/water/spr_grass_1.png` (723 çim karosu) su sanılıyordu —
// oyundaki hatanın aynısı testte de vardı, o yüzden hatayı yakalayamamıştı.
const baseOf = (p: string) => p.slice(p.lastIndexOf('/') + 1);
let waterBlocked = 0, waterTried = 0;
for (let i = 0; i < world.tiles.length && waterTried < 40; i++) {
  const src = world.palette[world.tiles[i] - 1] ?? '';
  if (!/water|lake|river|pond/i.test(baseOf(src))) continue;
  const tx = i % world.tileW, ty = Math.floor(i / world.tileW);
  const wx = tx * MAP_TILE + 16, wy = ty * MAP_TILE + 16;
  // Köprüye YAKIN karoları atla: oyuncu yürürken köprüye denk gelip
  // haklı olarak geçiyor, test bunu "su engellemiyor" sanıyordu.
  if (world.bridges.some((b) => wy > b.y - 80 && wy < b.y + b.h + 80)) continue;
  waterTried++;
  // Kıyıdan başla, suyun ÖTESİNE geçmeye çalış.
  // (Önce "hiç ilerledi mi" diye bakıyordum: oyuncu suya kadar yürüyordu ve
  //  bu hareket 'geçti' sayılıyordu — testin kendi hatasıydı.)
  if (!crossesX(wx - MAP_TILE * 2, wy, wx + MAP_TILE * 2)) waterBlocked++;
}
check('su aşılamıyor', waterTried === 0 || waterBlocked > waterTried * 0.85, `${waterBlocked}/${waterTried}`);

console.log('\n[6] Zemin nesneleri en altta çiziliyor');
const ground = world.objects.filter((o) => (o.z ?? 0) < -1000);
check('zemin nesneleri işaretli', ground.length > 100, `${ground.length} nesne`);
check('hepsi listenin başında', world.objects.slice(0, ground.length).every((o) => (o.z ?? 0) < -1000));
check('zemin nesnelerinde çarpışma yok', ground.every((o) => !(o.solid ?? 0)));


console.log('');
console.log('[7] Köyde SEÇİLİ karakter yürüyor');
{
  // ⚠️ NİYE VAR: köyde HER ZAMAN Fire Knight yürüyordu. `hubRender` sabit
  // `PLAYER_ART` çiziyordu (`playerArt(DEFAULT_HERO)`), yani karakter seçimi
  // ekranda hiç karşılık bulmuyordu. Bu bölüm zincirin iki halkasını da
  // ölçüyor: durum karakteri TAŞIYOR mu, ve karakter başına görsel GERÇEKTEN
  // ayrışıyor mu.
  //
  // ⚠️ Bu testin ölçemediği tek şey `renderHub`ın o alanı OKUDUĞU — canvas
  // gerektiriyor. Tarayıcıda doğrulanmalı.
  for (const h of HEROES) {
    const st = createHub(world, h.id);
    check(`createHub karakteri taşıyor (${h.id})`, st.hero === h.id, st.hero);
  }
  check('varsayılan hâlâ çalışıyor (eski çağrılar kırılmadı)',
    typeof createHub(world).hero === 'string', createHub(world).hero);

  // Görseller gerçekten ayrışıyor mu — hepsi aynı klasöre bakıyorsa
  // durum alanını taşımanın bir anlamı kalmaz.
  const yollar = new Set(HEROES.map((h) => playerArt(h.id).anims.run.src));
  check('her karakterin YÜRÜME görseli ayrı', yollar.size === HEROES.length,
    `${yollar.size}/${HEROES.length} ayrı yol`);
}


console.log('[8] Köylüler — dekor canlı ama mantığa girmiyor');
{
  const st = createHub(world);

  check('köylüler doğdu', st.villagers.length > 0, `${st.villagers.length} köylü`);
  const kinds = new Set(st.villagers.map((v) => v.kind));
  check('birden fazla çeşit var', kinds.size >= 2, [...kinds].join(', '));

  // ⚠️ ÇİZDİĞİ DOSYALAR GERÇEKTEN VAR MI. Bu projede tekrar eden hata sınıfı
  // "kod doğru, dosya yok, hiçbir şey görünmüyor": paket `woman`ı `_walk_`
  // OLMADAN adlandırmış, kalıptan üretmek sessizce 404 verirdi.
  const yollar = new Set<string>();
  for (const k of kinds) {
    for (const yon of [true, false]) {
      const a = villagerArt(k, yon);
      if (a.anims.idle.src) yollar.add(a.anims.idle.src);
      if (a.anims.run.src) yollar.add(a.anims.run.src);
    }
  }
  const eksik = [...yollar].filter((p) => !existsSync(`public${p}`));
  check('her köylü görseli diskte VAR', eksik.length === 0,
    eksik.length ? eksik.join(', ') : `${yollar.size} yol doğrulandı`);

  // Sol ve sağ AYRI dosya — aynıysa `facingRight` görsel olarak ölü demektir
  const sol = villagerArt('man', false).anims.run.src;
  const sag = villagerArt('man', true).anims.run.src;
  check('sol/sağ yürüyüş ayrı görsel', sol !== sag);

  // ── DAVRANIŞ ── 60 sn ilerlet, oyuncu HİÇ girdi vermiyor
  const bas = st.villagers.map((v) => ({ x: v.x, y: v.y }));
  const oyuncu = { x: st.x, y: st.y };
  for (let i = 0; i < 3600; i++) stepHub(st, 1 / 60, 0, 0);

  check('oyuncu girdisiz KIPIRDAMADI (köylüler onu itmiyor)',
    st.x === oyuncu.x && st.y === oyuncu.y);

  const disarda = st.villagers.filter((v) =>
    v.x < 0 || v.y < 0 || v.x > world.w || v.y > world.h);
  check('hiçbiri haritadan çıkmadı', disarda.length === 0, `${disarda.length} kaçak`);

  const enUzak = Math.round(Math.max(...st.villagers.map((v) =>
    Math.hypot(v.x - v.homeX, v.y - v.homeY))));
  check('tasma tutuyor (evden 400px+ uzaklaşan yok)', enUzak <= 400, `en uzak ${enUzak}px`);

  // En az ikisi yer değiştirdi — hepsi tıkanmışsa "yürüyen köylü" değil
  // "duvara bakan heykel" eklemişiz demektir.
  const kimildayan = st.villagers.filter((v, i) =>
    Math.hypot(v.x - bas[i].x, v.y - bas[i].y) > 8);
  check('köylüler gerçekten dolaşıyor', kimildayan.length >= 2,
    `${kimildayan.length}/${st.villagers.length} yer değiştirdi`);

  // ⚠️ DETERMİNİZM: `game/` altında `Math.random()` yasak. Aynı dünyadan iki
  // köy kurulunca köylüler AYNI yerde doğmalı, yoksa sayfa her yenilendiğinde
  // köyün düzeni zıplar.
  const imza = (h: ReturnType<typeof createHub>) =>
    h.villagers.map((v) => `${v.kind}@${Math.round(v.x)},${Math.round(v.y)}`).join('|');
  check('doğuş deterministik (Math.random yok)', imza(createHub(world)) === imza(createHub(world)));
}

console.log(`\n${FAIL.length === 0 ? '✅ TÜM ÇARPIŞMA TESTLERİ GEÇTİ' : `❌ ${FAIL.length} BAŞARISIZ: ${FAIL.join(', ')}`}\n`);
process.exit(FAIL.length === 0 ? 0 : 1);
