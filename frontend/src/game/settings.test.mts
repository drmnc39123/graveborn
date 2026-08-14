// AYARLAR — "hiçbiri dengeyi etkilemez" iddiasının KANITI.
//
// Çalıştır:  npx tsx src/game/settings.test.mts
//
// ⚠️ ASIL TEST [3]. Bir ayarın gizlice dengeye dokunması, fark edilmesi en
// zor hata sınıfı: kimse "ekran sarsıntısını kapatınca daha çok kill
// alıyorum" diye şikâyet etmez, sadece bir ayar sessizce "en iyi" olur ve
// oyuncu görsel tercihini bırakıp onu seçmek zorunda kalır.

import { Game } from './engine.js';
import { TICK } from './config.js';
import { applyFxSettings, drawFxWorld, fxSayim, isLowGfx, pumpFx, resetFx } from './fx.js';
import { defaultSettings, normalizeSettings, type Settings } from './settings.js';
import { HINTS, nextHint } from './tutorial.js';

const FAIL: string[] = [];
const check = (n: string, ok: boolean, d = '') => {
  console.log(`${ok ? '  ✓' : '  ✗'} ${n}${d ? ` — ${d}` : ''}`);
  if (!ok) FAIL.push(n);
};

console.log('\n═══ AYARLAR ═══');

console.log('\n[1] Varsayılanlar ve normalize');
{
  const d = defaultSettings();
  check('ses varsayılanı sessiz DEĞİL', d.volume > 0, `${d.volume}`);
  check('hasar sayıları varsayılan AÇIK', d.damageNumbers);

  // Ayar dosyası da elle düzenlenebilir — savunmacı olmalı
  check('bozuk ses değeri varsayılana düşüyor',
    normalizeSettings({ volume: NaN } as Partial<Settings>).volume === d.volume);
  check('aralık dışı ses kırpılıyor',
    normalizeSettings({ volume: 9 }).volume === 1 && normalizeSettings({ volume: -3 }).volume === 0);
  check('boolean olmayan bayrak varsayılana düşüyor',
    normalizeSettings({ damageNumbers: 'evet' as unknown as boolean }).damageNumbers === d.damageNumbers);
  check('null kayıt çökmüyor', normalizeSettings(null).volume === d.volume);
  check('bilinmeyen alan yok sayılıyor',
    Object.keys(normalizeSettings({ hile: true } as Partial<Settings>)).length === Object.keys(d).length);
}

// ⚠️ [2] "Sarsıntı kapatma" bölümü SİLİNDİ — ekran sarsıntısı oyundan
// TAMAMEN kaldırıldı (bkz. fx.ts FEEL notu). Kapatılacak bir şey kalmadığı
// için kapatmayı sınayan mühür de yok. Aşağıdaki [3] DURUYOR ve asıl önemli
// olan o: ayar bayrakları simülasyonu etkilemiyor.

