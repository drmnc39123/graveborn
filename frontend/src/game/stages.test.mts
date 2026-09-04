// 25 BÖLÜMÜN VARLIK DENETİMİ — düşman · sprite · boss · dekor.
//
//   npx tsx src/game/stages.test.mts
//
// 🔴 NİYE VAR: bu katmandaki her hata SESSİZ. Eksik bir sprite dosyası
// düşmanı yedek daireye düşürüyor, yanlış bir kare sayısı boş kare
// çiziyor, yanlış bir `art` anahtarı düşmanı görünmez yapıyor — hiçbiri
// hata vermiyor, hiçbiri konsola yazmıyor. Oyuncu "bu bölümde bir
// tuhaflık var" diyor, sebebi hiçbir yerde görünmüyor.
//
// Ölçülen gerçek şeyler (tahmin YOK):
//   · her bölümün kadrosundaki her düşman ENEMIES'te tanımlı mı
//   · her düşmanın `art`ı ENEMY_ART'ta var mı
//   · her animasyonun PNG'si DİSKTE var mı
//   · şerit animasyonlarında kare sayısı görüntü genişliğini TAM bölüyor mu
//     (bölmüyorsa kareler kayar ve düşman titrer)
//   · ızgara animasyonlarında satır/kare görüntünün İÇİNDE mi
//   · dosya adındaki `_stripN` ile bildirilen kare sayısı uyuşuyor mu
//
// ⚠️ Bu mühür GÖRÜNÜŞÜ yargılamıyor — bir sprite'ın yanlış YÖNE bakması
// buradan görünmez. O ayrı bir ölçüm ve `sprites.ts` `solaBakar`
// başlığında yazılı (fareler bölüm 7'de ters koşuyordu).

import fs from 'node:fs';
import zlib from 'node:zlib';
import path from 'node:path';
import { ENEMIES, STAGES } from './config.js';
import { ENEMY_ART, aynalaMi } from './sprites.js';
import { STAGE_ART } from './stageArt.js';
import { PASSIVE_ART, WEAPON_ART } from './combatArt.js';

const FAIL: string[] = [];
const check = (n: string, ok: boolean, d = '') => {
  if (!ok) { console.log(`  ✗ ${n}${d ? ` — ${d}` : ''}`); FAIL.push(n); }
};
const gecti = (n: string, d = '') => console.log(`  ✓ ${n}${d ? ` — ${d}` : ''}`);

const KOK = 'public';
const yol = (src: string) => path.join(KOK, src.replace(/^\//, ''));

/** PNG başlığından genişlik/yükseklik — tam çözmeye gerek yok */
function pngBoyut(dosya: string): { w: number; h: number } | null {
  try {
    const fd = fs.openSync(dosya, 'r');
    const b = Buffer.alloc(24);
    fs.readSync(fd, b, 0, 24, 0);
    fs.closeSync(fd);
    if (b.toString('ascii', 12, 16) !== 'IHDR') return null;
    return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) };
  } catch { return null; }
}

