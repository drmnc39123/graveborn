// RPC YEDEKLEME MUHRU.
//
// Bu katman GERCEK PARANIN dogrulandigi yer: `odemeDogrula` zinciri buradan
// okuyor. Bir RPC ucu duserse oyuncu parayi ZATEN GONDERMIS olur ve urununu
// bekliyordur — beklemenin en pahali oldugu an tam olarak burasi.
//
// 🔴 UC KURAL:
//   1. DUSMUS UC BIR SURE ATLANIR. Eski surum HER istekte 1. uctan
//      basliyordu; birincil oluyse her odeme once 6 sn zaman asimini
//      oduyordu.
//   2. CEZA KALICI DEGIL. Sure dolunca uc yeniden denenir — gecici bir
//      kesintiden sonra ucret odedigimiz saglayiciya bir daha hic
//      donmemek olurdu.
//   3. ISTEGIN SUCU ile UCUN SUCU AYRILIR. Bozuk bir parametre her ucta
//      ayni cevabi verir; onu ucun sucu saymak tek bir istemci hatasiyla
//      butun altyapiyi devre disi birakirdi.
//
//   cd backend && npx tsx src/rpc.test.mts

const FAIL: string[] = [];
const check = (n: string, ok: boolean, d = '') => {
  console.log(`  ${ok ? 'OK ' : 'X  '} ${n}${d ? ` - ${d}` : ''}`);
  if (!ok) FAIL.push(n);
};

const A = 'https://uc-a.test';
const B = 'https://uc-b.test';
process.env.RPC_URLS = `${A},${B}`;

const { RpcHatasi, mainnetUcuMu, rpcCagir, rpcCezalariSifirla, rpcSaglik, rpcUclari } = await import('./rpc.js');

/** Hangi uca kac istek gitti */
let cagrilar: string[] = [];
/** url -> nasil davransin */
let davranis = new Map<string, 'ok' | 'http500' | 'kota' | 'bozukParam' | 'as'>();

function agiKur() {
  globalThis.fetch = (async (url: string | URL, init?: RequestInit) => {
    const u = String(url);
    cagrilar.push(u);
    const d = davranis.get(u) ?? 'ok';
    if (d === 'as') {
      /**
       * ⚠️ ALET HATASI DUZELTILDI: ilk surum hic cozulmeyen bir soz
       * donduruyordu ve test SONSUZA KADAR asiliyordu. Gercek `fetch`
       * `signal` dinler ve iptal edilince REDDEDER; sahte olan da oyle
       * yapmali, yoksa urunun zaman asimi mekanizmasi hic calismaz ve
       * "olmayan bir hata" olcmus oluruz.
       */
      return new Promise<Response>((_, red) => {
        const sig = init?.signal;
        if (sig?.aborted) { red(new Error('AbortError')); return; }
        sig?.addEventListener('abort', () => red(new Error('AbortError')));
      });
    }
    if (d === 'http500') return new Response('bozuk', { status: 500 });
    const govde = d === 'kota'
      ? { jsonrpc: '2.0', id: 1, error: { message: 'Too many requests, rate limit exceeded' } }
      : d === 'bozukParam'
        ? { jsonrpc: '2.0', id: 1, error: { message: 'Invalid param: could not parse signature' } }
        : { jsonrpc: '2.0', id: 1, result: { deger: u } };
    return new Response(JSON.stringify(govde), {
      status: 200, headers: { 'content-type': 'application/json' },
    });
  }) as typeof fetch;
}

function sifirla() {
  cagrilar = [];
  davranis = new Map();
  rpcCezalariSifirla();
  agiKur();
}

const cagir = async () => {
  try { return { ok: true, v: await rpcCagir<{ deger: string }>('getSlot', []) }; }
  catch (e) { return { ok: false, hata: String((e as Error).message).slice(0, 60) }; }
};

console.log('\n=== RPC YEDEKLEME ===');
console.log(`     uclar: ${rpcUclari().join(' , ')}`);

console.log('\n[1] SIRA VE TEMEL YEDEKLEME');
{
  sifirla();
  const r = await cagir();
  check('birincil calisiyorsa oraya gidiyor', r.ok && cagrilar.length === 1 && cagrilar[0] === A,
    cagrilar.join(' → '));

  sifirla();
  davranis.set(A, 'http500');
  const r2 = await cagir();
  check('birincil duserse IKINCILE geciyor',
    r2.ok && (r2 as { v: { deger: string } }).v.deger === B, cagrilar.join(' → '));

  sifirla();
  davranis.set(A, 'http500');
  davranis.set(B, 'http500');
  const r3 = await cagir();
  check('hepsi duserse hata firlatiyor (sessizce null DEGIL)', !r3.ok);
  // ⚠️ Sessizce `null` donmek "RPC coktu" ile "sonuc gercekten yok"u ayni
  // seye cevirirdi ve odeme dogrulamasi bunlari TERS yonde karistirirdi.
  check('hata mesaji kac uc denendigini soyluyor',
    !r3.ok && /2 denendi/.test(r3.hata ?? ''), r3.ok ? '' : r3.hata);
}

