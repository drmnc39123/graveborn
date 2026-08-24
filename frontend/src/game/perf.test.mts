// KASMA MÜHRÜ — derin inişte bir kare ne kadar iş yapıyor?
//
// Çalıştır:  npx tsx src/game/perf.test.mts
//
// ⚠️ NİYE VAR: tek perf testi `fx.test.mts:92-112` idi ve **Stage 1, campaign,
// TEK SİLAH** ölçüyordu. Kullanıcının şikâyet ettiği senaryo — descent, derin,
// 420 düşman, dolu build, takip mermisi — hiç ölçülmüyordu. Yani bu regresyonun
// testlerden geçmesi beklenen bir sonuçtu.
//
// ⚠️ İKİ ŞEY AYRI ÖLÇÜLÜYOR:
//   1. `step()` — saf simülasyon, gerçek milisaniye
//   2. `render()` — Node'da GERÇEK CANVAS YOK. Sahte bir ctx çağrıları SAYIYOR.
//      Bu GPU süresini ölçmez; **gönderilen iş hacmini** ölçer — `drawImage`
//      sayısı, gradient tahsisi, `save/restore`, ve `ctx.filter` ataması.
//      Kontrol edebildiğim şey zaten bu. Gerçek fps için tarayıcıdaki HUD
//      sayacına (`GameCanvas.tsx`) bakılmalı.
//
// ⚠️ ÖLÇÜM ALETİ ORTAK: `simPlayer.mts`. Kendi yapay oyuncunu YAZMA — bu
// depoda iki kez denendi, ikisi de yalan söyledi.
//
// ── TARAYICIDA ÖLÇÜLEN (2026-08-24, gerçek koşu, `window.__gbGame` ile
//    sahne elle dolduruldu) ──
//   3 düşman .................. 193 fps
//   400 düşman EKRANDA ........ 137 fps
//   400 düşman EKRAN DIŞINDA .. 195 fps   ← kırpma çalışıyor
// Yani ekran dışındaki 400 düşman artık HİÇBİR ŞEYE mal olmuyor (taban
// fps'e dönüyor). Kırpma olmadan ikisi de 137 olurdu.
// ── ⭐ TAKİP SORGUSU — KASMANIN ASIL KAYNAĞI (2026-08-24, tarayıcı) ──
// Ölçüm `?test=1&depth=60` derinlik kancasıyla yapıldı (GameCanvas).
//
// Gerçek, ulaşılabilir kurgu (4 silah lv8, 400 düşman, ~34 mermi):
//   step 0,37 ms · render 1,53 ms · kare 1,9 ms · en kötü kare 6,8 ms
//   → KASMA YOK. Şikâyet edilen şey bu senaryo değil.
//
// Mermi bulutu zorlandığında (6 takip silahı, amount×6, duration×3):
//   ÖNCE : step 14,35 ms · en kötü kare 29,8 ms (34 fps)
//   KONTROL GRUBU (aynı mermi sayısı, `seek = 0`):
//          takipli 13,19 ms → takipsiz 5,85 ms
//          yani takip sorgusu tek başına `step()`in **%56'sı**
//   SONRA: 832 mermide step 5,2 ms → mermi başına **7 kat** ucuz
//
// SEBEP: `nearestEnemyTo` 900 px yarıçapla ızgaraya soruyordu. Hücre 64 px →
// 29×29 = **841 `Map.get()`** per mermi, oysa sahnedeki düşman TAVANI 400.
// Izgara bu yarıçapta düz taramadan pahalıydı. Düz taramaya çevrildi;
// `sim.test` mührü **DEĞİŞMEDİ** (1d204abe), yani birebir aynı koşu.
//
// ⚠️ KALAN: aşırı mermi sayısında darboğaz artık RENDER. 618 mermide kare
// ortancası 24,4 ms. AMA bu sentetik bir uç — gerçek `amount` pasifi
// (`echo`) en fazla +2 mermi veriyor. Gerçek bir kurguda ölçülmeden mermi
// tavanı EKLEME: tavan simülasyonu değiştirir ve mührü kırar.
//
// ⚠️ Bu sayılar bir GELİŞTİRME MAKİNESİNDEN. Oyuncunun donanımı farklı;
// mutlak fps değil ARADAKİ FARK anlamlı. Node tarafı `drawImage` sayamıyor
// (sprite yüklenmiyor), o yüzden kırpmanın gerçek kazancı yalnız burada
// görülebiliyor — ölçümü tekrar edeceksen aynı yolu kullan.