/** PNG'yi elle çöz — bağımlılık yok (zlib + PNG filtre tipleri 0-4) */
function pngCoz(yol2: string): { w: number; h: number; d: Buffer } | null {
  const b = fs.readFileSync(yol2);
  let p = 8, w = 0, h = 0, bit = 0, renk = 0;
  const parcalar: Buffer[] = [];
  while (p < b.length) {
    const len = b.readUInt32BE(p); const tip = b.toString('ascii', p + 4, p + 8);
    const veri = b.subarray(p + 8, p + 8 + len);
    if (tip === 'IHDR') { w = veri.readUInt32BE(0); h = veri.readUInt32BE(4); bit = veri[8]; renk = veri[9]; }
    else if (tip === 'IDAT') parcalar.push(veri);
    else if (tip === 'IEND') break;
    p += 12 + len;
  }
  // ⚠️ Yalnız 8-bit RGBA çözülüyor; başka biçim gelirse ÖLÇMEYİ ATLA,
  // uydurma bir sonuç döndürme.
  if (bit !== 8 || renk !== 6) return null;
  const ham = zlib.inflateSync(Buffer.concat(parcalar));
  const kanal = 4, satir = w * kanal;
  const out = Buffer.alloc(w * h * kanal);
  let o = 0;
  for (let y = 0; y < h; y++) {
    const f = ham[o++]; const sIn = ham.subarray(o, o + satir); o += satir;
    const hedef = out.subarray(y * satir, (y + 1) * satir);
    const onceki = y > 0 ? out.subarray((y - 1) * satir, y * satir) : Buffer.alloc(satir);
    for (let x = 0; x < satir; x++) {
      const a2 = x >= kanal ? hedef[x - kanal] : 0; const bb = onceki[x];
      const c = x >= kanal ? onceki[x - kanal] : 0; let v = sIn[x];
      if (f === 1) v += a2; else if (f === 2) v += bb; else if (f === 3) v += (a2 + bb) >> 1;
      else if (f === 4) {
        const pp = a2 + bb - c, pa = Math.abs(pp - a2), pb = Math.abs(pp - bb), pc = Math.abs(pp - c);
        v += (pa <= pb && pa <= pc) ? a2 : (pb <= pc ? bb : c);
      }
      hedef[x] = v & 255;
    }
  }
  return { w, h, d: out };
}

/**
 * Tüm karelerin BİRLEŞİK alfa sınır kutusu. PNG elle çözülüyor (bağımlılık
 * yok). ⚠️ Tek kare yanıltır: yürüyüşte bacak uzar, kol kalkar.
 */
function alfaKutusu(dosya: string, anim: { kind?: string; frames: number; frameW?: number; frameH?: number; row?: number }) {
  let im: { w: number; h: number; d: Buffer } | null = null;
  try { im = pngCoz(dosya); } catch { return null; }
  if (!im) return null;
  const fw = anim.kind === 'grid' ? (anim.frameW ?? im.w) : Math.floor(im.w / anim.frames);
  const fh = anim.kind === 'grid' ? (anim.frameH ?? im.h) : im.h;
  const oy = anim.kind === 'grid' ? (anim.row ?? 0) * fh : 0;
  let y0 = Number.MAX_SAFE_INTEGER, y1 = -1;
  for (let f = 0; f < anim.frames; f++) {
    const sx = f * fw;
    if (sx + fw > im.w || oy + fh > im.h) break;
    for (let y = 0; y < fh; y++) for (let x = 0; x < fw; x++) {
      if (im.d[((oy + y) * im.w + (sx + x)) * 4 + 3] > 24) { if (y < y0) y0 = y; if (y > y1) y1 = y; }
    }
  }
  return y1 < 0 ? null : { y0, y1, fh };
}

console.log(`\n═══ ${STAGES.length} BÖLÜM · VARLIK DENETİMİ ═══`);

console.log('\n[1] KADROLAR');
{
  const enemyIds = new Set(ENEMIES.map((e) => e.id));
  let toplamKadro = 0;
  for (const st of STAGES) {
    const kadro = st.enemies ?? [];
    check(`bölüm ${st.id} kadrosu BOŞ değil`, kadro.length > 0, st.name);
    for (const id of kadro) {
      check(`bölüm ${st.id} · '${id}' ENEMIES'te tanımlı`, enemyIds.has(id), st.name);
      toplamKadro++;
    }
  }
  gecti(`${STAGES.length} bölüm · ${toplamKadro} kadro girdisi tarandı`);

  // ⚠️ TERS YÖN DE ÖLÇÜLÜYOR: hiçbir bölümde kullanılmayan bir düşman
  // ZARARSIZ değil — dengelenip test edilip sonra unutulmuş demektir.
  // Başarısız SAYILMIYOR (bilerek yedekte tutulan tipler olabilir) ama
  // listeleniyor.
  const kullanilan = new Set(STAGES.flatMap((s) => s.enemies ?? []));
  const kullanilmayan = ENEMIES.filter((e) => !kullanilan.has(e.id)).map((e) => e.id);
  if (kullanilmayan.length) console.log(`  · hiçbir bölümde geçmeyen düşman: ${kullanilmayan.join(' ')}`);
}

