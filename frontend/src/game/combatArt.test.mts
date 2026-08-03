// SAVAŞ GÖRSELLERİ BÜTÜNLÜK TESTİ.
//
// Buradaki hatalar SESSİZDİR ve teşhisi haftalar alır:
//   · yanlış dosya adı  → 404 → `drawCell` false döner → efekt hiç görünmez
//   · yanlış `cols`     → atlas dışına taşma → BOŞ kare çizilir
//   · yanlış satır      → mor efekt (paletin tek yasağı) sahneye sızar
//   · aynı atlas+satır  → iki silah ayırt edilemez (düzeltmeye çalıştığımız sorun)
//
// Manifest (2842 kayıt, her dosya için w/h) dosyanın varlığının ve
// boyutunun TEK kaynağı — ona soruyoruz, tahmin etmiyoruz.
//
// Çalıştır:  npx tsx src/game/combatArt.test.mts

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PASSIVE_ART, WEAPON_ART, weaponArt, type CellAnim } from './combatArt.js';
import { EVOLVED, PASSIVES, WEAPONS } from './config.js';

const FAIL: string[] = [];
const check = (n: string, ok: boolean, d = '') => {
  console.log(`${ok ? '  ✓' : '  ✗'} ${n}${d ? ` — ${d}` : ''}`);
  if (!ok) FAIL.push(n);
};

const here = path.dirname(fileURLToPath(import.meta.url));
const manifest = JSON.parse(
  fs.readFileSync(path.join(here, '../../public/art/manifest.json'), 'utf8'),
) as { items: { src: string; w: number; h: number }[] };
const bySrc = new Map(manifest.items.map((i) => [i.src, i]));

/** ⚠️ MOR SATIRLAR — ölçüldü (satır ortalama renkleri), "MOR YOK" kuralı */
const YASAK_SATIR = new Set([1, 6, 8]);

console.log('\n[1] Kapsama — her silahın ve pasifin görseli var mı');
{
  const silahlar = [...WEAPONS, ...EVOLVED];
  const eksik = silahlar.filter((w) => !WEAPON_ART[w.id]).map((w) => w.id);
  check('her silahın görsel kaydı var', eksik.length === 0,
    eksik.join(', ') || `${silahlar.length} silah`);

  const eksikPasif = PASSIVES.filter((p) => !PASSIVE_ART[p.id]).map((p) => p.id);
  check('her pasifin ikonu var', eksikPasif.length === 0,
    eksikPasif.join(', ') || `${PASSIVES.length} pasif`);

  check('bilinmeyen silah fallback veriyor', !!weaponArt('yok_boyle_silah').impact);
}

console.log('\n[2] Dosyalar GERÇEKTEN var mı (sessiz 404 avı)');
{
  const eksikDosya: string[] = [];
  const kontrol = (etiket: string, src: string) => {
    if (!bySrc.has(src)) eksikDosya.push(`${etiket}: ${src}`);
  };
  for (const [id, a] of Object.entries(WEAPON_ART)) {
    kontrol(`${id}.icon`, a.icon);
    kontrol(`${id}.impact`, a.impact.src);
    if (a.bullet) kontrol(`${id}.bullet`, a.bullet.src);
  }
  for (const [id, a] of Object.entries(PASSIVE_ART)) kontrol(`${id}.icon`, a.icon);
  check('referans verilen her dosya manifest\'te MEVCUT', eksikDosya.length === 0,
    eksikDosya.slice(0, 4).join(' | ') || 'hepsi var');
}

console.log('\n[3] Atlas geometrisi — cols ÖLÇÜLEN değerle uyuşuyor mu');
{
  // ⚠️ ASIL TUZAK BU. fx/rpg atlaslarının genişliği 448-1152 px arasında
  // değişiyor (7-18 sütun). Sabit 12 varsaymak 252 atlasın 188'inde yanlış
  // kare çizer — ve taşma SESSİZCE boş kare olur.
  const hatali: string[] = [];
  const tasan: string[] = [];
  const anims: [string, CellAnim][] = [];
  for (const [id, a] of Object.entries(WEAPON_ART)) {
    anims.push([`${id}.impact`, a.impact]);
    if (a.bullet) anims.push([`${id}.bullet`, a.bullet]);
  }
  for (const [etiket, a] of anims) {
    const m = bySrc.get(a.src);
    if (!m) continue;                       // [2] zaten raporladı
    const gercekCols = m.w / a.cell;
    const gercekRows = m.h / a.cell;
    if (a.cols !== gercekCols) hatali.push(`${etiket}: cols ${a.cols} ≠ ${gercekCols}`);
    if (a.frames > gercekCols) tasan.push(`${etiket}: frames ${a.frames} > cols ${gercekCols}`);
    if (a.row >= gercekRows) tasan.push(`${etiket}: row ${a.row} ≥ rows ${gercekRows}`);
  }
  check('cols değerleri atlasın GERÇEK genişliğiyle uyuşuyor', hatali.length === 0,
    hatali.slice(0, 3).join(' | ') || `${anims.length} animasyon`);
  check('hiçbir animasyon atlas dışına TAŞMIYOR', tasan.length === 0,
    tasan.slice(0, 3).join(' | ') || 'temiz');
}

