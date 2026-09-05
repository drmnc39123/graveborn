// CÜZDAN KEŞFİ MÜHRÜ.
//
// 🔴 NİYE KRİTİK: burası oyunun GİRİŞ KAPISI. Kırılırsa oyuncu hesabına
// giremez — ve bunu fark etmenin tek yolu bir oyuncunun şikâyet etmesi olur,
// çünkü giremeyen oyuncu hiçbir sunucu kaydı bırakmaz. Bu yol tarayıcı
// eklentilerine bağlı olduğu için otomatik tarayıcı testiyle de kapsanamıyor;
// o yüzden sağlayıcılar burada taklit ediliyor.
//
//   cd frontend && npx tsx src/lib/wallets.test.mts

const FAIL: string[] = [];
const check = (n: string, ok: boolean, d = '') => {
  console.log(`${ok ? '  ✓' : '  ✗'} ${n}${d ? ` — ${d}` : ''}`);
  if (!ok) FAIL.push(n);
};

// ── SAHTE TARAYICI ──
// ⚠️ Modül `window`u içe aktarma anında değil, çağrı anında okuyor; yine de
// global'ler İÇE AKTARMADAN ÖNCE kurulmalı (`typeof window === 'undefined'`
// erken dönüşü var).

type Dinleyici = (e: { type: string; detail?: unknown }) => void;

class SahteWindow {
  dinleyiciler = new Map<string, Dinleyici[]>();
  addEventListener(t: string, f: Dinleyici) {
    const l = this.dinleyiciler.get(t) ?? [];
    l.push(f);
    this.dinleyiciler.set(t, l);
  }
  dispatchEvent(e: { type: string; detail?: unknown }) {
    for (const f of this.dinleyiciler.get(e.type) ?? []) f(e);
    return true;
  }
}

class SahteOlay {
  detail: unknown;
  constructor(public type: string, opts?: { detail?: unknown }) { this.detail = opts?.detail; }
}

const win = new SahteWindow() as unknown as Window & typeof globalThis & SahteWindow;
const g = globalThis as unknown as Record<string, unknown>;
g.window = win;
g.CustomEvent = SahteOlay;
// ⚠️ Node 24'te `navigator` global'i SALT OKUNUR bir getter — düz atama
// `TypeError` fırlatıyor. Üzerine yazmak için tanımın kendisi değiştirilmeli.
Object.defineProperty(globalThis, 'navigator', {
  value: { userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)', maxTouchPoints: 0 },
  writable: true, configurable: true,
});

const W = () => globalThis as unknown as { window: SahteWindow; navigator: { userAgent: string; maxTouchPoints: number } };

const {
  bulunanCuzdanlar, cuzdanlariIzle, kayitlariSifirla, adAnahtari, standartUygun,
  mobilMi, MOBIL_CUZDANLAR, KURULUM,
} = await import('./wallets.js');

// ── sahte cüzdan üreticileri ──

const IMZA = new Uint8Array([1, 2, 3, 4]);

/** Wallet Standard biçiminde bir cüzdan */
function standartCuzdan(ad: string, adres: string, opts: {
  chains?: string[]; connect?: boolean; sign?: boolean; imzaBicimi?: 'nesne' | 'ham' | 'dizi';
} = {}) {
  const feats: Record<string, unknown> = {};
  if (opts.connect !== false) {
    feats['standard:connect'] = { connect: async () => ({ accounts: [{ address: adres }] }) };
  }
  if (opts.sign !== false) {
    feats['solana:signMessage'] = {
      signMessage: async () => {
        if (opts.imzaBicimi === 'ham') return [IMZA];
        if (opts.imzaBicimi === 'dizi') return [{ signature: [...IMZA] }];
        return [{ signature: IMZA }];
      },
    };
  }
  return { name: ad, icon: 'data:image/svg+xml,x', chains: opts.chains ?? ['solana:mainnet'], accounts: [], features: feats };
}

/** Cüzdanın kendini tanıtması — GEÇ kaydolma yolu */
function gecKaydol(w: unknown) {
  W().window.dispatchEvent(new SahteOlay('wallet-standard:register-wallet', {
    detail: (api: { register: (...ws: unknown[]) => void }) => api.register(w),
  }) as unknown as { type: string; detail?: unknown });
}