console.log('\n[2] SPRITE ANAHTARLARI');
{
  for (const e of ENEMIES) {
    check(`'${e.id}' → ENEMY_ART['${e.art}'] var`, !!ENEMY_ART[e.art], e.art);
  }
  // Boss'lar da aynı tablodan çiziliyor
  const bossArt = new Set(STAGES.map((s) => s.boss?.art).filter(Boolean) as string[]);
  for (const a of bossArt) check(`boss sprite'ı '${a}' tanımlı`, !!ENEMY_ART[a]);
  gecti(`${ENEMIES.length} düşman + ${bossArt.size} boss sprite anahtarı`);
}

console.log('\n[3] DOSYALAR DİSKTE VAR MI');
{
  let dosya = 0;
  const eksik: string[] = [];
  for (const [ad, art] of Object.entries(ENEMY_ART)) {
    for (const [animAd, anim] of Object.entries(art.anims)) {
      const src = (anim as { src: string }).src;
      // `{i}` şablonlu diziler kahramanlarda var; düşmanlarda tek dosya
      const p = yol(src.replace('{i}', '1'));
      dosya++;
      if (!fs.existsSync(p)) eksik.push(`${ad}.${animAd} → ${src}`);
    }
  }
  check('eksik sprite dosyası YOK', eksik.length === 0, eksik.join(' · '));
  gecti(`${dosya} sprite dosyası kontrol edildi`);
}

console.log('\n[4] KARE SAYILARI GÖRÜNTÜYLE UYUŞUYOR MU');
{
  /**
   * ⚠️ EN SİNSİ HATA BURADA. Şerit animasyonunda kare genişliği
   * `img.width / frames` ile hesaplanıyor. Bölme tam değilse her kare bir
   * miktar kayar ve düşman yürürken titrer — ama hiçbir hata çıkmaz.
   * Dosya adındaki `_stripN` de ayrıca kontrol ediliyor: ad ile bildirilen
   * sayı ayrışırsa biri yanlıştır.
   */
  const sorun: string[] = [];
  for (const [ad, art] of Object.entries(ENEMY_ART)) {
    for (const [animAd, anim] of Object.entries(art.anims)) {
      const a = anim as { kind?: string; src: string; frames: number; frameW?: number; frameH?: number; row?: number };
      const p = yol(a.src.replace('{i}', '1'));
      const boyut = pngBoyut(p);
      if (!boyut) continue;                       // [3] zaten eksikliği yakalıyor

      if (a.kind === 'sheet') {
        if (boyut.w % a.frames !== 0) {
          sorun.push(`${ad}.${animAd}: ${boyut.w}px / ${a.frames} kare = ${(boyut.w / a.frames).toFixed(2)} (tam bölmüyor)`);
        }
        const adta = a.src.match(/_strip(\d+)\.png$/);
        if (adta && Number(adta[1]) !== a.frames) {
          sorun.push(`${ad}.${animAd}: dosya adı ${adta[1]} kare diyor, kod ${a.frames}`);
        }
      } else if (a.kind === 'grid') {
        const gerekliW = (a.frameW ?? 0) * a.frames;
        const gerekliH = ((a.row ?? 0) + 1) * (a.frameH ?? 0);
        if (gerekliW > boyut.w) sorun.push(`${ad}.${animAd}: ${a.frames}×${a.frameW}px = ${gerekliW} > görüntü ${boyut.w}`);
        if (gerekliH > boyut.h) sorun.push(`${ad}.${animAd}: satır ${a.row} → ${gerekliH}px > görüntü ${boyut.h}`);
      }
    }
  }
  check('kare sayıları görüntüyle uyuşuyor', sorun.length === 0, sorun.join(' · '));
}

