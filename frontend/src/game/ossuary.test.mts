// THE OSSUARY MÜHRÜ — ekonominin dipsiz kovası.
//
// 🔴 NİYE VAR: Ossuary'nin TEK işi gold'u sonsuza kadar emmek. Bir tavan
// (maxLevel), bir taşma (Infinity maliyet) ya da donan bir rütbe adı bu işi
// sessizce bitirir: sistem çalışıyor görünür, sadece artık kimse harcamaz ve
// gold birikip değersizleşir. Hiçbiri hata mesajı üretmez.
//
//   cd frontend && npx tsx src/game/ossuary.test.mts

import fs from 'node:fs';
import {
  OSSUARY, ossuaryCost, ossuarySpent, ossuaryTier, ossuaryTierProgress,
} from './ossuary.js';

const FAIL: string[] = [];
const check = (n: string, ok: boolean, d = '') => {
  console.log(`${ok ? '  ✓' : '  ✗'} ${n}${d ? ` — ${d}` : ''}`);
  if (!ok) FAIL.push(n);
};

/** hours.test.mts'te ölçülen tekrar koşusu geliri */
const GOLD_SAAT = 4170;

console.log('\n═══ THE OSSUARY ═══');

console.log('\n[1] MALİYET EĞRİSİ');
{
  check('ilk seviye baseCost', ossuaryCost(0) === OSSUARY.baseCost, `${ossuaryCost(0)}`);
  let artan = true;
  for (let lv = 0; lv < 300; lv++) if (ossuaryCost(lv + 1) <= ossuaryCost(lv)) artan = false;
  check('maliyet her seviyede artıyor', artan);
  check('maliyet tam sayı', [0, 7, 33, 91].every((lv) => Number.isInteger(ossuaryCost(lv))));

  /**
   * ⚠️ `growth` ÖLÇÜLEREK SEÇİLDİ (bkz. ossuary.ts): ≥1,25 olursa bir sonraki
   * seviye ulaşılamaz görünür ve sink ölür; ≤1,08 olursa oyuncu yüz seviye
   * alıp sıkılır ve sink yine ölür. Değeri kilitliyorum — değiştirilirse bu
   * satır düşer ve gerekçe tekrar okunur.
   */
  check('growth ölçülen aralıkta (1,08–1,25)',
    OSSUARY.growth > 1.08 && OSSUARY.growth < 1.25, String(OSSUARY.growth));

  // Dosyadaki yazılı kilometre taşları gerçekten tutuyor mu
  const yakin = (a: number, b: number) => Math.abs(a - b) / b < 0.06;
  check('L10 ≈ 1.200', yakin(ossuaryCost(9), 1200), `${ossuaryCost(9)}`);
  check('L25 ≈ 7.600', yakin(ossuaryCost(24), 7600), `${ossuaryCost(24)}`);
  check('L50 ≈ 158.800', yakin(ossuaryCost(49), 158800), `${ossuaryCost(49)}`);
}

console.log('\n[2] ⭐ TAVAN YOK — dosyanın kendi kuralı');
{
  /**
   * ⚠️ ossuary.ts'in başlığı açıkça yazıyor: "Bu dosyaya maxLevel EKLEMEYİN."
   * Ekonominin BİR yerinde dipsiz kova olmak zorunda; Forge o rolden emekli
   * oldu, Reliquary sonlu (41 kozmetik). Kalan tek yer burası.
   */
  /**
   * ⚠️ ALET HATASI, ÖLÇÜLDÜ: ilk tarama YORUMLARI da okuyordu ve dosyanın
   * kendi "Bu dosyaya maxLevel EKLEMEYİN" YASAK CÜMLESİNE takılıp kırmızı
   * verdi. Yasağı yasak sanmak — kuralı ihlal sanmak. Yorumlar soyuluyor.
   */
  const ham = fs.readFileSync('src/game/ossuary.ts', 'utf8');
  const kaynak = ham.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
  check('kodda maxLevel/cap yok', !/maxLevel|MAX_LEVEL|maxLvl/.test(kaynak));
  // ⚠️ ÇİFT TARAFLI: soyma çok agresif olup KODU da silmiş olabilirdi.
  check('yorum soyma kodu silmedi', kaynak.includes('ossuaryCost') && kaynak.length > 400, `${kaynak.length} bayt`);
  check('L500 hâlâ sonlu bir sayı',
    Number.isFinite(ossuaryCost(500)) && ossuaryCost(500) > 0, ossuaryCost(500).toExponential(2));
  // ⚠️ Taşma da bir tavandır: Infinity dönen maliyet "satın alınamaz" demek.
  check('L2000 taşmıyor (Infinity değil)', Number.isFinite(ossuaryCost(2000)));

  /**
   * ⚠️ GÜÇ VERMEZ — cosmetics.ts ile aynı kural. Görünürlük satan bir sistem
   * güç satmaya başlarsa, "para öde güçlen" olur.
   */
  check('güç istatistiği geçmiyor',
    !/\b(damage|dmg|armor|maxHp|attackSpeed|power)\b/i.test(kaynak));
}

