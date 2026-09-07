// ADMIN HATA METNİ MÜHRÜ.
//
// 🔴 NİYE VAR: bu metin panel açılmadığında operatörün elindeki TEK ipucu.
// Yanlışsa yanlış yere bakılır — ölçüldü, bir kez tam olarak öyle oldu:
// sunucu ayaktayken 429 alan panel "Sunucuya ulaşılamadı" dedi ve teşhis
// sunucu/DNS/deploy tarafına saptı.
//
//   cd frontend && npx tsx src/lib/adminErrors.test.mts

import { adminHataMetni, oturumDusmeli } from './adminErrors.js';

const FAIL: string[] = [];
const check = (n: string, ok: boolean, d = '') => {
  console.log(`${ok ? '  ✓' : '  ✗'} ${n}${d ? ` — ${d}` : ''}`);
  if (!ok) FAIL.push(n);
};

console.log('\n[1] HER DURUM AYRI CÜMLE');
{
  const kodlar = ['401', '403', '429', '404', '500', '503', '418', ''];
  const metinler = kodlar.map(adminHataMetni);
  // ⚠️ ASIL KURAL: iki farklı sebep aynı cümleye ÇÖKMEMELİ. Eski eşlemenin
  // hatası tam olarak buydu.
  const tekil = new Set(metinler);
  check('farklı kodlar farklı cümle veriyor', tekil.size >= 7, `${tekil.size}/${kodlar.length}`);
  check('hiçbiri boş değil', metinler.every((m) => m.trim().length > 5));
}

console.log('\n[2] ⭐ 429 "ULAŞILAMADI" DEMİYOR');
{
  const m = adminHataMetni('429');
  check('429 hız sınırını anlatıyor', /çok fazla|bekle/i.test(m), m);
  check('429 "ulaşılamadı" demiyor', !/ulaşılamadı/i.test(m), m);
}

console.log('\n[3] SÜRÜM UYUŞMAZLIĞI KENDİNİ SÖYLÜYOR');
{
  const m = adminHataMetni('404');
  check('404 eski backend ihtimalini söylüyor', /eski|dağıtım/i.test(m), m);
}

console.log('\n[4] SUNUCU HATASI vs AĞ HATASI');
{
  check('500 sunucu hatası diyor', /sunucu hatası/i.test(adminHataMetni('500')), adminHataMetni('500'));
  check('503 de sunucu hatası', /sunucu hatası/i.test(adminHataMetni('503')));
  // ⚠️ `fetch` fırlattığında kod sayısal DEĞİL — gerçekten ulaşılamamış demektir.
  check('ağ hatası ulaşılamadı diyor', adminHataMetni('Failed to fetch') === 'Sunucuya ulaşılamadı.');
  check('boş kod ulaşılamadı diyor', adminHataMetni('') === 'Sunucuya ulaşılamadı.');
}

console.log('\n[5] OTURUM SADECE YETKİ HATASINDA DÜŞÜYOR');
{
  check('401 oturumu düşürüyor', oturumDusmeli('401'));
  check('403 oturumu düşürüyor', oturumDusmeli('403'));
  // ⚠️ ÇİFT TARAFLI: 429'da oturumu düşürmek, hız sınırına takılan operatörü
  // sırrı yeniden yazmaya zorlardı — ve o yeniden deneme sınırı BÜSBÜTÜN
  // doldururdu.
  check('429 oturumu DÜŞÜRMÜYOR', !oturumDusmeli('429'));
  check('500 oturumu düşürmüyor', !oturumDusmeli('500'));
  check('ağ hatası oturumu düşürmüyor', !oturumDusmeli('Failed to fetch'));
}

console.log(`\n${FAIL.length === 0 ? '✅ ADMIN HATA METİNLERİ SAĞLAM' : `❌ ${FAIL.length} BAŞARISIZ: ${FAIL.join(', ')}`}\n`);
process.exit(FAIL.length === 0 ? 0 : 1);
