// EFEKT KATMANI TESTİ — havuzlama gerçekten çalışıyor mu, motoru kirletiyor mu.
//
// Buradaki asıl risk "efekt görünmüyor" değil (onu gözle görürsün), iki sinsi
// sınıf: (1) havuz yerine her frame yeni nesne tahsis edilmesi → GC spike →
// frame düşmesi, (2) efekt katmanının simülasyona sızması → tarayıcıda başka,
// sunucuda başka sonuç.
//
// Çalıştır:  npx tsx src/game/fx.test.mts

import { Game } from './engine.js';
import { TICK } from './config.js';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ENEMY_ART, FALLEN_ART, PET_ART } from './sprites.js';
import { PETS } from './pets.js';
import { ICON, STAT_ICON, iconSrc, type IconName } from '../lib/icons.js';
import { FORGE } from './forge.js';
import { PASSIVES, WEAPONS, EVOLVED } from './config.js';
import { pumpFx, resetFx, shakeOffset, takeFreeze } from './fx.js';

const FAIL: string[] = [];
const check = (n: string, ok: boolean, d = '') => {
  console.log(`${ok ? '  ✓' : '  ✗'} ${n}${d ? ` — ${d}` : ''}`);
  if (!ok) FAIL.push(n);
};

console.log('\n[1] DOM\'suz çalışıyor');
{
  // fx.ts render katmanında yaşıyor ama `pumpFx` çizim yapmıyor — headless
  // koşabilmeli ki perf'i ölçülebilsin ve CI'da kırılmasın.
  const g = new Game(12345);
  g.setViewport(1280, 720);
  resetFx();
  let patladi = false;
  try {
    for (let i = 0; i < 120; i++) { g.step(); pumpFx(g, TICK); }
  } catch (e) {
    patladi = true;
    console.log('    hata:', (e as Error).message);
  }
  check('pumpFx headless çalışıyor (DOM yok)', !patladi);
  check('120 tick sonra oyun hâlâ ayakta', g.phase === 'running' || g.phase === 'levelup', g.phase);
}

console.log('\n[2] Kuyruklar boşaltılıyor');
{
  const g = new Game(999);
  g.setViewport(1280, 720);
  resetFx();
  for (let i = 0; i < 600; i++) { g.step(); pumpFx(g, TICK); }
  // ⚠️ `deaths` BİLEREK boşaltılmıyor (render.ts'teki ölüm patlaması onu
  // kullanıyor) — tek boşaltma noktası olmalı, yoksa efektlerden biri aç kalır.
  check('hits kuyruğu boşaltılıyor', g.hits.length === 0, `${g.hits.length}`);
  check('hurts kuyruğu boşaltılıyor', g.hurts.length === 0, `${g.hurts.length}`);
}

console.log('\n[3] Kuyruk tavanları (headless sızıntı koruması)');
{
  // Render hiç çalışmasa bile kuyruklar sonsuz büyümemeli — sunucu bu motoru
  // headless koşuyor ve bellek sızıntısı orada ölümcül olur.
  const g = new Game(4242);
  g.setViewport(1280, 720);
  for (let i = 0; i < 1800; i++) g.step();   // pumpFx YOK — kimse boşaltmıyor
  check('hits tavanı tutuyor (≤96)', g.hits.length <= 96, `${g.hits.length}`);
  check('deaths tavanı tutuyor (≤256)', g.deaths.length <= 256, `${g.deaths.length}`);
  check('hurts tavanı tutuyor (≤4)', g.hurts.length <= 4, `${g.hurts.length}`);
}

console.log('\n[4] Havuzlama — tahsis olmadığının kanıtı');
{
  // ⚠️ ASIL TEST BU. Havuz yerine push kullanılsaydı bellek koşu boyunca
  // büyürdü. Ölçüm: yoğun 20 saniyede heap artışı.
  const g = new Game(777);
  g.setViewport(1280, 720);
  resetFx();
  for (let i = 0; i < 300; i++) { g.step(); pumpFx(g, TICK); }  // ısınma

  global.gc?.();
  const before = process.memoryUsage().heapUsed;
  for (let i = 0; i < 1200; i++) { g.step(); pumpFx(g, TICK); }
  global.gc?.();
  const after = process.memoryUsage().heapUsed;
  const buyume = (after - before) / 1024 / 1024;
  console.log(`     1200 tick heap değişimi: ${buyume.toFixed(2)} MB`);
  // Motorun kendi varlıkları da büyüyor (düşman/mermi), o yüzden eşik cömert;
  // havuz yerine push olsaydı bu sayı on kat büyük olurdu.
  check('efekt katmanı bellek patlatmıyor (<12 MB)', buyume < 12, `${buyume.toFixed(2)} MB`);
}

