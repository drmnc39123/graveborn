// MOBİL HUD MÜHRÜ — telefonda (Phantom uygulama içi tarayıcı dahil) üst
// üste binen koşu ve köy öğeleri.
//
// 🔴 NİYE VAR (2026-09-18, `promo/tools/mobil-denetim.mjs` ölçümü, 375x560
// ve 780x340 Phantom görünür alanı):
//   1. Koşu üst şeridinde süre · ses · ayar · EXIT sağ bloğa sığmıyor,
//      bölüm adı ve "left" sayacının üstüne biniyordu.
//   2. Tutorial telefonda "WASD or arrows" diyordu ve kartı can küresinin
//      üstüne biniyordu.
//   3. START HERE kartı etkinlik/boss kartlarının ve sohbetin üstüne biniyor,
//      yatayda cüzdan kapısını kapatıyordu.
//
//   cd frontend && npx tsx src/game/mobilHud.test.mts

import fs from 'node:fs';
import { HINTS, hintText } from './tutorial.js';

const FAIL: string[] = [];
const check = (n: string, ok: boolean, d = '') => {
  console.log(`${ok ? '  ✓' : '  ✗'} ${n}${d ? ` — ${d}` : ''}`);
  if (!ok) FAIL.push(n);
};
const oku = (f: string) => fs.readFileSync(new URL(f, import.meta.url), 'utf8');
const yorumsuz = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

const oyun = yorumsuz(oku('../components/GameCanvas.tsx'));
const play = yorumsuz(oku('../app/play/page.tsx'));
const ilk = yorumsuz(oku('../components/FirstRun.tsx'));

console.log('\n=== MOBIL HUD ===');

console.log('\n[1] ** TUTORIAL DOKUNMATIKTE KLAVYE DEMIYOR');
{
  const hareket = HINTS.find((h) => h.id === 'move')!;
  const dokun = hintText(hareket, true);
  check('dokunmatik metinde WASD/arrows yok', !/WASD|arrow/i.test(dokun), dokun);
  check('masaustu metni klavyeyi anlatiyor (kontrol grubu)', /WASD/.test(hintText(hareket, false)));
  for (const h of HINTS) {
    if (/WASD|arrow|keyboard|press [A-Z]\b/i.test(h.text))
      check(`'${h.id}' klavye diyor → textTouch sart`, !!h.textTouch && !/WASD|arrow|keyboard/i.test(h.textTouch));
  }
  // ⚠️ Algılama ORTAK modülden (`lib/dokunmatik`) — tek kaynak, üç sinyal.
  // Kendi satır içi kopyasını yazan dosya [3d]'de de yakalanıyor.
  check('GameCanvas ipucu ortak algilamayi kullaniyor',
    /setHint\(hintText\(h, dokunmatikMi\(\)\)\)/.test(oyun)
    && /from '@\/lib\/dokunmatik'/.test(oku('../components/GameCanvas.tsx')));
  check('ipucu dar ekranda kurenin ustunde', /bottom: darHud \? 150 : 96/.test(oyun));
}

