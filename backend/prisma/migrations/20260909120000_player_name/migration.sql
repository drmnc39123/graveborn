-- OYUNCU ADI. Ad bir KIMLIK: iki oyuncuya ayni ad dusemez.
--
-- ⚠️ IKI SUTUN, VE SEBEBI SOMUT: `name` yazildigi gibi gosteriliyor,
-- `nameKey` benzersizligi tasiyor (kucuk harf + ayraclar atilmis +
-- karistirilabilir harfler Latin'e katlanmis). `name`i dogrudan UNIQUE
-- yapmak yetmezdi: Postgres karsilastirmasi harf duyarli, yani "Ashen" ve
-- "ashen" ikisi de alinabilirdi. Daha kotusu Kiril "а" ile Latin "a"
-- ekranda AYNI gorunur.
--
-- ⚠️ NULLABLE: mevcut oyuncular adsiz kaliyor ve ilk giriste soruluyor.
-- Zorunlu yapmak, calisan bir uretim veritabanina deger uydurmak demekti.
ALTER TABLE "Player" ADD COLUMN "name" TEXT;
ALTER TABLE "Player" ADD COLUMN "nameKey" TEXT;
ALTER TABLE "Player" ADD COLUMN "renames" INTEGER NOT NULL DEFAULT 0;

CREATE UNIQUE INDEX "Player_nameKey_key" ON "Player"("nameKey");