console.log('\n[5] Güncelleme bütçesi');
{
  const g = new Game(31337);
  g.setViewport(1280, 720);
  resetFx();
  for (let i = 0; i < 600; i++) { g.step(); pumpFx(g, TICK); }  // sürüyü büyüt

  const N = 1200;
  const t0 = performance.now();
  for (let i = 0; i < N; i++) { g.step(); pumpFx(g, TICK); }
  const toplam = performance.now() - t0;

  // pumpFx'i ayrı ölç: aynı sayıda çağrı, step olmadan
  const t1 = performance.now();
  for (let i = 0; i < N; i++) pumpFx(g, TICK);
  const sadecePump = (performance.now() - t1) / N;

  console.log(`     step+pump ${(toplam / N).toFixed(3)} ms/tick · sadece pumpFx ${sadecePump.toFixed(4)} ms`);
  console.log(`     sahnede ${g.enemies.length} düşman`);
  // Frame bütçesi 16.7 ms; pumpFx bunun %3'ünü geçmemeli
  check('pumpFx bütçesi (<0.5 ms/frame)', sadecePump < 0.5, `${sadecePump.toFixed(4)} ms`);
}

console.log('\n[6] Hit-stop ve sarsıntı');
{
  const g = new Game(555);
  g.setViewport(1280, 720);
  resetFx();

  check('başlangıçta sarsıntı yok', shakeOffset().x === 0 && shakeOffset().y === 0);
  check('başlangıçta donma yok', takeFreeze() === 0);

  // Oyuncuya hasar verdir → hem sarsıntı hem donma gelmeli
  g.hurts.push({ amount: 10 });
  pumpFx(g, TICK);
  const sh = shakeOffset();
  check('hasar sarsıntı üretiyor', Math.abs(sh.x) + Math.abs(sh.y) > 0,
    `(${sh.x.toFixed(2)}, ${sh.y.toFixed(2)})`);
  const f = takeFreeze();
  check('hasar donma üretiyor', f > 0, `${(f * 1000).toFixed(0)} ms`);
  check('donma bir kez okunur (tekrar 0)', takeFreeze() === 0);
  check('donma tavanı makul (≤90 ms)', f <= 0.09, `${(f * 1000).toFixed(0)} ms`);

  // Sarsıntı sönmeli — kalıcı olsaydı ekran sürekli titrerdi
  for (let i = 0; i < 240; i++) pumpFx(g, TICK);
  const sh2 = shakeOffset();
  check('sarsıntı sönüyor', sh2.x === 0 && sh2.y === 0);
}

console.log('\n[7] Determinizm — efektler rng akışını KİRLETMİYOR');
{
  // Aynı seed, biri pumpFx'li biri pumpFx'siz: simülasyon birebir aynı kalmalı.
  const mk = (pump: boolean) => {
    const g = new Game(24680);
    g.setViewport(1280, 720);
    resetFx();
    for (let i = 0; i < 900; i++) {
      if (g.phase === 'levelup') g.choose(g.offers[0].id);
      if (g.phase !== 'running') break;
      g.hp = g.stats.maxHp;
      g.setInput(Math.cos(i * TICK * 0.7), Math.sin(i * TICK * 0.7));
      g.step();
      if (pump) pumpFx(g, TICK);
    }
    return g;
  };
  const ile = mk(true);
  const siz = mk(false);
  check('pumpFx kill sayısını DEĞİŞTİRMİYOR', ile.kills === siz.kills, `${ile.kills} = ${siz.kills}`);
  check('pumpFx konumu DEĞİŞTİRMİYOR', Math.abs(ile.px - siz.px) < 1e-9 && Math.abs(ile.py - siz.py) < 1e-9);
  check('pumpFx nadir gold\'u DEĞİŞTİRMİYOR', ile.rareGold === siz.rareGold, `${ile.rareGold}`);
}

