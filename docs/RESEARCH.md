# Vampire Survivors → Solana Adaptasyonu — Derin Araştırma & Tasarım Analizi
**Tarih:** 2026-07-30 · **Durum:** Araştırma / karar öncesi · **Referans oyun:** Vampire Survivors (poncle)

---

## 1. OYUNUN ANATOMİSİ — Neden bu kadar tuttu?

### Sayılarla
| Veri | Değer |
|---|---|
| Çıkış | itch.io ücretsiz web (31 Mart 2021) → Steam EA (Ara 2021) → 1.0 (20 Eki 2022) |
| Fiyat | **$3.49** |
| Steam yorumu | ~250.000+ (%98 pozitif) |
| Metacritic | 86 |
| Achievement | 243 |
| **Orijinal teknoloji** | **Phaser (HTML5/JavaScript)** — Unity'ye v1.6'da geçti |

**Kritik bulgu:** Bu oyun tarayıcıda, JavaScript ile yazıldı ve öyle patladı. Bizim stack'imiz (Next.js + canvas) bu türü çalıştırmak için birebir uygun. BOMB Miner'daki canvas motoru deneyimi doğrudan transfer olur.

### Çekirdek döngü — 4 katman
```
KATMAN 1 (saniyeler): Sadece hareket et. Silahlar otomatik ateş eder.
   → Kontrol karmaşıklığı ~0. Tek parmakla mobil. Öğrenme süresi 3 saniye.

KATMAN 2 (dakikalar): XP mücevheri topla → level → 3 seçenekten 1 silah/pasif seç.
   → Her 20-40 saniyede bir karar. Dopamin tetikleyicisi.

KATMAN 3 (bir run, ~30 dk): Zayıf başla → ekranı temizleyen tanrıya dönüş.
   → "Power fantasy" eğrisi. Oyunun ASIL ürünü bu duygu.

KATMAN 4 (runlar arası): Altın topla → kalıcı PowerUp satın al → bir sonraki run daha güçlü.
   → Roguelite meta. Başarısız run bile ilerleme sayılır (kayıp hissi yok).
```

### Evolution sistemi — asıl derinlik burada
Silah max seviyeye gelir + **doğru pasif item** envanterde olur + **10. dakikadan sonra boss sandığı** açılır → silah evrimleşir.

| Silah | + Pasif | = Evrim |
|---|---|---|
| Whip | Hollow Heart | Bloody Tear |
| Magic Wand | Empty Tome | Holy Wand |
| Knife | Bracer | Thousand Edge |
| King Bible | Spellbinder | Unholy Vespers |
| Garlic | Pummarola | Soul Eater |
| Fire Wand | Spinach | Hellfire |
| Cross | Clover | Heaven Sword |
| Axe | Candelabrador | Death Spiral |
| Santa Water | Attractorb | La Borra |
| Lightning Ring | Duplicator | Thunder Loop |

Ek tipler: **Union** (2 silah birleşir, slot açılır), **Gift** (silah kalır, ekstra gelir), **Morph** (karakter dönüşümünde sandık gerekmez).

**Tasarım dersi:** Rastgele seçenekler sunuluyor ama oyuncu bir *plana* göre seçiyor. Rastgelelik + bilgi = tekrar oynanabilirlik. Oyun içi evrim tablosu var — oyuncu ezberlemek zorunda değil, keşfediyor.

### Meta-progression ekonomisi (bizim için altın veri)
27 PowerUp, kademeli maliyet:
- **Defang: 10 altın** (giriş kapısı — ilk satın alma anında olur)
- Might/Max Health/Recovery/Greed: 200
- Area/Speed/Duration/Magnet: 300
- Armor/Move Speed/Luck: 600
- Cooldown/Growth: 900
- Omni/Reroll: 1.000
- Curse: 1.666
- **Amount (+1 mermi): 5.000**
- **Revival: 10.000** · Charm: 10.000 · Seal I-IV: her biri 10.000
- **Hepsini maxlamak: 27.148.513 altın**

Toplam etkisi: **~2.5x hasar, ~2x can.**

**Bizim için 3 ders:**
1. **Logaritmik maliyet eğrisi.** 10 altınla başla, 10.000'e çık. Yeni oyuncu 30 saniyede ilk ödülünü alır, veteran aylarca harcayacak yer bulur.
2. **27 milyon altınlık tavan.** Sink asla dolmuyor. Token ekonomisinde bu tam olarak istediğimiz şey.
3. **Küçük artışlar.** +%5 hasar hissedilmez ama 27 kalem birikince 2.5x olur. Grind hissi vermeden baseline yükseltiyor.

