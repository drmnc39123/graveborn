// RIHTIM ROZETLERİ MÜHRÜ.
//
// 🔴 NİYE VAR: rozet, oyuncuyu bir yere GÖNDERİYOR. Gidip bir şey alamazsa
// rozet yalan söylemiş olur ve oyuncu hiçbirine bir daha güvenmez. Bu mühür
// "rozet ancak gerçekten yapılabilir bir iş varken yanar" kuralını ölçüyor.
//
//   cd frontend && npx tsx src/game/rozet.test.mts

import fs from 'node:fs';
import { dockRozetleri, forgeAlinabilir, grupRozeti, streakAlinabilir } from './rozet.js';
import { FORGE, costOf } from './forge.js';
import { emptyProgress, type Progress } from './progress.js';

const FAIL: string[] = [];
const check = (n: string, ok: boolean, d = '') => {
  console.log(`${ok ? '  ✓' : '  ✗'} ${n}${d ? ` — ${d}` : ''}`);
  if (!ok) FAIL.push(n);
};
const oku = (f: string) => fs.readFileSync(new URL(f, import.meta.url), 'utf8');
const yorumsuz = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

const GUN = '2026-09-20';
const dun = '2026-09-19';
const taze = (): Progress => ({ ...emptyProgress(), gold: 0 });

console.log('\n=== RIHTIM ROZETLERI ===');

console.log('\n[1] ** PARASI YETMEYEN FORGE ROZET YAKMIYOR');
{
  const p = taze();
  const enUcuz = Math.min(...FORGE.map((u) => costOf(u, 0)));
  p.gold = enUcuz - 1;
  check('en ucuz yukseltmenin ALTINDA rozet yok', !forgeAlinabilir(p), `${p.gold} < ${enUcuz}`);
  p.gold = enUcuz;
  check('tam yetince rozet var (kontrol grubu)', forgeAlinabilir(p), `${p.gold} = ${enUcuz}`);

  // ⚠️ Tavana gelmiş hat "alınabilir" sayılmamalı
  // ⚠️ GOLD SINIRSIZ: eskiden 10M yazıyordu ve kontrol YANLIŞ SEBEPTEN
  // geçiyordu — tavan kuralı silinse bile en üst seviyenin fiyatı 10M'u
  // aşıyor, yani rozet yine yanmıyordu. Hata enjeksiyonu bunu ortaya
  // çıkardı: mühür, ölçtüğünü sandığı şeyi ölçmüyordu.
  const hepsiTavan = taze();
  hepsiTavan.gold = Number.MAX_SAFE_INTEGER;
  for (const u of FORGE) hepsiTavan.upgrades[u.id] = u.maxLevel;
  check('tum hatlar tavandayken rozet yok', !forgeAlinabilir(hepsiTavan), 'gold sinirsiz');
}

console.log('\n[2] ** STREAK: BUGUN ALINDIYSA ROZET YOK');
{
  const p = taze();
  p.streak = { days: 3, last: dun };
  check('dun alinmis → bugun alinabilir', streakAlinabilir(p, GUN));
  p.streak = { days: 4, last: GUN };
  check('bugun alinmis → rozet yok', !streakAlinabilir(p, GUN));
}

console.log('\n[3] ** GOREV ROZETI SUNUCUNUN SAYISINDAN');
{
  const p = taze();
  check('alinabilir 0 → rozet yok',
    !dockRozetleri({ progress: p, ozet: { quests: { claimable: 0 } }, gun: GUN }).daily);
  check('alinabilir 2 → rozet var',
    dockRozetleri({ progress: p, ozet: { quests: { claimable: 2 } }, gun: GUN }).daily);
  // Demo: sunucu özeti yok — rozet de yok (uydurma yasak)
  check('ozet yokken (demo) gorev rozeti yok',
    !dockRozetleri({ progress: p, ozet: null, gun: GUN }).daily);
  check('progress yokken hic rozet yok',
    Object.values(dockRozetleri({ progress: null, ozet: null, gun: GUN })).every((v) => !v));
}

console.log('\n[4] ** GRUP CIPI UYESINDEN MIRAS ALIYOR');
{
  const r = { upgrade: true, daily: false, tavern: false };
  check('uyesi isaretliyse grup isaretli', grupRozeti(['upgrade', 'paths'], r));
  check('uyesi yoksa grup temiz (kontrol grubu)', !grupRozeti(['paths', 'gear'], r));
}

