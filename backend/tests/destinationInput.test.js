const { test } = require("node:test");
const assert = require("node:assert/strict");

// No running database or LLM required: exercise the real destination and chat flow.
const repository = require("../src/repositories/attractionRepository");
const { buildTitleAliases } = require("../src/utils/attractionNameUtils");
const places = [
    { id: 1, title: "자라섬", region: "가평", theme: "자연관광", mapx: 127.5, mapy: 37.8 },
    { id: 2, title: "아침고요수목원", region: "가평", theme: "문화관광", mapx: 127.3, mapy: 37.7 },
    // 제목에 지역명과 괄호 설명이 함께 붙어 있는 실제 데이터 형태.
    { id: 3, title: "구리 동구릉 [유네스코 세계유산]", region: "구리", theme: "역사관광", mapx: 127.13, mapy: 37.61 },
];
// 별칭 중 하나라도 문장에 들어 있으면 후보로 돌려주는 DB 조회를 흉내 낸다.
repository.searchAttractionsByName = async ({ name, mentionedInText }) => {
    assert.equal(mentionedInText, true);
    const normalized = name.replace(/[^0-9a-z가-힣]/gi, "");
    return places.filter(({ title, region }) => (
        buildTitleAliases(title, region).some((alias) => normalized.includes(alias))
    ));
};

const { resolveSupportedDestination } = require("../src/services/serviceTypeService");
const sessionService = require("../src/services/sessionService");
const { handleChat } = require("../src/services/chatService");

for (const input of ["자라섬", "/자라섬", "자라섬으로 여행 갈거야", "이번엔 자라섬에 가고 싶어요", "가평 자라섬으로 갈 거야"]) {
    test(`destination and theme from: ${input}`, async () => {
        const facts = await resolveSupportedDestination(input);
        assert.equal(facts.region, "가평");
        assert.deepEqual(facts.interest_places.map(({ name }) => name), ["자라섬"]);
        assert.deepEqual(facts.interest_themes, ["자연관광"]);
        assert.deepEqual(facts.themes, ["자연관광"]);
        assert.equal(facts.selected_places.length, 1);
        assert.equal(facts.selected_places[0].name, "자라섬");
    });
}

// 실제 데이터 제목은 '구리 동구릉 [유네스코 세계유산]'처럼 지역명과 괄호 설명을 달고 있다.
for (const input of ["구리 동구릉", "동구릉", "동구릉 가고 싶어요", "구리 동구릉 [유네스코 세계유산]"]) {
    test(`a title with a region prefix and a bracketed note is matched from: ${input}`, async () => {
        const facts = await resolveSupportedDestination(input);
        assert.equal(facts.region, "구리");
        assert.deepEqual(facts.interest_places.map(({ name }) => name), ["구리 동구릉 [유네스코 세계유산]"]);
        assert.deepEqual(facts.interest_themes, ["역사관광"]);
        assert.equal(facts.selected_places.length, 1);
    });
}

test("a region on its own stays a region, not a place in it", async () => {
    const facts = await resolveSupportedDestination("구리");
    assert.equal(facts.region, "구리");
    assert.equal(facts.interest_places, undefined);
});

// 한 지역 안에서 여러 관광지를 말하면 되묻지 않고 모두 저장한다.
// 저장된 테마는 동행자 유형과 함께 추천 테마를 정하는 근거가 된다.
for (const input of ["가평 자라섬 아침고요수목원", "자라섬과 아침고요수목원 가고 싶어", "자라섬, 아침고요수목원"]) {
    test(`several places in one region are all kept from: ${input}`, async () => {
        const facts = await resolveSupportedDestination(input);
        assert.equal(facts.region, "가평");
        assert.deepEqual(facts.interest_places.map(({ name }) => name).sort(), ["아침고요수목원", "자라섬"]);
        assert.deepEqual(facts.selected_places.map(({ name }) => name).sort(), ["아침고요수목원", "자라섬"]);
        assert.deepEqual(facts.interest_themes.sort(), ["문화관광", "자연관광"]);
        assert.deepEqual(facts.themes.sort(), ["문화관광", "자연관광"]);
    });
}

test("places from different regions still need one destination", async () => {
    const result = await resolveSupportedDestination("자라섬 동구릉");
    assert.equal(result.needsDestinationChoice, true);
    assert.equal(result.interest_places, undefined);
});

test("region sentences, administrative suffixes and overlapping region names", async () => {
    for (const [input, region] of [["가평으로 여행 갈거야", "가평"], ["남양주에 가고 싶어", "남양주"], ["고양시로 여행 갈래", "고양"]]) {
        const facts = await resolveSupportedDestination(input);
        assert.equal(facts.region, region);
        assert.equal(facts.interest_places, undefined);
    }
});

test("a destination used only as a recommendation reference is not a confirmed stop", async () => {
    const facts = await resolveSupportedDestination("자라섬 같은 곳이 궁금해");
    assert.deepEqual(facts.interest_places.map(({ name }) => name), ["자라섬"]);
    assert.equal(facts.interest_places[0].visitConfirmed, false);
    assert.deepEqual(facts.selected_places, []);
});

test("unsupported or unrelated words are not destinations", async () => {
    for (const input of ["rkvud", "고양이 보고 싶어", "부산으로 여행 갈 거야", "없는관광지로 갈래"]) {
        assert.equal(await resolveSupportedDestination(input), null);
    }
});

test("negated, multiple or conflicting destinations ask for confirmation", async () => {
    for (const input of ["자라섬은 안 가", "자라섬 말고 아침고요수목원", "파주 자라섬으로 갈 거야"]) {
        const result = await resolveSupportedDestination(input);
        assert.equal(result.needsDestinationChoice, true);
        assert.equal(result.interest_places, undefined);
    }
});

test("initial and already-booked paths save the extracted theme and ask for dates", async () => {
    for (const step of ["ASK_SERVICE_TYPE", "ASK_ATTRACTION_REGION"]) {
        const session = { currentStep: step, serviceType: step === "ASK_ATTRACTION_REGION" ? "ATTRACTION" : null };
        let saved;
        sessionService.loadSession = async () => session;
        sessionService.saveConversationState = async (state) => { saved = state; };
        const result = await handleChat({ sessionId: "test", userMessage: "자라섬으로 여행 갈거야" });
        assert.equal(result.currentStep, "ASK_PERIOD");
        assert.deepEqual(saved.facts.interest_places.map(({ name }) => name), ["자라섬"]);
        assert.deepEqual(saved.facts.themes, ["자연관광"]);
        assert.equal(saved.facts.service_type, step === "ASK_ATTRACTION_REGION" ? "ATTRACTION" : "ACCOMMODATION");
        const stored = sessionService.buildSessionDataFromFacts(saved);
        assert.deepEqual(sessionService.buildFactsFromSession(stored).interest_themes, ["자연관광"]);
    }
});

test("ambiguous input keeps the current step without saving an arbitrary place", async () => {
    for (const step of ["ASK_SERVICE_TYPE", "ASK_ATTRACTION_REGION"]) {
        sessionService.loadSession = async () => ({ currentStep: step });
        sessionService.saveConversationState = async () => assert.fail("must not save an ambiguous destination");
        const result = await handleChat({ sessionId: "test", userMessage: "자라섬 말고 아침고요수목원" });
        assert.equal(result.currentStep, step);
        assert.equal(result.quickReplies.length, 2);
    }
});
