// GRAFIK MALIYETI OLCUM ALETI — hangi sistem kare basina ne kadar is gonderiyor?
//
// NIYE VAR (kullanici): *"cok ilerki bolumlerde dusman fazlalastikca ve skill
// kartlari cogaldikca FPS fena dusuyor, kasma donma ortaya cikiyor. Telefonda
// nasil oynanir?"*
//
// Grafik kademesi (ULTRA LOW..ULTRA) tasarlamadan ONCE hangi KOLLARIN gercekten
// pahali oldugunu bilmek gerek. Tahminle kademe tasarlamak, olmayan bir sorunu
// cozmek olur.
//
// ⚠️ NE OLCUYOR: GPU suresi DEGIL, GONDERILEN IS HACMI (path/gradient/drawImage
// cagri sayisi). Node'da gercek canvas yok. Gercek fps tarayicidaki sayacla
// olculur. Ama "hangi sistem digerinin kac katı" sorusuna dogru cevap verir.
//
// ⚠️ YONTEM ABLASYON: ayni sahne once tam, sonra tek bir sistem bosaltilarak
// ciziliyor. Aradaki fark O SISTEMIN payi. Kod okuyup tahmin etmek yerine
// olcum; bu depoda "kod okuyarak tahmin" defalarca yanildi.
//
//   npx tsx src/game/graphics.probe.mts

import { STAGES, TICK, weaponById } from './config.js';
import { FORGE, permanentBonus } from './forge.js';
import { Game } from './engine.js';
import { seedFromString } from './rng.js';
import { fleeInput, smartPick } from './simPlayer.js';
import { render } from './render.js';

const tamForge: Record<string, number> = {};
for (const u of FORGE) tamForge[u.id] = u.maxLevel;

function sayanCtx() {
  /**
   * ⚠️ `fillArea` EKLENDI — VE SEBEBI SOMUT.
   *
   * Cagri saymak dolgu hizini (fill rate) GORMUYOR. `fillRect(px-w, py-h,
   * w*2, h*2)` ile `fillRect(px-w/2, py-h/2, w, h)` cagri olarak AYNI (1
   * path), ama biri 4 ekran, digeri 1 ekran boyuyor. Telefonda darboğaz
   * tam olarak bu.
   *
   * Birim: EKRAN ALANI (1280x720 = 1,0). Boyle okunuyor: "bir tek dusman
   * cizilmeden once ekran kac kez bastan boyaniyor?"
   */
  const c = { drawImage: 0, gradient: 0, saveRestore: 0, filter: 0, path: 0, text: 0, fillArea: 0 };
  const EKRAN = 1280 * 720;
  const nope = () => undefined;
  const grad = { addColorStop: nope };
  const ctx = new Proxy({} as Record<string, unknown>, {
    get(_t, k: string) {
      switch (k) {
        case 'drawImage': return () => { c.drawImage += 1; };
        case 'createRadialGradient':
        case 'createLinearGradient': return () => { c.gradient += 1; return grad; };
        case 'save': case 'restore': return () => { c.saveRestore += 1; };
        case 'fillRect':
          return (_x: number, _y: number, w: number, h: number) => {
            c.path += 1;
            // ⚠️ NaN/undefined gelirse 0 sayilir — alet kendi yalanini uretmesin
            if (Number.isFinite(w) && Number.isFinite(h)) c.fillArea += Math.abs(w * h) / EKRAN;
          };
        case 'beginPath': case 'closePath': case 'fill': case 'stroke':
        case 'arc': case 'ellipse': case 'moveTo': case 'lineTo':
        case 'roundRect': case 'strokeRect':
          return () => { c.path += 1; };
        case 'fillText': case 'strokeText': return () => { c.text += 1; };
        case 'canvas': return { width: 1280, height: 720 };
        default: return typeof k === 'string' ? nope : undefined;
      }
    },
    set(_t, k: string) { if (k === 'filter') c.filter += 1; return true; },
  });
  return { ctx: ctx as unknown as CanvasRenderingContext2D, c };
}

function sahne(seed: string, derinlik: number, saniye: number): Game {
  const g = new Game(seedFromString(seed), STAGES[0], permanentBonus(tamForge),
    'descent', undefined, derinlik);
  g.setViewport(1280, 720);
  const lost = weaponById('lost');
  if (lost) g.weapons[0] = { def: lost, level: 1, cd: 0 };
  const n = Math.round(saniye / TICK);
  for (let i = 0; i < n; i++) {
    let guard = 0;
    while (g.phase === 'levelup' && guard < 64) { g.choose(smartPick(g)); guard += 1; }
    if (g.phase !== 'running') break;
    g.hp = g.stats.maxHp;
    g.setInput(...fleeInput(g));
    g.step();
  }
  return g;
}

