const { CURRENT_STEP, ROUTE_NUMBER } = require("../data/constants");
const { detectCorrectionTarget } = require("./ontologyService");
const { t } = require("./messageService");

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

// 정정하려는 뉘앙스를 나타내는 표현.
// 어떤 값을 고칠지 말하지 않고 '아니다'처럼만 답하는 경우도 정정으로 읽는다.
// 어미까지 함께 지워야 정정 표현만 남은 입력과 새 값을 함께 말한 입력을 구분할 수 있다.
const CORRECTION_CUE_SOURCE = [
    "아닌[데가]?",
    "아니[다야라고요네지]?",
    "아냐",
    "틀렸[어다네]?",
    "틀림",
    "잘못(?:됐|했)?[어다네]?",
    "수정",
    "변경",
    "취소",
    "정정",
    "되돌려?",
    "바꿔줘?",
    "바꾸[고자]?",
    "말고",
    "이전",
    "아까",

    // 영어
    "\\bnot\\s+that\\b",
    "\\bno(?:pe)?\\b",
    "\\bwrong\\b",
    "\\bmistake\\b",
    "\\bchange\\s+(?:that|it|the)\\b",
    "\\bcancel\\b",
    "\\binstead\\b",
    "\\bactually\\b",
    "\\bi\\s+meant\\b",
    "\\bnever\\s*mind\\b",
    "\\bscratch\\s+that\\b",
    "\\bgo\\s+back\\b",
    "\\bundo\\b",
].join("|");

function mentionsCorrection(text) {
    const value = String(text || "");
    // 한국어 표현은 조사가 붙어 나오므로 공백을 지운 문장에서 찾고,
    // 영어 표현은 낱말 사이 공백이 뜻을 가지므로 원문에서 찾는다.
    return new RegExp(CORRECTION_CUE_SOURCE, "i").test(value)
        || new RegExp(CORRECTION_CUE_SOURCE, "i").test(value.replace(/\s/g, ""));
}

// 정정 표현을 걷어내고도 말이 남으면 새 값을 함께 말한 것으로 본다.
// 예) '아니다 내일부터 이틀간' → '내일부터 이틀간'
function mentionsValueBesidesCorrection(text) {
    return String(text || "")
        .replace(new RegExp(CORRECTION_CUE_SOURCE, "gi"), "")
        .replace(/[^0-9a-z가-힣]/gi, "") !== "";
}

// 고칠 대상을 말하지 않았으면 바로 앞 단계로 되돌린다.
function getPreviousStepTarget(currentStep, facts = {}) {
    const previousTargets = {
        [CURRENT_STEP.ASK_PERIOD]: "region",
        [CURRENT_STEP.ASK_ACCOMMODATION]: "period",
        [CURRENT_STEP.ASK_START_LOCATION]: "period",
        [CURRENT_STEP.ASK_COMPANION_TYPE]: facts.trip_type === "당일치기"
            ? "departure_location"
            : "accommodation",
        [CURRENT_STEP.RECOMMENDATION_SHOWN]: "companion_type",
        [CURRENT_STEP.ASK_ROUTE_ATTRACTIONS]: "travel_days",
    };

    return previousTargets[currentStep] || null;
}

function getRollbackFields(target) {
    const rollbackMap = {
        region: [
            "region",
            "interest_places",
            "interest_themes",
            "period",
            "start_date",
            "end_date",
            "trip_type",
            "accommodation",
            "departure_location",
            "start_location",
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
            "companion_type",
            "themes",
            "selected_places",
            "related_places",
            "recommendation_round",
            "final_selected_places",
            "final_route",
        ],

        travel_days: [
            "travel_days",
            "trip_type",
            "accommodation",
            "departure_location",
            "start_location",
            "selected_places",
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
    const keepsRegion = !rollbackFields.includes("region");

    for (const field of rollbackFields) {
        if (field === "region") nextFacts.region = null;
        if (field === "interest_places") nextFacts.interest_places = [];
        if (field === "interest_themes") nextFacts.interest_themes = [];

        if (field === "period") nextFacts.period = null;
        if (field === "start_date") nextFacts.start_date = null;
        if (field === "end_date") nextFacts.end_date = null;
        if (field === "trip_type") nextFacts.trip_type = null;

        if (field === "accommodation") nextFacts.accommodation = null;
        if (field === "departure_location") nextFacts.departure_location = null;
        if (field === "start_location") nextFacts.start_location = null;

        if (field === "companion_type") nextFacts.companion_type = null;
        if (field === "travel_days") nextFacts.travel_days = null;

        if (field === "themes") nextFacts.themes = [];
        // 목적지로 직접 말한 관광지는 지역보다 먼저 정한 정보다.
        // 지역을 바꾸는 정정이 아니면 추천으로 고른 곳만 비운다.
        if (field === "selected_places") {
            nextFacts.selected_places = keepsRegion
                ? (facts.selected_places || []).filter(
                    ({ selectionSource }) => selectionSource === "destination",
                )
                : [];
        }
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

        companion_type: {
            currentStep: CURRENT_STEP.ASK_COMPANION_TYPE,
            routeNumber: ROUTE_NUMBER.POST_BOOKING,
            lastQuestionField: "companion_type",
        },

        travel_days: {
            currentStep: CURRENT_STEP.ASK_ROUTE_DAYS,
            routeNumber: ROUTE_NUMBER.ROUTE_PLANNING,
            lastQuestionField: "travel_days",
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
    const language = facts.language || "ko";

    if (target === "region") return t("correction.region", {}, language);

    if (target === "period") {
        return t("correction.period", {
            regionKept: facts.region
                ? t("correction.regionKept", { region: facts.region }, language)
                : "",
        }, language);
    }

    if (target === "accommodation") return t("correction.accommodation", {}, language);
    if (target === "departure_location") return t("correction.departure", {}, language);
    if (target === "companion_type") return t("correction.companion", {}, language);
    if (target === "travel_days") return t("correction.travelDays", {}, language);

    return t("correction.unknown", {}, language);
}

function handleCorrection({ userMessage, facts, currentStep = null }) {
    const target =
        detectCorrectionTarget(userMessage)
        || getPreviousStepTarget(currentStep, facts);

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
    mentionsCorrection,
    mentionsValueBesidesCorrection,
    getPreviousStepTarget,
    getRollbackFields,
    rollbackFacts,
    getCorrectionStep,
    buildCorrectionReply,
};
