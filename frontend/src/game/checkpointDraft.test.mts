// CHECKPOINT + YETİŞME DRAFTI MÜHRÜ.
//
// 🔴 NİYE VAR: bu iki davranış OYUNCU TARAFINDAN HATA SANILDI (2026-09-07).
// Bildirim aynen şuydu:
//   1. "kart seçtim, arka arkaya kart seçimleri geldi, XP toplamadan
//      seviye 10 oldum — burada bir hata mevcut"
//   2. "derinlik 9'da çıktım, geri döndüğümde derinlik 6'dan devam et dedi —
//      9'dan başlaması gerekmiyor mu?"
//
// Ölçüldü: İKİSİ DE DOĞRU ÇALIŞIYORDU. Hata koddaydı değil, ANLATIMDAYDI —
// ekranda bunu açıklayan tek kelime yoktu. Bu mühür hem sayıları hem de
// AÇIKLAMANIN YERİNDE DURDUĞUNU kilitliyor: mekanizma sessizce değişirse ya
// da etiket kaldırılırsa aynı yanlış anlama geri gelir.
//
//   cd frontend && npx tsx src/game/checkpointDraft.test.mts

import fs from 'node:fs';
import { DESCENT, STAGES, checkpointFor, startLevelFor } from './config.js';
import { DEFAULT_HERO } from './heroes.js';
import { Game } from './engine.js';
import { allowedStartDepth, emptyProgress, type Progress } from './progress.js';

const FAIL: string[] = [];
const check = (n: string, ok: boolean, d = '') => {
  console.log(`${ok ? '  ✓' : '  ✗'} ${n}${d ? ` — ${d}` : ''}`);
  if (!ok) FAIL.push(n);
};

console.log('\n═══ CHECKPOINT + YETİŞME DRAFTI ═══');

console.log('\n[1] ⭐ OYUNCUNUN BİLDİRDİĞİ SENARYO — d9 çıkış, d6 dönüş');
{
  const p: Progress = { ...emptyProgress(), depthPaid: { 1: 9 } };
  check('d9 ödenmiş → checkpoint d5', checkpointFor(9) === 5, `d${checkpointFor(9)}`);
  check('devam derinliği d6', allowedStartDepth(p, 1) === 6, `d${allowedStartDepth(p, 1)}`);
  /**
   * ⚠️ KAYIP YOK — açıklamanın kalbi bu. d1-d9 ödülleri `depthPaid` ile ZATEN
   * ödenmiş; o basamakları tekrar geçmek ikinci kez ödeme yapmıyor, yani
   * oyuncu ilerleme kaybetmiyor, yalnız merdivenin başına dönüyor.
   */
  check('ödenmiş derinlik korunuyor', p.depthPaid[1] === 9, String(p.depthPaid[1]));
  check('checkpoint boss basamağı', 5 % DESCENT.bossEvery === 0, `her ${DESCENT.bossEvery}`);
}

console.log('\n[2] ⭐ "XP toplamadan seviye 10" — sayı birebir tutuyor');
{
  /**
   * Oyuncu seviye 10'da olduğunu söyledi. `startLevelFor(9) = 10` ve draft
   * kartı sayısı = seviye − 1 = 9. Yani gözlem mekanizmayla BİREBİR uyuşuyor;
   * "XP toplamadan" doğru, çünkü draft XP'den değil derinlikten geliyor.
   */
  check('d9 başlangıç seviyesi 10', startLevelFor(9) === 10, `L${startLevelFor(9)}`);
  check('d9 draft kartı 9', Math.max(0, startLevelFor(9) - 1) === 9);
  // ⚠️ d1'de DRAFT OLMAMALI — sıfırdan başlayan oyuncu bedava seviye almamalı
  check('d1\'de draft yok', Math.max(0, startLevelFor(1) - 1) === 0, `L${startLevelFor(1)}`);
  // Draft, derinlikle birlikte monoton artmalı; azalırsa daha derinden
  // başlayan oyuncu daha zayıf başlardı
  let monoton = true;
  for (let d = 1; d < 60; d++) if (startLevelFor(d + 1) < startLevelFor(d)) monoton = false;
  check('başlangıç seviyesi derinlikle azalmıyor', monoton);
}

console.log('\n[3] CHECKPOINT KURALI TUTARLI');
{
  for (const [derinlik, beklenen] of [[1, 0], [4, 0], [5, 5], [9, 5], [10, 10], [14, 10], [23, 20]] as const) {
    check(`checkpointFor(${derinlik}) = ${beklenen}`, checkpointFor(derinlik) === beklenen,
      String(checkpointFor(derinlik)));
  }
  check('hiç inilmemişse d1', allowedStartDepth(emptyProgress(), 1) === 1);
  // ⚠️ ÇİFT TARAFLI: checkpoint ASLA ulaşılan derinliği geçmemeli, yoksa
  // oyuncu hiç görmediği bir derinlikten başlar ve ödül basılırdı.
  let ileri = 0;
  for (let d = 0; d < 200; d++) if (checkpointFor(d) > d) ileri++;
  check('checkpoint ulaşılanı geçmiyor', ileri === 0, `${ileri} ihlal`);
}