console.log('\n[2] ** KOSU UST SERIDI DAR EKRANDA SIGIYOR');
{
  check('ses+ayar tek tanim', (oyun.match(/aria-label="Graphics quality"/g) ?? []).length === 1);
  check('dar ekranda kontroller solda', /LV \{hud\.level\}\s*\{darHud && kontroller\}/.test(oyun));
  check('genis ekranda sagda (kontrol grubu)', /\{!darHud && kontroller\}/.test(oyun));
  check('dar ekranda dokunma hedefi 32', /width: darHud \? 32 : 26/.test(oyun));
  check('dar ekranda sure ortada', /\{darHud && \(\s*<span[^>]*>\s*\{fmtTime\(hud\.time\)\}/.test(oyun));
}

console.log('\n[3] ** START HERE TELEFONDA TEK BASINA');
{
  check('telefon = dar VEYA kisa', /const telefon = ekranW < 640 \|\| kisaEkranMi\(ekranH\)/.test(play));
  check('sadeHud = telefon && ilkGorunur', /const sadeHud = telefon && ilkGorunur/.test(play));
  check('sohbet sadeHud iken gizli', /\{!panel && !sadeHud && \(\s*<ChatPanel/.test(play));
  check('sag kolon kartlari sadeHud iken gizli',
    /\{!sadeHud && !telefon && sagKartlar\(progress\)\}/.test(play) && /\{!sadeHud && telefon && \(\s*<KartCekmece/.test(play));
  check('cuzdan kapisi HER ZAMAN (kontrol grubu)', /\{getMode\(\) === 'demo' && <PlayConnect \/>\}\s*\{!sadeHud/.test(play));
  check('FirstRun kisa ekranda kompakt ve sag kolonu bosaltiyor',
    /kompakt=\{kisaEkranMi\(ekranH\)\}/.test(play) && /sagBosluk=\{kisaEkranMi\(ekranH\) \? kolon\.w/.test(play)
    && /right: sagBosluk/.test(ilk));
}

console.log('\n[3b] ** SAG KOLON KARTLARI KOLONA SIGIYOR');
{
  const hazir = yorumsuz(oku('../components/ReadyCard.tsx'));
  check('ReadyCard %100 genislikte border-box', /width: 'min\(214px, 100%\)',\s*boxSizing: 'border-box'/.test(hazir));
}

console.log('\n[3c] ** TELEFONDA KARTLAR SAGDAN ACILAN CEKMECEDE (kullanici istegi)');
{
  /**
   * 🔴 Kullanıcı: *"sağda küçük ikon olacak, tıklayınca sola doğru açılan
   * pencere; tekrar tıklayınca sağa doğru kapanacak."* Önce yan yana
   * kaydırmalı şerit yapılmıştı — İSTENMEDİ, geri gelmemeli.
   */
  const cek = yorumsuz(oku('../components/KartCekmece.tsx'));
  check('telefonda cekmece, masaustunde sutun (tek kart tanimi)',
    /telefon && \(\s*<KartCekmece[\s\S]{0,300}\{sagKartlar\(progress\)\}\s*<\/KartCekmece>/.test(play)
    && /!telefon && sagKartlar\(progress\)/.test(play));
  check('kapaliyken saga, acikken sola kayiyor',
    /transform: acik \? 'translateX\(0\)' : `translateX\(\$\{genislik\}px\)`/.test(cek));
  check('ayni sekme acar ve kapar', /onClick=\{\(\) => setAcik\(\(v\) => !v\)\}/.test(cek) && /aria-expanded=\{acik\}/.test(cek));
  check('sekme dokunma hedefi >= 32', (+(cek.match(/CEKMECE_SEKME = (\d+)/)?.[1] ?? 0)) >= 32);
  check('hareket kapaliysa gecis yok', /hareketYok \? 'none'/.test(cek));
  check('varsayilan KAPALI', /useState\(false\)/.test(cek));
  // 🔴 Ölçüldü 780x340: açık panel ekranın altına taşıyordu
  check('acik panel ekrana sigiyor (yataya karsi yukari kayar)',
    /const kayma = Math\.min\(0, ekranH - 12 - EN_AZ_H - ust\)/.test(cek) && /marginTop: kayma/.test(cek)
    && /ekranH=\{ekranH\}/.test(play));
  check('kaydirmali serit geri gelmedi', !/KartSeridi|scrollSnapType/.test(play));
}

console.log('\n[3d] ** PARMAK HEDEFLERI VE TEK KAYNAK ALGILAMA');
{
  /**
   * 🔴 ÖLÇÜLDÜ (mobil denetim): pano WATCH düğmesi 15 px, yükseliş çipleri
   * 20x20 idi — parmakla komşusuna basılıyordu.
   * 🔴 ALGILAMA ÜÇ YERDE AYRI YAZILIYDI ve biri yalnız `(pointer: coarse)`
   * okuyordu; o kaynak tek başına YALAN SÖYLÜYOR (HubCanvas'ta ölçüldü).
   */
  const dok = yorumsuz(oku('../lib/dokunmatik.ts'));
  const pano = yorumsuz(oku('../components/LeaderboardsPanel.tsx'));
  const m = dok.match(/DOKUNMA_HEDEFI = (\d+)/);
  check('DOKUNMA_HEDEFI >= 32', !!m && +m[1] >= 32, m?.[1] ?? '');
  check('uc kaynak: coarse + maxTouchPoints + touchstart',
    /pointer: coarse/.test(dok) && /maxTouchPoints/.test(dok) && /'touchstart'/.test(dok));
  check('WATCH dugmesi dokunmatikte buyuyor', /minHeight: dokunmatik \? DOKUNMA_HEDEFI/.test(pano));
  check('yukselis cipleri dokunmatikte buyuyor',
    /minWidth: dokunmatik \? DOKUNMA_HEDEFI/.test(play) && /minHeight: dokunmatik \? DOKUNMA_HEDEFI/.test(play));

  /**
   * ⚠️ TEK KAYNAK: `(pointer: coarse)` sorgusunu ortak modülden BAŞKA yerde
   * kimse okumamalı. `quality.ts` hariç — o cihaz KADEMESİ tahmin ediyor
   * (başka soru), burada dokunma hedefi konuşuluyor.
   */
  const kacak: string[] = [];
  for (const f of ['../components/HubCanvas.tsx', '../components/GameCanvas.tsx',
    '../components/LeaderboardsPanel.tsx', '../app/play/page.tsx']) {
    if (/matchMedia[^\n]*pointer: coarse/.test(yorumsuz(oku(f)))) kacak.push(f);
  }
  check('algilama yalniz lib/dokunmatik icinde', kacak.length === 0, kacak.join(', '));
}

console.log('\n[4] ** ANA SAYFA KAPISI GORUNUR YUKSEKLIKTE');
{
  const ana = yorumsuz(oku('../app/page.tsx'));
  check("kapi 100dvh (Phantom'da 100vh arac cubugunu sayar)", /minHeight: '100dvh'/.test(ana) && !/minHeight: '100vh'/.test(ana));
}

if (FAIL.length) { console.log(`\n${FAIL.length} BASARISIZ: ${FAIL.join(', ')}`); process.exit(1); }
console.log('\nMOBIL HUD SAGLAM');
