// HUD KISAYOLLARI MÜHRÜ — sohbetin yanındaki ikonlar ve profil altındaki düğme.
//
// 🔴 NİYE VAR (kullanıcı): *"Guild butonundan bir tane daha yapalım ve chatin
// yanına koyalım… Friends de aynı şekilde… küçük icon tarzında. Profil
// kartının tam altına bir leaderboards butonu."*
//
// Mühürlenen kararlar ve her birinin ölçülmüş sebebi:
//   [1] İKONLAR AÇ/KAPA DÜĞMESİNİN İÇİNDE DEĞİL — sohbet başlığının tamamı
//       tek bir <button>'dı; ikon içine konsaydı düğme içinde düğme olurdu
//       ve her ikon tıklaması sohbeti de açıp kapatırdı.
//   [2] GLİF VERİSİ GEÇERLİ — dikdörtgen, boş değil, renk taşımıyor
//       (renk paletten geliyor, mor sızamaz). Kit ikonları kullanılamadı:
//       `rosette` dişli çark, `sigil` Facebook logosuydu.
//   [3] SIFIR NOKTA ÇİZİLMEZ — "0" rozeti oyuncuya yalan söyler.
//   [4] KAPILAR — kısayollar sayfanın TEK `hedefiAc`ından geçiyor; sıralama
//       kendi panel kimliğiyle açılıyor; kupa ikonu profil düğmesi
//       görünmediğinde sohbete iniyor (telefon, dar sütun).
//
// ⚠️ KAYNAK YORUMLARI SÖKÜLEREK taranıyor.
//
//   cd frontend && npx tsx src/game/hudKisayol.test.mts

import { readFileSync } from 'node:fs';
import { GLIF, glifPikselleri, type GlifAdi } from '../lib/hudGlif.js';

const FAIL: string[] = [];
const check = (n: string, ok: boolean, d = '') => {
  console.log(`${ok ? '  ✓' : '  ✗'} ${n}${d ? ` — ${d}` : ''}`);
  if (!ok) FAIL.push(n);
};
const oku = (p: string) => readFileSync(new URL(p, import.meta.url), 'utf8');
const yorumsuz = (s: string) =>
  s.replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

const sohbet = yorumsuz(oku('../components/ChatPanel.tsx'));
const kisayol = yorumsuz(oku('../components/HudKisayol.tsx'));
const sayfa = yorumsuz(oku('../app/play/page.tsx'));

console.log('\n── [1] ikonlar aç/kapa düğmesinin İÇİNDE değil ──');
{
  /**
   * Aç/kapa düğmesini (`aria-expanded` taşıyan) bul ve kapanış etiketine
   * kadar kes. Kısayol çizimi (`kisayollar.map`) o dilimin İÇİNDE olmamalı.
   */
  const bas = sohbet.indexOf('aria-expanded={acik}');
  const dugmeBasi = sohbet.lastIndexOf('<button', bas);
  const dugmeSonu = sohbet.indexOf('</button>', bas);
  const dilim = sohbet.slice(dugmeBasi, dugmeSonu);
  check('aç/kapa düğmesi bulundu', dugmeBasi >= 0 && dugmeSonu > bas, `${dugmeBasi}..${dugmeSonu}`);
  check('kısayollar aç/kapa düğmesinin İÇİNDE çizilmiyor', !/kisayollar\.map/.test(dilim));
  check('kısayollar aç/kapa düğmesinden SONRA çiziliyor', sohbet.indexOf('kisayollar.map') > dugmeSonu);
  check('aç/kapa düğmesi esnek (ikonlara yer bırakıyor)', /flex: 1, minWidth: 0/.test(dilim));
  // ⚠️ ÇİFT TARAFLI: dilim kesicinin iç içe durumu gerçekten yakaladığını kanıtla
  const sahte = `<button aria-expanded={acik}>x{kisayollar.map((k) => <b/>)}</button>`;
  const sb = sahte.indexOf('aria-expanded={acik}');
  const sd = sahte.slice(sahte.lastIndexOf('<button', sb), sahte.indexOf('</button>', sb));
  check('kesici sahte iç içe düğmeyi YAKALIYOR', /kisayollar\.map/.test(sd));
}

console.log('\n── [2] glif verisi ──');
{
  for (const ad of Object.keys(GLIF) as GlifAdi[]) {
    const satirlar = GLIF[ad];
    const genislikler = new Set(satirlar.map((s) => s.length));
    check(`${ad}: dikdörtgen`, genislikler.size === 1, [...genislikler].join(','));
    check(`${ad}: yalnız X ve nokta`, satirlar.every((s) => /^[X.]+$/.test(s)));
    const { px } = glifPikselleri(ad);
    check(`${ad}: boş değil`, px.length > 10, `${px.length} piksel`);
  }
  check('üç glif de var', ['guild', 'friends', 'leaderboard'].every((a) => a in GLIF));
  check('glif dosyası renk taşımıyor', !/#[0-9a-f]{3,6}\b|rgb\(/i.test(oku('../lib/hudGlif.ts')));
  check('bileşen emoji çizmiyor', !/\p{Extended_Pictographic}/u.test(kisayol));
  check('keskin kenar (piksel sanat bulanmasın)', /shapeRendering="crispEdges"/.test(kisayol));
  check('border-box (dock.test dersi)', /boxSizing: 'border-box'/.test(kisayol));
  check('iç içe cam yok (düz zemin)', !/thinGlass\(|[^A-Za-z]glass\(/.test(kisayol));
}

console.log('\n── [3] sıfır nokta çizilmez ──');
{
  check('nokta yalnız sıfırdan büyükse', /\{nokta > 0 && \(/.test(kisayol));
  check('ekran okuyucu adı var', /aria-label=\{etiket\}/.test(kisayol));
}

console.log('\n── [4] kapılar ──');
{
  check('sohbet kısayolları sayfanın hedefiAc\'ından geçiyor', /onOpen=\{hedefiAc\}/.test(sayfa));
  check('guild ve friends kısayolu tanımlı',
    /id: 'guild', glif: 'guild'/.test(sayfa) && /id: 'friends', glif: 'friends'/.test(sayfa));
  check('kupa yalnız profil düğmesi görünmüyorken sohbete iniyor',
    /\.\.\.\(lbProfilde \? \[\] : \[/.test(sayfa));
  check('profil düğmesi sıralama panelini açıyor', /hedefiAc\('leaderboard'\)/.test(sayfa));
  check('sıralamanın kendi panel dalı var', /acik === 'leaderboard'/.test(sayfa));
  check('sıralama paneli genişliği tanımlı', /leaderboard: 720/.test(sayfa));
  check('Tavern ile AYNI bileşen (ikinci tablo yazılmadı)', /<LeaderboardsPanel \/>/.test(sayfa)
    && /<LeaderboardsPanel gomulu \/>/.test(yorumsuz(oku('../components/RecordsPanel.tsx'))));
  // ⚠️ hedefiAc BÜYÜTÜLMEDİ: locked.test onu 2000 karakter sınırında ölçüyor
  const hBas = sayfa.indexOf('const hedefiAc'), hSon = sayfa.indexOf('const onEnter');
  check('hedefiAc kısa kaldı', hSon - hBas < 400, `${hSon - hBas} karakter`);
}

console.log(`\n${FAIL.length === 0 ? '✅ HUD KISAYOLLARI SAĞLAM' : `❌ ${FAIL.length} BAŞARISIZ: ${FAIL.join(', ')}`}\n`);
process.exit(FAIL.length === 0 ? 0 : 1);
