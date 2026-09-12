const { test } = require("node:test");
const assert = require("node:assert/strict");

// DB나 LLM 없이 한국어·영어 입력이 같은 facts로 떨어지는지 본다.
const repository = require("../src/repositories/attractionRepository");
const { buildTitleAliases } = require("../src/utils/attractionNameUtils");
const places = [
    { id: 1, title: "자라섬", region: "가평", theme: "자연관광", mapx: 127.5, mapy: 37.8 },
    // 한국관광공사 영문 서비스에 등록되어 영문명이 있는 관광지.
    {
        id: 9, title: "가나아트파크", titleEn: "Gana Art Park",
        region: "양주", theme: "문화관광", mapx: 127.0, mapy: 37.8,
    },
];
repository.searchAttractionsByName = async ({ name }) => {
    const normalized = name.replace(/[^0-9a-z가-힣]/gi, "").toLowerCase();
    return places.filter(({ title, region, titleEn }) => (
        buildTitleAliases(title, region, titleEn).some((alias) => normalized.includes(alias))
    ));
};

const { detectLanguage, normalizeLanguage } = require("../src/services/languageService");
const { normalizeCompanionType, detectInterestThemes, detectCorrectionTarget } = require("../src/services/ontologyService");
const { mentionsCorrection } = require("../src/services/correctionService");
const { parseSimplePeriod, captureUndatedTripType } = require("../src/services/travelIntentService");
const { resolveSupportedDestination, classifyServiceType } = require("../src/services/serviceTypeService");
const sessionService = require("../src/services/sessionService");
const { handleChat } = require("../src/services/chatService");

test("the language is read from the script of the message", () => {
    assert.equal(detectLanguage("가평 글램핑 가려고"), "ko");
    assert.equal(detectLanguage("I want to go glamping in Gapyeong"), "en");
    // 한글이 섞이면 지역명을 그대로 쓸 수 있도록 한국어로 본다.
    assert.equal(detectLanguage("가평 glamping"), "ko");
});

test("a message with no letters keeps the language already in use", () => {
    assert.equal(detectLanguage("2", { sessionLanguage: "en" }), "en");
    assert.equal(detectLanguage("10/15", { sessionLanguage: "en" }), "en");
    assert.equal(detectLanguage("???", { locale: "en-US" }), "en");
    assert.equal(detectLanguage("???"), "ko");
});

test("only Korean and English are supported for now", () => {
    assert.equal(normalizeLanguage("en-US"), "en");
    assert.equal(normalizeLanguage("ko_KR"), "ko");
    assert.equal(normalizeLanguage("ja"), null);
    assert.equal(normalizeLanguage(undefined), null);
});

test("English keywords match on word boundaries", () => {
    assert.equal(normalizeCompanionType("with my son"), "아이동반");
    assert.equal(normalizeCompanionType("I know a person"), null);
    assert.deepEqual(detectInterestThemes("we went skiing"), ["레저스포츠"]);
    assert.deepEqual(detectInterestThemes("skip the queue"), []);
});

test("English input produces the same facts as Korean input", () => {
    const pairs = [
        [["부모님이랑 갈거야", "traveling with my parents"], (t) => normalizeCompanionType(t), "부모님"],
        [["혼자 갈래", "going solo"], (t) => normalizeCompanionType(t), "혼자"],
        [["온천 가고싶어", "looking for a hot spring"], (t) => detectInterestThemes(t).join(), "체험관광"],
        [["박물관 보고싶어", "I want to visit a museum"], (t) => detectInterestThemes(t).join(), "문화관광"],
        [["숙소는 이미 예약했어요", "I already booked my hotel"], classifyServiceType, "ATTRACTION"],
        [["동선만 추천받고 싶어요", "just the route please"], classifyServiceType, "ROUTE_ONLY"],
    ];
    for (const [[korean, english], read, expected] of pairs) {
        assert.equal(read(korean), expected, korean);
        assert.equal(read(english), expected, english);
    }
});

test("English dates resolve to the same period as Korean dates", () => {
    const now = new Date("2026-09-12T00:00:00");
    const cases = [
        ["내일 하루", "tomorrow", { start: "2026-09-13", end: "2026-09-13" }],
        ["내일부터 이틀간", "tomorrow for two days", { start: "2026-09-13", end: "2026-09-14" }],
        ["모레부터 사흘", "day after tomorrow for 3 days", { start: "2026-09-14", end: "2026-09-16" }],
        ["오늘 1박2일", "today 1 night", { start: "2026-09-12", end: "2026-09-13" }],
    ];
    for (const [korean, english, expected] of cases) {
        for (const input of [korean, english]) {
            const period = parseSimplePeriod(input, now);
            assert.equal(period.start_date, expected.start, input);
            assert.equal(period.end_date, expected.end, input);
        }
    }
    assert.equal(parseSimplePeriod("next month", now), null);
});

