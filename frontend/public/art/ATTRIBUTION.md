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

### `cursors/` — Franuka'dan TÜRETİLMİŞ (bizim ürettiğimiz dosyalar)
`Cursor02@2x.png`, `Hand01_Up@2x.png` — `ui/kit/Cursors/` altındaki 16×16
Franuka imleçlerinin NEAREST ile 2 kat büyütülmüş hâli.

- **Neden:** CSS imleci ölçeklemez, görselin kendi boyutunu kullanır. 16 px
  imleç ekranda sistem imlecinin yarısı kadar kalıyordu.
- **Lisans:** kaynakla aynı (Franuka RPG UI pack) — paket düzenlemeye izin
  veriyor. **Credits'te franuka.itch.io bağlantısı ZORUNLU** (kaynak paketin
  koşulu, türev için de geçerli).
- **Yeniden üretim:** PIL, `im.resize((32,32), Image.NEAREST)`. BICUBIC
  KULLANMAYIN — piksel sanatını bulanık bir lekeye çevirir.

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

## ⚠️ KAYNAĞI TESPİT EDİLECEK — **2026-08-11 ARAŞTIRMASI**

Bu bölüm "muhtemelen CraftPix, doğrulanmadan launch edilmemeli" diyordu.
Araştırıldı; tek bir "belirsiz lisans" sorunu DEĞİLMİŞ, **üç ayrı durum** var.

### 🔴 1 — KULLANILMIYOR + GERÇEKTEN SORUNLU → SİLİNMELİ (265 dosya)

| Klasör | Dosya | Kodda referans |
|---|---|---|
| `ui/` kökü | 52 | **0** |
| `ui/borders` | 97 | **0** (tek eşleşme bir YORUM satırı) |
| `pickups/` | 24 | **0** |
| `misc/` | 92 | **0** |

Ölçüm: kodda geçen HER `/art/ui/...` yolu `ui/kit/` altına gidiyor (Franuka,
doğrulanmış). Diğer dördü hiçbir yerden çağrılmıyor.

⚠️ **Bu bir evrak sorunu değil.** `ui/` kökü karışık bir çöplük:
- `Teemo Basic emote animations sprite sheet.png` → **Teemo bir League of Legends
  karakteri, Riot Games IP'si.** Depo PUBLIC, yani şu an açıkta duruyor.
- `waterdroplet-clipart-...-free-png.png` ve
  `fire-flame-in-simple-illustration-for-design-element-png.png` → SEO slug'lı
  isimlendirme, ücretsiz-PNG **scraping sitesi** imzası.
- `SPR_MouseCursor_*` · `Catpaw ... icon` · `Triangle Mouse icon` · `dialog box` ·
  `XpBarrr` → en az 4 farklı isimlendirme düzeni = birbirine karışmış paketler.

Şablonu yapan kişi web'den toplanmış malzemeyi pakete koymuş.
**Kullanılmadıkları için silmenin maliyeti SIFIR, faydası riskin tamamı.**

```
cd frontend/public/art
find ui -maxdepth 1 -type f -delete && rm -rf ui/borders pickups misc
cd ../.. && node scripts/build-manifest.mjs
```
⚠️ `ui/kit/` (633 dosya, Franuka) **KALIYOR** — `-maxdepth 1` yalnız kökteki
dosyaları siler, alt klasöre dokunmaz.
⚠️ `manifest.json` bunları listeliyor → **yeniden üretilmeli.** Manifest'i sadece
`src/app/editor/page.tsx` (harita editörü paleti) okuyor, oyuncuya giden bir şey değil.

### 🟡 2 — TABLODA HİÇ YOKTU, EN ÇOK KULLANILAN → BELGELENMELİ (452 dosya)

`world/` (362) ve `town/` (90) bu dosyanın **hiçbir yerinde geçmiyordu** — oysa
`world/` kodda en çok referans verilen klasör (21 yol). Risk tablosu bunları atlamış.

MutterPixel olduklarına dair kanıt (tahmin değil, ölçüm):
- İsimlendirme: `world/` %93, `town/` %80 `spr_`/`Spr_` öneki. Doğrulanmış
  MutterPixel klasörleri %82–100 (`loot` %100, `chests` %100, `stage` %100,
  `npc` %87). İstisnalar da büyük harfli `Spr_` — aynı yazar.
- Alt klasörler satın alınan paketlerle örtüşüyor: `ruins`+`props` → *Ruined
  Village Builder Kit* · `darktrees` → *Dark Forest Trees* · `forest`,`forest2` →
  *Forest Ground Tiles* · `town/` binaları → *Ruined Medieval Buildings*.

✅ **KESİNLEŞTİRMESİ 5 DAKİKA:** MutterPixel "ALL ASSETS" derlemesi SATIN ALINDI.
itch.io hesabından indirilip dosya adları karşılaştırılsın; eşleşince yukarıdaki
✅ MutterPixel satırına `world/` ve `town/` eklenir ve iş biter.
(Orijinal indirmeler bu makinede bulunamadı.)

### 🟠 3 — KULLANILIYOR + KAYNAK GERÇEKTEN BULUNAMADI → DEĞİŞTİRİLMELİ (31 dosya)

`icons/` — 51 dosyanın **31'i kullanılıyor** (`game/combatArt.ts`, `const ICO`):
16 silahın ve pasiflerin ikonları. **Tek gerçek açık kalan bu.**

Yapı: 48 ikon @16×16 + `spritesheet.png` @128×96 (tam 8×6 = 48) → tek tutarlı
paket. Ayrıca `Golden Coin.png` + `Skull.png` @32×32, farklı isimlendirme =
**başka bir kaynaktan**.

Araştırma çıkmazları:
- PNG metadata **temizlenmiş** — hiçbir dosyada yazar/yazılım kaydı yok.
- Dosya adları (`ghost_form_(physical_damage_immunity)`,
  `frenzy_spell_(critical_booster)`) internette birebir eşleşmiyor.
- CraftPix'te iki aday: *100 Pixel Art Status Effect Icons Pack* ve *RPG Pixel
  Magic Buff & Debuff 16×16 Icons*. İkisi de 16×16 ✅ ama ikisi de **100 ikon**
  (bizde 48), ikon adı listesi yayınlamıyorlar ve premium üyelik arkasındalar.
  **Eşleştirme YAPILAMADI.**

❌ **Franuka Mini-icons ile takas ÇÖZÜM DEĞİL** — onlar genel amaçlı arayüz
ikonları (yıldız/can/altın/kafatası); P3'te bilerek yapılan "16 silah görsel
olarak ayrışsın" işini geri alır.

✅ **Doğru çözüm:** lisansına sahip olduğumuz bir büyü/yetenek ikon paketi alınıp
`combatArt.ts`teki 31 yol yeniden eşlenecek — tek dosya, tek oturumluk iş.
Adaylar: CraftPix premium (zaten `fx/` oradan, üyelik ticari kullanıma açık) ·
LuizMelo (CC0) · itch.io CC0 ikon paketleri.

### Özet
| Durum | Dosya | Aksiyon | Maliyet |
|---|---|---|---|
| Kullanılmıyor + Riot IP / scrape | 265 | **SİL** | sıfır |
| MutterPixel olduğu ölçüldü | 452 | satın alınan paketle eşleştir, buraya yaz | 5 dk |
| Kaynak yok ama kullanılıyor | 31 | lisanslı paketle değiştir | 1 oturum |

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
