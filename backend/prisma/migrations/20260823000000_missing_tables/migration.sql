-- ══════════════════════════════════════════════════════════════════════
-- EKSİK TABLOLAR — geçmiş, şemanın 11 tablo GERİSİNDEYDİ.
-- ══════════════════════════════════════════════════════════════════════
--
-- 🔴 İLK ÜRETİM DEPLOY'UNDA YAKALANDI (2026-09-03). `0_baseline` yalnız 9
-- tablo yaratıyordu, şemada 20 model var. Geçmişte HİÇ bulunmayan 11
-- tablo: CryptVault · Duel · DuelRecord · Follow · GearItem · Guild ·
-- PvpAward · PvpClose · ServerFlag · Ticket · TicketMessage — yani lonca,
-- ekipman, düello/PvP, destek biletleri, kasa ve BAKIM BAYRAĞI.
-- Player ve Run da birkaç sütun eksikti (skills, duelDefender ...).
--
-- Sebep: yerel veritabanı `prisma db push` ile güncellendi; `db push`
-- migration YAZMAZ. Şema ilerledi, geçmiş geride kaldı ve fark sessizce
-- büyüdü — yerelde her şey çalıştığı için hiçbir yerde hata vermedi.
--
-- Belirti: `migrate deploy` 9 tabloyu kurdu, ardından sonraki migration
-- `ALTER TABLE "DuelRecord"` deyip düştü (P3009), konteyner çöktü.
-- Yakalanmasaydı oyunun yarısı üretimde 500 dönerdi.
--
-- ⚠️ DOSYA ADI KASITLI OLARAK `sim_version`DAN ÖNCE SIRALANIYOR.
-- Prisma migration'ları klasör adına göre alfabetik uygular; bu dosya
-- tabloları yaratmalı ki sonraki migration onlara sütun EKLEYEBİLSİN.
-- Bu yüzden `simVersion` burada BİLEREK YOK — Run'daki ALTER'dan ve
-- DuelRecord'un tanımından çıkarıldı, ikisini de sonraki migration ekler.
-- Adı ileri bir tarihe çekilirse üretim yeniden P3009 verir.
--
-- ⚠️ GEÇMİŞ SIKIŞTIRILMADI. Sıkıştırma denendi ve GERİ ALINDI: var olan
-- veritabanının silinmesini gerektiriyordu. Bu dosya hiçbir şey silmiyor,
-- yarı kurulmuş bir veritabanının üstüne de temiz uygulanıyor.
--
-- ⚠️ Prisma'nın kendi `migrate diff`i üretti, elle yazılmadı; doğruluğu
-- gölge veritabanında baştan uygulanarak ölçüldü.
-- ══════════════════════════════════════════════════════════════════════

-- AlterTable
ALTER TABLE "AuthNonce" DROP CONSTRAINT "AuthNonce_pkey",
ADD CONSTRAINT "AuthNonce_pkey" PRIMARY KEY ("nonce");

-- AlterTable
ALTER TABLE "Player" ADD COLUMN     "cryptClaimedWeek" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "cryptTier" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "duelDay" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "duelLosses" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "duelMatches" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "duelPeak" INTEGER NOT NULL DEFAULT 1000,
ADD COLUMN     "duelRating" INTEGER NOT NULL DEFAULT 1000,
ADD COLUMN     "duelRewarded" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "duelWeek" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "duelWins" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "equippedPets" JSONB NOT NULL DEFAULT '[]',
ADD COLUMN     "guildId" TEXT,
ADD COLUMN     "kills" JSONB NOT NULL DEFAULT '{}',
ADD COLUMN     "petFused" JSONB NOT NULL DEFAULT '[]',
ADD COLUMN     "petLevels" JSONB NOT NULL DEFAULT '{}',
ADD COLUMN     "petSlot2" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "pets" JSONB NOT NULL DEFAULT '{}',
ADD COLUMN     "quests" JSONB NOT NULL DEFAULT '{}',
ADD COLUMN     "skills" JSONB NOT NULL DEFAULT '[]';

-- AlterTable
ALTER TABLE "Run" ADD COLUMN     "duelDefRating" INTEGER,
ADD COLUMN     "duelDefender" TEXT,
ADD COLUMN     "duelTargetDepth" INTEGER;

-- CreateTable
CREATE TABLE "DuelRecord" (
    "id" TEXT NOT NULL,
    "wallet" TEXT NOT NULL,
    "stageId" INTEGER NOT NULL,
    "seed" BIGINT NOT NULL,
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
CREATE INDEX "DuelRecord_stageId_depth_idx" ON "DuelRecord"("stageId", "depth");

-- CreateIndex
CREATE UNIQUE INDEX "DuelRecord_wallet_stageId_key" ON "DuelRecord"("wallet", "stageId");

-- CreateIndex
CREATE INDEX "Duel_challenger_defender_createdAt_idx" ON "Duel"("challenger", "defender", "createdAt");

-- CreateIndex
CREATE INDEX "Duel_createdAt_idx" ON "Duel"("createdAt");

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
CREATE UNIQUE INDEX "Guild_tag_key" ON "Guild"("tag");

-- CreateIndex
CREATE INDEX "Guild_level_idx" ON "Guild"("level");

-- CreateIndex
CREATE INDEX "GearItem_wallet_idx" ON "GearItem"("wallet");

-- CreateIndex
CREATE INDEX "GearItem_wallet_equipped_idx" ON "GearItem"("wallet", "equipped");

-- CreateIndex
CREATE INDEX "AuthNonce_wallet_idx" ON "AuthNonce"("wallet");

-- CreateIndex
CREATE INDEX "AuthNonce_expiresAt_idx" ON "AuthNonce"("expiresAt");

-- CreateIndex
CREATE INDEX "Player_guildId_idx" ON "Player"("guildId");

-- AddForeignKey
ALTER TABLE "Player" ADD CONSTRAINT "Player_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "Guild"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DuelRecord" ADD CONSTRAINT "DuelRecord_wallet_fkey" FOREIGN KEY ("wallet") REFERENCES "Player"("wallet") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Follow" ADD CONSTRAINT "Follow_wallet_fkey" FOREIGN KEY ("wallet") REFERENCES "Player"("wallet") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Ticket" ADD CONSTRAINT "Ticket_wallet_fkey" FOREIGN KEY ("wallet") REFERENCES "Player"("wallet") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TicketMessage" ADD CONSTRAINT "TicketMessage_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "Ticket"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PvpAward" ADD CONSTRAINT "PvpAward_wallet_fkey" FOREIGN KEY ("wallet") REFERENCES "Player"("wallet") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GearItem" ADD CONSTRAINT "GearItem_wallet_fkey" FOREIGN KEY ("wallet") REFERENCES "Player"("wallet") ON DELETE CASCADE ON UPDATE CASCADE;

