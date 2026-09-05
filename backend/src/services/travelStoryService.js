const finalTravelPlanPrompt = require("../prompts/finalTravelPlanPrompt");
const { callLLM } = require("./llmService");

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

function buildFallbackStory(facts, dailyRoutes) {
    const companion = facts.companion_type
        ? `${facts.companion_type} 여행자에게 어울리는`
        : "여행의 흐름을 살린";
    const region = facts.region ? `${facts.region}에서 ` : "";
    const dayStories = dailyRoutes.map((route) => {
        const names = route.stops.map(({ name }) => name).filter(Boolean);
        if (names.length === 0) return null;
        return `${route.day}일차에는 ${names.join(" → ")} 순서로 둘러보며 각 장소의 매력을 자연스럽게 이어갑니다.`;
    }).filter(Boolean);

    return `${region}${companion} 여행입니다.\n\n${dayStories.join("\n")}`.trim();
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
