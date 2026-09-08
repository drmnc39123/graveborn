// THE LONG VIGIL — SEZON KARTI MUHRU.
//
// Kart 0,5 SOL, yani GERCEK PARA. Buradaki her kontrol tek bir soruyu
// koruyor: odeyen oyuncu ne aldi, ve o sey ona GERCEKTEN ulasti mi.
//
// ── TASARIM IKI KEZ DEGISTI, IKISI DE KULLANICI KARARI ────────────────
//
// 1. KART ARTIK GUC SATIYOR (2026-09-08). Eskiden butun oduller kozmetik
//    ve tozdu; simdi 1.000 gold ve oynayarak acilamayan bir kahraman
//    (Metal Bladekeeper) veriyor. Uyarilarim ve olcumlerim `vigil.ts`
//    basliginda; karar tekrarlandi, uygulandi.
//    ⚠️ Bu muhur artik "guc satilmiyor"u DEGIL, "ne satildigi ACIKCA
//    SOYLENIYOR"u koruyor.
//
// 2. HER SEY ANINDA VERILIYOR (2026-09-08). Eskiden derinlikle acilan on
//    iki kademeli bir yoldu. Kullanici: *"Bu kartta DUST ile alakali bir
//    sey olmasin, bu kart sadece SOL ile satin alinir ve tum oduller
//    aninda verilir."*
//
// 🔴 DEGISMEYEN KIRMIZI CIZGI: KART KOZMETIKLERI CEKILISE DE GIRMEZ,
// TOZLA DA ALINMAZ. Girerlerse kart "zaten cikabilecek seyler" olur ve
// 0,5 SOL'un karsiligi kalmaz. Bu kural tam olarak bir kez KIRILDI ve
// olculdu (bkz. [3]).
//
//   cd frontend && npx tsx src/game/vigil.test.mts

import fs from 'node:fs';
import { VIGIL_GOLD, VIGIL_HERO, vigilCosmeticIds, vigilPaket } from './vigil.js';
import { cosmeticById, rollCosmetic, tozlaAlinabilirMi } from './cosmetics.js';
import { buyWithDust, emptyProgress } from './progress.js';
import { SOL_PRICES } from './solPrice.js';
import { HEROES } from './heroes.js';

const FAIL: string[] = [];
const check = (n: string, ok: boolean, d = '') => {
  console.log(`  ${ok ? 'OK ' : 'X  '} ${n}${d ? ` - ${d}` : ''}`);
  if (!ok) FAIL.push(n);
};
const oku = (f: string) => { try { return fs.readFileSync(f, 'utf8'); } catch { return ''; } };
const yorumsuz = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

const sec = oku('src/components/VigilSection.tsx');
const idx = yorumsuz(oku('../backend/src/index.ts'));
const vg = yorumsuz(oku('src/game/vigil.ts'));

console.log('\n=== THE LONG VIGIL ===');
console.log(`     ${SOL_PRICES.battlepass} SOL · ${VIGIL_GOLD} gold · ${VIGIL_HERO}`
  + ` · ${vigilCosmeticIds().length} kozmetik`);

console.log('\n[1] ** PAKET TEK KAYNAKTAN TURUYOR');
{
  /**
   * ⭐ KOZMETIK LISTESI `cosmetics.ts`TEN TURUYOR, elle yazilmiyor. Iki
   * yere yazilsaydi biri digerinden ayrilirdi ve en kotu hali su olurdu:
   * kartin parasi alinir, kozmetik verilmez.
   */
  check('kozmetikler cosmetics.ts kaynagindan',
    /COSMETICS\.filter\(\(c\) => c\.source === 'vigil'\)/.test(vg));
  const ids = vigilCosmeticIds();
  check('alti kozmetik', ids.length === 6, `${ids.length}`);
  check('hepsi gercek bir kozmetik', ids.every((i) => !!cosmeticById(i)));
  const p = vigilPaket();
  check('paket gold tasiyor', p.gold === VIGIL_GOLD && p.gold > 0);
  check('paket kahraman tasiyor', p.hero === VIGIL_HERO);
  check('kahraman gercek', HEROES.some((h) => h.id === p.hero));
  check('paket kozmetikleri tasiyor', p.cosmetics.length === 6);
  // ⚠️ TOZ TAMAMEN CIKTI — kullanici karari
  check('pakette TOZ YOK', !('dust' in (p as Record<string, unknown>)));
  check('vigil.ts kodunda toz gecmiyor', !/dust/i.test(vg));
}

