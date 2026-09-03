-- ══════════════════════════════════════════════════════════════════════
-- TEMEL ŞEMA — tek migration, şemanın tamamı.
-- ══════════════════════════════════════════════════════════════════════
--
-- 🔴 NİYE YENİDEN YAZILDI (2026-09-03): eski `0_baseline` yalnız **9**
-- tablo yaratıyordu, şemada **20** model var. Geçmişte HİÇ bulunmayan 11
-- tablo: CryptVault · Duel · DuelRecord · Follow · GearItem · Guild ·
-- PvpAward · PvpClose · ServerFlag · Ticket · TicketMessage — yani lonca,
-- ekipman, düello/PvP, destek biletleri, kasa ve BAKIM BAYRAĞI.
--
-- Sebep: yerel veritabanı `prisma db push` ile güncellenmiş; `db push`
-- migration YAZMAZ. Şema ilerledi, geçmiş 11 tablo geride kaldı ve fark
-- sessizce büyüdü — yerelde her şey çalıştığı için hiçbir yerde hata
-- vermedi.
--
-- ⚠️ İLK ÜRETİM DEPLOY'UNDA YAKALANDI, ölçüldü: `migrate deploy` 9 tabloyu
-- kurdu, ardından `20260824000000_sim_version` migration'ı
-- `ALTER TABLE "DuelRecord"` diyip düştü — o tablo hiç yaratılmamıştı.
-- Prisma P3009 verdi ve konteyner çöktü. Yakalanmasaydı oyunun yarısı
-- (lonca, PvP, ekipman, biletler) üretimde 500 dönerdi.
--
-- ⚠️ SIKIŞTIRMA GÜVENLİYDİ çünkü bu şema HİÇBİR YERDE canlı değildi: tek
-- veritabanı 20 dakikalık, sıfır satırlı Railway örneğiydi. Yarın aynı şey
-- YAPILAMAZ — canlı veri varsa geçmiş sıkıştırılmaz, ek migration yazılır.
--
-- ⚠️ Sadakat ÖLÇÜLDÜ, varsayılmadı: `migrate diff` ile şema ve çalışan
-- yerel veritabanı karşılaştırıldı, fark BOŞ çıktı.
--
-- `simVersion` (Run, DuelRecord) artık burada. Gerekçesi: seed tek başına
-- bir koşuyu tarif etmiyor, seed + motor sürümü ediyor; damga olmadan eski
-- bir düello yeni motorla tekrar oynatıldığında kazanan sessizce
-- değişebiliyordu. Varsayılan 0 KASITLI — gerçek bir SIM_VERSION asla 0
-- değil, yani damgadan önceki her satır kendiliğinden "tekrar oynatılamaz"
-- sayılıyor.
--
-- Var olan bir veritabanına ilk kez bağlanırken (tablolar zaten duruyorsa):
--     npx prisma migrate resolve --applied 0_baseline
-- ══════════════════════════════════════════════════════════════════════

