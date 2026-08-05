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

⚠️ `SESSION_SECRET` ve `ADMIN_SECRET` **rastgele üretilmeli** ve depoya
girmemeli:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

---

## Sıra

1. Postgres oluştur → `DATABASE_URL`'i backend'e ver.
2. Backend'i deploy et. Başlangıç komutu: `npm run start:prod`
   (önce `migrate deploy`, sonra sunucu).
3. `CORS_ORIGIN`'i frontend adresine ayarla.
4. Frontend'i Vercel'e deploy et, `NEXT_PUBLIC_API_URL` = backend adresi.
5. Doğrula: `GET /health` → `{ok:true}`, ana sayfa açılıyor, demo modu
   oynanıyor, cüzdanla giriş yapılıyor.

---

## ⚠️ Yayına çıkmadan önce kapatılacaklar

- [ ] **Depo herkese açık** → `reward.ts` ve `worldBoss.ts` içindeki
      anti-hile tavanları OKUNABİLİR. Tavanlar yapısal (okumak onları
      aşmaya yetmez) ama bilerek yayınlandığı unutulmasın.
