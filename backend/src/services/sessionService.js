const sessionRepository = require("../repositories/sessionRepository");

/**
 * ==========================================================
 * Session Service
 * ==========================================================
 *
 * 역할
 * - 세션 조회/생성
 * - facts와 DB 컬럼 동기화
 * - currentStep, routeNumber, lastQuestionField 관리
 *
 * 주의
 * - LLM 호출은 intentService, travelIntentService 등에서 담당한다.
 * - sessionService는 DB 저장과 세션 상태 관리만 담당한다.
 * ==========================================================
 */

async function loadSession(sessionId) {
    return await sessionRepository.getOrCreateSession(sessionId);
}

function buildFactsFromSession(session) {
    return {
        region: session.region ?? null,
        period: session.period ?? null,
        start_date: session.startDate
            ? session.startDate.toISOString().slice(0, 10)
            : null,
        end_date: session.endDate
            ? session.endDate.toISOString().slice(0, 10)
            : null,
        trip_type: session.tripType ?? null,

        accommodation: session.accommodationName
            ? {
                name: session.accommodationName,
                address: session.accommodationAddress,
                mapx: session.accommodationMapx,
                mapy: session.accommodationMapy,
            }
            : null,

        departure_location: session.departureName
            ? {
                name: session.departureName,
                address: session.departureAddress,
                mapx: session.departureMapx,
                mapy: session.departureMapy,
            }
            : null,

        start_location:
            session.tripType === "숙박" && session.accommodationName
                ? {
                    name: session.accommodationName,
                    address: session.accommodationAddress,
                    mapx: session.accommodationMapx,
                    mapy: session.accommodationMapy,
                }
                : session.departureName
                    ? {
                        name: session.departureName,
                        address: session.departureAddress,
                        mapx: session.departureMapx,
                        mapy: session.departureMapy,
                    }
                    : null,

        people_count: session.peopleCount ?? null,
        companion_type: session.companionType ?? null,
        themes: session.themes ?? [],

        selected_places: session.selectedPlaces ?? [],
        related_places: session.relatedPlaces ?? [],
        recommendation_round: session.recommendationRound ?? 1,
        final_selected_places: session.finalSelectedPlaces ?? [],
        final_route: session.finalRoute ?? null,
    };
}

function buildSessionDataFromFacts({
    facts,
    currentStep,
    routeNumber,
    lastQuestionField,
    correctionTarget,
    rollbackFields,
}) {
    const accommodation = facts.accommodation || null;
    const departure = facts.departure_location || null;

    return {
        currentStep,
        routeNumber,
        lastQuestionField,
        correctionTarget: correctionTarget ?? null,
        rollbackFields: rollbackFields ?? null,

        region: facts.region ?? null,
        period: facts.period ?? null,
        startDate: facts.start_date ? new Date(facts.start_date) : null,
        endDate: facts.end_date ? new Date(facts.end_date) : null,
        tripType: facts.trip_type ?? null,

        accommodationName: accommodation?.name ?? null,
        accommodationAddress: accommodation?.address ?? null,
        accommodationMapx: accommodation?.mapx ?? null,
        accommodationMapy: accommodation?.mapy ?? null,

        departureName: departure?.name ?? null,
        departureAddress: departure?.address ?? null,
        departureMapx: departure?.mapx ?? null,
        departureMapy: departure?.mapy ?? null,

        peopleCount: facts.people_count ?? null,
        companionType: facts.companion_type ?? null,

        themes: facts.themes ?? [],
        selectedPlaces: facts.selected_places ?? [],
        relatedPlaces: facts.related_places ?? [],
        recommendationRound: facts.recommendation_round ?? 1,
        finalSelectedPlaces: facts.final_selected_places ?? [],
        finalRoute: facts.final_route ?? null,

        facts,
    };
}

async function saveConversationState({
    sessionId,
    facts,
    currentStep,
    routeNumber,
    lastQuestionField = null,
    correctionTarget = null,
    rollbackFields = null,
}) {
    const data = buildSessionDataFromFacts({
        facts,
        currentStep,
        routeNumber,
        lastQuestionField,
        correctionTarget,
        rollbackFields,
    });

    return await sessionRepository.saveSession(sessionId, data);
}

module.exports = {
    loadSession,
    buildFactsFromSession,
    buildSessionDataFromFacts,
    saveConversationState,
};