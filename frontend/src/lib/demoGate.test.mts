// DEMO İZOLASYON MÜHRÜ — "cüzdanlı oturum mu?" sorusunun TEK cevabı.
//
// 🔴 NİYE VAR (kullanıcı bildirimi): *"Oyunda demo moduna girip
// tıkladığımda nickname koymamı istiyor, fakat nick seçerken 'cüzdan
// bağlayın' diyor. Cüzdan bağlamak isteseydim zaten bağlardım, demoda bu
// olmamalı."*
//
// SEBEP ÖLÇÜLDÜ, tarayıcıda birebir üretildi: aynı soruya İKİ AYRI yerde
// İKİ AYRI cevap veriliyordu —
//     gameSession.isWallet()  → getMode() === 'wallet'    (doğru)
//     app/play/page.tsx       → getWallet() dolu mu        (yanlış)
// `setMode('demo')` `graveborn:wallet` anahtarını SİLMİYOR. Bir kez cüzdan
// bağlamış oyuncu "PLAY DEMO" derse anahtar yerinde kalıyor, kabuk
// "cüzdanım var" sanıp KAPATILAMAYAN ad penceresini açıyor, ad ucu doğru
// davranıp reddediyor ve oyuncu oyuna hiç giremiyor.
//
// ⚠️ BU MÜHÜR DAVRANIŞI ÖLÇÜYOR, YORUMU DEĞİL. Bu depoda mühürlerin kendi
// dokümantasyonuyla eşleşip yeşil kalması ÜÇ KEZ yaşandı; o yüzden [1-3]
// fonksiyonu gerçekten çağırıyor, [4-5] ise kaynağı YORUMLARI SÖKEREK
// tarıyor.
//
//   cd frontend && npx tsx src/lib/demoGate.test.mts

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const FAIL: string[] = [];
const check = (n: string, ok: boolean, d = '') => {
  console.log(`${ok ? '  ✓' : '  ✗'} ${n}${d ? ` — ${d}` : ''}`);
  if (!ok) FAIL.push(n);
};

// ── SAHTE TARAYICI ──
// ⚠️ İÇE AKTARMADAN ÖNCE kurulmalı: `session.ts` `typeof window` kontrolüyle
// erken dönüyor ve modül bir kez yüklendikten sonra global eklemek geç kalır.
const kutu = new Map<string, string>();
(globalThis as unknown as { window: unknown }).window = {
  localStorage: {
    getItem: (k: string) => kutu.get(k) ?? null,
    setItem: (k: string, v: string) => { kutu.set(k, v); },
    removeItem: (k: string) => { kutu.delete(k); },
  },
};

const { getWallet, setMode } = await import('./session.js');

const ADRES = '3STD6cr9TjgLPX28YU3KbeGMSnswtt3143eeYdL4hRD8';

console.log('\n── [1-3] getWallet() moda bağlı mı ──');
{
  // Sahnenin tamamı: oyuncu ÖNCE cüzdan bağlamış, SONRA demoya geçmiş.
  kutu.set('graveborn:wallet', ADRES);
  setMode('wallet');
  check('cüzdan modunda adres dönüyor (KONTROL GRUBU)', getWallet() === ADRES, String(getWallet()));

  setMode('demo');
  check('demo modunda null — anahtar dolu olsa bile', getWallet() === null,
    `anahtar hâlâ: ${kutu.get('graveborn:wallet')?.slice(0, 6)}…`);

  kutu.delete('graveborn:mode');
  check('mod seçilmemişken de null', getWallet() === null);

  // ⚠️ ANAHTARIN SİLİNMEDİĞİ de mühürlü: silmek `walletId`yi de anlamsız
  // kılardı ve SOL ödemesinde cüzdanı yeniden bulmak buna bağlı.
  check('anahtar SİLİNMİYOR, yalnız görmezden geliniyor',
    kutu.get('graveborn:wallet') === ADRES);
}

// ── KAYNAK TARAMASI ──
const KOK = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const oku = (p: string) => readFileSync(join(KOK, p), 'utf8');
/** ⚠️ Yorumlar SÖKÜLÜYOR: mühür kodu ölçmeli, kodu anlatan cümleyi değil. */
const yorumsuz = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

console.log('\n── [4] kapatılamayan pencerenin kendi kapısı ──');
{
  const src = yorumsuz(oku('components/NameGate.tsx'));
  check('NameGate cüzdan modu değilse hiç çizmiyor',
    /getMode\(\)\s*!==\s*'wallet'/.test(src) && /return null/.test(src));
}

console.log('\n── [5] kabukta İKİNCİ bir "cüzdanım var mı" tanımı yok ──');
{
  // Ad kapısının koşulu `wallet` durumundan geliyor, o da `getWallet()`ten.
  // Yasak olan: sayfanın anahtarı KENDİ okuması ya da modu kendi yorumlaması.
  const src = yorumsuz(oku('app/play/page.tsx'));
  check('play sayfası `graveborn:wallet`i doğrudan okumuyor',
    !/graveborn:wallet/.test(src));
  check('ad kapısı hâlâ `wallet` + adsızlık koşuluyla açılıyor',
    /wallet\s*&&\s*progress\?\.name\s*===\s*null/.test(src));
}

console.log(`\n${FAIL.length === 0 ? '✅ DEMO İZOLASYONU SAĞLAM' : `❌ ${FAIL.length} BAŞARISIZ: ${FAIL.join(', ')}`}\n`);
process.exit(FAIL.length === 0 ? 0 : 1);
