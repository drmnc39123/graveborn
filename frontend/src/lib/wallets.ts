'use client';
// CÜZDAN KEŞFİ — hangi cüzdanlar kurulu, hangisiyle giriliyor.
//
// 🔴 NİYE VAR: giriş SADECE Phantom'a bağlıydı. `getPhantom()` sağlayıcının
// `isPhantom` bayrağını arıyor, bulamazsa "No Phantom wallet found" diyordu.
// Yani Solflare, Backpack, OKX, Coinbase, Exodus kurulu bir oyuncu — cüzdanı
// gayet çalışır hâldeyken — kapıda geri çevriliyordu.
//
// ⭐ OYSA SUNUCUDA PHANTOM'A ÖZGÜ TEK SATIR YOK. `backend/src/auth.ts`
// `verifySignature` düz bir ed25519 doğrulaması yapıyor (tweetnacl) ve
// cüzdan adresini genel anahtar olarak kullanıyor. İmzayı hangi cüzdanın
// ürettiği sunucu için görünmez bile. Kapı teknik bir gerekçeyle değil,
// yalnızca frontend'de tek bir sağlayıcı adı yazıldığı için kapalıydı.
//
// İKİ KEŞİF YOLU birlikte kullanılıyor:
//   1. Wallet Standard (`wallet-standard:register-wallet`) — cüzdanların
//      kendilerini tanıttığı RESMİ yol. Burada isim listesi tutmuyoruz;
//      yarın çıkacak bir cüzdan da kod değişmeden görünür.
//   2. Eski `window.*` enjeksiyonu — Standard'ı desteklemeyen ya da geç
//      kaydolan cüzdanlar için ağ. Yalnız bu olsaydı liste hep bayat kalırdı.
//
// ⚠️ MOBİLDE EKLENTİ YOKTUR. Telefonun tarayıcısında hiçbir cüzdan enjekte
// edilmez; oyuncu cüzdanın KENDİ tarayıcısında siteyi açmalı. O yüzden
// keşif boş dönerse mobilde "derin bağlantı" düğmeleri gösteriliyor.

/** Arayüzün gördüğü tek cüzdan biçimi — eski/yeni ayrımı buradan sonra yok */
export interface Cuzdan {
  id: string;
  ad: string;
  /** Wallet Standard cüzdanları kendi ikonunu data-URI olarak verir */
  ikon?: string;
  kaynak: 'standart' | 'enjekte';
  baglan(): Promise<string>;
  imzala(mesaj: Uint8Array): Promise<Uint8Array>;
}

// ── ortak yardımcılar ──

/**
 * Baytları normalleştir.
 *
 * ⚠️ `instanceof Uint8Array` TEK BAŞINA YETMİYOR: cüzdan eklentisi kendi
 * JS bağlamında (realm) çalışır ve oradan gelen bir Uint8Array bizim
 * `Uint8Array`imizin örneği DEĞİLDİR. `ArrayBuffer.isView` bağlamdan
 * bağımsız çalışır — bu kontrol olmasaydı bazı cüzdanlarda imza sessizce
 * "okunamadı" olurdu.
 */
function baytlar(x: unknown): Uint8Array | null {
  if (x instanceof Uint8Array) return x;
  if (ArrayBuffer.isView(x)) {
    const v = x as ArrayBufferView;
    return new Uint8Array(v.buffer, v.byteOffset, v.byteLength);
  }
  if (Array.isArray(x) && x.every((n) => typeof n === 'number')) return Uint8Array.from(x as number[]);
  return null;
}

/**
 * İmza sonucundan ham baytı çıkar.
 *
 * ⚠️ CÜZDANLAR AYNI ŞEYİ FARKLI DÖNDÜRÜYOR: Phantom `{ signature }`,
 * bazıları doğrudan `Uint8Array`, bazıları sayı dizisi. Tek biçime burada
 * çevriliyor; yoksa her yeni cüzdan çağrı yerinde ayrı bir `if` isterdi.
 */
