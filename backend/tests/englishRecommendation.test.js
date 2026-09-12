const { test } = require("node:test");
const assert = require("node:assert/strict");

// DB 없이 추천 필터만 본다. 영어 대화에서는 영문명이 있는 관광지만 후보가 되어야 한다.
const repository = require("../src/repositories/attractionRepository");

const attractions = [
    { id: 1, contentId: "1", title: "아침고요수목원", titleEn: "The Garden of Morning Calm", region: "가평", address1: "가평군", mapx: 127.3, mapy: 37.7, middleCategory: "문화관광" },
    { id: 2, contentId: "2", title: "자라섬", titleEn: "JARA ISLAND", region: "가평", address1: "가평군", mapx: 127.5, mapy: 37.8, middleCategory: "자연관광" },
    { id: 3, contentId: "3", title: "가평레일바이크", titleEn: null, region: "가평", address1: "가평군", mapx: 127.4, mapy: 37.8, middleCategory: "레저스포츠" },
    // 구리는 영문명을 가진 관광지가 하나도 없는 지역을 흉내 낸다.
    { id: 4, contentId: "4", title: "구리타워", titleEn: null, region: "구리", address1: "구리시", mapx: 127.1, mapy: 37.5, middleCategory: "문화관광" },
];

let lastCallArgs = [];
repository.findPopularAttractions = async ({ region, englishOnly = false, excludeAttractionIds = [] }) => {
    lastCallArgs.push({ region, englishOnly });
    const excluded = new Set(excludeAttractionIds.map(String));
    return attractions.filter((attraction) => (
        attraction.region === region
        && !excluded.has(String(attraction.id))
        && (!englishOnly || attraction.titleEn)
    ));
};
repository.findRecommendationCandidates = async () => [];

const { recommendAttractions } = require("../src/services/attractionRecommendationService");

test("an English conversation only gets attractions that have an English name", async () => {
    lastCallArgs = [];
    const result = await recommendAttractions({ region: "가평", tripType: "당일치기", englishOnly: true });

    assert.equal(result.exhausted, false);
    assert.deepEqual(
        result.recommendations.map(({ name }) => name).sort(),
        ["아침고요수목원", "자라섬"],
    );
    // 영문명이 없는 가평레일바이크는 후보에서 빠진다.
    assert.ok(!result.recommendations.some(({ name }) => name === "가평레일바이크"));
});

test("the reply lists English names in an English conversation", async () => {
    const result = await recommendAttractions({ region: "가평", tripType: "당일치기", englishOnly: true });
    assert.match(result.reply, /The Garden of Morning Calm/);
    assert.ok(!/아침고요수목원/.test(result.reply));
});

test("a Korean conversation is not narrowed at all", async () => {
    lastCallArgs = [];
    const result = await recommendAttractions({ region: "가평", tripType: "당일치기" });

    assert.equal(lastCallArgs[0].englishOnly, false);
    assert.equal(result.recommendations.length, 3);
    assert.match(result.reply, /아침고요수목원/);
});

test("a region with no English names returns nothing so the caller can fall back", async () => {
    const result = await recommendAttractions({ region: "구리", tripType: "당일치기", englishOnly: true });
    assert.equal(result.exhausted, true);
    assert.deepEqual(result.recommendations, []);

    // 같은 지역이라도 필터를 끄면 한국어 이름 관광지가 나온다.
    const fallback = await recommendAttractions({ region: "구리", tripType: "당일치기" });
    assert.equal(fallback.exhausted, false);
    assert.deepEqual(fallback.recommendations.map(({ name }) => name), ["구리타워"]);
});
