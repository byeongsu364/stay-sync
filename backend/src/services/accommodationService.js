const { CURRENT_STEP, ROUTE_NUMBER } = require("../data/constants");

/**
 * 숙소/출발지 분기 서비스
 *
 * 숙박 여행:
 * - 야놀자 링크 제공
 * - 숙소 입력 단계로 이동
 *
 * 당일치기:
 * - 숙소 추천 생략
 * - 출발지 입력 단계로 이동
 */

function buildYanoljaUrl(region) {
    return `https://www.yanolja.com/search/${encodeURIComponent(region)}`;
}

function handleAccommodationStep(facts) {
    if (facts.trip_type === "당일치기") {
        return {
            handled: true,
            facts,
            route_number: ROUTE_NUMBER.POST_BOOKING,
            current_step: CURRENT_STEP.ASK_START_LOCATION,
            last_question_field: "departure_location",
            reply: `${facts.region} 당일치기 여행이시군요. 동선 추천을 위해 출발지를 입력해주세요.`,
        };
    }

    if (facts.trip_type === "숙박") {
        const yanoljaUrl = buildYanoljaUrl(facts.region);

        return {
            handled: true,
            facts,
            route_number: ROUTE_NUMBER.POST_BOOKING,
            current_step: CURRENT_STEP.ASK_ACCOMMODATION,
            last_question_field: "accommodation",
            reply: `${facts.region} 지역의 ${facts.period} 일정에 맞는 숙소를 확인해주세요.\n야놀자 숙소 검색 링크: ${yanoljaUrl}\n숙소를 예약하셨다면 예약한 숙소명이나 주소를 입력해주세요.`,
        };
    }

    return {
        handled: false,
        facts,
    };
}

module.exports = {
    buildYanoljaUrl,
    handleAccommodationStep,
};