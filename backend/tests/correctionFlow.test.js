const { test } = require("node:test");
const assert = require("node:assert/strict");

// DB나 LLM 없이 실제 대화 흐름을 그대로 태운다.
const repository = require("../src/repositories/attractionRepository");
const { buildTitleAliases } = require("../src/utils/attractionNameUtils");
const places = [
    { id: 1, title: "자라섬", region: "가평", theme: "자연관광", mapx: 127.5, mapy: 37.8 },
    { id: 2, title: "구리 동구릉 [유네스코 세계유산]", region: "구리", theme: "역사관광", mapx: 127.13, mapy: 37.61 },
];
repository.searchAttractionsByName = async ({ name }) => {
    const normalized = name.replace(/[^0-9a-z가-힣]/gi, "");
    return places.filter(({ title, region }) => (
        buildTitleAliases(title, region).some((alias) => normalized.includes(alias))
    ));
};

const {
    handleCorrection,
    mentionsCorrection,
    getPreviousStepTarget,
} = require("../src/services/correctionService");
const { detectCorrectionTarget } = require("../src/services/ontologyService");
const sessionService = require("../src/services/sessionService");
const { handleChat } = require("../src/services/chatService");

function startSession() {
    let session = { currentStep: "ASK_SERVICE_TYPE", facts: {} };
    sessionService.loadSession = async () => session;
    sessionService.saveConversationState = async (state) => {
        session = { ...sessionService.buildSessionDataFromFacts(state), facts: state.facts };
        return session;
    };
    return async (message) => await handleChat({ sessionId: "test", userMessage: message });
}

test("a plain refusal is read as a correction, a normal answer is not", () => {
    for (const text of ["아니다", "아냐", "아닌데?", "내일 말고 모레", "잘못 말했어", "기간 바꿔줘"]) {
        assert.equal(mentionsCorrection(text), true, text);
    }
    for (const text of ["내일 하루", "집 근처", "자라섬", "부모님이랑"]) {
        assert.equal(mentionsCorrection(text), false, text);
    }
});

test("a correction target is read from the value when no field name is given", () => {
    assert.equal(detectCorrectionTarget("아니다 내일부터 이틀간"), "period");
    assert.equal(detectCorrectionTarget("아니 9월 12일부터"), "period");
    assert.equal(detectCorrectionTarget("아니 부모님이랑 가"), "companion_type");
    assert.equal(detectCorrectionTarget("아니 가평으로"), "region");
    // '출발'만으로는 기간과 출발지를 가릴 수 없어 출발지로 읽는다.
    assert.equal(detectCorrectionTarget("출발지 바꿔줘"), "departure_location");
});

test("a refusal with no value falls back to the step before the current one", () => {
    const steps = {
        ASK_PERIOD: "region",
        ASK_ACCOMMODATION: "period",
        ASK_START_LOCATION: "period",
        ASK_COMPANION_TYPE: "accommodation",
    };
    for (const [currentStep, target] of Object.entries(steps)) {
        const result = handleCorrection({ userMessage: "아니다", facts: { region: "구리" }, currentStep });
        assert.equal(result.handled, true, currentStep);
        assert.equal(result.correctionTarget, target, currentStep);
    }
    // 당일치기는 숙소 대신 출발지를 되묻는다.
    const oneDay = handleCorrection({
        userMessage: "아니다",
        facts: { region: "구리", trip_type: "당일치기" },
        currentStep: "ASK_COMPANION_TYPE",
    });
    assert.equal(oneDay.correctionTarget, "departure_location");
});

test("a correction spoken together with the new value is applied in one turn", async () => {
    const say = startSession();
    await say("2");
    await say("구리 동구릉");
    const oneDay = await say("내일 하루");
    assert.equal(oneDay.currentStep, "ASK_START_LOCATION");
    assert.equal(oneDay.facts.trip_type, "당일치기");

    // 출발지를 묻는 자리에서 기간을 정정하면 기간 단계로 돌아가 새 값까지 반영한다.
    const corrected = await say("아니다 내일부터 이틀간");
    assert.equal(corrected.facts.trip_type, "숙박");
    assert.notEqual(corrected.facts.start_date, corrected.facts.end_date);
    assert.equal(corrected.currentStep, "ASK_ACCOMMODATION");
    // 직접 말한 목적지는 기간 정정으로 사라지지 않는다.
    assert.deepEqual(corrected.facts.selected_places.map(({ name }) => name), ["구리 동구릉 [유네스코 세계유산]"]);
});

test("a correction with no value goes back and asks the previous question again", async () => {
    const say = startSession();
    await say("2");
    await say("구리 동구릉");
    await say("내일 하루");

    const corrected = await say("아니다");
    assert.equal(corrected.currentStep, "ASK_PERIOD");
    assert.equal(corrected.facts.period, null);
    assert.equal(corrected.facts.trip_type, null);
    assert.match(corrected.reply, /여행 기간을 다시 알려주세요/);
    assert.equal(corrected.facts.region, "구리");
});

test("changing the region drops the places picked in the old one", () => {
    const result = handleCorrection({
        userMessage: "아니 가평으로",
        currentStep: "ASK_PERIOD",
        facts: {
            region: "구리",
            interest_places: [{ name: "구리 동구릉" }],
            interest_themes: ["역사관광"],
            selected_places: [{ name: "구리 동구릉", selectionSource: "destination" }],
        },
    });
    assert.equal(result.correctionTarget, "region");
    assert.equal(result.facts.region, null);
    assert.deepEqual(result.facts.interest_places, []);
    assert.deepEqual(result.facts.interest_themes, []);
    assert.deepEqual(result.facts.selected_places, []);
});

test("steps handled before the correction check also go back one section", async () => {
    const sections = [
        ["RECOMMENDATION_SHOWN", { companion_type: "부모님" }, "ASK_COMPANION_TYPE", "companion_type"],
        ["ASK_ROUTE_ATTRACTIONS", { travel_days: 2 }, "ASK_ROUTE_DAYS", "travel_days"],
        ["ASK_MORE_RECOMMENDATION", {}, null, null],
    ];
    for (const [currentStep, extra, expectedStep, expectedTarget] of sections) {
        const result = handleCorrection({
            userMessage: "아니다",
            facts: { region: "구리", ...extra },
            currentStep,
        });
        if (!expectedStep) {
            // 추천 더 받기 단계는 자체 되돌리기가 있어 이 규칙을 쓰지 않는다.
            assert.equal(result.handled, false, currentStep);
            continue;
        }
        assert.equal(result.currentStep, expectedStep, currentStep);
        assert.equal(result.correctionTarget, expectedTarget, currentStep);
    }
});

test("an entry step has no previous section to go back to", () => {
    for (const currentStep of ["ASK_SERVICE_TYPE", "ASK_REGION", "ASK_ATTRACTION_REGION", "ASK_ROUTE_DAYS"]) {
        assert.equal(getPreviousStepTarget(currentStep, {}), null, currentStep);
    }
});

test("picking from the recommendation list is never mistaken for a correction", async () => {
    const say = startSession();
    sessionService.loadSession = async () => ({
        currentStep: "RECOMMENDATION_SHOWN",
        region: "가평",
        companionType: "부모님",
        selectedPlaces: [],
        relatedPlaces: [
            { id: 1, name: "자라섬", region: "가평" },
            { id: 2, name: "아침고요수목원", region: "가평" },
        ],
        facts: {},
    });
    const result = await say("1번 말고 2번");
    assert.notEqual(result.currentStep, "ASK_COMPANION_TYPE");
});
