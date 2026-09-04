// 25 BÖLÜMÜ GERÇEKTEN OYNA — motorla, baştan sona.
//
//   npx tsx src/game/stagerun.test.mts
//
// 🔴 NİYE AYRI BİR MÜHÜR: `stages.test` VARLIKLARI ölçüyor (dosya var mı,
// kare sayısı tutuyor mu). Bir bölümün varlıkları eksiksiz olabilir ve
// bölüm yine de OYNANAMAZ olabilir: havuz boşalmaz, boss hiç gelmez,
// düşman doğmaz, motor hata atar. "Tüm bölümleri kontrol et" isteğinin
// gerçek karşılığı, hepsini OYNAMAK.
//
// ⚠️ PİLOT DÖVÜŞMÜYOR, KAÇIYOR (`fleeInput`) — `balance.probe`taki ölçülmüş
// karar. Kaçan pilot silahların otomatik ateşiyle öldürüyor ve gerçek
// oyuncuya en yakın davranış; saldıran bir pilot yazmak, ölçtüğümüz şeyi
// pilotun becerisine bağlardı.
//
// ⚠️ HER BÖLÜM SABİT TOHUMLA koşuyor. Rastgele tohum, bir gün kod hiç
// değişmeden testi kırmızıya çevirirdi (`quests.test`teki sabit saat
// kararının aynısı).

import { STAGES, TICK } from './config.js';
import { Game } from './engine.js';
import { seedFromString } from './rng.js';
import { fleeInput, smartPick } from './simPlayer.js';
import { permanentBonus } from './forge.js';

const FAIL: string[] = [];
const check = (n: string, ok: boolean, d = '') => {
  if (!ok) { console.log(`  ✗ ${n}${d ? ` — ${d}` : ''}`); FAIL.push(n); }
};

/** Bölüm başına en fazla kaç simüle dakika — hiç bitmeyen bölümü yakalar */
const TAVAN_DK = 25;
const TAVAN = Math.floor((TAVAN_DK * 60) / TICK);

console.log(`\n═══ ${STAGES.length} BÖLÜM · GERÇEK KOŞU ═══`);
console.log('bölüm  ad                       süre    kill   seviye  boss  sonuç');

let toplamKill = 0;
let temizlenen = 0;

for (const st of STAGES) {
  let g: Game;
  try {
    // ⚠️ Forge bonusu YOK: bölüm çıplak bir oyuncuyla bitebiliyor olmalı.
    // Bonuslu koşmak, dengesi bozuk bir bölümü gizlerdi.
    g = new Game(seedFromString(`bolum-${st.id}`), st, {}, 'campaign', undefined, 1);
  } catch (e) {
    check(`bölüm ${st.id} motoru kuruluyor`, false, String(e));
    continue;
  }
  g.setViewport(1280, 720);

  let hata: string | null = null;
  let bossGoruldu = false;
  let adim = 0;
  try {
    for (; adim < TAVAN; adim++) {
      if (g.phase === 'levelup') g.choose(smartPick(g));
      if (g.phase !== 'running') break;
      g.setInput(...fleeInput(g));
      g.step();
      if (!bossGoruldu && g.enemies.some((e) => !!e.boss)) bossGoruldu = true;
    }
  } catch (e) {
    hata = e instanceof Error ? `${e.message}` : String(e);
  }

  const dk = Math.floor(g.time / 60), sn = Math.round(g.time % 60);
  const bossVar = !!st.boss;
  const sonuc = hata ? 'HATA' : g.phase === 'won' ? 'temiz' : g.phase === 'dead' ? 'öldü' : 'süre doldu';
  console.log(
    String(st.id).padStart(4),
    (st.name ?? '').slice(0, 24).padEnd(25),
    `${dk}:${String(sn).padStart(2, '0')}`.padStart(6),
    String(g.kills).padStart(6),
    String(g.level).padStart(7),
    (bossVar ? (bossGoruldu ? '  ✓' : '  ✗') : '  —').padStart(6),
    ' ' + sonuc,
  );

  toplamKill += g.kills;
  if (g.phase === 'won') temizlenen++;

  check(`bölüm ${st.id} motoru hata atmıyor`, hata === null, hata ?? '');
  // ⚠️ ASGARİ ŞART: düşman DOĞMALI. Doğmayan bir bölüm sessizce boş bir
  // tarla olur ve oyuncu ne olduğunu anlamadan bekler.
  check(`bölüm ${st.id} düşman doğuyor`, g.kills > 0 || g.enemies.length > 0, `kill ${g.kills}`);
  // ⚠️ SÜRE TAVANINA DAYANMAK bir hata işareti: bölüm ya bitmiyor ya da
  // pilotun öldüremeyeceği kadar zor.
  check(`bölüm ${st.id} ${TAVAN_DK} dakikada sonuçlanıyor`, adim < TAVAN, `${dk}:${sn} · faz ${g.phase}`);
  // ⚠️ Boss'u olan bölümde boss GÖRÜNMELİ — ama yalnız havuz boşaldıysa
  // (`won`) beklenebilir; pilot önce ölürse boss'a hiç sıra gelmez.
  if (bossVar && g.phase === 'won') {
    check(`bölüm ${st.id} boss'u geldi`, bossGoruldu, 'havuz boşaldı ama boss hiç doğmadı');
  }
}

