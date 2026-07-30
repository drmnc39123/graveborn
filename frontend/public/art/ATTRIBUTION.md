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

### `hub/`, `interior/`, `npc/`, `portals/`, `loot/`, `chests/`, `stage/`, `enemies/undead`, `enemies/vermin`
**MutterPixel Studio** (itch.io) — 2026-07-31'de alınan "ALL ASSETS" derlemesinden seçilenler:
Haunted Graveyard Builder Kit · Ruined Village Builder Kit · Ruined Medieval Buildings ·
Cozy Churchyard · Cozy Outdoor Lights · Cozy Market Stalls · Village Merchant/Guard/Scholar ·
Tiny NPC Pack · Cozy Interior (Tavern/General Store/Royal Armory) · Fantasy Portal Gates (8) ·
Animated Skeleton NPC Pack · Vermin · Cozy Loot & Currency · Cozy Chests & Mimics ·
Dark Dungeon Builder Kit · Dark Forest Trees · Forest Ground Tiles

- **Lisans:** *"Use these assets in your own commercial or non-commercial indie games... You are free to remix or edit the sprites"*
- **Yasaklar:** ham asset'i yeniden satmak · NFT · üretken AI eğitim verisi olarak kullanmak · ham dosyaları tek başına dağıtmak (derlenmiş oyunun içinde olmalı)
- **Kredi:** zorunlu değil ama takdir ediliyor → **oyunun Credits bölümüne "Art by MutterPixel Studio" eklenecek**
- **Durum:** Ticari kullanım SERBEST. Bizim kullanımımız (oyunun içine gömülü) uyumlu.

### `ui/kit/` + `public/fonts/`
**Franuka** — RPG UI pack v1.6 (https://franuka.itch.io/)
- **Lisans:** *"You may use this pack on both commercial AND non-commercial projects, just remember to add a link to my itch page and/or Twitter/X"*
- **Yasak:** olduğu gibi yeniden dağıtmak veya başka yerde satmak
- **ZORUNLU:** Credits'te **franuka.itch.io linki** olacak — bu istek, takdir değil
- Fontlar: `FantasyRPGtext` **8'in katlarında**, `FantasyRPGtitle` **11'in katlarında** kullanılmalı;
  aksi hâlde piksel görünümü bozulur (vektör font değiller)

---

## ❌ KULLANILMAYACAK — sahte paket

**"Pixel_RPG_Pack" / "Ultimate Fantasy RPG UI Mega Pack" (500+ assets)** — 2026-07-31'de incelendi.
Mağaza önizlemesi zengin bir arayüz kiti gösteriyor ama **dosyaların içi boş**: 500 PNG'nin
hepsi aynı 256×256 şablon — renkli bir çerçeve, 2-3 yuvarlak baloncuk ve "Icons 77" gibi bir
metin etiketi. Buttons/Icons/Panels/Items/HUDs klasörlerinden örneklendi, hepsi aynı.
**Repoya alınmadı.** Önizlemeye bakıp indirme hatası tekrarlanmasın diye buraya not edildi.

---

## ✅ Lisansı doğrulanmış (önceki)

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

### `enemies/` + `heroes/` — LuizMelo paketleri
- **Kaynak:** https://luizmelo.itch.io/ (Monsters Creatures Fantasy, Elementals serisi, Fire Knight)
- **Lisans:** **CC0 (Creative Commons Zero)** — *"can be used in commercial and non-commercial
  projects under CC0; credits are not required, but greatly appreciated"*
- **Durum:** Ticari kullanım TAMAMEN SERBEST. CC0 en güçlü lisans: atıf zorunlu değil,
  yeniden dağıtım bile serbest. Yine de atıf veriyoruz (takdir edilir).
- Klasörler: `enemies/`, `heroes/leaf-ranger`, `heroes/water-priestess`,
  `heroes/metal-bladekeeper`, `heroes/fire-knight`

---

## ⚠️ KAYNAĞI TESPİT EDİLECEK — yayına çıkmadan önce netleştir

Bu klasörler zip içinde lisans dosyası olmadan geldi ve kaynağı henüz doğrulanmadı.
Muhtemelen CraftPix / Pixel UI pack 3 (ikisi de ticari serbest), ama **doğrulanmadan
launch edilmemeli.**

| Klasör | Tahmini kaynak | Dosya |
|---|---|---|
| `ui/`, `ui/borders` | Pixel UI pack 3 / CraftPix | 149 |
| `icons/` | belirsiz | 51 |
| `pickups/`, `misc/` | belirsiz | 116 |

Riski sıfırlamanın en hızlı yolu: bu kategoriler için CraftPix'ten bilinen ücretsiz
UI/ikon/pickup paketleri indirip belirsiz olanları değiştirmek.

---

## 🛒 DÜŞMAN ÇEŞİTLİLİĞİ — hazır ücretsiz kaynak listesi

`enemies/` boşluğunu kapatacak, hepsi **ticari kullanıma açık** paketler.
Gotik/ölü teması GRAVEBORN'a VS'in yarasa-bitki setinden bile daha iyi oturuyor.

**LuizMelo (CC0, elimizdeki asset'lerle aynı stil → görsel tutarlılık garantili):**
- Monsters Creatures Fantasy ✅ *(zaten elimizde)*
- Wizard Pack — https://luizmelo.itch.io/wizard-pack
- Martial Hero — https://luizmelo.itch.io/martial-hero
- Tüm paketler: https://itch.io/profile/luizmelo

**CraftPix (ücretsiz, royalty-free, "you can sell and distribute games with the assets"):**
- Free Skeleton Pixel Art Sprite Sheets — **3 iskelet** (kılıç/okçu/mızrak), her biri
  3 saldırı + walk + run + dead + hurt + idle animasyonlu
- Free Zombie Sprite Sheet Pack — **3 zombi**
- Free Urban Zombie Sprite Sheet Pack — idle/walk/attack/damage/fall
- Free Fantasy Enemies Pixel Art Sprite Pack
- Free RPG Monster Sprites
- Free Slime Mobs (top-down)

Bu liste **15+ ayrı düşman tipi** demek — `CLONE-SPEC.md`'nin ihtiyacı olan 5 tip + 3 boss'un
fazlasıyla üstünde, sıfır maliyet ve sıfır hukuki risk.

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
