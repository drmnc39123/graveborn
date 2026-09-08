// DESCENT TABAN ZORLUGU MUHRU.
//
// 🔴 KULLANICI BILDIRIMI: *"Descent moduna girdigimizde 70 civari dusman
// geliyor fakat o kadar zor ki derinlik 1 bile gecilemiyor."*
//
// OLCULDU (`descent.probe.mts`, taban oyuncu, KUSURSUZ kacan yapay oyuncu):
//     b 1: d1 6/6 gecildi     b15: 0/6
//     b 5: 1/6                b20: 0/6
//     b10: 5/6 (ama d1'de kaliyor)  b25: 0/6
//
// Sebep matematik hatasi DEGIL — taban secmek kasitli bir zorluk ekseni ve
// `challengeRating` bunu zaten sayiyor. Eksik olan sey oyuncunun bunu
// GOREBILMESIYDI: ekranda ikisi de sadece "DEPTH 1" yaziyordu.
//
// ⚠️ BU MUHUR DENGE OLCMUYOR. Denge sayilari `campaign.test`/`balance.test`
// isi. Burasi tek sey soruyor: EKRANDAKI UYARI GERCEGI SOYLUYOR MU.
//
//   cd frontend && npx tsx src/game/descentBase.test.mts

import fs from 'node:fs';
import { DESCENT, STAGES, descentStage } from './config.js';
import { KOLAY_TABAN, tabanDurum, tabanPuan, tabanZorluk } from './descentBase.js';

const FAIL: string[] = [];
const check = (n: string, ok: boolean, d = '') => {
  console.log(`  ${ok ? 'OK ' : 'X  '} ${n}${d ? ` - ${d}` : ''}`);
  if (!ok) FAIL.push(n);
};
const oku = (f: string) => { try { return fs.readFileSync(f, 'utf8'); } catch { return ''; } };
const yorumsuz = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

const play = yorumsuz(oku('src/app/play/page.tsx'));

console.log('\n=== DESCENT TABAN ZORLUGU ===');

console.log('\n[1] ** ESDEGER DERINLIK OLCUMLE ORTUSUYOR');
{
  /**
   * ⚠️ SAYILAR TARAYICIDA VE SIMULASYONDA OLCULDU, uydurulmadi. Biri
   * degistirirse burasi kirmizi verir ve ekrandaki metin yalan soylemeden
   * once haber alinir.
   */
  const bekle: Array<[number, number]> = [[1, 1], [5, 7], [10, 12], [15, 17], [20, 21], [25, 24]];
  for (const [id, d] of bekle) {
    if (!STAGES.some((s) => s.id === id)) continue;
    const z = tabanZorluk(id);
    check(`b${id} esdeger d${d}`, z.esdegerDerinlik === d, `d${z.esdegerDerinlik}`);
  }
}

console.log('\n[2] ** OLCU CAN x HASAR (yalniz can YETMIYOR)');
{
  /**
   * 🔴 ILK SURUM YALNIZ `hpMul` KULLANIYORDU VE OLCUMLE CURUDU: b25 b1'in
   * d18'i sayiliyordu, oysa b25'in hasari da 7,56 kat ve b1 d18'de hasar
   * yalniz 2,4 kat. Cana bakmak zorlugu UCTE BIR gosteriyordu.
   */
  const b25 = descentStage(25, 1);
  check('b25 hasar carpani gercekten buyuk', (b25.damageMul ?? 1) > 7, String((b25.damageMul ?? 1).toFixed(2)));
  // Yalniz canla hesaplansaydi cikacak sayi — artik BU OLMAMALI
  const yalnizCan = 1 + Math.log(b25.hpMul / descentStage(KOLAY_TABAN.id, 1).hpMul)
    / Math.log(DESCENT.hpGrowth);
  check('esdeger, yalniz-can hesabindan BUYUK',
    tabanZorluk(25).esdegerDerinlik > Math.round(yalnizCan),
    `${tabanZorluk(25).esdegerDerinlik} > ${Math.round(yalnizCan)}`);

  // ⚠️ MONOTON: daha zor bolum daha buyuk esdeger vermeli
  const dizi = STAGES.map((s) => tabanZorluk(s.id).esdegerDerinlik);
  const kirik = dizi.filter((v, i) => i > 0 && v < dizi[i - 1]).length;
  check('esdeger derinlik geriye GITMIYOR', kirik === 0, `${kirik} kirik adim`);
}

