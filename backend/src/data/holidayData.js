/**
 * ==========================================================
 * 대한민국 공휴일
 * ==========================================================
 *
 * 날짜는 해마다 계산한다. 음력 공휴일은 ICU 음력 달력으로 구한다.
 *
 * 대체공휴일 (관공서의 공휴일에 관한 규정 제3조)
 * ----------------------------------------------------------
 * - 설날·추석 연휴: 다른 공휴일(일요일 포함)과 겹칠 때
 * - 어린이날: 토요일이나 다른 공휴일과 겹칠 때
 * - 삼일절·광복절·개천절·한글날·부처님오신날·성탄절: 토요일이나 일요일과 겹칠 때
 * - 신정·현충일: 대체공휴일이 없다
 * ==========================================================
 */

// 해마다 같은 양력 날짜에 오는 공휴일
const SOLAR_HOLIDAYS = [
    { id: "newYear", month: 1, day: 1, substitute: "none" },
    { id: "independenceMovement", month: 3, day: 1, substitute: "weekend" },
    { id: "childrensDay", month: 5, day: 5, substitute: "saturdayOrHoliday" },
    { id: "memorialDay", month: 6, day: 6, substitute: "none" },
    { id: "liberation", month: 8, day: 15, substitute: "weekend" },
    { id: "nationalFoundation", month: 10, day: 3, substitute: "weekend" },
    { id: "hangeul", month: 10, day: 9, substitute: "weekend" },
    { id: "christmas", month: 12, day: 25, substitute: "weekend" },
];

// 음력 기준 공휴일. offsets는 기준일 앞뒤로 며칠씩 쉬는지를 뜻한다.
const LUNAR_HOLIDAYS = [
    { id: "seollal", lunarMonth: 1, lunarDay: 1, offsets: [-1, 0, 1], substitute: "holidayOverlap" },
    { id: "buddhaBirthday", lunarMonth: 4, lunarDay: 8, offsets: [0], substitute: "weekend" },
    { id: "chuseok", lunarMonth: 8, lunarDay: 15, offsets: [-1, 0, 1], substitute: "holidayOverlap" },
];

// 사용자가 부르는 이름. 공백을 지우고 대조한다.
// '설' 한 글자는 '레저시설', '건설'처럼 다른 말에 섞여 들어 두지 않는다.
const HOLIDAY_ALIASES = {
    newYear: ["신정", "새해첫날", "newyear", "newyearsday"],
    seollal: ["설날", "설연휴", "설명절", "구정", "seollal", "lunarnewyear"],
    independenceMovement: ["삼일절", "3·1절", "31절", "삼일", "independencemovementday"],
    buddhaBirthday: ["부처님오신날", "석가탄신일", "초파일", "buddhasbirthday"],
    childrensDay: ["어린이날", "childrensday"],
    memorialDay: ["현충일", "memorialday"],
    liberation: ["광복절", "liberationday"],
    chuseok: ["추석", "한가위", "추석연휴", "chuseok", "koreanthanksgiving"],
    nationalFoundation: ["개천절", "nationalfoundationday"],
    hangeul: ["한글날", "hangeulday"],
    christmas: ["성탄절", "크리스마스", "christmas", "xmas"],
};

module.exports = {
    SOLAR_HOLIDAYS,
    LUNAR_HOLIDAYS,
    HOLIDAY_ALIASES,
};
