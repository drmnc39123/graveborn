// YAKALAMA SÜRÜCÜSÜ — `/capture` sayfasını başsız Chrome'da sırayla koşturur.
//
// 🔴 NİYE PLAYWRIGHT: sahneler dakikalar sürüyor ve on bir tane var. Elle
// sekme açıp beklemek hem yavaş hem tekrar üretilemez; burada sahne listesi
// KOD, yani video bir daha aynı komutla üretilebiliyor.
//
// ⚠️ TARAYICI İNDİRİLMİYOR. `playwright-core` + makinede kurulu Chrome.
// Playwright'in kendi Chromium'unu indirmek 150 MB ve gereksiz.
//
// ⚠️ `--disable-lcd-text` / ölçek 1: kanvas zaten kendi `scale`ini
// uyguluyor, cihaz piksel oranı karışırsa kare boyutu sahneden sahneye
// değişir ve Remotion tarafında hizasızlık çıkar.
//
// Kullanım:  node tools/capture.mjs [sahneAdı ...]   (boşsa hepsi)

import { chromium } from 'playwright-core';
import { existsSync, readdirSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const KOK = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DEV = process.env.GB_DEV || 'http://localhost:3200';

const CHROME_ADAYLARI = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
];

/**
 * SAHNE LİSTESİ — videonun ham malzemesi.
 *
 * ⚠️ `warm` SİMÜLASYON SANİYESİ, gerçek saniye değil: ekranda sürü
 * toplanmış, silahlar seviye atlamış bir an yakalamak için. 0 ısınmayla
 * çekilen kare BOŞ BİR ZEMİN olurdu (`HomeAttract` aynı dersi yazıyor).
 *
 * ⚠️ Kahramanlar ve bölümler BİLEREK dağıtıldı: dördü de görünsün, palet
 * de sahneden sahneye değişsin (bölüm 3 ile 22 aynı renkte değil).
 */
const SAHNELER = [
  // ── açılış: kalabalık ama okunur
  { scene: 'fight_open', stage: 3, hero: 'knight', seed: 'gb-open', warm: 110, frames: 120 },
  // ── sürü: build oturmuş, ekran dolu
  { scene: 'fight_horde', stage: 12, hero: 'knight', seed: 'gb-horde', warm: 260, frames: 130 },
  // ── derin bölüm: başka palet, başka düşman
  { scene: 'fight_deep', stage: 22, hero: 'bladekeeper', seed: 'gb-deep', warm: 300, frames: 120 },
  // ── kahraman vitrini
  { scene: 'hero_ranger', stage: 8, hero: 'ranger', seed: 'gb-rng', warm: 170, frames: 100 },
  { scene: 'hero_priestess', stage: 17, hero: 'priestess', seed: 'gb-prs', warm: 210, frames: 100 },
  { scene: 'hero_knight', stage: 20, hero: 'knight', seed: 'gb-kn', warm: 230, frames: 100 },
  // ── boss: sürü temizlenene kadar sürülüyor (until=boss)
  { scene: 'boss_a', stage: 5, hero: 'knight', seed: 'gb-boss1', warm: 60, frames: 150, until: 'boss' },
  { scene: 'boss_b', stage: 14, hero: 'priestess', seed: 'gb-boss2', warm: 90, frames: 130, until: 'boss' },
  // ── THE DESCENT: merdiven modu, derinden başlıyor
  { scene: 'descent', stage: 6, hero: 'bladekeeper', seed: 'gb-desc', warm: 240, frames: 130,
    mode: 'descent', depth: 22 },
  // ── köy: iki farklı kamera yolu
  { scene: 'village_a', kind: 'village', frames: 170, x0: 750, y0: 780, x1: 1450, y1: 1250, t0: 26 },
  { scene: 'village_b', kind: 'village', frames: 150, x0: 1500, y0: 430, x1: 2200, y1: 980, t0: 62 },
  // ── müzik: oyunun kendi prosedürel müziği, gerçek zamanlı kaydediliyor
  { scene: 'music', kind: 'music', secs: 73, frames: 0 },
];

function url(s) {
  const p = new URLSearchParams({
    scene: s.scene,
    kind: s.kind || 'run',
    frames: String(s.frames),
    fps: String(s.fps || 30),
    vw: '960', vh: '540', scale: '2',
  });
  if ((s.kind || 'run') === 'run') {
    p.set('stage', String(s.stage));
    p.set('hero', s.hero);
    p.set('seed', s.seed);
    p.set('warm', String(s.warm));
    if (s.until) p.set('until', s.until);
    if (s.mode) p.set('mode', s.mode);
    if (s.depth) p.set('depth', String(s.depth));
  } else if (s.kind === 'music') {
    p.set('secs', String(s.secs));
  } else {
    for (const k of ['x0', 'y0', 'x1', 'y1', 't0']) if (s[k] != null) p.set(k, String(s[k]));
  }
  return DEV + '/capture?' + p.toString();
}

const exe = CHROME_ADAYLARI.find((c) => existsSync(c));
if (!exe) { console.error('Chrome bulunamadı'); process.exit(1); }

const istenen = process.argv.slice(2);
// ⚠️ Duman testi için: GB_FRAMES=6 GB_WARM=10 → boru hattı tamamı 20 saniyede
// doğrulanır. Tam turu başlatmadan önce her seferinde bu koşuluyor.
for (const s of SAHNELER) {
  if (process.env.GB_FRAMES) s.frames = Number(process.env.GB_FRAMES);
  if (process.env.GB_WARM) { s.warm = Number(process.env.GB_WARM); delete s.until; }
}

const liste = istenen.length ? SAHNELER.filter((s) => istenen.includes(s.scene)) : SAHNELER;
if (!liste.length) { console.error('eşleşen sahne yok'); process.exit(1); }

const browser = await chromium.launch({
  executablePath: exe,
  headless: true,
  args: [
    '--disable-gpu-vsync', '--force-device-scale-factor=1',
    '--js-flags=--max-old-space-size=4096',
    // ⚠️ Müzik sahnesi için ŞART: başsız Chrome kullanıcı hareketi olmadan
    // AudioContext'i 'suspended' bırakıyor ve kayıt SESSİZ çıkıyor —
    // üstelik hata vermeden, ki en pahalı hata biçimi bu.
    '--autoplay-policy=no-user-gesture-required',
    '--mute-audio=false',
  ],
});

for (const s of liste) {
  const t0 = Date.now();
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 });
  page.on('pageerror', (e) => console.log('  [sayfa hatası]', e.message));
  console.log('→', s.scene);
  await page.goto(url(s), { waitUntil: 'domcontentloaded' });
  try {
    // ⚠️ TAVAN CÖMERT: boss sahneleri yüz binlerce adım sürüyor ve tek bir
    // erken zaman aşımı sahneyi YARIM bırakır — yarım kare dizisi videoda
    // sessizce donmuş bir plan olarak görünür, en pahalı hata biçimi.
    await page.waitForSelector('#capture-status[data-done="1"]', { timeout: 900000 });
  } catch (e) {
    const d = await page.textContent('#capture-status').catch(() => '?');
    console.log('  ✗ zaman aşımı — durum:', d);
  }
  const dir = join(KOK, 'public', 'frames', s.scene);
  const n = existsSync(dir) ? readdirSync(dir).length : 0;
  console.log(`  ✓ ${n}/${s.frames} kare · ${Math.round((Date.now() - t0) / 1000)}sn`);
  await page.close();
}

await browser.close();
console.log('bitti');