function imzaBaytlari(sonuc: unknown): Uint8Array {
  const dogrudan = baytlar(sonuc);
  if (dogrudan) return dogrudan;
  const s = baytlar((sonuc as { signature?: unknown } | null)?.signature);
  if (s) return s;
  throw new Error('imza_okunamadi');
}

/** Dedupe anahtarı — "Phantom" ile "Phantom Wallet" aynı cüzdandır */
export function adAnahtari(ad: string): string {
  return ad.toLowerCase().replace(/wallet/g, '').replace(/[^a-z0-9]/g, '');
}

// ── 1) WALLET STANDARD ──

interface StandartHesap { address: string; chains?: readonly string[] }
interface StandartCuzdan {
  name: string;
  icon?: string;
  chains?: readonly string[];
  accounts?: readonly StandartHesap[];
  features: Record<string, unknown>;
}
interface KayitApi { register(...cuzdanlar: StandartCuzdan[]): () => void }

const CONNECT = 'standard:connect';
const SIGN = 'solana:signMessage';

/** Solana zinciri + gereken iki yetenek yoksa bu cüzdanla giriş yapılamaz */
export function standartUygun(w: StandartCuzdan): boolean {
  const solana = (w.chains ?? []).some((c) => c.startsWith('solana:'));
  return solana && !!w.features?.[CONNECT] && !!w.features?.[SIGN];
}

const standartKayit = new Map<string, StandartCuzdan>();
let dinleyiciKuruldu = false;
const aboneler = new Set<() => void>();

function standartEkle(ws: StandartCuzdan[]) {
  let degisti = false;
  for (const w of ws) {
    if (!w?.name || !standartUygun(w)) continue;
    if (!standartKayit.has(w.name)) { standartKayit.set(w.name, w); degisti = true; }
  }
  if (degisti) for (const f of aboneler) f();
}

/**
 * Wallet Standard el sıkışması.
 *
 * ⚠️ İKİ YÖNLÜ OLMAK ZORUNDA: bizden ÖNCE yüklenen cüzdanlar olayı çoktan
 * atmıştır, bizden SONRA yüklenenler ise henüz atmamıştır. Yalnız dinleseydik
 * ilk grubu, yalnız duyursaydık ikinci grubu kaçırırdık. İkisi de yapılıyor.
 */
function standartDinle() {
  if (dinleyiciKuruldu || typeof window === 'undefined') return;
  dinleyiciKuruldu = true;
  const api: KayitApi = { register: (...ws) => { standartEkle(ws); return () => {}; } };
  try {
    window.addEventListener('wallet-standard:register-wallet', (e: Event) => {
      const cagir = (e as CustomEvent<(api: KayitApi) => void>).detail;
      try { cagir?.(api); } catch { /* bozuk cüzdan diğerlerini engellemesin */ }
    });
    window.dispatchEvent(new CustomEvent('wallet-standard:app-ready', { detail: api }));
  } catch { /* keşif başarısızsa enjekte yolu devrede */ }
}

function standartSar(w: StandartCuzdan): Cuzdan {
  let hesap: StandartHesap | null = null;
  return {
    id: `std:${w.name}`,
    ad: w.name,
    ikon: w.icon,
    kaynak: 'standart',
    async baglan() {
      const f = w.features[CONNECT] as { connect(): Promise<{ accounts?: readonly StandartHesap[] }> };
      const out = await f.connect();
      // ⚠️ Bazı cüzdanlar hesapları dönüşte değil, `w.accounts` üzerinde
      // günceller — ikisi de yoklanıyor.
      hesap = out?.accounts?.[0] ?? w.accounts?.[0] ?? null;
      if (!hesap?.address) throw new Error('hesap_yok');
      return hesap.address;
    },
    async imzala(mesaj) {
      if (!hesap) throw new Error('once_baglan');
      const f = w.features[SIGN] as {
        signMessage(input: { account: StandartHesap; message: Uint8Array }): Promise<readonly unknown[]>;
      };
      const [ilk] = await f.signMessage({ account: hesap, message: mesaj });
      return imzaBaytlari(ilk);
    },
  };
}

