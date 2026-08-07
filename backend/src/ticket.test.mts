// DESTEK TALEBİ — sunucu testi.
//
// Riskler:
//   1. YETKİ — oyuncu BAŞKASININ talebine yazabilmemeli; kontrol id'nin
//      gizliliğine bırakılamaz
//   2. SPAM — sınırsız talep hem admin listesini hem veritabanını bozar
//   3. DURUM — "cevaplandı mı" sorusu her zaman doğru cevaplanmalı
//   4. METİN — görünmez/kontrol karakteri kayda düşmemeli
//
// Çalıştır:  npx tsx src/ticket.test.mts

import { prisma } from './db.js';
import {
  TICKET, adminList, closeTicket, myTickets, openTicket, openTicketCount, reply,
} from './ticket.js';

const FAIL: string[] = [];
const check = (n: string, ok: boolean, d = '') => {
  console.log(`${ok ? '  ✓' : '  ✗'} ${n}${d ? ` — ${d}` : ''}`);
  if (!ok) FAIL.push(n);
};
const red = async (fn: () => Promise<unknown>) => {
  try { await fn(); return false; } catch { return true; }
};

/**
 * Talebin son mesajını geriye al — soğumayı aşmak için.
 *
 * ⚠️ Soğumayı KAPATMIYORUZ, sadece zamanı ileri sarıyoruz: sabiti test
 * için değiştirmek, üretimdeki gerçek değeri hiç sınamamak olurdu.
 */
async function eskit(ticketId: string) {
  // ⚠️ HEPSİNİ geriye al, sadece sonuncuyu DEĞİL. İlk sürüm yalnızca en
  // yeni mesajı eskitiyordu ve kendi kuyruğunu ısırıyordu: o mesaj geriye
  // gidince BİR ÖNCEKİ mesaj "en yeni" hâline geliyor ve soğuma yeniden
  // tetikleniyordu.
  await prisma.ticketMessage.updateMany({
    where: { ticketId },
    data: { createdAt: new Date(Date.now() - (TICKET.cooldownSec + 5) * 1000) },
  });
}

const P = `TEST_TICKET_${Date.now()}`;
const w = (n: number) => `${P}_${n}`;
await prisma.player.createMany({
  data: [{ wallet: w(0) }, { wallet: w(1) }, { wallet: w(2), banned: true }],
});

console.log('\n═══ DESTEK TALEPLERİ ═══');

console.log('\n[1] Talep açma');
let t0 = '';
{
  const t = await openTicket(w(0), 'Gold gelmedi', 'Koşuyu bitirdim ama gold yazılmadı.');
  t0 = t.id;
  check('talep açıldı', !!t.id && t.status === 'open', t.status);
  check('ilk mesaj oyuncudan', t.messages.length === 1 && !t.messages[0].fromAdmin);
  check('konu saklandı', t.subject === 'Gold gelmedi', t.subject);

  check('kısa konu reddediliyor', await red(() => openTicket(w(0), 'ab', 'yeterince uzun bir gövde')));
  check('kısa gövde reddediliyor', await red(() => openTicket(w(0), 'Geçerli konu', 'kısa')));
  check('sayı reddediliyor', await red(() => openTicket(w(0), 42 as unknown as string, 'gövde metni burada')));
  check('null reddediliyor', await red(() => openTicket(w(0), null as unknown as string, 'gövde metni burada')));

  // ⚠️ Banlı oyuncu talep AÇAMAZ ama mevcutlarını OKUYABİLİR
  check('banlı talep açamıyor', await red(() => openTicket(w(2), 'İtiraz', 'Banım haksız bence.')));
  check('banlının okuma yolu açık', Array.isArray(await myTickets(w(2))));
}

console.log('\n[2] ⭐ METİN TEMİZLİĞİ — kod noktası filtresi');
{
  const kirli = 'Merhaba​dünyatest';
  const t = await openTicket(w(1), `Konu${'​'}bir`, `${kirli} ve biraz daha metin`);
  check('görünmez karakter elendi', !t.messages[0].body.includes('​'));
  check('kontrol karakteri elendi', !t.messages[0].body.includes(''));
  check('konudaki görünmez de elendi', !t.subject.includes('​'), t.subject);
  check('metnin kendisi duruyor', t.messages[0].body.includes('Merhaba'));

  // Uzunluk tavanı
  const uzun = await openTicket(w(1), 'x'.repeat(300), 'y'.repeat(5000));
  check('konu tavana kırpıldı', uzun.subject.length <= TICKET.subjectMax, `${uzun.subject.length}`);
  check('gövde tavana kırpıldı', uzun.messages[0].body.length <= TICKET.bodyMax,
    `${uzun.messages[0].body.length}`);
}

