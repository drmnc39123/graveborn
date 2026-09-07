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
import { DESCENT, checkpointFor, startLevelFor } from './config.js';
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

console.log(`\n${FAIL.length === 0 ? '✅ CHECKPOINT + DRAFT SAĞLAM' : `❌ ${FAIL.length} BAŞARISIZ: ${FAIL.join(', ')}`}\n`);
process.exit(FAIL.length === 0 ? 0 : 1);
