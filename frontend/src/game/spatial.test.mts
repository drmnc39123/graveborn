// SPATIAL HASH MÜHRÜ.
//
// 🔴 NİYE KRİTİK: bu ızgara "hangi düşman vuruldu" sorusunun tek cevabı.
// Bir aday KAÇIRILIRSA düşman sessizce hasar almaz — hata mesajı yok, çökme
// yok, sadece oyuncu "vurdum ama ölmedi" der ve sebebini kimse bulamaz.
// Bu depoda tekrar eden en pahalı sınıf: sessiz yanlış sonuç.
//
// ⚠️ ASIL KONTROL KABA KUVVETLE KARŞILAŞTIRMA. Izgaranın kendi mantığını
// kendi mantığıyla doğrulamak hiçbir şey ölçmez; bağımsız ve yavaş ama
// KESİN bir cevapla kıyaslanıyor.
//
//   cd frontend && npx tsx src/game/spatial.test.mts

import { SpatialHash } from './spatial.js';

const FAIL: string[] = [];
const check = (n: string, ok: boolean, d = '') => {
  console.log(`${ok ? '  ✓' : '  ✗'} ${n}${d ? ` — ${d}` : ''}`);
  if (!ok) FAIL.push(n);
};

/** Deterministik rastgele — mühür her koşuda aynı şeyi ölçmeli */
function rng(seed: number) {
  let h = seed >>> 0;
  return () => { h = (h * 1664525 + 1013904223) >>> 0; return h / 4294967296; };
}

interface Nokta { x: number; y: number; id: number }

console.log('\n═══ SPATIAL HASH ═══');

console.log('\n[1] TEMEL DAVRANIŞ');
{
  const g = new SpatialHash<Nokta>(64);
  const a = { x: 10, y: 10, id: 1 };
  const b = { x: 300, y: 300, id: 2 };
  g.insert(a.x, a.y, a);
  g.insert(b.x, b.y, b);
  const out: Nokta[] = [];
  check('yakındaki bulunuyor', g.query(10, 10, 20, out).some((p) => p.id === 1));
  check('uzaktaki gelmiyor', !g.query(10, 10, 20, out).some((p) => p.id === 2));
  check('geniş yarıçap ikisini de alıyor', g.query(150, 150, 400, out).length === 2, `${out.length}`);

  // ⚠️ `out` YENİDEN KULLANILIYOR (tahsis yok) — eski içerik SİLİNMELİ,
  // yoksa her sorgu bir öncekinin adaylarını da taşır ve yanlış hedef vurulur.
  out.push({ x: 0, y: 0, id: 999 });
  g.query(10, 10, 5, out);
  check('sorgu `out` dizisini temizliyor', !out.some((p) => p.id === 999), `${out.length} öğe`);
}

console.log('\n[2] ⭐ HİÇBİR ADAY KAÇMIYOR — kaba kuvvetle karşılaştırma');
{
  /**
   * 🔴 MÜHRÜN KALBİ. Izgara KUTU tarar, gerçek isabet DAİRE ile ölçülür;
   * kutu daireyi kapsadığı sürece fazladan aday zararsızdır (çağıran zaten
   * kesin mesafeye bakar) ama EKSİK aday doğrudan kayıp hasardır.
   *
   * ⚠️ Hücre boyutundan KÜÇÜK, EŞİT ve BÜYÜK yarıçaplar ayrı ayrı deneniyor:
   * yarıçap hücreden büyükken sorgu birden fazla hücreye yayılmak zorunda ve
   * sınır hesabı burada yanlış olursa kaçak başlar.
   */
  const r = rng(1234);
  for (const cell of [32, 64, 128]) {
    const g = new SpatialHash<Nokta>(cell);
    const hepsi: Nokta[] = [];
    for (let i = 0; i < 800; i++) {
      // ⚠️ NEGATİF KOORDİNAT DA VAR: dünya merkezi 0 kabul edilirse
      // düşmanların yarısı negatif tarafta durur.
      const p = { x: (r() - 0.5) * 4000, y: (r() - 0.5) * 4000, id: i };
      hepsi.push(p);
      g.insert(p.x, p.y, p);
    }
    let kacan = 0, sorgu = 0;
    const out: Nokta[] = [];
    for (const yaricap of [8, cell / 2, cell, cell * 3]) {
      for (let k = 0; k < 200; k++) {
        const qx = (r() - 0.5) * 4000, qy = (r() - 0.5) * 4000;
        g.query(qx, qy, yaricap, out);
        const bulunan = new Set(out.map((p) => p.id));
        // Bağımsız, yavaş ama KESİN cevap
        for (const p of hepsi) {
          const d = Math.hypot(p.x - qx, p.y - qy);
          if (d <= yaricap && !bulunan.has(p.id)) kacan++;
        }
        sorgu++;
      }
    }
    check(`hücre ${cell}: ${sorgu} sorguda kaçan aday yok`, kacan === 0, `${kacan} kaçak`);
  }
}

