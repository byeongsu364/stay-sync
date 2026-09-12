-- AlterTable
ALTER TABLE "Attraction" ADD COLUMN     "normalizedTitleEn" TEXT,
ADD COLUMN     "titleEn" TEXT;

-- CreateIndex
CREATE INDEX "Attraction_normalizedTitleEn_idx" ON "Attraction"("normalizedTitleEn");