console.log('\n[4b] SPRITE YÖNÜ');
{
  /**
   * 🔴 OYUNCU BİLDİRDİ, ÖLÇÜM DOĞRULADI: bölüm 7'de fareler ters
   * koşuyordu. Sebep `drawActor`ın "her şerit SAĞA bakar" varsayımıydı;
   * vermin paketi SOLA bakıyor (şerit PNG olarak açılıp bakıldı: kafa
   * solda, kuyruk sağda).
   *
   * ⚠️ MÜHÜR YÖNÜ ÖLÇMÜYOR, KARARI ölçüyor. Bir şeridin hangi yöne
   * baktığı pikselden okunacak bir şey değil — o insan gözüyle bir kez
   * belirlenip `solaBakar` ile yazılıyor. Buradaki kontrol, yazılan
   * bayrağın DOĞRU KULLANILDIĞINI garanti ediyor.
   */
  const saga = ENEMY_ART.skel_basic;      // sağa bakan referans
  const sola = ENEMY_ART.rat_small;       // sola bakan (ölçüldü)
  check('sağa bakan sprite: sağa giderken aynalanmıyor', !aynalaMi(saga, true));
  check('sağa bakan sprite: sola giderken aynalanıyor', aynalaMi(saga, false));
  // ⚠️ ÇİFT TARAFLI: sola bakanda kural TERSİNE dönmeli.
  check('SOLA bakan sprite: sağa giderken AYNALANIYOR', aynalaMi(sola, true));
  check('SOLA bakan sprite: sola giderken aynalanmıyor', !aynalaMi(sola, false));
  check('fare gerçekten sola-bakan işaretli', sola.solaBakar === true);
  check('iskelet sola-bakan İŞARETLİ DEĞİL', !saga.solaBakar);

  // Fareyi kullanan bölümler — düzeltmenin kapsamı yazılı kalsın
  const fareli = STAGES.filter((st) => (st.enemies ?? []).some((e) => /rat/.test(e))).map((s) => s.id);
  check('fare en az bir bölümde kullanılıyor', fareli.length > 0, fareli.join(','));
  gecti('fareli bölümler', fareli.join(' · '));
}

console.log('\n[4c] AYAK HİZASI (anchorY) GERÇEK PİKSELLE UYUŞUYOR MU');
{
  /**
   * ⭐ `anchorY` = içeriğin ALT kenarının kare yüksekliğine oranı. Motor
   * düşmanı bununla zemine oturtuyor. Yanlışsa düşman havada yürür ya da
   * yere gömülür — ve bu hiçbir hata üretmez, sadece "bir tuhaflık var"
   * hissi verir.
   *
   * ÖLÇÜM: PNG elle çözülüp TÜM yürüyüş karelerinin birleşik alfa sınır
   * kutusu alınıyor. Tek kare yanıltır (yürürken bacak uzar).
   *
   * ⚠️ `contentRatio` BİLEREK ÖLÇÜLMÜYOR. Ölçtüm: koddaki değerler
   * gerçeğin %3-8 ALTINDA, ama bu bir hata değil TANIM FARKI — koddaki
   * sayılar tek karenin (idle) kutusundan, benimki tüm animasyonun
   * zarfından geliyor. Sonuç düşmanların nominalden ~%5 büyük çizilmesi;
   * tekdüze, kasıtlı görünüyor ve "düzeltmek" bütün sürüyü küçültürdü.
   * Çalışan bir sayıyı, ölçüm tanımım farklı diye değiştirmem.
   */
  const sapan: string[] = [];
  for (const [ad, art] of Object.entries(ENEMY_ART)) {
    const anim = ((art.anims as Record<string, unknown>).walk
      ?? Object.values(art.anims)[0]) as { kind?: string; src: string; frames: number; frameW?: number; frameH?: number; row?: number };
    const p2 = yol(anim.src.replace('{i}', '1'));
    const kutu = alfaKutusu(p2, anim);
    if (!kutu) continue;
    const olculen = (kutu.y1 + 1) / kutu.fh;
    if (Math.abs(olculen - art.anchorY) > 0.04) {
      sapan.push(`${ad}: kod ${art.anchorY.toFixed(3)} · ölçülen ${olculen.toFixed(3)}`);
    }
  }
  check('ayak hizası pikselle uyuşuyor', sapan.length === 0, sapan.join(' · '));
  gecti(`${Object.keys(ENEMY_ART).length} sprite'ın alfa sınır kutusu ölçüldü`);
}

