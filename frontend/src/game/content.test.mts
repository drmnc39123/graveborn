// İÇERİK ERİŞİLEBİLİRLİK MÜHRÜ — "yapıldı ama ulaşılamıyor" sınıfı.
//
//   npx tsx src/game/content.test.mts
//
// 🔴 BU DEPODA EN SIK TEKRAR EDEN HATA SINIFI BU: içerik yazılıyor,
// dengeleniyor, test ediliyor — ve oyuncuya HİÇ ULAŞMIYOR. Hiçbir hata
// çıkmıyor, hiçbir log yazılmıyor; envanterde "var" görünüyor.
// Ölçülmüş örnekler:
//   · `luck` ve `richer` pasifleri motorun HİÇ OKUMADIĞI bir stat
//     veriyordu — oyuncu bir koşunun en önemli kararını 5 kez tam
//     anlamıyla HİÇBİR ŞEYE harcayabiliyordu.
//   · Evrim ipucu, teklif id'si önekli olduğu için oyunun ömrü boyunca
//     gizli kaldı.
//   · `/admin/reset` aylarca ekransız durdu.
//   · Zaman tabanlı `BOSSES` tablosu hiçbir yerden import edilmiyordu.
//
// Buradaki her kontrol o sınıftan bir kapı kapatıyor.
//
// ⚠️ VERİ İMPORT EDİLİYOR, KAYNAK yalnız "motor bunu okuyor mu" sorusu
// için taranıyor. Veriyi de regex'le okumak, listeler değiştiğinde
// sessizce hiçbir şey ölçmeyen bir mühür bırakırdı.

import fs from 'node:fs';
import { EVOLUTIONS, EVOLVED, PASSIVES, STAGES, WEAPONS, evrimPasifEsigi, evrimSilahEsigi } from './config.js';
import { ENEMIES } from './config.js';
import { HEROES } from './heroes.js';
import { UNLOCKS, STARTER_WEAPONS } from './unlocks.js';
import { CHARMS } from './charms.js';
import { SKILL_TREE } from './skills.js';
import { PETS } from './pets.js';

const FAIL: string[] = [];
const check = (n: string, ok: boolean, d = '') => {
  if (!ok) { console.log(`  ✗ ${n}${d ? ` — ${d}` : ''}`); FAIL.push(n); }
};
const gecti = (n: string, d = '') => console.log(`  ✓ ${n}${d ? ` — ${d}` : ''}`);

/** Motorun gerçekten okuduğu kaynak dosyalar */
const MOTOR = ['engine.ts', 'render.ts', 'fx.ts', 'simPlayer.ts', 'config.ts']
  .map((f) => { try { return fs.readFileSync(`src/game/${f}`, 'utf8'); } catch { return ''; } })
  .join('\n');

/** Bir istatistik motorda GERÇEKTEN okunuyor mu */
const motorOkuyor = (stat: string) =>
  MOTOR.includes(`stats.${stat}`) || MOTOR.includes(`['${stat}']`);

console.log('\n═══ İÇERİK ERİŞİLEBİLİRLİK ═══');

console.log('\n[1] SİLAHLAR — hepsi açılabiliyor mu');
{
  const acilabilir = new Set<string>([...STARTER_WEAPONS, ...UNLOCKS.map((u) => u.weapon)]);
  /**
   * ⚠️ `isWeaponUnlocked` koşulu OLMAYAN silahı AÇIK sayıyor, yani yeni bir
   * silah sessizce erişilmez OLMUYOR. Bu kontrol yine de gerekli: bir
   * silahın hiçbir açılış hikâyesi olmaması TASARIM eksiği — oyuncu onu
   * kazanmıyor, bir gün öylece beliriyor.
   */
  const hikayesiz = WEAPONS.filter((w) => !acilabilir.has(w.id)).map((w) => w.id);
  check('her taban silahın bir açılış yolu var', hikayesiz.length === 0,
    `${hikayesiz.join(' ')} — kahraman başlangıcı da değil, UNLOCKS'ta da yok`);

  const silahId = new Set(WEAPONS.map((w) => w.id));
  for (const u of UNLOCKS) {
    check(`UNLOCKS '${u.weapon}' gerçek bir taban silah`, silahId.has(u.weapon));
    // ⚠️ Evrimleşmiş silah açılış koşuluna bağlanamaz: o havuza hiç girmiyor.
    check(`UNLOCKS '${u.weapon}' evrimleşmiş DEĞİL`, !EVOLVED.some((e) => e.id === u.weapon));
    check(`UNLOCKS '${u.weapon}' şart metni dolu`, u.how.length > 5, u.how);
  }
  // ⚠️ Kahraman başlangıç silahları GERÇEK olmalı; yoksa o kahraman koşunun
  // ilk saniyesinde silahsız kalır.
  for (const h of HEROES) check(`${h.id} başlangıç silahı tanımlı`, silahId.has(h.weapon), h.weapon);
  gecti(`${WEAPONS.length} taban silah · ${STARTER_WEAPONS.length} başlangıç · ${UNLOCKS.length} açılış koşulu`);
}

