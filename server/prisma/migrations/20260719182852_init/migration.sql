-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'user',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "urls" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "originalUrl" TEXT NOT NULL,
    "shortCode" TEXT NOT NULL,
    "customAlias" TEXT,
    "title" TEXT,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "expirationDate" TIMESTAMP(3),
    "clickCount" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "urls_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "analytics" (
    "id" TEXT NOT NULL,
    "urlId" TEXT NOT NULL,
    "ipAddress" TEXT,
    "browser" TEXT,
    "os" TEXT,
    "device" TEXT,
    "country" TEXT,
    "referrer" TEXT,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "analytics_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "urls_shortCode_key" ON "urls"("shortCode");

-- CreateIndex
CREATE UNIQUE INDEX "urls_customAlias_key" ON "urls"("customAlias");

-- CreateIndex
CREATE INDEX "urls_shortCode_idx" ON "urls"("shortCode");

-- CreateIndex
CREATE INDEX "urls_customAlias_idx" ON "urls"("customAlias");

-- CreateIndex
CREATE INDEX "urls_userId_idx" ON "urls"("userId");

-- CreateIndex
CREATE INDEX "urls_createdAt_idx" ON "urls"("createdAt");

-- CreateIndex
CREATE INDEX "urls_expirationDate_idx" ON "urls"("expirationDate");

-- CreateIndex
CREATE INDEX "analytics_urlId_idx" ON "analytics"("urlId");

-- CreateIndex
CREATE INDEX "analytics_timestamp_idx" ON "analytics"("timestamp");

-- AddForeignKey
ALTER TABLE "urls" ADD CONSTRAINT "urls_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "analytics" ADD CONSTRAINT "analytics_urlId_fkey" FOREIGN KEY ("urlId") REFERENCES "urls"("id") ON DELETE CASCADE ON UPDATE CASCADE;