console.log('\n[4d] DAVRANIŞLAR MOTORDA KARŞILIK BULUYOR MU');
{
  /**
   * ⚠️ TypeScript yazım hatasını zaten yakalıyor (`behavior?: Behavior`
   * bir birleşim tipi). Yakalayamadığı şey: tipte TANIMLI ama motorda
   * HİÇ İŞLENMEYEN bir davranış. O derlenir, atanır ve sessizce
   * varsayılan 'chase'e düşer — düşman tasarlandığı gibi davranmaz ve
   * kimse fark etmez.
   */
  const motor = fs.readFileSync('src/game/engine.ts', 'utf8');
  const kullanilan = new Set(ENEMIES.map((e) => e.behavior).filter(Boolean) as string[]);
  for (const b of kullanilan) {
    check(`'${b}' davranışı motorda işleniyor`, motor.includes(`'${b}'`));
  }
  gecti(`${kullanilan.size} davranış motorda karşılık buluyor`, [...kullanilan].sort().join(' '));
}

console.log('\n[4e] BÖLÜM DEKORU VE SAVAŞ EFEKTLERİ DİSKTE Mİ');
{
  /**
   * ⭐ SPRITE'LARDAN SONRAKİ İKİNCİ VARLIK KATMANI: her bölümün zemini,
   * dekoru (ağaç, kafatası, mum, meşale…) ve her silahın efekt atlası.
   *
   * ⚠️ Eksik bir dekor dosyası hata ÜRETMİYOR: tarayıcı görüntüyü
   * yükleyemez, `drawImage` sessizce hiçbir şey çizmez ve bölüm çıplak
   * görünür. Eksik bir silah atlası daha kötü — silah ÇALIŞIR, hasar
   * verir, ama görünmez; oyuncu "vurmuyor" sanır.
   *
   * ⚠️ Her iki tablo da id'lerle DEĞİL yol dizeleriyle çalışıyor, yani
   * TypeScript hiçbirini kontrol etmiyor. Tek koruma bu.
   */
  const yollar = new Set<string>();
  for (const sa of Object.values(STAGE_ART)) {
    for (const d of sa.decor ?? []) yollar.add(d.src);
  }
  const dekorSayisi = yollar.size;
  /**
   * ⚠️ İLK SÜRÜMÜM HİÇBİR ŞEY ÖLÇMÜYORDU. `WEAPON_ART` girdilerinde düz
   * bir `src` alanı arıyordum; oysa yollar `icon` · `bullet.src` ·
   * `impact.src` altında duruyor. Sonuç "0 efekt atlası kontrol edildi"
   * satırıydı — yeşil görünen, hiçbir şey ölçmeyen bir kontrol. Ölçmeyen
   * bir mühür, olmayan mühürden KÖTÜDÜR: güven verir, korumaz.
   */
  let silahYolu = 0;
  for (const w of Object.values(WEAPON_ART)) {
    for (const src of [w.icon, w.bullet?.src, w.impact?.src]) {
      if (src) { yollar.add(src); silahYolu++; }
    }
  }
  for (const p2 of Object.values(PASSIVE_ART)) yollar.add(p2.icon);

  const eksik = [...yollar].filter((src) => !fs.existsSync(yol(src)));
  check('eksik dekor/ikon/efekt dosyası YOK', eksik.length === 0, eksik.join(' · '));
  // ⚠️ SAYININ KENDİSİ DE KONTROL EDİLİYOR: sıfıra düşerse tablo şekli
  // değişmiş demektir ve kontrol yine sessizce hiçbir şey ölçmez.
  check('silah görselleri gerçekten tarandı', silahYolu > 20, `${silahYolu} yol`);
  gecti(`${dekorSayisi} dekor + ${yollar.size - dekorSayisi} silah/pasif görseli kontrol edildi`);

  // ⚠️ Her bölümün bir görsel tanımı OLMALI: eksikse bölüm varsayılana
  // düşer ve 25 bölümün ikisi birbirinin aynı görünür.
  const artsiz = STAGES.filter((st) => !STAGE_ART[st.id]).map((st) => st.id);
  check('görsel tanımı olmayan bölüm YOK', artsiz.length === 0, artsiz.join(','));
}