console.log('\n[3] ** DURUM OYUNCUNUN KENDI KAYDINA GORE');
{
  /**
   * ⚠️ OLCUT OYUNCUNUN KAYDI, uydurma bir guc modeli DEGIL. "Bu oyuncu ne
   * kadar hasar veriyor" diye guvenilir bir sayimiz yok; "en derin nereye
   * indi" var ve sunucu onu dogruluyor.
   */
  check('yeni oyuncuda ilk taban ACIK', tabanDurum(1, 0) === 'gecilmis');
  check('yeni oyuncuda b5 uyariyor', tabanDurum(5, 0) === 'zorlu', tabanDurum(5, 0));
  check('yeni oyuncuda b25 EN AGIR uyari', tabanDurum(25, 0) === 'asiri', tabanDurum(25, 0));
  // ⚠️ CIFT TARAFLI: guclenen oyuncuda uyari YUMUSAMALI, yoksa etiket
  // "her zaman kirmizi" olur ve okunmaz hale gelir.
  check('d30 gormus oyuncuda b25 artik asiri DEGIL', tabanDurum(25, 30) !== 'asiri',
    tabanDurum(25, 30));
  check('d30 gormus oyuncuda b5 gecilmis', tabanDurum(5, 30) === 'gecilmis');
  // ⚠️ Durum HIC GERI GITMEMELI: derinlik arttikca uyari sertlesemez
  const sira = { gecilmis: 0, zorlu: 1, asiri: 2 } as const;
  let bozuk = 0;
  for (const s of STAGES) {
    for (let d = 1; d < 40; d++) {
      if (sira[tabanDurum(s.id, d)] > sira[tabanDurum(s.id, d - 1)]) bozuk++;
    }
  }
  check('derinlik arttikca uyari SERTLESMIYOR', bozuk === 0, `${bozuk} ihlal`);
}

console.log('\n[4] ** UYARI EKRANDA GERCEKTEN CIZILIYOR');
{
  /**
   * 🔴 Bu depodaki en pahali hata sinifi: kod calisir, veri gelir, son
   * adimda olur. Fonksiyon dogru olsa bile sayfa cagirmiyorsa hicbir sey
   * duzelmez.
   */
  check('sayfa taban zorlugunu okuyor', /tabanZorluk\(s\.id\)/.test(play));
  check('sayfa durumu OYUNCUNUN kaydiyla soruyor',
    /tabanDurum\(s\.id, genelEnDerin\)/.test(play));
  check('genel en derin TUM bolumlerden turuyor',
    /genelEnDerin = STAGES\.reduce\(\(m, st\) => Math\.max\(m, paidDepth\(p, st\.id\)\), 0\)/.test(play));
  // ⚠️ Bu bolumdeki derinlik DEGIL: guc bolume gore degismiyor
  check('bu bolumdeki derinlikle karistirilmamis', !/tabanDurum\(s\.id, bestDepth\)/.test(play));

  const ham = oku('src/app/play/page.tsx');
  for (const metin of ['WITHIN YOUR REACH', 'A STEEP START', 'FAR ABOVE YOUR BEST']) {
    check(`"${metin}" metni var`, ham.includes(metin));
  }
  // ⚠️ RISKIN KARSILIGI DA YAZILI: yalniz riski gostermek karari eksik
  // bilgiyle verdirmek olurdu.
  check('zor tabanin odulu de soyleniyor', /pays more per depth and counts for more/.test(ham));
  check('kiyas bolumu adiyla aniliyor', /KOLAY_TABAN\.name/.test(play));
  check('uydurma desen bulunmuyor (kontrol grubu)', !/tabanZZZ/.test(play));
}

console.log('\n[5] DENGEYE DOKUNULMADI');
{
  /**
   * ⚠️ Bu is bir GORUNURLUK duzeltmesiydi. Bir gun biri bu dosyadan denge
   * ayarlamaya kalkarsa, once burasi hatirlatsin.
   */
  const kaynak = yorumsuz(oku('src/game/descentBase.ts'));
  check('dosya hicbir sabit YAZMIYOR', !/hpGrowth\s*=|enemyBase\s*=|damageGrowth\s*=/.test(kaynak));
  check('puan config\'ten okunuyor', /challengeRating\(stageId, 1\)/.test(kaynak));
  check('puan gercekten hesaplaniyor (kontrol grubu)', tabanPuan(25) > tabanPuan(1));
}

console.log(`\n${FAIL.length === 0 ? 'TABAN ZORLUGU SAGLAM' : `${FAIL.length} BASARISIZ: ${FAIL.join(', ')}`}\n`);
process.exit(FAIL.length === 0 ? 0 : 1);
