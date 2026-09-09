const { test } = require("node:test");
const assert = require("node:assert/strict");

const repository = require("../src/repositories/attractionRepository");
repository.searchAttractionsByName = async ({ name }) => name.includes("자라섬") ? [{
    id: 1, title: "자라섬", region: "가평", theme: "자연관광", mapx: 127.5, mapy: 37.8,
}] : [];
require("../src/services/llmService").callLLMJson = async () => {
    assert.fail("These explicit inputs should not need the LLM");
};
let calls = [];
let failRecommendation = false;
require("../src/services/attractionRecommendationService").recommendAttractions = async (args) => {
    calls.push(args);
    if (failRecommendation) throw new Error("test recommendation outage");
    return {
        recommendations: [{ id: 2, name: "추천 관광지", mapx: 127.4, mapy: 37.7 }],
        recommendationRound: 1, recommendedHistory: [2], hasMore: true, exhausted: false,
        reply: "추천 관광지를 선택해주세요.",
    };
};
require("../src/services/weatherRecommendationService").getWeatherRecommendationContext = async () => ({
    forecasts: [], available: false, indoorRecommended: true,
});
require("../src/services/airQualityService").getAirQuality = async () => ({
    available: false, indoorRecommended: false,
});
require("../src/services/travelStoryService").createTravelStory = async () => null;
require("../src/services/roadNetworkService").getOptimizedRoute = async ({ destinations, returnToOrigin }) => ({
    stops: destinations.map((place, index) => ({ ...place, order: index + 1, fromPreviousKm: 1 })),
    totalDistanceKm: destinations.length, returnToOrigin, returnDistanceKm: 0,
});
const sessionService = require("../src/services/sessionService");
const { captureCompanionFacts } = require("../src/services/postBookingService");
const { handleChat } = require("../src/services/chatService");
const { handleLocationInput } = require("../src/services/locationInputService");
const { parseSimplePeriod } = require("../src/services/travelIntentService");
const { mergeSelectedPlaces } = require("../src/services/attractionSelectionService");
const location = { name: "테스트 위치", address: "테스트 주소", longitude: 127.5, latitude: 37.8 };

function startConversation() {
    let session = { currentStep: "ASK_SERVICE_TYPE", routeNumber: 1 };
    calls = [];
    failRecommendation = false;
    sessionService.loadSession = async () => session;
    // Round-trip through the actual JSON/column mapping on every turn.
    sessionService.saveConversationState = async (state) => {
        session = sessionService.buildSessionDataFromFacts(state);
    };
    return {
        send: (message, selectedLocation) => handleChat({ sessionId: "multi-fact-test", userMessage: message, selectedLocation }),
        facts: () => sessionService.buildFactsFromSession(session),
        step: () => session.currentStep,
    };
}

