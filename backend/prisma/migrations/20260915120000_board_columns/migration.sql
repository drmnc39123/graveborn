-- LEADERBOARDS SÜTUNLARI — "en çok gold kazanan" ve "Forge" panoları.
--
-- ⚠️ YALNIZ SÜTUN + İNDEKS. DOLDURMA BURADA YAPILMIYOR, ve sebebi somut:
--   · Railway sıfır kesintili geçişte ESKİ konteyner yeni migration
--     uygulanırken yazmaya devam ediyor. Burada doldurulan `goldEarned`,
--     eski konteynerin o arada kapattığı koşuları kaçırırdı.
--   · JSON üzerinden toplam alan bir UPDATE bozuk bir satırda hata verirse
--     migration yarıda kalır ve deploy KİLİTLENİR.
-- Doldurma idempotent `POST /admin/boards/recompute` ile, deploy SONRASI.
--
-- ⚠️ `dust` indeksi de burada: toz panosu mevcut sütunu sıralıyor ve indeks
-- olmadan her okuma tam tarama yapardı.
ALTER TABLE "Player" ADD COLUMN "forgeLevels" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "goldEarned" INTEGER NOT NULL DEFAULT 0;

CREATE INDEX "Player_goldEarned_idx" ON "Player"("goldEarned");

CREATE INDEX "Player_forgeLevels_idx" ON "Player"("forgeLevels");

CREATE INDEX "Player_dust_idx" ON "Player"("dust");
