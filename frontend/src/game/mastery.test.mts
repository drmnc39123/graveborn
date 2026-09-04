// KAHRAMAN USTALIĞI MÜHRÜ.
//
// ⚠️ NİYE GEREKİYOR: ustalık, motora `permanent` kanalından giren BEŞİNCİ
// bonus kaynağı. Bu kanaldaki bir hata sessiz: oyuncu ekranda bir sayı
// görür, motorda başka bir sayı çalışır ve kimse fark etmez. Üstelik
// `cooldown` bu depoda TERS çalışıyor (negatif = daha hızlı) — işareti
// ters yazmak, ödülü sessizce bir CEZAYA çevirirdi.

import { oransalStat } from './config.js';
import { HEROES } from './heroes.js';
import {
  USTALIK_ESIK, USTALIK_MAX, USTALIK_MODLARI, USTALIK_STAT,
  sonrakiEsik, ustalikBonusu, ustalikKademesi, ustalikMetni, ustalikTanimsizlar,
} from './mastery.js';

const FAIL: string[] = [];
const check = (n: string, ok: boolean, d = '') => {
  console.log(`${ok ? '  ✓' : '  ✗'} ${n}${d ? ` — ${d}` : ''}`);
  if (!ok) FAIL.push(n);
};

console.log('\n[1] HER KAHRAMANIN BİR HATTI VAR');
const eksik = ustalikTanimsizlar();
// Tanımı olmayan kahraman SESSİZCE ilerlemesiz kalırdı — kartında
// "0 / 5" yazar ve hiçbir zaman artmazdı.
check('ustalık tanımı olmayan kahraman YOK', eksik.length === 0, eksik.join(' '));
const hayalet = Object.keys(USTALIK_STAT).filter((id) => !HEROES.some((h) => h.id === id));
check('tanım listesinde HAYALET kahraman yok', hayalet.length === 0, hayalet.join(' '));

console.log('\n[2] EŞİKLER');
let artan = true;
for (let i = 1; i < USTALIK_ESIK.length; i++) if (USTALIK_ESIK[i] <= USTALIK_ESIK[i - 1]) artan = false;
check('eşikler kesinlikle artan', artan, USTALIK_ESIK.join(' < '));
check('eşik sayısı = maksimum kademe', USTALIK_ESIK.length === USTALIK_MAX, `${USTALIK_ESIK.length}/${USTALIK_MAX}`);

console.log('\n[3] KADEME — ÇİFT TARAFLI');
check('derinlik 0 → kademe 0', ustalikKademesi(0) === 0);
for (let i = 0; i < USTALIK_ESIK.length; i++) {
  const e = USTALIK_ESIK[i];
  // ⚠️ Tek yön ölçmek ("eşikte kademe artıyor") her zaman dolu bir sayacı
  // da geçirirdi. Bir eksiğinde ARTMAMALI.
  check(`d${e - 1} → ${i}`, ustalikKademesi(e - 1) === i, String(ustalikKademesi(e - 1)));
  check(`d${e} → ${i + 1}`, ustalikKademesi(e) === i + 1, String(ustalikKademesi(e)));
}
check('tavanın üstü tavanda kalıyor', ustalikKademesi(100000) === USTALIK_MAX);
check('sonraki eşik tavanda null', sonrakiEsik(USTALIK_MAX) === null);
check('sonraki eşik 0. kademede ilk eşik', sonrakiEsik(0) === USTALIK_ESIK[0]);

console.log('\n[4] BONUS');
for (const h of HEROES) {
  const t = USTALIK_STAT[h.id];
  if (!t) continue;
  const b0 = ustalikBonusu(h.id, 0);
  check(`${h.id} kademe 0'da bonus YOK`, Object.keys(b0).length === 0, JSON.stringify(b0));
  const b1 = ustalikBonusu(h.id, 1);
  const bMax = ustalikBonusu(h.id, USTALIK_MAX);
  check(`${h.id} kademeyle doğrusal büyüyor`,
    Math.abs((bMax[t.key] ?? 0) - (b1[t.key] ?? 0) * USTALIK_MAX) < 1e-9,
    `${b1[t.key]} × ${USTALIK_MAX} vs ${bMax[t.key]}`);
  // ⚠️ TAVANIN ÜSTÜ KIRPILMALI: 99. kademe diye bir şey yok, ama bir gün
  // biri kademeyi yanlış hesaplarsa bonus sonsuza gitmemeli.
  check(`${h.id} tavan üstü kırpılıyor`,
    Math.abs((ustalikBonusu(h.id, 99)[t.key] ?? 0) - (bMax[t.key] ?? 0)) < 1e-9);
}
// ⚠️ `cooldown` TERS: negatif = daha hızlı. Pozitif yazılsaydı avcının
// ödülü sessizce bir yavaşlama olurdu.
check('ranger ustalığı SALDIRIYI HIZLANDIRIYOR (negatif cooldown)',
  (ustalikBonusu('ranger', USTALIK_MAX).cooldown ?? 0) < 0,
  String(ustalikBonusu('ranger', USTALIK_MAX).cooldown));
