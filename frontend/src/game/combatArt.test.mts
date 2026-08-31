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
import { DEATH_FX } from './sprites.js';
import { HEROES } from './heroes.js';
import { EVOLVED, PASSIVES, WEAPONS,
  weaponCooldownAt, weaponCountAt, weaponDamageAt } from './config.js';

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

  // ⚠️ ÖLÜM EFEKTLERİ DE AYNI KURALA TABİ. `DEATH_FX` düşman ailesine göre
  // ayrı atlas/satır seçiyor ve satır seçmek RENK seçmektir (atlaslar
  // 12×9 ve her satır aynı efektin farklı rengi — ölçüldü). Silahlar için
  // yazılmış bu kural ölüm efektlerini kapsamıyordu; sızıntı buradan olurdu.
  const morOlum = Object.entries(DEATH_FX)
    .filter(([, a]) => a.src.includes('/fx/rpg/') && YASAK_SATIR.has(a.row))
    .map(([k, a]) => `${k}: satır ${a.row}`);
  check('hiçbir ÖLÜM efekti MOR satır kullanmıyor', morOlum.length === 0,
    morOlum.join(', ') || `${Object.keys(DEATH_FX).length} aile temiz`);

  // ⚠️ Aileler birbirinden AYIRT EDİLEBİLİR olmalı — hepsi aynı (atlas,satır)
  // olsaydı özellik "eklenmiş" sayılır ama ekranda hiçbir şey değişmezdi.
  const cift = new Set(Object.values(DEATH_FX).map((a) => `${a.src}|${a.row}`));
  check('ölüm efektleri birbirinden farklı', cift.size === Object.keys(DEATH_FX).length,
    `${cift.size}/${Object.keys(DEATH_FX).length} benzersiz (atlas,satır)`);

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

console.log('\n[8] Seviye önizleme formülleri (level-up kartı bunları gösteriyor)');
{
  // ⚠️ Kart "Lv 3 → 4 · DAMAGE +18%" yazıyor. Bu sayılar motorun kullandığı
  // formülün AYNISINDAN gelmeli — iki yerde yazılsaydı er ya da geç ayrışır
  // ve kart oyuncuya yalan söylerdi. Formül `config.ts`'e saf fonksiyon
  // olarak çıkarıldı; motor da artık onu çağırıyor. `SIM_SEAL` mührü
  // formülün değişmediğini ayrıca kanıtlıyor.
  const shard = WEAPONS.find((w) => w.id === 'shard')!;

  check('hasar seviyeyle ARTIYOR',
    weaponDamageAt(shard, 2) > weaponDamageAt(shard, 1),
    `${weaponDamageAt(shard, 1).toFixed(1)} → ${weaponDamageAt(shard, 2).toFixed(1)}`);
  check('bekleme seviyeyle AZALIYOR',
    weaponCooldownAt(shard, 2) < weaponCooldownAt(shard, 1),
    `${weaponCooldownAt(shard, 1).toFixed(3)} → ${weaponCooldownAt(shard, 2).toFixed(3)}`);
  check('seviye 1 taban değeri veriyor',
    weaponDamageAt(shard, 1) === shard.damage && weaponCooldownAt(shard, 1) === shard.cooldownSec);
  check('seviye 0 seviye 1 gibi davranıyor (kart kırılmasın)',
    weaponDamageAt(shard, 0) === weaponDamageAt(shard, 1));

  const countArtan = [...WEAPONS, ...EVOLVED].filter((w) => w.countLevels?.length);
  const bozuk = countArtan.filter((w) => {
    const esik = w.countLevels![0];
    return weaponCountAt(w, esik) <= weaponCountAt(w, esik - 1);
  }).map((w) => w.id);
  check('countLevels eşiğinde mermi sayısı artıyor', bozuk.length === 0,
    bozuk.join(', ') || `${countArtan.length} silah`);

  // ⚠️ TESTİN KENDİ HATASIYDI: ilk sürüm evrimleri de kapsıyordu ve 8'i
  // birden düşüyordu. Evrimler `maxLevel: 1` — SON FORM oldukları için
  // seviye atlamazlar (VS'in kendi kuralı). Ölçülecek olan taban silahların
  // seviye eğrisi; eşiği gevşetmek yerine kapsam düzeltildi.
  const zayif = WEAPONS.filter(
    (w) => weaponDamageAt(w, w.maxLevel) < weaponDamageAt(w, 1) * 1.5,
  ).map((w) => w.id);
  check('her TABAN silah MAX seviyede en az %50 güçleniyor', zayif.length === 0,
    zayif.join(', ') || `${WEAPONS.length} taban silah`);

  const seviyelenenEvrim = EVOLVED.filter((w) => w.maxLevel > 1).map((w) => w.id);
  check('evrimler son form (seviye atlamıyor)', seviyelenenEvrim.length === 0,
    seviyelenenEvrim.join(', ') || `${EVOLVED.length} evrim`);
}

