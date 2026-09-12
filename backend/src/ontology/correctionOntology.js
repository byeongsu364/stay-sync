/**
 * ==========================================================
 * Correction Ontology
 * ==========================================================
 *
 * 사용자가 기존 입력 정보를 수정하려고 할 때
 * 어떤 Fact를 수정해야 하는지 의미 매핑한다.
 *
 * LLM은 "Correction Intent"만 판단한다.
 * 수정 대상(Fact)은 이 온톨로지에서 결정한다.
 * ==========================================================
 */

module.exports = {
    region: [
        "지역",
        "여행지",
        "목적지",
        "남양주",
        "가평",
        "파주",
        "고양",
        "양주",
        "구리",
        "포천",
        "연천",
        "의정부",
        "동두천",

        // 영어
        "region",
        "area",
        "city",
        "destination",
        "goyang",
        "paju",
        "uijeongbu",
        "yangju",
        "dongducheon",
        "pocheon",
        "namyangju",
        "guri",
        "gapyeong",
        "yeoncheon",
    ],

    // '출발'만 적힌 표현은 출발지와 구분되지 않으므로 날짜를 뜻하는 형태만 둔다.
    period: [
        "기간",
        "날짜",
        "일정",
        "며칠",
        "출발일",
        "출발날짜",
        "도착일",
        "복귀일",
        "돌아오",
        "하루",
        "당일",
        "1박",
        "2박",
        "3박",

        // 영어
        "date",
        "dates",
        "schedule",
        "itinerary",
        "duration",
        "how many days",
        "how long",
        "nights",
    ],

    accommodation: [
        "숙소",
        "호텔",
        "모텔",
        "펜션",
        "리조트",
        "게스트하우스",

        // 영어
        "hotel",
        "motel",
        "pension",
        "resort",
        "guesthouse",
        "accommodation",
        "lodging",
        "airbnb",
        "where i stay",
    ],

    departure_location: [
        "출발지",
        "출발",
        "집",
        "회사",
        "학교",

        // 영어
        "departure",
        "starting point",
        "start location",
        "start from",
        "leave from",
        "my home",
        "my house",
        "my office",
        "my school",
    ],

    companion_type: [
        "혼자",
        "친구",
        "연인",
        "가족",
        "아이",
        "아이동반",
        "부모님",
        "단체",

        // 영어
        "solo",
        "alone",
        "friend",
        "couple",
        "family",
        "kid",
        "children",
        "parent",
        "group",
    ]
};