console.log('\n[2] ** DUSMUS UC SONRAKI ISTEKTE ATLANIYOR');
{
  /**
   * 🔴 ASIL DUZELTME. Eski surum her istekte 1. uctan basliyordu: birincil
   * oluyse HER odeme dogrulamasi once zaman asimini oduyordu.
   */
  sifirla();
  davranis.set(A, 'http500');
  await cagir();                    // A duser, B calisir
  const oncekiSayi = cagrilar.length;
  cagrilar = [];
  await cagir();                    // ikinci istek A'yi HIC denememeli
  check('ikinci istek dusmus ucu HIC denemiyor',
    !cagrilar.includes(A) && cagrilar.includes(B),
    `1. istek ${oncekiSayi} cagri · 2. istek ${cagrilar.join(' → ')}`);

  const s = rpcSaglik();
  check('saglik tablosu cezayi gosteriyor',
    s[0].cezali && s[0].kalanSn > 0 && !s[1].cezali,
    `${s[0].url} ${s[0].kalanSn}sn`);
}

console.log('\n[3] ** CEZA KALICI DEGIL');
{
  /**
   * Gecici bir kesintiden sonra ucret odedigimiz saglayiciya bir daha hic
   * donmemek, cezayi bir surgune cevirirdi.
   */
  sifirla();
  davranis.set(A, 'http500');
  await cagir();
  const ceza = rpcSaglik()[0];
  check('ceza sonlu bir sure', ceza.kalanSn > 0 && ceza.kalanSn <= 120, `${ceza.kalanSn}sn`);

  // Ceza suresi gecmis gibi davran
  const gelecek = Date.now() + 120_000;
  const sonra = rpcSaglik(gelecek);
  check('sure dolunca uc yeniden sirada', !sonra[0].cezali);
}

console.log('\n[4] ** UC IYILESINCE CEZASI KALKIYOR');
{
  sifirla();
  davranis.set(A, 'http500');
  await cagir();
  check('A cezali', rpcSaglik()[0].cezali);
  // A duzeldi ve ceza suresi doldu diyelim: bir sonraki basarili cagri affetmeli
  rpcCezalariSifirla();
  davranis.set(A, 'ok');
  cagrilar = [];
  await cagir();
  check('duzelen uc yeniden birincil (cift tarafli)',
    cagrilar[0] === A && !rpcSaglik()[0].cezali, cagrilar.join(' → '));
}

console.log('\n[5] ** ISTEGIN SUCU ile UCUN SUCU AYRILIYOR');
{
  /**
   * 🔴 Bozuk bir parametre HER ucta ayni cevabi verir. Eski surum yine de
   * hepsini deniyordu: tek bir istemci hatasi butun uclara birer istek
   * atiyor, kotalari bos yere yakiyor ve cezalandiriyordu.
   */
  sifirla();
  davranis.set(A, 'bozukParam');
  davranis.set(B, 'bozukParam');
  const r = await cagir();
  check('bozuk parametre TEK uca gidiyor', cagrilar.length === 1, cagrilar.join(' → '));
  check('bozuk parametre hata firlatiyor', !r.ok);
  check('bozuk parametre ucu CEZALANDIRMIYOR',
    !rpcSaglik()[0].cezali && !rpcSaglik()[1].cezali);
  check('hata mesaji ucun degil ISTEGIN sorununu soyluyor',
    !r.ok && /Invalid param/.test(r.hata ?? ''), r.ok ? '' : r.hata);

  // CIFT TARAFLI: kota hatasi UCUN sucu — atlanmali ve cezalandirilmali
  sifirla();
  davranis.set(A, 'kota');
  const r2 = await cagir();
  check('kota hatasi sonraki uca geciyor', r2.ok && cagrilar.length === 2, cagrilar.join(' → '));
  check('kota hatasi ucu CEZALANDIRIYOR', rpcSaglik()[0].cezali);
}

