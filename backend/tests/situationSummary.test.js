const { test } = require("node:test");
const assert = require("node:assert/strict");

// 동행자를 받은 직후 추천이 나가므로, 무엇으로 알아들었는지 먼저 보여야 한다.
const recommendation = require("../src/services/attractionRecommendationService");
recommendation.recommendAttractions = async () => ({
    recommendations: [{ id: 1, name: "자라섬", theme: "자연관광", address: "가평군" }],
    recommendedHistory: [1],
    recommendationRound: 1,
    nextRecommendationRound: null,
    hasMore: false,
    exhausted: false,
    reply: "추천 목록",
});
const weather = require("../src/services/weatherRecommendationService");
weather.getWeatherRecommendationContext = async () => ({ available: false, forecasts: [], indoorRecommended: false });
const airQuality = require("../src/services/airQualityService");
airQuality.getAirQuality = async () => ({ available: false, indoorRecommended: false });

const sessionService = require("../src/services/sessionService");
const { handleChat } = require("../src/services/chatService");

async function recommendWith(facts, message = "추천해줘") {
    let session = {
        currentStep: "READY_FOR_RECOMMENDATION",
        ...facts,
        facts,
    };
    sessionService.loadSession = async () => session;
    sessionService.saveConversationState = async (state) => {
        session = { ...sessionService.buildSessionDataFromFacts(state), facts: state.facts };
        return session;
    };
    return await handleChat({ sessionId: "test", userMessage: message });
}

test("the companion is confirmed before the weather summary", async () => {
    const result = await recommendWith({
        region: "가평", companionType: "연인", language: "ko",
        startDate: new Date("2026-09-13"), endDate: new Date("2026-09-14"),
    });
    const [firstLine] = result.situationSummary.split("\n");
    assert.equal(firstLine, "동행자 유형은 '연인'으로 확인했습니다.");
    // 날씨 문구는 그 뒤에 온다.
    assert.ok(result.situationSummary.indexOf("동행자 유형은") < result.situationSummary.indexOf("날씨"));
});

test("the confirmation is in English for an English conversation", async () => {
    // 언어는 세션이 아니라 이번 메시지를 따라가므로 영어로 말한다.
    const result = await recommendWith({
        region: "가평", companionType: "부모님", language: "en",
        startDate: new Date("2026-09-13"), endDate: new Date("2026-09-14"),
    }, "recommend some places");
    const [firstLine] = result.situationSummary.split("\n");
    assert.equal(firstLine, "Travelling with: your parents.");
    assert.ok(!/[가-힣]/.test(result.situationSummary));
});

test("without a companion the summary starts with the weather as before", async () => {
    const result = await recommendWith({
        region: "가평", companionType: null, language: "ko",
        startDate: new Date("2026-09-13"), endDate: new Date("2026-09-14"),
    });
    assert.ok(!result.situationSummary.startsWith("동행자"));
});
