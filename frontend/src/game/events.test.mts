// ETKİNLİK TAKVİMİ ÖLÇÜMÜ.
//
// Burada asıl korunan şey takvim aritmetiği DEĞİL, iki tasarım kuralı:
//   1) çarpan yanlış etkiye sızmasın (Blood Moon gold'u çarpmasın)
//   2) `null`/bozuk tarih sessizce bir Perşembe'ye dönüşmesin
// İkincisi gerçek bir hatanın tekrarı: canlı boss odasında `Number(null)`
// = 0 ve sonlu olduğu için bir hayalet sessizce başlangıca ışınlanmıştı.

import { EVENTS, eventAt, eventMul, eventWindow } from './events.js';
import { bossWeek } from './worldBoss.js';

let hata = 0;
function check(ad: string, kosul: boolean, detay = '') {
  console.log(`  ${kosul ? '✓' : '✗'} ${ad}${detay ? ` — ${detay}` : ''}`);
  if (!kosul) hata++;
}
const utc = (s: string) => new Date(`${s}Z`);

console.log('\n[1] Pencere hafta sonu — hafta içi kapalı');
// 2026-08-07 Cuma · 08 Cumartesi · 09 Pazar · 10 Pazartesi
check('Cuma kapalı', eventAt(utc('2026-08-07T12:00:00')) === null);
check('Cumartesi açık', eventAt(utc('2026-08-08T00:00:00')) !== null);
check('Pazar açık', eventAt(utc('2026-08-09T23:59:59')) !== null);
check('Pazartesi kapalı', eventAt(utc('2026-08-10T00:00:00')) === null);

console.log('\n[2] Cumartesi ve Pazar AYNI etkinlik (tek hafta tanımı)');
const cmt = eventAt(utc('2026-08-08T06:00:00'));
const paz = eventAt(utc('2026-08-09T18:00:00'));
check('aynı etkinlik', !!cmt && cmt.id === paz?.id, cmt?.name);
check('hafta numarası da aynı',
  bossWeek(utc('2026-08-08T06:00:00')) === bossWeek(utc('2026-08-09T18:00:00')));

console.log('\n[3] Döngü — ardışık hafta sonları farklı etkinlik');
const seri: string[] = [];
for (let i = 0; i < EVENTS.length * 2; i++) {
  const g = utc('2026-08-08T12:00:00').getTime() + i * 7 * 86_400_000;
  seri.push(eventAt(g)!.id);
}
check('ilk tur tüm etkinlikleri geziyor',
  new Set(seri.slice(0, EVENTS.length)).size === EVENTS.length, seri.slice(0, EVENTS.length).join(' → '));
check('sonra başa dönüyor',
  seri.slice(0, EVENTS.length).join() === seri.slice(EVENTS.length).join());

console.log('\n[4] ⚠️ Çarpan YANLIŞ ETKİYE SIZMIYOR');
for (const e of EVENTS) {
  // O etkinliğin açık olduğu bir hafta sonu bul
  let t = utc('2026-08-08T12:00:00').getTime();
  for (let i = 0; i < 20 && eventAt(t)!.id !== e.id; i++) t += 7 * 86_400_000;
  const kendi = eventMul(t, e.effect);
  const digerleri = EVENTS.filter((o) => o.effect !== e.effect)
    .map((o) => eventMul(t, o.effect));
  check(`${e.name}: kendi etkisi ×${e.mul}`, kendi === e.mul);
  check(`${e.name}: diğer etkiler dokunulmamış`, digerleri.every((m) => m === 1),
    digerleri.join('/'));
}

console.log('\n[5] Hafta içi HİÇBİR çarpan yok');
const carsamba = utc('2026-08-05T12:00:00');
check('üç etkinin üçü de 1',
  EVENTS.every((e) => eventMul(carsamba, e.effect) === 1));

console.log('\n[6] ⚠️ Bozuk tarih 1970 Perşembe\'sine düşmüyor');
check('null → etkinlik yok', eventAt(null) === null);
check('undefined → etkinlik yok', eventAt(undefined) === null);
check('NaN → etkinlik yok', eventAt(NaN) === null);
check('geçersiz Date → etkinlik yok', eventAt(new Date('kırık')) === null);
check('null → çarpan 1', eventMul(null, 'dropGold') === 1);

console.log('\n[7] eventWindow — açık pencere ve önizleme');
const acik = eventWindow(utc('2026-08-08T12:00:00'));
check('hafta sonu: live', acik.live);
check('pencere 48 saat', acik.endsAt - acik.startsAt === 2 * 86_400_000);
check('pencere içindeki etkinlik eventAt ile aynı',
  acik.event.id === eventAt(utc('2026-08-08T12:00:00'))!.id);

const cuma = eventWindow(utc('2026-08-07T20:00:00'));
check('Cuma: live değil ama pencere ÖNDE', !cuma.live && cuma.startsAt > utc('2026-08-07T20:00:00').getTime());
check('Cuma\'nın gösterdiği pencere o hafta sonunun kendisi',
  cuma.startsAt === acik.startsAt, new Date(cuma.startsAt).toISOString());

const pzt = eventWindow(utc('2026-08-10T09:00:00'));
check('Pazartesi: pencere GELECEK hafta sonuna atlıyor',
  pzt.startsAt === acik.startsAt + 7 * 86_400_000);
check('Pazartesi\'nin gösterdiği etkinlik o haftanın etkinliği',
  pzt.event.id === eventAt(pzt.startsAt + 3600_000)!.id, pzt.event.name);

console.log('\n[8] Pazar\'ın penceresi geriye, Cumartesi\'ye bakıyor');
const pazarP = eventWindow(utc('2026-08-09T18:00:00'));
check('Pazar penceresi Cumartesi başlıyor', pazarP.startsAt === acik.startsAt);
check('Pazar hâlâ live', pazarP.live);

console.log('\n' + '─'.repeat(62));
if (hata) { console.log(`✗ ${hata} ölçüm sınırın dışında`); process.exit(1); }
console.log('✓ etkinlik takvimi doğru');