-- CreateTable
CREATE TABLE "Player" (
    "wallet" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeen" TIMESTAMP(3) NOT NULL,
    "gold" INTEGER NOT NULL DEFAULT 0,
    "unlockedStage" INTEGER NOT NULL DEFAULT 1,
    "hero" TEXT NOT NULL DEFAULT 'knight',
    "cleared" JSONB NOT NULL DEFAULT '{}',
    "firstClear" JSONB NOT NULL DEFAULT '{}',
    "depthPaid" JSONB NOT NULL DEFAULT '{}',
    "upgrades" JSONB NOT NULL DEFAULT '{}',
    "charms" JSONB NOT NULL DEFAULT '[]',
    "cosmetics" JSONB NOT NULL DEFAULT '[]',
    "equipped" JSONB NOT NULL DEFAULT '{}',
    "dust" INTEGER NOT NULL DEFAULT 0,
    "ossuary" INTEGER NOT NULL DEFAULT 0,
    "wager" JSONB,
    "achievements" JSONB NOT NULL DEFAULT '[]',
    "skills" JSONB NOT NULL DEFAULT '[]',
    "guildId" TEXT,
    "cryptTier" INTEGER NOT NULL DEFAULT 0,
    "cryptClaimedWeek" INTEGER NOT NULL DEFAULT 0,
    "kills" JSONB NOT NULL DEFAULT '{}',
    "pets" JSONB NOT NULL DEFAULT '{}',
    "petLevels" JSONB NOT NULL DEFAULT '{}',
    "petFused" JSONB NOT NULL DEFAULT '[]',
    "equippedPets" JSONB NOT NULL DEFAULT '[]',
    "petSlot2" BOOLEAN NOT NULL DEFAULT false,
    "streak" JSONB NOT NULL DEFAULT '{}',
    "quests" JSONB NOT NULL DEFAULT '{}',
    "duelRating" INTEGER NOT NULL DEFAULT 1000,
    "duelWins" INTEGER NOT NULL DEFAULT 0,
    "duelLosses" INTEGER NOT NULL DEFAULT 0,
    "duelDay" TEXT NOT NULL DEFAULT '',
    "duelRewarded" INTEGER NOT NULL DEFAULT 0,
    "duelWeek" INTEGER NOT NULL DEFAULT 0,
    "duelMatches" INTEGER NOT NULL DEFAULT 0,
    "duelPeak" INTEGER NOT NULL DEFAULT 1000,
    "banned" BOOLEAN NOT NULL DEFAULT false,
    "rev" INTEGER NOT NULL DEFAULT 0,
    "bestStage" INTEGER NOT NULL DEFAULT 0,
    "bestDepth" INTEGER NOT NULL DEFAULT 0,
    "bestRating" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "seasonWeek" INTEGER NOT NULL DEFAULT 0,
    "seasonStage" INTEGER NOT NULL DEFAULT 0,
    "seasonDepth" INTEGER NOT NULL DEFAULT 0,
    "seasonRating" DOUBLE PRECISION NOT NULL DEFAULT 0,

    CONSTRAINT "Player_pkey" PRIMARY KEY ("wallet")
);

