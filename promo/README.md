# GRAVEBORN — tanıtım videosu

| Dosya | Ne için |
|---|---|
| **`out/graveborn-trailer-x.mp4`** | **X'e yüklenecek olan.** 75 MB · 8,2 Mbit/sn · yuv420p (tv aralığı, bt709) · faststart. |
| `out/graveborn-trailer.mp4` | Remotion ham çıktısı. 153 MB · CRF 17 · yuvj420p. Arşiv/yeniden kodlama için. |

1920×1080 · 30 fps · 71,6 sn · sesli.

⚠️ **Ham çıktı doğrudan yüklenmemeli.** 153 MB gereksiz büyük ve daha
önemlisi TAM ARALIK (`yuvj420p`) etiketli — bazı oynatıcılarda renkler
kayıyor. Teslim kodlaması aralığı sınırlıya çevirip bt709 etiketliyor,
`faststart` ile ilk kareyi anında açıyor ve `tune=animation` ile piksel
sanatın keskin kenarlarını koruyor:

```bash
cd C:\graveborn\promo\out && ffmpeg -y -i graveborn-trailer.mp4 -vf "scale=in_range=full:out_range=limited,format=yuv420p" -c:v libx264 -profile:v high -level 4.2 -preset slow -crf 19 -tune animation -color_primaries bt709 -color_trc bt709 -colorspace bt709 -movflags +faststart -c:a aac -b:a 192k -ar 48000 graveborn-trailer-x.mp4
```

**Videodaki her görüntü gerçek oyun.** Dövüş planları oyunun kendi motorundan
yakalandı, panel görüntüleri oyunun kendi ekranlarının fotoğrafı, müzik
oyunun kendi prosedürel müziği. Videoya özel çizilmiş tek bir oyun görseli
yok — bu dosyada üretilen şey yalnızca yazı, çerçeve, geçiş ve kurgu.

---

## Yeniden üretmek

Üçü de aynı anda açık olmalı:

```bash
cd C:\graveborn\promo && node tools/sink.mjs
```
```bash
cd C:\graveborn\frontend && npx next dev -p 3200
```

Sonra sırayla:

```bash
cd C:\graveborn\promo && node tools/capture.mjs
```
```bash
cd C:\graveborn\promo && node tools/shots.mjs
```
```bash
cd C:\graveborn\promo && npx remotion render src/index.ts Trailer out/graveborn-trailer.mp4 --browser-executable="C:/Program Files/Google/Chrome/Application/chrome.exe" --concurrency=3
```

Müzik yeniden kaydedilecekse (73 sn gerçek zaman) `node tools/capture.mjs music`
ve ardından **normalizasyon şart**:

```bash
cd C:\graveborn\promo\public\audio && ffmpeg -y -i music.webm -t 71.533 -af "loudnorm=I=-15:TP=-1.5:LRA=11,afade=t=in:st=0:d=0.8,afade=t=out:st=69.5:d=2.0" -ar 48000 -ac 2 music.wav
```

---

## Parçalar

| Yol | İş |
|---|---|
| `frontend/src/app/capture/page.tsx` | Oyunu sabit adımla sürüp her kareyi POST eden tezgâh. **Üretimde derlenmiyor.** |
| `tools/sink.mjs` | Kareleri ve sesi diske yazan yerel sunucu (7788). |
| `tools/capture.mjs` | Sahne listesi + başsız Chrome sürücüsü. Kurgunun ham malzemesi burada tanımlı. |
| `tools/shots.mjs` | Panel fotoğrafları (`/play?test=1&panel=<id>`). |
| `tools/demoSave.mjs` | Panelleri DOLU göstermek için demo kaydı. |
| `tools/counts.mts` | Videodaki sayıların kaynağı. |
| `src/Trailer.tsx` | Kurgu: sahne tablosu, süreler, metinler. |

---

## Kararlar ve ölçümler

