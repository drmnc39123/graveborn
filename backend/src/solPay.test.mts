// SOL ODEME DOGRULAMA MUHRU.
//
// BU DOSYA GERCEK PARAYI KORUYOR. Kardes projede (Ghost Hunter) tam bu
// dogrulama eksikti: sunucu islemin PARSED INSTRUCTION'ina bakip "odendi"
// diyordu. Oyuncu 0,0009 SOL'la 0,3 SOL gonderecek bir islem kuruyordu -
// islem zincirde BASARISIZ oluyor ama IMZA yine de uretiliyordu. Iki hesap
// boyle 42 SOL degerinde sandik acti.
//
// Buradaki her kontrol o olaydan geliyor ve her biri ENJEKSIYONLA
// dogrulaniyor: bozuk girdi verilip REDDEDILDIGI goruluyor.
//
//   cd backend && npx tsx src/solPay.test.mts

import crypto from 'node:crypto';
import { prisma } from './db.js';

const HAZINE = 'TreasuryTestAddr1111111111111111111111111111';
const OYUNCU = 'PlayerTestAddr11111111111111111111111111111';
const BASKASI = 'OtherTestAddr111111111111111111111111111111';
const IMZA = '5'.repeat(88);

process.env.TREASURY_ADDRESS = HAZINE;
process.env.RPC_URLS = 'http://sahte-rpc.local';

const { MAX_YAS_SN, OdemeHatasi, odemeDogrula, solRayiAcik } = await import('./solPay.js');

const FAIL: string[] = [];
const check = (n: string, ok: boolean, d = '') => {
  console.log(`  ${ok ? 'OK ' : 'X  '} ${n}${d ? ` - ${d}` : ''}`);
  if (!ok) FAIL.push(n);
};

/** Sahte zincir yaniti kur - RPC katmani `fetch` kullaniyor, onu degistiriyoruz */
interface Kurgu {
  err?: unknown;
  keys?: string[];
  pre?: number[];
  post?: number[];
  blockTime?: number | null;
  bos?: boolean;
}
function zinciriKur(k: Kurgu) {
  const keys = k.keys ?? [OYUNCU, HAZINE];
  const sonuc = k.bos ? null : {
    meta: {
      err: k.err ?? null,
      preBalances: k.pre ?? [10 * 1e9, 1 * 1e9],
      postBalances: k.post ?? [10 * 1e9 - 0.12 * 1e9, 1 * 1e9 + 0.1125 * 1e9],
    },
    transaction: { message: { accountKeys: keys.map((pubkey) => ({ pubkey })) } },
    blockTime: k.blockTime === undefined ? Math.floor(Date.now() / 1000) - 5 : k.blockTime,
  };
  globalThis.fetch = (async () => new Response(
    JSON.stringify({ jsonrpc: '2.0', id: 1, result: sonuc }),
    { status: 200, headers: { 'content-type': 'application/json' } },
  )) as typeof fetch;
}

/** Cagriyi calistir, hata kodunu don (basariliysa null) */
async function kod(f: () => Promise<unknown>): Promise<string | null> {
  try { await f(); return null; } catch (e) {
    return e instanceof OdemeHatasi ? e.code : `beklenmeyen: ${String(e).slice(0, 40)}`;
  }
}

const BEKLENEN = Math.round(0.1125 * 1e9);

console.log('\n=== SOL ODEME DOGRULAMA ===');

console.log('\n[1] KAPI YAPILANDIRMAYA BAGLI');
{
  check('hazine + RPC varken ray ACIK', solRayiAcik());
  // IKISI BIRDEN GEREKIYOR: genel RPC ucu sert hiz sinirli; odeme
  // dogrulamasi orada duserse oyuncunun parasi gider ve urun gelmez.
  const eskiRpc = process.env.RPC_URLS;
  process.env.RPC_URLS = '';
  check('RPC yoksa ray KAPALI (cift tarafli)', !solRayiAcik());
  process.env.RPC_URLS = eskiRpc;
  const eskiHaz = process.env.TREASURY_ADDRESS;
  process.env.TREASURY_ADDRESS = '';
  check('hazine adresi yoksa ray KAPALI', !solRayiAcik());
  process.env.TREASURY_ADDRESS = eskiHaz;
}

console.log('\n[2] ** BASARISIZ ISLEM REDDEDILIYOR (42 SOL dersi)');
{
  zinciriKur({ err: { InstructionError: [0, 'Custom'] } });
  const c = await kod(() => odemeDogrula(IMZA, OYUNCU, BEKLENEN));
  check('meta.err doluysa REDDEDILIYOR', c === 'islem_basarisiz', String(c));

  // CIFT TARAFLI: ayni kurgu err olmadan GECMELI, yoksa test her seye
  // "reddedildi" diyor olabilirdi.
  zinciriKur({});
  const g = await kod(() => odemeDogrula(IMZA, OYUNCU, BEKLENEN));
  check('basarili islem GECIYOR (kontrol grubu)', g === null, String(g));
}