console.log(`\n  toplam ${toplamKill.toLocaleString('tr-TR')} kill · ${temizlenen}/${STAGES.length} bölüm temizlendi`);

/**
 * ⚠️ "Kaç bölüm temizlendi" bir DENGE ölçüsü, bütünlük ölçüsü DEĞİL —
 * yukarıdaki koşu ÇIPLAK bir oyuncuyla (sıfır Forge). Gerçek oyuncu
 * bölüm 10'a Forge ağacının bir kısmıyla geliyor.
 */

// ── İKİNCİ GEÇİŞ: MAKUL BİR YÜKSELTMEYLE ──────────────────────────────
/**
 * ⭐ ASIL SORU BU. "Bölüm bozuk mu" sorusuna ÇIPLAK bir koşu cevap
 * VEREMEZ: çıplak oyuncu bölüm 10'da zaten 10 saniyede ölür ve bu
 * normaldir. Bölümün oynanabilirliği, oraya gerçekten ulaşmış bir
 * oyuncunun gücüyle ölçülmeli.
 *
 * ⚠️ Set ORTA seviye, maksimum DEĞİL: maksimumla koşmak her bölümü
 * geçirir ve hiçbir şey ölçmez.
 */
const ORTA = { might: 8, health: 8, cooldown: 5, area: 5, amount: 1 };
console.log('');
console.log('═══ AYNI 25 BÖLÜM · ORTA SEVİYE FORGE İLE ═══');
console.log('bölüm  ad                       süre    kill   seviye  sonuç');
let temiz2 = 0;
for (const st of STAGES) {
  const g = new Game(seedFromString(`bolum-${st.id}`), st, permanentBonus(ORTA), 'campaign', undefined, 1);
  g.setViewport(1280, 720);
  let hata: string | null = null;
  let adim = 0;
  try {
    for (; adim < TAVAN; adim++) {
      if (g.phase === 'levelup') g.choose(smartPick(g));
      if (g.phase !== 'running') break;
      g.setInput(...fleeInput(g)); g.step();
    }
  } catch (e) { hata = e instanceof Error ? e.message : String(e); }
  const dk = Math.floor(g.time / 60), sn = Math.round(g.time % 60);
  const sonuc = hata ? 'HATA' : g.phase === 'won' ? 'temiz' : g.phase === 'dead' ? 'öldü' : 'süre doldu';
  if (g.phase === 'won') temiz2++;
  console.log(
    String(st.id).padStart(4), (st.name ?? '').slice(0, 24).padEnd(25),
    `${dk}:${String(sn).padStart(2, '0')}`.padStart(6),
    String(g.kills).padStart(6), String(g.level).padStart(7), ' ' + sonuc,
  );
  check(`bölüm ${st.id} (orta Forge) hata atmıyor`, hata === null, hata ?? '');
  check(`bölüm ${st.id} (orta Forge) sonuçlanıyor`, adim < TAVAN, `faz ${g.phase}`);
}
console.log('');
console.log(`  orta seviye Forge ile ${temiz2}/${STAGES.length} bölüm temizlendi`);
// ⚠️ "Kaç bölüm temizlendi" bir DENGE ölçüsü, bütünlük ölçüsü değil —
// çıplak bir pilotun geç bölümleri geçememesi normal. O yüzden sayı
// yazdırılıyor ama BAŞARISIZ sayılmıyor. Ölçülen şey: hata atan,
// düşman doğurmayan ya da hiç bitmeyen bölüm var mı.

console.log(`\n${FAIL.length === 0 ? '✅ 25 BÖLÜM OYNANABİLİR' : `❌ ${FAIL.length} BAŞARISIZ`}\n`);
process.exit(FAIL.length === 0 ? 0 : 1);