---

## 2. 2026 PİYASA GERÇEĞİ — Türün durumu

- Valve **18 Mayıs 2026'da "Bullet Heaven"i resmi tür etiketi yaptı.** 4 yılda tür kristalleşti (oyun tarihinde en hızlılardan).
- Steam'de **yüzlerce** survivors-like var, çoğu unutulmuş. Piyasa **doymuş.**
- 2025 ortasında **3 oyun pazarın %75'ini** tutuyordu: Vampire Survivors, Brotato, Deep Rock Galactic: Survivor.
- Kazananın formülü (Vital Shell vakası): **inovasyon değil, "çekirdek formülde %20 iyileştirme" + net görsel kimlik.** PSX/N64 estetiği, lisanslı müzik, odaklanmış tasarım.
- Uzman uyarısı: 12-15+ ay geliştirme, tür karıştırmayın, deneyimsizseniz başka türe girin.

### Ama bizim için asıl bulgu
**Solana'da yerleşik bir survivors-like YOK.** Araştırmada çıkan Solana oyunları: SolSlay (mini-oyun/jackpot), MafiaBits (text-based MMO, 15K oyuncu), Shard Legends (ekonomi stratejisi), BITMINER. Hiçbiri bu tür değil.

**Konum:** Steam'de 300. survivors-like olmak = ölüm. Solana'da **ilk** survivors-like olmak = boş niş. Rakibimiz Brotato değil, MafiaBits ve BOMB Miner tipi Web3 oyunları — ve onların oynanış kalitesi çok düşük. Barı burada aşmak kolay.

---

## 3. ÜÇ ZOR PROBLEM (dürüst risk analizi)

### ⚠️ PROBLEM 1: Bot cenneti — bu türün Web3'e en kötü uyan yanı
Vampire Survivors'ın kontrolü **sadece hareket**. Silahlar otomatik. Bu, tasarımı harika yapan şey — ve **botlamayı çocuk oyuncağı yapan şey.**

50 satırlık bir script "en yakın kalabalıktan kaç, mücevhere yürü" yapar ve ortalama insandan iyi oynar. Kazanç run performansına bağlıysa **ekonomiyi botlar yer.** BOMB Miner'da bunu yaşadık (`/mapclear` exploit, bot farmları).

**Çözüm — deterministik seed + replay doğrulama:**
```
1. Sunucu run için seed verir (hash commit: oyuncu seed'i önceden bilemez)
2. Client oynar, TÜM input log'unu kaydeder (frame, yön vektörü, level-up seçimleri)
3. Run bitince client input log + skor gönderir
4. Sunucu aynı seed'le headless re-simülasyon yapar → skoru DOĞRULAR
   → Skor uydurmak matematiksel olarak imkânsız hale gelir
5. Input log'u davranış analizine sokulur (insan-dışı hassasiyet, sıfır varyans,
   reaksiyon süresi dağılımı) → bot tespiti
```
Bu, aynı simülasyonu iki kere yazmayı gerektirir (client + sunucu, ikisi de deterministik ve bit-bit aynı). **Projenin en pahalı ve en kritik teknik işi bu.** Kestirmesi yok. Ama bunu doğru yaparsak elde ettiğimiz şey büyük: **skor sahtekârlığı %0** ve doğrulanabilir turnuvalar.

Ek kalkan: **günlük ortak seed.** Herkes aynı gün aynı haritayı/RNG'yi oynar → skorlar birebir kıyaslanabilir, turnuva adil olur, replay'ler herkese açık izlenebilir olur.

### ⚠️ PROBLEM 2: P2E ölüm sarmalı — sektörün mezarlığı
Araştırma verisi acımasız:
- **3.200+ Web3 oyun projesinin %93'ü fiilen ölü.**
- Ortalama ömür: token %90 değer kaybı + günlük aktif <100 oyuncuya düşme = **4 ay.**
- Axie SLP: $0.40 → %99 kayıp. StepN GST: $8.51 → 2 ayda %98 kayıp.
- Ortak neden: **oynamak token BASAR.** Oyuncu artar → mint artar → satış baskısı artar → fiyat düşer → kazanç düşer → oyuncu kaçar → sarmal.
- SLP'nin tek kullanımı vardı (breeding). Tek sink, sınırsız kaynak.