console.log('\n[3] ** BAKIYE FARKI OLCULUYOR, iddia degil');
{
  // Instruction "ne yapilmak istendigini" soyler; pre/postBalances ne
  // OLDUGUNU soyler. Somurulen fark tam olarak budur.
  zinciriKur({ post: [10 * 1e9, 1 * 1e9 + 0.001 * 1e9] });
  const c = await kod(() => odemeDogrula(IMZA, OYUNCU, BEKLENEN));
  check('hazineye az para girdiyse REDDEDILIYOR', c === 'tutar_yetersiz', String(c));

  zinciriKur({ post: [10 * 1e9, 1 * 1e9 + 0.5 * 1e9] });
  let fazla: number | null = null;
  try { fazla = (await odemeDogrula(IMZA, OYUNCU, BEKLENEN)).lamports; } catch { /* yok */ }
  check('fazla odeme kabul ediliyor ve GERCEK tutar donuyor',
    fazla === Math.round(0.5 * 1e9), String(fazla));

  // Hazine islemde hic yoksa
  zinciriKur({ keys: [OYUNCU, BASKASI], pre: [1e9, 1e9], post: [1e9, 2e9] });
  const y = await kod(() => odemeDogrula(IMZA, OYUNCU, BEKLENEN));
  check('hazine islemde yoksa REDDEDILIYOR', y === 'hazine_yok', String(y));
}

console.log('\n[4] ** ODEYEN, OTURUMU ACAN OYUNCU OLMALI');
{
  // Olmasaydi biri BASKASININ islemini kendi hesabina saydirabilirdi:
  // zincirde gecerli, tek kullanimlik kontrolunden de gecer, ve parayi
  // odeyen kisi urununu ALAMAZ.
  zinciriKur({ keys: [BASKASI, HAZINE] });
  const c = await kod(() => odemeDogrula(IMZA, OYUNCU, BEKLENEN));
  check('baskasinin islemi REDDEDILIYOR', c === 'odeyen_farkli', String(c));
}

console.log('\n[5] YAS SINIRI');
{
  // Olmadan, oyuncunun aylar once hazineye yaptigi herhangi bir transfer
  // bugun bir urune cevrilebilirdi.
  zinciriKur({ blockTime: Math.floor(Date.now() / 1000) - (MAX_YAS_SN + 60) });
  const c = await kod(() => odemeDogrula(IMZA, OYUNCU, BEKLENEN));
  check('cok eski islem REDDEDILIYOR', c === 'islem_cok_eski', String(c));

  zinciriKur({ blockTime: Math.floor(Date.now() / 1000) - (MAX_YAS_SN - 60) });
  const g = await kod(() => odemeDogrula(IMZA, OYUNCU, BEKLENEN));
  check('sinirin icindeki islem GECIYOR (cift tarafli)', g === null, String(g));

  // blockTime yoksa reddetmiyoruz - asil koruma tek kullanimlik imza
  zinciriKur({ blockTime: null });
  const n = await kod(() => odemeDogrula(IMZA, OYUNCU, BEKLENEN));
  check('blockTime yoksa reddedilmiyor', n === null, String(n));
}

console.log('\n[6] BOZUK GIRDI');
{
  zinciriKur({});
  check('gecersiz imza bicimi reddediliyor',
    (await kod(() => odemeDogrula('kisa', OYUNCU, BEKLENEN))) === 'gecersiz_imza');
  check('imza olmayan tur reddediliyor',
    (await kod(() => odemeDogrula(null, OYUNCU, BEKLENEN))) === 'gecersiz_imza');
  check('sifir tutar reddediliyor',
    (await kod(() => odemeDogrula(IMZA, OYUNCU, 0))) === 'gecersiz_tutar');
  zinciriKur({ bos: true });
  // "Henuz gorulmedi" ile "yok" AYNI SEY DEGIL - oyuncu tekrar denemeli
  check('islem henuz gorunmuyorsa 409 (tekrar dene)',
    (await kod(() => odemeDogrula(IMZA, OYUNCU, BEKLENEN))) === 'islem_bulunamadi');
}

console.log('\n[7] ** IMZA TEK KULLANIMLIK - veritabani seviyesinde');
{
  /**
   * Uygulama kodu yarisir, benzersiz indeks yarismaz. Ayni zincir
   * odemesiyle iki urun alinmasinin onundeki TEK gercek engel bu satir.
   */
  const s = `TESTSIG_${Date.now()}`;
  const yaz = () => prisma.payment.create({
    data: { id: crypto.randomUUID(), sig: s, wallet: OYUNCU, lamports: 1, product: 'test' },
  });
  await yaz();
  let ikinci = 'gecti';
  try { await yaz(); } catch { ikinci = 'reddedildi'; }
  check('ayni imza IKINCI kez yazilamiyor', ikinci === 'reddedildi', ikinci);

  // CIFT TARAFLI: farkli imza gecmeli
  let farkli = 'reddedildi';
  try {
    await prisma.payment.create({
      data: { id: crypto.randomUUID(), sig: `${s}_b`, wallet: OYUNCU, lamports: 1, product: 'test' },
    });
    farkli = 'gecti';
  } catch { /* yok */ }
  check('farkli imza geciyor (kontrol grubu)', farkli === 'gecti');

  await prisma.payment.deleteMany({ where: { sig: { startsWith: 'TESTSIG_' } } });
}

console.log(`\n${FAIL.length === 0 ? 'SOL ODEME DOGRULAMA SAGLAM' : `${FAIL.length} BASARISIZ: ${FAIL.join(', ')}`}\n`);
process.exit(FAIL.length === 0 ? 0 : 1);