for (const booked of [false, true]) {
    test(`undated day trip asks only for the visit date: booked=${booked}`, async () => {
        const chat = startConversation();
        if (booked) await chat.send("2");
        const result = await chat.send("자라섬으로 당일치기 여행을 가족들이랑 갈거야");
        assert.equal(result.currentStep, "ASK_PERIOD");
        assert.equal(chat.facts().trip_type, "당일치기");
        assert.equal(chat.facts().companion_type, "가족");
        assert.equal(chat.facts().interest_place.name, "자라섬");
        assert.equal(chat.facts().region, "가평");
        assert.equal(chat.facts().start_date, null);
        assert.equal(chat.facts().end_date, null);
        assert.match(result.reply, /어느 날짜/);
        assert.doesNotMatch(result.reply, /언제부터 언제까지|출발지를 입력|누구와 함께/);
        const next = await chat.send("내일");
        assert.equal(next.currentStep, "ASK_START_LOCATION");
        assert.equal(next.facts.start_date, next.facts.end_date);
        assert.equal(next.facts.companion_type, "가족");
        assert.equal((await chat.send(location.name, location)).currentStep, "RECOMMENDATION_SHOWN");
    });

    test(`single sentence including a day-trip date skips period and companion questions: booked=${booked}`, async () => {
        const chat = startConversation();
        if (booked) await chat.send("2");
        const input = "자라섬으로 가족이랑 내일 하루 당일치기를 갈거야";
        const result = await chat.send(input);
        const expected = parseSimplePeriod("내일 하루");
        assert.equal(result.currentStep, "ASK_START_LOCATION");
        assert.equal(result.facts.companion_type, "가족");
        assert.equal(result.facts.interest_place.name, "자라섬");
        assert.equal(result.facts.region, "가평");
        assert.equal(chat.facts().start_date, expected.start_date);
        assert.equal(chat.facts().end_date, expected.start_date);
        assert.equal(chat.facts().trip_type, "당일치기");
        assert.doesNotMatch(result.reply, /언제부터|누구와 함께|yanolja/);
        assert.match(result.reply, /출발지를 입력/);
        assert.equal((await chat.send(location.name, location)).currentStep, "RECOMMENDATION_SHOWN");
    });

    test(`single sentence with an overnight period asks for accommodation: booked=${booked}`, async () => {
        const chat = startConversation();
        if (booked) await chat.send("2");
        const result = await chat.send("가족이랑 자라섬으로 내일부터 이틀간 갈 거야");
        assert.equal(result.currentStep, "ASK_ACCOMMODATION");
        assert.equal(chat.facts().trip_type, "숙박");
        assert.notEqual(chat.facts().start_date, chat.facts().end_date);
        assert.doesNotMatch(result.reply, /언제부터|누구와 함께/);
        if (booked) assert.doesNotMatch(result.reply, /yanolja/);
        else assert.match(result.reply, /yanolja/);
        assert.equal((await chat.send(location.name, location)).currentStep, "RECOMMENDATION_SHOWN");
    });
}

test("date provided before a destination survives and is not requested again", async () => {
    const chat = startConversation();
    await chat.send("가족이랑 내일 하루 여행 갈 거야");
    assert.equal(chat.step(), "ASK_SERVICE_TYPE");
    const date = chat.facts().start_date;
    assert.ok(date);
    const result = await chat.send("자라섬");
    assert.equal(result.currentStep, "ASK_START_LOCATION");
    assert.equal(result.facts.start_date, date);
    assert.equal(result.facts.companion_type, "가족");
});

for (const booked of [false, true]) {
    for (const overnight of [false, true]) {
        test(`all supplied facts survive until recommendation: booked=${booked}, overnight=${overnight}`, async () => {
            const chat = startConversation();
            if (booked) await chat.send("2");
            const destination = await chat.send("가족들이랑 자라섬을 가려고해");
            assert.equal(destination.currentStep, "ASK_PERIOD");
            assert.equal(chat.facts().companion_type, "가족");
            assert.equal(chat.facts().region, "가평");
            assert.equal(chat.facts().interest_place.name, "자라섬");
            assert.deepEqual(chat.facts().interest_themes, ["자연관광"]);
            const period = await chat.send(overnight ? "내일부터 이틀간" : "내일 하루");
            assert.equal(period.currentStep, overnight ? "ASK_ACCOMMODATION" : "ASK_START_LOCATION");
            if (booked || !overnight) assert.doesNotMatch(period.reply, /yanolja/);
            const recommendation = await chat.send(location.name, location);
            assert.equal(recommendation.currentStep, "RECOMMENDATION_SHOWN");
            assert.doesNotMatch(recommendation.reply, /누구와 함께/);
            assert.equal(recommendation.recommendations.length, 1);
            assert.equal(calls.length, 1);
            assert.deepEqual(new Set(calls[0].themes), new Set(["자연관광", "문화관광", "체험관광"]));
            assert.equal(calls[0].region, "가평");
            assert.equal(calls[0].indoorOutdoor, "실내");
        });
    }
}

test("missing companion is still requested, then follows the same recommendation flow", async () => {
    const chat = startConversation();
    await chat.send("자라섬으로 가려고 해");
    await chat.send("내일 하루");
    const question = await chat.send(location.name, location);
    assert.equal(question.currentStep, "ASK_COMPANION_TYPE");
    assert.match(question.reply, /누구와 함께/);
    assert.equal(calls.length, 0);
    assert.equal((await chat.send("가족")).currentStep, "RECOMMENDATION_SHOWN");
});