console.log('\n[1] HİÇ CÜZDAN YOKKEN LİSTE BOŞ');
{
  kayitlariSifirla();
  check('cüzdan yok → boş liste', bulunanCuzdanlar().length === 0, `${bulunanCuzdanlar().length}`);
}

console.log('\n[2] UYGUNSUZ CÜZDAN LİSTEYE GİRMİYOR (çift taraflı)');
{
  /**
   * ⚠️ ÇİFT TARAFLI OLMAK ZORUNDA: yalnız "uygun cüzdan görünüyor mu" diye
   * baksaydım, HER ŞEYİ listeye alan bir keşif de testi geçerdi. Solana
   * zinciri olmayan ya da imza yeteneği bulunmayan bir cüzdanı listelemek,
   * oyuncuya tıklayınca patlayan bir düğme göstermek olurdu.
   */
  check('Ethereum cüzdanı elenmeli',
    !standartUygun(standartCuzdan('MetaMask', 'x', { chains: ['eip155:1'] }) as never));
  check('connect yeteneği yoksa elenmeli',
    !standartUygun(standartCuzdan('Yarim', 'x', { connect: false }) as never));
  check('signMessage yeteneği yoksa elenmeli',
    !standartUygun(standartCuzdan('Yarim2', 'x', { sign: false }) as never));
  check('tam cüzdan geçmeli', standartUygun(standartCuzdan('Solflare', 'x') as never));

  gecKaydol(standartCuzdan('MetaMask', 'x', { chains: ['eip155:1'] }));
  gecKaydol(standartCuzdan('Yarim', 'x', { connect: false }));
  check('uygunsuzlar keşifte de yok', bulunanCuzdanlar().length === 0, `${bulunanCuzdanlar().length}`);
}

console.log('\n[3] GEÇ KAYDOLAN CÜZDAN YAKALANIYOR');
{
  /**
   * ⚠️ EKLENTİLER SAYFAYLA AYNI ANDA YÜKLENMİYOR. Tek seferlik bir okuma
   * yapsaydık kurulu cüzdanı olan oyuncu "cüzdan bulunamadı" görürdü — bu
   * hata sınıfı bu depoda daha önce başka biçimlerde defalarca çıktı.
   */
  let haber = 0;
  const birak = cuzdanlariIzle(() => { haber++; });
  gecKaydol(standartCuzdan('Solflare', 'SoLfLaReAdReS'));
  const l = bulunanCuzdanlar();
  check('geç kaydolan listeye girdi', l.length === 1 && l[0].ad === 'Solflare', l.map((c) => c.ad).join(','));
  check('abone haberdar edildi', haber === 1, `${haber} haber`);
  check('kaynak "standart"', l[0]?.kaynak === 'standart', l[0]?.kaynak);
  check('ikon taşınıyor', !!l[0]?.ikon);
  birak();
}

console.log('\n[4] STANDARD CÜZDANLA BAĞLAN + İMZALA');
{
  const c = bulunanCuzdanlar()[0];
  const adres = await c.baglan();
  check('adres connect çıktısından geldi', adres === 'SoLfLaReAdReS', adres);
  const sig = await c.imzala(new TextEncoder().encode('merhaba'));
  check('imza Uint8Array', sig instanceof Uint8Array && sig.length === 4, `${sig?.length}`);
  check('imza baytları doğru', [...sig].join(',') === '1,2,3,4', [...sig].join(','));
}

