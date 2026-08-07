// AÇILIŞ ÖNCESİ KONTROL — kriptik bir çökmeyi okunur bir cümleye çevirir.
//
// NİYE VAR: backend, oyun mantığını frontend'den içe aktarıyor
// (`@game/* → ../frontend/src/game/*`, bkz. tsconfig.json). Bu bilinçli bir
// karar — ekonomi kuralını iki yerde yazmak, er ya da geç iki yerde ayrışmak
// demek ve ayrışan taraf para basar.
//
// AMA BUNUN BİR DEPLOY BEDELİ VAR ve ölçüldü: `backend/` klasörü TEK BAŞINA
// kopyalanıp çalıştırıldığında sunucu açılışta ölüyor:
//
//     Error [ERR_MODULE_NOT_FOUND]: Cannot find package '@game/heroes'
//
// Bu mesaj, deploy'u yapan kişiye hiçbir şey anlatmıyor: eksik olan bir npm
// paketi sanılır, `npm i @game/heroes` denenir, bulunamaz. Oysa sorun tek
// cümle — **barındırıcının kök dizini `backend/` değil, DEPONUN KÖKÜ olmalı.**
//
// ⚠️ Bu kontrol `index.ts`'in İÇİNE konulamaz: import çözümlemesi kodun ilk
// satırı çalışmadan ÖNCE yapılıyor, yani oradaki hiçbir guard'a sıra gelmez.
// Bu yüzden ayrı bir süreç olarak, sunucudan önce koşuyor.

import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const burasi = dirname(fileURLToPath(import.meta.url));
// tsconfig'deki `@game/*` eşlemesinin işaret ettiği yer — tek kaynak orası,
// burası sadece VAR MI diye bakıyor.
const oyunDizini = resolve(burasi, '../frontend/src/game');

if (!existsSync(oyunDizini)) {
  console.error(`
╔══════════════════════════════════════════════════════════════════════╗
║  GRAVEBORN BACKEND BAŞLATILAMADI — YANLIŞ DEPLOY KÖKÜ                ║
╚══════════════════════════════════════════════════════════════════════╝

Aranan  : ${oyunDizini}
Bulunan : yok

Backend, oyun mantığını frontend'den içe aktarıyor (@game/* →
../frontend/src/game/*). Bu yüzden barındırıcının kök dizini "backend"
DEĞİL, DEPONUN KÖKÜ olmalı.

Railway / Render / Fly ayarı:
    Root Directory : .            (deponun kökü, "backend" DEĞİL)
    Build Command  : cd backend && npm ci && npm run build
    Start Command  : cd backend && npm run start:prod

Ayrıntı: DEPLOY.md
`);
  process.exit(1);
}
