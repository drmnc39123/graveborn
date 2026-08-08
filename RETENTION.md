# GRAVEBORN — yıllarca oynanan bir oyun için ne eksik

Bu belge üç soruya cevap veriyor: oyun kaç günde tükeniyor, Kintara'da olup
bizde olmayan ne var, ve token'ın adını koruması için ekonomiye ne lazım.

Tamamı ölçümle — bu oturumda sayıldı, tahmin yok.

---

## 1. Önce dürüst cevap: "7-9 hafta" nasıl 1 haftaya düştü?

**Düşmedi. Plan bitti, OYUN bitmedi.** İkisi aynı şey değil ve karışması
benim hatam olurdu.

Planda yazan şey **özellik listesiydi**. Özellikler yazıldı, ölçüldü,
test edildi — 22 test paketi yeşil, iki para basma açığı kapandı, ekonomi
eğrisi rakamla oturdu. Bunlar gerçek.

Ama bir oyunu 7-9 haftaya götüren şey özellik yazmak değil, şu döngüdür:

```
yap → gerçek insanlar oynasın → izle → yanlışı gör → yeniden yap
```

Bu döngü **hiç dönmedi**. Somut olarak:

- **Hiçbir insan bu oyunu oynamadı.** Ben de dahil — motoru ölçtüm,
  arayüzü tıkladım, ama oyuncu gibi bir koşu bile oynamadım.
- **Deploy edilmedi.** Tek bir gerçek istek gelmedi.
- **Denge, insandan KÖTÜ olduğu bilinen bir YZ sürücüsüyle ölçüldü.**
  Ölçümlerin kendi başlığında yazıyor: "mutlak derinlik ALT SINIR".
- **Ekonomiden tek bir gerçek veri yok.** Gold/saat bir simülasyon çıktısı,
  gözlem değil.

Yani elimizde **mekanik olarak sağlam, test edilmiş, eksiksiz bir iskelet**
var. Elimizde olmayan şey: bunun **eğlenceli olduğuna dair tek bir kanıt**.

Sıkıştırılan şey uygulama oldu. Doğrulama sıkıştırılamaz — çünkü onun için
insan lazım. Kalan 6-8 hafta orada duruyor ve harcanacak yer belli:
oynatmak, izlemek, düzeltmek.

---

## 2. Oyun kaç saatte tükeniyor (ölçüldü)

| İçerik | Miktar | Süre |
|---|---|---|
| Kampanya (10 bölüm) | ham minimum 35 dk | gerçekte ~1,5 saat |
| Forge ağacı | 255.694 gold | **42 saat** |
| Kozmetik koleksiyonu | 41 çekilebilir eşya, beklenen 177 çekiliş | **13 saat** |
| Başarımlar | 11 adet | — |
| **BİTEN İÇERİĞİN TOPLAMI** | | **~56 saat** |

- Günde 2 saat oynayan: **28 gün**
- Günde 5 saat oynayan: **11 gün**

**Bitmeyen içerik:** Descent derinliği · Ascension 0-10 · Ossuary (tavansız)
· haftalık boss · haftalık sezon · Crypt Vault.

⚠️ Korktuğunuz "3-5 gün" değil, ama **kampanya gerçekten 1,5 saat** ve
oyunun en zayıf tarafı o. Asıl sorun sayıda değil: **56 saatten sonra geriye
kalan tek şey "daha derine in"**. Tek bir eksen, sonsuza kadar.

---

## 3. ⭐ ASIL BULGU: biz tek kişilik bir oyunuz, Kintara bir MMO

Kintara'nın rakamları: **20.540 aylık oyuncu**, eşzamanlı **800-1.300**,
günlük **16.000 market işlemi**. Bunun sebebi içerik hacmi değil.

**Kintara'da oyuncu neden geri geliyor:** ormanda odun keserken yanında
biri var, kestiğini birine satıyor, guild'i ondan kaynak bekliyor,
Wilderness'ta biri onu öldürüp envanterini alabiliyor.

