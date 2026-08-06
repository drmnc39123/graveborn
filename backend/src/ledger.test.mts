// GOLD DEFTERİ — kaydın gerçeği yansıttığını doğrular.
//
// Çalıştır:  npx tsx src/ledger.test.mts   (Postgres ayakta olmalı)
//
// ⚠️ ASIL SORU: defter BAKİYEYLE TUTARLI MI? Yalan söyleyen bir defter hiç
// defter olmamasından kötüdür, çünkü ona bakılıp "ekonomi sağlıklı" denir.
// Bu yüzden testler kaydın varlığını değil, TOPLAMININ bakiye değişimine
// eşit olduğunu ölçüyor.

import crypto from 'node:crypto';
import { prisma } from './db.js';
import { economy, ledgerOf, ledgerWrite, withLedger } from './ledger.js';

const FAIL: string[] = [];
const check = (n: string, ok: boolean, d = '') => {
  console.log(`${ok ? '  ✓' : '  ✗'} ${n}${d ? ` — ${d}` : ''}`);
  if (!ok) FAIL.push(n);
};

const W = `ldg${crypto.randomBytes(6).toString('hex')}`;

async function temizle() {
  await prisma.ledger.deleteMany({ where: { wallet: W } });
  await prisma.player.deleteMany({ where: { wallet: W } });
}

console.log('\n═══ GOLD DEFTERİ ═══');
await temizle();
await prisma.player.create({ data: { wallet: W, gold: 10_000, hero: 'knight' } });

/**
 * ⚠️ `economy()` KASITLI OLARAK GLOBAL — bir yönetim panosu, cüzdan filtresi
 * yok. Yani bu testte mutlak sayı ölçmek YANLIŞ: aynı veritabanında koşan
 * diğer testlerin (market, admin) kayıtları da pencereye giriyor ve test
 * çalıştırma sırasına göre kırılıyor. Doğrusu ÖNCE/SONRA farkını ölçmek.
 */
const base = await economy(24);

console.log('\n[1] Kayıt bakiyeyle birlikte yazılıyor');
{
  const saved = await withLedger(W, { gold: { decrement: 450 } },
    { kind: 'reliquary', gold: -450, detail: 'r_crown' });
  check('bakiye düştü', saved.gold === 9_550, `${saved.gold}`);
  const kayitlar = await ledgerOf(W);
  check('defterde tek kayıt var', kayitlar.length === 1, `${kayitlar.length}`);
  check('kayıt doğru tutarı taşıyor', kayitlar[0]?.gold === -450, `${kayitlar[0]?.gold}`);
  check('ayrıntı korunuyor', kayitlar[0]?.detail === 'r_crown');
}

console.log('\n[2] ⭐ DEFTER TOPLAMI BAKİYEYE EŞİT');
{
  // Bir dizi hareket yap, sonra "başlangıç + defter toplamı" ile gerçek
  // bakiyeyi karşılaştır. Bu testin yakalayacağı hata sınıfı, bir uçta
  // deftere yazmayı UNUTMAK — en olası ve en sessiz hata.
  await withLedger(W, { gold: { decrement: 400 } }, { kind: 'ossuary', gold: -400, detail: 'L1' });
  await withLedger(W, { gold: { increment: 1_820 } }, { kind: 'run', gold: 1_820, detail: 'descent s1 d24' });
  await withLedger(W, { gold: { decrement: 130 } }, { kind: 'charm', gold: -130, detail: 'edge' });

  const p = await prisma.player.findUniqueOrThrow({ where: { wallet: W } });
  const kayitlar = await ledgerOf(W);
  const toplam = kayitlar.reduce((s, k) => s + k.gold, 0);
  check('başlangıç + defter = bakiye', 10_000 + toplam === p.gold,
    `10.000 ${toplam >= 0 ? '+' : ''}${toplam} = ${10_000 + toplam} vs ${p.gold}`);
}

console.log('\n[3] Musluk / sink ayrımı');
{
  const e = await economy(24);
  const kalemler = new Map(e.slices.map((s) => [s.kind, s]));
  check('koşu ödülü MUSLUK (pozitif)', (kalemler.get('run')?.gold ?? 0) > 0,
    `${kalemler.get('run')?.gold}`);
  check('çekiliş SİNK (negatif)', (kalemler.get('reliquary')?.gold ?? 0) < 0,
    `${kalemler.get('reliquary')?.gold}`);
  check('anıt SİNK (negatif)', (kalemler.get('ossuary')?.gold ?? 0) < 0);
  const dFaucet = e.faucet - base.faucet;
  const dSink = e.sink - base.sink;
  console.log(`     bu testin katkısı: musluk +${dFaucet} · sink +${dSink}`);
  check('musluk ve sink ayrı sayılıyor', dFaucet > 0 && dSink > 0);
  // ⚠️ İkisinin farkı NET BİRİKİM — panonun asıl sayısı bu
  check('net birikim tutarlı', dFaucet - dSink === 1_820 - (450 + 400 + 130),
    `${dFaucet - dSink}`);
}

