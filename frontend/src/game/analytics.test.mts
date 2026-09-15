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
import {
  GA_ALAN, GA_ID, ONAY_BOLGELERI, bantGosterilmeli, izinliYol, olculmeli, onayKomutlari, secimOku,
} from '../lib/analytics.js';

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

console.log('\n── [5] çerez onayı (Consent Mode v2) ──');
{
  // Davranış: komut dizisi gerçekten üretiliyor ve ölçülüyor
  const bos = onayKomutlari(null);
  const satirlar = bos.split('\n');
  check('iki varsayılan komut, seçim yoksa güncelleme YOK', satirlar.length === 2 && !/'update'/.test(bos));
  check('bölgesel varsayılan: analitik REDDEDİLMİŞ', /analytics_storage:'denied'.*region:\[/.test(satirlar[0]));
  check('genel varsayılan: analitik açık, bölge yok', /analytics_storage:'granted'/.test(satirlar[1]) && !/region/.test(satirlar[1]));
  check('reklam depolaması HER İKİ varsayılanda kapalı',
    satirlar.every((s) => /ad_storage:'denied'/.test(s) && /ad_user_data:'denied'/.test(s) && /ad_personalization:'denied'/.test(s)));
  for (const b of ['DE', 'FR', 'NL', 'NO', 'GB', 'CH', 'TR']) {
    check(`onay bölgesinde: ${b}`, ONAY_BOLGELERI.includes(b) && satirlar[0].includes(`'${b}'`));
  }
  check('AB-27 + AEA-3 + GB/CH/TR = 33 ülke', ONAY_BOLGELERI.length === 33 && new Set(ONAY_BOLGELERI).size === 33,
    `${ONAY_BOLGELERI.length}`);
  check('kabul edildiyse güncelleme granted', /'update',\{analytics_storage:'granted'\}/.test(onayKomutlari('granted')));
  check('reddedildiyse güncelleme denied', /'update',\{analytics_storage:'denied'\}/.test(onayKomutlari('denied')));

  check('saklı seçim doğrulanıyor', secimOku('granted') === 'granted' && secimOku('denied') === 'denied'
    && secimOku('yes') === null && secimOku(null) === null && secimOku('') === null);

  const iyi = { hostname: GA_ALAN, yol: '/', secim: null };
  check('bant: kanonik alan + izinli yol + seçim yok → görünür (KONTROL)', bantGosterilmeli(iyi));
  check('bant: seçim yapılmışsa görünmez', !bantGosterilmeli({ ...iyi, secim: 'denied' }));
  check('bant: localhost/railway\'de görünmez', !bantGosterilmeli({ ...iyi, hostname: 'localhost' }));
  check('bant: ölçülmeyen sayfada görünmez', !bantGosterilmeli({ ...iyi, yol: '/editor' }));

  // Kaynak: komutlar config'den ÖNCE, etiket betiğe gömülüyor
  const bilesen = yorumsuz(oku('../components/Analytics.tsx'));
  const onay = bilesen.indexOf('onayKomutlari(ilkSecim)');
  const config = bilesen.indexOf("gtag('config'");
  check('onay komutları config\'ten ÖNCE', onay > 0 && config > onay, `${onay} < ${config}`);
  check('seçim okunmadan etiket çizilmiyor', /yukle && ilkSecim !== undefined/.test(bilesen));
  check('seçim ANINDA consent update ediyor', /\('consent', 'update', \{ analytics_storage: secim \}\)/.test(bilesen));
  // ⚠️ Karanlık desen yok: iki düğme aynı bileşen fonksiyonundan, ikisi de <button>
  check('DECLINE ve ACCEPT ikisi de gerçek düğme', /onSec\('denied'\)[^>]*style=\{dugme\(false\)\}/.test(bilesen)
    && /onSec\('granted'\)[^>]*style=\{dugme\(true\)\}/.test(bilesen));
  const ana = yorumsuz(oku('../app/page.tsx'));
  check('ana sayfada onayı geri alma bağlantısı var', /dispatchEvent\(new Event\(ONAY_SIFIRLA_OLAYI\)\)/.test(ana) && /Cookie settings/.test(ana));
  check('bileşen sıfırlama olayını dinliyor', /addEventListener\(ONAY_SIFIRLA_OLAYI/.test(bilesen));
}

console.log(`\n${FAIL.length === 0 ? '✅ ANALİTİK SAĞLAM' : `❌ ${FAIL.length} BAŞARISIZ: ${FAIL.join(', ')}`}\n`);
process.exit(FAIL.length === 0 ? 0 : 1);
