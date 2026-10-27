-- CreateTable
CREATE TABLE "price_cache_entries" (
    "id" TEXT NOT NULL,
    "partKey" TEXT NOT NULL,
    "region" TEXT,
    "provider" TEXT NOT NULL,
    "unitPrice" DECIMAL(20,6) NOT NULL,
    "currency" VARCHAR(3) NOT NULL DEFAULT 'USD',
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "metadata" JSONB,
    "retrievedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "price_cache_entries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "price_cache_entries_partKey_region_idx" ON "price_cache_entries"("partKey", "region");

-- CreateIndex
CREATE UNIQUE INDEX "price_cache_entries_partKey_region_provider_key" ON "price_cache_entries"("partKey", "region", "provider");
