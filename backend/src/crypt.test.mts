// CRYPT VAULT TESTİ — sunucu tarafında da musluk değil mi?
//
// `game/crypt.test.mts` matematiği tutuyor. Bu dosya VERİTABANINDA tutuyor:
// eşzamanlı çekimler, bayat hafta, boş kasa, ve en önemlisi
//
//   paid ≤ filled     (kasadan çıkan ≤ kasaya giren)
//
// Bu eşitsizlik bozulursa bir yerde gold BASILMIŞ demektir.
//
// Çalıştır:  npx tsx src/crypt.test.mts

import { CRYPT_CUT, cryptTier } from '@game/crypt';
import { seasonWeek } from '@game/season';
import { prisma } from './db.js';
import { NON_SINK_KINDS, SINK_KINDS, claimCrypt, contributeToVault, isCryptSink, vaultState } from './crypt.js';
import { LEDGER_KINDS } from './ledger.js';

const FAIL: string[] = [];
const check = (n: string, ok: boolean, d = '') => {
  console.log(`${ok ? '  ✓' : '  ✗'} ${n}${d ? ` — ${d}` : ''}`);
  if (!ok) FAIL.push(n);
};

const P = `TEST_CRYPT_${Date.now()}`;
const w = (n: number) => `${P}_${n}`;
const WEEK = seasonWeek(new Date());

// ⚠️ Kasa TEK SATIR ve paylaşılan: testten önceki hâli kaydedip DELTA ölç.
// Mutlak sayı beklemek, aynı veritabanını kullanan diğer testlerin sırasına
// bağımlı olurdu (ledger testinde tam bu hataya düşülmüştü).
const once = await vaultState();

await prisma.player.createMany({
  data: [0, 1, 2, 3].map((n) => ({ wallet: w(n), gold: 0 })),
});

console.log('\n[1] Hangi harcama kasaya katkı yapar');
{
  // ⭐ EKSİKSİZLİK MÜHRÜ — bu testin olmayışı gerçek bir boşluk yarattı.
  // `pet` ve `reforge` ne SINK_KINDS'ta ne de bir gerekçe listesindeydi;
  // yani kasayı beslemiyorlardı ve bunu kimse görmüyordu. Testler tek tek
  // birkaç türü kontrol ediyordu, LİSTENİN TAMAMINI değil.
  const siniflandirilmamis = LEDGER_KINDS.filter(
    (k) => !SINK_KINDS.has(k) && !NON_SINK_KINDS.has(k),
  );
  check('HER defter türü sınıflandırılmış (sink ya da değil)',
    siniflandirilmamis.length === 0,
    siniflandirilmamis.join(', ') || 'hepsi sınıflı');
  // ⚠️ İki listenin KESİŞİMİ de boş olmalı — bir tür ikisinde birden olamaz
  const cakisan = LEDGER_KINDS.filter((k) => SINK_KINDS.has(k) && NON_SINK_KINDS.has(k));
  check('hiçbir tür iki listede birden değil', cakisan.length === 0,
    cakisan.join(', ') || 'temiz');

  // ⭐ KULLANICI KARARI 2026-08-14 — bu ikisi kasayı BESLER. Karar
  // geri alınacaksa bilinçli olsun diye mühürlendi: sessizce düşerlerse
  // deed paneli yine yanlış söyler.
  check('reforge kasayı besler (sonsuz sink)', isCryptSink('reforge', -100));
  check('pet kasayı besler (forge gibi güç satıyor)', isCryptSink('pet', -100));

  check('forge harcaması sink', isCryptSink('forge', -100));
  check('ossuary harcaması sink', isCryptSink('ossuary', -100));
  // ⚠️ ESCROW SİNK DEĞİL: ilan açıp iptal ederek kasayı kendi gold'unla
  // doldurup payını geri çekmek küçük ama gerçek bir kaçak olurdu.
  check('market_list (escrow) sink DEĞİL', !isCryptSink('market_list', -100));
  check('koşu ödülü (musluk) sink DEĞİL', !isCryptSink('run', 500));
  check('deed alımı kasaya katkı YAPMAZ (kendi alımından pay alınmaz)',
    !isCryptSink('crypt_deed', -90_000));
  check('pozitif gold sink değil', !isCryptSink('forge', 100));
}

console.log('\n[2] Kasa doluyor');
{
  await prisma.$transaction(async (tx) => {
    await contributeToVault(tx, 'forge', -10_000);
    await contributeToVault(tx, 'reliquary', -450);
    await contributeToVault(tx, 'market_list', -5_000);  // sayılmamalı
  });
  const st = await vaultState();
  const giren = st.filled - once.filled;
  const beklenen = Math.floor(10_000 * CRYPT_CUT) + Math.floor(450 * CRYPT_CUT);
  check('kasaya SADECE gerçek sink\'ler girdi', giren === beklenen,
    `${giren} = ${beklenen} (escrow sayılmadı)`);
  check('bakiye de aynı arttı', st.balance - once.balance === beklenen);
}

