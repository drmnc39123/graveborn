// SOLANA RPC — sağlayıcı bağımsız, YEDEKLİ.
//
// ⚠️ NİYE BİR MODÜL: bu projede bugüne kadar HİÇ zincir bağımlılığı yoktu
// (cüzdan girişi yalnız imza doğrulaması, `auth.ts`). İlk zincir okuması
// hold-to-play eşiğiyle geliyor ve tek bir sağlayıcıya bağlanmak, o
// sağlayıcı düşünce ya da ücretli kotayı doldurunca eşiği bir DUVARA
// çevirirdi — kullanıcı zaten "Helius bir yerden sonra ücretli, ikincil
// seçenek olsun" diye sordu. Uçlar sırayla deneniyor.
//
// ⚠️ `@solana/web3.js` BİLEREK EKLENMEDİ. İhtiyacımız olan tek şey iki
// JSON-RPC çağrısı; kütüphane 3 MB bağımlılık ve kendi sürüm takvimini
// getirirdi. Düz `fetch` yeterli.
//
// ⚠️ VARSAYILAN GENEL UÇ ÜRETİM İÇİN YETERLİ DEĞİL.
// `api.mainnet-beta.solana.com` sert hız sınırlı ve SLA'sız; yalnız
// geliştirme ve "hiç yapılandırılmadıysa yine de çalışsın" için var.
// Eşik açılacağı gün `RPC_URLS` mutlaka özel bir sağlayıcıyla doldurulmalı
// (Helius/QuickNode/Triton) ve ikinci bir uç yedek olarak eklenmeli.

const VARSAYILAN_UCLAR = ['https://api.mainnet-beta.solana.com'];

/** `RPC_URLS` virgülle çoklu; sıra ÖNEMLİ — ilki birincil, sonrakiler yedek. */
export function rpcUclari(): string[] {
  const ham = (process.env.RPC_URLS ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  return ham.length ? ham : VARSAYILAN_UCLAR;
}

/** Özel bir sağlayıcı tanımlanmış mı — açılış kontrol listesi bunu sorar. */
export function rpcYapilandirildi(): boolean {
  return (process.env.RPC_URLS ?? '').trim().length > 0;
}

export class RpcHatasi extends Error {}

const ZAMAN_ASIMI_MS = 6000;

/**
 * Tek bir JSON-RPC çağrısı — uçları SIRAYLA dener.
 *
 * ⚠️ HATA YUTULMUYOR, SONUNCUSU FIRLATILIYOR. Sessizce `null` dönmek,
 * "RPC çöktü" ile "bakiye gerçekten 0" durumlarını aynı şeye çevirirdi ve
 * eşik kapısı bunları TERS yönde karıştırırdı (bkz. `hold.ts`: RPC
 * ulaşılamazken kapı AÇIK bırakılıyor, kapalı değil).
 *
 * ⚠️ Zaman aşımı ŞART: yanıt vermeyen bir uç, `fetch`in kendi varsayılanı
 * olmadığı için isteği süresiz asardı ve oyuncunun isteği de onunla asılırdı.
 */
export async function rpcCagir<T>(method: string, params: unknown[]): Promise<T> {
  const uclar = rpcUclari();
  let sonHata: unknown = null;

  for (const url of uclar) {
    const iptal = new AbortController();
    const saat = setTimeout(() => iptal.abort(), ZAMAN_ASIMI_MS);
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
        signal: iptal.signal,
      });
      if (!res.ok) throw new RpcHatasi(`${url} → HTTP ${res.status}`);
      const gelen = (await res.json()) as { result?: T; error?: { message?: string } };
      // ⚠️ HTTP 200 + gövdede `error` MÜMKÜN — JSON-RPC hatayı 200 ile döner.
      // Yalnız `res.ok`a bakmak, hata gövdesini geçerli sonuç sayardı.
      if (gelen.error) throw new RpcHatasi(`${url} → ${gelen.error.message ?? 'rpc hatası'}`);
      if (gelen.result === undefined) throw new RpcHatasi(`${url} → boş sonuç`);
      return gelen.result;
    } catch (e) {
      sonHata = e;
      // sıradaki uca geç — bu uç düşmüş, kotası dolmuş ya da yavaş
    } finally {
      clearTimeout(saat);
    }
  }
  throw new RpcHatasi(
    `hiçbir RPC ucu yanıt vermedi (${uclar.length} denendi): ${String(sonHata)}`,
  );
}

interface TokenHesabi {
  account: { data: { parsed: { info: { tokenAmount: { amount: string } } } } };
}

/**
 * Bir cüzdanın verilen mint'ten TOPLAM bakiyesi — ham birim (decimals YOK).
 *
 * ⚠️ TEK HESAP VARSAYILMIYOR. Bir cüzdanın aynı mint için birden çok token
 * hesabı olabilir (eski ATA + yeni ATA, ya da elle açılmış hesaplar);
 * yalnız ilkini okumak bakiyeyi OLDUĞUNDAN AZ gösterir ve eşiği geçen
 * oyuncuyu haksız yere dışarıda bırakır. Hepsi toplanıyor.
 *
 * ⚠️ Dönüş `bigint`: token miktarları `Number.MAX_SAFE_INTEGER`ı rahatça
 * aşıyor (9 decimals × milyarlık arz).
 */
export async function splBakiye(wallet: string, mint: string): Promise<bigint> {
  const sonuc = await rpcCagir<{ value: TokenHesabi[] }>('getTokenAccountsByOwner', [
    wallet,
    { mint },
    { encoding: 'jsonParsed', commitment: 'confirmed' },
  ]);
  let toplam = 0n;
  for (const h of sonuc.value ?? []) {
    const ham = h?.account?.data?.parsed?.info?.tokenAmount?.amount;
    if (typeof ham === 'string' && /^\d+$/.test(ham)) toplam += BigInt(ham);
  }
  return toplam;
}