import { DESCENT, RUN, STAGES, TICK, weaponById } from './config.js';
import { FORGE, permanentBonus } from './forge.js';
import { Game } from './engine.js';
import { seedFromString } from './rng.js';
import { fleeInput, smartPick } from './simPlayer.mjs';
import { render } from './render.js';

const FAIL: string[] = [];
const check = (n: string, ok: boolean, d = '') => {
  console.log(`${ok ? '  ✓' : '  ✗'} ${n}${d ? ` — ${d}` : ''}`);
  if (!ok) FAIL.push(n);
};

/** Dolu Forge — derin inişe gelebilen oyuncunun profili */
const tamForge: Record<string, number> = {};
for (const u of FORGE) tamForge[u.id] = u.maxLevel;

/**
 * EN KÖTÜ DURUM KURULUMU — oynayarak değil, doğrudan kurarak.
 *
 * ⚠️ Oynayarak derinlik 60'a inmek dakikalar sürer ve seed'e göre oynar;
 * perf ölçümünde istediğimiz TEKRARLANABİLİR bir sahne. Build elle kuruluyor:
 * evrimleşmiş takip silahı (`lost` = Choir of the Lost) + onu besleyen
 * pasifler, çünkü ölçülen darboğaz tam olarak takip mermilerinin sayısıyla
 * büyüyor.
 */
function derinSahne(seed: string, derinlik: number): Game {
  const g = new Game(seedFromString(seed), STAGES[0], permanentBonus(tamForge),
    'descent', undefined, derinlik);
  g.setViewport(1280, 720);
  // ⚠️ YALNIZ TAKİP SİLAHI DEĞİŞTİRİLİYOR, EL ÖNCEDEN DOLDURULMUYOR.
  // İlk sürümde 3 silah daha eklenmişti ve ölçüm d60'ta "0 düşman" basıyordu:
  // derin başlangıçta ~40 birikmiş level-up var, el önceden doluyken teklif
  // havuzu TÜKENİYOR, `smartPick` boş dönüyor, `choose` hiçbir şey yapmıyor
  // ve faz sonsuza kadar 'levelup' kalıyor. Birikmiş seviyeler eli zaten
  // dolduruyor — hem daha gerçekçi hem de kilitlenmiyor.
  const lost = weaponById('lost');
  if (lost) g.weapons[0] = { def: lost, level: 1, cd: 0 };
  return g;
}

/**
 * Sahneyi gerçekten doldur — düşmanlar doğsun, mermiler havalansın.
 *
 * ⚠️ OYUNCU ÖLÜMSÜZ. İlk sürümde değildi ve ölçüm YALAN SÖYLEDİ: derinlik
 * 60'ta oyuncu ısınma sırasında ölüyor, `phase !== 'running'` oluyor ve
 * ölçüm "0 düşman · 0,000 ms" basıyordu — yani en pahalı sahneyi hiç
 * görmeden "bütçe sağlam" diyordu.
 * Burada ölçülen şey hayatta kalmak DEĞİL, bir karenin maliyeti. Canı her
 * tick geri vermek sahneyi doygunluğa taşımanın en dürüst yolu.
 */
function isit(g: Game, saniye = 20): void {
  const n = Math.round(saniye / TICK);
  for (let i = 0; i < n; i++) {
    // ⚠️ BİRİKMİŞ LEVEL-UP'LAR BOŞALTILMALI. Checkpoint'ten başlayan koşu
    // birden fazla bekleyen seviye taşıyor; tek `choose()` yetmiyor ve
    // `phase` hâlâ 'levelup' kalıyordu → döngü ilk turda kırılıyor,
    // ölçüm "0 düşman · 0,000 ms" basıyordu. Ölçüm aleti üçüncü kez yalan
    // söyledi; kuyruğu TÜKETMEK şart.
    let guard = 0;
    while (g.phase === 'levelup' && guard < 64) { g.choose(smartPick(g)); guard += 1; }
    if (g.phase !== 'running') break;
    g.hp = g.stats.maxHp;
    g.setInput(...fleeInput(g));
    g.step();
  }
}

console.log('\n═══ KASMA ÖLÇÜMÜ ═══');

