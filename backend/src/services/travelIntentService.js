const travelIntentPrompt = require("../prompts/travelIntentPrompt");
const { callLLMJson } = require("./llmService");
const {
    formatDate,
    getToday,
    isOneDayTrip,
    parseDate,
    startOfDay,
    addYears,
    shiftPastDateToNextYear,
} = require("../utils/dateUtils");
const { CURRENT_STEP, ROUTE_NUMBER, SERVICE_TYPE } = require("../data/constants");
const { resolveHolidayPeriod } = require("./holidayService");
const { t, regionLabel } = require("./messageService");

function addDays(date, days) {
    const result = new Date(date);
    result.setDate(result.getDate() + days);
    return result;
}

// 영어로 쓴 수량 표현. 'two days'처럼 숫자 없이 말하는 경우를 위해 둔다.
const ENGLISH_NUMBER_WORDS = {
    a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5,
    six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
};

function parseEnglishDuration(text) {
    const nightMatch = text.match(/(\d+)\s*nights?\s*(?:and\s*)?(\d+)\s*days?/i);
    if (nightMatch) return Number.parseInt(nightMatch[2], 10);

    const nightsOnly = text.match(/(\d+)\s*nights?/i);
    if (nightsOnly) return Number.parseInt(nightsOnly[1], 10) + 1;

    const dayMatch = text.match(/(\d+)\s*days?/i);
    if (dayMatch) return Number.parseInt(dayMatch[1], 10);

    const wordMatch = text.match(/\b(a|an|one|two|three|four|five|six|seven|eight|nine|ten)\s+days?\b/i);
    if (wordMatch) return ENGLISH_NUMBER_WORDS[wordMatch[1].toLowerCase()];

    return null;
}

const ENGLISH_MONTHS = {
    jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
    jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
};

// '내년', '내후년'처럼 해를 직접 가리키는 말.
// 이렇게 말했으면 지난 날짜를 내년으로 미는 보정을 하지 않는다.
const RELATIVE_YEARS = [
    [/내후년|후년|\byear\s+after\s+next\b/i, 2],
    [/내년|명년|다음\s*해|\bnext\s+year\b/i, 1],
    [/올해|금년|\bthis\s+year\b/i, 0],
];

function findRelativeYearOffset(text) {
    const value = String(text || "");
    const found = RELATIVE_YEARS.find(([pattern]) => pattern.test(value));
    return found ? found[1] : null;
}

// '2027년', '2027'처럼 문장 어딘가에 적힌 연도.
function findSpokenYear(text) {
    const match = String(text || "").match(/(?:^|[^\d])((?:19|20)\d{2})\s*년?(?![\d.\-/])/);
    return match ? Number(match[1]) : null;
}

// '6월 5일', '6/5', 'June 5'처럼 직접 말한 날짜를 모두 찾는다.
// 연도를 말하지 않으면 null로 두고 나중에 올해/내년을 정한다.
function findExplicitDates(text) {
    const value = String(text || "");
    const found = [];
    const spans = [];

    const patterns = [
        [/(?:(\d{4})\s*년\s*)?(\d{1,2})\s*월\s*(\d{1,2})\s*일?/g, 1, 2, 3],
        [/(?:(\d{4})\s*[./-]\s*)?(\d{1,2})\s*[./-]\s*(\d{1,2})(?![\d.\-/])/g, 1, 2, 3],
        [new RegExp(
            `\\b(${Object.keys(ENGLISH_MONTHS).join("|")})[a-z]*\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?(?:,?\\s*(\\d{4}))?\\b`,
            "gi",
        ), 3, 1, 2],
    ];

    for (const [pattern, yearGroup, monthGroup, dayGroup] of patterns) {
        for (const match of value.matchAll(pattern)) {
            const rawMonth = match[monthGroup];
            found.push({
                index: match.index,
                year: match[yearGroup] ? Number(match[yearGroup]) : null,
                month: Number.isNaN(Number(rawMonth))
                    ? ENGLISH_MONTHS[String(rawMonth).slice(0, 3).toLowerCase()]
                    : Number(rawMonth),
                day: Number(match[dayGroup]),
            });
            spans.push([match.index, match.index + match[0].length]);
        }
    }

    // '6월 5일부터 7일까지'처럼 뒤쪽에서 월을 생략하는 경우를 받는다.
    // '3일간'처럼 기간을 뜻하는 표현은 날짜로 읽지 않는다.
    const dayOnly = /(?:부터|~|-|to)\s*(\d{1,2})\s*일(?!\s*[간동])/g;
    for (const match of value.matchAll(dayOnly)) {
        const numberIndex = match.index + match[0].indexOf(match[1]);
        if (spans.some(([start, end]) => numberIndex >= start && numberIndex < end)) continue;
        found.push({ index: numberIndex, year: null, month: null, day: Number(match[1]) });
    }

    return found
        .sort((left, right) => left.index - right.index)
        .filter(({ month, day }) => (month === null || (month >= 1 && month <= 12)) && day >= 1 && day <= 31);
}

