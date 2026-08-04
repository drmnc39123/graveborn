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
import { applyFxSettings, drawFxWorld, pumpFx, resetFx, shakeOffset } from './fx.js';
import { defaultSettings, normalizeSettings, type Settings } from './settings.js';

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
  check('sarsıntı varsayılan AÇIK', d.screenShake);
  check('hasar sayıları varsayılan AÇIK', d.damageNumbers);

  // Ayar dosyası da elle düzenlenebilir — savunmacı olmalı
  check('bozuk ses değeri varsayılana düşüyor',
    normalizeSettings({ volume: NaN } as Partial<Settings>).volume === d.volume);
  check('aralık dışı ses kırpılıyor',
    normalizeSettings({ volume: 9 }).volume === 1 && normalizeSettings({ volume: -3 }).volume === 0);
  check('boolean olmayan bayrak varsayılana düşüyor',
    normalizeSettings({ screenShake: 'evet' as unknown as boolean }).screenShake === d.screenShake);
  check('null kayıt çökmüyor', normalizeSettings(null).volume === d.volume);
  check('bilinmeyen alan yok sayılıyor',
    Object.keys(normalizeSettings({ hile: true } as Partial<Settings>)).length === Object.keys(d).length);
}

console.log('\n[2] Sarsıntı kapatma');
{
  const g = new Game(4242);
  g.setViewport(1280, 720);
  resetFx();
  applyFxSettings({ screenShake: true, damageNumbers: true });
  // Sarsıntı biriktir
  for (let i = 0; i < 400; i++) { g.step(); pumpFx(g, TICK); }
  const acik = shakeOffset();
  const acikVar = Math.abs(acik.x) + Math.abs(acik.y) > 0;

  applyFxSettings({ screenShake: false, damageNumbers: true });
  const kapali = shakeOffset();
  check('açıkken kamera sarsılıyor', acikVar, `${acik.x.toFixed(2)},${acik.y.toFixed(2)}`);
  check('KAPALIYKEN kamera hiç sarsılmıyor', kapali.x === 0 && kapali.y === 0);
}

console.log('\n[3] ⭐ AYARLAR SİMÜLASYONU ETKİLEMİYOR');
{
  // Aynı seed, aynı girdi, TAMAMEN farklı ayarlar → BİREBİR aynı koşu.
  // Bu, "ayar denge değiştirmiyor" iddiasının tek gerçek kanıtı.
  const kosu = (s: { screenShake: boolean; damageNumbers: boolean }) => {
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

  const hepsiAcik = kosu({ screenShake: true, damageNumbers: true });
  const hepsiKapali = kosu({ screenShake: false, damageNumbers: false });
  const karisik = kosu({ screenShake: false, damageNumbers: true });

  const ayni = (a: typeof hepsiAcik, b: typeof hepsiAcik) =>
    a.kills === b.kills && a.level === b.level
    && Math.abs(a.px - b.px) < 1e-9 && Math.abs(a.py - b.py) < 1e-9
    && Math.abs(a.hp - b.hp) < 1e-9 && Math.abs(a.rareGold - b.rareGold) < 1e-9
    && a.enemies === b.enemies && Math.abs(a.toplam - b.toplam) < 1e-6;

  console.log(`     açık:   ${hepsiAcik.kills} kill · LV${hepsiAcik.level} · ${hepsiAcik.enemies} düşman`);
  console.log(`     kapalı: ${hepsiKapali.kills} kill · LV${hepsiKapali.level} · ${hepsiKapali.enemies} düşman`);
  check('sarsıntı+sayı KAPALI koşu, AÇIK koşuyla birebir aynı', ayni(hepsiAcik, hepsiKapali),
    `${hepsiAcik.kills} = ${hepsiKapali.kills} kill`);
  check('karışık ayar da aynı sonucu veriyor', ayni(hepsiAcik, karisik));
  // ⚠️ Ölçüm testinde oyuncu bir şey YAPMIŞ olmalı, yoksa test hiçbir şey
  // ölçmeden "geçer" (projede bir kez düşülen tuzak)
  check('koşu gerçekten oynandı', hepsiAcik.kills > 0 && hepsiAcik.level > 1,
    `${hepsiAcik.kills} kill, LV${hepsiAcik.level}`);
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
    applyFxSettings({ screenShake: true, damageNumbers });
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

console.log(`\n${FAIL.length === 0 ? '✅ AYARLAR SAĞLAM' : `❌ ${FAIL.length} BAŞARISIZ: ${FAIL.join(', ')}`}\n`);
process.exit(FAIL.length === 0 ? 0 : 1);