console.log('\n[4] ⭐ AÇIKLAMA EKRANDA DURUYOR MU');
{
  /**
   * 🔴 ASIL DERS. Mekanizma doğruydu; eksik olan tek şey oyuncuya söylenen
   * cümleydi. Etiket kaldırılırsa aynı bildirim geri gelir — o yüzden
   * kaynakta varlığı ölçülüyor (`autoProps` mührüyle aynı desen).
   */
  const canvas = fs.readFileSync('src/components/GameCanvas.tsx', 'utf8');
  check('draft etiketi bağlı (draftLevel)', /draftLevel/.test(canvas));
  check('draft ekranda adlandırılıyor', /STARTING DRAFT/.test(canvas));
  check('draft neden olduğu yazılı', /CATCHING UP/.test(canvas));

  const play = fs.readFileSync('src/app/play/page.tsx', 'utf8');
  check('devam ipucu en iyi derinliği söylüyor', /Best depth/.test(play));
  check('devam ipucu checkpoint aralığını söylüyor', /bossEvery/.test(play));
  // ⚠️ KONTROL GRUBU: tarama her şeye "evet" diyor olabilirdi
  check('uydurma metin bulunmuyor (kontrol grubu)', !/ZZZ_OLMAYAN_METIN/.test(canvas + play));
}

console.log('\n[5] 🔴 HAVUZ TÜKENİNCE OYUN KİLİTLENMİYOR');
{
  /**
   * 🔴 GERÇEK KİLİTLENME (kullanıcı bildirdi, ultra modda ölçüldü):
   *   *"tüm skill kartlarını seçtiğimde oyunu açmıyor, oyun donuyor."*
   *
   * SEBEP: 4 silahın ve 6 pasifin hepsi tavana ulaşınca `rollOffers` boş
   * havuz döndürüyordu, ama `levelUp` yine de `phase = 'levelup'`
   * yazıyordu. Ekranda sıfır kart; `choose()` hiçbir zaman çağrılamaz;
   * faz asla 'running'e dönmez. Oyun donmuş DEĞİL — SEÇİLEMEYECEK bir
   * seçimi bekliyor.
   *
   * ⚠️ ULTRA MODA ÖZEL DEĞİL. Orada derinlik 201 yüzünden 192 kart
   * çekildiği için GARANTİ oluyordu; yeterince uzun her koşu aynı duvara
   * çarpar. Bu yüzden mühür motoru SÜRÜYOR, bir sabiti okumuyor.
   *
   * ⚠️ ÖLÇÜM GERÇEK: `Game` kuruluyor ve `step()` ile sürülüyor. Kaynakta
   * bir `if` aramak, kuralın ÇALIŞTIĞINI değil YAZILDIĞINI kanıtlardı.
   */
  const g = new Game(20260908, STAGES[0], {}, 'descent', DEFAULT_HERO, 90);
  const beklenen = Math.max(0, startLevelFor(90) - 1);
  check('yüksek derinlik çok sayıda draft üretiyor', beklenen > 60, beklenen + ' kart');

  let secim = 0, bosEkran = 0, adim = 0;
  // ⚠️ Sayaç testin KENDİSİ donmasın diye; tavan draft sayısının kat kat üstünde.
  while (g.pendingLevels > 0 && adim++ < 20000) {
    g.step();
    if (g.phase === 'levelup') {
      if (g.offers.length === 0) { bosEkran++; break; }
      g.choose(g.offers[0].id);
      secim++;
    }
  }
  check('boş kart ekranı HİÇ açılmadı', bosEkran === 0, bosEkran + ' kez');
  check('birikmiş seviyeler tükendi (kilit yok)', g.pendingLevels === 0, 'kalan ' + g.pendingLevels);
  check('koşu oynanır durumda', g.phase === 'running', g.phase);
  /**
   * ⚠️ ÇİFT TARAFLI VE ASIL KANIT: havuz GERÇEKTEN tükendi mi? Tükenmediyse
   * bu bölüm hiçbir şey ölçmemiş olurdu — eski kod da geçerdi. Seçim sayısı
   * seviye sayısından AZ olmalı: aradaki fark, kart sunulamadığı için
   * sessizce atlanan seviyelerdir.
   */
  check('havuz gerçekten tükendi (kontrol grubu)', secim < beklenen,
    secim + ' seçim / ' + beklenen + ' seviye');
  const src = fs.readFileSync('src/game/engine.ts', 'utf8');
  check('rollOffers KOŞULSUZ çağrılıyor (RNG akışı korunuyor)',
    src.indexOf('this.rollOffers(h);') < src.indexOf('if (h.offers.length === 0) return;'));
}

console.log(`\n${FAIL.length === 0 ? '✅ CHECKPOINT + DRAFT SAĞLAM' : `❌ ${FAIL.length} BAŞARISIZ: ${FAIL.join(', ')}`}\n`);
process.exit(FAIL.length === 0 ? 0 : 1);