console.log('\n[2] ** HER SEY ANINDA VE TEK YAZMADA VERILIYOR');
{
  /**
   * 🔴 GOLD, KOZMETIK VE KART BAYRAGI AYNI KOSULLU YAZMADA. Ayri
   * `update`lere bolunseydi "kart verildi ama odul verilmedi" araligi
   * dogardi; ikinci istek karti alamaz ama gold'u alabilirdi.
   */
  const blok = idx.slice(idx.indexOf("app.post('/vigil/buy-sol'"));
  const govde = blok.slice(0, blok.indexOf('}));') + 4);
  check('satin alma ucu bulundu (kontrol grubu)', govde.length > 300, `${govde.length} karakter`);
  check('gold ayni yazmada', /gold: \{ increment: paket\.gold \}/.test(govde));
  check('kozmetikler ayni yazmada', /cosmetics: yeniKozmetik/.test(govde));
  check('kart bayragi ayni yazmada', /vigil: true/.test(govde));
  check('kosul hala var (cift odeme korumasi)', /where: \{ wallet, vigil: false \}/.test(govde));
  /**
   * ⚠️ KOZMETIKLER OKUNUP BIRLESTIRILIYOR, koru koru yazilmiyor: oyuncunun
   * baska kozmetikleri var ve `set` ile yazmak onlari SILERDI.
   */
  check('mevcut kozmetikler korunuyor',
    /new Set\(\[\.\.\.eski, \.\.\.paket\.cosmetics\]\)/.test(govde));
  // ⚠️ Gold ekonominin denetim izi; kaynagi gorunmeyen bin gold, ay sonunda
  // "bu nereden geldi" sorusunu cevapsiz birakirdi.
  check('gold deftere yaziliyor', /kind: 'vigil', gold: paket\.gold/.test(govde));

  // 🔴 KADEME UCU KALDIRILDI — artik alinacak bir sey yok
  check('/vigil/claim ucu KALDIRILDI', !idx.includes("app.post('/vigil/claim'"));
  const gs = yorumsuz(oku('src/lib/gameSession.ts'));
  check('istemci de artik cagirmiyor', !gs.includes("'/vigil/claim'"));
}

console.log('\n[3] ** KART KOZMETIKLERI BASKA HICBIR YOLDAN ALINAMAZ');
{
  /**
   * 🔴 BU KURAL BIR KEZ KIRILDI VE OLCULDU: `buyWithDust` kaynaga hic
   * bakmiyordu, on sekiz kozmetik tozla aliniyordu — kartin ALTI ozel
   * kozmetiginin tamami (iki legendary dahil) ve on iki basarim odulu.
   * Yani 0,5 SOL odemeden Vigil Crown alinabiliyordu.
   */
  const ids = vigilCosmeticIds();
  const dene = (id: string) => buyWithDust({ ...emptyProgress(), dust: 99999 } as never, id);
  const sizan = ids.filter((i) => !dene(i).error);
  check('hicbiri tozla ALINAMIYOR', sizan.length === 0, sizan.join(',') || 'sizinti yok');
  check('hicbiri satilik sayilmiyor', ids.every((i) => !tozlaAlinabilirMi(cosmeticById(i)!)));

  /**
   * ⚠️ CIFT TARAFLI: cekilis 2.000 kez cevrilip kartin kozmetigi CIKMAMALI.
   * Sadece havuz listesine bakmak yetmez — `rollCosmetic` kendi havuzunu
   * kuruyor ve bir gun ayrisabilir.
   */
  const kume = new Set(ids);
  let cikan = 0;
  for (let i = 0; i < 2000; i++) {
    const r = rollCosmetic((i * 0.000499) % 1, ((i * 7919) % 1000) / 1000);
    if (r && kume.has(r.id)) cikan++;
  }
  check('2000 cekiliste hic cikmiyor', cikan === 0, `${cikan} kez cikti`);
  /**
   * KONTROL GRUBU: 0 cikmasi cekilisin BOZUK olmasindan da gelebilirdi.
   */
  let herhangi = 0;
  for (let i = 0; i < 200; i++) if (rollCosmetic((i * 0.005) % 1, ((i * 31) % 100) / 100)) herhangi++;
  check('cekilis gercekten calisiyor (kontrol grubu)', herhangi > 150, `${herhangi}/200`);
}

