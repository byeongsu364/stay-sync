const { CURRENT_STEP, ROUTE_NUMBER } = require("../data/constants");

/**
 * ==========================================================
 * Location Input Service
 * ==========================================================
 *
 * 역할
 * - 숙소 입력
 * - 출발지 입력
 * - 위치 검색(Mock)
 *
 * TODO
 * - Kakao Local API 연동
 * ==========================================================
 */

/**
 * Mock 위치 검색
 */
async function searchLocation(keyword) {

    if (!keyword || keyword.trim() === "") {
        return null;
    }

    return {
        name: keyword.trim(),
        address: keyword.trim(),
        latitude: 37.5665,
        longitude: 126.9780,
    };
}

/**
 * 숙소 검색
 */
async function getAccommodationLocation(name) {
    return await searchLocation(name);
}

/**
 * 출발지 검색
 */
async function getDepartureLocation(name) {
    return await searchLocation(name);
}

/**
 * 위치 입력 처리
 */
async function handleLocationInput({
    userMessage,
    facts,
    currentStep,
}) {

    /**
     * ===============================
     * 숙소 입력
     * ===============================
     */

    if (currentStep === CURRENT_STEP.ASK_ACCOMMODATION) {

        const location =
            await getAccommodationLocation(userMessage);

        if (!location) {

            return {
                handled: true,
                facts,

                route_number:
                    ROUTE_NUMBER.POST_BOOKING,

                current_step:
                    CURRENT_STEP.ASK_ACCOMMODATION,

                last_question_field:
                    "accommodation",

                reply:
                    "숙소를 찾지 못했습니다. 다시 입력해주세요.",
            };
        }

        facts.accommodation = {
            name: location.name,
            address: location.address,
            mapx: location.longitude,
            mapy: location.latitude,
        };

        facts.start_location = facts.accommodation;

        return {
            handled: true,

            facts,

            route_number:
                ROUTE_NUMBER.POST_BOOKING,

            current_step:
                CURRENT_STEP.ASK_COMPANION_TYPE,

            last_question_field:
                "companion_type",

            reply:
                "숙소를 확인했습니다.\n\n" +
                "누구와 함께 여행하시나요?\n" +
                "(혼자, 연인, 친구, 가족, 부모님, 아이동반)",
        };
    }

    /**
     * ===============================
     * 출발지 입력
     * ===============================
     */

    if (currentStep === CURRENT_STEP.ASK_START_LOCATION) {

        const location =
            await getDepartureLocation(userMessage);

        if (!location) {

            return {
                handled: true,
                facts,

                route_number:
                    ROUTE_NUMBER.POST_BOOKING,

                current_step:
                    CURRENT_STEP.ASK_START_LOCATION,

                last_question_field:
                    "departure_location",

                reply:
                    "출발지를 찾을 수 없습니다. 다시 입력해주세요.",
            };
        }

        facts.departure_location = {
            name: location.name,
            address: location.address,
            mapx: location.longitude,
            mapy: location.latitude,
        };

        facts.start_location =
            facts.departure_location;

        return {
            handled: true,

            facts,

            route_number:
                ROUTE_NUMBER.POST_BOOKING,

            current_step:
                CURRENT_STEP.ASK_COMPANION_TYPE,

            last_question_field:
                "companion_type",

            reply:
                "출발지를 확인했습니다.\n\n" +
                "누구와 함께 여행하시나요?\n" +
                "(혼자, 연인, 친구, 가족, 부모님, 아이동반)",
        };
    }

    return {
        handled: false,
        facts,
        current_step: currentStep,
        route_number: null,
        last_question_field: null,
        reply: null,
    };
}

module.exports = {
    searchLocation,
    getAccommodationLocation,
    getDepartureLocation,
    handleLocationInput,
};