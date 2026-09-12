const { test } = require("node:test");
const assert = require("node:assert/strict");

// 영문 관광지가 없는 지역은 영어 대화에서 진행하지 않는다.
const repository = require("../src/repositories/attractionRepository");
const { buildTitleAliases } = require("../src/utils/attractionNameUtils");

const places = [
    { id: 1, title: "자라섬", titleEn: "JARA ISLAND", region: "가평", theme: "자연관광", mapx: 127.5, mapy: 37.8 },
    { id: 2, title: "구리 동구릉", titleEn: "East Nine Royal Tombs", region: "구리", theme: "역사관광", mapx: 127.1, mapy: 37.6 },
];
repository.searchAttractionsByName = async ({ name }) => {
    const normalized = name.replace(/[^0-9a-z가-힣]/gi, "").toLowerCase();
    return places.filter(({ title, region, titleEn }) => (
        buildTitleAliases(title, region, titleEn).some((alias) => normalized.includes(alias))
    ));
};
// 가평은 영어로 추천할 관광지가 있고, 구리는 없다.
repository.findEnglishAttractionCountsByRegion = async () => new Map([
    ["가평", 9], ["파주", 16], ["고양", 3],
]);

const coverage = require("../src/services/englishCoverageService");
const sessionService = require("../src/services/sessionService");
const { handleChat } = require("../src/services/chatService");

function startSession() {
    coverage.resetCache();
    let session = { currentStep: "ASK_SERVICE_TYPE", language: "ko", facts: {} };
    sessionService.loadSession = async () => session;
    sessionService.saveConversationState = async (state) => {
        session = { ...sessionService.buildSessionDataFromFacts(state), facts: state.facts };
        return session;
    };
    return (message) => handleChat({ sessionId: "test", userMessage: message });
}

test("a region is available in English only when it has recommendable English attractions", async () => {
    coverage.resetCache();
    assert.equal(await coverage.isRegionAvailableInEnglish("가평"), true);
    assert.equal(await coverage.isRegionAvailableInEnglish("구리"), false);
    assert.equal(await coverage.isRegionAvailableInEnglish(null), false);
    assert.deepEqual(await coverage.getAvailableEnglishRegions(), ["고양", "파주", "가평"]);
});

test("an English conversation stops at the region step for a region with no English attractions", async () => {
    const say = startSession();
    await say("I already booked my hotel");
    const blocked = await say("Guri");

    assert.match(blocked.reply, /do not have English tourism information/);
    // 지역이 저장되지 않고 같은 단계에 머문다.
    assert.equal(blocked.currentStep, "ASK_ATTRACTION_REGION");
    assert.equal(blocked.facts.region, null);
    // 이어서 고를 수 있도록 가능한 지역을 함께 준다.
    assert.deepEqual(blocked.quickReplies.map(({ value }) => value), ["고양", "파주", "가평"]);
});

test("naming an attraction in that region in English is stopped too", async () => {
    const say = startSession();
    await say("I already booked my hotel");
    const blocked = await say("East Nine Royal Tombs");

    assert.match(blocked.reply, /do not have English tourism information/);
    assert.equal(blocked.facts.region, null);
});

test("the conversation continues once an available region is chosen", async () => {
    const say = startSession();
    await say("I already booked my hotel");
    await say("Guri");
    const resumed = await say("Gapyeong");

    assert.equal(resumed.currentStep, "ASK_PERIOD");
    assert.equal(resumed.facts.region, "가평");
    assert.equal(resumed.facts.language, "en");
});

test("switching to Korean makes the same region work again", async () => {
    const say = startSession();
    await say("I already booked my hotel");
    await say("Guri");
    const inKorean = await say("구리 동구릉");

    assert.equal(inKorean.currentStep, "ASK_PERIOD");
    assert.equal(inKorean.facts.region, "구리");
    assert.equal(inKorean.facts.language, "ko");
});

test("a Korean conversation is never blocked", async () => {
    const say = startSession();
    await say("2");
    const destination = await say("구리 동구릉");

    assert.equal(destination.currentStep, "ASK_PERIOD");
    assert.equal(destination.facts.region, "구리");
});