**GRAVEBORN'da oyuncu ne yapıyor:** PLAY'e basıyor, 25 dakika **tek başına**
dövüşüyor, geri dönüp **tek başına** gold harcıyor. Tek insan teması bir
sıralama satırı ve boss odasındaki 24 kozmetik hayalet.

> Bir oyuncuyu içerikle 56 saat tutabilirsin. **Yıllarca tutan şey içerik
> değil, insanlardır.**

### Kintara'da olup bizde OLMAYAN sistemler (repo tarandı)

| Sistem | Kintara | Biz |
|---|---|---|
| **Guild / lonca** | ✅ +%5 XP, 5→20 üye, kaynakla beslenir | ❌ YOK |
| **Sohbet** | ✅ | ❌ YOK |
| **Arkadaş listesi** | ✅ | ❌ YOK |
| **PvP** | ✅ arena + **açık dünya Wilderness** | ❌ YOK |
| **Ölümde eşya kaybı** | ✅ Wilderness'ta envanteri kaybediyorsun | ❌ YOK |
| **Günlük görev** | ✅ 00:00 UTC sıfırlanır | ❌ YOK |
| **Toplama meslekleri** | ✅ odun/maden/balık | ❌ YOK |
| **Üretim** | ✅ smithing, cooking | ❌ YOK |
| **Pet / binek** | ✅ satın alınır, eğitilir | ❌ YOK |
| **Banka** | ✅ riskten önce mal koruma | ❌ YOK |
| **Etkinlik / turnuva** | ✅ sürpriz aktiviteler | ❌ YOK |
| **Bölge kilidi (toplam seviye)** | ✅ Frostmere 20, Emberstone 25 | ❌ YOK |
| Marketplace | ✅ | ✅ VAR |
| Dünya boss | ✅ | ✅ VAR |
| Mülk sahipliği | ✅ | ✅ VAR (Crypt Deed) |
| Kumar / şans | ✅ | ✅ VAR (Reliquary, Wager) |
| Sıralama / sezon | ✅ | ✅ VAR |

### Kintara'nın en akıllı iki mekaniği (bizde karşılığı yok)

**1. Wilderness — açık PvP + tam eşya kaybı.**
Öldüğünde taşıdığını kaybediyorsun. Bu tek kural üç iş birden yapıyor:
- kalıcı bir **eşya imhası** yaratıyor → ekipmana **sürekli talep**
- bankaya gitmek bir **karar** haline geliyor (risk yönetimi = oynanış)
- her giriş bir **hikâye** üretiyor ("dün dragon'a giderken avlandım")

Bizde ölüm sadece koşuyu bitiriyor. **Hiçbir şey kaybetmiyorsun** — o yüzden
hiçbir şey riskli değil, o yüzden hiçbir an gergin değil.

**2. Yatay ilerleme.** 6 ayrı beceri, her biri 40 seviye, bölgeler TOPLAM
seviyeye göre açılıyor. Oyuncu "bugün ne yapayım" sorusuna 6 farklı cevap
verebiliyor. Bizde tek eksen var: **derinlik**. Sıkıldığında yapacak başka
şey yok.

⚠️ Kintara seviye tavanını **30'dan 40'a çıkardı** — yani içeriği sayıyla
uzatıyorlar. Bu ucuz ama işe yarıyor; bizim böyle bir kolumuz bile yok.

---

## 4. Token'ın adını koruması için (dump yememek)

Yapısal olarak zaten iyi durumdayız ve bu tesadüf değil: **oyun token
BASMIYOR**, sıfır emisyon (bkz. TOKEN.md). AFK Heroes ölçüldü — 6.000 aktif
oyuncu, 5.305 ödeyen, token yine de tepeden **%90 aşağı**, çünkü havuz
oyuncunun kendi mevduatıydı. O çukurun kenarındayız ama içinde değiliz.

Yine de token'ın **talebi** yok denecek kadar az. Bugün $GRAVE'in tek işi
"gold satın almak". Talep tek ayaklıysa fiyat da tek ayaklıdır.

