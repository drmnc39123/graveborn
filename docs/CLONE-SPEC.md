# GRAVEBORN — Klon Spesifikasyonu
Vampire Survivors'ın **sistem, denge ve görsel dilinin** birebir karşılığı. Kaynak: resmi wiki verisi.

> **Yasal çizgi:** Mekanikler, istatistik sistemi, denge sayıları, evrim zincirleri, arayüz düzeni ve pixel-art stili **serbest** (VS'in kendisi de Magic Survival'dan böyle doğdu). Korunan şeyler: **asıl PNG/ses dosyaları** ve **tescilli isimler**. O yüzden her kalem için birebir fonksiyon + kendi ismimiz + kendi çizimimiz. Poncle 1:1 asset/kod çalan klonların peşine düştü, mekanik klonlara dokunmadı.

---

## 1. İSTATİSTİK SİSTEMİ — kalibrasyon gerçeği

VS'in gerçek taban değerleri ve tavanları. **Motorumuz bunlara göre ayarlanacak.**

| İstatistik | İşlevi | Taban | Tavan |
|---|---|---|---|
| Max Health | Karakterin max HP'si | **100** | sınırsız |
| Might | Tüm saldırıların hasarı | **%100** | **%1000** |
| Armor | Gelen hasar azaltma (düz) | **0** | **50** |
| Area | Tüm saldırıların alanı | %100 | %1000 |
| Speed | Mermi hızı | %100 | %500 |
| Duration | Efekt süresi | %100 | %500 |
| Cooldown | Saldırı bekleme | %100 | **%10** (dip) |
| Amount | Ekstra mermi | 0 | **10** |
| Move Speed | Karakter hızı | %100 | sınırsız |
| Magnet | Toplama yarıçapı | **30** | sınırsız |
| Recovery | HP/sn | 0 | sınırsız |
| Growth | XP kazancı | %100 | sınırsız |
| Greed | Gold kazancı | %100 | sınırsız |
| Luck | Drop şansları | %100 | sınırsız |
| Curse | Düşman hız/HP/adet/sıklık | %100 | sınırsız |
| Revival | Ekstra can | 0 | sınırsız |
| Reroll / Skip / Banish | Level-up seçenek kontrolü | 0 | sınırsız |
| Charm | Düşman dalgası adedi (düz) | 0 | sınırsız |
| **Invulnerability** | Hasar sonrası dokunulmazlık | **240 ms** | sınırsız |
| Thorns | Karşı hasar | 0 | sınırsız |
| Defang | Zararsız düşman yüzdesi | %0 | sınırsız |
| Preserve | Reroll/Skip/Banish koruma şansı | %0 | **%50** |

**⚠️ Motorumuzdaki sapmalar — düzeltilecek:**
- `iframeSec: 0.55` → **0.24** (VS 240 ms)
- `pickupRadius: 62` → **30** taban (Magnet istatistiği olarak modellenecek)
- Curse/Luck/Growth/Greed/Armor/Area/Duration istatistikleri **henüz yok** → eklenmeli
- Hasar `damageMul` yerine **Might yüzdesi** olarak modellenmeli (tavan %1000)

---

## 2. SALDIRI DESENLERİ — çekirdek 15 arketip

VS'te 70+ silah var ama hepsi bu desenlerin varyasyonu. Klonda **bu 15'i** kurmak yeterli; gerisi veri.

| # | Desen | VS örneği | Taban hasar | Bizim adı |
|---|---|---|---|---|
| 1 | En yakın düşmana nişan alır | Magic Wand | 10 | **Bone Shard** |
| 2 | Yatay geçen kesik | Whip | 10 | **Grave Lash** |
| 3 | Bakılan yöne hızlı atış | Knife | 6.5 | **Splinter** |
| 4 | Yüksek hasar, Area ölçekli, yay çizer | Axe | **20** | **Sexton's Axe** |
| 5 | Bumerang, en yakına | Cross | 5 | **Iron Censer** |
| 6 | Karakterin etrafında yörünge | King Bible | 10 | **Litany** |
| 7 | Rastgele düşmana ağır hasar | Fire Wand | **20** | **Pyre Brand** |
| 8 | Yakın alan aurası (sürekli) | Garlic | 5 | **Wardsalt** |
| 9 | Yere hasar bölgesi bırakır | Santa Water | 10 | **Grave Oil** |
| 10 | Düşmandan geçer, sekerek dolaşır | Runetracer | 10 | **Wraithbolt** |
| 11 | Rastgele düşmanlara yıldırım | Lightning Ring | **15** | **Stormtoll** |
| 12 | Ekranı süpürür (nadir/güçlü) | Pentagram | — | **Last Rites** |
| 13 | Dönen çift kuş bombardımanı | Peachone + Ebony Wings | 10+10 | **Pale Crow** + **Black Crow** |
| 14 | Dondurma şansı (savunma) | Clock Lancet | — | **Hourglass Shard** |
| 15 | Hasar kalkanı (savunma) | Laurel | — | **Shroud** |

