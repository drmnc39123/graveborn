# $GRAVE — token bacağı tasarımı

Bu bir yol haritası değil, **karar belgesi**. Token çıkarıldığı gün açılacak
kod yolunu, kapalı kalması gereken kapıları ve daha şimdiden bilinen tuzakları
yazıyor. Kod YAZILMADI ve bilerek yazılmadı: kullanıcı token işini "oyun
bitene kadar" erteledi, oyun yeni bitti.

Yazılırken ölçülenler bu belgenin dayanağı — tahmin yok:
tekrar koşusu **6.124 gold/saat**, Forge ağacı **255.694 gold ≈ 42 saat**,
kampanyanın tamamı ağacın **%31,9**'u.

---

## 0. Bugün elde ne var (ölçüldü)

| | Durum |
|---|---|
| Marketplace ilan açma | ✅ çalışıyor, gold **atomik escrow**'a alınıyor |
| İlan iptali | ✅ gold escrow'dan geri dönüyor |
| Emir defteri (listeleme) | ✅ çalışıyor |
| **Satın alma** | 🔴 `buyListing()` → **503 `token_yok`** |
| Komisyon matematiği | ✅ `feeSplit()` yazılı ve test edilmiş: %5 → 2,5 burn + 2,5 hazine |
| Gold ilanı komisyonu | ✅ **%0** (Kintara yapısı) |
| Cüzdan girişi | ✅ Phantom `signMessage` + nonce + tweetnacl doğrulama |
| **On-chain kütüphane** | 🔴 **HİÇ YOK** — ne backend'de ne frontend'de `@solana/web3.js` |

⚠️ Son satır en önemlisi: bugünkü cüzdan entegrasyonu **sadece imza**.
Zincire hiç dokunulmuyor. Token bacağı, projeye ilk kez gerçek bir zincir
bağımlılığı sokacak.

---

## 1. Değişmeyen kural: OYUN TOKEN BASMAZ

`market.ts` sıfır emisyonla yazıldı ve öyle kalmalı. Token daima **başka bir
oyuncunun cüzdanından** gelir. Hazine dağıtım yapmaz, ödül havuzu yoktur,
"stake et kazan" yoktur.

**Bu bir tercih değil, araştırmadan çıkan sonuç.** AFK Heroes ölçüldü
(bkz. oturum notları): 6.000 aktif oyuncu, 5.305 **ödeyen** kullanıcı,
23.000 işlem — ve token tepeden **%90 aşağı**. Sebebi net: oyuncular
yatırıyor, ortak havuzdan dağıtılıyordu (ilk hafta 378,9M yatırım / 126M
ödeme). Havuz oyuncunun kendi parasıysa oyun bir yeniden dağıtım şemasına
döner ve ilk çıkan kazanır. Oyuncu sayısı token değerine dönüşmez.

---

## 2. Açılacak tek kod yolu: `buyListing()`

Bugün 503 dönen fonksiyon. Doldurulduğunda yapacağı iş:

```
alıcı  →  satıcıya  %95 $GRAVE   (on-chain transfer)
alıcı  →  hazineye  %2,5 $GRAVE
alıcı  →  burn      %2,5 $GRAVE
sunucu →  alıcıya   escrow'daki gold  (DB)
```

### ⚠️ Sıra ve doğrulama — buradaki hatanın bedeli gerçek para

1. **Zincir ÖNCE, DB SONRA.** Gold'u önce verip transferi sonra beklemek
   "para gitmedi eşya gitti" demektir.
2. **İmza tek kullanımlık.** `paymentSig` alanı şemada `@unique` — aynı
   transfer iki farklı ilanı satın alamaz. (Bu kural BOMB Miner'da bir kez
   ısırdı, orada da `@unique` ile kapandı.)
3. **Sunucu zinciri KENDİ okur.** İstemcinin "ödedim" demesi kanıt değil;
   `getTransaction` ile teyit edilir.
4. **Teyit edilecek dört şey:** imza var mı · `meta.err` **null mu** ·
   alıcı/miktar/mint doğru mu · işlem yeterince onaylanmış mı.
   ⚠️ Dördüncüsü atlanırsa reorg riski; ikincisi atlanırsa **başarısız
   işlem kabul edilir** — Ghost Hunter'da tam bu açıktan 42,7 SOL kaybedildi
   (`verifySOLTransaction` olayı). Aynı hatayı iki kez yapmayalım.
5. **Escrow ATOMİK boşaltılır:** `updateMany` + koşullu `status: 'ACTIVE'`.
   İki alıcı aynı ilanı alamaz.

