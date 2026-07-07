const { CURRENT_STEP, ROUTE_NUMBER } = require("../data/constants");
const { detectCorrectionTarget } = require("./ontologyService");

/**
 * ==========================================================
 * Correction Service
 * ==========================================================
 *
 * 역할
 * - 사용자가 이전 입력을 수정하려는 경우 처리
 * - 수정 의도 판단은 intentService가 담당
 * - 수정 대상 판단은 ontologyService가 담당
 * - 수정 대상부터 이후 facts를 rollback
 * ==========================================================
 */

function getRollbackFields(target) {
    const rollbackMap = {
        region: [
            "region",
            "period",
            "start_date",
            "end_date",
            "trip_type",
            "accommodation",
            "departure_location",
            "start_location",
            "people_count",
            "companion_type",
            "themes",
            "selected_places",
            "related_places",
            "recommendation_round",
            "final_selected_places",
            "final_route",
        ],

        period: [
            "period",
            "start_date",
            "end_date",
            "trip_type",
            "accommodation",
            "departure_location",
            "start_location",
            "people_count",
            "companion_type",
            "themes",
            "selected_places",
            "related_places",
            "recommendation_round",
            "final_selected_places",
            "final_route",
        ],

        accommodation: [
            "accommodation",
            "start_location",
            "people_count",
            "companion_type",
            "themes",
            "selected_places",
            "related_places",
            "recommendation_round",
            "final_selected_places",
            "final_route",
        ],

        departure_location: [
            "departure_location",
            "start_location",
            "people_count",
            "companion_type",
            "themes",
            "selected_places",
            "related_places",
            "recommendation_round",
            "final_selected_places",
            "final_route",
        ],

        people_count: [
            "people_count",
            "companion_type",
            "themes",
            "selected_places",
            "related_places",
            "recommendation_round",
            "final_selected_places",
            "final_route",
        ],

        companion_type: [
            "companion_type",
            "themes",
            "selected_places",
            "related_places",
            "recommendation_round",
            "final_selected_places",
            "final_route",
        ],
    };

    return rollbackMap[target] || [];
}

function rollbackFacts(facts = {}, rollbackFields = []) {
    const nextFacts = structuredClone(facts);

    for (const field of rollbackFields) {
        if (field === "region") nextFacts.region = null;

        if (field === "period") nextFacts.period = null;
        if (field === "start_date") nextFacts.start_date = null;
        if (field === "end_date") nextFacts.end_date = null;
        if (field === "trip_type") nextFacts.trip_type = null;

        if (field === "accommodation") nextFacts.accommodation = null;
        if (field === "departure_location") nextFacts.departure_location = null;
        if (field === "start_location") nextFacts.start_location = null;

        if (field === "people_count") nextFacts.people_count = null;
        if (field === "companion_type") nextFacts.companion_type = null;

        if (field === "themes") nextFacts.themes = [];
        if (field === "selected_places") nextFacts.selected_places = [];
        if (field === "related_places") nextFacts.related_places = [];
        if (field === "recommendation_round") nextFacts.recommendation_round = 1;
        if (field === "final_selected_places") nextFacts.final_selected_places = [];
        if (field === "final_route") nextFacts.final_route = null;
    }

    return nextFacts;
}

function getCorrectionStep(target) {
    const stepMap = {
        region: {
            currentStep: CURRENT_STEP.ASK_REGION,
            routeNumber: ROUTE_NUMBER.TRAVEL_INFO,
            lastQuestionField: "region",
        },

        period: {
            currentStep: CURRENT_STEP.ASK_PERIOD,
            routeNumber: ROUTE_NUMBER.TRAVEL_INFO,
            lastQuestionField: "period",
        },

        accommodation: {
            currentStep: CURRENT_STEP.ASK_ACCOMMODATION,
            routeNumber: ROUTE_NUMBER.POST_BOOKING,
            lastQuestionField: "accommodation",
        },

        departure_location: {
            currentStep: CURRENT_STEP.ASK_START_LOCATION,
            routeNumber: ROUTE_NUMBER.POST_BOOKING,
            lastQuestionField: "departure_location",
        },

        people_count: {
            currentStep: CURRENT_STEP.ASK_PEOPLE_COUNT,
            routeNumber: ROUTE_NUMBER.POST_BOOKING,
            lastQuestionField: "people_count",
        },

        companion_type: {
            currentStep: CURRENT_STEP.ASK_COMPANION_TYPE,
            routeNumber: ROUTE_NUMBER.POST_BOOKING,
            lastQuestionField: "companion_type",
        },
    };

    return (
        stepMap[target] || {
            currentStep: CURRENT_STEP.ASK_REGION,
            routeNumber: ROUTE_NUMBER.TRAVEL_INFO,
            lastQuestionField: "region",
        }
    );
}

function buildCorrectionReply(target, facts = {}) {
    if (target === "region") {
        return "알겠습니다. 여행 지역을 다시 알려주세요.";
    }

    if (target === "period") {
        return `${facts.region ? `${facts.region} 여행 지역은 유지할게요. ` : ""}여행 기간을 다시 알려주세요.`;
    }

    if (target === "accommodation") {
        return "알겠습니다. 예약하신 숙소명이나 주소를 다시 알려주세요.";
    }

    if (target === "departure_location") {
        return "알겠습니다. 당일치기 출발지를 다시 알려주세요.";
    }

    if (target === "people_count") {
        return "알겠습니다. 총 몇 명이 여행하시나요?";
    }

    if (target === "companion_type") {
        return "알겠습니다. 누구와 함께 여행하시나요?";
    }

    return "알겠습니다. 수정할 정보를 다시 말씀해주세요.";
}

function handleCorrection({ userMessage, facts }) {
    const target = detectCorrectionTarget(userMessage);

    if (!target) {
        return {
            handled: false,
            facts,
        };
    }

    const rollbackFields = getRollbackFields(target);
    const rolledBackFacts = rollbackFacts(facts, rollbackFields);
    const step = getCorrectionStep(target);
    const reply = buildCorrectionReply(target, rolledBackFacts);

    return {
        handled: true,
        facts: rolledBackFacts,
        correctionTarget: target,
        rollbackFields: rollbackFields.join(","),
        currentStep: step.currentStep,
        routeNumber: step.routeNumber,
        lastQuestionField: step.lastQuestionField,
        reply,
    };
}

module.exports = {
    handleCorrection,
    getRollbackFields,
    rollbackFacts,
    getCorrectionStep,
    buildCorrectionReply,
};