**Token'a kalıcı talep yaratacak şeyler (öncelik sırasıyla):**

1. **Eşya imhası** (yukarıdaki Wilderness fikri). Kaybedilen her şey yeniden
   alınmalı → market hacmi → komisyon → burn. Ekonominin motoru budur.
2. **Token-only kozmetik/gacha.** Gold'la alınamayan, sadece $GRAVE ile.
   Burn'lü.
3. **Guild kasası ve guild yükseltmeleri** — token'la beslenen ortak bir
   sink; sosyal baskı ödemeyi sürdürür.
4. **Sezon geçişi (battle pass)** — düzenli, tahmin edilebilir talep.
5. **Hold-to-play** — ⚠️ yumuşak ve DOLAR hedefli (bkz. TOKEN.md).

⚠️ **Asla yapılmayacak:** stake-et-kazan, token ödüllü havuz, "yatır kazan".
Üçü de oyuncunun kendi parasını geri dağıtmaktır ve AFK Heroes'un düştüğü
çukurun tam kendisidir.

---

## 5. Plan — ne yapmalıyız

Sıralama önem sırasına göre; her madde "oyuncu neden yarın geri gelsin"
sorusuna cevap veriyor.

### FAZ R1 — İNSANLAR (en büyük eksik)
1. **Sohbet.** Köy meydanında tek kanal. Altyapı VAR (`ws` boss odasında
   çalışıyor). En ucuz, en yüksek etkili madde.
2. **Guild / lonca.** Kur, katıl, tag, ortak kasa, guild yükseltmeleri.
   Kintara'nın +%5 XP'si gibi küçük ama sürekli bir fayda.
3. **Arkadaş listesi + kim çevrimiçi.** Yalnız oynanan bir oyunda "3 arkadaşın
   şu an oynuyor" satırı, içerikten daha güçlü bir geri çağırma sebebidir.

### FAZ R2 — RİSK (ekonominin motoru)
4. **Deep Descent / Wilderness modu.** İsteğe bağlı, yüksek ödüllü, ve
   **ölürsen o koşunun kazancını + taşıdığın tılsımları kaybedersin.**
   Bizde envanter yok, o yüzden kaybedilecek şeyi ÖNCE yaratmak lazım (5. madde).
5. **Ekipman sistemi.** Şu an kalıcı güç sadece Forge'da ve kaybedilemez.
   Düşen, takılan, kırılan, satılabilen ekipman → market hacmi → token talebi.
   ⚠️ Kozmetik sistemine DOKUNMA: o bilerek güç vermiyor, öyle kalmalı.

### FAZ R3 — YATAY İLERLEME (tek eksen sorunu)
6. **İkinci ve üçüncü eksen.** Kintara'nın 6 becerisi gibi. Bizim temaya
   uygun olanlar: **mezar kazma** (kaynak), **kemik işleme** (üretim),
   **ayin/ritüel** (buff üretimi). Her biri kendi seviyesi, kendi ödülü.
7. **Karakter sayısı 4 → 8+** ve karakter başına kalıcı ilerleme.
   Şu an 4 karakter var ve hepsi aynı Forge'u paylaşıyor; ayrı ilerleme
   "bir daha oyna" sebebi üretir.

### FAZ R4 — RİTİM ✅ BİTTİ
8. ~~**Günlük görev.**~~ ✅ 3 görev + tamamlama bonusu, 00:00 UTC sıfırlanıyor.

