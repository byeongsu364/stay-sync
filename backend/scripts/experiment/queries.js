/**
 * 평가 질의 30개 (10개 시·군 × 3개)
 * origin: 출발지 좌표(위도 latitude, 경도 longitude). M4 동선 계산과 모든 모델의 프롬프트에 같이 쓴다.
 */
const ORIGINS = {
    서울역: { name: "서울역", latitude: 37.5547, longitude: 126.9707 },
    의정부역: { name: "의정부역", latitude: 37.7386, longitude: 127.0459 },
    대화역: { name: "대화역", latitude: 37.6762, longitude: 126.7473 },
    청량리역: { name: "청량리역", latitude: 37.5803, longitude: 127.0470 },
    노원역: { name: "노원역", latitude: 37.6551, longitude: 127.0614 },
    구리역: { name: "구리역", latitude: 37.6031, longitude: 127.1433 },
};

module.exports = [
    { id: "Q01", region: "가평", origin: "청량리역", text: "여자친구랑 가평으로 1박 2일 여행 가려고 해. 갈 만한 관광지 추천해줘." },
    { id: "Q02", region: "가평", origin: "서울역", text: "아이 둘 데리고 가평 가는데 아이들이 좋아할 만한 곳 알려줘." },
    { id: "Q03", region: "가평", origin: "구리역", text: "친구들이랑 가평에서 빠지랑 캠핑 같은 액티비티 하고 싶어." },
    { id: "Q04", region: "고양", origin: "서울역", text: "부모님 모시고 고양시에 하루 다녀오려고 해. 추천해줘." },
    { id: "Q05", region: "고양", origin: "대화역", text: "혼자 고양에서 전시나 박물관 같은 문화생활 하고 싶어." },
    { id: "Q06", region: "고양", origin: "노원역", text: "남자친구랑 일산 쪽으로 데이트 코스 짜고 있어. 갈 만한 곳?" },
    { id: "Q07", region: "구리", origin: "청량리역", text: "가족이랑 구리에서 산책하고 자연 즐길 수 있는 곳 추천해줘." },
    { id: "Q08", region: "구리", origin: "노원역", text: "친구랑 구리에서 쇼핑하고 놀 곳 찾고 있어." },
    { id: "Q09", region: "구리", origin: "서울역", text: "부모님이랑 구리에 있는 역사 유적지 둘러보고 싶어." },
    { id: "Q10", region: "남양주", origin: "구리역", text: "아이랑 남양주에서 체험할 수 있는 곳 알려줘." },
    { id: "Q11", region: "남양주", origin: "청량리역", text: "연인이랑 남양주 강변 쪽으로 드라이브 겸 여행 가고 싶어." },
    { id: "Q12", region: "남양주", origin: "노원역", text: "혼자 남양주에서 조용히 걷고 쉴 만한 곳 추천해줘." },
    { id: "Q13", region: "동두천", origin: "의정부역", text: "가족 여행으로 동두천 가는데 가볼 만한 곳 있어?" },
    { id: "Q14", region: "동두천", origin: "노원역", text: "친구들이랑 동두천에서 등산하고 놀고 싶어." },
    { id: "Q15", region: "동두천", origin: "서울역", text: "아이 데리고 동두천에서 하루 보낼 곳 찾고 있어." },
    { id: "Q16", region: "양주", origin: "의정부역", text: "부모님이랑 양주에 있는 수목원이나 정원 같은 곳 가고 싶어." },
    { id: "Q17", region: "양주", origin: "노원역", text: "여자친구랑 양주로 1박 2일 가는데 추천해줘." },
    { id: "Q18", region: "양주", origin: "서울역", text: "회사 동료들 단체로 양주에서 체험 활동 할 만한 곳 알려줘." },
    { id: "Q19", region: "연천", origin: "의정부역", text: "혼자 연천에서 역사 유적지랑 박물관 둘러보고 싶어." },
    { id: "Q20", region: "연천", origin: "서울역", text: "가족이랑 연천 가서 자연 경관 보고 싶어." },
    { id: "Q21", region: "연천", origin: "노원역", text: "친구랑 연천에서 캠핑이랑 레저 즐기려고 해." },
    { id: "Q22", region: "의정부", origin: "노원역", text: "아이랑 의정부에서 갈 만한 실내 놀거리 있어?" },
    { id: "Q23", region: "의정부", origin: "서울역", text: "연인이랑 의정부에서 데이트하고 싶어. 추천해줘." },
    { id: "Q24", region: "의정부", origin: "의정부역", text: "부모님 모시고 의정부 근처 산책할 곳 찾고 있어." },
    { id: "Q25", region: "파주", origin: "대화역", text: "가족이랑 파주 1박 2일 여행 추천해줘." },
    { id: "Q26", region: "파주", origin: "서울역", text: "친구들이랑 파주 아울렛이랑 놀 거리 있는 곳 가고 싶어." },
    { id: "Q27", region: "파주", origin: "노원역", text: "부모님이랑 파주 임진각 쪽 역사 관광지 둘러보고 싶어." },
    { id: "Q28", region: "포천", origin: "의정부역", text: "연인이랑 포천에서 온천이랑 자연 즐기고 싶어." },
    { id: "Q29", region: "포천", origin: "노원역", text: "아이 데리고 포천 가는데 체험할 수 있는 곳 알려줘." },
    { id: "Q30", region: "포천", origin: "구리역", text: "혼자 포천으로 산책하면서 경치 보러 가고 싶어." },
].map((query) => ({ ...query, originPoint: ORIGINS[query.origin] }));

module.exports.ORIGINS = ORIGINS;