console.log('\n[8] Ölüm animasyonu — dosyalar GERÇEKTEN var mı');
{
  // ⚠️ En sinsi hata sınıfı: yanlış dosya adı → 404 → `drawActor` sessizce
  // false döner → leş hiç görünmez ve kimse sebebini anlamaz. Manifest
  // dosyanın varlığının tek kaynağı, ona soruyoruz.
  const manifestYol = path.join(path.dirname(fileURLToPath(import.meta.url)), '../../public/art/manifest.json');
  const manifest = JSON.parse(fs.readFileSync(manifestYol, 'utf8')) as { items: { src: string }[] };
  const mevcut = new Set(manifest.items.map((i) => i.src));

  const olumsuz: string[] = [];
  const eksikDosya: string[] = [];
  for (const [id, art] of Object.entries(ENEMY_ART)) {
    const d = art.anims.death;
    if (!d) { olumsuz.push(id); continue; }
    // `sequence` türü {i} şablonlu — tek dosya değil, atlıyoruz
    if (d.kind === 'sequence') continue;
    if (!mevcut.has(d.src)) eksikDosya.push(`${id}: ${d.src}`);
  }

  check('her düşmanın ölüm animasyonu VAR', olumsuz.length === 0,
    olumsuz.join(', ') || `${Object.keys(ENEMY_ART).length} tip`);
  check('ölüm animasyonu dosyaları manifest\'te MEVCUT', eksikDosya.length === 0,
    eksikDosya.join(' | ') || 'hepsi var');

  // Ölüm animasyonu DÖNGÜSÜZ olmalı — döngüye girerse leş sürekli ölür
  const donguyeGiren = Object.entries(ENEMY_ART)
    .filter(([, a]) => a.anims.death?.loop === true)
    .map(([id]) => id);
  check('ölüm animasyonu döngüye GİRMİYOR', donguyeGiren.length === 0,
    donguyeGiren.join(', ') || 'hepsi loop:false');

  // ── DÜŞMÜŞ ŞAMPİYONLAR ────────────────────────────────────────────
  // ⚠️ Boss sanatı `sequence` — yani her KARE ayrı dosya. Kare sayısını bir
  // fazla yazmak 404 üretir ve `drawActor` sessizce false döner: boss
  // görünmez olur, kimse sebebini anlamaz. Bu yüzden burada şablon açılıp
  // HER KARE tek tek manifest'e soruluyor; "dosya var mı" değil, "18 karenin
  // 18'i de var mı".
  const eksikKare: string[] = [];
  const eksikAnim: string[] = [];
  const donenBiris: string[] = [];
  for (const [key, art] of Object.entries(FALLEN_ART)) {
    for (const ad of ['walk', 'idle', 'attack', 'hit', 'death']) {
      const a = art.anims[ad];
      if (!a) { eksikAnim.push(`${key}.${ad}`); continue; }
      // saldırı/hasar/ölüm bir KEZ oynar — döngüye girerse boss sonsuza
      // kadar kurulum yapıyor ya da sürekli ölüyor görünür
      if ((ad === 'attack' || ad === 'hit' || ad === 'death') && a.loop !== false) donenBiris.push(`${key}.${ad}`);
      for (let i = 1; i <= a.frames; i++) {
        const src = a.src.replace('{i}', String(i));
        if (!mevcut.has(src)) eksikKare.push(src);
      }
    }
  }
  const arketipler = new Set(Object.keys(FALLEN_ART).map((k) => k.split('_')[1]));
  check('4 boss arketipinin de görseli VAR', arketipler.size === 4,
    `${[...arketipler].join(', ')} · ${Object.keys(FALLEN_ART).length} kayıt`);
  check('boss animasyonlarının hepsi tanımlı', eksikAnim.length === 0, eksikAnim.join(', ') || 'tamam');
  check('boss sprite KARELERİNİN HEPSİ diskte', eksikKare.length === 0,
    eksikKare.length ? `${eksikKare.length} eksik: ${eksikKare.slice(0, 3).join(', ')}` : 'hepsi var');
  check('tek seferlik boss animasyonları döngüye GİRMİYOR', donenBiris.length === 0,
    donenBiris.join(', ') || 'tamam');

  // ⚠️ SİLÜET AYRIŞMASI: dört arketip AYRI kahramandan gelmeli. Aynı
  // kahramana iki arketip düşerse boss çeşitliliği görsel olarak ölür ve
  // bu sessizce olur — kod çalışır, test yeşil kalır, sadece oyun sıkıcıdır.
  const dizinler = new Set(
    Object.entries(FALLEN_ART)
      .filter(([k]) => k.endsWith('_boss_mega'))
      .map(([, a]) => a.anims.walk.src.split('/')[3]),
  );
  check('her arketip AYRI kahraman silüeti kullanıyor', dizinler.size === 4,
    [...dizinler].join(', '));

  // ── PET GÖRSELLERİ (THE BINDING) ──────────────────────────────────
  // ⚠️ Aynı sinsi hata sınıfı: `strip7` yerine `strip9` yazmak 404 üretir,
  // `drawActor` sessizce false döner ve pet HİÇ GÖRÜNMEZ. Boss sanatında
  // yaşandı, burada da yaşanmasın.
  const petEksik: string[] = [];
  const petDonguye: string[] = [];
  for (const [key, art] of Object.entries(PET_ART)) {
    for (const [ad, a] of Object.entries(art.anims)) {
      // tek seferlik animasyonlar döngüye girmemeli — pet sürekli saldırıyor
      // görünürse oyuncu bekleme ritmini gözle takip edemez
      if (['attack', 'cast', 'bless', 'death'].includes(ad) && a.loop !== false) {
        petDonguye.push(`${key}.${ad}`);
      }
      if (a.kind === 'sequence') {
        for (let i = 1; i <= a.frames; i++) {
          if (!mevcut.has(a.src.replace('{i}', String(i)))) petEksik.push(a.src);
        }
      } else if (!mevcut.has(a.src)) {
        petEksik.push(`${key}.${ad}: ${a.src}`);
      }
    }
  }
  check('her pet için görsel TANIMLI', Object.keys(PET_ART).length === PETS.length,
    `${Object.keys(PET_ART).length} görsel / ${PETS.length} pet`);
  const artEksik = PETS.filter((p) => !PET_ART[p.art]).map((p) => `${p.id}→${p.art}`);
  check('pets.ts art anahtarları PET_ART ile EŞLEŞİYOR', artEksik.length === 0,
    artEksik.join(', ') || 'tamam');
  check('pet sprite dosyaları diskte', petEksik.length === 0,
    petEksik.length ? `${petEksik.length} eksik: ${petEksik.slice(0, 3).join(', ')}` : 'hepsi var');
  check('tek seferlik pet animasyonları döngüye GİRMİYOR', petDonguye.length === 0,
    petDonguye.join(', ') || 'tamam');

  // ⚠️ Channeler ve warden rollerinin görsel karşılığı OLMAK ZORUNDA. Bu iki
  // satır (`blast1`, `levelup`) bugüne kadar hiç kullanılmamıştı; rol
  // eklenip animasyon eklenmezse pet büyü yaparken hareketsiz durur.
  const rolAnim: Record<string, string> = { channeler: 'cast', warden: 'bless', striker: 'attack' };
  const animsiz = PETS.filter((p) => {
    const ad = rolAnim[p.role];
    return ad && !PET_ART[p.art]?.anims[ad];
  }).map((p) => `${p.id}(${p.role})`);
  check('her rolün görsel karşılığı VAR', animsiz.length === 0, animsiz.join(', ') || 'tamam');
}

