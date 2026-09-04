// HOLD-TO-PLAY EŞİĞİ + RPC KATMANI TESTİ.
//
// ⚠️ NİYE SAHTE RPC: gerçek mainnet'e bağlı bir test, ölçtüğü şeyi değil
// o anki ağ durumunu ölçer. Bakiyeyi bilinen bir cüzdandan okumak da
// kırılgan — o cüzdanın bakiyesi yarın değişir ve test "kod bozuldu" der.
// Burada yerel bir HTTP sunucusu JSON-RPC yanıtı taklit ediyor; böylece
// ÇOK HESAP TOPLAMA, YEDEK UCA GEÇME ve KESİNTİDE KAPI YÖNÜ deterministik
// olarak ölçülebiliyor.
//
// ⚠️ Gerçek ağ YİNE DE bir kez yoklanıyor (en altta) ama BAŞARISIZ SAYMAZ:
// genel uç hız sınırlı, kırmızıya boyaması gereken şey bizim kodumuz değil.

import http from 'node:http';
import type { AddressInfo } from 'node:net';

const FAIL: string[] = [];
const check = (n: string, ok: boolean, d = '') => {
  console.log(`${ok ? '  ✓' : '  ✗'} ${n}${d ? ` — ${d}` : ''}`);
  if (!ok) FAIL.push(n);
};

const MINT = 'GRAVEtestMint1111111111111111111111111111111';
const CUZDAN = 'GRAVEtestWallet11111111111111111111111111111';

/** Sahte RPC — `hesaplar` içindeki ham miktarları jsonParsed biçiminde döner */
function sahteRpc(hesaplar: string[]) {
  let istek = 0;
  const srv = http.createServer((req, res) => {
    istek++;
    let gövde = '';
    req.on('data', (c) => { gövde += c; });
    req.on('end', () => {
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify({
        jsonrpc: '2.0', id: 1,
        result: {
          value: hesaplar.map((amount) => ({
            account: { data: { parsed: { info: { tokenAmount: { amount } } } } },
          })),
        },
      }));
    });
  });
  return {
    srv,
    dinle: () => new Promise<string>((r) => {
      srv.listen(0, '127.0.0.1', () => r(`http://127.0.0.1:${(srv.address() as AddressInfo).port}`));
    }),
    kapat: () => new Promise((r) => srv.close(r)),
    get istekSayisi() { return istek; },
  };
}

/** Ortamı temiz kur — modüller env'i çağrı anında okuyor, import anında değil */
async function kur(env: Record<string, string | undefined>) {
  for (const [k, v] of Object.entries(env)) {
    if (v === undefined) delete process.env[k]; else process.env[k] = v;
  }
  const hold = await import('./hold.js');
  hold.esikOnbellegiTemizle();
  return hold;
}

console.log('\n[1] EŞİK VARSAYILAN OLARAK KAPALI');
{
  const hold = await kur({ TOKEN_MINT: undefined, HOLD_MIN: undefined, RPC_URLS: undefined });
  check('TOKEN_MINT yokken eşik kapalı', !hold.esikAcikMi());
  const r = await hold.esikKontrol(CUZDAN);
  // ⚠️ Bu, betanın davranışının HİÇ değişmediğinin kanıtı. Kapı varsayılan
  // olarak açık olmasaydı, token'sız beta ilk gün ilan açamazdı.
  check('kapalı eşik her cüzdanı geçiriyor', r.ok && r.sebep === 'kapali');
}

console.log('\n[2] YALNIZ BİR DEĞİŞKEN YETMEZ');
{
  const a = await kur({ TOKEN_MINT: MINT, HOLD_MIN: undefined });
  check('TOKEN_MINT var, HOLD_MIN yok → kapalı', !a.esikAcikMi());
  const b = await kur({ TOKEN_MINT: undefined, HOLD_MIN: '1000' });
  check('HOLD_MIN var, TOKEN_MINT yok → kapalı', !b.esikAcikMi());
  const c = await kur({ TOKEN_MINT: MINT, HOLD_MIN: '0' });
  check('HOLD_MIN=0 → kapalı', !c.esikAcikMi());
  // ⚠️ Kesirli/çöp değer sessizce yuvarlanmamalı; eşik kapanmalı.
  const d = await kur({ TOKEN_MINT: MINT, HOLD_MIN: '0.5' });
  check('HOLD_MIN geçersizse eşik KAPALI (sessiz yuvarlama yok)', !d.esikAcikMi());
}

console.log('\n[3] BAKİYE OKUMA — ÇOK HESAP TOPLANIYOR');
{
  // Bir cüzdanın aynı mint için birden çok token hesabı olabilir; yalnız
  // ilkini okumak eşiği geçen oyuncuyu haksız yere dışarıda bırakırdı.
  const rpc = sahteRpc(['600000000000', '500000000000']);   // 600 + 500 = 1100 (9 basamak)
  const url = await rpc.dinle();
  const hold = await kur({ TOKEN_MINT: MINT, HOLD_MIN: '1000', RPC_URLS: url, HOLD_FAIL_CLOSED: undefined });
  check('eşik açık', hold.esikAcikMi());
  const r = await hold.esikKontrol(CUZDAN);
  check('iki hesap toplanıyor (1100 ≥ 1000)', r.ok && r.sebep === 'gecti', `bulunan=${r.bulunan}`);
  check('toplam doğru', r.bulunan === 1100000000000n, String(r.bulunan));

  // ⚠️ ÇİFT TARAFLI: eşiği yükselt, AYNI bakiye artık yetmemeli. Bu
  // olmadan "hep geçen" bir kapı da testi geçerdi.
  const hold2 = await kur({ TOKEN_MINT: MINT, HOLD_MIN: '2000', RPC_URLS: url });
  const r2 = await hold2.esikKontrol(CUZDAN);
  check('eşik yükselince AYNI bakiye reddediliyor', !r2.ok && r2.sebep === 'yetersiz');
  await rpc.kapat();
}