// ⚠️ Bilinmeyen id VARSAYILANA DÜŞMEMELİ: yanlış yazılmış bir kahramanın
// sessizce şövalyenin bonusunu alması, en kötü tür hatadır.
check('bilinmeyen kahraman BOŞ dönüyor',
  Object.keys(ustalikBonusu('olmayan-kahraman', 5)).length === 0);

console.log('\n[4b] OYUNCUYA GÖSTERİLEN METİN');
/**
 * 🔴 BU BÖLÜM GERÇEK BİR HATADAN SONRA YAZILDI. Kart, bonusu JSX içinde
 * biçimlendiriyor ve "değer 1'den küçükse yüzdedir" diye VARSAYIYORDU;
 * zırh bonusu 0,4 ekranda **"+%40 armor"** olarak göründü. Zırh puan,
 * oran değil. Aynı hata daha önce `recovery` ile de yapılmıştı.
 * Karar artık saf bir fonksiyonda ve ÖLÇÜLEBİLİR.
 */
{
  check("kademe 0'da metin YOK", ustalikMetni('knight', 0) === null);
  const zirh = ustalikMetni('knight', 2);
  check('DÜZ stat yüzde ile gösterilmiyor', !!zirh && !zirh.includes('%'), String(zirh));
  check('zırh metni doğru', zirh === '+0.4 armor', String(zirh));
  const can = ustalikMetni('priestess', USTALIK_MAX);
  check('kayan nokta artığı temizleniyor', can === '+0.3 health regen', String(can));
  const hiz = ustalikMetni('ranger', USTALIK_MAX);
  // ⚠️ Motorda negatif ama oyuncuya FAYDA olarak yazılmalı: "+%10 saldırı
  // hızı", "−%10 bekleme" değil.
  check('ORANSAL stat yüzde ile gösteriliyor', !!hiz && hiz.includes('%'), String(hiz));
  check('faydalı bonus ARTI işaretli', !!hiz && hiz.startsWith('+'), String(hiz));
  check('hız metni doğru', hiz === '+10% attack speed', String(hiz));
  const can2 = ustalikMetni('bladekeeper', USTALIK_MAX);
  check('oransal can metni doğru', can2 === '+10% max health', String(can2));
  check('bilinmeyen kahramanda metin YOK', ustalikMetni('yok', 3) === null);
}

console.log('\n[5] TAVAN — denge kaçağına karşı');
/**
 * ⚠️ BU KONTROL BİR DEĞER YARGISI VE BİLEREK SERT. Ustalık bir kimlik
 * eklemeli, bir hattı EZMEMELİ: Forge ağacı 255.694 gold ve bundan kat
 * kat fazlasını veriyor. Bir gün biri `perTier`ı 10 katına çıkarırsa bu
 * satır düşer ve kararı yeniden vermeye zorlar.
 */
const ORANSAL_TAVAN = 0.12;     // %12
const DUZ_TAVAN = 1.2;          // mutlak birim (zırh, HP/sn)
for (const h of HEROES) {
  const t = USTALIK_STAT[h.id];
  if (!t) continue;
  const v = Math.abs((ustalikBonusu(h.id, USTALIK_MAX)[t.key] ?? 0));
  // ⚠️ SINIFLANDIRMA TEK KAYNAKTAN (`config.DUZ_STATLAR`). Burada ikinci
  // bir liste yazılıydı ve tam da bu ikilik, zırhın ekranda "%40" diye
  // görünmesine yol açan varsayımın kardeşiydi.
  const oransal = oransalStat(t.key);
  const tavan = oransal ? ORANSAL_TAVAN : DUZ_TAVAN;
  check(`${h.id} toplam bonusu tavanın altında`, v <= tavan + 1e-9,
    `${v} ≤ ${tavan} (${t.key})`);
}

console.log('\n[6] HANGİ MODLAR BESLİYOR');
// ⚠️ Günlük iniş EŞİTLENMİŞ bir mod: kalıcı güç kazandırması "eşit güç"
// vaadini dolambaçlı yoldan çiğnerdi. Düelloda tohum rakibin.
check('günlük iniş ustalık BESLEMİYOR', !USTALIK_MODLARI.includes('daily'));
check('düello ustalık BESLEMİYOR', !USTALIK_MODLARI.includes('duel'));
check('descent besliyor', USTALIK_MODLARI.includes('descent'));

console.log(`\n${FAIL.length === 0 ? '✅ USTALIK SAĞLAM' : `❌ ${FAIL.length} BAŞARISIZ: ${FAIL.join(', ')}`}\n`);
process.exit(FAIL.length === 0 ? 0 : 1);