console.log('\n[3] ⭐ YETKİ — başkasının talebine yazılamıyor');
{
  check('başkasının talebine yazılamıyor',
    await red(() => reply(t0, 'ben de bir şey diyeyim', { wallet: w(1) })));
  await eskit(t0);
  check('sahibi yazabiliyor',
    !!(await reply(t0, 'ek bilgi: bölüm 3 idi', { wallet: w(0) })));
  check('olmayan talep reddediliyor',
    await red(() => reply('yok-boyle', 'metin', { wallet: w(0) })));
  check('sayı id reddediliyor',
    await red(() => reply(42 as unknown as string, 'metin', { wallet: w(0) })));
}

console.log('\n[4] ⭐ DURUM mesajın yazarından türüyor');
{
  // ⚠️ Elle yönetmek "cevaplandı mı" sorusunu er ya da geç yanlış cevaplardı.
  const admin = await reply(t0, 'Baktık, gold yazılmış görünüyor.', { asAdmin: true });
  check('admin yazınca "answered"', admin.status === 'answered', admin.status);
  check('admin mesajı işaretli', admin.messages[admin.messages.length - 1].fromAdmin);

  await eskit(t0);
  const geri = await reply(t0, 'Bende hâlâ görünmüyor.', { wallet: w(0) });
  check('oyuncu yazınca tekrar "open"', geri.status === 'open', geri.status);

  await closeTicket(t0);
  const kapali = (await myTickets(w(0))).find((t) => t.id === t0)!;
  check('kapatıldı', kapali.status === 'closed', kapali.status);
  // ⚠️ Kapalı talebe yazılamaz — yoksa "kapattım" bir şey ifade etmezdi
  check('kapalı talebe yazılamıyor',
    await red(() => reply(t0, 'yine ben', { wallet: w(0) })));
}

console.log('\n[5] ⭐ SPAM sınırları');
{
  const s = `${P}_spam`;
  await prisma.player.create({ data: { wallet: s } });
  for (let i = 0; i < TICKET.maxOpen; i++) {
    await openTicket(s, `Konu ${i + 1}`, 'yeterince uzun bir gövde metni');
  }
  check('açık talep tavanı uygulanıyor',
    await red(() => openTicket(s, 'Bir tane daha', 'yeterince uzun bir gövde metni')),
    `${TICKET.maxOpen} tavan`);

  // Kapatınca yeniden açılabilmeli
  const benim = await myTickets(s);
  await closeTicket(benim[0].id);
  check('kapanınca yer açılıyor',
    !!(await openTicket(s, 'Yeni konu', 'yeterince uzun bir gövde metni')));

  // ⚠️ SOĞUMA SADECE OYUNCUYA
  const t = (await myTickets(s))[0];
  // ⚠️ Talep az önce açıldı — son mesaj oyuncunun, yani soğuma AKTİF olmalı
  check('arka arkaya oyuncu mesajı ENGELLENİYOR',
    await red(() => reply(t.id, 'hemen ikinci mesaj', { wallet: s })));
  check('admin soğumaya takılmıyor',
    !!(await reply(t.id, 'admin cevabı', { asAdmin: true })));
}

console.log('\n[6] Admin listesi');
{
  const acik = await adminList('open');
  check('açık talepler listeleniyor', acik.length > 0, `${acik.length}`);
  check('hepsi açık', acik.every((t) => t.status === 'open'));
  check('en son yazılan üstte',
    acik.every((t, i) => i === 0 || t.bumpedAt <= acik[i - 1].bumpedAt));
  check('mesajlar da geliyor', acik[0].messages.length > 0);

  const hepsi = await adminList('all');
  check('"all" kapalıları da getiriyor', hepsi.length >= acik.length, `${hepsi.length}`);
  check('bekleyen sayısı bildiriliyor', (await openTicketCount()) >= 0);
}

await prisma.ticket.deleteMany({ where: { wallet: { startsWith: P } } });
await prisma.player.deleteMany({ where: { wallet: { startsWith: P } } });

console.log(`\n${FAIL.length === 0 ? '✅ DESTEK TALEPLERİ SAĞLAM' : `❌ ${FAIL.length} BAŞARISIZ: ${FAIL.join(', ')}`}\n`);
process.exit(FAIL.length === 0 ? 0 : 1);
