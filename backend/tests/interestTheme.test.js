const { test } = require("node:test");
const assert = require("node:assert/strict");

// DB나 LLM 없이 실제 목적지 해석 흐름을 태운다.
const repository = require("../src/repositories/attractionRepository");
const { buildTitleAliases } = require("../src/utils/attractionNameUtils");
const places = [
    { id: 1, title: "자라섬", region: "가평", theme: "자연관광", mapx: 127.5, mapy: 37.8 },
];
repository.searchAttractionsByName = async ({ name }) => {
    const normalized = name.replace(/[^0-9a-z가-힣]/gi, "");
    return places.filter(({ title, region }) => (
        buildTitleAliases(title, region).some((alias) => normalized.includes(alias))
    ));
};

const { detectInterestThemes } = require("../src/services/ontologyService");
const { resolveSupportedDestination } = require("../src/services/serviceTypeService");

test("activity words map to the themes the recommendation query filters on", () => {
    const cases = [
        ["가평 빠지를 가고싶어", ["레저스포츠"]],
        ["가평 글램핑 가려고", ["레저스포츠"]],
        ["계곡에서 쉬고 싶어", ["자연관광"]],
        ["박물관 보고싶어", ["문화관광"]],
        ["온천 가고싶다", ["체험관광"]],
        ["전통시장 구경할래", ["쇼핑"]],
        ["고궁 보러 갈래", ["역사관광"]],
        ["계곡이랑 박물관 갈래", ["자연관광", "문화관광"]],
    ];
    for (const [input, themes] of cases) {
        assert.deepEqual(detectInterestThemes(input).sort(), [...themes].sort(), input);
    }
});

test("a place name or a bare region is not an activity", () => {
    for (const input of ["자라섬", "가평", "가평으로 여행 갈거야"]) {
        assert.deepEqual(detectInterestThemes(input), [], input);
    }
});

test("an activity without a place saves the theme, not an attraction", async () => {
    for (const input of ["가평 빠지를 가고싶어", "가평 글램핑 가려고"]) {
        const facts = await resolveSupportedDestination(input);
        assert.equal(facts.region, "가평", input);
        assert.equal(facts.interest_places, undefined, input);
        assert.deepEqual(facts.selected_places ?? [], [], input);
        assert.deepEqual(facts.interest_themes, ["레저스포츠"], input);
        assert.deepEqual(facts.themes, ["레저스포츠"], input);
    }
});

test("a place and an activity in one sentence keep both", async () => {
    const facts = await resolveSupportedDestination("가평 자라섬이랑 글램핑 하고싶어");
    assert.deepEqual(facts.interest_places.map(({ name }) => name), ["자라섬"]);
    assert.deepEqual(facts.selected_places.map(({ name }) => name), ["자라섬"]);
    assert.deepEqual(facts.themes.sort(), ["레저스포츠", "자연관광"]);
});

test("an activity in an unsupported region is still not a destination", async () => {
    assert.equal(await resolveSupportedDestination("부산 글램핑 가려고"), null);
});

test("themes already collected are kept when a new one is added", async () => {
    const facts = await resolveSupportedDestination("가평 계곡 가고싶어", {
        interest_themes: ["레저스포츠"],
        themes: ["레저스포츠"],
    });
    assert.deepEqual(facts.interest_themes.sort(), ["레저스포츠", "자연관광"]);
});