console.log('\n[9] Kahraman animasyonları — dosyalar GERÇEKTEN var mı');
{
  // ⚠️ Kare sayısı yanlış girilirse SON kare 404 olur ve animasyon sonunda
  // karakter kaybolur — teşhisi çok zor, çünkü ilk kareler çalışıyor.
  // Manifest'ten her animasyonun İLK ve SON karesini doğruluyoruz.
  const eksik: string[] = [];
  for (const h of HEROES) {
    const kontrol = (ad: string, sablon: string, frames: number) => {
      if (!sablon || !frames) { eksik.push(`${h.id}.${ad}: tanımsız`); return; }
      for (const i of [1, frames]) {
        const src = `/art/heroes/${h.dir}/${sablon.replace('{i}', String(i))}`;
        if (!bySrc.has(src)) eksik.push(`${h.id}.${ad}[${i}]: ${src.split('/').pop()}`);
      }
    };
    kontrol('idle', h.idle, h.idleFrames);
    kontrol('run', h.run, h.runFrames);
    kontrol('atk', h.atk, h.atkFrames);
    // ⚠️ İkinci/üçüncü saldırı build güçlendikçe oynanıyor (render
    // `saldiriKademesi`) — yani BAZI oyuncularda hiç görünmüyor ve yanlış
    // kare sayısı sessizce boş kare çizer. Tam da manifest kontrolünün
    // var olma sebebi.
    kontrol('atk2', h.atk2, h.atk2Frames);
    kontrol('atk3', h.atk3, h.atk3Frames);
    kontrol('hurt', h.hurt, h.hurtFrames);
    kontrol('death', h.death, h.deathFrames);
  }
  check('her kahramanın 7 animasyonu da MEVCUT', eksik.length === 0,
    eksik.slice(0, 4).join(' | ') || `${HEROES.length} kahraman × 7 animasyon`);

  // Kare sayısı ölçülenden FAZLA girilirse son kareler 404 olur — bir sonraki
  // kareyi de sorup sınırın doğru olduğunu doğrula
  const fazla: string[] = [];
  for (const h of HEROES) {
    const test = (ad: string, sablon: string, frames: number) => {
      const src = `/art/heroes/${h.dir}/${sablon.replace('{i}', String(frames + 1))}`;
      if (bySrc.has(src)) fazla.push(`${h.id}.${ad}: ${frames + 1}. kare de var`);
    };
    test('atk', h.atk, h.atkFrames);
    test('atk2', h.atk2, h.atk2Frames);
    test('atk3', h.atk3, h.atk3Frames);
    test('death', h.death, h.deathFrames);
  }
  check('kare sayıları eksik bildirilmemiş', fazla.length === 0,
    fazla.join(' | ') || 'tam');
}