console.log('\n[4] ** NE SATILDIGI ACIKCA SOYLENIYOR');
{
  /**
   * 🔴 MUHUR YON DEGISTIRDI. Eskiden "kart guc satmaz" cumlesini ARIYORDU;
   * kart artik guc satiyor ve o cumle yalan oldu. Silmek yerine TERSINI
   * olcuyor: metin ne verdigini ACIKCA soylemek zorunda. Odeme ekraninda
   * en pahali hata, alanin ne aldigini yanlis sanmasidir.
   */
  check('"guc vermez" iddiasi KALMADI', !/no power at all/i.test(sec));
  check('gold ON PLANDA', sec.includes('GOLD, INSTANTLY'));
  check('kahramanin oynayarak acilamadigi yaziyor',
    sec.includes('CANNOT BE UNLOCKED BY PLAYING'));
  // ⚠️ Istatistikler `heroes.ts`ten okunuyor, elle yazilmiyor: dengesi bir
  // gun degisirse metin kendiliginden dogru kalir.
  check('kahraman istatistikleri kaynaktan', /Object\.entries\(kahraman\.stats\)/.test(sec));
  check('alti kalintinin alinamazligi yaziyor',
    /never roll them, and dust will never buy them/.test(sec));
  check('cuzdanin imza ISTEMEYECEGI yaziyor', /no message to sign/.test(sec));
}

console.log('\n[5] ** GORSEL: HER SEYIN BIR RESMI VAR');
{
  // Kullanici: "her seyin bir gorseli olsun ve bu kart efekt ve animasyonlu olsun"
  check('gold kutusu ikonlu', /<Icon name="gold"/.test(sec));
  check('kozmetiklerin gorseli var', /function KozmetikGorsel/.test(sec));
  /**
   * ⚠️ HER YUVA FARKLI SEY: kupa sprite, aura isik halkasi, isimlik
   * gradyan, unvan SALT METIN (`cosmetics.ts`te unvanin cizilecek varligi
   * yok). Dordu de ele alinmali, yoksa bazi oduller bos kutu cikar.
   */
  for (const yuva of ['trophy', 'aura', 'plate']) {
    check(`${yuva} yuvasi ciziliyor`, sec.includes(`def.slot === '${yuva}'`));
  }
  check('unvan icin yedek cizim var', /charAt\(0\)\.toUpperCase\(\)/.test(sec));

  check('animasyon tanimlari var', /@keyframes gb-vig-/.test(sec));
  check('satin alma sonrasi odul ani var', sec.includes('THE PACK IS YOURS'));
  /**
   * ⚠️ ODUL ANI SATIN ALMA ANINDA aciliyor, kart sahipligine BAKARAK degil:
   * karti olan oyuncu paneli her actiginda kutlama izlemek zorunda kalmamali.
   */
  check('odul ani satin almada tetikleniyor', /setOdulAni\(true\)/.test(sec));
  check('odul ani kendi kendine kapaniyor', /setOdulAni\(false\), 4200/.test(sec));
  // ⚠️ Perde tiklamayi YEMIYOR — oyuncuyu kutlamanin icine hapsetmek,
  // odemenin hemen ardindan yapilabilecek en kotu sey.
  check('odul perdesi tiklamayi yemiyor', /zIndex: 40, pointerEvents: 'none'/.test(sec));
  /**
   * ⚠️ `motionOff` DINLENIYOR: odeme ekraninda yanip sonen bir sey,
   * hareketi kapatmis oyuncuya ragmen yanip sonmemeli.
   */
  check('hareket kapaliysa animasyon yok', /hareketKapali \? undefined :/.test(sec));
  check('hareket kapaliysa odul ani da acilmiyor',
    /if \(!hareketKapali\) setOdulAni\(true\)/.test(sec));
}