console.log('\n[3] ⭐ AYARLAR SİMÜLASYONU ETKİLEMİYOR');
{
  // Aynı seed, aynı girdi, TAMAMEN farklı ayarlar → BİREBİR aynı koşu.
  // Bu, "ayar denge değiştirmiyor" iddiasının tek gerçek kanıtı.
  const kosu = (s: { damageNumbers: boolean; lowGraphics?: boolean }) => {
    const g = new Game(13579);
    g.setViewport(1280, 720);
    resetFx();
    applyFxSettings(s);
    // ⚠️ 60 saniye + MÜCEVHER TOPLAYAN sürücü. İlk sürüm 15 saniye sürekli
    // daire çizdiriyordu; oyuncu kendi düşürdüğü mücevherlerden de kaçınca
    // LV1'de kalıyordu ve test level/XP yolunu HİÇ ölçmüyordu. Ölçüm testinde
    // oyuncunun gerçekten bir şey yapması şart (projede bir kez düşülen tuzak).
    for (let i = 0; i < 3600; i++) {
      if (g.phase === 'levelup') g.choose(g.offers[0].id);
      if (g.phase !== 'running') break;
      g.hp = g.stats.maxHp;                       // ölmesin, yoksa step() no-op olur
      // en yakın mücevhere yürü; yoksa dur ve sürüyü üstüne al
      let bx = 0, by = 0, bd = Infinity;
      for (const m of g.gems) {
        const dx = m.x - g.px, dy = m.y - g.py;
        const d2 = dx * dx + dy * dy;
        if (d2 < bd) { bd = d2; bx = dx; by = dy; }
      }
      const len = Math.hypot(bx, by) || 1;
      g.setInput(g.gems.length ? bx / len : 0, g.gems.length ? by / len : 0);
      g.step();
      pumpFx(g, TICK);
    }
    return {
      kills: g.kills, level: g.level, hp: g.hp,
      px: g.px, py: g.py, rareGold: g.rareGold,
      enemies: g.enemies.length,
      toplam: g.enemies.reduce((n, e) => n + e.x + e.y + e.hp, 0),
    };
  };

  const hepsiAcik = kosu({ damageNumbers: true, lowGraphics: false });
  const hepsiKapali = kosu({ damageNumbers: false, lowGraphics: true });
  const karisik = kosu({ damageNumbers: true, lowGraphics: true });

  const ayni = (a: typeof hepsiAcik, b: typeof hepsiAcik) =>
    a.kills === b.kills && a.level === b.level
    && Math.abs(a.px - b.px) < 1e-9 && Math.abs(a.py - b.py) < 1e-9
    && Math.abs(a.hp - b.hp) < 1e-9 && Math.abs(a.rareGold - b.rareGold) < 1e-9
    && a.enemies === b.enemies && Math.abs(a.toplam - b.toplam) < 1e-6;

  console.log(`     açık:   ${hepsiAcik.kills} kill · LV${hepsiAcik.level} · ${hepsiAcik.enemies} düşman`);
  console.log(`     kapalı: ${hepsiKapali.kills} kill · LV${hepsiKapali.level} · ${hepsiKapali.enemies} düşman`);
  check('TÜM ayarlar kapalı koşu, açık koşuyla birebir aynı', ayni(hepsiAcik, hepsiKapali),
    `${hepsiAcik.kills} = ${hepsiKapali.kills} kill`);
  check('karışık ayar da aynı sonucu veriyor', ayni(hepsiAcik, karisik));
  // ⚠️ Ölçüm testinde oyuncu bir şey YAPMIŞ olmalı, yoksa test hiçbir şey
  // ölçmeden "geçer" (projede bir kez düşülen tuzak)
  check('koşu gerçekten oynandı', hepsiAcik.kills > 0 && hepsiAcik.level > 1,
    `${hepsiAcik.kills} kill, LV${hepsiAcik.level}`);
}


