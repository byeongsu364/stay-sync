-- CreateTable
CREATE TABLE "Attraction" (
    "id" SERIAL NOT NULL,
    "contentId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "normalizedTitle" TEXT NOT NULL,
    "region" TEXT NOT NULL,
    "address1" TEXT NOT NULL,
    "address2" TEXT,
    "zipCode" TEXT,
    "mapx" DOUBLE PRECISION,
    "mapy" DOUBLE PRECISION,
    "mapLevel" INTEGER,
    "areaCode" TEXT,
    "sigunguCode" TEXT,
    "contentTypeId" TEXT,
    "category1" TEXT,
    "category2" TEXT,
    "category3" TEXT,
    "classification1" TEXT,
    "classification2" TEXT,
    "classification3" TEXT,
    "firstImage" TEXT,
    "firstImage2" TEXT,
    "telephone" TEXT,
    "copyrightDivisionCode" TEXT,
    "sourceCreatedTime" TEXT,
    "sourceModifiedTime" TEXT,
    "legalDistrictRegionCode" TEXT,
    "legalDistrictSigunguCode" TEXT,
    "indoorOutdoor" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Attraction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AttractionSearchStat" (
    "id" SERIAL NOT NULL,
    "attractionId" INTEGER,
    "region" TEXT NOT NULL,
    "detailRegion" TEXT,
    "year" INTEGER NOT NULL,
    "month" INTEGER NOT NULL,
    "yearMonth" TIMESTAMP(3) NOT NULL,
    "rank" INTEGER NOT NULL,
    "placeName" TEXT NOT NULL,
    "normalizedName" TEXT NOT NULL,
    "searchCount" INTEGER NOT NULL,
    "middleCategory" TEXT NOT NULL,
    "smallCategory" TEXT NOT NULL,
    "sourceFile" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AttractionSearchStat_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Attraction_contentId_key" ON "Attraction"("contentId");

-- CreateIndex
CREATE INDEX "Attraction_region_idx" ON "Attraction"("region");

-- CreateIndex
CREATE INDEX "Attraction_normalizedTitle_idx" ON "Attraction"("normalizedTitle");

-- CreateIndex
CREATE INDEX "Attraction_region_indoorOutdoor_idx" ON "Attraction"("region", "indoorOutdoor");

-- CreateIndex
CREATE INDEX "AttractionSearchStat_attractionId_yearMonth_idx" ON "AttractionSearchStat"("attractionId", "yearMonth");

-- CreateIndex
CREATE INDEX "AttractionSearchStat_region_yearMonth_rank_idx" ON "AttractionSearchStat"("region", "yearMonth", "rank");

-- CreateIndex
CREATE INDEX "AttractionSearchStat_region_yearMonth_middleCategory_rank_idx" ON "AttractionSearchStat"("region", "yearMonth", "middleCategory", "rank");

-- CreateIndex
CREATE INDEX "AttractionSearchStat_normalizedName_idx" ON "AttractionSearchStat"("normalizedName");

-- AddForeignKey
ALTER TABLE "AttractionSearchStat" ADD CONSTRAINT "AttractionSearchStat_attractionId_fkey" FOREIGN KEY ("attractionId") REFERENCES "Attraction"("id") ON DELETE SET NULL ON UPDATE CASCADE;
