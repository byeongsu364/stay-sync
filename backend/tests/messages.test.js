const { test } = require("node:test");
const assert = require("node:assert/strict");

const { t, fill, findMissingKeys, regionLabel, themeLabel } = require("../src/services/messageService");
const koMessages = require("../src/messages/ko");
const enMessages = require("../src/messages/en");

test("every Korean key has an English counterpart", () => {
    assert.deepEqual(findMissingKeys("en"), []);
    // 영어에만 있는 키는 한국어에서 쓸 수 없으므로 반대 방향도 본다.
    const koOnly = Object.keys(enMessages).filter((key) => !(key in koMessages));
    assert.deepEqual(koOnly, []);
});

test("a placeholder is filled and a missing one is left alone", () => {
    assert.equal(fill("{a} and {b}", { a: "one", b: "two" }), "one and two");
    assert.equal(fill("{a} and {b}", { a: "one" }), "one and {b}");
    // 배열은 쉼표로 잇는다.
    assert.equal(fill("{list}", { list: ["a", "b"] }), "a, b");
});

test("the josa directive adds only the particle, chosen by the final consonant", () => {
    assert.equal(fill("'{v}'{v|으로/로}", { v: "부모님" }), "'부모님'으로");
    assert.equal(fill("'{v}'{v|으로/로}", { v: "친구" }), "'친구'로");
    assert.equal(fill("'{v}'{v|으로/로}", { v: ["자연관광", "문화관광"] }), "'자연관광, 문화관광'으로");
    // 영어 값에는 받침이 없으므로 받침 없는 쪽을 쓴다.
    assert.equal(fill("'{v}'{v|으로/로}", { v: "Nature" }), "'Nature'로");
});

test("a message is returned in the requested language", () => {
    assert.equal(t("period.askRange", {}, "ko"), "언제부터 언제까지 여행하시나요?");
    assert.equal(t("period.askRange", {}, "en"), "What dates are you travelling?");
    // 언어를 주지 않으면 한국어를 쓴다.
    assert.equal(t("period.askRange"), "언제부터 언제까지 여행하시나요?");
});

test("an unknown key is returned as-is so the mistake is visible", () => {
    assert.equal(t("no.such.key", {}, "en"), "no.such.key");
});

test("region and theme labels translate the Korean data values", () => {
    assert.equal(regionLabel("가평", "en"), "Gapyeong");
    assert.equal(regionLabel("가평", "ko"), "가평");
    assert.equal(themeLabel("레저스포츠", "en"), "Leisure & sports");
    assert.equal(themeLabel("레저스포츠", "ko"), "레저스포츠");
    // 카탈로그에 없는 값은 원본을 그대로 쓴다.
    assert.equal(regionLabel("부산", "en"), "부산");
    assert.equal(themeLabel(null, "en"), "");
});

test("no English message is left in Korean", () => {
    const korean = Object.entries(enMessages)
        // 지역·테마 라벨의 키에는 한글이 들어가지만 값은 영어여야 한다.
        .filter(([, value]) => /[가-힣]/.test(value));
    assert.deepEqual(korean, []);
});

test("companion labels translate the Korean data values", () => {
    const { companionLabel } = require("../src/services/messageService");
    assert.equal(companionLabel("연인", "ko"), "연인");
    assert.equal(companionLabel("연인", "en"), "your partner");
    assert.equal(companionLabel("아이동반", "en"), "kids");
    // 온톨로지에 없는 값은 원본을 그대로 쓴다.
    assert.equal(companionLabel("반려견", "en"), "반려견");
});
