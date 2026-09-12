const finalTravelPlanPrompt = require("../prompts/finalTravelPlanPrompt");
const { callLLM } = require("./llmService");
const { hasFinalConsonant, withJosa } = require("../utils/koreanUtils");

function buildStoryInput(facts, dailyRoutes) {
    return {
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
            description: place.description || null,
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
    if (region && companionPhrase) return `${region}에서 ${companionPhrase} 여행 코스입니다.`;
    if (region) return `${region} 여행 코스입니다.`;
    if (companionPhrase) return `${companionPhrase} 여행 코스입니다.`;
    return "추천 여행 코스입니다.";
}

function buildDayStory(day, names) {
    if (names.length === 1) {
        return `${day}일차에는 ${names[0]} 한 곳에서 여유롭게 시간을 보냅니다.`;
    }
    if (names.length === 2) {
        return `${day}일차에는 ${withJosa(names[0], "을", "를")} 둘러본 뒤 ${withJosa(names[1], "으로", "로")} 이동합니다.`;
    }
    const last = names[names.length - 1];
    const middle = names.slice(1, -1).join(", ");
    return `${day}일차에는 ${names[0]}에서 시작해 ${middle}, ${withJosa(last, "을", "를")} 차례로 둘러봅니다.`;
}

function buildFallbackStory(facts, dailyRoutes) {
    const headline = buildHeadline(facts.region || null, buildCompanionPhrase(facts.companion_type));
    const dayStories = dailyRoutes.map((route) => {
        const names = route.stops.map(({ name }) => name).filter(Boolean);
        if (names.length === 0) return null;
        return buildDayStory(route.day, names);
    }).filter(Boolean);

    return `${headline}\n\n${dayStories.join("\n")}`.trim();
}

async function createTravelStory({ facts, dailyRoutes }) {
    try {
        const story = await callLLM(
            finalTravelPlanPrompt,
            `다음 JSON만 근거로 여행 이야기를 작성해줘.\n${JSON.stringify(buildStoryInput(facts, dailyRoutes), null, 2)}`,
            { timeout: 15000 },
        );
        return String(story || "").trim() || buildFallbackStory(facts, dailyRoutes);
    } catch (error) {
        console.warn("최종 여행 스토리 생성 실패, 기본 동선 설명을 사용합니다.");
        return buildFallbackStory(facts, dailyRoutes);
    }
}

module.exports = {
    buildStoryInput,
    buildFallbackStory,
    createTravelStory,
};
