# Art Asset Attribution & Licenses

Bu klasördeki tüm görseller üçüncü taraf paketlerden geliyor. **Her paket için lisans burada
kayıtlı olmalı** — asset eklerken bu dosyayı güncelle. Ticari bir oyun çıkarıyoruz;
lisansı belirsiz tek bir dosya bile sonradan takedown riski demek.

Kaynak: 2026-07-30'da satın alınan Unity survivors-like şablonu (`Vampire Survivors.zip`, $20).
Not: Şablonun klasör adı "Vampire Survivors" — bu sadece yapanın verdiği isim.
İçindeki asset'lerin **hiçbiri** gerçek Vampire Survivors oyunundan sökülmüş değil,
hepsi bağımsız asset paketleri. Doğrulandı.

---

## ✅ Lisansı doğrulanmış

### `tiles/` — RF_Catacombs v1.0
- **Sanatçı:** Szadi art
- **Lisans:** *"Public domain and free to use, personal or commercial. Credit is not required but appreciated. You can edit, but not resell the asset pack (original or changed)."*
- **Durum:** Ticari kullanım SERBEST. Yeniden satmak yasak (biz satmıyoruz).

### `fx/` — Retro Impact Effect Pack 5 / magic sprite sheet effects
- **Kaynak:** CraftPix.net
- **Lisans:** https://craftpix.net/file-licenses/ — royalty-free, sınırsız projede ticari kullanım
- **Durum:** Ticari kullanım SERBEST. Asset'leri paket olarak yeniden dağıtmak yasak.

### (kodda) LeanTween
- **Lisans:** MIT (Russell Savage / Dented Pixel) + BSD (Robert Penner easing)
- **Durum:** Kullanılmıyor — Unity kütüphanesi, bizim stack'te yok.

---

## ⚠️ LİSANS DOĞRULANMASI GEREKENLER — yayına çıkmadan önce netleştir

Aşağıdaki paketler zip içinde **lisans dosyası olmadan** geldi. Görsel imzaları
LuizMelo'nun (itch.io) ücretsiz paketlerine ait; o paketler ticari kullanıma açık
ve atıf "takdir edilir" şeklinde. **Ama bunu paketin kendi sayfasından doğrulamadan
launch etmeyelim.**

| Klasör | Tahmini kaynak | Dosya | Yapılacak |
|---|---|---|---|
| `heroes/leaf-ranger` | LuizMelo — Elementals Leaf Ranger (Free v1.0) | 266 | itch.io sayfasından lisans doğrula + atıf ekle |
| `heroes/water-priestess` | LuizMelo — Elementals Water Priestess (FREE v1.1) | 199 | aynı |
| `heroes/metal-bladekeeper` | LuizMelo — Elementals Metal Bladekeeper (FREE v1.1) | 184 | aynı |
| `heroes/fire-knight` | LuizMelo — Fire Knight | 164 | aynı |
| `enemies/` | LuizMelo — Monsters Creatures Fantasy | 9 | aynı |
| `ui/`, `ui/borders`, `icons/` | belirsiz (muhtemelen CraftPix / Pixel UI pack 3) | 200 | kaynağı tespit et |
| `pickups/`, `misc/` | belirsiz | 116 | kaynağı tespit et |

---

## 📋 ENVANTER ve BOŞLUKLAR

| Klasör | Dosya | Ne işe yarar | Durum |
|---|---|---|---|
| `heroes/` | 813 | 4 animasyonlu oynanabilir karakter (yandan görünüm, VS ile aynı bakış açısı) | ✅ yeterli |
| `icons/` | 51 | silah/pasif item ikonları | ✅ iyi başlangıç |
| `ui/` + `ui/borders` | 149 | panel, çerçeve, buton, kart | ✅ yeterli |
| `fx/` | 60 | vuruş/büyü efektleri, mermi | ✅ yeterli |
| `pickups/` | 24 | iksir, altın, mücevher | ✅ yeterli |
| `tiles/` | 19 | katakomp tileset — GRAVEBORN temasına birebir uyuyor | ✅ 1. Depth için yeterli |
| `enemies/` | **9** | düşman sprite'ları | ❌ **KRİTİK EKSİK** |

### ❌ En büyük boşluk: düşman çeşitliliği
`CLONE-SPEC.md`'de 5 düşman tipi + 3 boss tanımlı, hedef 10-20 tip. Elimizde **9 dosya**
(≈2-3 yaratık × animasyon frame'leri) var. Sürü oyununda oyuncu ekranda 400 düşman görüyor;
hepsi aynı görünürse oyun ucuz duruyor — bu, tür incelemesinde "unutulmuş klonların"
en belirgin işareti.

**Çözüm seçenekleri:**
1. LuizMelo'nun diğer ücretsiz monster paketleri (itch.io) — aynı stil, uyum garantili
2. CraftPix "enemy/monster" pixel-art paketleri (royalty-free ticari)
3. itch.io'da 32×32 survivors-like düşman paketleri (170 karakterlik paketler mevcut)

**Kural:** Yeni asset eklerken lisansını bu dosyaya YAZ. Yazılmamış asset kullanılmaz.
