/**
 * 한국어 고정 문구
 *
 * 키는 화면 흐름 기준으로 묶는다.
 * {name} 자리에 값이 들어가고, {name|으로/로}은 받침을 보고 조사를 고른다.
 *
 * 이 파일에 키를 더하면 en.js에도 같은 키를 더해야 한다.
 * messageService.findMissingKeys("en")으로 확인할 수 있다.
 */

module.exports = {
    // 서비스 유형 선택
    "serviceType.prompt": [
        "어디로 여행을 가시나요?",
        "",
        "숙소를 이미 예약하셨거나 동선만 추천받고 싶다면 아래 항목을 선택해주세요.",
    ].join("\n"),
    "serviceType.option.booked": "숙소를 이미 예약했어요",
    "serviceType.option.routeOnly": "동선만 추천받고 싶어요",
    "serviceType.invalid": "1번, 2번, 3번 중에서 선택해주세요.\n\n{prompt}",

    // 지역과 관광지 입력
    "region.askForAccommodation": "숙소를 추천받고 싶은 여행 지역을 입력해주세요.",
    "region.askForAttraction": "여행하고 싶은 지역이나 관심 있는 관광지를 입력해주세요.",
    "region.askAgain": "지원 지역이나 해당 지역의 관광지를 찾지 못했습니다. 여행 지역 또는 관광지명을 다시 입력해주세요.",
    "region.notSupported": [
        "문장에서 지원하는 여행지를 찾지 못했습니다. 아래 지역이나 보유 관광지명을 포함해 말씀해주세요. 예: 자라섬으로 여행 갈 거야.",
        "",
        "{regions}",
    ].join("\n"),
    "destination.chooseOne": "여행할 목적지를 하나만 확인해주세요. 아래에서 선택하거나 가고 싶은 관광지명을 다시 말씀해주세요.",

    // 인사
    "greeting.hello": "안녕하세요!\n\n{prompt}",
    "greeting.continue": "안녕하세요! 계속 진행해볼까요?",

    // 여행 기간
    "period.askRange": "언제부터 언제까지 여행하시나요?",
    "period.askOneDay": "당일치기 여행은 어느 날짜에 가시나요? 예: 내일, 9월 12일",
    "period.example": "예: 내일 하루, 9월 12일부터 14일까지",
    "travel.askRegion": "안녕하세요! 어디로 여행을 가시나요?",
    "travel.regionConfirmed": "{region} 여행으로 확인했습니다. {question}",
    "travel.destinationConfirmed": "{destination} 여행으로 확인했습니다.{visit}{theme}{companion} {question}",
    "travel.visitAdded": " 방문 목록에도 추가했습니다.",
    "travel.visitAddedMany": " {count}곳 모두 방문 목록에도 추가했습니다.",
    "travel.themeSaved": " 관심 테마는 '{themes}'{themes|으로/로} 저장했어요.",
    "travel.companionSaved": " 동행자 유형은 '{companion}'{companion|으로/로} 저장했어요.",
    "travel.oneDayTrip": "{region} 당일치기 여행이시군요. 동선 추천을 위해 출발지를 입력해주세요.",

    // 숙소와 출발지
    "accommodation.ask": "예약하신 숙소명이나 주소를 입력해주세요.",
    "accommodation.recommend": "{region} 지역의 {period} 일정에 맞는 숙소를 추천해드릴게요.",
    "accommodation.confirmed": "숙소를 확인했습니다. 날짜별 최적 동선을 계산할게요.",
    "departure.confirmed": "출발지를 확인했습니다. 최적 동선을 계산할게요.",

    // 동행자
    "companion.ask": "누구와 함께 여행하시나요?\n(혼자, 연인, 친구, 가족, 부모님, 아이동반)",

    // 정정
    "correction.region": "알겠습니다. 여행 지역을 다시 알려주세요.",
    "correction.period": "{regionKept}여행 기간을 다시 알려주세요.",
    "correction.regionKept": "{region} 여행 지역은 유지할게요. ",
    "correction.accommodation": "알겠습니다. 예약하신 숙소명이나 주소를 다시 알려주세요.",
    "correction.departure": "알겠습니다. 당일치기 출발지를 다시 알려주세요.",
    "correction.companion": "알겠습니다. 누구와 함께 여행하시나요?",
    "correction.travelDays": "알겠습니다. 총 며칠 동안 여행하시나요?\n예: 1일, 2일, 3일",
    "correction.unknown": "알겠습니다. 수정할 정보를 다시 말씀해주세요.",

    // 동선만 추천
    "routeOnly.askDays": "총 며칠 동안 여행하시나요?\n예: 1일, 2일, 3일",
    "routeOnly.invalidDays": "여행 일수를 1일부터 30일 사이로 입력해주세요. 예: 2일",
    "routeOnly.daysConfirmed": "{days}일 일정으로 확인했습니다. 방문할 관광지를 /관광지명으로 검색해 선택해주세요.",
    "routeOnly.attractionsNotFound": "관광지를 모두 확인하지 못했습니다.{unresolved}\n장소명을 쉼표로 구분해 다시 입력해주세요.",
    "routeOnly.unresolvedList": "\n찾지 못한 장소: {places}",
    "routeOnly.needMoreAttractions": "{days}일 동선을 만들려면 관광지가 최소 {days}개 필요합니다. 관광지를 더 추가해 다시 선택해주세요.",

    // 추천과 선택
    "recommendation.header": "검색순 {startRank}~{endRank} 관광지 추천입니다.",
    "recommendation.item": "{index}. {name}\n   - 테마: {theme}\n   - 주소: {address}",
    "recommendation.hasMore": "마음에 드는 관광지를 선택해주세요. 선택 후 추가 추천도 받을 수 있습니다.",
    "recommendation.last": "현재 조건으로 추천할 수 있는 마지막 관광지입니다. 마음에 드는 관광지를 선택해주세요.",
    "recommendation.exhausted": "현재 지역과 테마에 맞는 관광지가 더 이상 없습니다.",
    "selection.undone": "직전에 선택한 관광지를 취소했습니다. 추천 목록에서 다시 선택해주세요.",
    "selection.askMoreUnclear": "관광지를 더 추천받을지, 지금 선택을 마칠지 편하게 말씀해주세요.",
    "selection.readyForRoute": "{reply}\n\n선택한 관광지를 기준으로 최적 동선을 준비할게요.",

    // 동선 결과
    "route.exactPath": "정확한 이동 동선",
    "route.kakaoLinks": "아래 카카오맵 길찾기 링크로 동선을 확인할 수 있습니다.",

    // 상황 인지
    "weather.unavailable": "예보 제공 범위 밖이라 날씨 필터 없이 추천했습니다.",
    "weather.header": "여행 기간 날씨를 반영했습니다.",
    "airQuality.unavailable": "미세먼지 정보는 제공되지 않았습니다.",
    "situation.indoorOnly": "상황인지 판단에 따라 실내 관광지만 우선 추천했습니다.",
    "situation.indoorFallback": "실내 관광지가 부족해 일반 관광지까지 함께 추천했습니다.",
    "situation.noConstraint": "야외 활동에 큰 제약이 없어 테마와 인기도를 중심으로 추천했습니다.",

    // 영어로 안내할 수 없는 지역
    "english.regionUnavailable": [
        "{region} 지역은 영문 관광 정보가 없어 영어로 안내해드릴 수 없습니다.",
        "",
        "영어로 이용하실 수 있는 지역은 {regions}입니다.",
        "다른 지역을 입력해주시거나, 한국어로 말씀해주시면 계속 도와드릴 수 있습니다.",
    ].join("\n"),

    // 지역명과 테마명 (데이터 값이 한국어라 표시용 이름을 따로 둔다)
    "region.고양": "고양",
    "region.파주": "파주",
    "region.의정부": "의정부",
    "region.양주": "양주",
    "region.동두천": "동두천",
    "region.포천": "포천",
    "region.남양주": "남양주",
    "region.구리": "구리",
    "region.가평": "가평",
    "region.연천": "연천",
    "theme.자연관광": "자연관광",
    "theme.문화관광": "문화관광",
    "theme.역사관광": "역사관광",
    "theme.레저스포츠": "레저스포츠",
    "theme.체험관광": "체험관광",
    "theme.쇼핑": "쇼핑",
    "theme.기타관광": "기타관광",

    // 날씨와 대기질 상세
    "weather.forecastLine": "{date}: 강수 {rainProb}% · {minTemp}~{maxTemp}℃{reason}",
    "weather.reasonIndoor": " · {reasons}로 실내 권장",
    "weather.reasonNormal": " · 일반 추천",
    "weather.reason.비": "비",
    "weather.reason.폭염": "폭염",
    "weather.reason.한파": "한파",
    "airQuality.line": "현재 대기질: {grade} · PM10 {pm10}㎍/㎥ · PM2.5 {pm25}㎍/㎥",
    "airQuality.grade.좋음": "좋음",
    "airQuality.grade.보통": "보통",
    "airQuality.grade.나쁨": "나쁨",
    "airQuality.grade.매우나쁨": "매우나쁨",
    "airQuality.grade.정보없음": "정보없음",

    // 답변을 만들지 못했을 때
    "error.retry": "죄송합니다. 방금 답변을 만들지 못했어요. 다시 여쭤볼게요.",
    "error.retryGeneric": "죄송합니다. 방금 답변을 만들지 못했어요. 한 번만 다시 말씀해주시겠어요?",
    "departure.ask": "동선 추천을 위해 출발지를 입력해주세요.",
    "routeOnly.askAttractions": "방문할 관광지를 /관광지명으로 검색해 선택해주세요.",
    "selection.askAgain": "추천 목록에서 마음에 드는 관광지를 선택해주세요.",

    // 동행자 확인
    "companion.confirmed": "동행자 유형은 '{companion}'{companion|으로/로} 확인했습니다.",
    "companion.혼자": "혼자",
    "companion.연인": "연인",
    "companion.친구": "친구",
    "companion.가족": "가족",
    "companion.아이동반": "아이동반",
    "companion.부모님": "부모님",
    "companion.단체": "단체",
};
