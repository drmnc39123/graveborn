// MOBİL DENETİM — Phantom içi tarayıcı görüş alanlarında her ekranı ölçer.
//
// 🔴 NİYE VAR (kullanıcı, 2026-09-18): *"Oyun içinde mobilde çok hata var diye
// düşünüyorum, çoğu şey üst üste biniyor. Tüm mobil uyumluluğu kontrol edelim…
// Phantom app browser'a göre mobil uyumluluk önemli."*
//
// ⚠️ GÖZLE DEĞİL ÖLÇEREK: her durumda dört şey sayılıyor —
//   1. TAŞMA     — ekranın dışına çıkan dokunulabilir öğe (kaydırılabilir bir
//                  kabın içindeyse sayılmaz: orada kasıtlı)
//   2. ÇAKIŞMA   — birbirinin üstüne binen dokunulabilir öğeler, ve birbirinin
//                  üstüne binen HUD kutuları
//   3. KESİLME   — ellipsis OLMADAN kırpılan yazı (ellipsis kasıtlıdır —
//                  mobil turu dersi)
//   4. DOKUNMA   — 32 px'ten küçük dokunma alanı
//
// ⚠️ GÖRÜŞ ALANLARI PHANTOM'UN ARAÇ ÇUBUKLARI DÜŞÜLEREK: Phantom'un üstte
// adres çubuğu, altta gezinme çubuğu var; sayfanın gördüğü yükseklik cihazın
// ekranından ~100-140 px kısa. Cihaz boyutuyla ölçmek, gerçek oyuncunun
// göremediği alanı "sığıyor" sayardı.
//
// Çalıştır:  node tools/mobil-denetim.mjs            (hepsi)
//            node tools/mobil-denetim.mjs se hub      (süzgeç: cihaz / durum)

import { chromium } from 'playwright-core';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { TANITIM_KAYDI, KAYIT_ANAHTARI } from './demoSave.mjs';

const KOK = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SITE = process.env.GB_DEV || 'http://localhost:3200';
const CIKTI = join(KOK, 'out', 'mobil');
const CHROME = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
].find((c) => existsSync(c));
if (!CHROME) { console.error('Chrome yok'); process.exit(1); }

const IOS_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Phantom/ios';
const ANDROID_UA = 'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36 Phantom/android';

/** Görüş alanı = cihaz ekranı − Phantom'un üst ve alt çubukları */
const CIHAZLAR = [
  { ad: 'se', etiket: 'iPhone SE · Phantom', w: 375, h: 560, ua: IOS_UA },
  { ad: 'i14', etiket: 'iPhone 14 · Phantom', w: 390, h: 700, ua: IOS_UA },
  { ad: 'a360', etiket: 'Android 360 · Phantom', w: 360, h: 640, ua: ANDROID_UA },
  { ad: 'pixel', etiket: 'Pixel 7 · Phantom', w: 412, h: 780, ua: ANDROID_UA },
  { ad: 'yatay', etiket: 'iPhone 14 yatay · Phantom', w: 780, h: 340, ua: IOS_UA },
];

const PANELLER = [
  'quests', 'upgrade', 'pets', 'gear', 'paths', 'reliquary', 'market', 'guild',
  'boss', 'duel', 'tavern', 'leaderboard', 'daily', 'shop', 'codex', 'watch',
  'vigil', 'friends', 'invite', 'settings',
];

const suzgec = process.argv.slice(2);
const cihazlar = CIHAZLAR.filter((c) => !suzgec.length || suzgec.includes(c.ad) || !CIHAZLAR.some((x) => suzgec.includes(x.ad)));
const durumIstendi = (ad) => {
  const durumSuzgeci = suzgec.filter((s) => !CIHAZLAR.some((c) => c.ad === s));
  return !durumSuzgeci.length || durumSuzgeci.some((s) => ad.startsWith(s));
};