// ── 2) ESKİ window ENJEKSİYONU ──

interface EskiSaglayici {
  isPhantom?: boolean;
  publicKey?: { toString(): string } | null;
  connect(opts?: { onlyIfTrusted?: boolean }): Promise<{ publicKey?: { toString(): string } } | void>;
  signMessage(msg: Uint8Array, encoding?: string): Promise<unknown>;
}

/**
 * Bilinen enjeksiyon noktaları.
 *
 * ⚠️ BU LİSTE TAM DEĞİL ve olmak zorunda da değil — asıl keşif Wallet
 * Standard'da. Burası yalnız Standard'ı desteklemeyenler için ağ; listede
 * olmayan bir cüzdan yine de `window.solana` üzerinden yakalanıyor.
 */
const ENJEKTE: readonly { ad: string; yol: readonly string[] }[] = [
  { ad: 'Phantom', yol: ['phantom', 'solana'] },
  { ad: 'Solflare', yol: ['solflare'] },
  { ad: 'Backpack', yol: ['backpack'] },
  { ad: 'Magic Eden', yol: ['magicEden', 'solana'] },
  { ad: 'OKX', yol: ['okxwallet', 'solana'] },
  { ad: 'Coinbase', yol: ['coinbaseSolana'] },
  { ad: 'Trust', yol: ['trustwallet', 'solana'] },
  { ad: 'Exodus', yol: ['exodus', 'solana'] },
  { ad: 'Glow', yol: ['glowSolana'] },
  { ad: 'Brave', yol: ['braveSolana'] },
];

function yoldanAl(kok: unknown, yol: readonly string[]): unknown {
  let cur = kok;
  for (const p of yol) {
    if (!cur || typeof cur !== 'object') return null;
    cur = (cur as Record<string, unknown>)[p];
  }
  return cur;
}

function saglayiciMi(x: unknown): x is EskiSaglayici {
  const p = x as EskiSaglayici | null;
  return !!p && typeof p.connect === 'function' && typeof p.signMessage === 'function';
}

function eskiSar(ad: string, p: EskiSaglayici): Cuzdan {
  return {
    id: `inj:${ad}`,
    ad,
    kaynak: 'enjekte',
    async baglan() {
      const out = await p.connect();
      // ⚠️ Bazı sağlayıcılar `connect()`ten hiçbir şey döndürmez, yalnız
      // `provider.publicKey` alanını doldurur.
      const pk = (out as { publicKey?: { toString(): string } } | undefined)?.publicKey ?? p.publicKey;
      const adres = pk?.toString();
      if (!adres) throw new Error('hesap_yok');
      return adres;
    },
    async imzala(mesaj) {
      return imzaBaytlari(await p.signMessage(mesaj, 'utf8'));
    },
  };
}

// ── KEŞİF ──

/**
 * Kurulu cüzdanların listesi.
 *
 * ⚠️ SIRALAMA STANDARD ÖNCE: aynı cüzdan iki yoldan da görünürse Wallet
 * Standard sürümü tutuluyor, çünkü ikonu ve gerçek adı orada. Dedupe adla
 * yapılıyor; yoksa Phantom listede iki kez çıkardı.
 */
