-- CreateTable
CREATE TABLE "TravelSession" (
    "id" SERIAL NOT NULL,
    "sessionId" TEXT NOT NULL,
    "currentStep" TEXT NOT NULL,
    "routeNumber" INTEGER NOT NULL DEFAULT 1,
    "lastQuestionField" TEXT,
    "correctionTarget" TEXT,
    "rollbackFields" TEXT,
    "language" TEXT NOT NULL DEFAULT 'ko',
    "region" TEXT,
    "period" TEXT,
    "startDate" TIMESTAMP(3),
    "endDate" TIMESTAMP(3),
    "tripType" TEXT,
    "accommodationName" TEXT,
    "accommodationAddress" TEXT,
    "accommodationMapx" DOUBLE PRECISION,
    "accommodationMapy" DOUBLE PRECISION,
    "departureName" TEXT,
    "departureAddress" TEXT,
    "departureMapx" DOUBLE PRECISION,
    "departureMapy" DOUBLE PRECISION,
    "peopleCount" INTEGER,
    "companionType" TEXT,
    "themes" JSONB,
    "selectedPlaces" JSONB,
    "relatedPlaces" JSONB,
    "recommendationRound" INTEGER NOT NULL DEFAULT 1,
    "finalSelectedPlaces" JSONB,
    "finalRoute" JSONB,
    "kakaoMapSaved" BOOLEAN NOT NULL DEFAULT false,
    "isCompleted" BOOLEAN NOT NULL DEFAULT false,
    "facts" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TravelSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WeatherForecast" (
    "id" SERIAL NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "region" TEXT NOT NULL,
    "minTemp" DOUBLE PRECISION,
    "maxTemp" DOUBLE PRECISION,
    "avgTemp" DOUBLE PRECISION,
    "rainProb" DOUBLE PRECISION,
    "source" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WeatherForecast_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TravelSession_sessionId_key" ON "TravelSession"("sessionId");

-- CreateIndex
CREATE UNIQUE INDEX "WeatherForecast_date_region_key" ON "WeatherForecast"("date", "region");