console.log('\n[1] step() — derin inişte simülasyon maliyeti');
const DERINLIKLER = [1, 30, 60];
const stepMs: Record<number, number> = {};
let dusmanTepe = 0;
for (const d of DERINLIKLER) {
  const g = derinSahne('perf', d);
  isit(g, 12);
  dusmanTepe = Math.max(dusmanTepe, g.enemies.length);
  const mermi = g.projectiles.length;

  const N = 300;
  const t0 = performance.now();
  for (let i = 0; i < N; i++) {
    let guard = 0;
    while (g.phase === 'levelup' && guard < 64) { g.choose(smartPick(g)); guard += 1; }
    if (g.phase !== 'running') break;
    g.hp = g.stats.maxHp;
    g.setInput(...fleeInput(g));
    g.step();
  }
  const ms = (performance.now() - t0) / N;
  stepMs[d] = ms;
  console.log(`     d${String(d).padStart(2)}: ${ms.toFixed(3)} ms/kare · `
    + `${g.enemies.length} düşman · ${mermi} mermi · ${g.gems.length} mücevher`);
}

// ⚠️ EŞİK 16,7 ms'in TAMAMI DEĞİL: `step()` bütçenin yalnız bir parçası,
// üstüne render var. Yarısı makul bir tavan.
check('derin inişte step() bütçesi (<8 ms/kare)', stepMs[60] < 8,
  `d60: ${stepMs[60].toFixed(3)} ms`);
// ⭐ ASIL SORU: maliyet derinlikle NASIL büyüyor. Doğrusala yakın olmalı;
// süper-doğrusal büyüme uzamsal ızgaranın işini yapmadığını söyler.
const buyume = stepMs[60] / Math.max(0.0001, stepMs[1]);
console.log(`     büyüme d1 → d60: ×${buyume.toFixed(1)}`);
check('maliyet derinlikle patlamıyor (<×25)', buyume < 25, `×${buyume.toFixed(1)}`);

console.log('\n[2] render() — kare başına gönderilen iş');
/**
 * SAYAN SAHTE CTX.
 * ⚠️ Ölçtüğü şey GPU değil, ÇAĞRI HACMİ. `drawImage` sayısı görüş alanı
 * kırpmasının (frustum culling) olup olmadığını doğrudan söyler: ekranda 60
 * düşman varken 420 çizim yapılıyorsa kırpma yok demektir.
 */
function sayanCtx() {
  const c = {
    drawImage: 0, gradient: 0, saveRestore: 0, filter: 0, path: 0, text: 0,
  };
  const nope = () => undefined;
  const grad = { addColorStop: nope };
  const ctx = new Proxy({} as Record<string, unknown>, {
    get(_t, k: string) {
      switch (k) {
        case 'drawImage': return () => { c.drawImage += 1; };
        case 'createRadialGradient':
        case 'createLinearGradient': return () => { c.gradient += 1; return grad; };
        case 'save': case 'restore': return () => { c.saveRestore += 1; };
        case 'beginPath': case 'closePath': case 'fill': case 'stroke':
        case 'arc': case 'ellipse': case 'moveTo': case 'lineTo':
        case 'roundRect': case 'fillRect': case 'strokeRect':
          return () => { c.path += 1; };
        case 'fillText': case 'strokeText': return () => { c.text += 1; };
        case 'canvas': return { width: 1280, height: 720 };
        default: return typeof k === 'string' ? nope : undefined;
      }
    },
    set(_t, k: string) {
      if (k === 'filter') c.filter += 1;
      return true;
    },
  });
  return { ctx: ctx as unknown as CanvasRenderingContext2D, c };
}

const gr = derinSahne('perf-render', 60);
isit(gr, 12);
const { ctx, c } = sayanCtx();
const KARE = 20;
for (let i = 0; i < KARE; i++) render(ctx, gr, 1280, 720, 1, TICK);
const kb = (k: keyof typeof c) => Math.round(c[k] / KARE);
console.log(`     kare başına: ${kb('drawImage')} drawImage · ${kb('gradient')} gradient · `
  + `${kb('saveRestore')} save/restore · ${kb('filter')} filter · ${kb('path')} path`);
console.log(`     sahnede ${gr.enemies.length} düşman`);