-- CreateTable
CREATE TABLE "Run" (
    "id" TEXT NOT NULL,
    "wallet" TEXT NOT NULL,
    "seed" BIGINT NOT NULL,
    "simVersion" INTEGER NOT NULL DEFAULT 0,
    "mode" TEXT NOT NULL,
    "stageId" INTEGER NOT NULL,
    "hero" TEXT NOT NULL,
    "startDepth" INTEGER NOT NULL DEFAULT 1,
    "ascension" INTEGER NOT NULL DEFAULT 0,
    "wagerStake" INTEGER NOT NULL DEFAULT 0,
    "wagerTarget" INTEGER NOT NULL DEFAULT 0,
    "wagerWon" BOOLEAN NOT NULL DEFAULT false,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "claimedAt" TIMESTAMP(3),
    "claimedDepth" INTEGER,
    "claimedGold" INTEGER,
    "awarded" INTEGER,
    "awardedDepth" INTEGER,
    "capped" BOOLEAN NOT NULL DEFAULT false,
    "duelDefender" TEXT,
    "duelTargetDepth" INTEGER,
    "duelDefRating" INTEGER,

    CONSTRAINT "Run_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DuelRecord" (
    "id" TEXT NOT NULL,
    "wallet" TEXT NOT NULL,
    "stageId" INTEGER NOT NULL,
    "seed" BIGINT NOT NULL,
    "simVersion" INTEGER NOT NULL DEFAULT 0,
    "depth" INTEGER NOT NULL,
    "rating" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DuelRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Duel" (
    "id" TEXT NOT NULL,
    "challenger" TEXT NOT NULL,
    "defender" TEXT NOT NULL,
    "stageId" INTEGER NOT NULL,
    "depth" INTEGER NOT NULL,
    "target" INTEGER NOT NULL,
    "won" BOOLEAN NOT NULL,
    "delta" INTEGER NOT NULL,
    "dust" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Duel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Listing" (
    "id" TEXT NOT NULL,
    "seller" TEXT NOT NULL,
    "goldAmount" INTEGER NOT NULL,
    "priceGrave" BIGINT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closedAt" TIMESTAMP(3),
    "buyer" TEXT,
    "paymentSig" TEXT,

    CONSTRAINT "Listing_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Ledger" (
    "id" TEXT NOT NULL,
    "wallet" TEXT NOT NULL,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "kind" TEXT NOT NULL,
    "gold" INTEGER NOT NULL,
    "detail" TEXT,

    CONSTRAINT "Ledger_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorldBoss" (
    "week" INTEGER NOT NULL,
    "bossId" TEXT NOT NULL,
    "hp" INTEGER NOT NULL,
    "maxHp" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WorldBoss_pkey" PRIMARY KEY ("week")
);

-- CreateTable
CREATE TABLE "BossDamage" (
    "id" TEXT NOT NULL,
    "week" INTEGER NOT NULL,
    "wallet" TEXT NOT NULL,
    "damage" INTEGER NOT NULL DEFAULT 0,
    "runs" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "BossDamage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuthNonce" (
    "nonce" TEXT NOT NULL,
    "wallet" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AuthNonce_pkey" PRIMARY KEY ("nonce")
);

-- CreateTable
CREATE TABLE "SeasonClose" (
    "week" INTEGER NOT NULL,
    "settledAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "winners" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "SeasonClose_pkey" PRIMARY KEY ("week")
);

-- CreateTable
CREATE TABLE "Follow" (
    "id" TEXT NOT NULL,
    "wallet" TEXT NOT NULL,
    "target" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Follow_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Ticket" (
    "id" TEXT NOT NULL,
    "wallet" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'open',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "bumpedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Ticket_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TicketMessage" (
    "id" TEXT NOT NULL,
    "ticketId" TEXT NOT NULL,
    "fromAdmin" BOOLEAN NOT NULL DEFAULT false,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TicketMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PvpClose" (
    "week" INTEGER NOT NULL,
    "settledAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "winners" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "PvpClose_pkey" PRIMARY KEY ("week")
);

-- CreateTable
CREATE TABLE "PvpAward" (
    "id" TEXT NOT NULL,
    "week" INTEGER NOT NULL,
    "wallet" TEXT NOT NULL,
    "rank" INTEGER NOT NULL,
    "rating" INTEGER NOT NULL DEFAULT 0,
    "cosmetic" TEXT,
    "dust" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PvpAward_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SeasonAward" (
    "id" TEXT NOT NULL,
    "week" INTEGER NOT NULL,
    "wallet" TEXT NOT NULL,
    "rank" INTEGER NOT NULL,
    "cosmetic" TEXT,
    "dust" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SeasonAward_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CryptVault" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "balance" INTEGER NOT NULL DEFAULT 0,
    "filled" INTEGER NOT NULL DEFAULT 0,
    "paid" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CryptVault_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Guild" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "tag" TEXT NOT NULL,
    "owner" TEXT NOT NULL,
    "level" INTEGER NOT NULL DEFAULT 1,
    "treasury" INTEGER NOT NULL DEFAULT 0,
    "donated" INTEGER NOT NULL DEFAULT 0,
    "memberCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Guild_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GearItem" (
    "id" TEXT NOT NULL,
    "wallet" TEXT NOT NULL,
    "slot" TEXT NOT NULL,
    "rarity" INTEGER NOT NULL,
    "affixes" JSONB NOT NULL,
    "depth" INTEGER NOT NULL,
    "equipped" BOOLEAN NOT NULL DEFAULT false,
    "foundAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GearItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ServerFlag" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "maintenance" BOOLEAN NOT NULL DEFAULT false,
    "notice" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ServerFlag_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Player_bestRating_idx" ON "Player"("bestRating");

-- CreateIndex
CREATE INDEX "Player_guildId_idx" ON "Player"("guildId");

-- CreateIndex
CREATE INDEX "Player_seasonWeek_seasonRating_idx" ON "Player"("seasonWeek", "seasonRating");

-- CreateIndex
CREATE INDEX "Run_wallet_startedAt_idx" ON "Run"("wallet", "startedAt");

-- CreateIndex
CREATE INDEX "DuelRecord_stageId_depth_idx" ON "DuelRecord"("stageId", "depth");

-- CreateIndex
CREATE UNIQUE INDEX "DuelRecord_wallet_stageId_key" ON "DuelRecord"("wallet", "stageId");

-- CreateIndex
CREATE INDEX "Duel_challenger_defender_createdAt_idx" ON "Duel"("challenger", "defender", "createdAt");

-- CreateIndex
CREATE INDEX "Duel_createdAt_idx" ON "Duel"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Listing_paymentSig_key" ON "Listing"("paymentSig");

-- CreateIndex
CREATE INDEX "Listing_status_createdAt_idx" ON "Listing"("status", "createdAt");

-- CreateIndex
CREATE INDEX "Listing_seller_status_idx" ON "Listing"("seller", "status");

-- CreateIndex
CREATE INDEX "Ledger_wallet_at_idx" ON "Ledger"("wallet", "at");

-- CreateIndex
CREATE INDEX "Ledger_kind_at_idx" ON "Ledger"("kind", "at");

-- CreateIndex
CREATE INDEX "BossDamage_week_damage_idx" ON "BossDamage"("week", "damage");

-- CreateIndex
CREATE UNIQUE INDEX "BossDamage_week_wallet_key" ON "BossDamage"("week", "wallet");

-- CreateIndex
CREATE INDEX "AuthNonce_wallet_idx" ON "AuthNonce"("wallet");

-- CreateIndex
CREATE INDEX "AuthNonce_expiresAt_idx" ON "AuthNonce"("expiresAt");

-- CreateIndex
CREATE INDEX "Follow_wallet_idx" ON "Follow"("wallet");

-- CreateIndex
CREATE UNIQUE INDEX "Follow_wallet_target_key" ON "Follow"("wallet", "target");

-- CreateIndex
CREATE INDEX "Ticket_status_bumpedAt_idx" ON "Ticket"("status", "bumpedAt");

-- CreateIndex
CREATE INDEX "Ticket_wallet_bumpedAt_idx" ON "Ticket"("wallet", "bumpedAt");

-- CreateIndex
CREATE INDEX "TicketMessage_ticketId_createdAt_idx" ON "TicketMessage"("ticketId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "PvpAward_week_wallet_key" ON "PvpAward"("week", "wallet");

-- CreateIndex
CREATE INDEX "SeasonAward_wallet_week_idx" ON "SeasonAward"("wallet", "week");

-- CreateIndex
CREATE UNIQUE INDEX "SeasonAward_week_wallet_key" ON "SeasonAward"("week", "wallet");

-- CreateIndex
CREATE UNIQUE INDEX "Guild_tag_key" ON "Guild"("tag");

-- CreateIndex
CREATE INDEX "Guild_level_idx" ON "Guild"("level");

-- CreateIndex
CREATE INDEX "GearItem_wallet_idx" ON "GearItem"("wallet");

-- CreateIndex
CREATE INDEX "GearItem_wallet_equipped_idx" ON "GearItem"("wallet", "equipped");

-- AddForeignKey
ALTER TABLE "Player" ADD CONSTRAINT "Player_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "Guild"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Run" ADD CONSTRAINT "Run_wallet_fkey" FOREIGN KEY ("wallet") REFERENCES "Player"("wallet") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DuelRecord" ADD CONSTRAINT "DuelRecord_wallet_fkey" FOREIGN KEY ("wallet") REFERENCES "Player"("wallet") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Listing" ADD CONSTRAINT "Listing_seller_fkey" FOREIGN KEY ("seller") REFERENCES "Player"("wallet") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Follow" ADD CONSTRAINT "Follow_wallet_fkey" FOREIGN KEY ("wallet") REFERENCES "Player"("wallet") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Ticket" ADD CONSTRAINT "Ticket_wallet_fkey" FOREIGN KEY ("wallet") REFERENCES "Player"("wallet") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TicketMessage" ADD CONSTRAINT "TicketMessage_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "Ticket"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PvpAward" ADD CONSTRAINT "PvpAward_wallet_fkey" FOREIGN KEY ("wallet") REFERENCES "Player"("wallet") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SeasonAward" ADD CONSTRAINT "SeasonAward_wallet_fkey" FOREIGN KEY ("wallet") REFERENCES "Player"("wallet") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GearItem" ADD CONSTRAINT "GearItem_wallet_fkey" FOREIGN KEY ("wallet") REFERENCES "Player"("wallet") ON DELETE CASCADE ON UPDATE CASCADE;

