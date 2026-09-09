const travelIntentPrompt = require("../prompts/travelIntentPrompt");
const { callLLMJson } = require("./llmService");
const { formatDate, getToday, isOneDayTrip } = require("../utils/dateUtils");
const { CURRENT_STEP, ROUTE_NUMBER, SERVICE_TYPE } = require("../data/constants");

function addDays(date, days) {
    const result = new Date(date);
    result.setDate(result.getDate() + days);
    return result;
}

function parseSimplePeriod(userMessage, now = new Date()) {
    const text = String(userMessage || "").replace(/\s/g, "");
    let offset = null;
    if (text.includes("모레")) offset = 2;
    else if (text.includes("내일")) offset = 1;
    else if (text.includes("오늘")) offset = 0;

    if (offset === null) return null;

    const startDate = addDays(now, offset);
    const koreanDurations = [
        ["열흘", 10],
        ["아흐레", 9],
        ["여드레", 8],
        ["이레", 7],
        ["엿새", 6],
        ["닷새", 5],
        ["나흘", 4],
        ["사흘", 3],
        ["이틀", 2],
        ["하루", 1],
    ];
    const koreanDuration = koreanDurations.find(([word]) => text.includes(word));
    const nightMatch = text.match(/(\d+)박(?:\s*)(\d+)일/);
    const dayMatch = text.match(/(\d+)일(?:동안|간)?/);
    const duration = nightMatch
        ? Number.parseInt(nightMatch[2], 10)
        : dayMatch
            ? Number.parseInt(dayMatch[1], 10)
            : koreanDuration?.[1] || 1;
    const endDate = addDays(startDate, Math.max(1, duration) - 1);
    const start = formatDate(startDate);
    const end = formatDate(endDate);

    return {
        period: start === end ? start : `${start} ~ ${end}`,
        start_date: start,
        end_date: end,
    };
}

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

function captureUndatedTripType(userMessage, facts) {
    const text = String(userMessage || "");
    if (!facts.start_date && !facts.end_date
        && /당일\s*치기/.test(text)
        && !/아니|말고|않|취소/.test(text)) {
        // '당일치기'는 여행 유형만 뜻한다. 방문 날짜를 오늘로 추정하지 않는다.
        return { ...facts, trip_type: "당일치기" };
    }
    return facts;
}

function buildPeriodQuestion(facts) {
    return facts.trip_type === "당일치기"
        ? "당일치기 여행은 어느 날짜에 가시나요? 예: 내일, 9월 12일"
        : "언제부터 언제까지 여행하시나요?";
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
            reply: `${facts.region} 여행으로 확인했습니다. ${buildPeriodQuestion(facts)}`,
        };
    }

    if (facts.trip_type === "당일치기") {
        return {
            route_number: ROUTE_NUMBER.POST_BOOKING,
            current_step: "ASK_START_LOCATION",
            reply: `${facts.region} 당일치기 여행이시군요. 동선 추천을 위해 출발지를 입력해주세요.`,
        };
    }

    if (facts.service_type === SERVICE_TYPE.ATTRACTION) {
        return {
            route_number: ROUTE_NUMBER.POST_BOOKING,
            current_step: CURRENT_STEP.ASK_ACCOMMODATION,
            reply: "예약하신 숙소명이나 주소를 입력해주세요.",
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
    const capturedFacts = captureUndatedTripType(userMessage, facts);
    const tripTypeCaptured = capturedFacts !== facts;
    facts = capturedFacts;
    const simplePeriod = parseSimplePeriod(userMessage);
    if (facts.region && simplePeriod) {
        const mergedFacts = applyTripType(mergeTravelFacts(facts, simplePeriod));
        const stepResult = decideTravelIntentStep(mergedFacts);
        return {
            facts: mergedFacts,
            route_number: stepResult.route_number,
            current_step: stepResult.current_step,
            reply: stepResult.reply,
        };
    }

    if (tripTypeCaptured) {
        return { facts, ...decideTravelIntentStep(facts) };
    }

    const userPrompt = `
현재 날짜:
${getToday()}

현재 facts:
${JSON.stringify(facts, null, 2)}

사용자 입력:
${userMessage}
`;

    let llmResult;
    try {
        llmResult = await callLLMJson(travelIntentPrompt, userPrompt);
    } catch (error) {
        console.warn(`[TravelIntent] LLM 해석 실패: ${error.message}`);
        const stepResult = decideTravelIntentStep(facts);
        return {
            facts,
            route_number: stepResult.route_number,
            current_step: stepResult.current_step,
            reply: `${stepResult.reply}\n예: 내일 하루, 9월 12일부터 14일까지`,
        };
    }

    const newFacts = llmResult?.facts || {};

    let mergedFacts = mergeTravelFacts(facts, newFacts);
    mergedFacts = applyTripType(mergedFacts);

    const stepResult = decideTravelIntentStep(mergedFacts);

    return {
        facts: mergedFacts,
        route_number: stepResult.route_number,
        current_step: stepResult.current_step,
        // LLM이 당일치기에도 숙소 안내 문구를 반환할 수 있으므로,
        // 확정된 facts와 상태로 만든 안내 문구를 항상 사용한다.
        reply: stepResult.reply,
    };
}

module.exports = {
    extractTravelIntent,
    mergeTravelFacts,
    applyTripType,
    decideTravelIntentStep,
    parseSimplePeriod,
    captureUndatedTripType,
    buildPeriodQuestion,
};