console.log('\n[4] MOR YOK — paletin tek yasağı');
{
  const morKullanan: string[] = [];
  for (const [id, a] of Object.entries(WEAPON_ART)) {
    // Yasak sadece fx/rpg atlasları için (satır = renk orada geçerli)
    if (a.impact.src.includes('/fx/rpg/') && YASAK_SATIR.has(a.impact.row)) {
      morKullanan.push(`${id}: satır ${a.impact.row}`);
    }
  }
  check('hiçbir silah MOR satır kullanmıyor', morKullanan.length === 0,
    morKullanan.join(', ') || 'satır 1/6/8 kullanılmıyor');

  // Tint renkleri de mor olmamalı
  const morTint = Object.entries(WEAPON_ART)
    .filter(([, a]) => { const [r, g, b] = a.tint; return b > g + 25 && r > g + 12 && b >= r * 0.8; })
    .map(([id]) => id);
  check('hiçbir silahın tonu MOR değil', morTint.length === 0, morTint.join(', ') || 'temiz');
}

console.log('\n[5] AYRIŞMA — iki silah aynı görünemez');
{
  // ⚠️ Düzeltmeye çalıştığımız sorun tam buydu: 16 silah tek mermiyi
  // paylaşıyordu, 8 evrimin görsel farkı SIFIRDI.
  const cift = new Map<string, string[]>();
  for (const [id, a] of Object.entries(WEAPON_ART)) {
    const k = `${a.impact.src}#${a.impact.row}`;
    (cift.get(k) ?? cift.set(k, []).get(k)!).push(id);
  }
  const cakisan = [...cift.entries()].filter(([, ids]) => ids.length > 1);
  check('hiçbir iki silah aynı (atlas, satır) çarpmasını kullanmıyor',
    cakisan.length === 0,
    cakisan.map(([k, ids]) => `${ids.join('+')} → ${k.split('/').pop()}`).join(' | ') || `${cift.size} benzersiz`);

  // Mermiler de ayrışmalı
  const mermi = new Map<string, string[]>();
  for (const [id, a] of Object.entries(WEAPON_ART)) {
    if (!a.bullet) continue;
    const k = `${a.bullet.src}#${a.bullet.row}`;
    (mermi.get(k) ?? mermi.set(k, []).get(k)!).push(id);
  }
  const mermiCakisan = [...mermi.entries()].filter(([, ids]) => ids.length > 1);
  check('hiçbir iki silah aynı mermiyi kullanmıyor', mermiCakisan.length === 0,
    mermiCakisan.map(([, ids]) => ids.join('+')).join(' | ') || `${mermi.size} benzersiz mermi`);

  // İkonlar da ayrışmalı — kartta iki silah aynı resmi göstermemeli
  const ikon = new Map<string, string[]>();
  for (const [id, a] of Object.entries(WEAPON_ART)) {
    (ikon.get(a.icon) ?? ikon.set(a.icon, []).get(a.icon)!).push(id);
  }
  const ikonCakisan = [...ikon.entries()].filter(([, ids]) => ids.length > 1);
  check('hiçbir iki silah aynı ikonu kullanmıyor', ikonCakisan.length === 0,
    ikonCakisan.map(([k, ids]) => `${ids.join('+')} → ${k.split('/').pop()}`).join(' | ') || `${ikon.size} benzersiz ikon`);
}

console.log('\n[6] EVRİM görsel olarak AYRIŞIYOR mu');
{
  // Oyuncu 8 seviye + pasif MAX yatırıp sandık açıyor; ekranda aynı şeyi
  // görmemeli. Her evrim, kaynağından en az bir boyutta farklı olmalı.
  const ciftler: [string, string][] = [
    ['shard', 'reliquary'], ['lash', 'weeping'], ['litany', 'vespers'], ['ward', 'glutton'],
    ['toll', 'requiem'], ['ash', 'pyre'], ['sickle', 'reaper'], ['lightning', 'sainthood'],
  ];
  const ayrismayan: string[] = [];
  for (const [taban, evrim] of ciftler) {
    const a = WEAPON_ART[taban], b = WEAPON_ART[evrim];
    if (!a || !b) { ayrismayan.push(`${evrim}: kayıt yok`); continue; }
    const farkli =
      a.impact.row !== b.impact.row ||
      a.impact.src !== b.impact.src ||
      a.tint.join() !== b.tint.join() ||
      a.icon !== b.icon;
    if (!farkli) ayrismayan.push(`${taban}→${evrim}`);
  }
  check('her evrim kaynağından görsel olarak AYRIŞIYOR', ayrismayan.length === 0,
    ayrismayan.join(', ') || `${ciftler.length} çift`);
}

console.log('\n[7] Makullük');
{
  const kotu: string[] = [];
  for (const [id, a] of Object.entries(WEAPON_ART)) {
    if (a.impact.size < 20 || a.impact.size > 90) kotu.push(`${id}: boyut ${a.impact.size}`);
    if (a.impact.fps < 8 || a.impact.fps > 40) kotu.push(`${id}: fps ${a.impact.fps}`);
    if (a.bullet && (a.bullet.size < 10 || a.bullet.size > 40)) kotu.push(`${id}: mermi ${a.bullet.size}`);
  }
  check('boyut/hız değerleri makul aralıkta', kotu.length === 0, kotu.join(' | ') || 'hepsi normal');
}

console.log(`\n${FAIL.length === 0 ? '✅ SAVAŞ GÖRSELLERİ TUTARLI' : `❌ ${FAIL.length} BAŞARISIZ: ${FAIL.join(', ')}`}\n`);
process.exit(FAIL.length === 0 ? 0 : 1);