console.log('\n[5] ** RIHTIM BUNU CIZIYOR');
{
  const dock = yorumsuz(oku('../components/BuildingDock.tsx'));
  const play = yorumsuz(oku('../app/play/page.tsx'));
  check('bina dugmesinde nokta', /\{rozetler\[id\] && <Nokta \/>\}/.test(dock));
  // ⚠️ Alt satır YALNIZ açık grubu gösteriyor — kapalı gruptaki rozet
  // başka türlü görünmezdi
  check('kapali grup cipinde nokta',
    /acikGrup\?\.id !== g\.id && grupRozeti\(g\.members, rozetler\)/.test(dock));
  check('sayfa rozetleri saf fonksiyondan turetiyor',
    /dockRozetleri\(\{ progress, ozet, gun: utcDay\(new Date\(\)\) \}\)/.test(play));
  // 🔴 Yeni istek YASAK: rozet için ayrı bir fetch eklenirse köy her açılışta
  // fazladan ağ trafiği üretir
  check('rozet icin yeni fetch yok', !/rozet[A-Za-z]*\s*=\s*await|fetchRozet/.test(play));
}

console.log('\n[6] ** TELEFONDA KAPALI CEKMECE BILGI SAKLAMIYOR');
{
  /**
   * 🔴 Kullanıcı kararı: telefonda sağ kolon kartları varsayılan KAPALI bir
   * çekmecede. Haftalık boss kaçırılırsa bir daha o boss gelmiyor — kapalı
   * çekmece bunu saklamamalı.
   */
  const cek = yorumsuz(oku('../components/KartCekmece.tsx'));
  const kart = yorumsuz(oku('../components/HudKartlari.tsx'));
  const play = yorumsuz(oku('../app/play/page.tsx'));
  check('cekmece sekmesinde nokta', /\{nokta && !acik && \(/.test(cek));
  check('acikken nokta YOK (kontrol grubu)', /!acik/.test(cek));
  check('sinyal: bu hafta boss\'a vurmadin',
    /!b\.defeated && b\.hp > 0 && \(b\.me\?\.damage \?\? 0\) === 0/.test(kart));
  // ⚠️ Cüzdansız oyuncu boss'a vuramaz — yapılamayacak işe çağırmak yalan
  check('cuzdansizda rozet yanmiyor', /if \(!worldBossAvailable\(\)\) return;/.test(kart));
  // ⚠️ Aynı 60 sn önbellekten — ikinci istek açılmamalı
  check('yeni istek acilmiyor (ayni onbellek)', /bossOku\(\)/.test(kart)
    && (kart.match(/fetchWorldBoss\(/g) ?? []).length === 1);
  check('sayfa cekmeceye sinyali veriyor', /nokta=\{bossVurulmadi\}/.test(play));
}

console.log('\n[7] ** KOYDE KAC KISI VAR — SUNUCUDAN, AYRI ISTEK YOK');
{
  const pres = yorumsuz(fs.readFileSync(
    new URL('../../../backend/src/presence.ts', import.meta.url), 'utf8'));
  const chat = yorumsuz(oku('../lib/chat.ts'));
  const panel = yorumsuz(oku('../components/ChatPanel.tsx'));
  check('sunucu sayiyi YAYINA koyuyor', /t: 'peers', peers: others, n: koyToplam/.test(pres));
  check('sayi hucre listesinden DEGIL, toplamdan', /const koyToplam = list\.length;/.test(pres));
  check('istemci okuyor', /if \(typeof m\.n === 'number'\) handle\.koydeki = m\.n;/.test(chat));
  check('sohbet basliginda gorunuyor', /\{koydeki\} here/.test(panel));
  // 🔴 Yeni uç/istek yasak: 5 Hz'lik kanal zaten var
  check('yeni fetch yok', !/fetch\(.*square|\/square\/count/.test(chat + panel));
}

if (FAIL.length) { console.log(`\n${FAIL.length} BASARISIZ: ${FAIL.join(', ')}`); process.exit(1); }
console.log('\nRIHTIM ROZETLERI SAGLAM');