console.log('\n[3] TOPLAM HARCAMA');
{
  check('L0 harcaması 0', ossuarySpent(0) === 0);
  check('L1 harcaması = ilk maliyet', ossuarySpent(1) === ossuaryCost(0));
  let toplam = 0, tutuyor = true;
  for (let lv = 0; lv < 120; lv++) {
    toplam += ossuaryCost(lv);
    if (ossuarySpent(lv + 1) !== toplam) tutuyor = false;
  }
  check('harcama = maliyetlerin toplamı', tutuyor);
  check('harcama monoton', ossuarySpent(30) > ossuarySpent(29));
}

console.log('\n[4] ⭐ RÜTBE ADI DONMUYOR — sistemin sattığı TEK şey bu');
{
  /**
   * 🔴 ÖLÇÜLMÜŞ HATA (2026-09-07 düzeltildi): sayaç `i / TIERS.length` ile
   * hesaplandığı için liste bittikten sonra ad 80 seviyede bir değişiyordu —
   * L80 ile L150 aynı rütbeyi gösteriyordu. Ossuary'nin verdiği tek şey
   * görünürlük; donan bir rütbe sistemi sessizce iptal eder.
   *
   * ⚠️ Dürüst not: bu seviyeler pratikte ulaşılamaz (L80 ≈ 542 gün kesintisiz
   * farm). Düzeltme oyuncuya değen bir hatayı değil, sistemin kendi vaadini
   * onarıyor.
   */
  let bos = 0, donan = 0;
  let onceki = ossuaryTier(0);
  for (let lv = OSSUARY.tierEvery; lv <= 400; lv += OSSUARY.tierEvery) {
    const ad = ossuaryTier(lv);
    if (!ad || !ad.trim()) bos++;
    if (ad === onceki) donan++;
    onceki = ad;
  }
  check('hiçbir rütbe boş değil', bos === 0, `${bos} boş`);
  check('her kademede rütbe DEĞİŞİYOR (L400\'e kadar)', donan === 0, `${donan} donma`);

  // ⚠️ Kademe İÇİNDE ad sabit kalmalı — her seviyede değişen bir rütbe,
  // kademenin kendisini anlamsız kılardı.
  let sabit = true;
  for (let k = 0; k < 5; k++) {
    const ilk = ossuaryTier(k * OSSUARY.tierEvery);
    for (let j = 1; j < OSSUARY.tierEvery; j++) {
      if (ossuaryTier(k * OSSUARY.tierEvery + j) !== ilk) sabit = false;
    }
  }
  check('kademe içinde rütbe sabit', sabit);

  // ⚠️ GERİYE DÜŞMEZ: listeye baştan dönmek (Necropolis → Unmarked Grave)
  // bir terfiyi rütbe düşüşü gibi gösterirdi.
  check('L80 ilk rütbeye geri dönmüyor', ossuaryTier(80) !== ossuaryTier(0), ossuaryTier(80));
  check('L80 ve L150 farklı', ossuaryTier(80) !== ossuaryTier(150), `${ossuaryTier(80)} / ${ossuaryTier(150)}`);
  check('çok yüksek seviyede de metin üretiliyor',
    ossuaryTier(5000).length > 3, ossuaryTier(5000));
}

console.log('\n[5] KADEME İLERLEMESİ (arayüz çubuğu)');
{
  check('kademe başı 0', ossuaryTierProgress(0) === 0);
  check('yarıda 0,5', ossuaryTierProgress(OSSUARY.tierEvery / 2) === 0.5);
  check('kademe sonu tekrar 0', ossuaryTierProgress(OSSUARY.tierEvery) === 0);
  let aralikta = true;
  for (let lv = 0; lv < 200; lv++) {
    const p = ossuaryTierProgress(lv);
    if (!(p >= 0 && p < 1)) aralikta = false;
  }
  check('her zaman 0..1 arası', aralikta);
}

console.log('\n[6] BOZUK GİRDİ');
{
  // ⚠️ Seviye sunucudan geliyor ama arayüz de çağırıyor; negatif/NaN bir
  // değer NaN maliyet üretip düğmeyi sessizce ölü bırakabilirdi.
  check('negatif seviye 0 gibi', ossuaryCost(-5) === ossuaryCost(0));
  check('kesirli seviye aşağı yuvarlanıyor', ossuaryCost(3.9) === ossuaryCost(3));
  // ⚠️ ÜÇÜ DE AYNI CEVABI VERMELİ — eskiden NaN / 0 / "×NaN" diye üç farklı
  // sonuç çıkıyordu.
  check('NaN maliyet üretmiyor', Number.isFinite(ossuaryCost(Number.NaN as number)));
  check('NaN seviye 0 gibi', ossuaryCost(Number.NaN as number) === ossuaryCost(0));
  check('NaN harcama 0', ossuarySpent(Number.NaN as number) === 0);
  check('NaN rütbe bozuk metin üretmiyor',
    ossuaryTier(Number.NaN as number) === ossuaryTier(0), ossuaryTier(Number.NaN as number));
  check('undefined seviye çökertmiyor',
    Number.isFinite(ossuaryCost(undefined as unknown as number)));
  check('negatif harcama 0', ossuarySpent(-3) === 0);
  check('negatifte rütbe var', ossuaryTier(-1) === ossuaryTier(0));
}

