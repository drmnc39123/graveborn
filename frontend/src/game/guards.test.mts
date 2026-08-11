// BEKÇİLER — ölçümle bulunmuş hataların geri gelmesini engelleyen testler.
//
// ⚠️ DOSYA ADI ÖNCE `palette.test.mts` İDİ ve içine görüş alanı determinizmi
// testi girince yalan söylemeye başladı. Bir testin adı ne ölçtüğünü
// söylemiyorsa, bir dahaki okuyan onu yanlış yerde arar.
//
// [1-3] PALET · [4] GÖRÜŞ ALANI DETERMİNİZMİ
//
// ── PALET ──
//
// ⚠️ NİYE VAR: kullanıcı "XP barı o yeşil gibi gözüken şey kötü duruyor" dedi
// ve haklıydı. `Bar` bileşeni varyanttan BAĞIMSIZ hep `Slider01_Bar08.png`i
// çiziyordu; o dosya ölçüldü ve rgb(102,157,78) çıktı — düpedüz YEŞİL.
// Oyunun paleti kemik/kan/mum altını/buz; yeşil hiçbir yerde yok. Yani hata
// koddaydı ama kimse fark etmedi çünkü HİÇBİR ŞEY ÖLÇMÜYORDU: bir sprite'ın
// adı ("Bar08") rengi hakkında hiçbir şey söylemiyor.
//
// ⚠️ ÖLÇÜM BİR KEZ, BEKÇİLİK SÜREKLİ. PNG renklerini node içinde çözmek bir
// görüntü kütüphanesi ister; bunun yerine 133 kit varlığı Pillow ile BİR KEZ
// tarandı (2026-08-11), ihlal edenler aşağıya yazıldı. Test artık ucuz:
// "arayüz bu dosyalardan birini çizebiliyor mu?" diye soruyor.
//
// ⚠️ LİSTE YENİDEN ÖLÇÜLMEDEN GENİŞLETİLMEZ. Buraya göz kararıyla dosya adı
// eklemek, bu dosyayı tam da yerine geçtiği şeye — tahmine — çevirir.

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { BAR_DOLGU, BTN } from '../components/ui/kit.js';
import { Game } from './engine.js';
import { ARENA } from './arena.js';

const FAIL: string[] = [];
function check(ad: string, kosul: boolean, detay = '') {
  if (kosul) console.log(`  ✓ ${ad}${detay ? ` — ${detay}` : ''}`);
  else { console.log(`  ✗ ${ad}${detay ? ` — ${detay}` : ''}`); FAIL.push(ad); }
}

/**
 * ÖLÇÜLMÜŞ İHLALLER — Pillow ile taranan görünür piksellerin ortalaması.
 * MOR: r ve b, g'den 25+ yüksek. YEŞİL: g, r ve b'den 25+ yüksek.
 */
const IHLAL: Record<string, string> = {
  'Slider01_Bar04.png': 'YEŞİL rgb(146,190,77)',
  'Slider01_Bar08.png': 'YEŞİL rgb(102,157,78)',
  'Slider02_Bar04.png': 'YEŞİL rgb(146,190,77)',
  'Slider02_Bar08.png': 'YEŞİL rgb(102,157,78)',
  'Slider03_Bar04.png': 'YEŞİL rgb(146,190,77)',
  'Slider03_Bar08.png': 'YEŞİL rgb(102,157,78)',
  'Button_06A_Pressed.png': 'MOR rgb(114,37,80)',
  'Input_PS_Square_Normal.png': 'MOR rgb(118,82,108)',
  'Input_PS_Square_Pressed.png': 'MOR rgb(99,64,99)',
  'Input_Xbox_B_Pressed.png': 'MOR rgb(135,66,95)',
  'Tab02_Bottom_Normal.png': 'MOR rgb(165,64,94)',
  'Tab03_Bottom_Normal.png': 'YEŞİL rgb(103,130,63)',
  'Tab07_Bottom_Normal.png': 'MOR rgb(170,62,97)',
  'Tab08_Bottom_Normal.png': 'YEŞİL rgb(104,135,63)',
  'Tab12_Bottom_Normal.png': 'MOR rgb(166,64,95)',
  'Tab13_Bottom_Normal.png': 'YEŞİL rgb(103,131,64)',
};

/** Kaynak ağacındaki tüm .ts/.tsx (testler hariç) */
function kaynaklar(kok: string, out: string[] = []): string[] {
  for (const ad of readdirSync(kok)) {
    const yol = join(kok, ad);
    if (statSync(yol).isDirectory()) { kaynaklar(yol, out); continue; }
    if (/\.(ts|tsx)$/.test(ad) && !ad.includes('.test.')) out.push(yol);
  }
  return out;
}

console.log('');
console.log('[1] Çubuk dolgusu — kullanıcının gördüğü hata');
{
  // ⚠️ ŞABLONLU YOL, LİTERAL DEĞİL: `Bar` dosya adını
  // `Slider${variant}_Bar${BAR_DOLGU[tone]}.png` diye kuruyor. Kaynakta
  // "Bar08" diye bir metin ARAMAK bu hatayı KAÇIRIRDI — sözlüğün kendi
  // değerlerine bakmak gerekiyor.
  const yesiller = ['04', '08'];
  const kotu = Object.entries(BAR_DOLGU).filter(([, v]) => yesiller.includes(v));
  check('hiçbir çubuk tonu yeşil dolguya bakmıyor', kotu.length === 0,
    kotu.map(([k, v]) => `${k}→Bar${v}`).join(', ') || Object.entries(BAR_DOLGU).map(([k, v]) => `${k}→Bar${v}`).join(' · '));
}