/** Sayfa içinde koşan ölçüm — saf DOM, çerçeveden bağımsız */
function olc() {
  const W = innerWidth, H = innerHeight;
  const gorunur = (el) => {
    const cs = getComputedStyle(el);
    if (cs.visibility === 'hidden' || cs.display === 'none' || Number(cs.opacity) === 0) return false;
    const r = el.getBoundingClientRect();
    return r.width > 1 && r.height > 1;
  };
  const etiket = (el) => {
    const a = el.getAttribute('aria-label') || el.getAttribute('title');
    const t = (el.innerText || el.value || '').trim().replace(/\s+/g, ' ');
    return (a || t || el.tagName.toLowerCase()).slice(0, 34);
  };
  /** Öğe, kendini kırpan/kaydıran bir atanın içinde mi */
  const kirpanAta = (el, eksen) => {
    let p = el.parentElement;
    while (p && p !== document.body) {
      const cs = getComputedStyle(p);
      const o = eksen === 'x' ? cs.overflowX : cs.overflowY;
      if (o === 'auto' || o === 'scroll' || o === 'hidden' || o === 'clip') return p;
      p = p.parentElement;
    }
    return null;
  };
  const kesisim = (a, b) => {
    const x = Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left));
    const y = Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
    return x * y;
  };
  /** Üstte gerçekten bu öğe mi var — başka bir katmanın altında kalmış öğeleri ele */
  const ustte = (el) => {
    const r = el.getBoundingClientRect();
    const x = Math.min(W - 1, Math.max(0, r.left + r.width / 2));
    const y = Math.min(H - 1, Math.max(0, r.top + r.height / 2));
    const e = document.elementFromPoint(x, y);
    return !!e && (e === el || el.contains(e) || e.contains(el));
  };

  const dokunulur = [...document.querySelectorAll('button, a[href], input, textarea, select, [role="button"], [role="tab"]')]
    .filter(gorunur);

  // 1) TAŞMA
  const tasma = [];
  for (const el of dokunulur) {
    const r = el.getBoundingClientRect();
    const disari = r.right > W + 1 || r.left < -1 || r.bottom > H + 1 || r.top < -1;
    if (!disari) continue;
    const eksen = (r.right > W + 1 || r.left < -1) ? 'x' : 'y';
    // Kaydırılabilir bir ata ekranın içindeyse öğeye kaydırarak ulaşılır.
    // ⚠️ İLK kırpan atada DURMA: kartların `overflow: hidden`ı (ölçüldü,
    // Forge 375x560) asıl kaydırma kabını gizliyordu — 163 sahte taşma.
    let ulasilir = false;
    for (let kap = kirpanAta(el, eksen); kap; kap = kirpanAta(kap, eksen)) {
      const cs = getComputedStyle(kap);
      const o = eksen === 'x' ? cs.overflowX : cs.overflowY;
      if (o !== 'auto' && o !== 'scroll') continue;
      const kr = kap.getBoundingClientRect();
      if (kr.right <= W + 1 && kr.left >= -1 && kr.bottom <= H + 1 && kr.top >= -1) { ulasilir = true; break; }
    }
    if (ulasilir) continue;
    tasma.push({ ne: etiket(el), x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height) });
  }

  // 2a) ÇAKIŞAN DOKUNULUR ÖĞELER — biri ötekini içermiyorsa
  const cakisma = [];
  const ust = dokunulur.filter(ustte);
  for (let i = 0; i < ust.length; i++) {
    for (let j = i + 1; j < ust.length; j++) {
      const a = ust[i], b = ust[j];
      if (a.contains(b) || b.contains(a)) continue;
      const k = kesisim(a.getBoundingClientRect(), b.getBoundingClientRect());
      if (k > 24) cakisma.push({ a: etiket(a), b: etiket(b), alan: Math.round(k) });
    }
  }

  // 2b) HUD KUTULARI — konumlanmış, ekranın %60'ından küçük, en dış kutular
  const kutular = [...document.querySelectorAll('body *')].filter((el) => {
    const cs = getComputedStyle(el);
    if (cs.position !== 'absolute' && cs.position !== 'fixed') return false;
    if (el.tagName === 'CANVAS' || el.tagName === 'svg' || el.closest('svg')) return false;
    if (!gorunur(el) || cs.pointerEvents === 'none') return false;
    const r = el.getBoundingClientRect();
    const alan = r.width * r.height;
    if (alan < 600 || alan > W * H * 0.6) return false;
    return !!(el.innerText || '').trim() || el.querySelector('button, img, canvas');
  });
  const disKutular = kutular.filter((el) => !kutular.some((o) => o !== el && o.contains(el)));
  const hud = [];
  for (let i = 0; i < disKutular.length; i++) {
    for (let j = i + 1; j < disKutular.length; j++) {
      const a = disKutular[i], b = disKutular[j];
      const k = kesisim(a.getBoundingClientRect(), b.getBoundingClientRect());
      if (k > 150) hud.push({ a: etiket(a), b: etiket(b), alan: Math.round(k) });
    }
  }

  // 3) KESİLEN YAZI — ellipsis DEĞİLSE
  const kesilme = [];
  for (const el of document.querySelectorAll('body *')) {
    if (!gorunur(el) || el.children.length > 0) continue;
    const t = (el.textContent || '').trim();
    if (t.length < 2) continue;
    const cs = getComputedStyle(el);
    if (cs.textOverflow === 'ellipsis') continue;
    if (cs.overflow !== 'hidden' && cs.overflowX !== 'hidden') continue;
    if (el.scrollWidth > el.clientWidth + 1) kesilme.push({ ne: t.slice(0, 34), fark: el.scrollWidth - el.clientWidth });
  }

  // 4) KÜÇÜK DOKUNMA ALANI
  const kucuk = dokunulur.filter(ustte).map((el) => {
    const r = el.getBoundingClientRect();
    return { ne: etiket(el), w: Math.round(r.width), h: Math.round(r.height) };
  }).filter((d) => d.w < 32 || d.h < 32);

  return {
    W, H,
    sayfaYatayTasma: Math.max(0, document.documentElement.scrollWidth - W),
    tasma, cakisma, hud, kesilme, kucuk,
    govde: (document.body.innerText || '').slice(0, 200),
  };
}

