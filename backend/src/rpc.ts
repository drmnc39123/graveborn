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

export class RpcHatasi extends Error {
  /**
   * ⚠️ ISTEGIN kendi hatasi mi (bozuk parametre) yoksa UCUN sorunu mu
   * (kota, kesinti)? Ilki her ucta ayni cevabi verir; digerlerini denemek
   * kotalari bos yere yakar.
   */
  istekHatasi: boolean;
  constructor(mesaj: string, opt?: { istekHatasi?: boolean }) {
    super(mesaj);
    this.istekHatasi = opt?.istekHatasi === true;
  }
}

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
/**
 * ⭐ DUSMUS UCU BIR SURE ATLA — "sirali dene"nin eksik yarisi.
 *
 * 🔴 NIYE VAR: eski surum HER istekte 1. uctan basliyordu. Birincil uc
 * olduyse her odeme dogrulamasi once 6 saniyelik zaman asimini odemek
 * zorundaydi — ve bu tam olarak beklemenin en pahali oldugu an: oyuncu
 * parayi ZINCIRE GONDERMIS, urununu bekliyor.
 *
 * Ceza suresi boyunca o uc siranin disinda kalir; sure dolunca YENIDEN
 * DENENIR — kalici olarak dislamak, gecici bir kesintiden sonra ucret
 * odedigimiz saglayiciya bir daha hic donmemek olurdu.
 */
const CEZA_MS = 60_000;
const cezali = new Map<string, number>();

/** Denenecek uclar — cezalilar sona degil, DISARI atilir */
function siraliUclar(now = Date.now()): string[] {
  const hepsi = rpcUclari();
  const temiz = hepsi.filter((u) => (cezali.get(u) ?? 0) <= now);
  /**
   * ⚠️ HEPSI CEZALIYSA YINE DE DENE. Cezanin amaci beklemek degil SIRA
   * ATLAMAK; hicbir uc kalmayinca "hic deneme" demek, gecici bir toplu
   * kesintide kapiyi gereksiz yere kapali tutardi.
   */
  return temiz.length > 0 ? temiz : hepsi;
}

/** Bir ucu cezalandir — kesinti/kota/zaman asimi */
function cezalandir(url: string, now = Date.now()): void {
  cezali.set(url, now + CEZA_MS);
}

/** Uc calisti — cezasi varsa kalksin */
function affet(url: string): void {
  if (cezali.has(url)) cezali.delete(url);
}

/**
 * Bu JSON-RPC hatasi UCUN sorunu mu, ISTEGIN sorunu mu?
 *
 * ⚠️ AYRIM SART. Bozuk bir parametre ("Invalid param") her ucta AYNI cevabi
 * verir; onu ucun sucu sayarsak tek bir istemci hatasi butun uclari
 * cezalandirir ve saglam bir altyapiyi kendi elimizle devre disi
 * birakiriz. Kota/kapasite hatalari ise gercekten o uca ait.
 */
function ucunSucuMu(mesaj: string): boolean {
  return /rate|limit|quota|capacity|too many|429|busy|unavailable|timeout|exceeded/i.test(mesaj);
}

/** Uclarin o anki durumu — operatör gorunurlugu icin */
export function rpcSaglik(now = Date.now()): { url: string; cezali: boolean; kalanSn: number }[] {
  return rpcUclari().map((url) => {
    const bitis = cezali.get(url) ?? 0;
    return {
      // ⚠️ ANAHTAR SIZDIRILMIYOR: Helius gibi saglayicilarda API anahtari
      // URL'nin icinde. Operator panelinde tam URL gostermek onu ekrana
      // basmak olurdu.
      url: url.replace(/([?&](api-key|apikey|key)=)[^&]+/i, '$1***'),
      cezali: bitis > now,
      kalanSn: bitis > now ? Math.ceil((bitis - now) / 1000) : 0,
    };
  });
}

/** ⚠️ Yalniz test icin — cezalari sifirla */
export function rpcCezalariSifirla(): void { cezali.clear(); }

export async function rpcCagir<T>(method: string, params: unknown[]): Promise<T> {
  const uclar = siraliUclar();
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
      // ⚠️ HTTP hatasi UCUN sorunu: kota, kapali, yanlis yol. Cezalandir.
      if (!res.ok) { cezalandir(url); throw new RpcHatasi(`${url} → HTTP ${res.status}`); }
      const gelen = (await res.json()) as { result?: T; error?: { message?: string } };
      // ⚠️ HTTP 200 + gövdede `error` MÜMKÜN — JSON-RPC hatayı 200 ile döner.
      // Yalnız `res.ok`a bakmak, hata gövdesini geçerli sonuç sayardı.
      if (gelen.error) {
        const mesaj = gelen.error.message ?? 'rpc hatası';
        if (ucunSucuMu(mesaj)) {
          cezalandir(url);
          throw new RpcHatasi(`${url} → ${mesaj}`);
        }
        /**
         * 🔴 ISTEGIN SUCU — SIRADAKI UCU DENEME.
         *
         * Bozuk bir parametre her ucta ayni cevabi verir. Eski surum yine de
         * hepsini deniyordu: tek bir istemci hatasi butun uclara birer istek
         * atiyor, kotalari bos yere yakiyor ve hata mesajini SONUNCU ucun
         * mesajiyla degistiriyordu. Uc saglam, cevap kesin — burada bitir.
         */
        affet(url);
        throw new RpcHatasi(`${url} → ${mesaj}`, { istekHatasi: true });
      }
      if (gelen.result === undefined) { cezalandir(url); throw new RpcHatasi(`${url} → boş sonuç`); }
      affet(url);
      return gelen.result;
    } catch (e) {
      // ⚠️ Istek hatasi ZINCIRI KESER; ucun sucu olan hatada sirdaki uca gec.
      if (e instanceof RpcHatasi && e.istekHatasi) throw e;
      // ⚠️ `fetch` firlattiysa (ag hatasi / zaman asimi) uc sucludur.
      if (!(e instanceof RpcHatasi)) cezalandir(url);
      sonHata = e;
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