/**
 * 직접 말한 날짜를 기간으로 바꾼다.
 *
 * 연도를 말하지 않았고 오늘보다 이른 날짜면 내년으로 읽는다.
 * 9월에 '6월 5일'이라고 하면 지난 6월일 리가 없다.
 */
function parseExplicitPeriod(userMessage, now = new Date()) {
    const dates = findExplicitDates(userMessage);
    if (dates.length === 0) return null;

    const firstMonth = dates.find(({ month }) => month !== null)?.month ?? null;
    if (firstMonth === null) return null;

    // 연도를 직접 말했으면 그 해를 그대로 쓰고, 지난 날짜라고 밀지 않는다.
    const spokenYear = findSpokenYear(userMessage);
    const relativeYearOffset = findRelativeYearOffset(userMessage);
    const statedYear = spokenYear
        ?? (relativeYearOffset === null ? null : now.getFullYear() + relativeYearOffset);

    const resolved = [];
    for (const { year, month, day } of dates.slice(0, 2)) {
        const usedMonth = month ?? firstMonth;
        const usedYear = year ?? statedYear ?? now.getFullYear();
        const date = parseDate(`${usedYear}-${String(usedMonth).padStart(2, "0")}-${String(day).padStart(2, "0")}`);
        if (!date) return null;
        resolved.push(year || statedYear ? date : shiftPastDateToNextYear(date, now));
    }

    const [start] = resolved;
    let end = resolved[1] || start;

    // '10월 1일부터 3일간'처럼 날짜 하나에 기간을 덧붙이는 경우를 받는다.
    if (resolved.length === 1) {
        const duration = parseDuration(userMessage);
        if (duration) end = addDays(start, Math.max(1, duration) - 1);
    }

    // '12월 30일부터 1월 2일까지'처럼 해를 넘기는 기간을 받는다.
    if (startOfDay(end) < startOfDay(start)) end = addYears(end, 1);

    return {
        period: formatDate(start) === formatDate(end)
            ? formatDate(start)
            : `${formatDate(start)} ~ ${formatDate(end)}`,
        start_date: formatDate(start),
        end_date: formatDate(end),
    };
}

const KOREAN_DURATIONS = [
    ["열흘", 10], ["아흐레", 9], ["여드레", 8], ["이레", 7], ["엿새", 6],
    ["닷새", 5], ["나흘", 4], ["사흘", 3], ["이틀", 2], ["하루", 1],
];

// '2박3일', '3일간', 'two days'처럼 말한 일수를 읽는다.
function parseDuration(userMessage) {
    const original = String(userMessage || "");
    const text = original.replace(/\s/g, "");

    const nightMatch = text.match(/(\d+)박(?:\s*)(\d+)일/);
    if (nightMatch) return Number.parseInt(nightMatch[2], 10);

    const dayMatch = text.match(/(\d+)일(?:동안|간)/);
    if (dayMatch) return Number.parseInt(dayMatch[1], 10);

    const koreanDuration = KOREAN_DURATIONS.find(([word]) => text.includes(word));
    if (koreanDuration) return koreanDuration[1];

    return parseEnglishDuration(original);
}

