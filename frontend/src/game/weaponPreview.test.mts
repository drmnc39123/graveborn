// SİLAH ÖNİZLEME ŞEMASI MÜHRÜ.
//
// 🔴 NİYE VAR: şema level-up kartının içinde ve o kart oyunun en önemli
// kararı. Bir desen çizim `switch`ine düşmezse kutu BOŞ kalır — hata yok,
// uyarı yok, sadece o silahın kartında hiçbir şey görünmez. Üstelik on
// desenin hepsini oynayarak görmek pratikte imkânsız: kimi silah yalnız
// evrimle geliyor, kimi ancak belirli kahramanla açılıyor.
//
// ⚠️ SAHTE CANVAS: Node'da `CanvasRenderingContext2D` yok. Çağrılar
// kaydediliyor, çizilen şey değil ölçülüyor — "bir şey çizdi mi" ve
// "gerçek `WeaponDef` alanlarını kullandı mı" sorularına bu yetiyor.
//
//   cd frontend && npx tsx src/game/weaponPreview.test.mts

import { EVOLVED, WEAPONS, type WeaponDef } from './config.js';
import { cizSema } from '../components/WeaponPreview.js';

const FAIL: string[] = [];
const check = (n: string, ok: boolean, d = '') => {
  console.log(`${ok ? '  ✓' : '  ✗'} ${n}${d ? ` — ${d}` : ''}`);
  if (!ok) FAIL.push(n);
};

/** Çizim çağrılarını sayan sahte bağlam */
function sahteCtx() {
  const cagri: { ad: string; arg: number[] }[] = [];
  const ctx = {
    clearRect: () => cagri.push({ ad: 'clearRect', arg: [] }),
    beginPath: () => {},
    /**
     * ⚠️ AÇILAR DA KAYDEDİLİYOR. İlk hâlde yalnız (x, y, r) tutuluyordu ve
     * ölçüm `sweep`e KÖRDÜ: savurma tam olarak açıda oluyor, yay yerinde
     * duruyor. Alet "hareket yok" dedi, oysa hareket vardı — kaydedilmeyen
     * bir argüman, ölçülmeyen bir davranıştır.
     */
    arc: (x: number, y: number, r: number, a0 = 0, a1 = 0) =>
      cagri.push({ ad: 'arc', arg: [x, y, r, a0, a1] }),
    moveTo: () => {},
    lineTo: (x: number, y: number) => cagri.push({ ad: 'lineTo', arg: [x, y] }),
    fill: () => cagri.push({ ad: 'fill', arg: [] }),
    stroke: () => cagri.push({ ad: 'stroke', arg: [] }),
    fillStyle: '', strokeStyle: '', lineWidth: 1,
  };
  return { ctx: ctx as unknown as CanvasRenderingContext2D, cagri };
}

const W = 140, H = 52;
const ZAMANLAR = [0, 0.3, 0.7, 1.1, 1.6, 2.0];
const HEPSI: WeaponDef[] = [...WEAPONS, ...EVOLVED];

console.log('\n═══ SİLAH ÖNİZLEME ŞEMASI ═══');

console.log('\n[1] ⭐ HİÇBİR SİLAHIN KUTUSU BOŞ KALMIYOR');
{
  /**
   * 🔴 ASIL KONTROL. Oyuncunun boş bir kutu görmesi, bilgi eksikliğinden
   * daha kötü: kartın bozuk olduğunu düşünür ve o silaha güvenmez.
   *
   * ⚠️ "Oyuncu + hedef" temel çizimi HER desende var, yani sadece "çizim
   * yaptı mı" diye bakmak yetmez — DESENE ÖZGÜ çizim de olmalı. Ölçüt:
   * temel iki daireden FAZLASI.
   */
  const bos: string[] = [];
  for (const def of HEPSI) {
    let enFazla = 0;
    for (const t of ZAMANLAR) {
      const { ctx, cagri } = sahteCtx();
      cizSema(ctx, W, H, def, t);
      enFazla = Math.max(enFazla, cagri.filter((c) => c.ad === 'arc' || c.ad === 'lineTo').length);
    }
    if (enFazla <= 2) bos.push(`${def.name}(${def.pattern})`);
  }
  check(`${HEPSI.length} silahın hepsi desene özgü bir şey çiziyor`,
    bos.length === 0, bos.join(', ') || 'boş kutu yok');
}

