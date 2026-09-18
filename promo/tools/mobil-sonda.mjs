// MOBİL SONDA — tek bir durumda belirli öğelerin gerçek ölçülerini okur.
// Kullanım: node tools/mobil-sonda.mjs <panelId> [w] [h]
import { chromium } from 'playwright-core';
import { TANITIM_KAYDI, KAYIT_ANAHTARI } from './demoSave.mjs';

const [panel = 'quests', w = '375', h = '560'] = process.argv.slice(2);
const SITE = process.env.GB_DEV || 'http://localhost:3200';
const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
const ctx = await browser.newContext({ viewport: { width: +w, height: +h }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
const page = await ctx.newPage();
await page.goto(SITE + '/', { waitUntil: 'domcontentloaded' });
await page.evaluate(([kk, kayit]) => {
  localStorage.clear();
  localStorage.setItem('graveborn:consent', 'denied');
  localStorage.setItem('graveborn:mode', 'demo');
  localStorage.setItem(kk, JSON.stringify(kayit));
}, [KAYIT_ANAHTARI, TANITIM_KAYDI]);
await page.goto(`${SITE}/play?test=1&panel=${panel}`, { waitUntil: 'domcontentloaded' });
await page.waitForLoadState('networkidle').catch(() => {});
await page.waitForTimeout(3500);

const o = await page.evaluate(() => {
  const out = { innerH: innerHeight, innerW: innerWidth, vh100: null, adaylar: [] };
  const t = document.createElement('div');
  t.style.height = '100vh'; t.style.position = 'absolute'; document.body.appendChild(t);
  out.vh100 = t.getBoundingClientRect().height; t.remove();
  for (const el of document.querySelectorAll('div')) {
    const mh = el.style.maxHeight;
    if (!mh || !mh.includes('calc')) continue;
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    out.adaylar.push({
      maxHeightStil: mh, maxHeightHesap: cs.maxHeight, overflowY: cs.overflowY, display: cs.display,
      top: Math.round(r.top), bottom: Math.round(r.bottom), height: Math.round(r.height),
      scrollHeight: el.scrollHeight, clientHeight: el.clientHeight,
      cocuk: [...el.children].map((c) => {
        const cr = c.getBoundingClientRect();
        return { tag: c.tagName, h: Math.round(cr.height), pos: getComputedStyle(c).position, top: Math.round(cr.top), bottom: Math.round(cr.bottom) };
      }),
      ebeveyn: (() => { const p = el.parentElement; const pr = p.getBoundingClientRect(); return { top: Math.round(pr.top), bottom: Math.round(pr.bottom), pad: getComputedStyle(p).paddingTop, overflowY: getComputedStyle(p).overflowY, alignItems: getComputedStyle(p).alignItems }; })(),
    });
  }
  return out;
});
console.log(JSON.stringify(o, null, 2));
await browser.close();
