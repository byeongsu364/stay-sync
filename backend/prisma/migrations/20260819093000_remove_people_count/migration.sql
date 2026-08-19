UPDATE "TravelSession"
SET "currentStep" = 'ASK_COMPANION_TYPE',
    "lastQuestionField" = 'companion_type'
WHERE "currentStep" = 'ASK_PEOPLE_COUNT';

UPDATE "TravelSession"
SET "facts" = "facts" - 'people_count'
WHERE "facts" IS NOT NULL;

ALTER TABLE "TravelSession" DROP COLUMN "peopleCount";
