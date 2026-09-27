const { test } = require("node:test");
const assert = require("node:assert/strict");

const llmService = require("../src/services/llmService");
let receivedStoryTimeout = null;
llmService.callLLM = async (_system, _user, options) => {
    receivedStoryTimeout = options.timeout;
    throw new Error("test story timeout");
};

const env = require("../src/config/env");
const {
    buildFallbackStory,
    createTravelStory,
    polishRepeatedPlaceSubjects,
    stripRepeatedPlaceName,
} = require("../src/services/travelStoryService");

test("story generation times out quickly without replacing road-network routing", async () => {
    const places = [
        { id: 1, name: "관광지 A", mapy: 37.6, mapx: 127.1 },
        { id: 2, name: "관광지 B", mapy: 37.7, mapx: 127.2 },
    ];
    const story = await createTravelStory({
        facts: { region: "가평", companion_type: "가족", selected_places: places },
        dailyRoutes: [{ day: 1, stops: places, returnToOrigin: false }],
    });

    assert.equal(receivedStoryTimeout, env.llm.storyTimeoutMs);
    assert.equal(receivedStoryTimeout, 5000);
    assert.match(story, /가평/);
    assert.match(story, /관광지 A/);
});

test("the local story connects context, route, descriptions and practical advice", () => {
    const story = buildFallbackStory({
        region: "가평",
        period: "2026-10-01 ~ 2026-10-02",
        companion_type: "가족",
        themes: ["자연관광", "문화관광"],
        weather_forecasts: [{ reasons: ["비"] }],
        air_quality: { grade: "나쁨" },
        selected_places: [
            { name: "관광지 A", description: "호숫가에 조성된 관광지입니다. 두 번째 문장은 제외합니다." },
            { name: "관광지 B", description: "전시 공간을 갖춘 문화 관광지입니다." },
        ],
    }, [{
        day: 1,
        date: "2026-10-01",
        origin: { name: "가평 숙소" },
        stops: [{ name: "관광지 A" }, { name: "관광지 B" }],
        returnToOrigin: true,
    }]);

    assert.match(story, /가족과 함께하는 여행/);
    assert.match(story, /자연관광·문화관광/);
    assert.match(story, /1일차 \(2026-10-01\)/);
    assert.match(story, /가평 숙소에서 출발/);
    assert.match(story, /호숫가에 조성된 관광지/);
    assert.doesNotMatch(story, /두 번째 문장/);
    assert.match(story, /가평 숙소로 돌아와/);
    assert.match(story, /우산/);
    assert.match(story, /마스크/);
});

test("a place name and its location boilerplate are not repeated in a story", () => {
    assert.equal(
        stripRepeatedPlaceName(
            "경기도 가평군에 위치한 청평 자연휴양림은 깨끗한 약수를 마시며 산책할 수 있는 곳이다.",
            "청평자연휴양림",
        ),
        "깨끗한 약수를 마시며 산책할 수 있는 곳입니다.",
    );
    assert.equal(
        stripRepeatedPlaceName("음악역 1939는 가평역사 일대에 자리한 음악 복합 문화 공간이다.", "음악역 1939"),
        "가평역사 일대에 자리한 음악 복합 문화 공간입니다.",
    );

    const polished = polishRepeatedPlaceSubjects(
        "청평자연휴양림에서는 경기도 가평군에 위치한 청평 자연휴양림은 산책하기 좋은 곳이다.",
        ["청평자연휴양림"],
    );
    assert.equal(polished, "청평자연휴양림에서는 산책하기 좋은 곳이다.");
});
