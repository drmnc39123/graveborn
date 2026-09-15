// GOOGLE ANALYTICS MÜHRÜ — ölçüm nerede açılır, nerede açılmaz.
//
// 🔴 NİYE VAR: kullanıcı site trafiğini GA'dan izleyecek. Ölçüm yanlış yerde
// açılırsa rapor YALAN SÖYLER, ve bunu fark etmenin yolu yok:
//   · yerel geliştirme, promo yakalama araçları (Playwright) ve Railway'in
//     `*.up.railway.app` adresi sayılırsa trafik bizim kendi trafiğimizle dolar;
//   · yönetim sayfası sayılırsa sahibinin ziyaretleri trafiği şişirir ve gizli
//     yönetim yolu analitik raporlarına düşer.
//
// ⚠️ DAVRANIŞ ÖLÇÜLÜYOR: [1-2] kuralı gerçekten çağırıyor. [3-4] kaynağı
// YORUMLARI SÖKEREK tarıyor — bu depoda mühürlerin kendi açıklamasıyla
// eşleşip yeşil kalması üç kez yaşandı.
//
//   cd frontend && npx tsx src/game/analytics.test.mts

import { readFileSync } from 'node:fs';
import { GA_ALAN, GA_ID, izinliYol, olculmeli } from '../lib/analytics.js';

const FAIL: string[] = [];
const check = (n: string, ok: boolean, d = '') => {
  console.log(`${ok ? '  ✓' : '  ✗'} ${n}${d ? ` — ${d}` : ''}`);
  if (!ok) FAIL.push(n);
};

const oku = (p: string) => readFileSync(new URL(p, import.meta.url), 'utf8');
const yorumsuz = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

console.log('\n── [1] izin listesi ──');
{
  for (const y of ['/', '/play', '/codex', '/codex/the-run', '/s/ABC123']) {
    check(`ölçülür: ${y}`, izinliYol(y));
  }
  // ⚠️ ÖNEK TUZAĞI: "/play ile başlıyor" diye `/playground` kabul edilmemeli.
  for (const y of ['/gbadmin123', '/editor', '/capture', '/playground', '/sx', '/codexx', '']) {
    check(`ölçülmez: ${JSON.stringify(y)}`, !izinliYol(y));
  }
}

console.log('\n── [2] ortam kapısı ──');
{
  const iyi = { hostname: GA_ALAN, webdriver: false, yol: '/play' };
  check('kanonik alan + izinli sayfa → ölçülür (KONTROL GRUBU)', olculmeli(iyi));
  check('www ölçülmez (zaten çıplak alana yönleniyor)', !olculmeli({ ...iyi, hostname: `www.${GA_ALAN}` }));
  check('Railway adresi ölçülmez', !olculmeli({ ...iyi, hostname: 'l712eilm.up.railway.app' }));
  check('localhost ölçülmez', !olculmeli({ ...iyi, hostname: 'localhost' }));
  check('otomasyon tarayıcısı ölçülmez', !olculmeli({ ...iyi, webdriver: true }));
  check('kanonik alanda da yönetim sayfası ölçülmez', !olculmeli({ ...iyi, yol: '/gbadmin123' }));
}

console.log('\n── [3] kimlik ve etiket ──');
{
  check('ölçüm kimliği doğru', GA_ID === 'G-VGVPBYCVKL', GA_ID);
  const bilesen = yorumsuz(oku('../components/Analytics.tsx'));
  check('next/script kullanılıyor', /from 'next\/script'/.test(bilesen));
  check('iki etiket de afterInteractive',
    (bilesen.match(/strategy="afterInteractive"/g) ?? []).length === 2);
  check('kimlik sabitten geliyor, elle yazılmamış', !/G-[A-Z0-9]{6,}/.test(bilesen));
  check('karar olculmeli() ile veriliyor', /olculmeli\(/.test(bilesen));
  check('izin dışında resmi kapatma bayrağı', /ga-disable-/.test(bilesen));
}

console.log('\n── [4] gizli yönetim yolu istemci paketine girmiyor ──');
{
  // ⚠️ YORUMLAR DAHİL tüm dosya: yorum derlemede silinir ama bu dosyalarda o
  // adın hiç geçmemesi, bir gün koda taşınmasını da imkânsız kılıyor.
  check('lib/analytics.ts yönetim yolunu içermiyor', !/gbadmin/i.test(oku('../lib/analytics.ts')));
  check('Analytics.tsx yönetim yolunu içermiyor', !/gbadmin/i.test(oku('../components/Analytics.tsx')));
  const layout = yorumsuz(oku('../app/layout.tsx'));
  check('layout <Analytics /> çiziyor', /<Analytics \/>/.test(layout));
  check('layout ham googletagmanager etiketi taşımıyor', !/googletagmanager/.test(layout));
}

console.log(`\n${FAIL.length === 0 ? '✅ ANALİTİK SAĞLAM' : `❌ ${FAIL.length} BAŞARISIZ: ${FAIL.join(', ')}`}\n`);
process.exit(FAIL.length === 0 ? 0 : 1);