console.log('\n[5] ⭐ İMZA BİÇİMLERİ — cüzdanlar aynı şeyi farklı döndürüyor');
{
  /**
   * ⚠️ ÖLÇÜLMÜŞ GERÇEK: Phantom `{ signature }`, bazı cüzdanlar doğrudan
   * `Uint8Array`, bazıları sayı dizisi döndürüyor. Tek biçim varsayan kod
   * DİĞER cüzdanlarda sessizce "imza okunamadı" verirdi.
   */
  kayitlariSifirla();
  gecKaydol(standartCuzdan('Ham', 'A1', { imzaBicimi: 'ham' }));
  gecKaydol(standartCuzdan('Dizi', 'A2', { imzaBicimi: 'dizi' }));
  /**
   * ⚠️ FIRLATMA YAKALANIYOR. Kusur enjekte edip denediğimde `imzala()`
   * fırlattı ve TÜM test süreci çöktü: hata yakalandı ama sonraki bölümler
   * hiç çalışmadı, rapor yarım kaldı. Mühür "ne kırık" sorusuna tam cevap
   * vermeli — çökerek değil, satır satır.
   */
  for (const c of bulunanCuzdanlar()) {
    await c.baglan();
    let s: Uint8Array | null = null;
    try { s = await c.imzala(new Uint8Array([9])); } catch { /* aşağıda ✗ olarak raporlanıyor */ }
    check(`${c.ad}: imza çözüldü`, !!s && [...s].join(',') === '1,2,3,4', s ? [...s].join(',') : 'FIRLATTI');
  }
}

console.log('\n[6] ESKİ window ENJEKSİYONU');
{
  kayitlariSifirla();
  const w = W().window as unknown as Record<string, unknown>;
  // Phantom: klasik biçim
  w.phantom = {
    solana: {
      isPhantom: true,
      connect: async () => ({ publicKey: { toString: () => 'PhAnToM' } }),
      signMessage: async () => ({ signature: IMZA }),
    },
  };
  // ⚠️ Bazı sağlayıcılar `connect()`ten HİÇBİR ŞEY döndürmez, yalnız
  // `provider.publicKey` alanını doldurur — bu yol da yoklanıyor.
  w.backpack = {
    publicKey: { toString: () => 'BaCkPaCk' },
    connect: async () => undefined,
    signMessage: async () => IMZA,
  };
  const l = bulunanCuzdanlar();
  check('iki enjekte cüzdan bulundu', l.length === 2, l.map((c) => c.ad).join(','));
  check('kaynak "enjekte"', l.every((c) => c.kaynak === 'enjekte'));

  const bp = l.find((c) => c.ad === 'Backpack')!;
  check('connect boş dönse de publicKey okundu', (await bp.baglan()) === 'BaCkPaCk');
  let bpSig: Uint8Array | null = null;
  try { bpSig = await bp.imzala(new Uint8Array([1])); } catch { /* ✗ olarak raporlanır */ }
  check('ham Uint8Array imza çözüldü', !!bpSig && [...bpSig].join(',') === '1,2,3,4', bpSig ? '' : 'FIRLATTI');
}

console.log('\n[7] AYNI CÜZDAN İKİ YOLDAN GÖRÜNÜRSE TEK SATIR');
{
  /**
   * ⚠️ Phantom hem Wallet Standard'a kaydoluyor hem `window.phantom.solana`
   * enjekte ediyor. Dedupe olmasaydı seçim ekranında AYNI cüzdan iki kez
   * çıkardı — oyuncu hangisinin doğru olduğunu bilemezdi.
   */
  gecKaydol(standartCuzdan('Phantom', 'PhAnToM'));
  const l = bulunanCuzdanlar();
  const phantomlar = l.filter((c) => adAnahtari(c.ad) === 'phantom');
  check('Phantom tek kez listeleniyor', phantomlar.length === 1, `${phantomlar.length} kez`);
  check('Standard sürümü tercih edildi', phantomlar[0]?.kaynak === 'standart', phantomlar[0]?.kaynak);
  check('Backpack hâlâ listede', l.some((c) => c.ad === 'Backpack'));
  check('"Phantom Wallet" ile "Phantom" aynı anahtar',
    adAnahtari('Phantom Wallet') === adAnahtari('Phantom'));
}