### Gerekecek bağımlılık
`@solana/web3.js` (+ SPL token okuma). Backend'e tek yönlü: sunucu
**sadece okur**, imza atmaz, anahtar tutmaz.
⚠️ Hazine özel anahtarı bu projede **hiç bulunmamalı** — alıcı doğrudan
hazine adresine transfer eder, sunucu sadece doğrular.

---

## 3. Exchange (alış emirleri) — token'sız YAPILAMAZ

Ölçülmüş kısıt, tekrar tekrar gündeme geldiği için buraya yazıldı:

**Alış emri**, alıcının $GRAVE'ini escrow'a almayı gerektirir. Token yokken
escrow'a alınacak bir şey yok → emir defteri boş kalır. Bu bir eksiklik değil,
**sıra**: önce token, sonra Exchange.

---

## 4. Hold-to-play eşiği

Kintara'da doğrulandı: **minimum 1.000 $KINS cüzdanda** olmadan giriş yok.

⚠️ **ADET DEĞİL, DOLAR HEDEFLİ OLMALI ve KODA GÖMÜLMEMELİ.** 1.000 adet
launch günü 10 dolarsa altı ay sonra 400 dolar olabilir; sabit adet, eşiği
sessizce bir duvara çevirir. Doğrusu: eşik bir **env değişkeni**, dolar
hedefine göre elle ayarlanır.

⚠️ **Yumuşak olmalı.** BOMB Miner planında alınan karar: sert hold-to-play
huniyi öldürüyor. Demo modu her zaman açık kalmalı — oyuncu önce oynasın.
Eşik, ekonomiye (market/çekim) girişi kapatır, **oyuna girişi değil**.

---

## 5. Gelir — biz nasıl kazanacağız

Öncelik sırasıyla, hepsi zaten kodda ya da kolay:

1. **Marketplace komisyonu** — `feeSplit()` hazır. %5'in yarısı burn, yarısı
   hazine. Hacim arttıkça gelir; hacim de gold'a talep varsa oluşur ve o
   talep artık var (Reliquary · Ossuary · Wager · Stall · **Crypt Deed**).
2. **Kozmetik satışı (SOL)** — en temiz gelir; token ekonomisine hiç
   dokunmaz, enflasyon yaratmaz.
3. **Premium gacha / spin (token)** — token'a sürekli talep + burn.
4. **Hold-to-play** — yukarıdaki uyarılarla.
5. **Sezon geçişi** — SOL ya da token.

---

## 6. Launch zamanlaması

BOMB Miner'da alınan ve burada da geçerli olan karar: **ince tabana launch =
ölüm.** Token, oyuncu sayısı anlamlı bir eşiğe gelmeden çıkarılmamalı.
AFK Heroes'un rakamları bunun kanıtı — 6.000 aktif oyuncu bile yetmedi,
çünkü model yanlıştı; model doğruyken de taban gerekiyor.

Sıra: **deploy → oyuncu → token**. Tersi değil.

---

## 7. Açılış günü kontrol listesi

- [ ] `TOKEN_MINT` env'e yazıldı (mint adresi)
- [ ] `TREASURY_ADDRESS` env'e yazıldı
- [ ] `buyListing()` yazıldı ve **testnet'te** uçtan uca denendi
- [ ] `paymentSig` tekilliği testle doğrulandı (aynı imza iki kez → red)
- [ ] Başarısız işlem (`meta.err != null`) reddediliyor mu — **test şart**
- [ ] Escrow yarışı testi: iki alıcı aynı ilan → biri geçer
- [ ] Exchange açıldı
- [x] Hold-to-play eşiği **yazıldı ve mühürlendi** (`hold.ts` + `rpc.ts`,
      `hold.test.mts` 14 kontrol). Açmak için: `TOKEN_MINT` + `HOLD_MIN`
      (insan okunur adet) — ikisi birden olmadan kapı tamamen açık.
- [ ] `RPC_URLS` özel sağlayıcıyla dolduruldu (**eşiği açmadan önce**;
      genel uç hız sınırlı)
- [ ] `HOLD_MIN` dolar hedefine göre ayarlandı (adet DEĞİL, dolar hedefi)
- [ ] `/market/buy` yazılırken `/market/list`teki üç satırlık eşik kontrolü
      **oraya da kopyalandı** (kod içinde uyarı olarak duruyor)
- [ ] Ana sayfadaki "token çıkmadı, kontrat adresi yok" metni güncellendi

---

## 8. Bu belgede OLMAYAN şeyler ve nedeni

- **Tokenomics dağılımı / vesting** — piyasa kararı, kod kararı değil.
- **pump.fun mı, kendi mint'imiz mi** — launch anında verilecek.
- **Airdrop** — BOMB Miner'da ölçüldü: airdrop çarpışması + huni intiharı.
  Yapılacaksa vested ve tavanlı.
