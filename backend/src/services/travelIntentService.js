const travelIntentPrompt = require("../prompts/travelIntentPrompt");
const { callLLMJson } = require("./llmService");
const { getToday, isOneDayTrip } = require("../utils/dateUtils");
const { CURRENT_STEP, ROUTE_NUMBER } = require("../data/constants");

/**
 * 여행 의도 분석 서비스
 *
 * n8n 기준:
 * Travel Intent Extraction Agent
 * + Session Context Integration 역할
 */

/**
 * 기존 facts와 새 facts 병합
 */
function mergeTravelFacts(oldFacts = {}, newFacts = {}) {
    return {
        ...oldFacts,

        region: newFacts.region ?? oldFacts.region ?? null,
        period: newFacts.period ?? oldFacts.period ?? null,
        start_date: newFacts.start_date ?? oldFacts.start_date ?? null,
        end_date: newFacts.end_date ?? oldFacts.end_date ?? null,
    };
}

/**
 * 여행 기간을 기준으로 숙박/당일치기 판단
 */
function applyTripType(facts) {
    if (!facts.start_date || !facts.end_date) {
        return facts;
    }

    if (isOneDayTrip(facts.start_date, facts.end_date)) {
        return {
            ...facts,
            trip_type: "당일치기",
        };
    }

    return {
        ...facts,
        trip_type: "숙박",
    };
}

/**
 * 다음 단계 결정
 */
function decideTravelIntentStep(facts) {
    if (!facts.region) {
        return {
            route_number: ROUTE_NUMBER.TRAVEL_INFO,
            current_step: CURRENT_STEP.ASK_REGION,
            reply: "안녕하세요! 어디로 여행을 가시나요?",
        };
    }

    if (!facts.period || !facts.start_date || !facts.end_date) {
        return {
            route_number: ROUTE_NUMBER.TRAVEL_INFO,
            current_step: CURRENT_STEP.ASK_PERIOD,
            reply: `${facts.region}으로 여행을 가시는군요. 언제부터 언제까지 여행을 가시나요?`,
        };
    }

    if (facts.trip_type === "당일치기") {
        return {
            route_number: ROUTE_NUMBER.POST_BOOKING,
            current_step: "ASK_START_LOCATION",
            reply: `${facts.region} 당일치기 여행이시군요. 동선 추천을 위해 출발지를 입력해주세요.`,
        };
    }

    return {
        route_number: ROUTE_NUMBER.POST_BOOKING,
        current_step: CURRENT_STEP.READY_FOR_ACCOMMODATION_RECOMMENDATION,
        reply: `${facts.region} 지역의 ${facts.period} 일정에 맞는 숙소를 추천해드릴게요.`,
    };
}

/**
 * 여행 의도 분석 메인 함수
 */
async function extractTravelIntent({ userMessage, facts }) {
    const userPrompt = `
현재 날짜:
${getToday()}

현재 facts:
${JSON.stringify(facts, null, 2)}

사용자 입력:
${userMessage}
`;

    const llmResult = await callLLMJson(travelIntentPrompt, userPrompt);

    const newFacts = llmResult?.facts || {};

    let mergedFacts = mergeTravelFacts(facts, newFacts);
    mergedFacts = applyTripType(mergedFacts);

    const stepResult = decideTravelIntentStep(mergedFacts);

    return {
        facts: mergedFacts,
        route_number: stepResult.route_number,
        current_step: stepResult.current_step,
        reply: llmResult?.reply || stepResult.reply,
    };
}

module.exports = {
    extractTravelIntent,
    mergeTravelFacts,
    applyTripType,
    decideTravelIntentStep,
};