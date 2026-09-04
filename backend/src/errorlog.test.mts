// HATA DEFTERİ MÜHRÜ.
//
// ⚠️ NİYE ÖNEMLİ: bu modülün işi "canlıda ne kırık" sorusuna cevap
// vermek. Kendisi kırıksa, kırık olduğunu söyleyecek bir şey KALMAZ —
// üstelik sessizce, çünkü hata yolundaki bir hata asıl hatayı da yutar.

import { hataOzeti, hataSifirla, hataYaz, hatalar } from './errorlog.js';

const FAIL: string[] = [];
const check = (n: string, ok: boolean, d = '') => {
  console.log(`${ok ? '  ✓' : '  ✗'} ${n}${d ? ` — ${d}` : ''}`);
  if (!ok) FAIL.push(n);
};

console.log('\n[1] AYNI HATA BİRİKİYOR, TABLOYU DOLDURMUYOR');
{
  hataSifirla();
  /**
   * ⭐ BU TASARIMIN EN ÖNEMLİ KARARI. Bozuk bir render döngüsü saniyede
   * yüzlerce özdeş hata üretir. Her biri ayrı satır olsaydı 200'lük
   * tampon TEK bir hatayla dolar ve diğer her şeyi gizlerdi — yani hata
   * izleme, en çok ihtiyaç duyulduğu anda kör olurdu.
   */
  for (let i = 0; i < 500; i++) {
    hataYaz({ kaynak: 'istemci', mesaj: 'Maximum update depth exceeded', yol: '/play' });
  }
  const h = hatalar();
  check('500 özdeş hata → 1 satır', h.length === 1, `${h.length} satır`);
  check('sayaç 500', h[0]?.sayi === 500, String(h[0]?.sayi));
  const o = hataOzeti();
  check('özet ayrı=1 toplam=500', o.ayri === 1 && o.toplam === 500, JSON.stringify(o));
}

console.log('\n[2] FARKLI HATALAR AYRI SATIR');
{
  hataSifirla();
  hataYaz({ kaynak: 'sunucu', mesaj: 'A', yol: '/x' });
  hataYaz({ kaynak: 'sunucu', mesaj: 'B', yol: '/x' });
  // ⚠️ AYNI mesaj FARKLI yolda ayrı satır olmalı: "aynı hata her yerde mi
  // yoksa tek bir uçta mı" sorusu teşhisin yarısı.
  hataYaz({ kaynak: 'sunucu', mesaj: 'A', yol: '/y' });
  // ⚠️ Kaynak da ayırıyor: aynı cümle sunucudan ve istemciden gelirse
  // sebepleri bambaşkadır.
  hataYaz({ kaynak: 'istemci', mesaj: 'A', yol: '/x' });
  check('4 ayrı satır', hatalar().length === 4, `${hatalar().length}`);
}

console.log('\n[3] TAVAN VE DÜŞÜRME');
{
  hataSifirla();
  for (let i = 0; i < 260; i++) hataYaz({ kaynak: 'sunucu', mesaj: `hata-${i}`, yol: '/z' });
  const h = hatalar();
  check('tampon tavanı aşmıyor', h.length <= 200, `${h.length} satır`);
  // ⚠️ En YENİ hata her zaman durmalı — düşürme en eskiden yapılmalı.
  check('en yeni hata tabloda', h.some((x) => x.mesaj === 'hata-259'));
  check('en eski düşürülmüş', !h.some((x) => x.mesaj === 'hata-0'));
}

console.log('\n[4] SÜREN HATA, TEK SEFERLİK YENİ HATAYA KURBAN EDİLMİYOR');
{
  hataSifirla();
  // Eski ama HÂLÂ SÜREN bir hata
  hataYaz({ kaynak: 'sunucu', mesaj: 'suren', yol: '/a' });
  for (let i = 0; i < 210; i++) hataYaz({ kaynak: 'sunucu', mesaj: `tek-${i}`, yol: '/b' });
  hataYaz({ kaynak: 'sunucu', mesaj: 'suren', yol: '/a' });   // son görülme tazelendi
  for (let i = 210; i < 260; i++) hataYaz({ kaynak: 'sunucu', mesaj: `tek-${i}`, yol: '/b' });
  /**
   * ⚠️ Düşürme EKLEME sırasına göre yapılsaydı "suren" ilk atılan olurdu
   * — oysa o hâlâ devam eden, yani en önemli hata. Ölçüt son GÖRÜLME.
   */
  check('süren hata hayatta', hatalar().some((x) => x.mesaj === 'suren'));
}

console.log('\n[5] ÇÖP GİRDİ DEFTERİ DÜŞÜRMÜYOR');
{
  hataSifirla();
  // ⚠️ Bu uç kimliksiz ve internete açık; gövdeye ne gelirse gelsin
  // kaydedici FIRLATMAMALI, yoksa hata bildirimi bir DoS aracına dönerdi.
  const cop: unknown[] = [null, undefined, 123, {}, [], { a: 1 }, Symbol('x'), () => {}];
  let patladi = false;
  for (const c of cop) {
    try { hataYaz({ kaynak: 'istemci', mesaj: c as string, yol: c as string, yigin: c as string }); }
    catch { patladi = true; }
  }
  check('çöp girdide fırlatmıyor', !patladi);
  check('çöp girdi yine de kaydedildi', hatalar().length > 0, `${hatalar().length}`);

  // ⚠️ Uzun gövde KIRPILMALI: 10 MB'lık bir yığın gönderen istemci
  // sunucunun belleğini şişirebilirdi.
  hataSifirla();
  hataYaz({ kaynak: 'istemci', mesaj: 'x'.repeat(5000), yigin: 'y'.repeat(50_000) });
  const h = hatalar()[0];
  check('mesaj kırpıldı', h.mesaj.length <= 400, `${h.mesaj.length}`);
  check('yığın kırpıldı', h.yigin.length <= 1200, `${h.yigin.length}`);
}

console.log('\n[6] SON DAKİKA SAYACI');
{
  hataSifirla();
  hataYaz({ kaynak: 'sunucu', mesaj: 'taze', yol: '/n' });
  const o = hataOzeti();
  check('taze hata son dakikada görünüyor', o.sonDakika === 1, JSON.stringify(o));
}

console.log(`\n${FAIL.length === 0 ? '✅ HATA DEFTERİ SAĞLAM' : `❌ ${FAIL.length} BAŞARISIZ: ${FAIL.join(', ')}`}\n`);
process.exit(FAIL.length === 0 ? 0 : 1);