console.log('\n[4] Zaman penceresi');
{
  // Eski bir kayıt yaz ve pencerenin onu DIŞARIDA bıraktığını doğrula
  await prisma.ledger.create({
    data: {
      id: crypto.randomUUID(), wallet: W, kind: 'run', gold: 999_999,
      at: new Date(Date.now() - 40 * 24 * 3600_000),
    },
  });
  const dar = await economy(24);
  const genis = await economy(24 * 60);
  check('dar pencere eski kaydı almıyor', dar.faucet < 999_999, `${dar.faucet}`);
  check('geniş pencere eski kaydı alıyor', genis.faucet > 999_999, `${genis.faucet}`);
}

console.log('\n[5] Başarısız transaction defteri KİRLETMİYOR');
{
  // ⚠️ Bu testin varlık sebebi: kayıt ile bakiye AYRI yazılsaydı, biri
  // patladığında defter gerçeği yansıtmazdı. Olmayan bir oyuncuya yazmayı
  // deniyoruz — player.update patlamalı ve defter kaydı da GİTMEMELİ.
  const oncesi = (await ledgerOf(W)).length;
  let patladi = false;
  try {
    await withLedger('yok-boyle-bir-cuzdan', { gold: { decrement: 1 } },
      { kind: 'forge', gold: -1 });
  } catch { patladi = true; }
  check('olmayan oyuncuya yazma patlıyor', patladi);
  const sonrasi = (await ledgerOf(W)).length;
  check('defter kirlenmedi', sonrasi === oncesi, `${oncesi} → ${sonrasi}`);
  const yetim = await prisma.ledger.count({ where: { wallet: 'yok-boyle-bir-cuzdan' } });
  check('yetim kayıt oluşmadı', yetim === 0, `${yetim}`);
}

console.log('\n[6] ledgerWrite tek başına transaction dizisine giriyor');
{
  const [, kayit] = await prisma.$transaction([
    prisma.player.update({ where: { wallet: W }, data: { gold: { increment: 5 } } }),
    ledgerWrite({ wallet: W, kind: 'run', gold: 5, detail: 'tx-dizisi' }),
  ]);
  check('dizi içinde yazılabiliyor', kayit.gold === 5 && kayit.detail === 'tx-dizisi');
}

await temizle();
await prisma.$disconnect();


console.log('\n[7] ⭐ Yeniden dağıtım MUSLUK sayılmıyor');
{
  // ⚠️ Crypt çekimi POZİTİF gold yazıyor ama yeni gold DEĞİL: daha önce bir
  // sink'ten kesilip kasada bekleyen paranın el değiştirmesi. İşaretine bakan
  // bir pano onu musluk sayar ve "musluk büyüdü" der — panonun tek işi
  // "ekonomi sağlıklı mı" sorusuna cevap vermekken YALAN SÖYLEMİŞ olur.
  const once = await economy(24);
  await ledgerWrite({ wallet: W, kind: 'crypt', gold: 5_000, detail: 'test cekim' });
  const sonra = await economy(24);

  const dMusluk = sonra.faucet - once.faucet;
  const dDagitim = sonra.redistributed - once.redistributed;
  console.log(`     +5.000 crypt → musluk +${dMusluk} · dağıtım +${dDagitim}`);
  check('crypt çekimi MUSLUĞA yazılmıyor', dMusluk === 0, `musluk +${dMusluk}`);
  check('crypt çekimi DAĞITIMA yazılıyor', dDagitim === 5_000, `dağıtım +${dDagitim}`);

  check('kasa sağlık bayrağı raporlanıyor', typeof sonra.vault.saglikli === 'boolean');
  check('kasa sağlıklı (ödenen ≤ giren)', sonra.vault.saglikli,
    `giren ${sonra.vault.filled} · ödenen ${sonra.vault.paid}`);
}

console.log(`\n${FAIL.length === 0 ? '✅ DEFTER SAĞLAM' : `❌ ${FAIL.length} BAŞARISIZ: ${FAIL.join(', ')}`}\n`);
process.exit(FAIL.length === 0 ? 0 : 1);