console.log('');
console.log('[2] Düğme sözlüğü');
{
  const kotu = Object.entries(BTN).filter(([, v]) => v === '06A');
  check('BTN mor varyanta bakmıyor (06A)', kotu.length === 0,
    Object.entries(BTN).map(([k, v]) => `${k}→${v}`).join(' · '));
}

console.log('');
console.log('[3] Kaynakta ihlal eden dosya adı geçmiyor');
{
  const kok = join(process.cwd(), 'src');
  const metin = kaynaklar(kok).map((f) => readFileSync(f, 'utf8')).join('\n');
  const gecen = Object.keys(IHLAL).filter((ad) => metin.includes(ad.replace('.png', '')));
  check('palet dışı varlık adı kaynakta YOK', gecen.length === 0,
    gecen.map((a) => `${a} (${IHLAL[a]})`).join(' | ') || `${Object.keys(IHLAL).length} ihlal listede, hiçbiri kullanılmıyor`);
}


console.log('');
console.log('[4] Görüş alanı simülasyonu etkiliyor — düello vaadi');
{
  /**
   * ⚠️ NİYE BURADA: düello paneli oyuncuya AÇIKÇA "same seed, same enemies,
   * in the same order" diyor. Ölçüldü ki bu vaat YANLIŞTI — pencere boyutu
   * doğum halkasının yarıçapını belirliyor, yani aynı seed farklı ekranda
   * FARKLI koşu üretiyordu (1280×720'de 84 öldürme, 1920×900'de 75).
   * Düzeltme: düello koşusunda `lockViewport`. Bu bölüm iki şeyi ölçüyor —
   * hatanın gerçek olduğunu ve kilidin onu kapattığını.
   */
  const kos = (w: number, h: number, kilit: boolean) => {
    const g = new Game(4242);
    if (kilit) g.lockViewport(ARENA.viewW, ARENA.viewH);
    g.setViewport(w, h);
    for (let i = 0; i < 1800 && g.phase === 'running'; i++) g.step();
    return g.kills;
  };

  // ⚠️ ÇİFT TARAFLI: önce hatanın GERÇEK olduğunu göster. Bu satır olmasaydı
  // kilit bir gün kaldırılsa test yine geçer ve koruma anlamını yitirirdi.
  const kilitsizDar = kos(1280, 720, false);
  const kilitsizGenis = kos(1920, 900, false);
  check('kilitsizken pencere boyutu koşuyu DEĞİŞTİRİYOR (hata gerçek)',
    kilitsizDar !== kilitsizGenis, `${kilitsizDar} vs ${kilitsizGenis} öldürme`);

  const kilitliDar = kos(1280, 720, true);
  const kilitliGenis = kos(1920, 900, true);
  check('KİLİTLİYKEN pencere boyutu koşuyu değiştirMİYOR',
    kilitliDar === kilitliGenis, `${kilitliDar} = ${kilitliGenis} öldürme`);

  // Kilit, mühürlenen yapılandırmayla aynı sonucu vermeli
  check('kilitli sonuç, 1280×720 referansıyla aynı',
    kilitliGenis === kilitsizDar, `${kilitliGenis} = ${kilitsizDar}`);
}


console.log('\n[5] "Ulaşılan" ile "temizlenen" derinlik AYNI SAYI DEĞİL');
{
  /**
   * ⚠️ NİYE BURADA: ölüm ekranı `deepestCleared`ı "Reached depth" diye
   * yazıyordu. Derinlik 1'de ölen oyuncu **"Reached depth 0"** görüyordu —
   * derinlik 0 diye bir şey yok ve koşu içi HUD bir saniye önce "DEPTH 1"
   * yazıyordu. Oyuncu aynı ekranda kendisiyle çelişen iki sayı görüyordu.
   *
   * İki alanın AYRI kalması gerekiyor ve bu ölçülebilir:
   *   `depth`          = üstünde savaştığı kat  → "ne kadar indim"
   *   `deepestCleared` = tamamen bitirdiği kat  → ÖDEME bunu baz alır
   * Biri diğerinin yerine kullanılırsa ya oyuncuya yalan söylenir ya da
   * ödenmemiş bir derinlik ödenmiş sayılır. Bu bölüm ikisini de kilitliyor.
   */
  const g = new Game(9182, undefined, undefined, 'descent', undefined, 1);
  g.lockViewport(1280, 720);
  check('koşu derinlik 1de başlıyor', g.stage.depth === 1, `d${g.stage.depth}`);
  check('hiçbir kat bitirilmeden temizlenen SIFIR',
    g.stage.deepestCleared === 0, `${g.stage.deepestCleared}`);
  check('yani ikisi FARKLI — biri diğerinin yerine yazılamaz',
    g.stage.depth !== g.stage.deepestCleared,
    `depth ${g.stage.depth} ≠ cleared ${g.stage.deepestCleared}`);

  // Temizlenen, ulaşılanı ASLA geçemez — geçerse ödenmemiş kat ödenmiş sayılır
  for (let i = 0; i < 40000 && g.phase === 'running'; i++) {
    if (g.phase === 'levelup') g.choose(g.offers[0].id);
    g.setInput(0.6, 0.4);
    g.step();
  }
  check('temizlenen ≤ ulaşılan (koşu boyunca)',
    g.stage.deepestCleared <= g.stage.depth,
    `cleared ${g.stage.deepestCleared} ≤ depth ${g.stage.depth}`);
}


console.log(`\n${FAIL.length === 0 ? '✅ BEKÇİLER GEÇTİ' : `❌ ${FAIL.length} BAŞARISIZ: ${FAIL.join(', ')}`}\n`);
process.exit(FAIL.length === 0 ? 0 : 1);