test("companion supplied while asking for dates is also retained", async () => {
    const chat = startConversation();
    await chat.send("자라섬");
    await chat.send("친구들이랑 내일 하루 갈 거야");
    assert.equal(chat.facts().companion_type, "친구");
    assert.equal((await chat.send(location.name, location)).currentStep, "RECOMMENDATION_SHOWN");
    assert.ok(calls[0].themes.includes("자연관광"));
    assert.ok(calls[0].themes.includes("레저스포츠"));
});

test("known companion is retained even when destination needs another input", async () => {
    const chat = startConversation();
    const question = await chat.send("가족들이랑 여행 가려고 해");
    assert.equal(question.currentStep, "ASK_SERVICE_TYPE");
    assert.equal(chat.facts().companion_type, "가족");
    await chat.send("자라섬");
    assert.equal(chat.facts().companion_type, "가족");
    assert.equal(chat.step(), "ASK_PERIOD");
});

test("recommendation failures retain the provided location and companion for retry", async () => {
    const chat = startConversation();
    await chat.send("가족들이랑 자라섬을 가려고해");
    await chat.send("내일 하루");
    failRecommendation = true;
    await assert.rejects(chat.send(location.name, location), /test recommendation outage/);
    assert.equal(chat.step(), "READY_FOR_RECOMMENDATION");
    assert.equal(chat.facts().start_location.name, location.name);
    assert.equal(chat.facts().companion_type, "가족");
    failRecommendation = false;
    assert.equal((await chat.send("다시 추천해줘")).currentStep, "RECOMMENDATION_SHOWN");
});

test("place names do not imply a companion and known facts are not erased", () => {
    const facts = { companion_type: "친구", themes: ["문화관광"] };
    for (const message of ["형상박물관에 갈 거야", "가족호텔로 갈 거야", "자라섬에 갈 거야"]) {
        assert.deepEqual(captureCompanionFacts(message, facts), facts);
    }
    assert.equal(captureCompanionFacts("부모님이랑 가평으로 갈 거야").companion_type, "부모님");
    assert.equal(captureCompanionFacts("와이프랑 애들이랑 갈 거야").companion_type, "아이동반");
});

test("route-only users still go directly to route planning", async () => {
    for (const step of ["ASK_START_LOCATION", "ASK_ACCOMMODATION"]) {
        const result = await handleLocationInput({ currentStep: step, userMessage: location.name,
            selectedLocation: location, facts: { service_type: "ROUTE_ONLY", companion_type: "가족" } });
        assert.equal(result.current_step, "READY_FOR_ROUTE_PLANNING");
    }
});

test("initial destination survives additional selections and appears in the final route", async () => {
    const chat = startConversation();
    await chat.send("가족들이랑 자라섬으로 내일 하루 갈 거야");
    assert.equal(chat.facts().selected_places[0].name, "자라섬");
    await chat.send(location.name, location);
    assert.ok(calls[0].recommendedHistory.includes(1));
    await chat.send("추천 관광지");
    assert.deepEqual(chat.facts().selected_places.map(p => p.name), ["자라섬", "추천 관광지"]);
    const result = await chat.send("아니");
    assert.equal(result.currentStep, "ROUTE_OPTIMIZED");
    assert.deepEqual(result.finalRoute[0].stops.map(p => p.name), ["자라섬", "추천 관광지"]);
    assert.equal(result.facts.final_selected_places.length, 2);
});

test("undoing a recommendation selection preserves the initial destination", async () => {
    const chat = startConversation();
    await chat.send("가족들이랑 자라섬으로 내일 하루 갈 거야");
    await chat.send(location.name, location);
    await chat.send("추천 관광지");
    await chat.send("잘못 선택했어");
    assert.equal(chat.step(), "RECOMMENDATION_SHOWN");
    assert.deepEqual(chat.facts().selected_places.map(p => p.name), ["자라섬"]);
});

test("the same stop is not duplicated when an ID is returned as a string", () => {
    const merged = mergeSelectedPlaces([{ id: 1, name: "자라섬", selectionSource: "destination" }], [{ id: "1", name: "자라섬", theme: "자연관광" }]);
    assert.equal(merged.length, 1);
    assert.equal(merged[0].selectionSource, "destination");
});