test("a day trip and a correction are recognised in English", () => {
    assert.equal(captureUndatedTripType("just a day trip", {}).trip_type, "당일치기");
    for (const text of ["no", "not that", "actually tomorrow", "I meant Gapyeong", "wrong date", "go back"]) {
        assert.equal(mentionsCorrection(text), true, text);
    }
    for (const text of ["tomorrow for two days", "Gapyeong glamping", "my parents"]) {
        assert.equal(mentionsCorrection(text), false, text);
    }
    assert.equal(detectCorrectionTarget("actually tomorrow for two days"), "period");
    assert.equal(detectCorrectionTarget("I meant Gapyeong"), "region");
});

test("an English region name resolves to the Korean region stored in facts", async () => {
    for (const input of ["Gapyeong", "I want to go to Gapyeong", "gapyeong glamping"]) {
        const facts = await resolveSupportedDestination(input);
        assert.equal(facts.region, "가평", input);
    }
    // 지역명 일부만으로는 목적지로 보지 않는다.
    assert.equal(await resolveSupportedDestination("Gap"), null);
});

test("an English conversation fills the same facts and keeps the language in the session", async () => {
    let session = { currentStep: "ASK_SERVICE_TYPE", language: "ko", facts: {} };
    sessionService.loadSession = async () => session;
    sessionService.saveConversationState = async (state) => {
        session = { ...sessionService.buildSessionDataFromFacts(state), facts: state.facts };
        return session;
    };
    const say = (message) => handleChat({ sessionId: "test", userMessage: message });

    await say("I already booked my hotel");
    const destination = await say("I want to go glamping in Gapyeong");
    assert.equal(destination.facts.language, "en");
    assert.equal(destination.facts.region, "가평");
    assert.deepEqual(destination.facts.themes, ["레저스포츠"]);

    const period = await say("tomorrow for two days");
    assert.equal(period.currentStep, "ASK_ACCOMMODATION");
    assert.equal(period.facts.trip_type, "숙박");
    // 언어는 세션 컬럼으로도 남아야 다음 요청에서 이어진다.
    assert.equal(session.language, "en");
});

test("a correction in English goes back one section just like Korean", async () => {
    let session = { currentStep: "ASK_SERVICE_TYPE", language: "ko", facts: {} };
    sessionService.loadSession = async () => session;
    sessionService.saveConversationState = async (state) => {
        session = { ...sessionService.buildSessionDataFromFacts(state), facts: state.facts };
        return session;
    };
    const say = (message) => handleChat({ sessionId: "test", userMessage: message });

    await say("I already booked my hotel");
    await say("Gapyeong");
    const dayTrip = await say("tomorrow, just a day trip");
    assert.equal(dayTrip.currentStep, "ASK_START_LOCATION");

    const corrected = await say("actually tomorrow for two days");
    assert.equal(corrected.currentStep, "ASK_ACCOMMODATION");
    assert.equal(corrected.facts.trip_type, "숙박");
    assert.equal(corrected.facts.language, "en");
});

// 영문 관광지명이 있는 관광지는 영어 이름으로도 지목할 수 있어야 한다.
// 한국관광공사 영문 서비스에 등록된 곳만 영문명이 있어 일부만 채워진다.
const { displayName } = require("../src/utils/attractionNameUtils");

test("an English title becomes a searchable alias", () => {
    const aliases = buildTitleAliases(
        "구리 동구릉 [유네스코 세계유산]",
        "구리",
        "East Nine Royal Tombs [UNESCO World Heritage]",
    );
    assert.ok(aliases.includes("동구릉"));
    assert.ok(aliases.includes("eastnineroyaltombs"));
    assert.ok(aliases.includes("eastnineroyaltombsunescoworldheritage"));
});

test("an attraction without an English title keeps its Korean aliases only", () => {
    const aliases = buildTitleAliases("자라섬", "가평", null);
    assert.deepEqual(aliases, ["자라섬", "가평자라섬"]);
});

test("the English name is shown only when it exists and the language is English", () => {
    const withEnglish = { name: "가나아트파크", nameEn: "Gana Art Park" };
    const withoutEnglish = { name: "자라섬", nameEn: null };

    assert.equal(displayName(withEnglish, "en"), "Gana Art Park");
    assert.equal(displayName(withEnglish, "ko"), "가나아트파크");
    // 영문명이 없으면 한글명을 그대로 쓴다. 억지 음역은 하지 않는다.
    assert.equal(displayName(withoutEnglish, "en"), "자라섬");
    assert.equal(displayName(withoutEnglish, "ko"), "자라섬");
});

test("an attraction named in English resolves to the Korean region and place", async () => {
    for (const input of ["Gana Art Park", "I want to visit Gana Art Park", "가나아트파크"]) {
        const facts = await resolveSupportedDestination(input);
        assert.equal(facts.region, "양주", input);
        assert.deepEqual(facts.interest_places.map(({ name }) => name), ["가나아트파크"], input);
        assert.equal(facts.interest_places[0].nameEn, "Gana Art Park", input);
    }
});
