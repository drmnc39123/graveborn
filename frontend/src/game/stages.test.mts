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
import path from 'node:path';
import { ENEMIES, STAGES } from './config.js';
import { ENEMY_ART, aynalaMi } from './sprites.js';

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
