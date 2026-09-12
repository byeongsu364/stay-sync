const {
    SOLAR_HOLIDAYS,
    LUNAR_HOLIDAYS,
    HOLIDAY_ALIASES,
} = require("../data/holidayData");
const { formatDate, startOfDay } = require("../utils/dateUtils");

/**
 * ==========================================================
 * Holiday Service
 * ==========================================================
 *
 * '개천절 연휴'처럼 공휴일 이름으로 말한 기간을 날짜로 바꾼다.
 *
 * 음력 공휴일은 ICU 음력 달력으로 구하고,
 * 대체공휴일과 연휴 범위는 규정대로 계산한다.
 * 표를 손으로 채우지 않으므로 해가 바뀌어도 손댈 곳이 없다.
 * ==========================================================
 */

const LUNAR_FORMAT = new Intl.DateTimeFormat("en-u-ca-chinese", {
    year: "numeric",
    month: "numeric",
    day: "numeric",
    timeZone: "UTC",
});

const holidaysByYear = new Map();

function toDate(year, month, day) {
    return new Date(Date.UTC(year, month - 1, day));
}

function addDays(date, days) {
    const value = new Date(date);
    value.setUTCDate(value.getUTCDate() + days);
    return value;
}

function key(date) {
    return formatDate(new Date(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function isWeekend(date) {
    const day = date.getUTCDay();
    return day === 0 || day === 6;
}

function readLunar(date) {
    const parts = Object.fromEntries(
        LUNAR_FORMAT.formatToParts(date).map(({ type, value }) => [type, value]),
    );
    return {
        // 윤달은 '6bis'처럼 나온다. 평달만 공휴일로 본다.
        month: /bis/i.test(parts.month) ? null : Number(parts.month),
        day: Number(parts.day),
    };
}

// 그 해에서 음력 날짜에 해당하는 양력 날짜를 찾는다.
function findLunarDate(year, lunarMonth, lunarDay) {
    let cursor = toDate(year, 1, 1);
    const end = toDate(year + 1, 1, 1);

    while (cursor < end) {
        const lunar = readLunar(cursor);
        if (lunar.month === lunarMonth && lunar.day === lunarDay) return cursor;
        cursor = addDays(cursor, 1);
    }

    return null;
}

// 대체공휴일: 이미 쉬는 날이 아닌 가장 이른 평일
function findSubstituteDate(date, taken) {
    let cursor = addDays(date, 1);
    while (isWeekend(cursor) || taken.has(key(cursor))) {
        cursor = addDays(cursor, 1);
    }
    return cursor;
}

function needsSubstitute(rule, date, occupiedByOthers) {
    if (rule === "none") return false;
    if (rule === "weekend") return isWeekend(date);
    // 어린이날은 토요일에도 대체한다.
    if (rule === "saturdayOrHoliday") return isWeekend(date) || occupiedByOthers.has(key(date));
    // 설날·추석 연휴는 일요일이나 다른 공휴일과 겹칠 때만 대체한다.
    if (rule === "holidayOverlap") return date.getUTCDay() === 0 || occupiedByOthers.has(key(date));
    return false;
}

/**
 * 한 해의 공휴일을 모두 구한다.
 *
 * 반환값은 날짜 문자열 → 공휴일 id 목록.
 * 대체공휴일은 원래 공휴일과 같은 id로 담아 연휴를 이어 붙일 수 있게 한다.
 */
function buildHolidays(year) {
    const definitions = [
        ...LUNAR_HOLIDAYS.map(({ id, lunarMonth, lunarDay, offsets, substitute }) => {
            const base = findLunarDate(year, lunarMonth, lunarDay);
            return base ? { id, substitute, dates: offsets.map((offset) => addDays(base, offset)) } : null;
        }).filter(Boolean),
        ...SOLAR_HOLIDAYS.map(({ id, month, day, substitute }) => ({
            id, substitute, dates: [toDate(year, month, day)],
        })),
    ];

    // 겹침은 '다른 공휴일이 이미 그 날에 있는가'로 판단한다.
    // 자기 연휴의 다른 날과 겹쳤다고 보면 대체공휴일이 과하게 생긴다.
    const idsByDate = new Map();
    for (const { id, dates } of definitions) {
        for (const date of dates) {
            const dateKey = key(date);
            idsByDate.set(dateKey, new Set([...(idsByDate.get(dateKey) || []), id]));
        }
    }

    const holidays = new Map();
    const occupied = new Set();
    const add = (date, id) => {
        const dateKey = key(date);
        holidays.set(dateKey, [...(holidays.get(dateKey) || []), id]);
        occupied.add(dateKey);
    };

    for (const { id, dates } of definitions) {
        dates.forEach((date) => add(date, id));
    }

    // 대체공휴일은 본 공휴일을 모두 놓은 뒤에 계산한다.
    for (const { id, dates, substitute } of definitions) {
        const othersOn = new Set(
            [...idsByDate]
                .filter(([, ids]) => [...ids].some((other) => other !== id))
                .map(([dateKey]) => dateKey),
        );
        const conflicts = dates.filter((date) => needsSubstitute(substitute, date, othersOn));

        let last = dates[dates.length - 1];
        for (let count = 0; count < conflicts.length; count += 1) {
            last = findSubstituteDate(last, occupied);
            add(last, id);
        }
    }

    return holidays;
}

function getHolidays(year) {
    if (!holidaysByYear.has(year)) holidaysByYear.set(year, buildHolidays(year));
    return holidaysByYear.get(year);
}

function isHoliday(date) {
    return getHolidays(date.getUTCFullYear()).has(key(date));
}

// 주말과 공휴일이 이어지는 구간. 연휴가 해를 넘기면 그 해의 표도 함께 본다.
function isRestDay(date) {
    return isWeekend(date) || isHoliday(date);
}

function expandToLongWeekend(dates) {
    let start = dates[0];
    let end = dates[dates.length - 1];

    while (isRestDay(addDays(start, -1))) start = addDays(start, -1);
    while (isRestDay(addDays(end, 1))) end = addDays(end, 1);

    return { start, end };
}

function findHolidayDates(year, id) {
    const holidays = getHolidays(year);
    const dates = [...holidays]
        .filter(([, ids]) => ids.includes(id))
        .map(([dateKey]) => {
            const [y, m, d] = dateKey.split("-").map(Number);
            return toDate(y, m, d);
        })
        .sort((left, right) => left - right);

    return dates.length > 0 ? dates : null;
}

function normalize(text) {
    return String(text || "").toLowerCase().replace(/[^0-9a-z가-힣]/g, "");
}

/**
 * 문장에서 공휴일 이름을 찾는다.
 *
 * '연휴'라고 하면 앞뒤로 이어지는 주말과 공휴일까지 묶는다.
 */
function findHolidayMention(text) {
    const normalized = normalize(text);
    if (!normalized) return null;

    // 긴 이름부터 대조해야 '설연휴'가 '설'로 잘리지 않는다.
    const matches = Object.entries(HOLIDAY_ALIASES)
        .flatMap(([id, aliases]) => aliases.map((alias) => ({ id, alias: normalize(alias) })))
        .filter(({ alias }) => alias && normalized.includes(alias))
        .sort((left, right) => right.alias.length - left.alias.length);

    if (matches.length === 0) return null;

    return {
        id: matches[0].id,
        // '연휴'는 붙여 쓸 수도 있고 이름에 이미 들어 있을 수도 있다.
        wantsLongWeekend: /연휴|longweekend|holidays/.test(normalized),
    };
}

/**
 * 공휴일 이름으로 말한 기간
 *
 * 올해 이미 지났으면 내년으로 본다. 연도를 직접 말했으면 그 해를 쓴다.
 */
function resolveHolidayPeriod(text, now = new Date(), statedYear = null) {
    const mention = findHolidayMention(text);
    if (!mention) return null;

    const today = startOfDay(now);
    const years = statedYear
        ? [statedYear]
        : [now.getFullYear(), now.getFullYear() + 1];

    for (const year of years) {
        const dates = findHolidayDates(year, mention.id);
        if (!dates) continue;

        const range = mention.wantsLongWeekend
            ? expandToLongWeekend(dates)
            : { start: dates[0], end: dates[dates.length - 1] };
        const start = new Date(range.start.getUTCFullYear(), range.start.getUTCMonth(), range.start.getUTCDate());
        const end = new Date(range.end.getUTCFullYear(), range.end.getUTCMonth(), range.end.getUTCDate());

        if (!statedYear && startOfDay(end) < today) continue;

        return {
            holiday: mention.id,
            period: formatDate(start) === formatDate(end)
                ? formatDate(start)
                : `${formatDate(start)} ~ ${formatDate(end)}`,
            start_date: formatDate(start),
            end_date: formatDate(end),
        };
    }

    return null;
}

module.exports = {
    getHolidays,
    findLunarDate,
    findHolidayMention,
    findHolidayDates,
    resolveHolidayPeriod,
};
