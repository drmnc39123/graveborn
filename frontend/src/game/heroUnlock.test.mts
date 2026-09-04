// KARAKTER KİLİDİ MÜHRÜ.
//
// ⚠️ NİYE MÜHÜR GEREKİYOR: kilit koşulları elle yazılmış id'lere dayanıyor
// (`KILITLER` anahtarları). Bir harf hatası iki yönde de SESSİZ:
//   · olmayan bir id → o kahraman hiç kilitlenmez, kimse fark etmez
//   · listede unutulan bir kahraman → bedava açık kalır
// İkisi de ekranda "çalışıyor" gibi görünür.

import { HEROES } from './heroes.js';
import { emptyProgress, type Progress } from './progress.js';
import { BASLANGIC_KAHRAMAN, KILITLER, acikKahramanlar, kahramanAcikMi, kahramanKilitMetni } from './heroUnlock.js';

const FAIL: string[] = [];
const check = (n: string, ok: boolean, d = '') => {
  console.log(`${ok ? '  ✓' : '  ✗'} ${n}${d ? ` — ${d}` : ''}`);
  if (!ok) FAIL.push(n);
};

const temiz = (n: number): Progress => {
  const p = emptyProgress();
  for (let i = 1; i <= n; i++) p.cleared[i] = true;
  return p;
};
const derin = (d: number): Progress => {
  const p = emptyProgress();
  p.depthPaid[1] = d;
  return p;
};

console.log('\n[1] LİSTE TUTARLI MI');
const idler = new Set(HEROES.map((h) => h.id));
const hayalet = Object.keys(KILITLER).filter((id) => !idler.has(id));
check('kilit listesinde HAYALET id yok', hayalet.length === 0, hayalet.join(' '));
const bedava = HEROES.filter((h) => !KILITLER[h.id]).map((h) => h.id);
// ⚠️ TAM OLARAK BİR başlangıç kahramanı olmalı. Sıfır olsaydı yeni oyuncu
// hiçbir kahraman seçemezdi; iki olsaydı kilit yayı yarı yarıya kaybolurdu.
check('tam olarak 1 başlangıç kahramanı var', bedava.length === 1, bedava.join(' '));
check('başlangıç kahramanı listenin ilki', BASLANGIC_KAHRAMAN === HEROES[0].id, BASLANGIC_KAHRAMAN);

console.log('\n[2] SIFIR İLERLEMEDE YALNIZ BAŞLANGIÇ AÇIK');
const p0 = emptyProgress();
const acik0 = acikKahramanlar(p0);
check('sıfırda 1 kahraman açık', acik0.length === 1, acik0.join(' '));
check('açık olan başlangıç kahramanı', acik0[0] === BASLANGIC_KAHRAMAN);
for (const h of HEROES) {
  if (h.id === BASLANGIC_KAHRAMAN) continue;
  const m = kahramanKilitMetni(h.id, p0);
  // ⚠️ ŞART METNİ BOŞ OLAMAZ: kilitli ama sebebi yazmayan bir kahraman,
  // oyuncuya "bu asla açılmıyor" gibi görünür.
  check(`${h.id} şart metni dolu`, !!m && m.length > 5, m ?? 'YOK');
}

console.log('\n[3] KOŞULLAR — ÇİFT TARAFLI');
// Her kilit için: BİR EKSİĞİNDE kapalı, TAM DEĞERİNDE açık olmalı.
// Tek yön ölçmek ("şartı sağlayınca açılıyor") her zaman açık bir kilidi
// de geçirirdi.
check('ranger 2 bölümde KAPALI', !kahramanAcikMi('ranger', temiz(2)));
check('ranger 3 bölümde AÇIK', kahramanAcikMi('ranger', temiz(3)));
check('priestess derinlik 7\'de KAPALI', !kahramanAcikMi('priestess', derin(7)));
check('priestess derinlik 8\'de AÇIK', kahramanAcikMi('priestess', derin(8)));
check('bladekeeper 7 bölümde KAPALI', !kahramanAcikMi('bladekeeper', temiz(7)));
check('bladekeeper 8 bölümde AÇIK', kahramanAcikMi('bladekeeper', temiz(8)));

console.log('\n[4] KİLİTLER FARKLI SİSTEMLERİ ÖĞRETİYOR');
// ⚠️ Üçü de "bölüm temizle" olsaydı kilitler ilerleme değil BEKLEME olurdu.
// En az bir kilit kampanya DIŞI bir sistemi (Descent derinliği) istemeli.
const sadeceBolum = kahramanAcikMi('priestess', temiz(25));
check('derinlik kilidi bölüm temizleyerek AÇILMIYOR', !sadeceBolum,
  '25 bölüm temizlendi ama descent yapılmadı');

console.log('\n[5] MONOTONLUK — açılan kapanmaz');
// İlerleme arttıkça açık kahraman sayısı ASLA azalmamalı. Azalırsa oyuncu
// oynadıkça karakter KAYBEDER; bu, koşulların yanlış yönde yazıldığının
// tek ölçülebilir belirtisi.
let onceki = 0;
let bozuldu = '';
for (let n = 0; n <= 25; n++) {
  const p = temiz(n);
  p.depthPaid[1] = Math.floor(n / 2);
  const sayi = acikKahramanlar(p).length;
  if (sayi < onceki) bozuldu = `${n} bölümde ${onceki} → ${sayi}`;
  onceki = sayi;
}
check('açık kahraman sayısı hiç azalmıyor', !bozuldu, bozuldu);
check('yeterli ilerlemede HEPSİ açılıyor', onceki === HEROES.length, `${onceki}/${HEROES.length}`);

console.log(`\n${FAIL.length === 0 ? '✅ KAHRAMAN KİLİTLERİ SAĞLAM' : `❌ ${FAIL.length} BAŞARISIZ: ${FAIL.join(', ')}`}\n`);
process.exit(FAIL.length === 0 ? 0 : 1);