Aşağıdakilerin hepsi denenip **ölçülerek** bu hâle geldi. Değiştirmeden önce
sebebini okuyun.

- **Kareler WebP, JPEG değil.** Oyun piksel sanat; JPEG keskin kenarda halka
  üretip sprite'ların çevresini kirletiyor. PNG temiz ama 1.400 karede
  ~2,5 GB.
- **Yakalama React StrictMode'a takıldı.** İlk sürümde nöbet `useRef` idi ve
  temizleyici iptal bayrağını kaldırıyordu: döngü **sıfır kez** döndü, sayfa
  yine de "bitti" dedi, sürücü `✓ 0/6 kare` yazdı. Alet başarılı görünüp
  hiçbir şey üretmedi.
- **Boss'un doğması, görünmesi değil.** Boss doğum halkasında (ekranın hemen
  dışında) beliriyor; ilk boss çekiminde 150 karenin hiçbirinde boss yoktu,
  yalnız darbe telgrafı görünüyordu. Artık YAKINLIK bekleniyor.
- **Panel fotoğrafları oturum ister.** `?test=1` panel kilidini açıyor ama
  oyuncuya bir MOD vermiyor; oturumsuz gidince "CONNECT WALLET" ekranı
  çıkıyor. Bir tur bu yüzden **16 fotoğrafın 16'sını da yanlış çekti** ve yine
  16 kez "✓" yazdı. Artık oturum `addInitScript` ile kuruluyor ve her
  fotoğraf çekimden önce doğrulanıyor.
- **Sayılar `grep` ile tahmin edilmişti ve 3-6 kat şişikti** (58 silah → 10).
  Artık `tools/counts.mts` oyunun dizilerini sayıyor.
- **Üç iddia yayına gitmeden yakalandı.** "Four weapons" yazıyordu,
  `MAX_WEAPONS` **6**. "Nineteen doors" yazıyordu, haritada **17** kapı var
  (kalan iki işaret portal ve yol). "Every stage ends with a boss" yazıyordu,
  1. ve 2. bölümde boss **yok**.
- **Plan aralığı sessizce sarıyordu.** `Plan` kare indeksini `%` ile sarıyor
  (kısa klip uzun sahnede DONMASIN diye) — ama dört sahne klipten uzundu ve
  arka plan sahnenin ortasında başka bir yere zıplıyordu. Hiçbir hata
  çıkmıyordu, çünkü `%` her zaman geçerli bir kare üretir. Artık sarma
  açıkça istenmediyse **render duruyor**; kural hatalı değerle geri konup
  kırmızıya döndüğü doğrulandı.
- **Etiketler panelin başlığını tekrar ediyordu**; kare 1070'te "Permanent
  power" aynı karede iki kez görünüyordu. Panel adını kendi söylüyor, etiket
  iddiayı söylüyor.
- **Font iki kez render'ı düşürdü.** Önce `staticFile` ile ağdan (kare 239),
  sonra gömülü hâlde `delayRender` emniyet saatiyle (kare 505 — sekme donduğu
  için `setTimeout` bile ateşlenmedi). Çözüm: bekleme yok, `data:` URI +
  `<style>`.
- **Müzik ham hâlde pratikte sessizdi** (-44 dB ortalama). Oyunun içindeki
  seviye doğru, videodaki değil; `loudnorm` ile -15 LUFS'a çekiliyor.
- **BETA planının kadrajı değiştirildi:** köyün mor karanlık portalı
  (`spr_dark_portal_strip7.png`) kahraman planının içindeydi ve deponun
  "mor yok" kuralıyla çelişiyordu.

## Dikey (9:16) sürüm

**Bilerek yapılmadı.** Aynı kurguyu 9:16'ya sığdırmanın ucuz yolu videoyu
bantlar arasına küçültmek; o da "yeniden paylaşılmış" görünür. Gerçekten
istenirse ayrı bir kurgu gerekir: etiketler ortada, planlar dikey kırpılmış.