/** Bir sahneyi K kare ciz, kare basina toplam is dondur */
function is(g: Game, K = 12) {
  const { ctx, c } = sayanCtx();
  for (let i = 0; i < K; i++) render(ctx, g, 1280, 720, 1, TICK);
  return {
    path: c.path / K, gradient: c.gradient / K, drawImage: c.drawImage / K,
    saveRestore: c.saveRestore / K, text: c.text / K, fillArea: c.fillArea / K,
    toplam: (c.path + c.gradient * 8 + c.drawImage + c.saveRestore * 0.2) / K,
  };
}

console.log('\n=== GRAFIK MALIYETI (ablasyon) ===');
console.log('⚠️ Birim: kare basina CAGRI. GPU suresi DEGIL.');
/**
 * 🔴 GRADIENT SAYISI BU ALETTE SISIRILMIS — TARAYICIYA TASIMA.
 *
 * Olculdu (2026-09-08, yigin izli teshis): d60'ta 14 gradient'in 10'u
 * `drawOrbits`in NODE YEDEK YOLUNDAN geliyor. Tarayicida `glowSprite`
 * (render.ts:499) yorungeyi ton+yaricap basina bir kez pisiriyor ve
 * kare basina SIFIR gradient tahsis ediyor; burada `document` olmadigi
 * icin `glowSprite` null donuyor ve yedek dal calisiyor.
 *
 * TARAYICIDAKI GERCEK: sis 2 + aura 1 + vinyet 1 = kare basina ~4.
 * `perf.test.mts`in tavani 12 — yani gradient tahsisi bir sorun DEGIL.
 * Bu satiri okumadan "15 gradient var" diye is planlama; bir kez planlandi
 * ve olcum plani curuttu.
 */
console.log('🔴 GRADIENT sayisi SISIK: 10/kare drawOrbits NODE yedek yolu.');
console.log('   Tarayicida glowSprite pisiriyor → gercek ~4/kare. Detay: dosya basligi.');
console.log('⚠️ `toplam` agirlikli: gradient tahsisi bir path cagrisindan cok');
console.log('   daha pahali oldugu icin x8 sayiliyor (kaba ama tutarli olcek).\n');

for (const d of [1, 20, 60]) {
  const g = sahne('gfx' + d, d, 14);
  const tam = is(g);
  console.log(`d${String(d).padStart(2)}  ${g.enemies.length} dusman · ${g.projectiles.length} mermi · `
    + `${g.gems.length} mucevher · ${g.weapons.length} silah · ${g.passives.length} pasif`);
  console.log(`     TAM: ${Math.round(tam.path)} path · ${tam.gradient.toFixed(1)} gradient · `
    + `${Math.round(tam.saveRestore)} save/restore · ${Math.round(tam.text)} text`);
  console.log(`     DOLGU ALANI: ${tam.fillArea.toFixed(2)} ekran/kare `
    + `(sadece fillRect — blit ve gradient dahil DEGIL)`);

  // ── ABLASYONLAR ── her biri sahnenin bir sistemini bosaltir
  const kollar: [string, () => void][] = [
    ['dusmanlar', () => { g.enemies.length = 0; }],
    ['mermiler', () => { g.projectiles.length = 0; }],
    ['mucevherler', () => { g.gems.length = 0; }],
  ];
  for (const [ad, bosalt] of kollar) {
    // ⚠️ SAHNE KOPYALANMIYOR, SIRAYLA BOSALTILIYOR: her satir bir ONCEKININ
    // uzerine biniyor. Bu bilincli — tek tek olcup toplarsak ortusen
    // maliyetler iki kez sayilir.
    const once = is(g).toplam;
    bosalt();
    const sonra = is(g).toplam;
    const pay = once > 0 ? ((once - sonra) / once) * 100 : 0;
    console.log(`     -${ad.padEnd(12)} ${Math.round(once)} -> ${Math.round(sonra)} `
      + `(bu katmanin payi %${pay.toFixed(0)})`);
  }
  const kalan = is(g);
  console.log(`     KALAN (zemin+isik+HUD+oyuncu): ${Math.round(kalan.toplam)} `
    + `· ${kalan.gradient.toFixed(1)} gradient\n`);
}
