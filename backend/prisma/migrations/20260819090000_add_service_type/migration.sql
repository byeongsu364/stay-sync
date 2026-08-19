ALTER TABLE "TravelSession" ADD COLUMN "serviceType" TEXT;

UPDATE "TravelSession"
SET "currentStep" = 'ASK_SERVICE_TYPE', "lastQuestionField" = 'service_type'
WHERE "currentStep" = 'ASK_REGION'
  AND "region" IS NULL
  AND "period" IS NULL;
