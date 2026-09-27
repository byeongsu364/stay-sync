const finalTravelPlanPrompt = require("../prompts/finalTravelPlanPrompt");
const { callLLM } = require("./llmService");
const { withJosa } = require("../utils/koreanUtils");
const env = require("../config/env");

function compactDescription(value, maximumLength = 140) {
    const text = String(value || "").replace(/\s+/g, " ").trim();
    if (!text) return null;
    const firstSentence = text.match(/^.*?[.!?](?:\s|$)/)?.[0]?.trim() || text;
    if (firstSentence.length <= maximumLength) return firstSentence;
    return `${firstSentence.slice(0, maximumLength).trim()}…`;
}

function flexibleNamePattern(name) {
    return [...String(name || "").replace(/\s+/g, "")]
        .map((character) => character.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
        .join("\\s*");
}

function stripRepeatedPlaceName(description, placeName) {
    const text = compactDescription(description);
    const namePattern = flexibleNamePattern(placeName);
    if (!text || !namePattern) return text;

    // 관광 API 설명은 '경기도 가평군에 위치한 청평 자연휴양림은...'처럼
    // 시작하는 경우가 많다. 앞에서 이미 장소명을 썼으므로 서술부만 남긴다.
    const stripped = text.replace(
        new RegExp(`^(?:[^.!?\\n]{0,60}?에\\s*위치한\\s*)?${namePattern}(?:은|는|이|가|의)\\s*`, "i"),
        "",
    ).trim();
    return stripped
        .replace(/이다\.?$/, "입니다.")
        .replace(/있다\.?$/, "있습니다.")
        .replace(/없다\.?$/, "없습니다.")
        .replace(/한다\.?$/, "합니다.")
        .replace(/된다\.?$/, "됩니다.");
}

function polishRepeatedPlaceSubjects(story, placeNames) {
    let polished = String(story || "");
    for (const placeName of placeNames) {
        const namePattern = flexibleNamePattern(placeName);
        if (!namePattern) continue;
        polished = polished.replace(
            new RegExp(
                `(${namePattern}\\s*에서는)\\s*(?:[^.!?\\n]{0,60}?에\\s*위치한\\s*)?${namePattern}(?:은|는|이|가)\\s*`,
                "gi",
            ),
            "$1 ",
        );
    }
    return polished;
}

function buildStoryInput(facts, dailyRoutes) {
    return {
        language: facts.language || "ko",
        region: facts.region || null,
        period: facts.period || null,
        tripType: facts.trip_type || null,
        companionType: facts.companion_type || null,
        themes: facts.themes || [],
        origin: facts.start_location?.name || null,
        weatherForecasts: facts.weather_forecasts || [],
        airQuality: facts.air_quality || null,
        selectedPlaces: (facts.selected_places || []).map((place) => ({
            name: place.name,
            description: compactDescription(place.description),
            theme: place.theme || null,
            indoorOutdoor: place.indoorOutdoor || null,
        })),
        dailyRoutes: dailyRoutes.map((route) => ({
            day: route.day,
            date: route.date,
            origin: route.origin?.name || null,
            stops: route.stops.map((stop) => ({
                order: stop.order,
                name: stop.name,
                fromPreviousKm: stop.fromPreviousKm,
            })),
            returnToOrigin: route.returnToOrigin,
            returnDistanceKm: route.returnDistanceKm,
            totalDistanceKm: route.totalDistanceKm,
        })),
    };
}

const COMPANION_PHRASES = {
    혼자: "혼자 떠나기 좋은",
    연인: "연인과 함께 걷기 좋은",
    친구: "친구와 함께 즐기기 좋은",
    가족: "가족이 함께 즐기기 좋은",
    아이동반: "아이와 함께 다니기 좋은",
    부모님: "부모님과 함께 다녀오기 좋은",
    단체: "여럿이 함께 즐기기 좋은",
};

function buildCompanionPhrase(companionType) {
    if (!companionType) return null;
    return (
        COMPANION_PHRASES[companionType] ||
        `${withJosa(companionType, "과", "와")} 함께하기 좋은`
    );
}

function buildHeadline(region, companionPhrase) {
    if (region && companionPhrase) return `${region}, ${companionPhrase} 여행`;
    if (region) return `${region}에서 이어지는 여행`;
    if (companionPhrase) return `${companionPhrase} 여행`;
    return "선택한 장소로 이어지는 여행";
}

function buildKoreanIntroduction(facts) {
    const parts = [];
    if (facts.period) parts.push(`${facts.period} 일정`);
    if (facts.companion_type) parts.push(`${withJosa(facts.companion_type, "과", "와")} 함께하는 여행`);
    if (facts.themes?.length) parts.push(`${facts.themes.slice(0, 3).join("·")} 중심 코스`);
    const basis = parts.length ? `${parts.join(", ")}입니다.` : "선택한 관광지를 실제 이동 순서에 맞춰 연결한 코스입니다.";
    return `${basis} 도로망을 기준으로 정한 방문 순서를 따라 하루의 흐름이 자연스럽게 이어집니다.`;
}

function buildKoreanDayStory(route, descriptions) {
    const stops = route.stops || [];
    const title = `${route.day}일차${route.date ? ` (${route.date})` : ""}`;
    if (stops.length === 0) return null;

    const names = stops.map(({ name }) => name).filter(Boolean);
    const origin = route.origin?.name;
    const opening = origin
        ? `${withJosa(origin, "에서", "에서")} 출발해 첫 목적지인 ${withJosa(names[0], "으로", "로")} 향합니다.`
        : `첫 목적지는 ${names[0]}입니다.`;
    const remainingNames = names.slice(1);
    const routeFlow = remainingNames.length > 1
        ? `이후 ${remainingNames.map((name) => withJosa(name, "으로", "로")).join(", ")} 차례로 이동합니다.`
        : remainingNames.length === 1
            ? `이후 ${withJosa(remainingNames[0], "으로", "로")} 이동합니다.`
        : "한 장소에 집중할 수 있도록 여유 있게 구성했습니다.";
    const details = stops
        .map(({ name }) => descriptions.get(name) ? `${name}에서는 ${descriptions.get(name)}` : null)
        .filter(Boolean)
        .slice(0, 2)
        .join(" ");
    const ending = route.returnToOrigin
        ? `${withJosa(names.at(-1), "을", "를")} 마친 뒤 ${withJosa(origin || "숙소", "으로", "로")} 돌아와 하루를 마무리합니다.`
        : `${withJosa(names.at(-1), "에서", "에서")} 이날 일정을 마무리합니다.`;

    return `${title}\n${[opening, routeFlow, details, ending].filter(Boolean).join(" ")}`;
}

function buildKoreanTip(facts) {
    const forecasts = facts.weather_forecasts || [];
    const reasons = [...new Set(forecasts.flatMap(({ reasons = [] }) => reasons))];
    const tips = [];
    if (reasons.includes("비")) tips.push("비 예보가 있는 날짜에는 우산과 미끄럽지 않은 신발을 준비해주세요");
    if (reasons.includes("폭염")) tips.push("기온이 높은 시간대에는 물과 가벼운 복장을 챙겨주세요");
    if (reasons.includes("한파")) tips.push("추위에 대비해 보온 의류를 준비해주세요");
    if (["나쁨", "매우나쁨"].includes(facts.air_quality?.grade)) {
        tips.push("미세먼지에 대비해 마스크를 챙기고 실내 중심으로 조정해주세요");
    }
    if (tips.length === 0) tips.push("출발 전 각 관광지의 당일 운영 여부와 최신 날씨를 확인해주세요");
    return `여행 준비 팁\n${tips.join(". ")}.`;
}

function buildEnglishFallbackStory(facts, dailyRoutes, descriptions) {
    const title = facts.region ? `${facts.region}: your trip, connected` : "Your connected travel plan";
    const introParts = [facts.period, facts.companion_type ? `travelling with ${facts.companion_type}` : null]
        .filter(Boolean).join(", ");
    const introduction = `${introParts ? `${introParts}. ` : ""}The stops follow the order calculated from the road network.`;
    const days = dailyRoutes.map((route) => {
        const names = route.stops.map(({ name }) => name).filter(Boolean);
        if (!names.length) return null;
        const details = route.stops
            .map(({ name }) => descriptions.get(name) ? `At ${name}, ${descriptions.get(name)}` : null)
            .filter(Boolean).slice(0, 2).join(" ");
        const returnText = route.returnToOrigin
            ? ` After the final stop, return to ${route.origin?.name || "your stay"}.`
            : ` Finish the day at ${names.at(-1)}.`;
        return `Day ${route.day}${route.date ? ` (${route.date})` : ""}\nStart from ${route.origin?.name || names[0]} and continue through ${names.join(" → ")}. ${details}${returnText}`;
    }).filter(Boolean);
    return `${title}\n\n${introduction}\n\n${days.join("\n\n")}\n\nTravel tip\nCheck the latest weather and each attraction's operating status before departure.`;
}

function buildFallbackStory(facts, dailyRoutes) {
    const descriptions = new Map((facts.selected_places || []).map((place) => (
        [place.name, stripRepeatedPlaceName(place.description, place.name)]
    )));
    if (facts.language === "en") return buildEnglishFallbackStory(facts, dailyRoutes, descriptions);

    const headline = buildHeadline(facts.region || null, buildCompanionPhrase(facts.companion_type));
    const dayStories = dailyRoutes
        .map((route) => buildKoreanDayStory(route, descriptions))
        .filter(Boolean);
    return [
        headline,
        buildKoreanIntroduction(facts),
        ...dayStories,
        buildKoreanTip(facts),
    ].join("\n\n").trim();
}

async function createTravelStory({ facts, dailyRoutes }) {
    const placeNames = (facts.selected_places || []).map(({ name }) => name).filter(Boolean);
    try {
        const story = await callLLM(
            finalTravelPlanPrompt,
            `다음 JSON만 근거로 여행 이야기를 작성해줘.\n${JSON.stringify(buildStoryInput(facts, dailyRoutes))}`,
            // 스토리는 부가 정보이므로 LLM 때문에 최종 동선 전체를 오래
            // 기다리지 않는다. 제한 시간 뒤에는 즉시 기본 스토리를 사용한다.
            { timeout: env.llm.storyTimeoutMs },
        );
        const generated = String(story || "").trim();
        return generated
            ? polishRepeatedPlaceSubjects(generated, placeNames)
            : buildFallbackStory(facts, dailyRoutes);
    } catch (error) {
        console.warn("최종 여행 스토리 생성 실패, 기본 동선 설명을 사용합니다.");
        return buildFallbackStory(facts, dailyRoutes);
    }
}

module.exports = {
    buildStoryInput,
    compactDescription,
    stripRepeatedPlaceName,
    polishRepeatedPlaceSubjects,
    buildFallbackStory,
    createTravelStory,
};