console.log('\n[4f] ZORLUK EĞRİSİ SÜREKLİ Mİ');
{
  /**
   * ⭐ YAZIM HATASI TUZAĞI. `hpMul: 6.58` yerine `65.8` yazmak tek bir
   * karakterlik hata ve TypeScript bunu göremez: sayı geçerli, bölüm
   * derlenir, oyuncu o bölümde duvara toslar ve sebebi hiçbir yerde
   * görünmez. Ölçülen 25 bölümde en büyük adım ×1,42 — yani ×1,6 tavanı
   * gerçek eğriye bol bol yer bırakıyor ama bir basamak kaymasını
   * (×10) anında yakalar.
   *
   * ⚠️ `maxAlive` ve `spawnRate` BU KONTROLE GİRMİYOR ve bu bilinçli:
   * ikisi de bölüm 11'de KASITLI olarak düşüyor (kampanyanın ikinci
   * yarısı yeni bir merdivenle başlıyor, `config.ts`te yazılı). Onları
   * monoton saymak, doğru bir tasarım kararını hata gibi gösterirdi.
   */
  const ADIM_TAVANI = 1.6;
  const sirali = [...STAGES].sort((a2, b2) => a2.id - b2.id);
  for (let i = 1; i < sirali.length; i++) {
    const o = sirali[i - 1], y = sirali[i];
    check(`bölüm ${y.id} can çarpanı gerilemiyor`, y.hpMul >= o.hpMul, `${o.hpMul} → ${y.hpMul}`);
    check(`bölüm ${y.id} hız çarpanı gerilemiyor`, y.speedMul >= o.speedMul, `${o.speedMul} → ${y.speedMul}`);
    check(`bölüm ${y.id} düşman sayısı gerilemiyor`, y.enemyCount >= o.enemyCount, `${o.enemyCount} → ${y.enemyCount}`);
    check(`bölüm ${y.id} can çarpanında UÇURUM yok`, y.hpMul <= o.hpMul * ADIM_TAVANI,
      `${o.hpMul} → ${y.hpMul} (×${(y.hpMul / o.hpMul).toFixed(2)})`);
  }
  const enBuyuk = sirali.slice(1).reduce((m, y, i) => Math.max(m, y.hpMul / sirali[i].hpMul), 0);
  gecti('zorluk eğrisi sürekli', `en büyük can adımı ×${enBuyuk.toFixed(2)} (tavan ×${ADIM_TAVANI})`);
}

console.log('\n[5] BÖLÜM SAYILARI MAKUL MU');
{
  // ⚠️ Bunlar denge değil BÜTÜNLÜK kontrolleri: sıfır düşmanlı ya da
  // sıfır doğuş hızlı bir bölüm hiç bitmez ve oyuncu sonsuza kadar bekler.
  for (const st of STAGES) {
    check(`bölüm ${st.id} düşman sayısı > 0`, st.enemyCount > 0, String(st.enemyCount));
    check(`bölüm ${st.id} doğuş hızı > 0`, st.spawnRate > 0, String(st.spawnRate));
    check(`bölüm ${st.id} aynı anda canlı sınırı > 0`, st.maxAlive > 0, String(st.maxAlive));
  }
  const idler = STAGES.map((s) => s.id);
  check('bölüm id\'leri benzersiz', new Set(idler).size === idler.length);
  check('bölüm id\'leri 1..N sıralı', idler.every((v, i) => v === i + 1), idler.join(','));
  gecti(`${STAGES.length} bölüm sayısal olarak sağlam`);
}

console.log(`\n${FAIL.length === 0 ? '✅ BÖLÜM VARLIKLARI SAĞLAM' : `❌ ${FAIL.length} BAŞARISIZ`}\n`);
process.exit(FAIL.length === 0 ? 0 : 1);