export function bulunanCuzdanlar(): Cuzdan[] {
  if (typeof window === 'undefined') return [];
  standartDinle();

  const bulunan: Cuzdan[] = [];
  const gorulen = new Set<string>();

  for (const w of standartKayit.values()) {
    const k = adAnahtari(w.name);
    if (gorulen.has(k)) continue;
    gorulen.add(k);
    bulunan.push(standartSar(w));
  }

  for (const { ad, yol } of ENJEKTE) {
    const k = adAnahtari(ad);
    if (gorulen.has(k)) continue;
    const p = yoldanAl(window, yol);
    if (!saglayiciMi(p)) continue;
    gorulen.add(k);
    bulunan.push(eskiSar(ad, p));
  }

  // ⚠️ SON ÇARE: tanımadığımız bir cüzdan `window.solana` üzerine oturmuş
  // olabilir. Adını bilmiyoruz ama girişi çalışır — kapıda bırakmanın anlamı
  // yok. `isPhantom` işaretliyse zaten yukarıda yakalandı.
  const genel = yoldanAl(window, ['solana']);
  if (bulunan.length === 0 && saglayiciMi(genel)) {
    bulunan.push(eskiSar('Solana Wallet', genel));
  }
  return bulunan;
}

/**
 * Keşif kaydını boşalt — YALNIZ mühür (test) için.
 *
 * ⚠️ Üretimde çağrılmıyor. `errorlog.hataSifirla()` ile aynı gerekçe: modül
 * durumu süreç ömrü boyunca birikiyor, testin her bölümü temiz bir masa
 * istiyor.
 */
export function kayitlariSifirla(): void { standartKayit.clear(); }

/** Yeni bir cüzdan geç kaydolursa arayüz kendini tazelesin */
export function cuzdanlariIzle(cb: () => void): () => void {
  standartDinle();
  aboneler.add(cb);
  return () => { aboneler.delete(cb); };
}

// ── MOBİL ──

/**
 * ⚠️ Telefonda eklenti YOKTUR. Mobil tarayıcıda hiçbir cüzdan enjekte
 * edilmez; oyuncu siteyi cüzdanın KENDİ tarayıcısında açmalı. Bu yüzden
 * mobilde "cüzdan bulunamadı" bir hata değil, beklenen durumdur — ve cevabı
 * "eklenti kur" değil, aşağıdaki derin bağlantılardır.
 */
export function mobilMi(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent || '';
  if (/Android|iPhone|iPod/i.test(ua)) return true;
  // iPad masaüstü kimliğiyle geliyor — dokunma noktası sayısıyla ayrılıyor
  return /Macintosh/i.test(ua) && (navigator.maxTouchPoints ?? 0) > 1;
}

/**
 * Cüzdanın kendi tarayıcısında siteyi açan evrensel bağlantılar.
 *
 * ⚠️ SADECE RESMİ DOKÜMANDAN DOĞRULANMIŞ İKİ CÜZDAN VAR. Depo kuralı:
 * olmayan/çalışmayan bağlantı koymak ziyaretçiyi boşa tıklatmaktır. Diğer
 * cüzdanlar için tahmin bir adres uydurmak yerine tek satırlık yönerge
 * gösteriliyor.
 *   Phantom : https://docs.phantom.com/phantom-deeplinks/other-methods/browse
 *   Solflare: https://docs.solflare.com/solflare/technical/deeplinks/other-methods/browse
 */
export const MOBIL_CUZDANLAR: readonly { id: string; ad: string; baglanti(url: string): string }[] = [
  {
    id: 'phantom',
    ad: 'Phantom',
    baglanti: (u) => `https://phantom.app/ul/browse/${encodeURIComponent(u)}?ref=${encodeURIComponent(u)}`,
  },
  {
    id: 'solflare',
    ad: 'Solflare',
    baglanti: (u) => `https://solflare.com/ul/v1/browse/${encodeURIComponent(u)}?ref=${encodeURIComponent(u)}`,
  },
];

/** Masaüstünde cüzdanı olmayan ziyaretçi için kurulum adresleri */
export const KURULUM: readonly { ad: string; url: string }[] = [
  { ad: 'Phantom', url: 'https://phantom.app/' },
  { ad: 'Solflare', url: 'https://solflare.com/' },
  { ad: 'Backpack', url: 'https://backpack.app/' },
];