console.log('\n[7] EKONOMİ — sink gerçekten emiyor mu');
{
  /**
   * ⚠️ İKİ YÖNLÜ OLMALI: çok ucuzsa gold'u ememez (sink ölür), çok pahalıysa
   * ilk seviye bile alınamaz (sink yine ölür, kimse başlamaz).
   */
  const ilkSaat = ossuaryCost(0) / GOLD_SAAT;
  check('ilk seviye erişilebilir (< 15 dk)', ilkSaat < 0.25, `${(ilkSaat * 60).toFixed(0)} dk`);
  const l50 = ossuarySpent(50) / GOLD_SAAT;
  check('L50 ciddi bir hedef (> 100 saat)', l50 > 100, `${l50.toFixed(0)} saat`);
  const tekL50 = ossuaryCost(49) / GOLD_SAAT;
  check('L50 tek başına ~38 saat (dosyadaki iddia)',
    tekL50 > 30 && tekL50 < 46, `${tekL50.toFixed(1)} saat`);
}

console.log('\n[G] * RUTBE BASKALARINA GORUNUYOR - zincir');
{
  /**
   * NIYE VAR: 2026-09-07'de olculdu - rutbe HICBIR YERDE baskasina
   * gorunmuyordu. Bu dosyanin kendi basligi Ossuary'nin verdigi tek seyi
   * "leaderboard'da yaninda duran rutbe" diye tanimliyor; gerceklikte seviye
   * leaderboard satirinda TASINMIYORDU bile, rutbe yalniz oyuncunun kendi
   * profil kartinda ciziliyordu.
   *
   * Yani sonsuz gold sinki, sattigi gorunurlugu kimseye vermiyordu. Bu depoda
   * tekrar eden en pahali hata sinifi bu: kod calisiyor, veri var, son adimda
   * oluyor (bkz. Barrow odulu, pet baglama zinciri, kasa katkisi).
   *
   * leaderboard.ts kendi yorumunda kurali zaten yaziyordu - kozmetikler icin:
   * "prestij ANCAK baskalari gorurse degerlidir". Kural dogruydu, anita
   * UYGULANMAMISTI.
   */
  const oku2 = (f: string) => { try { return fs.readFileSync(f, 'utf8'); } catch { return ''; } };
  const lb = oku2('../backend/src/leaderboard.ts');
  check('1. sunucu satir tipi anit seviyesini tasiyor', /ossuary:\s*number/.test(lb));
  // IKI SORGU DA: liste ve "senin siran" ayri select bloklari - biri
  // unutulursa oyuncu kendi satirinda rutbesiz gorunur.
  const selects = (lb.match(/ossuary:\s*true/g) ?? []).length;
  check('2. her iki sorgu da alani cekiyor', selects >= 2, `${selects} select`);
  check('3. satira yaziliyor', /ossuary:\s*(r|me)\.ossuary/.test(lb));

  const sess = oku2('src/lib/gameSession.ts');
  check('4. istemci tipi alani taniyor', /ossuary\?:\s*number/.test(sess));

  const rec = oku2('src/components/RecordsPanel.tsx');
  check('5. leaderboard satiri kimlige geciriyor', /ossuary:\s*row\.ossuary/.test(rec));

  const ident = oku2('src/components/ui/Identity.tsx');
  check('6. kimlik satiri rutbeyi CIZIYOR', /ossuaryTier\(id\.ossuary\)/.test(ident));
  // SEVIYE DEGIL, RUTBE ADI ciziliyor ve ad ISTEMCIDE turetiliyor: sunucudan
  // metin gelseydi iki taraf ayrisirdi.
  check('7. rutbe adi istemcide turetiliyor (metin agdan gelmiyor)',
    !/ossuaryRank|rankName/.test(lb));
  // L0 CIZILMEMELI: ossuaryTier(0) "Unmarked Grave" doner ve her satira
  // basilsaydi tabloyu anlamsiz bir tekrarla doldururdu. Rutbenin isi AYIRT ETMEK.
  check('8. seviye 0 olan satirda rutbe cizilmiyor', /!!id\.ossuary/.test(ident));

  check('uydurma desen bulunmuyor (kontrol grubu)',
    !/ossuaryZZZ/.test(lb + sess + rec + ident));
}

console.log(`\n${FAIL.length === 0 ? '✅ OSSUARY SAĞLAM' : `❌ ${FAIL.length} BAŞARISIZ: ${FAIL.join(', ')}`}\n`);
process.exit(FAIL.length === 0 ? 0 : 1);
