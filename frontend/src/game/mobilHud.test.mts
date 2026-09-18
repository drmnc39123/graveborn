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
  // ⚠️ İKİ KAYNAK: yalnız `pointer: coarse` bazı WebView'larda yanlış (HubCanvas'ta ölçüldü)
  check('GameCanvas dokunmatigi IKI kaynaktan olcuyor',
    /pointer: coarse/.test(oyun) && /maxTouchPoints \?\? 0\) > 0;\s*setHint\(hintText\(h, dokunmatik\)\)/.test(oyun));
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
  check('sag kolon kartlari sadeHud iken gizli', /\{!sadeHud && \(\(\) => \{\s*const kartlar = \[\s*<EventBanner/.test(play));
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

console.log('\n[3c] ** TELEFONDA KARTLAR YAN YANA SERIT (kullanici istegi)');
{
  /**
   * 🔴 Kullanıcı: *"mobilde sağa sola kaymalı tıklamalı olsun, desktop'taki
   * gibi aşağı yukarı değil."* Üç kart alt alta ~480 px kaplıyordu.
   */
  const serit = yorumsuz(oku('../components/KartSeridi.tsx'));
  check('telefonda KartSeridi, masaustunde sutun',
    /return telefon \? <KartSeridi>\{kartlar\}<\/KartSeridi> : <>\{kartlar\}<\/>/.test(play));
  check('yatay yapiskan kaydirma', /scrollSnapType: 'x mandatory'/.test(serit) && /flex: '0 0 100%'/.test(serit));
  check('onceki/sonraki + nokta dugmeleri', /aria-label="Previous card"/.test(serit) && /aria-label="Next card"/.test(serit)
    && /aria-label=\{`Card \$\{i \+ 1\}/.test(serit));
  check('bos kart slayt sayilmiyor', /childElementCount === 0/.test(serit));
  check('ok dugmeleri 32 px', /const DOKUNMA = (3[2-9]|[4-9]\d)/.test(serit));
}

console.log('\n[4] ** ANA SAYFA KAPISI GORUNUR YUKSEKLIKTE');
{
  const ana = yorumsuz(oku('../app/page.tsx'));
  check("kapi 100dvh (Phantom'da 100vh arac cubugunu sayar)", /minHeight: '100dvh'/.test(ana) && !/minHeight: '100vh'/.test(ana));
}

if (FAIL.length) { console.log(`\n${FAIL.length} BASARISIZ: ${FAIL.join(', ')}`); process.exit(1); }
console.log('\nMOBIL HUD SAGLAM');