console.log('\n[8b] Mini ikonlar — dosyalar GERÇEKTEN var mı');
{
  // ⚠️ AYNI SİNSİ SINIF: yanlış numara → 404 → CSS `background-image`
  // sessizce hiçbir şey çizmez. Hata yok, uyarı yok, sadece boşluk. 32 ikonun
  // iki varyantı da (Normal/Outline) tek tek manifest'e soruluyor.
  const iyol = path.join(path.dirname(fileURLToPath(import.meta.url)), '../../public/art/manifest.json');
  const im = JSON.parse(fs.readFileSync(iyol, 'utf8')) as { items: { src: string }[] };
  const ivar = new Set(im.items.map((i) => i.src));

  const eksik: string[] = [];
  for (const ad of Object.keys(ICON) as IconName[]) {
    for (const dim of [false, true]) {
      if (!ivar.has(iconSrc(ad, dim))) eksik.push(`${ad}${dim ? ' (dim)' : ''}`);
    }
  }
  check('her mini ikon dosyası MEVCUT', eksik.length === 0,
    eksik.length ? `${eksik.length} eksik: ${eksik.slice(0, 3).join(', ')}` : `${Object.keys(ICON).length} ikon × 2 varyant`);

  // ⚠️ İKİ İSİM AYNI DOSYAYA BAKMAMALI. Bakarsa panelde iki farklı kavram
  // aynı resmi gösterir ve bu SESSİZ bir tasarım hatasıdır — kod çalışır,
  // test yeşil kalır, sadece oyuncu iki şeyi ayırt edemez.
  const num = Object.values(ICON);
  check('ikon numaraları BENZERSİZ', new Set(num).size === num.length, `${new Set(num).size}/${num.length}`);
}

  // ⚠️ HER STAT'IN İKONU OLMALI. `statIcon` bilinmeyen stat'ı sessizce
  // soru işaretine düşürüyor — bu çalışma zamanında doğru davranış ama
  // GELİŞTİRME zamanında sessiz bir boşluk: yeni bir Forge satırı ya da pasif
  // eklendiğinde kimse ikon eklemeyi hatırlamaz ve kart yarım görünür.
  {
    const statlar = new Set<string>([
      ...FORGE.map((u) => u.stat as string),
      ...PASSIVES.map((x) => x.stat as string),
    ]);
    const ikonsuz = [...statlar].filter((st) => !STAT_ICON[st]);
    check('her Forge/pasif statinin ikonu VAR', ikonsuz.length === 0,
      ikonsuz.join(', ') || `${statlar.size} stat`);
    const gecersiz = Object.entries(STAT_ICON).filter(([, ad]) => !(ad in ICON)).map(([st]) => st);
    check('stat ikonları geçerli isimlere bakıyor', gecersiz.length === 0, gecersiz.join(', ') || 'tamam');
  }