console.log('\n[2] HER DESEN KAPSANIYOR');
{
  const desenler = [...new Set(HEPSI.map((w) => w.pattern))].sort();
  console.log(`     ${desenler.length} desen: ${desenler.join(', ')}`);
  for (const d of desenler) {
    const ornek = HEPSI.find((w) => w.pattern === d)!;
    let cizdi = false;
    for (const t of ZAMANLAR) {
      const { ctx, cagri } = sahteCtx();
      cizSema(ctx, W, H, ornek, t);
      if (cagri.filter((c) => c.ad === 'arc' || c.ad === 'lineTo').length > 2) cizdi = true;
    }
    check(`"${d}" çiziliyor`, cizdi, ornek.name);
  }
}

console.log('\n[3] ⭐ ŞEMA GERÇEK SAYILARI KULLANIYOR');
{
  /**
   * Şemanın tek değeri DOĞRU olması. Elle çizilmiş bir animasyon zamanla
   * yalan söyler; bu şema `WeaponDef`ten beslendiği için silah dengelenince
   * kendiliğinden güncelleniyor. Bunu ölçüyorum: alanı değiştir, çizim
   * DEĞİŞMELİ.
   */
  const yaricapCiz = (def: WeaponDef, t: number) => {
    const { ctx, cagri } = sahteCtx();
    cizSema(ctx, W, H, def, t);
    return Math.max(0, ...cagri.filter((c) => c.ad === 'arc').map((c) => c.arg[2]));
  };
  const orbit = HEPSI.find((w) => w.pattern === 'orbit');
  if (orbit) {
    const kucuk = yaricapCiz({ ...orbit, orbitRadius: 30 }, 0.5);
    const buyuk = yaricapCiz({ ...orbit, orbitRadius: 30, auraRadius: 0 }, 0.5);
    check('yörünge yarıçapı çizime giriyor', kucuk > 0 && buyuk > 0, `${kucuk.toFixed(1)}`);
  }
  const nova = HEPSI.find((w) => w.pattern === 'nova');
  if (nova) {
    const say = (n: number) => {
      const { ctx, cagri } = sahteCtx();
      cizSema(ctx, W, H, { ...nova, novaCount: n }, 0.5);
      return cagri.filter((c) => c.ad === 'arc').length;
    };
    // ⚠️ ÇİFT TARAFLI: mermi sayısı artınca çizilen daire sayısı ARTMALI.
    // Sabit kalsaydı şema silahın en ayırt edici sayısını gizliyor olurdu.
    check('nova mermi sayısı çizime giriyor', say(12) > say(4), `${say(4)} → ${say(12)}`);
  }
  const chain = HEPSI.find((w) => w.pattern === 'chain');
  if (chain) {
    const say = (j: number) => {
      const { ctx, cagri } = sahteCtx();
      cizSema(ctx, W, H, { ...chain, chainJumps: j }, 1.9);
      return cagri.filter((c) => c.ad === 'lineTo').length;
    };
    check('zincir sıçraması çizime giriyor', say(4) > say(1), `${say(1)} → ${say(4)}`);
  }
}

