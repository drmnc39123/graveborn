# Survivors (kod adı) — Mimari & Faz Faz Geliştirme Planı
**Tarih:** 2026-07-30 · **Model:** Kintara (çift ekonomi + hold-to-play + marketplace flywheel)
**Araştırma:** bkz. `SURVIVORS-RESEARCH.md`

---

## KİLİTLENEN KARARLAR

| Karar | Değer |
|---|---|
| Tür | Survivors-like (bullet heaven) — sadece hareket, otomatik silahlar |
| Teslim | Tarayıcı, indirme yok (Kintara ile aynı — sürtünmesiz onboarding) |
| Zincir | Solana |
| Token | **Yeni token, pump.fun launch** |
| Erişim | **Hold-to-play: 10.000 token tutmak** (satın alma değil, bakiye şartı) |
| Ekonomi | Çift para: **GOLD** (soft) + **TOKEN** (on-chain) |
| Kazanç kaynağı | **Emisyon YOK** — marketplace'te oyuncudan oyuncuya |
| Gelir modeli | Marketplace fee (Kintara gibi "dönen paradan") + burn |
| Bot politikası | Admin panel izleme + sunucu-otoriteli ödül tavanları (full replay doğrulaması YOK — kullanıcı kararı) |
| Tanıtım | X profili + LootRadar üzerinden, zamanla |
| Öncelik | **Sistemin hatasız oturması** > hız |

---

## ⚠️ HOLD-TO-PLAY EŞİĞİ — SABİT 10K TEHLİKELİ, AYARLANABİLİR OLMALI

pump.fun standart arzı 1B token. 10.000 token = arzın %0.001'i. Kapının **dolar maliyeti tamamen fiyata bağlı**:

| Market cap | Token fiyatı | 10K tutmanın maliyeti |
|---|---|---|
| $69K (graduation) | $0.000069 | **$0.69** |
| $250K | $0.00025 | $2.50 |
| **$1M** | $0.001 | **$10.00** ← Kintara seviyesi, ideal |
| $3M | $0.003 | $30 |
| **$12M** (Kintara mcap) | $0.012 | **$120** ← Kintara'nın kapısının 10 KATI |
| $50M | $0.05 | **$500** ← funnel ölür |

**Sorun:** Token başarılı olursa kapı duvara dönüşür. Oyun tam büyümesi gerektiği anda yeni oyuncu girişi tıkanır. Kintara 1.000 KINS ile ~$12'de tuttu — erişilebilirlik kasıtlı.

**Çözüm (mimariye baştan koy):** Eşik **DB/Redis'te admin-ayarlanabilir** bir değer olsun, koda gömülmesin.
```
minHoldTokens: Redis key `game:gate:minHold`  (başlangıç 10.000)
Admin panelinde tek input + "şu an ~$X'e denk geliyor" göstergesi (fiyat API'sinden)
Politika: kapıyı ~$10–15 bandında tut → fiyat 10x olursa eşiği 10x düşür
```
Bu, hem tek satır iş hem de ekonominin en kritik ayar vidası. Sabit sayı yazarsak sonra migration + duyuru krizi olur.

**Ek:** Grace period. Eşik yükselirse mevcut oyuncular anında kapı dışında kalmasın (`gateGrantedUntil` alanı).

---

## BOT / GÜVENLİK — senin kararına göre sadeleştirilmiş katman

Full deterministik replay doğrulaması **yapılmıyor**. Bunun yerine ucuz ve normal mimarinin parçası olan 4 katman:

```
KATMAN 1 — Sunucu-otoriteli ekonomi sınırları  (ZORUNLU, pahalı değil)
  Client "10.000 material kazandım" DİYEMEZ.
  Sunucu run özetini alır ve KENDİ hesaplar:
    • Run süresi × bölüm drop tavanı = maksimum olası material
    • Aşan istek → reddedilir + flag
  → Skoru şişirmek mümkün ama ÖDÜLÜ şişirmek mümkün değil.
  (BOMB Miner'da bu desen zaten var — server-authoritative)

KATMAN 2 — Anomali tespiti (admin panele besleme)
  • Saat başına run sayısı (insan üst sınırı var, 24/7 farm görünür)
  • Skor varyansı ~0 (bot deterministik oynar, insan değil)
  • Aynı IP/subnet'te çoklu hesap (BOMB Miner'da hazır: Security tab)
  • Material satış hızı vs run sayısı tutarsızlığı
  → Şüpheliler admin panelde listelenir, sen karar verirsin

KATMAN 3 — Hold-to-play doğal caydırıcı
  Her bot hesabı 10K token TUTMAK zorunda.
  → 100 botluk farm = 1.000.000 token kilitlemek. Botlamak sermaye ister.
  → Bu tek başına en güçlü anti-bot mekanizması. (Kintara'nın da gizli kalkanı bu.)

KATMAN 4 — Ban aracı
  BOMB Miner'da `POST /admin/ban` hazır (dryRun + resetProgress + istatistik)
  → Birebir taşınır.
```
**Not:** Katman 1 pazarlık konusu değil — o olmadan tek bir `curl` isteği sınırsız material basar. Katman 3 sayesinde bot ekonomisi zaten zor; Katman 1+2 kalanı kapatıyor.