console.log('\n[8] TANINMAYAN CÜZDAN İÇİN SON ÇARE');
{
  /**
   * ⚠️ Listede olmayan bir cüzdan `window.solana`ya oturmuş olabilir. Adını
   * bilmiyoruz ama girişi çalışır; kapıda bırakmak, çalışan bir cüzdanı
   * sırf tanımadığımız için reddetmek olurdu.
   */
  kayitlariSifirla();
  const w = W().window as unknown as Record<string, unknown>;
  delete w.phantom; delete w.backpack;
  w.solana = {
    connect: async () => ({ publicKey: { toString: () => 'BiLiNMeYeN' } }),
    signMessage: async () => ({ signature: IMZA }),
  };
  const l = bulunanCuzdanlar();
  check('bilinmeyen sağlayıcı yine de sunuluyor', l.length === 1, `${l.length}`);
  check('adres alınabiliyor', (await l[0].baglan()) === 'BiLiNMeYeN');

  // ⚠️ ÇİFT TARAFLI: son çare YALNIZ hiçbir şey bulunamadığında devreye
  // girmeli. Her zaman eklenseydi, isimli cüzdanı olan oyuncu listede bir de
  // adsız bir "Solana Wallet" satırı görürdü.
  w.solflare = {
    connect: async () => ({ publicKey: { toString: () => 'SoL' } }),
    signMessage: async () => ({ signature: IMZA }),
  };
  const l2 = bulunanCuzdanlar();
  check('isimli cüzdan varken son çare eklenmiyor',
    !l2.some((c) => c.ad === 'Solana Wallet'), l2.map((c) => c.ad).join(','));
  delete w.solana; delete w.solflare;
}

console.log('\n[9] MOBİL DERİN BAĞLANTILAR');
{
  const url = 'https://playgraveborn.com/?a=1&b=2';
  for (const m of MOBIL_CUZDANLAR) {
    const b = m.baglanti(url);
    // ⚠️ URL KODLANMALI: kodlanmazsa hedefteki `?a=1` derin bağlantının
    // KENDİ sorgu dizesine karışır ve cüzdan yanlış adrese gider.
    check(`${m.ad}: hedef url kodlanmış`, b.includes(encodeURIComponent(url)), b.slice(0, 60));
    check(`${m.ad}: ham "?" sızmamış`, b.split('?').length === 2, b);
    check(`${m.ad}: ref parametresi var`, /[?&]ref=/.test(b));
    check(`${m.ad}: https`, b.startsWith('https://'));
  }
  // Resmî dokümandan doğrulanan yollar (bkz. wallets.ts yorum bloğu)
  check('Phantom yolu /ul/browse/',
    MOBIL_CUZDANLAR[0].baglanti(url).startsWith('https://phantom.app/ul/browse/'));
  check('Solflare yolu /ul/v1/browse/',
    MOBIL_CUZDANLAR[1].baglanti(url).startsWith('https://solflare.com/ul/v1/browse/'));
}

console.log('\n[10] MOBİL ALGILAMA');
{
  const nav = W().navigator;
  nav.userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)';
  check('masaüstü → mobil değil', !mobilMi());
  nav.userAgent = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)';
  check('iPhone → mobil', mobilMi());
  nav.userAgent = 'Mozilla/5.0 (Linux; Android 14; Pixel 8)';
  check('Android → mobil', mobilMi());
  // ⚠️ iPad masaüstü kimliğiyle geliyor — dokunma noktasıyla ayrılıyor
  nav.userAgent = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)';
  nav.maxTouchPoints = 5;
  check('iPad (masaüstü UA + dokunma) → mobil', mobilMi());
  nav.maxTouchPoints = 0;
  check('gerçek Mac → mobil değil', !mobilMi());
}

console.log('\n[11] KURULUM BAĞLANTILARI');
{
  // ⚠️ Depo kuralı: olmayan/çalışmayan bağlantı koymak ziyaretçiyi boşa
  // tıklatmaktır. En azından biçimsel olarak yoklanıyor.
  check('kurulum listesi dolu', KURULUM.length >= 2, `${KURULUM.length}`);
  check('hepsi https', KURULUM.every((k) => k.url.startsWith('https://')));
  check('hepsinin adı var', KURULUM.every((k) => k.ad.length > 1));
}

console.log(`\n${FAIL.length === 0 ? '✅ CÜZDAN KAPISI SAĞLAM' : `❌ ${FAIL.length} BAŞARISIZ: ${FAIL.join(', ')}`}\n`);
process.exit(FAIL.length === 0 ? 0 : 1);