Diğer VS desenleri (referans için): 4 sabit yöne atış (Phiera), seken mermi (Bone/Cherry Bomb), hareketle güçlenen (Vento Sacro), koni alev (Flames of Misspell), duran/hareket eden bölge (Shadow Pinion), kritik vuran mızrak (Santa Javelin).

**Silah max seviyesi: 8** (savunma silahları 7). Bizde aynı.

---

## 3. PASİF ITEM'LAR — istatistik + seviye başı bonus

| Bizim adı | VS karşılığı | İstatistik | Seviye başı | Max lv |
|---|---|---|---|---|
| **Bloodmeal** | Spinach | Might | **+%10** | 5 |
| **Bone Plate** | Armor | Armor | **+1** (+%10 karşı hasar) | 5 |
| **Stubborn Flesh** | Hollow Heart | Max Health | **+%20** | 5 |
| **Slow Knit** | Pummarola | Recovery | **+0.2 HP/sn** | 5 |
| **Restless Hands** | Empty Tome | Cooldown | **-%8** | 5 |
| **Tallow Candle** | Candelabrador | Area | **+%10** | 5 |
| **Sinew Wrap** | Bracer | Speed | **+%10** | 5 |
| **Binding Sigil** | Spellbinder | Duration | **+%10** | 5 |
| **Echo Charm** | Duplicator | Amount | **+1 mermi** | **2** |
| **Unquiet Step** | Wings | Move Speed | **+%10** | 5 |
| **Soul Pull** | Attractorb | Magnet | çarpımsal | 5 |
| **Dead Man's Luck** | Clover | Luck | **+%10** | 5 |
| **Grave Crown** | Crown | Growth | **+%8** | 5 |
| **Coin Mask** | Stone Mask | Greed | **+%10** | 5 |
| **Cursed Skull** | Skull O'Maniac | Curse | **+%10** | 5 |
| **Second Burial** | Tirajisú | Revival | **+1 diriliş** | **2** |

Dikkat: **Echo Charm ve Second Burial max 2** — diğerleri 5. Bu kasıtlı, en güçlü iki pasif kıt tutuluyor.

---

## 4. EVRİM SİSTEMİ

**Kural:** silah **max seviye** + doğru pasif envanterde + **10. dakikadan sonra boss sandığı** → evrim.

| Silah | + Pasif | = Evrim (bizim adı) |
|---|---|---|
| Grave Lash | Stubborn Flesh | **Weeping Wound** |
| Bone Shard | Restless Hands | **Reliquary** |
| Splinter | Sinew Wrap | **Thousand Ribs** |
| Sexton's Axe | Tallow Candle | **Grave Spiral** |
| Iron Censer | Dead Man's Luck | **Judgement** |
| Litany | Binding Sigil | **Black Vespers** |
| Pyre Brand | Bloodmeal | **Pyreheart** |
| Wardsalt | Slow Knit | **Soul Glutton** |
| Grave Oil | Soul Pull | **The Mire** |
| Stormtoll | Echo Charm | **Deathknell** |
| Pale Crow + Black Crow | — (Union) | **Carrion Pair** |