---

## MİMARİ

```
┌─ FRONTEND (Next.js 14 + TS, Vercel) ────────────────────────┐
│  /              landing + tokenomics + hold-to-play kapısı   │
│  /play          CANVAS OYUN MOTORU  ← asıl yeni iş           │
│  /stages        bölüm seçimi (derin bölümler kapı arkasında)  │
│  /upgrades      GOLD ile PowerUp ağacı (27 kalem)            │
│  /market        material/GOLD ↔ TOKEN marketplace            │
│  /guild         guild yönetimi + haftalık havuz              │
│  /missions      günlük/haftalık görevler                     │
│  /profile       istatistik + build showcase + feedback       │
│  /referral      davet et & kazan + yarışma tablosu           │
│  /leaderboard   bölüm bazlı + haftalık                       │
│  /admin<gizli>  oyuncu izleme, anomali, ban, eşik ayarı      │
└──────────────────────────────────────────────────────────────┘
┌─ BACKEND (Node + Express + TS, Railway) ─────────────────────┐
│  PostgreSQL (Prisma) · Redis (cache/lock/kapı eşiği)         │
│  /auth      cüzdan bağla + hold-to-play doğrulama (RPC)      │
│  /run       run başlat (seed ver) / bitir (ödül HESAPLA)     │
│  /economy   GOLD, material envanteri, PowerUp satın alma     │
│  /market    listeleme / satın alma / %5 fee → %2.5 burn      │
│  /guild /missions /referral /leaderboard /admin              │
│  cron: haftalık guild+turnuva settle, buyback+burn, temizlik │
└──────────────────────────────────────────────────────────────┘
```

**BOMB Miner'dan fork edilecek (yeniden yazılmayacak):**
auth akışı · admin panel iskeleti + Security/ban araçları · marketplace (imza güvenliği çözülü, `1fffed5`) · guild (haftalık settle cron dahil, `9c02e31`) · mission/quest · profile + feedback (+ yeni resim yükleme) · referral + flex-card viral loop · rate limiting (cüzdan bazlı) · Emoji/tema sistemi · ödül dağıtım akışı

**Sıfırdan yazılacak:** survivors-like canvas motoru · material drop → marketplace bağı · bölüm/stage sistemi · PowerUp ağacı

---

## OYUN MOTORU — teknik çekirdek

```
Sabit timestep simülasyon (60Hz mantık, render ayrı)
Spatial hash grid çarpışma  ← 500+ düşman için ZORUNLU (naive O(n²) çöker)
Object pooling (düşman/mermi/mücevher)  ← GC spike = frame drop
Offscreen canvas + sprite atlas
Seeded RNG (mulberry32) — run tekrar üretilebilir, leaderboard adil

Hedef: 500 düşman + 200 mermi @ 60fps masaüstü / 45fps orta segment mobil
```
Silah slotu 6 + pasif slotu 6. Evolution: silah max + doğru pasif + boss sandığı (VS formülü, kendi isimlerimizle).

---

## EKONOMİ AKIŞI — tek diyagram

```
                    ┌──────────────────┐
   RUN OYNA ───────►│  GOLD + MATERIAL │
   (20 dk)          └────────┬─────────┘
                             │
              ┌──────────────┴──────────────┐
              ▼                             ▼
      ┌───────────────┐          ┌─────────────────────┐
      │ POWERUP AĞACI │          │    MARKETPLACE      │
      │ (GOLD sink)   │          │ material/GOLD satar │
      │ 10 → 10.000   │          │   TOKEN kazanır     │
      └───────────────┘          └──────────┬──────────┘
                                            │ %5 fee
                                   ┌────────┴────────┐
                                   ▼                 ▼
                              %2.5 BURN        %2.5 TREASURY
                                                     │
                                              buyback + ödül havuzu

   TOKEN TALEBİ:  hold-to-play (10K) · material satın alma · spin (%50 burn)
                  prestige kilidi (%100 burn) · kozmetik
   TOKEN ARZI:    SADECE oyuncular arası transfer — MINT YOK
```

---

## FAZLAR

### FAZ 0 — İskelet (3-4 gün)
Repo + Next.js + Express + Prisma şema + Railway/Vercel deploy + cüzdan bağlama
**Çıktı:** boş ama canlı iki servis, cüzdan bağlanıyor

### FAZ 1 — OYUN MOTORU (2-3 hafta) ← projenin kalbi
Sabit timestep loop · spatial hash · pooling · oyuncu hareketi (klavye + mobil joystick) · düşman spawn dalgaları · 6 silah + otomatik ateş · XP mücevheri + level-up 3-seçenek · 6 pasif · evolution · boss + sandık · HUD · ölüm/sonuç ekranı
**Çıktı:** tek bölüm, tam oynanabilir 20 dakikalık run, ekonomi YOK
**Kabul kriteri:** 500 düşman @ 60fps, gerçek telefonda 45fps

