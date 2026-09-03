-- MOTOR SÜRÜM DAMGASI.
--
-- Seed tek başına bir koşuyu TARİF ETMİYOR — seed + motor sürümü ediyor.
-- `@game/config` SIM_VERSION arttığı an aynı seed başka bir koşu üretiyor,
-- yani eski bir düello kaydı yeni motorla tekrar oynatıldığında kazanan
-- sessizce değişebiliyordu.
--
-- ⚠️ VARSAYILAN 0 KASITLI. Gerçek bir SIM_VERSION asla 0 değil, bu yüzden
-- damgadan önce yazılmış her satır hiçbir sürüme eşit çıkmıyor ve
-- kendiliğinden "tekrar oynatılamaz" sayılıyor. Güvenli tarafa kapalı:
-- şüpheli kayıt oynanmasın, yanlış sonuç üretmesin.
ALTER TABLE "Run" ADD COLUMN "simVersion" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "DuelRecord" ADD COLUMN "simVersion" INTEGER NOT NULL DEFAULT 0;
