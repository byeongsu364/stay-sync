const postBookingPrompt = require("../prompts/postBookingPrompt");
const { callLLMJson } = require("./llmService");
const {
    normalizeCompanionType,
    mapCompanionToThemes,
} = require("./ontologyService");
const { CURRENT_STEP, ROUTE_NUMBER } = require("../data/constants");

/**
 * ==========================================================
 * Post Booking Service
 * ==========================================================
 *
 * 역할
 * ----------------------------------------------------------
 * 숙소 또는 출발지 입력 이후 필요한 facts를 수집한다.
 *
 * 수집 대상
 * - people_count
 * - companion_type
 *
 * 동행자 유형은 LLM 결과를 그대로 쓰지 않고
 * Ontology 기반으로 정규화한다.
 * ==========================================================
 */

function extractPeopleCount(text) {
    const message = String(text || "");

    const numberMatch = message.match(/(\d+)\s*명?/);
    if (numberMatch) {
        return Number(numberMatch[1]);
    }

    const koreanNumberMap = {
        '혼자': 1,
        '한명': 1,
        '한 명': 1,
        '둘': 2,
        '두명': 2,
        '두 명': 2,
        '셋': 3,
        '세명': 3,
        '세 명': 3,
        '넷': 4,
        '네명': 4,
        '네 명': 4,
        '다섯': 5,
        '다섯명': 5,
        '다섯 명': 5,
    };

    for (const [word, count] of Object.entries(koreanNumberMap)) {
        if (message.includes(word)) {
            return count;
        }
    }

    return null;
}

function mergePostBookingFacts(oldFacts = {}, newFacts = {}) {
    return {
        ...oldFacts,
        people_count:
            newFacts.people_count ?? oldFacts.people_count ?? null,
        companion_type:
            newFacts.companion_type ?? oldFacts.companion_type ?? null,
        themes:
            newFacts.themes?.length ? newFacts.themes : oldFacts.themes || [],
    };
}

function decidePostBookingStep(facts) {
    if (!facts.people_count) {
        return {
            route_number: ROUTE_NUMBER.POST_BOOKING,
            current_step: CURRENT_STEP.ASK_PEOPLE_COUNT,
            last_question_field: "people_count",
            reply: "총 몇 명이 여행하시나요?",
        };
    }

    if (!facts.companion_type) {
        return {
            route_number: ROUTE_NUMBER.POST_BOOKING,
            current_step: CURRENT_STEP.ASK_COMPANION_TYPE,
            last_question_field: "companion_type",
            reply: `${facts.people_count}명이서 여행하시는군요. 누구와 함께 여행하시나요?`,
        };
    }

    return {
        route_number: ROUTE_NUMBER.RECOMMENDATION,
        current_step: CURRENT_STEP.READY_FOR_RECOMMENDATION,
        last_question_field: null,
        reply: buildFinalConfirmReply(facts),
    };
}

function buildFinalConfirmReply(facts) {
    const locationText =
        facts.trip_type === "당일치기"
            ? `출발지는 ${facts.start_location?.name}`
            : `숙소는 ${facts.accommodation?.name}`;

    return `${facts.companion_type}과 함께 ${facts.people_count}명이 ${facts.region}로 ${facts.period} 여행을 가시는군요. ${locationText}로 확인했습니다. 지금까지 수집한 여행 정보를 바탕으로 관광지를 추천해드릴까요?`;
}

async function collectPostBookingFacts({ userMessage, facts }) {
    const text = String(userMessage || "");

    const ontologyCompanion = normalizeCompanionType(text);
    const peopleCount = extractPeopleCount(text);

    const userPrompt = `
현재 facts:
${JSON.stringify(facts, null, 2)}

사용자 입력:
${text}
`;

    const llmResult = await callLLMJson(postBookingPrompt, userPrompt);
    const llmFacts = llmResult?.facts || {};

    const companionType =
        ontologyCompanion ||
        normalizeCompanionType(llmFacts.companion_type) ||
        facts.companion_type ||
        null;

    const mergedFacts = mergePostBookingFacts(facts, {
        people_count: peopleCount ?? llmFacts.people_count,
        companion_type: companionType,
        themes: companionType ? mapCompanionToThemes(companionType) : facts.themes,
    });

    const step = decidePostBookingStep(mergedFacts);

    return {
        facts: mergedFacts,
        route_number: step.route_number,
        current_step: step.current_step,
        last_question_field: step.last_question_field,
        reply: llmResult?.reply || step.reply,
    };
}

module.exports = {
    extractPeopleCount,
    mergePostBookingFacts,
    decidePostBookingStep,
    buildFinalConfirmReply,
    collectPostBookingFacts,
};