console.log('\n[3b] ⭐ DÜŞÜK GRAFİK GERÇEKTEN BİR ŞEY YAPIYOR MU');
{
  // 🐛 Düzeltilen hata tam olarak buydu: ayarın paneldeki açıklaması
  // "fewer corpses, sparks and atmosphere" diyordu ama bayrağı YALNIZ
  // `ui/motion.tsx` okuyordu — söz verilen üç şeyin ÜÇÜ DE olmuyordu.
  //
  // ⚠️ [3] "ayar simülasyonu bozmuyor" der; TEK BAŞINA YETMEZ, çünkü hiçbir
  // şey yapmayan bir ayar da o testi geçer. Bu bölüm tersini ölçüyor.
  // ⚠️ DERİN DESCENT KOŞUSU — ve bu bir ölçüm düzeltmesi. İlk senaryo bölüm 1
  // taze koşusuydu: orada vuruşların neredeyse HEPSİ öldürüyor, yani
  // kapatılan "bonus kıvılcım" dalı zaten hiç çalışmıyordu ve kıvılcım
  // 2 → 2 çıkıyordu. Kıvılcım kısıtı ancak düşman DAYANIKLIYKEN, yani
  // öldürmeyen vuruş çoğaldığında ve havuz baskı altındayken anlam kazanıyor —
  // tam da zayıf cihazın zorlandığı an.
  const kosu = (lowGraphics: boolean) => {
    const g = new Game(24680, undefined, undefined, 'descent', undefined, 20);
    g.setViewport(1280, 720);
    resetFx();
    applyFxSettings({ damageNumbers: true, lowGraphics });
    let enCokLes = 0, enCokSpark = 0;
    for (let i = 0; i < 1800; i++) {
      if (g.phase === 'levelup') g.choose(g.offers[0].id);
      if (g.phase !== 'running') break;
      g.hp = g.stats.maxHp;
      g.setInput(0.4, 0.3);
      g.step();
      pumpFx(g, TICK);
      const c = fxSayim();
      enCokLes = Math.max(enCokLes, c.corpse);
      enCokSpark = Math.max(enCokSpark, c.spark);
    }
    return { kills: g.kills, enCokLes, enCokSpark };
  };

  const acik = kosu(false);
  const dusuk = kosu(true);

  console.log(`     normal: ${acik.kills} kill · en çok ${acik.enCokLes} leş · ${acik.enCokSpark} kıvılcım`);
  console.log(`     düşük : ${dusuk.kills} kill · en çok ${dusuk.enCokLes} leş · ${dusuk.enCokSpark} kıvılcım`);

  // ⚠️ ÇİFT TARAFLI: önce normalde GERÇEKTEN leş/kıvılcım olduğunu göster.
  // Bu satırlar olmasaydı ikisi de sıfırken test yine "geçer" ve hiçbir şey
  // ölçmezdi — bu projede tam olarak o tuzağa bir kez düşüldü.
  check('normalde leş ÜRETİLİYOR (ölçüm anlamlı)', acik.enCokLes > 0, `${acik.enCokLes} leş`);
  check('normalde kıvılcım ÜRETİLİYOR', acik.enCokSpark > 0, `${acik.enCokSpark} kıvılcım`);

  check('DÜŞÜK GRAFİKTE leş hiç üretilmiyor', dusuk.enCokLes === 0, `${dusuk.enCokLes} leş`);
  check('DÜŞÜK GRAFİKTE kıvılcım AZALIYOR', dusuk.enCokSpark < acik.enCokSpark,
    `${acik.enCokSpark} → ${dusuk.enCokSpark}`);
  // ⚠️ ama SIFIRLANMIYOR: öldüren ve kritik vuruş geri bildirimdir, süs değil
  check('kıvılcım SIFIRLANMIYOR (öldüren vuruş hâlâ görünür)', dusuk.enCokSpark > 0,
    `${dusuk.enCokSpark} kıvılcım`);

  check('bayrak modüller arası TEK KAYNAK', isLowGfx() === true);
  applyFxSettings({ damageNumbers: true, lowGraphics: false });
  check('bayrak geri kapanıyor', isLowGfx() === false);
}

console.log('\n[4] Kapalı sayılar çizimi bozmuyor');
{
  // Sayılar kapalıyken `drawFxWorld` erken dönüyor — kıvılcımlar YİNE çizilmeli.
  // Sahte bir ctx ile hangi çağrıların yapıldığını sayıyoruz.
  let fillTextCagrisi = 0;
  // ⚠️ ELLE YAZILAN SAHTE CTX YETMİYOR. İlk sürümde öyleydi ve eksik bir
  // metotta sessizce patlıyordu; `try/catch` de onu yutunca test "0 çağrı"
  // görüp YANLIŞ sonuç veriyordu. Proxy her metodu karşılıyor, yani ölçüm
  // gerçekten çizim yolunu ölçüyor.
  const sahte = new Proxy({}, {
    get(_t, k) {
      if (k === 'createRadialGradient') return () => ({ addColorStop() {} });
      if (k === 'fillText' || k === 'strokeText') return () => { fillTextCagrisi += 1; };
      return () => {};
    },
    set() { return true; },
  }) as unknown as CanvasRenderingContext2D;

  /**
   * TAZE koşu + çiz. ⚠️ Tek bir oyunu ayar değiştirip devam ettirmek YANLIŞ
   * ölçümdü: 400 tick sonra bölüm bitiyor (`phase='won'`), `step()` no-op
   * oluyor ve yeni vuruş üretilmiyor — "açıkken sayı yazılıyor" kontrolü
   * hiçbir şey ölçmeden başarısız görünüyordu. Her ölçüm kendi koşusunu kurar.
   */
  const ciz = (damageNumbers: boolean) => {
    fillTextCagrisi = 0;
    const g = new Game(777);
    g.setViewport(1280, 720);
    resetFx();
    applyFxSettings({ damageNumbers });
    for (let i = 0; i < 400; i++) {
      if (g.phase !== 'running') break;
      g.hp = g.stats.maxHp;         // ölürse step() no-op olur, vuruş üretilmez
      g.step();
      pumpFx(g, TICK);
    }
    drawFxWorld(sahte);
    return fillTextCagrisi;
  };

  let patladi = false;
  let kapaliSayi = 0;
  try { kapaliSayi = ciz(false); } catch { patladi = true; }
  check('kapalı sayılarla çizim patlamıyor', !patladi);
  check('kapalıyken hiç sayı yazılmıyor', kapaliSayi === 0, `${kapaliSayi} çağrı`);
  const acikSayi = ciz(true);
  check('AÇIKKEN sayı yazılıyor', acikSayi > 0, `${acikSayi} çağrı`);
}

