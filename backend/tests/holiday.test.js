const { test } = require("node:test");
const assert = require("node:assert/strict");

const {
    getHolidays,
    findLunarDate,
    findHolidayMention,
    resolveHolidayPeriod,
} = require("../src/services/holidayService");
const { parseSimplePeriod } = require("../src/services/travelIntentService");
const { formatDate } = require("../src/utils/dateUtils");

const TODAY = new Date("2026-09-12T00:00:00");
const asDate = (date) => formatDate(new Date(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));

test("lunar holidays are computed, not hard-coded per year", () => {
    // 음력 1/1과 8/15가 그 해 어느 양력 날짜인지 계산으로 구한다.
    assert.equal(asDate(findLunarDate(2026, 1, 1)), "2026-02-17");
    assert.equal(asDate(findLunarDate(2026, 8, 15)), "2026-09-25");
    assert.equal(asDate(findLunarDate(2027, 1, 1)), "2027-02-07");
    assert.equal(asDate(findLunarDate(2027, 8, 15)), "2027-09-15");
});

test("a holiday on a weekend gets one substitute weekday", () => {
    const holidays = getHolidays(2026);
    // 2026 개천절은 토요일이라 월요일이 대체공휴일이 된다.
    assert.deepEqual(holidays.get("2026-10-03"), ["nationalFoundation"]);
    assert.deepEqual(holidays.get("2026-10-05"), ["nationalFoundation"]);
    assert.equal(holidays.has("2026-10-04"), false);
    // 금요일에 오는 한글날은 대체공휴일이 없다.
    assert.deepEqual(holidays.get("2026-10-09"), ["hangeul"]);
    assert.equal(holidays.has("2026-10-12"), false);
});

test("holidays without a substitute rule never get one", () => {
    const holidays = getHolidays(2026);
    // 현충일은 토요일이어도 대체공휴일이 없다.
    assert.deepEqual(holidays.get("2026-06-06"), ["memorialDay"]);
    assert.equal(holidays.has("2026-06-08"), false);
});

test("a three-day holiday is not treated as overlapping itself", () => {
    const holidays = getHolidays(2026);
    // 2026 설날은 월·화·수라 대체공휴일이 없어야 한다.
    const seollal = [...holidays].filter(([, ids]) => ids.includes("seollal")).map(([date]) => date);
    assert.deepEqual(seollal.sort(), ["2026-02-16", "2026-02-17", "2026-02-18"]);

    // 2027 설날은 일요일을 포함하므로 대체공휴일이 하루만 붙는다.
    const next = [...getHolidays(2027)].filter(([, ids]) => ids.includes("seollal")).map(([date]) => date);
    assert.deepEqual(next.sort(), ["2027-02-06", "2027-02-07", "2027-02-08", "2027-02-09"]);
});

test("a long weekend runs to the surrounding weekends", () => {
    // 개천절(토) + 일 + 대체(월)
    assert.equal(parseSimplePeriod("개천절 연휴에 가고싶어", TODAY).period, "2026-10-03 ~ 2026-10-05");
    // 추석(목금토) + 일요일까지
    assert.equal(parseSimplePeriod("추석 연휴에 갈래", TODAY).period, "2026-09-24 ~ 2026-09-27");
    // 연휴라고 하지 않으면 공휴일만 본다.
    assert.equal(parseSimplePeriod("추석에", TODAY).period, "2026-09-24 ~ 2026-09-26");
});

test("a holiday already past this year moves to next year", () => {
    // 2026 어린이날과 광복절은 지났다.
    assert.equal(parseSimplePeriod("어린이날", TODAY).period, "2027-05-05");
    assert.equal(parseSimplePeriod("광복절 연휴", TODAY).period, "2027-08-14 ~ 2027-08-16");
    // 연도를 말하면 그 해를 쓴다.
    assert.equal(parseSimplePeriod("2027년 개천절 연휴", TODAY).period, "2027-10-02 ~ 2027-10-04");
    assert.equal(parseSimplePeriod("내후년 추석 연휴", TODAY).period, "2028-09-30 ~ 2028-10-05");
});

test("holiday names in English are recognised too", () => {
    assert.equal(parseSimplePeriod("during the Chuseok holidays", TODAY).period, "2026-09-24 ~ 2026-09-27");
    assert.equal(findHolidayMention("Christmas").id, "christmas");
});

test("ordinary words are not read as holidays", () => {
    // '설'이 섞인 낱말을 설날로 읽으면 안 된다.
    for (const text of ["레저시설이 있는 곳", "건설현장", "가평 눈썰매", "시설 좋은 숙소"]) {
        assert.equal(findHolidayMention(text), null, text);
    }
    assert.equal(resolveHolidayPeriod("가평 여행 가고싶어", TODAY), null);
});