**Evrim tipleri (VS'ten birebir):**
- **Standard:** silah + pasif → yeni silah (silah gider, pasif kalır)
- **Union:** 2 silah birleşir → **bir slot boşalır**
- **Gift:** taban silah kalır, ek item gelir
- **Morph:** karakter dönüşümünde otomatik, **sandık gerekmez**

Oyun içi evrim tablosu (duraklat menüsünde) — oyuncu ezberlemek zorunda kalmasın. VS'te var, bizde de olmalı.

---

## 5. SAHNE YAPISI → "DEPTHS" (bölümler)

VS'te 5 taban sahne, her biri **30 dakika**, her biri farklı layout tipi ve o sahnede bulunan pasifler.

| # | Bizim adı | VS karşılığı | Layout | Kilit açma | Orada bulunan pasifler |
|---|---|---|---|---|---|
| 1 | **The Hollow Wood** | Mad Forest | açık alan | varsayılan | Bloodmeal, Dead Man's Luck, Stubborn Flesh, Slow Knit, Cursed Skull |
| 2 | **Ossuary Halls** | Inlaid Library | koridor (yön kısıtlı) | 1'de LV20 | Coin Mask, Restless Hands |
| 3 | **The Charnel Works** | Dairy Plant | etkileşimli/fabrika | 2'de LV40 | Soul Pull, Tallow Candle, Unquiet Step, Bone Plate |
| 4 | **The Toll Tower** | Gallo Tower | çok katlı | 3'te LV60 | Sinew Wrap, Binding Sigil |
| 5 | **The Black Chapel** | Cappella Magna | açık katedral | 4'te LV80 | Grave Crown, Second Burial, Echo Charm |

**Kritik tasarım detayları:**
- Her sahne **25:00'te boss** → yenince "Hyper Mode" açılır (o sahnenin zor versiyonu)
- Süre dolunca **her dakika bir "Warden"** (VS: Reaper) gelir ve run'ı bitirir — Endless mod hariç
- Sahne bitirme ödülü: **500 gold** + kullanılmayan her diriliş için **+100**
- Bazı sahnelerde **10. dakikadan önceki sandıklar da** evrim verir (Charnel Works, Black Chapel) — çeşitlilik için

**Ekonomi bağı:** her Depth farklı **material** düşürür → marketplace'te farklı fiyatlı arz kalemleri (bkz. `DEV-PLAN.md`).

---

## 6. GÖRSEL SPESİFİKASYON

VS'in wiki sprite kademeleri: **12 / 16 / 24 / 32 / 48 / 64 / 96 / 128 px**.

**Bizim standardımız:**
| Varlık | Boyut |
|---|---|
| Oyuncu, normal düşman | **32×32** |
| Küçük düşman / mücevher / pickup | **16×16** |
| Mini-boss | **64×64** |
| Boss | **96×96** veya **128×128** |
| Silah/pasif ikonu (UI) | **32×32** |
| Efekt frame'leri | 32×32 veya 64×64 |

**Kurallar:**
- **Tek piksel ölçüsü.** 16×16'yı 32×32'ye ölçekleme — piksel boyutu tutarsızlaşır, stil bozulur.
- Nearest-neighbor ölçekleme, `image-rendering: pixelated`
- Silüet okunabilirliği: 400+ düşman ekranda olacak → her düşman tipi **silüetinden** ayırt edilebilmeli, renkten değil
- Palet `theme.ts`ten: mezar toprağı / kemik / kan / buz / mum. **MOR YOK.**
- Yürüyüş animasyonu: 4-6 frame yeterli (VS'te düşmanlar minimal animasyonlu)

---

## 7. VS'TEN AYRILDIĞIMIZ YERLER (bilinçli)

| Konu | VS | GRAVEBORN | Neden |
|---|---|---|---|
| Run süresi | 30 dk | **20 dk** | Mobil oturum + "bir tur daha" döngüsü |
| Meta para | Gold (oyun içi) | **GOLD + $GRAVE** | Çift ekonomi (Kintara modeli) |
| Material | yok | **Depth bazlı material** | Marketplace flywheel'ın yakıtı |
| Seed | rastgele | **günlük ortak seed** | Doğrulanabilir adil rekabet |
| Sosyal | yok (co-op var) | **guild + referral + profile** | Retention + büyüme |
| Erişim | $3.49 tek seferlik | **hold-to-play** | Token talebi |

---

## 8. UYGULAMA SIRASI

1. ✅ Çekirdek motor (sabit timestep, spatial hash, desen #1 Bone Shard)
2. İstatistik sistemini VS'e kalibre et (Might/Area/Amount/Cooldown/Armor/Magnet 240ms iframe)
3. Saldırı desenleri #2-#11 (her biri veri, motor tek)
4. Pasif item sistemi (16 kalem, seviye başı bonus)
5. Evrim sistemi + boss sandığı + oyun içi evrim tablosu
6. 5 Depth + layout tipleri + 25:00 boss + Warden
7. Sprite üretimi (32×32 standardı)
8. Meta: PowerUp ağacı (27 kalem, 10→10.000 eğrisi, tavan 27M)
