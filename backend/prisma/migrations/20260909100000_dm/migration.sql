-- OZEL MESAJ. Yalniz KARSILIKLI takip edenler arasinda (kural kodda,
-- semada degil: takip iliskisi Follow tablosunda ve iki yonlu sorgulaniyor).
CREATE TABLE "DirectMessage" (
    "id" TEXT NOT NULL,
    "from" TEXT NOT NULL,
    "to" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "readAt" TIMESTAMP(3),

    CONSTRAINT "DirectMessage_pkey" PRIMARY KEY ("id")
);

-- Konusma sorgusu IKI YONLU: (a→b) VE (b→a). Iki ayri indeks sart.
CREATE INDEX "DirectMessage_from_to_createdAt_idx" ON "DirectMessage"("from", "to", "createdAt");
CREATE INDEX "DirectMessage_to_from_createdAt_idx" ON "DirectMessage"("to", "from", "createdAt");
-- Okunmamis sayaci
CREATE INDEX "DirectMessage_to_readAt_idx" ON "DirectMessage"("to", "readAt");

ALTER TABLE "DirectMessage" ADD CONSTRAINT "DirectMessage_from_fkey"
  FOREIGN KEY ("from") REFERENCES "Player"("wallet") ON DELETE CASCADE ON UPDATE CASCADE;