console.log('\n[2] AÇILIŞ KOŞULLARI SAĞLANABİLİR Mİ');
{
  const bolumId = new Set(STAGES.map((s) => s.id));
  const kaynak = fs.readFileSync('src/game/unlocks.ts', 'utf8');
  // ⚠️ Koşullar saf fonksiyon; içlerindeki bölüm numaralarını kaynaktan
  // okuyup GERÇEK bölüm listesiyle karşılaştırıyoruz. Var olmayan bir
  // bölüme bağlı koşul ASLA sağlanmaz ve silah sonsuza kadar kilitli kalır.
  const bolumler = [...kaynak.matchAll(/cleared\(p,\s*(\d+)\)/g)].map((m) => Number(m[1]));
  const yok = bolumler.filter((b) => !bolumId.has(b));
  check('açılış koşulları var olan bölümlere bağlı', yok.length === 0, `bölüm ${yok.join(',')} yok`);
  const derinlikler = [...kaynak.matchAll(/deepest\(p\)\s*>=\s*(\d+)/g)].map((m) => Number(m[1]));
  // Descent sonsuz; yine de saçma bir eşik (d1000) silahı pratikte öldürür.
  check('derinlik eşikleri makul (≤ 50)', derinlikler.every((d) => d <= 50), derinlikler.join(','));
  gecti('koşullar sağlanabilir', `bölüm ${bolumler.join(',')} · derinlik ${derinlikler.join(',')}`);
}

console.log('\n[3] EVRİMLER');
{
  const silahId = new Set(WEAPONS.map((w) => w.id));
  const pasifId = new Map(PASSIVES.map((p) => [p.id, p]));
  const evrimId = new Set(EVOLVED.map((e) => e.id));

  for (const ev of EVOLUTIONS) {
    check(`evrim tabanı '${ev.weapon}' gerçek`, silahId.has(ev.weapon));
    check(`evrim pasifi '${ev.passive}' gerçek`, pasifId.has(ev.passive));
    check(`evrim sonucu '${ev.to}' gerçek`, evrimId.has(ev.to));

    const w = WEAPONS.find((x) => x.id === ev.weapon);
    const p = pasifId.get(ev.passive);
    if (w) {
      // ⚠️ Eşik maxLevel'ın ÜSTÜNDEyse evrim ASLA tetiklenmez — ve hiçbir
      // hata çıkmaz, oyuncu sadece "evrim gelmiyor" der.
      check(`'${ev.weapon}' silah eşiği ulaşılabilir`,
        evrimSilahEsigi(w) <= w.maxLevel, `eşik ${evrimSilahEsigi(w)} > max ${w.maxLevel}`);
    }
    if (p) {
      check(`'${ev.passive}' pasif eşiği ulaşılabilir`,
        evrimPasifEsigi(p) <= p.maxLevel, `eşik ${evrimPasifEsigi(p)} > max ${p.maxLevel}`);
    }
  }

  // ⚠️ HEDEFİ OLMAYAN EVRİMLEŞMİŞ SİLAH = ÖLÜ İÇERİK. Havuza girmiyor
  // (`evolved: true`) ve hiçbir evrim ona götürmüyorsa oyunda HİÇ görünmez.
  const hedefler = new Set(EVOLUTIONS.map((e) => e.to));
  const ulasilmaz = EVOLVED.filter((e) => !hedefler.has(e.id)).map((e) => e.id);
  check('ulaşılamayan evrimleşmiş silah YOK', ulasilmaz.length === 0, ulasilmaz.join(' '));

  // ⚠️ BELGELENMİŞ TASARIM KURALI: her evrim FARKLI bir pasif ister.
  // Aynı pasifi iki evrimin şartı yapmak tek "doğru" pasif üretir ve
  // build çeşitliliğini öldürür (config.ts'te yazılı).
  const pasifler = EVOLUTIONS.map((e) => e.passive);
  check('her evrim FARKLI pasif istiyor', new Set(pasifler).size === pasifler.length,
    pasifler.join(' '));

  // ⚠️ Evrimin taban silahı açılamıyorsa evrim de ulaşılamaz.
  const acilabilir = new Set<string>([...STARTER_WEAPONS, ...UNLOCKS.map((u) => u.weapon)]);
  const kilitli = EVOLUTIONS.filter((e) => !acilabilir.has(e.weapon)).map((e) => e.weapon);
  check('her evrimin taban silahı açılabilir', kilitli.length === 0, kilitli.join(' '));
  gecti(`${EVOLUTIONS.length} evrim · ${EVOLVED.length} evrimleşmiş silah`);
}

