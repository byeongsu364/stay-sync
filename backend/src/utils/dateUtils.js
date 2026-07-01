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

module.exports = {
    formatDate,
    getToday,
    isOneDayTrip,
};