9. ~~**Etkinlikler.**~~ ✅ **Hafta sonu etkinlikleri** (`game/events.ts`).
   Cumartesi 00:00 → Pazartesi 00:00 UTC, üç haftalık döngü:
   **Ashfall** (düşüş gold'u ×1,5) · **Blood Moon** (boss hasarı ×2) ·
   **Night Vigil** (görev tozu ×2).

   ⚠️ **MOTORA DOKUNULMADI ve dokunulmamalı.** İlk akla gelen "hafta sonu
   düşman yoğunluğu ×1,5" idi; yapılsaydı `SIM_SEAL`'in dayandığı "aynı
   girdi + aynı seed → aynı koşu" varsayımı kırılırdı: mühür testi tarihe
   bağımlı hâle gelir, sunucunun koşuyu yeniden oynatarak doğrulama ihtimali
   tamamen ölürdü. Etkinlik bunun yerine bir **kapanış katmanı çarpanı** —
   koşu normal oynanır, sunucu iddiayı her zamanki gibi kırpar, çarpan EN SON
   ödeme anında biner. Her etkinliğin TEK bir yetki noktası var.

   ⚠️ **SIRA: önce kırp, sonra çarp.** Tavan iddianın MEŞRULUĞUNU ölçüyor
   (oyuncunun gerçek greed'ine bağlı); etkinlik doğrulanmış bir ödemeyi
   büyütüyor. Ölçüldü: tekrar koşusunda yalancı/dürüst oranı hafta içi de
   etkinlikte de **4,311** — etkinlik yalancıya ek avantaj vermiyor.

   ⚠️ **`progressGold` bilerek ÇARPILMIYOR.** Her derinlik için BİR KEZ
   ödenen bir ödül; çarpılsaydı oyuncuya "ilerlemeyi hafta sonuna sakla"
   derdi. Bir etkinliğin oyuncuyu Cuma günü OYNAMAMAYA teşvik etmesi kendi
   amacını yener.

   ⚠️ **Musluk maliyeti ölçüldü:** Ashfall takvimin %9,5'inde açık →
   tekrar koşusu gelirinde **+%4,8** (sadece hafta sonu oynayan için üst
   sınır +%16,7). Büyütülecekse ölçüm tekrarlanmalı.

   ⚠️ Testler artık **SABİT SAATLE** koşuyor (`quests.test.mts`): gerçek
   saate bağlı bir test, kod hiç değişmeden bir Cumartesi kendiliğinden
   kırmızıya döner ve bakan kişiye "ödül sistemi bozuldu" der.

10. ~~**Sezon ödülleri genişlesin.**~~ ✅ Tablo **10 → 100 sıra**.
    İlk 10 kozmetik + toz, **11-100 SADECE toz** (kozmetik yok). "İlk 10'a
    girdim" cümlesi korundu; 11. sıradaki artık boş dönmüyor. Haftalık toz
    musluğu 4.445 ≈ 2,1 legendary — ölçüldü, sınırın içinde.

    ⚠️ Kapanış döngüsü de değişmek ZORUNDAYDI: kazanan başına iki sorgu,
    100 kişide tek transaction içinde 200 sorgu demekti ve uzak bir
    veritabanında zaman aşımına adaydı — üstelik en kötü yerde, çünkü zaman
    aşımı kapanışı geri alır ve her denemede yine düşerdi. Şimdi kozmetikliler
    tek tek, toz alanlar miktara göre gruplanıp `updateMany`, kayıtlar tek
    `createMany` → ~15 sorgu.

### FAZ R5 — İÇERİK HACMİ
11. ~~**Kampanya 10 → 20+ bölüm.**~~ ✅ **25 bölüm** — bu madde yazıldığında
    zaten geçersizmiş, ölçülmedi varsayıldı. Ölçülen ilk geçiş süresi
    **2,8 saat** (25 bölümün ortancaları toplamı), 1,5 saat değil.

12. ~~**Silah 16 → 30+, düşman 16 → 30+.**~~ ✅ Silah **8 taban + 8 evrim →
    11 taban + 11 evrim (22)**, düşman **16 → 21**, davranış **6 → 9**.

    ⚠️ **SAYIYI ARTIRMAK TEK BAŞINA İŞE YARAMAZ** — bu maddenin kendisi
    yanıltıcıydı. Aynı mermiyi başka renkte atan bir silah seçeneği değil
    LİSTEYİ uzatır. Eklenen her şey yeni bir KARAR getiriyor:
    · `homing` kaçanı vurur · `mine` tek "önceden düşün" silahı ·
      `beam` tek SÜREKLİ hasar kaynağı
    · `exploder` NEREDE öldürdüğün · `splitter` HANGİ SIRAYLA ·
      `herald` ÖNCE HANGİSİNİ (oyunun ilk hedef-önceliği kararı)

    ⚠️ Sanat kısıtı yoktu: diskte **252 efekt atlası** var, `combatArt`
    8'ini kullanıyordu. Düşman tarafında ise 16 sprite'ın 16'sı da
    kullanımdaydı — yeni tipler sprite PAYLAŞIYOR ve bu bilinçli: ayrımları
    zaten görselde değil davranışta.

    ⚠️ **Özel düşman NADİR olmalı.** Doğma seçimi `rng.pick` ile düzgün
    dağılımdı, yani 6 tipli bir bölümde haberci sürünün ALTIDA BİRİYDİ —
    o oranda bir "öncelik hedefi" karar değil arka plandır. `weight` alanı
    eklendi (haberci 0,28 · bölünen 0,45 · patlayıcı 0,5).

13. **Boss çeşitliliği.** 🔴 **SPRITE TARAFI VARLIK-ENGELLİ — kod değil,
    satın alma işi.** Ölçüldü: diskte dedike boss sanatı YOK.
    `boss_mini/mega/nightmare` = `monster 01/09/10` ve bunlar
    mon_crab/mon_warrior/mon_hulk ile AYNI sheet'ler. Tek ücretsiz seçenek
    4 hero sheet'ini "düşmüş şampiyon" boss'una çevirmek (CC0, tam animasyon
    seti diskte) — kullanıcıya soruldu, karar bekliyor.

    ✅ **DAVRANIŞ tarafı BİTTİ:** 4 arketip (`warden` kaç · `keeper` boss'a
    KOŞ · `choir` boşluğu bul · `harrower` erken dönme) + arketipten bağımsız
    **mezar küresi**. Boss kimliği artık can+boyut değil.

---

## 6. Görsel taraf — dürüst değerlendirme

⚠️ **Bunu tam yargılayamam ve yargılıyormuş gibi yapmayacağım:** oyunu
hareket hâlinde baştan sona hiç izlemedim. Aşağıdakiler ÖLÇÜLEN eksikler,
zevk yorumu değil.

- **Varlıkların %78'i kullanılmıyor** (2.844 dosyanın 633'ü bağlı). Bu
  normalin üstünde; özellikle `fx/rpg` atlasları (252 dosya) neredeyse boş
  duruyor.
- **32 mini-ikon hiç incelenmedi** — panellere amblem eklenemedi çünkü
  hangisinin ne çizdiğine bakılamadı (tarayıcı paneli görüntülenemiyordu).
- **Paneller kimliğini yeni kazandı** (vurgu rengi), ama hâlâ **amblemsiz**
  ve hepsi aynı çerçeveyi kullanıyor.
- **Boss'lar 3 sprite paylaşıyor**, 8 bölüm boss'u için.
- **Düşman ölüm/görünme animasyonları** sheet'te var, kısmen kullanılıyor.
- Ses tarafı yeni açıldı (6 arayüz sesi), **müzik hiç yok**.

**Benim önerim:** görsel yargıyı siz verin — deploy edip oynayın, "şurası
kötü" deyin, ben ölçüp düzelteyim. Bu oturumda tam olarak böyle çalıştı ve
en iyi sonucu o verdi (kart zemini, font, boss portalı hep sizin
fark etmenizle düzeldi).

---

## 7. Sıra

```
1. DEPLOY  →  2. SİZ + birkaç kişi OYNAYIN  →  3. R1 (insanlar)
→ 4. R2 (risk + ekipman)  →  5. R3/R4  →  6. taban büyüyünce TOKEN
```

⚠️ **R1'den önce deploy şart.** Sohbet ve guild yazmanın anlamı, konuşacak
insan varken başlar. Ve hiç kimse oynamadan içerik eklemek, yanlış yere
6 hafta harcamanın en garantili yoludur.
