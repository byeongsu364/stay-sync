/**
 * 날짜 관련 공통 함수
 */

function formatDate(date) {
    const yyyy = date.getFullYear();
    const mm = String(date.getMonth() + 1).padStart(2, "0");
    const dd = String(date.getDate()).padStart(2, "0");

    return `${yyyy}-${mm}-${dd}`;
}

function getToday() {
    return formatDate(new Date());
}

function isOneDayTrip(startDate, endDate) {
    if (!startDate || !endDate) return false;
    return startDate === endDate;
}

function parseDate(value) {
    const match = String(value || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!match) return null;
    const [, year, month, day] = match.map(Number);
    const date = new Date(year, month - 1, day);
    // '2026-02-30'처럼 굴러가버리는 값은 날짜로 보지 않는다.
    if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) {
        return null;
    }
    return date;
}

function startOfDay(date) {
    const value = new Date(date);
    value.setHours(0, 0, 0, 0);
    return value;
}

function addYears(date, years) {
    const value = new Date(date);
    value.setFullYear(value.getFullYear() + years);
    return value;
}

/**
 * 지난 날짜는 내년으로 읽는다.
 *
 * 9월에 '6월 5일'이라고 하면 지난 6월이 아니라 다음 6월을 뜻한다.
 * 연도를 직접 말한 경우는 그대로 둔다.
 */
function shiftPastDateToNextYear(date, now = new Date()) {
    if (!date) return null;
    return startOfDay(date) < startOfDay(now) ? addYears(date, 1) : date;
}

module.exports = {
    formatDate,
    getToday,
    isOneDayTrip,
    parseDate,
    startOfDay,
    addYears,
    shiftPastDateToNextYear,
};