console.log('\n[3] NEGATİF VE SIFIR KOORDİNATLAR');
{
  /**
   * ⚠️ Anahtar 16 bitlik maskeyle üretiliyor (`cx & 0xffff`). Negatif hücre
   * indeksleri maskeden sonra büyük pozitif sayılara dönüyor — bu KENDİ
   * başına sorun değil ama sınırın iki yakasında (x = -1 ve x = 0) aynı
   * kovaya düşülürse komşu aramaları bozulurdu.
   */
  const g = new SpatialHash<Nokta>(50);
  const noktalar = [
    { x: -10, y: -10, id: 1 }, { x: 10, y: 10, id: 2 },
    { x: -60, y: 40, id: 3 }, { x: 0, y: 0, id: 4 },
  ];
  for (const p of noktalar) g.insert(p.x, p.y, p);
  const out: Nokta[] = [];
  check('sıfırın etrafı bulunuyor', g.query(0, 0, 30, out).length >= 3, `${out.length}`);
  check('negatif taraf ayrı kovada', g.query(-60, 40, 15, out).some((p) => p.id === 3));
  // ⚠️ ÇİFT TARAFLI: negatif ile pozitif AYNI kovaya düşmemeli
  check('uzak negatif, pozitifi çekmiyor', !g.query(-60, 40, 15, out).some((p) => p.id === 2));
}

console.log('\n[4] CLEAR VE YENİDEN KULLANIM');
{
  /**
   * ⚠️ `clear()` kovaları Map'ten SİLMİYOR, dizileri boşaltıyor (GC baskısı
   * kare sıçraması demek). Doğruluk açısından fark yok ama BOŞ kovanın
   * sorguya sızmadığı ölçülmeli — sızsaydı ölmüş düşmanlar hedeflenirdi.
   */
  const g = new SpatialHash<Nokta>(64);
  for (let i = 0; i < 50; i++) g.insert(i * 10, 0, { x: i * 10, y: 0, id: i });
  const out: Nokta[] = [];
  check('temizlemeden önce dolu', g.query(0, 0, 1000, out).length === 50, `${out.length}`);
  g.clear();
  check('temizlemeden sonra boş', g.query(0, 0, 1000, out).length === 0, `${out.length}`);
  check('temizlemeden sonra sayaç 0', g.countNear(0, 0) === 0);
  // Yeniden doldur — aynı kovalar tekrar kullanılıyor
  for (let i = 0; i < 5; i++) g.insert(i * 10, 0, { x: i * 10, y: 0, id: 100 + i });
  check('yeniden doldurma çalışıyor', g.query(0, 0, 1000, out).length === 5, `${out.length}`);
  check('eski öğeler geri gelmiyor', out.every((p) => p.id >= 100), out.map((p) => p.id).join(','));
}

console.log('\n[5] countNear — 3×3 KUTU, KENDİSİ DAHİL');
{
  /**
   * ⚠️ Bu metot YAKLAŞIKTIR ve öyle olmalı: `swarm` davranışı "kalabalık
   * mıyım" diye soruyor, kesin mesafe değil. Sözleşme yazılı olduğu için
   * mühürleniyor — biri "düzeltip" daireye çevirirse davranış sessizce değişir.
   */
  const g = new SpatialHash<Nokta>(100);
  const p = { x: 150, y: 150, id: 0 };
  g.insert(p.x, p.y, p);
  check('kendisi sayılıyor', g.countNear(150, 150) === 1, String(g.countNear(150, 150)));
  g.insert(250, 150, { x: 250, y: 150, id: 1 });   // komşu hücre
  check('komşu hücre sayılıyor', g.countNear(150, 150) === 2, String(g.countNear(150, 150)));
  g.insert(550, 150, { x: 550, y: 150, id: 2 });   // 4 hücre uzak
  check('uzak hücre SAYILMIYOR', g.countNear(150, 150) === 2, String(g.countNear(150, 150)));
  check('boş bölgede 0', g.countNear(5000, 5000) === 0);
}

console.log('\n[6] YOĞUNLUK — 500 düşman senaryosu');
{
  /**
   * ⚠️ Sözleşme yazılı: "sorgu başına ~5-15 aday". Bu sayı büyürse ızgara
   * işini yapmıyor demektir ve naive taramaya dönmüş oluruz — kare bütçesi
   * sessizce yanar. Ölçüm burada, yorumda değil.
   */
  const r = rng(99);
  const g = new SpatialHash<Nokta>(64);
  for (let i = 0; i < 500; i++) {
    const p = { x: r() * 1600, y: r() * 900, id: i };
    g.insert(p.x, p.y, p);
  }
  const out: Nokta[] = [];
  let toplam = 0;
  for (let k = 0; k < 300; k++) {
    g.query(r() * 1600, r() * 900, 40, out);
    toplam += out.length;
  }
  const ort = toplam / 300;
  check('sorgu başına aday makul (< 40)', ort < 40, `ortalama ${ort.toFixed(1)} aday`);
  check('ızgara gerçekten daraltıyor (< 500)', ort < 500 * 0.2, `${ort.toFixed(1)} / 500`);
}

console.log(`\n${FAIL.length === 0 ? '✅ SPATIAL HASH SAĞLAM' : `❌ ${FAIL.length} BAŞARISIZ: ${FAIL.join(', ')}`}\n`);
process.exit(FAIL.length === 0 ? 0 : 1);