console.log('\n[4] ⭐ MOTORUN OKUMADIĞI BONUS VAR MI');
{
  /**
   * 🔴 BU KONTROL GERÇEK BİR HATADAN DOĞDU. `luck` ve `richer` pasifleri
   * motorun hiç okumadığı bir istatistik veriyordu; oyuncu level-up
   * seçimini 5 kez TAM ANLAMIYLA hiçbir şeye harcayabiliyordu ve
   * hiçbir yerde iz yoktu. Aynı risk tılsım, beceri ve kahramanda da var.
   */
  const olu: string[] = [];
  for (const p of PASSIVES) if (!motorOkuyor(p.stat)) olu.push(`pasif ${p.id}→${p.stat}`);
  for (const c of CHARMS) for (const k of Object.keys(c.stats)) if (!motorOkuyor(k)) olu.push(`tılsım ${c.id}→${k}`);
  for (const n of SKILL_TREE) for (const k of Object.keys(n.stats ?? {})) if (!motorOkuyor(k)) olu.push(`beceri ${n.id}→${k}`);
  for (const h of HEROES) for (const k of Object.keys(h.stats)) if (!motorOkuyor(k)) olu.push(`kahraman ${h.id}→${k}`);
  check('motorun OKUMADIĞI bonus YOK', olu.length === 0, olu.join(' · '));

  // ⚠️ ÇİFT TARAFLI: tarayıcı gerçekten arıyor mu? Uydurma bir stat
  // BULUNMAMALI, yoksa kontrol her şeye "okunuyor" derdi.
  check('tarama kontrol grubu', !motorOkuyor('uydurma_stat_yok'));
  gecti(`${PASSIVES.length} pasif · ${CHARMS.length} tılsım · ${SKILL_TREE.length} beceri · ${HEROES.length} kahraman tarandı`);
}

console.log('\n[5] YOLDAŞLAR — bağlanabilir mi');
{
  const dusmanId = new Set(ENEMIES.map((e) => e.id));
  // ⚠️ BÖLÜM KADROSU da kontrol ediliyor: tanımlı ama hiçbir bölümde
  // doğmayan bir düşmandan pet bağlanamaz. Tanım kontrolü tek başına
  // bunu KAÇIRIR.
  const kadro = new Set(STAGES.flatMap((s) => s.enemies ?? []));
  for (const pet of PETS) {
    check(`'${pet.id}' → '${pet.bindsFrom}' gerçek bir düşman`, dusmanId.has(pet.bindsFrom));
    check(`'${pet.bindsFrom}' en az bir bölümde doğuyor`, kadro.has(pet.bindsFrom));
  }
  const idler = PETS.map((p) => p.id);
  check('yoldaş id\'leri benzersiz', new Set(idler).size === idler.length);
  gecti(`${PETS.length} yoldaş bağlanabilir`);
}

console.log('\n[6] LİSTE BÜTÜNLÜĞÜ');
{
  const benzersiz = (ad: string, l: readonly { id: string }[]) =>
    check(`${ad} id'leri benzersiz`, new Set(l.map((x) => x.id)).size === l.length);
  benzersiz('silah', WEAPONS);
  benzersiz('evrimleşmiş silah', EVOLVED);
  benzersiz('pasif', PASSIVES);
  benzersiz('tılsım', CHARMS);
  benzersiz('beceri', SKILL_TREE);
  // ⚠️ Taban ve evrimleşmiş listeler ÇAKIŞMAMALI: `weaponById` ikisine de
  // bakıyor ve çakışan bir id sessizce yanlış silahı döndürürdü.
  const cakisma = WEAPONS.filter((w) => EVOLVED.some((e) => e.id === w.id)).map((w) => w.id);
  check('taban ve evrim listeleri çakışmıyor', cakisma.length === 0, cakisma.join(' '));
  gecti('listeler tutarlı');
}

console.log(`\n${FAIL.length === 0 ? '✅ TÜM İÇERİK ULAŞILABİLİR' : `❌ ${FAIL.length} BAŞARISIZ`}\n`);
process.exit(FAIL.length === 0 ? 0 : 1);
