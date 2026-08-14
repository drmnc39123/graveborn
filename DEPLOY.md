# GRAVEBORN — dağıtım

Bu dosya "nasıl yayına alınır"ı değil, **hangi kararların neden böyle
olduğunu** anlatır. Komutlar zaten `package.json`'da.

---

## ⚠️ SUNUCU DURUM TUTUYOR — serverless YETMEZ

Canlı boss odası `ws` (WebSocket) ile çalışıyor ve bağlantı listesi
**süreçte, bellekte** duruyor (`backend/src/presence.ts`). Bu bilinçli:
konum verisi saniyede 8 kez değişiyor ve KALICI DEĞİL, her yazımı diske
indirmek anlamsız yük olurdu.

Sonucu şu: backend **uzun ömürlü tek bir süreçte** koşmalı.
- ✅ Railway / Render / Fly / kendi VPS'in — olur.
- ❌ Vercel Functions, Lambda, Cloudflare Workers — olmaz. Serverless'ta
  her istek başka bir örneğe düşer, WebSocket odası her seferinde boşalır.

Frontend (Next.js) tarafında böyle bir kısıt YOK — Vercel'e gider.

**Birden fazla backend örneği çalıştırılacaksa:** boss odası örnek başına
ayrışır (A örneğindeki oyuncu B'dekini görmez). Hasar ve ödül DOĞRU kalır
(onlar Postgres'te), sadece hayaletler bölünür. Tek örnekle başla; ölçek
gerekirse `presence` bir pub/sub'a taşınmalı, önce değil.

---

## ⚠️ BACKEND'İN DEPLOY KÖKÜ `backend/` DEĞİL, **DEPONUN KÖKÜ**

En kolay yapılan hata ve ÖLÇÜLDÜ, tahmin değil. `backend/` klasörü tek
başına kopyalanıp çalıştırıldığında sunucu açılışta ölüyor:

```
Error [ERR_MODULE_NOT_FOUND]: Cannot find package '@game/heroes'
    imported from .../backend/src/db.ts
```

Sebep: backend oyun mantığını frontend'den içe aktarıyor
(`@game/* → ../frontend/src/game/*`, bkz. `backend/tsconfig.json`). Bu
bilinçli — ekonomi kuralını iki yerde yazmak er ya da geç iki yerde
ayrışmak demek ve **ayrışan taraf para basar**. Bedeli de bu: backend
yalnız başına taşınamaz.

⚠️ Hata mesajı deploy'u yapan kişiye hiçbir şey anlatmıyor; eksik bir npm
paketi sanılıp `npm i @game/heroes` denenir. Bu yüzden `start:prod` artık
önce `preflight.mjs` çalıştırıyor ve yanlış kökte açık bir cümleyle duruyor.
(Kontrol `index.ts`'in içine KONULAMAZ: import çözümlemesi kodun ilk satırı
çalışmadan önce yapılıyor, oradaki hiçbir guard'a sıra gelmez.)

**Barındırıcı ayarı:**

| Alan | Değer |
|---|---|
| Root Directory | `.` — deponun kökü, **`backend` DEĞİL** |
| Build Command | `cd backend && npm ci && npm run build` |
| Start Command | `cd backend && npm run start:prod` |

Frontend tarafında böyle bir kısıt YOK: Vercel'in Root Directory'si
`frontend` olabilir (ve olmalı).

⚠️ `frontend/node_modules` backend için GEREKMİYOR — `@game/*` modülleri saf
TypeScript, dışarıdan hiçbir şey içe aktarmıyor ve `tsx` onları doğrudan
çeviriyor. Kurulması gereken tek şey `backend/node_modules`.

---

## ⚠️ `prisma` ve `tsx` ÇALIŞMA ZAMANI BAĞIMLILIĞI — devDependencies DEĞİL

Bir derleme adımı YOK: `tsx` TypeScript'i doğrudan koşturuyor. Yani
`start:prod` (`prisma migrate deploy && tsx src/index.ts`) üretimde bu iki
ikiliye İHTİYAÇ DUYUYOR. `devDependencies`'te bırakılsalardı, üretim
kurulumunda devDependencies'i atlayan bir barındırıcıda sunucu
`tsx: not found` ile hiç açılmazdı.

İkisi de `dependencies` altına taşındı. `package.json` yorum kabul etmediği
için gerekçe burada duruyor — oraya geri taşımayın.

---

## ⚠️ VERİTABANI: `migrate deploy`, `db push` DEĞİL

Depoda artık bir migration geçmişi var (`prisma/migrations/`). Üretimde
**`prisma migrate deploy`** çalıştırılır (`start:prod` bunu yapıyor).

`prisma db push` üretimde ASLA kullanılmamalı. Kardeş projede tam bu yüzden
bir kesinti yaşandı: başlangıç komutu `db push --accept-data-loss`
çalıştırıyordu, şemaya yeni bir `@unique` kolon eklendi ve komut
etkileşimsiz ortamda "veri kaybı" diye kendini durdurup üretimi çökertti.

`0_baseline` migration'ı mevcut şemanın tamamını içeriyor. Var olan bir
veritabanına ilk kez bağlanırken (tablolar zaten duruyorsa):

```bash
npx prisma migrate resolve --applied 0_baseline
```

Bundan sonra her şema değişikliği `npm run db:migrate` ile yeni bir
migration üretir; üretim onu `migrate deploy` ile uygular.

---

## Ortam değişkenleri

### backend
| Değişken | Zorunlu | Not |
|---|---|---|
| `DATABASE_URL` | ✅ | Postgres bağlantısı |
| `SESSION_SECRET` | ✅ | Oturum jetonu HMAC'i. **Değişirse tüm oturumlar düşer.** |
| `CORS_ORIGIN` | ✅ | Frontend origin'i, virgülle çoklu. Varsayılan `http://localhost:3200` |
| `ADMIN_SECRET` | ⚠️ | **Yoksa admin uçları 403 döner** — yani boş bırakmak güvenli taraf. |
| `PORT` | — | Barındırıcı verir |
| `TURNSTILE_SECRET` | — | Yoksa bot kontrolü atlanır |
| `TOKEN_MINT` | — | $GRAVE henüz yok; boşken marketplace token bacağı 503 döner |

### frontend
| Değişken | Zorunlu | Not |
|---|---|---|
| `NEXT_PUBLIC_API_URL` | ✅ | Backend'in tam adresi |
| `NEXT_PUBLIC_TURNSTILE_SITE_KEY` | — | Yoksa widget hiç çizilmez |

### ⚠️ `NEXT_PUBLIC_API_URL` DERLEME ANINDA GÖMÜLÜYOR — çalışma anında DEĞİL

Ölçüldü, tahmin değil: üretim derlemesinden sonra

```bash
grep -rl "localhost:4100" .next/static/chunks/
```

**3 ayrı JS parçasında** bulunuyor. Yani değer, tarayıcıya inen paketin
İÇİNE yazılıyor.

Sonucu iki maddede:
- Vercel'de bu değişken **derlemeden ÖNCE** tanımlı olmalı. Sonradan
  eklenirse mevcut derleme onu GÖRMEZ.
- Backend adresi değişirse env'i güncellemek YETMEZ, **yeniden derlemek**
  şart. "Değişkeni değiştirdim ama hâlâ eski adrese gidiyor" şikâyetinin
  tamamı budur.

⚠️ Değişken hiç verilmezse kod `http://localhost:4100`e düşüyor — yani
canlı site sessizce oyuncunun KENDİ bilgisayarına istek atar ve her panel
boş kalır. Yanlış değer, eksik değerden daha görünür bir hata verir.

### ⚠️ CORS YANLIŞSA OYUN "ÇALIŞIYOR" GİBİ GÖRÜNÜR — asıl tehlike bu

Üretim derlemesi 3201'de, backend `CORS_ORIGIN` 3200'de koşarken ölçüldü.
Sonuç: köy açıldı, karakter yürüdü, paneller açıldı — **ama etkinlik
şeridi, sıralama, dünya boss'u ve istatistikler sessizce YOKTU.** Ekranda
tek bir hata mesajı bile çıkmadı, çünkü bu uçların hepsi hatayı bilerek
yutuyor (boş bir kırmızı kutu göstermek işe yaramaz).

Konsolda görünen tek iz:

```
Access to fetch at 'http://.../events' from origin '...' has been blocked
by CORS policy: No 'Access-Control-Allow-Origin' header is present
```

⚠️ Bu yüzden aşağıdaki doğrulama adımı "ana sayfa açılıyor mu" ile
BİTMEZ: **sunucudan veri çeken bir yüzey de görülmeli.** En hızlısı köyün
üstündeki etkinlik şeridi — görünüyorsa CORS ve API adresi doğrudur.

⚠️ `CORS_ORIGIN` virgülle çoklu değer alıyor. Vercel önizleme
dağıtımları her seferinde AYRI bir alan adı üretir; yalnız üretim alan
adı yazılıysa önizlemeler bu sessiz hâlde açılır.

⚠️ `SESSION_SECRET` ve `ADMIN_SECRET` **rastgele üretilmeli** ve depoya
girmemeli:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

---

## Sıra

1. Postgres oluştur → `DATABASE_URL`'i backend'e ver.
2. Backend'i deploy et. **Root Directory `.`** (yukarıdaki uyarı), başlangıç
   komutu `cd backend && npm run start:prod`
   (önce preflight, sonra `migrate deploy`, sonra sunucu).
3. `CORS_ORIGIN`'i frontend adresine ayarla.
4. Frontend'i Vercel'e deploy et, `NEXT_PUBLIC_API_URL` = backend adresi.
5. Doğrula — **sırayla ve hepsini**:
   - `GET /health` → `{ok:true}`
   - Ana sayfa açılıyor, demo modu oynanıyor, cüzdanla giriş yapılıyor
   - ⭐ **Köyün üstünde etkinlik şeridi görünüyor.** Görünmüyorsa CORS ya
     da `NEXT_PUBLIC_API_URL` yanlıştır (yukarıdaki iki uyarı) — oyunun
     geri kalanı çalışıyor gibi görünmeye devam eder, o yüzden bu adım
     atlanamaz.
   - Tarayıcı konsolunda CORS hatası YOK

---

---

## Üretim derlemesi — ölçülmüş durum (2026-08-14)

Deploy'dan önce lokalde uçtan uca koşturuldu, sonuç:

| Kontrol | Sonuç |
|---|---|
| `next build` | ✅ temiz — 5 yol, `/play` 204 kB ilk yük |
| `next start` altında koşuyor mu | ✅ köy açılıyor, demo oynanıyor |
| Varlık 404'ü | ✅ **sıfır** (ağ kaydından, 250+ istek) |
| Test modu üretimde kapalı mı | ✅ `window.__gbKare` tanımsız — ölü kod atılmış |
| `prisma generate` | ✅ |
| `preflight.mjs` yanlış kökte duruyor mu | ✅ çıkış kodu 1 + okunur mesaj |
| Migration durumu | ✅ senkron |
| API uçları (`/health` `/events` `/worldboss` `/leaderboard` `/stats`) | ✅ 200 |

⚠️ Varlık 404'ü `performance.getEntriesByType('resource')` ile ölçülemez:
tampon **250 kayıtta doluyor** ve `/play` 243 varlık yüklüyor — sonrası
sessizce düşer, "0 hata" yanıltıcı çıkar. Ölçüm tarayıcının ağ kaydından
alındı.

⚠️ Bu bir LOKAL doğrulama. Vercel/Railway'de tekrar edilmesi gereken tek
şey yukarıdaki 5. adımdır.

---

## ⚠️ Yayına çıkmadan önce kapatılacaklar

- [ ] **Depo herkese açık** → `reward.ts` ve `worldBoss.ts` içindeki
      anti-hile tavanları OKUNABİLİR. Tavanlar yapısal (okumak onları
      aşmaya yetmez) ama bilerek yayınlandığı unutulmasın.