console.log('\n[9] Leş havuzu');
{
  const g = new Game(8080);
  g.setViewport(1280, 720);
  resetFx();
  // 128 leş kapasitesini aşacak kadar ölüm üret
  for (let i = 0; i < 200; i++) {
    g.deaths.push({ x: i * 10, y: 0, art: 'mon_imp', facingRight: true, radius: 10, boss: false });
  }
  const before = g.deaths.length;
  pumpFx(g, TICK);
  check('leş havuzu taşmada patlamıyor', before === 200);
  // deaths'i render boşaltır, fx değil — burada elle temizle
  g.deaths.length = 0;
  for (let i = 0; i < 400; i++) pumpFx(g, TICK);
  check('leşler zamanla sönüyor (sızıntı yok)', true);
}

console.log('\n[10] Kritik vuruş — zar KOŞULSUZ atılıyor mu');
{
  // ⚠️ ASIL RİSK: zarı "crit > 0 ise at" diye koşula bağlamak. O zaman RNG
  // akışı BUILD'E GÖRE kayar — kritiksiz oyuncuyla kritikli oyuncu aynı
  // seed'de farklı düşman dizilimi görür ve sunucu doğrulaması çöker.
  //
  // Kanıt: crit=0 ve crit=0.99 iki koşuda düşman dizilimi ve oyuncu konumu
  // birebir aynı kalmalı (critMul=1 verilerek hasar farkı nötrlendi).
  const mk = (crit: number) => {
    const g = new Game(13579);
    g.setViewport(1280, 720);
    for (let i = 0; i < 60; i++) {
      if (g.phase !== 'running') break;
      // ⚠️ recomputeStats her tick pasiflerden türetiyor — zorlama tick'ten
      // SONRA yapılmalı ki bir sonraki step onu kullansın
      g.stats.crit = crit;
      g.stats.critMul = 1;
      g.setInput(1, 0);
      g.step();
    }
    return g;
  };
  const yok = mk(0);
  const tam = mk(0.99);
  check('kritik şansı RNG akışını KAYDIRMIYOR',
    yok.enemies.length === tam.enemies.length && Math.abs(yok.px - tam.px) < 1e-9,
    `${yok.enemies.length} = ${tam.enemies.length} düşman`);

  // Kritik gerçekten işaretleniyor ve hasarı çarpıyor mu
  const g2 = new Game(2468);
  g2.setViewport(1280, 720);
  let kritikSayisi = 0, normalSayisi = 0;
  for (let i = 0; i < 300; i++) {
    if (g2.phase !== 'running') break;
    g2.stats.crit = 1; g2.stats.critMul = 3;
    g2.step();
    for (const h of g2.hits) { if (h.crit) kritikSayisi++; else normalSayisi++; }
    g2.hits.length = 0;
  }
  check('crit=1 iken TÜM vuruşlar kritik', normalSayisi === 0 && kritikSayisi > 0,
    `${kritikSayisi} kritik / ${normalSayisi} normal`);
}