console.log('\n[6] ZAMAN ASIMI DA CEZA');
{
  /**
   * Yanit vermeyen bir uc, `fetch`in kendi varsayilani olmadigi icin istegi
   * SURESIZ asardi. Zaman asimi hem kesiliyor hem cezalandiriliyor.
   */
  sifirla();
  davranis.set(A, 'as');
  const t0 = Date.now();
  const r = await cagir();
  const gecen = Date.now() - t0;
  check('asili kalan uc kesiliyor ve yedege geciliyor', r.ok, `${gecen}ms`);
  check('zaman asimi ucu cezalandiriyor', rpcSaglik()[0].cezali);
  // Ikinci istek artik beklememeli — asil kazanc bu
  cagrilar = [];
  const t1 = Date.now();
  await cagir();
  const gecen2 = Date.now() - t1;
  check('ikinci istek ARTIK BEKLEMIYOR', gecen2 < 1000 && !cagrilar.includes(A),
    `${gecen2}ms (ilkinde ${gecen}ms)`);
}

console.log('\n[7] ANAHTAR SIZDIRILMIYOR');
{
  /**
   * ⚠️ Helius gibi saglayicilarda API anahtari URL'nin ICINDE. Operator
   * panelinde tam URL gostermek, anahtari ekrana basmak olurdu.
   */
  const eski = process.env.RPC_URLS;
  process.env.RPC_URLS = 'https://mainnet.helius-rpc.com/?api-key=GIZLI-ANAHTAR-123';
  const s = rpcSaglik();
  check('api anahtari maskelenmis', !/GIZLI-ANAHTAR-123/.test(s[0].url), s[0].url);
  check('gerisi okunur kaliyor (cift tarafli)', /helius-rpc\.com/.test(s[0].url), s[0].url);
  process.env.RPC_URLS = eski;
}

console.log('\n[8] ** MAINNET DISI UC REDDEDILIYOR - gercek para acigi');
{
  /**
   * 🔴 OLCULDU (2026-09-09): elimizdeki Helius anahtari mainnet'te 403
   * veriyor ama DEVNET'te 200 donuyor. Yani "calisan" bir devnet URL'si
   * elimizin altinda ve yanlislikla RPC_URLS'e konmasi cok kolay.
   *
   * Bedeli: DEVNET SOL BEDAVA. Kendine airdrop yapan biri hazineye devnet'te
   * 0,5 SOL gonderir; biz devnet'e baktigimiz icin `odemeDogrula`nin BUTUN
   * kontrolleri temiz gecer (islem gercekten basarili, sadece yanlis agda)
   * ve sezon karti bedava dagitilir.
   */
  check('devnet reddediliyor', !mainnetUcuMu('https://devnet.helius-rpc.com/?api-key=x'));
  check('testnet reddediliyor', !mainnetUcuMu('https://api.testnet.solana.com'));
  check('localhost reddediliyor',
    !mainnetUcuMu('http://localhost:8899') && !mainnetUcuMu('http://127.0.0.1:8899'));
  check('?cluster=devnet reddediliyor', !mainnetUcuMu('https://x.example.com/rpc?cluster=devnet'));

  // ⚠️ CIFT TARAFLI: mainnet uclari GECMELI, yoksa kontrol her seyi eler
  check('mainnet gecerli (kontrol grubu)',
    mainnetUcuMu('https://mainnet.helius-rpc.com/?api-key=x')
    && mainnetUcuMu('https://api.mainnet-beta.solana.com')
    && mainnetUcuMu('https://solana-rpc.publicnode.com'));

  // Listeden SUZULUYOR mu
  const eski = process.env.RPC_URLS;
  process.env.RPC_URLS = 'https://devnet.helius-rpc.com/?api-key=x,https://solana-rpc.publicnode.com';
  const kalan = rpcUclari();
  check('devnet listeden ATILIYOR', !kalan.some((u) => /devnet/.test(u)), kalan.join(' , '));
  check('mainnet ucu KALIYOR', kalan.some((u) => /publicnode/.test(u)));

  /**
   * ⚠️ HEPSI DEVNET ISE varsayilan MAINNET ucuna dusuluyor — bos liste
   * donmek "hicbir uc yok" demek olurdu ve o da kotu, ama devnet'e
   * baglanmaktan iyi. Onemli olan: ASLA devnet kullanilmiyor.
   */
  process.env.RPC_URLS = 'https://devnet.helius-rpc.com/?api-key=x';
  const hepsiDevnet = rpcUclari();
  check('hepsi devnet ise MAINNET varsayilanina dusuluyor',
    hepsiDevnet.every(mainnetUcuMu) && hepsiDevnet.length > 0, hepsiDevnet.join(' , '));
  process.env.RPC_URLS = eski;
}

console.log(`\n${FAIL.length === 0 ? 'RPC YEDEKLEME SAGLAM' : `${FAIL.length} BASARISIZ: ${FAIL.join(', ')}`}\n`);
process.exit(FAIL.length === 0 ? 0 : 1);
