const { test } = require("node:test");
const assert = require("node:assert/strict");

const {
    parseSimplePeriod,
    parseExplicitPeriod,
    parseDuration,
    normalizePastDates,
    findRelativeYearOffset,
    findSpokenYear,
} = require("../src/services/travelIntentService");
const { shiftPastDateToNextYear, parseDate, formatDate } = require("../src/utils/dateUtils");

// 오늘을 고정해야 '지난 날짜'가 언제 돌려도 같은 뜻이 된다.
const TODAY = new Date("2026-09-12T00:00:00");

test("a date already past is read as next year", () => {
    const cases = [
        ["6월 5일부터 6월 7일", "2027-06-05 ~ 2027-06-07"],
        ["6월 5일부터 7일까지", "2027-06-05 ~ 2027-06-07"],
        ["6/5 ~ 6/7", "2027-06-05 ~ 2027-06-07"],
        ["June 5 to June 7", "2027-06-05 ~ 2027-06-07"],
    ];
    for (const [input, expected] of cases) {
        assert.equal(parseSimplePeriod(input, TODAY).period, expected, input);
    }
});

test("a date still ahead keeps this year", () => {
    assert.equal(parseSimplePeriod("9월 20일", TODAY).period, "2026-09-20");
    assert.equal(parseSimplePeriod("12월 20일부터 22일까지", TODAY).period, "2026-12-20 ~ 2026-12-22");
    // 오늘 당일은 지난 날짜가 아니다.
    assert.equal(parseSimplePeriod("9월 12일", TODAY).period, "2026-09-12");
});

test("a year spoken out loud is left alone, even when it is behind us", () => {
    // 연도를 직접 말했으면 지난 날짜라도 밀지 않는다.
    assert.equal(parseSimplePeriod("2026년 6월 5일", TODAY).period, "2026-06-05");
    assert.equal(parseSimplePeriod("2027년 3월 1일", TODAY).period, "2027-03-01");
    // '년' 없이 숫자만 말해도 연도로 읽는다.
    assert.equal(parseSimplePeriod("2027 6월 5일", TODAY).period, "2027-06-05");
});

test("a year named in words is used as spoken", () => {
    const cases = [
        ["올해 6월 5일", "2026-06-05"],
        ["내년 6월 5일부터 6월 7일", "2027-06-05 ~ 2027-06-07"],
        ["내후년 6월 5일", "2028-06-05"],
        ["내년 12월 20일", "2027-12-20"],
        ["next year June 5 to June 7", "2027-06-05 ~ 2027-06-07"],
        ["the year after next June 5", "2028-06-05"],
    ];
    for (const [input, expected] of cases) {
        assert.equal(parseSimplePeriod(input, TODAY).period, expected, input);
    }
});

test("year words and year numbers are recognised on their own", () => {
    assert.equal(findRelativeYearOffset("올해 가을에"), 0);
    assert.equal(findRelativeYearOffset("내년 봄에"), 1);
    assert.equal(findRelativeYearOffset("내후년에"), 2);
    assert.equal(findRelativeYearOffset("후년에"), 2);
    assert.equal(findRelativeYearOffset("next year"), 1);
    assert.equal(findRelativeYearOffset("그냥 6월에"), null);

    assert.equal(findSpokenYear("2027년 6월"), 2027);
    assert.equal(findSpokenYear("2027 6월"), 2027);
    // 날짜 숫자를 연도로 잘못 읽으면 안 된다.
    assert.equal(findSpokenYear("6월 5일"), null);
    assert.equal(findSpokenYear("6/5 ~ 6/7"), null);
});

test("a period that crosses new year keeps the later end date", () => {
    assert.equal(
        parseSimplePeriod("12월 30일부터 1월 2일까지", TODAY).period,
        "2026-12-30 ~ 2027-01-02",
    );
});

test("a single date with a duration becomes a range", () => {
    assert.equal(parseSimplePeriod("10월 1일부터 3일간", TODAY).period, "2026-10-01 ~ 2026-10-03");
    assert.equal(parseSimplePeriod("10월 1일 2박3일", TODAY).period, "2026-10-01 ~ 2026-10-03");
    // '3일간'은 날짜가 아니라 기간이다.
    assert.equal(parseDuration("10월 1일부터 3일간"), 3);
    assert.equal(parseDuration("2박3일"), 3);
    assert.equal(parseDuration("이틀"), 2);
    assert.equal(parseDuration("two days"), 2);
});

test("relative dates still work and unrelated text is not a date", () => {
    assert.equal(parseSimplePeriod("내일 하루", TODAY).period, "2026-09-13");
    assert.equal(parseSimplePeriod("내일부터 이틀간", TODAY).period, "2026-09-13 ~ 2026-09-14");
    assert.equal(parseSimplePeriod("tomorrow for two days", TODAY).period, "2026-09-13 ~ 2026-09-14");
    for (const input of ["다음 주쯤", "경기북부에서 유명한 관광지 5개 추천해줘", "가평"]) {
        assert.equal(parseSimplePeriod(input, TODAY), null, input);
    }
});

test("an impossible date is not accepted", () => {
    assert.equal(parseExplicitPeriod("2월 30일", TODAY), null);
    assert.equal(parseExplicitPeriod("13월 1일", TODAY), null);
    assert.equal(parseDate("2026-02-30"), null);
});

test("dates coming back from the LLM get the same treatment", () => {
    const past = normalizePastDates({
        period: "2026-06-05 ~ 2026-06-07",
        start_date: "2026-06-05",
        end_date: "2026-06-07",
    }, TODAY);
    assert.equal(past.start_date, "2027-06-05");
    // 기간 길이는 그대로 유지되어야 한다.
    assert.equal(past.end_date, "2027-06-07");
    assert.equal(past.period, "2027-06-05 ~ 2027-06-07");

    const ahead = { period: "2026-09-20", start_date: "2026-09-20", end_date: "2026-09-20" };
    assert.deepEqual(normalizePastDates(ahead, TODAY), ahead);
    // 날짜가 없는 facts는 그대로 둔다.
    assert.deepEqual(normalizePastDates({ region: "가평" }, TODAY), { region: "가평" });
});

test("the year shift itself only moves dates that are behind today", () => {
    const shift = (value) => formatDate(shiftPastDateToNextYear(parseDate(value), TODAY));
    assert.equal(shift("2026-09-11"), "2027-09-11");
    assert.equal(shift("2026-09-12"), "2026-09-12");
    assert.equal(shift("2026-09-13"), "2026-09-13");
});