console.log('\n[10] PİKSEL BAŞLIK FONTU — sayfa + karakter haritası');
{
  // 🔴 NİYE VAR: oyunun iki font ailesi (`GBText`/`GBTitle`) AYNI TTF'e
  // işaret ediyordu — tipografik hiyerarşi yoktu. Paketin gerçek başlık
  // yüzü ise depoda hiç kullanılmadan duruyordu. Artık kullanılıyor
  // (`lib/pixelFont.ts`) ve bu testin işi onu ayakta tutmak.
  //
  // ⚠️ EN SİNSİ HATA SINIFI: karakter haritasında BİR hücre kayması.
  // Metin yine çizilir, hiç hata vermez, ama harflerin yarısı yanlış
  // çıkar. `METIN_HARITA`da `Ñ` harfi N'den sonra geliyor (paketin sırası,
  // ASCII değil) — atlanırsa sonraki BÜTÜN harfler kayar.
  const kok = path.dirname(fileURLToPath(import.meta.url));
  const fontKok = path.join(kok, '..', '..', 'public', 'art', 'ui', 'kit', 'Fonts');
  const renkler = ['White', 'Gold', 'Red', 'Brown'];
  const eksikSayfa: string[] = [];
  for (const aile of ['Title', 'Text']) {
    for (const r of renkler) {
      const p = path.join(fontKok, `Font${aile}_${r}.png`);
      if (!fs.existsSync(p)) eksikSayfa.push(`Font${aile}_${r}.png`);
    }
  }
  check('8 bitmap font sayfasının hepsi diskte', eksikSayfa.length === 0,
    eksikSayfa.join(', ') || '2 aile × 4 renk');

  // ⚠️ HARİTA KAYNAK DOSYADAN OKUNUYOR, testte KOPYALANMIYOR. Kopya
  // olsaydı ikisi ayrışır ve test yanlış haritayı doğrularak yeşil kalırdı.
  const kaynak = fs.readFileSync(path.join(kok, '..', 'lib', 'pixelFont.ts'), 'utf8');

  const baslikParcalari = kaynak
    .slice(kaynak.indexOf('const BASLIK_HARITA'), kaynak.indexOf('/**\n * METİN SAYFASI'))
    .match(/'((?:[^'\\]|\\.)*)'/g) ?? [];
  const baslik = baslikParcalari
    .map((q) => q.slice(1, -1).replace(/\\'/g, "'").replace(/\\\\/g, '\\'))
    .join('');

  // BAŞLIK sayfası 26×3 = 78 hücre; harita bunu AŞAMAZ
  check('başlık haritası ızgaraya sığıyor (≤78)', baslik.length > 0 && baslik.length <= 78,
    `${baslik.length} karakter`);
  check('başlık haritası A-Z ile başlıyor',
    baslik.slice(0, 26) === 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', baslik.slice(0, 26));
  check('başlık haritasının 2. satırı rakamla başlıyor',
    baslik.slice(26, 36) === '0123456789', baslik.slice(26, 36));

  // ⚠️ YİNELENEN KARAKTER = TRANSKRİPSİYON HATASI. Aynı harf iki hücreye
  // yazıldıysa biri yanlış hücreyi gösteriyor demektir.
  const yinelenen = [...baslik].filter((ch, i) => baslik.indexOf(ch) !== i);
  check('başlık haritasında yinelenen karakter yok', yinelenen.length === 0,
    yinelenen.join('') || 'temiz');

  // Oyunun GERÇEKTEN yazdığı başlıklar kapsanıyor mu
  const ORNEK = ['GRAVEBORN', 'THE HOLLOW WOOD', 'DESCENDING', 'ANSWERING',
    'THE VILLAGE SETTLES UP', 'THE BARROW', '+3,180 GOLD'];
  const kapsanmayan = ORNEK.filter((s) => [...s.toUpperCase()]
    .some((ch) => ch !== ' ' && !baslik.includes(ch)));
  check('oyunun kullandığı başlıklar TAMAMEN kapsanıyor', kapsanmayan.length === 0,
    kapsanmayan.join(' | ') || `${ORNEK.length} örnek`);

  // 🔴 GERÇEK BİR HATA YAKALANDI, mühür ondan doğdu: `pixelFont.ts` yazılırken
  // `padEnd(32, ' ')` içindeki BOŞLUKLAR dosyaya NUL BAYTI (0x00) olarak
  // gitmişti — dört yerde. Kaynak hâlâ geçerli UTF-8, `tsc` sessiz kalıyor
  // ve kod tesadüfen çalışıyordu; ama git dosyayı İKİLİ sanıyordu (diff yok,
  // inceleme yok) ve `ch === ' '` karşılaştırması aslında NUL ile
  // yapılıyordu. Görünmez karakter = görünmez hata.
  const kaynakDosyalari = [
    path.join(kok, '..', 'lib', 'pixelFont.ts'),
    path.join(kok, 'render.ts'),
    path.join(kok, 'sprites.ts'),
    path.join(kok, 'grade.ts'),
    path.join(kok, 'stageArt.ts'),
  ];
  const nulLu = kaynakDosyalari.filter((p) => fs.existsSync(p)
    && fs.readFileSync(p).includes(0));
  check('çizim kaynaklarında NUL baytı yok', nulLu.length === 0,
    nulLu.map((p) => path.basename(p)).join(', ') || `${kaynakDosyalari.length} dosya temiz`);
}

console.log(`\n${FAIL.length === 0 ? '✅ SAVAŞ GÖRSELLERİ TUTARLI' : `❌ ${FAIL.length} BAŞARISIZ: ${FAIL.join(', ')}`}\n`);
process.exit(FAIL.length === 0 ? 0 : 1);