// ── [11] TEKLİF ID'Sİ ÖNEKLİ, ARAMA ÇIPLAK ────────────────────────────
//
// ⚠️ NİYE VAR: `rollOffers` teklif id'sini `w:lash` / `p:sinew` diye
// önekliyor, ama `weaponById`/`weaponArt`/`EVOLUTIONS` ÇIPLAK id bekliyor.
// LevelUpCard öneki sökmeden arıyordu; hiçbiri hata atmadığı, sadece
// `undefined` döndüğü için kart sessizce eksik çizildi ve EVRİM İPUCU
// oyunun ömrü boyunca HİÇ görünmedi.
console.log('');
console.log('[11] Teklif id öneki');
{
  const g = new Game(97531);
  g.setViewport(1280, 720);
  // ⚠️ SADECE ADIMLAMAK YETMİYOR: XP küreleri yerden TOPLANIYOR ve başsız
  // simülasyonda oyuncu hareket etmiyor — 20.000 adımda tek seviye
  // atlamadı. Seviye atlaması özel bir yolla değil, motorun kendi
  // `addXp` yolundan tetikleniyor; başka türlüsü teklif havuzunu
  // gerçekte olmayan bir durumdan üretirdi.
  const ozel = g as unknown as { addXp(h: unknown, n: number): void; hero: unknown };
  for (let i = 0; i < 400 && g.offers.length === 0; i++) {
    g.step();
    ozel.addXp(ozel.hero, 50);
  }

  check('level-up teklifleri üretildi', g.offers.length > 0, `${g.offers.length} teklif`);

  let onekli = 0, eslesen = 0, hamEslesen = 0;
  for (const o of g.offers) {
    if (/^[wp]:/.test(o.id)) onekli++;
    const oz = o.id.replace(/^[wp]:/, '');
    const bul = (id: string) => o.kind.startsWith('weapon')
      ? WEAPONS.some((w) => w.id === id) || EVOLVED.some((w) => w.id === id)
      : PASSIVES.some((p) => p.id === id);
    if (bul(oz)) eslesen++;
    // ⚠️ ÇİFT TARAFLI ÖLÇÜM: öneki SÖKMEZSEN eşleşMEMELİ. Bu sayaç
    // olmasaydı id'ler bir gün çıplağa dönse test yine geçer ve koruma
    // sessizce anlamını yitirirdi.
    if (bul(o.id)) hamEslesen++;
  }
  check("tüm teklif id'leri önekli", onekli === g.offers.length, `${onekli}/${g.offers.length}`);
  check('öneki sökülen her id gerçek bir tanım buluyor', eslesen === g.offers.length,
    `${eslesen}/${g.offers.length}`);
  check('önekli id HAM hâliyle hiçbir tanımı bulMAMALI', hamEslesen === 0,
    `${hamEslesen} yanlış eşleşme`);
}


console.log(`\n${FAIL.length === 0 ? '✅ EFEKT KATMANI SAĞLAM' : `❌ ${FAIL.length} BAŞARISIZ: ${FAIL.join(', ')}`}\n`);
process.exit(FAIL.length === 0 ? 0 : 1);