**Bunun tek gerçek çözümü:** Token'ı oynamakla **BASMA.** Kazanç kaynağı emisyon değil, **yeniden dağıtım** olsun (aşağıda §5).

### ✅ PROBLEM 3 (ÇÖZÜLDÜ): Launch zamanlaması — Kintara kanıtı
İlk analizimde sektör taban oranlarına (%93 ölü, pump.fun'da %70 launch günü ölüyor) fazla ağırlık verdim. **Kintara bu itirazı geçersiz kılıyor** ve tam olarak bizim kategorimizde canlı bir kanıt:

| Kintara | Değer |
|---|---|
| Launch | **22 Mayıs 2026** (~2 ay önce) |
| Tip | **Tarayıcı tabanlı** isometrik MMO ("blockchain'de RuneScape"), indirme yok |
| Aylık aktif | **20.540** |
| Peak eşzamanlı | 800–1.300 |
| $KINS market cap | ~$12M |
| P2P marketplace | **$54.000/gün**, launch'tan beri $450.000+ |

Karar: **launch erteleme itirazı düşürüldü.** Model çalışıyor, üstelik bizimle aynı teslim biçiminde (tarayıcı, indirme yok). Bundan sonraki iş bu formülü çözüp üstüne çıkmak.

**Not edilecek gerçek risk şu değil, bu:** Kintara'yı ayakta tutan şey token değil, **canlı geliştirme.** Kaynaklar bunu özellikle vurguluyor — apartmanlar, banka sistemi, merchant döngüleri, v3.6 güncellemeleri, aktif yönetilen oyuncu tabanı. "Launch edip kaybolan" projelerden ayıran tek şey bu. Yani riskimiz launch anı değil, **launch sonrası 6 ay boyunca haftalık içerik gönderebilme kapasitemiz.**

---

## 4. "DAHA GELİŞMİŞ VERSİYON" — Adaptasyon blueprint'i

Piyasa dersi net: **inovasyon değil, %20 daha iyi + net kimlik.** O yüzden çekirdeği bozmuyoruz. Eklediğimiz her şey türün üstüne biniyor.

### Kimlik (BOMB Miner ile aynı evren)
Vampire/gotik değil — **Ghost/Bomb evreni.** Madenci karakteri, mağara derinlikleri, hayalet sürüleri. BOMB Miner'ın 3D emoji + kalın hatlı canvas stili + mevcut asset'ler ve `Emoji` sistemi doğrudan kullanılır. **Kendi görsel kimliğimiz zaten var** — türün en zor işi (differentiation) bizde çözülü.

### Çekirdek (VS'den birebir alınan, kanıtlanmış)
- Sadece hareket kontrolü, otomatik silahlar
- XP mücevheri → level → 3 seçenekten 1
- 6 silah + 6 pasif slot
- Evolution sistemi (silah max + pasif + boss sandığı)
- ~20-30 dakikalık run, dakika bazlı zorluk eğrisi
- Runlar arası kalıcı meta-progression

### Üstüne binen "gelişmiş" katmanlar
1. **Günlük Seed Turnuvası** — herkes aynı seed'i oynar, skorlar kıyaslanabilir, replay'ler izlenebilir. *(Bu tek başına türün Web3'teki farkı olur: doğrulanabilir adil rekabet.)*
2. **Guild co-op run** — BOMB Miner'da guild sistemi zaten canlı (`9c02e31`). Guild üyelerinin skorları haftalık havuza toplanır.
3. **Build paylaşımı** — bitmiş run'ın build'i paylaşılabilir link/kart olur. BOMB Miner'ın flex-card viral loop'u (`next/og`) hazır, birebir taşınır.
4. **Kalıcı silah ustalığı** — bir silahla X kill = o silah tüm runlarda +%1 (VS'de yok, uzun vadeli hedef verir)
5. **Derinlik katmanı** — Arcana benzeri modifier'lar ama BOMB evreninde: mağara derinliği seçimi (risk/ödül), derin katmanlar daha zor + daha çok ödül
6. **Asenkron PvP** — rakibinin run'ının hayalet kaydına karşı yarış

### Teknoloji
- **Frontend:** Next.js 14 + canvas (BOMB Miner motoru temel alınır) — Phaser'a gerek yok, kendi motorumuz var
- **Deterministik simülasyon çekirdeği:** client + sunucu paylaşımlı TypeScript modülü (aynı kod, iki yerde koşar — bit-bit aynı sonuç zorunlu)
- **Backend:** Node + Express + PostgreSQL (Prisma) + Redis — BOMB Miner mimarisi
- **Deploy:** Vercel + Railway
- **Mobil:** tek parmak joystick (Cavern'de zaten var)

**Tahmini süre:** çekirdek oynanış 3-4 hafta, deterministik replay doğrulama +2-3 hafta, ekonomi+token 2 hafta. Endüstri normu 12-15 ay ama biz motoru, asset'leri, backend'i, guild'i, auth'u sıfırdan yazmıyoruz.

---

## 5. TOKEN EKONOMİSİ — Kintara modeli (çift ekonomi + hold-to-play)

### Kintara'nın motoru — birebir çözümlenmiş
```
1. ERİŞİM KAPISI (hold-to-play)
   1.000 KINS tutmak = tam erişim (~$12). Satmıyor, TUTUYOR.
   → Her yeni oyuncu kalıcı alım baskısı. Token talebi oyuncu sayısına bağlanıyor.
   → "Yumuşak" kapı: satın alma değil, bakiye şartı. Oyuncu istediğinde çıkabilir.

2. GÜNLÜK DÖNGÜ GOLD'DA (soft para)
   Quest, kaynak toplama, balık, günlük görevler → GOLD.
   Gold ile yapılan marketplace satışları ÜCRETSİZ (fee yok).
   → Oyunun %90'ı token'a dokunmadan oynanır. Token fiyatı oynanışı bozmaz.

3. TOKEN KAZANCI = EMİSYON DEĞİL, OYUNCUDAN OYUNCUYA
   Oyuncu KINS'i mint ederek kazanmıyor. Farm ettiği GOLD'u
   marketplace'te başka oyuncuya KINS karşılığı SATIYOR.
   → Aceleci/zengin oyuncu KINS alır → grinder'dan GOLD alır
   → Grinder KINS kazanır. Net emisyon SIFIR.
   Ek yollar: PvP wager (Wilderness), nadir balık drop'ları.

4. BURN MEKANİKLERİ
   • KINS marketplace satışı: %5 fee → %2.5 YAKILIR + %2.5 treasury (satıcı %95 alır)
   • Ücretli spin: harcanan KINS'in %50'si KALICI YAKILIR, %50 treasury
   → Her ekonomik aktivite arzı azaltıyor.

5. HAYATTA KALMA SEBEBİ: canlı geliştirme
   Apartmanlar, banka, merchant döngüleri, v3.6... haftalık içerik.
   Kaynakların hepsi bunu "launch edip kaybolanlardan ayıran şey" diye işaretliyor.
```

**Sonuç:** Kintara, ekonomiyi turnuva havuzuyla değil **kaynak marketplace'iyle** çeviriyor. Talep tarafı hold-to-play + hız satın alma; arz tarafı grinder'ın emeği. Bu, Axie/StepN sarmalının tam tersi: oyuncu artışı token'a talep yaratıyor, satış baskısı değil.

### Bizim uyarlamamız — survivors-like bu motora Kintara'dan DAHA iyi oturuyor
RuneScape tipi kaynak toplama grindy'dir (saatler). Bir survivors-like run'ı **20 dakikalık kendi kendine kapanan bir loot seansıdır.** Yani:

```
ÇİFT EKONOMİ

🪙 GOLD (soft, zincir dışı, sınırsız)
   Kaynak: her run (VS'nin altını) + günlük görevler + bölüm ilk-geçiş ödülleri
   Sink: 27 kalemlik PowerUp ağacı (10 → 10.000 eğrisi, tavan ~27M)
         karakter/silah unlock, revive, envanter slotu
   Marketplace: GOLD ile satış FEE-FREE (Kintara'daki gibi — likiditeyi teşvik et)
   → Token'a hiç dokunmadan oyunun tamamı oynanabilir

💣 TOKEN (pump.fun)
   TALEP (neden alınır):
     • HOLD-TO-PLAY: X token tutmak = derin bölümler + turnuva + guild kurma açık
       (Kintara ~$12 seviyesinde tuttu — erişilebilir tutmak kritik)
     • Marketplace'te material/GOLD satın almak (grinder'dan)
     • Ücretli spin, prestige kilidi, kozmetik (skin/aura/isim rengi/çerçeve)
   ARZ (nasıl kazanılır — HEPSİ yeniden dağıtım, mint YOK):
     • Farm ettiği material/GOLD'u marketplace'te token karşılığı satmak  ← ANA YOL
     • Haftalık turnuva havuzu (giriş ücretlerinden, sıfır toplamlı)
     • Guild haftalık havuzu
     • Referral yarışması ödülleri (treasury buyback'inden)
   BURN:
     • Marketplace token satışı %5 → %2.5 burn + %2.5 treasury
     • Ücretli spin: %50 burn
     • Prestige kilidi: %100 burn (kalıcı, tekrarlanamaz → temiz sink)
     • SOL gelirinin %50'si → buyback + burn (pump.fun'ın kendi politikası)
```

### Neden bu denge tutar
| Senaryo | Kintara/bizim model | Axie/StepN modeli |
|---|---|---|
| Oyuncu artışı | Hold-to-play talebi artar → fiyat ↑ | Mint artar → satış baskısı → fiyat ↓ |
| Oyuncu azalması | Arz da azalır, mint olmadığı için çöküş yok | Emisyon devam eder → çöküş |
| Grinder | Emeğini token'a çevirir (alıcı var) | Token basar, herkes satar |
| Balina | Token alır, grinder'ı besler | Token basar, grinder'la rekabet eder |

---

## 5B. İSTEDİĞİN ÖZELLİKLER — motora nasıl bağlanıyor

Saydığın her şey Kintara motorunun parçası. Rastgele eklenti değil, ekonominin dişlileri:

| Özellik | Ekonomideki işlevi | Bizde durum |
|---|---|---|
| **Bölüm bölüm (stages)** | Her bölüm farklı material düşürür → farklı fiyatlı arz kalemleri. Derin bölümler hold-to-play arkasında → token talebi | Survivors-like'a doğal: VS'de zaten Mad Forest/Dairy Plant/Gallo Tower var |
| **Material parçaları** | **Marketplace'in ticaret malı = token flywheel'ın yakıtı.** Grinder'ın emeğinin token'a dönüştüğü nokta | BOMB Miner'da material sistemi + Fusion var (`gear-system-state`) |
| **Marketplace** | Token'ın ana kullanım yeri + %5 fee → %2.5 burn. **Ekonominin kalbi** | BOMB Miner marketplace CANLI, imza güvenliği çözülü (`1fffed5`) |
| **Guild** | Haftalık havuz + sosyal retention. Guild kurma token sink'i | BOMB Miner'da CANLI (`9c02e31`) — guild points, haftalık settle cron |
| **Görevler (missions)** | Günlük GOLD kaynağı + retention. Oyuncuyu her gün geri getiren şey | BOMB Miner'da mission/quest sistemi var |
| **Profile** | Showcase + flex = viral loop. Build paylaşımı buradan | BOMB Miner profile + feedback + flex-card CANLI |
| **Davet et & kazan** | Ücretsiz büyüme kanalı. Kintara'nın çözemediği şey bu — bizim avantajımız | BOMB Miner referral + flex-card viral loop CANLI |
| **Referral yarışması** | Periyodik büyüme patlaması. Ödül treasury buyback'inden (emisyon değil) | Zealy kampanyası deneyimi + ödül dağıtım akışı hazır |

**Kritik gözlem:** Bu listenin %70'i BOMB Miner'da çalışıyor durumda. Yeni yazacağımız asıl şey **survivors-like çekirdek motoru** + **material→marketplace bağı**. Diğerleri taşıma işi.

---

## 6. IP GÜVENLİĞİ
- **Tür mekaniği korunmuyor.** VS'nin kendisi *Magic Survival*'dan (LEME, Kore) esinlendi. Brotato, 20 Minutes Till Dawn, Halls of Torment aynı şeyi yaptı — hepsi legal.
- **Korunan:** spesifik kod, sprite/art, müzik, isimler.
- **Kural:** "Bloody Tear", "Unholy Vespers" gibi isimleri KULLANMA. Kendi isimlerimiz, kendi sprite'larımız, kendi müziğimiz. BOMB/Ghost evreni bunu doğal olarak çözüyor.
- Poncle 1:1 asset/kod çalan klonlara tepki gösterdi; ilham alan oyunlara göstermedi.

---

## 7. KARAR NOKTALARI

**Kapanan kararlar:**
- ✅ pump.fun'da token çıkarılacak (Kintara kanıtı; erteleme itirazı düşürüldü)
- ✅ Çift ekonomi: GOLD (soft) + TOKEN (on-chain), Kintara modeli
- ✅ Hold-to-play erişim kapısı
- ✅ Bölümler, material'lar, marketplace, guild, görevler, profile, referral yarışması

**Açık kalanlar:**
1. **Ayrı proje mi, BOMB Miner içinde yeni oyun modu mu?**
   - *İçinde:* 307 hazır oyuncu, hazır auth/guild/marketplace/referral, ayrı token gerekmez — ama BOMB token'ı henüz çıkmadı, iki oyun tek token'ı paylaşır
   - *Ayrı:* temiz launch anlatısı + kendi token'ı (pump.fun) — ama sıfır oyuncudan başlar, altyapı kopyalanır
   - *Melez (önerim):* ayrı repo/marka + ayrı token, ama BOMB Miner altyapısı fork'lanır ve mevcut 307 oyuncuya cross-promo yapılır
2. **Hold-to-play eşiği ne olsun?** Kintara ~$12'de tuttu. Bizde $10-15 bandı mı, daha düşük mü? (Düşük = geniş funnel, yüksek = güçlü talep)
3. **Deterministik replay doğrulaması:** Material'lar marketplace'te token'a dönüştüğü için botlar material fiyatını çökertip grinder'ın kazancını sıfırlar. Mimariye **baştan** girmesi gerekir, sonradan eklenmez. Yapıyor muyuz?
4. **Kimlik/tema:** BOMB/Ghost evreninin devamı mı, yeni bir dünya mı?

---

## 8. KINTARA'YA KARŞI AVANTAJLARIMIZ (rekabet analizi)

Kintara 2 ayda 20K MAU yaptı. Bizim ondan üstün olabileceğimiz yerler:

1. **Oynanış kalitesi.** Kintara isometrik MMO — grindy, yavaş, "RuneScape hissi". Survivors-like **ilk 3 saniyede** anlaşılır ve 20 dakikada power-fantasy zirvesi verir. Retention için çok daha güçlü çekirdek.
2. **Mobil.** Tek parmak/hareket kontrolü. MMO mobilde acı çeker, survivors-like mobilde parlar. Kintara'nın ulaşamadığı kitle.
3. **Session uzunluğu.** 20 dk kapalı run = "bir tur daha" döngüsü. MMO'da oturum açık uçlu, oyuncu kaybı daha kolay.
4. **Viral loop.** Referral + flex-card + build paylaşımı BOMB Miner'da çalışıyor. Kintara'da bu kanal zayıf.
5. **Hazır altyapı.** Auth, guild, marketplace (imza güvenliği çözülü), mission, profile, referral, ödül dağıtımı — hepsi canlı kod. Onlar 2 ayda yazdı, bizde hazır.

**Zayıf olduğumuz yer:** Kintara'nın ekonomisi ve topluluğu 2 aylık ilerde, $12M mcap ve $54K/gün ticaret hacmi var. Onları taklit değil, **farklı kitle** hedeflemeliyiz: mobil + hızlı oturum + arcade.

---

## KAYNAKLAR
- Steam: https://store.steampowered.com/app/1794680/Vampire_Survivors/
- itch.io: https://poncle.itch.io/vampire-survivors
- Evolution wiki: https://vampire.survivors.wiki/w/Evolution
- PowerUps wiki: https://vampire.survivors.wiki/w/PowerUps
- 2026 Bullet Heaven piyasa raporu: https://howtomarketagame.com/2026/05/19/2026-state-of-bullet-heavens-how-vital-shell-succeeded/
- Tür döngüsü: https://howtomarketagame.com/2025/11/12/the-cycle-of-a-hit-genre/
- Tasarım analizi: https://www.kokutech.com/blog/gamedev/design-patterns/power-fantasy/vampire-survivors
- pump.fun mekanikleri: https://www.dextools.io/tutorials/what-is-pump-fun-solana-memecoin-launchpad-2026
- pump.fun burn/buyback: https://www.theblock.co/post/399288/pump-fun-burns-370-million-pump
- pump.fun ölüm oranı: https://cryptopotato.com/nearly-70-of-pump-fun-tokens-die-on-launch-day/
- P2E başarısızlık analizi: https://www.charterless.com/p/play-to-ponzi-stepn-and-the-economics
- Ekonomik exploit'ler: https://chainscorelabs.com/blog/security-post-mortems-hacks-and-exploits/nft-and-gaming-exploits/why-economic-exploits-will-sink-more-games-than-code-bugs
