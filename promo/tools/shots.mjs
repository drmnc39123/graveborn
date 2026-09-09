// PANEL FOTOĞRAFLARI — köyün kapılarının ardındaki gerçek ekranlar.
//
// 🔴 NİYE EKRAN GÖRÜNTÜSÜ, YENİDEN ÇİZİM DEĞİL: tanıtımda gösterilen Forge
// ekranı OYUNUN Forge ekranı olmalı. Videoya özel yeniden çizilmiş bir panel,
// oyun değişince yalan söylemeye başlar ve zaten dürüst de değildir.
//
// ⚠️ `?panel=<id>` DEPODA ZATEN VARDI (`app/play/page.tsx`, geliştirme
// kancası): köyde yürüyerek kapıya varmak `requestAnimationFrame`e bağlı ve
// başsız tarayıcıda güvenilmez. Yeni bir kapı açmadım, var olanı kullandım.
//
// ⚠️ `?test=1` OLMADAN yarısı "cüzdan bağla" ekranı gösterir — panelin
// kendisi değil. Test modu üretimde derlenmiyor (bkz. `lib/testMode.ts`).

import { chromium } from 'playwright-core';
import { existsSync, mkdirSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { TANITIM_KAYDI, KAYIT_ANAHTARI } from './demoSave.mjs';

const KOK = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DEV = process.env.GB_DEV || 'http://localhost:3200';
const CIKTI = join(KOK, 'public', 'shots');

const CHROME_ADAYLARI = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
];

/** Videoda geçen kapılar — köy haritasındaki `markers` ile aynı adlar. */
const PANELLER = [
  ['upgrade', 'The Forge'],
  ['pets', 'The Binding'],
  ['gear', 'Your Gear'],
  ['paths', 'Your Paths'],
  ['reliquary', 'The Reliquary'],
  ['market', 'Market Hall'],
  ['guild', 'The Guilds'],
  ['boss', 'World Boss'],
  ['duel', 'The Answering'],
  ['tavern', 'The Rest — records'],
  ['quests', 'Stage select'],
  ['daily', 'Daily'],
  ['shop', "Pedlar's Stall"],
  ['codex', 'The Codex'],
  ['watch', 'The Watch'],
  ['vigil', 'The Vigil'],
];

const exe = CHROME_ADAYLARI.find((c) => existsSync(c));
if (!exe) { console.error('Chrome yok'); process.exit(1); }
mkdirSync(CIKTI, { recursive: true });

const istenen = process.argv.slice(2);
const liste = istenen.length ? PANELLER.filter(([id]) => istenen.includes(id)) : PANELLER;

const browser = await chromium.launch({ executablePath: exe, headless: true });
const page = await browser.newPage({
  viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1,
});
page.on('pageerror', (e) => console.log('  [sayfa hatası]', e.message));

/**
 * 🔴 OTURUM DÜĞMEYE TIKLAYARAK DEĞİL, `addInitScript` İLE KURULUYOR —
 * VE BU İKİ KEZ ÖLÇÜLDÜ.
 *
 * (1) `?test=1&panel=upgrade` ile doğrudan gidince Forge DEĞİL, "CONNECT
 *     WALLET / PLAY DEMO" ekranı çıkıyor: `?test=1` panelin KİLİDİNİ açıyor
 *     ama oyuncuya bir MOD vermiyor ve kabuk mod yokken köyü hiç kurmuyor.
 * (2) Bunu "PLAY DEMO"ya tıklayarak çözdüm, üç panelde çalıştı — sonra tam
 *     turda dev sunucusu derleme yaparken 2,5 sn'lik bekleme yetmedi,
 *     `getByText(...).count()` 0 döndü, tıklama SESSİZCE atlandı ve
 *     ON ALTI FOTOĞRAFIN ON ALTISI da karşılama ekranı oldu — betik yine de
 *     on altı kez "✓" yazdı. Aleti başarılı görünürken yanlış iş yaparken
 *     yakalamak bu depoda tekrar eden hata sınıfı.
 *
 * `addInitScript` her gezinmede, sayfa betiği ÇALIŞMADAN ÖNCE koşuyor:
 * zamanlamaya bağlı hiçbir yeri kalmıyor.
 *
 * ⚠️ DEMO MODU: demo'nun kuralı sıfır backend çağrısı — bu betik hiçbir
 * hesaba, hiçbir ekonomiye dokunmuyor.
 */
await page.addInitScript(([modK, kayitK, kayit]) => {
  try {
    localStorage.setItem(modK, 'demo');
    localStorage.setItem(kayitK, JSON.stringify(kayit));
  } catch { /* özel pencere — sessiz geç */ }
}, ['graveborn:mode', KAYIT_ANAHTARI, TANITIM_KAYDI]);

let hata = 0;

for (const [id, ad] of liste) {
  await page.goto(`${DEV}/play?test=1&panel=${id}`, { waitUntil: 'domcontentloaded' });
  // ⚠️ İKİ AŞAMALI BEKLEME. `networkidle` tek başına YETMİYOR: köyün zemini
  // ve panel çerçevesi (dokuz-dilim PNG) ağ boşaldıktan sonra da birkaç
  // kare çiziliyor — erken çekilen kare siyah kutulu çıkardı.
  await page.waitForLoadState('networkidle').catch(() => {});
  await page.waitForTimeout(3500);

  /**
   * 🔴 FOTOĞRAFIN GERÇEKTEN PANEL OLDUĞU DOĞRULANIYOR.
   * Yukarıdaki (2) numaralı hata tam olarak bu kontrol olmadığı için
   * fark edilmedi. "Kaydettim" demek, "doğrusunu kaydettim" demek değil.
   */
  const govde = (await page.textContent('body').catch(() => '')) || '';
  if (govde.includes('CONNECT WALLET')) {
    console.log('✗', id, '— PANEL DEĞİL, karşılama ekranı yakalandı');
    hata += 1;
    continue;
  }
  await page.screenshot({ path: join(CIKTI, id + '.png') });
  console.log('✓', id, '·', ad);
}

/**
 * THE PIT — bu bir panel DEĞİL, tam ekran. `hedefiAc('pit')` paneli kapatıp
 * `setScreen({kind:'arena'})` çağırıyor, o yüzden `?panel=pit` çalışmaz;
 * aynı geliştirme kancasının ikinci ucu (`__gb.screen`) kullanılıyor.
 */
if (!istenen.length || istenen.includes('pit')) {
  await page.goto(`${DEV}/play?test=1`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(3000);
  await page.evaluate(() => {
    const w = window;
    if (w.__gb && w.__gb.screen) w.__gb.screen({ kind: 'arena' });
  });
  await page.waitForTimeout(3000);
  await page.screenshot({ path: join(CIKTI, 'pit.png') });
  console.log('✓ pit · The Pit (arena)');
}

await browser.close();
if (hata) { console.error(`${hata} panel yakalanamadı`); process.exit(1); }
console.log('bitti →', CIKTI);
