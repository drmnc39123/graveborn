-- SOL ödemeleri. `sig` benzersiz: aynı zincir ödemesiyle iki ürün alınamaz.
CREATE TABLE "Payment" (
    "id" TEXT NOT NULL,
    "sig" TEXT NOT NULL,
    "wallet" TEXT NOT NULL,
    "lamports" INTEGER NOT NULL,
    "product" TEXT NOT NULL,
    "detail" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Payment_sig_key" ON "Payment"("sig");
CREATE INDEX "Payment_wallet_createdAt_idx" ON "Payment"("wallet", "createdAt");
CREATE INDEX "Payment_createdAt_idx" ON "Payment"("createdAt");