// ⚠️ `ctx.filter` sıcak döngüde YASAK — projenin kendi kuralı (`fx.ts` perf notu).
check('ctx.filter kare başına atanmıyor', kb('filter') === 0, `${kb('filter')} atama`);
// ⚠️ GÖRÜŞ ALANI KIRPMASI BURADAN ÖLÇÜLEMİYOR — ve bunu iddia etmek yanlış
// olurdu. Node'da `Image` yok, `sprites.ts` hiçbir görseli yükleyemiyor,
// `drawActor` erken çıkıyor → `drawImage` her zaman 0. Yani "0 < 145" testi
// BOŞUNA GEÇER: kırpma olsa da olmasa da yeşil yanar.
// Boş geçen bir iddia, iddia değildir. Sayı bilgi olarak basılıyor; kırpma
// tarayıcıda ölçülecek (`GameCanvas.tsx` fps sayacı + Chrome profiler).
if (kb('drawImage') === 0) {
  console.log('     ⚠️ drawImage 0 — Node"da sprite yüklenmiyor, kırpma BURADAN ölçülemez');
} else {
  check('görüş alanı kırpması var (drawImage < düşman sayısı)',
    kb('drawImage') < gr.enemies.length,
    `${kb('drawImage')} çizim vs ${gr.enemies.length} düşman`);
}
// ⚠️ `path` çağrıları ÖLÇÜLEBİLİYOR (görsel gerektirmiyorlar) ve kare başına
// 385 yüksek — çizim katmanının gerçek yükü buradan görünüyor.
console.log(`     path/kare ${kb('path')} · text/kare ${Math.round(c.text / KARE)}`);
check('kare başına gradient tahsisi makul (<12)', kb('gradient') < 12, `${kb('gradient')}`);

console.log('[2b] Gorus alani kirpmasi GERCEKTEN calisiyor mu');
{
  // CIFT TARAFLI KANIT. `drawImage` Node'da her zaman 0 oldugu icin
  // "0 < 145" gibi bir iddia BOS GECERDI. Bunun yerine AYNI sahne iki kez
  // ciziliyor: normal, ve tum varliklar ekranin cok disina isinlanmis halde.
  // Kirpma calisiyorsa ikinci cizim BELIRGIN sekilde daha az is yapmali.
  // Kirpma sokulurse bu test kirmizi yanar — asil isi bu.
  const ga = derinSahne('kirp', 60);
  isit(ga, 12);
  const KR = 10;
  const a = sayanCtx();
  for (let i = 0; i < KR; i++) render(a.ctx, ga, 1280, 720, 1, TICK);
  const yakin = (a.c.path + a.c.drawImage) / KR;
  for (const e of ga.enemies) { e.x += 50000; e.y += 50000; }
  for (const m of ga.gems) { m.x += 50000; m.y += 50000; }
  for (const pr of ga.projectiles) { pr.x += 50000; pr.y += 50000; }
  const b = sayanCtx();
  for (let i = 0; i < KR; i++) render(b.ctx, ga, 1280, 720, 1, TICK);
  const uzak = (b.c.path + b.c.drawImage) / KR;
  console.log(`     ekranda ${Math.round(yakin)} cizim · hepsi uzakta ${Math.round(uzak)} cizim`);
  check('ekran disi varliklar CIZILMIYOR (kirpma aktif)', uzak < yakin * 0.85,
    `${Math.round(uzak)} vs ${Math.round(yakin)}`);
}


console.log('\n[3] Tavanlar — sınırsız büyüyen dizi var mı');
const gc = derinSahne('perf-cap', 60);
isit(gc, 20);
console.log(`     mermi ${gc.projectiles.length} · mücevher ${gc.gems.length} · `
  + `düşman ${gc.enemies.length}/${DESCENT.aliveMax}`);
check('düşman tavanı tutuyor', gc.enemies.length <= DESCENT.aliveMax,
  `${gc.enemies.length}/${DESCENT.aliveMax}`);
// ⚠️ Bu ikisinin ŞU AN tavanı yok; eşikler bir gerileme kapısı olarak duruyor.
check('mermi sayısı makul (<400)', gc.projectiles.length < 400, `${gc.projectiles.length}`);
check('mücevher sayısı makul (<600)', gc.gems.length < 600, `${gc.gems.length}`);

console.log(`\n${FAIL.length === 0 ? '✅ KASMA BÜTÇESİ SAĞLAM' : `❌ ${FAIL.length} BAŞARISIZ: ${FAIL.join(', ')}`}\n`);
void RUN;
process.exit(FAIL.length === 0 ? 0 : 1);