console.log('\n[5] Tutorial ipuçları');
{
  // ⚠️ Tarayıcıda doğrulanamıyor: ipucu mantığı rAF döngüsünün içinde ve
  // otomatik doğrulamada tarayıcı paneli görünmediği için rAF DONUK
  // (projede bilinen kısıt). Mantık burada, motorun kendisiyle ölçülüyor.
  const ids = HINTS.map((h) => h.id);
  check('id\'ler benzersiz', new Set(ids).size === ids.length, `${ids.length} ipucu`);
  check('her ipucunun süresi pozitif', HINTS.every((h) => h.hold > 0));
  check('metinler tek nefeste okunacak kadar kısa',
    HINTS.every((h) => h.text.length <= 110),
    `en uzun ${Math.max(...HINTS.map((h) => h.text.length))} karakter`);

  // ⚠️ TETİKLEYİCİLER SAF OLMALI: motoru değiştiren bir `when` simülasyonu
  // bozardı ve aynı seed farklı koşu üretirdi.
  const g = new Game(31337);
  g.setViewport(1280, 720);
  const once = { kills: g.kills, px: g.px, py: g.py, hp: g.hp, level: g.level };
  for (const h of HINTS) h.when(g);
  check('tetikleyiciler motoru DEĞİŞTİRMİYOR',
    g.kills === once.kills && g.px === once.px && g.py === once.py
    && g.hp === once.hp && g.level === once.level);

  // Gerçek koşuda en az bir ipucu tetiklenmeli — hiç çıkmayan tutorial,
  // olmayan tutorial demektir
  const gorulen: string[] = [];
  const g2 = new Game(555);
  g2.setViewport(1280, 720);
  for (let i = 0; i < 60 * 60; i++) {
    if (g2.phase === 'levelup') g2.choose(g2.offers[0].id);
    if (g2.phase !== 'running') break;
    g2.hp = g2.stats.maxHp;
    const t = i * TICK;
    g2.setInput(Math.cos(t * 0.7), Math.sin(t * 0.7));
    g2.step();
    const h = nextHint(g2, gorulen);
    if (h) gorulen.push(h.id);
  }
  console.log(`     60 sn'lik koşuda tetiklenen: ${gorulen.join(', ') || 'hiçbiri'}`);
  check('gerçek koşuda ipucu tetikleniyor', gorulen.length >= 2, `${gorulen.length} ipucu`);
  check('ilk ipucu hareket ipucu', gorulen[0] === 'move', gorulen[0] ?? 'yok');
  // ⚠️ Aynı ipucu iki kez ÇIKMAMALI: aynı cümleyi tekrar göstermek bilgi
  // değil gürültüdür, oyuncu üçüncüsünde okumayı bırakır.
  check('hiçbir ipucu tekrar etmiyor', new Set(gorulen).size === gorulen.length);
}

console.log(`\n${FAIL.length === 0 ? '✅ AYARLAR SAĞLAM' : `❌ ${FAIL.length} BAŞARISIZ: ${FAIL.join(', ')}`}\n`);
process.exit(FAIL.length === 0 ? 0 : 1);
