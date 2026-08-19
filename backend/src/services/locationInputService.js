const { CURRENT_STEP, ROUTE_NUMBER, SERVICE_TYPE } = require("../data/constants");
const {
    searchLocation: searchKakaoLocation,
} = require("./kakaoLocationService");

/**
 * ==========================================================
 * Location Input Service
 * ==========================================================
 *
 * 역할
 * - 숙소 입력
 * - 출발지 입력
 * - Kakao Local API 위치 검색
 * ==========================================================
 */

/**
 * 위치 검색
 */
async function searchLocation(keyword, options = {}) {
    return await searchKakaoLocation({
        keyword,
        region: options.region,
        categoryGroupCode: options.categoryGroupCode,
    });
}

/**
 * 숙소 검색
 */
async function getAccommodationLocation(name, region) {
    return await searchLocation(name, {
        region,
        categoryGroupCode: "AD5",
    });
}

/**
 * 출발지 검색
 */
async function getDepartureLocation(name, region) {
    return await searchLocation(name, { region });
}

function buildLocationErrorResult({ error, facts, currentStep, field }) {
    const configurationError = error.code === "KAKAO_KEY_MISSING";

    return {
        handled: true,
        facts,
        route_number: ROUTE_NUMBER.POST_BOOKING,
        current_step: currentStep,
        last_question_field: field,
        reply: configurationError
            ? "장소 검색 API가 아직 설정되지 않았습니다. 관리자에게 문의해주세요."
            : "장소 검색 중 오류가 발생했습니다. 잠시 후 다시 입력해주세요.",
    };
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

        let location;

        try {
            location = await getAccommodationLocation(
                userMessage,
                facts.region,
            );
        } catch (error) {
            return buildLocationErrorResult({
                error,
                facts,
                currentStep: CURRENT_STEP.ASK_ACCOMMODATION,
                field: "accommodation",
            });
        }

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

        if (facts.service_type === SERVICE_TYPE.ROUTE_ONLY) {
            return {
                handled: true,
                facts,
                route_number: ROUTE_NUMBER.ROUTE_PLANNING,
                current_step: CURRENT_STEP.READY_FOR_ROUTE_PLANNING,
                last_question_field: null,
                reply: "숙소를 확인했습니다. 날짜별 최적 동선을 계산할게요.",
            };
        }

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

        let location;

        try {
            location = await getDepartureLocation(
                userMessage,
                facts.region,
            );
        } catch (error) {
            return buildLocationErrorResult({
                error,
                facts,
                currentStep: CURRENT_STEP.ASK_START_LOCATION,
                field: "departure_location",
            });
        }

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

        if (facts.service_type === SERVICE_TYPE.ROUTE_ONLY) {
            return {
                handled: true,
                facts,
                route_number: ROUTE_NUMBER.ROUTE_PLANNING,
                current_step: CURRENT_STEP.READY_FOR_ROUTE_PLANNING,
                last_question_field: null,
                reply: "출발지를 확인했습니다. 최적 동선을 계산할게요.",
            };
        }

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
