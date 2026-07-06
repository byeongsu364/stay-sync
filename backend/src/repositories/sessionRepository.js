const { prisma } = require("../config/db");

/**
 * ==========================================================
 * Session Repository
 * ==========================================================
 *
 * 역할
 * - TravelSession CRUD
 * - 세션 상태, facts, 추천/동선 결과 저장
 *
 * 현재
 * - PostgreSQL + Prisma
 * ==========================================================
 */

async function findSession(sessionId) {
    return await prisma.travelSession.findUnique({
        where: {
            sessionId,
        },
    });
}

async function createSession(sessionId) {
    return await prisma.travelSession.create({
        data: {
            sessionId,

            currentStep: "ASK_REGION",
            routeNumber: 1,
            lastQuestionField: "region",
            correctionTarget: null,
            rollbackFields: null,
            language: "ko",

            region: null,
            period: null,
            startDate: null,
            endDate: null,
            tripType: null,

            accommodationName: null,
            accommodationAddress: null,
            accommodationMapx: null,
            accommodationMapy: null,

            departureName: null,
            departureAddress: null,
            departureMapx: null,
            departureMapy: null,

            peopleCount: null,
            companionType: null,

            themes: [],
            selectedPlaces: [],
            relatedPlaces: [],
            recommendationRound: 1,

            finalSelectedPlaces: [],
            finalRoute: null,

            kakaoMapSaved: false,
            isCompleted: false,

            facts: {
                region: null,
                period: null,
                start_date: null,
                end_date: null,
                trip_type: null,
                accommodation: null,
                departure_location: null,
                start_location: null,
                people_count: null,
                companion_type: null,
                themes: [],
                selected_places: [],
                recommended_history: [],
                recommendation_round: 1,
            },
        },
    });
}

async function getOrCreateSession(sessionId) {
    let session = await findSession(sessionId);

    if (!session) {
        session = await createSession(sessionId);
    }

    return session;
}

async function updateFacts(sessionId, facts) {
    return await prisma.travelSession.update({
        where: {
            sessionId,
        },
        data: {
            facts,
        },
    });
}

async function updateStep(sessionId, currentStep, lastQuestionField = null) {
    return await prisma.travelSession.update({
        where: {
            sessionId,
        },
        data: {
            currentStep,
            lastQuestionField,
        },
    });
}

async function updateCorrection(
    sessionId,
    correctionTarget = null,
    rollbackFields = null
) {
    return await prisma.travelSession.update({
        where: {
            sessionId,
        },
        data: {
            correctionTarget,
            rollbackFields,
        },
    });
}

async function saveSession(sessionId, data) {
    return await prisma.travelSession.update({
        where: {
            sessionId,
        },
        data,
    });
}

async function deleteSession(sessionId) {
    return await prisma.travelSession.delete({
        where: {
            sessionId,
        },
    });
}

module.exports = {
    findSession,
    createSession,
    getOrCreateSession,
    updateFacts,
    updateStep,
    updateCorrection,
    saveSession,
    deleteSession,
};