console.log('\n[6] ** SOL DUGMESI BU KARTTA VE ISARETLI');
{
  check('SOL dugmesi kartta', /<SolPayButton/.test(sec));
  check('fiyat SOL cinsinden yaziyor', /lamports \/ 1e9/.test(sec));
  const btn = oku('src/components/SolPayButton.tsx');
  // Kullanici istegi: "SOL ile satin alimlarin yapildigi butonlara da bu SOL ikonu"
  check('Solana isareti var', /export function SolIcon/.test(btn));
  check('dugmede isaret ciziliyor', /<SolIcon size=\{12\} \/>/.test(btn));
  check('kartta da isaret var', /<SolIcon size=\{16\} \/>/.test(sec));
  /**
   * 🔴 RAY KAPALIYKEN SESSIZ KALINMAZ. Kartin tek eylemi SOL; dugme yok
   * olunca geriye tiklanacak hicbir seyi olmayan bir kutu kaliyor ve
   * oyuncu kartin bozuk oldugunu saniyor.
   */
  check('ray kapaliyken sebep yaziliyor', /payments are not switched on/.test(sec));
  // ⚠️ NE ZAMAN acilacagi DEGIL, NIYE kapali oldugu yaziliyor: takvime
  // bagli bir soz, o gun geldiginde arkasindaki is bitmemisse tutulamaz.
  const kapaliMetin = (sec.match(/The card cannot be bought yet[^<]*/) ?? [''])[0];
  check('kapali metni TARIH icermiyor',
    !/[0-9]{4}|tomorrow|next week|soon/i.test(kapaliMetin), kapaliMetin.slice(0, 50));
  check('ray kancasi disariya acildi (tek kaynak)', /export function useSolRail/.test(btn));
}

console.log('\n[7] ** KART KENDI GIRISINE KAVUSTU');
{
  /**
   * Kart bugune kadar Reliquary panelinin ICINDE bir sekmeydi: oyunun tek
   * gercek parali paketi, baska bir panelin alt bolumu olarak duruyordu ve
   * navbardan hic gorunmuyordu.
   */
  const dock = oku('src/components/BuildingDock.tsx');
  check('navbarda kendi girisi var', dock.includes("id: 'vigil', label: 'STARTER PACK'"));
  check('SPEND grubunun BASINDA', /members: \['vigil', 'market'/.test(dock));

  const rel = oku('src/components/ReliquaryPanel.tsx');
  // ⚠️ CIFT TARAFLI: eski sekme GERCEKTEN gitti mi
  check('Reliquary sekmesi KALDIRILDI', !rel.includes("id: 'vigil', label: 'THE VIGIL'"));
  check('Reliquary artik VigilSection cizmiyor', !rel.includes('<VigilSection'));

  const play = oku('src/app/play/page.tsx');
  check('panel yonlendirmesi var', play.includes("acik === 'vigil'"));

  const capa = oku('src/components/VigilBeacon.tsx');
  check('minimap yaninda capa var', capa.length > 500);
  check('capa sandik gorseli kullaniyor', capa.includes('spr_Chest_1_closed.png'));
  // ⚠️ CERCEVE YOK (kullanici duzeltmesi): "sadece sandigin kendisi dursun,
  // arkasi seffaf olsun ve animasyonlu olsun"
  check('capanin kutusu YOK', capa.includes("all: 'unset'") && !/border: `1px solid \$\{sahip/.test(capa));
  check('capa animasyonlu', capa.includes('gb-pack-bob') && capa.includes('gb-pack-halo'));
  check('capa adi anlamli', capa.includes('>STARTER<'));
  /**
   * ⚠️ KONUM MINIMAPIN KUTUSUNDAN TURUYOR. Sabit sayi yazilsaydi dar
   * ekranda minimap %70'e dustugunde capa havada kalirdi — ayni hatayi
   * sag kolonda olcup duzelttik.
   */
  check('capa konumu hudLayout modulunden',
    capa.includes('minimapKutusu(ekranW, navbarH, navbarSol)'));
  check('capa sayfaya takildi', play.includes('<VigilBeacon'));
  // ⚠️ Karti olan oyuncuya surekli yanip sonen satis capasi gostermek,
  // odemis oyuncuyu rahatsiz etmektir.
  check('kart alinmissa capa sessizlesiyor', capa.includes('!sahip && !hareketKapali'));
}

console.log(`\n${FAIL.length === 0 ? 'VIGIL SAGLAM' : `${FAIL.length} BASARISIZ: ${FAIL.join(', ')}`}\n`);
process.exit(FAIL.length === 0 ? 0 : 1);