const browser = await chromium.launch({ executablePath: CHROME, headless: true });
const sonuc = [];

for (const c of cihazlar) {
  mkdirSync(join(CIKTI, c.ad), { recursive: true });
  const ctx = await browser.newContext({
    viewport: { width: c.w, height: c.h }, deviceScaleFactor: 2,
    isMobile: true, hasTouch: true, userAgent: c.ua,
  });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => sonuc.push({ cihaz: c.ad, durum: 'SAYFA HATASI', hata: e.message.slice(0, 200) }));

  /** Durum hazırla → ölç → kaydet */
  const durum = async (ad, hazirla) => {
    if (!durumIstendi(ad)) return;
    try {
      await hazirla();
      const o = await page.evaluate(olc);
      await page.screenshot({ path: join(CIKTI, c.ad, ad + '.png') });
      sonuc.push({ cihaz: c.ad, durum: ad, ...o });
      const sorun = o.tasma.length + o.cakisma.length + o.hud.length + o.kesilme.length;
      console.log(`${sorun ? '✗' : '✓'} ${c.ad.padEnd(6)} ${ad.padEnd(22)} taşma ${o.tasma.length} · çakışma ${o.cakisma.length} · hud ${o.hud.length} · kesilme ${o.kesilme.length} · küçük ${o.kucuk.length}${o.sayfaYatayTasma ? ` · SAYFA YATAY ${o.sayfaYatayTasma}px` : ''}`);
    } catch (e) {
      console.log(`! ${c.ad} ${ad} — ${e.message.slice(0, 120)}`);
      sonuc.push({ cihaz: c.ad, durum: ad, hata: e.message.slice(0, 300) });
    }
  };

  const git = async (url, kayit) => {
    await ctx.clearCookies();
    await page.goto(SITE + '/', { waitUntil: 'domcontentloaded' });
    await page.evaluate(([k, kayitVeri, kk]) => {
      localStorage.clear();
      localStorage.setItem('graveborn:consent', 'denied');
      if (kayitVeri !== null) {
        localStorage.setItem('graveborn:mode', 'demo');
        if (kayitVeri) localStorage.setItem(kk, JSON.stringify(kayitVeri));
      }
    }, [null, kayit === undefined ? null : kayit, KAYIT_ANAHTARI]);
    await page.goto(SITE + url, { waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('networkidle').catch(() => {});
    await page.waitForTimeout(3500);
  };

  // ── Ana sayfa ──
  await durum('home', () => git('/', undefined));

  // ── Köy: yeni oyuncu (FirstRun kartı) ve tanıtım kaydıyla dolu köy ──
  await durum('hub-yeni', () => git('/play', false));
  await durum('hub-dolu', () => git('/play?test=1', TANITIM_KAYDI));

  // ── Paneller ──
  for (const id of PANELLER) {
    await durum('panel-' + id, () => git(`/play?test=1&panel=${id}`, TANITIM_KAYDI));
  }

  // ── Koşu: yeni oyuncunun ilk koşusu (FirstRun düğmesi) ──
  await durum('kosu', async () => {
    await git('/play', false);
    // FirstRun kartının düğmesi "GO" (ölçüldü: ilk sürüm başka kelimeler arıyordu)
    const dugme = page.getByRole('button', { name: 'GO', exact: true }).first();
    await dugme.click({ timeout: 5000 });
    await page.waitForTimeout(5000);
  });
  await durum('kosu-seviye', async () => {
    // Koşu sürüyor: seviye atlama kartını bekle (en çok 45 sn)
    await page.waitForFunction(() => document.body.innerText.includes('CHOOSE WHAT YOU BECOME'), null, { timeout: 20000 });
    await page.waitForTimeout(800);
  });

  // ── The Pit (arena ekranı) ──
  await durum('arena', async () => {
    await git('/play?test=1', TANITIM_KAYDI);
    await page.evaluate(() => window.__gb && window.__gb.screen && window.__gb.screen({ kind: 'arena' }));
    await page.waitForTimeout(2500);
  });

  // ── Codex sayfası ──
  await durum('codex-sayfa', () => git('/codex', undefined));

  await ctx.close();
}

await browser.close();
writeFileSync(join(CIKTI, 'sonuc.json'), JSON.stringify(sonuc, null, 2));
console.log(`\nsonuç: ${join(CIKTI, 'sonuc.json')}`);