console.log('\n[3] Çekim');
{
  // 0 ve 1 numaraya deed ver (T1 ve T2), 2 numara deed'siz
  await prisma.player.update({ where: { wallet: w(0) }, data: { cryptTier: 1 } });
  await prisma.player.update({ where: { wallet: w(1) }, data: { cryptTier: 2 } });

  check('deed\'siz oyuncu çekemiyor', (await claimCrypt(w(2))).ok === false);

  const st = await vaultState();
  const r0 = await claimCrypt(w(0));
  check('deed sahibi çekebiliyor', r0.ok === true, r0.ok ? `${r0.amount} gold` : (r0 as { reason: string }).reason);
  if (r0.ok) {
    const p0 = await prisma.player.findUniqueOrThrow({ where: { wallet: w(0) } });
    check('gold hesaba yazıldı', p0.gold === r0.amount, `${p0.gold}`);
    check('hafta damgalandı', p0.cryptClaimedWeek === WEEK, `${p0.cryptClaimedWeek}`);
    // T1 ağırlık 1, T2 ağırlık 2.5 → toplam 3.5, T1 payı = floor(bakiye/3.5)
    const bekle = Math.floor((st.balance * cryptTier(1)!.weight) / st.totalWeight);
    check('pay ağırlığa göre bölündü', r0.amount === bekle, `${r0.amount} = ${bekle}`);
  }

  check('aynı hafta İKİNCİ çekim reddediliyor', (await claimCrypt(w(0))).ok === false);
}

console.log('\n[4] ⭐ Eşzamanlı çekim — gold basılabiliyor mu');
{
  // 3 numaraya deed ver, 5 isteği AYNI ANDA at
  await prisma.player.update({ where: { wallet: w(3) }, data: { cryptTier: 1 } });
  const sonuc = await Promise.all([1, 2, 3, 4, 5].map(() => claimCrypt(w(3))));
  const gecen = sonuc.filter((r) => r.ok).length;
  check('5 eşzamanlı çekimin SADECE 1\'i geçti', gecen === 1, `${gecen} geçti`);

  const p3 = await prisma.player.findUniqueOrThrow({ where: { wallet: w(3) } });
  const odenen = sonuc.filter((r) => r.ok).reduce((s, r) => s + (r as { amount: number }).amount, 0);
  check('hesaba tam olarak bir kez yazıldı', p3.gold === odenen, `${p3.gold} = ${odenen}`);
}

console.log('\n[5] ⭐⭐ YAPISAL GARANTİ');
{
  const st = await vaultState();
  console.log(`     kasa: giren ${st.filled} · ödenen ${st.paid} · bakiye ${st.balance}`);
  // Bu üçü bozulursa oyun gold BASMIŞ demektir.
  check('ÖDENEN ≤ GİREN (yeni gold üretilmedi)', st.paid <= st.filled, `${st.paid} ≤ ${st.filled}`);
  check('bakiye = giren − ödenen', st.balance === st.filled - st.paid,
    `${st.balance} = ${st.filled} − ${st.paid}`);
  check('bakiye negatife düşmedi', st.balance >= 0, `${st.balance}`);
}

console.log('\n[6] Boş kasadan çekim');
{
  // Kasayı boşalt, sonra yeni bir hafta damgasıyla çekmeye çalış
  await prisma.cryptVault.update({ where: { id: 1 }, data: { balance: 0 } });
  await prisma.player.update({ where: { wallet: w(1) }, data: { cryptClaimedWeek: 0 } });
  const r = await claimCrypt(w(1));
  check('boş kasadan çekim reddediliyor', r.ok === false && r.reason === 'kasa_bos');
  const p1 = await prisma.player.findUniqueOrThrow({ where: { wallet: w(1) } });
  check('reddedilen çekim gold yazmadı', p1.gold === 0, `${p1.gold}`);
}

// ── temizlik ──
// ⚠️ Kasayı testten ÖNCEKİ hâline döndür — paylaşılan tek satır.
await prisma.cryptVault.update({
  where: { id: 1 },
  data: { balance: once.balance, filled: once.filled, paid: once.paid },
});
await prisma.ledger.deleteMany({ where: { wallet: { startsWith: P } } });
await prisma.player.deleteMany({ where: { wallet: { startsWith: P } } });

console.log(`\n${FAIL.length === 0 ? '✅ CRYPT VAULT SAĞLAM' : `❌ ${FAIL.length} BAŞARISIZ: ${FAIL.join(', ')}`}\n`);
process.exit(FAIL.length === 0 ? 0 : 1);