console.log('\n[4] BOZUK GİRDİDE ÇÖKMÜYOR');
{
  /**
   * ⚠️ Alanların çoğu isteğe bağlı (`orbitRadius?`, `novaCount?`...). Yeni
   * bir silah bunlardan biri olmadan eklenirse şema PATLAMAMALI: kart
   * ekranında bir istisna, oyuncunun seçim yapmasını tamamen engellerdi.
   */
  const cip: WeaponDef[] = HEPSI.map((w) => ({
    ...w, orbitRadius: undefined, auraRadius: undefined, novaCount: undefined,
    groundRadius: undefined, chainJumps: undefined, returnAt: undefined,
    mineTriggerR: undefined, mineBlastR: undefined, sweepW: undefined, sweepH: undefined,
  }));
  let patladi = '';
  for (const def of cip) {
    for (const t of ZAMANLAR) {
      try { cizSema(sahteCtx().ctx, W, H, def, t); }
      catch (e) { patladi = `${def.name}: ${e instanceof Error ? e.message : e}`; }
    }
  }
  check('eksik alanlarla çökmüyor', !patladi, patladi || 'temiz');

  let nan = 0;
  for (const def of HEPSI) {
    const { ctx, cagri } = sahteCtx();
    cizSema(ctx, W, H, def, 0.9);
    for (const c of cagri) for (const a of c.arg) if (!Number.isFinite(a)) nan++;
  }
  // ⚠️ NaN bir koordinat sessizce HİÇBİR ŞEY çizmez — boş kutunun ikinci yolu.
  check('hiçbir koordinat NaN değil', nan === 0, `${nan} NaN`);
}

console.log('\n[5] ⭐ ŞEMA GERÇEKTEN HAREKET EDİYOR');
{
  /**
   * 🔴 BU KONTROL BİR ÖLÇÜM BOŞLUĞUNU KAPATIYOR. Tarayıcı panelinde `rAF`
   * ateşlenmiyor (800 ms'de 0 kare ölçüldü — üstelik `document.hidden`
   * FALSE diyor, yani o bayrağa güvenilemez), dolayısıyla animasyonun aktığı
   * gözle DOĞRULANAMIYOR. Doğrulanabilen şey şu: farklı zamanlar farklı
   * kareler üretiyor mu. Üretmiyorsa şema donuk bir resimden ibarettir.
   */
  const imza = (def: WeaponDef, t: number) => {
    const { ctx, cagri } = sahteCtx();
    cizSema(ctx, W, H, def, t);
    return cagri.map((c) => c.ad + c.arg.map((n) => n.toFixed(1)).join(',')).join('|');
  };
  const donuk: string[] = [];
  for (const def of HEPSI) {
    const kareler = new Set(ZAMANLAR.map((t) => imza(def, t)));
    // 6 örnekten en az 3'ü farklı olmalı — 1 olsaydı şema hiç hareket etmiyor demektir
    if (kareler.size < 3) donuk.push(`${def.name}(${def.pattern}):${kareler.size}`);
  }
  check('her silahın şeması zamanla değişiyor', donuk.length === 0, donuk.join(', ') || 'hepsi hareketli');
}

console.log('\n[6] DÖNGÜ KAPANIYOR');
{
  // ⚠️ Şema döngüsel olmalı: başı ile sonu tutmazsa gözle görülür bir
  // sıçrama olur ve ucuz durur.
  const def = HEPSI.find((w) => w.pattern === 'orbit') ?? HEPSI[0];
  const kare = (t: number) => {
    const { ctx, cagri } = sahteCtx();
    cizSema(ctx, W, H, def, t);
    return cagri.filter((c) => c.ad === 'arc').map((c) => c.arg.map((n) => n.toFixed(1)).join(',')).join('|');
  };
  check('t=0 ile t=2.2 aynı kare', kare(0) === kare(2.2), 'döngü 2,2 sn');
}

console.log(`\n${FAIL.length === 0 ? '✅ ÖNİZLEME ŞEMASI SAĞLAM' : `❌ ${FAIL.length} BAŞARISIZ: ${FAIL.join(', ')}`}\n`);
process.exit(FAIL.length === 0 ? 0 : 1);