console.log('\n[4] ÖNBELLEK — RPC her istekte yakılmıyor');
{
  const rpc = sahteRpc(['5000000000000']);
  const url = await rpc.dinle();
  const hold = await kur({ TOKEN_MINT: MINT, HOLD_MIN: '1000', RPC_URLS: url });
  await hold.esikKontrol(CUZDAN);
  await hold.esikKontrol(CUZDAN);
  await hold.esikKontrol(CUZDAN);
  check('3 kontrol → 1 RPC çağrısı', rpc.istekSayisi === 1, `${rpc.istekSayisi} istek`);
  // ⚠️ Önbellek TEMİZLENEBİLİR olmalı; yoksa eşik ayarı değiştiğinde eski
  // cevaplar yapışır ve operatör "değiştirdim ama çalışmıyor" der.
  hold.esikOnbellegiTemizle();
  await hold.esikKontrol(CUZDAN);
  check('temizlenince yeniden soruluyor', rpc.istekSayisi === 2, `${rpc.istekSayisi} istek`);
  await rpc.kapat();
}

console.log('\n[5] YEDEK UCA GEÇİŞ');
{
  const rpc = sahteRpc(['9000000000000']);
  const url = await rpc.dinle();
  // ⚠️ İlk uç KAPALI bir port — kullanıcının sorduğu asıl senaryo bu:
  // "Helius bir yerden sonra ücretli, ikincil seçenek var mı?"
  const olu = 'http://127.0.0.1:1';
  const hold = await kur({ TOKEN_MINT: MINT, HOLD_MIN: '1000', RPC_URLS: `${olu},${url}` });
  const r = await hold.esikKontrol(CUZDAN);
  check('birincil uç ölüyken YEDEK kullanılıyor', r.ok && r.sebep === 'gecti', r.sebep);
  await rpc.kapat();
}

console.log('\n[6] KESİNTİDE KAPININ YÖNÜ');
{
  const hold = await kur({ TOKEN_MINT: MINT, HOLD_MIN: '1000', RPC_URLS: 'http://127.0.0.1:1', HOLD_FAIL_CLOSED: undefined });
  const r = await hold.esikKontrol(CUZDAN);
  // Varsayılan AÇIK: sağlayıcı kesintisi, parasını ödemiş oyuncuyu
  // ekonomiden atmamalı. (Turnstile'ın tersi — gerekçe `hold.ts`te.)
  check('RPC yokken kapı AÇIK (varsayılan)', r.ok && r.sebep === 'rpc_yok', r.sebep);

  const hold2 = await kur({ TOKEN_MINT: MINT, HOLD_MIN: '1000', RPC_URLS: 'http://127.0.0.1:1', HOLD_FAIL_CLOSED: '1' });
  const r2 = await hold2.esikKontrol(CUZDAN);
  check('HOLD_FAIL_CLOSED=1 ile kapı KAPALI', !r2.ok && r2.sebep === 'rpc_yok', r2.sebep);
}

console.log('\n[7] JSON-RPC HATASI 200 İLE GELİR — sonuç sayılmamalı');
{
  const srv = http.createServer((_q, s) => {
    s.setHeader('content-type', 'application/json');
    s.end(JSON.stringify({ jsonrpc: '2.0', id: 1, error: { code: -32602, message: 'invalid param' } }));
  });
  const url = await new Promise<string>((r) => {
    srv.listen(0, '127.0.0.1', () => r(`http://127.0.0.1:${(srv.address() as AddressInfo).port}`));
  });
  const hold = await kur({ TOKEN_MINT: MINT, HOLD_MIN: '1000', RPC_URLS: url, HOLD_FAIL_CLOSED: '1' });
  const r = await hold.esikKontrol(CUZDAN);
  // ⚠️ Yalnız `res.ok`a bakan bir istemci bunu "boş sonuç = bakiye 0"
  // sanardı ve HERKESİ eşikten geçiremeyip reddederdi — ya da tersine,
  // hatayı geçerli sayıp herkesi geçirirdi. İkisi de sessiz.
  check('gövdedeki error sonuç sayılmıyor', r.sebep === 'rpc_yok', r.sebep);
  await new Promise((r) => srv.close(r));
}

console.log('\n[8] GERÇEK AĞ — bilgi amaçlı, başarısız SAYMAZ');
{
  delete process.env.RPC_URLS;
  const { rpcCagir, rpcYapilandirildi } = await import('./rpc.js');
  try {
    const h = await rpcCagir<string>('getHealth', []);
    console.log(`  · genel uç yanıt verdi: ${h}`);
  } catch (e) {
    console.log(`  · genel uca ulaşılamadı (test için sorun değil): ${String(e).slice(0, 90)}`);
  }
  console.log(`  · özel RPC yapılandırılmış mı: ${rpcYapilandirildi() ? 'evet' : 'HAYIR — eşik açılmadan önce RPC_URLS doldurulmalı'}`);
}

console.log(`\n${FAIL.length === 0 ? '✅ EŞİK KAPISI SAĞLAM' : `❌ ${FAIL.length} BAŞARISIZ: ${FAIL.join(', ')}`}\n`);
process.exit(FAIL.length === 0 ? 0 : 1);