function parseSimplePeriod(userMessage, now = new Date()) {
    const original = String(userMessage || "");
    const text = original.replace(/\s/g, "");

    // '개천절 연휴'처럼 공휴일 이름으로 말한 기간을 먼저 본다.
    const statedYear = findSpokenYear(original)
        ?? (findRelativeYearOffset(original) === null
            ? null
            : now.getFullYear() + findRelativeYearOffset(original));
    const holidayPeriod = resolveHolidayPeriod(original, now, statedYear);
    if (holidayPeriod) {
        const { holiday, ...period } = holidayPeriod;
        return period;
    }
    let offset = null;
    if (text.includes("모레")) offset = 2;
    else if (text.includes("내일")) offset = 1;
    else if (text.includes("오늘")) offset = 0;
    else if (/\bday\s+after\s+tomorrow\b/i.test(original)) offset = 2;
    else if (/\btomorrow\b/i.test(original)) offset = 1;
    else if (/\btoday\b/i.test(original)) offset = 0;

    if (offset === null) return parseExplicitPeriod(userMessage, now);

    const startDate = addDays(now, offset);
    // '내일 3일'처럼 '동안' 없이 일수만 말하는 경우도 받는다.
    const bareDayMatch = text.match(/(\d+)일(?!차)/);
    const duration = parseDuration(userMessage)
        || (bareDayMatch ? Number.parseInt(bareDayMatch[1], 10) : null)
        || 1;
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
 * LLM이 돌려준 날짜를 다듬는다.
 *
 * 연도를 빼고 말하면 LLM이 올해로 채워 지난 날짜를 돌려줄 때가 있다.
 * 여행 날짜가 어제일 수는 없으므로 내년으로 읽는다.
 */
function normalizePastDates(facts = {}, now = new Date()) {
    const start = parseDate(facts.start_date);
    const end = parseDate(facts.end_date);
    if (!start) return facts;

    const shiftedStart = shiftPastDateToNextYear(start, now);
    const shiftedYears = shiftedStart.getFullYear() - start.getFullYear();
    if (shiftedYears === 0) return facts;

    // 시작일을 옮기면 종료일도 같이 옮겨야 기간이 유지된다.
    let shiftedEnd = end ? addYears(end, shiftedYears) : shiftedStart;
    if (startOfDay(shiftedEnd) < startOfDay(shiftedStart)) {
        shiftedEnd = addYears(shiftedEnd, 1);
    }

    return {
        ...facts,
        period: formatDate(shiftedStart) === formatDate(shiftedEnd)
            ? formatDate(shiftedStart)
            : `${formatDate(shiftedStart)} ~ ${formatDate(shiftedEnd)}`,
        start_date: formatDate(shiftedStart),
        end_date: formatDate(shiftedEnd),
    };
}

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
        && /당일\s*치기|\bday\s*trip\b/i.test(text)
        && !/아니|말고|않|취소|\bnot\b|\binstead\b/i.test(text)) {
        // '당일치기'는 여행 유형만 뜻한다. 방문 날짜를 오늘로 추정하지 않는다.
        return { ...facts, trip_type: "당일치기" };
    }
    return facts;
}

function buildPeriodQuestion(facts) {
    const language = facts.language || "ko";
    return facts.trip_type === "당일치기"
        ? t("period.askOneDay", {}, language)
        : t("period.askRange", {}, language);
}

/**
 * 다음 단계 결정
 */
function decideTravelIntentStep(facts) {
    const language = facts.language || "ko";

    if (!facts.region) {
        return {
            route_number: ROUTE_NUMBER.TRAVEL_INFO,
            current_step: CURRENT_STEP.ASK_REGION,
            reply: t("travel.askRegion", {}, language),
        };
    }

    if (!facts.period || !facts.start_date || !facts.end_date) {
        return {
            route_number: ROUTE_NUMBER.TRAVEL_INFO,
            current_step: CURRENT_STEP.ASK_PERIOD,
            reply: t("travel.regionConfirmed", {
                region: regionLabel(facts.region, language),
                question: buildPeriodQuestion(facts),
            }, language),
        };
    }

    if (facts.trip_type === "당일치기") {
        return {
            route_number: ROUTE_NUMBER.POST_BOOKING,
            current_step: "ASK_START_LOCATION",
            reply: t("travel.oneDayTrip", { region: regionLabel(facts.region, language) }, language),
        };
    }

    if (facts.service_type === SERVICE_TYPE.ATTRACTION) {
        return {
            route_number: ROUTE_NUMBER.POST_BOOKING,
            current_step: CURRENT_STEP.ASK_ACCOMMODATION,
            reply: t("accommodation.ask", {}, language),
        };
    }

    return {
        route_number: ROUTE_NUMBER.POST_BOOKING,
        current_step: CURRENT_STEP.READY_FOR_ACCOMMODATION_RECOMMENDATION,
        reply: t("accommodation.recommend", { region: regionLabel(facts.region, language), period: facts.period }, language),
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
            reply: `${stepResult.reply}\n${t("period.example", {}, facts.language || "ko")}`,
        };
    }

    const newFacts = normalizePastDates(llmResult?.facts || {});

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
    findRelativeYearOffset,
    findSpokenYear,
    normalizePastDates,
    parseDuration,
    parseExplicitPeriod,
    findExplicitDates,
    mergeTravelFacts,
    applyTripType,
    decideTravelIntentStep,
    parseSimplePeriod,
    captureUndatedTripType,
    buildPeriodQuestion,
};