### FAZ 2 — Ekonomi çekirdeği (1 hafta)
Run sonucu → sunucu-otoriteli GOLD/material hesabı (Katman 1 tavanları) · envanter · 27 kalemlik PowerUp ağacı · kalıcı ilerleme
**Çıktı:** roguelite meta döngüsü kapandı, oyun tek başına tutuyor

### FAZ 3 — Bölümler + material çeşitliliği (4-5 gün)
5 bölüm, her biri farklı düşman seti + farklı material düşürür · zorluk eğrileri · ilk-geçiş ödülleri · leaderboard
**Çıktı:** içerik derinliği + arz kalemleri çeşitlendi

### FAZ 4 — TOKEN + hold-to-play + marketplace (1-1.5 hafta)
pump.fun launch · RPC bakiye doğrulama (ayarlanabilir eşik + grace) · marketplace listeleme/satın alma · %5 fee → %2.5 burn · treasury buyback cron
**Çıktı:** ekonomi flywheel'ı dönüyor
**⚠️ Bu faz bitene kadar token ÇIKMAZ** — token'ın ilk gününde harcanacak yer olmalı

### FAZ 5 — Sosyal + büyüme (1 hafta)
Guild + haftalık havuz · günlük/haftalık görevler · profile + showcase · davet et & kazan · referral yarışması · flex-card
**Çıktı:** retention + viral loop

### FAZ 6 — Admin + güvenlik + cila (4-5 gün)
Admin panel (oyuncu izleme, anomali listesi, ban, eşik ayarı) · ses · tutorial · mobil cila · yük testi
**Çıktı:** launch hazır

**Toplam: ~7-9 hafta.** (Endüstri normu bu tür için 12-15 ay; biz altyapıyı fork'luyoruz ve motor deneyimimiz var.)

---

## ALTYAPI — tamamen ayrı proje (karar verildi)

| Katman | Karar | Not |
|---|---|---|
| Repo | **Yeni GitHub hesabı** + yeni repo | BOMB Miner / LootRadar'dan bağımsız |
| Lokal | `C:\<isim>` ayrı klasör | ghost-hunter / bomb-miner ile karışmaz |
| Backend | **Ayrı Railway projesi** (ayrı DB + Redis) | Ekonomiler izole — birinin çökmesi diğerini etkilemez |
| Frontend | **Mevcut Vercel hesabı**, yeni proje | Ekstra ücret yok (Pro planda çoklu proje) |
| Token | Yeni pump.fun token'ı | BOMB token'ından bağımsız |

### ⚠️ İKİ BİLİNEN TUZAK — baştan kur, sonra acı çekme

**1. Git credential çakışması (yaşandı)**
BOMB Miner (`bombminersol-cmd`) ve LootRadar (`lootradarr-gif`) ayrı GitHub hesapları. Aynı `github.com` kimliği çakıştı → push "Repository not found" verdi.
```bash
git config --global credential.useHttpPath true
```
+ remote URL'e username hint'i koy. **Üçüncü hesapta aynı tuzak birebir tekrar eder.** Repo kurulumunda ilk iş bu.

**2. Vercel ↔ GitHub namespace bağlanmıyor (yaşandı)**
LootRadar'da mevcut Vercel hesabı + farklı GitHub hesabı kombinasyonunda **GitHub push OTOMATİK deploy ETMEDİ** — hesaplar arası namespace bağlanamadı. Deploy hâlâ Vercel CLI upload ile yapılıyor.

Aynı kombinasyon burada da olacak (mevcut Vercel + yeni GitHub). İki seçenek:
- **A)** Vercel CLI ile deploy (LootRadar'da çalışan bilinen yol — ama her deploy manuel)
- **B)** Kurulumda Vercel'e yeni GitHub hesabını **GitHub App olarak yetkilendirmeyi dene** (LootRadar'da denendi, olmadı; ama repo baştan o hesapta açılırsa şansı var)

**Önerim:** Faz 0'da B'yi 15 dakika dene, olmazsa A'ya geç ve deploy scripti yaz. Otomatik deploy çalışmazsa Faz 4+ boyunca her düzeltme manuel upload demektir — bunu şimdi çözmek sonra saatler kazandırır.

---

## SIRADAKİ KARARLAR
1. **İsim + tema** — Yeni dünya mı, yoksa Ghost/BOMB evreniyle görsel akrabalık mı? Repo adı, token ticker'ı, GitHub hesabı hepsi buna bağlı. **Bu tek karar Faz 0'ı açıyor.**
2. **Faz 1'e başlıyor muyum?** Motor en uzun kalem (2-3 hafta) ve paralel yürüyecek işi yok — isim gelince başlarım.
