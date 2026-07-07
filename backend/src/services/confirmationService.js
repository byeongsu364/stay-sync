const { CURRENT_STEP, ROUTE_NUMBER } = require("../data/constants");

/**
 * 추천 전 최종 확인 문장 생성
 */

function isFactsReady(facts) {
    const baseReady =
        facts.region &&
        facts.period &&
        facts.start_date &&
        facts.end_date &&
        facts.trip_type &&
        facts.people_count &&
        facts.companion_type;

    if (!baseReady) return false;

    if (facts.trip_type === "숙박") {
        return !!facts.accommodation?.name;
    }

    if (facts.trip_type === "당일치기") {
        return !!facts.departure_location?.name;
    }

    return false;
}

function buildFinalConfirmationReply(facts) {
    const locationText =
        facts.trip_type === "숙박"
            ? `예약하신 숙소는 ${facts.accommodation?.name}로 확인했습니다.`
            : `출발지는 ${facts.departure_location?.name}로 확인했습니다.`;

    return `${facts.companion_type}과 함께 ${facts.people_count}명이 ${facts.region}로 ${facts.period} 여행을 가시는군요. ${locationText} 지금까지 수집한 여행 정보를 바탕으로 관광지를 추천해드릴까요?`;
}

function buildConfirmationResult(facts) {
    return {
        facts,
        route_number: ROUTE_NUMBER.RECOMMENDATION,
        current_step: CURRENT_STEP.READY_FOR_RECOMMENDATION,
        last_question_field: null,
        reply: buildFinalConfirmationReply(facts),
    };
}

module.exports = {
    isFactsReady,
    buildFinalConfirmationReply,
    buildConfirmationResult,
};